import React, { useState } from 'react';
import { AiChatMessage, SchemaPlanPayload, WorkflowDeployPlan, ApprovalDeployPlan } from '../../../shared/types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ReasoningBox } from './ReasoningBox';
import { ToolCallCard } from './ToolCallCard';
import { InlineSqlResultTable } from './InlineSqlResultTable';
import { extractSchemaPlanFromText } from './schemaPlanHelper';
import { SchemaPlanCard } from './SchemaPlanCard';
import { extractWorkflowPlanFromText } from './workflowPlanHelper';
import { WorkflowPlanCard } from './WorkflowPlanCard';
import { Copy, Check, Sparkles, Box, AlertTriangle, Paperclip } from 'lucide-react';

interface AiMessageItemProps {
  message: AiChatMessage;
  isStreamingCurrent?: boolean;
  onOpenCreateSchema?: (plan: SchemaPlanPayload) => void;
  onOpenDeployWorkflow?: (plan: WorkflowDeployPlan) => void;
  onOpenDeployApproval?: (plan: ApprovalDeployPlan) => void;
}

export const AiMessageItem: React.FC<AiMessageItemProps> = ({
  message,
  isStreamingCurrent = false,
  onOpenCreateSchema,
  onOpenDeployWorkflow,
  onOpenDeployApproval,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeExecutedSql, setActiveExecutedSql] = useState<string | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end my-4 pl-12">
        <div className="max-w-[85%] md:max-w-[75%] space-y-1.5">
          {((message.entityRefs && message.entityRefs.length > 0) || (message.attachments && message.attachments.length > 0)) && (
            <div className="flex flex-wrap gap-1.5 justify-end">
              {message.attachments?.map((att) => (
                <span
                  key={att.id}
                  title={att.summaryText || att.name}
                  className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-medium border border-emerald-200"
                >
                  <Paperclip className="w-3 h-3 text-emerald-600" />
                  <span>{att.name} ({(att.size / 1024).toFixed(0)}KB)</span>
                </span>
              ))}
              {message.entityRefs?.map((ref) => (
                <span
                  key={ref.apiKey}
                  className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-sky-100/90 text-sky-800 text-[11px] font-medium border border-sky-200"
                >
                  <Box className="w-3 h-3 text-sky-600" />
                  <span>@{ref.label} ({ref.apiKey})</span>
                </span>
              ))}
            </div>
          )}

          <div className="bg-sky-600 text-white rounded-2xl rounded-tr-xs px-4 py-2.5 shadow-xs text-xs md:text-sm leading-relaxed whitespace-pre-wrap selection:bg-sky-400">
            {message.content}
          </div>
          <div className="text-[10px] text-slate-400 text-right pr-1">
            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    );
  }

  // 检测是否包含可执行的数据建模方案
  const detectedPlan = !isStreamingCurrent && message.content ? extractSchemaPlanFromText(message.content) : null;
  const detectedWorkflowPlan = !isStreamingCurrent && message.content ? extractWorkflowPlanFromText(message.content) : null;

  return (
    <div className="flex items-start space-x-3 my-4 pr-12">
      {/* 助手头像 */}
      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-600 via-indigo-600 to-purple-500 flex items-center justify-center text-white shrink-0 shadow-xs mt-0.5">
        <Sparkles className="w-4 h-4" />
      </div>

      <div className="flex-1 max-w-full space-y-2">
        {/* 顶部模型标识与时间 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-xs text-slate-800">
              {message.modelId || 'AI 智能助手'}
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 border border-slate-200 font-mono">
              Harness
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopy}
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              title="复制回答"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <span className="text-[10px] text-slate-400">
              {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>

        {/* 错误提示 */}
        {message.error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
            <div className="flex-1 leading-relaxed">{message.error}</div>
          </div>
        )}

        {/* 深度思考面板 (DeepSeek-R1 Thought Process) */}
        {message.reasoningContent && (
          <ReasoningBox
            reasoningContent={message.reasoningContent}
            isStreaming={isStreamingCurrent}
            hasContent={!!message.content}
            durationMs={message.reasoningDurationMs}
          />
        )}

        {/* Harness Tool Calls 轨迹 */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-1.5 my-2">
            {message.toolCalls.map((tc) => (
              <ToolCallCard key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        {/* 正文 Markdown 渲染 */}
        <div className="bg-white rounded-2xl rounded-tl-xs border border-slate-200/80 p-4 shadow-2xs">
          {message.content ? (
            <MarkdownRenderer
              content={message.content}
              onExecuteSql={(sql) => setActiveExecutedSql(sql)}
              onOpenDeployWorkflow={onOpenDeployWorkflow}
              onOpenDeployApproval={onOpenDeployApproval}
            />
          ) : isStreamingCurrent ? (
            <div className="flex items-center space-x-2 py-1 text-slate-400 text-xs">
              <span className="inline-block w-2 h-2 rounded-full bg-sky-500 animate-ping" />
              <span>正在组织语言生成中...</span>
            </div>
          ) : (
            <div className="text-slate-400 text-xs italic">无回答内容</div>
          )}

          {/* 打字机光标 */}
          {isStreamingCurrent && message.content && (
            <span className="inline-block w-2 h-4 ml-1 bg-sky-500 animate-pulse align-middle" />
          )}

          {/* 内联执行 SQL 数据展示 */}
          {activeExecutedSql && (
            <InlineSqlResultTable
              sql={activeExecutedSql}
              onClose={() => setActiveExecutedSql(null)}
            />
          )}

          {/* 数据模型方案确认与一键建表卡片 */}
          {detectedPlan && onOpenCreateSchema && (
            <SchemaPlanCard
              plan={detectedPlan}
              onOpenConfirm={() => onOpenCreateSchema(detectedPlan)}
            />
          )}


        </div>
      </div>
    </div>
  );
};
