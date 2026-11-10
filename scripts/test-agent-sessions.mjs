import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'neo-agent-sessions-')));
const originalFetch = globalThis.fetch;
try {
  const userData = path.join(fixture, 'user-data'); fs.mkdirSync(userData);
  const bundle = path.join(fixture, 'subject.cjs');
  await build({ stdin: { resolveDir: root, loader: 'ts', contents: `
    export { AgentSessionService } from './electron/services/agentSessionService';
    export { AiService } from './electron/services/aiService';
    export { DEFAULT_AI_SETTINGS } from './shared/constants';
    export { orderAgentSessions } from './src/components/ai/chatSessionState';
    export { DshToolService } from './electron/services/dshToolService';
  ` }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, external: ['esbuild'], logLevel: 'silent',
    plugins: [{ name: 'test-host', setup(builder) {
      builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'test-host' }));
      builder.onLoad({ filter: /.*/, namespace: 'test-host' }, () => ({ contents: `
        export const app = { getPath: () => ${JSON.stringify(userData)} };
        export const dialog = {}, shell = {}, BrowserWindow = class {};
      ` }));
      builder.onResolve({ filter: /security\/licenseService$/ }, () => ({ path: 'license', namespace: 'test-license' }));
      builder.onLoad({ filter: /.*/, namespace: 'test-license' }, () => ({ contents: `
        export const licenseService = { getLicenseStatus: () => ({ isAuthorized: false }) };
      ` }));
    } }],
  });
  const { AgentSessionService, AiService, DEFAULT_AI_SETTINGS, orderAgentSessions, DshToolService } = createRequire(import.meta.url)(bundle);
  const parent = { id: 'sess_parent', title: 'Main', projectId: 'project', presetId: 'harness-agent',
    providerId: 'fixture', modelId: 'fixture-model', messages: [{ id: 'user', role: 'user', content: 'coordinate', createdAt: 1 }],
    createdAt: 1, updatedAt: 1, activeSkillIds: ['test-skill'] };
  const records = new Map([[parent.id, structuredClone(parent)]]);
  const tasks = new Map();
  const updates = [];
  let running = 0, peak = 0;
  const manager = new AgentSessionService({
    getSessions: () => structuredClone([...records.values()]),
    saveSession: session => records.set(session.id, structuredClone(session)),
    notify: session => updates.push(session),
    abort: id => tasks.get(id)?.finish(),
    run: (params, emit) => new Promise(resolve => {
      running++; peak = Math.max(peak, running);
      tasks.set(params.sessionId, { params, emit, finish: (text = 'done', error) => {
        tasks.delete(params.sessionId); running--;
        emit({ requestId: params.requestId, sessionId: params.sessionId, messageId: params.messageId,
          type: error ? 'error' : 'content_delta', delta: text, error });
        resolve();
      } });
    }),
  });
  const context = () => ({ params: { requestId: 'root-request', sessionId: parent.id, messageId: 'root-answer',
    providerId: 'fixture', modelId: 'fixture-model', messages: parent.messages, projectPath: fixture,
    activeSkillIds: ['test-skill'], activeMcpServerIds: ['test-mcp'], mode: 'plan', enableTools: true },
    connectorIdentity: 'connector-fixture', signal: new AbortController().signal });
  const ctx = context();
  const created = [];
  for (let index = 0; index < 4; index++) created.push(await manager.execute(index === 0 ? 'create_session' : 'spawn_agent',
    { title: `Task ${index}`, task: `Independent task ${index}` }, ctx));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(peak, 3);
  assert.equal(records.get(created[3].sessionId).agentRun.status, 'queued');
  assert.equal(created[0].parentSessionId, undefined);
  assert.equal(created[1].parentSessionId, parent.id);
  const worker = tasks.get(created[0].sessionId);
  assert.equal(worker.params.mode, 'plan');
  assert.equal(worker.params.projectPath, fixture);
  assert.equal(worker.params.expectedConnector, 'connector-fixture');
  assert.deepEqual(worker.params.activeSkillIds, ['test-skill']);
  assert.deepEqual(worker.params.activeMcpServerIds, ['test-mcp']);
  assert.equal(worker.params.messages.length, 1);
  assert.match(worker.params.messages[0].content, /Independent task/);
  const polling = await manager.execute('wait_agents', { sessionIds: created.map(item => item.sessionId), timeoutMs: 1 }, ctx);
  assert.equal(polling.timedOut, true); assert.equal(polling.allFinished, false);
  await assert.rejects(() => manager.execute('list_agents', {}, { ...ctx, signal: AbortSignal.abort() }));
  await assert.rejects(() => manager.execute('stop_agent', { sessionId: created[0].sessionId }, { ...ctx, params: { ...ctx.params, sessionId: 'unrelated' } }), /只能管理/);
  await assert.rejects(() => manager.execute('spawn_agent', { title: 'recursive', task: 'forbidden' }, { ...ctx, managed: true }), /不能继续派生/);
  await manager.execute('stop_agent', { sessionId: created[3].sessionId }, ctx);
  assert.equal(records.get(created[3].sessionId).agentRun.status, 'cancelled');
  assert.equal(tasks.has(created[3].sessionId), false);
  const waiter = manager.execute('wait_agents', { sessionIds: created.map(item => item.sessionId), timeoutMs: 1000 }, ctx);
  tasks.get(created[0].sessionId).finish('result A');
  tasks.get(created[1].sessionId).finish('', 'worker failed');
  tasks.get(created[2].sessionId).finish('result C');
  const finished = await waiter;
  assert.equal(finished.allFinished, true);
  assert.equal(finished.agents[0].output, 'result A');
  assert.equal(finished.agents[1].status, 'failed');
  assert.equal(finished.agents[1].error, 'worker failed');
  assert.equal(finished.agents[3].status, 'cancelled');
  await manager.execute('send_agent_message', { sessionId: created[0].sessionId, message: 'continue task' }, ctx);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(tasks.get(created[0].sessionId).params.messages.at(-1).content, 'continue task');
  const aborter = new AbortController();
  const waiting = manager.execute('wait_agents', { sessionIds: [created[0].sessionId] }, { ...ctx, signal: aborter.signal });
  aborter.abort(); await assert.rejects(() => waiting, /对话已停止/);
  manager.stopOwnedBy(parent.id);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(records.get(created[0].sessionId).agentRun.status, 'cancelled');
  await assert.rejects(() => manager.execute('spawn_agent', { title: 'limit', task: 'limit' }, { ...context(), dispatchCount: 8 }), /上限/);
  const ordered = orderAgentSessions([records.get(created[2].sessionId), parent, records.get(created[1].sessionId)]);
  assert.equal(ordered[0].id, parent.id);
  assert.equal(ordered.length, 3);
  assert.ok(updates.some(item => item.agentRun.status === 'running'));
  const questionContext = context();
  const questionAgent = await manager.execute('spawn_agent', { title: 'Question', task: 'Need confirmation' }, questionContext);
  await new Promise(resolve => setImmediate(resolve));
  const questionWorker = tasks.get(questionAgent.sessionId);
  questionWorker.emit({ requestId: questionWorker.params.requestId, sessionId: questionAgent.sessionId,
    messageId: questionWorker.params.messageId, type: 'tool_start',
    toolCall: { id: 'question', name: 'ask_user_question', arguments: { question: 'Which environment?' }, status: 'running' } });
  questionWorker.emit({ requestId: questionWorker.params.requestId, sessionId: questionAgent.sessionId,
    messageId: questionWorker.params.messageId, type: 'tool_update',
    toolCall: { id: 'question', name: 'ask_user_question', arguments: {}, resultData: { question: 'Which environment?' }, status: 'success' } });
  questionWorker.finish('Waiting for your answer');
  const questionResult = await manager.execute('wait_agents', { sessionIds: [questionAgent.sessionId], timeoutMs: 1000 }, questionContext);
  assert.equal(questionResult.agents[0].status, 'waiting');
  assert.equal(questionResult.agents[0].pendingQuestion.question, 'Which environment?');
  const deletedAgent = await manager.execute('spawn_agent', { title: 'Delete', task: 'Delete while running' }, questionContext);
  await new Promise(resolve => setImmediate(resolve));
  records.delete(deletedAgent.sessionId);
  tasks.get(deletedAgent.sessionId).finish('late output');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(records.has(deletedAgent.sessionId), false);
  const emptyAgent = await manager.execute('spawn_agent', { title: 'Empty', task: 'Empty model response' }, questionContext);
  await new Promise(resolve => setImmediate(resolve));
  tasks.get(emptyAgent.sessionId).finish('');
  const empty = await manager.execute('wait_agents', { sessionIds: [emptyAgent.sessionId], timeoutMs: 1000 }, questionContext);
  assert.equal(empty.agents[0].status, 'failed');
  console.log('PASS evidence states: questions reach the parent, empty responses fail, deleted conversations cannot be resurrected by late output');
  console.log('PASS scheduler: real concurrent jobs, queue cap, inheritance, results, continuation, cancellation, ownership and recursion limits');
  const dsh = new DshToolService();
  await Promise.all(['first', 'second'].map(id => DshToolService.runInSession(id, async () => {
    dsh.createGoal({ objective: id });
    const job = await dsh.executePtcCode({ code: 'return 7;' }, {});
    assert.equal(job.value, 7);
    await new Promise(resolve => setTimeout(resolve, 1));
    assert.equal(dsh.getGoal().goal.objective, id);
    assert.equal(dsh.listJobs().total, 1);
  })));
  const firstJob = DshToolService.runInSession('first', () => dsh.listJobs().jobs[0].id);
  assert.throws(() => DshToolService.runInSession('second', () => dsh.killJob({ job_id: firstJob })), /未找到/);
  console.log('PASS parallel tool state: goals and jobs isolated by session; one agent cannot stop another agent’s job');

  // Exercise the real AI stream loop and PTC dispatcher with local model responses.
  const sessionStore = { prepareNeoCliForConversation: () => ({ session: { isLoggedIn: false } }), getCurrentSession: () => ({ isLoggedIn: false }) };
  const ai = new AiService(sessionStore, {}, {});
  const provider = { id: 'fixture', name: 'Fixture', baseUrl: 'http://localhost:9999/v1', apiKey: '', protocol: 'openai',
    models: [{ id: 'fixture-model', name: 'Fixture', tools: true, contextWindow: 128000, maxOutputTokens: 4096 }] };
  ai.getAiConfig = () => ({ providers: [provider], settings: { ...DEFAULT_AI_SETTINGS, maxTokens: 4096 }, skills: [], mcpServers: [] });
  const notifications = [];
  ai.onAgentSessionChanged(session => notifications.push(session));
  let calls = 0;
  const sse = delta => new Response(`data: ${JSON.stringify({ choices: [{ delta, finish_reason: null }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
  const toolResponse = (name, args) => sse({ tool_calls: [{ index: 0, id: `call_${++calls}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const user = body.messages.findLast(item => item.role === 'user')?.content?.split('\n').at(-1);
    const toolMessages = body.messages.filter(item => item.role === 'tool');
    if (process.env.DEBUG_AGENT_TEST) console.log('Model fixture:', user, toolMessages.length);
    if (user === 'coordinate-standard') {
      assert.ok(body.tools.some(item => item.function.name === 'spawn_agent'));
      if (!toolMessages.length) return toolResponse('spawn_agent', { title: 'Worker', task: 'worker-read' });
      const first = JSON.parse(toolMessages[0].content);
      if (toolMessages.length === 1) return toolResponse('wait_agents', { sessionIds: [first.sessionId] });
      const result = JSON.parse(toolMessages.at(-1).content);
      assert.equal(result.allFinished, true);
      assert.equal(result.agents[0].output, 'verified worker result');
      return sse({ content: 'Main aggregated verified worker result' });
    }
    if (user === 'coordinate-ptc') {
      assert.deepEqual(body.tools.map(item => item.function.name), ['run_code']);
      if (!toolMessages.length) return toolResponse('run_code', { code: `
        const agent = await tools.spawn_agent({ title: 'PTC Worker', task: 'worker-read' });
        return await tools.wait_agents({ sessionIds: [agent.sessionId], timeoutMs: 1000 });
      ` });
      assert.match(toolMessages.at(-1).content, /verified worker result/);
      return sse({ content: 'PTC aggregated verified worker result' });
    }
    if (user === 'worker-read') {
      assert.ok(!body.tools.some(item => item.function.name === 'spawn_agent'));
      if (!toolMessages.length) return toolResponse('read', { file_path: 'source.txt' });
      if (process.env.DEBUG_AGENT_TEST) console.log('Read result:', toolMessages[0].content);
      assert.match(toolMessages[0].content, /source evidence/);
      return sse({ content: 'verified worker result' });
    }
    return sse({ content: 'continued' });
  };
  fs.writeFileSync(path.join(fixture, 'source.txt'), 'source evidence');
  for (const mode of ['standard', 'ptc']) {
    const main = { ...parent, id: `sess_${mode}`, mode, activeSkillIds: [],
      messages: [{ id: 'u', role: 'user', content: `coordinate-${mode}`, createdAt: 1,
        attachments: [{ id: 'source-attachment', name: 'source.txt', fullPath: path.join(fixture, 'source.txt'),
          mimeType: 'text/plain', size: 15, parsedContent: 'source evidence' }] }] };
    ai.saveSession(main);
    const events = [];
    await ai.startChatStream({ requestId: `req_${mode}`, sessionId: main.id, messageId: 'answer', providerId: 'fixture',
      modelId: 'fixture-model', messages: main.messages, enableTools: true, projectPath: fixture, mode }, event => events.push(event));
    assert.ok(!events.some(item => item.type === 'error'), JSON.stringify(events.filter(item => item.type === 'error')));
    assert.deepEqual(events.filter(item => item.type === 'done').map(item => item.completionStatus), ['completed']);
    assert.match(events.filter(item => item.type === 'content_delta').map(item => item.delta).join(''), /aggregated verified worker result/);
    const agents = ai.getSessions().filter(item => item.agentRun?.createdBySessionId === main.id);
    assert.equal(agents.length, 1);
    assert.equal(agents[0].agentRun.status, 'completed');
    assert.ok(agents[0].messages.at(-1).toolCalls.some(tool => tool.name === 'read'));
    assert.equal(agents[0].messages[0].attachments[0].fullPath, path.join(fixture, 'source.txt'));
    assert.equal(agents[0].messages[0].attachments[0].previewTruncated, true);
    assert.equal(agents[0].messages.at(-1).content, 'verified worker result');
    console.log(`PASS real ${mode} model loop: spawn → project file tool → persist → wait → parent summary`);
  }
  const child = ai.getSessions().find(item => item.agentRun);
  const childEvents = [];
  const continuation = { ...child, messages: [...child.messages, { id: 'followup', role: 'user', content: 'continue', createdAt: Date.now() }] };
  ai.saveSession(continuation);
  await ai.startChatStream({ requestId: 'manual-continue', sessionId: child.id, messageId: 'followup-answer', providerId: 'fixture', modelId: 'fixture-model',
    messages: continuation.messages, projectPath: fixture }, event => childEvents.push(event));
  while (ai.agentSessions.isActive(child.id)) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(ai.getSessions().find(item => item.id === child.id).agentRun.status, 'completed');
  assert.ok(notifications.some(item => item.id === child.id && item.agentRun.status === 'running'));
  const cancellingParent = { ...parent, id: 'sess_cancel' };
  ai.saveSession(cancellingParent);
  const parentController = new AbortController();
  ai.activeControllers.set('req_cancel', parentController);
  ai.activeControllers.set(cancellingParent.id, parentController);
  globalThis.fetch = (_url, options) => new Promise((_resolve, reject) => {
    const abort = () => reject(Object.assign(new Error('stopped'), { name: 'AbortError' }));
    options.signal.addEventListener('abort', abort, { once: true });
    if (options.signal.aborted) abort();
  });
  const cancelContext = { params: { sessionId: cancellingParent.id, requestId: 'req_cancel', messageId: 'cancel-answer',
    providerId: 'fixture', modelId: 'fixture-model', messages: parent.messages, projectPath: fixture, enableTools: true },
    connectorIdentity: '[null,null,null,null,null]', signal: parentController.signal };
  const startedAgent = await ai.agentContext.run(cancelContext, () => ai.executeUnifiedTool('spawn_agent', { title: 'Slow worker', task: 'hold' }, []));
  const runningChild = ai.getSessions().find(item => item.id === startedAgent.data.sessionId);
  assert.equal(runningChild.agentRun.status, 'running');
  ai.saveSession({ ...runningChild, messages: [], agentRun: { ...runningChild.agentRun, status: 'completed' } });
  assert.equal(ai.getSessions().find(item => item.id === runningChild.id).agentRun.status, 'running');
  assert.ok(ai.getSessions().find(item => item.id === runningChild.id).messages.length > 0);
  assert.equal(ai.abortChatStream('req_cancel'), true);
  while (ai.agentSessions.isActive(runningChild.id)) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(ai.getSessions().find(item => item.id === runningChild.id).agentRun.status, 'cancelled');
  const cancelledEvents = [];
  const cancelledRun = ai.startChatStream({ ...cancelContext.params, requestId: 'cancel-notice' }, event => cancelledEvents.push(event));
  while (!ai.activeControllers.has('cancel-notice')) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(ai.abortChatStream('cancel-notice'), true);
  await cancelledRun;
  assert.deepEqual(cancelledEvents.filter(event => event.type === 'done').map(event => event.completionStatus), ['cancelled']);
  const otherSession = ai.getSessions().find(item => item.id === 'sess_standard');
  ai.deleteSession(cancellingParent.id);
  assert.equal(ai.getSessions().some(item => item.id === runningChild.id), false);
  assert.ok(ai.getSessions().some(item => item.id === otherSession.id));
  const mismatched = { ...child, id: 'sess_wrong_connector' };
  ai.saveSession(mismatched, true);
  ai.agentSessions.startFromUi(mismatched, { ...cancelContext.params, sessionId: mismatched.id, expectedConnector: 'different-tenant' });
  while (ai.agentSessions.isActive(mismatched.id)) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(ai.getSessions().find(item => item.id === mismatched.id).agentRun.status, 'failed');
  assert.match(ai.getSessions().find(item => item.id === mismatched.id).agentRun.error, /连接器账号或租户已切换/);
  console.log('PASS real cancellation and persistence: root stop cancels owned agents, stale saves cannot erase live state, deletion is scoped, switched connectors fail before model/tool execution');
  provider.protocol = 'google-gemini'; provider.apiKey = 'fixture-key';
  const geminiResponse = parts => new Response(`data: ${JSON.stringify({ candidates: [{ content: { parts } }] })}\n\n`);
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const text = body.contents.flatMap(item => item.parts).find(item => item.text)?.text;
    const responses = body.contents.flatMap(item => item.parts).filter(item => item.functionResponse).map(item => item.functionResponse.response.result);
    if (text === 'coordinate-gemini') {
      assert.ok(body.tools[0].functionDeclarations.some(item => item.name === 'spawn_agent'));
      if (!responses.length) return geminiResponse([{ functionCall: { name: 'spawn_agent', args: { title: 'Gemini worker', task: 'gemini-worker' } } }]);
      if (responses.length === 1) return geminiResponse([{ functionCall: { name: 'wait_agents', args: { sessionIds: [responses[0].sessionId] } } }]);
      assert.equal(responses.at(-1).agents[0].output, 'Gemini verified result');
      return geminiResponse([{ text: 'Gemini aggregated result' }]);
    }
    assert.equal(text, 'gemini-worker');
    assert.ok(!body.tools[0].functionDeclarations.some(item => item.name === 'spawn_agent'));
    return geminiResponse([{ text: 'Gemini verified result' }]);
  };
  const gemini = { ...parent, id: 'sess_gemini', messages: [{ id: 'g', role: 'user', content: 'coordinate-gemini', createdAt: 1 }] };
  ai.saveSession(gemini);
  const geminiEvents = [];
  await ai.startChatStream({ sessionId: gemini.id, requestId: 'gemini-run', messageId: 'gemini-answer', providerId: 'fixture', modelId: 'fixture-model',
    messages: gemini.messages, enableTools: true, projectPath: fixture }, event => geminiEvents.push(event));
  assert.ok(!geminiEvents.some(event => event.type === 'error'), JSON.stringify(geminiEvents.filter(event => event.type === 'error')));
  assert.deepEqual(geminiEvents.filter(event => event.type === 'done').map(event => event.completionStatus), ['completed']);
  assert.match(geminiEvents.filter(event => event.type === 'content_delta').map(event => event.delta).join(''), /Gemini aggregated result/);
  console.log('PASS Gemini native stream: function declarations, async agent execution and result aggregation');
  const interrupted = { ...ai.getSessions().find(item => item.id === child.id), agentRun: { ...child.agentRun, status: 'running' } };
  ai.saveSession(interrupted, true);
  const restarted = new AiService(sessionStore, {}, {});
  assert.equal(restarted.getSessions().find(item => item.id === child.id).agentRun.status, 'interrupted');
  assert.ok(!restarted.abortChatStream('unknown-request'));
  console.log('PASS manual continuation uses managed snapshots; restart marks unfinished agents interrupted instead of claiming completion');
} finally {
  globalThis.fetch = originalFetch;
  fs.rmSync(fixture, { recursive: true, force: true });
}
