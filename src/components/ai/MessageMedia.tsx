import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, ChevronDown, ChevronRight, Code2, Download, ExternalLink, ImageOff, Loader2, Maximize2, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { MessageFilePreview, MessagePreviewRequest, MindMapSheet, MindMapTopic } from '../../../shared/messagePreview';
import { isLocalSource, mediaKind, safeRemoteUrl } from './messageMediaModel';
import './messageMedia.css';
import { exportSvgDiagram, matchesDiagramSource, prepareSvgDiagram, type SvgDiagram } from './svgDiagram';

export const MessageMediaContext = createContext<Omit<MessagePreviewRequest, 'source'>>({});

function Status({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <span className={`message-media__status ${error ? 'message-media__status--error' : ''}`} role={error ? 'alert' : 'status'}>
    {error ? <ImageOff size={16} /> : <Loader2 size={16} className="animate-spin" />}<span>{children}</span>
  </span>;
}

function MediaFrame({ title, source, actions, children }: { title: string; source?: string; actions?: React.ReactNode; children: (zoom: number) => React.ReactNode }) {
  const [showSource, setShowSource] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (expanded) dialog.current?.showModal();
    else dialog.current?.close();
  }, [expanded]);
  const controls = (large: boolean) => <span className="message-media__toolbar">
    <span className="message-media__title" title={title}>{title}</span>
    <span className="message-media__actions">
      {actions}
      {source && <button type="button" onClick={() => setShowSource(!showSource)} aria-pressed={showSource} title={showSource ? '查看图形' : '查看源码'}><Code2 size={14} /><span>{showSource ? '图形' : '源码'}</span></button>}
      {source && <button type="button" title="复制图表源码" onClick={async () => {
        try {
          if (window.neoApi?.clipboardWriteText) await window.neoApi.clipboardWriteText(source);
          else await navigator.clipboard.writeText(source);
          setCopied(true);
        } catch { setShowSource(true); }
      }}>{copied ? <Check size={14} /> : <Copy size={14} />}<span>{copied ? '已复制' : '复制'}</span></button>}
      <button type="button" onClick={() => setZoom(value => Math.max(0.25, value - 0.25))} disabled={zoom <= 0.25} title="缩小" aria-label="缩小"><ZoomOut size={15} /></button>
      <button type="button" onClick={() => setZoom(1)} title="重置缩放" aria-label="重置缩放"><RotateCcw size={14} /><span>{Math.round(zoom * 100)}%</span></button>
      <button type="button" onClick={() => setZoom(value => Math.min(4, value + 0.25))} disabled={zoom >= 4} title="放大" aria-label="放大"><ZoomIn size={15} /></button>
      <button type="button" onClick={() => setExpanded(!large)} title={large ? '关闭放大预览' : '放大预览'} aria-label={large ? '关闭放大预览' : '放大预览'}>{large ? <X size={16} /> : <Maximize2 size={15} />}</button>
    </span>
  </span>;
  const body = <span className="message-media__viewport" tabIndex={0} aria-label="可滚动的预览内容">{showSource && source ? <span className="message-media__source"><code>{source}</code></span> : children(zoom)}</span>;
  return <span className="message-media">
    {controls(false)}{!expanded && body}
    <dialog ref={dialog} className="message-media__dialog" aria-label={title} onClose={() => setExpanded(false)} onClick={event => { if (event.target === event.currentTarget) setExpanded(false); }}>
      <span className="message-media message-media--expanded">{controls(true)}{expanded && body}</span>
    </dialog>
  </span>;
}

function ImagePreview({ source, title }: { source: string; title: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // Cached images may finish before effects run; inspect the actual element.
    setState(image.current?.complete ? (image.current.naturalWidth > 0 ? 'ready' : 'error') : 'loading');
  }, [source, retry]);
  useEffect(() => {
    const timeout = setTimeout(() => setState(value => value === 'loading' ? 'error' : value), 20000);
    return () => clearTimeout(timeout);
  }, [source, retry]);
  return <MediaFrame title={title}>{zoom => <>
    {state === 'loading' && <Status>正在加载图片…</Status>}
    {state === 'error' && <span className="message-media__fallback"><Status error>图片无法加载，可能已失效、需要登录或不允许外部访问。</Status>
      <button type="button" onClick={() => setRetry(value => value + 1)}>重新加载</button>
      {safeRemoteUrl(source) && <a href={source} target="_blank" rel="noopener noreferrer">打开原图 <ExternalLink size={13} /></a>}
    </span>}
    <img ref={image} key={retry} src={source} alt={title} referrerPolicy="no-referrer" decoding="async"
      className={`message-media__image ${state === 'error' ? 'message-media__image--failed' : ''}`} style={{ width: `${zoom * 100}%` }}
      onLoad={() => setState('ready')} onError={() => setState('error')} />
  </>}</MediaFrame>;
}

export function MermaidPreview({ source, pending = false, title = '流程图 · Mermaid' }: { source: string; pending?: boolean; title?: string }) {
  const [dark, setDark] = useState(typeof document !== 'undefined' && document.documentElement.dataset.darkMode === 'true');
  const [result, setResult] = useState<{ key: string; url?: string; width?: number; error?: string }>();
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.dataset.darkMode === 'true'));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-dark-mode'] });
    return () => observer.disconnect();
  }, []);
  const key = `${dark}:${source}`;
  useEffect(() => {
    if (pending) return;
    let canceled = false, url: string | undefined;
    // A closed fence is stable even while the remaining answer continues streaming.
    void import('./mermaidPreview').then(module => canceled ? undefined : module.renderMermaidPreview(source, dark)).then(svg => {
      if (canceled || !svg) return;
      url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const bounds = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
      const width = bounds && Number.isFinite(bounds[2]) && bounds[2] > 0 ? Math.min(50000, bounds[2] + 32) : 600;
      setResult({ key, url, width });
    }).catch(error => { if (!canceled) setResult({ key, error: String(error?.message || '图表语法无效').slice(0, 300) }); });
    return () => { canceled = true; if (url) URL.revokeObjectURL(url); };
  }, [source, dark, pending]);
  const current = result?.key === key ? result : undefined;
  return <MediaFrame title={title} source={source}>{zoom => pending ? <Status>图表正在生成，完成后自动展示…</Status> : current?.error ?
    <span className="message-media__fallback"><Status error>流程图暂时无法渲染，请查看源码。</Status><span className="message-media__error-detail">{current.error}</span></span> : current?.url ?
      <img src={current.url} alt={title} className="message-media__diagram" style={{ width: `${(current.width || 600) * zoom}px` }} /> : <Status>正在绘制图表…</Status>}
  </MediaFrame>;
}

export function SvgDiagramPreview({ source, pending = false, html = false, fileSource, recoverySources }: {
  source: string; pending?: boolean; html?: boolean; fileSource?: string; recoverySources?: string[];
}) {
  const context = useContext(MessageMediaContext);
  const [attempt, setAttempt] = useState(0);
  const inlineResult = useMemo(() => {
    if (pending || fileSource) return {};
    try { return { diagram: prepareSvgDiagram(source, html) }; }
    catch (error) { return { error: error instanceof Error ? error.message : '图表格式无效' }; }
  }, [source, pending, html, fileSource]);
  const sourcesKey = JSON.stringify(fileSource ? [fileSource] : inlineResult.error ? recoverySources || [] : []);
  const loadKey = JSON.stringify([source, html, sourcesKey, context.projectPath, context.sessionId, attempt]);
  const [loaded, setLoaded] = useState<{ key: string; diagram?: SvgDiagram; content?: string; name?: string; error?: string }>();
  const current = loaded?.key === loadKey ? loaded : undefined;
  const loading = !pending && sourcesKey !== '[]' && !current;
  useEffect(() => {
    if (pending || sourcesKey === '[]') return;
    let canceled = false;
    const load = async () => {
      if (!window.neoApi?.filePreviewMessage) throw new Error('当前客户端暂不支持文件预览，请更新客户端');
      let lastError: unknown;
      for (const candidate of JSON.parse(sourcesKey) as string[]) {
        if (canceled) return;
        try {
          const data = await window.neoApi.filePreviewMessage({ ...context, source: candidate, diagram: true });
          if (canceled) return;
          if (data.kind !== 'diagram') throw new Error('此文件不包含可预览的图表');
          const diagram = prepareSvgDiagram(data.content, data.format === 'html');
          if (!fileSource && !matchesDiagramSource(source, diagram)) continue;
          setLoaded({ key: loadKey, diagram, content: data.content, name: data.name });
          return;
        } catch (error) { lastError = error; }
      }
      throw lastError || new Error('未找到与回复匹配的完整图表文件');
    };
    void load().catch(error => {
      if (!canceled) setLoaded({ key: loadKey, error: error instanceof Error ? error.message : '图表文件读取失败' });
    });
    return () => { canceled = true; };
  }, [loadKey, pending]);
  const diagram = current?.diagram || inlineResult.diagram;
  const error = fileSource ? current?.error : inlineResult.error;
  const previewSource = current?.content ?? source;
  const [image, setImage] = useState<{ svg: string; url: string }>();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [imageError, setImageError] = useState(false);
  useEffect(() => {
    setExportError(''); setImageError(false);
    if (!diagram) { setImage(undefined); return; }
    const url = URL.createObjectURL(new Blob([diagram.svg], { type: 'image/svg+xml' }));
    setImage({ svg: diagram.svg, url });
    return () => URL.revokeObjectURL(url);
  }, [diagram]);
  const currentImage = image?.svg === diagram?.svg ? image : undefined;
  const download = async (format: 'svg' | 'png') => {
    if (!diagram || exporting) return;
    setExporting(true); setExportError('');
    let url: string | undefined;
    try {
      const blob = await exportSvgDiagram(diagram, format);
      url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `diagram.${format}`;
      document.body.appendChild(link); link.click(); link.remove();
    } catch (error) { setExportError(error instanceof Error ? error.message : '导出失败，请重试'); }
    finally {
      setExporting(false);
      if (url) { const completed = url; setTimeout(() => URL.revokeObjectURL(completed), 1000); }
    }
  };
  return <MediaFrame title="图表 · Diagram Design" source={previewSource} actions={!pending && diagram && <>
    <button type="button" onClick={() => void download('svg')} disabled={exporting} title="导出 SVG"><Download size={14} /><span>SVG</span></button>
    <button type="button" onClick={() => void download('png')} disabled={exporting} title="导出 PNG"><Download size={14} /><span>PNG</span></button>
  </>}>{zoom => <>
    {pending ? <Status>图表正在生成，完成后自动展示…</Status> : loading ? <Status>{fileSource ? '正在读取图表文件…' : '正在从已保存文件恢复图表…'}</Status> : (!diagram && error) || imageError ?
      <span className="message-media__fallback"><Status error>图表暂时无法显示，请查看源码。</Status><span className="message-media__error-detail">{error || 'SVG 图片加载失败'}</span>
        {fileSource && <button type="button" onClick={() => setAttempt(value => value + 1)}>重新读取</button>}
      </span> : currentImage && diagram ?
      <img src={currentImage.url} alt={diagram.title || 'Diagram Design 图表'} className="message-media__diagram" style={{ width: `${Math.min(diagram.width + 32, 50000) * zoom}px` }} onError={() => setImageError(true)} /> : <Status>正在绘制图表…</Status>}
    {!pending && current?.diagram && <span className="message-media__note">{fileSource ? `图表文件：${current.name}` : `已从 ${current.name} 读取完整图表。`}</span>}
    {exporting && <Status>正在导出图表…</Status>}
    {exportError && <Status error>{exportError}</Status>}
  </>}</MediaFrame>;
}

function MindMapNode({ node, depth = 0 }: { node: MindMapTopic; depth?: number }) {
  const [open, setOpen] = useState(depth < 3);
  return <li className="message-mindmap__node">
    {node.children.length ? <button type="button" className="message-mindmap__topic" aria-expanded={open} onClick={() => setOpen(!open)}>
      {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<span>{node.title}</span><small>{node.children.length}</small>
    </button> : <span className="message-mindmap__topic"><span>{node.title}</span></span>}
    {open && node.children.length > 0 && <ul>{node.children.map(child => <MindMapNode key={child.id} node={child} depth={depth + 1} />)}</ul>}
  </li>;
}

function MindMapPreview({ sheets, name, warnings }: { sheets: MindMapSheet[]; name: string; warnings: string[] }) {
  const [active, setActive] = useState(sheets[0]?.id);
  const sheet = sheets.find(item => item.id === active) || sheets[0];
  return <MediaFrame title={name || 'XMind 思维导图'}>{zoom => <span className="message-mindmap">
    {sheets.length > 1 && <label className="message-mindmap__sheets">画布 <select value={sheet.id} onChange={event => setActive(event.target.value)}>{sheets.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
    <ul className="message-mindmap__tree" style={{ fontSize: `${13 * zoom}px` }}><MindMapNode key={sheet.id} node={sheet.root} /></ul>
    {warnings.map(warning => <span key={warning} className="message-media__note">{warning}</span>)}
  </span>}</MediaFrame>;
}

function LocalFilePreview({ source, label }: { source: string; label: string }) {
  const context = useContext(MessageMediaContext);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ data?: MessageFilePreview; error?: string }>({});
  useEffect(() => {
    let canceled = false;
    setState({});
    const load = async () => {
      if (!window.neoApi?.filePreviewMessage) throw new Error('当前客户端暂不支持文件预览，请更新客户端');
      const data = await window.neoApi.filePreviewMessage({ source, ...context });
      if (!canceled) setState({ data });
    };
    void load().catch(error => { if (!canceled) setState({ error: error?.message || '文件预览失败' }); });
    return () => { canceled = true; };
  }, [source, context.projectPath, context.sessionId, attempt]);
  if (state.error) return <span className="message-media message-media__fallback"><Status error>{state.error}</Status><button type="button" onClick={() => setAttempt(value => value + 1)}>重新读取</button></span>;
  if (!state.data) return <span className="message-media"><Status>正在读取 {label}…</Status></span>;
  if (state.data.kind === 'image') return <ImagePreview source={state.data.dataUrl} title={label} />;
  if (state.data.kind === 'mermaid') return <MermaidPreview source={state.data.content} title={label} />;
  if (state.data.kind === 'diagram') return <SvgDiagramPreview source={state.data.content} html={state.data.format === 'html'} />;
  return <MindMapPreview {...state.data} />;
}

export function MessageMediaLink({ source, label, image = false }: { source: string; label: string; image?: boolean }) {
  const kind = image ? 'image' : mediaKind(source);
  const remote = safeRemoteUrl(source);
  const local = isLocalSource(source);
  if (kind && local) return <LocalFilePreview source={source} label={label || '图片'} />;
  const safeData = /^data:image\/(png|jpeg|gif|webp|avif|bmp);base64,[a-z\d+/=\s]+$/i.test(source) && source.length < 28 * 1024 * 1024;
  if (kind === 'image' && (remote || safeData)) return <ImagePreview source={remote || source} title={label || '图片'} />;
  if (remote) return <a href={remote} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:text-sky-700 underline mx-0.5 break-all">{label || source}{kind && kind !== 'image' ? '（下载后添加为附件可预览）' : ''}</a>;
  if (image || kind) return <span className="message-media__status message-media__status--error">链接格式不受支持：{label || '文件'}</span>;
  if (/^mailto:[^\s<>]+$/i.test(source)) return <a href={source} className="text-sky-600 underline">{label}</a>;
  // Unknown protocols (including javascript:, data:text/html and network shares) stay inert.
  return <span>{label || source}</span>;
}
