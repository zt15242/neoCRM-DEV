import React, { useEffect, useState } from 'react';
import { Activity, AlignLeft, ArrowLeft, BarChart3, Check, Clock3, LayoutDashboard, Mail, Pencil, Play, Plus, Save, Send, Settings2, Trash2, X } from 'lucide-react';
import type { FeishuWorkspaceSettings } from '../../../shared/feishuTypes';
import type { WorkspaceDataSources, WorkspacePage, WorkspaceWidget, WorkspaceWidgetResult, WorkspaceWidgetType } from '../../../shared/workspaceTypes';
import { AsyncApexJobBIDashboard } from '../AsyncApexJobBIDashboard';

interface Props {
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const makePage = (): WorkspacePage => ({ id: newId(), name: '新建业务页面', description: '', widgets: [], createdAt: Date.now(), updatedAt: Date.now() });
const defaultSubscription = (): NonNullable<WorkspaceWidget['subscription']> => ({ enabled: false, intervalMinutes: 60, feishuEnabled: false });

const widgetDefaults: Record<WorkspaceWidgetType, Omit<WorkspaceWidget, 'id'>> = {
  text: { type: 'text', title: '说明', text: '', subscription: defaultSubscription() },
  'crm-query': { type: 'crm-query', title: 'CRM 数据', query: '', limit: 20, subscription: defaultSubscription() },
  'mail-list': { type: 'mail-list', title: '最近邮件', limit: 10, subscription: defaultSubscription() },
  'async-apex-dashboard': { type: 'async-apex-dashboard', title: 'Apex 异步作业 BI 看板', query: 'SELECT ApexClass.Name, CompletedDate, CreatedBy.Name, CreatedDate, ExtendedStatus, Id, JobItemsProcessed, JobType, MethodName, NumberOfErrors, ParentJobId, Status, TotalJobItems FROM AsyncApexJob WHERE CreatedDate = YESTERDAY ORDER BY CreatedDate DESC', subscription: defaultSubscription() },
};

const widgetIcon = (type: WorkspaceWidgetType) => type === 'text' ? AlignLeft : type === 'mail-list' ? Mail : BarChart3;
const widgetTypeLabel = (type: WorkspaceWidgetType) => ({ text: '文本', 'crm-query': 'CRM 查询', 'mail-list': '邮件列表', 'async-apex-dashboard': 'BI 看板' })[type];
const intervalLabel = (minutes: number) => minutes < 60 ? `每 ${minutes} 分钟` : minutes % 1440 === 0 ? `每 ${minutes / 1440} 天` : minutes % 60 === 0 ? `每 ${minutes / 60} 小时` : `每 ${minutes} 分钟`;

export const WorkspacePageView: React.FC<Props> = ({ showToast }) => {
  const [pages, setPages] = useState<WorkspacePage[]>([]);
  const [page, setPage] = useState<WorkspacePage | null>(null);
  const [sources, setSources] = useState<WorkspaceDataSources>({ crmAccounts: [], mailAccounts: [] });
  const [results, setResults] = useState<Record<string, WorkspaceWidgetResult>>({});
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [settingWidgetId, setSettingWidgetId] = useState<string | null>(null);

  const load = async () => {
    try {
      const [loadedPages, loadedSources] = await Promise.all([
        window.neoApi.workspaceListPages?.() || Promise.resolve([]),
        window.neoApi.workspaceGetDataSources?.() || Promise.resolve({ crmAccounts: [], mailAccounts: [] }),
      ]);
      setPages(loadedPages);
      setSources(loadedSources);
      setPage((current) => current ? loadedPages.find((item) => item.id === current.id) || current : null);
    } catch (error: any) {
      showToast('error', error?.message || '加载自定义页面失败');
    }
  };

  useEffect(() => { void load(); }, []);

  const persistPage = async (nextPage: WorkspacePage): Promise<WorkspacePage[]> => {
    const updated = await window.neoApi.workspaceSavePage?.({ ...nextPage, updatedAt: Date.now() });
    const nextPages = updated || [nextPage, ...pages.filter((item) => item.id !== nextPage.id)];
    setPages(nextPages);
    setPage(nextPages.find((item) => item.id === nextPage.id) || nextPage);
    return nextPages;
  };

  const save = async () => {
    if (!page) return;
    setBusy(true);
    try {
      await persistPage(page);
      showToast('success', '业务页面已保存');
    } catch (error: any) {
      showToast('error', error?.message || '保存页面失败');
    } finally { setBusy(false); }
  };

  const addWidget = (type: WorkspaceWidgetType) => {
    setPage((current) => {
      const target = current || makePage();
      const widget = { id: newId(), ...widgetDefaults[type] } as WorkspaceWidget;
      if (type === 'crm-query') widget.accountId = sources.crmAccounts[0]?.accountId;
      if (type === 'mail-list') widget.accountId = sources.mailAccounts[0]?.accountId;
      if (type === 'async-apex-dashboard') widget.accountId = sources.crmAccounts.find((source) => source.productType === 'salesforce')?.accountId;
      return { ...target, widgets: [...target.widgets, widget] };
    });
  };

  const run = async () => {
    if (!page) return;
    setBusy(true);
    try {
      await persistPage(page);
      const nextResults = await window.neoApi.workspaceRunPage?.(page.id) || [];
      setResults(Object.fromEntries(nextResults.map((result) => [result.widgetId, result])));
      const failed = nextResults.filter((result) => !result.success).length;
      showToast(failed ? 'info' : 'success', failed ? `页面已运行，${failed} 个组件需要检查` : '页面数据已刷新');
    } catch (error: any) {
      showToast('error', error?.message || '运行页面失败');
    } finally { setBusy(false); }
  };

  const removePage = async () => {
    if (!page || !window.confirm(`确定删除“${page.name}”吗？`)) return;
    try {
      const updated = await window.neoApi.workspaceDeletePage?.(page.id) || [];
      setPages(updated);
      setPage(null);
      setResults({});
      setEditing(false);
    } catch (error: any) { showToast('error', error?.message || '删除页面失败'); }
  };

  const renderWidgetResult = (widget: WorkspaceWidget) => {
    if (widget.type === 'text') return <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{widget.text || '尚未填写说明内容'}</p>;
    const result = results[widget.id];
    if (!result) return <div className="py-12 text-center text-sm text-slate-400">运行页面后将在这里显示数据</div>;
    if (!result.success) return <div className="m-4 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{result.error}</div>;
    if (!result.records?.length) return <div className="py-10 text-center text-sm text-slate-400">没有匹配的数据</div>;
    const columns = widget.type === 'mail-list' ? ['from', 'subject', 'date', 'snippet'] : (result.fields || Object.keys(result.records[0] || {})).slice(0, 8);
    return <div className="overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-slate-500"><tr>{columns.map((key) => <th key={key} className="border-b border-slate-200 px-3 py-2 font-semibold">{key}</th>)}</tr></thead><tbody>{result.records.map((record, index) => <tr key={String(record.id || index)} className="border-b border-slate-100 last:border-0">{columns.map((key) => <td key={key} className="max-w-64 truncate px-3 py-2 text-slate-700" title={String(record[key] ?? '')}>{key === 'date' && typeof record[key] === 'number' ? new Date(record[key] as number).toLocaleString() : String(record[key] ?? '')}</td>)}</tr>)}</tbody></table><div className="px-3 py-2 text-[11px] text-slate-400">显示 {result.records.length} 条{result.totalSize !== undefined ? ` · 查询总数 ${result.totalSize}` : ''} · {new Date(result.updatedAt).toLocaleTimeString()}</div></div>;
  };

  const saveWidgetSettings = async (widget: WorkspaceWidget) => {
    if (!page) return;
    const next = { ...page, widgets: page.widgets.map((item) => item.id === widget.id ? widget : item) };
    setBusy(true);
    try {
      await persistPage(next);
      setSettingWidgetId(null);
      showToast('success', '组件设置已保存');
    } catch (error: any) { showToast('error', error?.message || '保存组件设置失败'); }
    finally { setBusy(false); }
  };

  if (!page) {
    return <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <header className="flex min-h-16 items-center justify-between border-b border-slate-200 bg-white px-5 md:px-8">
        <div><h1 className="text-lg font-semibold text-slate-900">自定义工作台</h1><p className="mt-0.5 text-xs text-slate-500">业务页面与数据组件</p></div>
        <button onClick={() => { setPage(makePage()); setEditing(true); setResults({}); }} className="inline-flex items-center gap-2 rounded bg-sky-700 px-3 py-2 text-xs font-medium text-white hover:bg-sky-800"><Plus size={15}/>新建页面</button>
      </header>
      <div className="flex-1 overflow-y-auto p-5 md:p-8">
        {pages.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{pages.map((item) => <button key={item.id} onClick={() => { setPage(item); setEditing(false); setResults({}); }} className="group overflow-hidden rounded border border-slate-200 bg-white text-left transition-colors hover:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300">
          <PageThumbnail page={item}/>
          <div className="border-t border-slate-100 px-4 py-3"><div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-semibold text-slate-800">{item.name}</span><span className="shrink-0 text-[11px] text-slate-400">{item.widgets.length} 个组件</span></div><p className="mt-1 truncate text-xs text-slate-500">{item.description || item.widgets.map((widget) => widget.title).slice(0, 3).join(' · ') || '空白页面'}</p></div>
        </button>)}</div> : <div className="mx-auto mt-24 max-w-sm text-center"><LayoutDashboard size={36} className="mx-auto mb-3 text-slate-300"/><h2 className="text-sm font-semibold text-slate-700">还没有工作台页面</h2><button onClick={() => { setPage(makePage()); setEditing(true); }} className="mt-4 inline-flex items-center gap-1.5 rounded bg-sky-700 px-3 py-2 text-xs text-white"><Plus size={14}/>新建页面</button></div>}
      </div>
    </div>;
  }

  return <div className="flex h-full min-h-0 flex-col bg-slate-50">
    <header className="flex min-h-14 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 md:px-6">
      <button onClick={() => { setPage(null); setEditing(false); }} title="返回所有页面" className="rounded p-2 text-slate-600 hover:bg-slate-100"><ArrowLeft size={17}/></button>
      <div className="min-w-0 flex-1">
        {editing ? <input aria-label="页面名称" value={page.name} onChange={(event) => setPage({ ...page, name: event.target.value })} className="w-full max-w-xl border-0 bg-transparent text-base font-semibold text-slate-900 outline-none"/> : <h1 className="truncate text-base font-semibold text-slate-900">{page.name}</h1>}
        {editing ? <input value={page.description || ''} onChange={(event) => setPage({ ...page, description: event.target.value })} placeholder="添加页面简介" className="mt-0.5 w-full max-w-xl border-0 bg-transparent text-xs text-slate-500 outline-none placeholder:text-slate-400"/> : <p className="truncate text-xs text-slate-500">{page.description || `${page.widgets.length} 个组件`}</p>}
      </div>
      {editing && <div className="flex items-center gap-1 border-r border-slate-200 pr-2">
        <button onClick={() => addWidget('crm-query')} title="添加 CRM 查询" className="rounded p-2 text-slate-600 hover:bg-slate-100"><BarChart3 size={16}/></button>
        <button onClick={() => addWidget('mail-list')} title="添加邮件列表" className="rounded p-2 text-slate-600 hover:bg-slate-100"><Mail size={16}/></button>
        <button onClick={() => addWidget('text')} title="添加文本" className="rounded p-2 text-slate-600 hover:bg-slate-100"><AlignLeft size={16}/></button>
        <button onClick={() => addWidget('async-apex-dashboard')} title="添加 Apex BI 看板" className="rounded p-2 text-slate-600 hover:bg-slate-100"><Activity size={16}/></button>
      </div>}
      <button disabled={busy} onClick={() => void run()} title="刷新所有组件" className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-2.5 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"><Play size={14}/>运行</button>
      <button disabled={busy} onClick={() => editing ? void save() : setEditing(true)} title={editing ? '保存页面' : '编辑页面'} className={`inline-flex items-center gap-1.5 rounded px-2.5 py-2 text-xs disabled:opacity-50 ${editing ? 'bg-sky-700 text-white hover:bg-sky-800' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>{editing ? <><Save size={14}/>保存</> : <><Pencil size={14}/>编辑</>}</button>
      {editing && pages.some((item) => item.id === page.id) && <button onClick={() => void removePage()} title="删除页面" className="rounded p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={16}/></button>}
    </header>

    <main className="flex-1 overflow-y-auto p-4 md:p-6">
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 items-start gap-4 xl:grid-cols-2">
        {page.widgets.map((widget) => {
          const Icon = widgetIcon(widget.type);
          const subscription = widget.subscription || defaultSubscription();
          const isWide = widget.type === 'async-apex-dashboard';
          return <article key={widget.id} className={`min-w-0 overflow-hidden rounded border border-slate-200 bg-white ${isWide ? 'xl:col-span-2' : ''}`}>
            <div className="flex min-h-11 items-center gap-2 border-b border-slate-100 px-3">
              <Icon size={15} className="shrink-0 text-slate-500"/><h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{widget.title}</h2>
              {subscription.enabled && <span title={`订阅：${intervalLabel(subscription.intervalMinutes)}`} className="inline-flex items-center gap-1 text-[10px] text-slate-500"><Clock3 size={12}/>{intervalLabel(subscription.intervalMinutes)}</span>}
              {subscription.feishuEnabled && <span title="启用飞书推送" className="text-sky-700"><Send size={13}/></span>}
              <button onClick={() => setSettingWidgetId(widget.id)} title="组件设置：数据源、订阅与飞书" className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Settings2 size={16}/></button>
              {editing && <button onClick={() => setPage({ ...page, widgets: page.widgets.filter((item) => item.id !== widget.id) })} title="移除组件" className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X size={15}/></button>}
            </div>
            {widget.type === 'async-apex-dashboard' ? widget.accountId ? <div className="min-h-[560px]"><AsyncApexJobBIDashboard accountId={widget.accountId}/></div> : <div className="p-10 text-center text-sm text-slate-500">请在组件设置中绑定 Salesforce 账号。</div> : widget.type === 'text' ? <div className="p-5">{renderWidgetResult(widget)}</div> : <div className="max-h-[70vh] min-h-44 overflow-auto">{renderWidgetResult(widget)}</div>}
          </article>;
        })}
        {page.widgets.length === 0 && <div className="flex min-h-56 flex-col items-center justify-center rounded border border-dashed border-slate-300 bg-white text-sm text-slate-500 xl:col-span-2"><Plus size={20} className="mb-2"/>{editing ? '使用上方工具栏添加组件' : '此页面暂无组件'}{!editing && <button onClick={() => setEditing(true)} className="mt-3 text-xs font-medium text-sky-700 hover:underline">编辑页面</button>}</div>}
      </div>
    </main>

    {settingWidgetId && page.widgets.find((widget) => widget.id === settingWidgetId) && <WidgetSettingsModal
      key={settingWidgetId}
      widget={page.widgets.find((widget) => widget.id === settingWidgetId)!}
      sources={sources}
      busy={busy}
      onClose={() => setSettingWidgetId(null)}
      onSave={(widget) => void saveWidgetSettings(widget)}
      showToast={showToast}
    />}
  </div>;
};

const PageThumbnail: React.FC<{ page: WorkspacePage }> = ({ page }) => {
  const colors: Record<WorkspaceWidgetType, string> = { text: 'bg-emerald-100', 'crm-query': 'bg-sky-100', 'mail-list': 'bg-amber-100', 'async-apex-dashboard': 'bg-indigo-100' };
  return <div className="relative h-40 overflow-hidden bg-slate-100 p-3 transition-colors group-hover:bg-slate-50">
    <div className="pointer-events-none absolute inset-x-6 top-4 bottom-3 rounded border border-slate-200 bg-white p-2 shadow-sm">
      <div className="mb-2 flex h-3 items-center gap-1 border-b border-slate-100 pb-1"><span className="h-1.5 w-1.5 rounded-full bg-slate-300"/><span className="h-1.5 w-1.5 rounded-full bg-slate-200"/><span className="ml-2 h-1 w-16 rounded bg-slate-200"/></div>
      {page.widgets.length ? <div className="grid h-[calc(100%-18px)] grid-cols-2 gap-1.5">{page.widgets.slice(0, 4).map((widget) => <div key={widget.id} className={`overflow-hidden rounded-sm border border-slate-100 ${colors[widget.type]} p-1.5`}><div className="mb-1 h-1 w-1/2 rounded bg-slate-400/40"/>{widget.type === 'text' ? <><div className="mb-1 h-1 w-full rounded bg-slate-400/25"/><div className="h-1 w-4/5 rounded bg-slate-400/25"/></> : <div className="flex h-6 items-end gap-1">{[35, 65, 45, 82, 53].map((height, index) => <i key={index} className="w-1.5 rounded-t bg-slate-500/35" style={{ height: `${height}%` }}/>)}</div>}</div>)}</div> : <div className="flex h-[calc(100%-18px)] items-center justify-center"><LayoutDashboard size={22} className="text-slate-200"/></div>}
    </div>
    <div className="absolute bottom-2 right-3 rounded bg-white/90 px-1.5 py-1 text-[10px] text-slate-500 shadow-sm">{page.widgets.length} 个组件</div>
  </div>;
};

interface WidgetSettingsModalProps {
  widget: WorkspaceWidget;
  sources: WorkspaceDataSources;
  busy: boolean;
  onClose: () => void;
  onSave: (widget: WorkspaceWidget) => void;
  showToast: Props['showToast'];
}

const WidgetSettingsModal: React.FC<WidgetSettingsModalProps> = ({ widget: initialWidget, sources, busy, onClose, onSave, showToast }) => {
  const [widget, setWidget] = useState<WorkspaceWidget>({ ...initialWidget, subscription: initialWidget.subscription || defaultSubscription() });
  const [feishu, setFeishu] = useState<FeishuWorkspaceSettings>({ configured: false, bots: [] });
  const subscription = widget.subscription || defaultSubscription();
  const selectedFeishuBotId = subscription.feishuBotId || (feishu.bots.length === 1 ? feishu.bots[0].id : '');
  const patch = (values: Partial<WorkspaceWidget>) => setWidget((current) => ({ ...current, ...values }));
  const patchSubscription = (values: Partial<NonNullable<WorkspaceWidget['subscription']>>) => setWidget((current) => ({ ...current, subscription: { ...(current.subscription || defaultSubscription()), ...values } }));

  useEffect(() => {
    void window.neoApi.feishuGetSettings?.().then((value) => setFeishu(value || { configured: false, bots: [] })).catch((error: any) => showToast('error', error?.message || '读取飞书设置失败'));
  }, []);

  const isText = widget.type === 'text';
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label={`${widget.title}组件设置`} className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded border border-slate-200 bg-white shadow-2xl">
      <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-4"><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold text-slate-900">组件设置</h2><p className="mt-0.5 truncate text-xs text-slate-500">{widget.title} · {widgetTypeLabel(widget.type)}</p></div><button onClick={onClose} title="关闭" className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><X size={17}/></button></header>
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <section className="space-y-3">
          <label className="block text-xs font-medium text-slate-700">组件名称<input value={widget.title} onChange={(event) => patch({ title: event.target.value })} className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"/></label>
          {widget.type === 'text' && <label className="block text-xs font-medium text-slate-700">说明内容<textarea value={widget.text || ''} onChange={(event) => patch({ text: event.target.value })} rows={5} className="mt-1 block w-full resize-y rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"/></label>}
          {widget.type === 'crm-query' && <>
            <label className="block text-xs font-medium text-slate-700">CRM 连接器账号<select value={widget.accountId || ''} onChange={(event) => patch({ accountId: event.target.value })} className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">选择账号</option>{sources.crmAccounts.map((source) => <option key={source.accountId} value={source.accountId}>{source.connectorName}{source.tenantName ? ` · ${source.tenantName}` : ''}</option>)}</select></label>
            <label className="block text-xs font-medium text-slate-700">只读查询<textarea value={widget.query || ''} onChange={(event) => patch({ query: event.target.value })} spellCheck={false} rows={5} className="mt-1 block w-full resize-y rounded border border-slate-300 px-3 py-2 font-mono text-xs leading-5 outline-none focus:border-sky-500" placeholder="SELECT <真实字段> FROM <对象 API 名> LIMIT 20"/></label>
          </>}
          {widget.type === 'async-apex-dashboard' && <>
            <label className="block text-xs font-medium text-slate-700">Salesforce 账号<select value={widget.accountId || ''} onChange={(event) => patch({ accountId: event.target.value })} className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">选择 Salesforce 账号</option>{sources.crmAccounts.filter((source) => source.productType === 'salesforce').map((source) => <option key={source.accountId} value={source.accountId}>{source.connectorName}{source.tenantName ? ` · ${source.tenantName}` : ''}</option>)}</select></label>
            <p className="text-xs text-slate-500">只读查询 · 使用 AsyncApexJob 生成 BI 看板。</p>
          </>}
          {widget.type === 'mail-list' && <>
            <label className="block text-xs font-medium text-slate-700">邮箱账号<select value={widget.accountId || ''} onChange={(event) => patch({ accountId: event.target.value })} className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">所有邮箱账号</option>{sources.mailAccounts.map((source) => <option key={source.accountId} value={source.accountId}>{source.name} · {source.email}</option>)}</select></label>
            <label className="block text-xs font-medium text-slate-700">显示数量<input type="number" min={1} max={50} value={widget.limit || 10} onChange={(event) => patch({ limit: Math.max(1, Math.min(50, Number(event.target.value) || 1)) })} className="mt-1 block w-36 rounded border border-slate-300 px-3 py-2 text-sm"/></label>
          </>}
        </section>

        <section className="space-y-3 border-t border-slate-100 pt-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Clock3 size={16} className="text-slate-500"/>订阅</div>
          <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" disabled={isText} checked={subscription.enabled} onChange={(event) => patchSubscription({ enabled: event.target.checked, feishuEnabled: event.target.checked ? subscription.feishuEnabled : false })}/>定时刷新此组件</label>
          <label className="block text-xs text-slate-700">运行频率<select disabled={!subscription.enabled || isText} value={subscription.intervalMinutes} onChange={(event) => patchSubscription({ intervalMinutes: Number(event.target.value) })} className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"><option value={15}>每 15 分钟</option><option value={30}>每 30 分钟</option><option value={60}>每小时</option><option value={240}>每 4 小时</option><option value={1440}>每天</option><option value={10080}>每周</option></select></label>
          {isText && <p className="text-xs text-slate-400">文本组件不需要定时运行。</p>}
        </section>

        <section className="space-y-3 border-t border-slate-100 pt-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Send size={15} className="text-sky-700"/>飞书推送</div>
          <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" disabled={!subscription.enabled || !feishu.configured || isText || !selectedFeishuBotId} checked={subscription.feishuEnabled} onChange={(event) => patchSubscription({ feishuEnabled: event.target.checked, feishuBotId: selectedFeishuBotId || undefined })}/>运行后向飞书群发送看板卡片</label>
          {feishu.configured && <label className="block pl-5 text-xs text-slate-700">推送目标<select disabled={!subscription.enabled} value={selectedFeishuBotId} onChange={(event) => patchSubscription({ feishuBotId: event.target.value || undefined })} className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"><option value="">选择机器人</option>{feishu.bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}</select></label>}
          <label className="flex items-start gap-2 pl-5 text-xs text-slate-700"><input type="checkbox" className="mt-0.5" disabled={!subscription.feishuEnabled || !feishu.configured || isText || widget.type === 'mail-list'} checked={!!widget.feishuIncludeRecords} onChange={(event) => patch({ feishuIncludeRecords: event.target.checked })}/>在卡片中附带最多 6 行数据预览</label>
          {!feishu.configured ? <p className="text-xs text-amber-700">尚未配置机器人 Webhook，请先在设置 → 飞书机器人中完成配置。</p> : <p className="text-xs leading-5 text-slate-500">飞书卡片包含运行指标和可生成的图表。明细默认关闭，开启后最多发送 6 行、5 列；邮件卡片始终隐藏邮件内容。</p>}
          {!subscription.enabled && <p className="text-xs text-slate-400">启用订阅后可选择是否同步推送到飞书。</p>}
        </section>
      </div>
      <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3"><button onClick={onClose} className="rounded border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-50">取消</button><button disabled={busy} onClick={() => onSave(widget)} className="inline-flex items-center gap-1.5 rounded bg-sky-700 px-3 py-2 text-xs font-medium text-white hover:bg-sky-800 disabled:opacity-50"><Check size={14}/>保存设置</button></footer>
    </section>
  </div>;
};
