import React, { useState, useEffect } from 'react';
import { QueryResultData } from '../../../shared/types';
import { Database, Download, X, Loader2, AlertCircle } from 'lucide-react';
import { exportJsonToExcel } from '../../utils/excelDataHelper';

interface InlineSqlResultTableProps {
  sql: string;
  onClose: () => void;
}

export const InlineSqlResultTable: React.FC<InlineSqlResultTableProps> = ({ sql, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResultData | null>(null);

  useEffect(() => {
    let isMounted = true;
    const runQuery = async () => {
      setLoading(true);
      setError(null);
      try {
        if (!window.neoApi?.executeQuery) {
          throw new Error('当前环境不支持执行 SQL');
        }
        const res = await window.neoApi.executeQuery(sql);
        if (!isMounted) return;
        if (res.success && res.data) {
          setResult(res.data);
        } else {
          setError(res.error || 'SQL 执行返回失败');
        }
      } catch (e: any) {
        if (!isMounted) return;
        setError(e.message || '查询异常');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    runQuery();
    return () => {
      isMounted = false;
    };
  }, [sql]);

  const handleExport = () => {
    if (!result?.records || result.records.length === 0) return;
    exportJsonToExcel(result.records, `AI_SQL_Result_${Date.now()}`);
  };

  return (
    <div className="my-2.5 rounded-xl border border-sky-200 bg-sky-50/30 overflow-hidden shadow-xs">
      <div className="flex items-center justify-between px-3.5 py-2 bg-sky-100/60 border-b border-sky-200 text-xs">
        <div className="flex items-center space-x-2 text-sky-900 font-medium">
          <Database className="w-3.5 h-3.5 text-sky-600" />
          <span>SQL 查询结果</span>
          {result && (
            <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-white border border-sky-200 font-mono text-sky-700">
              共 {result.records.length} 条数据
            </span>
          )}
        </div>
        <div className="flex items-center space-x-1.5">
          {result && result.records.length > 0 && (
            <button
              onClick={handleExport}
              className="flex items-center space-x-1 px-2 py-0.5 rounded bg-white hover:bg-sky-50 border border-sky-200 text-sky-700 text-[11px] font-medium transition-colors"
            >
              <Download className="w-3 h-3" />
              <span>导出 Excel</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-sky-200/60 text-sky-700 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="p-3">
        {loading && (
          <div className="py-6 flex items-center justify-center space-x-2 text-xs text-sky-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>正在销售易数据库执行查询...</span>
          </div>
        )}

        {error && (
          <div className="py-4 px-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
            <div className="break-all font-mono">{error}</div>
          </div>
        )}

        {!loading && !error && result && (
          <div className="overflow-x-auto max-h-64 rounded-lg border border-slate-200 bg-white">
            {result.records.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">查询结果为空（0 条记录）</div>
            ) : (
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 sticky top-0 font-medium">
                  <tr>
                    {result.fields.map((field) => (
                      <th key={field} className="px-3 py-2 whitespace-nowrap">
                        {field}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600">
                  {result.records.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      {result.fields.map((field) => {
                        const val = row[field];
                        const displayVal = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '');
                        return (
                          <td key={field} className="px-3 py-1.5 whitespace-nowrap font-mono text-[11px] max-w-xs truncate" title={displayVal}>
                            {displayVal}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
