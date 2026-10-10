import React, { useState, useEffect } from 'react';
import { 
  FileDown, 
  RefreshCw, 
  FileSpreadsheet,
  RotateCw
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { EntityMetadata, FieldMetadata, ScrollProgress } from '../../../shared/types';

interface DataExporterProps {
  entities: EntityMetadata[];
  defaultEntityApiKey: string;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const DataExporter: React.FC<DataExporterProps> = ({
  entities,
  defaultEntityApiKey,
  showToast,
}) => {
  const [selectedEntityApiKey, setSelectedEntityApiKey] = useState(defaultEntityApiKey || 'account');
  const [fields, setFields] = useState<FieldMetadata[]>([]);
  const [selectedFieldKeys, setSelectedFieldKeys] = useState<string[]>([]);
  const [limit, setLimit] = useState<number>(0); // 0 代表全量导出
  const [customWhere, setCustomWhere] = useState<string>('');
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv' | 'json'>('xlsx');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [loadingFields, setLoadingFields] = useState<boolean>(false);
  const [scrollProgress, setScrollProgress] = useState<ScrollProgress | null>(null);

  useEffect(() => {
    const cleanup = window.neoApi?.onScrollProgress?.((p) => {
      setScrollProgress(p);
    });
    return () => cleanup?.();
  }, []);

  const loadFields = async (apiKey: string) => {
    setLoadingFields(true);
    try {
      const list = await window.neoApi.getFields(apiKey);
      setFields(list);
      setSelectedFieldKeys(list.slice(0, 15).map((f) => f.apiKey));
    } catch {
      setFields([]);
      setSelectedFieldKeys([]);
    } finally {
      setLoadingFields(false);
    }
  };

  useEffect(() => {
    loadFields(selectedEntityApiKey);
  }, [selectedEntityApiKey]);

  const handleToggleAll = () => {
    if (selectedFieldKeys.length === fields.length) {
      setSelectedFieldKeys([]);
    } else {
      setSelectedFieldKeys(fields.map((f) => f.apiKey));
    }
  };

  const handleToggleField = (key: string) => {
    if (selectedFieldKeys.includes(key)) {
      setSelectedFieldKeys(selectedFieldKeys.filter((k) => k !== key));
    } else {
      setSelectedFieldKeys([...selectedFieldKeys, key]);
    }
  };

  const handleExport = async () => {
    if (!selectedFieldKeys.length) {
      showToast('info', '请至少勾选一个要导出的字段');
      return;
    }

    setIsExporting(true);
    setScrollProgress(null);
    try {
      const fieldsStr = selectedFieldKeys.join(', ');
      const whereClause = customWhere.trim() ? `WHERE ${customWhere.trim()}` : '';

      let res: any;
      if (limit > 100 || limit === 0) {
        // 使用滚动查询模式，突破 100 条限制
        const sql = `SELECT ${fieldsStr} FROM ${selectedEntityApiKey} ${whereClause}`;
        const maxRecords = limit === 0 ? 50000 : limit;
        res = await window.neoApi.executeScrollQuery(sql, 1000, maxRecords);
      } else {
        const sql = `SELECT ${fieldsStr} FROM ${selectedEntityApiKey} ${whereClause ? whereClause : 'WHERE id > 0'} LIMIT ${limit}`;
        res = await window.neoApi.executeQuery(sql);
      }

      if (!res.success || !res.data?.records?.length) {
        showToast('info', res.error || '未检索到符合条件的数据记录');
        return;
      }

      const records = res.data.records;
      const targetEntity = entities.find((e) => e.apiKey === selectedEntityApiKey);
      const entityLabel = targetEntity?.label || selectedEntityApiKey;

      if (exportFormat === 'json') {
        const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${entityLabel}_${selectedEntityApiKey}_共${records.length}条_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const headers = selectedFieldKeys.map((k) => {
          const f = fields.find((item) => item.apiKey === k);
          return f ? `${f.label} (${k})` : k;
        });

        const rows = records.map((r: any) => {
          return selectedFieldKeys.map((k) => {
            const val = r[k];
            if (typeof val === 'object' && val !== null) return JSON.stringify(val);
            return val ?? '';
          });
        });

        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '数据导出');

        const ext = exportFormat === 'xlsx' ? 'xlsx' : 'csv';
        const bookType = exportFormat === 'xlsx' ? 'xlsx' : 'csv';
        XLSX.writeFile(workbook, `${entityLabel}_${selectedEntityApiKey}_共${records.length}条_${Date.now()}.${ext}`, {
          bookType,
        });
      }

      showToast('success', `成功导出全部 ${records.length} 条数据！`);
    } catch (e: any) {
      showToast('error', `导出异常: ${e.message}`);
    } finally {
      setIsExporting(false);
      setScrollProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            <div>
              <h3 className="text-base font-semibold text-slate-900">批量数据导出中心 (支持全量滚动导出)</h3>
              <p className="text-[11px] text-slate-500">
                支持选择对象、勾选字段范围、突破 100 条限制全量滚动导出为 Excel、CSV 或 JSON
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-xs bg-slate-50 px-3 py-1 rounded-xl border border-slate-200">
            <span className="text-slate-500">导出对象:</span>
            <select
              value={selectedEntityApiKey}
              onChange={(e) => setSelectedEntityApiKey(e.target.value)}
              className="bg-transparent text-sky-700 font-mono font-medium focus:outline-none"
            >
              {entities.map((e) => (
                <option key={e.apiKey} value={e.apiKey}>
                  {e.label} ({e.apiKey})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 字段勾选区域 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs text-slate-700">
              <span className="font-semibold">选择要导出的字段列</span>
              <span className="text-slate-400 font-mono">
                (已选 {selectedFieldKeys.length} / 共 {fields.length} 个字段)
              </span>
            </div>
            <button
              onClick={handleToggleAll}
              className="text-xs text-sky-600 hover:text-sky-700 font-medium transition-colors"
            >
              {selectedFieldKeys.length === fields.length ? '取消全选' : '全选所有字段'}
            </button>
          </div>

          <div className="p-3 bg-slate-50/70 rounded-xl border border-slate-200 max-h-48 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {loadingFields ? (
              <div className="col-span-full py-8 text-center text-xs text-slate-500 flex items-center justify-center space-x-2">
                <RefreshCw className="w-4 h-4 animate-spin text-sky-600" />
                <span>正在加载字段元数据...</span>
              </div>
            ) : (
              fields.map((f) => {
                const checked = selectedFieldKeys.includes(f.apiKey);
                return (
                  <label
                    key={f.apiKey}
                    onClick={() => handleToggleField(f.apiKey)}
                    className={`flex items-center space-x-2 p-2 rounded-lg cursor-pointer text-xs select-none transition-colors border ${
                      checked
                        ? 'bg-sky-50 border-sky-300 text-slate-900 font-medium'
                        : 'bg-white border-slate-200/80 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {}}
                      className="rounded border-slate-300 text-sky-600 focus:ring-0"
                    />
                    <span className="truncate" title={`${f.label} (${f.apiKey})`}>
                      {f.label}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        {/* 过滤与参数配置 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block text-slate-700 font-medium mb-1">自定义过滤条件 (可选 WHERE 表达式)</label>
            <input
              type="text"
              value={customWhere}
              onChange={(e) => setCustomWhere(e.target.value)}
              placeholder="留空则导出全部，或如: createdAt >= 1711900800000"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-800 font-mono focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-medium mb-1">导出数量范围</label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:border-sky-500 font-medium"
            >
              <option value={0}>🔥 全量导出所有数据 (滚动模式)</option>
              <option value={50}>前 50 条记录</option>
              <option value={100}>前 100 条记录</option>
              <option value={500}>前 500 条记录 (滚动)</option>
              <option value={1000}>前 1000 条记录 (滚动)</option>
              <option value={5000}>前 5000 条记录 (滚动)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-700 font-medium mb-1">导出文件格式</label>
            <div className="flex p-0.5 bg-slate-100 border border-slate-200 rounded-xl">
              <button
                onClick={() => setExportFormat('xlsx')}
                className={`flex-1 py-1.5 rounded-lg text-center transition-all ${
                  exportFormat === 'xlsx' ? 'bg-white text-emerald-700 shadow-xs font-semibold border border-slate-200' : 'text-slate-600'
                }`}
              >
                Excel (.xlsx)
              </button>
              <button
                onClick={() => setExportFormat('csv')}
                className={`flex-1 py-1.5 rounded-lg text-center transition-all ${
                  exportFormat === 'csv' ? 'bg-white text-emerald-700 shadow-xs font-semibold border border-slate-200' : 'text-slate-600'
                }`}
              >
                CSV (.csv)
              </button>
              <button
                onClick={() => setExportFormat('json')}
                className={`flex-1 py-1.5 rounded-lg text-center transition-all ${
                  exportFormat === 'json' ? 'bg-white text-emerald-700 shadow-xs font-semibold border border-slate-200' : 'text-slate-600'
                }`}
              >
                JSON (.json)
              </button>
            </div>
          </div>
        </div>

        {/* 滚动导出实时进度条 */}
        {isExporting && scrollProgress && (
          <div className="p-3 bg-emerald-50/80 rounded-xl border border-emerald-200 space-y-1.5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-emerald-900 flex items-center space-x-1.5">
                <RotateCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                <span>正在通过滚动通道拉取数据 (第 {scrollProgress.page} 批)...</span>
              </span>
              <span className="font-mono text-emerald-700 font-bold">
                {scrollProgress.current} / {scrollProgress.total} 条 ({scrollProgress.percent}%)
              </span>
            </div>
            <div className="w-full h-2 bg-emerald-200/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-600 to-teal-600 transition-all duration-200"
                style={{ width: `${scrollProgress.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* 导出按钮 */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-medium rounded-xl shadow-md shadow-emerald-600/20 transition-all flex items-center space-x-2 disabled:opacity-50"
          >
            <FileDown className={`w-4 h-4 ${isExporting ? 'animate-spin' : ''}`} />
            <span>{isExporting ? '正在全量拉取并生成文件...' : '开始导出数据文件'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
