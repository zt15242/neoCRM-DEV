import React, { useState, useEffect } from 'react';
import { 
  Terminal, 
  Play, 
  RefreshCw, 
  Copy, 
  Check, 
  FileDown, 
  AlertCircle, 
  Eye, 
  Edit3, 
  Sparkles,
  Layers,
  Database
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { EntityMetadata, QueryResultData } from '../../../shared/types';

interface SqlQueryExplorerProps {
  entities: EntityMetadata[];
  defaultEntityApiKey: string;
  onNavigateToView: (entityApiKey: string, recordId: string | number) => void;
  onNavigateToEdit: (entityApiKey: string, recordId: string | number, recordData: Record<string, any>) => void;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const SqlQueryExplorer: React.FC<SqlQueryExplorerProps> = ({
  entities,
  defaultEntityApiKey,
  onNavigateToView,
  onNavigateToEdit,
  showToast,
}) => {
  const [selectedEntityApiKey, setSelectedEntityApiKey] = useState(defaultEntityApiKey || 'account');
  const [sqlQuery, setSqlQuery] = useState(`SELECT id, createdAt FROM ${defaultEntityApiKey || 'account'} WHERE id > 0 LIMIT 20`);
  const [isQuerying, setIsQuerying] = useState(false);
  const [queryResult, setQueryResult] = useState<QueryResultData | null>(null);
  const [queryDuration, setQueryDuration] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // 针对特定实体动态调整推荐 SQL 字段
  const getRecommendedSql = (apiKey: string, type: 'default' | 'latest' | 'custom' = 'default') => {
    if (type === 'latest') {
      return `SELECT id, createdAt FROM ${apiKey} ORDER BY createdAt DESC LIMIT 50`;
    }
    return `SELECT id, createdAt FROM ${apiKey} WHERE id > 0 LIMIT 20`;
  };

  useEffect(() => {
    if (defaultEntityApiKey && defaultEntityApiKey !== selectedEntityApiKey) {
      setSelectedEntityApiKey(defaultEntityApiKey);
      const newSql = getRecommendedSql(defaultEntityApiKey);
      setSqlQuery(newSql);
      handleExecuteQuery(newSql);
    }
  }, [defaultEntityApiKey]);

  // 执行 SQL 查询
  const handleExecuteQuery = async (customSql?: string) => {
    const targetSql = (customSql || sqlQuery).trim();
    if (!targetSql) {
      showToast('info', '请输入有效的 SQL 查询语句');
      return;
    }

    setIsQuerying(true);
    setErrorMsg('');
    const startTime = Date.now();
    try {
      const res = await window.neoApi.executeQuery(targetSql);
      setQueryDuration(Date.now() - startTime);
      if (res.success && res.data) {
        setQueryResult(res.data);
      } else {
        setErrorMsg(res.error || 'SQL 执行失败');
        setQueryResult(null);
      }
    } catch (e: any) {
      setErrorMsg(`执行异常: ${e.message}`);
      setQueryResult(null);
    } finally {
      setIsQuerying(false);
    }
  };

  // 切换实体时重新生成模板 SQL 并自动查询
  const handleEntityChange = (apiKey: string) => {
    setSelectedEntityApiKey(apiKey);
    const newSql = getRecommendedSql(apiKey);
    setSqlQuery(newSql);
    handleExecuteQuery(newSql);
  };

  // 复制单元格数据
  const handleCopyCell = (text: any, key: string) => {
    const val = typeof text === 'object' ? JSON.stringify(text) : String(text ?? '');
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  // 导出结果为 Excel
  const handleExportResult = () => {
    if (!queryResult?.records?.length) {
      showToast('info', '当前没有可导出的查询结果数据');
      return;
    }

    const headers = queryResult.fields;
    const rows = queryResult.records.map((r) => {
      return headers.map((k) => {
        const val = r[k];
        if (typeof val === 'object' && val !== null) return JSON.stringify(val);
        return val ?? '';
      });
    });

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'SQL查询结果');
    XLSX.writeFile(workbook, `SQL_${selectedEntityApiKey}_${Date.now()}.xlsx`);
    showToast('success', '查询结果已成功导出为 Excel！');
  };

  return (
    <div className="space-y-4">
      {/* 顶部控制栏与 SQL 编辑器 */}
      <div className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <Terminal className="w-5 h-5 text-sky-600" />
              <h3 className="text-base font-semibold text-slate-900">SQL 数据查询与探索器</h3>
            </div>

            {/* 实体快速切换 */}
            <div className="flex items-center space-x-1.5 text-xs bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200">
              <span className="text-slate-500">快速对齐对象:</span>
              <select
                value={selectedEntityApiKey}
                onChange={(e) => handleEntityChange(e.target.value)}
                className="bg-transparent text-sky-700 font-mono font-medium focus:outline-none cursor-pointer"
              >
                {entities.map((e) => (
                  <option key={e.apiKey} value={e.apiKey}>
                    {e.label} ({e.apiKey})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 快捷模板与导出 */}
          <div className="flex items-center space-x-2 text-xs">
            <button
              onClick={() => {
                const s = getRecommendedSql(selectedEntityApiKey, 'latest');
                setSqlQuery(s);
                handleExecuteQuery(s);
              }}
              className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 transition-colors"
            >
              最新 50 条
            </button>
            <button
              onClick={handleExportResult}
              disabled={!queryResult?.records?.length}
              className="flex items-center space-x-1 px-3 py-1 bg-white hover:bg-slate-50 text-slate-700 rounded-lg border border-slate-200 transition-colors disabled:opacity-40 shadow-2xs font-medium"
            >
              <FileDown className="w-3.5 h-3.5 text-emerald-600" />
              <span>导出结果 (Excel)</span>
            </button>
          </div>
        </div>

        {/* SQL 输入多行文本框 */}
        <div className="flex space-x-2">
          <div className="flex-1 relative">
            <textarea
              rows={3}
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleExecuteQuery();
                }
              }}
              placeholder="编写 SQL 语句，例如: SELECT id, createdAt FROM account WHERE id > 0 LIMIT 20 (支持 Cmd/Ctrl + Enter 运行)"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 resize-none leading-relaxed shadow-inner"
            />
          </div>

          <button
            onClick={() => handleExecuteQuery()}
            disabled={isQuerying}
            className="px-6 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white text-xs font-medium rounded-xl shadow-md shadow-sky-600/20 flex flex-col items-center justify-center space-y-1 transition-all disabled:opacity-50"
          >
            <Play className={`w-4 h-4 ${isQuerying ? 'animate-spin' : ''}`} />
            <span>{isQuerying ? '执行中' : '运行 SQL'}</span>
          </button>
        </div>

        {/* 状态与语法提示 */}
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>支持语法: SELECT ... FROM ... WHERE ... ORDER BY ... LIMIT ... (注意: 不支持 WHERE 1=1，基础条件建议用 WHERE id &gt; 0)</span>
          </div>

          {queryDuration !== null && (
            <div className="flex items-center space-x-2 font-mono text-slate-600 font-medium">
              <span>耗时: {queryDuration}ms</span>
              <span>•</span>
              <span className="text-sky-700">共 {queryResult?.totalSize || 0} 条记录</span>
            </div>
          )}
        </div>
      </div>

      {/* 错误提示 */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 数据表格区域 */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
        {isQuerying ? (
          <div className="p-20 text-center text-xs text-slate-500 flex items-center justify-center space-x-2">
            <RefreshCw className="w-5 h-5 animate-spin text-sky-600" />
            <span>正在执行 SQL 查询并拉取数据...</span>
          </div>
        ) : !queryResult || queryResult.records.length === 0 ? (
          <div className="p-20 text-center text-xs text-slate-400">
            暂无查询结果。请在上方输入 SQL 并点击“运行 SQL”执行检索。
          </div>
        ) : (
          <div className="max-h-[55vh] overflow-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50/95 sticky top-0 border-b border-slate-200 text-slate-600 font-semibold z-10 shadow-2xs">
                <tr>
                  <th className="py-2.5 px-3 w-12 text-center text-slate-400 font-mono">#</th>
                  {queryResult.fields.map((col) => (
                    <th key={col} className="py-2.5 px-3 font-mono tracking-wide whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                  <th className="py-2.5 px-3 text-right pr-4 w-28 whitespace-nowrap">操作联动</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {queryResult.records.map((row, rowIdx) => (
                  <tr key={row.id || rowIdx} className="hover:bg-sky-50/30 transition-colors group">
                    <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                      {rowIdx + 1}
                    </td>

                    {queryResult.fields.map((col) => {
                      const cellVal = row[col];
                      const cellStr = typeof cellVal === 'object' && cellVal !== null ? JSON.stringify(cellVal) : String(cellVal ?? '');
                      const cellId = `${rowIdx}_${col}`;
                      const isCopied = copiedKey === cellId;

                      return (
                        <td
                          key={col}
                          onClick={() => handleCopyCell(cellVal, cellId)}
                          title="点击一键复制单元格数值"
                          className="py-2.5 px-3 text-slate-800 font-mono truncate max-w-xs cursor-pointer hover:text-sky-600 hover:bg-sky-50/50 transition-colors"
                        >
                          <div className="flex items-center space-x-1">
                            <span className="truncate">{cellStr || <span className="text-slate-300">null</span>}</span>
                            {isCopied && <Check className="w-3 h-3 text-emerald-600 flex-shrink-0" />}
                          </div>
                        </td>
                      );
                    })}

                    {/* 联动操作列 */}
                    <td className="py-2.5 px-3 text-right pr-4 whitespace-nowrap">
                      <div className="flex items-center justify-end space-x-1.5 opacity-80 group-hover:opacity-100">
                        {row.id && (
                          <>
                            <button
                              onClick={() => onNavigateToView(selectedEntityApiKey, row.id)}
                              className="px-2 py-1 bg-sky-50 hover:bg-sky-600 text-sky-700 hover:text-white rounded text-[11px] font-medium border border-sky-200 transition-colors flex items-center space-x-0.5"
                              title="穿透查看该条数据所有字段及图片"
                            >
                              <Eye className="w-3 h-3" />
                              <span>钻取</span>
                            </button>
                            <button
                              onClick={() => onNavigateToEdit(selectedEntityApiKey, row.id, row)}
                              className="px-2 py-1 bg-slate-50 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium border border-slate-200 transition-colors flex items-center space-x-0.5"
                              title="以此条数据进入表单编辑"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>编辑</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
