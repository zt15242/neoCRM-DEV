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
      export { browserBridge } from './electron/services/browserBridge';
      export { DshToolService } from './electron/services/dshToolService';
      export { NeoMetadataCliReader } from './electron/services/neoMetadataCli';
      export { NeoBusinessTypeService } from './electron/services/neoBusinessTypeService';
      export { NeoOpenApiService, resolveNeoOpenApiUrl } from './electron/services/neoOpenApiService';
      export { PrintTemplateService } from './electron/services/printTemplateService';
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
  const { SessionStore, AiService, NeoMetadataCliReader, NeoBusinessTypeService, NeoOpenApiService, PrintTemplateService, resolveNeoOpenApiUrl, ensureNeoCliProject, readNeoCliAuth, writeNeoCliAuth, getNeoCliAuthLocation,
    filterNeoCliTools, getNeoCliSessionInstruction, NEO_CLI_FIRST_ROUTING, CRM_HARNESS_TOOLS_SPEC, getProtectedSkillInstruction } = subject;
  const projectLink = path.join(fixture, '当前工作区');
  fs.mkdirSync(projectLink);
  const project = fs.realpathSync(projectLink);
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

  const duplicateHistory = [
    { id: 'old-connector-fixture', environmentId: 'old-connector', environmentName: '旧连接器',
      tenantId: token.tenant_id, tenantName: '示例租户', userName: '测试用户', instanceUri: token.instance_uri,
      lastLoginAt: Date.now() - 1000, tokenData: { ...token, access_token: 'stale-token' },
      environment: { ...environment, id: 'old-connector', name: '旧连接器' } },
    { id: session.activeAccountId, environmentId: environment.id, environmentName: environment.name,
      tenantId: token.tenant_id, tenantName: '示例租户', userName: '测试用户', instanceUri: token.instance_uri,
      lastLoginAt: Date.now(), tokenData: token, environment },
    { id: 'other-tenant', environmentId: environment.id, environmentName: environment.name,
      tenantId: 'other-tenant', userName: '测试用户', instanceUri: token.instance_uri,
      lastLoginAt: Date.now() - 2000, tokenData: { ...token, tenant_id: 'other-tenant' }, environment },
  ];
  fs.writeFileSync(sessionsPath, JSON.stringify({ current: session, history: duplicateHistory }));
  const normalizedHistory = store.getAccountHistory();
  assert.equal(normalizedHistory.length, 2);
  assert.equal(normalizedHistory.some((record) => record.id === session.activeAccountId), true);
  assert.equal(normalizedHistory.some((record) => record.tokenData.access_token === 'stale-token'), false);
  assert.equal(JSON.parse(fs.readFileSync(sessionsPath, 'utf8')).history.length, 2);
  console.log('PASS account history: merges duplicate connector records for the same tenant/user and preserves the active credentials');
  saveFixture(session);

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
  assert.match(getNeoCliSessionInstruction(failed), /当前销售易连接器状态：已登录/);
  assert.match(getNeoCliSessionInstruction(failed), /CLI 准备失败不代表连接器登录失效/);
  assert.match(getNeoCliSessionInstruction({ ...failed, session: { isLoggedIn: false } }), /当前销售易连接器状态：未登录/);
  assert.equal(getNeoCliSessionInstruction(failed).includes(token.access_token), false);
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
  assert.equal(tools.some((tool) => tool.function.name === 'execute_open_api'), true);
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
  for (const skillName of ['neo-cli-usage', 'neo-nex-dev', 'neo-approval-flow-designer', 'neo-entity-management',
    'neo-backend-dev', 'neo-frontend-dev', 'neo-layout-management', 'neo-entity-rule-management', 'neo-formula-dev',
    'neo-global-pick-management', 'neo-platform-capabilities', 'neo-solution-design', 'neo-task-summary', 'skill-schema-design']) {
    const instruction = getProtectedSkillInstruction(skillName);
    assert.match(instruction, /【桌面连接器执行约定】/, skillName);
    assert.doesNotMatch(instruction, /`neo loginstatus`|neo login -e|没有则 `neo init|不存在 → 先询问用户项目名称/, skillName);
  }

  const ai = new AiService(store, {}, {});
  const fixtureConfig = { providers: [{ id: 'fixture', name: 'Fixture', baseUrl: 'http://127.0.0.1:1', apiKey: 'fixture-key',
    protocol: 'openai', models: [{ id: 'fixture', tools: true, contextWindow: 128000, maxOutputTokens: 8192 }] }],
    settings: { enableCrmTools: true, injectTenantContext: false, maxTokens: 512, contextMessageLimit: 10 }, mcpServers: [], skills: [] };
  ai.getAiConfig = () => fixtureConfig;
  const pageCode = await ai.executeUnifiedTool('skill', { name: 'neo-page-code-management' }, [], undefined, undefined, project);
  assert.match(pageCode.data.instruction, /execute_open_api/);
  assert.match(pageCode.data.instruction, /回读/);
  const pageRef = await ai.executeUnifiedTool('skill', { name: 'skill-neo-page-code-management', resource: 'references/browser-workflow.md', offset: 1, limit: 5 }, [], undefined, undefined, project);
  assert.match(pageRef.data.content, /页面代码/);
  const apiRef = await ai.executeUnifiedTool('skill', { name: 'neo-page-code-management', resource: 'references/browser-workflow.md' }, [], undefined, undefined, project);
  assert.match(apiRef.data.content, /GET \/rest\/metadata\/v2\.0\/dx\/logic\/lapp\/download/);
  assert.match(apiRef.data.content, /multipart\/form-data/);
  assert.match(apiRef.data.content, /commitMsg/);
  assert.match(apiRef.data.content, /authMode/);
  await assert.rejects(() => ai.executeUnifiedTool('skill', { name: 'neo-page-code-management', resource: '../private' }, [], undefined, undefined, project), /未找到/);
  fixtureConfig.skills = [{ id: 'skill-neo-page-code-management', enabled: false }];
  await assert.rejects(() => ai.executeUnifiedTool('skill', { name: 'neo-page-code-management' }, [], undefined, undefined, project), /停用/);
  fixtureConfig.skills = [];
  console.log('PASS page code skill: built-in instruction, resource paging, disabled state and honest browser boundary');
  const diagram = await ai.executeUnifiedTool('skill', { name: 'diagram-design' }, [], undefined, undefined, project);
  assert.equal(diagram.data.name, 'diagram-design');
  assert.match(diagram.data.version, /^2\.6\./);
  assert.match(diagram.data.instruction, /NeoCRM AI 对话适配约定/);
  assert.match(diagram.data.instruction, /svg 代码块/);
  for (const resource of ['references/style-guide.md', 'references/type-architecture.md', 'references/import-drawio.md', 'scripts/drawio_extract.py', 'scripts/self_check.py', 'assets/template.html', 'LICENSE']) {
    assert(diagram.data.resources.some(item => item.resource === resource), resource);
  }
  const diagramPage = (await ai.executeUnifiedTool('skill', { name: 'skill-diagram-design', resource: 'references/style-guide.md', offset: 1, limit: 5 }, [], undefined, undefined, project)).data;
  assert.equal(diagramPage.content.split('\n').length, 5);
  assert.equal(diagramPage.nextOffset, 6);
  for (const args of [{ resource: '../LICENSE' }, { resource: '__proto__' }, { resource: 'references/style-guide.md', offset: 0 }, { resource: 'references/style-guide.md', limit: 401 }, { script: 'scripts/self_check.py' }]) {
    await assert.rejects(() => ai.executeUnifiedTool('skill', { name: 'diagram-design', ...args }, [], undefined, undefined, project));
  }
  fixtureConfig.skills = [{ id: 'skill-diagram-design', enabled: false }];
  await assert.rejects(() => ai.executeUnifiedTool('skill', { name: 'diagram-design' }, [], undefined, undefined, project), /停用/);
  fixtureConfig.skills = [];
  console.log('PASS Diagram Design: built-in package and paged resources work without a CRM session; invalid paths/ranges/scripts and disabled skill are rejected');
  assert.equal(resolveNeoOpenApiUrl('https://crm-sandbox.fixture.invalid',
    'https://api.xiaoshouyi.com/rest/metadata/v2.0/settings/globalPicks/dependencies/actions/dependentOptionsIncrement?controlApiKey=stage__c'),
  'https://crm-sandbox.fixture.invalid/rest/metadata/v2.0/settings/globalPicks/dependencies/actions/dependentOptionsIncrement?controlApiKey=stage__c');
  assert.equal(resolveNeoOpenApiUrl('https://crm-sandbox.fixture.invalid', '/rest/metadata/v2.0/xobjects/account'),
    'https://crm-sandbox.fixture.invalid/rest/metadata/v2.0/xobjects/account');
  for (const invalid of ['//attacker.invalid/path', 'javascript:alert(1)', 'https://user:pass@host.invalid/path', '/\\\\attacker.invalid/path']) {
    assert.throws(() => resolveNeoOpenApiUrl('https://crm-sandbox.fixture.invalid', invalid));
  }
  const apiCalls = [];
  ai.neoOpenApi = new NeoOpenApiService(async config => {
    apiCalls.push(config);
    return { status: 200, data: { code: '0', msg: '成功', echoed: `${token.access_token} ${token.cookieString}` } };
  });
  const openApiInput = { method: 'PATCH', url: 'https://api.xiaoshouyi.com/rest/metadata/v2.0/settings/globalPicks/dependencies/actions/dependentOptionsIncrement',
    queryParams: { controlApiKey: 'stage__c', dependentApiKey: 'phase__c' }, body: { useLabel: true } };
  await assert.rejects(() => ai.executeUnifiedTool('execute_open_api', openApiInput, [], environment, token, project), /明确确认.*confirm=true/);
  const openApiResult = await ai.executeUnifiedTool('execute_open_api', { ...openApiInput, confirm: true }, [], environment, token, project);
  assert.equal(openApiResult.data.success, true);
  assert.equal(apiCalls.at(-1).url, `${new URL(token.instance_uri).origin}/rest/metadata/v2.0/settings/globalPicks/dependencies/actions/dependentOptionsIncrement`);
  assert.equal(apiCalls.at(-1).headers.Authorization, `Bearer ${token.access_token}`);
  assert.equal(apiCalls.at(-1).headers.Cookie, undefined);
  assert.equal(apiCalls.at(-1).params.dependentApiKey, 'phase__c');
  assert.deepEqual(apiCalls.at(-1).data, { useLabel: true });
  assert.equal(apiCalls.at(-1).maxRedirects, 0);
  assert.equal(JSON.stringify(openApiResult.data).includes(token.access_token), false);
  assert.equal((await ai.executeUnifiedTool('execute_open_api', { method: 'GET', url: '/rest/auc/v2.0/userInfo' }, [], environment, token, project)).data.status, 200);
  await ai.executeUnifiedTool('execute_open_api', { method: 'DELETE', url: '/rest/metadata/v2.0/xobjects/account/dependencies', body: { controlApiKey: 'stage__c' }, confirm: true }, [], environment, token, project);
  assert.deepEqual(apiCalls.at(-1).data, { controlApiKey: 'stage__c' });
  await ai.executeUnifiedTool('execute_open_api', { method: 'POST', url: '/admin/translation_v3/fileUpload.action', body: {}, confirm: true }, [], environment, token, project);
  assert.equal(apiCalls.at(-1).headers.Cookie, token.cookieString);
  assert.equal(apiCalls.at(-1).headers.Authorization, undefined);
  assert.equal(JSON.stringify(apiCalls.at(-1).headers).includes(token.cookieString), true);
  assert.equal(JSON.stringify((await ai.executeUnifiedTool('execute_open_api',
    { method: 'GET', url: '/admin/template-manage/object.action' }, [], environment, token, project)).data).includes(token.cookieString), false);
  await assert.rejects(() => ai.executeUnifiedTool('execute_open_api',
    { method: 'POST', url: '/admin/translation_v3/fileUpload.action', body: {}, confirm: true }, [], environment,
    { ...token, cookieString: '', cookies: [] }, project), /需要销售易后台会话 Cookie/);
  const pageZip = path.join(project, 'page.zip');
  fs.writeFileSync(pageZip, Buffer.from('zip-fixture-content'));
  const multipart = { method:'POST', url:'/rest/metadata/v2.0/dx/logic/lapp/upload/123', authMode:'cookie', bodyEncoding:'multipart', body:{commitMsg:'fixture'}, file:{fieldName:'file', filePath:pageZip, contentType:'application/zip'} };
  const beforeMultipart = apiCalls.length;
  await assert.rejects(() => ai.executeUnifiedTool('execute_open_api', multipart, [], environment, token, project), /明确确认/);
  assert.equal(apiCalls.length, beforeMultipart);
  await ai.executeUnifiedTool('execute_open_api', {...multipart, confirm:true}, [], environment, token, project);
  const multiCall = apiCalls.at(-1);
  assert.equal(multiCall.headers.Cookie, token.cookieString);
  assert.equal(multiCall.headers.Authorization, undefined);
  assert.match(multiCall.headers['content-type'], /^multipart\/form-data; boundary=/);
  const wire = multiCall.data.getBuffer().toString();
  assert.match(wire, /name="commitMsg"\r\n\r\nfixture/);
  assert.match(wire, /name="file"; filename="page.zip"/);
  assert.match(wire, /Content-Type: application\/zip/);
  assert.match(wire, /zip-fixture-content/);
  await ai.executeUnifiedTool('execute_open_api', {method:'GET',url:'/rest/metadata/v2.0/dx/logic/lapp/',authMode:'cookie'}, [], environment, token, project);
  assert.equal(apiCalls.at(-1).headers.Cookie, token.cookieString);
  const externalZip = path.join(fixture,'external.zip'); fs.writeFileSync(externalZip, 'external-fixture');
  const outsideUpload = {...multipart, confirm:true, file:{...multipart.file, filePath:externalZip}};
  await assert.rejects(() => ai.executeUnifiedTool('execute_open_api', outsideUpload, [], environment, token, project), /沙箱|越界/);
  await ai.executeUnifiedTool('execute_open_api', outsideUpload, [], environment, token, project, undefined, [externalZip]);
  assert.match(apiCalls.at(-1).data.getBuffer().toString(), /external-fixture/);
  const symlinkZip = path.join(project, 'escape.zip'); fs.symlinkSync(externalZip, symlinkZip);
  await assert.rejects(() => ai.executeUnifiedTool('execute_open_api', {...multipart, confirm:true, file:{...multipart.file,filePath:symlinkZip}}, [], environment, token, project), /沙箱|越界|软链接/);
  const hugeZip = path.join(project, 'large.zip'); fs.closeSync(fs.openSync(hugeZip, 'w')); fs.truncateSync(hugeZip, 50*1024*1024+1);
  await assert.rejects(() => ai.executeUnifiedTool('execute_open_api', {...multipart, confirm:true, file:{...multipart.file,filePath:hugeZip}}, [], environment, token, project), /50 MB/);
  await assert.rejects(() => ai.executeUnifiedTool('execute_open_api', {...multipart, confirm:true}, [], environment, {...token,cookieString:'',cookies:[]}, project), /Cookie/);
  console.log('PASS Open API explicit cookie and multipart: confirmation, exact wire fields, attachment boundaries, symlinks and size cap');
  console.log('PASS Open API auth routing: /rest uses OAuth Bearer Token; /admin uses the connector web-session Cookie');

  const templateFile = path.join(project, 'sample-template.docx');
  fs.writeFileSync(templateFile, Buffer.from('fixture docx bytes'));
  let uploadRequest;
  ai.printTemplateService = new PrintTemplateService({}, async (url, form, config) => {
    uploadRequest = { url, form, config };
    return { data: { status: 0, data: { fileName: 'sample-template.docx', fileUrl: '/uploaded/sample-template.docx' } } };
  });
  await assert.rejects(() => ai.executeUnifiedTool('upload_print_template_file',
    { file_path: templateFile, confirm: false }, [], environment, token, project), /取得明确确认/);
  const uploaded = await ai.executeUnifiedTool('upload_print_template_file',
    { file_path: templateFile, confirm: true }, [], environment, token, project);
  assert.equal(uploadRequest.url, `${environment.neoBaseURL}/admin/translation_v3/fileUpload.action`);
  assert.match(uploadRequest.config.headers['content-type'], /^multipart\/form-data; boundary=/);
  assert.equal(uploadRequest.config.headers.Cookie, token.cookieString);
  assert.equal(uploadRequest.config.headers.Authorization, undefined);
  assert.match(uploadRequest.form._streams.join(' '), /name="uploadFile"/);
  assert.match(uploadRequest.form._streams.join(' '), /name="fileName"/);
  assert.match(uploadRequest.form._streams.join(' '), /name="encoding"/);
  assert.equal(uploaded.data.fileUrl, '/uploaded/sample-template.docx');
  console.log('PASS print template upload: requires confirmation, sends multipart with Cookie only, and returns verified file URL');

  let listReadCount = 0;
  let saveDefinition;
  const createdTemplate = { id: 'template-123', name: 'OTS运货单', systemId: 42,
    fileName: 'sample-template.docx', fileUrl: '/uploaded/sample-template.docx',
    outputType: 1, status: 0, statusName: '禁用' };
  const completePrintService = new PrintTemplateService({}, async () => ({ data: {} }), async (url, body, config) => {
    saveDefinition = { url, body, config };
    return { data: { status: 0, msg: '成功' } };
  });
  completePrintService.listPrintObjects = async () => ({ success: true, data: [
    { objectId: 42, apiKey: 'waybill__c__c', label: 'OTS物流运货单', allNum: 0, enableNum: 0 },
  ] });
  completePrintService.listTemplatesByObject = async () => {
    listReadCount++;
    return { success: true, total: listReadCount === 1 ? 0 : 1, data: listReadCount === 1 ? [] : [createdTemplate] };
  };
  completePrintService.uploadTemplateFile = async () => ({ success: true, data: {
    fileName: 'sample-template.docx', fileUrl: '/uploaded/sample-template.docx',
  } });
  ai.printTemplateService = completePrintService;
  await assert.rejects(() => ai.executeUnifiedTool('create_print_template', {
    file_path: templateFile, entityApiKey: 'waybill__c__c', name: 'OTS运货单', outputType: 1, confirm: false,
  }, [], environment, token, project), /展示并确认/);
  const created = await ai.executeUnifiedTool('create_print_template', {
    file_path: templateFile, entityApiKey: 'waybill__c__c', name: 'OTS运货单', outputType: 1, confirm: true,
  }, [], environment, token, project);
  assert.equal(created.data.templatePrintId, 'template-123');
  assert.equal(listReadCount, 2);
  assert.equal(saveDefinition.url, `${environment.neoBaseURL}/admin/template-manage/save-template-print.action`);
  assert.equal(saveDefinition.config.headers.Cookie, token.cookieString);
  assert.equal(saveDefinition.config.headers.Authorization, undefined);
  const savedPayload = JSON.parse(new URLSearchParams(saveDefinition.body).get('templateParam'));
  assert.deepEqual({ systemId: savedPayload.systemId, name: savedPayload.name, fileName: savedPayload.fileName,
    fileUrl: savedPayload.fileUrl, outputType: savedPayload.outputType, status: savedPayload.status }, {
    systemId: 42, name: 'OTS运货单', fileName: 'sample-template.docx', fileUrl: '/uploaded/sample-template.docx', outputType: 1, status: 0,
  });
  console.log('PASS print template lifecycle: confirmation gate, duplicate preflight, upload, definition save, and persisted readback');

  let fallbackReadCount = 0;
  const metadataFallbackService = new PrintTemplateService({ fetchEntityList: async () => [
    { objectId: 42, apiKey: 'waybill__c__c', label: 'OTS物流运货单' },
  ] }, async () => ({ data: {} }), async () => ({ data: { status: 0, msg: '成功' } }));
  metadataFallbackService.listPrintObjects = async () => ({ success: true, data: [] });
  metadataFallbackService.listTemplatesByObject = async () => {
    fallbackReadCount++;
    return { success: true, total: fallbackReadCount === 1 ? 0 : 1,
      data: fallbackReadCount === 1 ? [] : [createdTemplate] };
  };
  metadataFallbackService.uploadTemplateFile = completePrintService.uploadTemplateFile;
  const fallbackCreated = await metadataFallbackService.createPrintTemplate(environment, token, {
    filePath: templateFile, entityApiKey: 'waybill__c__c', objectId: 42, name: 'OTS运货单', outputType: 1,
  });
  assert.equal(fallbackCreated.success, true);
  assert.equal(fallbackCreated.data.objectId, 42);
  console.log('PASS print template object resolution: falls back to exact tenant metadata when the object is absent from configured print objects');

  const canceledPrintService = new PrintTemplateService({}, async () => ({ data: {} }), async (_url, _body, config) => {
    config.signal?.throwIfAborted();
    return { data: { status: 0, msg: '成功' } };
  });
  canceledPrintService.listPrintObjects = completePrintService.listPrintObjects;
  canceledPrintService.listTemplatesByObject = async () => ({ success: true, total: 0, data: [] });
  canceledPrintService.uploadTemplateFile = completePrintService.uploadTemplateFile;
  const cancelController = new AbortController();
  canceledPrintService.definitionRequest = async () => {
    cancelController.abort();
    throw Object.assign(new Error('canceled'), { name: 'AbortError' });
  };
  const canceledCreate = await canceledPrintService.createPrintTemplate(environment, token, {
    filePath: templateFile, entityApiKey: 'waybill__c__c', name: 'OTS运货单', outputType: 1,
  }, cancelController.signal);
  assert.equal(canceledCreate.success, false);
  assert.equal(canceledCreate.uploaded, true);
  assert.match(canceledCreate.error, /已上传.*状态未知/);
  console.log('PASS print template cancellation: preserves uploaded-file state and reports definition status as unknown');
  let ptcApiResult;
  ai.dshToolService = { executePtcCode: async (_args, sdk) => {
    ptcApiResult = await sdk.execute_open_api({ method: 'PATCH', ...openApiInput, confirm: true });
    return { logs: [], executionTimeMs: 1 };
  } };
  await ai.executeUnifiedTool('run_code', { code: 'await tools.execute_open_api(request)' }, [], environment, token, project);
  assert.equal(ptcApiResult.success, true);
  assert.equal(apiCalls.at(-1).url, `${new URL(token.instance_uri).origin}/rest/metadata/v2.0/settings/globalPicks/dependencies/actions/dependentOptionsIncrement`);
  await assert.rejects(() => ai.executeUnifiedTool('execute_open_api', { ...openApiInput, confirm: true }, [],
    { ...environment, productType: 'salesforce' }, token, project), /仅支持销售易/);
  console.log('PASS Open API: replaces foreign host with connector instance, injects auth internally, redacts output, and gates writes');
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
  assert.equal(requests[0].tools.some((tool) => tool.function.name === 'execute_open_api'), true);
  assert.match(generalPrompt, /已加载技能 neo-cli-usage/);
  assert.match(generalPrompt, /销售易功能统一 CLI 优先路由/);
  assert.match(generalPrompt, /CLI 成功返回空数据是有效结果/);
  assert.match(generalPrompt, /这些操作直接使用现有连接器工具/);
  assert.match(generalPrompt, /Diagram Design 绘图技能/);
  assert.match(generalPrompt, /先调用 skill\(\{name:"diagram-design"\}\)/);
  assert.doesNotMatch(generalPrompt, /Forty-five visual types/);
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
    return { data: { code: config.method === 'GET' ? 0 : '0', msg: '成功', data: config.url.endsWith('/busiTypes') && config.method === 'GET'
      ? { records: businessRecords } : { totalSize: 1, count: 1, records: { apiKey: 'account', enableBusitype: true } } } };
  });
  const originalModelFetch = globalThis.fetch;
  const businessInput = { entityApiKey: 'account', apiKey: 'enterprise__c', label: '企业客户' };
  const originalPrepare = store.prepareNeoCliForConversation.bind(store);
  store.prepareNeoCliForConversation = () => ({ success: false, message: 'custom OAuth cannot share CLI', session: store.getCurrentSession() });
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
    // Both current messages omit the domain. A stale checkpoint must retain the task, not its auth conclusion.
    await ai.startChatStream({ requestId: `business-${mode}-${protocol}`, sessionId: 'fixture-session', messageId: 'business-msg',
      providerId: 'fixture', modelId: 'fixture', projectPath: project, enableTools: true, mode,
      compactionSummary: { originalMessageCount: 1, compactedAt: Date.now(),
        summary: '为客户创建企业客户业务类型；旧 .neo-cli/token.json 的 access_token 返回 401，要求用户提供有效 token 或去后台手工创建。' },
      messages: [{ id: 'business-u1', role: 'user', content: '之前的工作继续', createdAt: Date.now() },
        { id: 'business-u2', role: 'user', content: '继续处理', createdAt: Date.now() }] }, (event) => businessEvents.push(event));
    assert.equal(businessEvents.some((event) => event.type === 'error'), false, JSON.stringify(businessEvents));
    assert.equal(requests.length, 2, `${mode}/${protocol}`);
    const system = protocol === 'google-gemini' ? JSON.stringify(requests[0].systemInstruction) : requests[0].messages[0].content;
    assert.match(system, /已加载技能 neo-entity-management/);
    assert.match(system, /销售易业务类型创建与部署/);
    assert.match(system, /当前销售易连接器状态：已登录/);
    assert.match(system, /CLI 尚未就绪/);
    assert.match(system, /历史消息、压缩摘要.*不能证明当前连接器失效/);
    assert.match(system, /禁止要求用户提供 access token/);
    assert.match(system, /这是已内置的部署通道/);
    assert.doesNotMatch(system, /`neo loginstatus`|neo login -e/);
    assert.equal(system.includes(token.access_token), false);
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
  console.log('PASS business-type conversations: stale auth checkpoint + unavailable CLI retain valid connector and domain tools in standard/PTC OpenAI/Gemini; real preview without writing');

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

  const obsoleteAuthCalls = [
    ['bash', { command: 'cat .neo-cli/token.json' }],
    ['bash', { command: 'cat "$HOME/.neocrm-cli/auth/project.json"' }],
    ['bash', { command: 'node -e "require(\'fs\').readFileSync(\'.neo-cli/token.json\')"' }],
    ['bash', { command: 'neo loginstatus' }],
    ['bash', { command: '"/usr/local/bin/neo" login -e sandbox' }],
    ['bash', { command: 'neo.cmd logout' }],
    ['read', { path: '.neo-cli/token.json' }],
    ['read', { file_path: '.neo-cli/token.json' }],
    ['read_document', { path: 'C:\\Users\\fixture\\.neocrm-cli\\auth\\project.json' }],
    ['read_document', { file_path: '.neo-cli/token.json' }],
    ['write', { path: '.neocrm-cli/auth/project.json', content: '{}' }],
    ['write', { file_path: '.neocrm-cli/auth/project.json', content: '{}' }],
    ['edit', { path: '.neo-cli/token.json', old_string: 'old', new_string: 'new' }],
    ['edit', { file_path: '.neo-cli/token.json', old_string: 'old', new_string: 'new' }],
    ['str_replace_editor', { path: '.neo-cli/token.json', command: 'view' }],
    ['glob', { pattern: '.neocrm-cli/auth/*.json' }],
    ['grep', { path: '.neocrm-cli/auth', pattern: 'access' }],
  ];
  let shellInvocations = 0;
  let fileInvocations = 0;
  ai.dshToolService = {
    executeBash: async () => { shellInvocations++; return { stdout: 'neo 1.0.8', stderr: '', exitCode: 0 }; },
    readFile: async () => { fileInvocations++; return { path: path.join(project, 'neo-project.json'), content: '{}' }; },
    executePtcCode: async (_args, sdk) => {
      for (const [name, args] of obsoleteAuthCalls) await assert.rejects(() => sdk[name](args), /宿主连接器管理|复用当前连接器登录态/);
      const info = await sdk.get_tenant_info({});
      assert.equal(info.isLoggedIn, true);
      assert.equal(info.authSource, 'connector');
      return { logs: [], executionTimeMs: 1 };
    },
  };
  for (const [name, args] of obsoleteAuthCalls) {
    await assert.rejects(() => ai.executeUnifiedTool(name, args, [], environment, token, project), /宿主连接器管理|复用当前连接器登录态/);
  }
  await ai.executeUnifiedTool('run_code', { code: 'fixture' }, [], environment, token, project);
  assert.equal(shellInvocations, 0);
  assert.equal(fileInvocations, 0);
  const connectorInfo = await ai.executeUnifiedTool('get_tenant_info', {}, [], environment, token, project);
  assert.equal(connectorInfo.data.isLoggedIn, true);
  assert.equal(connectorInfo.data.authSource, 'connector');
  for (const secret of [token.access_token, token.refresh_token]) assert.equal(JSON.stringify(connectorInfo).includes(secret), false);
  await ai.executeUnifiedTool('bash', { command: 'neo list object --help' }, [], environment, token, project);
  await ai.executeUnifiedTool('read', { path: 'neo-project.json' }, [], environment, token, project);
  await ai.executeUnifiedTool('bash', { command: 'sf org display' }, [], { ...environment, productType: 'salesforce' }, token, project);
  assert.equal(shellInvocations, 2);
  assert.equal(fileInvocations, 1);
  const loadedEntitySkill = await ai.executeUnifiedTool('skill', { name: 'skill-schema-design' }, [], environment, token, project);
  assert.match(loadedEntitySkill.data.instruction, /【桌面连接器执行约定】/);
  assert.doesNotMatch(loadedEntitySkill.data.instruction, /`neo loginstatus`|neo login -e/);
  console.log('PASS native/PTC tools reject legacy credentials and login commands before execution; connector status is token-free; normal project/CLI and other platforms still work');

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

  const persistedAi = new AiService(store, {}, {});
  for (const [presetId, skill] of [['nex-architect', 'neo-nex-dev'], ['approval-architect', 'neo-approval-flow-designer']]) {
    assert.equal(requiresRoleLicense(presetId), false);
    for (const alias of [presetId, `preset-${presetId}`, skill, `skill-${skill}`]) {
      assert.equal(isProtectedBuiltinSkill(alias), true, alias);
      assert(getProtectedSkillInstruction(alias)?.length > 100, alias);
    }
    const item = { id: `skill-${skill}`, name: skill, category: 'builtin', enabled: true, description: 'fixture' };
    await persistedAi.saveSkill({ ...item, category: 'personal', systemInstruction: 'injected plaintext', enabled: true });
    await persistedAi.deleteSkill(item.id);
    const protectedSkill = (await persistedAi.getAiConfigAsync()).skills.find(skill => skill.id === item.id);
    assert.equal(protectedSkill.category, 'builtin');
    assert.equal(protectedSkill.systemInstruction, undefined);
    assert.equal((await persistedAi.exportSkillZip([item.id])).success, false);
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

  // Screenshots must reach each model protocol without entering tool events or text receipts.
  const savedBrowserStatus = subject.browserBridge.status;
  const savedBrowserExecute = subject.browserBridge.execute;
  subject.browserBridge.status = () => ({ listening: true, connected: true, port: 1 });
  subject.browserBridge.execute = async () => ({ mimeType: 'image/jpeg', imageData: '/9j/AA==' });
  for (const protocol of ['openai', 'google-gemini']) {
    fixtureConfig.providers[0].protocol = protocol;
    requests.length = 0;
    const traced = [];
    globalThis.fetch = async (_url, options) => {
      requests.push(JSON.parse(options.body));
      const data = requests.length === 1
        ? protocol === 'google-gemini'
          ? { candidates: [{ content: { parts: [{ functionCall: { name: 'browser_control', args: { action: 'screenshot', tabId: 1 } } }] }, finishReason: 'STOP' }] }
          : { choices: [{ delta: { tool_calls: [{ index: 0, id: 'browser-shot', type: 'function', function: { name: 'browser_control', arguments: '{"action":"screenshot","tabId":1}' } }] }, finish_reason: 'tool_calls' }] }
        : protocol === 'google-gemini'
          ? { candidates: [{ content: { parts: [{ text: '看到了截图' }] }, finishReason: 'STOP' }] }
          : { choices: [{ delta: { content: '看到了截图' }, finish_reason: 'stop' }] };
      return new Response(`data: ${JSON.stringify(data)}\n\n${protocol === 'openai' ? 'data: [DONE]\n\n' : ''}`, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    };
    await ai.startChatStream({ requestId: `browser-${protocol}`, sessionId: 'fixture-session', messageId: 'fixture-msg', providerId: 'fixture', modelId: 'fixture', projectPath: project, enableTools: true, mode: 'standard', messages: [{ id: 'fixture-u', role: 'user', content: '查看网页截图', createdAt: Date.now() }] }, event => traced.push(event));
    assert.equal(traced.some(event => event.type === 'error'), false, JSON.stringify(traced));
    assert.equal(requests.length, 2, protocol);
    assert.ok(JSON.stringify(requests[1]).includes('/9j/AA=='), `${protocol}: screenshot did not reach model`);
    assert.ok(!JSON.stringify(traced).includes('/9j/AA=='), `${protocol}: screenshot leaked into tool events`);
  }
  subject.browserBridge.status = savedBrowserStatus;
  subject.browserBridge.execute = savedBrowserExecute;
  console.log('PASS OpenAI/Gemini browser screenshots reach models without leaking into tool events');

  const originalBrowserStage = subject.browserBridge.stageUpload;
  const originalBrowserExecute = subject.browserBridge.execute;
  let uploadedBytes;
  subject.browserBridge.stageUpload = async bytes => { uploadedBytes = bytes.toString(); return '/fixture/staged'; };
  subject.browserBridge.execute = async () => ({ selected: true });
  const uploadAi = new AiService(store, {}, {});
  const allowedUpload = path.join(project, 'browser-upload.txt');
  fs.writeFileSync(allowedUpload, 'upload fixture');
  await uploadAi.executeUnifiedTool('browser_control', { action: 'upload', file_path: allowedUpload }, [], undefined, undefined, project);
  assert.equal(uploadedBytes, 'upload fixture');
  const browserOutsideFile = path.join(fixture, 'browser-outside-upload.txt');
  fs.writeFileSync(browserOutsideFile, 'outside');
  await assert.rejects(() => uploadAi.executeUnifiedTool('browser_control', { action: 'upload', file_path: browserOutsideFile }, [], undefined, undefined, project), /沙箱|越界/);
  await assert.rejects(() => uploadAi.executeUnifiedTool('browser_control', { action: 'upload', file_path: browserOutsideFile }, []), /选择项目/);
  await uploadAi.executeUnifiedTool('browser_control', { action: 'upload', file_path: browserOutsideFile }, [], undefined, undefined, undefined, undefined, [browserOutsideFile]);
  assert.equal(uploadedBytes, 'outside');
  const symlinkUpload = path.join(project, 'browser-upload-link.txt');
  fs.symlinkSync(browserOutsideFile, symlinkUpload);
  await assert.rejects(() => uploadAi.executeUnifiedTool('browser_control', { action: 'upload', file_path: symlinkUpload }, [], undefined, undefined, project), /沙箱|越界/);
  subject.browserBridge.stageUpload = originalBrowserStage;
  subject.browserBridge.execute = originalBrowserExecute;
  console.log('PASS browser upload confines project paths and permits explicitly attached files');

  fixtureConfig.skills = [
    {id:'skill-neo-frontend-dev',name:'Neo 前端开发',description:'fixture',category:'builtin',enabled:true},
    {id:'personal-check',name:'个人核查',description:'fixture',category:'personal',enabled:true,systemInstruction:'PERSONAL_SKILL_SENTINEL'},
    {id:'disabled-skill',name:'已停用',description:'fixture',category:'personal',enabled:false,systemInstruction:'MUST_NOT_LOAD'},
    {id:'skill-autoflow-architect',name:'受保护技能',description:'fixture',category:'builtin',enabled:true},
  ];
  for (const protocol of ['openai','google-gemini']) {
    fixtureConfig.providers[0].protocol=protocol;
    const bodies=[], traced=[];
    globalThis.fetch=async (_url,options)=>{bodies.push(JSON.parse(options.body));const data=protocol==='google-gemini'
      ? {candidates:[{content:{parts:[{text:'完成'}]},finishReason:'STOP'}]}
      : {choices:[{delta:{content:'完成'},finish_reason:'stop'}]};
      return new Response('data: '+JSON.stringify(data)+'\n\n'+(protocol==='openai'?'data: [DONE]\n\n':''),{status:200,headers:{'Content-Type':'text/event-stream'}});
    };
    const base={requestId:'mention-'+protocol,sessionId:'fixture-session',messageId:'fixture-msg',providerId:'fixture',modelId:'fixture',projectPath:project,enableTools:true,mode:'standard'};
    await ai.startChatStream({...base,messages:[{id:'mention-u',role:'user',content:'协助实现组件',skillIds:['skill-neo-frontend-dev','personal-check'],createdAt:1}]},event=>traced.push(event));
    assert(!traced.some(event=>event.type==='error'),JSON.stringify(traced));
    const prompt=protocol==='google-gemini'?bodies[0].systemInstruction.parts.map(part=>part.text).join('\n'):bodies[0].messages[0].content;
    assert(prompt.includes(getProtectedSkillInstruction('skill-neo-frontend-dev')));
    assert(prompt.includes('PERSONAL_SKILL_SENTINEL'));
    assert(!JSON.stringify(traced).includes('PERSONAL_SKILL_SENTINEL'));
    assert(!JSON.stringify(traced).includes(getProtectedSkillInstruction('skill-neo-frontend-dev').slice(0,80)));
    bodies.length=0;
    await ai.startChatStream({...base,messages:[{id:'earlier',role:'user',content:'前文',skillIds:['personal-check'],createdAt:1},{id:'next',role:'user',content:'继续',createdAt:2}]},()=>{});
    assert(!JSON.stringify(bodies[0]).includes('PERSONAL_SKILL_SENTINEL'),'explicit skill must apply only to the latest message');
    for (const id of ['disabled-skill','skill-autoflow-architect']) {
      bodies.length=0; const rejected=[];
      await ai.startChatStream({...base,messages:[{id:'blocked',role:'user',content:'处理',skillIds:[id],createdAt:1}]},event=>rejected.push(event));
      assert.equal(bodies.length,0);assert(rejected.some(event=>event.type==='error'));
    }
  }
  fixtureConfig.skills=[];
  console.log('PASS explicit skill mentions: model-only instructions, latest message scope, disabled and protected skill checks');

  // Mock model SSE only; real file tools and final-answer validation run unchanged.
  ai.dshToolService = new subject.DshToolService();
  const diagramSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80"><title>回归图</title><rect width="200" height="80"/></svg>';
  const runDiagramConversation = async (protocol, turns, options = {}) => {
    fixtureConfig.providers[0].protocol = protocol;
    const bodies = [], traced = [];
    globalThis.fetch = async (_url, request) => {
      bodies.push(JSON.parse(request.body));
      assert(bodies.length <= turns.length, 'unexpected model retry');
      const turn = turns[bodies.length - 1];
      const data = protocol === 'google-gemini'
        ? { candidates: [{ content: { parts: turn.tool ? [{ functionCall: { name: 'write', args: turn.args } }] : [{ text: turn.text }] }, finishReason: 'STOP' }] }
        : { choices: [{ delta: turn.tool ? { tool_calls: [{ index: 0, id: 'diagram-write-' + bodies.length, type: 'function',
          function: { name: 'write', arguments: typeof turn.args === 'string' ? turn.args : JSON.stringify(turn.args) } }] } : { content: turn.text },
          finish_reason: turn.tool ? 'tool_calls' : 'stop' }] };
      return new Response('data: ' + JSON.stringify(data) + '\n\n' + (protocol === 'openai' ? 'data: [DONE]\n\n' : ''),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    };
    await ai.startChatStream({ requestId: 'diagram-' + protocol + '-' + (options.mode || 'standard'), sessionId: 'fixture-session', messageId: 'diagram-msg',
      providerId: 'fixture', modelId: 'fixture', projectPath: project, enableTools: options.enableTools !== false, mode: options.mode || 'standard',
      messages: [{ id: 'diagram-u', role: 'user', content: '请在当前项目生成 SVG 图并核对实际文件', createdAt: Date.now() }] }, event => traced.push(event));
    assert.equal(traced.some(event => event.type === 'error'), false, JSON.stringify(traced));
    assert.equal(traced.at(-1).type, 'done');
    return { bodies, traced, text: traced.filter(event => event.type === 'content_delta').map(event => event.delta).join('') };
  };
  for (const protocol of ['openai', 'google-gemini']) {
    const filename = 'delivery-' + protocol + '.svg', link = '[已生成图表](' + filename + ')';
    const repaired = await runDiagramConversation(protocol, [
      { tool: true, args: {} }, { text: link },
      { tool: true, args: { file_path: filename, content: diagramSvg } }, { text: link },
    ]);
    assert.equal(repaired.bodies.length, 4);
    assert.equal(fs.readFileSync(path.join(project, filename), 'utf8'), diagramSvg);
    assert.match(JSON.stringify(repaired.bodies[2]), /本轮图表交付校验未通过/);
    assert.match(JSON.stringify(repaired.bodies[2]), /file_path/);
    assert.match(repaired.text, /尚未完成交付/);
    assert.equal(repaired.traced.filter(event => event.type === 'tool_update' && event.toolCall.name === 'write' && event.toolCall.status === 'error').length, 1);
    assert.equal(repaired.traced.filter(event => event.type === 'tool_update' && event.toolCall.name === 'write' && event.toolCall.status === 'success').length, 1);

    const missing = '[图](unwritten-' + protocol + '.svg)';
    const bounded = await runDiagramConversation(protocol, [{ text: missing }, { text: missing }, { text: missing }]);
    assert.equal(bounded.bodies.length, 3);
    assert.match(bounded.text, /请要求助手补生成/);
    assert.equal(fs.existsSync(path.join(project, 'unwritten-' + protocol + '.svg')), false);
    for (const options of [{ mode: 'plan' }, { enableTools: false }, { mode: 'minimal' }]) {
      const readOnly = await runDiagramConversation(protocol, [{ text: missing }], options);
      assert.equal(readOnly.bodies.length, 1);
      assert.match(readOnly.text, /尚未完成交付/);
      assert.equal(readOnly.traced.some(event => event.type === 'tool_start' && event.toolCall.name === 'write'), false);
    }
  }
  for (const args of ['{"file_path":"truncated.svg","content":', 'null', '[]']) {
    const result = await runDiagramConversation('openai', [{ tool: true, args }, { text: '写入参数无效，文件未生成。' }]);
    const receipt = result.traced.find(event => event.type === 'tool_update' && event.toolCall.name === 'write');
    assert.equal(receipt.toolCall.status, 'error');
    assert.match(receipt.toolCall.resultSummary, /JSON 不完整或无效.*尚未执行工具/);
  }
  assert.equal(fs.existsSync(path.join(project, 'truncated.svg')), false);
  const synthesis = await runDiagramConversation('openai', [
    { tool: true, args: {} }, { tool: true, args: {} }, { tool: true, args: {} }, { text: '[图](synthesis-missing.svg)' },
  ]);
  assert.equal(synthesis.bodies.length, 4);
  assert.match(JSON.stringify(synthesis.bodies[3].messages), /file_path/);
  assert.match(synthesis.text, /尚未完成交付/);
  fixtureConfig.providers[0].protocol = 'openai';
  globalThis.fetch = originalModelFetch;
  console.log('PASS diagram delivery: OpenAI/Gemini repair real files, bounded retries, read-only modes, invalid JSON rejection and failed-write synthesis receipts');

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
