import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AiChatSession } from '../../../shared/types';
import type { MessagePage, SessionPage, SessionStoreInfo, SessionStoreRequest } from './sessionRepositoryTypes';

/** The main process holds requests, never the complete database or migration input. */
export class SessionRepository {
  private worker?: Worker;
  private sequence = 0;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  private ready?: Promise<SessionStoreInfo>;
  private failed?: Error;
  private closed = false;

  constructor(private directory: string, private workerPath = path.join(
    typeof __dirname === 'string' ? __dirname : path.dirname(fileURLToPath(import.meta.url)), 'agent-session-store.js')) {}

  private start() {
    if (this.closed) throw new Error('会话存储已关闭');
    if (this.failed) throw this.failed;
    if (this.worker) return;
    const worker = new Worker(this.workerPath, { workerData: { directory: this.directory }, resourceLimits: { maxOldGenerationSizeMb: 256 } });
    this.worker = worker;
    worker.unref();
    worker.on('message', (message: { requestId: number; value?: unknown; error?: string }) => {
      const request = this.pending.get(message.requestId);
      if (!request) return;
      this.pending.delete(message.requestId);
      if (!this.pending.size) worker.unref();
      if (message.error) request.reject(new Error(message.error)); else request.resolve(message.value);
    });
    const fail = (error: Error) => {
      if (this.closed) return;
      this.failed = new Error(`会话存储工作线程不可用，未自动重放写入。请重启应用后核对会话：${error.message}`);
      for (const request of this.pending.values()) request.reject(this.failed);
      this.pending.clear();
      worker.unref();
    };
    worker.on('error', fail);
    worker.on('exit', code => { if (!this.closed) fail(new Error(`线程退出 (${code})`)); });
  }

  private request<T>(request: SessionStoreRequest): Promise<T> {
    this.start();
    if (this.pending.size >= 128) return Promise.reject(new Error('会话存储请求过多，请稍后重试'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.ref();
      try { this.worker!.postMessage({ requestId: id, ...request }); }
      catch (error) { this.pending.delete(id); if (!this.pending.size) this.worker!.unref(); reject(error); }
    });
  }

  initialize() { return this.ready ??= this.request<SessionStoreInfo>({ operation: 'initialize' }); }
  async list(offset = 0, limit = 100, owner?: string) {
    await this.initialize();
    return this.request<SessionPage>({ operation: 'list', offset, limit, owner });
  }
  async summaries(owner?: string) {
    const sessions: AiChatSession[] = [];
    let offset: number | null = 0;
    while (offset !== null) { const page = await this.list(offset, 200, owner); sessions.push(...page.sessions); offset = page.nextOffset; }
    return sessions;
  }
  async get(id: string) {
    await this.initialize();
    const page = await this.request<MessagePage | null>({ operation: 'get', id });
    return page?.session ?? null;
  }
  async messages(id: string, before?: number, limit = 50) {
    await this.initialize();
    return this.request<MessagePage | null>({ operation: 'get', id, before, limit });
  }
  async save(session: AiChatSession, options: { fromAgent?: boolean; active?: boolean } = {}) {
    await this.initialize();
    return this.request<AiChatSession>({ operation: 'save', session, ...options });
  }
  async delete(id: string) { await this.initialize(); return this.request<void>({ operation: 'delete', id }); }
  async clear() { await this.initialize(); return this.request<void>({ operation: 'clear' }); }
  async close() {
    if (!this.worker || this.closed) return;
    try { if (!this.failed) await this.request<void>({ operation: 'close' }); }
    finally {
      this.closed = true;
      for (const pending of this.pending.values()) pending.reject(new Error('会话存储已关闭'));
      this.pending.clear();
      await this.worker.terminate();
    }
  }
}

const repositories = new Map<string, SessionRepository>();
export function sharedSessionRepository(directory: string) {
  const key = path.resolve(directory);
  let repository = repositories.get(key);
  if (!repository) { repository = new SessionRepository(key); repositories.set(key, repository); }
  return repository;
}
export async function closeSharedSessionRepository(directory: string) {
  const key = path.resolve(directory), repository = repositories.get(key);
  if (repository) { await repository.close(); repositories.delete(key); }
}
