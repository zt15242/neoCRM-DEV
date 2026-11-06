import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { app, dialog, BrowserWindow } from 'electron';
import type { AiFileAttachment } from '../../shared/types';
import { documentService, DOCUMENT_EXTENSIONS, MAX_DOCUMENT_BYTES, isOfficeDocument } from './documentService';

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', tiff: 'image/tiff', tif: 'image/tiff',
  heic: 'image/heic', avif: 'image/avif', svg: 'image/svg+xml',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel', xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  csv: 'text/csv', tsv: 'text/tab-separated-values', ods: 'application/vnd.oasis.opendocument.spreadsheet',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf', ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xmind: 'application/x-xmind',
};

export class FileService {
  public async selectAndParseFile(win?: BrowserWindow | null): Promise<AiFileAttachment | null> {
    const options: Electron.OpenDialogOptions = {
      title: '选择要添加的文件', properties: ['openFile'],
      filters: [
        { name: '所有文件', extensions: ['*'] },
        { name: '文档与文本 (Excel、Word、PDF、PPT、XMind)', extensions: [...DOCUMENT_EXTENSIONS, 'txt', 'md', 'json', 'sql', 'js', 'ts', 'java', 'xml', 'yaml', 'yml'] },
      ],
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled || !result.filePaths.length ? null : this.parseLocalFile(result.filePaths[0]);
  }

  public async parseLocalFile(filePath: string): Promise<AiFileAttachment> {
    const fullPath = path.resolve(filePath), stats = await fs.stat(fullPath);
    if (!stats.isFile()) throw new Error('请选择文件，暂不支持添加文件夹');
    if (stats.size > MAX_DOCUMENT_BYTES) throw new Error('文件超过 50 MB，请拆分后上传');
    const name = path.basename(fullPath), ext = path.extname(name).slice(1).toLowerCase();
    // Accept every file as an attachment; only supported documents and text are parsed.
    if (!DOCUMENT_EXTENSIONS.includes(ext)) {
      const handle = await fs.open(fullPath, 'r');
      let sample: Buffer;
      try {
        const bytes = Buffer.alloc(Math.min(stats.size, 8192));
        const result = await handle.read(bytes, 0, bytes.length, 0);
        sample = bytes.subarray(0, result.bytesRead);
      } finally { await handle.close(); }
      const image = ext !== 'svg' && MIME[ext]?.startsWith('image/');
      const utf16 = sample.subarray(0, 2).equals(Buffer.from([0xff, 0xfe])) || sample.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]));
      const binary = !utf16 && (sample.includes(0) || [...sample].filter(c => c < 9 || (c > 13 && c < 32)).length > sample.length * 0.05);
      if (image || binary || /^(zip|rar|7z|gz|bz2|xz|tar|exe|dll|dmg|pkg|app|mp3|mp4|mov|wav|ogg|flac|webm|woff2?|ttf|ico)$/.test(ext)) {
        const warning = image ? '图片已添加，尚未识别图像内容；需使用图片查看能力进一步分析。' : '文件已添加，当前格式不支持文本预览，尚未读取内容。';
        return { id: `file_${randomUUID()}`, name, fullPath, size: stats.size,
          mimeType: MIME[ext] || 'application/octet-stream', parsedContent: warning,
          summaryText: image ? '图片附件' : '文件附件 · 暂无文本预览',
          contentKind: image ? 'image' : 'binary', previewTruncated: true, parseWarnings: [warning] };
      }
    }
    const parsed = await documentService.read({ file_path: fullPath, limit: 100, max_chars: 12000 });
    const summaryText = `${ext.toUpperCase() || '文本'} · ${parsed.sectionCount} 个分段${parsed.truncated ? ' · 预览，支持继续读取' : ''}`;
    const sectionList = parsed.sections.slice(0, 30).map(s => `${s.id}: ${s.title}`).join('；');
    return {
      id: `file_${randomUUID()}`, name, fullPath, size: stats.size, mimeType: MIME[ext] || 'text/plain',
      parsedContent: `【文件附件: ${name}】\n分段: ${sectionList}${parsed.sectionCount > 30 ? '（其余分段可通过工具查看）' : ''}\n${parsed.warnings.map(w => `提示: ${w}`).join('\n')}\n\n${parsed.content}\n${parsed.truncated ? `\n[仅为预览，尚未读取全部内容。调用 read_document({ file_path: ${JSON.stringify(fullPath)}, offset: ${parsed.nextOffset} }) 继续；可用 section 选择工作表、PDF 页或幻灯片。]` : ''}`,
      summaryText, documentFormat: isOfficeDocument(name) ? parsed.format : undefined,
      previewTruncated: parsed.truncated, parseWarnings: parsed.warnings,
      contentKind: 'text',
    };
  }

  // Persist drag-and-drop uploads so every preview can be followed by a real tool read.
  public async parseBuffer(fileName: string, buffer: Buffer): Promise<AiFileAttachment> {
    if (buffer.length > MAX_DOCUMENT_BYTES) throw new Error('文件超过 50 MB，请拆分后上传');
    const safeName = path.win32.basename(path.basename(fileName)).replace(/[\u0000-\u001f]/g, '_');
    if (!safeName || safeName === '.' || safeName === '..') throw new Error('文件名无效');
    const directory = path.join(app.getPath('userData'), 'ai-attachments', randomUUID());
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const filename = path.join(directory, safeName);
    try {
      await fs.writeFile(filename, buffer, { mode: 0o600 });
      return await this.parseLocalFile(filename);
    } catch (error) {
      await fs.rm(directory, { recursive: true, force: true });
      throw error;
    }
  }
}
