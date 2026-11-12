import React, { useEffect, useState } from 'react';
import type { AiProviderConfig } from '../../../shared/types';
import { ModelOptions } from './ModelOptions';
import { modelTokenReference } from '../../../shared/modelTokenCatalog';
import { modelVendorPriceSuggestion, effectiveModelPrice, type PriceCurrency } from '../../../shared/modelPriceCatalog';

export const ModelContextSettings = React.memo(function ModelContextSettings({ providers, onSave, showToast }: {
  providers: AiProviderConfig[];
  onSave: (provider: AiProviderConfig) => Promise<void>;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const availableProviders = providers.filter((item) => item.models.length);
  const [providerId, setProviderId] = useState(availableProviders[0]?.id || '');
  const provider = availableProviders.find((item) => item.id === providerId) || availableProviders[0];
  const [modelId, setModelId] = useState('');
  const model = provider?.models.find((item) => item.id === modelId) || provider?.models[0];
  const [context, setContext] = useState('');
  const [output, setOutput] = useState('');
  const [inputPrice, setInputPrice] = useState('');
  const [outputPrice, setOutputPrice] = useState('');
  const [currency, setCurrency] = useState<PriceCurrency>('USD');
  const [priceEdited, setPriceEdited] = useState(false);
  const [resetPrice, setResetPrice] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    setContext(model?.contextWindow ? String(model.contextWindow) : '');
    setOutput(model?.maxOutputTokens ? String(model.maxOutputTokens) : '');
    const price = provider && model ? effectiveModelPrice(provider, model) : undefined;
    setInputPrice(price ? String(price.input) : model?.inputPricePerMillion === undefined ? '' : String(model.inputPricePerMillion));
    setOutputPrice(price ? String(price.output) : model?.outputPricePerMillion === undefined ? '' : String(model.outputPricePerMillion));
    setCurrency(price?.currency || model?.priceCurrency || 'USD');
    setPriceEdited(false); setResetPrice(false);
    setAttempted(false);
  }, [provider?.id, model?.id, model?.contextWindow, model?.maxOutputTokens, model?.inputPricePerMillion, model?.outputPricePerMillion, model?.priceCurrency, model?.priceSource, provider?.baseUrl]);
  if (!provider || !model) return null;
  const reference = modelTokenReference(provider, model.id);
  const suggestedPrice = modelVendorPriceSuggestion(model.id);
  const displayPrice = suggestedPrice?.reference;
  const priceActive = effectiveModelPrice(provider, model);
  const priceExpired = !!displayPrice?.validUntil && new Date().toISOString().slice(0, 10) > displayPrice.validUntil;
  const capacity = context.trim() ? Number(context) : undefined;
  const limit = output.trim() ? Number(output) : undefined;
  const capacityError = capacity !== undefined && (!Number.isSafeInteger(capacity) || capacity < 1024)
    ? '请输入不小于 1,024 的整数，或留空使用保守预算。' : '';
  const outputError = limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)
    ? '请输入正整数，或留空使用对话输出设置。'
    : capacity !== undefined && limit !== undefined && limit >= capacity
      ? '最大输出必须小于上下文总容量。若不确定模型输出上限，可留空。' : '';
  const pricesValid = [inputPrice, outputPrice].every(value => !value.trim() || (Number.isFinite(Number(value)) && Number(value) >= 0));
  const save = async () => {
    setAttempted(true);
    if (!pricesValid) { showToast('error', '参考价格必须是非负数字，或留空。'); return; }
    if (capacityError || outputError) {
      showToast('error', capacityError || outputError);
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...provider, models: provider.models.map((item) => item.id === model.id
        ? { ...item, contextWindow: capacity, maxOutputTokens: limit, ...(priceEdited ? resetPrice ? { inputPricePerMillion: undefined, outputPricePerMillion: undefined, priceCurrency: undefined, priceSource: undefined } : { inputPricePerMillion: inputPrice.trim() ? Number(inputPrice) : undefined, outputPricePerMillion: outputPrice.trim() ? Number(outputPrice) : undefined, priceCurrency: currency, priceSource: 'user' as const } : {}), tokenLimitsSource: 'user' as const } : item) });
      showToast('success', '模型容量和价格设置已保存');
    } catch {
      showToast('error', '保存模型容量失败，请重试');
    } finally { setSaving(false); }
  };
  return <div className="model-settings__context rounded-2xl border border-slate-200 bg-white p-4 space-y-3 text-xs shadow-2xs">
    <div className="font-semibold text-sm text-slate-800">模型上下文容量</div>
    <p className="text-slate-500">容量应以当前供应商或网关的实际限制为准，官方参考值可能高于网关可用值。未知容量按 32,768 tokens 保守预算；若上游报告超限，会逐步收紧预算并记住该模型网关的较低限制。请求用量为估算值。</p>
    {reference ? <div className="flex flex-wrap items-center gap-2 text-slate-500">
      <span>官方参考：{reference.contextWindow.toLocaleString()} 上下文 / {reference.maxOutputTokens.toLocaleString()} 最大输出</span>
      <button type="button" className="text-sky-700 hover:underline" onClick={() => { setContext(String(reference.contextWindow)); setOutput(String(reference.maxOutputTokens)); setAttempted(false); }}>采用参考值</button>
      <a className="text-sky-700 hover:underline" href={reference.source} target="_blank" rel="noreferrer">来源</a>
    </div> : <p className="text-slate-500">暂无该供应商和模型的官方参考值，请使用接口返回值或手动填写。</p>}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <label className="space-y-1"><span>供应商</span>
        <select aria-label="上下文容量供应商" className="w-full rounded-lg border border-slate-200 px-2 py-1.5" value={provider.id}
          onChange={(event) => { setProviderId(event.target.value); setModelId(''); }}>
          {availableProviders.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label className="space-y-1"><span>模型</span>
        <select aria-label="上下文容量模型" className="w-full rounded-lg border border-slate-200 px-2 py-1.5" value={model.id} onChange={(event) => setModelId(event.target.value)}>
          <ModelOptions models={provider.models} />
        </select>
      </label>
      <label className="space-y-1"><span>上下文容量（tokens）</span>
        <input aria-label="模型上下文容量" type="number" min={1024} step={1} value={context} placeholder="未提供，保守预算 32768"
          aria-invalid={attempted && !!capacityError} aria-describedby={attempted && capacityError ? 'context-capacity-error' : 'context-capacity-help'}
          onChange={(event) => setContext(event.target.value)} className={`w-full rounded-lg border px-2 py-1.5 font-mono ${attempted && capacityError ? 'border-rose-500' : 'border-slate-200'}`} />
        <span id="context-capacity-help" className="block text-[11px] leading-relaxed text-slate-500">输入、回复及系统预留空间共同使用的总容量。</span>
        {attempted && capacityError && <span id="context-capacity-error" role="alert" className="block text-[11px] leading-relaxed text-rose-700">{capacityError}</span>}
      </label>
      <label className="space-y-1"><span>模型最大输出（tokens）</span>
        <input aria-label="模型最大输出" type="number" min={1} step={1} value={output} placeholder="未提供，使用对话输出设置"
          aria-invalid={attempted && !!outputError} aria-describedby={attempted && outputError ? 'context-output-error' : 'context-output-help'}
          onChange={(event) => setOutput(event.target.value)} className={`w-full rounded-lg border px-2 py-1.5 font-mono ${attempted && outputError ? 'border-rose-500' : 'border-slate-200'}`} />
        <span id="context-output-help" className="block text-[11px] leading-relaxed text-slate-500">模型单次回复的上限，通常远小于总容量；不确定可留空。</span>
        {attempted && outputError && <span id="context-output-error" role="alert" className="block text-[11px] leading-relaxed text-rose-700">{outputError}</span>}
      </label>
    </div>
    <div className="flex flex-wrap gap-2 items-center text-slate-500">
      {displayPrice ? <><span>模型公开 API 参考价（按模型匹配）（核验于 {displayPrice.verifiedAt}）：{displayPrice.currency} {displayPrice.input} / {displayPrice.output} · {displayPrice.note}{suggestedPrice?.inferred ? `；按网关型号名称对应 ${suggestedPrice.modelId}，实际路由请确认` : ''}</span><a href={displayPrice.source} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">价格来源</a></> : <span>暂无可核实的型号价格；套餐或自动路由模型请查看供应商积分或账单，也可手动填写。</span>}
      {provider.id === 'workbuddy' && <span>WorkBuddy 按套餐和积分计费，可在下方 WorkBuddy 账户查看积分；此处并非网关账单。</span>}
      {priceExpired && !priceActive && <span className="text-amber-700">该参考价已过期，请核实并手动填写。</span>}
      {displayPrice && !priceExpired && <button type="button" className="text-sky-700 hover:underline" onClick={() => { setInputPrice(String(displayPrice.input)); setOutputPrice(String(displayPrice.output)); setCurrency(displayPrice.currency); setResetPrice(false); setPriceEdited(true); }}>填入参考价</button>}
      {displayPrice && !priceExpired && (model.priceSource === 'user' || model.inputPricePerMillion !== undefined || model.outputPricePerMillion !== undefined) && <button type="button" className="text-sky-700 hover:underline" onClick={() => { setInputPrice(String(displayPrice.input)); setOutputPrice(String(displayPrice.output)); setCurrency(displayPrice.currency); setResetPrice(true); setPriceEdited(true); }}>恢复自动价格</button>}
    </div>
    <label className="block text-slate-600">价格币种 <select aria-label="价格币种" value={currency} onChange={e => { setCurrency(e.target.value as PriceCurrency); setResetPrice(false); setPriceEdited(true); }} className="ml-2 rounded-lg border border-slate-200 px-2 py-1"><option value="USD">美元 USD</option><option value="CNY">人民币 CNY</option></select></label>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <label>输入参考价格（每百万 tokens）<input aria-label="输入参考价格" type="number" min="0" step="any" value={inputPrice} onChange={e => { setInputPrice(e.target.value); setResetPrice(false); setPriceEdited(true); }} placeholder="未配置，不估算费用" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5" /></label>
      <label>输出参考价格（每百万 tokens）<input aria-label="输出参考价格" type="number" min="0" step="any" value={outputPrice} onChange={e => { setOutputPrice(e.target.value); setResetPrice(false); setPriceEdited(true); }} placeholder="未配置，不估算费用" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5" /></label>
    </div><p className="text-slate-500">按模型参考价自动估算；手动价格优先。网关、积分套餐、缓存、阶梯和附加费用可能不同，实际以账单为准。</p>
    <div className="flex justify-end"><button type="button" disabled={saving} onClick={save} className="rounded-lg bg-sky-600 px-3 py-1.5 text-white disabled:opacity-50">{saving ? '保存中…' : '保存容量'}</button></div>
  </div>;
});
