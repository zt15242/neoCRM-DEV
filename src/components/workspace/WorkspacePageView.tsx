import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Activity, AlignLeft, ArrowDown, ArrowLeft, ArrowUp, BarChart3, Check, CheckCircle2, CircleAlert, ClipboardList, Clock3, Code2, Download, FileCode2, GripVertical, Info, LayoutDashboard, Mail, Pencil, Play, Plus, RefreshCw, Save, Send, Settings2, Trash2, Upload, X } from 'lucide-react';
import type { FeishuWorkspaceSettings } from '../../../shared/feishuTypes';
import type { WorkspaceProject } from '../../../shared/types';
import type { WorkspaceDataSources, WorkspaceExecutionLog, WorkspacePage, WorkspaceWidget, WorkspaceWidgetColumnSpan, WorkspaceWidgetHeight, WorkspaceWidgetResult, WorkspaceWidgetType } from '../../../shared/workspaceTypes';
import { AsyncApexJobBIDashboard } from '../AsyncApexJobBIDashboard';

interface Props {
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
  activeProject?: WorkspaceProject;
}

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const makePage = (projectId?: string): WorkspacePage => ({ id: newId(), name: '新建业务页面', description: '', widgets: [], projectId, createdAt: Date.now(), updatedAt: Date.now() });
const defaultSubscription = (): NonNullable<WorkspaceWidget['subscription']> => ({ enabled: false, intervalMinutes: 60, feishuEnabled: false });

const widgetDefaults: Record<WorkspaceWidgetType, Omit<WorkspaceWidget, 'id'>> = {
  text: { type: 'text', title: '说明', columnSpan: 2, height: 480, text: '', subscription: defaultSubscription() },
  'crm-query': { type: 'crm-query', title: 'CRM 数据', columnSpan: 2, height: 480, query: '', limit: 20, subscription: defaultSubscription() },
  'mail-list': { type: 'mail-list', title: '最近邮件', columnSpan: 2, height: 480, limit: 10, subscription: defaultSubscription() },
  'async-apex-dashboard': { type: 'async-apex-dashboard', title: 'Apex 异步作业 BI 看板', columnSpan: 4, height: 640, query: 'SELECT ApexClass.Name, CompletedDate, CreatedBy.Name, CreatedDate, ExtendedStatus, Id, JobItemsProcessed, JobType, MethodName, NumberOfErrors, ParentJobId, Status, TotalJobItems FROM AsyncApexJob WHERE CreatedDate = YESTERDAY ORDER BY CreatedDate DESC', subscription: defaultSubscription() },
  'custom-html': { type: 'custom-html', title: '自定义 HTML', columnSpan: 2, height: 480, relativePath: '', subscription: defaultSubscription() },
  'custom-tsx': { type: 'custom-tsx', title: '自定义代码组件', columnSpan: 2, height: 480, relativePath: '', subscription: defaultSubscription() },
};

const widgetIcon = (type: WorkspaceWidgetType) => type === 'text' ? AlignLeft : type === 'mail-list' ? Mail : type === 'custom-html' ? Code2 : type === 'custom-tsx' ? FileCode2 : BarChart3;
const widgetTypeLabel = (type: WorkspaceWidgetType) => ({ text: '文本', 'crm-query': 'CRM 查询', 'mail-list': '邮件列表', 'async-apex-dashboard': 'BI 看板', 'custom-html': '自定义 HTML', 'custom-tsx': '自定义代码组件' })[type];
const crmProductLabel = (type: string) => ({ neocrm: '销售易', salesforce: 'Salesforce', fxiaoke: '纷享销客', custom: '自定义 CRM' })[type] || type;
const intervalLabel = (minutes: number) => minutes < 60 ? `每 ${minutes} 分钟` : minutes % 1440 === 0 ? `每 ${minutes / 1440} 天` : minutes % 60 === 0 ? `每 ${minutes / 60} 小时` : `每 ${minutes} 分钟`;
const getWidgetColumnSpan = (widget: WorkspaceWidget): WorkspaceWidgetColumnSpan => widget.columnSpan || (widget.type === 'async-apex-dashboard' ? 4 : 2);
const getWidgetHeight = (widget: WorkspaceWidget): WorkspaceWidgetHeight => widget.height || (widget.type === 'async-apex-dashboard' ? 640 : 480);
const widgetColumnClasses: Record<WorkspaceWidgetColumnSpan, string> = { 1: 'sm:col-span-1 xl:col-span-1', 2: 'sm:col-span-2 xl:col-span-2', 3: 'sm:col-span-2 xl:col-span-3', 4: 'sm:col-span-2 xl:col-span-4' };
const thumbnailColumnClasses: Record<WorkspaceWidgetColumnSpan, string> = { 1: 'col-span-1', 2: 'col-span-2', 3: 'col-span-3', 4: 'col-span-4' };

export const WorkspacePageView: React.FC<Props> = ({ showToast, activeProject }) => {
  const [pages, setPages] = useState<WorkspacePage[]>([]);
  const [page, setPage] = useState<WorkspacePage | null>(null);
  const [sources, setSources] = useState<WorkspaceDataSources>({ crmAccounts: [], mailAccounts: [] });
  const [results, setResults] = useState<Record<string, WorkspaceWidgetResult>>({});
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [settingWidgetId, setSettingWidgetId] = useState<string | null>(null);
  const [logWidgetId, setLogWidgetId] = useState<string | null>(null);
  const [draggingWidgetId, setDraggingWidgetId] = useState<string | null>(null);
  const [dropTargetWidgetId, setDropTargetWidgetId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPages([]);
    setPage(null);
    setResults({});
    setEditing(false);
    setSettingWidgetId(null);
    setLogWidgetId(null);
    void Promise.all([
      window.neoApi.workspaceListPages?.(activeProject?.id) || Promise.resolve([]),
      window.neoApi.workspaceGetDataSources?.() || Promise.resolve({ crmAccounts: [], mailAccounts: [] }),
    ]).then(([loadedPages, loadedSources]) => {
      if (cancelled) return;
      setPages(loadedPages);
      setSources(loadedSources);
    }).catch((error: any) => {
      if (!cancelled) showToast('error', error?.message || '加载自定义页面失败');
    });
    return () => { cancelled = true; };
  }, [activeProject?.id, activeProject?.localPath]);

  useEffect(() => {
    if (!page || (page.projectId && activeProject?.id && page.projectId !== activeProject.id) || !window.neoApi.workspacePreviewWidget) return;
    const customWidgets = page.widgets.filter((widget) => widget.type === 'custom-html' || widget.type === 'custom-tsx');
    if (!customWidgets.length) return;
    let cancelled = false;
    void Promise.all(customWidgets.map((widget) => window.neoApi.workspacePreviewWidget!(page.id, widget.id, activeProject?.localPath)))
      .then((items) => {
        if (cancelled) return;
        setResults((current) => ({ ...current, ...Object.fromEntries(items.map((item) => [item.widgetId, item])) }));
      })
      .catch((error: any) => {
        if (!cancelled) showToast('error', error?.message || '加载自定义组件失败');
      });
    return () => { cancelled = true; };
  }, [page?.id, page?.projectId, page?.updatedAt, activeProject?.id, activeProject?.localPath]);

  const persistPage = async (nextPage: WorkspacePage): Promise<WorkspacePage[]> => {
    if (nextPage.projectId && activeProject?.id && nextPage.projectId !== activeProject.id) {
      throw new Error('当前页面属于另一个项目，请切换回页面所属项目后再操作');
    }
    const updated = await window.neoApi.workspaceSavePage?.({ ...nextPage, projectId: nextPage.projectId || activeProject?.id, updatedAt: Date.now() }, activeProject?.localPath);
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
      const target = current || makePage(activeProject?.id);
      const widget = { id: newId(), projectId: activeProject?.id, ...widgetDefaults[type] } as WorkspaceWidget;
      if (type === 'crm-query') widget.accountId = sources.crmAccounts[0]?.accountId;
      if (type === 'mail-list') widget.accountId = sources.mailAccounts[0]?.accountId;
      if (type === 'async-apex-dashboard') widget.accountId = sources.crmAccounts.find((source) => source.productType === 'salesforce')?.accountId;
      return { ...target, widgets: [...target.widgets, widget] };
    });
  };

  const moveWidgetBy = (widgetId: string, offset: number) => {
    setPage((current) => {
      if (!current) return current;
      const from = current.widgets.findIndex((widget) => widget.id === widgetId);
      const to = from + offset;
      if (from < 0 || to < 0 || to >= current.widgets.length) return current;
      const widgets = [...current.widgets];
      const [moved] = widgets.splice(from, 1);
      widgets.splice(to, 0, moved);
      return { ...current, widgets };
    });
  };

  const moveWidgetTo = (sourceId: string, targetId: string, insertAfter: boolean) => {
    if (sourceId === targetId) return;
    setPage((current) => {
      if (!current) return current;
      const widgets = [...current.widgets];
      const sourceIndex = widgets.findIndex((widget) => widget.id === sourceId);
      if (sourceIndex < 0) return current;
      const [moved] = widgets.splice(sourceIndex, 1);
      const targetIndex = widgets.findIndex((widget) => widget.id === targetId);
      if (targetIndex < 0) return current;
      widgets.splice(targetIndex + (insertAfter ? 1 : 0), 0, moved);
      return { ...current, widgets };
    });
  };

  const handleWidgetDrop = (event: React.DragEvent<HTMLElement>, targetId: string) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData('text/plain') || draggingWidgetId;
    if (editing && sourceId) {
      const bounds = event.currentTarget.getBoundingClientRect();
      moveWidgetTo(sourceId, targetId, event.clientY > bounds.top + bounds.height / 2);
    }
    setDraggingWidgetId(null);
    setDropTargetWidgetId(null);
  };

  const run = async () => {
    if (!page) return;
    setBusy(true);
    try {
      await persistPage(page);
      const nextResults = await window.neoApi.workspaceRunPage?.(page.id, activeProject?.localPath) || [];
      setResults(Object.fromEntries(nextResults.map((result) => [result.widgetId, result])));
      const failed = nextResults.filter((result) => !result.success).length;
      showToast(failed ? 'info' : 'success', failed ? `页面已运行，${failed} 个组件需要检查` : '页面数据已刷新');
    } catch (error: any) {
      showToast('error', error?.message || '运行页面失败');
    } finally { setBusy(false); }
  };

  const sharePage = async (target: WorkspacePage) => {
    try {
      await persistPage(target);
      const result = await window.neoApi.workspaceExportPagePackage?.(target.id);
      if (!result || result.canceled) return;
      showToast('success', `完整页面与组件包已导出：${result.filePath}`);
    } catch (error: any) {
      showToast('error', error?.message || '导出页面组件包失败');
    }
  };

  const importPagePackage = async () => {
    setBusy(true);
    try {
      const result = await window.neoApi.workspaceImportPagePackage?.(activeProject?.id);
      if (!result || result.canceled || !result.page) return;
      setPages(result.pages || [result.page]);
      setPage(result.page);
      setResults({});
      setEditing(false);
      showToast('success', `已导入页面与组件包：${result.page.name}`);
    } catch (error: any) {
      showToast('error', error?.message || '导入页面组件包失败');
    } finally {
      setBusy(false);
    }
  };

  const removePage = async (target?: WorkspacePage) => {
    const selected = target || page;
    if (!selected || !window.confirm(`确定删除“${selected.name}”吗？`)) return;
    setBusy(true);
    try {
      const updated = await window.neoApi.workspaceDeletePage?.(selected.id) || [];
      const scoped = updated.filter((item) => !activeProject?.id || !item.projectId || item.projectId === activeProject.id);
      setPages(scoped);
      if (page?.id === selected.id) {
        setPage(null);
        setResults({});
        setEditing(false);
      }
      showToast('success', '页面已删除');
    } catch (error: any) {
      showToast('error', error?.message || '删除页面失败');
    } finally {
      setBusy(false);
    }
  };

  const renderWidgetResult = (widget: WorkspaceWidget, height: number) => {
    if (widget.type === 'text') return <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{widget.text || '尚未填写说明内容'}</p>;
    const result = results[widget.id];
    if (widget.type === 'custom-html' || widget.type === 'custom-tsx') {
      if (!result) return <div style={{ height }} className="flex items-center justify-center text-center text-sm text-slate-400">正在加载自定义组件…</div>;
      if (!result.success || !result.content) return <div style={{ height }} className="overflow-auto rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><div className="font-medium">{result.buildStatus === 'error' ? '组件构建/加载失败' : '组件加载失败'}</div><div className="mt-1 whitespace-pre-wrap">{result.error}</div></div>;
      return <CustomWidgetFrame key={result.executionId || result.updatedAt} title={widget.title} content={result.content} pageId={page!.id} widgetId={widget.id} executionId={result.executionId || ''} accountId={widget.accountId} height={height}/>;
    }
    if (!result) return <div className="py-12 text-center text-sm text-slate-400">运行页面后将在这里显示数据</div>;
    if (!result.success) return <div className="m-4 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{result.error}</div>;
    if (!result.records?.length) return <div className="py-10 text-center text-sm text-slate-400">没有匹配的数据</div>;
    const columns = widget.type === 'mail-list' ? ['from', 'subject', 'date', 'snippet'] : (result.fields || Object.keys(result.records[0] || {})).slice(0, 8);
    return <div className="overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-slate-500"><tr>{columns.map((key) => <th key={key} className="border-b border-slate-200 px-3 py-2 font-semibold">{key}</th>)}</tr></thead><tbody>{result.records.map((record, index) => <tr key={String(record.id || index)} className="border-b border-slate-100 last:border-0">{columns.map((key) => <td key={key} className="max-w-64 truncate px-3 py-2 text-slate-700" title={String(record[key] ?? '')}>{key === 'date' && typeof record[key] === 'number' ? new Date(record[key] as number).toLocaleString() : String(record[key] ?? '')}</td>)}</tr>)}</tbody></table><div className="px-3 py-2 text-[11px] text-slate-400">查询返回 {result.records.length} 条{result.totalSize !== undefined ? ` · 平台总数 ${result.totalSize}` : ''} · {new Date(result.updatedAt).toLocaleTimeString()}</div></div>;
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
        <div className="flex items-center gap-2"><button disabled={busy} onClick={() => void importPagePackage()} className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"><Upload size={14}/>导入页面包</button><button onClick={() => { setPage(makePage(activeProject?.id)); setEditing(true); setResults({}); }} className="inline-flex items-center gap-2 rounded bg-sky-700 px-3 py-2 text-xs font-medium text-white hover:bg-sky-800"><Plus size={15}/>新建页面</button></div>
      </header>
      <div className="flex-1 overflow-y-auto p-5 md:p-8">
        {pages.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{pages.map((item) => <article key={item.id} className="group overflow-hidden rounded border border-slate-200 bg-white transition-colors hover:border-sky-400">
          <button onClick={() => { setPage(item); setEditing(false); setResults({}); }} className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-300">
            <PageThumbnail page={item}/>
            <div className="border-t border-slate-100 px-4 py-3"><div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-semibold text-slate-800">{item.name}</span><span className="shrink-0 text-[11px] text-slate-400">{item.widgets.length} 个组件</span></div><p className="mt-1 truncate text-xs text-slate-500">{item.description || item.widgets.map((widget) => widget.title).slice(0, 3).join(' · ') || '空白页面'}</p></div>
          </button>
          <div className="flex items-center justify-end gap-1 border-t border-slate-100 px-3 py-2"><button onClick={() => void sharePage(item)} title="导出页面和全部组件文件" className="inline-flex items-center gap-1 rounded px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-sky-700"><Download size={14}/>导出包</button><button onClick={() => void removePage(item)} title="删除页面" className="inline-flex items-center gap-1 rounded px-2 py-1.5 text-xs text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14}/>删除</button></div>
        </article>)}</div> : <div className="mx-auto mt-24 max-w-sm text-center"><LayoutDashboard size={36} className="mx-auto mb-3 text-slate-300"/><h2 className="text-sm font-semibold text-slate-700">还没有工作台页面</h2><button onClick={() => { setPage(makePage(activeProject?.id)); setEditing(true); }} className="mt-4 inline-flex items-center gap-1.5 rounded bg-sky-700 px-3 py-2 text-xs text-white"><Plus size={14}/>新建页面</button></div>}
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
        <button onClick={() => addWidget('custom-html')} title="挂载应用组件库中的 HTML" className="rounded p-2 text-slate-600 hover:bg-slate-100"><Code2 size={16}/></button>
        <button onClick={() => addWidget('custom-tsx')} title="挂载应用组件库中的 TSX / TS / JS / JSX" className="rounded p-2 text-slate-600 hover:bg-slate-100"><FileCode2 size={16}/></button>
      </div>}
      <button disabled={busy} onClick={() => void run()} title="刷新所有组件" className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-2.5 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"><Play size={14}/>运行</button>
      <button disabled={busy} onClick={() => void sharePage(page)} title="导出页面和全部组件文件" className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-2.5 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"><Download size={14}/>导出包</button>
      <button disabled={busy} onClick={() => editing ? void save() : setEditing(true)} title={editing ? '保存页面' : '编辑页面'} className={`inline-flex items-center gap-1.5 rounded px-2.5 py-2 text-xs disabled:opacity-50 ${editing ? 'bg-sky-700 text-white hover:bg-sky-800' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>{editing ? <><Save size={14}/>保存</> : <><Pencil size={14}/>编辑</>}</button>
      {pages.some((item) => item.id === page.id) && <button disabled={busy} onClick={() => void removePage()} title="删除页面" className="rounded p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"><Trash2 size={16}/></button>}
    </header>

    <main className="flex-1 overflow-y-auto p-4 md:p-6">
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {page.widgets.map((widget, widgetIndex) => {
          const Icon = widgetIcon(widget.type);
          const subscription = widget.subscription || defaultSubscription();
          const height = getWidgetHeight(widget);
          return <article key={widget.id} onDragOver={(event) => { if (editing && draggingWidgetId && draggingWidgetId !== widget.id) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTargetWidgetId(widget.id); } }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTargetWidgetId(null); }} onDrop={(event) => handleWidgetDrop(event, widget.id)} className={`min-w-0 overflow-hidden rounded border bg-white transition-colors ${widgetColumnClasses[getWidgetColumnSpan(widget)]} ${dropTargetWidgetId === widget.id ? 'border-sky-500 ring-2 ring-sky-200' : 'border-slate-200'}`}>
            <div className="flex min-h-11 items-center gap-2 border-b border-slate-100 px-3">
              {editing && <>
                <button draggable={page.widgets.length > 1} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', widget.id); setDraggingWidgetId(widget.id); }} onDragEnd={() => { setDraggingWidgetId(null); setDropTargetWidgetId(null); }} title="拖动调整位置" aria-label={`拖动${widget.title}调整位置`} className={`rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 ${draggingWidgetId === widget.id ? 'cursor-grabbing opacity-50' : 'cursor-grab'}`}><GripVertical size={16}/></button>
                <button disabled={widgetIndex === 0} onClick={() => moveWidgetBy(widget.id, -1)} title="上移组件" aria-label="上移组件" className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"><ArrowUp size={14}/></button>
                <button disabled={widgetIndex === page.widgets.length - 1} onClick={() => moveWidgetBy(widget.id, 1)} title="下移组件" aria-label="下移组件" className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"><ArrowDown size={14}/></button>
              </>}
              <Icon size={15} className="shrink-0 text-slate-500"/><h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{widget.title}</h2>
              {subscription.enabled && <span title={`订阅：${intervalLabel(subscription.intervalMinutes)}`} className="inline-flex items-center gap-1 text-[10px] text-slate-500"><Clock3 size={12}/>{intervalLabel(subscription.intervalMinutes)}</span>}
              {subscription.feishuEnabled && <span title="启用飞书推送" className="text-sky-700"><Send size={13}/></span>}
              <button onClick={() => setLogWidgetId(widget.id)} title="查看组件执行日志" className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-sky-700"><ClipboardList size={16}/></button>
              <button onClick={() => setSettingWidgetId(widget.id)} title="组件设置：数据源、订阅与飞书" className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Settings2 size={16}/></button>
              {editing && <button onClick={() => setPage({ ...page, widgets: page.widgets.filter((item) => item.id !== widget.id) })} title="移除组件" className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X size={15}/></button>}
            </div>
            {widget.type === 'async-apex-dashboard' ? widget.accountId ? <div style={{ height }} className="min-h-0"><AsyncApexJobBIDashboard accountId={widget.accountId}/></div> : <div style={{ height }} className="flex items-center justify-center p-6 text-center text-sm text-slate-500">请在组件设置中绑定 Salesforce 账号。</div> : widget.type === 'text' ? <div style={{ height }} className="overflow-auto p-5">{renderWidgetResult(widget, height)}</div> : widget.type === 'custom-html' || widget.type === 'custom-tsx' ? renderWidgetResult(widget, height) : <div style={{ height }} className="min-h-0 overflow-auto">{renderWidgetResult(widget, height)}</div>}
          </article>;
        })}
        {page.widgets.length === 0 && <div className="flex min-h-56 flex-col items-center justify-center rounded border border-dashed border-slate-300 bg-white text-sm text-slate-500 sm:col-span-2 xl:col-span-4"><Plus size={20} className="mb-2"/>{editing ? '使用上方工具栏添加组件' : '此页面暂无组件'}{!editing && <button onClick={() => setEditing(true)} className="mt-3 text-xs font-medium text-sky-700 hover:underline">编辑页面</button>}</div>}
      </div>
    </main>

    {settingWidgetId && page.widgets.find((widget) => widget.id === settingWidgetId) && <WidgetSettingsModal
      key={settingWidgetId}
      widget={page.widgets.find((widget) => widget.id === settingWidgetId)!}
      sources={sources}
      projectPath={activeProject?.localPath}
      busy={busy}
      onClose={() => setSettingWidgetId(null)}
      onSave={(widget) => void saveWidgetSettings(widget)}
      showToast={showToast}
    />}
    {logWidgetId && page.widgets.find((widget) => widget.id === logWidgetId) && <ExecutionLogsModal
      pageId={page.id}
      widget={page.widgets.find((widget) => widget.id === logWidgetId)!}
      onClose={() => setLogWidgetId(null)}
      showToast={showToast}
    />}
  </div>;
};

const PageThumbnail: React.FC<{ page: WorkspacePage }> = ({ page }) => {
  const colors: Record<WorkspaceWidgetType, string> = { text: 'bg-emerald-100', 'crm-query': 'bg-sky-100', 'mail-list': 'bg-amber-100', 'async-apex-dashboard': 'bg-indigo-100', 'custom-html': 'bg-cyan-100', 'custom-tsx': 'bg-violet-100' };
  return <div className="relative h-40 overflow-hidden bg-slate-100 p-3 transition-colors group-hover:bg-slate-50">
    <div className="pointer-events-none absolute inset-x-6 top-4 bottom-3 rounded border border-slate-200 bg-white p-2 shadow-sm">
      <div className="mb-2 flex h-3 items-center gap-1 border-b border-slate-100 pb-1"><span className="h-1.5 w-1.5 rounded-full bg-slate-300"/><span className="h-1.5 w-1.5 rounded-full bg-slate-200"/><span className="ml-2 h-1 w-16 rounded bg-slate-200"/></div>
      {page.widgets.length ? <div className="grid h-[calc(100%-18px)] grid-cols-4 gap-1.5">{page.widgets.slice(0, 4).map((widget) => <div key={widget.id} className={`overflow-hidden rounded-sm border border-slate-100 ${thumbnailColumnClasses[getWidgetColumnSpan(widget)]} ${colors[widget.type]} p-1.5`}><div className="mb-1 h-1 w-1/2 rounded bg-slate-400/40"/>{widget.type === 'text' ? <><div className="mb-1 h-1 w-full rounded bg-slate-400/25"/><div className="h-1 w-4/5 rounded bg-slate-400/25"/></> : <div className="flex h-6 items-end gap-1">{[35, 65, 45, 82, 53].map((height, index) => <i key={index} className="w-1.5 rounded-t bg-slate-500/35" style={{ height: `${height}%` }}/>)}</div>}</div>)}</div> : <div className="flex h-[calc(100%-18px)] items-center justify-center"><LayoutDashboard size={22} className="text-slate-200"/></div>}
    </div>
    <div className="absolute bottom-2 right-3 rounded bg-white/90 px-1.5 py-1 text-[10px] text-slate-500 shadow-sm">{page.widgets.length} 个组件</div>
  </div>;
};

const CustomWidgetFrame: React.FC<{ title: string; content: string; pageId: string; widgetId: string; executionId: string; accountId?: string; height: number }> = ({ title, content, pageId, widgetId, executionId, accountId, height }) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const frameStartedAt = useRef(Date.now());
  const frameLoadLogged = useRef(false);

  useLayoutEffect(() => {
    const pending = new Set<string>();
    const queue: Array<{ requestId: string; query: string; queuedAt: number; reply: (result: unknown, error?: string) => void }> = [];
    const requestTimes: number[] = [];
    const runtimeLogTimes: number[] = [];
    let disposed = false;

    const startQueuedQueries = () => {
      while (!disposed && pending.size < 3 && queue.length) {
        const item = queue.shift()!;
        const now = Date.now();
        while (requestTimes.length && now - requestTimes[0] >= 60_000) requestTimes.shift();
        if (now - item.queuedAt >= 30_000) {
          item.reply(undefined, 'CRM 查询排队超时，请稍后重试');
          continue;
        }
        if (requestTimes.length >= 20) {
          void window.neoApi.workspaceAppendComponentExecutionLog?.(pageId, widgetId, executionId, 'query', 'error', '动态查询被拒绝 · 组件查询频率过高');
          item.reply(undefined, '组件查询频率过高，请稍后重试');
          continue;
        }

        requestTimes.push(now);
        pending.add(item.requestId);
        void (async () => {
          try {
            const queryConnector = window.neoApi.workspaceQueryComponentConnector;
            if (!queryConnector) {
              void window.neoApi.workspaceAppendComponentExecutionLog?.(pageId, widgetId, executionId, 'query', 'error', '动态查询失败 · CRM 查询桥尚未就绪');
              throw new Error('CRM 查询桥尚未就绪');
            }
            const response = await queryConnector(pageId, widgetId, executionId, accountId!, item.query);
            if (!response.success || !response.data) throw new Error(response.error || 'CRM 查询失败');
            item.reply(response.data);
          } catch (error: any) {
            item.reply(undefined, String(error?.message || 'CRM 查询失败').slice(0, 2000));
          } finally {
            pending.delete(item.requestId);
            startQueuedQueries();
          }
        })();
      }
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const message = event.data;
      if (message?.type === 'neoCRM:runtime-log' && typeof message.message === 'string') {
        const now = Date.now();
        while (runtimeLogTimes.length && now - runtimeLogTimes[0] >= 60_000) runtimeLogTimes.shift();
        if (runtimeLogTimes.length >= 20) return;
        runtimeLogTimes.push(now);
        void window.neoApi.workspaceAppendComponentExecutionLog?.(pageId, widgetId, executionId, 'runtime', 'error', message.message.slice(0, 1200), Date.now() - frameStartedAt.current);
        return;
      }
      if (message?.type === 'neoCRM:runtime-ready' && typeof message.message === 'string') {
        void window.neoApi.workspaceAppendComponentExecutionLog?.(pageId, widgetId, executionId, 'runtime', 'success', message.message.slice(0, 1200), Date.now() - frameStartedAt.current);
        return;
      }
      if (message?.type !== 'neoCRM:query' || typeof message.requestId !== 'string' || message.requestId.length > 100) return;
      const reply = (result: unknown, error?: string) => frameRef.current?.contentWindow?.postMessage({ type: 'neoCRM:query:result', requestId: message.requestId, result, error }, '*');
      if (pending.has(message.requestId) || queue.some((item) => item.requestId === message.requestId)) return;
      if (typeof message.query !== 'string' || message.query.length > 20000) {
        void window.neoApi.workspaceAppendComponentExecutionLog?.(pageId, widgetId, executionId, 'query', 'error', '动态查询被拒绝 · 查询内容无效或超过长度限制');
        reply(undefined, '查询内容无效或超过长度限制');
        return;
      }
      if (!accountId) {
        void window.neoApi.workspaceAppendComponentExecutionLog?.(pageId, widgetId, executionId, 'query', 'error', '动态查询被拒绝 · 此组件未绑定 CRM 连接器');
        reply(undefined, '此组件未绑定 CRM 连接器');
        return;
      }
      const now = Date.now();
      while (requestTimes.length && now - requestTimes[0] >= 60_000) requestTimes.shift();
      if (requestTimes.length >= 20) {
        void window.neoApi.workspaceAppendComponentExecutionLog?.(pageId, widgetId, executionId, 'query', 'error', '动态查询被拒绝 · 组件查询频率过高');
        reply(undefined, '组件查询频率过高，请稍后重试');
        return;
      }
      if (queue.length >= 20) {
        void window.neoApi.workspaceAppendComponentExecutionLog?.(pageId, widgetId, executionId, 'query', 'error', '动态查询被拒绝 · 组件查询等待队列已满');
        reply(undefined, '组件查询队列已满，请稍后重试');
        return;
      }
      queue.push({ requestId: message.requestId, query: message.query, queuedAt: now, reply });
      if (pending.size >= 3) {
        void window.neoApi.workspaceAppendComponentExecutionLog?.(pageId, widgetId, executionId, 'query', 'info', `动态查询已进入队列 · 当前 ${queue.length} 条等待，最多 3 条并发`);
      }
      startQueuedQueries();
    };
    window.addEventListener('message', handleMessage);
    return () => {
      disposed = true;
      queue.splice(0).forEach((item) => item.reply(undefined, '组件已关闭，查询已取消'));
      window.removeEventListener('message', handleMessage);
    };
  }, [accountId, executionId, pageId, widgetId]);

  const handleFrameLoad = () => {
    if (frameLoadLogged.current) return;
    frameLoadLogged.current = true;
    void window.neoApi.workspaceAppendComponentExecutionLog?.(pageId, widgetId, executionId, 'render', 'success', 'iframe 文档加载完成', Date.now() - frameStartedAt.current);
  };

  return <iframe ref={frameRef} title={title} sandbox="allow-scripts" srcDoc={content} onLoad={handleFrameLoad} style={{ height }} className="block w-full border-0"/>;
};

const executionStageLabel: Record<WorkspaceExecutionLog['stage'], string> = {
  run: '执行',
  config: '配置',
  load: '加载',
  dependency: '依赖',
  build: '构建',
  style: '样式',
  query: '数据查询',
  render: '页面渲染',
  runtime: '运行时',
};

const ExecutionLogsModal: React.FC<{
  pageId: string;
  widget: WorkspaceWidget;
  onClose: () => void;
  showToast: Props['showToast'];
}> = ({ pageId, widget, onClose, showToast }) => {
  const [logs, setLogs] = useState<WorkspaceExecutionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let initialLoad = true;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const items = await window.neoApi.workspaceListComponentExecutionLogs?.(pageId, widget.id, 500);
        if (!cancelled) setLogs(items || []);
      } catch (error: any) {
        if (!cancelled && initialLoad) showToast('error', error?.message || '读取组件执行日志失败');
      } finally {
        inFlight = false;
        if (initialLoad) {
          initialLoad = false;
          if (!cancelled) setLoading(false);
        }
      }
    };
    setLoading(true);
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [pageId, widget.id, reloadKey]);

  const groups = (() => {
    const grouped = new Map<string, WorkspaceExecutionLog[]>();
    for (const log of logs) {
      const key = log.executionId || 'legacy';
      const group = grouped.get(key) || [];
      group.push(log);
      grouped.set(key, group);
    }
    return [...grouped.entries()].map(([key, items]) => ({
      key,
      logs: items.sort((left, right) => (left.sequence ?? left.timestamp) - (right.sequence ?? right.timestamp) || left.timestamp - right.timestamp),
      latestAt: Math.max(...items.map((item) => item.timestamp)),
    })).sort((left, right) => right.latestAt - left.latestAt);
  })();

  const clearLogs = async () => {
    if (!window.confirm(`清空“${widget.title}”的执行日志？`)) return;
    setClearing(true);
    try {
      await window.neoApi.workspaceClearComponentExecutionLogs?.(pageId, widget.id);
      setLogs([]);
      showToast('success', '组件执行日志已清空');
    } catch (error: any) {
      showToast('error', error?.message || '清空组件执行日志失败');
    } finally {
      setClearing(false);
    }
  };

  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label={`${widget.title}执行日志`} className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded border border-slate-200 bg-white shadow-2xl">
      <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold text-slate-900">组件执行日志</h2><p className="mt-0.5 truncate text-xs text-slate-500">{widget.title} · 最近 500 条，自动刷新</p></div>
        <button onClick={() => setReloadKey((value) => value + 1)} title="刷新日志" className="rounded p-1.5 text-slate-500 hover:bg-slate-100" aria-label="刷新日志"><RefreshCw size={16}/></button>
        <button disabled={clearing || logs.length === 0} onClick={() => void clearLogs()} title="清空此组件日志" className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40" aria-label="清空日志"><Trash2 size={16}/></button>
        <button onClick={onClose} title="关闭" className="rounded p-1.5 text-slate-500 hover:bg-slate-100" aria-label="关闭"><X size={17}/></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? <div className="p-10 text-center text-sm text-slate-400">正在读取日志…</div> : groups.length === 0 ? <div className="p-10 text-center text-sm text-slate-400">暂无执行记录。运行组件后，入口、查询、构建和运行时过程会显示在这里。</div> : <div className="divide-y divide-slate-200">
          {groups.map((group) => {
            const startLog = group.logs[0];
            const endLog = group.logs.find((log) => log.stage === 'run' && log.status !== 'info');
            const isError = endLog?.status === 'error' || group.logs.some((log) => log.status === 'error');
            const trigger = startLog?.trigger === 'manual' ? '手动运行' : startLog?.trigger === 'scheduled' ? '定时任务' : startLog?.trigger === 'preview' ? '预览加载' : '旧版记录';
            const summary = group.logs.find((log) => log.stage === 'run' && log.status !== 'info');
            const waitingForRuntime = group.logs.some((log) => log.stage === 'render' && log.status === 'info')
              && !group.logs.some((log) => log.stage === 'runtime' && log.status === 'success');
            const stateLabel = isError ? '有步骤失败' : waitingForRuntime ? '等待组件挂载' : summary ? '已完成' : '执行中';
            const Icon = isError ? CircleAlert : waitingForRuntime || !summary ? Clock3 : CheckCircle2;
            const tone = isError ? 'text-rose-600' : waitingForRuntime || !summary ? 'text-sky-600' : 'text-emerald-600';
            return <section key={group.key} className="px-5 py-4">
              <div className="flex items-start gap-3">
                <Icon size={16} className={`mt-0.5 shrink-0 ${tone}`}/>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span className="font-semibold text-slate-800">{trigger}</span>
                    <span className={`rounded px-1.5 py-0.5 ${isError ? 'bg-rose-50 text-rose-700' : waitingForRuntime || !summary ? 'bg-sky-50 text-sky-700' : 'bg-emerald-50 text-emerald-700'}`}>{stateLabel}</span>
                    {startLog?.executionId && <span className="font-mono text-slate-400" title={startLog.executionId}>执行 {startLog.executionId.slice(-12)}</span>}
                    {startLog?.batchId && <span className="font-mono text-slate-400" title={startLog.batchId}>批次 {startLog.batchId.slice(-12)}</span>}
                    <time className="text-slate-400">{new Date(startLog?.timestamp || group.latestAt).toLocaleString()}</time>
                    {summary?.durationMs !== undefined && <span className="text-slate-500">总耗时 {summary.durationMs < 1000 ? `${summary.durationMs} ms` : `${(summary.durationMs / 1000).toFixed(1)} s`}</span>}
                  </div>
                  {summary && <p className={`mt-1 text-xs ${isError ? 'text-rose-700' : 'text-slate-600'}`}>{summary.message}</p>}
                  <ol className="mt-3 space-y-2 border-l border-slate-200 pl-4">
                    {group.logs.map((log) => {
                      const RowIcon = log.status === 'error' ? CircleAlert : log.status === 'success' ? CheckCircle2 : Info;
                      const rowTone = log.status === 'error' ? 'text-rose-600' : log.status === 'success' ? 'text-emerald-600' : 'text-slate-400';
                      return <li key={log.id} className="relative flex gap-2.5">
                        <RowIcon size={13} className={`mt-0.5 shrink-0 ${rowTone}`}/>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]"><span className="font-medium text-slate-700">{executionStageLabel[log.stage] || log.stage}</span><span className="text-slate-400">{log.status === 'info' ? '进行中' : log.status === 'success' ? '完成' : '失败'}</span><time className="text-slate-400">{new Date(log.timestamp).toLocaleTimeString()}</time>{log.durationMs !== undefined && <span className="text-slate-400">耗时 {log.durationMs < 1000 ? `${log.durationMs} ms` : `${(log.durationMs / 1000).toFixed(1)} s`}</span>}{log.sequence !== undefined && <span className="font-mono text-slate-300">#{log.sequence}</span>}</div>
                          <p className={`mt-0.5 whitespace-pre-wrap break-words text-xs leading-5 ${log.status === 'error' ? 'text-rose-700' : 'text-slate-600'}`}>{log.message}</p>
                        </div>
                      </li>;
                    })}
                  </ol>
                </div>
              </div>
            </section>;
          })}
        </div>}
      </div>
      <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 text-[11px] text-slate-400"><span>本地保留最近 2,000 条组件执行记录</span><button onClick={onClose} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100">关闭</button></footer>
    </section>
  </div>;
};

interface WidgetSettingsModalProps {
  widget: WorkspaceWidget;
  sources: WorkspaceDataSources;
  projectPath?: string;
  busy: boolean;
  onClose: () => void;
  onSave: (widget: WorkspaceWidget) => void;
  showToast: Props['showToast'];
}

const WidgetSettingsModal: React.FC<WidgetSettingsModalProps> = ({ widget: initialWidget, sources, busy, onClose, onSave, showToast }) => {
  const [widget, setWidget] = useState<WorkspaceWidget>(() => ({ ...initialWidget, columnSpan: getWidgetColumnSpan(initialWidget), height: getWidgetHeight(initialWidget), subscription: initialWidget.subscription || defaultSubscription() }));
  const [feishu, setFeishu] = useState<FeishuWorkspaceSettings>({ configured: false, bots: [] });
  const [componentLibrary, setComponentLibrary] = useState<{ rootPath: string; files: Array<{ relativePath: string; ext: string; size: number }> }>({ rootPath: '', files: [] });
  const subscription = widget.subscription || defaultSubscription();
  const selectedFeishuBotId = subscription.feishuBotId || (feishu.bots.length === 1 ? feishu.bots[0].id : '');
  const patch = (values: Partial<WorkspaceWidget>) => setWidget((current) => ({ ...current, ...values }));
  const patchSubscription = (values: Partial<NonNullable<WorkspaceWidget['subscription']>>) => setWidget((current) => ({ ...current, subscription: { ...(current.subscription || defaultSubscription()), ...values } }));

  useEffect(() => {
    void window.neoApi.feishuGetSettings?.().then((value) => setFeishu(value || { configured: false, bots: [] })).catch((error: any) => showToast('error', error?.message || '读取飞书设置失败'));
  }, []);

  useEffect(() => {
    if (widget.type !== 'custom-html' && widget.type !== 'custom-tsx') return;
    void window.neoApi.workspaceListComponentFiles?.()
      .then((result) => setComponentLibrary(result || { rootPath: '', files: [] }))
      .catch((error: any) => showToast('error', error?.message || '读取应用组件库失败'));
  }, [widget.type]);

  const importComponent = async () => {
    try {
      const result = await window.neoApi.workspaceImportComponentFile?.();
      if (!result || result.canceled || !result.relativePath) return;
      setWidget((current) => ({ ...current, relativePath: result.relativePath, buildStatus: 'pending', buildError: undefined }));
      const library = await window.neoApi.workspaceListComponentFiles?.();
      if (library) setComponentLibrary(library);
      showToast('success', `已导入组件文件：${result.fileName || result.relativePath}`);
    } catch (error: any) {
      showToast('error', error?.message || '导入组件文件失败');
    }
  };

  const isText = widget.type === 'text';
  const isCustom = widget.type === 'custom-html' || widget.type === 'custom-tsx';
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label={`${widget.title}组件设置`} className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded border border-slate-200 bg-white shadow-2xl">
      <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-4"><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold text-slate-900">组件设置</h2><p className="mt-0.5 truncate text-xs text-slate-500">{widget.title} · {widgetTypeLabel(widget.type)}</p></div><button onClick={onClose} title="关闭" className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><X size={17}/></button></header>
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <section className="space-y-3">
          <label className="block text-xs font-medium text-slate-700">组件名称<input value={widget.title} onChange={(event) => patch({ title: event.target.value })} className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"/></label>
          {widget.type === 'text' && <label className="block text-xs font-medium text-slate-700">说明内容<textarea value={widget.text || ''} onChange={(event) => patch({ text: event.target.value })} rows={5} className="mt-1 block w-full resize-y rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"/></label>}
          {widget.type === 'crm-query' && <>
            <label className="block text-xs font-medium text-slate-700">CRM 连接器账号<select value={widget.accountId || ''} onChange={(event) => patch({ accountId: event.target.value })} className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">选择账号</option>{sources.crmAccounts.map((source) => <option key={source.accountId} value={source.accountId}>{source.connectorName}{source.tenantName ? ` · ${source.tenantName}` : ''}</option>)}</select></label>
            <label className="block text-xs font-medium text-slate-700">只读查询<textarea value={widget.query || ''} onChange={(event) => patch({ query: event.target.value })} spellCheck={false} rows={5} className="mt-1 block w-full resize-y rounded border border-slate-300 px-3 py-2 font-mono text-xs leading-5 outline-none focus:border-sky-500" placeholder="SELECT <真实字段> FROM <对象 API 名>"/></label>
          </>}
          {widget.type === 'async-apex-dashboard' && <>
            <label className="block text-xs font-medium text-slate-700">Salesforce 账号<select value={widget.accountId || ''} onChange={(event) => patch({ accountId: event.target.value })} className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">选择 Salesforce 账号</option>{sources.crmAccounts.filter((source) => source.productType === 'salesforce').map((source) => <option key={source.accountId} value={source.accountId}>{source.connectorName}{source.tenantName ? ` · ${source.tenantName}` : ''}</option>)}</select></label>
            <p className="text-xs text-slate-500">只读查询 · 使用 AsyncApexJob 生成 BI 看板。</p>
          </>}
          {widget.type === 'mail-list' && <>
            <label className="block text-xs font-medium text-slate-700">邮箱账号<select value={widget.accountId || ''} onChange={(event) => patch({ accountId: event.target.value })} className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">所有邮箱账号</option>{sources.mailAccounts.map((source) => <option key={source.accountId} value={source.accountId}>{source.name} · {source.email}</option>)}</select></label>
            <label className="block text-xs font-medium text-slate-700">显示数量<input type="number" min={1} max={50} value={widget.limit || 10} onChange={(event) => patch({ limit: Math.max(1, Math.min(50, Number(event.target.value) || 1)) })} className="mt-1 block w-36 rounded border border-slate-300 px-3 py-2 text-sm"/></label>
          </>}
          {isCustom && <>
            <div className="flex items-end gap-2"><label className="block min-w-0 flex-1 text-xs font-medium text-slate-700">应用组件库路径
              <input list="workspace-component-files" value={widget.relativePath || ''} onChange={(event) => patch({ relativePath: event.target.value, buildStatus: 'pending', buildError: undefined })} placeholder={widget.type === 'custom-html' ? '例如: chip-dashboard/index.html' : '例如: chip-dashboard/src/Dashboard.tsx'} className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs outline-none focus:border-sky-500"/>
            </label>
              <button type="button" onClick={() => void importComponent()} title="从电脑导入组件入口文件" className="inline-flex h-[38px] shrink-0 items-center gap-1.5 rounded border border-slate-200 px-3 text-xs text-slate-700 hover:bg-slate-50"><Upload size={14}/>导入文件</button></div>
            <datalist id="workspace-component-files">{componentLibrary.files.filter((file) => widget.type === 'custom-html' ? ['.html', '.htm'].includes(file.ext) : ['.tsx', '.ts', '.jsx', '.js'].includes(file.ext)).map((file) => <option key={file.relativePath} value={file.relativePath}/>)}</datalist>
            <p className="text-xs leading-5 text-slate-500">应用组件目录：<code className="break-all text-slate-700">{componentLibrary.rootPath || '正在读取…'}</code><br/>{widget.type === 'custom-tsx' ? '支持 TSX/TS/JSX/JS。TSX/JSX 可默认导出 React 组件；TS/JS 可默认导出 React 组件，或导出 mount(root, context) 函数。' : 'HTML 会在隔离的沙箱 iframe 中预览。配套文件请放在同一组件包目录。'}</p>
            <label className="block text-xs font-medium text-slate-700">CRM 连接器账号
              <select value={widget.accountId || ''} onChange={(event) => {
                const source = sources.crmAccounts.find((item) => item.accountId === event.target.value);
                patch({ accountId: event.target.value || undefined, connectorId: source?.connectorId, buildStatus: 'pending', buildError: undefined });
              }} className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">不绑定 CRM 数据</option>
                {sources.crmAccounts.map((source) => <option key={source.accountId} value={source.accountId}>{source.connectorName} · {crmProductLabel(source.productType)}{source.tenantName ? ` · ${source.tenantName}` : ''}</option>)}
              </select>
            </label>
            {(widget.accountId || widget.query) && <label className="block text-xs font-medium text-slate-700">初始只读查询（可选）
              <textarea value={widget.query || ''} onChange={(event) => patch({ query: event.target.value, buildStatus: 'pending', buildError: undefined })} spellCheck={false} rows={5} placeholder="SELECT <真实字段> FROM <对象 API 名>" className="mt-1 block w-full resize-y rounded border border-slate-300 px-3 py-2 font-mono text-xs leading-5 outline-none focus:border-sky-500"/>
            </label>}
            <p className="rounded border border-sky-100 bg-sky-50 p-3 text-xs leading-5 text-sky-900">未写 LIMIT 时，连接器会使用平台分页能力读取当前账号可访问的全部结果；如需缩小结果集，可在只读 SELECT 中自行指定 LIMIT。初始结果可从 <code>window.neoCRMData</code> 读取；组件运行时可调用 <code>await window.neoCRM.query('SELECT ...')</code> 查询当前绑定账号。仅传查询结果，不传 Token。</p>
            {widget.buildError && <p className="whitespace-pre-wrap text-xs text-rose-700">上次构建错误：{widget.buildError}</p>}
          </>}
        </section>

        <section className="space-y-3 border-t border-slate-100 pt-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><LayoutDashboard size={16} className="text-slate-500"/>组件布局</div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-slate-700">宽度<select value={getWidgetColumnSpan(widget)} onChange={(event) => patch({ columnSpan: Number(event.target.value) as WorkspaceWidgetColumnSpan })} className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"><option value={1}>1/4 行宽</option><option value={2}>1/2 行宽</option><option value={3}>3/4 行宽</option><option value={4}>整行</option></select></label>
            <label className="block text-xs text-slate-700">内容高度<select value={getWidgetHeight(widget)} onChange={(event) => patch({ height: Number(event.target.value) as WorkspaceWidgetHeight })} className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"><option value={320}>320 px</option><option value={480}>480 px</option><option value={640}>640 px</option><option value={800}>800 px</option></select></label>
          </div>
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
