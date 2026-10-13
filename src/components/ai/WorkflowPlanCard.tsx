import React from 'react';
import { WorkflowDeployPlan } from '../../../shared/types';
import { Workflow, ArrowRight, Play, Layers, ShieldCheck, Database, Repeat, Split } from 'lucide-react';

interface WorkflowPlanCardProps {
  plan: WorkflowDeployPlan;
  onOpenConfirm: () => void;
}

export const WorkflowPlanCard: React.FC<WorkflowPlanCardProps> = ({ plan, onOpenConfirm }) => {
  const nodeCount = plan.nodes.length;
  const actionCount = plan.nodes.filter((n) => n.nodeType === 'ServiceTask').length;
  const queryCount = plan.nodes.filter((n) => n.nodeType === 'QueryLog').length;
  const loopCount = plan.nodes.filter((n) => n.nodeType === 'Loop').length;
  const varCount = plan.variables.length;

  // 触发方式文字解析
  const getExecuteTypeLabel = (typeStr: string) => {
    const map: Record<string, string> = {
      '1': '创建记录',
      '2': '编辑记录',
      '5': '平台事件',
      '6': '页面按钮',
      '7': '智能体操作',
    };
    return typeStr
      .split(',')
      .map((t) => map[t.trim()] || t.trim())
      .join('、');
  };

  return (
    <div className="my-3 p-4 rounded-2xl border-2 border-teal-200 bg-gradient-to-r from-teal-50/70 via-emerald-50/40 to-white shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start space-x-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-teal-600 to-emerald-600 text-white shadow-xs shrink-0 mt-0.5">
            <Workflow className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h4 className="text-xs md:text-sm font-bold text-slate-900">
                检测到自动流程配置方案: {plan.flow.processName}
              </h4>
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

        <button
          onClick={onOpenConfirm}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-xs font-semibold shadow-xs flex items-center space-x-1.5 shrink-0 transition-all hover:scale-102 cursor-pointer"
        >
          <span>一键核对并部署自动流程</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
