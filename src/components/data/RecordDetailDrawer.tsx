import React, { useState, useEffect } from 'react';
import { X, ExternalLink, RefreshCw, Copy, Check, Layers, AlertCircle } from 'lucide-react';
import { FieldMetadata } from '../../../shared/types';

interface RecordDetailDrawerProps {
  isOpen: boolean;
  entityApiKey: string;
  recordId: string | number;
  onClose: () => void;
  onDrillDown?: (targetEntityApiKey: string, targetId: string | number) => void;
}

export const RecordDetailDrawer: React.FC<RecordDetailDrawerProps> = ({
  isOpen,
  entityApiKey,
  recordId,
  onClose,
  onDrillDown,
}) => {
  const [loading, setLoading] = useState(false);
  const [recordData, setRecordData] = useState<Record<string, any> | null>(null);
  const [fields, setFields] = useState<FieldMetadata[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const loadData = async () => {
    if (!entityApiKey || !recordId) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const fieldList = await window.neoApi.getFields(entityApiKey);
      setFields(fieldList);

      const res = await window.neoApi.getRecordDetail(entityApiKey, recordId);
      if (res.success && res.data) {
        setRecordData(res.data);
      } else {
        setErrorMsg(res.error || '无法拉取记录详情');
      }
    } catch (e: any) {
      setErrorMsg(`拉取异常: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, entityApiKey, recordId]);

  if (!isOpen) return null;

  const handleCopy = (val: any, key: string) => {
    navigator.clipboard.writeText(typeof val === 'object' ? JSON.stringify(val) : String(val ?? ''));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-xl h-full bg-white border-l border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
        {/* 抽屉头部 */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-sky-600" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">关联数据对象钻取</h3>
              <p className="text-[11px] text-slate-500 font-mono">
                {entityApiKey} • ID: <span className="text-sky-600 font-medium">{recordId}</span>
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

        {/* 字段明细内容 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2.5 bg-slate-50/30">
          {loading ? (
            <div className="py-20 text-center text-xs text-slate-500 flex items-center justify-center space-x-2">
              <RefreshCw className="w-4 h-4 animate-spin text-sky-600" />
              <span>正在拉取关联对象所有字段信息...</span>
            </div>
          ) : errorMsg ? (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          ) : recordData ? (
            <div className="space-y-2">
              {Object.entries(recordData).map(([key, value]) => {
                const meta = fields.find((f) => f.apiKey === key);
                const label = meta?.label || key;
                const isRefer = !!meta?.referObjectApiKey;
                const valStr = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');

                return (
                  <div
                    key={key}
                    className="p-3 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-colors space-y-1 shadow-2xs"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-slate-800">{label}</span>
                        <span className="text-[10px] font-mono text-slate-400">({key})</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        {isRefer && value && onDrillDown && (
                          <button
                            onClick={() => onDrillDown(meta!.referObjectApiKey!, value)}
                            className="text-[10px] text-sky-700 hover:text-sky-800 font-medium flex items-center space-x-0.5 px-2 py-0.5 rounded bg-sky-50 border border-sky-200"
                          >
                            <span>穿透查看</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleCopy(value, key)}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded"
                          title="复制值"
                        >
                          {copiedKey === key ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="text-xs font-mono text-slate-700 break-all select-all">
                      {valStr || <span className="text-slate-400">null</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
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
