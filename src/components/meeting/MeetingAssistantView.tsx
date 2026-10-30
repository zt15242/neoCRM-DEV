import React, { useState, useEffect, useCallback } from 'react';
import {
  Mic,
  Upload,
  BookOpen,
  Settings,
  Plus,
  Search,
  Trash2,
  FileText,
  Clock,
  Users,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Download,
  Share2,
  Brain,
  BarChart3,
  Edit3,
  Calendar,
  Layers,
  ChevronRight,
  Volume2,
  GitMerge,
} from 'lucide-react';
import {
  MeetingRecord,
  GlossaryTerm,
  OpenAiAudioSettings,
} from '../../../shared/meetingTypes';
import { MeetingAudioPlayer } from './MeetingAudioPlayer';
import { MeetingTranscriptPane } from './MeetingTranscriptPane';
import { MeetingSummaryPane } from './MeetingSummaryPane';
import { MeetingSpeechArtPane } from './MeetingSpeechArtPane';
import { MeetingChartsPane } from './MeetingChartsPane';
import { MeetingTopicTreePane } from './MeetingTopicTreePane';
import { MeetingGlossaryModal } from './MeetingGlossaryModal';
import { MeetingRecordModal } from './MeetingRecordModal';
import { MeetingSettingsModal } from './MeetingSettingsModal';

interface MeetingAssistantViewProps {
  showToast?: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const MeetingAssistantView: React.FC<MeetingAssistantViewProps> = ({
  showToast,
}) => {
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [activeMeetingId, setActiveMeetingId] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [rightTab, setRightTab] = useState<'summary' | 'tree' | 'speech_art' | 'charts'>('summary');
  const [searchQuery, setSearchQuery] = useState('');

  // 状态加载标记
  const [isLoading, setIsLoading] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);

  // 弹窗状态
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [showGlossaryModal, setShowGlossaryModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [glossaryTerms, setGlossaryTerms] = useState<GlossaryTerm[]>([]);

  // 发言人改名弹窗
  const [renameModal, setRenameModal] = useState<{
    speakerId: string;
    oldName: string;
  } | null>(null);
  const [newSpeakerName, setNewSpeakerName] = useState('');

  // 1. 初始化拉取会议列表与术语库
  const loadMeetings = useCallback(async () => {
    setIsLoading(true);
    try {
      if (window.neoApi?.meetingGetMeetings) {
        const list = await window.neoApi.meetingGetMeetings();
        setMeetings(list);
        if (list.length > 0 && !activeMeetingId) {
          setActiveMeetingId(list[0].id);
        }
      }
    } catch (err: any) {
      console.warn('[MeetingAssistantView] 加载会议失败:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeMeetingId]);

  const loadGlossary = useCallback(async () => {
    try {
      if (window.neoApi?.meetingGetGlossary) {
        const terms = await window.neoApi.meetingGetGlossary();
        setGlossaryTerms(terms);
      }
    } catch (err: any) {
      console.warn('[MeetingAssistantView] 加载术语库失败:', err);
    }
  }, []);

  useEffect(() => {
    loadMeetings();
    loadGlossary();
  }, [loadMeetings, loadGlossary]);

  const activeMeeting = meetings.find((m) => m.id === activeMeetingId);

  // 2. 选择本地音频文件并创建会议
  const handleImportAudioFile = async () => {
    if (!window.neoApi?.meetingSelectAudioFile) return;
    try {
      const fileInfo = await window.neoApi.meetingSelectAudioFile();
      if (!fileInfo) return;

      const newMeeting: MeetingRecord = {
        id: `meeting_${Date.now()}`,
        title: fileInfo.fileName.replace(/\.[^/.]+$/, '') || '新建导入会议',
        date: Date.now(),
        duration: 0,
        audioPath: fileInfo.filePath,
        audioFileName: fileInfo.fileName,
        audioFileSize: fileInfo.fileSize,
        audioDataUrl: fileInfo.dataUrl,
        status: 'idle',
        statusMessage: '音频文件已导入，请启动转写',
        speakers: [],
        segments: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      if (window.neoApi?.meetingSaveMeeting) {
        const saved = await window.neoApi.meetingSaveMeeting(newMeeting);
        setMeetings((prev) => [saved, ...prev]);
        setActiveMeetingId(saved.id);
        showToast?.('success', `已成功导入会议音频: ${fileInfo.fileName}`);

        // 自动触发转写
        triggerTranscription(saved.id);
      }
    } catch (err: any) {
      showToast?.('error', `导入音频失败: ${err.message}`);
    }
  };

  // 3. 完成麦克风录音并保存
  const handleFinishRecording = async (
    title: string,
    audioBuffer: ArrayBuffer,
    fileName: string
  ) => {
    try {
      if (!window.neoApi?.meetingSaveRecordedAudio || !window.neoApi?.meetingSaveMeeting) {
        throw new Error('未检测到录音存储接口');
      }

      const savedAudio = await window.neoApi.meetingSaveRecordedAudio(fileName, audioBuffer);

      const newMeeting: MeetingRecord = {
        id: `meeting_${Date.now()}`,
        title: title || '现场麦克风录音会议',
        date: Date.now(),
        duration: 0,
        audioPath: savedAudio.filePath,
        audioFileName: savedAudio.fileName,
        audioFileSize: savedAudio.fileSize,
        audioDataUrl: savedAudio.dataUrl,
        status: 'idle',
        speakers: [],
        segments: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const saved = await window.neoApi.meetingSaveMeeting(newMeeting);
      setMeetings((prev) => [saved, ...prev]);
      setActiveMeetingId(saved.id);
      setShowRecordModal(false);
      showToast?.('success', '现场录音已存储，正在开启 OpenAI 转写...');

      triggerTranscription(saved.id);
    } catch (err: any) {
      showToast?.('error', `保存录音失败: ${err.message}`);
    }
  };

  // 4. 触发已配置的语音转写服务
  const triggerTranscription = async (meetingId?: string) => {
    const targetId = meetingId || activeMeetingId;
    if (!targetId || !window.neoApi?.meetingTranscribeAudio) return;

    setIsTranscribing(true);
    showToast?.('info', '正在通过已配置的转写服务识别音频...');

    try {
      const updated = await window.neoApi.meetingTranscribeAudio(targetId);
      setMeetings((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      showToast?.('success', '音频转写完成，正在自动开启深度总结与语艺分析...');

      // 转写完成后自动触发大模型总结与语艺分析
      triggerSummarize(targetId);
    } catch (err: any) {
      showToast?.('error', `语音转写失败: ${err.message}`);
    } finally {
      setIsTranscribing(false);
    }
  };

  // 5. 触发大模型会议总结与语艺分析
  const triggerSummarize = async (meetingId?: string) => {
    const targetId = meetingId || activeMeetingId;
    if (!targetId || !window.neoApi?.meetingSummarizeMeeting) return;

    setIsSummarizing(true);
    showToast?.('info', '大模型正在提炼会议决策、待办、语艺画像与图表...');

    try {
      const updated = await window.neoApi.meetingSummarizeMeeting(targetId);
      setMeetings((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      showToast?.('success', '智能纪要、语艺画像与飞书妙计图表全部生成完成！');
    } catch (err: any) {
      showToast?.('error', `大模型总结失败: ${err.message}`);
    } finally {
      setIsSummarizing(false);
    }
  };

  // 6. 切换待办完成状态
  const handleToggleActionItem = async (actionId: string) => {
    if (!activeMeeting || !activeMeeting.summary) return;
    const items = activeMeeting.summary.actionItems.map((item) =>
      item.id === actionId ? { ...item, completed: !item.completed } : item
    );

    const updated: MeetingRecord = {
      ...activeMeeting,
      summary: {
        ...activeMeeting.summary,
        actionItems: items,
      },
    };

    if (window.neoApi?.meetingSaveMeeting) {
      const saved = await window.neoApi.meetingSaveMeeting(updated);
      setMeetings((prev) => prev.map((m) => (m.id === saved.id ? saved : m)));
    }
  };

  // 7. 统一重命名发言人
  const handleRenameSpeakerConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMeeting || !renameModal || !newSpeakerName.trim()) return;

    const { speakerId } = renameModal;
    const targetName = newSpeakerName.trim();

    // 更新 speakers
    const updatedSpeakers = activeMeeting.speakers.map((sp) =>
      sp.id === speakerId ? { ...sp, name: targetName } : sp
    );

    // 更新 segments
    const updatedSegments = activeMeeting.segments.map((seg) =>
      seg.speakerId === speakerId ? { ...seg, speakerName: targetName } : seg
    );

    // 更新 summary
    let updatedSummary = activeMeeting.summary;
    if (updatedSummary) {
      updatedSummary = {
        ...updatedSummary,
        topics: updatedSummary.topics.map((t) => ({
          ...t,
          speakers: t.speakers.map((s) => (s === renameModal.oldName ? targetName : s)),
        })),
      };
    }

    // 更新 speechArt
    let updatedSpeechArt = activeMeeting.speechArt;
    if (updatedSpeechArt) {
      updatedSpeechArt = {
        ...updatedSpeechArt,
        speakerProfiles: updatedSpeechArt.speakerProfiles.map((p) =>
          p.speakerId === speakerId ? { ...p, speakerName: targetName } : p
        ),
      };
    }

    // 更新 charts
    let updatedCharts = activeMeeting.charts;
    if (updatedCharts) {
      updatedCharts = {
        ...updatedCharts,
        speakerRatios: updatedCharts.speakerRatios.map((r) =>
          r.speakerId === speakerId ? { ...r, speakerName: targetName } : r
        ),
      };
    }

    const updatedMeeting: MeetingRecord = {
      ...activeMeeting,
      speakers: updatedSpeakers,
      segments: updatedSegments,
      summary: updatedSummary,
      speechArt: updatedSpeechArt,
      charts: updatedCharts,
    };

    if (window.neoApi?.meetingSaveMeeting) {
      const saved = await window.neoApi.meetingSaveMeeting(updatedMeeting);
      setMeetings((prev) => prev.map((m) => (m.id === saved.id ? saved : m)));
      showToast?.('success', `已将发言人统一重命名为: ${targetName}`);
    }

    setRenameModal(null);
  };

  // 8. 删除会议
  const handleDeleteMeeting = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm('确定要删除本场会议及关联的录音与分析数据吗？')) return;

    if (window.neoApi?.meetingDeleteMeeting) {
      await window.neoApi.meetingDeleteMeeting(id);
      setMeetings((prev) => prev.filter((m) => m.id !== id));
      if (activeMeetingId === id) {
        const rest = meetings.filter((m) => m.id !== id);
        setActiveMeetingId(rest[0]?.id || '');
      }
      showToast?.('success', '会议记录已删除');
    }
  };

  // 9. 导出 Markdown
  const handleExportMarkdown = async () => {
    if (!activeMeetingId || !window.neoApi?.meetingExportMarkdown) return;
    try {
      const md = await window.neoApi.meetingExportMarkdown(activeMeetingId);
      navigator.clipboard.writeText(md);
      showToast?.('success', '已导出并复制完整会议纪要 Markdown 文档');
    } catch (err: any) {
      showToast?.('error', `导出失败: ${err.message}`);
    }
  };

  // 格式化时长
  const formatDuration = (sec: number) => {
    const s = Math.floor(sec || 0);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}分${rem.toString().padStart(2, '0')}秒`;
  };

  // 过滤会议列表
  const filteredMeetings = meetings.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      m.title.toLowerCase().includes(q) ||
      m.speakers.some((sp) => sp.name.toLowerCase().includes(q)) ||
      (m.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex-1 h-full w-full min-h-0 flex flex-col bg-slate-100 overflow-hidden select-none">
      {/* 顶部主工作台状态栏 */}
      <div className="h-12 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-cyan-500 text-white flex items-center justify-center shadow-xs">
              <Mic className="w-4 h-4" />
            </div>
            <span>会议助手 (飞书妙计级)</span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold border border-blue-200">
            音频转写 + 语艺分析
          </span>
        </div>

        {/* 顶部操作按钮 */}
        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => setShowGlossaryModal(true)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-600" />
            <span>专业术语库 ({glossaryTerms.length})</span>
          </button>

          <button
            onClick={() => setShowSettingsModal(true)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5 text-slate-500" />
            <span>转写配置</span>
          </button>

          <button
            onClick={handleImportAudioFile}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-slate-600" />
            <span>导入录音</span>
          </button>

          <button
            onClick={() => setShowRecordModal(true)}
            className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm shadow-blue-500/20 transition-all cursor-pointer"
          >
            <Mic className="w-3.5 h-3.5" />
            <span>实时录制</span>
          </button>
        </div>
      </div>

      {/* 主体三栏布局 */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* 左侧：会议列表栏 */}
        <div className="w-72 border-r border-slate-200 bg-white flex flex-col shrink-0">
          {/* 会议搜索 */}
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="搜索会议标题、参会人..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800"
              />
            </div>
          </div>

          {/* 会议卡片列表 */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {filteredMeetings.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <FileText className="w-8 h-8 mx-auto text-slate-300" />
                <span className="text-xs">暂无会议记录</span>
              </div>
            ) : (
              filteredMeetings.map((item) => {
                const isSelected = item.id === activeMeetingId;
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      setActiveMeetingId(item.id);
                      setCurrentTime(0);
                    }}
                    className={`group p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                      isSelected
                        ? 'bg-blue-50/70 border-blue-300 shadow-2xs ring-1 ring-blue-400/20'
                        : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-start justify-between">
                        <h4 className="text-xs font-bold text-slate-900 line-clamp-1">
                          {item.title}
                        </h4>
                        <button
                          onClick={(e) => handleDeleteMeeting(item.id, e)}
                          title="删除本场会议"
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 p-0.5 rounded transition-opacity cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center space-x-2 text-[11px] text-slate-400">
                        <span className="flex items-center space-x-1">
                          <Calendar className="w-3 h-3" />
                          <span>{new Date(item.date).toLocaleDateString()}</span>
                        </span>
                        <span>·</span>
                        <span className="flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>{formatDuration(item.duration)}</span>
                        </span>
                      </div>
                    </div>

                    {/* 参会人员头像与状态标签 */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100/60 text-[10px]">
                      <div className="flex items-center -space-x-1.5 overflow-hidden">
                        {item.speakers.slice(0, 3).map((sp) => (
                          <div
                            key={sp.id}
                            className="w-5 h-5 rounded-full text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white"
                            style={{ backgroundColor: sp.avatarColor }}
                            title={sp.name}
                          >
                            {sp.name.charAt(0)}
                          </div>
                        ))}
                        {item.speakers.length > 3 && (
                          <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
                            +{item.speakers.length - 3}
                          </div>
                        )}
                      </div>

                      <span
                        className={`px-1.5 py-0.5 rounded-full font-medium ${
                          item.status === 'completed'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                            : item.status === 'transcribing' || item.status === 'summarizing'
                            ? 'bg-blue-50 text-blue-700 animate-pulse'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {item.status === 'completed'
                          ? '已全量分析'
                          : item.status === 'transcribing'
                          ? '转写中...'
                          : item.status === 'summarizing'
                          ? 'AI总结中...'
                          : '待转写'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 中右工作区 */}
        {activeMeeting ? (
          <div className="flex-1 min-w-0 flex flex-col bg-white">
            {/* 会议标题与操作头 */}
            <div className="px-6 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white">
              <div className="space-y-1">
                <div className="flex items-center space-x-2.5">
                  <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                    {activeMeeting.title}
                  </h2>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                    {formatDuration(activeMeeting.duration)}
                  </span>
                </div>

                <div className="flex items-center space-x-2 text-xs text-slate-500">
                  <span>{new Date(activeMeeting.date).toLocaleString()}</span>
                  <span>·</span>
                  <span>参会人: {activeMeeting.speakers.map((s) => s.name).join(', ') || '等待识别'}</span>
                  {activeMeeting.glossaryHitTerms && activeMeeting.glossaryHitTerms.length > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-blue-600 font-medium">
                        命中术语: {activeMeeting.glossaryHitTerms.slice(0, 4).join(', ')}
                        {activeMeeting.glossaryHitTerms.length > 4 && ` 等${activeMeeting.glossaryHitTerms.length}个`}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => triggerTranscription()}
                  disabled={isTranscribing}
                  className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTranscribing ? 'animate-spin text-blue-600' : ''}`} />
                  <span>{isTranscribing ? '转写中...' : '重新转写'}</span>
                </button>

                <button
                  onClick={() => triggerSummarize()}
                  disabled={isSummarizing}
                  className="px-3.5 py-1.5 text-xs rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isSummarizing ? '深度剖析中...' : 'AI 总结与语艺分析'}</span>
                </button>

                <button
                  onClick={handleExportMarkdown}
                  className="p-1.5 text-slate-500 hover:text-slate-800 rounded-xl hover:bg-slate-100 border border-slate-200 cursor-pointer"
                  title="一键导出纪要 Markdown"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 中栏与右栏分割容器 */}
            <div className="flex-1 min-h-0 flex overflow-hidden">
              {/* 中间：逐字逐句转写流 */}
              <div className="flex-1 min-w-[340px] flex flex-col border-r border-slate-200 overflow-hidden">
                <MeetingTranscriptPane
                  segments={activeMeeting.segments}
                  speakers={activeMeeting.speakers}
                  currentTime={currentTime}
                  onSeek={(t) => setCurrentTime(t)}
                  onRenameSpeaker={(spkId, oldName) => {
                    setRenameModal({ speakerId: spkId, oldName });
                    setNewSpeakerName(oldName);
                  }}
                  onOpenGlossaryTerm={() => setShowGlossaryModal(true)}
                  showToast={showToast}
                />
              </div>

              {/* 右侧：AI 分析多标签面板 */}
              <div className="w-[450px] xl:w-[500px] flex flex-col bg-slate-50/50 overflow-hidden shrink-0">
                {/* 选项卡导航 */}
                <div className="h-11 border-b border-slate-200 px-4 flex items-center justify-between bg-white shrink-0">
                  <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-xl text-xs">
                    <button
                      onClick={() => setRightTab('summary')}
                      className={`px-3 py-1 rounded-lg font-medium transition-colors flex items-center space-x-1.5 cursor-pointer ${
                        rightTab === 'summary'
                          ? 'bg-white text-blue-600 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>智能纪要与待办</span>
                    </button>


                    <button
                      onClick={() => setRightTab('tree')}
                      className={`px-3 py-1 rounded-lg font-medium transition-colors flex items-center space-x-1.5 cursor-pointer ${
                        rightTab === 'tree'
                          ? 'bg-white text-indigo-600 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <GitMerge className="w-3.5 h-3.5" />
                      <span>议题树表</span>
                    </button>
                    <button
                      onClick={() => setRightTab('speech_art')}
                      className={`px-3 py-1 rounded-lg font-medium transition-colors flex items-center space-x-1.5 cursor-pointer ${
                        rightTab === 'speech_art'
                          ? 'bg-white text-indigo-600 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Brain className="w-3.5 h-3.5" />
                      <span>语艺洞察</span>
                    </button>

                    <button
                      onClick={() => setRightTab('charts')}
                      className={`px-3 py-1 rounded-lg font-medium transition-colors flex items-center space-x-1.5 cursor-pointer ${
                        rightTab === 'charts'
                          ? 'bg-white text-cyan-600 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span>飞书妙计图表</span>
                    </button>
                  </div>
                </div>

                {/* 选项卡内容区 */}
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  {rightTab === 'summary' && (
                    <MeetingSummaryPane
                      summary={activeMeeting.summary}
                      isSummarizing={isSummarizing}
                      onTriggerSummarize={() => triggerSummarize()}
                      onToggleActionItem={handleToggleActionItem}
                      onExportMarkdown={handleExportMarkdown}
                      showToast={showToast}
                    />
                  )}


                  {rightTab === 'tree' && (
                    <MeetingTopicTreePane
                      tree={activeMeeting.summary?.topicTree}
                      onSeekTime={(t) => setCurrentTime(t)}
                      onTriggerSummarize={() => triggerSummarize()}
                      isSummarizing={isSummarizing}
                    />
                  )}
                  {rightTab === 'speech_art' && (
                    <MeetingSpeechArtPane
                      speechArt={activeMeeting.speechArt}
                      onTriggerSummarize={() => triggerSummarize()}
                      isSummarizing={isSummarizing}
                    />
                  )}

                  {rightTab === 'charts' && (
                    <MeetingChartsPane
                      charts={activeMeeting.charts}
                      duration={activeMeeting.duration}
                      onSeekTime={(t) => setCurrentTime(t)}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* 底栏：飞书妙计音频波形播放器 */}
            <div className="shrink-0">
              <MeetingAudioPlayer
                audioSrc={activeMeeting.audioDataUrl}
                duration={activeMeeting.duration}
                segments={activeMeeting.segments}
                speakers={activeMeeting.speakers}
                currentTime={currentTime}
                onSeek={(t) => setCurrentTime(t)}
                onTimeUpdate={(t) => setCurrentTime(t)}
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 space-y-6">
            <div className="w-16 h-16 rounded-3xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs">
              <Mic className="w-8 h-8" />
            </div>
            <div className="space-y-1.5 max-w-md">
              <h3 className="text-base font-bold text-slate-800">暂无选中的会议记录</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                可通过上方快捷入口开始「现场麦克风录制」或「导入本地音频/视频文件」，由已配置的转写服务识别音频并结合专业术语库处理。
              </p>
            </div>
            <div className="flex items-center space-x-3 pt-1">
              <button
                onClick={() => setShowRecordModal(true)}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center space-x-2 shadow-sm shadow-blue-500/20 transition-all cursor-pointer"
              >
                <Mic className="w-4 h-4" />
                <span>现场麦克风录音</span>
              </button>
              <button
                onClick={handleImportAudioFile}
                className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center space-x-2 border border-slate-200 shadow-2xs transition-all cursor-pointer"
              >
                <Upload className="w-4 h-4 text-slate-500" />
                <span>导入本地录音文件</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 弹窗 1: 专业术语库 */}
      {showGlossaryModal && (
        <MeetingGlossaryModal
          terms={glossaryTerms}
          onClose={() => setShowGlossaryModal(false)}
          onSaveTerm={async (term) => {
            if (window.neoApi?.meetingSaveGlossaryTerm) {
              const updated = await window.neoApi.meetingSaveGlossaryTerm(term);
              setGlossaryTerms(updated);
            }
          }}
          onDeleteTerm={async (id) => {
            if (window.neoApi?.meetingDeleteGlossaryTerm) {
              const updated = await window.neoApi.meetingDeleteGlossaryTerm(id);
              setGlossaryTerms(updated);
            }
          }}
          onResetDefaults={async () => {
            if (window.neoApi?.meetingResetGlossary) {
              const updated = await window.neoApi.meetingResetGlossary();
              setGlossaryTerms(updated);
              showToast?.('success', '已恢复为系统预置术语库');
            }
          }}
          showToast={showToast}
        />
      )}

      {/* 弹窗 2: 现场实时录音 */}
      {showRecordModal && (
        <MeetingRecordModal
          onClose={() => setShowRecordModal(false)}
          onFinishRecording={handleFinishRecording}
          showToast={showToast}
        />
      )}

      {/* 弹窗 3: OpenAI 转写与模型配置 */}
      {showSettingsModal && (
        <MeetingSettingsModal
          onClose={() => setShowSettingsModal(false)}
          onSave={async (settings) => {
            if (window.neoApi?.meetingSaveSettings) {
              await window.neoApi.meetingSaveSettings(settings);
            }
          }}
          showToast={showToast}
        />
      )}

      {/* 弹窗 4: 发言人统一重命名 */}
      {renameModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleRenameSpeakerConfirm}
            className="bg-white rounded-2xl shadow-xl border border-slate-200 p-5 w-full max-w-sm space-y-4 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-900">统一重命名发言人</h4>
              <p className="text-xs text-slate-400">
                将当前发言人「{renameModal.oldName}」在全篇转写与图表中统一更名。
              </p>
            </div>

            <input
              type="text"
              value={newSpeakerName}
              onChange={(e) => setNewSpeakerName(e.target.value)}
              placeholder="例如: 张总 (架构师)"
              className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
              autoFocus
              required
            />

            <div className="flex justify-end space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setRenameModal(null)}
                className="px-3 py-1.5 text-xs text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-medium shadow-xs cursor-pointer"
              >
                确定更名
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
