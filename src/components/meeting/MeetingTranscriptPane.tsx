import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Filter,
  Play,
  Copy,
  Check,
  Edit2,
  BookOpen,
  HelpCircle,
  ExternalLink,
  ChevronDown,
  Sparkles,
  ArrowDownCircle,
} from 'lucide-react';
import { MeetingSegment, MeetingSpeaker, MatchedTermInfo } from '../../../shared/meetingTypes';

interface MeetingTranscriptPaneProps {
  segments: MeetingSegment[];
  speakers: MeetingSpeaker[];
  currentTime: number;
  onSeek: (time: number) => void;
  onRenameSpeaker: (speakerId: string, oldName: string) => void;
  onOpenGlossaryTerm?: (termName: string) => void;
  showToast?: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const MeetingTranscriptPane: React.FC<MeetingTranscriptPaneProps> = ({
  segments,
  speakers,
  currentTime,
  onSeek,
  onRenameSpeaker,
  onOpenGlossaryTerm,
  showToast,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpeakerFilter, setSelectedSpeakerFilter] = useState<string>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 活跃术语弹窗预览
  const [activeTermPopover, setActiveTermPopover] = useState<{
    term: MatchedTermInfo;
    x: number;
    y: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeSegmentRef = useRef<HTMLDivElement | null>(null);

  const formatTime = (seconds: number) => {
    const s = Math.floor(seconds || 0);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    const h = Math.floor(m / 60);
    const minRem = m % 60;
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${minRem.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  // 复制单句文本
  const copyText = (segId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(segId);
    showToast?.('success', '已复制本句转写文本');
    setTimeout(() => setCopiedId(null), 1500);
  };

  // 过滤片段
  const filteredSegments = segments.filter((seg) => {
    const matchesSpeaker =
      selectedSpeakerFilter === 'all' ||
      seg.speakerId === selectedSpeakerFilter ||
      seg.speakerName === selectedSpeakerFilter;
    const matchesSearch =
      !searchQuery.trim() ||
      seg.text.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
      seg.speakerName.toLowerCase().includes(searchQuery.toLowerCase().trim());
    return matchesSpeaker && matchesSearch;
  });

  // 当前播放所在片段
  const currentActiveSegId = segments.find(
    (s) => currentTime >= s.startTime && currentTime <= s.endTime
  )?.id;

  // 自动滚动到正在播放的片段
  useEffect(() => {
    if (autoScroll && activeSegmentRef.current && containerRef.current) {
      activeSegmentRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [currentActiveSegId, autoScroll]);

  // 点击空白处关闭术语 Popover
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest('.term-popover-trigger')) return;
      setActiveTermPopover(null);
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // 渲染带有专业术语高亮的逐字稿文本
  const renderTextWithHighlightedTerms = (text: string, matchedTerms: MatchedTermInfo[] = []) => {
    if (!matchedTerms || matchedTerms.length === 0) {
      return <span>{text}</span>;
    }

    // 建立正向正则匹配
    const termNames = matchedTerms.map((m) => m.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${termNames.join('|')})`, 'gi');
    const parts = text.split(regex);

    return (
      <span>
        {parts.map((part, idx) => {
          const matched = matchedTerms.find((m) => m.term.toLowerCase() === part.toLowerCase());
          if (matched) {
            return (
              <span
                key={idx}
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setActiveTermPopover({
                    term: matched,
                    x: rect.left,
                    y: rect.bottom + 4,
                  });
                }}
                className="term-popover-trigger inline-flex items-center px-1 py-0.5 mx-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200/80 font-medium text-[13px] hover:bg-blue-100 hover:text-blue-900 cursor-pointer transition-colors shadow-2xs"
                title={`点击查看术语解析: ${matched.term}`}
              >
                <BookOpen className="w-3 h-3 mr-0.5 text-blue-500" />
                {part}
              </span>
            );
          }
          return <span key={idx}>{part}</span>;
        })}
      </span>
    );
  };

  return (
    <div className="flex-1 h-full min-h-0 flex flex-col bg-slate-50/60 overflow-hidden relative">
      {/* 顶部搜索与发言人筛选栏 */}
      <div className="px-5 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-2xs z-10">
        <div className="flex items-center space-x-3 flex-1 min-w-[240px]">
          {/* 搜索框 */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索发言逐字稿、术语或姓名..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
            />
            {searchQuery && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-mono">
                {filteredSegments.length} 条结果
              </span>
            )}
          </div>

          {/* 发言人下拉筛选 */}
          <div className="relative">
            <select
              value={selectedSpeakerFilter}
              onChange={(e) => setSelectedSpeakerFilter(e.target.value)}
              className="appearance-none bg-slate-50 border border-slate-200 text-slate-700 text-xs py-1.5 pl-3 pr-8 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">全部发言人 ({segments.length}句)</option>
              {speakers.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.name} ({sp.talkRatio}%)
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* 右侧跟随播放开关 */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`px-2.5 py-1 text-xs rounded-lg border flex items-center space-x-1.5 transition-colors cursor-pointer ${
              autoScroll
                ? 'bg-blue-50 text-blue-700 border-blue-200 font-medium'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <ArrowDownCircle className={`w-3.5 h-3.5 ${autoScroll ? 'text-blue-600' : 'text-slate-400'}`} />
            <span>跟随播放</span>
          </button>
        </div>
      </div>

      {/* 逐字稿流水流式滚动区 */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {filteredSegments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400 space-y-2">
            <Search className="w-8 h-8 text-slate-300" />
            <span className="text-xs">未找到符合搜索条件的逐字稿记录</span>
          </div>
        ) : (
          filteredSegments.map((seg) => {
            const isActive = seg.id === currentActiveSegId;
            const speaker = speakers.find((sp) => sp.id === seg.speakerId || sp.name === seg.speakerName);
            const avatarColor = speaker?.avatarColor || '#3b82f6';
            const initial = seg.speakerName.charAt(0) || '发';

            return (
              <div
                key={seg.id}
                ref={isActive ? activeSegmentRef : null}
                className={`group relative p-4 rounded-xl transition-all duration-200 border ${
                  isActive
                    ? 'bg-blue-50/50 border-blue-300 shadow-sm ring-1 ring-blue-400/20'
                    : 'bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-2xs'
                }`}
              >
                {/* 顶部说话人与时间栏 */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2.5">
                    {/* 头像 */}
                    <div
                      className="w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center shadow-xs"
                      style={{ backgroundColor: avatarColor }}
                    >
                      {initial}
                    </div>

                    {/* 发言人姓名与改名按钮 */}
                    <div className="flex items-center space-x-1.5">
                      <span className="text-sm font-semibold text-slate-900">{seg.speakerName}</span>
                      <button
                        onClick={() => onRenameSpeaker(seg.speakerId, seg.speakerName)}
                        title="点击统一修改此发言人名称"
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-100 transition-opacity cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    </div>

                    {/* 角色与语气微标签 */}
                    {seg.toneLabel && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60 font-medium">
                        {seg.toneLabel}
                      </span>
                    )}
                  </div>

                  {/* 右侧：起止时间戳胶囊 (点击立即播放) */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => onSeek(seg.startTime)}
                      title="点击跳转音频播放"
                      className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-slate-500 font-mono text-[11px] transition-colors cursor-pointer"
                    >
                      <Play className="w-2.5 h-2.5 fill-current text-blue-600" />
                      <span>
                        {formatTime(seg.startTime)} - {formatTime(seg.endTime)}
                      </span>
                    </button>

                    {/* 复制本句 */}
                    <button
                      onClick={() => copyText(seg.id, seg.text)}
                      title="复制本句"
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 transition-opacity cursor-pointer"
                    >
                      {copiedId === seg.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* 逐字稿正文 (含专业术语高亮) */}
                <div className="text-[13.5px] leading-relaxed text-slate-800 pl-9.5">
                  {renderTextWithHighlightedTerms(seg.text, seg.matchedTerms)}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 专业术语悬浮解释 Popover */}
      {activeTermPopover && (
        <div
          className="fixed z-50 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-3.5 text-xs animate-in fade-in zoom-in-95 duration-100"
          style={{
            left: Math.min(window.innerWidth - 300, activeTermPopover.x),
            top: activeTermPopover.y,
          }}
        >
          <div className="flex items-center justify-between mb-1.5 pb-1.5 border-b border-slate-100">
            <div className="flex items-center space-x-1.5">
              <BookOpen className="w-3.5 h-3.5 text-blue-600" />
              <span className="font-bold text-slate-900 text-sm">{activeTermPopover.term.term}</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
              {activeTermPopover.term.category}
            </span>
          </div>

          <p className="text-slate-600 leading-relaxed mb-2">
            {activeTermPopover.term.explanation}
          </p>

          <div className="flex justify-between items-center pt-1 text-[11px] text-slate-400 border-t border-slate-50">
            <span>专业术语库已注入 Whisper Prompt</span>
            {onOpenGlossaryTerm && (
              <button
                onClick={() => {
                  onOpenGlossaryTerm(activeTermPopover.term.term);
                  setActiveTermPopover(null);
                }}
                className="text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
              >
                管理术语库 →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
