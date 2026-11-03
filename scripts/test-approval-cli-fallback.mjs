import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-approval-fallback-'));
const previousHome = process.env.HOME;
const previousProfile = process.env.USERPROFILE;
const previousPath = process.env.PATH;
process.env.HOME = fixture; process.env.USERPROFILE = fixture;
let store;
try {
  const userData = path.join(fixture, 'user-data'); fs.mkdirSync(userData);
  const project = path.join(fixture, 'project'); fs.mkdirSync(project);
  const file = path.join(fixture, 'subject.cjs');
  await build({ stdin: { resolveDir: root, loader: 'ts', contents: `
    export { WorkflowService } from './electron/services/workflowService';
    export { NeoApprovalCliReader, runNeoApprovalCli } from './electron/services/neoApprovalCli';
    export { SessionStore } from './electron/services/sessionStore';
    export { AiService } from './electron/services/aiService';
  ` }, bundle: true, platform: 'node', format: 'cjs', outfile: file, external: ['esbuild'], logLevel: 'silent',
    plugins: [{ name: 'fixture-host', setup(builder) {
      builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'fixture-host' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture-host' }, () => ({ contents: `
        export const app = { getPath: () => ${JSON.stringify(userData)} };
        export const dialog = {}, shell = {}, BrowserWindow = class {};
      ` }));
      builder.onResolve({ filter: /security\/licenseService$/ }, () => ({ path: 'license', namespace: 'fixture-license' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture-license' }, () => ({ contents: `
        export const licenseService = { getLicenseStatus: () => ({ isAuthorized: false }), assertAuthorized: () => { throw new Error('locked'); } };
      ` }));
    } }],
  });
  const { WorkflowService, NeoApprovalCliReader, runNeoApprovalCli, SessionStore, AiService } = createRequire(import.meta.url)(file);
  const env = { id: 'fixture', name: 'fixture', envType: 'sandbox', productType: 'neocrm', neoBaseURL: 'https://fixture.invalid', tokenURL: 'https://fixture.invalid/token' };
  const token = { access_token: 'fixture-access', refresh_token: 'fixture-refresh', tenant_id: 'tenant-fixture', instance_uri: env.neoBaseURL,
    expiresAt: Date.now() + 3600000, savedAt: Date.now(), userInfo: { userId: 'user-fixture' } };
  fs.writeFileSync(path.join(userData, 'neocrm_sessions.json'), JSON.stringify({ current: { isLoggedIn: true, environment: env, tokenData: token }, history: [] }));
  store = new SessionStore();
  const events = [];
  const models = Array.from({ length: 123 }, (_, index) => ({ processInfoId: `model-${index}`, processDefinitionId: `def-${index}`,
    name: `合同流程-${index}`, entityApiKey: 'contract', status: index % 2 ? 'ENABLED' : 'DESIGNING', version: 2 }));
  let mode = 'normal';
  let lastTemporary;
  const snapshot = { format: 'NeoApprovalProcessDefinition/1.0', source: { entityApiKey: 'contract', processDefinitionId: 'def-0', revision: 'r1' },
    definition: { revision: 'r1', status: 'DESIGNING', version: 2 }, processModel: { processName: '合同审批', entityApiKey: 'contract' },
    fragments: { nodes: [{ key: 'start', name: '开始', type: 'START' }, { key: 'end', name: '结束', type: 'END' }],
      edges: [{ key: 'edge', source: 'start', target: 'end' }], conditions: [], assignees: [], actions: [], settings: [] } };
  const runner = async (args, cwd, signal) => {
    events.push({ type: 'cli', args, cwd });
    assert.equal(JSON.parse(fs.readFileSync(path.join(cwd, 'neo-project.json'))).projectId,
      JSON.parse(fs.readFileSync(path.join(project, 'neo-project.json'))).projectId);
    if (mode === 'failure') throw new Error('fixture API unavailable ' + token.access_token);
    if (mode === 'missing') throw Object.assign(new Error('spawn neo ENOENT'), { code: 'ENOENT' });
    if (mode === 'timeout') throw new Error('命令执行超时');
    if (mode === 'abort') throw Object.assign(new Error('stopped'), { name: 'AbortError' });
    if (mode === 'bad-json') return 'not json';
    if (args[0] === 'list') {
      const page = Number(args[args.indexOf('--page') + 1]);
      if (mode === 'bad-shape') return JSON.stringify({ items: 'invalid', total: 0 });
      const all = mode === 'empty' ? [] : models;
      let items = all.slice((page - 1) * 50, page * 50);
      if (mode === 'partial' && page === 2) items = [];
      if (mode === 'duplicate' && page === 2) items = all.slice(0, 50);
      return JSON.stringify({ items, total: all.length, pageNum: page, pageSize: 50 });
    }
    lastTemporary = cwd;
    const snapshotFile = 'neocrm-src/objects/contract/approvalprocesses/snapshot.json';
    const target = path.join(cwd, snapshotFile); fs.mkdirSync(path.dirname(target), { recursive: true });
    const value = mode === 'mismatched-id' ? { ...snapshot, source: { ...snapshot.source, processDefinitionId: 'other' } } : snapshot;
    fs.writeFileSync(target, JSON.stringify(value));
    return JSON.stringify({ entity: { apiKey: 'contract' }, entry: { definitionId: 'def-0', result: mode === 'incomplete' ? 'INCOMPLETE' : 'SUCCESS', snapshotFile,
      integrity: { verdict: mode === 'incomplete' ? 'FAIL' : 'PASS' } } });
  };
  const metadata = { fetchEntityList: async () => [{ apiKey: 'contract', label: '合同' }] };
  const service = new WorkflowService(metadata, {}, store, new NeoApprovalCliReader(runner));
  const legacy = { success: true, data: [{ id: 'old', name: '兼容审批', procdefId: 'old-def', objectName: '合同', procType: 2 }], totalInTenant: 1 };
  service.listTenantFlowsLegacy = async (_env, _token, params) => { events.push({ type: 'legacy-list', params }); return { ...legacy }; };
  service.getFlowDetailLegacy = async () => { events.push({ type: 'legacy-detail' }); return { success: true, definition: { baseInfo: { name: '兼容审批' }, nodeInfo: {} } }; };
  const list = (params = { procType: 2 }) => service.listTenantFlows(env, token, params, { projectPath: project });
  const detail = () => service.getFlowDetail(env, token, 'def-0', 2, { projectPath: project });

  const result = await list();
  assert.equal(result.source, 'cli'); assert.equal(result.data.length, 123); assert.equal(result.data[122].procdefId, 'def-122');
  assert.equal(events.filter(event => event.type === 'cli').length, 3);
  assert.equal(events.some(event => event.type.startsWith('legacy')), false);
  assert(result.cliCommands[2].includes('--page 3'));
  assert(fs.existsSync(path.join(project, 'neo-project.json')));
  assert.equal((await list({ procType: 2, keyword: '合同', status: 1, pageNo: 2, pageSize: 10 })).data.length, 10);
  console.log('PASS CLI list: all 123 models paginated, real definition IDs preserved, filters/pages and shared project work');

  mode = 'empty'; events.length = 0;
  const empty = await list(); assert.equal(empty.source, 'cli'); assert.deepEqual(empty.data, []);
  assert.equal(events.some(event => event.type.startsWith('legacy')), false);
  console.log('PASS empty CLI success: no fallback');

  for (mode of ['failure', 'missing', 'timeout', 'bad-json', 'bad-shape', 'partial', 'duplicate']) {
    events.length = 0;
    const fallback = await list();
    assert.equal(fallback.source, 'legacy', mode); assert.equal(fallback.success, true);
    assert.equal(events[0].type, 'cli', mode);
    assert.equal(events.filter(event => event.type === 'legacy-list').length, 1, mode);
    assert.equal(events.at(-1).type, 'legacy-list', mode);
    assert(fallback.fallbackReason); assert(!fallback.fallbackReason.includes(token.access_token));
    assert.equal(fallback.data.length, 1, mode);
  }
  console.log('PASS CLI unavailable/timeouts/invalid/partial pages: one ordered fallback, partial CLI data discarded, credentials redacted');

  mode = 'normal'; events.length = 0;
  const keptFile = path.join(project, 'neocrm-src/existing.snapshot.json'); fs.mkdirSync(path.dirname(keptFile), { recursive: true }); fs.writeFileSync(keptFile, 'keep edits');
  const retrieved = await detail(); assert.equal(retrieved.source, 'cli');
  assert.equal(retrieved.definition.nodeInfo.start.taskDefName, '开始');
  assert.equal(retrieved.definition.fragments.edges.length, 1);
  assert.equal(retrieved.definition.baseInfo.procdefId, 'def-0');
  assert.equal(fs.existsSync(lastTemporary), false);
  assert.equal(fs.readFileSync(keptFile, 'utf8'), 'keep edits');
  assert.equal(events.some(event => event.type.startsWith('legacy')), false);
  for (mode of ['failure', 'incomplete', 'mismatched-id']) {
    events.length = 0;
    const fallback = await detail(); assert.equal(fallback.source, 'legacy', mode);
    assert.equal(events[0].type, 'cli'); assert.equal(events.at(-1).type, 'legacy-detail');
    assert.equal(events.filter(event => event.type === 'legacy-detail').length, 1);
    assert.equal(fs.existsSync(lastTemporary), false);
  }
  console.log('PASS CLI detail: verified snapshot/fragments, temporary project shares login, edits preserved; invalid snapshots fall back');

  mode = 'abort'; events.length = 0;
  await assert.rejects(list, { name: 'AbortError' });
  assert.equal(events.some(event => event.type.startsWith('legacy')), false);
  const controller = new AbortController(); controller.abort(); events.length = 0;
  await assert.rejects(() => service.listTenantFlows(env, token, { procType: 2 }, { projectPath: project, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(events.length, 0);
  mode = 'normal'; events.length = 0;
  await service.listTenantFlows({ ...env, productType: 'salesforce' }, token, { procType: 2 });
  await service.listTenantFlows({ ...env, productType: 'fxiaoke' }, token, { procType: 2 });
  await list({ procType: 1 });
  assert.equal(events.some(event => event.type === 'cli'), false);
  events.length = 0;
  const mixed = await list({}); assert.equal(mixed.source, 'mixed');
  assert.equal(events.filter(event => event.type === 'legacy-list').length, 1);
  assert.equal(events.find(event => event.type === 'legacy-list').params.procType, 1);
  console.log('PASS cancellation stops without fallback; other connectors/automatic flows preserved; mixed reads route approvals to CLI');

  const ai = new AiService(store, metadata, {}); ai.workflowService = service;
  mode = 'normal';
  const tool = await ai.executeUnifiedTool('list_flows', { procType: 2 }, [], env, token, project);
  assert.equal(tool.data.source, 'cli'); assert.match(tool.summary, /neo CLI/);
  mode = 'failure';
  const fallbackTool = await ai.executeUnifiedTool('list_flows', { procType: 2 }, [], env, token, project);
  assert.equal(fallbackTool.data.source, 'legacy'); assert.match(fallbackTool.summary, /回退/);
  const detailTool = await ai.executeUnifiedTool('get_flow_detail', { procType: 2, procdefId: 'def-0' }, [], env, token, project);
  assert.equal(detailTool.data.source, 'legacy'); assert.match(detailTool.summary, /回退/);
  service.listTenantFlowsLegacy = async () => ({ success: false, error: 'legacy unavailable' });
  await assert.rejects(() => ai.executeUnifiedTool('list_flows', { procType: 2 }, [], env, token, project), /原有方式也失败/);
  console.log('PASS actual AI tools carry source/commands/fallback reason; both channels failing reports an error, never zero results');

  if (process.platform !== 'win32') {
    const bin = path.join(fixture, '.local/bin'); fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(path.join(bin, 'neo'), '#!/usr/bin/env node\nif (process.argv.includes("--fail")) { console.error("fixture exit failure"); process.exit(2); }\nconsole.log(JSON.stringify({ args: process.argv.slice(2) }));\n', { mode: 0o755 });
    const output = JSON.parse(await runNeoApprovalCli(['list', 'approvalprocess', '--json'], project));
    assert.deepEqual(output.args, ['list', 'approvalprocess', '--json']);
    await assert.rejects(() => runNeoApprovalCli(['--fail'], project), /fixture exit failure/);
    console.log('PASS real child-process runner: locates neo in GUI PATH, preserves argv and handles nonzero exit');
  }
} finally {
  store?.neoCliAuthWatcher?.close();
  if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
  if (previousProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = previousProfile;
  if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
  fs.rmSync(fixture, { recursive: true, force: true });
}
