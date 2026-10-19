import { exec, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { app } from 'electron';
import { AccountRecord, CliSyncResult, NeoEnvironment, SessionState, TokenData } from '../types';

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

  public saveSession(env: NeoEnvironment, tokenData: TokenData): SessionState {
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

    // 自动联动同步本地 CLI 工具链凭据 (关键优化：后台非阻塞异步执行，杜绝阻塞主线程引起界面假死)
    if (env.productType === 'salesforce') {
      setTimeout(() => {
        this.syncToSalesforceCli(env, tokenData);
      }, 50);
    } else {
      this.syncToNeoCli();
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

  public switchAccount(accountId: string): SessionState | null {
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

  /**
   * 将当前桌面端登录凭证同步到 CLI 目录 (.neo-cli)
   * 支持指定工作区目录，或同步到用户主目录 (~/.neo-cli)
   */
  /**
   * 自动将 Salesforce 最新登录会话凭据无缝同步至本地 Salesforce CLI (sf)
   */
  public syncToSalesforceCli(env: NeoEnvironment, tokenData: TokenData): { success: boolean; message: string } {
    if (env.productType !== 'salesforce' || !tokenData.refresh_token || !env.clientId) {
      return { success: false, message: '无需同步或缺少 Salesforce 凭据' };
    }
    try {
      const instanceHost = new URL(tokenData.instance_uri || env.neoBaseURL).host;
      const clientSecret = env.clientSecret || '';
      const sfdxAuthUrl = `force://${env.clientId}:${clientSecret}:${tokenData.refresh_token}@${instanceHost}`;
      
      const tmpFile = path.join(os.tmpdir(), `sfdx_auth_${Date.now()}.txt`);
      fs.writeFileSync(tmpFile, sfdxAuthUrl, 'utf-8');

      // 提取现有别名或使用默认别名
      let alias = 'DigitalDev';
      try {
        const sfConfigPath = path.join(os.homedir(), '.sf', 'config.json');
        if (fs.existsSync(sfConfigPath)) {
          const sfConfig = JSON.parse(fs.readFileSync(sfConfigPath, 'utf-8'));
          if (sfConfig['target-org']) alias = sfConfig['target-org'];
        }
      } catch {}

      if (alias === 'DigitalDev') {
        const aliasJsonPath = path.join(os.homedir(), '.sfdx', 'alias.json');
        if (fs.existsSync(aliasJsonPath)) {
          try {
            const aliasData = JSON.parse(fs.readFileSync(aliasJsonPath, 'utf-8'));
            const found = Object.entries(aliasData.orgs || {}).find(([a, u]) => 
              u === tokenData.userInfo?.userId || 
              u === tokenData.userInfo?.name || 
              String(u).includes('stagefull') ||
              String(u).includes('olympus')
            );
            if (found) alias = found[0];
          } catch {}
        }
      }

      const cmd = process.platform === 'win32' ? 'sf.cmd' : 'sf';

      // 关键性能优化：使用非阻塞异步子进程在后台执行 CLI 同步，彻底消除主进程假死卡顿！
      exec(`"${cmd}" org login sfdx-url -f "${tmpFile}" --alias "${alias}" --set-default`, {
        windowsHide: true,
        timeout: 25000,
      }, (loginErr) => {
        try {
          if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
        } catch {}

        if (loginErr) {
          console.warn('[Salesforce CLI 后台同步提示]:', loginErr.message);
          return;
        }

        // 后台异步提取最新轮转的 Refresh Token
        exec(`"${cmd}" org auth show-sfdx-auth-url --target-org "${alias}" --json`, {
          env: { ...process.env, SF_TEMP_SHOW_SECRETS: 'true' },
          windowsHide: true,
          timeout: 20000,
        }, (authErr, stdout) => {
          if (authErr || !stdout) return;
          try {
            const jsonStart = stdout.indexOf('{');
            const jsonEnd = stdout.lastIndexOf('}');
            if (jsonStart !== -1 && jsonEnd !== -1) {
              const parsed = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1));
              const sfdxUrl = parsed.result?.sfdxAuthUrl;
              if (sfdxUrl) {
                const m = sfdxUrl.match(/^force:\/\/[^:]+:[^:]+:([^@]+)@/);
                if (m && m[1] && m[1] !== tokenData.refresh_token) {
                  tokenData.refresh_token = m[1];
                  console.log("[Salesforce] 后台已从 CLI 成功提取最新轮转的 Refresh Token 并同步回会话");
                  try {
                    const storage = this.readStorage();
                    if (storage.current?.isLoggedIn && storage.current.tokenData) {
                      storage.current.tokenData.refresh_token = m[1];
                    }
                    const accId = storage.current?.activeAccountId;
                    if (accId) {
                      const h = storage.history.find((item) => item.id === accId);
                      if (h && h.tokenData) h.tokenData.refresh_token = m[1];
                    }
                    this.writeStorage(storage);
                  } catch {}
                }
              }
            }
          } catch {}
        });
      });

      return { success: true, message: `后台已触发同步凭据到本地 Salesforce CLI (别名: ${alias})` };
    } catch (e: any) {
      return { success: false, message: `同步 Salesforce CLI 失败: ${e.message}` };
    }
  }

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
