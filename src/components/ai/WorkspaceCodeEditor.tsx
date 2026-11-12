import React, { useEffect, useRef, useState } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { basicSetup } from 'codemirror';
import { indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { sql } from '@codemirror/lang-sql';
import { markdown } from '@codemirror/lang-markdown';
import { Code2, ExternalLink, FileCode2, RefreshCw, Save, X } from 'lucide-react';
import type { ProjectTextFile } from '../../../shared/editorTypes';
import { ProjectFileTree } from './ProjectFileTree';

interface Document extends ProjectTextFile { root: string; savedContent: string; }
interface Props {
  root: string;
  name: string;
  refreshVersion: string;
  isPullingCode?: boolean;
  onPullProjectCode?: () => void;
  onOpenFile: (path: string) => void;
  onRevealFile: (path: string) => void;
  onAttachFile?: (file: { name: string; fullPath: string; relativePath?: string; isDirectory?: boolean }) => void;
}

const EXPLORER_WIDTH_KEY = 'neocrm.workspace.explorer-width';
const EXPLORER_MIN_WIDTH = 200;
const EXPLORER_MAX_WIDTH = 520;
const EDITOR_MIN_WIDTH = 260;
const readExplorerWidth = () => {
  try {
    const stored = Number(window.localStorage.getItem(EXPLORER_WIDTH_KEY));
    if (stored >= EXPLORER_MIN_WIDTH && stored <= EXPLORER_MAX_WIDTH) return stored;
  } catch {}
  return 300;
};

const language = (file: string) => /\.[cm]?[jt]sx?$/i.test(file) ? javascript({ typescript: /\.[cm]?tsx?$/i.test(file), jsx: /\.[jt]sx$/i.test(file) })
  : /\.json$/i.test(file) ? json() : /\.sql$/i.test(file) ? sql() : /\.md$/i.test(file) ? markdown() : [];
const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier], color: 'var(--code-keyword)' },
  { tag: [tags.string, tags.regexp], color: 'var(--code-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--code-number)' },
  { tag: [tags.comment, tags.meta], color: 'var(--theme-text-tertiary)' },
  { tag: [tags.function(tags.variableName), tags.typeName, tags.tagName], color: 'var(--code-function)' },
]);

export default function WorkspaceCodeEditor(props: Props) {
  const { root, name } = props;
  const [documents, setDocuments] = useState<Document[]>([]);
  const documentsRef = useRef(documents); documentsRef.current = documents;
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [error, setError] = useState<{ message: string; path: string; root: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [explorerWidth, setExplorerWidth] = useState(readExplorerWidth);
  const [renderedExplorerWidth, setRenderedExplorerWidth] = useState(explorerWidth);
  const workbench = useRef<HTMLDivElement>(null);
  const explorer = useRef<HTMLElement>(null);
  const resizingExplorer = useRef(false);
  const explorerWidthRef = useRef(explorerWidth);
  const savingRef = useRef(false);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const editable = useRef(new Compartment());
  const states = useRef(new Map<string, EditorState>());
  const openVersion = useRef(0);
  const saveRef = useRef<() => void>(() => {});
  const tabs = documents.filter(document => document.root === root);
  const active = tabs.find(document => document.path === selected[root]) || tabs[0];
  const activeRef = useRef(active); activeRef.current = active;
  const currentRoot = useRef(root); currentRoot.current = root;
  const identity = (document: { root: string; path: string }) => JSON.stringify([document.root, document.path]);

  const resizeExplorer = (width: number) => {
    const available = (workbench.current?.clientWidth || 820) - EDITOR_MIN_WIDTH;
    const next = Math.round(Math.max(EXPLORER_MIN_WIDTH, Math.min(EXPLORER_MAX_WIDTH, available, width)));
    explorerWidthRef.current = next;
    setExplorerWidth(next);
  };
  const persistExplorerWidth = () => {
    try { window.localStorage.setItem(EXPLORER_WIDTH_KEY, String(explorerWidthRef.current)); } catch {}
  };
  const finishExplorerResize = () => {
    if (!resizingExplorer.current) return;
    resizingExplorer.current = false;
    persistExplorerWidth();
  };

  useEffect(() => {
    if (!explorer.current) return;
    const observer = new ResizeObserver(([entry]) => setRenderedExplorerWidth(Math.round(entry.borderBoxSize[0]?.inlineSize || entry.contentRect.width)));
    observer.observe(explorer.current);
    return () => observer.disconnect();
  }, []);

  const open = async (file: string, reload = false) => {
    const existing = documentsRef.current.find(document => document.root === root && document.path === file);
    if (reload && savingRef.current) return;
    if (existing && reload && existing.content !== existing.savedContent && !window.confirm('重新读取会替换该文件的未保存草稿。是否继续？')) return;
    const version = ++openVersion.current;
    setError(null);
    if (existing && !reload) { setSelected(previous => ({ ...previous, [root]: file })); setLoading(false); return; }
    setLoading(true);
    try {
      const result = await window.neoApi.editorRead(root, file);
      if (version !== openVersion.current || currentRoot.current !== root) return;
      const document = { ...result, root, savedContent: result.content };
      states.current.delete(identity(document));
      setDocuments(previous => [...previous.filter(item => !(item.path === file && item.root === root)), document]);
      setSelected(previous => ({ ...previous, [root]: file }));
    } catch (err: any) { if (version === openVersion.current) setError({ message: err.message || '读取文件失败', path: file, root }); }
    finally { if (version === openVersion.current) setLoading(false); }
  };

  const save = async () => {
    const document = activeRef.current;
    if (!document || savingRef.current || document.content === document.savedContent) return;
    savingRef.current = true; setSaving(true); setError(null);
    try {
      const result = await window.neoApi.editorSave(document.root, document.path, document.content, document.revision);
      setDocuments(previous => previous.map(item => item.path === document.path && item.root === document.root
        ? { ...item, revision: result.revision, savedContent: document.content } : item));
    } catch (err: any) { setError({ message: err.message || '保存失败，草稿已保留', path: document.path, root: document.root }); }
    finally { savingRef.current = false; setSaving(false); }
  };
  saveRef.current = () => { void save(); };

  useEffect(() => {
    if (!host.current || !active) return;
    const document = active;
    const key = identity(document);
    const state = states.current.get(key) || EditorState.create({ doc: document.content,
      extensions: [basicSetup, editable.current.of([EditorState.readOnly.of(false), EditorView.editable.of(true)]), language(document.path), syntaxHighlighting(highlight), keymap.of([
        { key: 'Mod-s', run: () => { saveRef.current(); return true; } }, indentWithTab,
      ]), EditorView.theme({ '&': { height: '100%', fontSize: '12px', color: 'var(--theme-text-primary)', backgroundColor: 'var(--theme-bg-layer-1)' },
        '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: '1.7' },
        '.cm-content': { caretColor: 'var(--theme-accent)', padding: '12px 0' },
        '.cm-cursor': { borderLeftColor: 'var(--theme-accent)' },
        '.cm-gutters': { backgroundColor: 'var(--theme-bg-layer-1)', color: 'var(--theme-text-tertiary)', borderRight: '1px solid var(--theme-border)' },
        '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--theme-hover-1)' },
        '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'color-mix(in srgb, var(--theme-accent) 23%, transparent)' },
        '&.cm-focused': { outline: 'none' } }),
      EditorView.contentAttributes.of({ 'aria-label': `编辑 ${document.relativePath}` }),
      EditorView.updateListener.of(update => {
        states.current.set(key, update.state);
        if (!update.docChanged) return;
        const ending = documentsRef.current.find(item => identity(item) === key)?.lineEnding || document.lineEnding;
        const content = update.state.doc.toString().replace(/\n/g, ending);
        setDocuments(previous => previous.map(item => identity(item) === key ? { ...item, content } : item));
      })],
    });
    const editor = new EditorView({ parent: host.current, state });
    view.current = editor;
    return () => { states.current.set(key, editor.state); editor.destroy(); view.current = null; };
  }, [active?.path, active?.root]);

  // A disk reload updates an existing view; ordinary saves keep undo and selection intact.
  useEffect(() => {
    const editor = view.current;
    if (active && editor && editor.state.doc.toString() !== active.content.replace(/\r\n/g, '\n')) editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: active.content } });
  }, [active?.revision]);
  useEffect(() => { view.current?.dispatch({ effects: editable.current.reconfigure([EditorState.readOnly.of(loading), EditorView.editable.of(!loading)]) }); }, [loading, active?.path, active?.root]);
  useEffect(() => { openVersion.current++; setError(null); setLoading(false); }, [root]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (documentsRef.current.some(document => document.content !== document.savedContent)) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  const close = (document: Document) => {
    if (savingRef.current) return;
    if (document.content !== document.savedContent && !window.confirm(`关闭 ${document.relativePath} 并放弃未保存的修改？`)) return;
    setDocuments(previous => previous.filter(item => item !== document));
    // Cleanup runs after the active editor unmounts and stores its final state.
    requestAnimationFrame(() => { states.current.delete(identity(document)); });
  };
  const selectTab = (path: string) => { openVersion.current++; setLoading(false); setError(null); setSelected(previous => ({ ...previous, [root]: path })); };

  return <div className="code-workbench" ref={workbench} style={{ '--explorer-width': `${explorerWidth}px` } as React.CSSProperties}>
    <aside className="code-explorer" ref={explorer} aria-label="项目文件目录"><ProjectFileTree projectPath={root} projectName={name} refreshVersion={props.refreshVersion}
      isPullingCode={props.isPullingCode ?? false} onPullProjectCode={props.onPullProjectCode} onPreviewFile={(_, path) => { void open(path); }}
      activePath={active?.path} onOpenFile={props.onOpenFile} onRevealFile={props.onRevealFile} onAttachFile={props.onAttachFile} />
      <div className="code-explorer-resize" role="separator" tabIndex={0} aria-label="调整文件目录宽度" aria-orientation="vertical"
        aria-valuemin={EXPLORER_MIN_WIDTH} aria-valuemax={Math.max(EXPLORER_MIN_WIDTH, Math.min(EXPLORER_MAX_WIDTH, (workbench.current?.clientWidth || 820) - EDITOR_MIN_WIDTH))}
        aria-valuenow={renderedExplorerWidth} title="拖动调整目录宽度，双击恢复默认"
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.preventDefault();
          resizingExplorer.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }} onPointerMove={event => {
          if (!resizingExplorer.current || !workbench.current) return;
          resizeExplorer(event.clientX - workbench.current.getBoundingClientRect().left);
        }} onPointerUp={finishExplorerResize} onPointerCancel={finishExplorerResize} onLostPointerCapture={finishExplorerResize}
        onDoubleClick={() => { resizeExplorer(300); persistExplorerWidth(); }} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          resizeExplorer(event.key === 'Home' ? EXPLORER_MIN_WIDTH : event.key === 'End' ? EXPLORER_MAX_WIDTH : renderedExplorerWidth + (event.key === 'ArrowLeft' ? -20 : 20));
          persistExplorerWidth();
        }} />
    </aside>
    <section className="code-document" aria-label="文件编辑器" aria-busy={loading}>
      <div className="code-tabs" role="tablist" aria-label="已打开的文件">
        {tabs.map((document, index) => <div key={document.path} className={`code-tab ${active?.path === document.path ? 'is-active' : ''}`}>
          <button role="tab" tabIndex={active?.path === document.path ? 0 : -1} aria-selected={active?.path === document.path} title={document.relativePath}
            onClick={() => selectTab(document.path)} onKeyDown={event => {
              if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
                event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
                selectTab(tabs[next].path); (event.currentTarget.closest('[role=tablist]')?.querySelectorAll('[role=tab]')[next] as HTMLElement)?.focus();
              }
            }}>
            <FileCode2 size={13} /><span>{document.path.split(/[/\\]/).pop()}</span>{document.content !== document.savedContent && <span aria-label="有未保存的修改" className="code-dirty" />}
          </button><button className="code-tab-close" disabled={saving} aria-label={`关闭 ${document.relativePath}`} onClick={() => close(document)}><X size={12} /></button>
        </div>)}
      </div>
      {error?.root === root && <div className="workbench-error" role="alert"><span>{error.message}</span><button onClick={() => props.onOpenFile(error.path)}><ExternalLink size={12} />系统应用打开</button></div>}
      {loading && <div className="code-loading" role="status">正在读取文件…</div>}
      {active ? <>
        <div className="code-toolbar"><span title={active.relativePath}>{active.relativePath}</span>
          <button title="重新读取磁盘文件" aria-label="重新读取磁盘文件" disabled={loading || saving} onClick={() => { void open(active.path, true); }}><RefreshCw size={13} /></button>
          <button disabled={saving || loading || active.content === active.savedContent} onClick={() => { void save(); }} title="保存 (⌘S / Ctrl+S)"><Save size={13} />{saving ? '保存中' : '保存'}</button></div>
        <div className="code-editor-host" ref={host} />
        <div className="code-status"><span>{active.content !== active.savedContent ? '有未保存的修改' : '已保存到本地'}</span><span>UTF-8 · {active.lineEnding === '\r\n' ? 'CRLF' : 'LF'} · {active.content.split('\n').length} 行</span></div>
      </> : <div className="code-editor-empty"><Code2 size={30} strokeWidth={1.3} /><h3>{root ? '打开文件，开始编辑' : '选择一个本地项目'}</h3><p>{root ? '在左侧选择文件。支持多文件标签、语法高亮和 ⌘S / Ctrl+S 保存。' : '在项目侧栏点击“＋”关联文件夹，即可浏览和编辑代码。'}</p></div>}
    </section>
  </div>;
}
