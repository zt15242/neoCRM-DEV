import type { UtilityProcess } from 'electron';
import { utilityProcess } from 'electron';
import { randomUUID } from 'node:crypto';
import { ModelGatewayError } from './modelGatewayError';
import { modelGatewayProxy } from './modelGatewayProxy';
import type { RuntimeMessage, RuntimeRequest, SerializedRuntimeError } from './agentRuntimeProtocol';
import type { ModelGatewayClient, ModelRequest, ModelStreamEvent, ModelTextResult, WorkBuddyModelBridge } from './modelGatewayTypes';

const MAX_RUNTIME_RSS_BYTES = 1536 * 1024 * 1024;
const MAX_RUNTIME_REQUESTS = 8;

interface Pending {
  events: ModelStreamEvent[];
  waiters: Array<() => void>;
  error?: Error;
  done: boolean;
  overflowed?: boolean;
}

export class AgentRuntimeHost implements ModelGatewayClient {
  private child?: UtilityProcess;
  private starting?: Promise<void>;
  private pending = new Map<string, Pending>();
  private heartbeat?: ReturnType<typeof setInterval>;
  private lastPong = 0;
  private memory = { rss: 0, heapUsed: 0, active: 0 };
  private heapLimit = 0;
  private crashes: number[] = [];
  private closing = false;

  constructor(private scriptPath: string, private options: { test?: boolean; maxRssBytes?: number; maxBufferedEvents?: number; heartbeatIntervalMs?: number; onDiagnostic?: (message: string, detail?: unknown) => void } = {}) {}

  private diagnostic(message: string, detail?: unknown) { this.options.onDiagnostic?.(message, detail); }

  private ensure() {
    if (this.closing) return Promise.reject(new Error('模型运行时正在关闭'));
    if (this.child?.pid) return Promise.resolve();
    if (this.starting) return this.starting;
    const now = Date.now();
    this.crashes = this.crashes.filter(time => now - time < 60_000);
    if (this.crashes.length >= 3) return Promise.reject(Object.assign(new Error('模型独立运行时在一分钟内连续退出 3 次，已暂停自动重启。请检查运行日志并重启应用。'), { nonRetryable: true }));
    this.starting = new Promise<void>((resolve, reject) => {
      const child = utilityProcess.fork(this.scriptPath, [], {
        serviceName: 'NeoCRM Agent Runtime', stdio: 'pipe',
        env: { ...process.env, ...(this.options.test ? { NEO_AGENT_RUNTIME_TEST: '1' } : {}) },
      });
      this.child = child;
      let ready = false;
      const timeout = setTimeout(() => { if (!ready) { child.kill(); reject(new Error('模型独立运行时启动超时')); } }, 15_000);
      timeout.unref?.();
      child.stdout?.on('data', data => this.diagnostic('Agent runtime wrote to stdout', { bytes: data.byteLength }));
      child.stderr?.on('data', data => this.diagnostic('Agent runtime wrote to stderr', { bytes: data.byteLength }));
      child.on('message', message => {
        const value = message as RuntimeMessage;
        if (value.type === 'ready') { ready = true; this.heapLimit = value.heapLimit; clearTimeout(timeout); this.lastPong = Date.now(); this.startHeartbeat(); resolve(); }
        else this.onMessage(value);
      });
      child.on('error', error => this.diagnostic('Agent runtime fatal error', error));
      child.on('exit', code => {
        clearTimeout(timeout);
        const expected = this.closing;
        if (!expected) this.crashes.push(Date.now());
        if (this.child === child) this.child = undefined;
        this.starting = undefined;
        this.stopHeartbeat();
        if (!ready) reject(new Error(`模型独立运行时启动失败 (${code})`));
        this.failAll(Object.assign(new Error(expected ? '模型运行时已关闭' : `模型独立运行时意外退出 (${code})；未自动重放请求，请核对已完成的工具结果后重试。`), { nonRetryable: true, runtimeCrashed: !expected }));
      });
    }).finally(() => { this.starting = undefined; });
    return this.starting;
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      const child = this.child;
      if (!child?.pid) return;
      if (this.lastPong && Date.now() - this.lastPong > 30_000) {
        this.diagnostic('Agent runtime heartbeat timed out', this.status());
        child.kill();
        return;
      }
      child.postMessage({ type: 'ping', at: Date.now() } satisfies RuntimeRequest);
    }, this.options.heartbeatIntervalMs ?? 5_000);
    this.heartbeat.unref?.();
  }
  private stopHeartbeat() { if (this.heartbeat) clearInterval(this.heartbeat); this.heartbeat = undefined; }

  private onMessage(message: RuntimeMessage) {
    if (message.type === 'pong') {
      this.lastPong = Date.now();
      this.memory = { rss: message.rss, heapUsed: message.heapUsed, active: message.active };
      if (message.rss > (this.options.maxRssBytes ?? MAX_RUNTIME_RSS_BYTES)) {
        this.diagnostic('Agent runtime exceeded its RSS watchdog; terminating the child without replaying active requests', this.status());
        this.child?.kill();
      }
      return;
    }
    if (!('id' in message)) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    if (message.type === 'events') {
      if (pending.overflowed) return;
      pending.events.push(...message.events);
      if (pending.events.length > (this.options.maxBufferedEvents ?? 4096)) {
        pending.events.length = 0;
        pending.overflowed = true;
        pending.error = Object.assign(new Error('模型事件积压超过安全上限，已停止该请求'), { nonRetryable: true });
        this.child?.postMessage({ type: 'cancel', id: message.id } satisfies RuntimeRequest);
      }
    } else if (message.type === 'error' && !pending.error) pending.error = this.deserialize(message.error);
    else if (message.type === 'done') pending.done = true;
    for (const wake of pending.waiters.splice(0)) wake();
  }

  private deserialize(error: SerializedRuntimeError) {
    if (error.kind) {
      const result = new ModelGatewayError(error.kind as any, error.message, error.status, error.retryAfterMs, error.contextWindow);
      if (error.nonRetryable) Object.assign(result, { nonRetryable: true });
      return result;
    }
    return Object.assign(new Error(error.message), { name: error.name, nonRetryable: error.nonRetryable });
  }
  private failAll(error: Error) {
    for (const pending of this.pending.values()) {
      pending.error = error;
      for (const wake of pending.waiters.splice(0)) wake();
    }
  }

  public async *stream(request: ModelRequest, workbuddy?: WorkBuddyModelBridge): AsyncGenerator<ModelStreamEvent> {
    // WorkBuddy refresh and proprietary dispatch remain in the main-process capability bridge for now.
    if (request.provider.id === 'workbuddy' || workbuddy) { yield* modelGatewayProxy.stream(request, workbuddy); return; }
    if (this.pending.size >= MAX_RUNTIME_REQUESTS) {
      throw Object.assign(new Error(`模型运行时并发已达 ${MAX_RUNTIME_REQUESTS} 个请求上限，请稍后重试`), { nonRetryable: true });
    }
    await this.ensure();
    const id = randomUUID();
    const pending: Pending = { events: [], waiters: [], done: false };
    this.pending.set(id, pending);
    const abort = () => this.child?.postMessage({ type: 'cancel', id } satisfies RuntimeRequest);
    request.signal?.addEventListener('abort', abort, { once: true });
    const { signal: _signal, ...serializable } = request;
    try {
      this.child!.postMessage({ type: 'stream', id, request: serializable } satisfies RuntimeRequest);
      while (true) {
        if (request.signal?.aborted) throw request.signal.reason;
        while (pending.events.length) yield pending.events.shift()!;
        if (pending.error) throw pending.error;
        if (pending.done) return;
        await new Promise<void>(resolve => pending.waiters.push(resolve));
      }
    } finally {
      request.signal?.removeEventListener('abort', abort);
      if (!pending.done) abort();
      this.pending.delete(id);
    }
  }

  public async generateText(request: ModelRequest, workbuddy?: WorkBuddyModelBridge): Promise<ModelTextResult> {
    let final: Extract<ModelStreamEvent, { type: 'finish' }> | undefined;
    for await (const event of this.stream(request, workbuddy)) if (event.type === 'finish') final = event;
    if (!final) throw new ModelGatewayError('invalid-response', '模型流未完整结束');
    if (final.reason === 'tool-calls') throw new ModelGatewayError('invalid-response', '文本请求意外返回工具调用，操作未执行');
    return { text: final.message.parts.filter(part => part.type === 'text').map(part => part.text).join(''), reason: final.reason, usage: final.usage };
  }

  public status() { return { running: Boolean(this.child?.pid), pid: this.child?.pid, heapLimit: this.heapLimit, ...this.memory, crashesLastMinute: this.crashes.length, pending: this.pending.size }; }
  public async testCrash() { await this.ensure(); this.child!.postMessage({ type: 'test-crash' } satisfies RuntimeRequest); }
  public async testRssWatchdog() { await this.ensure(); this.child!.postMessage({ type: 'test-rss' } satisfies RuntimeRequest); }
  public async dispose() {
    this.closing = true;
    this.stopHeartbeat();
    const child = this.child;
    if (!child) { await modelGatewayProxy.dispose?.(); return; }
    child.postMessage({ type: 'shutdown' } satisfies RuntimeRequest);
    await new Promise<void>(resolve => { const timer = setTimeout(() => { child.kill(); resolve(); }, 3000); child.once('exit', () => { clearTimeout(timer); resolve(); }); });
    await modelGatewayProxy.dispose?.();
  }
}
