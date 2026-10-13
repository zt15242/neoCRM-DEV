import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Check, RefreshCw, Layers, Tag } from 'lucide-react';

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
  const [allRecords, setAllRecords] = useState<Record<string, any>[]>([]);
  const [serverFilteredRecords, setServerFilteredRecords] = useState<Record<string, any>[] | null>(null);
  const [fetchLimit, setFetchLimit] = useState<number>(3000);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isBusiType = Boolean(targetEntityApiKey && targetEntityApiKey.startsWith('entityBelongType'));
  const hostEntityName = isBusiType && targetEntityApiKey.includes(':')
    ? targetEntityApiKey.split(':')[1]
    : targetEntityApiKey;

  const loadFullList = async (customLimit = fetchLimit) => {
    if (!targetEntityApiKey) return;
    setLoading(true);
    setServerFilteredRecords(null);
    try {
      const res = await window.neoApi.searchRecords(targetEntityApiKey, '', customLimit);
      if (res.success && Array.isArray(res.records)) {
        setAllRecords(res.records);
      } else {
        setAllRecords([]);
      }
    } catch {
      setAllRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const runServerKeywordSearch = async (searchKw: string) => {
    const clean = searchKw.trim();
    if (!clean || !targetEntityApiKey || isBusiType) {
      setServerFilteredRecords(null);
      return;
    }
    setLoading(true);
    try {
      const res = await window.neoApi.searchRecords(targetEntityApiKey, clean, 3000);
      if (res.success && Array.isArray(res.records)) {
        setServerFilteredRecords(res.records);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && targetEntityApiKey) {
      setKeyword('');
      setServerFilteredRecords(null);
      loadFullList(3000);
    }
  }, [isOpen, targetEntityApiKey]);

  const getRecordNameText = (r: Record<string, any>) =>
    String(
      r._displayName ||
        r.name ||
        r.accountName ||
        r.contactName ||
        r.opportunityName ||
        r.productName ||
        r.departName ||
        r.po ||
        r.title ||
        r.priceListName ||
        ''
    );

  // 本地实时过滤
  const localFiltered = allRecords.filter((r) => {
    const q = keyword.trim().toLowerCase();
    if (!q) return true;
    const name = getRecordNameText(r).toLowerCase();
    const apiKey = String(r.apiKey || '').toLowerCase();
    const idStr = String(r.id || '').toLowerCase();
    return name.includes(q) || apiKey.includes(q) || idStr.includes(q);
  });

  // 当用户输入关键词，且本地全量缓存数达到上限或本地无匹配时，自动防抖触发服务端全库搜索
  useEffect(() => {
    if (!isOpen || isBusiType) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    const q = keyword.trim();
    if (!q) {
      setServerFilteredRecords(null);
      return;
    }

    if (localFiltered.length === 0 || allRecords.length >= fetchLimit) {
      debounceTimerRef.current = setTimeout(() => {
        runServerKeywordSearch(q);
      }, 300);
    } else {
      setServerFilteredRecords(null);
    }

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [keyword]);

  if (!isOpen) return null;

  // 合并本地过滤与服务端搜索结果（去重）
  const displayRecords = (() => {
    if (!keyword.trim()) return allRecords;
    if (!serverFilteredRecords) return localFiltered;
    const map = new Map<string, Record<string, any>>();
    for (const item of [...localFiltered, ...serverFilteredRecords]) {
      map.set(String(item.id), item);
    }
    return Array.from(map.values());
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* 头部 */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-2.5">
            {isBusiType ? (
              <Tag className="w-5 h-5 text-emerald-600" />
            ) : (
              <Layers className="w-5 h-5 text-sky-600" />
            )}
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {isBusiType ? '选择对象业务类型 (Business Type)' : '选择关联对象记录'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {isBusiType ? '所属业务对象: ' : '关联目标对象: '}
                <span className="text-sky-700 font-mono font-medium">{hostEntityName}</span>
                <span className="ml-2 text-slate-400">
                  (共加载 {allRecords.length} 条{keyword.trim() ? ` · 当前匹配 ${displayRecords.length} 条` : '全量数据'})
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
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
              autoFocus
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (keyword.trim()) {
                    runServerKeywordSearch(keyword);
                  } else {
                    loadFullList(fetchLimit);
                  }
                }
              }}
              placeholder={
                isBusiType
                  ? '搜索业务类型名称、API Key 或 ID...'
                  : '输入记录名称、编号或数据 ID 实时搜索 (回车执行服务端全库检索)...'
              }
              className="w-full pl-9 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500"
            />
            {keyword && (
              <button
                type="button"
                onClick={() => {
                  setKeyword('');
                  setServerFilteredRecords(null);
                }}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {!isBusiType && keyword.trim() && (
            <button
              type="button"
              onClick={() => runServerKeywordSearch(keyword)}
              disabled={loading}
              className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium rounded-xl transition-all flex items-center space-x-1 shadow-2xs cursor-pointer shrink-0"
            >
              <Search className="w-3.5 h-3.5" />
              <span>全库检索</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => loadFullList(fetchLimit)}
            disabled={loading}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl transition-all flex items-center space-x-1.5 border border-slate-200 cursor-pointer shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-600' : ''}`} />
            <span>刷新全量</span>
          </button>
        </div>

        {/* 数据列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/20">
          {loading ? (
            <div className="py-16 text-center text-xs text-slate-500 flex items-center justify-center space-x-2">
              <RefreshCw className="w-4 h-4 animate-spin text-sky-600" />
              <span>
                {isBusiType ? '正在获取对象的所有业务类型...' : '正在高速拉取全量对象记录列表...'}
              </span>
            </div>
          ) : displayRecords.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-400 space-y-2">
              <div>未检索到匹配数据，请尝试调整搜索词</div>
              {!isBusiType && keyword.trim() && (
                <button
                  type="button"
                  onClick={() => runServerKeywordSearch(keyword)}
                  className="px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 text-xs font-medium hover:bg-sky-100"
                >
                  点击执行服务端全表模糊搜索 "{keyword}"
                </button>
              )}
            </div>
          ) : (
            displayRecords.map((r, idx) => {
              const name = getRecordNameText(r) || `未命名记录 #${r.id}`;
              const isSelected = String(r.id) === String(currentValue);

              return (
                <div
                  key={r.id || idx}
                  onClick={() => {
                    onSelect({ id: r.id, name: String(name) });
                    onClose();
                  }}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                    isSelected
                      ? 'bg-sky-50 border-sky-500 shadow-2xs ring-1 ring-sky-500'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-2xs'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0 pr-3">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        isSelected ? 'bg-sky-600' : 'bg-slate-300'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs md:text-sm font-semibold text-slate-800 truncate">
                          {name}
                        </span>
                        {isBusiType && r.custom !== undefined && (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              r.custom
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {r.custom ? '自定义类型' : '标准预设'}
                          </span>
                        )}
                        {isSelected && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 flex-shrink-0 font-medium">
                            当前已选
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                        {isBusiType && r.apiKey ? `API Key: ${r.apiKey} · ID: ${r.id}` : `ID: ${r.id}`}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="px-3 py-1.5 bg-sky-50 hover:bg-sky-600 text-sky-700 hover:text-white border border-sky-200 text-xs font-medium rounded-lg transition-colors flex items-center space-x-1 flex-shrink-0 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>选择此项</span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* 底部 */}
        <div className="px-5 py-3 border-t border-slate-200 bg-white flex items-center justify-between text-xs">
          <div className="text-slate-400">
            {!isBusiType && allRecords.length >= fetchLimit ? (
              <button
                type="button"
                onClick={() => {
                  const nextLim = fetchLimit + 5000;
                  setFetchLimit(nextLim);
                  loadFullList(nextLim);
                }}
                className="text-sky-600 hover:text-sky-700 font-medium cursor-pointer"
              >
                已加载前 {allRecords.length} 条，点击继续拉取更多记录...
              </button>
            ) : (
              <span>已加载全部 {allRecords.length} 条可用记录</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-lg transition-colors font-medium cursor-pointer"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
