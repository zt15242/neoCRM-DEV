import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, X, Box } from 'lucide-react';
import { EntityMetadata } from '../../../shared/types';

interface EntitySearchSelectProps {
  entities: EntityMetadata[];
  value: string;
  onChange: (newApiKey: string) => void;
  labelPrefix?: string;
  placeholder?: string;
  className?: string;
}

export const EntitySearchSelect: React.FC<EntitySearchSelectProps> = ({
  entities,
  value,
  onChange,
  labelPrefix = '对象:',
  placeholder = '搜索对象名称或 API Key...',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'standard' | 'custom'>('all');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedEntity = entities.find((e) => e.apiKey === value) || entities[0];

  // 点击外部自动关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // 展开后自动聚焦搜索框
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // 搜索和分类过滤
  const filteredEntities = entities.filter((e) => {
    const q = search.trim().toLowerCase();
    const matchesKeyword =
      !q ||
      e.label.toLowerCase().includes(q) ||
      e.apiKey.toLowerCase().includes(q);

    if (filterType === 'standard') return matchesKeyword && e.isStandard;
    if (filterType === 'custom') return matchesKeyword && !e.isStandard;
    return matchesKeyword;
  });

  const handleSelect = (apiKey: string) => {
    onChange(apiKey);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {/* 触发器按键 */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-sky-300 rounded-xl text-xs transition-all shadow-2xs group"
      >
        {labelPrefix && <span className="text-slate-500 font-medium">{labelPrefix}</span>}
        <span className="font-semibold text-slate-800 group-hover:text-sky-700 max-w-[200px] truncate">
          {selectedEntity ? `${selectedEntity.label} (${selectedEntity.apiKey})` : '请选择对象'}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 group-hover:text-sky-600 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* 展开的下拉搜索弹层 */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden flex flex-col animate-in fade-in-50 zoom-in-95 duration-150">
          {/* 搜索输入栏 */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/60 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setIsOpen(false);
                  if (e.key === 'Enter' && filteredEntities.length > 0) {
                    handleSelect(filteredEntities[0].apiKey);
                  }
                }}
                placeholder={placeholder}
                className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 shadow-2xs"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-2 p-0.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* 分类快捷标签 */}
            <div className="flex p-0.5 bg-slate-200/60 rounded-lg text-[11px]">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`flex-1 py-0.5 text-center rounded-md transition-colors ${
                  filterType === 'all' ? 'bg-white text-sky-700 font-semibold shadow-2xs' : 'text-slate-600'
                }`}
              >
                全部 ({entities.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('standard')}
                className={`flex-1 py-0.5 text-center rounded-md transition-colors ${
                  filterType === 'standard' ? 'bg-white text-sky-700 font-semibold shadow-2xs' : 'text-slate-600'
                }`}
              >
                标准 ({entities.filter((e) => e.isStandard).length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('custom')}
                className={`flex-1 py-0.5 text-center rounded-md transition-colors ${
                  filterType === 'custom' ? 'bg-white text-sky-700 font-semibold shadow-2xs' : 'text-slate-600'
                }`}
              >
                自定义 ({entities.filter((e) => !e.isStandard).length})
              </button>
            </div>
          </div>

          {/* 列表项 */}
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 p-1">
            {filteredEntities.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                未找到匹配对象 "{search}"
              </div>
            ) : (
              filteredEntities.map((e) => {
                const isSelected = e.apiKey === value;
                return (
                  <div
                    key={e.apiKey}
                    onClick={() => handleSelect(e.apiKey)}
                    className={`px-3 py-2 rounded-lg cursor-pointer transition-colors flex items-center justify-between text-xs ${
                      isSelected
                        ? 'bg-sky-50 text-sky-900 font-semibold'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center space-x-1.5">
                        <span className="truncate">{e.label}</span>
                        {e.isStandard ? (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-slate-100 text-slate-500 font-mono">
                            标准
                          </span>
                        ) : (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200 font-mono">
                            自定义
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] font-mono text-slate-400 truncate">{e.apiKey}</p>
                    </div>

                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-sky-600 flex-shrink-0" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
