import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Square, 
  Box, 
  Wrench, 
  Sparkles, 
  CornerDownLeft,
  X
} from 'lucide-react';
import { AiContextEntityRef } from '../../../shared/types';

interface AiInputComposerProps {
  isStreaming: boolean;
  onSend: (text: string, entityRefs?: AiContextEntityRef[]) => void;
  onStop: () => void;
  entityRefs: AiContextEntityRef[];
  onRemoveEntityRef: (apiKey: string) => void;
  onOpenEntityPicker: () => void;
  enableTools: boolean;
  onToggleTools: () => void;
  placeholder?: string;
  quickPrompts?: string[];
}

export const AiInputComposer: React.FC<AiInputComposerProps> = ({
  isStreaming,
  onSend,
  onStop,
  entityRefs,
  onRemoveEntityRef,
  onOpenEntityPicker,
  enableTools,
  onToggleTools,
  placeholder = '输入消息，向 AI 助手提问或让其调用本地工具（Enter 发送，Shift+Enter 换行）...',
  quickPrompts = [],
}) => {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动根据文本高度调整行高
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [text]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (isStreaming) {
      onStop();
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed, entityRefs);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 space-y-2.5">
      {/* 快捷推荐胶囊 (若有) */}
      {quickPrompts.length > 0 && !isStreaming && (
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
          <span className="text-slate-400 shrink-0 flex items-center space-x-1">
            <Sparkles className="w-3 h-3 text-sky-500" />
            <span>推荐提问:</span>
          </span>
          {quickPrompts.slice(0, 4).map((qp, idx) => (
            <button
              key={idx}
              onClick={() => {
                setText(qp);
                textareaRef.current?.focus();
              }}
              className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-sky-50 hover:text-sky-700 text-slate-600 shrink-0 transition-colors border border-transparent hover:border-sky-200"
            >
              {qp}
            </button>
          ))}
        </div>
      )}

      {/* 挂载的对象胶囊列表 */}
      {entityRefs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
          <span className="text-[11px] text-slate-400">已挂载上下文:</span>
          {entityRefs.map((ref) => (
            <span
              key={ref.apiKey}
              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-[11px] font-medium"
            >
              <Box className="w-3 h-3 text-sky-500" />
              <span>@{ref.label} ({ref.apiKey})</span>
              <button
                type="button"
                onClick={() => onRemoveEntityRef(ref.apiKey)}
                className="hover:text-rose-600 rounded-full p-0.5"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* 文本输入区域 */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isStreaming}
          className="w-full resize-none text-xs md:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none max-h-44 overflow-y-auto leading-relaxed bg-transparent"
        />
      </div>

      {/* 底部工具操作条 */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
        <div className="flex items-center space-x-2">
          {/* 挂载对象按钮 */}
          <button
            type="button"
            onClick={onOpenEntityPicker}
            title="选择租户对象将其字段元数据挂载到本次对话"
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:text-sky-700 hover:bg-sky-50 border border-slate-200 hover:border-sky-200 transition-colors"
          >
            <Box className="w-3.5 h-3.5 text-sky-600" />
            <span>@ 引用对象元数据</span>
          </button>

          {/* 本地工具切换开关 */}
          <button
            type="button"
            onClick={onToggleTools}
            title={enableTools ? '已启用销售易本地元数据与 SQL 工具' : '已关闭本地工具'}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
              enableTools
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                : 'bg-slate-50 text-slate-400 border-slate-200 hover:text-slate-600'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>本地工具: {enableTools ? '开启' : '关闭'}</span>
          </button>
        </div>

        {/* 发送 / 停止生成按钮 */}
        <div>
          {isStreaming ? (
            <button
              onClick={onStop}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium shadow-xs transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>停止生成</span>
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!text.trim()}
              className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-xl text-xs font-medium transition-all shadow-xs ${
                text.trim()
                  ? 'bg-sky-600 hover:bg-sky-500 text-white cursor-pointer shadow-sky-600/20'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
              }`}
            >
              <span>发送</span>
              <CornerDownLeft className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
