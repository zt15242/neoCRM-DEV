import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  CheckCircle2,
  Clock3,
  Database,
  FileSearch,
  GitBranch,
  Layers,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import type {
  MigrationAuditRecord,
  MigrationConnectorRef,
  MigrationFieldMapping,
  MigrationMongoStatus,
  MigrationObjectConfig,
  MigrationPlan,
  MigrationProgressMetrics,
  MigrationReconciliationReport,
  MigrationTopologyMode,
} from '../../../../shared/migrationTypes';
import type { WorkspaceDataSources, WorkspaceWidget, WorkspaceWidgetType } from '../../../../shared/workspaceTypes';

interface MigrationWidgetProps {
  widget: WorkspaceWidget;
  sources: WorkspaceDataSources;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
  onUpdateWidget?: (next: WorkspaceWidget) => void;
}

export function createDefaultMigrationPlan(name = '新数据迁移工程'): MigrationPlan {
  const now = Date.now();
  return {
    id: `mig_${now}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    description: '支持多 Org 合并 (N→1)、拆分 (1→N)、MongoDB 加密缓冲与异步增量割接',
    topology: {
      mode: 'n_to_1',
      name,
      sources: [],
      targets: [],
    },
    mongoConfig: {
      mode: 'local',
      uri: 'mongodb://127.0.0.1:27017',
      database: 'neocrm_migration',
      useTls: false,
      maxPoolSize: 20,
    },
    schedule: {
      mode: 'manual',
      intervalMinutes: 60,
      cronExpr: '0 2 * * *',
      highWatermarkField: 'updatedAt',
      clockSkewBufferSeconds: 300,
      enabled: false,
      notifyOnComplete: true,
      notifyOnFailure: true,
    },
    objects: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function buildFullMigrationSuiteWidgets(planId: string, projectId?: string): WorkspaceWidget[] {
  const mk = (type: WorkspaceWidgetType, title: string, columnSpan: 1 | 2 | 3 | 4, height: 320 | 480 | 640 | 800): WorkspaceWidget => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    title,
    columnSpan,
    height,
    projectId,
    migrationPlanId: planId,
  });
  return [
    mk('migration-progress-dashboard', '迁移进度看板与异步作业监控', 4, 480),
    mk('migration-topology', '多连接器拓扑 (N→1 / 1→N)', 2, 480),
    mk('migration-database', 'MongoDB 中转存储与安全加密', 2, 480),
    mk('migration-object-sequencer', '对象依赖拓扑与波次编排', 2, 640),
    mk('migration-field-rules', '字段清洗管道与敏感字段加密', 2, 640),
    mk('migration-scheduler', '增量水位线与定时调度控制', 2, 480),
    mk('migration-audit-board', '全链路日志与一致性对账审计', 2, 480),
  ];
}

// Shared lightweight hook for synchronizing MigrationPlan state across sibling widgets
const planSubscribers = new Map<string, Set<(plan: MigrationPlan) => void>>();
function notifyPlanSubscribers(plan: MigrationPlan) {
  planSubscribers.get(plan.id)?.forEach((fn) => fn(plan));
}

function useSharedMigrationPlan(
  widget: WorkspaceWidget,
  showToast: (type: 'success' | 'error' | 'info', text: string) => void,
  onUpdateWidget?: (next: WorkspaceWidget) => void
) {
  const [plans, setPlans] = useState<MigrationPlan[]>([]);
  const [plan, setPlan] = useState<MigrationPlan | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      const list = (await window.neoApi.migrationListPlans?.()) || [];
      setPlans(list);
      const selected =
        (widget.migrationPlanId ? list.find((p) => p.id === widget.migrationPlanId) : null) ||
        list[0] ||
        null;
      setPlan(selected);
    } catch (err: any) {
      showToast('error', err?.message || '加载迁移工程配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [widget.migrationPlanId]);

  useEffect(() => {
    if (!plan?.id) return;
    if (!planSubscribers.has(plan.id)) planSubscribers.set(plan.id, new Set());
    const set = planSubscribers.get(plan.id)!;
    const listener = (updated: MigrationPlan) => setPlan(updated);
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }, [plan?.id]);

  const savePlan = async (next: MigrationPlan) => {
    try {
      const saved = await window.neoApi.migrationSavePlan?.(next);
      if (saved) {
        setPlan(saved);
        setPlans((prev) => [saved, ...prev.filter((p) => p.id !== saved.id)]);
        notifyPlanSubscribers(saved);
        if (widget.migrationPlanId !== saved.id && onUpdateWidget) {
          onUpdateWidget({ ...widget, migrationPlanId: saved.id });
        }
      }
      return saved;
    } catch (err: any) {
      showToast('error', err?.message || '保存迁移配置失败');
      return null;
    }
  };

  const createPlan = async () => {
    const fresh = createDefaultMigrationPlan(`迁移工程 ${plans.length + 1}`);
    const saved = await savePlan(fresh);
    if (saved) showToast('success', `已创建迁移工程：${saved.name}`);
  };

  return { plans, plan, setPlan, loading, reload, savePlan, createPlan };
}

const PlanHeaderBar: React.FC<{
  plans: MigrationPlan[];
  plan: MigrationPlan | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}> = ({ plans, plan, onSelect, onCreate }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2 text-xs">
    <div className="flex items-center gap-2">
      <span className="font-medium text-slate-600">迁移工程</span>
      <select
        value={plan?.id || ''}
        onChange={(e) => onSelect(e.target.value)}
        className="max-w-52 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
      >
        {plans.length === 0 && <option value="">暂无迁移工程</option>}
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
    <button
      onClick={onCreate}
      className="inline-flex items-center gap-1 rounded border border-sky-200 bg-white px-2 py-1 text-[11px] font-medium text-sky-700 hover:bg-sky-50"
    >
      <Plus size={12} /> 新建工程
    </button>
  </div>
);

export const MigrationWidgetRenderer: React.FC<MigrationWidgetProps> = ({
  widget,
  sources,
  showToast,
  onUpdateWidget,
}) => {
  const { plans, plan, loading, reload, savePlan, createPlan } = useSharedMigrationPlan(widget, showToast, onUpdateWidget);

  const selectPlan = (id: string) => {
    const target = plans.find((p) => p.id === id);
    if (target && onUpdateWidget) {
      onUpdateWidget({ ...widget, migrationPlanId: target.id });
    }
    void reload();
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center text-xs text-slate-400">正在加载迁移组件…</div>;
  }

  if (!plan) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <ArrowLeftRight size={28} className="text-slate-300" />
        <div className="text-sm font-medium text-slate-700">尚未绑定数据迁移工程</div>
        <p className="max-w-xs text-xs text-slate-500">创建一个迁移工程后，工作台中的各组件将自动联动共享拓扑与 MongoDB 存储配置。</p>
        <button
          onClick={() => void createPlan()}
          className="inline-flex items-center gap-1.5 rounded bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-800"
        >
          <Plus size={14} /> 创建迁移工程
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PlanHeaderBar plans={plans} plan={plan} onSelect={selectPlan} onCreate={() => void createPlan()} />
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {widget.type === 'migration-topology' && (
          <TopologyPanel plan={plan} sources={sources} onSave={savePlan} showToast={showToast} />
        )}
        {widget.type === 'migration-database' && (
          <DatabasePanel plan={plan} onSave={savePlan} showToast={showToast} />
        )}
        {widget.type === 'migration-object-sequencer' && (
          <ObjectSequencerPanel plan={plan} onSave={savePlan} showToast={showToast} />
        )}
        {widget.type === 'migration-field-rules' && (
          <FieldRulesPanel plan={plan} onSave={savePlan} showToast={showToast} />
        )}
        {widget.type === 'migration-scheduler' && (
          <SchedulerPanel plan={plan} onSave={savePlan} showToast={showToast} />
        )}
        {widget.type === 'migration-progress-dashboard' && (
          <ProgressDashboardPanel plan={plan} showToast={showToast} />
        )}
        {widget.type === 'migration-audit-board' && (
          <AuditBoardPanel plan={plan} showToast={showToast} />
        )}
      </div>
    </div>
  );
};

// ==================== 1. Topology Widget ====================
const TopologyPanel: React.FC<{
  plan: MigrationPlan;
  sources: WorkspaceDataSources;
  onSave: (p: MigrationPlan) => Promise<MigrationPlan | null | undefined>;
  showToast: (t: 'success' | 'error' | 'info', msg: string) => void;
}> = ({ plan, sources, onSave, showToast }) => {
  const mode = plan.topology.mode;

  const setMode = (nextMode: MigrationTopologyMode) => {
    void onSave({ ...plan, topology: { ...plan.topology, mode: nextMode } });
  };

  const addConnector = (role: 'source' | 'target', accountId: string) => {
    const acc = sources.crmAccounts.find((a) => a.accountId === accountId);
    if (!acc) return;
    const ref: MigrationConnectorRef = {
      accountId: acc.accountId,
      connectorId: acc.connectorId,
      connectorName: acc.connectorName,
      productType: acc.productType,
      tenantName: acc.tenantName,
      role,
    };
    const key = role === 'source' ? 'sources' : 'targets';
    if (plan.topology[key].some((c) => c.accountId === acc.accountId)) return;
    const updatedList =
      (role === 'target' && mode === 'n_to_1') || (role === 'source' && mode === '1_to_n') || mode === '1_to_1'
        ? [ref]
        : [...plan.topology[key], ref];
    void onSave({ ...plan, topology: { ...plan.topology, [key]: updatedList } });
    showToast('success', `已添加${role === 'source' ? '源端' : '目标端'}连接器：${acc.connectorName}`);
  };

  const removeConnector = (role: 'source' | 'target', accountId: string) => {
    const key = role === 'source' ? 'sources' : 'targets';
    void onSave({
      ...plan,
      topology: { ...plan.topology, [key]: plan.topology[key].filter((c) => c.accountId !== accountId) },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {([
          { id: 'n_to_1', label: '多 Org 合并 (N → 1)' },
          { id: '1_to_n', label: '单 Org 拆分 (1 → N)' },
          { id: '1_to_1', label: '对等迁移 (1 → 1)' },
        ] as const).map((item) => (
          <button
            key={item.id}
            onClick={() => setMode(item.id)}
            className={`rounded border px-2.5 py-1.5 text-xs font-medium ${
              mode === item.id ? 'border-sky-600 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {(['source', 'target'] as const).map((role) => {
          const list = role === 'source' ? plan.topology.sources : plan.topology.targets;
          return (
            <div key={role} className="rounded border border-slate-200 bg-slate-50/50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  {role === 'source' ? '源端连接器 (Source Orgs)' : '目标端连接器 (Target Orgs)'}
                </span>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addConnector(role, e.target.value);
                  }}
                  className="max-w-36 rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px]"
                >
                  <option value="">+ 绑定连接器</option>
                  {sources.crmAccounts.map((acc) => (
                    <option key={acc.accountId} value={acc.accountId}>
                      {acc.connectorName} ({acc.productType})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                {list.length === 0 && (
                  <div className="rounded border border-dashed border-slate-200 bg-white py-4 text-center text-[11px] text-slate-400">
                    尚未绑定连接器
                  </div>
                )}
                {list.map((c) => (
                  <div key={c.accountId} className="flex items-center justify-between rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-800">{c.connectorName}</div>
                      <div className="text-[11px] text-slate-400">
                        {c.productType} {c.tenantName ? `· ${c.tenantName}` : ''}
                      </div>
                    </div>
                    <button
                      onClick={() => removeConnector(role, c.accountId)}
                      className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ==================== 2. MongoDB Storage Widget ====================
const DatabasePanel: React.FC<{
  plan: MigrationPlan;
  onSave: (p: MigrationPlan) => Promise<MigrationPlan | null | undefined>;
  showToast: (t: 'success' | 'error' | 'info', msg: string) => void;
}> = ({ plan, onSave, showToast }) => {
  const [cfg, setCfg] = useState(plan.mongoConfig);
  const [status, setStatus] = useState<MigrationMongoStatus | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setCfg(plan.mongoConfig);
  }, [plan.id]);

  const handleTest = async () => {
    setTesting(true);
    try {
      const saved = await onSave({ ...plan, mongoConfig: cfg });
      const res = await window.neoApi.migrationTestMongoConnection?.(cfg, saved?.id || plan.id);
      if (res) {
        setStatus(res);
        showToast(res.connected ? 'success' : 'error', res.connected ? `MongoDB 连通 (${res.latencyMs}ms)` : res.error || '连接失败');
      }
    } finally {
      setTesting(false);
    }
  };

  const handlePurge = async () => {
    if (!window.confirm('确认执行中转库安全碎纸清理？此操作将彻底删除暂存集合与映射历史，不可恢复！')) return;
    try {
      const res = await window.neoApi.migrationPurgeStagingData?.(plan.id);
      showToast('success', `已安全清空 ${res?.droppedCollections.length || 0} 个暂存集合`);
    } catch (err: any) {
      showToast('error', err?.message || '清理失败');
    }
  };

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center gap-2">
        {(['local', 'remote'] as const).map((m) => (
          <button
            key={m}
            onClick={() =>
              setCfg({
                ...cfg,
                mode: m,
                uri: m === 'local' ? 'mongodb://127.0.0.1:27017' : cfg.uri,
                useTls: m === 'remote',
              })
            }
            className={`rounded border px-2.5 py-1.5 font-medium ${
              cfg.mode === m ? 'border-sky-600 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            {m === 'local' ? '本地 MongoDB' : '远程集群 MongoDB'}
          </button>
        ))}
        <span className="ml-auto inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
          <ShieldCheck size={12} /> safeStorage + AES-256-GCM 保护
        </span>
      </div>

      <label className="block">
        <span className="font-medium text-slate-700">连接 URI（保存后自动系统级加密脱敏）</span>
        <input
          value={cfg.uri}
          onChange={(e) => setCfg({ ...cfg, uri: e.target.value })}
          placeholder="mongodb://user:pass@host:27017"
          className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="font-medium text-slate-700">中转库名</span>
          <input
            value={cfg.database}
            onChange={(e) => setCfg({ ...cfg, database: e.target.value })}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
          />
        </label>
        <label className="block">
          <span className="font-medium text-slate-700">连接池并发上限</span>
          <input
            type="number"
            min={5}
            max={100}
            value={cfg.maxPoolSize}
            onChange={(e) => setCfg({ ...cfg, maxPoolSize: Number(e.target.value) || 20 })}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-slate-700">
        <input type="checkbox" checked={cfg.useTls} onChange={(e) => setCfg({ ...cfg, useTls: e.target.checked })} />
        强制启用 TLS/SSL 加密通道
      </label>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          disabled={testing}
          onClick={() => void handleTest()}
          className="inline-flex items-center gap-1.5 rounded bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-800 disabled:opacity-50"
        >
          <Database size={13} /> {testing ? '探测中…' : '保存并测试连接'}
        </button>
        <button
          onClick={() => void handlePurge()}
          className="inline-flex items-center gap-1.5 rounded border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
        >
          <Trash2 size={13} /> 安全碎纸清空
        </button>
      </div>

      {status && (
        <div
          className={`rounded border p-2.5 text-[11px] ${
            status.connected ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {status.connected
            ? `已连接 ${status.database} · 延迟 ${status.latencyMs}ms · 现有集合 ${status.collectionsCount || 0} 个 · 数据量 ${((status.totalDataSizeBytes || 0) / 1024 / 1024).toFixed(2)} MB`
            : `连接失败：${status.error}`}
        </div>
      )}
    </div>
  );
};

// ==================== 3. Object Sequencer Widget (1,000+ Objects + Wave + DAG) ====================
const ObjectSequencerPanel: React.FC<{
  plan: MigrationPlan;
  onSave: (p: MigrationPlan) => Promise<MigrationPlan | null | undefined>;
  showToast: (t: 'success' | 'error' | 'info', msg: string) => void;
}> = ({ plan, onSave, showToast }) => {
  const [search, setSearch] = useState('');
  const [waveFilter, setWaveFilter] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...plan.objects]
      .sort((a, b) => a.wave - b.wave || a.executionOrder - b.executionOrder)
      .filter((o) => (!waveFilter || o.wave === waveFilter) && (!q || o.sourceEntity.toLowerCase().includes(q) || o.targetEntity.toLowerCase().includes(q)));
  }, [plan.objects, search, waveFilter]);

  const syncFromSource = async () => {
    const src = plan.topology.sources[0];
    const tgt = plan.topology.targets[0];
    if (!src || !tgt) {
      showToast('error', '请先在拓扑组件中绑定至少一个源端和目标端连接器');
      return;
    }
    setBusy(true);
    try {
      const objectsMeta = (await window.neoApi.migrationFetchConnectorObjects?.(src.accountId)) || [];
      if (!objectsMeta.length) {
        showToast('info', '未从源端获取到对象元数据');
        return;
      }
      const dagSorted = (await window.neoApi.migrationComputeDagSequence?.(objectsMeta)) || [];
      const existingBySrc = new Map(plan.objects.map((o) => [o.sourceEntity.toLowerCase(), o]));

      const merged: MigrationObjectConfig[] = dagSorted.map((node, idx) => {
        const prev = existingBySrc.get(node.entityApiKey.toLowerCase());
        return (
          prev || {
            id: `obj_${node.entityApiKey}_${idx}`,
            sourceEntity: node.entityApiKey,
            targetEntity: node.entityApiKey,
            sourceConnectorId: src.accountId,
            targetConnectorId: tgt.accountId,
            wave: node.wave,
            executionOrder: node.executionOrder,
            enabled: node.wave <= 3,
            twoPassLookup: node.twoPassLookup,
            primaryLookupFields: node.primaryLookupFields,
            fieldMappings: [],
            batchSize: 1000,
            concurrency: 4,
          }
        );
      });
      await onSave({ ...plan, objects: merged });
      showToast('success', `已同步并完成 ${merged.length} 个对象的加密沙箱 DAG 拓扑排序`);
    } catch (err: any) {
      showToast('error', err?.message || '同步对象清单失败');
    } finally {
      setBusy(false);
    }
  };

  const runDagReorder = async () => {
    if (!plan.objects.length) return;
    setBusy(true);
    try {
      const meta = plan.objects.map((o) => ({
        entityApiKey: o.sourceEntity,
        wave: o.wave,
        lookups: (o.primaryLookupFields || []).map((f) => ({ field: f, targetEntity: o.targetEntity })),
      }));
      const dagSorted = (await window.neoApi.migrationComputeDagSequence?.(meta)) || [];
      const orderMap = new Map(dagSorted.map((d) => [d.entityApiKey, d]));
      const next = plan.objects.map((o) => {
        const info = orderMap.get(o.sourceEntity);
        return info
          ? { ...o, wave: info.wave, executionOrder: info.executionOrder, twoPassLookup: info.twoPassLookup }
          : o;
      });
      await onSave({ ...plan, objects: next });
      showToast('success', '已重新计算波次与依赖执行顺序');
    } finally {
      setBusy(false);
    }
  };

  const moveOrder = (id: string, delta: number) => {
    const sorted = [...plan.objects].sort((a, b) => a.wave - b.wave || a.executionOrder - b.executionOrder);
    const idx = sorted.findIndex((o) => o.id === id);
    const swapIdx = idx + delta;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
    const temp = sorted[idx];
    sorted[idx] = sorted[swapIdx];
    sorted[swapIdx] = temp;
    const reindexed = sorted.map((o, i) => ({ ...o, executionOrder: i + 1 }));
    void onSave({ ...plan, objects: reindexed });
  };

  const patchObject = (id: string, patch: Partial<MigrationObjectConfig>) => {
    void onSave({
      ...plan,
      objects: plan.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    });
  };

  const addCustomObject = () => {
    const src = plan.topology.sources[0]?.accountId || '';
    const tgt = plan.topology.targets[0]?.accountId || '';
    const next: MigrationObjectConfig = {
      id: `obj_${Date.now()}`,
      sourceEntity: 'account',
      targetEntity: 'account',
      sourceConnectorId: src,
      targetConnectorId: tgt,
      wave: 2,
      executionOrder: plan.objects.length + 1,
      enabled: true,
      twoPassLookup: true,
      primaryLookupFields: ['parentAccountId'],
      fieldMappings: [],
      batchSize: 1000,
      concurrency: 4,
    };
    void onSave({ ...plan, objects: [...plan.objects, next] });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <button
          disabled={busy}
          onClick={() => void syncFromSource()}
          className="inline-flex items-center gap-1 rounded bg-sky-700 px-2.5 py-1.5 font-medium text-white hover:bg-sky-800 disabled:opacity-50"
        >
          <RefreshCw size={12} /> 拉取并 DAG 排序
        </button>
        <button
          disabled={busy || !plan.objects.length}
          onClick={() => void runDagReorder()}
          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <GitBranch size={12} /> 重算依赖
        </button>
        <button
          onClick={addCustomObject}
          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 hover:bg-slate-50"
        >
          <Plus size={12} /> 手动加对象
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`搜索对象 (共 ${plan.objects.length} 个)…`}
          className="min-w-36 flex-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs"
        />
        <select
          value={waveFilter}
          onChange={(e) => setWaveFilter(Number(e.target.value))}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
        >
          <option value={0}>全部波次 ({plan.objects.length})</option>
          <option value={1}>Wave 1 · 基础维表</option>
          <option value={2}>Wave 2 · 核心主数据</option>
          <option value={3}>Wave 3 · 交易单据</option>
          <option value={4}>Wave 4 · 流水明细</option>
        </select>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-auto pr-1">
        {filtered.slice(0, 120).map((obj) => (
          <div key={obj.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-white px-2.5 py-1.5">
            <input
              type="checkbox"
              checked={obj.enabled}
              onChange={(e) => patchObject(obj.id, { enabled: e.target.checked })}
            />
            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
              W{obj.wave} · #{obj.executionOrder}
            </span>
            <input
              value={obj.sourceEntity}
              onChange={(e) => patchObject(obj.id, { sourceEntity: e.target.value })}
              className="w-28 rounded border border-slate-200 px-1.5 py-0.5 font-mono text-[11px]"
              title="源对象 API Key"
            />
            <span className="text-slate-400">→</span>
            <input
              value={obj.targetEntity}
              onChange={(e) => patchObject(obj.id, { targetEntity: e.target.value })}
              className="w-28 rounded border border-slate-200 px-1.5 py-0.5 font-mono text-[11px]"
              title="目标对象 API Key"
            />
            <label className="inline-flex items-center gap-1 text-[11px] text-slate-600" title="第一阶段先插主干，第二阶段补外键">
              <input
                type="checkbox"
                checked={obj.twoPassLookup}
                onChange={(e) => patchObject(obj.id, { twoPassLookup: e.target.checked })}
              />
              两阶段外键
            </label>
            <div className="ml-auto flex items-center gap-0.5">
              <button onClick={() => moveOrder(obj.id, -1)} title="前移顺序" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <ArrowUp size={12} />
              </button>
              <button onClick={() => moveOrder(obj.id, 1)} title="后移顺序" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <ArrowDown size={12} />
              </button>
            </div>
          </div>
        ))}
        {filtered.length > 120 && (
          <div className="py-2 text-center text-[11px] text-slate-400">
            已显示前 120 个对象，请使用上方搜索框或波次过滤定位更多对象（共 {filtered.length} 个）
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== 4. Field Rules & Scrubbing Widget ====================
const FieldRulesPanel: React.FC<{
  plan: MigrationPlan;
  onSave: (p: MigrationPlan) => Promise<MigrationPlan | null | undefined>;
  showToast: (t: 'success' | 'error' | 'info', msg: string) => void;
}> = ({ plan, onSave, showToast }) => {
  const [selectedObjId, setSelectedObjId] = useState<string>(plan.objects[0]?.id || '');
  const [busy, setBusy] = useState(false);

  const selectedObj = plan.objects.find((o) => o.id === selectedObjId) || plan.objects[0];

  const autoRecommend = async () => {
    if (!selectedObj) return;
    setBusy(true);
    try {
      const [srcDesc, tgtDesc] = await Promise.all([
        window.neoApi.migrationInspectEntityDescribe?.(selectedObj.sourceConnectorId, selectedObj.sourceEntity).catch(() => null),
        window.neoApi.migrationInspectEntityDescribe?.(selectedObj.targetConnectorId, selectedObj.targetEntity).catch(() => null),
      ]);
      const rec = await window.neoApi.migrationRecommendFieldMappings?.({
        sourceEntity: selectedObj.sourceEntity,
        targetEntity: selectedObj.targetEntity,
        sourceFields: srcDesc?.fields || [],
        targetFields: tgtDesc?.fields || [],
        topologyMode: plan.topology.mode,
      });
      if (rec?.mappings) {
        await onSave({
          ...plan,
          objects: plan.objects.map((o) =>
            o.id === selectedObj.id
              ? { ...o, fieldMappings: rec.mappings, dedupKeys: rec.dedupKeys || o.dedupKeys }
              : o
          ),
        });
        showToast('success', `加密沙箱已为 ${selectedObj.sourceEntity} 推荐 ${rec.mappings.length} 条字段映射`);
      }
    } catch (err: any) {
      showToast('error', err?.message || '自动推荐映射失败');
    } finally {
      setBusy(false);
    }
  };

  const addRule = () => {
    if (!selectedObj) return;
    const rule: MigrationFieldMapping = {
      id: `map_${Date.now()}`,
      sourceField: '',
      targetField: '',
      transformType: 'direct',
      maskPattern: 'none',
      isEncryptedInStage: false,
    };
    void onSave({
      ...plan,
      objects: plan.objects.map((o) => (o.id === selectedObj.id ? { ...o, fieldMappings: [...o.fieldMappings, rule] } : o)),
    });
  };

  const updateRule = (ruleId: string, patch: Partial<MigrationFieldMapping>) => {
    if (!selectedObj) return;
    void onSave({
      ...plan,
      objects: plan.objects.map((o) =>
        o.id === selectedObj.id
          ? { ...o, fieldMappings: o.fieldMappings.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)) }
          : o
      ),
    });
  };

  const removeRule = (ruleId: string) => {
    if (!selectedObj) return;
    void onSave({
      ...plan,
      objects: plan.objects.map((o) =>
        o.id === selectedObj.id ? { ...o, fieldMappings: o.fieldMappings.filter((r) => r.id !== ruleId) } : o
      ),
    });
  };

  if (!selectedObj) {
    return <div className="py-12 text-center text-xs text-slate-400">请先在“对象依赖编排”中添加对象</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selectedObj.id}
          onChange={(e) => setSelectedObjId(e.target.value)}
          className="max-w-52 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
        >
          {plan.objects.map((o) => (
            <option key={o.id} value={o.id}>
              {o.sourceEntity} → {o.targetEntity} ({o.fieldMappings.length})
            </option>
          ))}
        </select>
        <button
          disabled={busy}
          onClick={() => void autoRecommend()}
          className="inline-flex items-center gap-1 rounded bg-sky-700 px-2.5 py-1 text-white hover:bg-sky-800 disabled:opacity-50"
        >
          <Sparkles size={12} /> 加密沙箱智能推荐
        </button>
        <button
          onClick={addRule}
          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50"
        >
          <Plus size={12} /> 加字段规则
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-auto pr-1">
        {selectedObj.fieldMappings.map((rule) => (
          <div key={rule.id} className="flex flex-wrap items-center gap-1.5 rounded border border-slate-200 bg-white px-2 py-1.5">
            <input
              value={rule.sourceField}
              onChange={(e) => updateRule(rule.id, { sourceField: e.target.value })}
              placeholder="源字段"
              className="w-28 rounded border border-slate-200 px-1.5 py-0.5 font-mono text-[11px]"
            />
            <span className="text-slate-400">→</span>
            <input
              value={rule.targetField}
              onChange={(e) => updateRule(rule.id, { targetField: e.target.value })}
              placeholder="目标字段"
              className="w-28 rounded border border-slate-200 px-1.5 py-0.5 font-mono text-[11px]"
            />
            <select
              value={rule.transformType}
              onChange={(e) => updateRule(rule.id, { transformType: e.target.value as any })}
              className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px]"
            >
              <option value="direct">直传</option>
              <option value="dict">枚举字典</option>
              <option value="mask">脱敏掩码</option>
              <option value="default">默认值回退</option>
            </select>
            {rule.transformType === 'mask' && (
              <select
                value={rule.maskPattern || 'phone'}
                onChange={(e) => updateRule(rule.id, { maskPattern: e.target.value as any })}
                className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px]"
              >
                <option value="phone">手机号脱敏</option>
                <option value="name">姓名脱敏</option>
                <option value="idcard">证件号脱敏</option>
                <option value="email">邮箱脱敏</option>
                <option value="hash">SHA256假名</option>
              </select>
            )}
            <label className="ml-auto inline-flex items-center gap-1 text-[11px] text-emerald-700" title="MongoDB 中转存储时使用 AES-256-GCM 密文落盘">
              <input
                type="checkbox"
                checked={!!rule.isEncryptedInStage}
                onChange={(e) => updateRule(rule.id, { isEncryptedInStage: e.target.checked })}
              />
              密文暂存
            </label>
            <button onClick={() => removeRule(rule.id)} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ==================== 5. Scheduler & Incremental Control Widget ====================
const SchedulerPanel: React.FC<{
  plan: MigrationPlan;
  onSave: (p: MigrationPlan) => Promise<MigrationPlan | null | undefined>;
  showToast: (t: 'success' | 'error' | 'info', msg: string) => void;
}> = ({ plan, onSave, showToast }) => {
  const [sch, setSch] = useState(plan.schedule);
  useEffect(() => setSch(plan.schedule), [plan.id]);

  const saveSchedule = async () => {
    await onSave({ ...plan, schedule: sch });
    showToast('success', '定时调度与增量水位线配置已保存');
  };

  const triggerRun = async (incremental: boolean) => {
    try {
      await onSave({ ...plan, schedule: sch });
      showToast('info', incremental ? '正在启动增量追平任务…' : '正在启动全量基线迁移任务…');
      await window.neoApi.migrationStartTask?.(plan.id, { incremental, trigger: 'manual' });
    } catch (err: any) {
      showToast('error', err?.message || '启动任务失败');
    }
  };

  return (
    <div className="space-y-3 text-xs">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="font-medium text-slate-700">执行调度模式</span>
          <select
            value={sch.mode}
            onChange={(e) => setSch({ ...sch, mode: e.target.value as any })}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
          >
            <option value="manual">仅手动执行</option>
            <option value="interval">按固定分钟间隔轮询</option>
            <option value="cron">Cron 表达式定时任务</option>
          </select>
        </label>
        {sch.mode === 'interval' ? (
          <label className="block">
            <span className="font-medium text-slate-700">间隔分钟数</span>
            <input
              type="number"
              min={5}
              value={sch.intervalMinutes || 60}
              onChange={(e) => setSch({ ...sch, intervalMinutes: Number(e.target.value) || 60 })}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
            />
          </label>
        ) : (
          <label className="block">
            <span className="font-medium text-slate-700">Cron 表达式</span>
            <input
              value={sch.cronExpr || '0 2 * * *'}
              onChange={(e) => setSch({ ...sch, cronExpr: e.target.value })}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
            />
          </label>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="font-medium text-slate-700">增量水位线字段</span>
          <input
            value={sch.highWatermarkField}
            onChange={(e) => setSch({ ...sch, highWatermarkField: e.target.value })}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
          />
        </label>
        <label className="block">
          <span className="font-medium text-slate-700">防时钟漂移回退 (秒)</span>
          <input
            type="number"
            min={0}
            value={sch.clockSkewBufferSeconds}
            onChange={(e) => setSch({ ...sch, clockSkewBufferSeconds: Number(e.target.value) || 300 })}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2.5 py-1.5"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-slate-700">
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={sch.enabled} onChange={(e) => setSch({ ...sch, enabled: e.target.checked })} />
          启用后台定时自动增量
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={!!sch.notifyOnComplete} onChange={(e) => setSch({ ...sch, notifyOnComplete: e.target.checked })} />
          完成时系统通知
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button onClick={() => void triggerRun(false)} className="inline-flex items-center gap-1 rounded bg-sky-700 px-3 py-1.5 font-medium text-white hover:bg-sky-800">
          <Play size={13} /> 全量基线启动
        </button>
        <button onClick={() => void triggerRun(true)} className="inline-flex items-center gap-1 rounded border border-sky-200 bg-sky-50 px-3 py-1.5 font-medium text-sky-700 hover:bg-sky-100">
          <Clock3 size={13} /> 增量水位线追平
        </button>
        <button onClick={() => void saveSchedule()} className="ml-auto rounded border border-slate-200 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50">
          保存调度设置
        </button>
      </div>
    </div>
  );
};

// ==================== 6. Migration Progress Dashboard Widget ====================
const ProgressDashboardPanel: React.FC<{
  plan: MigrationPlan;
  showToast: (t: 'success' | 'error' | 'info', msg: string) => void;
}> = ({ plan, showToast }) => {
  const [metrics, setMetrics] = useState<MigrationProgressMetrics | null>(null);

  useEffect(() => {
    void window.neoApi.migrationGetTaskProgress?.(plan.id).then((m) => {
      if (m) setMetrics(m);
    });
    const unsub = window.neoApi.onMigrationProgress?.((next) => {
      if (next.taskId === plan.id) setMetrics(next);
    });
    return () => unsub?.();
  }, [plan.id]);

  const percent = useMemo(() => {
    if (!metrics || !metrics.totalObjects) return 0;
    if (metrics.status === 'completed') return 100;
    return Math.min(99, Math.round((metrics.completedObjects / metrics.totalObjects) * 100));
  }, [metrics]);

  const statsList = Object.values(metrics?.objectStats || {});

  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${
            metrics?.status === 'running' ? 'bg-sky-100 text-sky-700' :
            metrics?.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
            metrics?.status === 'failed' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
          }`}>
            <Activity size={12} /> {metrics?.status || 'idle'}
          </span>
          <span className="text-slate-500">当前波次：Wave {metrics?.currentWave || 1}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {metrics?.status === 'running' ? (
            <button onClick={() => void window.neoApi.migrationPauseTask?.(plan.id)} className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">
              <Pause size={12} /> 暂停
            </button>
          ) : metrics?.status === 'paused' ? (
            <button onClick={() => void window.neoApi.migrationResumeTask?.(plan.id)} className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">
              <Play size={12} /> 继续
            </button>
          ) : (
            <button
              onClick={() => void window.neoApi.migrationStartTask?.(plan.id, { incremental: false, trigger: 'manual' }).catch((e: any) => showToast('error', e?.message || '启动失败'))}
              className="inline-flex items-center gap-1 rounded bg-sky-700 px-2.5 py-1 font-medium text-white hover:bg-sky-800"
            >
              <Play size={12} /> 立即运行
            </button>
          )}
          {(metrics?.status === 'running' || metrics?.status === 'paused') && (
            <button onClick={() => void window.neoApi.migrationStopTask?.(plan.id)} className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700">
              <Square size={12} /> 中止
            </button>
          )}
        </div>
      </div>

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {[
          { label: '整体进度', value: `${percent}%`, sub: `${metrics?.completedObjects || 0} / ${metrics?.totalObjects || plan.objects.filter((o) => o.enabled).length} 对象` },
          { label: '已抽取暂存', value: (metrics?.processedRecords || 0).toLocaleString(), sub: 'MongoDB 分片缓冲' },
          { label: '目标端写入', value: (metrics?.loadedRecords || 0).toLocaleString(), sub: `外键补全 ${(metrics?.patchedRecords || 0).toLocaleString()}` },
          { label: '实时吞吐', value: `${metrics?.currentTps || 0} r/s`, sub: '键集流式背压' },
          { label: '异常记录', value: (metrics?.failedRecords || 0).toLocaleString(), sub: '自动归入审计队列', danger: (metrics?.failedRecords || 0) > 0 },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded border border-slate-200 bg-slate-50/70 p-2.5">
            <div className="text-[11px] text-slate-500">{kpi.label}</div>
            <div className={`mt-0.5 text-base font-semibold ${kpi.danger ? 'text-rose-600' : 'text-slate-900'}`}>{kpi.value}</div>
            <div className="text-[10px] text-slate-400">{kpi.sub}</div>
          </div>
        ))}
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full bg-sky-600 transition-all duration-300" style={{ width: `${percent}%` }} />
      </div>

      {/* Object Breakdown & Unified Async Jobs */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded border border-slate-200 bg-white">
          <div className="flex items-center gap-1.5 border-b border-slate-100 px-3 py-1.5 font-semibold text-slate-700">
            <Layers size={13} /> 对象执行泳道状态
          </div>
          <div className="max-h-52 overflow-auto divide-y divide-slate-100">
            {statsList.length === 0 && <div className="py-6 text-center text-slate-400">点击启动后在此查看每个对象的实时进度</div>}
            {statsList.map((st) => (
              <div key={st.objectConfigId} className="flex items-center justify-between px-3 py-1.5 text-[11px]">
                <div className="min-w-0">
                  <span className="font-mono font-medium text-slate-800">{st.sourceEntity} → {st.targetEntity}</span>
                  <span className="ml-2 text-slate-400">W{st.wave}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">抽 {st.extractedRecords} · 写 {st.loadedRecords} · 补 {st.patchedRecords}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    st.stage === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                    st.stage === 'failed' ? 'bg-rose-50 text-rose-700' :
                    st.stage === 'pending' ? 'bg-slate-100 text-slate-500' : 'bg-sky-50 text-sky-700'
                  }`}>{st.stage}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded border border-slate-200 bg-white">
          <div className="flex items-center gap-1.5 border-b border-slate-100 px-3 py-1.5 font-semibold text-slate-700">
            <Activity size={13} /> 三平台统一异步作业监控 (Bulk / Async Jobs)
          </div>
          <div className="max-h-52 overflow-auto divide-y divide-slate-100">
            {(!metrics?.activeJobs || metrics.activeJobs.length === 0) && (
              <div className="py-6 text-center text-slate-400">暂无运行中的异步 Bulk 作业</div>
            )}
            {metrics?.activeJobs.map((job) => (
              <div key={job.jobId} className="flex items-center justify-between px-3 py-1.5 text-[11px]">
                <div className="min-w-0">
                  <div className="font-mono font-medium text-slate-800">{job.platform.toUpperCase()} · {job.entity}</div>
                  <div className="text-[10px] text-slate-400">Job: {job.jobId} · {job.operation}</div>
                </div>
                <div className="text-right">
                  <div className="font-medium text-slate-700">{job.processedRecords} / {job.totalRecords}</div>
                  <div className={`text-[10px] ${job.status === 'failed' ? 'text-rose-600' : 'text-emerald-600'}`}>{job.status}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== 7. Audit Board, Logs & Reconciliation Widget ====================
const AuditBoardPanel: React.FC<{
  plan: MigrationPlan;
  showToast: (t: 'success' | 'error' | 'info', msg: string) => void;
}> = ({ plan, showToast }) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [failures, setFailures] = useState<MigrationAuditRecord[]>([]);
  const [diagnosis, setDiagnosis] = useState<any[]>([]);
  const [reconcile, setReconcile] = useState<MigrationReconciliationReport | null>(null);
  const [tab, setTab] = useState<'logs' | 'errors' | 'reconcile'>('logs');

  useEffect(() => {
    void window.neoApi.migrationListLogs?.(plan.id, 150).then((res) => res && setLogs(res));
    void window.neoApi.migrationListAuditFailures?.(plan.id, 100).then((res) => res && setFailures(res));
    const unsub = window.neoApi.onMigrationLog?.((log) => {
      if (log.taskId === plan.id) setLogs((prev) => [log, ...prev].slice(0, 200));
    });
    return () => unsub?.();
  }, [plan.id]);

  const runReconcile = async () => {
    try {
      const report = await window.neoApi.migrationReconcileAudit?.(plan.id);
      if (report) {
        setReconcile(report);
        setTab('reconcile');
        showToast(report.overallStatus === 'balanced' ? 'success' : 'info', report.summary);
      }
    } catch (err: any) {
      showToast('error', err?.message || '对账核验失败');
    }
  };

  const runDiagnose = async () => {
    const freshFailures = (await window.neoApi.migrationListAuditFailures?.(plan.id, 200)) || failures;
    setFailures(freshFailures);
    if (!freshFailures.length) {
      showToast('info', '当前没有失败记录需要诊断');
      return;
    }
    const clusters = (await window.neoApi.migrationDiagnoseErrors?.(freshFailures)) || [];
    setDiagnosis(clusters);
    setTab('errors');
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        {([
          { id: 'logs', label: `运行日志 (${logs.length})` },
          { id: 'errors', label: `失败审计 (${failures.length})` },
          { id: 'reconcile', label: '一致性对账' },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded px-2.5 py-1 font-medium ${tab === t.id ? 'bg-sky-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {t.label}
          </button>
        ))}
        <button onClick={() => void runDiagnose()} className="ml-auto inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
          <AlertTriangle size={12} /> 沙箱归因诊断
        </button>
        <button onClick={() => void runReconcile()} className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800">
          <FileSearch size={12} /> 运行两端对账
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded border border-slate-200 bg-slate-950/95 p-2 font-mono text-[11px] text-slate-200">
        {tab === 'logs' && (
          <div className="space-y-1">
            {logs.length === 0 && <div className="py-8 text-center text-slate-500">暂无运行日志</div>}
            {logs.map((l) => (
              <div key={l.id} className="flex items-start gap-2">
                <span className="shrink-0 text-slate-500">{new Date(l.timestamp).toLocaleTimeString()}</span>
                <span className={`shrink-0 uppercase ${l.level === 'error' ? 'text-rose-400' : l.level === 'success' ? 'text-emerald-400' : l.level === 'warn' ? 'text-amber-400' : 'text-sky-400'}`}>
                  [{l.stage}]
                </span>
                <span className="break-all text-slate-200">{l.message}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'errors' && (
          <div className="space-y-2 text-slate-200">
            {diagnosis.map((c) => (
              <div key={c.category} className="rounded border border-amber-700/60 bg-amber-950/40 p-2">
                <div className="font-semibold text-amber-300">{c.category} · 影响 {c.count} 条</div>
                <div className="mt-0.5 text-slate-300">建议：{c.advice}</div>
                <div className="mt-0.5 text-[10px] text-slate-400">样本：{c.sampleMessage}</div>
              </div>
            ))}
            {failures.map((f) => (
              <div key={f.id} className="rounded border border-slate-800 bg-slate-900 px-2 py-1">
                <span className="text-rose-400">{f.sourceEntity}#{f.sourceId}</span>: {f.errorMessage}
              </div>
            ))}
            {failures.length === 0 && <div className="py-8 text-center text-slate-500">暂无写入失败记录</div>}
          </div>
        )}

        {tab === 'reconcile' && (
          <div className="space-y-1.5">
            {!reconcile && <div className="py-8 text-center text-slate-500">点击上方“运行两端对账”生成割接一致性报告</div>}
            {reconcile && (
              <>
                <div className={`rounded px-2 py-1 font-sans text-xs font-medium ${reconcile.overallStatus === 'balanced' ? 'bg-emerald-900/50 text-emerald-300' : 'bg-amber-900/50 text-amber-300'}`}>
                  <CheckCircle2 size={12} className="mr-1 inline" /> {reconcile.summary}
                </div>
                {reconcile.items.map((item) => (
                  <div key={item.entity} className="flex items-center justify-between border-b border-slate-800 py-1">
                    <span>{item.entity}</span>
                    <span>源 {item.sourceCount} / 映射 {item.targetCount} / 差值 {item.deltaCount}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
