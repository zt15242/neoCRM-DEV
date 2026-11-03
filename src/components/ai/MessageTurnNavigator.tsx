import React, { useState, useEffect } from 'react';
import { AiChatMessage } from '../../../shared/types';
import { ChevronUp, ChevronDown, User, Bot } from 'lucide-react';

interface MessageTurnNavigatorProps {
  messages: AiChatMessage[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  onJumpToTop: () => void;
  onJumpToBottom: () => void;
}

export const MessageTurnNavigator: React.FC<MessageTurnNavigatorProps> = ({
  messages,
  containerRef,
  onJumpToTop,
  onJumpToBottom,
}) => {
  const [activeMsgId, setActiveMsgId] = useState<string | null>(null);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ top: number; left: number } | null>(null);

  // 滚动监听器 (Scroll Spy)，自动追踪当前可视视口内的消息
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const containerTop = container.getBoundingClientRect().top;
        let currentId: string | null = null;
        let minDistance = Infinity;

        for (const msg of messages) {
          const el = document.getElementById(`msg-${msg.id}`);
          if (el) {
            const rect = el.getBoundingClientRect();
            const distance = Math.abs(rect.top - containerTop - 30);
            if (distance < minDistance) {
              minDistance = distance;
              currentId = msg.id;
            }
          }
        }
        if (currentId) {
          setActiveMsgId(currentId);
        }
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => container.removeEventListener('scroll', handleScroll);
  }, [messages, containerRef]);

  if (!messages || messages.length < 2) return null;

  const handleJump = (msgId: string) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el && containerRef.current) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const hoveredMessage = messages.find((m) => m.id === hoveredMsgId);
  const hoveredIndex = hoveredMessage ? messages.indexOf(hoveredMessage) : -1;

  // 自适应间距
  const isCompact = messages.length > 25;
  const isSuperCompact = messages.length > 50;

  return (
    <div
      aria-label="会话快速定位导轨"
      className="flex flex-col items-center justify-center select-none py-1 h-full max-h-[85vh] relative"
    >
      {/* 跳到顶部 */}
      <button
        type="button"
        onClick={onJumpToTop}
        title="跳至顶部 (Home)"
        className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-full transition-colors cursor-pointer mb-0.5 shrink-0 opacity-60 hover:opacity-100"
      >
        <ChevronUp className="w-3 h-3" />
      </button>

      {/* 刻度柱列表 (对齐 Codex 经典梯形标尺) */}
      <div
        className={`flex flex-col items-center overflow-y-auto overflow-x-hidden max-h-[72vh] py-1 px-0.5 ${
          isSuperCompact ? 'space-y-0.5' : isCompact ? 'space-y-1' : 'space-y-1.5'
        }`}
        style={{ scrollbarWidth: 'none' }}
      >
        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          const isActive = activeMsgId === msg.id;
          const isHovered = hoveredMsgId === msg.id;

          return (
            <div
              key={msg.id}
              onClick={() => handleJump(msg.id)}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setHoveredMsgId(msg.id);
                // 动态锚定到刻度右侧 12px 处，确保绝不压进侧边栏或被任何布局遮挡
                setHoverPos({
                  top: Math.max(50, Math.min(window.innerHeight - 180, rect.top - 16)),
                  left: rect.right + 12,
                });
              }}
              onMouseLeave={() => {
                setHoveredMsgId(null);
                setHoverPos(null);
              }}
              className="py-0.5 px-0.5 cursor-pointer group flex items-center justify-center shrink-0"
            >
              <div
                className={`rounded-full transition-all duration-150 ${
                  isActive
                    ? 'w-3.5 h-[2.5px] bg-sky-500 dark:bg-sky-400 shadow-2xs'
                    : isHovered
                    ? 'w-3 h-[2px] bg-slate-600 dark:bg-slate-300'
                    : isUser
                    ? 'w-2 h-[2px] bg-slate-300 dark:bg-slate-600 group-hover:bg-slate-500'
                    : 'w-1.5 h-[1.5px] bg-slate-200 dark:bg-slate-700 group-hover:bg-slate-400'
                }`}
              />
            </div>
          );
        })}
      </div>

      {/* 跳到底部 */}
      <button
        type="button"
        onClick={onJumpToBottom}
        title="跳至最新消息 (End)"
        className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-full transition-colors cursor-pointer mt-0.5 shrink-0 opacity-60 hover:opacity-100"
      >
        <ChevronDown className="w-3 h-3" />
      </button>

      {/* 悬停预览浮层卡片 (Tooltip) - 绝对位于刻度右侧外区 */}
      {hoveredMessage && hoverPos && (
        <div
          style={{ top: hoverPos.top, left: hoverPos.left }}
          className="fixed w-72 p-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-2xl pointer-events-none z-50 text-xs animate-in fade-in zoom-in-95 duration-100 space-y-1.5"
        >
          {/* 指向刻度的小三角指示 */}
          <span className="absolute -left-1.5 top-4 w-3 h-3 bg-white dark:bg-slate-900 border-l border-t border-slate-200/90 dark:border-slate-800 -rotate-45" />

          <div className="flex items-center justify-between relative z-10">
            <span
              className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                hoveredMessage.role === 'user'
                  ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800'
                  : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
              }`}
            >
              {hoveredMessage.role === 'user' ? (
                <>
                  <User className="w-2.5 h-2.5" />
                  <span>用户提问 · 第 {Math.floor(hoveredIndex / 2) + 1} 轮</span>
                </>
              ) : (
                <>
                  <Bot className="w-2.5 h-2.5" />
                  <span>AI 回复 ({hoveredMessage.modelId || '助手'})</span>
                </>
              )}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">点击跳转</span>
          </div>

          <p className="text-[11px] text-slate-700 dark:text-slate-200 line-clamp-3 leading-relaxed relative z-10">
            {hoveredMessage.content
              ? hoveredMessage.content.slice(0, 120)
              : hoveredMessage.toolCalls && hoveredMessage.toolCalls.length > 0
              ? `调用了 ${hoveredMessage.toolCalls.length} 项工具: ${hoveredMessage.toolCalls.map((t) => t.name).join(', ')}`
              : '（暂无文字内容）'}
          </p>
        </div>
      )}
    </div>
  );
};
