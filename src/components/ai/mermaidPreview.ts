import mermaid from 'mermaid';
import DOMPurify from 'dompurify';

let queue: Promise<unknown> = Promise.resolve();
let sequence = 0;

export function renderMermaidPreview(source: string, dark: boolean): Promise<string> {
  const task = queue.catch(() => undefined).then(async () => {
    if (source.length > 40000) throw new Error('图表内容超过 40000 字，请拆分后查看');
    // Do not let generated directives override security or load external resources.
    if (/%%\s*\{|^\s*---/m.test(source)) throw new Error('图表预览不支持配置指令，请移除配置头后重试');
    if (/\bimg\s*:|<\s*(?:img|iframe|image|script|foreignobject|style|link)\b|@import\b|\burl\s*\(/i.test(source)) {
      throw new Error('图表预览不支持 HTML、图片节点或外部资源，请改用纯文本节点');
    }
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base',
      themeVariables: { darkMode: dark, background: dark ? '#172033' : '#ffffff',
        primaryColor: dark ? '#1e3a52' : '#eff6ff', primaryTextColor: dark ? '#e2e8f0' : '#1e293b',
        primaryBorderColor: dark ? '#5580a0' : '#7fa6c8', lineColor: dark ? '#a3b8ca' : '#64748b',
        secondaryColor: dark ? '#23433e' : '#ecfdf5', tertiaryColor: dark ? '#1e293b' : '#f8fafc' },
      htmlLabels: false, suppressErrorRendering: true, maxTextSize: 40000, maxEdges: 600,
      flowchart: { htmlLabels: false, useMaxWidth: false }, sequence: { useMaxWidth: false },
      fontFamily: 'system-ui, sans-serif' });
    const id = `message-diagram-${++sequence}`;
    try {
      const result = await mermaid.render(id, source);
      const clean = DOMPurify.sanitize(result.svg, { USE_PROFILES: { svg: true, svgFilters: true },
        FORBID_TAGS: ['foreignObject', 'script', 'a', 'image', 'feImage', 'use'] });
      const doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
      if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('图表输出格式无效');
      for (const element of doc.querySelectorAll('*')) {
        for (const attribute of [...element.attributes]) {
          if (/^on/i.test(attribute.name) || (/href$/i.test(attribute.name) && !attribute.value.startsWith('#'))) element.removeAttribute(attribute.name);
        }
        if (element.localName === 'style') element.textContent = (element.textContent || '').replace(/@import[^;]+;?/gi, '').replace(/url\(\s*['"]?(?!#)[^)]+\)/gi, 'none');
      }
      // SVG is displayed as an image, never injected into the conversation DOM.
      return new XMLSerializer().serializeToString(doc.documentElement);
    } finally {
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
    }
  });
  queue = task;
  return task;
}
