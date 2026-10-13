import React from "react";
import { ApprovalDeployPlan } from "../../../shared/types";
import { FileCheck, ArrowRight, UserCheck, Layers, GitFork, ShieldCheck, Bell } from "lucide-react";

interface ApprovalPlanCardProps {
  plan: ApprovalDeployPlan;
  onOpenConfirm: () => void;
}

export const ApprovalPlanCard: React.FC<ApprovalPlanCardProps> = ({ plan, onOpenConfirm }) => {
  const nodeCount = plan.nodes.length;
  const userTaskCount = plan.nodes.filter((n) => n.nodeType === "UserTask").length;
  const gatewayCount = plan.nodes.filter((n) => n.nodeType === "ExclusiveGateway").length;

  const getWithdrawLabel = (flag?: number) => {
    switch (flag) {
      case 2:
        return "禁止撤回";
      case 3:
        return "仅提交人可撤回";
      default:
        return "全员允许撤回";
    }
  };

  return (
    <div className="my-3 p-4 rounded-2xl border-2 border-indigo-200 bg-gradient-to-r from-indigo-50/70 via-purple-50/40 to-white shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start space-x-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-xs shrink-0 mt-0.5">
            <FileCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h4 className="text-xs md:text-sm font-bold text-slate-900">
                检测到审批流配置方案: {plan.flow.processName}
              </h4>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-semibold border border-indigo-200">
                可代码级部署
              </span>
            </div>

            <p className="text-xs text-slate-500 mt-1">
              主对象: <strong className="text-slate-700">{plan.flow.entityLabel || plan.flow.entityApiKey}</strong> ({plan.flow.entityApiKey}) · 业务类型: <strong className="text-slate-700">{plan.flow.bizTypeLabel || plan.flow.bizTypeApiKey || "默认业务类型"}</strong>
            </p>

            {/* 拓扑元素与策略胶囊 */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-indigo-800 font-medium shadow-2xs flex items-center space-x-1">
                <Layers className="w-3 h-3 text-indigo-600" />
                <span>总节点: {nodeCount}</span>
              </span>

              <span className="text-[11px] px-2 py-0.5 rounded-md bg-white border border-purple-200 text-purple-800 font-medium shadow-2xs flex items-center space-x-1">
                <UserCheck className="w-3 h-3 text-purple-600" />
                <span>人工审批节点: {userTaskCount}</span>
              </span>

              {gatewayCount > 0 && (
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-white border border-sky-200 text-sky-800 font-medium shadow-2xs flex items-center space-x-1">
                  <GitFork className="w-3 h-3 text-sky-600" />
                  <span>网关分支: {gatewayCount}</span>
                </span>
              )}

              <span className="text-[11px] px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 font-medium shadow-2xs flex items-center space-x-1">
                <ShieldCheck className="w-3 h-3 text-slate-500" />
                <span>{getWithdrawLabel(plan.flow.withdrawFlag)}</span>
              </span>

              {plan.flow.sendApprovalNotice === 1 && (
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-white border border-emerald-200 text-emerald-800 font-medium shadow-2xs flex items-center space-x-1">
                  <Bell className="w-3 h-3 text-emerald-600" />
                  <span>通知已开启</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={onOpenConfirm}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold shadow-xs flex items-center space-x-1.5 shrink-0 transition-all hover:scale-102 cursor-pointer"
        >
          <span>一键核对并部署审批流</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
