import type { AiToolCallRecord } from '../../../shared/types';

export type MediaKind = 'image' | 'mindmap' | 'mermaid';

export function mediaKind(source: string): MediaKind | undefined {
  const value = source.replace(/[?#].*$/, '').toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/.test(value) || /^data:image\/(png|jpeg|gif|webp|avif|bmp);base64,/i.test(source)) return 'image';
  if (value.endsWith('.xmind')) return 'mindmap';
  if (/\.(mmd|mermaid)$/.test(value)) return 'mermaid';
}

export function safeRemoteUrl(source: string): string | undefined {
  try {
    const url = new URL(source);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

export function isLocalSource(source: string): boolean {
  return !/^\/\//.test(source) && (!/^[a-z][a-z\d+.-]*:/i.test(source) || /^file:/i.test(source) || /^[a-z]:[/\\]/i.test(source));
}

/** A diagram fence may contain one explicit local file path instead of SVG markup. */
export function diagramFileSource(source: string): string | undefined {
  const value = source.trim().replace(/^<([^<>]+)>$/, '$1');
  if (!value || value.length > 4096 || /[\r\n\0<>]/.test(value) || !isLocalSource(value)) return;
  if (/\.(?:svg|html?)$/i.test(value)) return value;
}

/** Recovery only considers files explicitly used by successful tools in this message. */
export function diagramRecoverySources(toolCalls: AiToolCallRecord[] = []): string[] {
  const paths = new Set<string>();
  for (const call of [...toolCalls].reverse()) {
    if (call.status !== 'success') continue;
    const args = call.arguments;
    const raw = ['read', 'write', 'edit'].includes(call.name) ? args?.file_path
      : call.name === 'str_replace_editor' && ['view', 'create', 'str_replace', 'insert'].includes(args?.command) ? args?.path : undefined;
    const source = typeof raw === 'string' ? diagramFileSource(raw) : undefined;
    if (source) paths.add(source);
    if (paths.size >= 6) break;
  }
  return [...paths];
}

export interface MarkdownLinkMatch { start: number; end: number; label: string; source: string; image: boolean }

// Read balanced destinations instead of truncating names/URLs at their first ')'.
export function findMarkdownLink(text: string): MarkdownLinkMatch | undefined {
  const starts = /!?\[([^\]\n]*)\]\(/g;
  let match: RegExpExecArray | null;
  while ((match = starts.exec(text))) {
    let cursor = starts.lastIndex, depth = 1, angle = false, quote = '';
    const from = cursor;
    for (; cursor < text.length; cursor++) {
      const char = text[cursor];
      if (char === '\\') { cursor++; continue; }
      if (char === '\n') break;
      if (quote) { if (char === quote) quote = ''; continue; }
      if (angle) { if (char === '>') angle = false; continue; }
      if (char === '<' && cursor === from) { angle = true; continue; }
      if ((char === '"' || char === "'") && /\s/.test(text[cursor - 1])) { quote = char; continue; }
      if (char === '(') depth++;
      // Only a closing parenthesis changes depth here.
      if (char === ')') { depth--; if (!depth) break; }
    }
    if (depth !== 0) continue;
    const raw = text.slice(from, cursor).trim();
    const destination = raw.startsWith('<') ? raw.slice(1, raw.indexOf('>')) : raw.replace(/\s+["'][\s\S]*["']$/, '');
    if (!destination) continue;
    return { start: match.index, end: cursor + 1, label: match[1], source: destination.replace(/\\([()\\ ])/g, '$1'), image: match[0].startsWith('!') };
  }
}
