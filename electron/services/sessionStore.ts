import { exec, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { app } from 'electron';
import { AccountRecord, CliSyncResult, NeoEnvironment, SalesforceCliSyncResult, SessionState, TokenData } from '../types';
import { getSalesforceCliCommand, getSalesforceCliEnvironment } from './salesforceCliRuntime';
import { resolveSalesforceAlias } from './salesforceService';
import { deleteNeoCliAuth, ensureNeoCliProject, getNeoCliAuthLocation, readNeoCliAuth, syncSessionToNeoCli, toDesktopSession, NeoCliAuth } from './neocrmCliSession';

export class SessionStore {
  private neoCliProjectRoot: string | null = null;
  private neoCliAuthWatcher: fs.FSWatcher | null = null;
  private sharedSessionListener: ((session: SessionState) => void) | null = null;

  private getCliProjectPath(): string {
    return path.join(app?.getPath ? app.getPath('userData') : process.cwd(), 'neocrm_cli_project.json');
  }

  public setNeoCliProjectRoot(rootPath: string): SessionState {
    const current = this.readStorage().current || { isLoggedIn: false };
    if (current.environment && (current.environment.productType || 'neocrm') !== 'neocrm') return current;
    const previousRoot = this.getNeoCliProjectRoot();
    const project = ensureNeoCliProject(rootPath, previousRoot === path.resolve(rootPath) ? current.cliProjectId : undefined);
    this.neoCliProjectRoot = project.root;
    this.persistCliProjectRoot(project.root);
    this.watchNeoCliAuth(project.root);

    const sharedAuth = readNeoCliAuth(project.root);
    if (sharedAuth && (!current.isLoggedIn || (this.isSameCliAccount(current, sharedAuth) &&
        sharedAuth.savedAt > (current.tokenData?.savedAt || 0)))) {
      const session = this.mergeCliSession(current, sharedAuth, project.projectId);
      this.persistCurrentSession(session);
      return session;
    }
    if (current.isLoggedIn && current.environment && current.tokenData) {
      this.syncCurrentSessionToCli(current, project.projectId);
    }
    return current;
  }

  public prepareNeoCliForConversation(rootPath?: string): CliSyncResult & { session: SessionState } {
    // Read the connector first: a missing CLI manifest/auth must not discard its existing session.
    const current = this.readStorage().current || { isLoggedIn: false };
    if (!rootPath || !current.environment || (current.environment.productType || 'neocrm') !== 'neocrm') {
      return { success: false, targetPath: rootPath || '', message: '当前对话没有绑定销售易工作区', session: current };
    }
    try {
      const session = this.setNeoCliProjectRoot(rootPath);
      const auth = readNeoCliAuth(rootPath);
      const success = !!(session.isLoggedIn && auth && this.isSameCliAccount(session, auth));
      return { success, targetPath: path.resolve(rootPath), session,
        message: success ? '项目清单和 CLI 登录态已就绪，复用当前连接器授权' : '项目清单已创建，当前连接器没有可共享的登录态' };
    } catch (error: any) {
      return { success: false, targetPath: rootPath, session: current, message: `CLI 项目准备失败: ${error.message}` };
    }
  }

  private isSameCliAccount(session: SessionState, auth: NeoCliAuth): boolean {
    const token = session.tokenData;
    return !!(token && String(token.tenant_id || '') === String(auth.tenantId || '') &&
      (token.instance_uri || session.environment?.neoBaseURL || '').replace(/\/$/, '') === auth.instanceUrl.replace(/\/$/, '') &&
      String(token.userInfo?.userId || '') === String(auth.userInfo?.id || ''));
  }

  private mergeCliSession(current: SessionState, auth: NeoCliAuth, projectId: string): SessionState {
    const shared = toDesktopSession(auth);
    return this.isSameCliAccount(current, auth) ? {
      ...current,
      tokenData: { ...current.tokenData, ...shared.tokenData },
      cliProjectId: projectId,
    } : { ...shared, cliProjectId: projectId };
  }

  public onSharedSessionChanged(listener: (session: SessionState) => void): void {
    this.sharedSessionListener = listener;
  }

  private watchNeoCliAuth(root: string): void {
    this.neoCliAuthWatcher?.close();
    const location = getNeoCliAuthLocation(root);
    if (!location) return;
    try {
      fs.mkdirSync(location.directory, { recursive: true, mode: 0o700 });
      fs.chmodSync(path.dirname(location.directory), 0o700);
      fs.chmodSync(location.directory, 0o700);
      this.neoCliAuthWatcher = fs.watch(location.directory, (_event, filename) => {
        if (filename && filename.toString() !== path.basename(location.file)) return;
        setTimeout(() => {
          if (this.neoCliProjectRoot !== root) return;
          if (!fs.existsSync(location.file)) {
            const current = this.readStorage().current;
            if (current?.cliProjectId && getNeoCliAuthLocation(root)?.file === location.file) {
              this.persistCurrentSession({ isLoggedIn: false });
              this.sharedSessionListener?.({ isLoggedIn: false });
              return;
            }
          }
          const session = this.getCurrentSession();
          this.sharedSessionListener?.(session);
        }, 100);
      });
    } catch (error: any) {
      console.warn(`[NeoCRM CLI] 无法监听共享登录状态: ${error.message}`);
    }
  }

  private persistCliProjectRoot(root: string): void {
    const file = this.getCliProjectPath();
    fs.writeFileSync(file, JSON.stringify({ root }, null, 2), { mode: 0o600 });
    fs.chmodSync(file, 0o600);
  }

  private getStoragePath(): string {
    const userData = app?.getPath ? app.getPath('userData') : process.cwd();
    return path.join(userData, 'neocrm_sessions.json');
  }

  private readStorage(): { current?: SessionState; history: AccountRecord[] } {
    const file = this.getStoragePath();
    if (!fs.existsSync(file)) {
      return { history: [] };
    }
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
      return { history: [] };
    }
  }

  private writeStorage(data: { current?: SessionState; history: AccountRecord[] }) {
    fs.writeFileSync(this.getStoragePath(), JSON.stringify(data, null, 2), 'utf-8');
  }

  private accountIdentity(record: AccountRecord): string {
    const token = record.tokenData;
    const tenantId = token?.tenant_id ?? record.tenantId;
    const userId = token?.userInfo?.userId;
    const instance = token?.instance_uri || record.instanceUri || record.environment?.neoBaseURL;
    if (tenantId == null || userId == null || !instance) return `id:${record.id}`;
    try {
      const url = new URL(instance);
      const product = record.environment?.productType || 'neocrm';
      return `${product}:${url.origin.toLowerCase()}:${String(tenantId)}:${String(userId)}`;
    } catch {
      return `id:${record.id}`;
    }
  }

  private deduplicateAccountHistory(records: AccountRecord[], preferredId?: string): AccountRecord[] {
    const unique = new Map<string, AccountRecord>();
    for (const record of records) {
      const key = this.accountIdentity(record);
      const existing = unique.get(key);
      if (!existing || record.id === preferredId ||
          (existing.id !== preferredId && record.lastLoginAt > existing.lastLoginAt)) {
        unique.set(key, record);
      }
    }
    return [...unique.values()].sort((a, b) => b.lastLoginAt - a.lastLoginAt);
  }

  public getCurrentSession(): SessionState {
    const data = this.readStorage();
    const current = data.current || { isLoggedIn: false };
    if (current.environment && (current.environment.productType || 'neocrm') !== 'neocrm') return current;
    const projectRoot = this.getNeoCliProjectRoot();
    if (!projectRoot) return current;

    try {
      const project = ensureNeoCliProject(projectRoot, current.cliProjectId);
      const sharedAuth = readNeoCliAuth(project.root);
      if (sharedAuth && (!current.isLoggedIn || (this.isSameCliAccount(current, sharedAuth) &&
          sharedAuth.savedAt >= (current.tokenData?.savedAt || 0)))) {
        const session = this.mergeCliSession(current, sharedAuth, project.projectId);
        this.persistCurrentSession(session);
        return session;
      }
      if (current.isLoggedIn && current.environment && current.tokenData) {
        this.syncCurrentSessionToCli(current, project.projectId);
      }
    } catch (error: any) {
      console.warn(`[NeoCRM CLI] 读取共享登录态失败: ${error.message}`);
    }
    return this.readStorage().current || { isLoggedIn: false };
  }

  public getNeoCliProjectRoot(): string | null {
    if (this.neoCliProjectRoot) return this.neoCliProjectRoot;
    try {
      const file = this.getCliProjectPath();
      if (fs.existsSync(file)) {
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (typeof saved.root === 'string' && fs.statSync(saved.root).isDirectory()) {
          this.neoCliProjectRoot = path.resolve(saved.root);
        }
      }
    } catch {}
    return this.neoCliProjectRoot;
  }

  private persistCurrentSession(session: SessionState): void {
    const data = this.readStorage();
    data.current = session;
    if (session.activeAccountId && session.tokenData) {
      const existing = data.history.find((item) => item.id === session.activeAccountId);
      const historyRecord: AccountRecord = {
        id: session.activeAccountId,
        environmentId: session.environment?.id || 'custom',
        environmentName: session.environment?.name || '销售易',
        tenantId: session.tokenData.tenant_id,
        tenantName: session.tokenData.userInfo?.tenantName,
        userName: session.tokenData.userInfo?.name,
        instanceUri: session.tokenData.instance_uri,
        lastLoginAt: existing?.lastLoginAt || Date.now(),
        tokenData: session.tokenData,
        environment: session.environment,
      };
      data.history = this.deduplicateAccountHistory(
        [historyRecord, ...data.history.filter((item) => item.id !== historyRecord.id)],
        session.activeAccountId,
      ).slice(0, 20);
    }
    this.writeStorage(data);
  }

  private syncCurrentSessionToCli(session: SessionState, projectId?: string): void {
    if (!this.neoCliProjectRoot || !session.environment || !session.tokenData) return;
    const authPath = syncSessionToNeoCli(this.neoCliProjectRoot, session.environment, session.tokenData);
    const project = ensureNeoCliProject(this.neoCliProjectRoot);
    if (projectId && projectId !== project.projectId) throw new Error('CLI 项目标识在同步期间发生变化');
    session.cliProjectId = project.projectId;
    session.tokenData.savedAt = session.tokenData.savedAt || Date.now();
    fs.chmodSync(authPath, 0o600);
    this.persistCurrentSession(session);
  }

  public getAccountHistory(): AccountRecord[] {
    const data = this.readStorage();
    const history = this.deduplicateAccountHistory(data.history || [], data.current?.activeAccountId);
    if (history.length !== (data.history || []).length) {
      data.history = history;
      this.writeStorage(data);
    }
    return history;
  }

  public saveSession(
    env: NeoEnvironment,
    tokenData: TokenData,
    options: { deferSalesforceCliSync?: boolean } = {}
  ): SessionState {
    const data = this.readStorage();
    const accountId = `${env.id}_${tokenData.tenant_id || 'unknown'}_${tokenData.userInfo?.userId || 'u'}`;

    const session: SessionState = {
      isLoggedIn: true,
      environment: env,
      tokenData,
      activeAccountId: accountId,
    };
    const historyRecord: AccountRecord = {
      id: accountId,
      environmentId: env.id,
      environmentName: env.name,
      tenantId: tokenData.tenant_id,
      tenantName: tokenData.userInfo?.tenantName,
      userName: tokenData.userInfo?.name,
      instanceUri: tokenData.instance_uri || env.neoBaseURL,
      lastLoginAt: Date.now(),
      tokenData,
      environment: env,
    };

    const history = this.deduplicateAccountHistory(
      [historyRecord, ...data.history.filter((h) => h.id !== accountId)], accountId,
    );

    data.current = session;
    data.history = history.slice(0, 20); // 最多保留20条历史
    this.writeStorage(data);

    // 后台 Token 更新保持非阻塞；交互式登录由调用方等待并展示实际 CLI 同步结果。
    if (env.productType === 'salesforce') {
      if (!options.deferSalesforceCliSync) {
        void this.syncToSalesforceCli(env, tokenData).then((result) => {
          if (!result.success) console.warn('[Salesforce CLI 同步失败]:', result.message);
        }).catch((error: any) => {
          console.warn('[Salesforce CLI 同步异常]:', error.message);
        });
      }
    } else if ((env.productType || 'neocrm') === 'neocrm') {
      const sync = this.syncToNeoCli();
      if (!sync.success) console.warn(`[NeoCRM CLI] ${sync.message}`);
    }

    return this.getCurrentSession();
  }

  public async saveSessionAndSyncSalesforceCli(env: NeoEnvironment, tokenData: TokenData): Promise<SessionState> {
    const session = this.saveSession(env, tokenData, { deferSalesforceCliSync: true });
    if (env.productType === 'salesforce') {
      session.salesforceCliSync = await this.syncToSalesforceCli(env, tokenData);
    }
    return session;
  }

  public updateCurrentEnvironment(env: NeoEnvironment): void {
    const data = this.readStorage();
    if (data.current?.isLoggedIn && data.current.environment?.id === env.id) {
      data.current.environment = { ...data.current.environment, ...env };
    }
    for (const h of data.history) {
      if (h.environmentId === env.id) {
        h.environment = { ...(h.environment || {}), ...env };
        h.environmentName = env.name;
      }
    }
    this.writeStorage(data);
  }

  public clearSession(): SessionState {
    const data = this.readStorage();
    const root = this.getNeoCliProjectRoot();
    if (root && data.current?.environment && (data.current.environment.productType || 'neocrm') === 'neocrm') {
      try { deleteNeoCliAuth(root); } catch (error: any) { console.warn(`[NeoCRM CLI] 清除共享登录态失败: ${error.message}`); }
    }
    data.current = { isLoggedIn: false };
    this.writeStorage(data);
    return data.current;
  }

  public async switchAccount(accountId: string): Promise<SessionState | null> {
    const data = this.readStorage();
    const target = data.history.find((h) => h.id === accountId);
    if (!target) return null;

    // 重新组合当前会话
    const session: SessionState = {
      isLoggedIn: true,
      environment: target.environment || {
        id: target.environmentId,
        name: target.environmentName,
        isPreset: !target.environmentId.startsWith('custom_'),
        neoBaseURL: target.instanceUri || '',
        loginURL: '',
        tokenURL: '',
      },
      tokenData: target.tokenData,
      activeAccountId: target.id,
    };

    data.current = session;
    this.writeStorage(data);
    if (session.environment?.productType === 'salesforce' && session.tokenData) {
      session.salesforceCliSync = await this.syncToSalesforceCli(session.environment, session.tokenData);
    } else if (session.environment?.productType === 'neocrm' && this.getNeoCliProjectRoot()) {
      try { this.syncCurrentSessionToCli(session); } catch (error: any) { console.warn(`[NeoCRM CLI] ${error.message}`); }
    }
    return session;
  }

  public updateSessionCookie(
    cookieString: string,
    cookies?: Array<{ name: string; value: string; domain?: string; path?: string }>
  ): SessionState {
    const data = this.readStorage();
    if (!data.current?.isLoggedIn || !data.current.tokenData) {
      throw new Error("当前未登录，无法更新 Cookie");
    }

    const cleanCookie = cookieString.trim();
    const parsedCookies: Array<{ name: string; value: string; domain?: string; path?: string }> =
      cookies && cookies.length > 0
        ? cookies
        : cleanCookie
            .split(";")
            .map((part) => {
              const eqIdx = part.indexOf("=");
              if (eqIdx > 0) {
                return {
                  name: part.slice(0, eqIdx).trim(),
                  value: part.slice(eqIdx + 1).trim(),
                };
              }
              return null;
            })
            .filter(Boolean) as any;

    data.current.tokenData.cookieString = cleanCookie;
    data.current.tokenData.cookies = parsedCookies;
    data.current.tokenData.cookieSavedAt = Date.now();

    if (data.current.activeAccountId) {
      const hist = data.history.find((h) => h.id === data.current?.activeAccountId);
      if (hist && hist.tokenData) {
        hist.tokenData.cookieString = cleanCookie;
        hist.tokenData.cookies = parsedCookies;
        hist.tokenData.cookieSavedAt = Date.now();
      }
    }

    this.writeStorage(data);
    return data.current;
  }

  public deleteAccountRecord(accountId: string): boolean {
    const data = this.readStorage();
    data.history = data.history.filter((h) => h.id !== accountId);
    if (data.current?.activeAccountId === accountId) {
      data.current = { isLoggedIn: false };
    }
    this.writeStorage(data);
    return true;
  }

  private runSalesforceCli(args: string[], stdin = '', timeout = 25000): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const quoteArg = (arg: string) => process.platform === 'win32'
        ? `"${arg.replace(/"/g, '""')}"`
        : `'${arg.replace(/'/g, `'\\''`)}'`;
      const command = [getSalesforceCliCommand(), ...args].map(quoteArg).join(' ');
      const child = exec(command, {
        env: getSalesforceCliEnvironment(),
        windowsHide: true,
        timeout,
        maxBuffer: 1024 * 1024,
      }, (error, stdout, stderr) => {
        if (!error) {
          resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
          return;
        }
        let detail = String(stderr || stdout || error.message)
          .replace(/force:\/\/\S+/gi, 'force://[redacted]')
          .trim()
          .slice(0, 700);
        const secretInput = stdin.trim();
        if (secretInput) detail = detail.replaceAll(secretInput, '[redacted]');
        const missingCli = (error as NodeJS.ErrnoException).code === 'ENOENT' || /not found|not recognized/i.test(detail);
        reject(new Error(missingCli
          ? '找不到 Salesforce CLI（sf）。请安装 Salesforce CLI v2，并确保当前系统用户可以从 PATH 调用。'
          : detail || `sf 命令执行失败，退出码 ${error.code ?? '未知'}`));
      });
      child.stdin?.end(stdin);
    });
  }

  private parseCliJson(output: string): any {
    const start = output.indexOf('{');
    const end = output.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('Salesforce CLI 未返回有效 JSON');
    return JSON.parse(output.slice(start, end + 1));
  }

  private persistSalesforceRefreshToken(env: NeoEnvironment, tokenData: TokenData, refreshToken: string): void {
    const accountId = `${env.id}_${tokenData.tenant_id || 'unknown'}_${tokenData.userInfo?.userId || 'u'}`;
    tokenData.refresh_token = refreshToken;
    const storage = this.readStorage();
    if (storage.current?.activeAccountId === accountId && storage.current.tokenData) {
      storage.current.tokenData.refresh_token = refreshToken;
    }
    const historyEntry = storage.history.find((entry) => entry.id === accountId);
    if (historyEntry?.tokenData) historyEntry.tokenData.refresh_token = refreshToken;
    this.writeStorage(storage);
  }

  public async syncToSalesforceCli(env: NeoEnvironment, tokenData: TokenData): Promise<SalesforceCliSyncResult> {
    const alias = resolveSalesforceAlias(env, tokenData).replace(/[^a-zA-Z0-9_.-]/g, '_');
    if (env.productType !== 'salesforce') {
      return { success: false, alias, message: '当前连接器不是 Salesforce，无需注册到 sf CLI。' };
    }

    try {
      const rawInstanceUrl = tokenData.instance_uri || env.neoBaseURL;
      if (!rawInstanceUrl) throw new Error('连接器没有 Salesforce instance URL');
      const parsedInstanceUrl = new URL(rawInstanceUrl);
      if (!['http:', 'https:'].includes(parsedInstanceUrl.protocol)) {
        throw new Error('Salesforce instance URL 必须使用 HTTP 或 HTTPS');
      }
      const instanceUrl = parsedInstanceUrl.origin;

      if (tokenData.refresh_token) {
        if (!env.clientId) {
          return { success: false, alias, message: 'CRM 已登录，但连接器缺少 Salesforce Client ID，无法使用 refresh_token 注册到 sf CLI。' };
        }
        const instanceHost = new URL(instanceUrl).host;
        const sfdxAuthUrl = `force://${env.clientId}:${env.clientSecret || ''}:${tokenData.refresh_token}@${instanceHost}`;
        await this.runSalesforceCli([
          'org', 'login', 'sfdx-url', '--alias', alias, '--set-default', '--json', '--sfdx-url-stdin',
        ], `${sfdxAuthUrl}\n`);
      } else if (tokenData.access_token) {
        // Client Credentials grants have no refresh token; register the current token without writing it to disk.
        await this.runSalesforceCli([
          'org', 'login', 'access-token', '--instance-url', instanceUrl, '--alias', alias, '--set-default', '--json',
        ], `${tokenData.access_token}\n`);
      } else {
        return {
          success: false,
          alias,
          message: 'CRM 已登录，但连接器没有可用的 refresh_token 或 access_token，无法注册到 sf CLI。',
        };
      }

      const authList = this.parseCliJson((await this.runSalesforceCli(['org', 'list', 'auth', '--json'], '', 15000)).stdout);
      const registered = (Array.isArray(authList.result) ? authList.result : []).some((org: any) =>
        String(org.alias || '').split(',').map((item: string) => item.trim()).includes(alias)
      );
      if (!registered) {
        return { success: false, alias, message: `sf CLI 登录命令已结束，但 org list auth 未找到别名 ${alias}，注册尚未验证成功。` };
      }

      if (tokenData.refresh_token) {
        void this.updateRefreshTokenFromSalesforceCli(env, tokenData, alias).catch((error: any) => {
          console.warn('[Salesforce CLI] 读取 CLI 轮转凭据失败:', error.message);
        });
        return { success: true, alias, message: `已注册并验证 Salesforce CLI 别名 ${alias}，支持 refresh_token 静默续期。` };
      }
      return {
        success: true,
        alias,
        message: `已注册并验证 Salesforce CLI 别名 ${alias}。当前授权没有 refresh_token，CLI 本身不能静默续期；NeoCRM 运行期间会在 token 更新后重新同步。`,
      };
    } catch (error: any) {
      return { success: false, alias, message: `CRM 已登录，但 Salesforce CLI 注册失败：${error.message}` };
    }
  }

  private async updateRefreshTokenFromSalesforceCli(env: NeoEnvironment, tokenData: TokenData, alias: string): Promise<void> {
    const output = (await this.runSalesforceCli([
      'org', 'auth', 'show-sfdx-auth-url', '--target-org', alias, '--json',
    ], '', 15000)).stdout;
    const sfdxAuthUrl = this.parseCliJson(output).result?.sfdxAuthUrl;
    const match = typeof sfdxAuthUrl === 'string'
      ? sfdxAuthUrl.match(/^force:\/\/[^:]*:[^:]*:([^@]+)@/i)
      : null;
    if (!match?.[1]) return;
    const refreshToken = decodeURIComponent(match[1]);
    if (refreshToken && refreshToken !== tokenData.refresh_token) {
      this.persistSalesforceRefreshToken(env, tokenData, refreshToken);
      console.info('[Salesforce CLI] 已将 CLI 轮转后的 refresh token 更新回连接器会话。');
    }
  }

  /**
   * 将当前桌面端登录凭证同步到 CLI 目录 (.neo-cli)
   * 支持指定工作区目录，或同步到用户主目录 (~/.neo-cli)
   */

  public syncToNeoCli(targetDirPath?: string): CliSyncResult {
    const current = this.readStorage().current || { isLoggedIn: false };
    if (!current.isLoggedIn || !current.tokenData || !current.environment) {
      return {
        success: false,
        targetPath: '',
        message: '当前尚未登录，无可用凭据同步',
      };
    }

    if ((current.environment.productType || 'neocrm') !== 'neocrm') {
      return { success: false, targetPath: '', message: '当前连接器不是销售易，无需同步到 neo CLI' };
    }

    try {
      const root = targetDirPath?.trim() || this.getNeoCliProjectRoot() || process.cwd();
      const project = ensureNeoCliProject(root);
      const authPath = syncSessionToNeoCli(project.root, current.environment, current.tokenData);
      current.cliProjectId = project.projectId;
      fs.chmodSync(authPath, 0o600);
      this.neoCliProjectRoot = project.root;
      this.persistCliProjectRoot(project.root);
      this.persistCurrentSession(current);

      return {
        success: true,
        targetPath: authPath,
        message: `桌面连接器与 neocrm-cli 已共享当前项目登录态 (${project.root})`,
      };
    } catch (err: any) {
      return {
        success: false,
        targetPath: targetDirPath || '',
        message: `同步写入失败: ${err.message || '未知文件写入错误'}`,
      };
    }
  }
}
