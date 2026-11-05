import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { SaxesParser } from 'saxes';

interface ClipboardEntry {
  types: readonly string[];
  getType(type: string): Promise<Blob | unknown>;
}
const MAX_CLIPBOARD_BYTES = 2 * 1024 * 1024;

function plistPaths(buffer: Buffer): Promise<string[]> {
  if (buffer.subarray(0, 6).toString() === 'bplist') {
    if (process.platform !== 'darwin') return Promise.resolve([]);
    // Finder can supply a binary property list. Pass it as data, never shell code.
    return new Promise((resolve, reject) => {
      const child = execFile('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', '-'],
        { timeout: 2000, maxBuffer: MAX_CLIPBOARD_BYTES }, (error, stdout) => {
          if (error) return reject(error);
          try {
            const data: unknown = JSON.parse(stdout);
            resolve(Array.isArray(data) ? data.filter((value): value is string => typeof value === 'string') : []);
          } catch (error) { reject(error); }
        });
      child.stdin?.on('error', () => {});
      child.stdin?.end(buffer);
    });
  }
  const paths: string[] = [];
  let value: string | undefined;
  const parser = new SaxesParser();
  parser.on('opentag', tag => { if (tag.name === 'string') value = ''; });
  parser.on('text', text => { if (value !== undefined) value += text; });
  parser.on('cdata', text => { if (value !== undefined) value += text; });
  parser.on('closetag', tag => { if (tag.name === 'string' && value !== undefined) { paths.push(value); value = undefined; } });
  parser.write(buffer.toString('utf8')).close();
  return Promise.resolve(paths);
}

export async function decodeClipboardFilePaths(format: string, buffer: Buffer): Promise<string[]> {
  if (buffer.length > MAX_CLIPBOARD_BYTES) throw new Error('剪贴板文件列表过大');
  let values: string[];
  if (format.toLowerCase() === 'nsfilenamespboardtype') values = await plistPaths(buffer);
  else if (format.toLowerCase() === 'cf_hdrop') {
    if (buffer.length < 20) return [];
    const offset = buffer.readUInt32LE(0);
    if (offset < 20 || offset >= buffer.length) return [];
    values = buffer.subarray(offset).toString(buffer.readUInt32LE(16) ? 'utf16le' : 'latin1').split('\0');
  } else if (format.toLowerCase() === 'filenamew') values = buffer.toString('utf16le').split('\0');
  else values = buffer.toString('utf8').replace(/^\uFEFF/, '').split(/[\r\n\0]+/);
  const paths = new Set<string>();
  for (let value of values) {
    if (!value || value.includes('\0')) continue;
    if (/^file:/i.test(value)) {
      try { value = fileURLToPath(value); } catch { continue; }
    } else if (!path.isAbsolute(value) && !path.win32.isAbsolute(value)) continue;
    if (value.startsWith('//') || value.startsWith('\\\\')) continue;
    paths.add(value);
  }
  return [...paths];
}

/** Read only file-list formats, so copying ordinary text never imports a local path. */
export async function getClipboardFilePaths(entries: ClipboardEntry[]): Promise<string[]> {
  const paths = new Set<string>();
  for (const entry of entries) {
    for (const type of entry.types) {
      const raw = type.match(/^electron application\/osclipboard;\s*format="?([^";]+)"?$/i)?.[1] || type;
      if (!/^(text\/uri-list|x-special\/gnome-copied-files|public\.file-url|NSFilenamesPboardType|CF_HDROP|FileNameW)$/i.test(raw)) continue;
      const payload = await entry.getType(type);
      if (!(payload instanceof Blob)) continue;
      if (payload.size > MAX_CLIPBOARD_BYTES) throw new Error('剪贴板文件列表过大');
      for (const filename of await decodeClipboardFilePaths(raw, Buffer.from(await payload.arrayBuffer()))) paths.add(filename);
    }
  }
  return [...paths];
}
