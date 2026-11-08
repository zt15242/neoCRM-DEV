import React, { useEffect, useState } from 'react';
import type { AiProviderConfig } from '../../../shared/types';
import { ModelOptions } from './ModelOptions';

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
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    setContext(model?.contextWindow ? String(model.contextWindow) : '');
    setOutput(model?.maxOutputTokens ? String(model.maxOutputTokens) : '');
    setAttempted(false);
  }, [provider?.id, model?.id, model?.contextWindow, model?.maxOutputTokens]);
  if (!provider || !model) return null;
  const capacity = context.trim() ? Number(context) : undefined;
  const limit = output.trim() ? Number(output) : undefined;
  const capacityError = capacity !== undefined && (!Number.isSafeInteger(capacity) || capacity < 1024)
    ? '请输入不小于 1,024 的整数，或留空使用保守预算。' : '';
  const outputError = limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)
    ? '请输入正整数，或留空使用对话输出设置。'
    : capacity !== undefined && limit !== undefined && limit >= capacity
      ? '最大输出必须小于上下文总容量。若不确定模型输出上限，可留空。' : '';
  const save = async () => {
    setAttempted(true);
    if (capacityError || outputError) {
      showToast('error', capacityError || outputError);
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...provider, models: provider.models.map((item) => item.id === model.id
        ? { ...item, contextWindow: capacity, maxOutputTokens: limit } : item) });
      showToast('success', '模型上下文容量已保存，后续请求将按此容量自动管理上下文');
    } catch {
      showToast('error', '保存模型容量失败，请重试');
    } finally { setSaving(false); }
  };
  return <div className="model-settings__context rounded-2xl border border-slate-200 bg-white p-4 space-y-3 text-xs shadow-2xs">
    <div className="font-semibold text-sm text-slate-800">模型上下文容量</div>
    <p className="text-slate-500">按当前供应商或网关提供的模型限制填写。未提供上下文容量时，使用 32,768 tokens 保守预算；请求用量为估算值。</p>
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
    <div className="flex justify-end"><button type="button" disabled={saving} onClick={save} className="rounded-lg bg-sky-600 px-3 py-1.5 text-white disabled:opacity-50">{saving ? '保存中…' : '保存容量'}</button></div>
  </div>;
});
