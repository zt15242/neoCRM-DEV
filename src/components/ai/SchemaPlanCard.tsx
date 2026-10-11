import React from 'react';
import { SchemaPlanPayload } from '../../../shared/types';
import { Box, Sparkles, Layers, ArrowRight, CheckCircle2 } from 'lucide-react';

interface SchemaPlanCardProps {
  plan: SchemaPlanPayload;
  onOpenConfirm: () => void;
}

export const SchemaPlanCard: React.FC<SchemaPlanCardProps> = ({ plan, onOpenConfirm }) => {
  return (
    <div className="my-3 p-4 rounded-2xl border-2 border-indigo-200 bg-gradient-to-r from-indigo-50/70 via-sky-50/50 to-white shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start space-x-3">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-indigo-600 to-sky-600 text-white shadow-xs shrink-0 mt-0.5">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h4 className="text-xs md:text-sm font-bold text-slate-900">
                检测到数据模型规划方案: {plan.entity.label} ({plan.entity.apiKey})
              </h4>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold border border-indigo-200">
                可一键部署
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              包含 <strong>{plan.fields.length}</strong> 个业务字段规划。点击右侧按钮可在当前销售易租户中自动化完成对象注册与字段建表。
            </p>

            {/* 字段预览标签 */}
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {plan.fields.slice(0, 6).map((f) => (
                <span
                  key={f.apiKey}
                  className="text-[11px] px-2 py-0.5 rounded-md bg-white border border-indigo-100 text-slate-700 font-medium shadow-2xs"
                >
                  {f.label} <span className="font-mono text-slate-400 text-[10px]">({f.typeName})</span>
                </span>
              ))}
              {plan.fields.length > 6 && (
                <span className="text-[11px] px-2 py-0.5 text-slate-400">
                  +{plan.fields.length - 6} 个字段...
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={onOpenConfirm}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-xs flex items-center space-x-1.5 shrink-0 transition-all hover:scale-102 cursor-pointer"
        >
          <span>一键创建对象与字段</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
