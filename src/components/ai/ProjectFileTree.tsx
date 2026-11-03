import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Download, ExternalLink, Eye, File, FileCode, FileSpreadsheet, FileText,
  Folder, FolderOpen, Image, Plus, RefreshCw, Search, X } from 'lucide-react';
import type { ProjectDirectoryResult, ProjectDirNode } from '../../../shared/types';
import { flattenProjectTree, projectTreeWindow } from './projectFileTreeModel';

interface Props {
  projectPath: string;
  projectName: string;
  refreshVersion: string;
  isPullingCode: boolean;
  onPullProjectCode: () => void;
  onPreviewFile: (name: string, path: string) => void;
  onOpenFile: (path: string) => void;
  onRevealFile: (path: string) => void;
  onAttachFile?: (file: { name: string; fullPath: string }) => void;
}

const ROW_HEIGHT = 28;
const fileIcon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['ts', 'tsx', 'js', 'jsx', 'py'].includes(ext || '')) return <FileCode className="w-4 h-4 text-sky-500 shrink-0" />;
  if (ext === 'json') return <FileCode className="w-4 h-4 text-emerald-500 shrink-0" />;
  if (['csv', 'xlsx', 'xls'].includes(ext || '')) return <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />;
  if (['md', 'txt', 'doc', 'docx'].includes(ext || '')) return <FileText className="w-4 h-4 text-slate-500 shrink-0" />;
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext || '')) return <Image className="w-4 h-4 text-purple-500 shrink-0" />;
  return <File className="w-4 h-4 text-slate-400 shrink-0" />;
};

export const ProjectFileTree: React.FC<Props> = ({ projectPath, projectName, refreshVersion, isPullingCode,
  onPullProjectCode, onPreviewFile, onOpenFile, onRevealFile, onAttachFile }) => {
  const [directories, setDirectories] = useState(new Map<string, ProjectDirNode[]>());
  const directoryRef = useRef(directories);
  const [expanded, setExpanded] = useState(new Set<string>());
  const expandedRef = useRef(expanded);
  const [errors, setErrors] = useState(new Map<string, string>());
  const [loading, setLoading] = useState(new Set<string>());
  const generation = useRef(0);
  const pending = useRef(new Map<string, Promise<ProjectDirNode[] | undefined>>());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshRun = useRef<{ again: boolean } | null>(null);
  const [searchText, setSearchText] = useState('');
  const query = searchText.trim();
  const [searchRevision, setSearchRevision] = useState(0);
  const [searchState, setSearchState] = useState<{ query: string; loading: boolean; result?: ProjectDirectoryResult; error?: string }>({ query: '', loading: false });
  const [searchCollapsed, setSearchCollapsed] = useState(new Set<string>());
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 600 });
  const normalScroll = useRef(0);

  const readDirectory = useCallback((directoryPath: string, force: boolean, epoch: number): Promise<ProjectDirNode[] | undefined> => {
    const existing = pending.current.get(directoryPath);
    if (existing) return existing;
    setLoading((previous) => new Set(previous).add(directoryPath));
    const request = Promise.resolve().then(async () => {
      try {
        if (!window.neoApi?.projectReadDirectory) throw new Error('文件读取接口未就绪，请重新启动应用');
        const result = await window.neoApi.projectReadDirectory({ folderPath: projectPath, directoryPath, force });
        if (generation.current !== epoch) return;
        const next = new Map(directoryRef.current).set(directoryPath, result.nodes);
        directoryRef.current = next;
        setDirectories(next);
        setErrors((previous) => { const next = new Map(previous); next.delete(directoryPath); return next; });
        return result.nodes;
      } catch (error) {
        if (generation.current === epoch) {
          setErrors((previous) => new Map(previous).set(directoryPath, error instanceof Error ? error.message : String(error)));
        }
      } finally {
        if (generation.current === epoch) {
          pending.current.delete(directoryPath);
          setLoading((previous) => { const next = new Set(previous); next.delete(directoryPath); return next; });
        }
      }
    });
    pending.current.set(directoryPath, request);
    return request;
  }, [projectPath]);

  useEffect(() => {
    const epoch = ++generation.current;
    directoryRef.current = new Map();
    expandedRef.current = new Set();
    pending.current.clear();
    refreshRun.current = null;
    setDirectories(new Map()); setExpanded(new Set()); setErrors(new Map()); setLoading(new Set());
    setSearchText(''); normalScroll.current = 0;
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
    if (projectPath) void readDirectory(projectPath, false, epoch).then(async (nodes) => {
      if (!nodes || generation.current !== epoch) return;
      const folders = nodes.filter((node) => node.type === 'directory');
      const defaults = folders.length <= 12 ? folders : folders.filter((node) => node.name === 'neocrm-src');
      expandedRef.current = new Set([...expandedRef.current, ...defaults.map((node) => node.path)]);
      setExpanded(expandedRef.current);
      await Promise.all(defaults.map((node) => readDirectory(node.path, false, epoch)));
    });
    return () => { generation.current++; if (refreshTimer.current) clearTimeout(refreshTimer.current); refreshTimer.current = null; };
  }, [projectPath, readDirectory]);

  const refresh = useCallback(async function refreshTree() {
    if (!projectPath) return;
    if (refreshRun.current) { refreshRun.current.again = true; return; }
    const running = { again: false };
    refreshRun.current = running;
    const epoch = ++generation.current;
    pending.current.clear();
    setLoading(new Set());
    setErrors(new Map());
    // Keep expanded branches and their old rows visible while replacement listings arrive.
    const paths = [projectPath, ...expandedRef.current];
    directoryRef.current = new Map([...directoryRef.current].filter(([path]) => paths.includes(path)));
    setDirectories(directoryRef.current);
    setSearchRevision((value) => value + 1);
    try {
      for (let index = 0; index < paths.length && generation.current === epoch; index += 8) {
        await Promise.all(paths.slice(index, index + 8).map((path) => readDirectory(path, true, epoch)));
      }
    } finally {
      if (refreshRun.current === running) {
        refreshRun.current = null;
        if (running.again && generation.current === epoch) void refreshTree();
      }
    }
  }, [projectPath, readDirectory]);

  const lastActivity = useRef({ projectPath, refreshVersion });
  useEffect(() => {
    const changed = lastActivity.current.projectPath === projectPath && lastActivity.current.refreshVersion !== refreshVersion;
    lastActivity.current = { projectPath, refreshVersion };
    // Coalesce activity without resetting the timer on every tool event.
    if (changed && !refreshTimer.current) refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      void refresh();
    }, 750);
  }, [projectPath, refreshVersion, refresh]);

  useEffect(() => {
    let cancelled = false;
    if (!query || !projectPath) { setSearchState({ query: '', loading: false }); return; }
    setSearchState((previous) => ({ query, loading: true, result: previous.query === query ? previous.result : undefined }));
    const timer = setTimeout(async () => {
      try {
        const result = await window.neoApi.projectReadDirectory({ folderPath: projectPath, query, force: true });
        if (!cancelled) setSearchState({ query, loading: false, result });
      } catch (error) {
        if (!cancelled) setSearchState({ query, loading: false, error: error instanceof Error ? error.message : String(error) });
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [projectPath, query, searchRevision]);

  useLayoutEffect(() => {
    setSearchCollapsed(new Set());
    const element = viewportRef.current;
    if (element) { element.scrollTop = query ? 0 : normalScroll.current; setViewport((previous) => ({ ...previous, top: element.scrollTop })); }
  }, [query]);

  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewport({ top: element.scrollTop, height: element.clientHeight }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const rows = useMemo(() => flattenProjectTree(
    query ? (searchState.query === query ? searchState.result?.nodes || [] : []) : directories.get(projectPath) || [],
    directories, expanded, errors, query ? searchCollapsed : undefined,
  ), [query, searchState, directories, projectPath, expanded, errors, searchCollapsed]);
  const range = projectTreeWindow(rows.length, viewport.top, viewport.height);
  const rootError = query ? searchState.error : errors.get(projectPath);
  const busy = query ? searchState.loading || searchState.query !== query : loading.has(projectPath);

  const toggle = (node: ProjectDirNode) => {
    if (query) {
      setSearchCollapsed((previous) => { const next = new Set(previous); next.has(node.path) ? next.delete(node.path) : next.add(node.path); return next; });
      return;
    }
    const next = new Set(expandedRef.current);
    if (next.has(node.path)) next.delete(node.path);
    else {
      next.add(node.path);
      if (!directoryRef.current.has(node.path) || errors.has(node.path)) void readDirectory(node.path, false, generation.current);
    }
    expandedRef.current = next;
    setExpanded(next);
  };

  return <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden" data-testid="project-file-tree">
    <div className="p-2 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50 shrink-0">
      <div className="relative flex-1 min-w-0">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
        <input aria-label="搜索项目文件" placeholder="搜索项目文件..." value={searchText} onChange={(event) => setSearchText(event.target.value)}
          className="w-full pl-7 pr-7 py-1 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-amber-400" />
        {searchText && <button title="清除搜索" onClick={() => setSearchText('')} className="absolute right-1 top-1 p-0.5 text-slate-400 hover:text-slate-700"><X className="w-3.5 h-3.5" /></button>}
      </div>
      <button onClick={onPullProjectCode} disabled={isPullingCode || !projectPath} title="拉取当前 CRM 环境的代码与元数据"
        className="p-1.5 rounded-lg border border-slate-200 hover:bg-amber-50 text-slate-500 hover:text-amber-600 cursor-pointer shrink-0 disabled:opacity-50">
        <Download className={`w-3.5 h-3.5 ${isPullingCode ? 'animate-bounce text-amber-600' : ''}`} />
      </button>
      <button onClick={() => void refresh()} disabled={busy || !projectPath} title="刷新目录，保留展开位置"
        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-500 cursor-pointer shrink-0 disabled:opacity-50">
        <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin text-amber-600' : ''}`} />
      </button>
    </div>
    <div className="px-3 py-2 border-b border-slate-100 shrink-0 text-[10px] text-slate-400">
      <div className="truncate font-mono" title={projectPath}>📁 {projectName} {projectPath && `(${projectPath})`}</div>
      <div className="mt-1" aria-live="polite">{busy ? (query ? '正在搜索所有子目录…' : '正在读取目录…') : `${rows.filter((row) => row.node).length.toLocaleString()} 项${query ? '匹配内容（含所在目录）' : '已展开内容'}`}</div>
    </div>
    {rootError && <div role="alert" className="px-3 py-2 text-xs text-red-600 bg-red-50 break-all shrink-0">
      读取失败：{rootError} <button onClick={() => void refresh()} className="underline">重试</button>
    </div>}
    {!!searchState.result?.errors.length && query && <div role="alert" className="px-3 py-2 text-xs text-amber-700 bg-amber-50 shrink-0"
      title={searchState.result.errors.map((error) => `${error.path}: ${error.message}`).join('\n')}>
      {searchState.result.errors.length} 个目录读取失败，搜索结果可能不完整。<button onClick={() => void refresh()} className="underline">重试</button>
    </div>}
    <div ref={viewportRef} role="tree" aria-label="项目文件" aria-busy={busy} data-testid="project-file-tree-scroll"
      className="flex-1 min-h-0 overflow-auto px-2" onScroll={(event) => {
        const element = event.currentTarget;
        if (!query) normalScroll.current = element.scrollTop;
        setViewport({ top: element.scrollTop, height: element.clientHeight });
      }}>
      {!rows.length ? <div className="py-12 text-center text-xs text-slate-400">
        {busy ? <span className="inline-flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" />{query ? '正在搜索…' : '正在读取目录…'}</span>
          : rootError ? '请重试读取目录' : !projectPath ? '请先选择项目目录' : query ? '没有找到匹配的文件或目录' : '此目录为空'}
        {!busy && !rootError && !query && projectPath && <button onClick={onPullProjectCode} disabled={isPullingCode}
          className="mx-auto mt-3 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg text-xs flex items-center gap-1.5 cursor-pointer">
          <Download className={`w-3.5 h-3.5 ${isPullingCode ? 'animate-bounce' : ''}`} />
          {isPullingCode ? '正在拉取代码与元数据…' : '拉取代码与元数据'}
        </button>}
      </div> : <div style={{ height: range.totalHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: range.offset, left: 0, right: 0 }}>
          {rows.slice(range.start, range.end).map((row) => {
            const node = row.node;
            if (!node) return <div key={row.key} style={{ height: ROW_HEIGHT, paddingLeft: row.depth * 14 + 8 }} className="flex items-center text-[11px] text-slate-400">
              {row.kind === 'error' ? <button title={row.message} onClick={() => void readDirectory(row.directoryPath!, true, generation.current)} className="text-red-500 truncate">读取失败，点击重试</button>
                : row.kind === 'empty' ? '空目录' : <span className="inline-flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" />正在读取…</span>}
            </div>;
            const isFolder = node.type === 'directory';
            return <div key={row.key} role="treeitem" aria-level={row.depth + 1} aria-expanded={isFolder ? row.expanded : undefined}
              data-path={node.path} tabIndex={0} title={node.relativePath}
              style={{ height: ROW_HEIGHT, paddingLeft: row.depth * 14 + 8 }}
              className={`group flex items-center justify-between pr-2 rounded-lg text-xs hover:bg-slate-100/90 focus-visible:outline-amber-400 cursor-pointer select-none ${isFolder ? 'text-slate-800 font-medium' : 'text-slate-600'}`}
              onClick={() => isFolder ? toggle(node) : onPreviewFile(node.name, node.path)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); isFolder ? toggle(node) : onPreviewFile(node.name, node.path); }
                if (isFolder && ((event.key === 'ArrowRight' && !row.expanded) || (event.key === 'ArrowLeft' && row.expanded))) { event.preventDefault(); toggle(node); }
              }}>
              <div className="flex items-center gap-1.5 min-w-0 pr-1">
                {isFolder ? <><ChevronRight className={`w-3 h-3 text-slate-400 shrink-0 ${row.expanded ? 'rotate-90' : ''}`} />
                  {row.expanded ? <FolderOpen className="w-4 h-4 text-amber-600 shrink-0" /> : <Folder className="w-4 h-4 text-amber-500 shrink-0" />}</> : fileIcon(node.name)}
                <span className="truncate">{node.name}</span>
                {isFolder && row.childCount !== undefined && <span className="text-[10px] text-slate-400 font-mono font-normal shrink-0">({row.childCount.toLocaleString()})</span>}
                {loading.has(node.path) && <RefreshCw className="w-3 h-3 animate-spin text-amber-500 shrink-0" />}
              </div>
              <div className="hidden group-hover:flex group-focus-within:flex items-center gap-1 shrink-0">
                {!isFolder && onAttachFile && <button title="在对话中引用 (@)" className="p-1 hover:bg-slate-200 rounded text-slate-500" onClick={(event) => { event.stopPropagation(); onAttachFile({ name: node.name, fullPath: node.path }); }}><Plus className="w-3 h-3" /></button>}
                {!isFolder && <button title="用系统默认应用打开" className="p-1 hover:bg-slate-200 rounded text-slate-500" onClick={(event) => { event.stopPropagation(); onOpenFile(node.path); }}><Eye className="w-3 h-3" /></button>}
                <button title="在系统访达/资源管理器中显示" className="p-1 hover:bg-slate-200 rounded text-slate-500" onClick={(event) => { event.stopPropagation(); onRevealFile(node.path); }}><ExternalLink className="w-3 h-3" /></button>
              </div>
            </div>;
          })}
        </div>
      </div>}
    </div>
  </div>;
};
