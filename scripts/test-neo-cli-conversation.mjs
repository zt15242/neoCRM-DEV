import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build, transform } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-cli-conversation-'));
const previousHome = process.env.HOME;
const previousUserProfile = process.env.USERPROFILE;
const originalFetch = globalThis.fetch;
const userData = path.join(fixture, 'user-data');
fs.mkdirSync(userData);
process.env.HOME = fixture;
process.env.USERPROFILE = fixture;
let store;

try {
  const output = path.join(fixture, 'test-subject.cjs');
  await build({
    stdin: { contents: `
      export { SessionStore } from './electron/services/sessionStore';
      export { AiService } from './electron/services/aiService';
      export { NeoMetadataCliReader } from './electron/services/neoMetadataCli';
      export { NeoBusinessTypeService } from './electron/services/neoBusinessTypeService';
      export { DataService } from './electron/services/dataService';
      export { ensureNeoCliProject, readNeoCliAuth, writeNeoCliAuth, getNeoCliAuthLocation } from './electron/services/neocrmCliSession';
      export { filterNeoCliTools, getNeoCliSessionInstruction, NEO_CLI_FIRST_ROUTING } from './electron/security/neoCliConversation';
      export { licenseService } from './electron/security/licenseService';
      export { requiresRoleLicense, requiresFlowLicense } from './shared/licensePolicy';
      export { decryptBuiltinSkillAsset } from './electron/security/protectedSkillAssets';
      export { CRM_HARNESS_TOOLS_SPEC, getProtectedSkillInstruction, isProtectedBuiltinSkill } from './electron/security/protectedHarness';
    `, resolveDir: root, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', outfile: output, logLevel: 'silent',
    external: ['esbuild'],
    plugins: [{ name: 'test-host', setup(builder) {
      builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'test-host' }));
      builder.onLoad({ filter: /.*/, namespace: 'test-host' }, () => ({ contents: `
        export const app = { getPath: () => ${JSON.stringify(userData)} };
        export const dialog = {}, shell = {}, BrowserWindow = class {};
      ` }));
      builder.onResolve({ filter: /security\/licenseService$/ }, () => ({ path: 'license', namespace: 'test-license' }));
      builder.onLoad({ filter: /.*/, namespace: 'test-license' }, () => ({ contents: `
        let status = { isAuthorized: true };
        export const licenseService = {
          getLicenseStatus: () => status,
          setTestStatus: (next) => { status = next; },
          assertAuthorized: () => { if (!status.isAuthorized) throw new Error('fixture device locked'); },
        };
      ` }));
    } }],
  });
  const subject = createRequire(import.meta.url)(output);
  const { SessionStore, AiService, NeoMetadataCliReader, NeoBusinessTypeService, ensureNeoCliProject, readNeoCliAuth, writeNeoCliAuth, getNeoCliAuthLocation,
    filterNeoCliTools, getNeoCliSessionInstruction, NEO_CLI_FIRST_ROUTING, CRM_HARNESS_TOOLS_SPEC, getProtectedSkillInstruction } = subject;
  const project = path.join(fixture, '当前工作区');
  fs.mkdirSync(project);
  const environment = { id: 'connector-sandbox', name: '当前连接器', productType: 'neocrm', envType: 'sandbox',
    neoBaseURL: 'https://crm-sandbox.example.test', tokenURL: 'https://login.example.test/oauth2/token', loginURL: '' };
  const token = { access_token: 'fixture-access', refresh_token: 'fixture-refresh', tenant_id: 'fixture-tenant',
    instance_uri: environment.neoBaseURL, expiresAt: Date.now() + 3600000, savedAt: Date.now(),
    cookieString: 'fixture-cookie', userInfo: { userId: 'fixture-user', name: '测试用户' } };
  const session = { isLoggedIn: true, environment, tokenData: token, activeAccountId: 'fixture-account' };
  const sessionsPath = path.join(userData, 'neocrm_sessions.json');
  const saveFixture = (current) => fs.writeFileSync(sessionsPath, JSON.stringify({ current, history: [] }));
  saveFixture(session);
  store = new SessionStore();

  const ready = store.prepareNeoCliForConversation(project);
  assert.equal(ready.success, true);
  const first = JSON.parse(fs.readFileSync(path.join(project, 'neo-project.json')));
  assert.equal(first.cliVersion, '1.0.8');
  assert.equal(readNeoCliAuth(project).accessToken, token.access_token);
  assert.equal(ready.session.environment.id, environment.id);
  if (process.platform !== 'win32') assert.equal(fs.statSync(getNeoCliAuthLocation(project).file).mode & 0o777, 0o600);
  console.log('PASS missing manifest: created before conversation, connector login reused');

  fs.unlinkSync(path.join(project, 'neo-project.json'));
  assert.equal(store.prepareNeoCliForConversation(project).success, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(project, 'neo-project.json'))).projectId, first.projectId);
  assert.equal(store.getCurrentSession().isLoggedIn, true);
  console.log('PASS deleted manifest: restored with the same project ID, no logout');

  fs.writeFileSync(path.join(project, 'neo-project.json'), '{broken');
  assert.equal(store.prepareNeoCliForConversation(project).success, true);
  fs.writeFileSync(path.join(project, 'neo-project.json'), JSON.stringify({ ...first, sourceDir: 'old', cliVersion: '0.1' }));
  ensureNeoCliProject(project);
  assert.equal(JSON.parse(fs.readFileSync(path.join(project, 'neo-project.json'))).sourceDir, 'neocrm-src');
  const stable = fs.statSync(path.join(project, 'neo-project.json')).mtimeMs;
  ensureNeoCliProject(project);
  assert.equal(fs.statSync(path.join(project, 'neo-project.json')).mtimeMs, stable);
  console.log('PASS malformed/outdated manifest: repaired; matching manifest is not rewritten');

  writeNeoCliAuth(project, { ...readNeoCliAuth(project), tenantId: 'wrong-tenant', accessToken: 'wrong-access' });
  assert.equal(store.prepareNeoCliForConversation(project).success, true);
  assert.equal(readNeoCliAuth(project).tenantId, token.tenant_id);
  const refreshed = { ...readNeoCliAuth(project), accessToken: 'fixture-new-access', refreshToken: 'fixture-new-refresh', savedAt: Date.now() + 1000 };
  writeNeoCliAuth(project, refreshed);
  assert.equal(store.prepareNeoCliForConversation(project).session.tokenData.access_token, refreshed.accessToken);
  assert.equal(store.getCurrentSession().tokenData.cookieString, token.cookieString);
  console.log('PASS connector takes precedence over another tenant; CLI token refresh preserves connector cookies');

  fs.unlinkSync(getNeoCliAuthLocation(project).file);
  assert.equal(store.prepareNeoCliForConversation(project).success, true);
  assert.equal(readNeoCliAuth(project).accessToken, refreshed.accessToken);
  const badProject = path.join(fixture, 'not-a-directory');
  fs.writeFileSync(badProject, 'x');
  const failed = store.prepareNeoCliForConversation(badProject);
  assert.equal(failed.success, false);
  assert.equal(failed.session.isLoggedIn, true);
  assert.doesNotMatch(getNeoCliSessionInstruction(failed), /已验证就绪/);
  console.log('PASS missing CLI credentials repaired; preparation errors preserve connector login and report failure');

  const sf = { ...session, environment: { ...environment, productType: 'salesforce' } };
  saveFixture(sf);
  const sfRoot = path.join(fixture, 'salesforce');
  fs.mkdirSync(sfRoot);
  assert.equal(store.prepareNeoCliForConversation(sfRoot).session.environment.productType, 'salesforce');
  assert.equal(fs.existsSync(path.join(sfRoot, 'neo-project.json')), false);
  assert.equal(store.getCurrentSession().environment.productType, 'salesforce');
  store.clearSession();
  assert.equal(readNeoCliAuth(project).accessToken, refreshed.accessToken);
  console.log('PASS other connectors are not registered as NeoCRM projects');

  saveFixture(session);
  const tools = filterNeoCliTools(CRM_HARNESS_TOOLS_SPEC);
  assert.equal(tools.some((tool) => tool.function.name === 'list_nex_extensions'), false);
  assert.equal(tools.some((tool) => tool.function.name === 'get_nex_extension_code'), false);
  assert.equal(tools.some((tool) => tool.function.name === 'bash'), true);
  assert.equal(tools.some((tool) => tool.function.name === 'skill'), true);
  assert.equal(filterNeoCliTools([{ function: { name: 'create_custom_entity' } }]).length, 0);
  assert.equal(filterNeoCliTools([{ function: { name: 'create_custom_field' } }]).length, 0);
  assert.match(getProtectedSkillInstruction('neo-nex-dev'), /neo retrieve nex/);
  assert.match(getProtectedSkillInstruction('skill-neo-cli-usage'), /neo-project.json/);
  assert.match(NEO_CLI_FIRST_ROUTING, /neo list object/);
  assert.match(NEO_CLI_FIRST_ROUTING, /neo describe object/);
  assert.match(NEO_CLI_FIRST_ROUTING, /没有普通业务记录 XOQL 查询/);
  assert.match(NEO_CLI_FIRST_ROUTING, /CLI 命令失败.*才允许调用对应的旧连接器工具/s);
  assert.match(NEO_CLI_FIRST_ROUTING, /禁止调用 neo login、neo logout 或会输出令牌的 neo loginstatus/);

  const ai = new AiService(store, {}, {});
  const fixtureConfig = { providers: [{ id: 'fixture', name: 'Fixture', baseUrl: 'http://127.0.0.1:1', apiKey: 'fixture-key',
    protocol: 'openai', models: [{ id: 'fixture', tools: true, contextWindow: 128000, maxOutputTokens: 8192 }] }],
    settings: { enableCrmTools: true, injectTenantContext: false, maxTokens: 512, contextMessageLimit: 10 }, mcpServers: [], skills: [] };
  ai.getAiConfig = () => fixtureConfig;
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    assert.equal(fs.existsSync(path.join(project, 'neo-project.json')), true);
    const response = body.contents
      ? 'data: {"candidates":[{"content":{"parts":[{"text":"fixture response"}]},"finishReason":"STOP"}]}\n\n'
      : 'data: {"choices":[{"delta":{"content":"fixture response"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
    return new Response(response,
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  };
  fs.unlinkSync(path.join(project, 'neo-project.json'));
  const events = [];
  await ai.startChatStream({ requestId: 'fixture', sessionId: 'fixture-session', messageId: 'fixture-msg',
    providerId: 'fixture', modelId: 'fixture', projectPath: project, enableTools: true,
    messages: [{ id: 'fixture-u', role: 'user', content: '获取nex', createdAt: Date.now() }], mode: 'standard' },
    (event) => events.push(event));
  assert.equal(events.some((event) => event.type === 'error'), false, JSON.stringify(events.filter((event) => event.type === 'error')));
  assert.equal(requests.length, 1);
  const prompt = requests[0].messages.find((message) => message.role === 'system').content;
  assert.match(prompt, /已加载技能 neo-nex-dev/);
  assert.match(prompt, /已加载技能 neo-cli-usage/);
  assert.match(prompt, /neo retrieve nex/);
  assert.equal(requests[0].tools.some((tool) => tool.function.name === 'list_nex_extensions'), false);
  assert.equal(events.filter((event) => event.type === 'tool_start' && event.toolCall.name === 'skill').length, 2);
  await assert.rejects(() => ai.executeUnifiedTool('list_nex_extensions', {}, [], environment, token, project), /旧 NEX 工具已停用/);
  console.log('PASS conversation integration: creates manifest before model request, loads both skills, blocks legacy NEX tools');

  requests.length = 0;
  const generalEvents = [];
  await ai.startChatStream({ requestId: 'fixture-general', sessionId: 'fixture-session', messageId: 'fixture-msg',
    providerId: 'fixture', modelId: 'fixture', projectPath: project, enableTools: true,
    messages: [{ id: 'fixture-general-u', role: 'user', content: '查询当前租户有哪些对象', createdAt: Date.now() }], mode: 'standard' },
    (event) => generalEvents.push(event));
  const generalPrompt = requests[0].messages.find((message) => message.role === 'system').content;
  assert.match(generalPrompt, /已加载技能 neo-cli-usage/);
  assert.match(generalPrompt, /销售易功能统一 CLI 优先路由/);
  assert.match(generalPrompt, /CLI 成功返回空数据是有效结果/);
  assert.match(generalPrompt, /这些操作直接使用现有连接器工具/);
  assert.equal(generalEvents.filter((event) => event.type === 'tool_start' && event.toolCall.name === 'skill').length, 1);
  console.log('PASS every NeoCRM conversation loads CLI skill and global CLI-first routing, including non-NEX/non-approval requests');

  const businessCalls = [];
  const businessRecords = [];
  const invalidated = [];
  ai.dataService = { invalidateEntityBusiTypes: (...args) => invalidated.push(args) };
  ai.neoBusinessTypes = new NeoBusinessTypeService(async (config) => {
    businessCalls.push(config);
    assert.equal(config.headers.Authorization, `Bearer ${store.getCurrentSession().tokenData.access_token}`);
    if (config.method === 'POST') businessRecords.push({ ...config.data, apiKey: config.data.apiKey + '__c' });
    return { data: { code: 200, data: config.url.endsWith('/busiTypes') && config.method === 'GET'
      ? { records: businessRecords } : { apiKey: 'account', enableBusitype: true } } };
  });
  const originalModelFetch = globalThis.fetch;
  const businessInput = { entityApiKey: 'account', apiKey: 'enterprise__c', label: '企业客户' };
  for (const [mode, protocol] of [['standard', 'openai'], ['ptc', 'openai'], ['standard', 'google-gemini'], ['ptc', 'google-gemini']]) {
    fixtureConfig.providers[0].protocol = protocol;
    requests.length = 0;
    const businessEvents = [];
    let ptcResult;
    ai.dshToolService = { executePtcCode: async (_args, sdk) => {
      ptcResult = await sdk.deploy_business_type({ ...businessInput, dryRun: true });
      return { logs: [], executionTimeMs: 1 };
    } };
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body); requests.push(body);
      const toolName = mode === 'ptc' ? 'run_code' : 'deploy_business_type';
      const args = mode === 'ptc' ? { code: 'await tools.deploy_business_type(input)' } : { ...businessInput, dryRun: true };
      const data = requests.length === 1
        ? protocol === 'google-gemini'
          ? { candidates: [{ content: { parts: [{ functionCall: { name: toolName, args } }] }, finishReason: 'STOP' }] }
          : { choices: [{ delta: { tool_calls: [{ index: 0, id: 'business-type', type: 'function', function: { name: toolName, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] }
        : protocol === 'google-gemini'
          ? { candidates: [{ content: { parts: [{ text: '预演完成' }] }, finishReason: 'STOP' }] }
          : { choices: [{ delta: { content: '预演完成' }, finish_reason: 'stop' }] };
      return new Response(`data: ${JSON.stringify(data)}\n\n${protocol === 'openai' ? 'data: [DONE]\n\n' : ''}`,
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    };
    // The latest message deliberately omits “业务类型”: the ongoing task must retain its skill.
    await ai.startChatStream({ requestId: `business-${mode}-${protocol}`, sessionId: 'fixture-session', messageId: 'business-msg',
      providerId: 'fixture', modelId: 'fixture', projectPath: project, enableTools: true, mode,
      messages: [{ id: 'business-u1', role: 'user', content: '为客户创建企业客户业务类型', createdAt: Date.now() },
        { id: 'business-u2', role: 'user', content: '继续处理', createdAt: Date.now() }] }, (event) => businessEvents.push(event));
    assert.equal(businessEvents.some((event) => event.type === 'error'), false, JSON.stringify(businessEvents));
    assert.equal(requests.length, 2, `${mode}/${protocol}`);
    const system = protocol === 'google-gemini' ? JSON.stringify(requests[0].systemInstruction) : requests[0].messages[0].content;
    assert.match(system, /已加载技能 neo-entity-management/);
    assert.match(system, /销售易业务类型创建与部署/);
    assert.doesNotMatch(system, /业务类型创建需通过 CRM 后台|再通过 CRM 后台或经审批的人工 API 流程完成/);
    if (mode === 'ptc') assert.equal(ptcResult.operation, 'create');
    else {
      const tool = businessEvents.find((event) => event.type === 'tool_update' && event.toolCall?.name === 'deploy_business_type');
      assert.equal(tool.toolCall.resultData.dryRun, true);
      assert.equal(tool.toolCall.resultData.operation, 'create');
      assert.equal(tool.toolCall.resultData.source, 'connector-fallback');
      assert.equal(JSON.stringify(requests[0].tools).includes('list_business_types'), true);
    }
  }
  assert.equal(businessCalls.some((call) => call.method !== 'GET'), false);
  globalThis.fetch = originalModelFetch;
  fixtureConfig.providers[0].protocol = 'openai';
  console.log('PASS business-type conversations: domain skill auto-loaded on follow-up; standard/PTC OpenAI/Gemini execute real dispatcher and preview without writing');

  const originalPrepare = store.prepareNeoCliForConversation.bind(store);
  store.prepareNeoCliForConversation = () => ({ success: false, message: 'custom OAuth cannot share CLI', session });
  await assert.rejects(() => ai.executeUnifiedTool('deploy_business_type', { ...businessInput, dryRun: false }, [], environment, token, project), /用户确认/);
  const businessDeployed = await ai.executeUnifiedTool('deploy_business_type', { ...businessInput, dryRun: false, confirm: true }, [], environment, token, project);
  assert.equal(businessDeployed.data.verified, true);
  assert.equal(invalidated.length, 1);
  const businessListed = await ai.executeUnifiedTool('list_business_types', { entityApiKey: 'account' }, [], environment, token, project);
  assert.equal(businessListed.data.totalCount, 1);
  const lookup = new subject.DataService();
  lookup.nameCache.set('entityBelongType:account_bt1', '旧名');
  lookup.nameCache.set('entityBelongType_bt1', '旧名');
  lookup.nameCache.set('contact_unchanged', '保留');
  lookup.busiTypeCache.set(`${token.tenant_id}_account`, [{ id: 'bt1', apiKey: 'enterprise__c', label: '旧名' }]);
  assert.equal(await lookup.getRecordName(environment, token, 'entityBelongType:account', 'bt1'), '旧名');
  lookup.invalidateEntityBusiTypes(token, 'account');
  lookup.fetchEntityBusiTypes = async () => {
    lookup.nameCache.set('entityBelongType:account_bt1', '新名');
    return [{ id: 'bt1', apiKey: 'enterprise__c', label: '新名' }];
  };
  assert.equal(await lookup.getRecordName(environment, token, 'entityBelongType:account', 'bt1'), '新名');
  assert.equal(lookup.busiTypeCache.has(`${token.tenant_id}_account`), false);
  assert.equal(lookup.nameCache.get('contact_unchanged'), '保留');
  const callsBeforeMismatch = businessCalls.length;
  await assert.rejects(() => ai.executeUnifiedTool('deploy_business_type', businessInput, [], environment, { ...token, tenant_id: 'other' }, project), /租户或用户不一致/);
  assert.equal(businessCalls.length, callsBeforeMismatch);
  await assert.rejects(() => ai.executeUnifiedTool('list_business_types', { entityApiKey: 'account' }, [], { ...environment, productType: 'salesforce' }, token, project), /仅支持销售易/);
  store.prepareNeoCliForConversation = originalPrepare;
  console.log('PASS business-type shared login: valid connector works without CLI sharing; deployment verifies and invalidates cache; cross-tenant/wrong-connector requests blocked');

  saveFixture(session);
  const cliCommands = [];
  const entityListOutput = '共 2 个实体：\n\n标准实体\n  account  客户\n\n自定义实体\n  demo__c  示例对象\n';
  const fieldDictionary = '# 客户 (account)\n\n共 2 个字段\n\n## 基础字段\n\n| 字段名称 | API Key | 类型 | Java类型 | 必填 | 可创建 | 可更新 | 说明 |\n|:---|:---|:---|:---|:---:|:---:|:---:|:---|\n| 客户名称 | accountName | 文本 | String | ❌ | ✅ | ✅ | — |\n| 客户编号 | accountCode | 文本 | String | ❌ | ✅ | ✅ | — |\n';
  ai.neoMetadataCli = new NeoMetadataCliReader(async (args, cwd) => {
    cliCommands.push({ args, cwd });
    if (args[0] === 'list') return entityListOutput;
    if (args[0] === 'describe') return fieldDictionary;
    throw new Error('unexpected CLI command');
  });
  ai.metadataService = {
    fetchEntityList: async () => { throw new Error('connector must not run after CLI success'); },
    fetchEntityFields: async () => { throw new Error('connector must not run after CLI success'); },
  };
  const listed = await ai.executeUnifiedTool('list_entities', {}, [], environment, token, project);
  assert.equal(listed.data.source, 'cli');
  assert.equal(listed.data.tenantTotalCount, 2);
  assert.deepEqual(listed.data.entities.map((entity) => entity.apiKey), ['account', 'demo__c']);
  const described = await ai.executeUnifiedTool('get_entity_fields', { entityApiKey: 'account' }, [], environment, token, project);
  assert.equal(described.data.source, 'cli');
  assert.equal(described.data.totalFields, 2);
  assert.equal(described.data.fields[0].apiKey, 'accountName');
  assert.match(described.data.fieldDictionary, /accountCode/);
  assert.deepEqual(cliCommands.map((item) => item.args.slice(0, 2)), [['list', 'object'], ['describe', 'object']]);
  assert(cliCommands.every((item) => item.cwd === project));
  console.log('PASS entity list/field tools execute and validate CLI output before returning');

  ai.metadataService = {
    createEntity: async () => { throw new Error('connector metadata write must not run'); },
    createField: async () => { throw new Error('connector metadata write must not run'); },
  };
  await assert.rejects(() => ai.executeUnifiedTool('create_custom_entity', { apiKey: 'demo', label: '示例' }, [], environment, token, project),
    /必须通过 neo generate\/deploy CLI/);
  await assert.rejects(() => ai.executeUnifiedTool('create_custom_field', { entityApiKey: 'account', apiKey: 'demo', label: '示例', itemType: 1 }, [], environment, token, project),
    /必须通过 neo generate\/deploy CLI/);
  console.log('PASS NeoCRM metadata writes cannot bypass CLI source and deployment gates');

  let ptcEntityList;
  let ptcEntityFields;
  ai.dshToolService = { executePtcCode: async (_args, tools) => {
    ptcEntityList = await tools.list_entities({});
    ptcEntityFields = await tools.get_entity_fields({ entityApiKey: 'account' });
    return { logs: [], executionTimeMs: 1 };
  } };
  const beforePtcCommands = cliCommands.length;
  await ai.executeUnifiedTool('run_code', { code: 'fixture' }, [], environment, token, project);
  assert.equal(ptcEntityList.source, 'cli');
  assert.equal(ptcEntityFields.source, 'cli');
  assert.deepEqual(cliCommands.slice(beforePtcCommands).map((item) => item.args.slice(0, 2)),
    [['list', 'object'], ['describe', 'object']]);
  console.log('PASS PTC metadata helpers use the same CLI-first dispatcher');

  ai.neoMetadataCli = new NeoMetadataCliReader(async () => { throw new Error('CLI unavailable fixture-access-secret'); });
  ai.metadataService = {
    fetchEntityList: async () => [{ apiKey: 'account', label: '客户', isStandard: true }],
    fetchEntityFields: async () => [{ apiKey: 'accountName', label: '客户名称', itemType: 1, typeName: '文本', custom: false }],
  };
  const fallbackList = await ai.executeUnifiedTool('list_entities', {}, [], environment, token, project);
  assert.equal(fallbackList.data.source, 'connector-fallback');
  assert.match(fallbackList.data.fallbackReason, /CLI unavailable/);
  assert.doesNotMatch(fallbackList.data.fallbackReason, /fixture-access-secret/);
  const fallbackFields = await ai.executeUnifiedTool('get_entity_fields', { entityApiKey: 'account' }, [], environment, token, project);
  assert.equal(fallbackFields.data.source, 'connector-fallback');
  assert.doesNotMatch(fallbackFields.data.fallbackReason, /fixture-access-secret/);
  console.log('PASS invalid/unavailable CLI falls back once with source and redacted failure reason');

  for (const [mode, protocol] of [['ptc', 'openai'], ['standard', 'google-gemini']]) {
    fixtureConfig.providers[0].protocol = protocol;
    requests.length = 0;
    const protocolEvents = [];
    await ai.startChatStream({ requestId: `fixture-${mode}-${protocol}`, sessionId: 'fixture-session', messageId: 'fixture-msg',
      providerId: 'fixture', modelId: 'fixture', projectPath: project, enableTools: true,
      messages: [{ id: 'fixture-u', role: 'user', content: '获取nex', createdAt: Date.now() }], mode },
      (event) => protocolEvents.push(event));
    assert.equal(protocolEvents.some((event) => event.type === 'error'), false,
      JSON.stringify(protocolEvents.filter((event) => event.type === 'error')));
    assert.equal(requests.length, 1);
    assert.doesNotMatch(JSON.stringify(requests[0].tools), /list_nex_extensions|get_nex_extension_code/);
    if (mode === 'ptc') assert.equal(requests[0].tools[0].function.name, 'run_code');
    assert.equal(protocolEvents.filter((event) => event.type === 'tool_start' && event.toolCall.name === 'skill').length, 2);
  }
  console.log('PASS PTC and Gemini conversations also load skills and exclude legacy NEX tools');
  const { licenseService, requiresRoleLicense, requiresFlowLicense, decryptBuiltinSkillAsset, isProtectedBuiltinSkill } = subject;
  const nexInstruction = getProtectedSkillInstruction('neo-nex-dev');
  const approvalInstruction = getProtectedSkillInstruction('preset-approval-architect');
  assert(approvalInstruction.length > 100);
  const sealedAssets = JSON.parse(fs.readFileSync(path.join(root, 'electron/security/neoNexCliSkills.json'), 'utf8'));
  for (const [name, payload] of Object.entries(sealedAssets)) {
    assert.match(payload, /^neo-skill:v1:/);
    assert.equal(decryptBuiltinSkillAsset(payload), getProtectedSkillInstruction(name));
    const bytes = Buffer.from(payload.slice('neo-skill:v1:'.length), 'base64');
    bytes[bytes.length - 1] ^= 1;
    assert.throws(() => decryptBuiltinSkillAsset('neo-skill:v1:' + bytes.toString('base64')));
  }
  assert.throws(() => decryptBuiltinSkillAsset('plain text'));
  assert.throws(() => decryptBuiltinSkillAsset('neo-skill:v1:eA=='));
  const harnessSource = fs.readFileSync(path.join(root, 'electron/security/protectedHarness.ts'), 'utf8');
  const approvalPayload = harnessSource.match(/"preset-approval-architect": "([^"]+)"/)[1];
  assert.match(approvalPayload, /^neo-skill:v1:/);
  assert(decryptBuiltinSkillAsset(approvalPayload).length > 100);
  const registryPath = path.join(root, 'electron/security/neoCliSkills.ts');
  if (fs.existsSync(registryPath)) {
    const registrySource = fs.readFileSync(registryPath, 'utf8');
    for (const name of ['neo-nex-dev', 'neo-approval-flow-designer']) {
      const payload = registrySource.match(new RegExp('get "' + name + '"\\(\\) \\{ return decryptBuiltinSkillAsset\\("([^"]+)"'))[1];
      assert.match(payload, /^neo-skill:v1:/);
      assert(decryptBuiltinSkillAsset(payload).length > 100);
    }
  }
  console.log('PASS built-in skill assets: authenticated encryption, intact decoding, tampering rejected');

  fixtureConfig.providers[0].protocol = 'openai';
  for (const state of [
    { isAuthorized: false, remainingDays: 0, message: 'device never activated' },
    { isAuthorized: false, remainingDays: 0, message: 'device license expired' },
  ]) {
    licenseService.setTestStatus(state);
    for (const presetId of ['nex-architect', 'approval-architect', 'autoflow-architect', 'neobi-architect']) {
      requests.length = 0;
      const roleEvents = [];
      await ai.startChatStream({ requestId: `role-${presetId}`, sessionId: 'fixture-session', messageId: 'fixture-msg',
        providerId: 'fixture', modelId: 'fixture', projectPath: project, enableTools: true,
        presetPrompt: `[PROTECTED_PRESET::${presetId}]`, mode: 'standard',
        messages: [{ id: 'fixture-u', role: 'user', content: '检查当前配置', createdAt: Date.now() }] },
        (event) => roleEvents.push(event));
      if (requiresRoleLicense(presetId)) {
        assert.equal(requests.length, 0, presetId);
        assert.equal(roleEvents.some((event) => event.type === 'error' && event.error.includes('上锁')), true, presetId);
      } else {
        assert.equal(requests.length, 1, presetId);
        assert.equal(roleEvents.some((event) => event.type === 'error'), false, JSON.stringify(roleEvents));
        const instruction = presetId === 'nex-architect' ? nexInstruction : approvalInstruction;
        assert(requests[0].messages[0].content.includes(instruction), presetId + ' model context');
        assert.equal(JSON.stringify(roleEvents).includes(instruction.slice(0, 80)), false, presetId + ' renderer trace');
      }
    }
  }
  console.log('PASS no/expired license: NEX and approval run; automatic flows and BI stay locked');

  for (const [presetId, skill] of [['nex-architect', 'neo-nex-dev'], ['approval-architect', 'neo-approval-flow-designer']]) {
    assert.equal(requiresRoleLicense(presetId), false);
    for (const alias of [presetId, `preset-${presetId}`, skill, `skill-${skill}`]) {
      assert.equal(isProtectedBuiltinSkill(alias), true, alias);
      assert(getProtectedSkillInstruction(alias)?.length > 100, alias);
    }
    const item = { id: `skill-${skill}`, name: skill, category: 'builtin', enabled: true, description: 'fixture' };
    fixtureConfig.skills = [item];
    ai.saveSkill({ ...item, category: 'personal', systemInstruction: 'injected plaintext', enabled: true });
    assert.equal(item.systemInstruction, undefined);
    ai.deleteSkill(item.id);
    assert.equal(fixtureConfig.skills[0], item);
    assert.equal((await ai.exportSkillZip([item.id])).success, false);
  }
  fixtureConfig.skills = [];
  console.log('PASS unlocked skills retain built-in identity and resist editing, deletion and export');

  // Exercise real tool response loops; only the model receives the decrypted skill body.
  for (const protocol of ['openai', 'google-gemini']) {
    fixtureConfig.providers[0].protocol = protocol;
    requests.length = 0;
    const traced = [];
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      let data;
      if (requests.length === 1) {
        data = protocol === 'google-gemini'
          ? { candidates: [{ content: { parts: [{ functionCall: { name: 'skill', args: { name: 'neo-nex-dev' } } }] }, finishReason: 'STOP' }] }
          : { choices: [{ delta: { tool_calls: [{ index: 0, id: 'load-skill', type: 'function', function: { name: 'skill', arguments: '{"name":"neo-nex-dev"}' } }] }, finish_reason: 'tool_calls' }] };
      } else {
        data = protocol === 'google-gemini'
          ? { candidates: [{ content: { parts: [{ text: 'fixture response' }] }, finishReason: 'STOP' }] }
          : { choices: [{ delta: { content: 'fixture response' }, finish_reason: 'stop' }] };
      }
      return new Response(`data: ${JSON.stringify(data)}\n\n${protocol === 'openai' ? 'data: [DONE]\n\n' : ''}`,
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    };
    await ai.startChatStream({ requestId: `skill-${protocol}`, sessionId: 'fixture-session', messageId: 'fixture-msg',
      providerId: 'fixture', modelId: 'fixture', projectPath: project, enableTools: true,
      presetPrompt: '[PROTECTED_PRESET::nex-architect]', mode: 'standard',
      messages: [{ id: 'fixture-u', role: 'user', content: '核实扩展技能', createdAt: Date.now() }] },
      (event) => traced.push(event));
    assert.equal(traced.some((event) => event.type === 'error'), false, JSON.stringify(traced));
    assert.equal(requests.length, 2, protocol);
    const toolResult = protocol === 'google-gemini'
      ? requests[1].contents.flatMap((entry) => entry.parts).find((part) => part.functionResponse)?.functionResponse.response.result
      : JSON.parse(requests[1].messages.find((message) => message.role === 'tool').content);
    assert(toolResult.instruction?.length > 100, protocol + ' model tool instruction preserved');
    assert.equal(JSON.stringify(traced).includes(nexInstruction.slice(0, 80)), false, protocol + ' renderer leaked instruction');
    const toolTrace = traced.filter((event) => event.type === 'tool_update' && event.toolCall?.name === 'skill');
    assert(toolTrace.length > 0);
    assert(toolTrace.every((event) => event.toolCall.resultData.protectedBuiltin === true));
  }
  console.log('PASS OpenAI/Gemini skill tool calls: model keeps full instructions; renderer sees protected metadata');

  // Register the actual workflow IPC handlers in an isolated host; never contact CRM.
  const main = fs.readFileSync(path.join(root, 'electron/main.ts'), 'utf8');
  const ipcBlock = main.slice(main.indexOf('// ================= 自动流程'), main.indexOf('// ================= 打印模板'));
  const ipcSource = (await transform(ipcBlock, { loader: 'ts', format: 'cjs' })).code;
  const handlers = new Map();
  const workflowCalls = [];
  const workflow = new Proxy({}, { get: (_target, method) => async (...args) => {
    workflowCalls.push({ method, args }); return { success: true, data: [] };
  } });
  new Function('ipcMain', 'licenseService', 'sessionStore', 'workflowService', 'requiresFlowLicense', ipcSource)(
    { handle: (name, fn) => handlers.set(name, fn) }, licenseService, store, workflow, requiresFlowLicense);
  const routes = [
    ['workflow:listTenantFlows', (pt) => [{ procType: pt }]],
    ['workflow:copyFlow', (pt) => [{ procdefId: 'fixture', procType: pt }]],
    ['workflow:deleteFlow', (pt) => ['fixture', pt]],
    ['workflow:getFlowDetail', (pt) => ['fixture', pt]],
    ['workflow:toggleStatus', (pt) => ['fixture', true, pt]],
    ['workflow:reviseVersion', (pt) => ['fixture', pt]],
  ];
  for (const [name, args] of routes) {
    const before = workflowCalls.length;
    await handlers.get(name)(null, ...args(2));
    assert.equal(workflowCalls.length, before + 1, name);
    await assert.rejects(() => handlers.get(name)(null, ...args(1)), /fixture device locked/, name);
    await assert.rejects(() => handlers.get(name)(null, ...args(undefined)), /fixture device locked/, name);
  }
  await handlers.get('workflow:deployApprovalPlan')(null, { name: 'fixture' });
  await assert.rejects(() => handlers.get('workflow:deployPlan')(null, {}), /fixture device locked/);
  await assert.rejects(() => handlers.get('workflow:listFlows')(null, {}), /fixture device locked/);
  await assert.rejects(() => handlers.get('workflow:triggerInstance')(null, {}), /fixture device locked/);
  const originalGetCurrentSession = store.getCurrentSession.bind(store);
  store.getCurrentSession = () => ({ isLoggedIn: false });
  await assert.rejects(() => handlers.get('workflow:deployApprovalPlan')(null, {}), /请先登录租户/);
  store.getCurrentSession = originalGetCurrentSession;

  ai.workflowService = {
    listTenantFlows: async () => ({ success: true, data: [] }),
    getFlowDetail: async () => ({ success: true, definition: { nodeInfo: {} } }),
  };
  for (const name of ['list_flows', 'get_flow_detail']) {
    await ai.executeUnifiedTool(name, { procType: 2, procdefId: 'fixture' }, [], environment, token, project);
    await assert.rejects(() => ai.executeUnifiedTool(name, { procType: 1, procdefId: 'fixture' }, [], environment, token, project), /fixture device locked/);
    await assert.rejects(() => ai.executeUnifiedTool(name, {}, [], environment, token, project), /fixture device locked/);
  }
  console.log('PASS approval IPC/tools: queries, deployment and lifecycle operations work without license; auto/mixed routes stay locked; CRM login still required');


  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('CLI logout was not observed')), 2000);
    store.onSharedSessionChanged((changed) => {
      if (!changed.isLoggedIn) { clearTimeout(timeout); resolve(); }
    });
    fs.unlinkSync(getNeoCliAuthLocation(project).file);
  });
  assert.equal(store.getCurrentSession().isLoggedIn, false);
  console.log('PASS explicit CLI logout still clears the shared session');

  await new Promise((resolve) => setTimeout(resolve, 150));
} finally {
  store?.neoCliAuthWatcher?.close();
  globalThis.fetch = originalFetch;
  if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
  if (previousUserProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = previousUserProfile;
  fs.rmSync(fixture, { recursive: true, force: true });
}
