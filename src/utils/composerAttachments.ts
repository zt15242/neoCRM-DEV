import type { AiFileAttachment } from '../../shared/types';

export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export function filesFromClipboard(data: DataTransfer): File[] {
  const files = Array.from(data.files || []);
  if (files.length) return files;
  return Array.from(data.items || []).filter(item => item.kind === 'file')
    .map(item => item.getAsFile()).filter((file): file is File => file !== null);
}

export function needsNativeFilePaste(data: DataTransfer): boolean {
  if (Array.from(data.types || []).some(type => /files|filename|file-url|hdrop|gnome-copied-files/i.test(type))) return true;
  if (/^file:\/\//mi.test(data.getData('text/uri-list'))) return true;
  return !data.getData('text/plain') && !data.getData('text/html');
}

interface AttachmentBridge {
  fileGetPath?: (file: File) => string;
  fileParseLocalPath: (filePath: string) => Promise<AiFileAttachment>;
  aiParseFileBuffer: (name: string, buffer: ArrayBuffer) => Promise<AiFileAttachment>;
}

export async function importComposerFiles(
  files: File[], api: AttachmentBridge,
  onAttachment: (attachment: AiFileAttachment) => void,
  onError: (name: string, error: unknown) => void,
): Promise<void> {
  const paths = new Set<string>();
  for (const file of files) {
    try {
      if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('文件超过 50 MB，请拆分后上传');
      let filename = '';
      try { filename = api.fileGetPath?.(file) || ''; } catch { /* Clipboard images have no physical path. */ }
      if (filename && paths.has(filename)) continue;
      if (filename) paths.add(filename);
      const imageExt = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' } as Record<string, string>)[file.type];
      const name = file.name || (imageExt ? `粘贴图片.${imageExt}` : '粘贴文件');
      const parsed = filename ? await api.fileParseLocalPath(filename)
        : await api.aiParseFileBuffer(name, await file.arrayBuffer());
      onAttachment(parsed);
    } catch (error) { onError(file.name || '粘贴文件', error); }
  }
}
