import React, { useState, useEffect } from 'react';
import { EntityMetadata, AiContextEntityRef } from '../../../shared/types';
import { Search, Box, X, Check, Loader2, ShieldAlert } from 'lucide-react';

interface ContextEntityModalProps {
  isOpen: boolean;
  isLoggedIn: boolean;
  selectedRefs: AiContextEntityRef[];
  onClose: () => void;
  onConfirm: (refs: AiContextEntityRef[]) => void;
}

export const ContextEntityModal: React.FC<ContextEntityModalProps> = ({
  isOpen,
  isLoggedIn,
  selectedRefs,
  onClose,
  onConfirm,
}) => {
  const [entities, setEntities] = useState<EntityMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [localSelected, setLocalSelected] = useState<AiContextEntityRef[]>(selectedRefs);

  useEffect(() => {
    setLocalSelected(selectedRefs);
  }, [selectedRefs, isOpen]);

  useEffect(() => {
    if (isOpen && isLoggedIn && entities.length === 0) {
      setLoading(true);
      window.neoApi
        .getEntities()
        .then((list) => setEntities(list || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isOpen, isLoggedIn]);

  if (!isOpen) return null;

  const filtered = entities.filter((e) => {
    if (!keyword.trim()) return true;
    const kw = keyword.toLowerCase();
    return e.label.toLowerCase().includes(kw) || e.apiKey.toLowerCase().includes(kw);
  });

  const toggleSelect = (entity: EntityMetadata) => {
    const exists = localSelected.some((r) => r.apiKey === entity.apiKey);
    if (exists) {
      setLocalSelected(localSelected.filter((r) => r.apiKey !== entity.apiKey));
    } else {
      setLocalSelected([
        ...localSelected,
        {
          apiKey: entity.apiKey,
          label: entity.label,
          isStandard: entity.isStandard,
        },
      ]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-sky-100 text-sky-600">
              <Box className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">挂载业务对象元数据上下文 (@Entity)</h3>
              <p className="text-[11px] text-slate-500">选中对象后，AI 将感知其对象定义并可自动读取其字段结构</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex-1 overflow-hidden flex flex-col space-y-3">
          {!isLoggedIn ? (
            <div className="py-10 text-center space-y-2">
              <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto" />
              <div className="text-xs font-medium text-slate-700">当前未登录销售易租户</div>
              <p className="text-[11px] text-slate-400">请先在【控制台 & 会话】登录租户后再拉取对象字典</p>
            </div>
          ) : (
            <>
              {/* 搜索框 */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="搜索对象中文名或 API Key（例如：客户、account、商机...）"
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-sky-500 bg-slate-50/50"
                />
              </div>

              {/* 已选中标签 */}
              {localSelected.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {localSelected.map((ref) => (
                    <span
                      key={ref.apiKey}
                      onClick={() => setLocalSelected(localSelected.filter((r) => r.apiKey !== ref.apiKey))}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-xs cursor-pointer hover:bg-sky-100 transition-colors"
                    >
                      <span>@{ref.label} ({ref.apiKey})</span>
                      <X className="w-3 h-3" />
                    </span>
                  ))}
                </div>
              )}

              {/* 对象列表 */}
              <div className="flex-1 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100 max-h-72">
                {loading ? (
                  <div className="py-12 flex items-center justify-center space-x-2 text-xs text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
                    <span>正在加载租户实体字典...</span>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400">未找到匹配的业务对象</div>
                ) : (
                  filtered.slice(0, 120).map((entity) => {
                    const isChecked = localSelected.some((r) => r.apiKey === entity.apiKey);
                    return (
                      <div
                        key={entity.apiKey}
                        onClick={() => toggleSelect(entity)}
                        className={`flex items-center justify-between px-3.5 py-2.5 text-xs cursor-pointer transition-colors ${
                          isChecked ? 'bg-sky-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5">
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center border ${
                              isChecked
                                ? 'bg-sky-600 border-sky-600 text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isChecked && <Check className="w-3 h-3" />}
                          </div>
                          <div>
                            <div className="font-medium text-slate-800">{entity.label}</div>
                            <div className="text-[11px] font-mono text-slate-400">{entity.apiKey}</div>
                          </div>
                        </div>

                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full border ${
                            entity.isStandard
                              ? 'bg-slate-100 text-slate-600 border-slate-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {entity.isStandard ? '标准对象' : '自定义对象'}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            已选择 <strong className="text-sky-600">{localSelected.length}</strong> 个对象
          </span>
          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-medium"
            >
              取消
            </button>
            <button
              onClick={() => {
                onConfirm(localSelected);
                onClose();
              }}
              className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium shadow-xs"
            >
              确认挂载
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
