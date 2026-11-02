import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { app, dialog, BrowserWindow } from 'electron';
import axios from 'axios';
import FormData from 'form-data';
import {
  MeetingRecord,
  MeetingSpeaker,
  MeetingSegment,
  MeetingSummary,
  MeetingActionItem,
  SpeechArtAnalysis,
  MeetingChartData,
  GlossaryTerm,
  OpenAiAudioSettings,
  MatchedTermInfo,
  DecisionTradeoffItem,
  GanttMilestoneItem,
  SpeakerRadarScore,
  MeetingTranscriptionTask,
} from '../../shared/meetingTypes';
import { AiService } from './aiService';
import { formatMeetingMarkdown } from '../../shared/meetingMarkdown';
import { analyzeMeeting } from './meetingAnalysis';
import { selectMeetingModel } from './meetingModelClient';
import { resolveFfmpegBinary } from './ffmpegRuntime';
import {
  extractTranscriptionText,
  getAudioMimeType,
  getTranscriptionEndpoint,
  getTranscriptionErrorMessage,
  getTranscriptionRetryDelayMs,
  getTranscriptionTimeoutMs,
  isRetryableTranscriptionError,
  isOfficialOpenAiEndpoint,
  shouldRetryWithoutVerboseJson,
  validateOpenAiAudioFile,
} from './meetingTranscription';

const execFileAsync = promisify(execFile);
// Windows 网关对较大的单次 multipart 请求更容易返回 502。30 秒一段也能覆盖
// 30~60 秒的录音，确保导入长音频不会先尝试上传完整文件。
const TRANSCRIPTION_CHUNK_SECONDS = 30;
const MAX_TRANSCRIPTION_ATTEMPTS = 3;

/**
 * 飞书妙计风格会议助手服务
 * 负责音频文件管理、OpenAI 兼容语音转写（含术语库提示）、
 * 大模型会议智能总结、语艺沟通分析与飞书妙计级可视化图表生成。
 */
export class MeetingService {
  private readonly summaryTasks = new Map<string, Promise<MeetingRecord>>();
  private readonly transcriptionTasks = new Map<string, MeetingTranscriptionTask>();
  private readonly transcriptionTaskPromises = new Map<string, Promise<void>>();
  private readonly transcriptionTaskListeners = new Set<(task: MeetingTranscriptionTask) => void>();

  constructor(private aiService: AiService) {
    this.ensureInitialized();
  }

  public onTranscriptionTaskUpdated(listener: (task: MeetingTranscriptionTask) => void): () => void {
    this.transcriptionTaskListeners.add(listener);
    return () => this.transcriptionTaskListeners.delete(listener);
  }

  private publishTranscriptionTask(task: MeetingTranscriptionTask): MeetingTranscriptionTask {
    const next = { ...task, updatedAt: Date.now() };
    this.transcriptionTasks.set(task.meetingId, next);
    for (const listener of this.transcriptionTaskListeners) {
      try {
        listener(next);
      } catch (error) {
        console.warn('[MeetingService] 转写任务进度通知失败:', error);
      }
    }
    return next;
  }

  public getTranscriptionTask(meetingId: string): MeetingTranscriptionTask | null {
    return this.transcriptionTasks.get(meetingId) || null;
  }

  public startTranscriptionTask(
    meetingId: string,
    options?: { apiKey?: string; baseUrl?: string; model?: string; language?: string },
  ): MeetingTranscriptionTask {
    const active = this.transcriptionTasks.get(meetingId);
    if (active && ['queued', 'splitting', 'transcribing'].includes(active.status)) return active;

    const now = Date.now();
    const task: MeetingTranscriptionTask = {
      taskId: `transcription_${now}_${Math.random().toString(36).slice(2, 8)}`,
      meetingId,
      status: 'queued',
      totalChunks: 0,
      completedChunks: 0,
      currentChunk: 0,
      message: '已加入后台转写队列',
      startedAt: now,
      updatedAt: now,
    };
    this.publishTranscriptionTask(task);
    const promise = this.runTranscriptionTask(task, options);
    this.transcriptionTaskPromises.set(meetingId, promise);
    void promise.finally(() => {
      if (this.transcriptionTaskPromises.get(meetingId) === promise) {
        this.transcriptionTaskPromises.delete(meetingId);
      }
    });
    return task;
  }

  public async cancelTranscriptionTask(meetingId: string): Promise<MeetingTranscriptionTask | null> {
    const task = this.transcriptionTasks.get(meetingId);
    if (!task || !['queued', 'splitting', 'transcribing'].includes(task.status)) return task || null;
    const cancelled = this.publishTranscriptionTask({
      ...task,
      status: 'cancelled',
      message: `已停止转写，已完成 ${task.completedChunks}/${task.totalChunks || '?'} 段`,
    });
    const meeting = this.getMeetingById(meetingId);
    if (meeting) {
      meeting.status = meeting.segments.length > 0 ? 'transcribed' : 'idle';
      meeting.statusMessage = cancelled.message;
      this.saveMeeting(meeting);
    }
    return cancelled;
  }

  private getDataDir(): string {
    return app?.getPath ? app.getPath('userData') : process.cwd();
  }

  private getAudioStorageDir(): string {
    const dir = path.join(this.getDataDir(), 'meetings', 'audios');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private getMeetingsFilePath(): string {
    return path.join(this.getDataDir(), 'neocrm_meetings.json');
  }

  private getGlossaryFilePath(): string {
    return path.join(this.getDataDir(), 'neocrm_meeting_glossary.json');
  }

  private getSettingsFilePath(): string {
    return path.join(this.getDataDir(), 'neocrm_meeting_settings.json');
  }

  private ensureInitialized(): void {
    try {
      this.getAudioStorageDir();
      if (!fs.existsSync(this.getMeetingsFilePath())) {
        this.saveMeetings([]);
      }
      if (!fs.existsSync(this.getGlossaryFilePath())) {
        const defaultGlossary = this.getDefaultGlossary();
        this.saveGlossary(defaultGlossary);
      }
    } catch (err: any) {
      console.warn('[MeetingService] 初始化失败:', err.message);
    }
  }

  // ==================== 基础配置管理 ====================

  public getSettings(): OpenAiAudioSettings {
    const p = this.getSettingsFilePath();
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        return JSON.parse(raw);
      } catch {}
    }
    return {
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-transcribe',
      language: 'zh',
      temperature: 0.0,
      promptTerminologyEnabled: true,
    };
  }

  public saveSettings(settings: Partial<OpenAiAudioSettings>): OpenAiAudioSettings {
    const current = this.getSettings();
    const updated: OpenAiAudioSettings = {
      ...current,
      ...settings,
    };
    fs.writeFileSync(this.getSettingsFilePath(), JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  }

  private async splitAudioForTranscription(audioPath: string, meetingId: string): Promise<string[]> {
    const outputDir = path.join(
      this.getDataDir(),
      'meetings',
      'transcription-chunks',
      `${meetingId}_${Date.now()}`,
    );
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPattern = path.join(outputDir, 'chunk_%03d.mp3');
    try {
      const ffmpegBinary = resolveFfmpegBinary({
        isPackaged: app.isPackaged,
        resourcesPath: process.resourcesPath,
        appPath: app.getAppPath(),
        overridePath: process.env.NEOCRM_FFMPEG_PATH,
      });
      await execFileAsync(ffmpegBinary, [
        '-hide_banner', '-loglevel', 'error',
        '-y',
        '-i', audioPath,
        '-map', '0:a:0',
        '-vn',
        '-f', 'segment',
        '-segment_time', String(TRANSCRIPTION_CHUNK_SECONDS),
        '-reset_timestamps', '1',
        '-c:a', 'libmp3lame',
        '-b:a', '64k',
        outputPattern,
      ], {
        windowsHide: true,
        timeout: 180_000,
        maxBuffer: 2 * 1024 * 1024,
      });
    } catch (err: any) {
      fs.rmSync(outputDir, { recursive: true, force: true });
      console.warn('[MeetingService] 无法使用 ffmpeg 对音频分片:', err?.message || err);
      throw new Error(
        `音频分段失败，未发送整段音频请求。${err?.message || '无法运行音频处理工具'}${app.isPackaged ? '。请检查音频文件是否有效，或重新安装应用以修复内置工具。' : '。开发环境可运行 npm run prepare:ffmpeg 准备内置工具。'}`,
      );
    }

    const chunks = fs.readdirSync(outputDir)
      .filter((name) => /^chunk_\d+\.mp3$/i.test(name))
      .sort()
      .map((name) => path.join(outputDir, name));
    if (chunks.length === 0) {
      fs.rmSync(outputDir, { recursive: true, force: true });
      throw new Error('ffmpeg 未生成有效的音频片段，已停止转写以避免上传整段长音频。');
    }
    return chunks;
  }

  private cleanupTranscriptionChunks(chunkPaths: string[]): void {
    if (chunkPaths.length === 0) return;
    const outputDir = path.dirname(chunkPaths[0]);
    fs.rmSync(outputDir, { recursive: true, force: true });
  }

  // ==================== 专业术语库管理 ====================

  public getGlossary(): GlossaryTerm[] {
    const p = this.getGlossaryFilePath();
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) return list;
      } catch {}
    }
    const defaults = this.getDefaultGlossary();
    this.saveGlossary(defaults);
    return defaults;
  }

  public saveGlossary(terms: GlossaryTerm[]): GlossaryTerm[] {
    fs.writeFileSync(this.getGlossaryFilePath(), JSON.stringify(terms, null, 2), 'utf-8');
    return terms;
  }

  public saveGlossaryTerm(term: Partial<GlossaryTerm>): GlossaryTerm[] {
    const terms = this.getGlossary();
    if (term.id) {
      const idx = terms.findIndex((t) => t.id === term.id);
      if (idx !== -1) {
        terms[idx] = { ...terms[idx], ...term };
      } else {
        terms.unshift(term as GlossaryTerm);
      }
    } else {
      const newTerm: GlossaryTerm = {
        id: `term_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        term: term.term?.trim() || '新术语',
        category: term.category || 'custom',
        categoryLabel: term.categoryLabel || '自定义',
        aliases: term.aliases || [],
        explanation: term.explanation?.trim() || '',
        exampleSentence: term.exampleSentence?.trim() || '',
        enabled: term.enabled ?? true,
        isBuiltin: false,
      };
      terms.unshift(newTerm);
    }
    return this.saveGlossary(terms);
  }

  public deleteGlossaryTerm(termId: string): GlossaryTerm[] {
    const terms = this.getGlossary().filter((t) => t.id !== termId);
    return this.saveGlossary(terms);
  }

  public resetGlossary(): GlossaryTerm[] {
    const defaults = this.getDefaultGlossary();
    return this.saveGlossary(defaults);
  }

  /**
   * 将启用的术语整理为 Whisper prompt 提示
   */
  public buildWhisperPrompt(): string {
    const terms = this.getGlossary().filter((t) => t.enabled);
    const keywords = terms.map((t) => t.term);
    return keywords.slice(0, 35).join(', ');
  }

  /**
   * 在给定文本中检索命中的术语
   */
  public matchTermsInText(text: string): MatchedTermInfo[] {
    const glossary = this.getGlossary().filter((t) => t.enabled);
    const hits: MatchedTermInfo[] = [];
    const seen = new Set<string>();

    for (const item of glossary) {
      const allNames = [item.term, ...(item.aliases || [])];
      for (const name of allNames) {
        if (!name || name.length < 2) continue;
        const regex = new RegExp(`\\b${name}\\b`, 'i');
        const isMatch = regex.test(text) || text.includes(name);
        if (isMatch && !seen.has(item.term)) {
          seen.add(item.term);
          hits.push({
            term: item.term,
            category: item.categoryLabel,
            explanation: item.explanation,
          });
          break;
        }
      }
    }
    return hits;
  }

  // ==================== 会议记录 CRUD ====================

  public getMeetings(): MeetingRecord[] {
    const p = this.getMeetingsFilePath();
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          // 彻底过滤历史遗留的 demo 示例会议，确保环境干净
          const filtered = list.filter((m) => !m.id.startsWith('meeting_demo'));
          if (filtered.length !== list.length) {
            this.saveMeetings(filtered);
          }
          return filtered;
        }
      } catch {}
    }
    return [];
  }

  public saveMeetings(meetings: MeetingRecord[]): MeetingRecord[] {
    fs.writeFileSync(this.getMeetingsFilePath(), JSON.stringify(meetings, null, 2), 'utf-8');
    return meetings;
  }

  public getMeetingById(id: string): MeetingRecord | null {
    const meetings = this.getMeetings();
    return meetings.find((m) => m.id === id) || null;
  }

  public saveMeeting(meeting: MeetingRecord): MeetingRecord {
    const meetings = this.getMeetings();
    const idx = meetings.findIndex((m) => m.id === meeting.id);
    meeting.updatedAt = Date.now();
    if (idx !== -1) {
      meetings[idx] = meeting;
    } else {
      meetings.unshift(meeting);
    }
    this.saveMeetings(meetings);
    return meeting;
  }

  public deleteMeeting(id: string): boolean {
    const meetings = this.getMeetings();
    const target = meetings.find((m) => m.id === id);
    if (target?.audioPath && fs.existsSync(target.audioPath)) {
      try {
        fs.unlinkSync(target.audioPath);
      } catch {}
    }
    const remaining = meetings.filter((m) => m.id !== id);
    this.saveMeetings(remaining);
    return true;
  }

  // ==================== 音频文件选择与回放 ====================

  public async selectAudioFile(win?: BrowserWindow | null): Promise<{
    filePath: string;
    fileName: string;
    fileSize: number;
    dataUrl?: string;
  } | null> {
    const options: any = {
      title: '选择会议录音或视频文件',
      properties: ['openFile'],
      filters: [
        {
          name: '音频与视频文件 (*.mp3, *.wav, *.m4a, *.aac, *.mp4, *.webm, *.ogg)',
          extensions: ['mp3', 'wav', 'm4a', 'aac', 'mp4', 'webm', 'ogg', 'mov', 'flac'],
        },
        { name: '所有文件', extensions: ['*'] },
      ],
    };

    const res = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);

    if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
      return null;
    }

    const srcPath = res.filePaths[0];
    const stat = fs.statSync(srcPath);
    const fileName = path.basename(srcPath);

    // 将音频拷贝到应用内部存储目录，便于离线持久回放
    const targetPath = path.join(this.getAudioStorageDir(), `${Date.now()}_${fileName}`);
    fs.copyFileSync(srcPath, targetPath);

    const dataUrl = this.getAudioDataUrl(targetPath);

    return {
      filePath: targetPath,
      fileName,
      fileSize: stat.size,
      dataUrl,
    };
  }

  public saveRecordedAudio(fileName: string, buffer: Buffer): {
    filePath: string;
    fileName: string;
    fileSize: number;
    dataUrl: string;
  } {
    const targetPath = path.join(this.getAudioStorageDir(), `${Date.now()}_${fileName}`);
    fs.writeFileSync(targetPath, buffer);
    const stat = fs.statSync(targetPath);
    const dataUrl = this.getAudioDataUrl(targetPath);
    return {
      filePath: targetPath,
      fileName,
      fileSize: stat.size,
      dataUrl,
    };
  }

  public getAudioDataUrl(filePath: string): string {
    try {
      if (!fs.existsSync(filePath)) return '';
      const mime = getAudioMimeType(filePath);

      // 限制过大文件直接 base64，大文件通过 file 协议或流加载
      const stat = fs.statSync(filePath);
      if (stat.size > 25 * 1024 * 1024) {
        return `file://${encodeURI(filePath)}`;
      }
      const data = fs.readFileSync(filePath);
      return `data:${mime};base64,${data.toString('base64')}`;
    } catch {
      return '';
    }
  }

  private getAudioTranscriptionConfig(options?: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    language?: string;
  }) {
    const settings = this.getSettings();
    let apiKey = (options?.apiKey || settings.apiKey || '').trim();
    const baseUrl = (options?.baseUrl || settings.baseUrl || 'https://api.openai.com/v1').trim();
    if (!apiKey && isOfficialOpenAiEndpoint(baseUrl)) {
      const openAiProvider = this.aiService.getAiConfig().providers.find(
        (provider) => provider.id === 'openai' && provider.enabled && provider.apiKey?.trim()
      );
      if (openAiProvider?.apiKey) apiKey = openAiProvider.apiKey.trim();
    }

    const model = options?.model || settings.model || 'gpt-transcribe';
    const language = options?.language || settings.language || 'zh';
    const promptText = settings.promptTerminologyEnabled && model === 'whisper-1'
      ? this.buildWhisperPrompt()
      : '';
    const keywords = settings.promptTerminologyEnabled && model === 'gpt-transcribe'
      ? this.getGlossary().filter((term) => term.enabled).map((term) => term.term).slice(0, 35)
      : [];

    return { apiKey, baseUrl, model, language, promptText, keywords };
  }

  private async requestAudioTranscriptionFile(
    audioPath: string,
    sourceFileName: string,
    sourceSize: number,
    config: ReturnType<MeetingService['getAudioTranscriptionConfig']>,
    onRetry?: (message: string) => void,
  ): Promise<any> {
    if (!config.apiKey) throw new Error('未配置转写 API Key。请在「转写配置」中填写支持 OpenAI 音频转写接口的密钥。');
    const endpoint = getTranscriptionEndpoint(config.baseUrl);
    const requestTimeoutMs = getTranscriptionTimeoutMs(sourceSize);

    const sendRequest = async (responseFormat?: 'verbose_json' | 'json') => {
      const formData = new FormData();
      formData.append('file', fs.createReadStream(audioPath), {
        filename: sourceFileName,
        contentType: getAudioMimeType(sourceFileName),
        knownLength: sourceSize,
      });
      formData.append('model', config.model);
      if (responseFormat) formData.append('response_format', responseFormat);
      if (config.language && config.language !== 'auto') {
        if (config.model === 'gpt-transcribe') formData.append('languages[]', config.language);
        else formData.append('language', config.language);
      }
      if (config.promptText) formData.append('prompt', config.promptText);
      for (const keyword of config.keywords) {
        const cleanKeyword = keyword.replace(/[<>\r\n]/g, '').trim();
        if (cleanKeyword) formData.append('keywords[]', cleanKeyword);
      }

      return axios.post(endpoint, formData, {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          ...formData.getHeaders(),
        },
        timeout: requestTimeoutMs,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
    };

    for (let attempt = 0; attempt < MAX_TRANSCRIPTION_ATTEMPTS; attempt += 1) {
      try {
        const responseFormat = config.model === 'whisper-1' ? 'verbose_json' : undefined;
        try {
          return (await sendRequest(responseFormat)).data;
        } catch (err: any) {
          if (!shouldRetryWithoutVerboseJson(err)) throw err;
          console.info('[MeetingService] 当前转写端点不支持 verbose_json，改用 json 响应格式重试');
          return (await sendRequest('json')).data;
        }
      } catch (err: any) {
        if (!isRetryableTranscriptionError(err) || attempt >= MAX_TRANSCRIPTION_ATTEMPTS - 1) throw err;
        const delayMs = getTranscriptionRetryDelayMs(attempt);
        const status = Number(err?.response?.status);
        onRetry?.(`${status ? `HTTP ${status}` : '网络错误'}，${Math.ceil(delayMs / 1000)} 秒后重试...`);
        console.warn(`[MeetingService] 实时片段转写暂时失败，${delayMs}ms 后重试`, err?.message || err);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw new Error('转写请求未完成');
  }

  private parseTranscriptionSegments(rawData: any, timeOffset = 0): {
    segments: MeetingSegment[];
    duration: number;
  } {
    const durationFromResponse = Number(rawData?.duration);
    const rawSegments = Array.isArray(rawData?.segments) ? rawData.segments : [];
    const speakerIds = new Map<string, number>();
    const segments: MeetingSegment[] = rawSegments
      .filter((seg: any) => typeof seg?.text === 'string' && seg.text.trim())
      .map((seg: any, idx: number) => {
        const text = seg.text.trim();
        const speakerValue = seg.speaker_id ?? seg.speaker;
        const speakerKey = speakerValue == null ? '' : String(speakerValue);
        if (speakerKey && !speakerIds.has(speakerKey)) speakerIds.set(speakerKey, speakerIds.size + 1);
        const speakerNum = speakerKey ? speakerIds.get(speakerKey)! : 1;
        const start = Number(seg.start);
        const end = Number(seg.end);
        const startTime = timeOffset + (Number.isFinite(start) ? start : idx * 10);
        const endTime = timeOffset + (Number.isFinite(end) && end > 0 ? end : (idx + 1) * 10);
        return {
          id: `seg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${idx}`,
          speakerId: `spk_${speakerNum}`,
          speakerName: `发言人 ${speakerNum}`,
          startTime,
          endTime,
          text,
          tone: 'neutral' as const,
          toneLabel: '发言陈述',
          matchedTerms: this.matchTermsInText(text),
        };
      });

    if (segments.length === 0) {
      const transcript = extractTranscriptionText(rawData);
      if (transcript) {
        let currentTime = timeOffset;
        transcript
          .split(/(?<=[。！？.!?；;\n])\s*/)
          .map((sentence: string) => sentence.trim())
          .filter(Boolean)
          .forEach((text: string, idx: number) => {
            const segmentDuration = Math.max(3, Math.round(text.length * 0.35));
            segments.push({
              id: `seg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${idx}`,
              speakerId: 'spk_1',
              speakerName: '发言人 1',
              startTime: currentTime,
              endTime: currentTime + segmentDuration,
              text,
              tone: 'neutral',
              toneLabel: '发言陈述',
              matchedTerms: this.matchTermsInText(text),
            });
            currentTime += segmentDuration;
          });
      }
    }

    const lastEnd = segments.reduce((max, segment) => Math.max(max, segment.endTime), timeOffset);
    const responseDuration = Number.isFinite(durationFromResponse) && durationFromResponse > 0
      ? timeOffset + durationFromResponse
      : lastEnd;
    return { segments, duration: responseDuration };
  }

  public async transcribeAudioChunk(
    meetingId: string,
    chunkPath: string,
    startTimeSec: number,
    options?: {
      apiKey?: string;
      baseUrl?: string;
      model?: string;
      language?: string;
    },
  ): Promise<MeetingRecord> {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) throw new Error(`未找到指定会议 [${meetingId}]`);
    if (!chunkPath || !fs.existsSync(chunkPath)) throw new Error('实时音频片段不存在');

    const stat = fs.statSync(chunkPath);
    const sourceFileName = path.basename(chunkPath);
    const config = this.getAudioTranscriptionConfig(options);
    const validationError = validateOpenAiAudioFile(sourceFileName, stat.size, config.baseUrl);
    if (validationError) throw new Error(validationError);

    const rawData = await this.requestAudioTranscriptionFile(
      chunkPath,
      sourceFileName,
      stat.size,
      config,
      (message) => {
        meeting.status = 'transcribing';
        meeting.statusMessage = `实时片段转写暂时不可用，${message}`;
        this.saveMeeting(meeting);
      },
    );
    const parsed = this.parseTranscriptionSegments(rawData, Math.max(0, Number(startTimeSec) || 0));
    if (parsed.segments.length === 0) throw new Error('实时转写接口未返回有效文本');

    const mergedSegments = [...meeting.segments, ...parsed.segments]
      .sort((a, b) => a.startTime - b.startTime);
    const allHitTerms = new Set<string>();
    mergedSegments.forEach((segment) => segment.matchedTerms?.forEach((term) => allHitTerms.add(term.term)));
    meeting.segments = mergedSegments;
    meeting.speakers = this.calculateSpeakersFromSegments(mergedSegments);
    meeting.duration = Math.max(meeting.duration || 0, Math.ceil(parsed.duration));
    meeting.glossaryHitTerms = Array.from(allHitTerms);
    meeting.status = 'transcribing';
    meeting.statusMessage = `实时转写中，已完成 ${mergedSegments.length} 段发言`;
    this.saveMeeting(meeting);
    return meeting;
  }

  private async runTranscriptionTask(
    initialTask: MeetingTranscriptionTask,
    options?: { apiKey?: string; baseUrl?: string; model?: string; language?: string },
  ): Promise<void> {
    const meetingId = initialTask.meetingId;
    let chunks: string[] = [];
    let temporaryChunks = false;
    try {
      const meeting = this.getMeetingById(meetingId);
      if (!meeting) throw new Error(`未找到指定会议 [${meetingId}]`);
      if (!meeting.audioPath || !fs.existsSync(meeting.audioPath)) throw new Error('会议音频文件不存在，请重新导入或录制。');

      const config = this.getAudioTranscriptionConfig(options);
      if (!config.apiKey) throw new Error('未配置转写 API Key。请在「转写配置」中填写支持 OpenAI 音频转写接口的密钥。');
      const sourcePath = meeting.audioPath;
      this.publishTranscriptionTask({
        ...initialTask,
        status: 'splitting',
        message: '正在将音频切分为顺序处理的片段...',
      });
      chunks = await this.splitAudioForTranscription(sourcePath, meetingId);
      temporaryChunks = chunks.length > 0;
      const taskAfterSplit = this.transcriptionTasks.get(meetingId);
      if (taskAfterSplit?.status === 'cancelled') return;

      const totalChunks = chunks.length;
      let task = this.publishTranscriptionTask({
        ...initialTask,
        status: 'transcribing',
        totalChunks,
        completedChunks: 0,
        currentChunk: 1,
        message: `音频已切分为 ${totalChunks} 段，准备依次转写...`,
      });
      meeting.status = 'transcribing';
      meeting.statusMessage = task.message;
      this.saveMeeting(meeting);

      let timeOffset = 0;
      for (let index = 0; index < totalChunks; index += 1) {
        task = this.transcriptionTasks.get(meetingId) || task;
        if (task.status === 'cancelled') return;

        const chunkPath = chunks[index];
        const chunkStat = fs.statSync(chunkPath);
        const chunkName = temporaryChunks ? path.basename(chunkPath) : path.basename(sourcePath);
        task = this.publishTranscriptionTask({
          ...task,
          status: 'transcribing',
          currentChunk: index + 1,
          message: `正在转写第 ${index + 1}/${totalChunks} 段...`,
        });
        meeting.statusMessage = task.message;
        this.saveMeeting(meeting);

        // Deliberately await each chunk: the next request starts only after this one succeeds.
        const rawData = await this.requestAudioTranscriptionFile(
          chunkPath,
          chunkName,
          chunkStat.size,
          config,
          (message) => {
            const current = this.transcriptionTasks.get(meetingId);
            if (!current || current.status === 'cancelled') return;
            this.publishTranscriptionTask({ ...current, message: `第 ${index + 1}/${totalChunks} 段${message}` });
            meeting.statusMessage = `第 ${index + 1}/${totalChunks} 段${message}`;
            this.saveMeeting(meeting);
          },
        );
        task = this.transcriptionTasks.get(meetingId) || task;
        if (task.status === 'cancelled') return;

        const parsed = this.parseTranscriptionSegments(rawData, timeOffset);
        if (parsed.segments.length === 0) throw new Error(`第 ${index + 1}/${totalChunks} 段没有返回有效转写文本`);
        meeting.segments = [...meeting.segments, ...parsed.segments].sort((a, b) => a.startTime - b.startTime);
        meeting.speakers = this.calculateSpeakersFromSegments(meeting.segments);
        meeting.duration = Math.max(meeting.duration || 0, Math.ceil(parsed.duration));
        const hitTerms = new Set<string>();
        meeting.segments.forEach((segment) => segment.matchedTerms?.forEach((term) => hitTerms.add(term.term)));
        meeting.glossaryHitTerms = Array.from(hitTerms);
        timeOffset = Math.max(timeOffset, parsed.duration, (index + 1) * TRANSCRIPTION_CHUNK_SECONDS);
        meeting.status = 'transcribing';

        const completedChunks = index + 1;
        const isDone = completedChunks === totalChunks;
        meeting.statusMessage = isDone
          ? '分段转写完成，准备进行会议总结'
          : `已完成 ${completedChunks}/${totalChunks} 段，正在请求下一段...`;
        this.saveMeeting(meeting);
        task = this.publishTranscriptionTask({
          ...task,
          completedChunks,
          currentChunk: isDone ? totalChunks : completedChunks + 1,
          message: meeting.statusMessage,
        });
      }

      meeting.status = 'transcribed';
      meeting.statusMessage = '转写完成，准备进行智能总结与语艺分析';
      this.saveMeeting(meeting);
      const current = this.transcriptionTasks.get(meetingId);
      if (current && current.status !== 'cancelled') {
        this.publishTranscriptionTask({ ...current, status: 'completed', message: meeting.statusMessage });
      }
    } catch (error: any) {
      const message = error?.response || error?.code
        ? getTranscriptionErrorMessage(error, getTranscriptionTimeoutMs(0))
        : error?.message || '转写任务失败';
      const meeting = this.getMeetingById(meetingId);
      if (meeting) {
        meeting.status = meeting.segments.length > 0 ? 'transcribed' : 'error';
        meeting.statusMessage = message;
        this.saveMeeting(meeting);
      }
      const current = this.transcriptionTasks.get(meetingId) || initialTask;
      if (current.status !== 'cancelled') {
        this.publishTranscriptionTask({ ...current, status: 'error', error: message, message });
      }
      console.warn('[MeetingService] 后台分段转写失败:', message);
    } finally {
      if (temporaryChunks) this.cleanupTranscriptionChunks(chunks);
    }
  }

  public deleteAudioFile(filePath: string): boolean {
    if (!filePath) return false;
    const audioRoot = path.resolve(this.getAudioStorageDir());
    const target = path.resolve(filePath);
    if (target !== audioRoot && !target.startsWith(`${audioRoot}${path.sep}`)) return false;
    try {
      if (fs.existsSync(target)) fs.unlinkSync(target);
      return true;
    } catch {
      return false;
    }
  }

  // ==================== OpenAI 语音转写 ====================

  /**
   * 使用 OpenAI 兼容音频接口转写会议，并注入专业术语提示
   */
  public async transcribeAudio(
    meetingId: string,
    options?: {
      apiKey?: string;
      baseUrl?: string;
      model?: string;
      language?: string;
    }
  ): Promise<MeetingRecord> {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) {
      throw new Error(`未找到指定会议 [${meetingId}]`);
    }

    meeting.status = 'transcribing';
    meeting.statusMessage = '正在上传音频并请求转写服务...';
    this.saveMeeting(meeting);

    const settings = this.getSettings();
    let apiKey = (options?.apiKey || settings.apiKey || '').trim();
    let baseUrl = (options?.baseUrl || settings.baseUrl || 'https://api.openai.com/v1').trim();
    if (!apiKey && isOfficialOpenAiEndpoint(baseUrl)) {
      const openAiProvider = this.aiService.getAiConfig().providers.find(
        (provider) => provider.id === 'openai' && provider.enabled && provider.apiKey?.trim()
      );
      if (openAiProvider?.apiKey) {
        apiKey = openAiProvider.apiKey.trim();
      }
    }
    const model = options?.model || settings.model || 'gpt-transcribe';
    const language = options?.language || settings.language || 'zh';

    const promptText = settings.promptTerminologyEnabled && model === 'whisper-1'
      ? this.buildWhisperPrompt()
      : '';
    const keywords = settings.promptTerminologyEnabled && model === 'gpt-transcribe'
      ? this.getGlossary().filter((term) => term.enabled).map((term) => term.term).slice(0, 35)
      : [];

    let segments: MeetingSegment[] = [];
    let totalDuration = meeting.duration || 0;

    let requestErrorMessage = '';
    let requestTimeoutMs = 120_000;
    if (!apiKey) {
      requestErrorMessage = '未配置转写 API Key。请在「转写配置」中填写支持 OpenAI 音频转写接口的密钥。';
    } else if (!meeting.audioPath || !fs.existsSync(meeting.audioPath)) {
      requestErrorMessage = '会议音频文件不存在，请重新导入或录制。';
    }

    if (apiKey && meeting.audioPath && fs.existsSync(meeting.audioPath)) {
      try {
        const stat = fs.statSync(meeting.audioPath);
        const fileName = path.basename(meeting.audioPath);
        const validationError = validateOpenAiAudioFile(fileName, stat.size, baseUrl);
        if (validationError) throw new Error(validationError);

        const endpoint = getTranscriptionEndpoint(baseUrl);
        requestTimeoutMs = getTranscriptionTimeoutMs(stat.size);
        const sendRequest = async (
          sourcePath: string,
          sourceFileName: string,
          sourceSize: number,
          responseFormat?: 'verbose_json' | 'json',
        ) => {
          const formData = new FormData();
          formData.append('file', fs.createReadStream(sourcePath), {
            filename: sourceFileName,
            contentType: getAudioMimeType(sourceFileName),
            knownLength: sourceSize,
          });
          formData.append('model', model);
          if (responseFormat) formData.append('response_format', responseFormat);
          if (language && language !== 'auto') {
            if (model === 'gpt-transcribe') formData.append('languages[]', language);
            else formData.append('language', language);
          }
          if (promptText) formData.append('prompt', promptText);
          for (const keyword of keywords) {
            const cleanKeyword = keyword.replace(/[<>\r\n]/g, '').trim();
            if (cleanKeyword) formData.append('keywords[]', cleanKeyword);
          }

          return axios.post(endpoint, formData, {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              ...formData.getHeaders(),
            },
            timeout: requestTimeoutMs,
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
          });
        };

        const requestTranscription = async (
          sourcePath: string,
          sourceFileName: string,
          sourceSize: number,
          statusPrefix = '转写服务',
        ): Promise<any> => {
          const timeoutMs = getTranscriptionTimeoutMs(sourceSize);
          requestTimeoutMs = timeoutMs;
          for (let attempt = 0; attempt < MAX_TRANSCRIPTION_ATTEMPTS; attempt += 1) {
            try {
              const responseFormat = model === 'whisper-1' ? 'verbose_json' : undefined;
              try {
                return (await sendRequest(sourcePath, sourceFileName, sourceSize, responseFormat)).data;
              } catch (err: any) {
                if (!shouldRetryWithoutVerboseJson(err)) throw err;
                console.info('[MeetingService] 当前转写端点不支持 verbose_json，改用 json 响应格式重试');
                return (await sendRequest(sourcePath, sourceFileName, sourceSize, 'json')).data;
              }
            } catch (err: any) {
              if (!isRetryableTranscriptionError(err) || attempt >= MAX_TRANSCRIPTION_ATTEMPTS - 1) throw err;
              const retryNumber = attempt + 1;
              const delayMs = getTranscriptionRetryDelayMs(attempt);
              const status = Number(err?.response?.status);
              meeting.statusMessage = `${statusPrefix}暂时不可用${status ? `（HTTP ${status}）` : ''}，${Math.ceil(delayMs / 1000)} 秒后自动重试（${retryNumber}/${MAX_TRANSCRIPTION_ATTEMPTS - 1}）...`;
              this.saveMeeting(meeting);
              console.warn(`[MeetingService] 转写请求暂时失败，${delayMs}ms 后重试 (${retryNumber}/${MAX_TRANSCRIPTION_ATTEMPTS - 1})`, err?.message || err);
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
          }
          throw new Error('转写请求未完成');
        };

        let rawData: any;
        try {
          rawData = await requestTranscription(meeting.audioPath, fileName, stat.size);
        } catch (err: any) {
          requestErrorMessage = err?.response || err?.code
            ? getTranscriptionErrorMessage(err, requestTimeoutMs)
            : err?.message || '转写请求失败';
          console.warn('[MeetingService] 完整音频转写失败:', requestErrorMessage);

          if (isRetryableTranscriptionError(err)) {
            const chunkPaths = this.splitAudioForTranscription(meeting.audioPath, meetingId);
            const chunks = await chunkPaths;
            if (chunks.length > 1) {
              const mergedSegments: MeetingSegment[] = [];
              let chunkOffset = 0;
              let chunkSucceeded = true;
              try {
                for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
                  const chunkPath = chunks[chunkIndex];
                  const chunkStat = fs.statSync(chunkPath);
                  meeting.statusMessage = `完整音频处理超时，正在转写第 ${chunkIndex + 1}/${chunks.length} 段...`;
                  this.saveMeeting(meeting);
                  const chunkData = await requestTranscription(
                    chunkPath,
                    path.basename(chunkPath),
                    chunkStat.size,
                    `第 ${chunkIndex + 1}/${chunks.length} 段转写服务`,
                  );

                  const chunkStart = chunkOffset;
                  const chunkDuration = Number.isFinite(Number(chunkData?.duration)) && Number(chunkData.duration) > 0
                    ? Number(chunkData.duration)
                    : TRANSCRIPTION_CHUNK_SECONDS;
                  chunkOffset += chunkDuration;
                  const chunkText = extractTranscriptionText(chunkData);
                  if (Array.isArray(chunkData?.segments)) {
                    const speakerIds = new Map<string, number>();
                    chunkData.segments
                      .filter((seg: any) => typeof seg?.text === 'string' && seg.text.trim())
                      .forEach((seg: any, segmentIndex: number) => {
                        const speakerValue = seg.speaker_id ?? seg.speaker;
                        const speakerKey = speakerValue == null ? '' : String(speakerValue);
                        if (speakerKey && !speakerIds.has(speakerKey)) speakerIds.set(speakerKey, speakerIds.size + 1);
                        const speakerNum = speakerKey ? speakerIds.get(speakerKey)! : 1;
                        const start = Number(seg.start);
                        const end = Number(seg.end);
                        const text = seg.text.trim();
                        mergedSegments.push({
                          id: `seg_${Date.now()}_${chunkIndex}_${segmentIndex}`,
                          speakerId: `spk_${speakerNum}`,
                          speakerName: `发言人 ${speakerNum}`,
                          startTime: (Number.isFinite(start) ? start : segmentIndex * 10) + chunkStart,
                          endTime: (Number.isFinite(end) && end > 0 ? end : (segmentIndex + 1) * 10) + chunkStart,
                          text,
                          tone: 'neutral',
                          toneLabel: '发言陈述',
                          matchedTerms: this.matchTermsInText(text),
                        });
                      });
                  } else if (chunkText) {
                    let currentTime = chunkStart;
                    chunkText
                      .split(/(?<=[。！？.!?；;\n])\s*/)
                      .map((sentence: string) => sentence.trim())
                      .filter(Boolean)
                      .forEach((text: string, segmentIndex: number) => {
                        const segmentDuration = Math.max(3, Math.round(text.length * 0.35));
                        mergedSegments.push({
                          id: `seg_${Date.now()}_${chunkIndex}_${segmentIndex}`,
                          speakerId: 'spk_1',
                          speakerName: '发言人 1',
                          startTime: currentTime,
                          endTime: currentTime + segmentDuration,
                          text,
                          tone: 'neutral',
                          toneLabel: '发言陈述',
                          matchedTerms: this.matchTermsInText(text),
                        });
                        currentTime += segmentDuration;
                      });
                  }
                }
              } catch (chunkErr: any) {
                chunkSucceeded = false;
                requestErrorMessage = chunkErr?.response || chunkErr?.code
                  ? getTranscriptionErrorMessage(chunkErr, requestTimeoutMs)
                  : chunkErr?.message || requestErrorMessage;
                console.warn('[MeetingService] 音频分片转写失败:', requestErrorMessage);
              } finally {
                this.cleanupTranscriptionChunks(chunks);
              }
              if (chunkSucceeded && mergedSegments.length > 0) {
                segments = mergedSegments;
                totalDuration = Math.max(totalDuration, Math.round(chunkOffset));
                rawData = null;
              }
            }
          }
        }

        if (rawData && Number.isFinite(Number(rawData?.duration)) && Number(rawData.duration) > 0) {
          totalDuration = Math.round(Number(rawData.duration));
        }

        if (rawData && Array.isArray(rawData?.segments)) {
          const speakerIds = new Map<string, number>();
          segments = rawData.segments
            .filter((seg: any) => typeof seg?.text === 'string' && seg.text.trim())
            .map((seg: any, idx: number) => {
              const text = seg.text.trim();
              const speakerValue = seg.speaker_id ?? seg.speaker;
              const speakerKey = speakerValue == null ? '' : String(speakerValue);
              if (speakerKey && !speakerIds.has(speakerKey)) speakerIds.set(speakerKey, speakerIds.size + 1);
              const speakerNum = speakerKey ? speakerIds.get(speakerKey)! : 1;
              const start = Number(seg.start);
              const end = Number(seg.end);
              return {
                id: `seg_${Date.now()}_${idx}`,
                speakerId: `spk_${speakerNum}`,
                speakerName: `发言人 ${speakerNum}`,
                startTime: Number.isFinite(start) ? start : idx * 10,
                endTime: Number.isFinite(end) && end > 0 ? end : (idx + 1) * 10,
                text,
                tone: 'neutral' as const,
                toneLabel: '发言陈述',
                matchedTerms: this.matchTermsInText(text),
              };
            });
        }

        if (rawData && segments.length === 0) {
          const transcript = extractTranscriptionText(rawData);
          if (transcript) {
            const sentences = transcript
              .split(/(?<=[。！？.!?；;\n])\s*/)
              .map((sentence) => sentence.trim())
              .filter(Boolean);

            let currentTime = 0;
            segments = sentences.map((sentence, idx) => {
              const segmentDuration = Math.max(3, Math.round(sentence.length * 0.35));
              const segment = {
                id: `seg_${Date.now()}_${idx}`,
                speakerId: 'spk_1',
                speakerName: '发言人 1',
                startTime: currentTime,
                endTime: currentTime + segmentDuration,
                text: sentence,
                tone: 'neutral' as const,
                toneLabel: '发言陈述',
                matchedTerms: this.matchTermsInText(sentence),
              };
              currentTime += segmentDuration;
              return segment;
            });
            if (!totalDuration) totalDuration = currentTime;
          }
        }
      } catch (err: any) {
        requestErrorMessage = err?.response || err?.code
          ? getTranscriptionErrorMessage(err, requestTimeoutMs)
          : err?.message || '转写请求失败';
        console.warn('[MeetingService] 音频转写请求失败:', requestErrorMessage);
      }
    }

    if (segments.length === 0) {
      meeting.status = 'error';
      meeting.statusMessage = requestErrorMessage || '转写接口已返回，但没有包含可识别的文本内容。';
      this.saveMeeting(meeting);
      throw new Error(meeting.statusMessage);
    }

    // 重新统计发言人时长分布
    const speakers = this.calculateSpeakersFromSegments(segments);

    // 收集命中的所有术语
    const allHitTerms = new Set<string>();
    segments.forEach((s) => s.matchedTerms?.forEach((t) => allHitTerms.add(t.term)));

    meeting.segments = segments;
    meeting.speakers = speakers;
    meeting.duration = totalDuration;
    meeting.glossaryHitTerms = Array.from(allHitTerms);
    meeting.status = 'transcribed';
    meeting.statusMessage = '转写完成，准备进行智能总结与语艺分析';
    this.saveMeeting(meeting);

    return meeting;
  }

  // ==================== 大模型会议总结与语艺分析 ====================

  /**
   * 使用大模型进行结构化总结、语艺沟通分析与图表数据生成
   */
  public summarizeMeeting(
    meetingId: string,
    options?: { providerId?: string; modelId?: string; live?: boolean },
  ): Promise<MeetingRecord> {
    const running = this.summaryTasks.get(meetingId);
    if (running) return running;
    const task = this.runMeetingSummary(meetingId, options).finally(() => this.summaryTasks.delete(meetingId));
    this.summaryTasks.set(meetingId, task);
    return task;
  }

  private async runMeetingSummary(
    meetingId: string,
    options?: {
      providerId?: string;
      modelId?: string;
      live?: boolean;
    }
  ): Promise<MeetingRecord> {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) {
      throw new Error(`未找到指定会议 [${meetingId}]`);
    }

    const previousStatus = meeting.status;
    meeting.status = 'summarizing';
    meeting.statusMessage = options?.live
      ? '正在根据最新转写片段更新实时摘要...'
      : '正在驱动大模型提炼核心决策、待办、语艺画像与图表数据...';
    this.saveMeeting(meeting);

    try {
      const { provider, modelId } = selectMeetingModel(this.aiService.getAiConfig(), options?.providerId, options?.modelId);
      const result = await analyzeMeeting(meeting,
        (system, input, maxTokens) => this.aiService.requestMeetingAnalysisText(provider, modelId, system, input, maxTokens),
        (message) => {
          const current = this.getMeetingById(meetingId);
          if (current) { current.statusMessage = message; this.saveMeeting(current); }
        });
      const latest = this.getMeetingById(meetingId);
      if (!latest) throw new Error('会议记录已删除');
      result.summary.modelUsed = modelId;
      // Preserve completed checkboxes for the same extracted task when a live summary is refreshed.
      for (const action of result.summary.actionItems) {
        action.completed = latest.summary?.actionItems.some(old => old.task === action.task && old.completed) || false;
      }
      latest.summary = result.summary;
      latest.speechArt = result.speechArt;
      latest.charts = this.buildMeetingCharts(latest, [], result.summary.actionItems, undefined, undefined, result.summary.decisionTradeoffs);
      latest.status = options?.live
        ? (previousStatus === 'transcribing' ? 'transcribing' : 'transcribed')
        : 'completed';
      latest.statusMessage = `已分析 ${result.summary.sourceSegmentCount} 段转写（${result.summary.sourceChunkCount} 个分段），生成 ${result.summary.topics.length} 个议题`;
      this.saveMeeting(latest);
      return latest;
    } catch (error: any) {
      // Retain the last successful result and all transcription data; never manufacture a summary.
      const latest = this.getMeetingById(meetingId);
      if (latest) {
        latest.status = previousStatus === 'summarizing' ? 'transcribed' : previousStatus;
        latest.statusMessage = `总结失败：${error?.message || '模型请求失败'}。已有转写与纪要已保留。`;
        this.saveMeeting(latest);
      }
      console.warn('[MeetingService] 会议分析失败:', error?.message);
      throw new Error(`会议总结失败：${error?.message || '模型请求失败'}`);
    }
  }

  // ==================== 图表数据组装 ====================

  private buildMeetingCharts(
    meeting: MeetingRecord,
    trajectory: any[],
    actionItems: MeetingActionItem[] = [],
    milestoneGantt?: GanttMilestoneItem[],
    speakerRadars?: SpeakerRadarScore[],
    decisionTradeoffs?: DecisionTradeoffItem[]
  ): MeetingChartData {
    // 1. 发言时长占比
    const speakerRatios = meeting.speakers.map((s) => ({
      speakerId: s.id,
      speakerName: s.name,
      seconds: s.talkTimeSeconds,
      percentage: s.talkRatio,
      color: s.avatarColor || '#3b82f6',
    }));

    // 2. 时间轴发言热度
    const bucketInterval = Math.max(30, Math.round(meeting.duration / 8));
    const timelineHeatmap: any[] = [];
    for (let t = 0; t < meeting.duration; t += bucketInterval) {
      const timeBucket = this.formatTime(t);
      const segs = meeting.segments.filter(
        (s) => s.startTime >= t && s.startTime < t + bucketInterval
      );
      if (segs.length > 0) {
        const primarySpeaker = segs[0].speakerName;
        const color = meeting.speakers.find((sp) => sp.name === primarySpeaker)?.avatarColor || '#3b82f6';
        timelineHeatmap.push({
          timeBucket,
          speakerName: primarySpeaker,
          intensity: Math.min(100, Math.round(segs.reduce((acc, cur) => acc + cur.text.length, 0) / 2)),
          speakerColor: color,
        });
      } else {
        timelineHeatmap.push({
          timeBucket,
          speakerName: '中歇',
          intensity: 10,
          speakerColor: '#94a3b8',
        });
      }
    }

    // Missing evidence must remain empty instead of creating a fixed emotional narrative.
    const sentimentTrajectory = trajectory || [];

    // 4. 术语出现频次统计
    const termMap: Record<string, { count: number; category: string }> = {};
    for (const seg of meeting.segments) {
      seg.matchedTerms?.forEach((m) => {
        if (!termMap[m.term]) {
          termMap[m.term] = { count: 0, category: m.category };
        }
        termMap[m.term].count++;
      });
    }
    const termFrequencies = Object.entries(termMap)
      .map(([term, val]) => ({ term, count: val.count, category: val.category }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 5. 待办事项认领矩阵
    const actionByAssignee: Record<string, { total: number; high: number; completed: number }> = {};
    for (const act of actionItems) {
      const name = act.assignee || '未指派';
      if (!actionByAssignee[name]) {
        actionByAssignee[name] = { total: 0, high: 0, completed: 0 };
      }
      actionByAssignee[name].total++;
      if (act.priority === 'high') actionByAssignee[name].high++;
      if (act.completed) actionByAssignee[name].completed++;
    }
    const actionMatrix = Object.entries(actionByAssignee).map(([assignee, val]) => ({
      assignee,
      total: val.total,
      highPriority: val.high,
      completed: val.completed,
    }));

    return {
      speakerRatios,
      timelineHeatmap,
      sentimentTrajectory,
      termFrequencies,
      actionMatrix,
      milestoneGantt,
      speakerRadars,
      decisionTradeoffs,
    };
  }

  // ==================== 导出 Markdown ====================

  public exportMeetingMarkdown(meetingId: string): string {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) throw new Error('会议记录不存在');
    return formatMeetingMarkdown(meeting);
  }

  // ==================== 辅助计算 ====================

  private calculateSpeakersFromSegments(segments: MeetingSegment[]): MeetingSpeaker[] {
    const speakerMap: Record<
      string,
      { name: string; seconds: number; words: number }
    > = {};

    let totalSec = 0;
    for (const seg of segments) {
      const dur = Math.max(1, seg.endTime - seg.startTime);
      totalSec += dur;
      if (!speakerMap[seg.speakerId]) {
        speakerMap[seg.speakerId] = { name: seg.speakerName, seconds: 0, words: 0 };
      }
      speakerMap[seg.speakerId].seconds += dur;
      speakerMap[seg.speakerId].words += seg.text.length;
    }

    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
    let idx = 0;

    return Object.entries(speakerMap).map(([id, info]) => {
      const ratio = totalSec > 0 ? Math.round((info.seconds / totalSec) * 100) : 0;
      return {
        id,
        name: info.name,
        avatarColor: colors[idx++ % colors.length],
        talkTimeSeconds: Math.round(info.seconds),
        talkRatio: ratio,
        wordCount: info.words,
      };
    });
  }

  private formatTime(seconds: number): string {
    const s = Math.floor(seconds || 0);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    const h = Math.floor(m / 60);
    const minRem = m % 60;
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${minRem.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  }

  // ==================== 默认术语库 ====================

  private getDefaultGlossary(): GlossaryTerm[] {
    return [
      {
        id: 'term_1',
        term: 'XOQL',
        category: 'tech_arch',
        categoryLabel: '技术与架构',
        aliases: ['X-O-Q-L', 'xoql'],
        explanation: 'NeoCRM 自研面向对象化查询语言，支持灵活的对象关系级联检索与聚合统计，语法结构对标 Salesforce SOQL。',
        exampleSentence: '在数据同步任务中，需通过 XOQL 进行增量修改记录探测。',
        enabled: true,
        isBuiltin: true,
      },
      {
        id: 'term_2',
        term: 'SOQL',
        category: 'tech_arch',
        categoryLabel: '技术与架构',
        aliases: ['S-O-Q-L', 'soql'],
        explanation: 'Salesforce Object Query Language，用于直接检索 Salesforce 组织标准与自定义对象数据的强大查询接口。',
        exampleSentence: '执行 SELECT Id, Name, StageName FROM Opportunity WHERE IsClosed = false。',
        enabled: true,
        isBuiltin: true,
      },
      {
        id: 'term_3',
        term: 'CPQ',
        category: 'crm_sales',
        categoryLabel: 'CRM与业务',
        aliases: ['C-P-Q', '报价系统'],
        explanation: 'Configure, Price, Quote，企业级高级配置、阶梯价格策略与自动化销售报价集成解决方案。',
        exampleSentence: '当销售签约大订单时，需通过 CPQ 自动化核算多维度折扣率。',
        enabled: true,
        isBuiltin: true,
      },
      {
        id: 'term_4',
        term: 'ARR',
        category: 'crm_sales',
        categoryLabel: 'CRM与业务',
        aliases: ['A-R-R', '年度经常性收入'],
        explanation: 'Annual Recurring Revenue，SaaS 和订阅制企业最核心的财务与商业健康度评价指标。',
        exampleSentence: '本次季度 Q3 新签合同预计为大区贡献 1200 万 ARR。',
        enabled: true,
        isBuiltin: true,
      },
      {
        id: 'term_5',
        term: 'APL',
        category: 'tech_arch',
        categoryLabel: '技术与架构',
        aliases: ['A-P-L', '纷享APL'],
        explanation: '纷享销客 PaaS 高级编程脚本语言，用于实现自定义业务逻辑、触发器扩展及跨系统接口对接。',
        exampleSentence: '在合同审批通过后，通过 APL 函数自动更新回款计划。',
        enabled: true,
        isBuiltin: true,
      },
      {
        id: 'term_6',
        term: 'SLA',
        category: 'biz_mgmt',
        categoryLabel: '商务与管理',
        aliases: ['S-L-A', '服务等级协议'],
        explanation: 'Service Level Agreement，服务提供商与客户之间确定的系统可用性、响应时间与故障修复时限契约。',
        exampleSentence: '生产环境核心接口调用故障响应 SLA 必须承诺在 15 分钟以内。',
        enabled: true,
        isBuiltin: true,
      },
      {
        id: 'term_7',
        term: 'POC',
        category: 'biz_mgmt',
        categoryLabel: '商务与管理',
        aliases: ['P-O-C', '概念验证'],
        explanation: 'Proof of Concept，在商务正式定单前，为客户搭建验证技术可行性与业务闭环的原型方案。',
        exampleSentence: '技术团队需在下周三前交付客户多环境打通的 POC 演示。',
        enabled: true,
        isBuiltin: true,
      },
      {
        id: 'term_8',
        term: 'BatchApex',
        category: 'tech_arch',
        categoryLabel: '技术与架构',
        aliases: ['Batch Apex', '批量Apex'],
        explanation: 'Salesforce 用于异步处理数十万至数百万级大体量记录的异步批量编程接口。',
        exampleSentence: '对于历史账单清洗任务，必须采用 BatchApex 拆分成 200 条一批异步跑。',
        enabled: true,
        isBuiltin: true,
      },
      {
        id: 'term_9',
        term: 'Nex页面扩展',
        category: 'tech_arch',
        categoryLabel: '技术与架构',
        aliases: ['Nex扩展', '销售易Nex'],
        explanation: '销售易 Nex 2.0 现代化前端页面扩展机制，支持在表单、列表和详情页嵌入深度定制化 React/TS 组件。',
        exampleSentence: '通过 Nex 页面扩展在合同详情页上方挂载了实时风控预警卡片。',
        enabled: true,
        isBuiltin: true,
      },
      {
        id: 'term_10',
        term: '商机阶段',
        category: 'crm_sales',
        categoryLabel: 'CRM与业务',
        aliases: ['Opportunity Stage', '销售阶段'],
        explanation: 'CRM 中跟踪销售项目从初步接触、需求确认、方案呈现、商务谈判到赢单输单的全生命周期推进节点。',
        exampleSentence: '商机阶段从商务谈判流转到签约审批时，系统需触发自动审批流程。',
        enabled: true,
        isBuiltin: true,
      },
    ];
  }


}
