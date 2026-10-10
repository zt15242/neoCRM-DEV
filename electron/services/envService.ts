import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import axios from 'axios';
import { NeoEnvironment, TestConnectionResult } from '../../shared/types';
import { DEFAULT_AUTH_CONFIG } from '../../shared/constants';

export { DEFAULT_AUTH_CONFIG };

export const PRESET_ENVIRONMENTS: NeoEnvironment[] = [
  {
    id: 'production',
    name: '线上生产环境',
    description: '销售易官方线上正式生产环境 (crm.xiaoshouyi.com)',
    isPreset: true,
    neoBaseURL: 'https://crm.xiaoshouyi.com',
    loginURL: 'https://login.xiaoshouyi.com/auc/oauth2/auth',
    tokenURL: 'https://login.xiaoshouyi.com/auc/oauth2/token',
    ...DEFAULT_AUTH_CONFIG,
  },
  {
    id: 'sandbox',
    name: '沙盒环境 (Sandbox)',
    description: '客户专属演练与业务验证沙盒 (crm-sandbox.xiaoshouyi.com)',
    isPreset: true,
    neoBaseURL: 'https://crm-sandbox.xiaoshouyi.com',
    loginURL: 'https://login-sandbox.xiaoshouyi.com/auc/oauth2/auth',
    tokenURL: 'https://login-sandbox.xiaoshouyi.com/auc/oauth2/token',
    ...DEFAULT_AUTH_CONFIG,
  },
  {
    id: 'cd',
    name: '开发测试环境 (CD)',
    description: '持续交付开发与联调环境 (crm-cd.xiaoshouyi.com)',
    isPreset: true,
    neoBaseURL: 'https://crm-cd.xiaoshouyi.com',
    loginURL: 'https://login-cd.xiaoshouyi.com/auc/oauth2/auth',
    tokenURL: 'https://login-cd.xiaoshouyi.com/auc/oauth2/token',
    ...DEFAULT_AUTH_CONFIG,
  },
  {
    id: 'p20',
    name: 'P20 环境',
    description: 'P20 特性验证与专属演练集群 (crm-p20.xiaoshouyi.com)',
    isPreset: true,
    neoBaseURL: 'https://crm-p20.xiaoshouyi.com',
    loginURL: 'https://login-p20.xiaoshouyi.com/auc/oauth2/auth',
    tokenURL: 'https://login-p20.xiaoshouyi.com/auc/oauth2/token',
    ...DEFAULT_AUTH_CONFIG,
  },
  {
    id: 'tencentuat',
    name: '腾讯云 UAT 环境',
    description: '腾讯专有云客户交付验收环境 (crm-tencentuat.xiaoshouyi.com)',
    isPreset: true,
    neoBaseURL: 'https://crm-tencentuat.xiaoshouyi.com',
    loginURL: 'https://login-tencentuat.xiaoshouyi.com/auc/oauth2/auth',
    tokenURL: 'https://login-tencentuat.xiaoshouyi.com/auc/oauth2/token',
    ...DEFAULT_AUTH_CONFIG,
  },
];

export class EnvService {
  private getStoragePath(): string {
    const userData = app?.getPath ? app.getPath('userData') : process.cwd();
    return path.join(userData, 'neocrm_custom_envs.json');
  }

  public getCustomEnvironments(): NeoEnvironment[] {
    const filePath = this.getStoragePath();
    if (!fs.existsSync(filePath)) {
      return [];
    }
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      console.error('读取自定义环境失败:', e);
      return [];
    }
  }

  public getAllEnvironments(): NeoEnvironment[] {
    const custom = this.getCustomEnvironments();
    return [...PRESET_ENVIRONMENTS, ...custom];
  }

  public getEnvironmentById(id: string): NeoEnvironment | undefined {
    return this.getAllEnvironments().find((env) => env.id === id);
  }

  public saveCustomEnvironment(env: Partial<NeoEnvironment> & { name: string; neoBaseURL: string }): NeoEnvironment {
    const customEnvs = this.getCustomEnvironments();
    const id = env.id || `custom_${Date.now()}`;

    // 智能推导登录与 Token 地址
    let loginURL = env.loginURL;
    let tokenURL = env.tokenURL;

    if (!loginURL || !tokenURL) {
      try {
        const u = new URL(env.neoBaseURL);
        const hostParts = u.hostname.split('.');
        let loginHost = u.hostname;
        if (hostParts[0].startsWith('crm')) {
          hostParts[0] = hostParts[0].replace('crm', 'login');
          loginHost = hostParts.join('.');
        }
        if (!loginURL) loginURL = `${u.protocol}//${loginHost}/auc/oauth2/auth`;
        if (!tokenURL) tokenURL = `${u.protocol}//${loginHost}/auc/oauth2/token`;
      } catch {
        if (!loginURL) loginURL = `${env.neoBaseURL}/auc/oauth2/auth`;
        if (!tokenURL) tokenURL = `${env.neoBaseURL}/auc/oauth2/token`;
      }
    }

    const fullEnv: NeoEnvironment = {
      id,
      name: env.name,
      description: env.description || `自定义环境: ${env.neoBaseURL}`,
      isPreset: false,
      neoBaseURL: env.neoBaseURL.trim(),
      loginURL: loginURL.trim(),
      tokenURL: tokenURL.trim(),
      clientId: env.clientId?.trim() || DEFAULT_AUTH_CONFIG.clientId,
      clientSecret: env.clientSecret?.trim() || DEFAULT_AUTH_CONFIG.clientSecret,
      redirectUri: env.redirectUri?.trim() || DEFAULT_AUTH_CONFIG.redirectUri,
      scope: env.scope || 'all',
      oauthType: env.oauthType || 'standard',
      accessType: env.accessType || 'offline',
      updatedAt: Date.now(),
      createdAt: env.createdAt || Date.now(),
    };

    const existingIndex = customEnvs.findIndex((item) => item.id === id);
    if (existingIndex >= 0) {
      customEnvs[existingIndex] = fullEnv;
    } else {
      customEnvs.push(fullEnv);
    }

    fs.writeFileSync(this.getStoragePath(), JSON.stringify(customEnvs, null, 2), 'utf-8');
    return fullEnv;
  }

  public deleteCustomEnvironment(id: string): boolean {
    const customEnvs = this.getCustomEnvironments();
    const filtered = customEnvs.filter((item) => item.id !== id);
    if (filtered.length !== customEnvs.length) {
      fs.writeFileSync(this.getStoragePath(), JSON.stringify(filtered, null, 2), 'utf-8');
      return true;
    }
    return false;
  }

  public async testConnectivity(urlStr: string): Promise<TestConnectionResult> {
    const start = Date.now();
    try {
      const resp = await axios.get(urlStr, {
        timeout: 5000,
        validateStatus: () => true,
      });
      const duration = Date.now() - start;
      return {
        success: resp.status < 500,
        statusCode: resp.status,
        responseTimeMs: duration,
        message: `连通性检测成功 (HTTP ${resp.status}, 耗时 ${duration}ms)`,
      };
    } catch (e: any) {
      return {
        success: false,
        responseTimeMs: Date.now() - start,
        message: `连接失败: ${e.message || '网络无法访问'}`,
      };
    }
  }
}
