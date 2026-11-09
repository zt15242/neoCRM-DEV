import type { AiModelItem, AiProviderConfig } from './types';

// Limits are provider-specific. Never infer aliases or apply official limits to a proxy.
// Verified against the linked official model pages on 2026-11-09.
export interface ModelTokenReference { contextWindow: number; maxOutputTokens: number; source: string }
const gemini = (id: string): ModelTokenReference => ({ contextWindow: 1048576, maxOutputTokens: 65536,
  source: `https://ai.google.dev/gemini-api/docs/models/${id}` });
const openai = (id: string, contextWindow: number, maxOutputTokens: number): ModelTokenReference => ({ contextWindow, maxOutputTokens,
  source: `https://developers.openai.com/api/docs/models/${id}` });
const deepseek = (): ModelTokenReference => ({ contextWindow: 1048576, maxOutputTokens: 393216,
  source: 'https://api-docs.deepseek.com/quick_start/pricing/' });
const catalog: Record<string, Record<string, ModelTokenReference>> = {
  'generativelanguage.googleapis.com': Object.fromEntries(['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'].map(id => [id, gemini(id)])),
  'api.openai.com': {
    'gpt-4o': openai('gpt-4o', 128000, 16384), 'gpt-4o-mini': openai('gpt-4o-mini', 128000, 16384),
    'o3-mini': openai('o3-mini', 200000, 100000), 'gpt-5.4': openai('gpt-5.4', 1050000, 128000),
  },
  'api.deepseek.com': { 'deepseek-flash': deepseek(), 'deepseek-v4-flash': deepseek(), 'deepseek-v4-pro': deepseek() },
  'api.anthropic.com': Object.fromEntries(['claude-fable-5', 'claude-opus-5', 'claude-sonnet-5'].map(id => [id,
    { contextWindow: 1000000, maxOutputTokens: 128000, source: 'https://platform.claude.com/docs/en/about-claude/models/overview' }])),
  'dashscope.aliyuncs.com': {
    'qwen-plus-2025-12-01': { contextWindow: 1000000, maxOutputTokens: 32768, source: 'https://help.aliyun.com/zh/model-studio/qwen-plus' },
    'qwen3.6-flash': { contextWindow: 1000000, maxOutputTokens: 65536, source: 'https://help.aliyun.com/zh/model-studio/qwen3-6-flash' },
  },
};
export function modelTokenReference(provider: Pick<AiProviderConfig, 'baseUrl'>, modelId: string): ModelTokenReference | undefined {
  try {
    const url = new URL(provider.baseUrl);
    if (url.protocol !== 'https:') return undefined;
    return catalog[url.hostname.toLowerCase()]?.[modelId.replace(/^models\//, '')];
  } catch { return undefined; }
}
export function applyModelTokenReference(provider: AiProviderConfig, model: AiModelItem): AiModelItem {
  const reference = modelTokenReference(provider, model.id);
  if (!reference || model.tokenLimitsSource === 'user') return model;
  const contextWindow = model.contextWindow ?? reference.contextWindow;
  const maxOutputTokens = model.maxOutputTokens ?? (reference.maxOutputTokens < contextWindow ? reference.maxOutputTokens : undefined);
  return { ...model, contextWindow, maxOutputTokens };
}
