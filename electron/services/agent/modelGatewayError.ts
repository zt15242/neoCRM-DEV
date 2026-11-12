import type { AiProviderConfig } from '../../../shared/types';

export type ModelErrorKind = 'context-overflow' | 'payload-too-large' | 'authentication' | 'rate-limit' | 'incomplete-stream'
  | 'model-not-found' | 'endpoint-not-found' | 'network' | 'invalid-response' | 'configuration';

export class ModelGatewayError extends Error {
  readonly name = 'ModelGatewayError';
  constructor(
    public readonly kind: ModelErrorKind,
    message: string,
    public readonly status?: number,
    public readonly retryAfterMs?: number,
    public readonly contextWindow?: number,
  ) { super(message); }
}

/** Never retain the upstream body, cause, headers or credential-bearing URL on public errors. */
export function modelGatewayError(error: unknown, provider: AiProviderConfig, modelId: string, endpoint?: string): ModelGatewayError {
  const source = error as { status?: number; message?: string; code?: string;
    response?: { status?: number; data?: { error?: { code?: string; message?: string }; message?: string } | string }; reason?: {
    _tag?: string; classification?: string; body?: string; message?: string; operation?: string;
    http?: { status?: number }; rateLimit?: { retryAfterMs?: number }; retryAfterMs?: number;
  } };
  const status = source?.status ?? source?.reason?.http?.status ?? source?.response?.status;
  const data = source?.response?.data;
  const diagnostic = `${source?.reason?.body || ''} ${source?.message || ''} ${typeof data === 'string' ? data : `${data?.error?.code || ''} ${data?.error?.message || ''} ${data?.message || ''}`}`;
  const classification = source?.reason?.classification;
  const contextOverflow = status !== undefined && [400, 413, 422].includes(status)
    && /context[_ -]?(?:length|window|limit)|maximum context|too many (?:input )?tokens|prompt (?:is )?too long|上下文.{0,12}(?:超|限制)/i.test(diagnostic);
  const kind: ModelErrorKind = classification === 'context-overflow' || contextOverflow ? 'context-overflow'
    : classification === 'payload-too-large' || status === 413 ? 'payload-too-large'
    : source?.reason?.classification === 'incomplete-stream'
      || source?.reason?._tag === 'InvalidProviderOutput' && /ended unexpectedly|stream.*(?:incomplete|interrupt|end)|流.*(?:中断|不完整)/i.test(diagnostic)
      || source?.reason?._tag === 'Transport' && source.reason.operation === 'read' && status !== undefined && status >= 200 && status < 300
      ? 'incomplete-stream'
    : status === 401 || status === 403 ? 'authentication'
    : status === 429 ? 'rate-limit'
    : status === 404 ? (/model|deployment|模型/i.test(diagnostic) ? 'model-not-found' : 'endpoint-not-found')
    : status === undefined && (source?.reason?._tag === 'Transport' || /ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE/.test(source?.code || '')) ? 'network' : 'invalid-response';
  const hint: Record<ModelErrorKind, string> = {
    'context-overflow': '上游报告上下文超限，请整理上下文或核对网关的实际容量',
    'payload-too-large': '请求体过大，请减少附件大小或工具结果',
    authentication: '请检查模型账号、API Key 和访问权限',
    'rate-limit': '模型服务限流或额度不足，请稍后重试并检查余额',
    'incomplete-stream': '模型流在完整结束前中断',
    'model-not-found': '上游提示模型不存在或当前账号无权使用，请核对模型 ID 与账号权限',
    'endpoint-not-found': '上游未找到接口，请核对 Base URL 和接口协议',
    network: '模型请求未能完成，请检查网络与服务状态',
    'invalid-response': '模型服务未返回有效结果，请检查接口协议与服务状态',
    configuration: '模型配置无效',
  };
  const address = endpoint ? (() => { const url = new URL(endpoint); return `${url.origin}${url.pathname}`; })() : undefined;
  const message = `模型请求失败${status ? `（HTTP ${status}）` : ''}：${hint[kind]}。供应商：${provider.name}；模型：${modelId}；协议：${provider.protocol}${address ? `；请求地址：${address}` : ''}`;
  const safe = provider.apiKey?.trim() ? message.split(provider.apiKey.trim()).join('[已隐藏]') : message;
  const windowMatch = diagnostic.match(/(?:maximum context length|context (?:window|limit)|max(?:imum)?[_ ]context[_ ](?:length|tokens))\D{0,20}([\d,]+)\s*(?:tokens)?/i);
  const contextWindow = windowMatch ? Number(windowMatch[1].replace(/,/g, '')) : undefined;
  return new ModelGatewayError(kind, safe, status, source?.reason?.retryAfterMs ?? source?.reason?.rateLimit?.retryAfterMs,
    Number.isFinite(contextWindow) && contextWindow! > 0 ? contextWindow : undefined);
}
