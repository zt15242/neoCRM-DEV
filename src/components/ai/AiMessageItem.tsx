import React, { useState, useMemo } from 'react';
import { AiChatMessage, SchemaPlanPayload, WorkflowDeployPlan, ApprovalDeployPlan } from '../../../shared/types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ReasoningBox } from './ReasoningBox';
import { ToolCallCard } from './ToolCallCard';
import { InlineSqlResultTable } from './InlineSqlResultTable';
import { extractSchemaPlanFromText } from './schemaPlanHelper';
import { SchemaPlanCard } from './SchemaPlanCard';
import { extractWorkflowPlanFromText } from './workflowPlanHelper';
import { WorkflowPlanCard } from "./WorkflowPlanCard";
import { InlineDecisionCard } from "./InlineDecisionCard";
import { MessageArtifactsCard } from "./MessageArtifactsCard";
import { extractDecisionsFromText, extractDecisionsFromToolCalls, DecisionRequestPayload } from "./decisionHelper";
import { PlanReviewCard } from "./PlanReviewCard";
import { Copy, Check, CheckCircle2, Sparkles, Box, AlertTriangle, Paperclip } from 'lucide-react';

interface AiMessageItemProps {
  message: AiChatMessage;
  isStreamingCurrent?: boolean;
  isLastMessage?: boolean;
  projectPath?: string;
  onOpenCreateSchema?: (plan: SchemaPlanPayload) => void;
  onOpenDeployWorkflow?: (plan: WorkflowDeployPlan) => void;
  onOpenDeployApproval?: (plan: ApprovalDeployPlan) => void;
  onOpenArtifactsPanel?: () => void;
  onSendMessage?: (text: string) => void;
  showToast?: (type: 'success' | 'error' | 'info', text: string) => void;
}

const AiMessageItemComponent: React.FC<AiMessageItemProps> = ({
  message,
  isStreamingCurrent = false,
  isLastMessage = false,
  projectPath,
  onOpenCreateSchema,
  onOpenDeployWorkflow,
  onOpenDeployApproval,
  onOpenArtifactsPanel,
  onSendMessage,
  showToast,
}) => {

  const [copied, setCopied] = useState(false);
  const [activeExecutedSql, setActiveExecutedSql] = useState<string | null>(null);

  const handleCopy = async () => {
    let ok = false;
    try {
      if (window.neoApi?.clipboardWriteText) {
        await window.neoApi.clipboardWriteText(message.content);
        ok = true;
      }
    } catch {}
    if (!ok && navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(message.content);
        ok = true;
      } catch {}
    }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = message.content;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        ok = true;
      } catch {}
    }
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

  // 关键性能优化：使用 useMemo 缓存开销巨大的全文本正则表达式扫描
  const toolCallDecisions = useMemo(() => {
    return !isStreamingCurrent ? extractDecisionsFromToolCalls(message.toolCalls) : null;
  }, [isStreamingCurrent, message.toolCalls]);

  const textDecisions = useMemo(() => {
    return !isStreamingCurrent && message.content ? extractDecisionsFromText(message.content) : null;
  }, [isStreamingCurrent, message.content]);

  const detectedDecisions = toolCallDecisions || textDecisions;
  const hasPendingDecisions = Boolean(detectedDecisions && detectedDecisions.items.length > 0);

  // 检测是否包含 exit_plan_mode 呈交的实施方案
  const exitPlanCall = useMemo(() => {
    return !isStreamingCurrent ? message.toolCalls?.find((tc) => tc.name === 'exit_plan_mode') : null;
  }, [isStreamingCurrent, message.toolCalls]);
  const planMarkdown = (exitPlanCall?.arguments?.plan as string) || null;

  // 检测是否包含可执行的数据建模方案
  const detectedPlan = useMemo(() => {
    return !isStreamingCurrent && message.content ? extractSchemaPlanFromText(message.content) : null;
  }, [isStreamingCurrent, message.content]);

  const detectedWorkflowPlan = useMemo(() => {
    return !isStreamingCurrent && message.content ? extractWorkflowPlanFromText(message.content) : null;
  }, [isStreamingCurrent, message.content]);

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
        <div className="bg-white rounded-2xl rounded-tl-xs border border-slate-200/80 p-4 shadow-2xs select-text">
          {message.content ? (
            <>
              <MarkdownRenderer
                content={message.content}
                onExecuteSql={(sql) => setActiveExecutedSql(sql)}
                onOpenDeployWorkflow={onOpenDeployWorkflow}
                onOpenDeployApproval={onOpenDeployApproval}
                suppressDeploymentCards={hasPendingDecisions}
              />

              {/* DSH 实施方案规划评审卡片 (exit_plan_mode) */}
              {planMarkdown && (
                <PlanReviewCard
                  plan={planMarkdown}
                  isAnswered={!isLastMessage}
                  onApprove={() => onSendMessage?.('我已审核并批准该方案，请严格按照上述实施方案开始自动执行并部署！')}
                  onReject={(feedback) => onSendMessage?.(feedback ? `我对方案有修改意见：${feedback}` : '我对方案有修改要求，请根据我的最新意图调整规划')}
                />
              )}

              {/* 当存在待决策确认项时，直接内联渲染交互式选项卡片（完全非弹窗式），并在确认前严格抑制部署卡片 */}
              {hasPendingDecisions && detectedDecisions && (
                <InlineDecisionCard
                  decisionData={detectedDecisions}
                  isAnswered={!isLastMessage}
                  onSubmit={(confirmedText) => {
                    if (onSendMessage) {
                      onSendMessage(confirmedText);
                    }
                  }}
                />
              )}

              {/* 智能提取并展示生成的产物文件卡片 (完全对齐用户截图设计) */}
              {!isStreamingCurrent && (
                <MessageArtifactsCard
                  content={message.content}
                  toolCalls={message.toolCalls}
                  projectPath={projectPath}
                  onOpenArtifactsPanel={onOpenArtifactsPanel}
                  showToast={showToast}
                />
              )}
            </>
          ) : isStreamingCurrent ? (
            <div className="flex items-center space-x-2 py-1 text-slate-400 text-xs">
              <span className="inline-block w-2 h-2 rounded-full bg-sky-500 animate-ping" />
              <span>正在组织语言生成中...</span>
            </div>
          ) : message.toolCalls && message.toolCalls.length > 0 ? (
            <div className="flex items-center justify-between py-1 text-xs text-slate-600">
              <span className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>已执行完成上述 {message.toolCalls.length} 项工具操作</span>
              </span>
              {onSendMessage && isLastMessage && (
                <button
                  type="button"
                  onClick={() => onSendMessage('请结合上述工具执行结果，给出完整详尽的总结分析与最终答复。')}
                  className="px-3 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                >
                  继续输出总结 ➔
                </button>
              )}
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

export const AiMessageItem = React.memo(AiMessageItemComponent, (prevProps, nextProps) => {
  // 关键渲染优化：只要消息状态未发生变化，彻底跳过历史消息的无谓重绘
  if (prevProps.isStreamingCurrent !== nextProps.isStreamingCurrent) return false;
  if (prevProps.isLastMessage !== nextProps.isLastMessage) return false;
  if (prevProps.message.id !== nextProps.message.id) return false;
  if (prevProps.message.content !== nextProps.message.content) return false;
  if (prevProps.message.reasoningContent !== nextProps.message.reasoningContent) return false;
  if (prevProps.message.error !== nextProps.message.error) return false;
  if ((prevProps.message.toolCalls?.length || 0) !== (nextProps.message.toolCalls?.length || 0)) return false;
  return true;
});
