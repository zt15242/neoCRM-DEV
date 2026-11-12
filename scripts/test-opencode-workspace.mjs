import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-opencode-bridge-'));
const require = createRequire(import.meta.url);
const appRequire = createRequire(path.join(root, 'vendor/opencode/packages/app/package.json'));
const { Window } = await import(pathToFileURL(appRequire.resolve('happy-dom')).href);
const dom = new Window({ url: 'http://localhost/', settings: { disableIframePageLoading: true } });
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLIFrameElement', 'MessageEvent', 'MutationObserver']) {
  Object.defineProperty(globalThis, name, { value: name === 'window' ? dom : dom[name], configurable: true });
}
if (!globalThis.ResizeObserver) globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
let reactRoot;
try {
  const subject = path.join(fixture, 'subject.cjs');
  await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
    export { OpenCodeWorkspace } from './src/components/ai/OpenCodeWorkspace';
    export { OpenCodeStream } from './src/components/ai/openCodeStream';
    export { ProjectEditorService } from './electron/services/projectEditorService';
    export { ProjectDirectoryReader } from './electron/services/projectDirectoryReader';
  ` }, bundle: true, platform: 'node', format: 'cjs', outfile: subject,
    logLevel: 'silent',
    plugins: [{ name: 'fixture-access', setup(builder) {
      builder.onResolve({ filter: /^react(?:\/jsx-runtime)?$/ }, args => ({ path: require.resolve(args.path), external: true }));
      builder.onResolve({ filter: /security\/RestrictedFeatures$/ }, () => ({ path: 'access', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export function useRestrictedFeatures() { return { isRoleVisible: () => true }; }' }));
    } }],
  });
  const { OpenCodeWorkspace, OpenCodeStream, ProjectEditorService, ProjectDirectoryReader } = require(subject);
  const projectRoot = path.join(fixture, 'project');
  await fs.mkdir(path.join(projectRoot, 'src'), { recursive: true });
  const file = path.join(projectRoot, 'src/app.ts');
  await fs.writeFile(file, 'export const value = 1;\r\n');
  const imageFile = path.join(projectRoot, 'crm-process-flowchart.png');
  const imageData = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  await fs.writeFile(imageFile, imageData);
  const editor = new ProjectEditorService(() => [projectRoot]);
  const directory = new ProjectDirectoryReader();
  const initial = id => ({ id, title: id, presetId: 'harness-agent', providerId: 'fixture', modelId: 'fixture',
    projectId: 'project', messages: [], messagesLoaded: true, createdAt: 1, updatedAt: 1 });
  const persisted = new Map([['sess_a', initial('sess_a')], ['sess_b', initial('sess_b')]]);
  const subscribers = new Set();
  let subscriptions = 0;
  let starts = [];
  let failStart = false;
  const toasts = [];
  const clipboardWrites = [];
  const revealedPaths = [];
  const editedProjects = [];
  const previewRequests = [];
  const fixtureMcps = [
    { id: 'crm-tools', name: 'CRM 工具', type: 'builtin', enabled: true, tools: [] },
    { id: 'docs-mcp', name: '文档 MCP', type: 'sse', enabled: true, url: 'https://mcp.invalid', bearerToken: 'private-token', tools: [{ name: 'search' }] },
    { id: 'offline-mcp', name: '已停用 MCP', type: 'sse', enabled: false, bearerToken: 'private-disabled-token' },
  ];
  let finishAbort;
  const aborted = [];
  window.neoApi = {
    aiGetConfig: async () => ({ providers: [{ id: 'fixture', name: 'Fixture', enabled: true, protocol: 'openai-completions',
      models: [{ id: 'fixture', name: 'Fixture' }] }], settings: { defaultProviderId: 'fixture', defaultModelId: 'fixture', enableCrmTools: false },
      mcpServers: structuredClone(fixtureMcps),
      skills: [
        { id: 'builtin-review', name: '代码审查', description: '检查变更', category: 'builtin', enabled: true },
        { id: 'personal-notes', name: '团队规范', description: '项目规范', category: 'personal', enabled: true, systemInstruction: 'Use team rules.' },
        { id: 'disabled-skill', name: '停用技能', description: '', category: 'personal', enabled: false },
      ] }),
    aiGetSession: async id => structuredClone(persisted.get(id) || null),
    aiGetSessions: async () => [...persisted.values()].map(session => ({ ...structuredClone(session), messages: [], messagesLoaded: false, messageCount: session.messages.length })),
    aiGetSessionMessages: async id => ({ session: structuredClone(persisted.get(id)), nextBefore: null }),
    aiPersistSession: async (session, returnRecord = true) => {
      assert.equal(session.messagesLoaded, true, 'only fully loaded history may replace messages');
      persisted.set(session.id, structuredClone(session));
      return returnRecord ? structuredClone(session) : null;
    },
    aiStartChatStream: async params => {
      if (failStart) { failStart = false; throw new Error('fixture launch failure'); }
      starts.push(structuredClone(params));
      return true;
    },
    aiAbortChatStream: requestId => { aborted.push(requestId); return new Promise(resolve => { finishAbort = resolve; }); },
    aiSetMcpServerEnabled: async (id, enabled) => { const server = fixtureMcps.find(item => item.id === id); if (!server) throw new Error('MCP 未找到'); server.enabled = enabled; },
    clipboardWriteText: async text => { clipboardWrites.push(text); return true; },
    shellShowItemInFolder: async path => { revealedPaths.push(path); return true; },
    onAiStreamEvent: listener => { subscriptions++; subscribers.add(listener); return () => subscribers.delete(listener); },
    projectReadDirectory: params => directory.read(params),
    fileParseLocalPath: async file => ({ id: 'parsed-file', name: path.basename(file), fullPath: file, size: 26,
      mimeType: 'text/plain', parsedContent: await fs.readFile(file, 'utf8'), contentKind: 'text' }),
    filePreviewMessage: async request => {
      previewRequests.push(structuredClone(request));
      if (request.source !== 'crm-process-flowchart.png' || request.diagram || request.sessionId !== 'sess_file_prompt') throw new Error(`unexpected preview request: ${JSON.stringify(request)}`);
      return { kind: 'image', name: request.source, dataUrl: `data:image/png;base64,${imageData.toString('base64')}` };
    },
    editorRead: (root, file) => editor.read(root, file),
    editorSave: (root, file, text, revision) => editor.save(root, file, text, revision),
  };
  let view;
  const host = document.createElement('div');
  document.body.append(host);
  function Harness() {
    const [id, setId] = React.useState('sess_a');
    const [sessions, setSessions] = React.useState([...persisted.values()]);
    view = { id, sessions, select: setId };
    return React.createElement(OpenCodeWorkspace, { activeProject: { id: 'project', name: 'Fixture', localPath: projectRoot, createdAt: 1, updatedAt: 1 },
      activeSessionId: id, sessions, onSelectSession: setId, onSessionsChange: setSessions,
      selectedPresetId: 'harness-agent', onSelectPreset: () => {}, onEditProject: project => editedProjects.push(project),
      showToast: (type, text) => toasts.push({ type, text }) });
  }
  reactRoot = createRoot(host);
  await act(async () => { reactRoot.render(React.createElement(Harness)); });
  const wait = async predicate => {
    for (let i = 0; i < 200; i++) {
      if (predicate()) return;
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
    }
    throw new Error('Bridge fixture timed out');
  };
  const codeTab = [...host.querySelectorAll('[role="tab"]')].find(tab => tab.textContent.includes('代码'));
  assert.ok(codeTab, 'A persistent code-view entry is available outside the OpenCode iframe');
  await act(async () => { codeTab.click(); });
  await wait(() => host.querySelector('[data-testid="project-file-tree"]'));
  await wait(() => [...host.querySelectorAll('[role="treeitem"]')].some(item => item.textContent.includes('app.ts')));
  const treeFile = [...host.querySelectorAll('[role="treeitem"]')].find(item => item.textContent.includes('app.ts'));
  assert.ok(treeFile, 'The code view exposes the selected project as a file tree');
  await act(async () => { treeFile.click(); });
  await wait(() => host.querySelector('.code-tabs')?.textContent.includes('app.ts'));
  const returnChatTab = [...host.querySelectorAll('[role="tab"]')].find(tab => tab.textContent.includes('对话'));
  await act(async () => { returnChatTab.click(); });
  assert.ok(host.querySelector('iframe'), 'Switching back to chat preserves the OpenCode session frame');
  console.log('PASS persistent workspace code entry, project tree, editor open and chat return');
  class Port {
    packets = [];
    closed = false;
    start() {}
    close() { this.closed = true; }
    postMessage(packet) { this.packets.push(packet); }
  }
  const dispatch = (route, method = 'GET', body, extra = {}) => {
    const frame = host.querySelector('iframe');
    const port = new Port();
    window.dispatchEvent(new window.MessageEvent('message', { source: frame.contentWindow,
      origin: new URL(frame.src).origin, ports: [port], data: { type: 'neo-opencode-rpc', url: `http://neocrm.local/api${route}`,
        method, body: body === undefined ? undefined : JSON.stringify(body), ...extra } }));
    return port;
  };
  const rpc = async (...args) => {
    let port;
    await act(async () => { port = dispatch(...args); });
    await wait(() => port.packets.length > 0);
    const response = port.packets[0];
    return { ...response, data: response.body ? JSON.parse(response.body) : undefined };
  };
  const dispatchClipboardWrite = text => {
    const frame = host.querySelector('iframe');
    const port = new Port();
    window.dispatchEvent(new window.MessageEvent('message', { source: frame.contentWindow,
      origin: new URL(frame.src).origin, ports: [port], data: { type: 'neo-opencode-clipboard-write', text } }));
    return port;
  };
  const clipboardPort = dispatchClipboardWrite('复制这条消息');
  await wait(() => clipboardPort.packets.length > 0);
  assert.deepEqual(clipboardWrites, ['复制这条消息']);
  assert.deepEqual(clipboardPort.packets[0], { copied: true });
  const sendFrameMessage = (data, port) => {
    const frame = host.querySelector('iframe');
    window.dispatchEvent(new window.MessageEvent('message', { source: frame.contentWindow,
      origin: new URL(frame.src).origin, ports: port ? [port] : [], data }));
  };
  const projectDirectory = projectRoot;
  const chatTab = [...host.querySelectorAll('[role="tab"]')].find(tab => tab.textContent.includes('对话'));
  await act(async () => { chatTab.click(); });
  await act(async () => { sendFrameMessage({ type: 'neo-opencode-project-action', action: 'open', directory: projectDirectory }); });
  assert.equal(codeTab.getAttribute('aria-selected'), 'true', 'opening the project returns to NeoCRM code view instead of a missing OpenCode home route');
  await act(async () => { sendFrameMessage({ type: 'neo-opencode-project-action', action: 'edit', directory: projectDirectory }); });
  assert.equal(editedProjects[0].id, 'project', 'project settings route to the host project editor');
  const revealPort = new Port();
  sendFrameMessage({ type: 'neo-opencode-reveal-path', directory: projectDirectory }, revealPort);
  await wait(() => revealPort.packets.length > 0);
  assert.deepEqual(revealedPaths, [projectDirectory]);
  assert.deepEqual(revealPort.packets[0], { revealed: true });
  const events = port => port.packets.filter(item => item.kind === 'chunk').map(item => JSON.parse(item.chunk.slice(6)));
  const emit = async (request, type, extra = {}) => { await act(async () => {
    for (const listener of subscribers) listener({ requestId: request.requestId, sessionId: request.sessionId, messageId: request.messageId, type, ...extra });
  }); };
  let eventPort;
  await act(async () => { eventPort = dispatch('/event'); });
  await wait(() => eventPort.packets.length > 0);
  const response = await rpc('/session/ses_a/prompt', 'POST', { text: 'Fixture prompt' });
  assert.equal(response.status, 200);
  assert.equal(starts.length, 1);
  assert.equal(subscriptions, 1, 'React rerenders must not replace the model listener');
  assert.equal(eventPort.closed, false, 'persisting user input must not disconnect the SSE port');
  const a = starts[0];
  assert.deepEqual((await rpc('/config')).data, [{ type: 'document', info: { experimental: { todo: true } } }]);
  const tasks = [{ content: '检查配置', status: 'in_progress' }, { content: '运行测试', status: 'pending' }];
  await emit(a, 'tool_start', { toolCall: { id: 'todo_fixture', name: 'todo_write', status: 'running', arguments: { todos: tasks } } });
  await emit(a, 'tool_update', { toolCall: { id: 'todo_fixture', name: 'todo_write', status: 'success', arguments: { todos: tasks } } });
  assert(events(eventPort).some(item => item.type === 'session.tool.input.started' && item.data.name === 'todowrite'));
  const liveTodo = (await rpc('/session/ses_a/message')).data.data[0].content.find(part => part.type === 'tool' && part.name === 'todowrite');
  assert.deepEqual(liveTodo.state.input.todos, tasks);
  assert.equal(liveTodo.state.status, 'completed');
  const mcps = (await rpc('/mcp')).data.data;
  assert.deepEqual(mcps.map(item => [item.name, item.status.status]), [
    ['crm-tools', 'connected'], ['docs-mcp', 'connected'], ['offline-mcp', 'disabled'],
  ]);
  assert.equal(JSON.stringify(mcps).includes('private-token'), false, 'MCP credentials must never enter the iframe response');
  assert.deepEqual((await rpc('/mcp/resource')).data.data, { resources: [], templates: [] });
  assert.equal((await rpc('/experimental/mcp/crm-tools/disconnect', 'POST')).status, 204);
  assert.equal((await rpc('/mcp')).data.data.find(item => item.name === 'crm-tools').status.status, 'disabled');
  assert(events(eventPort).some(item => item.type === 'mcp.status.changed' && item.data.server === 'crm-tools'));
  assert.equal((await rpc('/experimental/mcp/crm-tools/connect', 'POST')).status, 204);
  assert.equal((await rpc('/mcp')).data.data.find(item => item.name === 'crm-tools').status.status, 'connected');
  assert.equal((await rpc('/experimental/mcp/docs-mcp/disconnect', 'POST')).status, 204);
  assert.equal(fixtureMcps[1].bearerToken, 'private-token', 'toggling preserves configured credentials');
  assert.equal((await rpc('/experimental/mcp/docs-mcp/connect', 'POST')).status, 204);
  assert.equal((await rpc('/experimental/mcp/missing/connect', 'POST')).status, 404);
  console.log('PASS MCP toggle bridge: on/off persists, refresh events, resource catalog and credentials');
  assert.deepEqual((await rpc('/plugin')).data.data, [], 'embedded mode reports no separately managed OpenCode plugins');
  const skills = (await rpc('/skill')).data.data;
  assert.deepEqual(skills.map(item => item.id), ['builtin-review', 'personal-notes']);
  assert.equal(skills[1].content, 'Use team rules.');
  assert.equal(skills[0].content, '', 'protected built-in skill instructions remain redacted');
  const oldCompletion = Date.now() - 633 * 60_000;
  persisted.set('sess_old_duration', {
    ...initial('sess_old_duration'),
    messages: [
      { id: 'msg_old_user', role: 'user', content: 'Old request', createdAt: oldCompletion - 1000 },
      { id: 'msg_old_assistant', role: 'assistant', content: 'Old reply', createdAt: oldCompletion - 900, durationMs: 633 * 60_000 + 10_000 },
    ],
  });
  const oldMessages = (await rpc('/session/ses_old_duration/message')).data.data;
  assert.equal(oldMessages.find(message => message.id === 'msg_old_assistant').time.completed, undefined,
    'large legacy wall-clock durations must not be presented as actual model runtime');
  persisted.set('sess_trusted_duration', {
    ...initial('sess_trusted_duration'),
    messages: [
      { id: 'msg_trusted_user', role: 'user', content: 'Long request', createdAt: oldCompletion - 1000 },
      { id: 'msg_trusted_assistant', role: 'assistant', content: 'Long reply', createdAt: oldCompletion - 900,
        durationMs: 633 * 60_000 + 10_000, durationSource: 'monotonic' },
    ],
  });
  const trustedMessages = (await rpc('/session/ses_trusted_duration/message')).data.data;
  assert.equal(trustedMessages.find(message => message.id === 'msg_trusted_assistant').time.completed,
    oldCompletion - 900 + 633 * 60_000 + 10_000, 'measured long runs retain their real duration');
  await emit(a, 'reasoning_delta', { delta: 'Think' });
  await emit(a, 'content_delta', { delta: 'RE' });
  await emit(a, 'content_delta', { delta: 'ADY' });
  await emit(a, 'usage', { usage: { promptTokens: 10, completionTokens: 2, estimatedCostUsd: 0.01 } });
  assert.deepEqual(events(eventPort).filter(item => /session\.(text|reasoning)\./.test(item.type)).map(item => item.type),
    ['session.reasoning.started', 'session.reasoning.delta', 'session.reasoning.ended', 'session.text.started', 'session.text.delta', 'session.text.delta']);
  assert.equal((await rpc('/session/ses_a/message')).data.data[0].content.find(part => part.type === 'text').text, 'READY');
  assert.equal((await rpc('/session/ses_a/message')).data.data[0].finish, undefined);
  const latest = await rpc('/session/ses_a/message?order=desc&limit=1');
  assert.equal(latest.data.data[0].type, 'assistant');
  assert.equal(latest.data.cursor.next, '1');
  assert.equal((await rpc('/session/ses_a/message?cursor=1&limit=1')).data.data[0].type, 'user');
  const oldest = await rpc('/session/ses_a/message?order=asc&limit=1');
  assert.equal(oldest.data.data[0].type, 'user');
  assert.equal(oldest.data.cursor.next, 'asc:1');
  assert.equal((await rpc('/session/ses_a/message?cursor=asc:1&limit=1')).data.data[0].type, 'assistant');
  assert.equal((await rpc('/session/active')).data.data.ses_a.type, 'running');
  assert.equal((await rpc('/session/ses_a/prompt', 'POST', { text: 'duplicate' })).status, 500);
  await act(async () => { view.select('sess_b'); });
  assert.equal(subscriptions, 1, 'switching sessions must not lose background run ownership');
  let bPort;
  await act(async () => { bPort = dispatch('/event'); });
  assert.equal((await rpc('/session/ses_b/prompt', 'POST', { text: 'B' })).status, 200);
  const b = starts[1];
  await emit(a, 'content_delta', { delta: ' background' });
  await emit(a, 'done', { completionStatus: 'completed' });
  await wait(() => events(bPort).some(item => item.type === 'session.execution.succeeded'));
  assert.equal(persisted.get('sess_a').messages.at(-1).content, 'READY background');
  assert.equal(persisted.get('sess_a').messages.at(-1).reasoningContent, 'Think');
  assert.equal(persisted.get('sess_a').messages.at(-1).usage.promptTokens, 10);
  const restoredTodo = (await rpc('/session/ses_a/message')).data.data[0].content.find(part => part.type === 'tool' && part.name === 'todowrite');
  assert.deepEqual(restoredTodo.state.input.todos, tasks, 'saved histories retain OpenCode todo state');
  assert.equal(view.id, 'sess_b', 'background completion must not change focus');
  await emit(a, 'content_delta', { delta: ' discarded after completion' });
  assert.equal(persisted.get('sess_a').messages.at(-1).content, 'READY background');
  assert.equal((await rpc('/session/ses_a/message')).data.data[0].content.find(part => part.type === 'text').text, 'READY background');
  console.log('PASS OpenCode RPC: stable subscriptions, started/delta/ended, hydrated history, concurrent session switching and durable usage');

  await emit({ ...b, requestId: 'obsolete' }, 'content_delta', { delta: 'stale' });
  await emit(b, 'tool_start', { toolCall: { id: 'tool_b', name: 'fixture_read', status: 'running', arguments: {} } });
  let stopped;
  await act(async () => { stopped = dispatch('/session/ses_b/interrupt', 'POST'); });
  await wait(() => aborted.length === 1 && persisted.get('sess_b').messages.at(-1).toolCalls?.[0].status === 'error');
  assert.equal(aborted[0], b.requestId);
  assert(events(bPort).some(item => item.type === 'session.execution.interrupted'));
  await emit(b, 'content_delta', { delta: 'late after stop' });
  await act(async () => { finishAbort(true); });
  await wait(() => stopped.packets.length > 0);
  assert.equal((await rpc('/experimental/session/ses_b/wait', 'POST')).status, 204, 'the upstream interrupt flow can await settled runs');
  assert.equal(persisted.get('sess_b').messages.at(-1).content, '');
  failStart = true;
  assert.equal((await rpc('/session/ses_b/prompt', 'POST', { text: 'fail once' })).status, 500);
  assert.equal(persisted.get('sess_b').messages.at(-1).error, 'fixture launch failure');
  assert.equal((await rpc('/session/ses_b/prompt', 'POST', { text: 'retry' })).status, 200);
  await emit(starts.at(-1), 'error', { error: 'fixture provider failure' });
  await wait(() => persisted.get('sess_b').messages.at(-1).error === 'fixture provider failure');
  assert(events(bPort).some(item => item.type === 'session.execution.failed'));
  console.log('PASS OpenCode cancellation/errors: exact request ID, running tools terminated, stale events ignored, failed starts release duplicate lock');

  const questionSession = { ...initial('sess_question'), messages: [
    { id: 'msg_question_user', role: 'user', content: '请确认', createdAt: 1 },
    { id: 'msg_question_answer', role: 'assistant', content: '请选择', createdAt: 2, toolCalls: [{ id: 'question-call', name: 'ask_user_question', status: 'success', arguments: {
      questions: [{ id: 'scope', header: '范围', question: '选择范围？', options: [{ label: '全部', description: '包含全部' }, { label: '部分' }] },
        { id: 'items', question: '选择内容？', multi_select: true, options: [{ label: '字段' }, { label: '流程' }] }],
    } }] },
  ] };
  persisted.set(questionSession.id, questionSession);
  const questions = (await rpc('/session/ses_question/form')).data.data;
  assert.equal(questions.length, 1, 'previously saved unanswered question restores as an OpenCode form');
  assert.deepEqual(questions[0].fields.map(field => field.type), ['string', 'multiselect']);
  assert.equal(questions[0].fields[0].options[0].description, '包含全部');
  assert.equal((await rpc(`/session/ses_question/form/${questions[0].id}/reply`, 'POST', { answer: { scope: '全部' } })).status, 400);
  assert.equal((await rpc(`/session/ses_question/form/${questions[0].id}/reply`, 'POST', { answer: { scope: '全部', items: ['字段', '流程'] } })).status, 204);
  assert.match(starts.at(-1).messages.at(-1).content, /选择范围？：全部/);
  assert.match(starts.at(-1).messages.at(-1).content, /选择内容？：字段、流程/);
  assert(events(bPort).some(item => item.type === 'form.replied'));
  await emit(starts.at(-1), 'done', { completionStatus: 'completed' });
  assert.deepEqual((await rpc('/session/ses_question/form')).data.data, []);
  console.log('PASS OpenCode questions: restored form, single/multiple choices, validation and continuation');
  await act(async () => { bPort = dispatch('/event'); });

  persisted.set('sess_file_prompt', initial('sess_file_prompt'));
  const fileUri = pathToFileURL(file).href;
  const filePrompt = await rpc('/session/ses_file_prompt/prompt', 'POST', { text: '@src/app.ts 请查看',
    files: [{ uri: fileUri, name: 'app.ts', mention: { start: 0, end: 11, text: '@src/app.ts' } }] });
  assert.equal(filePrompt.status, 200, JSON.stringify(filePrompt));
  assert.equal(starts.at(-1).messages.at(-1).attachments[0].parsedContent, 'export const value = 1;\r\n');
  assert.equal(starts.at(-1).messages.at(-1).attachments[0].relativePath.replaceAll('\\', '/'), 'src/app.ts');
  await emit(starts.at(-1), 'done', { completionStatus: 'completed' });
  const historyFile = (await rpc('/session/ses_file_prompt/message?order=asc')).data.data[0].files[0];
  assert.equal(historyFile.source.uri, fileUri);
  assert.equal(historyFile.mention.text, '@src/app.ts');
  const invalidFile = await rpc('/session/ses_file_prompt/prompt', 'POST', { text: '查看', files: [{ uri: pathToFileURL(path.join(fixture, 'outside')).href }] });
  assert.equal(invalidFile.status, 500);
  assert.match(invalidFile.data.message, /当前项目目录内/);
  const folderPrompt = await rpc('/session/ses_file_prompt/prompt', 'POST', { text: '检查目录',
    files: [{ uri: pathToFileURL(path.join(projectRoot, 'src')).href, name: 'src' }] });
  assert.equal(folderPrompt.status, 200);
  assert.equal(starts.at(-1).messages.at(-1).attachments[0].contentKind, 'directory');
  await emit(starts.at(-1), 'done', { completionStatus: 'completed' });
  console.log('PASS OpenCode project file mentions: send, model context, history and outside-path rejection');
  await act(async () => { bPort = dispatch('/event'); });

  persisted.set('sess_fork_parent', { ...initial('sess_fork_parent'), title: '分支测试',
    compactionSummary: { originalMessageCount: 3, summary: 'contains the selected message', compactedAt: 5 }, messages: [
    { id: 'msg_before_user', role: 'user', content: '之前的问题', createdAt: 1 },
    { id: 'msg_before_assistant', role: 'assistant', content: '之前的回答', createdAt: 2 },
    { id: 'msg_branch_user', role: 'user', content: '从这里分支', createdAt: 3 },
    { id: 'msg_branch_assistant', role: 'assistant', content: '后续回答', createdAt: 4 },
  ] });
  const forkResponse = await rpc('/session/ses_fork_parent/fork', 'POST', { before: 'msg_branch_user' });
  assert.equal(forkResponse.status, 200);
  const forkId = forkResponse.data.data.id;
  const forked = persisted.get('sess_' + forkId.slice(4));
  assert.deepEqual(forked.messages.map(message => message.id), ['msg_before_user', 'msg_before_assistant']);
  assert.equal(forked.fork.sessionId, 'sess_fork_parent');
  assert.equal(forked.compactionSummary, undefined, 'a fork cannot inherit a summary that includes messages beyond its boundary');
  assert.deepEqual(forkResponse.data.data.fork.boundary, { type: 'before', messageID: 'msg_branch_user' });
  assert.equal((await rpc('/session/ses_fork_parent/fork', 'POST', { before: 'missing' })).status, 404);

  const staged = await rpc('/session/ses_fork_parent/revert/stage', 'POST', { messageID: 'msg_branch_user' });
  assert.equal(staged.status, 200);
  assert.deepEqual(staged.data.data.files, [], 'chat-only rewind never claims to restore project files');
  assert.deepEqual((await rpc('/session/ses_fork_parent/message')).data.data.map(message => message.id), ['msg_before_assistant', 'msg_before_user']);
  assert(events(bPort).some(item => item.type === 'session.revert.staged'));
  assert.equal((await rpc('/session/ses_fork_parent/revert', 'DELETE')).status, 204);
  assert.equal((await rpc('/session/ses_fork_parent/message')).data.data.length, 4, 'redo restores the staged messages');
  await rpc('/session/ses_fork_parent/revert/stage', 'POST', { messageID: 'msg_branch_user' });
  assert.equal((await rpc('/session/ses_fork_parent/revert/commit', 'POST')).status, 204);
  assert.deepEqual(persisted.get('sess_fork_parent').messages.map(message => message.id), ['msg_before_user', 'msg_before_assistant']);
  assert.equal(persisted.get('sess_fork_parent').revert, undefined);
  assert.equal(persisted.get('sess_fork_parent').compactionSummary, undefined, 'committing rewind clears a summary that covers reverted messages');
  console.log('PASS OpenCode message actions: fork before a prompt, undo/redo conversation history, and commit without claiming file rollback');

  assert.equal((await rpc('/experimental/fs/write?path=src%2Fapp.ts', 'POST', undefined, { bodyBase64: Buffer.from('bad').toString('base64') })).status, 500);
  const listed = await rpc('/fs/list?path=src');
  assert.equal(listed.status, 200);
  assert.equal(listed.data.data[0].path, './src/app.ts');
  assert.equal((await rpc('/fs/read/src%2Fapp.ts')).status, 200);
  const write = text => rpc('/experimental/fs/write?path=src%2Fapp.ts', 'POST', undefined, { bodyBase64: Buffer.from(text).toString('base64') });
  assert.equal((await write('export const value = 2;\n')).status, 200);
  assert.equal(await fs.readFile(file, 'utf8'), 'export const value = 2;\r\n');
  await fs.writeFile(file, '// external change');
  assert.equal((await write('// stale overwrite')).status, 500);
  assert.equal(await fs.readFile(file, 'utf8'), '// external change');
  assert.equal((await rpc('/fs/read/..%2Foutside')).status, 500);
  await fs.writeFile(path.join(fixture, 'outside'), 'outside');
  await fs.symlink(path.join(fixture, 'outside'), path.join(projectRoot, 'link'));
  assert.equal((await rpc('/fs/read/link')).status, 500);
  assert.equal((await rpc('/fs/read/src%2Fapp.ts?location[directory]=wrong')).status, 500);
  console.log('PASS OpenCode file RPC: subdirectories, real revision saves, CRLF preservation, stale saves, traversal and symlink rejection');

  persisted.set('sess_image_preview', { ...initial('sess_image_preview'), messages: [
    { id: 'msg_image_user', role: 'user', content: '生成流程图', createdAt: 1 },
    { id: 'msg_image_assistant', role: 'assistant', createdAt: 2,
      content: '文件路径：[crm-process-flowchart.png](crm-process-flowchart.png)\n\n```diagram\ncrm-process-flowchart.png\n```' },
  ] });
  const imageMessage = (await rpc('/session/ses_image_preview/message')).data.data.find(item => item.id === 'msg_image_assistant');
  assert.equal((imageMessage.content[0].text.match(/!\[crm-process-flowchart\.png\]\(crm-process-flowchart\.png\)/g) || []).length, 1,
    'a linked image and matching diagram block produce one visual preview');
  assert.equal(persisted.get('sess_image_preview').messages[1].content.includes('!['), false,
    'visual preview markup must not alter persisted model context');
  const imageRead = await rpc('/fs/read/crm-process-flowchart.png');
  assert.equal(imageRead.status, 200, JSON.stringify(imageRead.data));
  assert.equal(Buffer.from(imageRead.bodyBase64, 'base64').equals(imageData), true);
  assert.equal(previewRequests.length, 1);
  assert.equal(previewRequests[0].projectPath, projectRoot);
  assert.equal(previewRequests[0].sessionId, 'sess_file_prompt');
  console.log('PASS OpenCode image previews: projected Markdown, deduplication and bounded binary reads');

  await act(async () => { view.select(null); });
  const firstDraft = host.querySelector('iframe').src;
  await act(async () => { view.select('sess_a'); });
  await act(async () => { view.select(null); });
  assert.notEqual(host.querySelector('iframe').src, firstDraft);
  assert.equal(subscriptions, 1);
  await act(async () => { reactRoot.unmount(); });
  reactRoot = undefined;
  assert.equal(subscribers.size, 0);
  assert.deepEqual(toasts, [
    { type: 'info', text: '对话已撤销；已修改的项目文件不会自动回滚。' },
    { type: 'info', text: '对话已撤销；已修改的项目文件不会自动回滚。' },
  ]);

  let release;
  let inFlight = 0;
  let peak = 0;
  const saves = [];
  const sent = [];
  const stream = new OpenCodeStream({
    emit: (type, data) => { sent.push({ type, data }); },
    save: async session => {
      peak = Math.max(peak, ++inFlight);
      if (!saves.length) await new Promise(resolve => { release = resolve; });
      saves.push(session);
      inFlight--;
    }, publish: () => {}, onSaveError: error => { throw error; },
  });
  const session = { ...initial('sess_slow'), messages: [{ id: 'msg_slow', role: 'assistant', content: '', createdAt: 1 }] };
  stream.start(session, 'req_slow', 'msg_slow', projectRoot);
  const event = (type, delta) => stream.receive({ sessionId: session.id, requestId: 'req_slow', messageId: 'msg_slow', type, delta });
  await event('content_delta', 'first');
  await wait(() => release);
  for (let i = 0; i < 100; i++) await event('content_delta', '.');
  const finish = event('done');
  assert(!sent.some(item => item.type === 'session.execution.succeeded'), 'idle cannot precede durable final history');
  release();
  await finish;
  assert.equal(peak, 1);
  assert.equal(saves.length, 2, 'slow persistence must coalesce queued tokens');
  assert.equal(saves.at(-1).messages[0].content, `first${'.'.repeat(100)}`);
  assert(saves.at(-1).messages[0].durationMs >= 0 && saves.at(-1).messages[0].durationMs < 5000,
    'run duration must use the current run clock, not an old persisted message timestamp');
  assert(sent.some(item => item.type === 'session.execution.succeeded'));
  console.log('PASS persistence pressure: one in-flight snapshot per session, coalesced progress, final save before idle');

  const questionEvents = [];
  const questionStream = new OpenCodeStream({ emit: (type, data) => questionEvents.push({ type, data }),
    save: async () => {}, publish: () => {}, onSaveError: error => { throw error; } });
  const liveSession = { ...initial('sess_live_question'), messages: [{ id: 'msg_live_question', role: 'assistant', content: '', createdAt: 1 }] };
  questionStream.start(liveSession, 'req_question', 'msg_live_question', projectRoot);
  await questionStream.receive({ requestId: 'req_question', sessionId: liveSession.id, messageId: 'msg_live_question', type: 'tool_update',
    toolCall: { id: 'q_live', name: 'ask_user_question', status: 'success', arguments: { question: '选择一个', options: ['是', '否'] } } });
  await questionStream.receive({ requestId: 'req_question', sessionId: liveSession.id, messageId: 'msg_live_question', type: 'done', completionStatus: 'waiting' });
  assert.equal(questionEvents.find(item => item.type === 'form.created')?.data.form.fields[0].description, '选择一个');
  console.log('PASS OpenCode questions: live pending tool emits native form after history is saved');
} finally {
  if (reactRoot) await act(async () => { reactRoot.unmount(); });
  dom.happyDOM.abort();
  await fs.rm(fixture, { recursive: true, force: true });
}
