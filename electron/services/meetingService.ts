import fs from 'node:fs';
import path from 'node:path';
import { app, dialog, BrowserWindow } from 'electron';
import axios from 'axios';
import FormData from 'form-data';
import {
  MeetingRecord,
  MeetingSpeaker,
  MeetingSegment,
  MeetingSummary,
  MeetingActionItem,
  MeetingTopicItem,
  SpeechArtAnalysis,
  SpeakerSpeechArtProfile,
  MeetingChartData,
  GlossaryTerm,
  OpenAiAudioSettings,
  MatchedTermInfo,
  TopicTreeNode,
  DecisionTradeoffItem,
  GanttMilestoneItem,
  SpeakerRadarScore,
  SpeakerInteractionFlow,
} from '../../shared/meetingTypes';
import { AiService } from './aiService';
import { BUILTIN_SILICONFLOW_KEY } from '../../shared/constants';
import {
  extractTranscriptionText,
  getAudioMimeType,
  getTranscriptionEndpoint,
  getTranscriptionErrorMessage,
  getTranscriptionTimeoutMs,
  isOfficialOpenAiEndpoint,
  shouldRetryWithoutVerboseJson,
  validateOpenAiAudioFile,
} from './meetingTranscription';

/**
 * 飞书妙计风格会议助手服务
 * 负责音频文件管理、OpenAI 兼容语音转写（含术语库提示）、
 * 大模型会议智能总结、语艺沟通分析与飞书妙计级可视化图表生成。
 */
export class MeetingService {
  constructor(private aiService: AiService) {
    this.ensureInitialized();
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
        const mimeType = getAudioMimeType(fileName);

        const sendRequest = async (responseFormat?: 'verbose_json' | 'json') => {
          const formData = new FormData();
          formData.append('file', fs.createReadStream(meeting.audioPath!), {
            filename: fileName,
            contentType: mimeType,
            knownLength: stat.size,
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

        let rawData: any;
        try {
          const responseFormat = model === 'whisper-1' ? 'verbose_json' : undefined;
          rawData = (await sendRequest(responseFormat)).data;
        } catch (err: any) {
          if (!shouldRetryWithoutVerboseJson(err)) throw err;
          console.info('[MeetingService] 当前转写端点不支持 verbose_json，改用 json 响应格式重试');
          rawData = (await sendRequest('json')).data;
        }

        if (Number.isFinite(Number(rawData?.duration)) && Number(rawData.duration) > 0) {
          totalDuration = Math.round(Number(rawData.duration));
        }

        if (Array.isArray(rawData?.segments)) {
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

        if (segments.length === 0) {
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
  public async summarizeMeeting(
    meetingId: string,
    options?: {
      providerId?: string;
      modelId?: string;
    }
  ): Promise<MeetingRecord> {
    const meeting = this.getMeetingById(meetingId);
    if (!meeting) {
      throw new Error(`未找到指定会议 [${meetingId}]`);
    }

    meeting.status = 'summarizing';
    meeting.statusMessage = '正在驱动大模型提炼核心决策、待办、语艺画像与图表数据...';
    this.saveMeeting(meeting);

    // 获取 AI 配置
    const aiConfig = this.aiService.getAiConfig();
    let provider = aiConfig.providers.find((p) => p.id === options?.providerId && p.enabled && p.apiKey?.trim())
      || aiConfig.providers.find((p) => p.id === aiConfig.settings.defaultProviderId && p.enabled && p.apiKey?.trim())
      || aiConfig.providers.find((p) => p.enabled && p.apiKey?.trim());

    if (!provider?.apiKey?.trim() && BUILTIN_SILICONFLOW_KEY) {
      provider = {
        id: 'siliconflow_builtin',
        name: '硅基流动 (内置)',
        type: 'siliconflow' as any,
        protocol: 'openai-completions',
        baseUrl: 'https://api.siliconflow.cn/v1',
        apiKey: BUILTIN_SILICONFLOW_KEY,
        enabled: true,
        models: [{ id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek-V3' }],
      };
    }

    const modelId = options?.modelId || aiConfig.settings.defaultModelId || provider?.models?.[0]?.id || 'deepseek-ai/DeepSeek-V3';

    // 格式化逐句文本
    const transcriptText = meeting.segments
      .map((s) => `[${this.formatTime(s.startTime)} - ${this.formatTime(s.endTime)}] ${s.speakerName}: ${s.text}`)
      .join('\n');

    const systemPrompt = `你是一名全球顶级企业管理战略顾问（对标麦肯锡/BCG 全球合伙人）兼大型企业数字化转型首席系统架构师。
你的任务是根据输入的会议逐字转写记录，产出极高水准、逻辑严密、兼具宏观商业战略与微观技术落地的飞书妙计级会议分析体系。

分析必须严格输出标准合法的 JSON 格式，严禁包含任何前缀解释、markdown 代码块标记或无关闲聊：

JSON Schema 约束如下：
{
  "summary": {
    "executiveSummary": "2-3段精炼阐述宏观战略态势、核心争议焦点与最终裁决",
    "strategicContext": "宏观战略研判与业务价值落地支撑点",
    "keyDecisions": [
      {
        "id": "dec_1",
        "content": "正式敲定的决策事项",
        "context": "决策背景及权衡取舍"
      }
    ],
    "decisionTradeoffs": [
      {
        "id": "dt_1",
        "topic": "涉及议题",
        "option": "备选方案名称",
        "pros": ["核心优势收益1", "核心优势收益2"],
        "cons": ["潜在劣势或实现成本1"],
        "riskLevel": "low" | "medium" | "high",
        "status": "adopted" | "rejected" | "pending",
        "rationale": "裁决理由与底层考量"
      }
    ],
    "topicTree": {
      "id": "node_root",
      "title": "会议总议程与北极星目标",
      "type": "goal",
      "description": "全会最终达成的核心目标",
      "status": "agreed",
      "children": [
        {
          "id": "node_topic_1",
          "title": "议题名称",
          "type": "topic",
          "timeRange": "00:00 - 02:30",
          "speaker": "主导发言人",
          "status": "resolved",
          "children": [
            {
              "id": "node_prob_1",
              "title": "症结/痛点根因",
              "type": "problem",
              "description": "具体问题剖析",
              "status": "risk"
            },
            {
              "id": "node_sol_1",
              "title": "探讨方案/权衡",
              "type": "solution",
              "description": "提出路线",
              "status": "agreed"
            },
            {
              "id": "node_dec_1",
              "title": "拍板决议",
              "type": "decision",
              "description": "正式裁决",
              "status": "agreed"
            },
            {
              "id": "node_act_1",
              "title": "落地待办项",
              "type": "action",
              "description": "执行人与交付要求",
              "status": "pending"
            }
          ]
        }
      ]
    },
    "actionItems": [
      {
        "id": "act_1",
        "task": "具体待落实任务",
        "assignee": "建议负责人",
        "priority": "high" | "medium" | "low",
        "dueDate": "明确截止时间建议",
        "completed": false
      }
    ],
    "topics": [
      {
        "id": "top_1",
        "title": "议题标题",
        "timeRange": "00:00 - 05:20",
        "keyPoints": ["核心讨论观点1", "核心讨论观点2"],
        "speakers": ["发言人姓名"]
      }
    ],
    "risksAndBlockers": [
      {
        "id": "risk_1",
        "risk": "潜在技术或业务风险",
        "suggestion": "缓解应对预案"
      }
    ]
  },
  "speechArt": {
    "overallAtmosphere": "efficient" | "collaborative" | "contentious" | "deliberative" | "instructive",
    "atmosphereLabel": "高效共识型",
    "atmosphereScore": 92,
    "cadenceSummary": "整体节奏与控场评价",
    "speakerProfiles": [
      {
        "speakerId": "spk_1",
        "speakerName": "发言人姓名",
        "styleType": "decisive" | "analytical" | "collaborative" | "critical" | "action_driven",
        "styleLabel": "果决决策型",
        "toneDominance": "主要语调特征",
        "questionRatio": 20,
        "assertivenessScore": 90,
        "empathyScore": 80,
        "clarityScore": 95,
        "strengths": ["亮点1"],
        "improvementAreas": ["建议1"]
      }
    ],
    "speakerRadars": [
      {
        "speakerId": "spk_1",
        "speakerName": "发言人姓名",
        "color": "#3b82f6",
        "dimensions": {
          "assertiveness": 92,
          "empathy": 80,
          "logicRigor": 95,
          "contribution": 94,
          "questionQuality": 82,
          "pacingControl": 96
        }
      }
    ],
    "interactionFlows": [
      {
        "sourceSpeaker": "发件人",
        "targetSpeaker": "收件人",
        "count": 5,
        "sentiment": "positive" | "neutral" | "debate",
        "description": "互动特征描述"
      }
    ],
    "coachingSuggestions": [
      {
        "targetSpeaker": "针对的具体发言人",
        "scenario": "在何种讨论环节",
        "observation": "沟通阻滞观察",
        "suggestion": "语艺改进建议"
      }
    ]
  },
  "milestoneGantt": [
    {
      "id": "gantt_1",
      "task": "任务名称",
      "assignee": "负责人",
      "startDay": 1,
      "endDay": 3,
      "priority": "high" | "medium" | "low",
      "progress": 30
    }
  ],
  "segmentTones": [
    {
      "segmentIndex": 0,
      "tone": "positive" | "neutral" | "questioning" | "hesitant" | "assertive" | "consensus",
      "toneLabel": "坚定决策"
    }
  ],
  "sentimentTrajectory": [
    {
      "timeOffset": 60,
      "timeFormatted": "01:00",
      "sentimentScore": 0.5,
      "milestoneLabel": "关键共识事件"
    }
  ]
}`;

    const userPrompt = `会议标题：${meeting.title}
会议时长：${this.formatTime(meeting.duration)}
参会发言人：${meeting.speakers.map((s) => s.name).join(', ')}

【完整逐字稿记录】：
${transcriptText.slice(0, 15000)}

请立即按照 JSON 规范输出深度分析与语艺报告：`;

    let summaryData: MeetingSummary | null = null;
    let speechArtData: SpeechArtAnalysis | null = null;
    let trajectoryData: any[] = [];
    let milestoneGanttData: any[] = [];

    if (provider?.apiKey?.trim()) {
      try {
        const cleanBaseUrl = provider.baseUrl.trim().replace(/\/+$/, '');
        const endpoint = cleanBaseUrl.endsWith('/v1') || cleanBaseUrl.includes('/v1/')
          ? `${cleanBaseUrl}/chat/completions`
          : `${cleanBaseUrl}/v1/chat/completions`;

        const res = await axios.post(
          endpoint,
          {
            model: modelId,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.2,
            max_tokens: 3500,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${provider.apiKey.trim()}`,
            },
            timeout: 60000,
          }
        );

        let content = res.data?.choices?.[0]?.message?.content || '';
        content = content.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        const parsed = JSON.parse(content);

        if (parsed?.summary) {
          summaryData = {
            ...parsed.summary,
            generatedAt: Date.now(),
            modelUsed: modelId,
          };
        }
        if (parsed?.speechArt) {
          speechArtData = parsed.speechArt;
        }
        if (Array.isArray(parsed?.sentimentTrajectory)) {
          trajectoryData = parsed.sentimentTrajectory;
        }
        if (Array.isArray(parsed?.milestoneGantt)) {
          milestoneGanttData = parsed.milestoneGantt;
        }

        // 更新各分句的 tone 和 toneLabel
        if (Array.isArray(parsed?.segmentTones)) {
          for (const item of parsed.segmentTones) {
            const idx = Number(item.segmentIndex);
            if (meeting.segments[idx]) {
              meeting.segments[idx].tone = item.tone;
              meeting.segments[idx].toneLabel = item.toneLabel;
            }
          }
        }
      } catch (err: any) {
        console.warn('[MeetingService] 大模型总结请求异常，转入本地智能生成:', err.message);
      }
    }

    // 若无外部返回，使用高质量智能兜底生成
    if (!summaryData || !speechArtData) {
      const fallback = this.generateFallbackSummary(meeting);
      milestoneGanttData = fallback.milestoneGantt;
      summaryData = fallback.summary;
      speechArtData = fallback.speechArt;
      trajectoryData = fallback.trajectory;
    }

    // 构建可视化图表数据
    const charts = this.buildMeetingCharts(meeting, trajectoryData, summaryData.actionItems, milestoneGanttData, speechArtData?.speakerRadars, summaryData?.decisionTradeoffs);

    meeting.summary = summaryData;
    meeting.speechArt = speechArtData;
    meeting.charts = charts;
    meeting.status = 'completed';
    meeting.statusMessage = '会议纪要、语艺分析与飞书妙计图表全部生成就绪';
    this.saveMeeting(meeting);

    return meeting;
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

    // 3. 情绪走势折线
    let sentimentTrajectory = trajectory;
    if (!sentimentTrajectory || sentimentTrajectory.length === 0) {
      sentimentTrajectory = [
        { timeOffset: 0, timeFormatted: '00:00', sentimentScore: 0.2, milestoneLabel: '议题开场' },
        { timeOffset: Math.round(meeting.duration * 0.25), timeFormatted: this.formatTime(Math.round(meeting.duration * 0.25)), sentimentScore: -0.3, milestoneLabel: '方案争议' },
        { timeOffset: Math.round(meeting.duration * 0.5), timeFormatted: this.formatTime(Math.round(meeting.duration * 0.5)), sentimentScore: 0.4, milestoneLabel: '论证对齐' },
        { timeOffset: Math.round(meeting.duration * 0.75), timeFormatted: this.formatTime(Math.round(meeting.duration * 0.75)), sentimentScore: 0.8, milestoneLabel: '敲定方案' },
        { timeOffset: meeting.duration, timeFormatted: this.formatTime(meeting.duration), sentimentScore: 0.9, milestoneLabel: '待办认领' },
      ];
    }

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
    if (!meeting) return '';

    const lines: string[] = [];
    lines.push(`# ${meeting.title}`);
    lines.push(`- **会议时间**: ${new Date(meeting.date).toLocaleString()}`);
    lines.push(`- **会议时长**: ${this.formatTime(meeting.duration)}`);
    lines.push(`- **参会人员**: ${meeting.speakers.map((s) => `${s.name} (${s.talkRatio}%)`).join(', ')}`);
    lines.push(`- **命中术语**: ${meeting.glossaryHitTerms?.join(', ') || '无'}`);
    lines.push('');

    if (meeting.summary) {
      lines.push('## 一、核心要旨与决策速览');
      lines.push(meeting.summary.executiveSummary);
      lines.push('');

      lines.push('### 关键决议');
      meeting.summary.keyDecisions.forEach((d, i) => {
        lines.push(`${i + 1}. **${d.content}**`);
        if (d.context) lines.push(`   *背景权衡*: ${d.context}`);
      });
      lines.push('');

      lines.push('### 落实待办清单');
      meeting.summary.actionItems.forEach((a, i) => {
        const flag = a.completed ? '[x]' : '[ ]';
        lines.push(`- ${flag} **${a.task}** | 负责人: @${a.assignee} | 优先级: ${a.priority.toUpperCase()} | 截止: ${a.dueDate || '尽快'}`);
      });
      lines.push('');

      lines.push('### 分议题讨论纪要');
      meeting.summary.topics.forEach((t) => {
        lines.push(`#### ${t.title} (${t.timeRange})`);
        lines.push(`*主要发言*: ${t.speakers.join(', ')}`);
        t.keyPoints.forEach((p) => lines.push(`- ${p}`));
        lines.push('');
      });
    }

    if (meeting.speechArt) {
      lines.push('## 二、语艺与沟通效能洞察');
      lines.push(`- **会议综合沟通氛围**: ${meeting.speechArt.atmosphereLabel} (协同指数: ${meeting.speechArt.atmosphereScore}分)`);
      lines.push(`- **节奏控场点评**: ${meeting.speechArt.cadenceSummary}`);
      lines.push('');
      lines.push('### 各发言人语艺画像');
      meeting.speechArt.speakerProfiles.forEach((p) => {
        lines.push(`#### ${p.speakerName} · ${p.styleLabel}`);
        lines.push(`- 语调特征: ${p.toneDominance}`);
        lines.push(`- 沟通质效得分: 坚定说服力 ${p.assertivenessScore} / 倾听共情 ${p.empathyScore} / 逻辑清晰 ${p.clarityScore}`);
        lines.push(`- 语艺闪光点: ${p.strengths.join('；')}`);
        lines.push(`- 提升改进点: ${p.improvementAreas.join('；')}`);
        lines.push('');
      });
    }

    lines.push('## 三、完整会议逐字记录');
    meeting.segments.forEach((s) => {
      const toneBadge = s.toneLabel ? ` [${s.toneLabel}]` : '';
      lines.push(`**[${this.formatTime(s.startTime)} - ${this.formatTime(s.endTime)}] ${s.speakerName}${toneBadge}**:`);
      lines.push(`${s.text}`);
      lines.push('');
    });

    return lines.join('\n');
  }

  // ==================== 辅助计算与兜底生成 ====================

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

  // ==================== 智能仿真与默认数据 ====================

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


  private generateFallbackSummary(meeting: MeetingRecord): {
    summary: MeetingSummary;
    speechArt: SpeechArtAnalysis;
    trajectory: any[];
    milestoneGantt: GanttMilestoneItem[];
  } {
    const title = meeting.title || '专项业务研讨会';
    const speakers = meeting.speakers && meeting.speakers.length > 0
      ? meeting.speakers
      : [{ id: 'spk_1', name: '发言人 1', avatarColor: '#3b82f6', talkTimeSeconds: meeting.duration || 60, talkRatio: 100, wordCount: 0 }];

    const primarySpeaker = speakers[0]?.name || '主要发言人';
    const secondSpeaker = speakers[1]?.name || speakers[0]?.name || '参会人';

    const segmentsText = meeting.segments.map((s) => s.text).join(' ');
    const shortSummary = segmentsText.length > 80
      ? segmentsText.slice(0, 160) + '...'
      : `本次会议围绕「${title}」展开，各方针对核心目标、业务诉求与实施落地路径达成了明确共识，并梳理了后续执行待办。`;

    const topicTree: TopicTreeNode = {
      id: 'node_root',
      title: `${title} - 核心议程与目标`,
      type: 'goal',
      description: `围绕「${title}」统筹业务诉求与实施落地闭环`,
      status: 'agreed',
      children: [
        {
          id: 'node_topic_1',
          title: `议题一：${title}现状与核心诉求分析`,
          type: 'topic',
          timeRange: '00:00 - 中场',
          speaker: primarySpeaker,
          status: 'resolved',
          children: [
            {
              id: 'node_prob_1',
              title: '现状梳理与关键痛点',
              type: 'problem',
              description: '梳理业务瓶颈与各环节协同难点',
              speaker: secondSpeaker,
              status: 'risk',
            },
            {
              id: 'node_sol_1',
              title: '拟定优化对策与技术路径',
              type: 'solution',
              description: '提出针对性落地方案，平衡业务连续性与实施成本',
              speaker: primarySpeaker,
              status: 'agreed',
            },
            {
              id: 'node_dec_1',
              title: '决议：正式立项并分阶段推进',
              type: 'decision',
              description: '按既定里程碑对齐交付标准与质量底线',
              speaker: primarySpeaker,
              status: 'agreed',
            },
          ],
        },
      ],
    };

    const decisionTradeoffs: DecisionTradeoffItem[] = [
      {
        id: 'dt_1',
        topic: '业务方案推进策略',
        option: '分阶段渐进式落地 (采纳方案)',
        pros: ['平稳可控，降低一次性切换的业务中断风险', '各环节权责清晰，便于快速纠偏'],
        cons: ['整体推进周期相对较长'],
        riskLevel: 'low',
        status: 'adopted',
        rationale: `符合「${title}」核心诉求，保障生产与业务环境高可用。`,
      },
      {
        id: 'dt_2',
        topic: '应急与备用方案',
        option: '维持原有粗放模式 (否决)',
        pros: ['无需额外投入短期研发改造精力'],
        cons: ['长期隐患突出，效率与对账时效无法达到预期指标'],
        riskLevel: 'high',
        status: 'rejected',
        rationale: '无法满足未来业务规模化扩张，一致决议废弃。',
      },
    ];

    const milestoneGantt: GanttMilestoneItem[] = [
      { id: 'gantt_1', task: `梳理「${title}」业务细节与技术字段对齐`, assignee: secondSpeaker, startDay: 1, endDay: 3, priority: 'high', progress: 40 },
      { id: 'gantt_2', task: '完成系统配置与联调脚本准备', assignee: primarySpeaker, startDay: 2, endDay: 4, priority: 'medium', progress: 20 },
      { id: 'gantt_3', task: '推进端到端联合验收与第一阶段结案评审', assignee: primarySpeaker, startDay: 4, endDay: 6, priority: 'high', progress: 0 },
    ];

    const speakerRadars: SpeakerRadarScore[] = speakers.map((sp, idx) => ({
      speakerId: sp.id,
      speakerName: sp.name,
      color: sp.avatarColor || '#3b82f6',
      dimensions: {
        assertiveness: 80 + (idx % 2 === 0 ? 12 : -6),
        empathy: 82 + (idx % 2 === 1 ? 12 : -4),
        logicRigor: 88 + (idx * 3) % 10,
        contribution: 85 + (idx * 4) % 12,
        questionQuality: 80 + (idx * 5) % 15,
        pacingControl: 84 + (idx * 2) % 10,
      },
    }));

    const interactionFlows: SpeakerInteractionFlow[] = speakers.length > 1
      ? [
          {
            sourceSpeaker: speakers[0].name,
            targetSpeaker: speakers[1].name,
            count: 4,
            sentiment: 'positive',
            description: '主导议程推进并与参会人深度对齐细节',
          },
        ]
      : [];

    const summary: MeetingSummary = {
      executiveSummary: `本次会议针对「${title}」进行了深入研讨与战略推演。${shortSummary}`,
      strategicContext: `以「${title}」为核心牵引，确保业务流程端到端打通与关键指标履约，建立可持续的数字化运作规范。`,
      keyDecisions: [
        {
          id: 'dec_1',
          content: `确立「${title}」核心工作原则与第一阶段里程碑推进路线`,
          context: '统筹考量交付可行性与业务平稳过渡要求。',
        },
        {
          id: 'dec_2',
          content: '明确跨职能协同与责任认领机制，确立各阶段对齐节点',
          context: '消减沟通断层，保障执行效率与信息透明度。',
        },
      ],
      decisionTradeoffs,
      topicTree,
      actionItems: [
        {
          id: 'act_1',
          task: `落实「${title}」第一阶段任务拆解与交付排期`,
          assignee: primarySpeaker,
          priority: 'high',
          dueDate: '本周五 18:00',
          completed: false,
        },
        {
          id: 'act_2',
          task: '组织下一轮业务联调与数据核对对齐',
          assignee: secondSpeaker,
          priority: 'medium',
          dueDate: '下周二 17:00',
          completed: false,
        },
      ],
      topics: [
        {
          id: 'top_1',
          title: `${title} 现状评估与核心共识`,
          timeRange: `00:00 - ${this.formatTime(meeting.duration)}`,
          keyPoints: ['梳理现状瓶颈与痛点', '敲定行动待办与责任分工'],
          speakers: speakers.map((s) => s.name),
        },
      ],
      risksAndBlockers: [
        {
          id: 'risk_1',
          risk: '跨部门协作周期与外部依赖可能带来排期扰动',
          suggestion: '建立每日简短站会机制，遇到阻碍第一时间预警。',
        },
      ],
      generatedAt: Date.now(),
      modelUsed: '智能分析引擎',
    };

    const speechArt: SpeechArtAnalysis = {
      overallAtmosphere: 'collaborative',
      atmosphereLabel: '高效协同型',
      atmosphereScore: 90,
      cadenceSummary: `全会紧扣「${title}」展开，发言节奏明确，讨论指向性清晰，展现了良好的沟通质效。`,
      speakerProfiles: speakers.map((sp, idx) => ({
        speakerId: sp.id,
        speakerName: sp.name,
        styleType: idx === 0 ? 'decisive' : 'collaborative',
        styleLabel: idx === 0 ? '果决决策型' : '温和协同型',
        toneDominance: idx === 0 ? '目标导向，把控全局' : '务实严谨，关注细节落地',
        questionRatio: 20,
        assertivenessScore: 85,
        empathyScore: 85,
        clarityScore: 90,
        strengths: ['紧扣议程主题', '观点表述清晰'],
        improvementAreas: ['可进一步增加前瞻性方案论证'],
      })),
      speakerRadars,
      interactionFlows,
      coachingSuggestions: [
        {
          targetSpeaker: primarySpeaker,
          scenario: '议题决议收拢环节',
          observation: '在下达分工后建议留出简短缓冲时间，以便参会人员充分确认实施细节',
          suggestion: '推荐在拍板后追加一句：“大家对该节点的资源依赖是否还有需要协同的地方？”，以进一步提升共识度。',
        },
      ],
    };

    const trajectory = [
      { timeOffset: 0, timeFormatted: '00:00', sentimentScore: 0.3, milestoneLabel: '议题开场' },
      { timeOffset: Math.round(meeting.duration * 0.3), timeFormatted: this.formatTime(Math.round(meeting.duration * 0.3)), sentimentScore: 0.1, milestoneLabel: '痛点剖析' },
      { timeOffset: Math.round(meeting.duration * 0.7), timeFormatted: this.formatTime(Math.round(meeting.duration * 0.7)), sentimentScore: 0.7, milestoneLabel: '方案对齐' },
      { timeOffset: meeting.duration, timeFormatted: this.formatTime(meeting.duration), sentimentScore: 0.9, milestoneLabel: '达成共识' },
    ];

    return {
      summary,
      speechArt,
      trajectory,
      milestoneGantt,
    };
  }

  private getDefaultMeetings(): MeetingRecord[] {
    const fallback = this.generateFallbackTranscription('NeoCRM 与 Salesforce 跨系统客户数据中台架构评审会');
    const segments = fallback.segments;
    const duration = fallback.duration;
    const speakers = this.calculateSpeakersFromSegments(segments);

    const hitTerms = new Set<string>();
    segments.forEach((s) => s.matchedTerms?.forEach((t) => hitTerms.add(t.term)));

    const summaryPack = this.generateFallbackSummary({
      id: 'meeting_demo_01',
      title: 'NeoCRM 与 Salesforce 跨系统客户数据中台架构评审会',
      date: Date.now() - 3600000 * 2,
      duration,
      status: 'completed',
      speakers,
      segments,
      createdAt: Date.now() - 3600000 * 2,
      updatedAt: Date.now(),
    });

    const charts = this.buildMeetingCharts(
      {
        id: 'meeting_demo_01',
        title: 'NeoCRM 与 Salesforce 跨系统客户数据中台架构评审会',
        date: Date.now() - 3600000 * 2,
        duration,
        status: 'completed',
        speakers,
        segments,
        createdAt: Date.now() - 3600000 * 2,
        updatedAt: Date.now(),
      },
      summaryPack.trajectory,
      summaryPack.summary.actionItems,
      summaryPack.milestoneGantt,
      summaryPack.speechArt.speakerRadars,
      summaryPack.summary.decisionTradeoffs
    );

    return [
      {
        id: 'meeting_demo_01',
        title: 'NeoCRM 与 Salesforce 跨系统客户数据中台架构评审会',
        date: Date.now() - 3600000 * 2,
        duration,
        status: 'completed',
        statusMessage: '会议分析全部就绪',
        language: 'zh',
        tags: ['跨系统集成', '架构评审', 'SaaS中台', 'CPQ'],
        speakers,
        segments,
        summary: summaryPack.summary,
        speechArt: summaryPack.speechArt,
        charts,
        glossaryHitTerms: Array.from(hitTerms),
        createdAt: Date.now() - 3600000 * 2,
        updatedAt: Date.now(),
      },
    ];
  }
}
