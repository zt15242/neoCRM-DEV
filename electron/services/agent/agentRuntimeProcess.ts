import { modelGateway } from './modelGateway';
import v8 from 'node:v8';
import type { RuntimeMessage, RuntimeRequest, SerializedRuntimeError } from './agentRuntimeProtocol';
import type { ModelStreamEvent } from './modelGatewayTypes';

const port = (process as typeof process & { parentPort?: { on(event: 'message', listener: (event: { data: RuntimeRequest }) => void): void; postMessage(message: RuntimeMessage): void } }).parentPort;
if (!port) throw new Error('Agent runtime requires an Electron utility process parent port');
const active = new Map<string, AbortController>();
const send = (message: RuntimeMessage) => port.postMessage(message);
const serializeError = (error: any): SerializedRuntimeError => ({
  name: error?.name || 'Error', message: error?.message || '模型运行时请求失败',
  kind: error?.kind, status: error?.status, retryAfterMs: error?.retryAfterMs,
  contextWindow: error?.contextWindow, nonRetryable: error?.nonRetryable,
});

async function run(id: string, request: RuntimeRequest & { type: 'stream' }) {
  if (active.size >= 8) throw Object.assign(new Error('模型运行时并发已达 8 个请求上限'), { nonRetryable: true });
  const controller = new AbortController();
  active.set(id, controller);
  let batch: ModelStreamEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (batch.length) { send({ type: 'events', id, events: batch }); batch = []; }
  };
  try {
    for await (const event of modelGateway.stream({ ...request.request, signal: controller.signal })) {
      batch.push(event);
      if (batch.length >= 32 || event.type === 'finish') flush();
      else if (!timer) { timer = setTimeout(flush, 12); timer.unref?.(); }
    }
    flush();
    send({ type: 'done', id });
  } catch (error) {
    flush();
    send({ type: 'error', id, error: serializeError(error) });
  } finally {
    if (timer) clearTimeout(timer);
    active.delete(id);
  }
}

port.on('message', event => {
  const message = event.data;
  if (message.type === 'stream') void run(message.id, message);
  else if (message.type === 'cancel') active.get(message.id)?.abort(new DOMException('模型请求已取消', 'AbortError'));
  else if (message.type === 'ping') {
    const memory = process.memoryUsage();
    send({ type: 'pong', at: message.at, rss: memory.rss, heapUsed: memory.heapUsed, active: active.size });
  } else if (message.type === 'test-crash' && process.env.NEO_AGENT_RUNTIME_TEST === '1') process.exit(86);
  else if (message.type === 'test-rss' && process.env.NEO_AGENT_RUNTIME_TEST === '1') {
    send({ type: 'pong', at: Date.now(), rss: 2 * 1024 * 1024 * 1024, heapUsed: 0, active: active.size });
  }
  else if (message.type === 'shutdown') {
    for (const controller of active.values()) controller.abort(new DOMException('模型运行时正在关闭', 'AbortError'));
    void modelGateway.dispose().finally(() => process.exit(0));
  }
});
send({ type: 'ready', pid: process.pid, heapLimit: v8.getHeapStatistics().heap_size_limit });
