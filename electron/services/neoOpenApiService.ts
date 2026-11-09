import axios, { type AxiosRequestConfig, type Method } from 'axios';
import FormData from 'form-data';
import path from 'node:path';
import type { NeoEnvironment, TokenData } from '../../shared/types';

export type NeoOpenApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface NeoOpenApiInput {
  method: NeoOpenApiMethod;
  url: string;
  queryParams?: Record<string, unknown>;
  body?: unknown;
  bodyEncoding?: 'json' | 'form' | 'multipart';
  authMode?: 'auto' | 'cookie' | 'oauth';
  file?: { fieldName: string; filePath: string; contentType?: string };
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

function authHeadersForUrl(url: string, token: TokenData, mode: 'auto' | 'cookie' | 'oauth'): Record<string, string> {
  const parsed = new URL(url);
  if (mode === 'cookie' || (mode === 'auto' && parsed.pathname.startsWith('/admin/'))) {
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

  async execute(env: NeoEnvironment, token: TokenData, input: NeoOpenApiInput, signal?: AbortSignal, readAllowedFile?: (filePath: string) => Promise<Buffer>) {
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
    if (!['json', 'form', 'multipart'].includes(bodyEncoding)) throw new Error('bodyEncoding 仅支持 json、form 或 multipart');
    const authMode = input.authMode ?? 'auto';
    if (!['auto', 'cookie', 'oauth'].includes(authMode)) throw new Error('authMode 仅支持 auto、cookie 或 oauth');
    const authHeaders = authHeadersForUrl(url, token, authMode);
    let data: unknown = method === 'GET' ? undefined : bodyEncoding === 'form' ? formBody(input.body) : input.body;
    let contentHeaders: Record<string, string> = { 'Content-Type': bodyEncoding === 'form' ? 'application/x-www-form-urlencoded;charset=UTF-8' : 'application/json' };
    if (bodyEncoding === 'multipart') {
      if (method === 'GET') throw new Error('GET 不支持 multipart 上传');
      if (!input.file || typeof input.file.fieldName !== 'string' || !/^[A-Za-z0-9_.-]{1,128}$/.test(input.file.fieldName)
        || typeof input.file.filePath !== 'string' || !input.file.filePath.trim()) throw new Error('multipart 需要有效的 file.fieldName 和 file.filePath');
      if (!readAllowedFile) throw new Error('当前会话没有可用的文件上传权限');
      if (/[\r\n\x00-\x1f\x7f]/.test(path.basename(input.file.filePath))) throw new Error('文件名包含不支持的控制字符');
      if (input.body !== undefined && (!input.body || typeof input.body !== 'object' || Array.isArray(input.body))) throw new Error('multipart body 必须是字段对象');
      const fields = (input.body || {}) as Record<string, unknown>;
      if (Object.keys(fields).length > 100 || Object.hasOwn(fields, input.file.fieldName)) throw new Error('multipart 字段过多或与文件字段重名');
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) {
        if (!/^[A-Za-z0-9_.-]{1,128}$/.test(key) || !['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) throw new Error('multipart 字段名或字段值无效');
        if (String(value).length > 100_000) throw new Error('multipart 字段内容过大');
        form.append(key, String(value));
      }
      if (input.file.contentType && !/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(input.file.contentType)) throw new Error('文件 contentType 无效');
      signal?.throwIfAborted();
      const bytes = await readAllowedFile(input.file.filePath);
      if (bytes.length > 50 * 1024 * 1024) throw new Error('上传文件超过 50 MB');
      form.append(input.file.fieldName, bytes, { filename: path.basename(input.file.filePath), contentType: input.file.contentType || 'application/octet-stream', knownLength: bytes.length });
      data = form;
      contentHeaders = form.getHeaders();
    } else if (input.file !== undefined) throw new Error('文件上传必须使用 multipart 编码');

    signal?.throwIfAborted();
    let response;
    try {
      response = await this.request({
        method: method as Method,
        url,
        params: input.queryParams,
        ...(method === 'GET' ? {} : { data }),
        headers: {
          ...authHeaders,
          ...contentHeaders,
          'xsy-inner-source': 'bff',
        },
        timeout: 30000,
        maxRedirects: 0,
        maxContentLength: 5 * 1024 * 1024,
        maxBodyLength: bodyEncoding === 'multipart' ? 52 * 1024 * 1024 : 5 * 1024 * 1024,
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
