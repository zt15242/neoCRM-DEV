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
    };

    const history = data.history.filter((h) => h.id !== accountId);
    history.unshift(historyRecord);

    data.current = session;
    data.history = history.slice(0, 20); // 最多保留20条历史
    this.writeStorage(data);

    return session;
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
      environment: {
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
      fs.writeFileSync(tokenJsonPath, JSON.stringify(tokenPayload, null, 2), 'utf-8');

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
