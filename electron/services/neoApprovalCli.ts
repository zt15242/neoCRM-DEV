import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getNeoCliEnvironment } from './neoCliRuntime';
import type { TenantFlowItem } from '../../shared/types';

export interface WorkflowReadOptions {
  projectPath?: string;
  signal?: AbortSignal;
}

type CliRun = (args: string[], cwd: string, signal?: AbortSignal) => Promise<string>;
type CliReadOptions = WorkflowReadOptions & { onCommand?: (command: string) => void };

/** Resolve npm's Windows shim to its Node entry point so arguments never pass through a shell. */
function cliExecutable(env: NodeJS.ProcessEnv): { executable: string; prefix: string[] } {
  if (process.platform !== 'win32') return { executable: 'neo', prefix: [] };
  const bins = (env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const bin of bins) {
    const native = path.join(bin, 'neo.exe');
    if (fs.existsSync(native)) return { executable: native, prefix: [] };
    for (const directory of [path.resolve(bin, '../neocrm-cli'), path.join(bin, 'node_modules/neocrm-cli'), path.resolve(bin, '../lib/node_modules/neocrm-cli')]) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
        const entry = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.neo;
        const node = bins.map((candidate) => path.join(candidate, 'node.exe')).find((candidate) => fs.existsSync(candidate));
        if (node && typeof entry === 'string' && fs.existsSync(path.resolve(directory, entry))) {
          return { executable: node, prefix: [path.resolve(directory, entry)] };
        }
      } catch {}
    }
  }
  throw new Error('未找到可执行的 neo CLI');
}

export const runNeoApprovalCli: CliRun = (args, cwd, signal) => {
  signal?.throwIfAborted();
  const env = { ...getNeoCliEnvironment(), NO_COLOR: '1', FORCE_COLOR: '0', CI: 'true' };
  const command = cliExecutable(env);
  return new Promise((resolve, reject) => {
    execFile(command.executable, [...command.prefix, ...args], {
      cwd, env, signal, timeout: 65000, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error) {
        if (error.name === 'AbortError' || signal?.aborted) return reject(error);
        const reason = error.killed ? '命令执行超时' : (String(stderr || '').trim() || error.message);
        return reject(new Error(reason.slice(0, 1000)));
      }
      resolve(String(stdout));
    });
  });
};

export const runNeoCliCommand = runNeoApprovalCli;

function jsonObject(text: string): any {
  try {
    const value = JSON.parse(text.replace(/^\uFEFF/, '').trim());
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.success === false || value.error) throw new Error();
    return value;
  } catch {
    throw new Error('neo CLI 未返回有效的审批流 JSON');
  }
}

function statusOf(value: unknown): { status: number; statusName: string } {
  const code = String(value ?? '').toUpperCase();
  if (code === 'ENABLED' || code === '1') return { status: 1, statusName: '启用' };
  if (code === 'DISABLED' || code === '2') return { status: 2, statusName: '禁用' };
  if (code === 'DESIGNING' || code === '3') return { status: 3, statusName: '设计' };
  return { status: 0, statusName: code || '未知' };
}

export class NeoApprovalCliReader {
  constructor(private run: CliRun = runNeoApprovalCli) {}

  private async execute(args: string[], root: string, options: CliReadOptions): Promise<any> {
    options.signal?.throwIfAborted();
    options.onCommand?.(['neo', ...args].join(' '));
    return jsonObject(await this.run(args, root, options.signal));
  }

  public async list(root: string, options: CliReadOptions = {}): Promise<TenantFlowItem[]> {
    const items: TenantFlowItem[] = [];
    const seen = new Set<string>();
    let total = 0;
    let page = 1;
    do {
      const result = await this.execute(['list', 'approvalprocess', '--page', String(page), '--page-size', '50', '--json'], root, options);
      if (!Array.isArray(result.items) || !Number.isInteger(result.total) || result.total < 0 || result.pageNum !== page) {
        throw new Error('neo CLI 审批流目录响应缺少有效的 items、total 或页码');
      }
      if (page > 1 && result.total !== total) throw new Error('审批流目录在分页读取时发生变化');
      total = result.total;
      if ((!result.items.length && items.length < total) || items.length + result.items.length > total) {
        throw new Error('neo CLI 审批流分页结果不完整');
      }
      for (const model of result.items) {
        if (!model || !['string', 'number'].includes(typeof model.processInfoId)) throw new Error('审批流目录缺少流程模型 ID');
        const id = String(model.processInfoId);
        if (!id || seen.has(id)) throw new Error('neo CLI 审批流目录出现重复或空流程 ID');
        seen.add(id);
        items.push({
          id, procInfoId: id,
          procdefId: model.processDefinitionId == null ? '' : String(model.processDefinitionId),
          name: model.name || model.processName || '未命名流程',
          entityApiKey: model.entityApiKey || '', objectName: model.entityLabel || model.objectName || model.entityApiKey || '',
          ...statusOf(model.status), procType: 2,
          ...(model.version !== undefined ? { version: Number(model.version) } : {}),
          description: model.description || '', updatedAt: model.updatedAt || model.updateTime || '',
          startupOrder: model.startupOrder,
        });
      }
      page++;
      if (page > 1000 && items.length < total) throw new Error('审批流目录分页超出读取上限');
    } while (items.length < total);
    return items;
  }

  public async retrieve(root: string, definitionId: string | number, options: CliReadOptions = {}): Promise<any> {
    const id = String(definitionId);
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('审批流定义 ID 无效');
    // The CLI persists snapshots. Use a temporary project with the same project ID/auth to protect working sources.
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'neo-project.json'), 'utf8'));
    if (typeof manifest.projectId !== 'string' || !manifest.projectId) throw new Error('CLI 项目缺少 projectId');
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-approval-read-'));
    try {
      fs.writeFileSync(path.join(temporary, 'neo-project.json'), JSON.stringify({ ...manifest, sourceDir: 'neocrm-src' }), { mode: 0o600 });
      const result = await this.execute(['retrieve', 'approvalprocess', '--definition-id', id, '--json'], temporary, options);
      const entry = result.entry;
      if (entry?.result !== 'SUCCESS' || entry.integrity?.verdict === 'FAIL' || typeof entry.snapshotFile !== 'string') {
        throw new Error('neo CLI 未完整获取审批流定义快照');
      }
      const snapshotPath = fs.realpathSync(path.resolve(temporary, entry.snapshotFile));
      const relative = path.relative(fs.realpathSync(temporary), snapshotPath);
      if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw new Error('CLI 快照路径超出临时目录');
      const snapshot = jsonObject(fs.readFileSync(snapshotPath, 'utf8'));
      if (snapshot.format !== 'NeoApprovalProcessDefinition/1.0' || snapshot.source?.processDefinitionId !== id ||
          !snapshot.source?.revision || snapshot.source.revision !== snapshot.definition?.revision ||
          !['nodes', 'edges', 'conditions', 'assignees', 'actions', 'settings'].every((section) => Array.isArray(snapshot.fragments?.[section]))) {
        throw new Error('neo CLI 审批流快照格式、定义 ID 或版本不一致');
      }
      return snapshot;
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }
}
