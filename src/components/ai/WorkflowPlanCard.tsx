import React, { useState } from "react";
import { WorkflowDeployPlan } from "../../../shared/types";
import { 
  Workflow, 
  ArrowRight, 
  Play, 
  Layers, 
  ShieldCheck, 
  Database, 
  Repeat, 
  CheckCircle2, 
  FileText,
  Check,
  ChevronDown,
  RotateCcw
} from "lucide-react";

interface WorkflowPlanCardProps {
  plan: WorkflowDeployPlan;
  onOpenConfirm: () => void;
}

export const WorkflowPlanCard: React.FC<WorkflowPlanCardProps> = ({ plan, onOpenConfirm }) => {
  // 核心用户确认状态：未确认前保持草案折叠态，不完全展示为深绿部署卡片
  const [isConfirmed, setIsConfirmed] = useState(false);

  const nodeCount = plan.nodes.length;
  const actionCount = plan.nodes.filter((n) => n.nodeType === "ServiceTask").length;
  const queryCount = plan.nodes.filter((n) => n.nodeType === "QueryLog").length;
  const loopCount = plan.nodes.filter((n) => n.nodeType === "Loop").length;
  const varCount = plan.variables.length;

  const getExecuteTypeLabel = (typeStr: string) => {
    const map: Record<string, string> = {
      "1": "创建记录",
      "2": "编辑记录",
      "5": "平台事件",
      "6": "页面按钮",
      "7": "智能体操作",
    };
    return typeStr
      .split(",")
      .map((t) => map[t.trim()] || t.trim())
      .join("、");
  };

  // ================= 状态 1: 未确认草案态 (低调浅色条，不完全出现) =================
  if (!isConfirmed) {
    return (
      <div className="my-3 p-3.5 rounded-2xl border border-slate-200 bg-slate-50/90 hover:bg-slate-50 hover:border-teal-200 transition-all shadow-2xs">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="p-2 rounded-xl bg-slate-200 text-slate-700 shrink-0">
              <FileText className="w-4 h-4 text-slate-600" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h4 className="text-xs font-bold text-slate-800 truncate">
                  自动流程设计草案待确认: {plan.flow.processName}
                </h4>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold border border-amber-200 shrink-0">
                  待核对确认
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate mt-0.5">
                主对象: <strong className="text-slate-700">{plan.flow.entityLabel || plan.flow.entityApiKey}</strong> ({plan.flow.entityApiKey}) · 请核对上方待确认清单，确认无误后点击右侧解锁部署
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={() => setIsConfirmed(true)}
              className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition-all hover:scale-102 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>核对无误，确认并解锁部署 ➔</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ================= 状态 2: 用户已确认态 (完全展开为全量绿色部署卡片) =================
  return (
    <div className="my-3 p-4 rounded-2xl border-2 border-teal-300 bg-gradient-to-r from-teal-50/80 via-emerald-50/50 to-white shadow-xs animate-in fade-in zoom-in-98 duration-150">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start space-x-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-teal-600 to-emerald-600 text-white shadow-xs shrink-0 mt-0.5">
            <Workflow className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h4 className="text-xs md:text-sm font-bold text-slate-900">
                自动流程方案已确认就绪: {plan.flow.processName}
              </h4>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold border border-emerald-200 flex items-center space-x-1">
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                <span>方案已核验</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 font-semibold border border-teal-200">
                可代码级部署
              </span>
            </div>

            <p className="text-xs text-slate-500 mt-1">
              主对象: <strong className="text-slate-700">{plan.flow.entityLabel || plan.flow.entityApiKey}</strong> ({plan.flow.entityApiKey}) · 触发入口: <strong className="text-slate-700">{getExecuteTypeLabel(plan.flow.executeType)}</strong>
            </p>

            {/* 拓扑元素与变量特性胶囊 */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-white border border-teal-200 text-teal-800 font-medium shadow-2xs flex items-center space-x-1">
                <Layers className="w-3 h-3 text-teal-600" />
                <span>总节点: {nodeCount}</span>
              </span>

              {actionCount > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-white border border-emerald-200 text-emerald-800 font-medium shadow-2xs flex items-center space-x-1">
                  <Play className="w-3 h-3 text-emerald-600" />
                  <span>执行动作: {actionCount}</span>
                </span>
              )}

              {queryCount > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-white border border-sky-200 text-sky-800 font-medium shadow-2xs flex items-center space-x-1">
                  <Database className="w-3 h-3 text-sky-600" />
                  <span>查询记录: {queryCount}</span>
                </span>
              )}

              {loopCount > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-white border border-amber-200 text-amber-800 font-medium shadow-2xs flex items-center space-x-1">
                  <Repeat className="w-3 h-3 text-amber-600" />
                  <span>循环批处理: {loopCount}</span>
                </span>
              )}

              {varCount > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-indigo-800 font-medium shadow-2xs">
                  变量: {varCount} 项
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={() => setIsConfirmed(false)}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-xl transition-colors cursor-pointer"
            title="撤回确认，重新核对"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onOpenConfirm}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition-all hover:scale-102 cursor-pointer"
          >
            <span>进入向导核对并确认部署</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
