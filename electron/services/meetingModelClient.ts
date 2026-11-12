import type { AiConfigData, AiProviderConfig } from '../../shared/types';
import { modelGatewayProxy } from './agent/modelGatewayProxy';
import { resolveModelEndpoints } from './agent/modelEndpoint';
import { readWorkBuddyStream } from './agent/workBuddyModelStream';
import type { ModelGatewayClient, WorkBuddyModelBridge } from './agent/modelGatewayTypes';

/** Preserve gateway prefixes and complete endpoints instead of appending another /v1. */
export function resolveMeetingEndpoints(provider: AiProviderConfig, modelId: string) {
  const { nativeGemini, endpoints } = resolveModelEndpoints(provider, modelId);
  return { nativeGemini, endpoints };
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
  let content = '';
  let truncated = false;
  for await (const event of readWorkBuddyStream(stream)) {
    if (event.type === 'text-delta') content += event.text;
    if (event.type === 'finish') truncated = event.reason === 'length';
  }
  if (truncated) throw new Error('模型输出额度不足，纪要被截断，请提高模型输出上限或更换模型');
  if (!content.trim()) throw new Error('模型没有返回有效文本');
  return content;
}

export async function requestMeetingModelText(
  provider: AiProviderConfig, modelId: string, system: string, input: string, maxTokens: number,
  workbuddy?: WorkBuddyModelBridge,
  requestSignal?: AbortSignal,
  timeoutMs = 180000,
  gateway: ModelGatewayClient = modelGatewayProxy,
): Promise<string> {
  const model = provider.models?.find(m => m.id === modelId);
  const budget = Math.min(maxTokens, model?.maxOutputTokens || maxTokens);
  const { text, reason } = await gateway.generateText({
    provider, modelId, system, messages: [{ role: 'user', parts: [{ type: 'text', text: input }] }],
    maxOutputTokens: budget, signal: requestSignal, timeoutMs,
  }, workbuddy);
  if (reason === 'length') throw new Error('模型输出额度不足，纪要被截断，请提高模型输出上限或更换模型');
  if (typeof text !== 'string' || !text.trim()) throw new Error('模型没有返回有效的会议分析文本');
  return text;
}
