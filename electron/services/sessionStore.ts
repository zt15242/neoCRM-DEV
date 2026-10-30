import { exec, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { app } from 'electron';
import { AccountRecord, CliSyncResult, NeoEnvironment, SalesforceCliSyncResult, SessionState, TokenData } from '../types';
import { getSalesforceCliCommand, getSalesforceCliEnvironment } from './salesforceCliRuntime';
import { resolveSalesforceAlias } from './salesforceService';

export class SessionStore {
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

  public getCurrentSession(): SessionState {
    const data = this.readStorage();
    return data.current || { isLoggedIn: false };
  }

  public getAccountHistory(): AccountRecord[] {
    const data = this.readStorage();
    return data.history || [];
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

    const history = data.history.filter((h) => h.id !== accountId);
    history.unshift(historyRecord);

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
    } else {
      this.syncToNeoCli();
    }

    return session;
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
          'org', 'login', 'sfdx-url', '--sfdx-url-stdin', '--alias', alias, '--set-default', '--json',
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
    const current = this.getCurrentSession();
    if (!current.isLoggedIn || !current.tokenData || !current.environment) {
      return {
        success: false,
        targetPath: '',
        message: '当前尚未登录，无可用凭据同步',
      };
    }

    try {
      const baseDir = targetDirPath?.trim() || (process.cwd() !== '/' ? process.cwd() : os.homedir());
      const neoCliDir = path.join(baseDir, '.neo-cli');

      if (!fs.existsSync(neoCliDir)) {
        fs.mkdirSync(neoCliDir, { recursive: true });
      }

      // 1. 写入 token.json
      const tokenJsonPath = path.join(neoCliDir, 'token.json');
      const tokenPayload = {
        ...current.tokenData,
        savedAt: current.tokenData.savedAt || Date.now(),
        expiresAt: current.tokenData.expiresAt || (Date.now() + (current.tokenData.expires_in || 7200) * 1000),
      };
      fs.writeFileSync(tokenJsonPath, JSON.stringify(tokenPayload, null, 2), "utf-8");

      // 1b. 若存在 Web 会话 Cookie，同步写入 cookie.txt
      if (current.tokenData.cookieString) {
        fs.writeFileSync(path.join(neoCliDir, "cookie.txt"), current.tokenData.cookieString, "utf-8");
      }

      // 2. 写入 env.json
      const envJsonPath = path.join(neoCliDir, 'env.json');
      const envPayload = {
        neoBaseURL: current.tokenData.instance_uri || current.environment.neoBaseURL,
        loginURL: current.environment.loginURL,
        tokenURL: current.environment.tokenURL,
        updatedAt: Date.now(),
      };
      fs.writeFileSync(envJsonPath, JSON.stringify(envPayload, null, 2), 'utf-8');

      // 3. 同时可选同步至主目录 ~/.neo-cli
      const userHomeNeoCli = path.join(os.homedir(), '.neo-cli');
      try {
        if (!fs.existsSync(userHomeNeoCli)) {
          fs.mkdirSync(userHomeNeoCli, { recursive: true });
        }
        fs.writeFileSync(path.join(userHomeNeoCli, 'token.json'), JSON.stringify(tokenPayload, null, 2), 'utf-8');
        fs.writeFileSync(path.join(userHomeNeoCli, 'env.json'), JSON.stringify(envPayload, null, 2), 'utf-8');
      } catch (homeErr) {
        console.warn('同步至用户主目录 ~/.neo-cli 失败(非致命):', homeErr);
      }

      return {
        success: true,
        targetPath: neoCliDir,
        message: `成功同步凭证至 ${neoCliDir}，终端可直接使用 neo 命令！`,
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
