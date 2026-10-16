import React, { useState } from 'react';
import { ClipboardCheck, CheckCircle2, ArrowRight, Edit3, ChevronDown, ChevronUp } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';

interface PlanReviewCardProps {
  plan: string;
  isAnswered?: boolean;
  onApprove: () => void;
  onReject?: (feedback: string) => void;
}

export const PlanReviewCard: React.FC<PlanReviewCardProps> = ({
  plan,
  isAnswered = false,
  onApprove,
  onReject,
}) => {
  const [expanded, setExpanded] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);

  if (isAnswered) {
    return (
      <div className="my-3 p-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/40 text-xs flex items-center justify-between text-emerald-900">
        <div className="flex items-center space-x-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">✓ 方案规划已获审阅批准，已进入工程执行阶段</span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[11px] text-emerald-700 hover:text-emerald-900 flex items-center space-x-1 cursor-pointer font-medium"
        >
          <span>{expanded ? '收起方案' : '查看获批方案'}</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>
    );
  }

  return (
    <div className="my-3 rounded-2xl border-2 border-indigo-200/90 bg-gradient-to-br from-indigo-50/60 via-sky-50/30 to-white p-4 shadow-sm space-y-3">
      {/* 头部条带 */}
      <div className="flex items-center justify-between pb-2 border-b border-indigo-100">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
            <ClipboardCheck className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
              <span>📋 实施方案规划评审 (DSH Plan Review)</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] bg-indigo-100 text-indigo-700 font-medium">Plan Mode 待审</span>
            </h4>
            <p className="text-[10px] text-slate-500">智能体已完成技术分析与方案构想，请评审批准后开始执行</p>
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center space-x-1 cursor-pointer font-medium"
        >
          <span>{expanded ? '收起详情' : '展开方案'}</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* 方案全文展示区 */}
      {expanded && (
        <div className="p-3 bg-white/90 rounded-xl border border-indigo-100 text-xs text-slate-700 max-h-96 overflow-y-auto leading-relaxed select-text">
          <MarkdownRenderer content={plan} />
        </div>
      )}

      {/* 提出修改建议输入区 */}
      {showFeedbackInput && !isAnswered && (
        <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200 space-y-2">
          <div className="text-xs font-semibold text-amber-900">请指出方案需要修改的地方：</div>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="例如：审批人改为财务主管，主对象仅限制在销售合同，增加折扣率判断..."
            className="w-full h-16 p-2 rounded-lg border border-amber-300 bg-white text-xs text-slate-800 focus:outline-none focus:border-amber-500"
          />
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => setShowFeedbackInput(false)}
              className="px-3 py-1 rounded-lg text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={() => {
                if (feedback.trim()) {
                  onReject?.(feedback.trim());
                  setShowFeedbackInput(false);
                }
              }}
              className="px-3 py-1 rounded-lg text-xs bg-amber-600 text-white hover:bg-amber-500 cursor-pointer font-medium"
            >
              提交修改建议
            </button>
          </div>
        </div>
      )}

      {/* 底部确认操作按钮 */}
      {!isAnswered && (
        <div className="pt-2 flex items-center justify-between border-t border-indigo-100">
          <button
            type="button"
            onClick={() => setShowFeedbackInput(!showFeedbackInput)}
            className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center space-x-1 cursor-pointer transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5 text-slate-500" />
            <span>要求修改方案</span>
          </button>

          <button
            type="button"
            onClick={onApprove}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition-all hover:scale-102 cursor-pointer"
          >
            <span>✓ 批准并执行方案</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
