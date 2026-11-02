import axios from 'axios';
import type { AiConfigData, AiProviderConfig } from '../../shared/types';

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
): Promise<string> {
  const signal = AbortSignal.timeout(180000);
  const model = provider.models?.find(m => m.id === modelId);
  const budget = Math.min(maxTokens, model?.maxOutputTokens || maxTokens);
  const messages = [{ role: 'system', content: system }, { role: 'user', content: input }];
  if (provider.id === 'workbuddy') {
    if (!workbuddy?.getAccount()?.accessToken) throw new Error('WorkBuddy 尚未登录，请在模型设置中扫码登录');
    return readMeetingModelStream(await workbuddy.dispatchChat({ model: modelId, messages, max_tokens: budget, stream: true }, { signal }));
  }
  if (!provider.apiKey?.trim() && provider.id !== 'ollama' && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(provider.baseUrl)) throw new Error(`供应商 ${provider.name} 尚未配置 API Key`);
  const base = provider.baseUrl.trim().replace(/\/+$/, '');
  const versioned = /\/v\d[^/]*(?:\/|$)/.test(base) ? base : `${base}/v1`;
  let endpoint = `${versioned}/chat/completions`;
  let body: any = { model: modelId, messages, max_tokens: budget, stream: false };
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider.apiKey?.trim()) headers.Authorization = `Bearer ${provider.apiKey.trim()}`;
  if (provider.protocol === 'openai-responses') {
    endpoint = `${versioned}/responses`;
    body = { model: modelId, instructions: system, input, max_output_tokens: budget };
  } else if (provider.protocol === 'anthropic-messages') {
    endpoint = `${versioned}/messages`;
    delete headers.Authorization;
    headers['x-api-key'] = provider.apiKey.trim();
    headers['anthropic-version'] = '2023-06-01';
    body = { model: modelId, system, messages: [{ role: 'user', content: input }], max_tokens: budget };
  } else if (provider.protocol === 'google-gemini' && !base.endsWith('/openai')) {
    endpoint = `${versioned}/models/${modelId.replace(/^models\//, '')}:generateContent`;
    delete headers.Authorization;
    headers['x-goog-api-key'] = provider.apiKey.trim();
    body = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: input }] }], generationConfig: { maxOutputTokens: budget } };
  }
  const { data } = await axios.post(endpoint, body, { headers, timeout: 180000, signal });
  if (data.choices?.[0]?.finish_reason === 'length' || data.stop_reason === 'max_tokens' || data.status === 'incomplete' || data.candidates?.[0]?.finishReason === 'MAX_TOKENS') throw new Error('模型输出额度不足，纪要被截断，请提高模型输出上限或更换模型');
  const text = data.choices?.[0]?.message?.content
    || data.output_text
    || data.output?.flatMap((o: any) => o.content || []).filter((c: any) => c.type === 'output_text').map((c: any) => c.text).join('')
    || data.content?.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
    || data.candidates?.[0]?.content?.parts?.filter((p: any) => !p.thought).map((p: any) => p.text || '').join('');
  if (typeof text !== 'string' || !text.trim()) throw new Error('模型没有返回有效的会议分析文本');
  return text;
}
