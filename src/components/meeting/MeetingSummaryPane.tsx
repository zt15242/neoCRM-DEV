import React, { useState } from 'react';
import {
  FileText,
  Target,
  GitBranch,
  XCircle,
  CheckCircle2,
  Circle,
  Clock,
  User,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
  Download,
  Share2,
  Calendar,
  Layers,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { MeetingSummary, MeetingActionItem } from '../../../shared/meetingTypes';

interface MeetingSummaryPaneProps {
  summary?: MeetingSummary;
  isSummarizing?: boolean;
  onTriggerSummarize: () => void;
  onToggleActionItem: (actionId: string) => void;
  onExportMarkdown: () => void;
  showToast?: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const MeetingSummaryPane: React.FC<MeetingSummaryPaneProps> = ({
  summary,
  isSummarizing = false,
  onTriggerSummarize,
  onToggleActionItem,
  onExportMarkdown,
  showToast,
}) => {
  const [copied, setCopied] = useState(false);
  const [actionFilter, setActionFilter] = useState<'all' | 'pending' | 'completed'>('all');

  const copyMarkdown = () => {
    if (!summary) return;
    const lines: string[] = [];
    lines.push('### 会议核心要旨');
    lines.push(summary.executiveSummary);
    lines.push('');
    lines.push('### 关键决议');
    summary.keyDecisions.forEach((d, i) => lines.push(`${i + 1}. ${d.content}`));
    lines.push('');
    lines.push('### 落实待办清单');
    summary.actionItems.forEach((a) => {
      const mark = a.completed ? '[x]' : '[ ]';
      lines.push(`- ${mark} ${a.task} (@${a.assignee}) [${a.priority.toUpperCase()}] 截止: ${a.dueDate || '尽快'}`);
    });

    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    showToast?.('success', '已复制核心纪要与待办清单');
    setTimeout(() => setCopied(false), 2000);
  };

  if (!summary) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-inner">
          <Sparkles className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-slate-800">尚未生成智能会议纪要</h4>
          <p className="text-xs text-slate-400 max-w-xs">
            由大模型全自动提炼核心议题、关键决策与待办清单，对标飞书妙计体验。
          </p>
        </div>
        <button
          onClick={onTriggerSummarize}
          disabled={isSummarizing}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center space-x-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
        >
          {isSummarizing ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          <span>{isSummarizing ? 'AI 深度总结中...' : '立即提炼智能纪要'}</span>
        </button>
      </div>
    );
  }

  const filteredActions = summary.actionItems.filter((item) => {
    if (actionFilter === 'pending') return !item.completed;
    if (actionFilter === 'completed') return item.completed;
    return true;
  });

  const completedCount = summary.actionItems.filter((i) => i.completed).length;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
      {/* 顶部操作工具栏 */}
      <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
        <div className="flex items-center space-x-2 text-xs text-slate-500">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <span className="font-medium text-slate-700">AI 智能纪要</span>
          {summary.modelUsed && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200/60">
              {summary.modelUsed}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={copyMarkdown}
            className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? '已复制' : '复制纪要'}</span>
          </button>

          <button
            onClick={onExportMarkdown}
            className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>导出文档</span>
          </button>

          <button
            onClick={onTriggerSummarize}
            disabled={isSummarizing}
            title="重新驱动大模型分析"
            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-blue-600 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSummarizing ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* 1. 核心要旨与宏观态势 */}
      <div className="bg-gradient-to-br from-blue-50/70 via-indigo-50/30 to-white rounded-2xl p-5 border border-blue-100 shadow-xs space-y-3">
        <div className="flex items-center space-x-2 text-blue-900 font-bold text-sm">
          <FileText className="w-4 h-4 text-blue-600" />
          <span>核心要旨与宏观决议速览</span>
        </div>
        <p className="text-[13.5px] leading-relaxed text-slate-700 font-normal">
          {summary.executiveSummary}
        </p>
      </div>
      {/* 战略背景研判与宏观商业目标 */}
      {summary.strategicContext && (
        <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-xs space-y-2">
          <div className="flex items-center space-x-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
            <Target className="w-4 h-4" />
            <span>战略背景研判与宏观商业目标 (麦肯锡级)</span>
          </div>
          <p className="text-xs text-slate-200 leading-relaxed font-light">
            {summary.strategicContext}
          </p>
        </div>
      )}


      {/* 2. 关键决议项 */}
      {summary.keyDecisions && summary.keyDecisions.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>本次会议正式决议 ({summary.keyDecisions.length}项)</span>
          </div>
          <div className="space-y-2.5">
            {summary.keyDecisions.map((dec, i) => (
              <div
                key={dec.id}
                className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 hover:border-slate-200 transition-all space-y-1"
              >
                <div className="flex items-start space-x-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <div className="space-y-0.5">
                    <span className="text-[13.5px] font-semibold text-slate-800 leading-snug">
                      {dec.content}
                    </span>
                    {dec.context && (
                      <p className="text-xs text-slate-500 leading-relaxed">
                        背景与权衡: {dec.context}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. 待办事项清单 (可交互勾选) */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
            <Clock className="w-4 h-4 text-blue-600" />
            <span>落实待办任务 ({completedCount}/{summary.actionItems.length})</span>
          </div>

          {/* 筛选标签 */}
          <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg text-[11px]">
            <button
              onClick={() => setActionFilter('all')}
              className={`px-2 py-0.5 rounded font-medium transition-colors cursor-pointer ${
                actionFilter === 'all' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-500'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => setActionFilter('pending')}
              className={`px-2 py-0.5 rounded font-medium transition-colors cursor-pointer ${
                actionFilter === 'pending' ? 'bg-white text-blue-600 shadow-xs font-bold' : 'text-slate-500'
              }`}
            >
              未完成
            </button>
            <button
              onClick={() => setActionFilter('completed')}
              className={`px-2 py-0.5 rounded font-medium transition-colors cursor-pointer ${
                actionFilter === 'completed' ? 'bg-white text-emerald-600 shadow-xs font-bold' : 'text-slate-500'
              }`}
            >
              已落实
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {filteredActions.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              无符合条件的待办事项
            </div>
          ) : (
            filteredActions.map((act) => {
              const isHigh = act.priority === 'high';
              const isMed = act.priority === 'medium';
              return (
                <div
                  key={act.id}
                  onClick={() => onToggleActionItem(act.id)}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                    act.completed
                      ? 'bg-slate-50/60 border-slate-200/60 opacity-60'
                      : 'bg-white border-slate-200/80 hover:border-blue-300 hover:shadow-2xs'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <button className="text-slate-400 hover:text-blue-600 cursor-pointer shrink-0">
                      {act.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 fill-emerald-50" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </button>
                    <span
                      className={`text-xs text-slate-800 leading-normal truncate ${
                        act.completed ? 'line-through text-slate-400' : 'font-medium'
                      }`}
                    >
                      {act.task}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0 text-[11px]">
                    {/* 优先级 */}
                    <span
                      className={`px-1.5 py-0.5 rounded font-semibold text-[10px] ${
                        isHigh
                          ? 'bg-rose-50 text-rose-700 border border-rose-200/80'
                          : isMed
                          ? 'bg-amber-50 text-amber-700 border border-amber-200/80'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {act.priority.toUpperCase()}
                    </span>

                    {/* 责任人 */}
                    <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      <User className="w-3 h-3 text-slate-400" />
                      <span className="truncate max-w-[80px]">{act.assignee}</span>
                    </span>

                    {/* 截止时间 */}
                    {act.dueDate && (
                      <span className="flex items-center space-x-1 text-slate-400">
                        <Calendar className="w-3 h-3" />
                        <span>{act.dueDate}</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 4. 分议题讨论拆解 */}
      {summary.topics && summary.topics.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
            <Layers className="w-4 h-4 text-indigo-600" />
            <span>分议题讨论纪要 ({summary.topics.length}个主议程)</span>
          </div>
          <div className="space-y-3">
            {summary.topics.map((topic) => (
              <div
                key={topic.id}
                className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-100 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">{topic.title}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white text-slate-500 border border-slate-200">
                    {topic.timeRange}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  主要发言人: {topic.speakers.join(', ')}
                </div>
                <ul className="space-y-1 pl-4 list-disc text-xs text-slate-600 leading-relaxed">
                  {topic.keyPoints.map((pt, idx) => (
                    <li key={idx}>{pt}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. 潜在风险与预警 */}
      {summary.risksAndBlockers && summary.risksAndBlockers.length > 0 && (
        <div className="bg-amber-50/50 rounded-2xl p-5 border border-amber-200/80 shadow-xs space-y-3">
          <div className="flex items-center space-x-2 text-amber-900 font-bold text-sm">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
            <span>潜在风险与应对预警</span>
          </div>
          <div className="space-y-2.5">
            {summary.risksAndBlockers.map((r) => (
              <div key={r.id} className="text-xs space-y-1">
                <div className="font-semibold text-amber-950 flex items-center space-x-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <span>{r.risk}</span>
                </div>
                <p className="text-amber-800/90 pl-3 leading-relaxed">
                  建议应对: {r.suggestion}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
