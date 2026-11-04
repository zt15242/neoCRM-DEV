import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-business-type-'));
try {
  const bundle = path.join(fixture, 'service.cjs');
  await build({ entryPoints: [path.join(root, 'electron/services/neoBusinessTypeService.ts')], bundle: true,
    platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'silent' });
  const { NeoBusinessTypeService } = createRequire(import.meta.url)(bundle);
  const env = { productType: 'neocrm', neoBaseURL: 'https://fixture.invalid' };
  const token = { access_token: 'access-secret', refresh_token: 'refresh-secret', cookieString: 'cookie-secret', tenant_id: 'tenant' };
  const calls = [];
  let records = [];
  let mode = 'normal';
  let enabled = true;
  let listReads = 0;
  const transport = async (config) => {
    calls.push(config);
    assert.equal(config.headers.Authorization, `Bearer ${token.access_token}`);
    assert.equal(config.maxRedirects, 0);
    const endpoint = new URL(config.url).pathname;
    const entity = endpoint.split('/')[5];
    const ok = (data) => ({ data: { code: 200, data } });
    if (config.method === 'GET' && !/busiTypes$/.test(endpoint)) return ok({ apiKey: entity, enableBusitype: enabled });
    if (config.method === 'GET') {
      listReads++;
      if (mode === 'denied') return { data: { code: 403, msg: 'denied' } };
      if (mode === 'malformed') return ok({});
      if (mode === 'partial') return ok({ records, totalSize: records.length + 1 });
      if (mode === 'readback-fails' && listReads > 1) throw new Error('readback failed access-secret refresh-secret cookie-secret');
      const visible = mode === 'missing-readback' && listReads > 1 ? [] : records;
      return ok({ records: structuredClone(visible), totalSize: visible.length });
    }
    if (mode === 'write-rejected') return { data: { code: 403, msg: 'no metadata permission' } };
    if (config.method === 'POST') records.push({ ...config.data, apiKey: `${config.data.apiKey}__c` });
    else {
      const record = records.find((item) => item.apiKey === endpoint.split('/').at(-1));
      assert(record);
      Object.assign(record, config.data);
    }
    if (mode === 'applied-timeout') throw new Error('write timeout');
    return ok({});
  };
  const service = new NeoBusinessTypeService(transport);
  const input = { entityApiKey: 'account', apiKey: 'enterprise__c', label: '企业客户', description: '企业', active: true };
  const reset = () => { calls.length = 0; listReads = 0; records = []; mode = 'normal'; enabled = true; };
  const write = (extra = {}) => service.deploy(env, token, { ...input, dryRun: false, confirm: true, ...extra });
  const writes = () => calls.filter((call) => call.method !== 'GET');

  for (const body of [[], { records: [] }, { busiTypes: [] }, { code: '200', data: [] }]) {
    const reader = new NeoBusinessTypeService(async () => ({ data: body }));
    assert.equal((await reader.list(env, token, 'account')).totalCount, 0);
  }
  const nullable = new NeoBusinessTypeService(async () => ({ data: { code: 200,
    data: [{ apiKey: 'defaultBusiType', label: '默认', description: null, active: null }] } }));
  assert.equal((await nullable.list(env, token, 'account')).businessTypes[0].apiKey, 'defaultBusiType');
  console.log('PASS list decoding: valid empty/bare/enveloped platform responses and optional null metadata are accepted');

  const plan = await service.deploy(env, token, input);
  assert.equal(plan.dryRun, true);
  assert.equal(plan.operation, 'create');
  assert.equal(plan.tenantId, token.tenant_id);
  assert.equal(plan.expected.apiKey, 'enterprise__c');
  assert.equal(writes().length, 0);
  await assert.rejects(() => service.deploy(env, token, { ...input, dryRun: false }), /用户确认/);
  assert.equal(writes().length, 0);
  const created = await write();
  assert.equal(created.success, true);
  assert.equal(created.verified, true);
  assert.equal(created.source, 'connector-fallback');
  assert.equal(writes().length, 1);
  assert.equal(writes()[0].method, 'POST');
  assert.equal(writes()[0].data.apiKey, 'enterprise');
  assert.equal(created.businessType.apiKey, 'enterprise__c');
  const unchanged = await write();
  assert.equal(unchanged.operation, 'unchanged');
  assert.equal(writes().length, 1);
  console.log('PASS standard-object business type: read-only preview, confirmation required, create verified, repeat causes no duplicate');

  const updated = await write({ label: '企业客户新版', description: undefined, active: undefined });
  assert.equal(updated.operation, 'update');
  assert.equal(updated.businessType.description, '企业');
  assert.equal(updated.businessType.active, true);
  assert.equal(writes().at(-1).method, 'PATCH');
  assert.equal(writes().at(-1).url, 'https://fixture.invalid/rest/metadata/v3.1/xobjects/account/busitypes/enterprise__c');
  assert.equal('description' in writes().at(-1).data, false);
  const disabled = await write({ active: false });
  assert.equal(disabled.businessType.active, false);
  console.log('PASS existing business type: PATCH changes label/state and preserves unspecified properties');

  reset();
  const project = path.join(fixture, 'project'); fs.mkdirSync(project);
  const source = path.join(project, 'enterprise.business-type.json');
  fs.writeFileSync(source, JSON.stringify({ apiKey: 'enterprise__c', label: '源文件业务类型' }));
  const sourceResult = await service.deploy(env, token, { entityApiKey: 'project__c', sourceFile: path.basename(source), dryRun: false, confirm: true }, project);
  assert.equal(sourceResult.businessType.label, '源文件业务类型');
  assert.equal(writes()[0].url, 'https://fixture.invalid/rest/metadata/v3.1/xobjects/project__c/busiTypes');
  await assert.rejects(() => service.deploy(env, token, { entityApiKey: 'account', sourceFile: source, label: 'mixed' }, project), /不能同时提供/);
  const outside = path.join(fixture, 'outside.json'); fs.writeFileSync(outside, fs.readFileSync(source));
  await assert.rejects(() => service.deploy(env, token, { entityApiKey: 'account', sourceFile: '../outside.json' }, project), /超出当前项目/);
  fs.symlinkSync(outside, path.join(project, 'linked.json'));
  await assert.rejects(() => service.deploy(env, token, { entityApiKey: 'account', sourceFile: 'linked.json' }, project), /超出当前项目/);
  console.log('PASS source-file deployment: custom object, no source overwrite, path traversal/symlink escape and mixed inputs blocked');

  for (const failure of ['denied', 'malformed', 'partial']) {
    reset(); mode = failure;
    await assert.rejects(() => write());
    assert.equal(writes().length, 0);
  }
  reset(); enabled = false;
  await assert.rejects(() => write(), /未启用业务类型/);
  assert.equal(writes().length, 0);
  reset(); records = [{ apiKey: 'enterprise__c', label: 'A' }, { apiKey: 'enterprise__c', label: 'B' }];
  await assert.rejects(() => write(), /重复 API Key/);
  assert.equal(writes().length, 0);
  reset();
  await assert.rejects(() => write({ entityApiKey: '../account' }), /API Key 无效/);
  await assert.rejects(() => write({ active: 'false' }), /必须是布尔值/);
  await assert.rejects(() => service.list({ ...env, productType: 'salesforce' }, token, 'account'), /仅支持销售易/);
  assert.equal(calls.length, 0);
  console.log('PASS preflight: permission/malformed/partial/duplicate responses, disabled object, invalid keys/state and wrong connector never write');

  for (const failure of ['readback-fails', 'missing-readback']) {
    reset(); mode = failure;
    const pending = await write();
    assert.equal(pending.success, false);
    assert.equal(pending.writeAccepted, true);
    assert.equal(pending.verified, false);
    assert.equal(pending.verificationPending, true);
    assert.doesNotMatch(JSON.stringify(pending), /access-secret|refresh-secret|cookie-secret/);
    assert.equal(writes().length, 1);
  }
  reset(); mode = 'write-rejected';
  await assert.rejects(() => write(), /写入未确认.*no metadata permission/);
  assert.equal(writes().length, 1);
  reset(); mode = 'applied-timeout';
  await assert.rejects(() => write(), /写入未确认.*先调用 list_business_types/);
  assert.equal(records.length, 1);
  assert.equal(writes().length, 1);
  mode = 'normal';
  assert.equal((await service.list(env, token, 'account')).businessTypes.length, 1);
  const afterTimeout = await write();
  assert.equal(afterTimeout.operation, 'unchanged');
  assert.equal(writes().length, 1);
  const controller = new AbortController(); controller.abort();
  reset();
  await assert.rejects(() => service.deploy(env, token, input, undefined, controller.signal), { name: 'AbortError' });
  assert.equal(calls.length, 0);
  console.log('PASS uncertain writes/readback: no false success, no automatic retry, secrets redacted, recovery via list, cancellation respected');
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
