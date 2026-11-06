import DOMPurify from 'dompurify';

const allowedProperties = /^(?:--[\w-]+|fill(?:-opacity|-rule)?|stroke(?:-width|-opacity|-dasharray|-dashoffset|-linecap|-linejoin|-miterlimit)?|opacity|color|background-color|font(?:-family|-size|-weight|-style|-variant)?|text-anchor|dominant-baseline|alignment-baseline|letter-spacing|word-spacing|paint-order|marker-(?:start|mid|end)|stop-color|stop-opacity|clip-path|clip-rule|mask|filter|display|visibility|vector-effect|transform(?:-origin|-box)?|white-space)$/i;
function safeValue(value: string): boolean {
  if (/[\\<>@]|(?:https?|file|data|javascript):|\/\/|expression\s*\(/i.test(value)) return false;
  return !/url\s*\(/i.test(value.replace(/url\(\s*(['"]?)#[\w:.-]+\1\s*\)/gi, ''));
}
function cleanDeclarations(style: CSSStyleDeclaration): string {
  return [...style].filter(name => allowedProperties.test(name) && safeValue(style.getPropertyValue(name)))
    .map(name => `${name}:${style.getPropertyValue(name)}`).join(';');
}
function cleanStyleSheet(source: string): string {
  // A detached constructable sheet never loads imports. Keep ordinary rules only;
  // discard imports, font faces, keyframes and media rules without losing sibling tokens.
  if (/[\\<>]/.test(source)) return '';
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(source);
  return [...sheet.cssRules].filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
    .map(rule => `${rule.selectorText.replace(/\b(?:html|body)\b/g, ':root')}{${cleanDeclarations(rule.style)}}`).join('\n');
}

export interface SvgDiagram { svg: string; width: number; height: number; title?: string }

const incompleteDiagram = '图表源码输出不完整，缺少 SVG 结束标签；可从已保存的图表文件恢复。';

function hasCompleteSvg(source: string): boolean {
  const tags = source.matchAll(/<!--[\s\S]*?-->|<\/?svg\b[^>]*>/gi);
  let depth = 0;
  for (const [tag] of tags) {
    if (tag.startsWith('<!--')) continue;
    depth += /^<\//.test(tag) ? -1 : /\/\s*>$/.test(tag) ? 0 : 1;
    if (depth === 0) return true;
    if (depth < 0) return false;
  }
  return false;
}

/** Match identity from complete tags in a truncated response, never guess a filename. */
export function matchesDiagramSource(source: string, candidate: SvgDiagram): boolean {
  const opening = source.match(/<svg\b[^>]*>/i)?.[0];
  const title = source.match(/<title\b[^>]*>[\s\S]*?<\/title\s*>/i)?.[0];
  if (!opening || !title) return false;
  const partial = new DOMParser().parseFromString(`${opening}${title}</svg>`, 'image/svg+xml');
  if (partial.querySelector('parsererror')) return false;
  const viewBox = partial.documentElement.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  const full = new DOMParser().parseFromString(candidate.svg, 'image/svg+xml');
  const fullViewBox = full.documentElement.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  const partialTitle = partial.querySelector('title')?.textContent?.trim();
  if (!partialTitle || partialTitle !== candidate.title || viewBox?.length !== 4 || fullViewBox?.length !== 4
    || !viewBox.every((value, index) => Number.isFinite(value) && value === fullViewBox[index])) return false;
  const desc = source.match(/<desc\b[^>]*>[\s\S]*?<\/desc\s*>/i)?.[0];
  if (desc) {
    const description = new DOMParser().parseFromString(`${opening}${desc}</svg>`, 'image/svg+xml');
    if (description.querySelector('parsererror') || description.querySelector('desc')?.textContent?.trim() !== full.querySelector('desc')?.textContent?.trim()) return false;
  }
  return true;
}

/** Generated markup is an image document, never executable conversation DOM. */
export function prepareSvgDiagram(source: string, html = false): SvgDiagram {
  if (source.length > 1_000_000) throw new Error('图表内容超过 1 MB，请拆分后查看');
  if (/<!DOCTYPE[^>]*\[|<!ENTITY/i.test(source)) throw new Error('图表不支持 DTD 实体');
  let raw = source;
  let surroundingStyles = '';
  if (html) {
    if (/<svg\b/i.test(source) && !hasCompleteSvg(source)) throw new Error(incompleteDiagram);
    // A template keeps all HTML, scripts and resource elements inert during extraction.
    const template = document.createElement('template');
    template.innerHTML = source;
    const diagrams = [...template.content.querySelectorAll('svg')].filter(svg => !svg.parentElement?.closest('svg'));
    if (diagrams.length !== 1) throw new Error('HTML 图表须包含一个 SVG；多张图请分别输出 svg 代码块');
    surroundingStyles = [...template.content.querySelectorAll('style')].filter(style => !diagrams[0].contains(style))
      .map(style => cleanStyleSheet(style.textContent || '')).join('\n');
    raw = diagrams[0].outerHTML;
  } else {
    const parsed = new DOMParser().parseFromString(source.trim(), 'image/svg+xml');
    if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg') {
      throw new Error(/<svg\b/i.test(source) && !hasCompleteSvg(source) ? incompleteDiagram : 'SVG 语法不完整或无效，请查看源码');
    }
    raw = parsed.documentElement.outerHTML;
  }
  const clean = DOMPurify.sanitize(raw, { USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['use'],
    FORBID_TAGS: ['script', 'foreignObject', 'a', 'image', 'feImage', 'animate', 'animateMotion', 'animateTransform', 'set', 'discard'] });
  const doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
  const svg = doc.documentElement;
  if (doc.querySelector('parsererror') || svg.localName !== 'svg') throw new Error('图表输出格式无效');
  if (doc.querySelectorAll('*').length > 12000) throw new Error('图表元素过多，请拆分后查看');
  for (const element of doc.querySelectorAll('*')) {
    for (const attr of [...element.attributes]) {
      if (/^on/i.test(attr.name) || (/(?:href|src)$/i.test(attr.name) && !/^#[\w:.-]+$/.test(attr.value)) || !safeValue(attr.value)) element.removeAttribute(attr.name);
    }
    if (element.localName === 'style') element.textContent = cleanStyleSheet(element.textContent || '');
    if (element.hasAttribute('style')) {
      const style = document.createElement('span').style;
      style.cssText = element.getAttribute('style') || '';
      element.setAttribute('style', cleanDeclarations(style));
    }
  }
  if (surroundingStyles) {
    const style = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = surroundingStyles;
    svg.prepend(style);
  }
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const viewBox = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  const dimension = (name: string) => {
    const value = svg.getAttribute(name) || '';
    return /^\d+(?:\.\d+)?(?:px)?$/.test(value) ? parseFloat(value) : NaN;
  };
  const width = viewBox?.length === 4 ? viewBox[2] : dimension('width');
  const height = viewBox?.length === 4 ? viewBox[3] : dimension('height');
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > 50000 || height > 50000 || (viewBox && (viewBox.length !== 4 || !viewBox.every(Number.isFinite)))) {
    throw new Error('图表需要有效的 viewBox 或宽高（最大 50000）');
  }
  if (!viewBox) svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  const title = [...svg.children].find(element => element.localName === 'title')?.textContent?.trim().slice(0, 300);
  return { svg: new XMLSerializer().serializeToString(svg), width, height, title };
}

export async function exportSvgDiagram(diagram: SvgDiagram, format: 'svg' | 'png'): Promise<Blob> {
  const blob = new Blob([diagram.svg], { type: 'image/svg+xml;charset=utf-8' });
  if (format === 'svg') return blob;
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(2, 8192 / diagram.width, 8192 / diagram.height, Math.sqrt(24_000_000 / (diagram.width * diagram.height)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(diagram.width * scale));
    canvas.height = Math.max(1, Math.round(diagram.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前设备无法导出 PNG，请使用 SVG');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('PNG 导出失败，请使用 SVG')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
