import { memo, useMemo, useState } from 'react';
import { BrainCircuit, Trash2 } from 'lucide-react';
import type { AiModelItem } from '../../../shared/types';

const PAGE_SIZE = 50;

export const ModelCatalog = memo(function ModelCatalog({ models, onRemove }: {
  models: AiModelItem[];
  onRemove: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return text ? models.filter(model => `${model.id} ${model.name}`.toLowerCase().includes(text)) : models;
  }, [models, query]);
  const lastPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  return <div className="space-y-2">
    <input aria-label="搜索模型" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }}
      placeholder="搜索全部模型的名称或 ID" className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs" />
    <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 bg-slate-50/50">
      {filtered.length === 0 ? <div className="py-6 text-center text-slate-500">{models.length ? '没有匹配的模型' : '暂无模型，请在下方手动添加或点击探测'}</div>
        : filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(model => (
          <div key={model.id} data-model-id={model.id} className="flex items-center justify-between px-3 py-1.5 bg-white">
            <div className="flex items-center space-x-2 truncate">
              <span className="font-mono text-slate-800 text-[11px] truncate">{model.id}</span>
              {model.name !== model.id && <span className="text-slate-500 text-[10px]">({model.name})</span>}
              {model.reasoning && <span className="text-[9px] px-1.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center space-x-0.5"><BrainCircuit className="w-2.5 h-2.5" /><span>思考推理</span></span>}
            </div>
            <button type="button" aria-label={`移除模型 ${model.id}`} onClick={() => onRemove(model.id)} className="p-1 text-slate-500 hover:text-rose-600 rounded"><Trash2 className="w-3 h-3" /></button>
          </div>
        ))}
    </div>
    <div className="flex items-center justify-between text-[11px] text-slate-600">
      <span>{filtered.length} 个匹配 / 共 {models.length} 个模型</span>
      <div className="flex items-center gap-2">
        <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40">上一页</button>
        <span>{currentPage + 1} / {lastPage + 1}</span>
        <button type="button" disabled={currentPage >= lastPage} onClick={() => setPage(currentPage + 1)} className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40">下一页</button>
      </div>
    </div>
  </div>;
});
