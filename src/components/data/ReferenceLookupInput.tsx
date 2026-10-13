import React, { useState, useEffect } from 'react';
import { Search, X, RefreshCw } from 'lucide-react';
import { RecordLookupModal } from './RecordLookupModal';

interface ReferenceLookupInputProps {
  fieldApiKey: string;
  fieldLabel: string;
  referObjectApiKey: string;
  hostEntityApiKey?: string;
  value: string | number | undefined | null;
  initialDisplayName?: string;
  disabled?: boolean;
  onChange: (newId: string | number | null, newName?: string) => void;
}

export const ReferenceLookupInput: React.FC<ReferenceLookupInputProps> = ({
  fieldApiKey,
  fieldLabel,
  referObjectApiKey,
  hostEntityApiKey,
  value,
  initialDisplayName,
  disabled = false,
  onChange,
}) => {
  const effectiveReferApiKey =
    (referObjectApiKey === 'entityBelongType' || fieldApiKey === 'entityType') && hostEntityApiKey
      ? `entityBelongType:${hostEntityApiKey}`
      : referObjectApiKey;

  const isBusiType = effectiveReferApiKey.startsWith('entityBelongType');
  const badgeText = isBusiType ? '业务类型' : effectiveReferApiKey;

  const [displayName, setDisplayName] = useState<string>(initialDisplayName || '');
  const [loadingName, setLoadingName] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  useEffect(() => {
    if (initialDisplayName) {
      setDisplayName(initialDisplayName);
      return;
    }

    if (value && effectiveReferApiKey) {
      let isMounted = true;
      setLoadingName(true);

      window.neoApi
        ?.getBatchNames(effectiveReferApiKey, [value])
        .then((nameMap) => {
          if (!isMounted) return;
          const foundName = nameMap[String(value)];
          if (foundName) {
            setDisplayName(foundName);
          } else {
            setDisplayName(`已关联 (ID: ${value})`);
          }
        })
        .catch(() => {
          if (isMounted) setDisplayName(`已关联 (ID: ${value})`);
        })
        .finally(() => {
          if (isMounted) setLoadingName(false);
        });

      return () => {
        isMounted = false;
      };
    } else {
      setDisplayName('');
    }
  }, [value, effectiveReferApiKey, initialDisplayName]);

  const handleSelect = (record: { id: string | number; name: string }) => {
    setDisplayName(record.name);
    onChange(record.id, record.name);
    setIsModalOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDisplayName('');
    onChange(null, '');
  };

  const hasValue = value !== undefined && value !== null && value !== '';

  if (disabled) {
    return (
      <div className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-400 font-medium cursor-not-allowed truncate">
        {displayName || (hasValue ? `已关联 (ID: ${value})` : '未指定')}
      </div>
    );
  }

  return (
    <div className="w-full">
      {hasValue ? (
        <div className="flex items-center justify-between px-3 py-1.5 bg-sky-50/80 border border-sky-300 rounded-xl transition-all group hover:border-sky-500 shadow-2xs">
          <div className="flex items-center space-x-2 min-w-0 flex-1 mr-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 animate-pulse"></span>
            <div className="min-w-0">
              {loadingName ? (
                <div className="flex items-center space-x-1.5 text-xs text-sky-700">
                  <RefreshCw className="w-3 h-3 animate-spin text-sky-600" />
                  <span>正在解析名称...</span>
                </div>
              ) : (
                <span className="text-xs font-semibold text-slate-800 block truncate" title={displayName}>
                  {displayName}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="px-2.5 py-1 bg-white hover:bg-sky-600 hover:text-white text-sky-700 rounded-lg text-[11px] font-medium border border-sky-200 transition-colors flex items-center space-x-1 shadow-2xs cursor-pointer"
              title="重新选择"
            >
              <Search className="w-3 h-3" />
              <span>更换</span>
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
              title="清空当前关联"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="w-full flex items-center justify-between px-3 py-2 bg-white border border-dashed border-slate-300 hover:border-sky-500 rounded-xl text-xs text-slate-500 hover:text-sky-600 transition-all text-left shadow-2xs cursor-pointer"
        >
          <div className="flex items-center space-x-2 truncate">
            <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="truncate">
              {isBusiType ? `点击选择 ${fieldLabel} (业务类型)...` : `点击选择关联 ${fieldLabel}...`}
            </span>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono flex-shrink-0 ml-1">
            {badgeText}
          </span>
        </button>
      )}

      <RecordLookupModal
        isOpen={isModalOpen}
        targetEntityApiKey={effectiveReferApiKey}
        currentValue={value ?? undefined}
        onClose={() => setIsModalOpen(false)}
        onSelect={handleSelect}
      />
    </div>
  );
};
