import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { app } from 'electron';
import axios from 'axios';
import QRCode from 'qrcode';
import { AiModelItem } from '../../shared/types';

export interface WorkBuddyAccount {
  uid: string;
  nickname: string;
  realm: 'intl' | 'cn';
  domain: string;
  accessToken: string;
  refreshToken: string;
  enterpriseId?: string;
  expiresAt: number; // 秒级时间戳
  enabled: boolean;
  updatedAt: number;
  models?: AiModelItem[];
  modelsSyncedAt?: number;
  quota?: WorkBuddyQuota;
  quotaSyncedAt?: number;
}

export interface WorkBuddyQuotaPackage {
  name?: string;
  totalPoints?: number;
  usedPoints?: number;
  remainingPoints?: number;
  expiresAt?: number;
}

export interface WorkBuddyQuota {
  totalPoints?: number;
  usedPoints?: number;
  remainingPoints?: number;
  unit?: string;
  packages: WorkBuddyQuotaPackage[];
  syncedAt: number;
}

export interface WorkBuddyLoginInit {
  state: string;
  authUrl: string;
  qrDataUrl: string;
  realm: 'intl' | 'cn';
}

export interface WorkBuddyPollResult {
  status: 'pending' | 'ok' | 'expired' | 'error';
  message?: string;
  account?: WorkBuddyAccount;
}

interface WorkBuddyStatus {
  loggedIn: boolean;
  account?: any;
  proxyPort: number;
  proxyUrl: string;
  models: AiModelItem[];
  modelsSyncedAt?: number;
  quota?: WorkBuddyQuota;
  quotaSyncedAt?: number;
  modelsSyncError?: string;
  quotaSyncError?: string;
}

const REALM_CONFIGS = {
  intl: {
    name: '国际版 (Global)',
    chat_upstream: 'https://www.workbuddy.ai',
    billing_upstream: 'https://www.workbuddy.ai',
    origin: 'https://www.workbuddy.ai',
    domain: 'www.workbuddy.ai',
    client_ver: '5.8.4',
    chat_ua: 'WorkBuddy/5.8.4 workbuddy-ai/5.8.4 CLI/2.161.0',
    billing_ua: 'WorkBuddy/5.8.4',
  },
  cn: {
    name: '国内版 (China)',
    chat_upstream: 'https://copilot.tencent.com',
    billing_upstream: 'https://www.codebuddy.cn',
    origin: 'https://www.codebuddy.cn',
    domain: 'copilot.tencent.com',
    client_ver: '5.8.3',
    chat_ua: 'WorkBuddy/5.8.3 WorkBuddy/5.8.3 CLI/2.161.0',
    billing_ua: 'WorkBuddy/5.8.3',
  },
};

export class WorkBuddyService {
  private account: WorkBuddyAccount | null = null;
  private server: http.Server | null = null;
  private port = 8788;
  private pendingLogins = new Map<string, { state: string; realm: 'intl' | 'cn'; createdAt: number }>();
  private modelsSyncError = '';
  private quotaSyncError = '';
  private readonly liveModelsTtlMs = 5 * 60 * 1000;
  private tokenRefreshPromise: Promise<string> | null = null;

  constructor() {
    this.loadAccount();
    this.startHttpServer();
  }

  private getStorePath(): string {
    const userData = app?.getPath ? app.getPath('userData') : process.cwd();
    return path.join(userData, 'workbuddy_account.json');
  }

  private loadAccount() {
    try {
      const p = this.getStorePath();
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        this.account = JSON.parse(raw);
      }
    } catch (e: any) {
      console.warn('[WorkBuddyService] 读取已保存账号失败:', e.message);
    }
  }

  private saveAccount(acc: WorkBuddyAccount | null) {
    this.account = acc;
    try {
      const p = this.getStorePath();
      if (acc) {
        fs.writeFileSync(p, JSON.stringify(acc, null, 2), 'utf-8');
      } else if (fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    } catch (e: any) {
      console.warn('[WorkBuddyService] 保存账号失败:', e.message);
    }
  }

  public getAccount(): WorkBuddyAccount | null {
    return this.account;
  }

  public getStatus(): WorkBuddyStatus {
    return {
      loggedIn: Boolean(this.account && this.account.accessToken),
      account: this.account
        ? {
            uid: this.account.uid,
            nickname: this.account.nickname,
            realm: this.account.realm,
            domain: this.account.domain,
            expiresAt: this.account.expiresAt,
            expiresInSeconds: Math.max(0, Math.round(this.account.expiresAt - Date.now() / 1000)),
            updatedAt: this.account.updatedAt,
          }
        : undefined,
      proxyPort: this.port,
      proxyUrl: `http://127.0.0.1:${this.port}/v1`,
      models: this.account?.models || [],
      modelsSyncedAt: this.account?.modelsSyncedAt,
      quota: this.account?.quota,
      quotaSyncedAt: this.account?.quotaSyncedAt,
      modelsSyncError: this.modelsSyncError || undefined,
      quotaSyncError: this.quotaSyncError || undefined,
    };
  }

  private parseJwt(token: string): { sub?: string; exp?: number; iss?: string; enterprise_id?: string } {
    try {
      const seg = token.split('.')[1];
      if (!seg) return {};
      const base64 = seg.replace(/-/g, '+').replace(/_/g, '/');
      const jsonStr = Buffer.from(base64, 'base64').toString('utf-8');
      return JSON.parse(jsonStr);
    } catch {
      return {};
    }
  }

  private buildAuthenticatedHeaders(token: string, includeJson = false, originOverride?: string): Record<string, string> {
    const realm = this.account?.realm || 'cn';
    const cfg = REALM_CONFIGS[realm];
    const headers: Record<string, string> = {
      Accept: 'application/json, text/plain, */*',
      Authorization: `Bearer ${token}`,
      'User-Agent': includeJson ? cfg.billing_ua : cfg.chat_ua,
      Origin: originOverride || cfg.origin,
      Referer: `${originOverride || cfg.origin}/`,
      'X-Requested-With': 'XMLHttpRequest',
      'X-User-Id': this.account?.uid || '',
      'X-Domain': this.account?.domain || cfg.domain,
      'X-IDE-Name': 'WorkBuddy',
      'X-IDE-Type': 'WorkBuddy',
      'X-IDE-Version': cfg.client_ver,
      'X-Product': 'SaaS',
      'X-CodeBuddy-Request': '1',
    };
    if (includeJson) headers['Content-Type'] = 'application/json';
    return headers;
  }

  private numberValue(...values: any[]): number | undefined {
    for (const value of values) {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
    }
    return undefined;
  }

  private sumDecimalValues(values: any[]): number | undefined {
    const decimals = values
      .filter((value) => value !== undefined && value !== null && value !== '')
      .map((value) => String(value).trim());
    if (!decimals.length) return undefined;
    const precision = Math.min(8, Math.max(...decimals.map((value) => value.split('.')[1]?.length || 0)));
    const scale = 10 ** precision;
    const sum = decimals.reduce((total, value) => total + Math.round(Number(value) * scale), 0);
    return sum / scale;
  }

  private collectModelCandidates(value: any, output: any[] = []): any[] {
    if (!value) return output;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' || (item && typeof item === 'object' && (item.id || item.model || item.modelId || item.name))) {
          output.push(item);
        }
      }
      return output;
    }
    if (typeof value !== 'object') return output;
    for (const key of ['models', 'modelList', 'model_list', 'availableModels', 'available_models']) {
      if (!value[key]) continue;
      if (Array.isArray(value[key])) {
        this.collectModelCandidates(value[key], output);
      } else if (typeof value[key] === 'object') {
        for (const [id, item] of Object.entries<any>(value[key])) {
          if (typeof item === 'string') output.push(item);
          else if (item && typeof item === 'object') output.push({ id, ...item });
        }
      }
    }
    return output;
  }

  private parseLiveModels(payload: any): AiModelItem[] {
    const data = payload?.data?.data || payload?.data || payload;
    const candidates: any[] = [];
    this.collectModelCandidates(data, candidates);
    if (data?.agents) {
      const cliAgent = Array.isArray(data.agents)
        ? data.agents.find((agent: any) => String(agent?.id || agent?.name || agent?.type || '').toLowerCase() === 'cli')
        : data.agents.cli;
      if (cliAgent) {
        this.collectModelCandidates(cliAgent, candidates);
      } else {
        for (const agent of Object.values<any>(data.agents)) this.collectModelCandidates(agent, candidates);
      }
    }
    if (data?.modelTiers) this.collectModelCandidates(data.modelTiers, candidates);
    if (Array.isArray(data?.models)) this.collectModelCandidates(data.models, candidates);

    const models: AiModelItem[] = [];
    const seen = new Set<string>();
    for (const item of candidates) {
      const id = typeof item === 'string' ? item : String(item.id || item.modelId || item.model || item.name || '').trim();
      if (!id || seen.has(id) || id.length > 200) continue;
      seen.add(id);
      const lowerId = id.toLowerCase();
      const capabilities = typeof item === 'object' ? item.capabilities || item.features || [] : [];
      const capabilityText = Array.isArray(capabilities) ? capabilities.join(' ').toLowerCase() : JSON.stringify(capabilities).toLowerCase();
      models.push({
        id,
        name: typeof item === 'object' && item.displayName ? `${item.displayName} (${id})` : (typeof item === 'object' && item.name ? item.name : id),
        reasoning: Boolean(typeof item === 'object' && (item.reasoning || item.thinking || item.supportsReasoning)) || /reason|think|r1|o1|o3|qwq/.test(lowerId),
        tools: typeof item === 'object' && typeof item.tools === 'boolean'
          ? item.tools
          : !/embedding|image|speech|tts|reasoner|thinking/.test(lowerId) && (/tool|function|chat|completion/.test(capabilityText) || !capabilityText),
        contextWindow: this.numberValue(
          typeof item === 'object' ? item.contextWindow : undefined,
          typeof item === 'object' ? item.context_window : undefined,
          typeof item === 'object' ? item.maxInputTokens : undefined,
          typeof item === 'object' ? item.inputTokenLimit : undefined,
          typeof item === 'object' ? item.contextLength : undefined,
        ) || 65536,
        maxOutputTokens: this.numberValue(
          typeof item === 'object' ? item.maxOutputTokens : undefined,
          typeof item === 'object' ? item.max_output_tokens : undefined,
          typeof item === 'object' ? item.outputTokenLimit : undefined,
        ) || 8192,
      });
    }
    return models;
  }

  private parseQuota(payload: any): WorkBuddyQuota | null {
    if (payload?.code !== undefined && payload.code !== 0) return null;
    let root = payload;
    for (let depth = 0; depth < 4; depth += 1) {
      if (root?.Response?.Data) root = root.Response.Data;
      else if (root?.data) root = root.data;
      else break;
    }
    const rawPackages = root?.Packages || root?.packages || root?.Accounts || root?.accounts || root?.Resources || root?.resources || root?.items || [];
    const packageList = Array.isArray(rawPackages) ? rawPackages : [];
    const packages: WorkBuddyQuotaPackage[] = packageList.map((item: any) => {
      const totalPoints = this.numberValue(item?.CycleTotalCapacity, item?.cycleTotalCapacity, item?.CycleCapacitySizePrecise, item?.TotalCapacity, item?.totalCapacity, item?.total);
      const remainingPoints = this.numberValue(item?.CycleRemainCapacity, item?.cycleRemainCapacity, item?.CycleCapacityRemainPrecise, item?.CapacityRemain, item?.RemainCapacity, item?.remainingCapacity, item?.remaining, item?.remain);
      const usedPoints = this.numberValue(item?.CycleUsedCapacity, item?.cycleUsedCapacity, item?.CycleCapacityUsedPrecise, item?.UsedCapacity, item?.usedCapacity, item?.used);
      return {
        name: item?.Name || item?.name || item?.PackageName || item?.packageName || item?.PackageCode || item?.packageCode,
        totalPoints,
        usedPoints: usedPoints ?? (totalPoints !== undefined && remainingPoints !== undefined ? totalPoints - remainingPoints : undefined),
        remainingPoints,
        expiresAt: this.numberValue(item?.ExpireAt, item?.expireAt, item?.ExpiresAt, item?.expiresAt),
      };
    }).filter((item) => item.totalPoints !== undefined || item.remainingPoints !== undefined || item.usedPoints !== undefined);

    const totalPoints = this.numberValue(root?.TotalCapacity, root?.totalCapacity, root?.total, root?.totalPoints, root?.LimitNum, root?.limitNum);
    const remainingPoints = this.numberValue(root?.RemainCapacity, root?.remainingCapacity, root?.remaining, root?.remainingPoints, root?.Credit, root?.credit);
    const usedPoints = this.numberValue(root?.UsedCapacity, root?.usedCapacity, root?.used, root?.usedPoints, root?.UsedNum, root?.usedNum);
    const result = {
      totalPoints: totalPoints ?? this.sumDecimalValues(packageList.map((item: any) => item?.CycleTotalCapacity ?? item?.cycleTotalCapacity ?? item?.CycleCapacitySizePrecise ?? item?.TotalCapacity ?? item?.totalCapacity ?? item?.total)),
      usedPoints: usedPoints ?? this.sumDecimalValues(packageList.map((item: any) => item?.CycleUsedCapacity ?? item?.cycleUsedCapacity ?? item?.CycleCapacityUsedPrecise ?? item?.UsedCapacity ?? item?.usedCapacity ?? item?.used)),
      remainingPoints: remainingPoints ?? this.sumDecimalValues(packageList.map((item: any) => item?.CycleRemainCapacity ?? item?.cycleRemainCapacity ?? item?.CycleCapacityRemainPrecise ?? item?.CapacityRemain ?? item?.RemainCapacity ?? item?.remainingCapacity ?? item?.remaining ?? item?.remain)),
      unit: root?.Unit || root?.unit || packageList[0]?.CapacityUnit || packageList[0]?.capacityUnit || '积分',
      packages,
      syncedAt: Date.now(),
    };
    if (result.totalPoints === undefined && result.usedPoints === undefined && result.remainingPoints === undefined && packages.length === 0) return null;
    return result;
  }

  public async fetchLiveModels(): Promise<{ success: boolean; models: AiModelItem[]; syncedAt?: number; error?: string }> {
    if (!this.account?.accessToken) return { success: false, models: [], error: 'WorkBuddy 尚未登录' };
    try {
      const token = await this.ensureValidToken();
      const cfg = REALM_CONFIGS[this.account.realm] || REALM_CONFIGS.cn;
      let models: AiModelItem[] = [];
      let lastError: any;
      const paths = ['/v2/enterprises/personal/models', '/v3/config'];
      const userAgents = [...new Set([cfg.chat_ua, cfg.billing_ua])];
      for (const apiPath of paths) {
        for (const userAgent of userAgents) {
          try {
            const res = await axios.get(`${cfg.chat_upstream}${apiPath}`, {
              headers: { ...this.buildAuthenticatedHeaders(token), 'User-Agent': userAgent },
              timeout: 10000,
            });
            models = this.parseLiveModels(res.data);
            if (models.length) break;
            lastError = new Error(`${apiPath} 未返回可用模型`);
          } catch (e: any) {
            lastError = e;
            if (e.response?.status === 401) break;
          }
        }
        if (models.length) break;
      }
      if (!models.length) throw lastError || new Error('上游配置接口未返回可用模型');
      this.account.models = models;
      this.account.modelsSyncedAt = Date.now();
      this.modelsSyncError = '';
      this.saveAccount(this.account);
      return { success: true, models, syncedAt: this.account.modelsSyncedAt };
    } catch (e: any) {
      this.modelsSyncError = e.response?.data?.message || e.message || '获取 WorkBuddy 模型失败';
      return { success: false, models: this.account?.models || [], syncedAt: this.account?.modelsSyncedAt, error: this.modelsSyncError };
    }
  }

  public async fetchQuota(): Promise<{ success: boolean; quota?: WorkBuddyQuota; syncedAt?: number; error?: string }> {
    if (!this.account?.accessToken) return { success: false, error: 'WorkBuddy 尚未登录' };
    try {
      const token = await this.ensureValidToken();
      const cfg = REALM_CONFIGS[this.account.realm] || REALM_CONFIGS.cn;
      const isEnterprise = Boolean(this.account.enterpriseId);
      const paths = isEnterprise
        ? ['/billing/meter/get-enterprise-user-usage']
        : this.account.realm === 'cn'
        ? ['/billing/meter/get-user-resource-summary', '/v2/billing/meter/get-user-resource']
        : ['/billing/meter/get-user-resource', '/v2/billing/meter/get-user-resource'];
      const billingBases = this.account.realm === 'cn'
        ? ['https://www.workbuddy.cn', cfg.billing_upstream]
        : [cfg.billing_upstream];
      let lastError: any;
      for (const base of billingBases) {
        for (const apiPath of paths) {
          try {
            const body = isEnterprise ? {} : this.account.realm === 'intl' ? { PageNumber: 1, PageSize: 100 } : {};
            const res = await axios.post(`${base}${apiPath}`, body, {
              headers: this.buildAuthenticatedHeaders(token, true, base),
              timeout: 15000,
            });
            const quota = this.parseQuota(res.data);
            if (!quota) {
              lastError = new Error(`${apiPath} 未返回可解析的积分余额`);
              continue;
            }
            this.account.quota = quota;
            this.account.quotaSyncedAt = quota.syncedAt;
            this.quotaSyncError = '';
            this.saveAccount(this.account);
            return { success: true, quota, syncedAt: quota.syncedAt };
          } catch (e: any) {
            lastError = e;
            if (e.response?.status !== 404) break;
          }
        }
      }
      throw lastError || new Error('积分接口调用失败');
    } catch (e: any) {
      this.quotaSyncError = e.response?.data?.message || e.message || '获取 WorkBuddy 剩余积分失败';
      return { success: false, quota: this.account?.quota, syncedAt: this.account?.quotaSyncedAt, error: this.quotaSyncError };
    }
  }

  public async refreshStatus(): Promise<WorkBuddyStatus> {
    if (!this.account?.accessToken) return this.getStatus();
    await Promise.allSettled([this.fetchLiveModels(), this.fetchQuota()]);
    return this.getStatus();
  }

  private async getModelsForProxy(): Promise<AiModelItem[]> {
    if (this.account?.accessToken && (!this.account.models?.length || Date.now() - (this.account.modelsSyncedAt || 0) > this.liveModelsTtlMs)) {
      await this.fetchLiveModels();
    }
    return this.account?.models || [];
  }

  /**
   * 1. 发起扫码/网页登录会话，生成真实二维码图片与网页链接
   */
  public async startLogin(realm: 'intl' | 'cn' = 'cn'): Promise<WorkBuddyLoginInit> {
    const cfg = REALM_CONFIGS[realm] || REALM_CONFIGS.cn;
    const url = `${cfg.chat_upstream}/v2/plugin/auth/state?platform=CLI`;

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': cfg.billing_ua,
      'Origin': cfg.origin,
      'Referer': `${cfg.origin}/`,
    };

    const res = await axios.post(url, {}, { headers, timeout: 15000 });
    const data = res.data?.data || {};
    const state = data.state;
    const authUrl = data.authUrl;

    if (!state || !authUrl) {
      throw new Error(`获取登录二维码失败: ${res.data?.msg || '未返回有效授权链接'}`);
    }

    // 生成 Base64 二维码图片供界面展示微信/客户端扫码
    const qrDataUrl = await QRCode.toDataURL(authUrl, {
      width: 260,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });

    this.pendingLogins.set(state, {
      state,
      realm,
      createdAt: Date.now(),
    });

    return {
      state,
      authUrl,
      qrDataUrl,
      realm,
    };
  }

  /**
   * 2. 轮询登录状态
   */
  public async pollLogin(state: string, realm: 'intl' | 'cn' = 'cn'): Promise<WorkBuddyPollResult> {
    const loginInfo = this.pendingLogins.get(state);
    const targetRealm = loginInfo?.realm || realm;
    const cfg = REALM_CONFIGS[targetRealm] || REALM_CONFIGS.cn;

    // 检查超时 (10 分钟)
    if (loginInfo && Date.now() - loginInfo.createdAt > 600000) {
      this.pendingLogins.delete(state);
      return { status: 'expired', message: '登录超时，请重新生成二维码' };
    }

    const tokenUrl = `${cfg.chat_upstream}/v2/plugin/auth/token?state=${encodeURIComponent(state)}`;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': cfg.billing_ua,
      'Origin': cfg.origin,
      'Referer': `${cfg.origin}/`,
    };

    try {
      const res = await axios.get(tokenUrl, { headers, timeout: 10000 });
      const payload = res.data || {};
      const code = payload.code;

      // 11217 为官方定义的 LOGIN_PENDING 状态码
      if (code === 11217) {
        return {
          status: 'pending',
          message: payload.msg || '等待扫码与授权确认...',
        };
      }

      if (code !== 0) {
        return {
          status: 'error',
          message: `登录接口返回错误码: ${code} (${payload.msg || '授权异常'})`,
        };
      }

      const data = payload.data || {};
      const accessToken = data.accessToken;
      if (!accessToken) {
        return { status: 'pending', message: '正在换取登录凭据...' };
      }

      const jwt = this.parseJwt(accessToken);
      const uid = jwt.sub || 'anonymous';
      let nickname = '';

      // 尝试拉取用户昵称
      try {
        const acctUrl = `${cfg.chat_upstream}/v2/plugin/login/account?state=${encodeURIComponent(state)}`;
        const acctRes = await axios.get(acctUrl, {
          headers: {
            ...headers,
            Authorization: `Bearer ${accessToken}`,
          },
          timeout: 10000,
        });
        nickname = acctRes.data?.data?.nickname || acctRes.data?.data?.name || '';
      } catch {}

      const expEpoch = jwt.exp || (data.expiresAt ? Math.round(data.expiresAt / (data.expiresAt > 1e11 ? 1000 : 1)) : Math.round(Date.now() / 1000 + 7200));

      const account: WorkBuddyAccount = {
        uid,
        nickname: nickname || uid.slice(0, 8),
        realm: targetRealm,
        domain: data.domain || cfg.domain,
        accessToken,
        refreshToken: data.refreshToken || '',
        enterpriseId: jwt.enterprise_id,
        expiresAt: expEpoch,
        enabled: true,
        updatedAt: Date.now(),
      };

      this.saveAccount(account);
      this.pendingLogins.delete(state);

      console.log(`[WorkBuddy] 账号授权成功: ${account.nickname} (UID: ${account.uid}, 区域: ${account.realm})`);
      return {
        status: 'ok',
        account,
      };
    } catch (e: any) {
      return {
        status: 'pending',
        message: `轮询中: ${e.message}`,
      };
    }
  }

  /**
   * 3. 退出登录
   */
  public logout(): boolean {
    this.saveAccount(null);
    return true;
  }

  /**
   * 4. 自动保活与 Refresh Token 续期
   */
  public async ensureValidToken(): Promise<string> {
    if (!this.account || !this.account.accessToken) {
      throw new Error('WorkBuddy 尚未登录，请在设置中扫码登录');
    }

    const nowSec = Math.round(Date.now() / 1000);
    // 剩余有效期超过 5 分钟直接使用
    if (this.account.expiresAt - nowSec > 300) {
      return this.account.accessToken;
    }

    if (!this.account.refreshToken) {
      return this.account.accessToken;
    }

    if (!this.tokenRefreshPromise) {
      this.tokenRefreshPromise = this.refreshAccessToken();
    }
    try {
      return await this.tokenRefreshPromise;
    } finally {
      this.tokenRefreshPromise = null;
    }
  }

  private async refreshAccessToken(): Promise<string> {
    const account = this.account;
    if (!account?.accessToken) throw new Error('WorkBuddy 尚未登录，请在设置中扫码登录');

    const cfg = REALM_CONFIGS[account.realm] || REALM_CONFIGS.cn;
    const refreshUrl = `${cfg.chat_upstream}/v2/plugin/auth/token/refresh`;

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': cfg.billing_ua,
      'Origin': cfg.origin,
      'Referer': `${cfg.origin}/`,
      'X-Refresh-Token': account.refreshToken,
      'X-Auth-Refresh-Source': account.realm === 'cn' ? 'workbuddy' : 'plugin',
      'X-User-Id': account.uid,
      'X-Domain': account.domain || cfg.domain,
      'X-CodeBuddy-Request': '1',
      'Accept-Language': account.realm === 'intl' ? 'en-US' : 'zh-CN',
    };

    try {
      console.log(`[WorkBuddy] 正在静默续期 Token (UID: ${account.uid})...`);
      const res = await axios.post(refreshUrl, {}, { headers, timeout: 15000 });
      const rawData = res.data?.data || {};
      const data = rawData.data || rawData;

      if (data.accessToken) {
        const jwt = this.parseJwt(data.accessToken);
        if (this.account?.uid !== account.uid) return this.account?.accessToken || data.accessToken;
        this.account.accessToken = data.accessToken;
        if (data.refreshToken) this.account.refreshToken = data.refreshToken;
        this.account.expiresAt = jwt.exp || Math.round(Date.now() / 1000 + 7200);
        this.account.updatedAt = Date.now();
        this.saveAccount(this.account);
        console.log(`[WorkBuddy] Token 续期成功，新有效期至: ${new Date(this.account.expiresAt * 1000).toLocaleString()}`);
        return this.account.accessToken;
      }
    } catch (e: any) {
      console.warn(`[WorkBuddy] Token 续期失败:`, e.message);
    }

    return this.account?.accessToken || account.accessToken;
  }

  /**
   * 5. 构建与官方客户端完全对齐的出站指纹头
   */
  /**
   * 清洗发往腾讯 WorkBuddy 上游的消息体 (免疫 11-128 非法渠道拦截 WAF 规则)
   * 1. 角色映射: developer 映射为 system (上游只认 system/user/assistant/tool)
   * 2. 去除触发上游 WAF 拦截的特定第三方 IDE / Agent 指纹句式
   */
  public sanitizeUpstreamMessages(messages: any[]): any[] {
    if (!Array.isArray(messages)) return [];

    return messages.map((m) => {
      if (!m || typeof m !== 'object') return m;
      const copy = { ...m };

      // 角色归一化
      if (copy.role === 'developer') {
        copy.role = 'system';
      }

      // 文本安全过滤
      if (typeof copy.content === 'string') {
        let text = copy.content;
        // 免疫 DSH GUI 语序特征拦截
        text = text.replace(
          /DeepSeek\s+Harness\s+Web\s+GUI\s+whose\s+URL\s+the\s+runtime\s+context\s+names\./gi,
          'DeepSeek Web GUI whose URL is named in the runtime context.'
        );
        // 免疫 Codex / Claude Code 特定 WAF 拦截
        text = text.replace(
          /You are a coding agent running in the Codex CLI, a terminal-based coding assistant\./gi,
          'You are a coding agent running in the terminal-based assistant.'
        );
        text = text.replace(
          /You are Claude Code, Anthropic's official CLI for Claude/gi,
          "You are Claude Code, Anthropic's official CLI tool for Claude"
        );
        copy.content = text;
      }

      return copy;
    });
  }

  /**
   * 5. 构建与官方客户端 5.8.x 完全对齐的出站指纹头 (严格对齐连字符 UUID，杜绝 11-128 渠道拦截)
   */
  public buildHeaders(token: string, model?: string): Record<string, string> {
    const realm = this.account?.realm || 'cn';
    const cfg = REALM_CONFIGS[realm];
    const uid = this.account?.uid || 'anonymous';
    const domain = this.account?.domain || cfg.domain;

    // 官方规范实测：会话 ID (X-Conversation-ID) 必须是带连字符的完整 UUID；
    // 请求与消息 ID 必须是 32 位无连字符 hex。缺了或错剥连字符会导致上游拦截 11-128 (conversation id missing)
    const convId = crypto.randomUUID();
    const msgId = crypto.randomUUID().replace(/-/g, '');
    const traceId = crypto.randomBytes(16).toString('hex');
    const nowMs = String(Date.now());

    return {
      'Content-Type': 'application/json',
      'X-Agent-Intent': 'craft',
      'X-Agent-Purpose': 'conversation',
      'X-Agent-Type': 'main',
      'X-IDE-Name': 'WorkBuddy',
      'X-IDE-Type': 'WorkBuddy',
      'X-IDE-Version': cfg.client_ver,
      'X-Private-Data': 'true',
      'X-Product': 'SaaS',
      'X-Domain': domain,
      'User-Agent': cfg.chat_ua,
      'X-User-Id': uid,
      'Authorization': `Bearer ${token}`,
      'X-Request-Trace-Id': traceId,
      'X-Conversation-ID': convId,
      'X-Conversation-Request-ID': msgId,
      'X-Root-Request-ID': msgId,
      'X-Conversation-Message-ID': msgId,
      'X-Request-ID': msgId,
      'X-Model-ID': model || 'default-model',
      'monitor_promptPrepareStartTime': nowMs,
      'monitor_httpSendTime': nowMs,
    };
  }

  /**
   * 6. 核心反代分发逻辑：直接与腾讯上游微服务通信
   */
  public async dispatchChat(
    body: any,
    options: {
      onChunk?: (data: string) => void;
      signal?: AbortSignal;
    } = {}
  ): Promise<any> {
    const token = await this.ensureValidToken();
    const realm = this.account?.realm || 'cn';
    const cfg = REALM_CONFIGS[realm];
    const upstreamUrl = `${cfg.chat_upstream}/v2/chat/completions`;

    const model = body.model || 'deepseek-v4.1-flash';
    const headers = this.buildHeaders(token, model);

    // 标准化消息体并执行 WAF 敏感指纹安全清洗
    const forwardBody = { ...body };
    if (Array.isArray(forwardBody.messages)) {
      forwardBody.messages = this.sanitizeUpstreamMessages(forwardBody.messages);
    }

    if (String(model).toLowerCase().startsWith('deepseek') && !forwardBody.thinking) {
      forwardBody.thinking = { type: 'enabled' };
    }
    if (String(model).toLowerCase().startsWith('gpt-') && forwardBody.max_tokens && forwardBody.max_tokens < 16) {
      forwardBody.max_tokens = 16;
    }

    const isStream = Boolean(forwardBody.stream);

    if (isStream) {
      const response = await axios({
        url: upstreamUrl,
        method: 'POST',
        headers,
        data: forwardBody,
        responseType: 'stream',
        signal: options.signal,
        timeout: 120000,
      });

      return response.data;
    } else {
      const res = await axios.post(upstreamUrl, forwardBody, {
        headers,
        signal: options.signal,
        timeout: 120000,
      });
      return res.data;
    }
  }

  /**
   * 7. 启动内置轻量 HTTP 反代服务 (默认 127.0.0.1:8788)
   */
  private startHttpServer() {
    try {
      this.server = http.createServer(async (req, res) => {
        // 全局 CORS 跨域支持
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');

        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        const url = new URL(req.url || '/', `http://127.0.0.1:${this.port}`);
        const pathname = url.pathname;

        // 健康检查端点
        if (pathname === '/health' || pathname === '/') {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(
            JSON.stringify({
              status: 'ok',
              service: 'WorkBuddy2API Native Gateway',
              loggedIn: Boolean(this.account),
              account: this.account ? { uid: this.account.uid, nickname: this.account.nickname, realm: this.account.realm } : null,
              modelsUrl: '/v1/models',
              completionsUrl: '/v1/chat/completions',
            })
          );
          return;
        }

        // 模型列表端点
        if (pathname === '/v1/models' || pathname === '/models') {
          const models = await this.getModelsForProxy();
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            object: 'list',
            data: models.map((m) => ({
              id: m.id,
              object: 'model',
              created: Math.floor((this.account?.modelsSyncedAt || Date.now()) / 1000),
              owned_by: 'workbuddy',
              name: m.name,
              reasoning: Boolean(m.reasoning),
              tools: Boolean(m.tools),
              context_window: m.contextWindow,
              max_output_tokens: m.maxOutputTokens,
            })),
          }));
          return;
        }

        // 对话补全端点 (POST /v1/chat/completions)
        if ((pathname === '/v1/chat/completions' || pathname === '/chat/completions') && req.method === 'POST') {
          let bodyChunks: Buffer[] = [];
          req.on('data', (c) => bodyChunks.push(c));
          req.on('end', async () => {
            try {
              if (!this.account || !this.account.accessToken) {
                res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(
                  JSON.stringify({
                    error: {
                      message: 'WorkBuddy 尚未扫码登录，请在 NeoCRM 桌面端【系统设置 -> 模型供应商 -> WorkBuddy】中扫码登录后使用。',
                      type: 'authentication_error',
                      code: 'not_logged_in',
                    },
                  })
                );
                return;
              }

              const rawBody = Buffer.concat(bodyChunks).toString('utf-8');
              const body = rawBody ? JSON.parse(rawBody) : {};

              const isStream = Boolean(body.stream);
              const stream = await this.dispatchChat(body);

              if (isStream) {
                res.writeHead(200, {
                  'Content-Type': 'text/event-stream; charset=utf-8',
                  'Cache-Control': 'no-cache',
                  'Connection': 'keep-alive',
                });
                stream.pipe(res);
              } else {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify(stream));
              }
            } catch (err: any) {
              const errMsg = err.response?.data?.message || err.response?.data?.error?.message || err.message;
              const status = err.response?.status || 500;
              res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(
                JSON.stringify({
                  error: {
                    message: `WorkBuddy 上游调用异常: ${errMsg}`,
                    type: 'api_error',
                  },
                })
              );
            }
          });
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Not Found', type: 'invalid_request_error' } }));
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        console.log(`[WorkBuddy] 本地内置 OpenAI 代理网关已在 http://127.0.0.1:${this.port}/v1 成功启动！`);
      });

      this.server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[WorkBuddy] 端口 ${this.port} 已被占用 (可能正在运行独立的 workbuddy2api-hub 进程)，内置服务跳过端口监听，在内存中直接调度。`);
        } else {
          console.warn(`[WorkBuddy] 内置 HTTP 服务启动异常:`, err.message);
        }
      });
    } catch (e: any) {
      console.warn(`[WorkBuddy] 初始化 HTTP 网关失败:`, e.message);
    }
  }
}
