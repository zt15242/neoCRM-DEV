import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { ProjectTextFile } from '../../shared/editorTypes';

const LIMIT = 2 * 1024 * 1024;
const revision = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
const within = (root: string, file: string) => {
  const relative = path.relative(root, file);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

export class ProjectEditorService {
  private writes = new Map<string, Promise<unknown>>();
  constructor(private projectRoots: () => string[]) {}

  private async resolve(root: string, file: string): Promise<string> {
    if (!this.projectRoots().some(item => path.resolve(item) === path.resolve(root))) throw new Error('请先关联此项目目录');
    const [realRoot, realFile] = await Promise.all([fs.realpath(root), fs.realpath(file)]);
    if (!within(realRoot, realFile)) throw new Error('只能编辑当前项目内的文件');
    return realFile;
  }

  public async read(root: string, file: string): Promise<ProjectTextFile> {
    const full = await this.resolve(root, file);
    const handle = await fs.open(full, 'r');
    let buffer: Buffer;
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) throw new Error('请选择文件');
      if (stat.size > LIMIT) throw new Error('文件超过 2 MB，请使用系统编辑器打开；文件内容未被截断');
      // Bound the read even if another process grows the file after stat().
      const data = Buffer.alloc(LIMIT + 1);
      let length = 0;
      while (length < data.length) {
        const { bytesRead } = await handle.read(data, length, data.length - length, null);
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (length > LIMIT) throw new Error('文件超过 2 MB，请使用系统编辑器打开');
      buffer = data.subarray(0, length);
    } finally { await handle.close(); }
    if (buffer.includes(0)) throw new Error('此文件为二进制内容，请使用系统应用打开');
    try { new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch { throw new Error('内置编辑器仅支持 UTF-8 文本，请使用系统编辑器打开此文件'); }
    return { path: file, relativePath: path.relative(root, file), content: buffer.toString('utf8'), lineEnding: buffer.includes(Buffer.from('\r\n')) ? '\r\n' : '\n', revision: revision(buffer) };
  }

  public async save(root: string, file: string, content: string, expectedRevision: string): Promise<ProjectTextFile> {
    if (typeof content !== 'string' || Buffer.byteLength(content) > LIMIT) throw new Error('内容超过内置编辑器的 2 MB 限制');
    if (content.includes('\0')) throw new Error('不能将二进制内容写入文本文件');
    const full = await this.resolve(root, file);
    const task = (this.writes.get(full) || Promise.resolve()).catch(() => {}).then(async () => {
      const current = await this.read(root, file);
      if (current.revision !== expectedRevision) throw new Error('文件已被 AI 或外部程序修改。请先复制当前草稿，再点击“重新读取”核对最新内容');
      const temp = full + '.' + randomUUID() + '.tmp';
      const stat = await fs.stat(full);
      try {
        await fs.writeFile(temp, content, { flag: 'wx', mode: stat.mode & 0o777 });
        // Check again after preparing the replacement; never overwrite an already observed conflict.
        if ((await this.read(root, file)).revision !== expectedRevision) throw new Error('保存期间文件发生变更，请重新读取并合并');
        await fs.rename(temp, full);
      } finally { await fs.rm(temp, { force: true }); }
      return { ...current, content, revision: revision(Buffer.from(content)) };
    });
    this.writes.set(full, task);
    try { return await task; } finally { if (this.writes.get(full) === task) this.writes.delete(full); }
  }
}
