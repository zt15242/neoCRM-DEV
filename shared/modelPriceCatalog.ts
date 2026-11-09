import type { AiModelItem, AiProviderConfig } from './types';
export type PriceCurrency = 'USD' | 'CNY';
export interface ModelPriceReference {
  input: number; output: number; currency: PriceCurrency; source: string; note: string;
  verifiedAt: string; validUntil?: string;
}
const verifiedAt = '2026-11-09';
const entry = (input: number, output: number, currency: PriceCurrency, source: string, note: string, validUntil?: string): ModelPriceReference => ({input, output, currency, source, note, verifiedAt, validUntil});
const google = 'https://ai.google.dev/gemini-api/docs/pricing';
const deepseek = 'https://api-docs.deepseek.com/quick_start/pricing/';
const anthropic = 'https://platform.claude.com/docs/en/about-claude/pricing';
const catalog: Record<string, Record<string, ModelPriceReference>> = {
  'api.openai.com': {
    'gpt-4o': entry(2.5,10,'USD','https://developers.openai.com/api/docs/models/gpt-4o','标准文本价格，未计缓存'),
    'gpt-4o-mini': entry(0.15,0.6,'USD','https://developers.openai.com/api/docs/models/gpt-4o-mini','标准文本价格，未计缓存'),
    'gpt-6-astra': entry(10,50,'USD','https://developers.openai.com/api/docs/models/gpt-6-astra','标准文本价格；长上下文另计'),
    'gpt-5.3-codex': entry(1.75,14,'USD','https://developers.openai.com/api/docs/models/gpt-5.3-codex','标准文本价格'),
    'gpt-5.4': entry(2.5,15,'USD','https://developers.openai.com/api/docs/models/gpt-5.4','标准文本价格；超过 272K 输入的请求价格更高'),
    'o3-mini': entry(1.1,4.4,'USD','https://developers.openai.com/api/docs/models/o3-mini','标准文本价格；官方已停用该型号'),
  },
  'api.deepseek.com': {
    'deepseek-flash': entry(0.3,1.2,'USD',deepseek,'标准峰时、缓存未命中价格；实际存在峰谷价和缓存折扣'),
    'deepseek-v4-flash': entry(0.3,1.2,'USD',deepseek,'旧别名，按 Flash 标准峰时、缓存未命中价格'),
    'deepseek-v4-pro': entry(1.32,3.96,'USD',deepseek,'标准峰时、缓存未命中价格；实际存在峰谷价和缓存折扣'),
  },
  'generativelanguage.googleapis.com': {
    'gemini-3.8-flash': entry(0.75,3.75,'USD',google,'标准文本优惠价，官方预计 2027 年调整','2026-12-31'),
    'gemini-3.5-flash': entry(1.5,9,'USD',google,'标准文本价格'),
    'gemini-3.5-flash-lite': entry(0.3,2.5,'USD',google,'标准文本价格'),
    'gemini-3.1-flash-lite': entry(0.25,1.5,'USD',google,'标准文本价格；音频另计'),
    'gemini-2.5-flash': entry(0.3,2.5,'USD',google,'标准文本价格；官方计划 2026-12-01 路由到其他模型','2026-11-30'),
    'gemini-2.5-pro': entry(1.25,10,'USD',google,'标准文本、输入不超过 200K；官方计划 2026-12-01 切换模型','2026-11-30'),
  },
  'api.siliconflow.cn': {
    'deepseek-ai/DeepSeek-R1': entry(4,16,'CNY','https://api-docs.siliconflow.cn/docs/userguide/guides/batch','硅基流动实时推理参考价；以控制台最新价格为准'),
    'deepseek-ai/DeepSeek-V3': entry(2,8,'CNY','https://api-docs.siliconflow.cn/docs/userguide/guides/batch','硅基流动实时推理参考价；以控制台最新价格为准'),
    'deepseek-ai/DeepSeek-V3.2': entry(4,6,'CNY','https://api-docs.siliconflow.cn/docs/release-notes/overview','硅基流动实时推理参考价；缓存另计'),
    'deepseek-ai/DeepSeek-V4-Flash': entry(3,9,'CNY','https://api-docs.siliconflow.cn/docs/release-notes/overview','硅基流动非优惠时段、缓存未命中价格；存在分时定价'),
  },
  'api.anthropic.com': {
    'claude-fable-5': entry(10,50,'USD',anthropic,'标准文本价格'),
    'claude-opus-5': entry(5,25,'USD',anthropic,'标准文本价格'),
    'claude-sonnet-5': entry(2,10,'USD',anthropic,'官方所列标准文本价格'),
    'claude-haiku-4-5': entry(1,5,'USD',anthropic,'标准文本价格'),
  },
  'dashscope.aliyuncs.com': {
    'qwen-max': entry(2.4,9.6,'CNY','https://help.aliyun.com/zh/model-studio/qwen-max','北京地域、非思考标准价格'),
    'qwen-plus': entry(0.8,2,'CNY','https://help.aliyun.com/zh/model-studio/qwen-plus','北京地域、非思考、输入不超过 128K；长上下文和思考模式不同'),
    'qwen-plus-2025-12-01': entry(0.8,2,'CNY','https://help.aliyun.com/zh/model-studio/qwen-plus','北京地域、非思考、输入不超过 128K；长上下文和思考模式不同'),
  },
};
export function modelPriceReference(provider: Pick<AiProviderConfig,'baseUrl'>, id: string): ModelPriceReference | undefined {
  try { const url = new URL(provider.baseUrl); return url.protocol === 'https:' ? catalog[url.hostname.toLowerCase()]?.[id.replace(/^models\//,'')] : undefined; }
  catch { return undefined; }
}
/** Match verified model names explicitly; unknown gateway aliases are never guessed. */
export function modelVendorPriceSuggestion(modelId: string): { modelId: string; reference: ModelPriceReference; inferred: boolean } | undefined {
  const id = modelId.replace(/^models\//i, '').trim().toLowerCase();
  const aliases: Record<string, [string, string]> = {
    'deepseek-v4.1-flash': ['api.deepseek.com', 'deepseek-flash'],
    'deepseek-v4-1-flash': ['api.deepseek.com', 'deepseek-flash'],
    'gemini-3.8-flash-high': ['generativelanguage.googleapis.com', 'gemini-3.8-flash'],
  };
  if (aliases[id]) {
    const [host, canonical] = aliases[id];
    return { modelId: canonical, reference: catalog[host][canonical], inferred: true };
  }
  const matches = Object.values(catalog).flatMap(models => Object.entries(models).filter(([key]) => key.toLowerCase() === id));
  if (matches.length !== 1) return undefined;
  return { modelId: matches[0][0], reference: matches[0][1], inferred: false };
}
export function effectiveModelPrice(provider: Pick<AiProviderConfig,'baseUrl'>, model: AiModelItem | undefined, at = new Date()): {input:number;output:number;currency:PriceCurrency;source:'user'|'reference'} | undefined {
  if (!model) return undefined;
  if (model.inputPricePerMillion !== undefined || model.outputPricePerMillion !== undefined || model.priceSource === 'user') {
    const input = model.inputPricePerMillion, output = model.outputPricePerMillion;
    return typeof input === 'number' && Number.isFinite(input) && input >= 0 && typeof output === 'number' && Number.isFinite(output) && output >= 0
      ? {input,output,currency:model.priceCurrency || 'USD',source:'user'} : undefined;
  }
  const ref = modelVendorPriceSuggestion(model.id)?.reference;
  if (!ref || (ref.validUntil && at.toISOString().slice(0,10) > ref.validUntil)) return undefined;
  return {input:ref.input,output:ref.output,currency:ref.currency,source:'reference'};
}
