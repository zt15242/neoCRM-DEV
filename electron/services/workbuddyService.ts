import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { app } from 'electron';
import axios from 'axios';
import QRCode from 'qrcode';

export interface WorkBuddyAccount {
  uid: string;
  nickname: string;
  realm: 'intl' | 'cn';
  domain: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // 秒级时间戳
  enabled: boolean;
  updatedAt: number;
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
    client_ver: '5.5.6',
    chat_ua: 'WorkBuddy/5.5.6 WorkBuddy/5.5.6 CLI/2.137.1',
    billing_ua: 'WorkBuddy/5.5.6',
  },
};

const DEFAULT_MODELS = [
  { id: 'default-model', name: 'Auto (智能自动调度)', contextWindow: 176000, maxOutputTokens: 24000 },
  { id: 'deepseek-v4.1-flash', name: 'DeepSeek-V4.1-Flash (全能极速)', contextWindow: 176000, maxOutputTokens: 24000 },
  { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro (国内旗舰)', contextWindow: 176000, maxOutputTokens: 24000 },
  { id: 'deepseek-r1-0528', name: 'DeepSeek-R1 (深度推理)', contextWindow: 65536, maxOutputTokens: 8192 },
  { id: 'gpt-6-astra', name: 'GPT-6-Astra (前沿预览)', contextWindow: 200000, maxOutputTokens: 32000 },
  { id: 'gpt-5.3-codex', name: 'GPT-5.3-Codex (代码专精)', contextWindow: 200000, maxOutputTokens: 32000 },
  { id: 'glm-5.3', name: 'GLM-5.3 (智谱旗舰)', contextWindow: 128000, maxOutputTokens: 16384 },
  { id: 'kimi-k3', name: 'Kimi-K3 (长文本推理)', contextWindow: 200000, maxOutputTokens: 32000 },
  { id: 'hy4-preview', name: '腾讯混元 Hy4 Preview', contextWindow: 176000, maxOutputTokens: 24000 },
  { id: 'fast-model', name: 'Fast (轻量速答)', contextWindow: 200000, maxOutputTokens: 32000 },
  { id: 'primary-model', name: 'Primary (主力编码)', contextWindow: 200000, maxOutputTokens: 32000 },
  { id: 'deep-model', name: 'Deep (深度思考)', contextWindow: 200000, maxOutputTokens: 32000 },
];

export class WorkBuddyService {
  private account: WorkBuddyAccount | null = null;
  private server: http.Server | null = null;
  private port = 8788;
  private pendingLogins = new Map<string, { state: string; realm: 'intl' | 'cn'; createdAt: number }>();

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

  public getStatus(): { loggedIn: boolean; account?: any; proxyPort: number; proxyUrl: string } {
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
    };
  }

  private parseJwt(token: string): { sub?: string; exp?: number; iss?: string } {
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

    const cfg = REALM_CONFIGS[this.account.realm] || REALM_CONFIGS.cn;
    const refreshUrl = `${cfg.chat_upstream}/v2/plugin/auth/token/refresh`;

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': cfg.billing_ua,
      'Origin': cfg.origin,
      'Referer': `${cfg.origin}/`,
      'X-Refresh-Token': this.account.refreshToken,
      'X-Auth-Refresh-Source': this.account.realm === 'cn' ? 'workbuddy' : 'plugin',
      'X-User-Id': this.account.uid,
      'X-Domain': this.account.domain || cfg.domain,
      'X-CodeBuddy-Request': '1',
      'Accept-Language': this.account.realm === 'intl' ? 'en-US' : 'zh-CN',
    };

    try {
      console.log(`[WorkBuddy] 正在静默续期 Token (UID: ${this.account.uid})...`);
      const res = await axios.post(refreshUrl, {}, { headers, timeout: 15000 });
      const data = res.data?.data || {};

      if (data.accessToken) {
        const jwt = this.parseJwt(data.accessToken);
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

    return this.account.accessToken;
  }

  /**
   * 5. 构建与官方客户端完全对齐的出站指纹头
   */
  public buildHeaders(token: string, model?: string): Record<string, string> {
    const realm = this.account?.realm || 'cn';
    const cfg = REALM_CONFIGS[realm];
    const uid = this.account?.uid || 'anonymous';
    const domain = this.account?.domain || cfg.domain;

    const convId = crypto.randomUUID().replace(/-/g, '');
    const msgId = crypto.randomUUID().replace(/-/g, '');

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
      'X-Conversation-ID': convId,
      'X-Conversation-Request-ID': msgId,
      'X-Root-Request-ID': msgId,
      'X-Conversation-Message-ID': msgId,
      'X-Request-ID': msgId,
      'X-Model-ID': model || 'default-model',
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

    // 标准化消息体与注入
    const forwardBody = { ...body };
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
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(
            JSON.stringify({
              object: 'list',
              data: DEFAULT_MODELS.map((m) => ({
                id: m.id,
                object: 'model',
                created: 1710000000,
                owned_by: 'workbuddy',
                name: m.name,
              })),
            })
          );
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
