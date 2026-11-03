import React, { useState } from 'react';
import { BrainCircuit, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';

interface ReasoningBoxProps {
  reasoningContent: string;
  isStreaming?: boolean;
  hasContent?: boolean;
  durationMs?: number;
}

export const ReasoningBox: React.FC<ReasoningBoxProps> = ({
  reasoningContent,
  isStreaming = false,
  hasContent = false,
  durationMs,
}) => {
  const [expanded, setExpanded] = useState(true);

  if (!reasoningContent) return null;

  const isStillThinking = isStreaming && !hasContent;

  return (
    <div className="mb-3 rounded-xl border border-indigo-200/80 bg-indigo-50/40 dark:bg-indigo-950/20 dark:border-indigo-500/30 overflow-hidden transition-all shadow-2xs">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3.5 py-2 text-xs font-medium text-indigo-800 dark:text-indigo-300 hover:bg-indigo-100/50 dark:hover:bg-indigo-950/40 transition-colors cursor-pointer"
      >
        <div className="flex items-center space-x-2">
          <div className={`p-1 rounded-md ${isStillThinking ? 'bg-indigo-600 text-white animate-pulse' : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/60 dark:text-indigo-300'}`}>
            <BrainCircuit className="w-3.5 h-3.5" />
          </div>
          <span className="font-semibold">
            {isStillThinking ? '正在深度思考推理中...' : '已深度思考 (DeepSeek Thought Process)'}
          </span>
          {durationMs ? (
            <span className="text-[11px] text-indigo-500 dark:text-indigo-400 font-mono">
              ({(durationMs / 1000).toFixed(1)}s)
            </span>
          ) : (
            <span className="text-[11px] text-indigo-400 dark:text-indigo-400">
              ({reasoningContent.length} 字)
            </span>
          )}
        </div>
        <div className="flex items-center space-x-1 text-indigo-500 dark:text-indigo-400">
          <span className="text-[11px]">{expanded ? '收起思考' : '展开思考'}</span>
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3.5 pb-3 pt-2 border-t border-indigo-100/80 dark:border-indigo-900/50 text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-sans whitespace-pre-wrap max-h-72 overflow-y-auto bg-white/70 dark:bg-slate-900/70 select-text">
          {reasoningContent}
          {isStillThinking && (
            <span className="inline-block w-1.5 h-3.5 ml-1 bg-indigo-500 animate-pulse align-middle" />
          )}
        </div>
      )}
    </div>
  );
};
