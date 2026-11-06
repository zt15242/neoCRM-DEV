import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-account-history-'));
const storagePath = path.join(fixture, 'neocrm_sessions.json');
const orgId = '00D000000000001EAA';
const userId = '005000000000001AAA';
const username = 'fixture.user@example.test.sandbox';
const env = { id: 'sf-sandbox', name: 'Salesforce 测试沙盒', productType: 'salesforce',
  neoBaseURL: 'https://fixture--sandbox.example.test', tokenURL: 'https://example.test/token', cliAlias: 'fixture' };
const richInfo = { userId, username, name: `测试用户 (${username})`, tenant_id: orgId, tenantName: `测试组织 (${orgId})` };
const token = (info, access = 'fixture-access', org = orgId) => ({ access_token: access, refresh_token: 'fixture-refresh',
  expires_in: 7200, instance_uri: env.neoBaseURL, tenant_id: org, savedAt: 100, expiresAt: Date.now() + 7200000,
  userInfo: info });
const record = (id, info, access, lastLoginAt = 100) => ({ id, environmentId: env.id, environmentName: env.name,
  tenantId: orgId, tenantName: info.tenantName, userName: info.name, instanceUri: env.neoBaseURL,
  lastLoginAt, tokenData: token(info, access), environment: env });
const write = (history, activeId) => {
  const active = history.find(item => item.id === activeId);
  fs.writeFileSync(storagePath, JSON.stringify({ history, current: active ? { isLoggedIn: true, environment: env,
    tokenData: active.tokenData, activeAccountId: activeId } : { isLoggedIn: false } }));
};

try {
  const output = path.join(fixture, 'subject.cjs');
  await build({ stdin: { contents: `
    export { SessionStore } from './electron/services/sessionStore';
    export { AuthService } from './electron/services/authService';
    export { WorkspaceService } from './electron/services/workspaceService';
    export * from './electron/services/salesforceIdentity';
  `, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', outfile: output,
    external: ['esbuild'], logLevel: 'silent',
    define: { 'import.meta.url': JSON.stringify(pathToFileURL(path.join(root, 'package.json')).href) },
    plugins: [{ name: 'isolated-host', setup(builder) {
      for (const name of ['electron', 'node:os', 'node:child_process', 'axios', '@tailwindcss/postcss']) {
        builder.onResolve({ filter: new RegExp(`^${name}$`) }, () => ({ path: name, namespace: 'fixture' }));
      }
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: {
        electron: `export const app = { getPath: () => ${JSON.stringify(fixture)} };
          export const BrowserWindow = class {}, shell = {}, session = {}, dialog = {};`,
        'node:os': `export default { ...require('os'), homedir: () => ${JSON.stringify(fixture)} };`,
        'node:child_process': `export const execSync = (...args) => globalThis.__accountTestCli(...args);
          export const exec = () => { throw new Error('unexpected CLI sync'); };
          export const spawn = () => { throw new Error('unexpected interactive login'); };`,
        axios: `export default { get: (...args) => globalThis.__accountTestHttp.get(...args),
          post: (...args) => globalThis.__accountTestHttp.post(...args) };`,
        '@tailwindcss/postcss': `export default () => { throw new Error('unexpected CSS build'); };`,
      }[args.path] }));
    } }],
  });
  const { SessionStore, AuthService, WorkspaceService, isSameSalesforceAccount, salesforceUserInfoFromAuth } = createRequire(import.meta.url)(output);
  const store = new SessionStore();
  let cliSyncCount = 0;
  store.syncToSalesforceCli = async () => { cliSyncCount++; return { success: true }; };
  const auth = new AuthService();
  const legacyInfo = { userId: orgId, name: username, tenant_id: orgId, tenantName: `Salesforce 组织 (${orgId})` };

  // Reproduce the screenshot with the older CLI entry active, and the richer OAuth entry newer.
  write([record('oauth', { ...richInfo, username: undefined }, 'old-oauth', 200),
    record('cli', legacyInfo, 'active-cli', 100)], 'cli');
  let history = store.getAccountHistory();
  assert.equal(history.length, 1);
  assert.equal(history[0].id, 'cli');
  assert.equal(history[0].tokenData.access_token, 'active-cli');
  assert.equal(history[0].tokenData.userInfo.userId, userId);
  assert.equal(history[0].tenantName, richInfo.tenantName);
  assert.equal(history[0].userName, richInfo.name);
  assert.equal(store.getCurrentSession().tokenData.userInfo.username, username);
  assert.equal(store.resolveAccountId('oauth'), 'cli');
  const stableStorage = fs.readFileSync(storagePath, 'utf8');
  store.getAccountHistory();
  assert.equal(fs.readFileSync(storagePath, 'utf8'), stableStorage);
  console.log('PASS legacy duplicates merge automatically, retaining active credentials, rich names and old account IDs');

  const workspace = new WorkspaceService(store, { executeQueryAll: async (_env, credentials) => {
    assert.equal(credentials.access_token, 'active-cli');
    return { success: true, data: { records: [{ Id: 'fixture' }], totalSize: 1 } };
  } },
    { getAccounts: () => [] }, {});
  assert.equal(workspace.getDataSources().crmAccounts.length, 1);
  assert.equal(workspace.getAccountSession('oauth').tokenData.access_token, 'active-cli');
  workspace.validateWidgetConfig({ id: 'widget', type: 'crm-query', title: 'existing binding',
    accountId: 'oauth', query: 'SELECT Id FROM Account' });
  workspace.validateCustomWidgetQuery({ accountId: 'oauth', query: 'SELECT Id FROM Account' });
  assert.equal((await workspace.queryConnector('oauth', 'SELECT Id FROM Account')).data.records[0].Id, 'fixture');
  store.persistSalesforceRefreshToken(env, store.getCurrentSession().tokenData, 'rotated-refresh');
  assert.equal(store.getCurrentSession().tokenData.refresh_token, 'rotated-refresh');
  assert.equal(store.getAccountHistory()[0].tokenData.refresh_token, 'rotated-refresh');
  console.log('PASS existing workspace bindings resolve merged account IDs');

  // Same-org users remain separate, even with matching labels or an ambiguous legacy record.
  const otherInfo = { ...richInfo, userId: '005C60000054321AAA', username: 'other@example.test', name: 'Other' };
  write([record('one', richInfo, 'one'), record('two', otherInfo, 'two'),
    record('unknown', { ...legacyInfo, name: 'Salesforce 用户' }, 'unknown')], 'one');
  assert.equal(store.getAccountHistory().length, 3);
  assert.equal(isSameSalesforceAccount(token(richInfo), token({ ...otherInfo, username })), false);
  assert.equal(isSameSalesforceAccount(token(richInfo), token({ ...richInfo, userId: userId.slice(0, 15) }, 'x', orgId.slice(0, 15))), true);
  const shortOrg = record('short-org', { ...richInfo, userId: userId.slice(0, 15) }, 'short');
  shortOrg.tokenData.tenant_id = orgId.slice(0, 15);
  shortOrg.tokenData.instance_uri = 'https://another-host.example.test';
  write([record('one', richInfo, 'one'), shortOrg], 'one');
  assert.equal(store.getAccountHistory().length, 1);
  console.log('PASS distinct users stay separate; ID lengths and instance host changes do not duplicate an account');

  // Initial login / CLI import always retains a real user ID or an explicit username, never an org-as-user ID.
  const authDir = path.join(fixture, '.sfdx');
  fs.mkdirSync(authDir);
  fs.writeFileSync(path.join(authDir, 'alias.json'), JSON.stringify({ orgs: { fixture: username } }));
  const cliAuthFile = path.join(authDir, `${username}.json`);
  fs.writeFileSync(cliAuthFile, JSON.stringify({ orgId, userId, username, instanceUrl: env.neoBaseURL, accessToken: 'disk-token' }));
  assert.equal(auth.getSalesforceTokenFromCli(env).userInfo.userId, userId);
  fs.unlinkSync(cliAuthFile);
  globalThis.__accountTestCli = command => {
    if (command.includes('org display')) return JSON.stringify({ result: { id: orgId, username, instanceUrl: env.neoBaseURL } });
    if (command.includes('show-access-token')) return JSON.stringify({ result: { accessToken: 'new-cli-token' } });
    throw new Error('no refresh token fixture');
  };
  assert.equal(auth.getSalesforceTokenFromCli(env).userInfo.userId, undefined);
  assert.equal(auth.getSalesforceTokenFromCli(env).userInfo.username, username);
  assert.equal(salesforceUserInfoFromAuth({ id: `https://example.test/id/${orgId}/${userId}` }).userId, userId);

  write([record('stable', richInfo, 'current', 123)], 'stable');
  for (let index = 0; index < 5; index++) {
    const before = store.getCurrentSession();
    const refreshed = await auth.refreshSalesforceTokenViaCli(env, before.tokenData);
    assert.equal(refreshed.userInfo.userId, userId);
    assert.equal(refreshed.userInfo.name, richInfo.name);
    const saved = store.updateRefreshedSession(env, { ...refreshed, access_token: `renewed-${index}` }, before);
    assert.equal(saved.activeAccountId, 'stable');
    assert.equal(store.getAccountHistory().length, 1);
    assert.equal(store.getAccountHistory()[0].lastLoginAt, 123);
  }
  const relogged = store.saveSession(env, auth.getSalesforceTokenFromCli(env), { deferSalesforceCliSync: true });
  assert.equal(relogged.activeAccountId, 'stable');
  assert.equal(store.getAccountHistory().length, 1);
  console.log('PASS repeated CLI renewals/imports keep one account, a real user ID and the original login time');

  // OAuth polling still knows its user if userinfo temporarily fails.
  globalThis.__accountTestHttp = {
    post: async () => ({ data: { access_token: `${orgId}!oauth-renewed`, instance_url: env.neoBaseURL } }),
    get: async () => { throw new Error('userinfo temporarily unavailable'); },
  };
  let before = store.getCurrentSession();
  before.tokenData.cookieString = 'fixture-cookie';
  write([ { ...record('stable', richInfo, before.tokenData.access_token, 123), tokenData: before.tokenData } ], 'stable');
  before = store.getCurrentSession();
  const renewed = await auth.renewToken(env, before.tokenData);
  assert.equal(renewed.userInfo.userId, userId);
  const saved = store.updateRefreshedSession(env, renewed, before);
  assert.equal(saved.activeAccountId, 'stable');
  assert.equal(saved.tokenData.userInfo.userId, userId);
  assert.equal(saved.tokenData.cookieString, 'fixture-cookie');
  assert.equal(store.getAccountHistory().length, 1);
  assert.equal(store.updateRefreshedSession(env, renewed, before), null); // stale concurrent refresh
  globalThis.__accountTestHttp.post = async () => ({ data: { access_token: 'client-credentials-renewed',
    instance_url: env.neoBaseURL, id: `https://example.test/id/${orgId}/${userId}` } });
  const applicationToken = await auth.renewToken({ ...env, authMode: 'client_credentials',
    clientId: 'fixture-client', clientSecret: 'fixture-secret' }, saved.tokenData);
  assert.equal(applicationToken.userInfo.userId, userId);
  assert.equal(applicationToken.userInfo.name, richInfo.name);
  console.log('PASS Salesforce client-credentials polling uses Salesforce renewal and preserves identity');
  const pending = store.getCurrentSession();
  write([record('other-user', otherInfo, 'other')], 'other-user');
  assert.equal(store.updateRefreshedSession(env, renewed, pending), null);
  assert.equal(store.updateRefreshedSession(env, renewed), null);
  assert.equal(store.getCurrentSession().activeAccountId, 'other-user');
  store.clearSession();
  assert.equal(store.updateRefreshedSession(env, renewed, pending), null);
  assert.equal(store.getCurrentSession().isLoggedIn, false);
  assert.ok(cliSyncCount >= 6);
  console.log('PASS OAuth polling preserves identity/cookies; stale refreshes cannot undo an account switch or logout');
} finally {
  delete globalThis.__accountTestCli;
  delete globalThis.__accountTestHttp;
  fs.rmSync(fixture, { recursive: true, force: true });
}
