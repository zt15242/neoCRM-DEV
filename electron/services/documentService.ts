import fs from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { SaxesParser } from 'saxes';
import * as CFB from 'cfb';
import { createRequire } from 'node:module';
import DOMMatrix from '@thednp/dommatrix';
import { parseXMind } from './messagePreviewService';

export const DOCUMENT_EXTENSIONS = ['xlsx', 'xls', 'xlsm', 'csv', 'tsv', 'ods', 'doc', 'docx', 'pdf', 'ppt', 'pptx', 'xmind'];
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const MAX_TEXT = 8_000_000;
const MAX_SECTIONS = 2000;
const MAX_UNZIP = 128 * 1024 * 1024;
export const isOfficeDocument = (filename: string) => DOCUMENT_EXTENSIONS.includes(path.extname(filename).slice(1).toLowerCase());
export const isBinaryDocument = (filename: string) => isOfficeDocument(filename) && !/\.(csv|tsv)$/i.test(filename);

interface DocumentSection { id: string; title: string; kind: string; lines: string[] }
interface ParsedDocument { format: string; sections: DocumentSection[]; warnings: string[] }
export interface DocumentReadOptions {
  file_path: string;
  mode?: 'info' | 'read';
  section?: string;
  offset?: number;
  limit?: number;
  max_chars?: number;
  section_offset?: number;
}
export interface DocumentReadResult {
  path: string;
  format: string;
  sectionCount: number;
  sections: Array<{ id: string; title: string; kind: string; totalLines: number }>;
  nextSectionOffset?: number;
  selectedSection?: string;
  content: string;
  totalLines: number;
  offset: number;
  limit: number;
  truncated: boolean;
  nextOffset?: number;
  warnings: string[];
}

function positive(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('分页参数必须为大于 0 的整数');
  return Math.min(value, max);
}

// Wrap exceptionally long cells/paragraphs into addressable lines instead of dropping their tail.
function linesOf(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').split('\n').flatMap(line => {
    if (!line) return [''];
    const parts: string[] = [];
    for (let start = 0; start < line.length;) {
      let end = Math.min(start + 2000, line.length);
      if (end < line.length && /[\uD800-\uDBFF]/.test(line[end - 1])) end--;
      parts.push(line.slice(start, end)); start = end;
    }
    return parts;
  });
}

function xmlText(xml: string): string {
  const parser = new SaxesParser({ xmlns: true });
  let text = '', inText = 0;
  parser.on('doctype', () => { throw new Error('文档 XML 不支持 DTD'); });
  parser.on('opentag', tag => {
    if (tag.local === 't') inText++;
    if (tag.local === 'tab') text += '\t';
    if (tag.local === 'br') text += '\n';
  });
  parser.on('text', value => { if (inText) text += value; });
  parser.on('cdata', value => { if (inText) text += value; });
  parser.on('closetag', tag => {
    if (tag.local === 't') inText--;
    if (tag.local === 'p' || tag.local === 'tr') text += '\n';
    if (tag.local === 'tc') text += '\t';
  });
  parser.write(xml).close();
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

async function checkedZip(buffer: Buffer): Promise<JSZip> {
  const zip = await JSZip.loadAsync(buffer);
  let expanded = 0;
  const entries = Object.values(zip.files);
  if (entries.length > 20000) throw new Error('文档压缩包条目过多，请拆分文件');
  for (const entry of entries) {
    expanded += (entry as any)._data?.uncompressedSize || 0;
    if (expanded > MAX_UNZIP) throw new Error('文档解压后超过 128 MB，请拆分文件');
  }
  return zip;
}

function legacyPpt(buffer: Buffer): ParsedDocument {
  const compound = CFB.read(buffer, { type: 'buffer' });
  if (CFB.find(compound, 'EncryptedSummary')) throw new Error('PPT 已加密，请先解除密码保护');
  const entry = CFB.find(compound, 'PowerPoint Document');
  if (!entry) throw new Error('不是有效的 PowerPoint 97–2003 文件');
  const data = Buffer.from(entry.content);
  const chunks: string[] = [];
  let textSize = 0;
  const visit = (start: number, end: number, depth: number) => {
    if (depth > 32) throw new Error('PPT 记录嵌套过深');
    for (let cursor = start; cursor + 8 <= end;) {
      const flags = data.readUInt16LE(cursor), type = data.readUInt16LE(cursor + 2);
      const length = data.readUInt32LE(cursor + 4), body = cursor + 8, next = body + length;
      if (next > end || next > data.length) throw new Error('PPT 文件记录损坏或被加密');
      if (type === 4000 || type === 4008) {
        const text = new TextDecoder(type === 4000 ? 'utf-16le' : 'windows-1252').decode(data.subarray(body, next)).replace(/\u0000/g, '').trim();
        textSize += text.length;
        if (textSize > MAX_TEXT) throw new Error('PPT 文本过大，请拆分文件');
        if (text) chunks.push(text);
      } else if ((flags & 15) === 15) visit(body, next, depth + 1);
      cursor = next;
    }
  };
  visit(0, data.length, 0);
  return { format: 'ppt', sections: [{ id: 'body', title: 'PPT 文本记录', kind: 'document', lines: linesOf(chunks.join('\n')) }],
    warnings: ['旧版 PPT 按文本记录提取，可能包含重复文本；不保证幻灯片顺序、备注及图表内容完整。需要逐页核对时请另存为 PPTX。'] };
}

async function pdfDocument(buffer: Buffer): Promise<ParsedDocument> {
  if (!buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('文件不是有效的 PDF');
  // Text extraction needs matrix math, but does not require a platform-specific canvas binary.
  if (!(globalThis as any).DOMMatrix) (globalThis as any).DOMMatrix = DOMMatrix;
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // Keep PDF.js and its CMaps/worker/font assets external to the application bundle.
  const require = createRequire(typeof __filename === 'string' ? __filename : import.meta.url);
  const assets = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const loading = getDocument({ data: new Uint8Array(buffer), enableXfa: false, stopAtErrors: true,
    disableFontFace: true, useSystemFonts: false, useWorkerFetch: false, useWasm: false,
    isOffscreenCanvasSupported: false, isImageDecoderSupported: false, verbosity: 0,
    cMapUrl: path.join(assets, 'cmaps') + path.sep, cMapPacked: true,
    standardFontDataUrl: path.join(assets, 'standard_fonts') + path.sep });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const pdf = await loading.promise;
        if (pdf.numPages > MAX_SECTIONS) throw new Error('PDF 超过 2000 页，请拆分文件');
        let chars = 0;
        const sections: DocumentSection[] = [];
        for (let number = 1; number <= pdf.numPages; number++) {
          const page = await pdf.getPage(number), content = await page.getTextContent();
          let text = '', lastY: number | undefined;
          for (const item of content.items) {
            if (!('str' in item)) continue;
            chars += item.str.length;
            if (chars > MAX_TEXT) throw new Error('PDF 文本过大，请拆分文件');
            const y = item.transform[5];
            if (lastY !== undefined && Math.abs(y - lastY) > 0.5 && !text.endsWith('\n')) text += '\n';
            text += item.str;
            if (item.hasEOL) text += '\n';
            else if (item.str && !item.str.endsWith(' ')) text += ' ';
            lastY = y;
          }
          sections.push({ id: `page-${number}`, title: `第 ${number} 页`, kind: 'page', lines: linesOf(text.trim()) });
          page.cleanup();
        }
        const empty = sections.filter(section => !section.lines.join('').trim()).length;
        return { format: 'pdf', sections, warnings: empty ? [`有 ${empty} 页未提取到可复制文本，可能是扫描件或图片页；当前未执行 OCR，不能据此判断页面没有内容。`] : [] };
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('PDF 解析超时，请拆分文件后重试')), 30000); }),
    ]);
  } catch (error) {
    throw new Error(`PDF 解析失败（可能已加密或损坏）: ${(error as Error).message}`);
  } finally {
    clearTimeout(timer);
    await loading.destroy();
  }
}

async function parseDocument(filename: string, buffer: Buffer): Promise<ParsedDocument> {
  const format = path.extname(filename).slice(1).toLowerCase();
  if (format === 'xmind') {
    const map = await parseXMind(buffer);
    const lines = (node: import('../../shared/messagePreview').MindMapTopic, depth = 0): string[] =>
      [`${'  '.repeat(depth)}- ${node.title}`, ...node.children.flatMap(child => lines(child, depth + 1))];
    return { format, sections: map.sheets.map(sheet => ({ id: sheet.id, title: sheet.title, kind: 'mindmap', lines: linesOf(lines(sheet.root).join('\n')) })), warnings: map.warnings };
  }
  const warnings: string[] = [];
  let zip: JSZip | undefined;
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) zip = await checkedZip(buffer);
  if (['xlsx', 'xls', 'xlsm', 'csv', 'tsv', 'ods'].includes(format)) {
    if (['xlsx', 'xlsm'].includes(format) && !zip?.file('xl/workbook.xml')) throw new Error('不是有效的 Excel 工作簿（可能已加密或损坏）');
    if (format === 'ods' && !zip?.file('content.xml')) throw new Error('不是有效的 ODS 工作簿');
    if (format === 'xls' && !buffer.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'))
      && !/^\s*(?:<\?xml|<html|<table|<Workbook)/i.test(buffer.subarray(0, 1024).toString('utf8'))) throw new Error('不是有效的 XLS 工作簿');
    const book = XLSX.read(buffer, { type: 'buffer', cellFormula: true, cellText: true, cellDates: true, sheetStubs: true,
      ...(['csv', 'tsv'].includes(format) ? { codepage: 65001 } : {}) });
    if (!book.SheetNames.length || book.SheetNames.length > MAX_SECTIONS) throw new Error('工作簿没有工作表或工作表数量过多');
    let chars = 0, cells = 0;
    const sections = book.SheetNames.map((name, index) => {
      const sheet = book.Sheets[name], rows: string[] = [];
      const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : undefined;
      if (range && (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1) > 2_000_000) throw new Error(`工作表 ${name} 范围过大，请删除多余格式或拆分文件`);
      if (range) for (let row = range.s.r; row <= range.e.r; row++) {
        const values: string[] = [];
        for (let col = range.s.c; col <= range.e.c; col++) {
          if (++cells > 2_000_000) throw new Error('工作簿单元格过多，请拆分文件');
          const address = XLSX.utils.encode_cell({ r: row, c: col }), cell = sheet[address];
          if (!cell || ((cell.v === undefined || cell.t === 'z') && !cell.f)) continue;
          const hasValue = cell.v !== undefined && cell.t !== 'z';
          let value = hasValue ? cell.w ?? (cell.v instanceof Date ? cell.v.toISOString() : String(cell.v ?? '')) : '';
          if (cell.f) value += ` [公式: =${cell.f}; ${hasValue ? '缓存结果，未重新计算' : '无缓存结果'}]`;
          chars += value.length + address.length + 8;
          if (chars > MAX_TEXT) throw new Error('工作簿文本过大，请拆分文件');
          values.push(`${address}=${JSON.stringify(value)}`);
        }
        rows.push(`行 ${row + 1}: ${values.join(' | ') || '(空行)'}`);
      }
      return { id: `sheet-${index + 1}`, title: name, kind: 'sheet', lines: linesOf(rows.join('\n')) };
    });
    if (book.SheetNames.some(name => book.Sheets[name]['!merges']?.length)) warnings.push('工作簿包含合并单元格，值显示在合并区域左上角。');
    warnings.push('公式展示原表达式与文件中的缓存结果，未执行公式或刷新外部数据。');
    return { format, sections, warnings };
  }
  if (format === 'pdf') return pdfDocument(buffer);
  if (format === 'ppt') return legacyPpt(buffer);
  if (format === 'pptx') {
    if (!zip?.file('ppt/presentation.xml')) throw new Error('不是有效的 PPTX 文件');
    const relationships = new Map<string, string>();
    const relParser = new SaxesParser({ xmlns: true });
    relParser.on('opentag', tag => {
      if (tag.local === 'Relationship' && tag.attributes.TargetMode?.value !== 'External') relationships.set(tag.attributes.Id?.value, tag.attributes.Target?.value);
    });
    relParser.write(await zip.file('ppt/_rels/presentation.xml.rels')!.async('string')).close();
    const slidePaths: string[] = [];
    const order = new SaxesParser({ xmlns: true });
    order.on('opentag', tag => {
      if (tag.local === 'sldId') {
        const relationId = Object.values(tag.attributes).find(attribute => attribute.local === 'id' && attribute.uri.endsWith('/relationships'))?.value;
        const target = relationships.get(relationId || '');
        if (!target) throw new Error('PPTX 幻灯片引用缺失');
        const filename = target.startsWith('/') ? target.slice(1) : path.posix.normalize(path.posix.join('ppt', target));
        if (!filename.startsWith('ppt/slides/')) throw new Error('PPTX 幻灯片路径无效');
        slidePaths.push(filename);
      }
    });
    order.write(await zip.file('ppt/presentation.xml')!.async('string')).close();
    if (slidePaths.length > MAX_SECTIONS) throw new Error('PPTX 超过 2000 页，请拆分文件');
    const sections: DocumentSection[] = [];
    for (let index = 0; index < slidePaths.length; index++) {
      const filename = slidePaths[index], slide = zip.file(filename);
      if (!slide) throw new Error(`PPTX 第 ${index + 1} 页内容缺失`);
      let text = xmlText(await slide.async('string'));
      const rels = zip.file(path.posix.join(path.posix.dirname(filename), '_rels', path.posix.basename(filename) + '.rels'));
      if (rels) {
        let notesPath = '';
        const notes = new SaxesParser({ xmlns: true });
        notes.on('opentag', tag => {
          if (tag.attributes.Type?.value.endsWith('/notesSlide') && tag.attributes.TargetMode?.value !== 'External') {
            const target = tag.attributes.Target?.value || '';
            notesPath = target.startsWith('/') ? target.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(filename), target));
          }
        });
        notes.write(await rels.async('string')).close();
        if (notesPath && zip.file(notesPath)) text += `\n[演讲者备注]\n${xmlText(await zip.file(notesPath)!.async('string'))}`;
      }
      sections.push({ id: `slide-${index + 1}`, title: `第 ${index + 1} 张幻灯片`, kind: 'slide', lines: linesOf(text) });
    }
    return { format, sections, warnings: ['已提取文字、表格文字及演讲者备注；图片、图表和 SmartArt 的视觉信息需另行核对。'] };
  }
  if (format === 'doc' || format === 'docx') {
    if (format === 'docx' && !zip?.file('word/document.xml')) throw new Error('不是有效的 DOCX 文件（可能已加密）');
    const { default: WordExtractor } = await import('word-extractor');
    const doc = await new WordExtractor().extract(buffer);
    const parts = [
      ['body', '正文', doc.getBody()], ['headers', '页眉', doc.getHeaders({ includeFooters: false })],
      ['footers', '页脚', doc.getFooters()], ['footnotes', '脚注', doc.getFootnotes()],
      ['endnotes', '尾注', doc.getEndnotes()], ['textboxes', '文本框', doc.getTextboxes()],
    ];
    return { format, sections: parts.filter(([, , text]) => text?.trim()).map(([id, title, text]) => ({ id, title, kind: 'document', lines: linesOf(text) })),
      warnings: ['Word 按正文和附属内容分段提取，不提供渲染后的页码；图片和版式未解析。'] };
  }
  let text: string;
  if (buffer[0] === 0xff && buffer[1] === 0xfe) text = new TextDecoder('utf-16le').decode(buffer);
  else if (buffer[0] === 0xfe && buffer[1] === 0xff) text = new TextDecoder('utf-16be').decode(buffer);
  else {
    const sample = buffer.subarray(0, 8192);
    if (sample.includes(0) || [...sample].filter(c => c < 9 || (c > 13 && c < 32)).length > sample.length * 0.05) throw new Error('不支持的二进制文件，请使用 Excel、Word、PDF、PPT 或文本文件');
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  }
  return { format: format || 'text', sections: [{ id: 'body', title: '正文', kind: 'text', lines: linesOf(text) }], warnings };
}

export class DocumentService {
  private cache = new Map<string, { key: string; document: ParsedDocument }>();
  async read(options: DocumentReadOptions): Promise<DocumentReadResult> {
    const filename = path.resolve(options.file_path), stat = await fs.stat(filename);
    if (!stat.isFile()) throw new Error('请选择文件，不能读取目录');
    if (stat.size > MAX_DOCUMENT_BYTES) throw new Error('文件超过 50 MB，请拆分后读取');
    const key = `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
    let document = this.cache.get(filename)?.key === key ? this.cache.get(filename)!.document : undefined;
    if (!document) {
      document = await parseDocument(filename, await fs.readFile(filename));
      const size = document.sections.reduce((sum, section) => sum + section.lines.reduce((n, line) => n + line.length, 0), 0);
      if (size > MAX_TEXT) throw new Error('文件提取文本超过 800 万字符，请拆分文件');
      if (!document.sections.length) document.sections.push({ id: 'body', title: '正文', kind: 'document', lines: [''] });
      if (this.cache.size >= 3) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(filename, { key, document });
    }
    const offset = positive(options.offset, 1, Number.MAX_SAFE_INTEGER);
    const limit = positive(options.limit, 200, 2000), maxChars = positive(options.max_chars, 20000, 30000);
    if (maxChars < 3000) throw new Error('max_chars 不能小于 3000');
    if (options.mode && !['read', 'info'].includes(options.mode)) throw new Error('mode 仅支持 info 或 read');
    const section = options.section ? document.sections.find(s => s.id === options.section || s.title === options.section) : undefined;
    if (options.section && !section) throw new Error(`未找到文档分段 ${options.section}，请先用 mode=info 查看 sections`);
    const selected = section ? [section] : document.sections;
    const allLines = selected.flatMap(s => [`[${s.id}] ${s.title}`, ...s.lines]);
    const content: string[] = [];
    let characters = 0;
    if (options.mode !== 'info') for (let i = offset - 1; i < Math.min(allLines.length, offset - 1 + limit); i++) {
      const line = `${i + 1} | ${allLines[i]}`;
      if (characters + line.length + 1 > maxChars) break;
      content.push(line); characters += line.length + 1;
    }
    const nextOffset = offset + content.length;
    const sectionOffset = positive(options.section_offset, 1, Number.MAX_SAFE_INTEGER);
    return { path: filename, format: document.format, sectionCount: document.sections.length,
      sections: document.sections.slice(sectionOffset - 1, sectionOffset + 99).map(({ id, title, kind, lines }) => ({ id, title: title.slice(0, 160), kind, totalLines: lines.length + 1 })),
      nextSectionOffset: sectionOffset + 100 <= document.sections.length ? sectionOffset + 100 : undefined,
      selectedSection: section?.id, content: content.join('\n'), totalLines: allLines.length, offset, limit,
      truncated: options.mode !== 'info' && nextOffset <= allLines.length,
      nextOffset: options.mode !== 'info' && nextOffset <= allLines.length ? nextOffset : undefined,
      warnings: [...document.warnings, ...(!selected.some(s => s.lines.some(line => line.trim())) ? ['未提取到可读文本，不能据此推断原文件为空。'] : [])] };
  }
}

export const documentService = new DocumentService();
