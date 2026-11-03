import React, { useEffect, useState } from 'react';
import type { AiProviderConfig } from '../../../shared/types';

export function ModelContextSettings({ providers, onSave, showToast }: {
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
  useEffect(() => {
    setContext(model?.contextWindow ? String(model.contextWindow) : '');
    setOutput(model?.maxOutputTokens ? String(model.maxOutputTokens) : '');
  }, [provider?.id, model?.id, model?.contextWindow, model?.maxOutputTokens]);
  if (!provider || !model) return null;
  const save = async () => {
    const capacity = context.trim() ? Number(context) : undefined;
    const limit = output.trim() ? Number(output) : undefined;
    if ((capacity !== undefined && (!Number.isSafeInteger(capacity) || capacity < 1024)) ||
        (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) ||
        (capacity !== undefined && limit !== undefined && limit >= capacity)) {
      showToast('error', '上下文容量须为至少 1024 的整数，输出上限须为正整数且小于上下文容量');
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
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 text-xs">
    <div className="font-semibold text-slate-800">模型上下文容量</div>
    <p className="text-slate-500">优先使用模型接口返回的容量，也可按实际服务配置修改。未提供容量时使用 32,768 tokens 保守预算；请求用量为估算值。系统预留输出和安全空间，在可用输入预算达到 85% 时整理历史。</p>
    <div className="grid grid-cols-2 gap-3">
      <label className="space-y-1"><span>供应商</span>
        <select aria-label="上下文容量供应商" className="w-full rounded-lg border border-slate-200 px-2 py-1.5" value={provider.id}
          onChange={(event) => { setProviderId(event.target.value); setModelId(''); }}>
          {availableProviders.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label className="space-y-1"><span>模型</span>
        <select aria-label="上下文容量模型" className="w-full rounded-lg border border-slate-200 px-2 py-1.5" value={model.id} onChange={(event) => setModelId(event.target.value)}>
          {provider.models.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label className="space-y-1"><span>上下文容量（tokens）</span>
        <input aria-label="模型上下文容量" type="number" min={1024} step={1} value={context} placeholder="未提供，保守预算 32768"
          onChange={(event) => setContext(event.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono" />
      </label>
      <label className="space-y-1"><span>模型最大输出（tokens）</span>
        <input aria-label="模型最大输出" type="number" min={1} step={1} value={output} placeholder="未提供，使用对话输出设置"
          onChange={(event) => setOutput(event.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono" />
      </label>
    </div>
    <div className="flex justify-end"><button type="button" disabled={saving} onClick={save} className="rounded-lg bg-sky-600 px-3 py-1.5 text-white disabled:opacity-50">{saving ? '保存中…' : '保存容量'}</button></div>
  </div>;
}
