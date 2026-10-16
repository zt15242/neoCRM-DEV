import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import axios from 'axios';
import { NeoEnvironment, TestConnectionResult } from '../../shared/types';
import { DEFAULT_AUTH_CONFIG } from '../../shared/constants';

export { DEFAULT_AUTH_CONFIG };

export const PRESET_ENVIRONMENTS: NeoEnvironment[] = [
  // 1. 销售易 NeoCRM 预置连接器
  {
    id: 'production',
    name: '销售易 - 线上生产环境',
    productType: 'neocrm',
    envType: 'production',
    description: '销售易官方线上正式生产环境 (crm.xiaoshouyi.com)',
    isPreset: true,
    neoBaseURL: 'https://crm.xiaoshouyi.com',
    loginURL: 'https://login.xiaoshouyi.com/auc/oauth2/auth',
    tokenURL: 'https://login.xiaoshouyi.com/auc/oauth2/token',
    ...DEFAULT_AUTH_CONFIG,
  },
  {
    id: 'sandbox',
    name: '销售易 - 沙盒环境 (Sandbox)',
    productType: 'neocrm',
    envType: 'sandbox',
    description: '客户专属演练与业务验证沙盒 (crm-sandbox.xiaoshouyi.com)',
    isPreset: true,
    neoBaseURL: 'https://crm-sandbox.xiaoshouyi.com',
    loginURL: 'https://login-sandbox.xiaoshouyi.com/auc/oauth2/auth',
    tokenURL: 'https://login-sandbox.xiaoshouyi.com/auc/oauth2/token',
    ...DEFAULT_AUTH_CONFIG,
  },
  {
    id: 'cd',
    name: '销售易 - 开发测试环境 (CD)',
    productType: 'neocrm',
    envType: 'test',
    description: '持续交付开发与联调环境 (crm-cd.xiaoshouyi.com)',
    isPreset: true,
    neoBaseURL: 'https://crm-cd.xiaoshouyi.com',
    loginURL: 'https://login-cd.xiaoshouyi.com/auc/oauth2/auth',
    tokenURL: 'https://login-cd.xiaoshouyi.com/auc/oauth2/token',
    ...DEFAULT_AUTH_CONFIG,
  },
  {
    id: 'p20',
    name: '销售易 - P20 专属环境',
    productType: 'neocrm',
    envType: 'test',
    description: 'P20 特性验证与专属演练集群 (crm-p20.xiaoshouyi.com)',
    isPreset: true,
    neoBaseURL: 'https://crm-p20.xiaoshouyi.com',
    loginURL: 'https://login-p20.xiaoshouyi.com/auc/oauth2/auth',
    tokenURL: 'https://login-p20.xiaoshouyi.com/auc/oauth2/token',
    ...DEFAULT_AUTH_CONFIG,
  },
  {
    id: 'tencentuat',
    name: '销售易 - 腾讯云 UAT 环境',
    productType: 'neocrm',
    envType: 'test',
    description: '腾讯专有云客户交付验收环境 (crm-tencentuat.xiaoshouyi.com)',
    isPreset: true,
    neoBaseURL: 'https://crm-tencentuat.xiaoshouyi.com',
    loginURL: 'https://login-tencentuat.xiaoshouyi.com/auc/oauth2/auth',
    tokenURL: 'https://login-tencentuat.xiaoshouyi.com/auc/oauth2/token',
    ...DEFAULT_AUTH_CONFIG,
  },
  // 2. Salesforce 官方生态连接器预置 (支持阿里中国版 *.sfcrmproducts.cn 与 全球版 *.salesforce.com)
  {
    id: 'sf-alicloud-production',
    name: 'Salesforce 阿里中国 - 生产正式环境',
    productType: 'salesforce',
    envType: 'production',
    cloudDomain: 'login.sfcrmproducts.cn',
    authMode: 'client_credentials',
    description: 'Salesforce on Alibaba Cloud 阿里云中国版生产组织 (*.sfcrmproducts.cn)',
    isPreset: true,
    neoBaseURL: 'https://login.sfcrmproducts.cn',
    loginURL: 'https://login.sfcrmproducts.cn/services/oauth2/authorize',
    tokenURL: 'https://login.sfcrmproducts.cn/services/oauth2/token',
    scope: '',
    oauthType: 'standard',
    accessType: 'offline',
  },
  {
    id: 'sf-sandbox',
    name: 'Salesforce 阿里中国 - 沙盒测试环境 (Sandbox)',
    productType: 'salesforce',
    envType: 'sandbox',
    cloudDomain: 'test.sfcrmproducts.cn',
    authMode: 'client_credentials',
    description: 'Salesforce on Alibaba Cloud 阿里云中国版测试沙盒 (*.sfcrmproducts.cn)',
    isPreset: true,
    neoBaseURL: 'https://test.sfcrmproducts.cn',
    loginURL: 'https://test.sfcrmproducts.cn/services/oauth2/authorize',
    tokenURL: 'https://test.sfcrmproducts.cn/services/oauth2/token',
    scope: '',
    oauthType: 'standard',
    accessType: 'offline',
  },
  {
    id: 'sf-global-production',
    name: 'Salesforce 全球版 - 生产/开发者环境 (Global)',
    productType: 'salesforce',
    envType: 'production',
    cloudDomain: 'login.salesforce.com',
    description: 'Salesforce 国际版生产或 Developer 组织 (*.salesforce.com)',
    isPreset: true,
    neoBaseURL: 'https://login.salesforce.com',
    loginURL: 'https://login.salesforce.com/services/oauth2/authorize',
    tokenURL: 'https://login.salesforce.com/services/oauth2/token',
    scope: '',
    oauthType: 'standard',
    accessType: 'offline',
  },
  {
    id: 'sf-global-sandbox',
    name: 'Salesforce 全球版 - 沙盒测试环境 (Global)',
    productType: 'salesforce',
    envType: 'sandbox',
    cloudDomain: 'test.salesforce.com',
    description: 'Salesforce 国际版客户专属测试沙盒 (*.salesforce.com)',
    isPreset: true,
    neoBaseURL: 'https://test.salesforce.com',
    loginURL: 'https://test.salesforce.com/services/oauth2/authorize',
    tokenURL: 'https://test.salesforce.com/services/oauth2/token',
    scope: '',
    oauthType: 'standard',
    accessType: 'offline',
  },
  // 3. 纷享销客 (FXIAOKE) 官方连接器预置 (依照 OpenAPI v2 标准端点规范)
  {
    id: 'fxiaoke-open',
    name: '纷享销客 - 纷享云开放平台 (标准云)',
    productType: 'fxiaoke',
    envType: 'production',
    cloudDomain: 'open.fxiaoke.com',
    authMode: 'client_credentials',
    description: '纷享销客官方标准云网关 (open.fxiaoke.com)',
    isPreset: true,
    neoBaseURL: 'https://open.fxiaoke.com',
    loginURL: 'https://open.fxiaoke.com/oauth2.0/authorize',
    tokenURL: 'https://open.fxiaoke.com/oauth2.0/token',
    scope: 'all',
    oauthType: 'standard',
    accessType: 'offline',
  },
  {
    id: 'fxiaoke-hwcloud',
    name: '纷享销客 - 华为云环境',
    productType: 'fxiaoke',
    envType: 'production',
    cloudDomain: 'open-hwcloud.fxiaoke.com',
    authMode: 'client_credentials',
    description: '纷享销客华为云部署客户专属网关 (open-hwcloud.fxiaoke.com)',
    isPreset: true,
    neoBaseURL: 'https://open-hwcloud.fxiaoke.com',
    loginURL: 'https://open-hwcloud.fxiaoke.com/oauth2.0/authorize',
    tokenURL: 'https://open-hwcloud.fxiaoke.com/oauth2.0/token',
    scope: 'all',
    oauthType: 'standard',
    accessType: 'offline',
  },
  {
    id: 'fxiaoke-ale',
    name: '纷享销客 - 阿里云环境',
    productType: 'fxiaoke',
    envType: 'production',
    cloudDomain: 'open-ale.fxiaoke.com',
    authMode: 'client_credentials',
    description: '纷享销客阿里云部署客户专属网关 (open-ale.fxiaoke.com)',
    isPreset: true,
    neoBaseURL: 'https://open-ale.fxiaoke.com',
    loginURL: 'https://open-ale.fxiaoke.com/oauth2.0/authorize',
    tokenURL: 'https://open-ale.fxiaoke.com/oauth2.0/token',
    scope: 'all',
    oauthType: 'standard',
    accessType: 'offline',
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
      const list: NeoEnvironment[] = JSON.parse(data);
      let changed = false;
      for (const item of list) {
        if (item.productType === 'fxiaoke') {
          const domain = item.cloudDomain?.trim() || 'open.fxiaoke.com';
          const validTokenUrl = `https://${domain}/oauth2.0/token`;
          if (item.tokenURL !== validTokenUrl) {
            item.tokenURL = validTokenUrl;
            item.loginURL = `https://${domain}/oauth2.0/authorize`;
            changed = true;
          }
        }
      }
      if (changed) {
        fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf-8');
      }
      return list;
    } catch (e) {
      console.error('读取自定义环境失败:', e);
      return [];
    }
  }

  public getAllEnvironments(): NeoEnvironment[] {
    // 彻底去除内置死板预置列表的强占位，仅返回用户实际配置与创建的连接器
    return this.getCustomEnvironments();
  }

  public getPresetTemplates(): NeoEnvironment[] {
    return PRESET_ENVIRONMENTS;
  }

  public getEnvironmentById(id: string): NeoEnvironment | undefined {
    return this.getAllEnvironments().find((env) => env.id === id);
  }

  public saveCustomEnvironment(env: Partial<NeoEnvironment> & { name: string; neoBaseURL: string }): NeoEnvironment {
    const customEnvs = this.getCustomEnvironments();
    const id = env.id || `custom_${Date.now()}`;
    const preset = PRESET_ENVIRONMENTS.find((p) => p.id === id);
    const isPreset = Boolean(preset);

    // 智能推导登录与 Token 地址
    let loginURL = env.loginURL;
    let tokenURL = env.tokenURL;

    if (env.productType === 'fxiaoke') {
      const domain = env.cloudDomain?.trim() || (env.neoBaseURL ? new URL(env.neoBaseURL).host : 'open.fxiaoke.com');
      loginURL = `https://${domain}/oauth2.0/authorize`;
      tokenURL = `https://${domain}/oauth2.0/token`;
    } else if (env.productType === 'salesforce') {
      const host = env.neoBaseURL ? new URL(env.neoBaseURL).host : 'login.salesforce.com';
      if (!loginURL) loginURL = `https://${host}/services/oauth2/authorize`;
      if (!tokenURL) tokenURL = `https://${host}/services/oauth2/token`;
    } else if (!loginURL || !tokenURL) {
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
      productType: env.productType || 'neocrm',
      envType: env.envType || 'custom',
      description: env.description || `${env.productType || 'CRM'} 连接器: ${env.neoBaseURL}`,
      isPreset,
      neoBaseURL: env.neoBaseURL.trim(),
      loginURL: loginURL.trim(),
      tokenURL: tokenURL.trim(),
      clientId: env.clientId?.trim() || DEFAULT_AUTH_CONFIG.clientId,
      clientSecret: env.clientSecret?.trim() || DEFAULT_AUTH_CONFIG.clientSecret,
      redirectUri: env.redirectUri?.trim() || DEFAULT_AUTH_CONFIG.redirectUri,
      scope: env.scope || 'all',
      oauthType: env.oauthType || 'standard',
      accessType: env.accessType || 'offline',
      // 纷享销客专属 OAuth 2.0 参数保存
      authMode: env.authMode,
      permanentCode: env.permanentCode?.trim(),
      cloudDomain: env.cloudDomain?.trim(),
      ea: env.ea?.trim(),
      customHeaders: env.customHeaders,
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
