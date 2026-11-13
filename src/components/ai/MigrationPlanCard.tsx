import React, { useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  Database,
  ExternalLink,
  GitBranch,
  Layers,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { MigrationPlan } from '../../../shared/migrationTypes';

interface MigrationPlanCardProps {
  plan: MigrationPlan;
  onApplyPlan?: (plan: MigrationPlan) => void;
  onOpenWorkspaceTab?: () => void;
}

export const MigrationPlanCard: React.FC<MigrationPlanCardProps> = ({
  plan,
  onApplyPlan,
  onOpenWorkspaceTab,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [applied, setApplied] = useState(false);
  const [saving, setSaving] = useState(false);

  const modeLabel =
    plan.topology.mode === 'n_to_1'
      ? '多 Org 合并 (N → 1)'
      : plan.topology.mode === '1_to_n'
      ? '单 Org 拆分 (1 → N)'
      : '对等迁移 (1 → 1)';

  const totalFields = plan.objects.reduce((acc, o) => acc + (o.fieldMappings?.length || 0), 0);
  const encryptedFields = plan.objects.reduce(
    (acc, o) => acc + (o.fieldMappings?.filter((m) => m.isEncryptedInStage).length || 0),
    0
  );

  const handleApply = async () => {
    setSaving(true);
    try {
      if (window.neoApi?.migrationSavePlan) {
        await window.neoApi.migrationSavePlan(plan);
      }
      setApplied(true);
      onApplyPlan?.(plan);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="my-3 overflow-hidden rounded-2xl border border-indigo-200/90 bg-white shadow-sm transition-all hover:border-indigo-300">
      <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50/80 via-white to-sky-50/80 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
              <ArrowLeftRight size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="truncate text-xs font-bold text-slate-900">{plan.name}</h4>
                <span className="shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                  {modeLabel}
                </span>
                <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  加密沙箱就绪
                </span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-slate-500">
                {plan.description || 'AI 已自动完成依赖拓扑排序与字段清洗方案推导'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {applied ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                  <Check size={14} /> 已保存至工作台工程
                </span>
                {onOpenWorkspaceTab && (
                  <button
                    onClick={onOpenWorkspaceTab}
                    className="inline-flex items-center gap-1 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                  >
                    <span>打开工作台查看</span>
                    <ExternalLink size={12} />
                  </button>
                )}
              </div>
            ) : (
              <button
                disabled={saving}
                onClick={() => void handleApply()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 disabled:opacity-50"
              >
                <Sparkles size={13} />
                <span>一键应用至工作台迁移工程 ➔</span>
              </button>
            )}
            <button
              onClick={() => setExpanded(!expanded)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title={expanded ? '收起详情' : '展开详情'}
            >
              <ChevronDown size={15} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-slate-100 bg-slate-50/50 p-3 sm:grid-cols-4 text-xs">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-indigo-600 shrink-0" />
          <div>
            <div className="text-[10px] text-slate-400">对象编排</div>
            <div className="font-semibold text-slate-800">{plan.objects.length} 个对象</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Database size={14} className="text-emerald-600 shrink-0" />
          <div>
            <div className="text-[10px] text-slate-400">中转存储</div>
            <div className="font-semibold text-slate-800">{plan.mongoConfig.mode === 'local' ? '本地 Mongo' : '远程集群'}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-sky-600 shrink-0" />
          <div>
            <div className="text-[10px] text-slate-400">清洗规则</div>
            <div className="font-semibold text-slate-800">{totalFields} 个字段</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-purple-600 shrink-0" />
          <div>
            <div className="text-[10px] text-slate-400">信封加密</div>
            <div className="font-semibold text-slate-800">{encryptedFields} 个敏感字段</div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="p-3 text-xs space-y-2">
          <div className="text-[11px] font-semibold text-slate-700">对象执行泳道与两阶段外键装配清单：</div>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/40">
            {plan.objects.map((obj) => (
              <div key={obj.id} className="flex flex-wrap items-center justify-between p-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-indigo-700">
                    Wave {obj.wave} · #{obj.executionOrder}
                  </span>
                  <span className="font-mono font-semibold text-slate-800">{obj.sourceEntity}</span>
                  <span className="text-slate-400">→</span>
                  <span className="font-mono text-slate-700">{obj.targetEntity}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  {obj.twoPassLookup && (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                      两阶段外键: {obj.primaryLookupFields?.join('、') || '自引用'}
                    </span>
                  )}
                  <span>{obj.fieldMappings.length} 字段</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
