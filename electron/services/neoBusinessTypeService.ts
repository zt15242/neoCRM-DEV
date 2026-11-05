import axios, { type AxiosRequestConfig } from 'axios';
import fs from 'node:fs';
import path from 'node:path';
import type { NeoEnvironment, TokenData } from '../../shared/types';

export interface BusinessTypeSource {
  apiKey: string;
  label: string;
  description?: string;
  active?: boolean;
}

export interface BusinessTypeDeployInput extends Partial<BusinessTypeSource> {
  entityApiKey: string;
  sourceFile?: string;
  dryRun?: boolean;
  confirm?: boolean;
}

type Request = (config: AxiosRequestConfig) => Promise<{ data: any }>;
const fallbackReason = 'neo CLI 1.0.8 没有业务类型创建或更新命令，使用连接器 Metadata API';

function safeError(error: unknown, token: TokenData): string {
  let message = String((error as any)?.message || error);
  for (const secret of [token.access_token, token.refresh_token, token.cookieString]) {
    if (secret) message = message.split(secret).join('[REDACTED]');
  }
  return message.replace(/\s+/g, ' ').slice(0, 500);
}

function apiKey(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) throw new Error('业务类型或对象 API Key 无效');
  return value;
}

function sourceOf(value: any): BusinessTypeSource {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('业务类型 source 必须是 JSON 对象');
  const key = apiKey(value.apiKey);
  if (typeof value.label !== 'string' || !value.label.trim()) throw new Error('缺少业务类型显示名 label');
  if (value.description !== undefined && typeof value.description !== 'string') throw new Error('description 必须是字符串');
  if (value.active !== undefined && typeof value.active !== 'boolean') throw new Error('active 必须是布尔值');
  return { apiKey: key, label: value.label.trim(),
    ...(value.description === undefined ? {} : { description: value.description }),
    ...(value.active === undefined ? {} : { active: value.active }) };
}

export function readBusinessTypeSource(root: string | undefined, input: BusinessTypeDeployInput): BusinessTypeSource {
  if (!input.sourceFile) return sourceOf(input);
  if (!root) throw new Error('部署本地业务类型 source 前需要绑定项目目录');
  if ([input.apiKey, input.label, input.description, input.active].some((value) => value !== undefined)) {
    throw new Error('sourceFile 与内联业务类型属性不能同时提供');
  }
  const realRoot = fs.realpathSync(root);
  const file = fs.realpathSync(path.resolve(realRoot, input.sourceFile));
  const relative = path.relative(realRoot, file);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('业务类型 source 超出当前项目目录');
  if (!fs.statSync(file).isFile() || fs.statSync(file).size > 1024 * 1024) throw new Error('业务类型 source 文件无效或过大');
  return sourceOf(JSON.parse(fs.readFileSync(file, 'utf8')));
}

/** CLI 1.0.8 has no business-type writer. Keep this exception inside the shared connector. */
export class NeoBusinessTypeService {
  constructor(private request: Request = (config) => axios.request(config)) {}

  private async call(env: NeoEnvironment, token: TokenData, method: string, endpoint: string, data?: unknown, signal?: AbortSignal) {
    if ((env.productType || 'neocrm') !== 'neocrm') throw new Error('业务类型工具仅支持销售易连接器');
    signal?.throwIfAborted();
    const origin = new URL(token.instance_uri || env.neoBaseURL).origin;
    let response;
    try {
      response = await this.request({ method, url: `${origin}${endpoint}`, data, signal, timeout: 20000,
        maxRedirects: 0, headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json', 'xsy-inner-source': 'bff' } });
    } catch (error: any) {
      if (signal?.aborted || error?.name === 'AbortError') throw error;
      const body = error?.response?.data;
      const status = error?.response?.status;
      const detail = body?.msg || body?.message || error?.message || error;
      const context = `${method} ${endpoint}${status ? `, HTTP ${status}` : ''}${body?.code !== undefined ? `, code=${safeError(body.code, token)}` : ''}`;
      throw new Error(`业务类型接口请求失败 (${context}): ${safeError(detail, token)}`);
    }
    const envelope = response.data;
    const objectBody = envelope !== null && typeof envelope === 'object' && !Array.isArray(envelope);
    const hasCode = objectBody && Object.prototype.hasOwnProperty.call(envelope, 'code');
    // Metadata tenants use both 200 and 0, just like the connector's data APIs.
    // Explicit errors still take precedence over a success code or message.
    if (envelope?.success === false || envelope?.error ||
        (hasCode && ![0, '0', 200, '200'].includes(envelope.code))) {
      const detail = typeof envelope?.error === 'string' ? envelope.error
        : envelope?.error?.message || envelope?.error?.msg || envelope?.msg || envelope?.message || '响应包含错误状态';
      const context = `${method} ${endpoint}${hasCode ? `, code=${safeError(envelope.code, token)}` : ''}`;
      throw new Error(`业务类型接口失败 (${context}): ${safeError(detail, token)}`);
    }
    // Keep bare bodies, and accept both platform payload envelope conventions.
    const wrapped = hasCode || (objectBody && envelope.success === true && ('data' in envelope || 'result' in envelope));
    return wrapped ? (envelope.data !== undefined ? envelope.data : envelope.result) : envelope;
  }

  private async records(env: NeoEnvironment, token: TokenData, entity: string, signal?: AbortSignal): Promise<BusinessTypeSource[]> {
    const data = await this.call(env, token, 'GET', `/rest/metadata/v3.1/xobjects/${entity}/busiTypes`, undefined, signal);
    const records = Array.isArray(data) ? data : data?.records || data?.busiTypes;
    if (!Array.isArray(records)) throw new Error('业务类型列表响应无效，不能将读取失败当作空列表');
    if (data?.totalSize != null && Number(data.totalSize) !== records.length) throw new Error('业务类型列表不完整');
    if (data?.total != null && Number(data.total) !== records.length) throw new Error('业务类型列表不完整');
    const result = records.map((item) => sourceOf({ ...item, label: item?.label || item?.apiKey,
      description: item?.description ?? undefined, active: item?.active ?? undefined }));
    if (new Set(result.map((item) => item.apiKey)).size !== result.length) throw new Error('业务类型列表包含重复 API Key');
    return result;
  }

  public async list(env: NeoEnvironment, token: TokenData, entityApiKey: string, signal?: AbortSignal) {
    const entity = apiKey(entityApiKey);
    const businessTypes = await this.records(env, token, entity, signal);
    return { source: 'connector-fallback', fallbackReason, entityApiKey: entity, totalCount: businessTypes.length, businessTypes };
  }

  public async deploy(env: NeoEnvironment, token: TokenData, input: BusinessTypeDeployInput, root?: string, signal?: AbortSignal) {
    const dryRun = input.dryRun !== false;
    if (!dryRun && input.confirm !== true) throw new Error('业务类型写入需要先展示预演结果并取得用户确认，再传 dryRun=false、confirm=true');
    const entity = apiKey(input.entityApiKey);
    const source = readBusinessTypeSource(root, input);
    let existing: BusinessTypeSource[];
    try {
      const detail = await this.call(env, token, 'GET', `/rest/metadata/v2.0/xobjects/${entity}`, undefined, signal);
      // v2 metadata can return data.records as one object, not only a bare object.
      const records = detail?.apiKey ? detail : (detail?.records ?? detail);
      if (Array.isArray(records) && records.length !== 1) throw new Error('对象详情必须恰好包含一个目标对象');
      if (detail?.records !== undefined && ['totalSize', 'count'].some(key => detail[key] != null && Number(detail[key]) !== 1)) {
        throw new Error('对象详情记录数量不一致');
      }
      const object = Array.isArray(records) ? records[0] : records;
      if (object?.apiKey !== entity) throw new Error('未能核实目标对象，停止业务类型部署');
      if (object.enableBusitype !== true) throw new Error('目标对象未启用业务类型；请先确认并通过 neo CLI 更新对象开关');
      existing = await this.records(env, token, entity, signal);
    } catch (error: any) {
      if (signal?.aborted || error?.name === 'AbortError') throw error;
      throw Object.assign(new Error(`业务类型部署预检失败（未发送写入请求）: ${safeError(error, token)}`), { writeAttempted: false });
    }
    // The API appends exactly one suffix; preserve the user's complete target key.
    const baseKey = source.apiKey.replace(/__c$/i, '');
    const fullKey = `${baseKey}__c`;
    const matches = existing.filter((item) => item.apiKey === source.apiKey || item.apiKey === fullKey);
    if (matches.length > 1) throw new Error('业务类型 API Key 存在歧义，停止部署');
    const previous = matches[0];
    const expected = { ...source, apiKey: previous?.apiKey || fullKey };
    const same = (item: BusinessTypeSource) => item.label === expected.label &&
      (expected.description === undefined || (item.description || '') === expected.description) &&
      (expected.active === undefined || item.active === expected.active);
    const operation = previous ? (same(previous) ? 'unchanged' : 'update') : 'create';
    const plan = { source: 'connector-fallback', fallbackReason, entityApiKey: entity,
      tenantId: token.tenant_id, instanceUri: new URL(token.instance_uri || env.neoBaseURL).origin,
      operation, previous, expected, sourceFile: input.sourceFile, dryRun };
    if (dryRun || operation === 'unchanged') return { ...plan, success: true, verified: !dryRun };

    const { apiKey: _key, ...properties } = source;
    const endpoint = previous
      ? `/rest/metadata/v3.1/xobjects/${entity}/busitypes/${previous.apiKey}`
      : `/rest/metadata/v3.1/xobjects/${entity}/busiTypes`;
    // Never retry a tenant write: a timeout can mean the server already applied it.
    try {
      await this.call(env, token, previous ? 'PATCH' : 'POST', endpoint,
        previous ? properties : { ...properties, apiKey: baseKey }, signal);
    } catch (error: any) {
      if (signal?.aborted || error?.name === 'AbortError') throw error;
      throw Object.assign(new Error(`业务类型写入未确认: ${error.message}；先调用 list_business_types 核实，不要重复写入`), { writeAttempted: true });
    }
    try {
      const actual = (await this.records(env, token, entity, signal)).find((item) => item.apiKey === expected.apiKey);
      if (!actual || !same(actual)) throw new Error('回读未找到匹配的业务类型属性');
      return { ...plan, success: true, writeAccepted: true, verified: true, businessType: actual };
    } catch (error: any) {
      if (signal?.aborted || error?.name === 'AbortError') throw error;
      return { ...plan, success: false, writeAccepted: true, verified: false,
        verificationPending: true, error: `接口已接受写入，回读未确认: ${error.message}；先调用 list_business_types 核实，不要重复写入` };
    }
  }
}
