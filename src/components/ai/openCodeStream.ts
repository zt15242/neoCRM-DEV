import type { AiChatMessage, AiChatSession, AiStreamEvent } from '../../../shared/types';
import { pendingQuestion } from './openCodeQuestion';

interface StreamHost {
  emit: (type: string, data: Record<string, unknown>, directory: string) => void;
  save: (session: AiChatSession) => Promise<void>;
  publish: (session: AiChatSession) => void;
  onSaveError: (error: unknown) => void;
}

interface Run {
  requestId: string;
  messageId: string;
  session: AiChatSession;
  directory: string;
  startedClock: number;
  terminal: boolean;
  settled: boolean;
  part?: 'text' | 'reasoning';
  segment: string;
  dirty: boolean;
  timer?: ReturnType<typeof setTimeout>;
  saving?: Promise<void>;
}

const openId = (id: string) => id.startsWith('sess_') ? `ses_${id.slice(5)}` : id;
const usageTokens = (usage?: AiChatMessage['usage']) => ({
  input: usage?.promptTokens || 0, output: usage?.completionTokens || 0,
  reasoning: 0, cache: { read: 0, write: 0 },
});

/** Owns foreground runs while the embedded frame changes sessions or reconnects. */
export class OpenCodeStream {
  private runs = new Map<string, Run>();
  private waiters = new Map<string, Set<() => void>>();

  constructor(private host: StreamHost) {}

  active(id: string) { const run = this.runs.get(id); return !!run && !run.settled; }
  activeIds() { return [...this.runs.keys()].filter(id => this.active(id)); }
  session(id: string) { return this.runs.get(id)?.session; }

  wait(id: string) {
    if (!this.active(id)) return Promise.resolve();
    return new Promise<void>(resolve => {
      const waiters = this.waiters.get(id) || new Set<() => void>();
      waiters.add(resolve);
      this.waiters.set(id, waiters);
    });
  }

  start(session: AiChatSession, requestId: string, messageId: string, directory: string) {
    if (this.active(session.id)) throw new Error('该会话仍在生成中');
    const run: Run = { session: structuredClone(session), requestId, messageId, directory, startedClock: performance.now(), terminal: false, settled: false, segment: '', dirty: false };
    this.runs.set(session.id, run);
    this.send(run, 'session.execution.started');
    this.send(run, 'session.step.started', {
      agent: session.presetId, model: { providerID: session.providerId, id: session.modelId }, started: Date.now(),
    });
  }

  private send(run: Run, type: string, data: Record<string, unknown> = {}) {
    this.host.emit(type, { sessionID: openId(run.session.id), assistantMessageID: run.messageId, ...data }, run.directory);
  }

  private closePart(run: Run) {
    if (!run.part) return;
    this.send(run, `session.${run.part}.ended`, { text: run.segment });
    run.part = undefined;
    run.segment = '';
  }

  private part(run: Run, type: 'text' | 'reasoning', delta: string) {
    if (run.part !== type) {
      this.closePart(run);
      run.part = type;
      this.send(run, `session.${type}.started`);
    }
    run.segment += delta;
    this.send(run, `session.${type}.delta`, { delta });
  }

  // Coalesce progress writes. At most one snapshot is in flight per conversation.
  private save(run: Run): Promise<void> {
    clearTimeout(run.timer);
    run.timer = undefined;
    if (run.saving) return run.saving;
    run.saving = (async () => {
      do {
        run.dirty = false;
        await this.host.save(structuredClone(run.session));
      } while (run.dirty);
    })().finally(() => { run.saving = undefined; });
    return run.saving;
  }

  private checkpoint(run: Run) {
    run.dirty = true;
    if (run.timer || run.saving) return;
    run.timer = setTimeout(() => {
      void this.save(run).catch(error => this.host.onSaveError(error));
    }, 750);
  }

  async receive(event: AiStreamEvent) {
    const run = this.runs.get(event.sessionId);
    if (!run || run.terminal || run.requestId !== event.requestId || run.messageId !== event.messageId) return;
    const message = run.session.messages.find(item => item.id === run.messageId)!;
    run.session.updatedAt = Date.now();
    if (event.usage) message.usage = event.usage;
    if (event.type === 'content_delta' && event.delta) {
      message.content += event.delta;
      this.part(run, 'text', event.delta);
    } else if (event.type === 'reasoning_delta' && event.delta) {
      message.reasoningContent = (message.reasoningContent || '') + event.delta;
      this.part(run, 'reasoning', event.delta);
    } else if ((event.type === 'tool_start' || event.type === 'tool_update') && event.toolCall) {
      this.closePart(run);
      const call = event.toolCall;
      const displayName = call.name === 'todo_write' ? 'todowrite' : call.name;
      const tools = message.toolCalls ||= [];
      const index = tools.findIndex(item => item.id === call.id);
      if (index < 0) {
        tools.push(structuredClone(call));
        this.send(run, 'session.tool.input.started', { id: call.id, name: displayName });
        this.send(run, 'session.tool.input.ended', { id: call.id, text: JSON.stringify(call.arguments || {}) });
        this.send(run, 'session.tool.called', { id: call.id, input: call.arguments || {}, executed: true });
      } else tools[index] = structuredClone(call);
      if (call.status === 'running') {
        this.send(run, 'session.tool.progress', { id: call.id, metadata: { title: call.name, description: call.resultSummary || '' } });
      } else if (call.status === 'success') {
        this.send(run, 'session.tool.success', { id: call.id, content: [{ type: 'text', text: call.resultSummary || '工具执行完成' }], executed: true });
      } else {
        this.send(run, 'session.tool.failed', { id: call.id, error: { type: 'tool', message: call.error || '工具执行失败' }, executed: true });
      }
    } else if (event.type === 'compaction_done' && event.compactionSummary) {
      run.session.compactionSummary = structuredClone(event.compactionSummary);
    }

    this.checkpoint(run);
    if (event.type !== 'done' && event.type !== 'error') return;
    run.terminal = true;
    this.closePart(run);
    message.durationMs = Math.max(0, performance.now() - run.startedClock);
    message.durationSource = 'monotonic';
    message.isThinkingFinished = true;
    if (event.type === 'error') message.error = event.error || '模型调用失败';
    for (const call of message.toolCalls || []) {
      if (call.status !== 'running') continue;
      call.status = 'error';
      call.error = message.error || '工具执行已停止';
      this.send(run, 'session.tool.failed', { id: call.id, error: { type: 'tool', message: call.error }, executed: true });
    }
    // The idle event causes OpenCode to reload history, so commit the final reply first.
    let saved = false;
    try {
      await this.save(run);
      this.host.publish(run.session);
      saved = true;
    } catch (error) {
      this.host.onSaveError(error);
    }
    if (event.type === 'error') {
      const error = { type: 'error', message: message.error };
      this.send(run, 'session.step.failed', { error });
      this.send(run, 'session.execution.failed', { error });
    } else {
      this.send(run, 'session.step.ended', { finish: 'stop',
        cost: message.usage?.estimatedCostUsd || 0, tokens: usageTokens(message.usage) });
      this.send(run, event.completionStatus === 'cancelled' ? 'session.execution.interrupted' : 'session.execution.succeeded',
        event.completionStatus === 'cancelled' ? { reason: 'user' } : {});
    }
    run.settled = true;
    if (saved && this.runs.get(event.sessionId) === run) this.runs.delete(event.sessionId);
    const form = event.completionStatus === 'waiting' && saved ? pendingQuestion(run.session) : undefined;
    if (form) this.host.emit('form.created', { form }, run.directory);
    for (const resolve of this.waiters.get(event.sessionId) || []) resolve();
    this.waiters.delete(event.sessionId);
  }

  async stop(id: string, abort: (requestId: string) => Promise<boolean>) {
    const run = this.runs.get(id);
    if (!run || run.terminal) return false;
    const pending = abort(run.requestId).then(() => null, error => error as Error);
    await this.receive({ requestId: run.requestId, sessionId: id, messageId: run.messageId, type: 'done', completionStatus: 'cancelled' });
    const error = await pending;
    if (error) throw error;
    return true;
  }

  dispose() {
    for (const run of this.runs.values()) {
      clearTimeout(run.timer);
      if (run.dirty) void this.save(run).catch(error => this.host.onSaveError(error));
    }
  }
}
