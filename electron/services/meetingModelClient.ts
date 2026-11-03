import axios from 'axios';
import type { AiConfigData, AiProviderConfig } from '../../shared/types';

/** Preserve gateway prefixes and complete endpoints instead of appending another /v1. */
export function resolveMeetingEndpoints(provider: AiProviderConfig, modelId: string) {
  let url: URL;
  try { url = new URL(provider.baseUrl.trim()); } catch { throw new Error('模型供应商的 Base URL 无效，请检查模型设置'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('模型供应商的 Base URL 必须是 HTTP(S) 地址，认证信息请填写在 API Key 中');
  }
  url.hash = '';
  const path = url.pathname.replace(/\/+$/, '');
  const nativeGemini = provider.protocol === 'google-gemini' && !/\/openai(?:\/chat\/completions)?$/.test(path);
  const operation = nativeGemini
    ? `/models/${modelId.replace(/^models\//, '').split('/').map(encodeURIComponent).join('/')}:generateContent`
    : provider.protocol === 'anthropic-messages' ? '/messages'
    : provider.protocol === 'openai-responses' ? '/responses' : '/chat/completions';
  const prefix = path.replace(/\/(?:chat\/completions|responses|messages|models\/.+:generateContent)$/, '');
  const completeEndpoint = prefix !== path;
  const roots = completeEndpoint || prefix ? [prefix] : [nativeGemini ? '/v1beta' : '/v1'];
  // Only an unversioned base has an alternate convention. Never probe other hosts or protocols.
  if (!completeEndpoint && !nativeGemini && !/\/v\d[^/]*(?:\/|$)/.test(prefix)) {
    roots.push(prefix ? `${prefix}/v1` : '');
  }
  return {
    nativeGemini,
    endpoints: [...new Set(roots)].map(root => { const endpoint = new URL(url); endpoint.pathname = root + operation; return endpoint.toString(); }),
  };
}

function isModelNotFound(error: any): boolean {
  const data = error?.response?.data;
  const info = [data?.error?.code, data?.error?.type, data?.error?.message, data?.code, data?.message, typeof data?.error === 'string' ? data.error : ''];
  return /model|deployment|模型/i.test(info.filter(v => typeof v === 'string').join(' '));
}

function meetingRequestError(error: any, provider: AiProviderConfig, modelId: string, endpoint?: string): Error {
  const status = error?.response?.status;
  const hint = status === 404 ? (isModelNotFound(error)
    ? '上游提示模型不存在或当前账号无权使用，请核对模型 ID 与账号权限'
    : '上游未找到接口或模型，请核对 Base URL、接口协议和模型 ID')
    : status === 401 || status === 403 ? '请检查模型账号、API Key 和访问权限'
    : status === 429 ? '模型服务限流或额度不足，请稍后重试并检查余额'
    : status ? '模型服务请求失败'
    : error?.code === 'ECONNABORTED' || error?.name === 'TimeoutError' || error?.code === 'ERR_CANCELED'
      ? '模型请求超时，请稍后重试或检查网络与服务状态' : '模型请求未能完成，请检查网络与服务状态';
  const safe = (value: string) => provider.apiKey?.trim() ? value.split(provider.apiKey.trim()).join('[已隐藏]') : value;
  const address = endpoint ? (() => { const url = new URL(endpoint); return `${url.origin}${url.pathname}`; })() : undefined;
  return new Error(safe(`模型请求失败${status ? `（HTTP ${status}）` : ''}：${hint}。供应商：${provider.name}；模型：${modelId}；协议：${provider.protocol}${address ? `；请求地址：${address}` : ''}`));
}

export function selectMeetingModel(config: AiConfigData, providerId?: string, modelId?: string) {
  const id = providerId || config.settings.defaultProviderId;
  const provider = config.providers.find(p => p.id === id && p.enabled)
    || (!providerId ? config.providers.find(p => p.enabled) : undefined);
  if (!provider) throw new Error('请在设置中选择并启用会议总结使用的模型供应商');
  const preferred = modelId || (provider.id === config.settings.defaultProviderId ? config.settings.defaultModelId : undefined);
  const model = preferred || provider.models?.[0]?.id;
  if (!model) throw new Error(`供应商 ${provider.name} 未配置可用模型`);
  return { provider, modelId: model };
}

/** WorkBuddy returns OpenAI-compatible SSE, sometimes split across arbitrary byte boundaries. */
export async function readMeetingModelStream(stream: AsyncIterable<Uint8Array | string>): Promise<string> {
  let pending = '';
  let content = '';
  let truncated = false;
  const decoder = new TextDecoder();
  const consume = (line: string) => {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    const event = JSON.parse(payload);
    if (event.error) throw new Error(event.error.message || '模型流式响应失败');
    if (event.choices?.[0]?.finish_reason === 'length') truncated = true;
    content += event.choices?.[0]?.delta?.content || event.choices?.[0]?.message?.content || '';
  };
  for await (const part of stream) {
    pending += typeof part === 'string' ? part : decoder.decode(part, { stream: true });
    const lines = pending.split('\n');
    pending = lines.pop() || '';
    lines.forEach(consume);
  }
  pending += decoder.decode();
  if (pending.trim()) consume(pending);
  if (truncated) throw new Error('模型输出额度不足，纪要被截断，请提高模型输出上限或更换模型');
  if (!content.trim()) throw new Error('模型没有返回有效文本');
  return content;
}

export async function requestMeetingModelText(
  provider: AiProviderConfig, modelId: string, system: string, input: string, maxTokens: number,
  workbuddy?: { getAccount: () => any; dispatchChat: (body: any, options: { signal: AbortSignal }) => Promise<AsyncIterable<Uint8Array | string>> },
  requestSignal?: AbortSignal,
  timeoutMs = 180000,
): Promise<string> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = requestSignal ? AbortSignal.any([requestSignal, timeoutSignal]) : timeoutSignal;
  const model = provider.models?.find(m => m.id === modelId);
  const budget = Math.min(maxTokens, model?.maxOutputTokens || maxTokens);
  const messages = [{ role: 'system', content: system }, { role: 'user', content: input }];
  if (provider.id === 'workbuddy') {
    if (!workbuddy?.getAccount()?.accessToken) throw new Error('WorkBuddy 尚未登录，请在模型设置中扫码登录');
    try {
      return await readMeetingModelStream(await workbuddy.dispatchChat({ model: modelId, messages, max_tokens: budget, stream: true }, { signal }));
    } catch (error) {
      if (axios.isAxiosError(error)) throw meetingRequestError(error, provider, modelId);
      throw error;
    }
  }
  if (!provider.apiKey?.trim() && provider.id !== 'ollama' && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(provider.baseUrl)) throw new Error(`供应商 ${provider.name} 尚未配置 API Key`);
  const { endpoints, nativeGemini } = resolveMeetingEndpoints(provider, modelId);
  let body: any = { model: modelId, messages, max_tokens: budget, stream: false };
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider.apiKey?.trim()) headers.Authorization = `Bearer ${provider.apiKey.trim()}`;
  if (provider.protocol === 'openai-responses') {
    body = { model: modelId, instructions: system, input, max_output_tokens: budget };
  } else if (provider.protocol === 'anthropic-messages') {
    delete headers.Authorization;
    headers['x-api-key'] = provider.apiKey.trim();
    headers['anthropic-version'] = '2023-06-01';
    body = { model: modelId, system, messages: [{ role: 'user', content: input }], max_tokens: budget };
  } else if (nativeGemini) {
    delete headers.Authorization;
    headers['x-goog-api-key'] = provider.apiKey.trim();
    body = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: input }] }], generationConfig: { maxOutputTokens: budget } };
  }
  let data: any;
  for (const [index, endpoint] of endpoints.entries()) {
    try {
      ({ data } = await axios.post(endpoint, body, { headers, timeout: timeoutMs, signal }));
      break;
    } catch (error: any) {
      // A missing model, auth error or server failure will not be fixed by changing the route.
      if (error?.response?.status === 404 && !isModelNotFound(error) && index + 1 < endpoints.length) continue;
      throw meetingRequestError(error, provider, modelId, endpoint);
    }
  }
  if (data.choices?.[0]?.finish_reason === 'length' || data.stop_reason === 'max_tokens' || data.status === 'incomplete' || data.candidates?.[0]?.finishReason === 'MAX_TOKENS') throw new Error('模型输出额度不足，纪要被截断，请提高模型输出上限或更换模型');
  const text = data.choices?.[0]?.message?.content
    || data.output_text
    || data.output?.flatMap((o: any) => o.content || []).filter((c: any) => c.type === 'output_text').map((c: any) => c.text).join('')
    || data.content?.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
    || data.candidates?.[0]?.content?.parts?.filter((p: any) => !p.thought).map((p: any) => p.text || '').join('');
  if (typeof text !== 'string' || !text.trim()) throw new Error('模型没有返回有效的会议分析文本');
  return text;
}
