import React, { useState, useEffect } from 'react';
import { X, Search, Check, RefreshCw, Layers } from 'lucide-react';

interface RecordLookupModalProps {
  isOpen: boolean;
  targetEntityApiKey: string;
  currentValue?: string | number;
  onClose: () => void;
  onSelect: (record: { id: string | number; name: string }) => void;
}

export const RecordLookupModal: React.FC<RecordLookupModalProps> = ({
  isOpen,
  targetEntityApiKey,
  currentValue,
  onClose,
  onSelect,
}) => {
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<Record<string, any>[]>([]);

  const handleSearch = async () => {
    if (!targetEntityApiKey) return;
    setLoading(true);
    try {
      const res = await window.neoApi.searchRecords(targetEntityApiKey, '', 40);
      if (res.success) {
        setRecords(res.records);
      }
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && targetEntityApiKey) {
      setKeyword('');
      handleSearch();
    }
  }, [isOpen, targetEntityApiKey]);

  if (!isOpen) return null;

  const filteredRecords = records.filter((r) => {
    const name = String(r._displayName || r.name || r.accountName || r.contactName || r.priceListName || r.title || '').toLowerCase();
    const q = keyword.trim().toLowerCase();
    if (!q) return true;
    return name.includes(q) || String(r.id).includes(q);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* 头部 */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-sky-600" />
            <div>
              <h3 className="text-base font-semibold text-slate-900">选择关联对象记录</h3>
              <p className="text-[11px] text-slate-500">
                关联目标对象: <span className="text-sky-700 font-mono font-medium">{targetEntityApiKey}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 搜索栏 */}
        <div className="p-4 border-b border-slate-200/80 bg-slate-50/30 flex space-x-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="输入对象名称实时筛选..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl transition-all flex items-center space-x-1.5 border border-slate-200"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-600' : ''}`} />
            <span>刷新列表</span>
          </button>
        </div>

        {/* 数据列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/20">
          {loading ? (
            <div className="py-16 text-center text-xs text-slate-500 flex items-center justify-center space-x-2">
              <RefreshCw className="w-4 h-4 animate-spin text-sky-600" />
              <span>正在拉取关联对象名称列表...</span>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-400">
              未检索到匹配数据，请尝试调整搜索词
            </div>
          ) : (
            filteredRecords.map((r, idx) => {
              const name = r._displayName || r.name || r.accountName || r.contactName || r.priceListName || r.title || '未命名对象';
              const isSelected = String(r.id) === String(currentValue);

              return (
                <div
                  key={r.id || idx}
                  onClick={() => {
                    onSelect({ id: r.id, name: String(name) });
                    onClose();
                  }}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                    isSelected
                      ? 'bg-sky-50 border-sky-500 shadow-2xs ring-1 ring-sky-500'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-2xs'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0 pr-3">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isSelected ? 'bg-sky-600' : 'bg-slate-300'}`}></span>
                    <span className="text-sm font-semibold text-slate-800 truncate">{name}</span>
                    {isSelected && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 flex-shrink-0 font-medium">
                        当前已选
                      </span>
                    )}
                  </div>

                  <button className="px-3 py-1.5 bg-sky-50 hover:bg-sky-600 text-sky-700 hover:text-white border border-sky-200 text-xs font-medium rounded-lg transition-colors flex items-center space-x-1 flex-shrink-0">
                    <Check className="w-3.5 h-3.5" />
                    <span>选择此项</span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* 底部 */}
        <div className="px-5 py-3 border-t border-slate-200 bg-white flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-lg transition-colors font-medium"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
