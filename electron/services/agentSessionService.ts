import { randomUUID } from 'node:crypto';
import type { AiChatSession, AiChatMessage, AiStreamEvent, AiSessionMode } from '../../shared/types';

export interface ChatRunParams {
  requestId: string;
  sessionId: string;
  messageId: string;
  providerId: string;
  modelId: string;
  presetPrompt?: string;
  messages: AiChatMessage[];
  enableTools?: boolean;
  activeSkillIds?: string[];
  activeMcpServerIds?: string[];
  compactionSummary?: AiChatSession['compactionSummary'];
  projectPath?: string;
  projectId?: string;
  mode?: AiSessionMode;
  expectedConnector?: string;
}

export interface AgentRunContext {
  params: ChatRunParams;
  signal?: AbortSignal;
  connectorIdentity?: string;
  managed?: boolean;
  dispatchCount?: number;
}

interface Host {
  getSessions: () => AiChatSession[];
  saveSession: (session: AiChatSession) => void;
  run: (params: ChatRunParams, emit: (event: AiStreamEvent) => void) => Promise<void>;
  abort: (sessionId: string) => void;
  notify: (session: AiChatSession) => void;
}
interface Job {
  session: AiChatSession;
  params: ChatRunParams;
  timer?: ReturnType<typeof setTimeout>;
  cancelled: boolean;
  waiting: boolean;
}
export const isAgentRunning = (session: AiChatSession) =>
  session.agentRun?.status === 'running' || session.agentRun?.status === 'queued';

export class AgentSessionService {
  private jobs = new Map<string, Job>();
  private queue: Job[] = [];
  private running = 0;
  private listeners = new Set<() => void>();

  constructor(private host: Host) {}

  isActive(sessionId: string) { return this.jobs.has(sessionId); }

  private checkContext(context: AgentRunContext) {
    context.signal?.throwIfAborted();
    if (!context.params.sessionId) throw new Error('当前请求没有有效会话');
  }

  private owned(context: AgentRunContext, id: string) {
    this.checkContext(context);
    const session = this.host.getSessions().find(item => item.id === id);
    if (!session?.agentRun || session.agentRun.createdBySessionId !== context.params.sessionId) {
      throw new Error('只能管理当前会话创建的代理');
    }
    return session;
  }

  private reserveDispatch(context: AgentRunContext) {
    this.checkContext(context);
    if (context.managed || this.host.getSessions().find(item => item.id === context.params.sessionId)?.agentRun) {
      throw new Error('子代理和自主会话不能继续派生或调度代理，请由主会话统一派发');
    }
    if ((context.dispatchCount || 0) >= 8) throw new Error('本轮代理派发已达 8 次上限，请先汇总现有结果');
    if (this.jobs.size >= 24) throw new Error('后台任务队列已满，请等待已有任务完成');
    context.dispatchCount = (context.dispatchCount || 0) + 1;
  }

  private text(value: unknown, name: string, max: number) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`缺少有效${name}`);
    if (value.length > max) throw new Error(`${name}超过 ${max} 字符限制`);
    return value.trim();
  }

  private snapshot(session: AiChatSession) {
    const message = [...session.messages].reverse().find(item => item.role === 'assistant');
    const content = message?.content || '';
    const question = message?.toolCalls?.findLast(item => item.status === 'success' && ['ask_user_question', 'exit_plan_mode'].includes(item.name));
    return { sessionId: session.id, title: session.title, ...session.agentRun,
      output: content.slice(0, 12000), outputTruncated: content.length > 12000,
      ...(session.agentRun?.status === 'waiting' && question ? { pendingQuestion: question.resultData || question.arguments } : {}),
      error: session.agentRun?.error || message?.error };
  }

  async execute(name: string, args: any, context: AgentRunContext): Promise<any> {
    this.checkContext(context);
    if (name === 'create_session' || name === 'spawn_agent') {
      const title = this.text(args?.title, '标题', 100);
      const task = this.text(args?.task, '任务', 30000);
      const parent = this.host.getSessions().find(item => item.id === context.params.sessionId);
      if (!parent) throw new Error('当前主会话不存在，请先保存会话');
      this.reserveDispatch(context);
      const now = Date.now();
      const attachments = [...new Map(context.params.messages.filter(message => message.role === 'user').flatMap(message => message.attachments || [])
        .filter(file => file.fullPath).map(file => [file.fullPath, { ...file,
          parsedContent: '(主会话已授权读取此附件，使用 read_document 获取真实内容。)', previewTruncated: true }])).values()];
      const session: AiChatSession = {
        id: `sess_agent_${randomUUID()}`, title, projectId: parent.projectId,
        presetId: parent.presetId, providerId: context.params.providerId, modelId: context.params.modelId,
        activeSkillIds: [...(context.params.activeSkillIds || parent.activeSkillIds || [])],
        mode: context.params.mode || parent.mode || 'standard',
        messages: [{ id: `msg_u_${randomUUID()}`, role: 'user', content: task, createdAt: now,
          ...(attachments.length ? { attachments } : {}) }],
        createdAt: now, updatedAt: now,
        agentRun: { kind: name === 'spawn_agent' ? 'subagent' : 'autonomous',
          createdBySessionId: parent.id, parentSessionId: name === 'spawn_agent' ? parent.id : undefined,
          status: 'queued', requestId: '', messageId: '' },
      };
      this.enqueue(session, { ...context.params, sessionId: session.id, messages: session.messages,
        projectId: session.projectId,
        mode: session.mode, activeSkillIds: session.activeSkillIds, compactionSummary: undefined,
        expectedConnector: context.connectorIdentity });
      return this.snapshot(session);
    }
    if (name === 'list_agents') {
      return { agents: this.host.getSessions().filter(item => item.agentRun?.createdBySessionId === context.params.sessionId)
        .map(item => this.snapshot(item)) };
    }
    if (name === 'wait_agents') {
      if (!Array.isArray(args?.sessionIds) || args.sessionIds.length < 1 || args.sessionIds.length > 8 ||
          args.sessionIds.some((id: unknown) => typeof id !== 'string')) throw new Error('sessionIds 必须包含 1 到 8 个代理 ID');
      const ids: string[] = [...new Set<string>(args.sessionIds)];
      const read = () => ids.map(id => this.owned(context, id));
      const timeout = args.timeoutMs === undefined ? 30000 : Number(args.timeoutMs);
      if (!Number.isFinite(timeout) || timeout < 0 || timeout > 30000) throw new Error('timeoutMs 必须在 0 到 30000 之间');
      const done = () => read().every(item => !isAgentRunning(item));
      let timedOut = false;
      if (!done() && timeout > 0) {
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => { clearTimeout(timer); this.listeners.delete(update); context.signal?.removeEventListener('abort', abort); };
          const update = () => { try { if (done()) { cleanup(); resolve(); } } catch (error) { cleanup(); reject(error); } };
          const abort = () => { cleanup(); reject(Object.assign(new Error('对话已停止'), { name: 'AbortError' })); };
          const timer = setTimeout(() => { timedOut = true; cleanup(); resolve(); }, timeout);
          this.listeners.add(update);
          context.signal?.addEventListener('abort', abort, { once: true });
          if (context.signal?.aborted) abort(); else update();
        });
      }
      return { allFinished: done(), timedOut, agents: read().map(item => this.snapshot(item)) };
    }
    const session = this.owned(context, args?.sessionId);
    if (name === 'stop_agent') {
      this.stop(session.id);
      return this.snapshot(this.host.getSessions().find(item => item.id === session.id) || session);
    }
    if (name === 'send_agent_message') {
      const message = this.text(args?.message, '消息', 30000);
      if (this.isActive(session.id)) throw new Error('代理仍在运行，请先等待或停止，待请求结束后再继续');
      this.reserveDispatch(context);
      session.messages.push({ id: `msg_u_${randomUUID()}`, role: 'user', content: message, createdAt: Date.now() });
      this.enqueue(session, { ...context.params, sessionId: session.id, messages: session.messages,
        projectId: session.projectId,
        providerId: session.providerId, modelId: session.modelId, mode: session.mode,
        activeSkillIds: session.activeSkillIds, compactionSummary: session.compactionSummary,
        expectedConnector: context.connectorIdentity });
      return this.snapshot(session);
    }
    throw new Error(`未知代理工具：${name}`);
  }

  startFromUi(session: AiChatSession, params: ChatRunParams) {
    if (this.isActive(session.id)) throw new Error('该代理仍在运行');
    this.enqueue(session, params);
  }

  private enqueue(session: AiChatSession, input: ChatRunParams) {
    if (this.jobs.size >= 24) throw new Error('后台任务队列已满，请等待已有任务完成');
    const requestId = `req_agent_${randomUUID()}`;
    const messageId = input.messageId && session.messages.some(item => item.id === input.messageId)
      ? input.messageId : `msg_a_${randomUUID()}`;
    const messages = input.messages.filter(item => item.id !== messageId);
    const placeholder: AiChatMessage = { id: messageId, role: 'assistant', content: '', createdAt: Date.now() };
    session.messages = [...messages, placeholder];
    session.agentRun = { ...session.agentRun!, status: 'queued', requestId, messageId,
      startedAt: undefined, finishedAt: undefined, error: undefined };
    const job: Job = { session, params: { ...input, requestId, messageId, messages }, cancelled: false, waiting: false };
    this.jobs.set(session.id, job);
    this.queue.push(job);
    try { this.flush(job, true); }
    catch (error) {
      this.jobs.delete(session.id);
      this.queue = this.queue.filter(item => item !== job);
      throw error;
    }
    queueMicrotask(() => this.pump());
  }

  private flush(job: Job, creating = false) {
    clearTimeout(job.timer);
    job.timer = undefined;
    const latest = this.host.getSessions().find(item => item.id === job.session.id);
    if (!latest && !creating) return; // 删除会话后，迟到的增量不能把它重新写回来。
    job.session = { ...(latest || job.session), messages: job.session.messages,
      compactionSummary: job.session.compactionSummary, agentRun: job.session.agentRun,
      updatedAt: Math.max(Date.now(), (latest?.updatedAt || 0) + 1) };
    this.host.saveSession(job.session);
    this.host.notify(structuredClone(job.session));
    for (const listener of [...this.listeners]) listener();
  }

  private onEvent(job: Job, event: AiStreamEvent) {
    if (job.cancelled || event.requestId !== job.params.requestId) return;
    const message = job.session.messages.find(item => item.id === job.params.messageId)!;
    if (event.type === 'content_delta') message.content += event.delta || '';
    if (event.type === 'reasoning_delta') message.reasoningContent = (message.reasoningContent || '') + (event.delta || '');
    if (event.type === 'tool_start' && event.toolCall) (message.toolCalls ||= []).push(event.toolCall);
    if (event.type === 'tool_update' && event.toolCall) {
      message.toolCalls = (message.toolCalls || []).map(item => item.id === event.toolCall!.id ? event.toolCall! : item);
      if (event.toolCall.status === 'success' && ['ask_user_question', 'exit_plan_mode'].includes(event.toolCall.name)) job.waiting = true;
    }
    if (event.type === 'compaction_done') job.session.compactionSummary = event.compactionSummary;
    if (event.type === 'error') { message.error = event.error || '代理执行失败'; job.session.agentRun!.error = message.error; }
    if (event.usage) message.usage = event.usage;
    if (event.durationMs) message.durationMs = event.durationMs;
    if (!job.timer) job.timer = setTimeout(() => {
      try { this.flush(job); }
      catch (error) { console.warn('[Agent] 保存代理进度失败:', error); }
    }, 1200);
  }

  private pump() {
    while (this.running < 3 && this.queue.length) {
      const job = this.queue.shift()!;
      if (job.cancelled) continue;
      this.running++;
      job.session.agentRun!.status = 'running';
      job.session.agentRun!.startedAt = Date.now();
      try { this.flush(job); }
      catch (error) {
        this.running--;
        this.jobs.delete(job.session.id);
        job.session.agentRun!.status = 'failed';
        job.session.agentRun!.error = '无法保存会话，代理未启动';
        this.host.notify(structuredClone(job.session));
        console.warn('[Agent] 启动代理失败:', error);
        continue;
      }
      void this.run(job).catch(error => console.warn('[Agent] 保存代理结果失败:', error));
    }
  }

  private async run(job: Job) {
    try {
      await this.host.run(job.params, event => this.onEvent(job, event));
    } catch (error: any) {
      if (!job.cancelled) {
        job.session.agentRun!.error = error?.message || String(error);
        const message = job.session.messages.find(item => item.id === job.params.messageId);
        if (message) message.error = job.session.agentRun!.error;
      }
    } finally {
      const state = job.session.agentRun!;
      const answer = job.session.messages.find(item => item.id === job.params.messageId);
      if (!job.cancelled && !state.error && !job.waiting && !answer?.content.trim()) {
        state.error = '代理没有返回可用结果，请检查模型响应后继续';
        if (answer) answer.error = state.error;
      }
      state.status = job.cancelled ? 'cancelled' : state.error ? 'failed' : job.waiting ? 'waiting' : 'completed';
      state.finishedAt = Date.now();
      this.jobs.delete(job.session.id);
      this.running--;
      try { this.flush(job); } finally { this.pump(); }
    }
  }

  stop(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job || job.cancelled) return false;
    const queued = job.session.agentRun!.status === 'queued';
    job.cancelled = true;
    job.session.agentRun!.status = 'cancelled';
    job.session.agentRun!.finishedAt = Date.now();
    const message = job.session.messages.find(item => item.id === job.params.messageId);
    if (message) message.toolCalls = message.toolCalls?.map(item => item.status === 'running'
      ? { ...item, status: 'error', resultSummary: '代理已停止' } : item);
    if (queued) {
      this.queue = this.queue.filter(item => item !== job);
      this.jobs.delete(id);
    } else this.host.abort(id);
    this.flush(job);
    return true;
  }

  stopOwnedBy(owner: string) {
    let stopped = false;
    for (const [id, job] of this.jobs) if (job.session.agentRun?.createdBySessionId === owner) stopped = this.stop(id) || stopped;
    return stopped;
  }

  stopAll() { for (const id of [...this.jobs.keys()]) this.stop(id); }
}
