import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { SaxesParser } from 'saxes';
import type { MessageFilePreview, MindMapSheet, MindMapTopic } from '../../shared/messagePreview';

const MAX_FILE = 20 * 1024 * 1024;
const MAX_CONTENT = 4 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.bmp': 'image/bmp', '.ico': 'image/x-icon',
};

export async function parseXMind(buffer: Buffer): Promise<Extract<MessageFilePreview, { kind: 'mindmap' }>> {
  if (buffer.length > MAX_FILE) throw new Error('XMind 文件超过 20 MB，请拆分后预览');
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files);
  if (entries.length > 5000 || entries.reduce((sum, entry) => sum + ((entry as any)._data?.uncompressedSize || 0), 0) > 64 * 1024 * 1024) {
    throw new Error('XMind 压缩包内容过大，请拆分后预览');
  }
  const entry = zip.file('content.json') || zip.file('content.xml');
  if (!entry) throw new Error('XMind 文件缺少 content.json 或 content.xml，暂不支持此格式或加密文件');
  if ((entry as any)._data?.uncompressedSize > MAX_CONTENT) throw new Error('XMind 主题内容超过 4 MB');
  // Bound the actual expansion as well as the ZIP metadata.
  const chunks: Buffer[] = [];
  let length = 0;
  await new Promise<void>((resolve, reject) => {
    const stream = entry.internalStream('nodebuffer');
    stream.on('data', chunk => {
      length += chunk.length;
      if (length > MAX_CONTENT) { stream.pause(); reject(new Error('XMind 主题内容超过 4 MB')); return; }
      chunks.push(chunk);
    }).on('error', reject).on('end', () => resolve()).resume();
  });
  const content = Buffer.concat(chunks).toString('utf8');
  let count = 0;
  const topic = (value: any, depth: number): MindMapTopic => {
    if (!value || typeof value !== 'object' || depth > 32 || ++count > 1500) throw new Error('XMind 层级超过 32 层或主题超过 1500 个，请拆分后预览');
    const children = value.children || {};
    const attached = Array.isArray(children) ? children : children.attached || [];
    const detached = Array.isArray(children) ? [] : children.detached || [];
    if (!Array.isArray(attached) || !Array.isArray(detached)) throw new Error('XMind 子主题格式无效');
    return { id: `topic-${count}`, title: String(value.title || '未命名主题').slice(0, 4000),
      children: [...attached, ...detached].map(child => topic(child, depth + 1)) };
  };
  let sheets: MindMapSheet[];
  if (entry.name.endsWith('.json')) {
    const data = JSON.parse(content);
    if (!Array.isArray(data) || !data.length || data.length > 100) throw new Error('XMind 工作表格式无效或超过 100 个');
    sheets = data.map((sheet, index) => ({ id: `sheet-${index}`, title: String(sheet.title || `画布 ${index + 1}`).slice(0, 200), root: topic(sheet.rootTopic, 0) }));
  } else {
    const rawSheets: Array<{ title: string; rootTopic?: any }> = [];
    const topics: any[] = [];
    const tags: string[] = [];
    const parser = new SaxesParser({ xmlns: true });
    let sheet: (typeof rawSheets)[number] | undefined;
    let title = '';
    parser.on('doctype', () => { throw new Error('XMind XML 不支持 DTD'); });
    parser.on('opentag', tag => {
      tags.push(tag.local);
      if (tags.length > 160) throw new Error('XMind XML 嵌套过深');
      if (tag.local === 'sheet') {
        if (rawSheets.length >= 100) throw new Error('XMind 工作表超过 100 个');
        sheet = { title: '' }; rawSheets.push(sheet);
      }
      if (tag.local === 'topic') {
        if (++count > 1500 || topics.length >= 33) throw new Error('XMind 主题过多或嵌套过深');
        const value = { title: '', children: [] as any[] };
        if (topics.length) topics[topics.length - 1].children.push(value);
        else if (sheet) sheet.rootTopic = value;
        topics.push(value);
      }
      if (tag.local === 'title') title = '';
    });
    const text = (value: string) => { if (tags[tags.length - 1] === 'title') title += value; };
    parser.on('text', text); parser.on('cdata', text);
    parser.on('closetag', tag => {
      if (tag.local === 'title') {
        if (topics.length) topics[topics.length - 1].title = title;
        else if (sheet) sheet.title = title;
      }
      if (tag.local === 'topic') topics.pop();
      tags.pop();
    });
    parser.write(content).close();
    count = 0;
    sheets = rawSheets.map((item, index) => ({ id: `sheet-${index}`, title: item.title || `画布 ${index + 1}`, root: topic(item.rootTopic, 0) }));
    if (!sheets.length) throw new Error('XMind 文件中未找到画布');
  }
  return { kind: 'mindmap', name: '', sheets, warnings: ['预览展示主题层级；原文件中的样式、附件、备注及跨主题关联线请在 XMind 中查看。'] };
}

export async function readMessagePreview(source: string, context: { projectPath?: string; allowedFiles?: string[]; diagram?: boolean }): Promise<MessageFilePreview> {
  if (typeof source !== 'string' || !source.trim() || source.includes('\0')) throw new Error('预览路径无效');
  let target: string;
  if (/^file:/i.test(source)) target = fileURLToPath(source);
  else {
    if (/^[a-z][a-z\d+.-]*:/i.test(source) && !/^[a-z]:[/\\]/i.test(source)) throw new Error('预览仅支持当前项目文件和对话附件');
    target = decodeURIComponent(source.replace(/[?#].*$/, ''));
  }
  if (!path.isAbsolute(target) && !context.projectPath) throw new Error('请先选择文件所在项目，或将文件添加为对话附件');
  target = path.resolve(context.projectPath || '', target);
  const relativeTarget = context.projectPath ? path.relative(path.resolve(context.projectPath), target) : undefined;
  const inProject = relativeTarget !== undefined && relativeTarget !== '..' && !relativeTarget.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeTarget);
  const isAttachment = context.allowedFiles?.some(file => path.resolve(file) === target);
  if (!inProject && !isAttachment) throw new Error('文件不在当前项目或对话附件中，请先将文件添加为附件');
  const real = await fs.realpath(target);
  let allowed = false;
  if (context.projectPath) {
    const root = await fs.realpath(context.projectPath);
    const relative = path.relative(root, real);
    allowed = relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  }
  if (!allowed) {
    // Only exact, explicitly attached files may cross the project boundary.
    for (const file of context.allowedFiles || []) {
      if (path.resolve(file) !== target) continue;
      try { if (await fs.realpath(file) === real) { allowed = true; break; } } catch { /* removed attachment */ }
    }
  }
  if (!allowed) throw new Error('文件不在当前项目或对话附件中，请先将文件添加为附件');
  const ext = path.extname(real).toLowerCase();
  if (context.diagram ? !['.svg', '.html', '.htm'].includes(ext) : !IMAGE_TYPES[ext] && !['.xmind', '.mmd', '.mermaid'].includes(ext)) {
    throw new Error('此文件类型暂不支持内嵌预览');
  }
  const handle = await fs.open(real, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  let buffer: Buffer;
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error('预览目标不是文件');
    const limit = context.diagram ? 1_000_000 : ext === '.mmd' || ext === '.mermaid' ? 40000 : MAX_FILE;
    if (stat.size > limit) throw new Error(`文件超过预览限制（${context.diagram ? '1 MB' : limit === MAX_FILE ? '20 MB' : '40000 字节'}）`);
    const data = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < data.length) {
      const { bytesRead } = await handle.read(data, offset, data.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset > limit) throw new Error('文件超过预览大小限制');
    if (offset > stat.size) throw new Error('文件读取时发生变化，请重试');
    buffer = data.subarray(0, offset);
  } finally { await handle.close(); }
  const name = path.basename(real);
  if (context.diagram) return { kind: 'diagram', name, content: buffer.toString('utf8'), format: ext === '.svg' ? 'svg' : 'html' };
  if (ext === '.xmind') return { ...await parseXMind(buffer), name };
  if (ext === '.mmd' || ext === '.mermaid') return { kind: 'mermaid', name, content: buffer.toString('utf8') };
  return { kind: 'image', name, dataUrl: `data:${IMAGE_TYPES[ext]};base64,${buffer.toString('base64')}` };
}
