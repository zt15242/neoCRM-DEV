import React, { useState, useEffect } from 'react';
import { 
  Terminal, 
  RefreshCw, 
  Copy, 
  Check, 
  FileDown, 
  AlertCircle, 
  Eye, 
  Edit3, 
  Sparkles,
  RotateCw,
  Info
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { EntityMetadata, QueryResultData, ScrollProgress } from '../../../shared/types';
import { EntitySearchSelect } from './EntitySearchSelect';

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
  const getEntityPrimaryNameCol = (apiKey: string) => {
    // 纷享销客
    if (apiKey.endsWith('Obj')) {
      return 'name';
    }
    // Salesforce
    if (apiKey.includes('__c') || /^[A-Z]/.test(apiKey)) {
      return 'Name';
    }
    // 销售易
    const map: Record<string, string> = {
      account: "accountName",
      contact: "contactName",
      opportunity: "opportunityName",
      lead: "name",
      order: "po",
      contract: "title",
      product: "productName",
      user: "name",
      department: "departName",
    };
    return map[apiKey] || "name";
  };

  const [selectedEntityApiKey, setSelectedEntityApiKey] = useState(defaultEntityApiKey || "account");
  const [sqlQuery, setSqlQuery] = useState(
    `SELECT id, ${getEntityPrimaryNameCol(defaultEntityApiKey || "account")}, createdAt FROM ${defaultEntityApiKey || "account"}`
  );
  const [scrollBatchCount, setScrollBatchCount] = useState<number>(1000);

  const [isQuerying, setIsQuerying] = useState(false);
  const [scrollProgress, setScrollProgress] = useState<ScrollProgress | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResultData | null>(null);
  const [queryDuration, setQueryDuration] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // 监听主进程推流的滚动拉取进度
  useEffect(() => {
    const cleanup = window.neoApi?.onScrollProgress?.((p) => {
      setScrollProgress(p);
    });
    return () => {
      cleanup?.();
    };
  }, []);

  const getRecommendedSql = (apiKey: string) => {
    const nameCol = getEntityPrimaryNameCol(apiKey);
    if (apiKey.endsWith('Obj')) return `SELECT _id, ${nameCol} FROM ${apiKey}`;
    if (/^[A-Z]/.test(apiKey) || apiKey.includes('__c')) {
      return `SELECT Id, ${nameCol}, CreatedDate FROM ${apiKey} ORDER BY CreatedDate DESC`;
    }
    return `SELECT id, ${nameCol}, createdAt FROM ${apiKey}`;
  };

  useEffect(() => {
    if (defaultEntityApiKey && defaultEntityApiKey !== selectedEntityApiKey) {
      setSelectedEntityApiKey(defaultEntityApiKey);
      const newSql = getRecommendedSql(defaultEntityApiKey);
      setSqlQuery(newSql);
    }
  }, [defaultEntityApiKey]);

  // Queries use automatic connector pagination; an explicit SQL LIMIT is still honored.
  const handleExecuteQuery = async (customSql?: string) => {
    const targetSql = (customSql || sqlQuery).trim();
    if (!targetSql) {
      showToast('info', '请输入有效的 SQL 查询语句');
      return;
    }

    setIsQuerying(true);
    setErrorMsg('');
    setScrollProgress(null);
    const startTime = Date.now();

    try {
      const res = await window.neoApi.executeScrollQuery(targetSql, scrollBatchCount);
      setQueryDuration(Date.now() - startTime);
      if (res.success && res.data) {
        setQueryResult(res.data);
        showToast('success', `查询完成，已获取 ${res.data.records.length} 条记录`);
      } else {
        setErrorMsg(res.error || '查询执行失败');
        setQueryResult(null);
      }
    } catch (e: any) {
      setErrorMsg(`执行异常: ${e.message}`);
      setQueryResult(null);
    } finally {
      setIsQuerying(false);
      setScrollProgress(null);
    }
  };

  // 切换实体
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

  // 导出结果为 Excel (支持导出全部滚动查询结果)
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
    XLSX.utils.book_append_sheet(workbook, worksheet, 'SQL查询全量数据');
    XLSX.writeFile(workbook, `SQL_${selectedEntityApiKey}_共${queryResult.records.length}条_${Date.now()}.xlsx`);
    showToast('success', `已成功导出全部 ${queryResult.records.length} 条数据至 Excel！`);
  };

  return (
    <div className="space-y-4">
      {/* 顶部控制栏与 SQL 编辑器 */}
      <div className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-3.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <Terminal className="w-5 h-5 text-sky-600" />
              <h3 className="text-base font-semibold text-slate-900">SQL 数据查询与探索器</h3>
            </div>

            {/* 实体快速切换 (支持实时搜索) */}
            <EntitySearchSelect
              entities={entities}
              value={selectedEntityApiKey}
              onChange={handleEntityChange}
              labelPrefix="快速对齐对象:"
            />
          </div>

          {/* 查询批次与结果导出 */}
          <div className="flex items-center space-x-2.5 text-xs">
            <label className="flex items-center gap-2 text-slate-600">
              <span>每批</span>
              <select
                value={scrollBatchCount}
                onChange={(e) => setScrollBatchCount(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sky-700 font-mono font-medium focus:outline-none"
              >
                <option value={200}>200</option>
                <option value={500}>500</option>
                <option value={1000}>1000</option>
              </select>
            </label>

            <button
              onClick={handleExportResult}
              disabled={!queryResult?.records?.length}
              className="flex items-center space-x-1 px-3 py-1 bg-white hover:bg-slate-50 text-slate-700 rounded-lg border border-slate-200 transition-colors disabled:opacity-40 shadow-2xs font-medium"
            >
              <FileDown className="w-3.5 h-3.5 text-emerald-600" />
              <span>导出全量结果 (Excel)</span>
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
              placeholder="输入查询语句，如 SELECT id, accountName, createdAt FROM account；未写 LIMIT 时自动分页获取全部匹配数据"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 resize-none leading-relaxed shadow-inner"
            />
          </div>

          <button
            onClick={() => handleExecuteQuery()}
            disabled={isQuerying}
            className="flex flex-col items-center justify-center space-y-1 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 px-6 text-xs font-medium text-white shadow-md shadow-sky-600/20 transition-all hover:from-sky-500 hover:to-indigo-500 disabled:opacity-50"
          >
            {isQuerying ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCw className="w-4 h-4" />
            )}
            <span>{isQuerying ? '分页拉取中...' : '执行查询'}</span>
          </button>
        </div>

        {/* 动态滚动进度指示条 (当处于滚动执行中时展现) */}
        {isQuerying && scrollProgress && (
          <div className="p-3 bg-sky-50/80 rounded-xl border border-sky-200 space-y-1.5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-sky-900 flex items-center space-x-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-600" />
                <span>正在自动多批次滚动拉取数据 (第 {scrollProgress.page} 批)...</span>
              </span>
              <span className="font-mono text-sky-700 font-bold">
                {scrollProgress.current} / {scrollProgress.total} 条 ({scrollProgress.percent}%)
              </span>
            </div>
            <div className="w-full h-2 bg-sky-200/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-sky-600 to-indigo-600 transition-all duration-200"
                style={{ width: `${scrollProgress.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* 状态与语法提示 */}
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center space-x-2">
            <Info className="w-3.5 h-3.5 text-sky-600" />
            <span>
              '未指定 LIMIT 时按连接器分页读取全部匹配数据；显式 LIMIT/OFFSET 仍然生效'
            </span>
          </div>

          {queryDuration !== null && (
            <div className="flex items-center space-x-2 font-mono text-slate-600 font-medium">
              <span>耗时: {queryDuration}ms</span>
              <span>•</span>
              <span className="text-sky-700 font-bold">已展示 {queryResult?.records?.length || 0} 条 (总库: {queryResult?.totalSize || 0} 条)</span>
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
        {isQuerying && !scrollProgress ? (
          <div className="p-20 text-center text-xs text-slate-500 flex items-center justify-center space-x-2">
            <RefreshCw className="w-5 h-5 animate-spin text-sky-600" />
            <span>正在建立连接并拉取数据...</span>
          </div>
        ) : !queryResult || queryResult.records.length === 0 ? (
          <div className="p-20 text-center text-xs text-slate-400">
            暂无查询结果。输入 SQL 后点击“执行查询”。
          </div>
        ) : (
          <div>
            {/* 统计提示条 */}
            <div className="px-4 py-2 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span className="font-medium">
                结果集列表：共呈现 <strong className="text-sky-700 font-mono text-sm">{queryResult.records.length}</strong> 条记录
                {queryResult.records.length >= (queryResult.totalSize || 0) ? (
                  <span className="ml-2 text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    已全量获取完毕
                  </span>
                ) : (
                  <span className="ml-2 text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    {/\bLIMIT\s+\d+/i.test(sqlQuery) ? '已按 SQL 范围返回' : '返回数与平台总数不一致'}
                  </span>
                )}
              </span>
              <span className="text-[11px] text-slate-400">支持点击任意单元格一键复制数值</span>
            </div>

            <div className="max-h-[55vh] overflow-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50/95 sticky top-0 border-b border-slate-200 text-slate-600 font-semibold z-10 shadow-2xs">
                  <tr>
                    <th className="py-2.5 px-3 w-14 text-center text-slate-400 font-mono">#</th>
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
                      <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">
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
                            className="py-2 px-3 text-slate-800 font-mono truncate max-w-xs cursor-pointer hover:text-sky-600 hover:bg-sky-50/50 transition-colors"
                          >
                            <div className="flex items-center space-x-1">
                              <span className="truncate">{cellStr || <span className="text-slate-300">null</span>}</span>
                              {isCopied && <Check className="w-3 h-3 text-emerald-600 flex-shrink-0" />}
                            </div>
                          </td>
                        );
                      })}

                      {/* 联动操作列 */}
                      <td className="py-2 px-3 text-right pr-4 whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-1.5 opacity-80 group-hover:opacity-100">
                          {row.id && (
                            <>
                              <button
                                onClick={() => onNavigateToView(selectedEntityApiKey, row.id)}
                                className="px-2 py-0.5 bg-sky-50 hover:bg-sky-600 text-sky-700 hover:text-white rounded text-[11px] font-medium border border-sky-200 transition-colors flex items-center space-x-0.5"
                                title="穿透查看该条数据所有字段及图片"
                              >
                                <Eye className="w-3 h-3" />
                                <span>钻取</span>
                              </button>
                              <button
                                onClick={() => onNavigateToEdit(selectedEntityApiKey, row.id, row)}
                                className="px-2 py-0.5 bg-slate-50 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-medium border border-slate-200 transition-colors flex items-center space-x-0.5"
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
          </div>
        )}
      </div>
    </div>
  );
};
