import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-chat-isolation-'));
const require = createRequire(import.meta.url);
try {
  const backend = path.join(fixture, 'backend.cjs');
  await build({ entryPoints: [path.join(root, 'electron/services/aiService.ts')], bundle: true,
    platform: 'node', format: 'cjs', outfile: backend, external: ['esbuild'], logLevel: 'silent',
    plugins: [{ name: 'isolated-host', setup(builder) {
      builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
        export const app = { getPath: () => ${JSON.stringify(fixture)} };
        export const dialog = {}, shell = {}, BrowserWindow = class {};
      ` }));
    } }],
  });
  const { AiService } = require(backend);
  const service = new AiService({}, {}, {});
  const a = new AbortController(), b = new AbortController();
  service.activeControllers = new Map([['req-a', a], ['sess-a', a], ['req-b', b], ['sess-b', b]]);
  assert.equal(service.abortChatStream('missing'), false);
  assert.equal(a.signal.aborted, false);
  assert.equal(b.signal.aborted, false);
  assert.equal(service.abortChatStream('req-b'), true);
  assert.equal(b.signal.aborted, true);
  assert.equal(a.signal.aborted, false);
  assert.deepEqual([...service.activeControllers.keys()], ['req-a', 'sess-a']);
  assert.equal(service.abortChatStream('sess-b'), false);
  assert.equal(a.signal.aborted, false);
  assert.equal(service.abortChatStream('sess-a'), true);
  assert.equal(service.activeControllers.size, 0);
  console.log('PASS cancellation: exact request/session only; missing and stale IDs leave other conversations running');

  await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { flushSync } from 'react-dom';
    import { AiHarnessStudio } from './src/components/ai/AiHarnessStudio';
    const initial = ['a','b','c','d'].map(id => ({ id: 'sess-' + id, title: id,
      presetId: 'harness-agent', providerId: 'fixture', modelId: 'fixture', createdAt: 1, updatedAt: 1,
      messages: [{id: 'old-' + id, role: 'user', content: 'original ' + id, createdAt: 1}] }));
    let persisted = structuredClone(initial), listener, agentListener;
    window.started = []; window.aborted = []; window.toasts = []; window.saves = [];
    window.neoApi = {
      aiGetConfig: async () => ({ providers: [{ id: 'fixture', name: 'Fixture', apiKey: 'test-only', models: [{ id: 'fixture', name: 'Fixture' }] }],
        settings: { defaultProviderId: 'fixture', defaultModelId: 'fixture', enableCrmTools: false }, skills: [], mcpServers: [] }),
      aiGetSessions: async () => structuredClone(persisted),
      workflowGetLicenseStatus: async () => ({ isAuthorized: true }),
      aiSaveSession: async session => {
        window.saves.push(session.id);
        persisted = [structuredClone(session), ...persisted.filter(item => item.id !== session.id)];
        const snapshot = structuredClone(persisted);
        if (window.failSave === session.id) { window.failSave = null; throw new Error('fixture save failed'); }
        if (window.delaySave === session.id) await new Promise(resolve => { window.resolveSave = resolve; });
        return snapshot;
      },
      aiStartChatStream: async params => {
        if (window.failStart === params.sessionId) { window.failStart = null; throw new Error('fixture start failed'); }
        window.started.push(params); return true;
      },
      aiAbortChatStream: async id => { window.aborted.push(id); await new Promise(resolve => { window.resolveAbort = resolve; }); return true; },
      onAiStreamEvent: callback => { listener = callback; return () => { listener = null; }; },
      onAgentSessionUpdated: callback => { agentListener = callback; return () => { agentListener = null; }; },
    };
    window.emit = (params, type, extra = {}) => flushSync(() => listener({ ...params, type, ...extra }));
    window.emitAgent = session => {
      persisted = [structuredClone(session), ...persisted.filter(item => item.id !== session.id)];
      flushSync(() => agentListener(session));
    };
    function Harness() {
      const [id, setId] = useState('sess-a');
      const [sessions, setSessions] = useState(initial);
      window.selectSession = next => flushSync(() => setId(next));
      window.snapshot = () => ({ id, sessions });
      return <AiHarnessStudio crmSession={{isLoggedIn: false}} activeSessionId={id} onSelectSession={setId}
        sessions={sessions} onSessionsChange={setSessions} selectedPresetId="harness-agent"
        onNavigateToSettings={() => {}} showToast={(type, text) => window.toasts.push({type, text})} />;
    }
    createRoot(document.getElementById('root')).render(<Harness />);
  ` }, bundle: true, platform: 'browser', format: 'iife', outfile: path.join(fixture, 'renderer.js'), logLevel: 'silent',
    plugins: [{ name: 'isolated-chat-views', setup(builder) {
      builder.onResolve({ filter: /shared\/constants$/ }, () => ({ path: 'constants', namespace: 'views' }));
      builder.onResolve({ filter: /^\.\// }, args => {
        if (!args.importer.endsWith('/AiHarnessStudio.tsx')) return;
        if (args.path === './chatSessionState') return;
        return { path: args.path.slice(2), namespace: 'views' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'views' }, args => {
        if (args.path === 'constants') return { contents: `
          export const AI_AGENT_PRESETS = [{ id: 'harness-agent', name: 'Fixture', description: 'Fixture', systemPrompt: 'Fixture', enableCrmTools: false, quickPrompts: [] }];
          export const BUILTIN_AI_PROVIDERS = [];
          export const DEFAULT_AI_SETTINGS = {};
          export const BUILTIN_AI_SKILLS = [];
        ` };
        if (args.path === 'AiInputComposer') return { resolveDir: root, contents: `
          import React from 'react';
          import { AiInputComposer as Composer } from ${JSON.stringify(path.join(root, 'src/components/ai/AiInputComposer'))};
          export function AiInputComposer(props) { window.composer = props; return React.createElement(Composer, props); }
        ` };
        if (args.path === 'AiMessageItem') return { contents: 'export function AiMessageItem() { return null; }' };
        return { contents: 'export function ' + args.path + '() { return null; }' };
      });
    } }],
  });
  await fs.writeFile(path.join(fixture, 'index.html'), '<!doctype html><div id="root"></div><script src="./renderer.js"></script>');
  const host = path.join(fixture, 'host.cjs');
  await fs.writeFile(host, `
    const { app, BrowserWindow } = require('electron');
    const assert = require('node:assert/strict');
    app.setPath('userData', ${JSON.stringify(path.join(fixture, 'browser-data'))});
    app.whenReady().then(async () => {
      const win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
      win.webContents.on('console-message', (event) => { if (event.level === 'error') console.error(event.message); });
      const run = async code => {
        try { return await win.webContents.executeJavaScript(code); }
        catch (error) { throw new Error(code + ': ' + error.message); }
      };
      const wait = async predicate => {
        for (let i = 0; i < 150; i++) { if (await run(predicate)) return; await new Promise(r => setTimeout(r, 20)); }
        throw new Error('Timed out: ' + predicate);
      };
      const send = text => run('window.composer.onSend(' + JSON.stringify(text) + ')');
      const select = id => run('window.selectSession(' + JSON.stringify(id) + ')');
      try {
        await win.loadFile(${JSON.stringify(path.join(fixture, 'index.html'))});
        await wait('window.composer && window.composer.currentProviderId === "fixture"');
        await send('Start A');
        await wait('window.started.length === 1 && window.composer.isStreaming');
        await run('window.emit(window.started[0], "content_delta", { delta: "A live content" }); window.emit(window.started[0], "usage", {usage:{source:"estimated",promptTokens:120,completionTokens:20,totalTokens:140,estimatedCost:0.001,costCurrency:"USD"}})');
        assert.equal(await run('window.snapshot().sessions.find(s=>s.id==="sess-a").messages.at(-1).usage.totalTokens'),140);
        assert(await run('document.body.innerText.includes("用量含估算 140 tokens")'));
        await select(null);
        assert.equal(await run('window.composer.isStreaming'), false);
        assert.equal(await run('Boolean(document.querySelector("button[title=停止生成]"))'), false);
        await run('window.composer.onStop()');
        assert.equal(await run('window.aborted.length'), 0);
        await send('Start new conversation while A runs');
        await wait('window.started.length === 2');
        assert.notEqual(await run('window.started[1].sessionId'), 'sess-a');
        assert.equal(await run('window.snapshot().sessions.find(s => s.id === "sess-a").messages.at(-1).content'), 'A live content');
        console.log('PASS new conversation: idle composer and successful send while another stream runs; existing deltas preserved');

        await select('sess-b');
        assert.equal(await run('window.composer.isStreaming'), false);
        await send('Start B');
        await wait('window.started.length === 3');
        await run('window.emit(window.started[2], "tool_start", { toolCall: {id: "tool-b", name: "fixture", status: "running"} })');
        await run('window.emit(window.started[0], "tool_start", { toolCall: {id: "tool-a", name: "fixture", status: "running"} })');
        await run('document.querySelector("button[title=停止生成]").click()');
        await wait('window.aborted.length === 1 && !window.composer.isStreaming');
        assert.equal(await run('window.aborted[0] === window.started[2].requestId'), true);
        assert.equal(await run('window.snapshot().sessions.find(s => s.id === "sess-b").messages.at(-1).toolCalls[0].status'), 'error');
        assert.equal(await run('window.snapshot().sessions.find(s => s.id === "sess-a").messages.at(-1).toolCalls[0].status'), 'running');
        await run('window.emit(window.started[2], "content_delta", {delta: "discard stale B"}); window.resolveAbort()');
        assert.equal(await run('window.snapshot().sessions.find(s => s.id === "sess-b").messages.at(-1).content'), '');
        await select('sess-a');
        assert.equal(await run('window.composer.isStreaming'), true);
        await run('window.emit(window.started[0], "content_delta", {delta: " still running"})');
        assert.equal(await run('window.snapshot().sessions.find(s => s.id === "sess-a").messages.at(-1).content'), 'A live content still running');
        console.log('PASS stop isolation: immediate UI reset before abort resolves; stale events discarded; background conversation continues');

        await select('sess-c');
        await run('window.delaySave = "sess-c"; void window.composer.onSend("Prepare C")');
        await wait('Boolean(window.resolveSave)');
        const count = await run('window.saves.filter(id => id === "sess-c").length');
        await send('Duplicate C');
        assert.equal(await run('window.saves.filter(id => id === "sess-c").length'), count);
        await select('sess-d');
        await send('D while C is preparing');
        await wait('window.started.some(s => s.sessionId === "sess-d")');
        await run('window.emit(window.started.find(s => s.sessionId === "sess-d"), "content_delta", {delta: "D live"})');
        await run('window.emit(window.started[0], "content_delta", {delta: " completed"}); window.emit(window.started[0], "done")');
        await run('window.delaySave = null; window.resolveSave()');
        await wait('window.started.some(s => s.sessionId === "sess-c")');
        assert.equal(await run('window.snapshot().id'), 'sess-d');
        assert.equal(await run('window.snapshot().sessions.find(s => s.id === "sess-d").messages.at(-1).content'), 'D live');
        assert.equal(await run('window.snapshot().sessions.find(s => s.id === "sess-a").messages.at(-1).content'), 'A live content still running completed');
        await run('window.emit(window.started.find(s => s.sessionId === "sess-c"), "error", {error: "fixture provider error"})');
        assert.equal(await run('window.composer.isStreaming'), true);
        await select('sess-c');
        assert.equal(await run('window.composer.isStreaming'), false);
        await send('C after error');
        await wait('window.started.filter(s => s.sessionId === "sess-c").length === 2');
        console.log('PASS preparation/error isolation: per-session duplicate protection, concurrent startup, no focus stealing or live-output loss');

        await select('sess-b');
        await run('window.failSave = "sess-b"');
        await send('Save fails');
        await run('window.failStart = "sess-b"');
        await send('Start fails');
        assert.equal(await run('window.composer.isStreaming'), false);
        await send('B retry');
        await wait('window.started.filter(s => s.sessionId === "sess-b").length === 2');
        await run('window.emit(window.started.find(s => s.sessionId === "sess-a"), "done")');
        assert.equal(await run('window.composer.isStreaming'), true);
        console.log('PASS recovery: save/start failures release their own locks; completion of another stream leaves this session busy');

        await run('window.agent = { id: "sess-agent", title: "Analyze files", presetId: "harness-agent", providerId: "fixture", modelId: "fixture", createdAt: 1, updatedAt: Date.now(), messages: [{id:"agent-u", role:"user",content:"Analyze files",createdAt:1},{id:"agent-a",role:"assistant",content:"",createdAt:1}], agentRun: {kind:"subagent",createdBySessionId:"sess-b",parentSessionId:"sess-b",status:"queued",requestId:"agent-request",messageId:"agent-a"} }; window.emitAgent(window.agent)');
        assert.equal(await run('window.snapshot().sessions.some(s => s.id === "sess-agent")'), true);
        assert.equal(await run('Boolean(document.querySelector("[aria-label=后台代理任务]"))'), true);
        assert.equal(await run('window.composer.isStreaming'), true);
        await select('sess-agent');
        assert.equal(await run('window.composer.isStreaming'), true);
        await run('window.agent = {...window.agent,updatedAt:Date.now()+1,messages:window.agent.messages.map(m=>m.id==="agent-a"?{...m,content:"Verified agent result"}:m),agentRun:{...window.agent.agentRun,status:"completed"}}; window.emitAgent(window.agent)');
        assert.equal(await run('window.composer.isStreaming'), false);
        assert.equal(await run('window.snapshot().sessions.find(s=>s.id==="sess-agent").messages.at(-1).content'), 'Verified agent result');
        await run('Array.from(document.querySelectorAll("button")).find(button=>button.textContent==="返回主会话").click()');
        assert.equal(await run('window.snapshot().id'), 'sess-b');
        assert.equal(await run('window.composer.isStreaming'), true);
        assert.equal(await run('window.snapshot().sessions.filter(s=>s.id==="sess-agent").length'), 1);
        console.log('PASS agent snapshots: autonomous insertion, queued/busy and completed/idle UI, parent task links and return to the live main conversation');
        win.destroy(); app.exit(0);
      } catch (error) { console.error(error); win.destroy(); app.exit(1); }
    }).catch(error => { console.error(error); app.exit(1); });
  `);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((resolve, reject) => {
    const child = spawn(require('electron'), [host, '--no-sandbox'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Conversation isolation test timed out')); }, 45000);
    child.stdout.on('data', data => process.stdout.write(data));
    child.stderr.on('data', data => process.stderr.write(data));
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Conversation isolation test exited with ' + code)); });
  });
} finally {
  await fs.rm(fixture, { recursive: true, force: true });
}
