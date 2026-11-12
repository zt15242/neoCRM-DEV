import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const DEFAULT_LIMIT = 4 * 1024 * 1024;
const locks = new Map<string, Promise<unknown>>();

export interface TextSnapshot {
  path: string;
  content: string;
  revision: string;
  lineEnding: '\n' | '\r\n';
  bom: boolean;
  mode: number;
  bytes: number;
}

interface MutationOptions {
  expectedRevision?: string;
  limit?: number;
  createOnly?: boolean;
  projectRoot?: string;
}

async function assertProjectPath(filename: string, projectRoot?: string) {
  if (!projectRoot) return;
  const root = await fs.realpath(projectRoot);
  const relative = path.relative(root, await canonicalWorkspacePath(filename));
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('文件路径已超出当前项目，请重新读取并核对路径');
  }
}

const revision = (buffer: Uint8Array) => createHash('sha256').update(buffer).digest('hex');

/** Resolve aliases, including a new file below an existing symlinked directory. */
export async function canonicalWorkspacePath(filename: string): Promise<string> {
  const target = path.resolve(filename);
  try { return await fs.realpath(target); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    // A dangling symlink must not be treated as a new ordinary file.
    const stat = await fs.lstat(target).catch((failure: NodeJS.ErrnoException) => {
      if (failure.code !== 'ENOENT') throw failure;
    });
    if (stat?.isSymbolicLink()) throw new Error('目标是失效的符号链接，请先修复路径');
    const parent = path.dirname(target);
    if (parent === target) throw error;
    return path.join(await canonicalWorkspacePath(parent), path.basename(target));
  }
}

async function read(filename: string, limit: number): Promise<TextSnapshot> {
  const handle = await fs.open(filename, 'r');
  let buffer: Buffer;
  let mode = 0o644;
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error('目标路径不是普通文件');
    if (stat.size > limit) throw new Error(`文件超过 ${Math.ceil(limit / 1024 / 1024)} MB 文本编辑限制`);
    mode = stat.mode & 0o777;
    const chunks: Buffer[] = [];
    let offset = 0;
    while (offset <= limit) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, limit + 1 - offset));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (!bytesRead) break;
      chunks.push(chunk.subarray(0, bytesRead));
      offset += bytesRead;
    }
    if (offset > limit) throw new Error(`文件超过 ${Math.ceil(limit / 1024 / 1024)} MB 文本编辑限制`);
    buffer = Buffer.concat(chunks, offset);
  } finally { await handle.close(); }
  if (buffer.includes(0)) throw new Error('目标文件包含二进制内容，不能使用文本工具修改');
  const bom = buffer.subarray(0, 3).equals(BOM);
  const textBytes = bom ? buffer.subarray(3) : buffer;
  try { new TextDecoder('utf-8', { fatal: true }).decode(textBytes); }
  catch { throw new Error('文本工具仅支持 UTF-8 文件'); }
  return {
    path: filename, content: textBytes.toString('utf8'), revision: revision(buffer),
    lineEnding: textBytes.includes(Buffer.from('\r\n')) ? '\r\n' : '\n', bom, mode, bytes: buffer.length,
  };
}

function withLock<T>(filename: string, task: () => Promise<T>): Promise<T> {
  const key = path.resolve(filename);
  const previous = locks.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  locks.set(key, next);
  return next.finally(() => { if (locks.get(key) === next) locks.delete(key); });
}

async function replace(filename: string, content: string, current: TextSnapshot | undefined, options: MutationOptions) {
  if (content.includes('\0')) throw new Error('不能将二进制内容写入文本文件');
  if (options.expectedRevision !== undefined && current?.revision !== options.expectedRevision) throw new Error('文件已被 AI 或外部程序修改，请重新读取并合并');
  const body = Buffer.from(content.replace(/^\uFEFF/, ''), 'utf8');
  const output = current?.bom || (!current && content.startsWith('\uFEFF')) ? Buffer.concat([BOM, body]) : body;
  const temp = `${filename}.${process.pid}.${randomUUID()}.tmp`;
  if (await canonicalWorkspacePath(filename) !== filename) throw new Error('文件路径发生变更，请重新读取');
  await assertProjectPath(filename, options.projectRoot);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  try {
    await fs.writeFile(temp, output, { flag: 'wx', mode: current?.mode ?? 0o644 });
    if (current) await fs.chmod(temp, current.mode);
    const latest = await read(filename, Math.max(DEFAULT_LIMIT, output.length + 1))
      .catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? undefined : Promise.reject(error));
    if (latest?.revision !== current?.revision) throw new Error('保存期间文件发生变更，请重新读取并合并');
    if (await canonicalWorkspacePath(filename) !== filename) throw new Error('文件路径发生变更，请重新读取');
    await assertProjectPath(filename, options.projectRoot);
    await fs.rename(temp, filename);
  } finally { await fs.rm(temp, { force: true }); }
  return read(filename, Math.max(DEFAULT_LIMIT, output.length + 1));
}

export class WorkspaceMutationService {
  public async read(filename: string, limit = DEFAULT_LIMIT) { return read(await canonicalWorkspacePath(filename), limit); }

  public async write(filename: string, content: string, options: MutationOptions = {}) {
    const target = await canonicalWorkspacePath(filename);
    const limit = options.limit ?? DEFAULT_LIMIT;
    if (typeof content !== 'string' || Buffer.byteLength(content) > limit) throw new Error(`内容超过 ${Math.ceil(limit / 1024 / 1024)} MB 文本编辑限制`);
    return withLock(target, async () => {
      if (await canonicalWorkspacePath(filename) !== target) throw new Error('文件路径发生变更，请重新读取');
      await assertProjectPath(target, options.projectRoot);
      const current = await read(target, limit).catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? undefined : Promise.reject(error));
      if (options.createOnly && current) throw new Error('文件已存在，请先读取再修改');
      return replace(target, content, current, options);
    });
  }

  public async mutate(filename: string, transform: (current: TextSnapshot) => string | Promise<string>, options: MutationOptions = {}) {
    const target = await canonicalWorkspacePath(filename);
    const limit = options.limit ?? DEFAULT_LIMIT;
    return withLock(target, async () => {
      if (await canonicalWorkspacePath(filename) !== target) throw new Error('文件路径发生变更，请重新读取');
      await assertProjectPath(target, options.projectRoot);
      const current = await read(target, limit);
      if (options.expectedRevision !== undefined && current.revision !== options.expectedRevision) throw new Error('文件已被 AI 或外部程序修改，请重新读取并合并');
      const content = await transform(current);
      if (typeof content !== 'string' || Buffer.byteLength(content) > limit) throw new Error(`内容超过 ${Math.ceil(limit / 1024 / 1024)} MB 文本编辑限制`);
      if (content === current.content) throw new Error('修改后内容没有变化');
      return replace(target, content, current, { ...options, expectedRevision: current.revision });
    });
  }
}

export const workspaceMutationService = new WorkspaceMutationService();
