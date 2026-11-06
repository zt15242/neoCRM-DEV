import axios, { type AxiosRequestConfig, type Method } from 'axios';
import type { NeoEnvironment, TokenData } from '../../shared/types';

export type NeoOpenApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface NeoOpenApiInput {
  method: NeoOpenApiMethod;
  url: string;
  queryParams?: Record<string, unknown>;
  body?: unknown;
  bodyEncoding?: 'json' | 'form';
  mutates?: boolean;
  confirm?: boolean;
}

type Request = (config: AxiosRequestConfig) => Promise<{ status: number; data: unknown }>;

// Several legacy admin actions mutate state through GET. Never treat their verb as read-only.
function isMutatingAdminGet(url: string): boolean {
  const path = decodeURIComponent(new URL(url).pathname);
  return path.startsWith('/admin/') && /\/(?:do-)?(?:save|release|create|copy|clone|rename|delete|remove|enable|disable|update|modify|assign|unassign|activation|recalculate|start|stop|publish)(?:[A-Z_-]|\.action$|$)/.test(path);
}

function formBody(body: unknown): string | undefined {
  if (body === undefined) return undefined;
  // Preserve legacy AJAX strings and repeated keys exactly; do not URL-encode a second time.
  if (typeof body === 'string') return body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('表单 body 必须是字段对象或已编码字符串');
  const fields = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (!['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) {
      throw new Error(`表单字段 ${key} 必须是字符串、数值或布尔值；嵌套 JSON 请先序列化`);
    }
    fields.append(key, String(value));
  }
  return fields.toString();
}

function redact(value: unknown, token: TokenData): unknown {
  if (typeof value === 'string') {
    let result = value;
    const secrets = [token.access_token, token.refresh_token, token.cookieString,
      ...(token.cookies || []).map(cookie => `${cookie.name}=${cookie.value}`),
      ...(token.cookies || []).map(cookie => cookie.value)];
    for (const secret of secrets) {
      if (secret) result = result.split(secret).join('[REDACTED]');
    }
    return result.slice(0, 20000);
  }
  if (Array.isArray(value)) return value.slice(0, 500).map(item => redact(item, token));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 500).map(([key, item]) => [key, redact(item, token)]));
  }
  return value;
}

export function resolveNeoOpenApiUrl(baseUrl: string, suppliedUrl: string): string {
  const base = new URL(baseUrl);
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password) {
    throw new Error('当前连接器实例地址无效');
  }
  const value = suppliedUrl.trim();
  if (!value || value.startsWith('//') || value.startsWith('\\\\')) throw new Error('Open API URL 必须是绝对路径或完整 HTTP(S) URL');
  let pathAndQuery: string;
  if (/^https?:\/\//i.test(value)) {
    const supplied = new URL(value);
    if (supplied.username || supplied.password) throw new Error('Open API URL 不能包含账号或密码');
    pathAndQuery = `${supplied.pathname}${supplied.search}`;
  } else {
    if (!value.startsWith('/') || value.startsWith('/\\')) throw new Error('Open API 路径必须以 / 开头');
    pathAndQuery = value;
  }
  const resolved = new URL(pathAndQuery, base.origin);
  if (resolved.origin !== base.origin || resolved.hash) throw new Error('Open API 路径无效');
  return resolved.toString();
}

function authHeadersForUrl(url: string, token: TokenData): Record<string, string> {
  const parsed = new URL(url);
  if (parsed.pathname.startsWith('/admin/')) {
    const cookies = Array.isArray(token.cookies) && token.cookies.length > 0
      ? token.cookies.map(cookie => `${cookie.name}=${cookie.value}`)
      : (token.cookieString || '').split(';').map(cookie => cookie.trim()).filter(Boolean);
    if (cookies.length === 0) {
      throw new Error('该后台接口需要销售易后台会话 Cookie。请先在连接器中捕获或刷新 Cookie，再重试。');
    }
    return { Cookie: cookies.join('; ') };
  }
  if (!token.access_token) throw new Error('该 Open API 需要当前销售易连接器的 OAuth Token');
  return { Authorization: `Bearer ${token.access_token}` };
}

export class NeoOpenApiService {
  constructor(private request: Request = (config) => axios.request(config)) {}

  async execute(env: NeoEnvironment, token: TokenData, input: NeoOpenApiInput, signal?: AbortSignal) {
    if ((env.productType || 'neocrm') !== 'neocrm') throw new Error('execute_open_api 仅支持销售易连接器');
    if (!input || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(input.method)) {
      throw new Error('Open API method 仅支持 GET、POST、PUT、PATCH、DELETE');
    }
    if (typeof input.url !== 'string') throw new Error('缺少 Open API URL 或路径');
    const baseUrl = token.instance_uri || env.neoBaseURL;
    if (!baseUrl) throw new Error('当前销售易连接器没有可用的实例地址');
    const url = resolveNeoOpenApiUrl(baseUrl, input.url);
    const method = input.method as NeoOpenApiMethod;
    if ((method !== 'GET' || input.mutates === true || isMutatingAdminGet(url)) && input.confirm !== true) {
      throw new Error(`即将执行 ${method} ${new URL(url).pathname}。展示目标租户、路径和请求体并取得用户明确确认后，设置 confirm=true 再执行。`);
    }
    if (input.body !== undefined && !['object', 'string', 'number', 'boolean'].includes(typeof input.body)) {
      throw new Error('Open API body 必须是 JSON 值');
    }
    const bodyEncoding = input.bodyEncoding ?? 'json';
    if (!['json', 'form'].includes(bodyEncoding)) throw new Error('bodyEncoding 仅支持 json 或 form');
    const data = method === 'GET' ? undefined : bodyEncoding === 'form' ? formBody(input.body) : input.body;

    signal?.throwIfAborted();
    let response;
    try {
      response = await this.request({
        method: method as Method,
        url,
        params: input.queryParams,
        ...(method === 'GET' ? {} : { data }),
        headers: {
          ...authHeadersForUrl(url, token),
          'Content-Type': bodyEncoding === 'form' ? 'application/x-www-form-urlencoded;charset=UTF-8' : 'application/json',
          'xsy-inner-source': 'bff',
        },
        timeout: 30000,
        maxRedirects: 0,
        maxContentLength: 5 * 1024 * 1024,
        maxBodyLength: 5 * 1024 * 1024,
        validateStatus: () => true,
        signal,
      });
    } catch (error: any) {
      if (signal?.aborted || error?.name === 'AbortError') throw error;
      const status = error?.response?.status;
      const detail = redact(error?.response?.data ?? error?.message ?? String(error), token);
      throw new Error(`Open API ${method} ${new URL(url).pathname}${status ? ` 返回 HTTP ${status}` : ' 请求失败'}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
    }

    return {
      success: response.status >= 200 && response.status < 300,
      method,
      url: `${new URL(url).origin}${new URL(url).pathname}${new URL(url).search}`,
      status: response.status,
      data: redact(response.data, token),
    };
  }
}
