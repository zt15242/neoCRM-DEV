import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-restricted-packages-'));
const originalFetch = globalThis.fetch;
try {
  const subjectFile = path.join(fixture, 'subject.cjs');
  await build({ stdin: { resolveDir: root, loader: 'ts', contents: `
    export * from './electron/security/restrictedSkillPackages';
    export { getProtectedSkillInstruction, isProtectedBuiltinSkill, CRM_HARNESS_TOOLS_SPEC } from './electron/security/protectedHarness';
    export { restrictedFeatureService as access, RestrictedFeatureService } from './electron/security/restrictedFeatureService';
    export { licenseService as license } from './electron/security/licenseService';
    export { BUILTIN_AI_SKILLS, DEFAULT_AI_SETTINGS } from './shared/constants';
    export { AiService } from './electron/services/aiService';
    export { DshToolService } from './electron/services/dshToolService';
    export { NeoOpenApiService } from './electron/services/neoOpenApiService';
  ` }, bundle: true, platform: 'node', format: 'cjs', outfile: subjectFile, external: ['esbuild'], logLevel: 'silent',
    plugins: [{ name: 'isolated-host', setup(builder) {
      builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'fixture' }));
      builder.onLoad({ filter: /^electron$/, namespace: 'fixture' }, () => ({ contents: `
        export const app={getPath:()=>${JSON.stringify(fixture)}};
        export const dialog={},shell={},BrowserWindow=class{};
      ` }));
      builder.onResolve({ filter: /^os$/ }, () => ({ path: 'os', namespace: 'fixture' }));
      builder.onLoad({ filter: /^os$/, namespace: 'fixture' }, () => ({ contents: `
        import original from 'node:os';
        export default {...original,homedir:()=>${JSON.stringify(fixture)},tmpdir:()=>${JSON.stringify(fixture)}};
      ` }));
    } }],
  });
  const s = createRequire(import.meta.url)(subjectFile);
  const ids = ['manage-neocrm-permissions', 'configure-neocrm-mobile'];
  const aliases = ids.flatMap(id => [id, `skill-${id}`, `preset-${id}`]);
  const ai = new s.AiService({}, {}, {});
  const read = (name, input = {}) => ai.executeCrmTool('skill', { name, ...input });
  const titles = s.BUILTIN_AI_SKILLS.filter(item => ids.some(id => item.id === `skill-${id}`)).map(item => item.name);
  assert.equal(titles.length, 2);
  assert.equal(s.getRestrictedSkillDiscovery(s.BUILTIN_AI_SKILLS), '');
  for (const id of aliases) {
    assert(s.isProtectedBuiltinSkill(id));
    assert.equal(s.getProtectedSkillInstruction(id), null);
    assert.equal(s.readRestrictedSkillPackage(id, { resource: 'references/implementation-guide.md' }), null);
    await assert.rejects(read(id), /未找到/);
  }
  for (const title of titles) await assert.rejects(read(title), /未找到/);
  assert(!s.access.unlock('wrong-key').success);
  console.log('PASS default lock: names, IDs, aliases, instructions, resources and discovery are gated');

  let authorized = true;
  s.license.activateLicense = key => ({ success: key === 'fixture-key', message: 'fixture', status: { isAuthorized: key === 'fixture-key' } });
  s.license.getLicenseStatus = () => ({ isAuthorized: authorized });
  assert.equal(new s.RestrictedFeatureService(s.license).getStatus().visible, false);
  assert(s.access.unlock('fixture-key').success);
  for (const id of aliases) assert(s.getProtectedSkillInstruction(id).length > 500);
  const discovery = s.getRestrictedSkillDiscovery(s.BUILTIN_AI_SKILLS);
  for (const id of ids) assert(discovery.includes(id));
  assert.equal(s.getRestrictedSkillDiscovery(s.BUILTIN_AI_SKILLS.map(item => ({ ...item, enabled: false }))), '');

  let resourceCount = 0;
  for (const name of ids) {
    const { data } = await read(name);
    assert(data.instruction.includes(`name: ${name}`));
    assert(data.resources.some(item => item.resource === 'references/implementation-guide.md'));
    for (const item of data.resources) {
      const chunk = (await read(name, { resource: item.resource, limit: 2 })).data;
      assert.equal(chunk.totalLines, item.lines);
      assert.equal(chunk.offset, 1);
      if (chunk.nextOffset) {
        const next = (await read(name, { resource: item.resource, offset: chunk.nextOffset, limit: 2 })).data;
        assert.equal(next.offset, 3);
      }
      if (item.resource.endsWith('.mjs')) assert(chunk.exports.length > 0);
      resourceCount++;
    }
    await assert.rejects(read(name, { resource: '../SKILL.md' }), /未找到/);
    await assert.rejects(read(name, { resource: 'references/implementation-guide.md', offset: 0 }), /offset/);
    await assert.rejects(read(name, { resource: 'references/implementation-guide.md', limit: 401 }), /limit/);
    await assert.rejects(read(name, { script: 'scripts/../../other.mjs', exportName: 'createApp' }), /未找到/);
    await assert.rejects(read(name, { resource: '__proto__' }), /未找到/);
  }
  for (const title of titles) assert((await read(title)).data.resources.length > 0);
  console.log(`PASS unlock: ${resourceCount} encrypted resources readable by page; traversal and invalid ranges rejected`);

  const run = async (name, script, exportName, ...args) => (await read(name, { script, exportName, args })).data;
  const role = await run(ids[0], 'scripts/role-contract.mjs', 'createRole', { roleName: 'TEST_角色', code: 'TEST_role', testPrefix: 'TEST_' });
  assert(role.offline);
  assert.equal(new URLSearchParams(role.result.body).get('role.name'), 'TEST_角色');
  const user = await run(ids[0], 'scripts/public-api-requests.mjs', 'buildPublicRequest', 'disableUser', { recordId: 123 });
  assert.equal(user.result.method, 'POST');
  assert.equal(JSON.parse(user.result.body).recordId, 123);
  await assert.rejects(run(ids[0], 'scripts/public-api-requests.mjs', 'executePublicRequest', {}), /未找到/);
  const app = await run(ids[1], 'scripts/app-client.mjs', 'createApp', { name: 'TEST_移动 & CRM', desc: '' });
  assert.equal(new URLSearchParams(app.result.body).get('name'), 'TEST_移动 & CRM');
  assert.equal(new URLSearchParams(app.result.body).get('beforeArray'), '[]');
  const publish = await run(ids[1], 'scripts/app-client.mjs', 'preparePublish', { layoutId: 123, testTarget: 123 });
  assert.equal(publish.result.mutates, true);
  const parsed = await run(ids[1], 'scripts/app-client.mjs', 'parsePublish', { httpStatus: 200, body: { flag: 2 } });
  assert.equal(parsed.result.published, false);
  assert.equal(parsed.result.needsDependencyReview, true);
  // This module imports app-client; bundling must resolve it without disk materialization/require.
  await assert.rejects(run(ids[1], 'scripts/component-planner.mjs', 'planHomeContainer', {}), /missing config/);
  const home = { id: 123, layoutId: 123, entityId: -101, deviceType: 3,
    widgets: { '1': { widgetType: 'xsyViewPage', attributes: {} } }, layout: { uuid: '1', children: [] } };
  const container = await run(ids[1], 'scripts/component-planner.mjs', 'planHomeContainer', {
    baseline: home, testTarget: 123, parentUuid: '1', componentMaxLimit: 10,
  });
  assert.equal(container.result.config.widgets['2'].widgetType, 'xsyGridContainer');
  assert.equal(Object.keys(home.widgets).length, 1);
  console.log('PASS offline builders: form/JSON preparation, imported modules and publish verification run without network or files');

  const ptc = await ai.executeCrmTool('run_code', { code: `const s = await tools.skill({name:'${ids[1]}'}); console.log(s.instruction); return s.resources.length;` });
  assert(ptc.data.protectedBuiltin);
  assert(ptc.data.logs[0].includes(`name: ${ids[1]}`), 'model receives the requested instructions');
  assert(ptc.data.value > 0);
  const jobs = ai.dshToolService.listJobs().jobs;
  const job = jobs.find(item => item.id.startsWith('ptc_'));
  assert(job);
  const jobOutput = await ai.dshToolService.getJobOutput({ job_id: job.id });
  assert(!jobOutput.output.includes(`name: ${ids[1]}`), 'job output cannot bypass protected result redaction');
  console.log('PASS PTC: tools.skill is available and background logs do not expose skill bodies');

  const sessionStore = { prepareNeoCliForConversation: () => ({ session: { isLoggedIn: false } }), getCurrentSession: () => ({ isLoggedIn: false }) };
  const streamAi = new s.AiService(sessionStore, {}, {});
  const provider = { id: 'fixture', name: 'Fixture', baseUrl: 'http://localhost:9999/v1', apiKey: '', protocol: 'openai',
    models: [{ id: 'fixture-model', name: 'Fixture', tools: true, contextWindow: 128000, maxOutputTokens: 4096 }] };
  streamAi.getAiConfig = () => ({ providers: [provider], settings: { ...s.DEFAULT_AI_SETTINGS, maxTokens: 4096 }, skills: s.BUILTIN_AI_SKILLS, mcpServers: [] });
  const sse = delta => new Response(`data: ${JSON.stringify({ choices: [{ delta, finish_reason: null }] })}\n\ndata: [DONE]\n\n`);
  const referenceMarker = '用户与部门后台代码接口合同';
  for (const mode of ['standard', 'ptc', 'ptc-error', 'gemini']) {
    provider.protocol = mode === 'gemini' ? 'google-gemini' : 'openai';
    provider.apiKey = mode === 'gemini' ? 'fixture-key' : '';
    let calls = 0;
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body); calls++;
      const params = { name: titles[0], resource: 'references/user-admin-contract.md', limit: 30 };
      if (mode === 'gemini') {
        assert(JSON.stringify(body.systemInstruction).includes(ids[0]));
        const parts = calls === 1 ? [{ functionCall: { name: 'skill', args: params } }] : [{ text: '完成验证。' }];
        if (calls > 1) assert(JSON.stringify(body.contents).includes(referenceMarker), 'model receives protected references');
        return new Response(`data: ${JSON.stringify({ candidates: [{ content: { parts } }] })}\n\n`);
      }
      assert(body.messages[0].content.includes(ids[0]));
      if (calls === 1) {
        const isPtc = mode.startsWith('ptc');
        const name = isPtc ? 'run_code' : 'skill';
        const args = isPtc ? { code: mode === 'ptc-error' ? `throw new Error((await tools.skill(${JSON.stringify(params)})).content);`
          : `return await tools.skill(${JSON.stringify(params)});` } : params;
        return sse({ tool_calls: [{ index: 0, id: 'protected-call', type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
      }
      assert(body.messages.findLast(message => message.role === 'tool').content.includes(referenceMarker));
      return sse({ content: '完成验证。' });
    };
    const events = [];
    await streamAi.startChatStream({ requestId: `protected-${mode}`, sessionId: `protected-${mode}`, messageId: 'answer', providerId: 'fixture', modelId: 'fixture-model',
      messages: [{ id: 'user', role: 'user', content: '读取当前可用的用户管理规范', createdAt: 1 }], projectPath: fixture,
      mode: mode === 'gemini' ? 'standard' : mode.startsWith('ptc') ? 'ptc' : mode, enableTools: true }, event => events.push(event));
    assert.equal(calls, 2, JSON.stringify(events.filter(event => event.type === 'error')));
    const call = events.find(event => event.type === 'tool_update').toolCall;
    assert(call.resultData.protectedBuiltin, mode);
    assert(!JSON.stringify(events).includes(referenceMarker), `renderer reference leak (${mode}): ${events.filter(event => JSON.stringify(event).includes(referenceMarker)).map(event => `${event.type}:${Object.keys(event).join(',')}`).join(';')}`);
  }
  globalThis.fetch = originalFetch;
  console.log('PASS actual model loops: standard/PTC/Gemini discovery, resource calls and renderer redaction');

  for (const id of aliases) {
    await ai.saveSkill({ id, category: 'personal', enabled: true, systemInstruction: 'TAMPER_SENTINEL' });
    await ai.deleteSkill(id);
  }
  for (const id of ids) {
    const found = ai.getAiConfig().skills.find(item => item.id === `skill-${id}`);
    assert.equal(found.category, 'builtin');
    assert.equal(found.systemInstruction, undefined);
  }
  const raw = JSON.parse(await fs.readFile(path.join(fixture, 'neocrm_ai_config.json'), 'utf8'));
  assert(!JSON.stringify(raw).includes('TAMPER_SENTINEL'));
  assert(!raw.personalSkills.some(item => aliases.includes(item.id)));
  assert.equal((await ai.exportSkillZip(aliases)).success, false);
  const encrypted = JSON.parse(await fs.readFile(path.join(root, 'electron/security/restrictedSkillPackages.json'), 'utf8'));
  for (const ciphertext of Object.values(encrypted)) {
    assert(ciphertext.startsWith('neo-skill:v1:'));
    assert(!ciphertext.includes('/admin/'));
  }
  console.log('PASS protection: builtin metadata only, override/delete/export blocked, resources shipped as ciphertext');

  s.access.lock();
  for (const id of aliases) assert.equal(s.readRestrictedSkillPackage(id), null, 'cached resources recheck lock');
  await assert.rejects(read(ids[0], { script: 'scripts/role-contract.mjs', exportName: 'createRole', args: [] }), /未找到/);
  assert.equal(s.getRestrictedSkillDiscovery(s.BUILTIN_AI_SKILLS), '');
  provider.protocol = 'openai'; provider.apiKey = '';
  globalThis.fetch = async (_url, options) => {
    const system = JSON.parse(options.body).messages[0].content;
    for (const id of ids) assert(!system.includes(id), 'locked skills absent from actual system prompt');
    for (const title of titles) assert(!system.includes(title));
    return sse({ content: '完成验证。' });
  };
  const lockedEvents = [];
  await streamAi.startChatStream({ requestId: 'locked', sessionId: 'locked', messageId: 'answer', providerId: 'fixture', modelId: 'fixture-model',
    messages: [{ id: 'user', role: 'user', content: '你好', createdAt: 1 }], projectPath: fixture, enableTools: true }, event => lockedEvents.push(event));
  assert(!lockedEvents.some(event => event.type === 'error'));
  globalThis.fetch = originalFetch;
  assert(s.access.unlock('fixture-key').success);
  authorized = false;
  assert.equal(s.getProtectedSkillInstruction(ids[0]), null);
  assert.equal(s.getProtectedSkillInstruction(ids[1]), null);
  authorized = true;
  assert(s.access.unlock('fixture-key').success);
  s.license.getLicenseStatus = () => ({ isAuthorized: true, expiresAt: Date.now() - 1 });
  for (const id of ids) assert.equal(s.readRestrictedSkillPackage(id), null, 'expired license closes cached resources');
  console.log('PASS relock/revocation: cached resources, builders and discovery become inaccessible');

  const requests = [];
  const api = new s.NeoOpenApiService(async config => { requests.push(config); return { status: 200, data: { status: 0 } }; });
  const env = { id: 'fixture', name: 'Fixture CRM', neoBaseURL: 'https://current.invalid', productType: 'neocrm' };
  const token = { access_token: 'fixture-token', cookieString: 'sid=fixture-cookie', instance_uri: env.neoBaseURL };
  const call = input => api.execute(env, token, input);
  await call({ method: role.result.method, url: `https://old.invalid${role.result.path}`, body: role.result.body, bodyEncoding: 'form', confirm: true });
  assert.equal(requests[0].data, role.result.body, 'pre-encoded legacy body is preserved exactly');
  assert.equal(new URL(requests[0].url).origin, env.neoBaseURL);
  assert.equal(requests[0].headers.Cookie, token.cookieString);
  assert(!requests[0].headers.Authorization);
  assert.match(requests[0].headers['Content-Type'], /x-www-form-urlencoded/);
  await call({ method: 'POST', url: '/admin/example.action', body: { empty: '', choose: '0', config: '{"name":"a & b"}' }, bodyEncoding: 'form', confirm: true });
  const form = new URLSearchParams(requests[1].data);
  assert.equal(form.get('empty'), ''); assert.equal(form.get('choose'), '0'); assert.equal(form.get('config'), '{"name":"a & b"}');
  await call({ method: 'POST', url: '/rest/example', body: JSON.parse(user.result.body), confirm: true });
  assert.deepEqual(requests[2].data, JSON.parse(user.result.body));
  assert.equal(requests[2].headers.Authorization, `Bearer ${token.access_token}`);
  assert(!requests[2].headers.Cookie);
  for (const url of ['/admin/app_designer/release-app.action', '/admin/app_designer/do-release-app.action',
    '/admin/app_designer/save-detail-layout.action', '/admin/appOfflinePackage/disablePackage.action']) {
    await assert.rejects(call({ method: 'GET', url }), /confirm=true/);
    await call({ method: 'GET', url, confirm: true });
  }
  await assert.rejects(call({ method: 'GET', url: '/admin/custom.action', mutates: true }), /confirm=true/);
  const before = requests.length;
  await assert.rejects(call({ method: 'POST', url: '/admin/example', body: { config: {} }, bodyEncoding: 'form', confirm: true }), /先序列化/);
  assert.equal(requests.length, before);
  await call({ method: 'GET', url: '/admin/app_designer/get-config.action' });
  assert.equal(requests.at(-1).data, undefined);
  console.log('PASS connector transport: form/JSON encoding, shared auth, environment replacement and mutating GET confirmation');
} finally {
  globalThis.fetch = originalFetch;
  await fs.rm(fixture, { recursive: true, force: true });
}
