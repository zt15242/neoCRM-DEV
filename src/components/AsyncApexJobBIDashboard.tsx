import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  RefreshCw,
  Search,
  Filter,
  BarChart3,
  PieChart,
  Calendar,
  FileCode,
  Download,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Cpu,
  Database
} from 'lucide-react';

export interface AsyncApexJobRecord {
  Id: string;
  ApexClassId?: string;
  ApexClass?: {
    Id?: string;
    Name?: string;
  };
  MethodName?: string;
  JobType?: string;
  Status?: string;
  ExtendedStatus?: string;
  JobItemsProcessed?: number;
  TotalJobItems?: number;
  NumberOfErrors?: number;
  CreatedDate?: string;
  CompletedDate?: string;
  CreatedBy?: {
    Name?: string;
  };
  CronTriggerId?: string;
  ParentJobId?: string;
  LastProcessed?: string;
  LastProcessedOffset?: string;
  [key: string]: any;
}

interface AsyncApexJobBIDashboardProps {
  accountId: string;
  onClose?: () => void;
  initialSql?: string;
}

export const AsyncApexJobBIDashboard: React.FC<AsyncApexJobBIDashboardProps> = ({
  accountId,
  onClose,
  initialSql = 'SELECT ApexClass.Name, CompletedDate, CreatedBy.Name, CreatedDate, ExtendedStatus, Id, JobItemsProcessed, JobType, MethodName, NumberOfErrors, ParentJobId, Status, TotalJobItems FROM AsyncApexJob WHERE CreatedDate = YESTERDAY ORDER BY CreatedDate DESC'
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<AsyncApexJobRecord[]>([]);
  const [timeRange, setTimeRange] = useState<'YESTERDAY' | 'TODAY' | 'LAST_N_DAYS:7' | 'ALL'>('YESTERDAY');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedJob, setSelectedJob] = useState<AsyncApexJobRecord | null>(null);

  // 执行 SOQL 查询
  const fetchData = async (range: string = timeRange) => {
    setLoading(true);
    setError(null);

    let whereClause = '';
    if (range === 'YESTERDAY') {
      whereClause = 'WHERE CreatedDate = YESTERDAY';
    } else if (range === 'TODAY') {
      whereClause = 'WHERE CreatedDate = TODAY';
    } else if (range === 'LAST_N_DAYS:7') {
      whereClause = 'WHERE CreatedDate = LAST_N_DAYS:7';
    }

    const selectClause = initialSql.match(/^SELECT[\s\S]*?\s+FROM\s+AsyncApexJob\b/i)?.[0]
      || 'SELECT ApexClass.Name, CompletedDate, CreatedBy.Name, CreatedDate, ExtendedStatus, Id, JobItemsProcessed, JobType, MethodName, NumberOfErrors, ParentJobId, Status, TotalJobItems FROM AsyncApexJob';
    const currentSql = `${selectClause} ${whereClause} ORDER BY CreatedDate DESC`;

    try {
      if (!accountId) {
        setError('请先为看板绑定 Salesforce 连接器账号。');
      } else if (window.neoApi?.workspaceQueryConnector) {
        const res = await window.neoApi.workspaceQueryConnector(accountId, currentSql);
        if (res.success && res.data) {
          setRecords((res.data.records as AsyncApexJobRecord[]) || []);
        } else {
          setError(res.error || '查询异步作业失败');
        }
      } else {
        // 兜底模拟提示（若未在 Electron 环境渲染）
        setError('未检测到本地 Salesforce/NeoCRM API 通道，请确保在客户端工作台中运行。');
      }
    } catch (err: any) {
      setError(err?.message || '执行 SOQL 时发生异常');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(timeRange);
  }, [timeRange, accountId]);

  // 基础聚合计算
  const metrics = useMemo(() => {
    let totalErrors = 0;
    let totalProcessed = 0;
    let totalItems = 0;
    const typeDistribution: Record<string, number> = {};
    const statusDistribution: Record<string, number> = {};
    const classDistribution: Record<string, { name: string; count: number; errors: number; processed: number }> = {};
    const durationList: number[] = [];

    records.forEach((r) => {
      // 错误与数量
      const err = Number(r.NumberOfErrors) || 0;
      const proc = Number(r.JobItemsProcessed) || 0;
      const tot = Number(r.TotalJobItems) || 0;
      totalErrors += err;
      totalProcessed += proc;
      totalItems += tot;

      // 类型分布
      const t = r.JobType || '未知类型';
      typeDistribution[t] = (typeDistribution[t] || 0) + 1;

      // 状态分布
      const s = r.Status || '未知状态';
      statusDistribution[s] = (statusDistribution[s] || 0) + 1;

      // 类名分布
      const cName = r.ApexClass?.Name || (r.MethodName ? `方法:${r.MethodName}` : '系统/Token');
      if (!classDistribution[cName]) {
        classDistribution[cName] = { name: cName, count: 0, errors: 0, processed: 0 };
      }
      classDistribution[cName].count += 1;
      classDistribution[cName].errors += err;
      classDistribution[cName].processed += proc;

      // 耗时计算 (秒)
      if (r.CreatedDate && r.CompletedDate) {
        const diff = Math.round((new Date(r.CompletedDate).getTime() - new Date(r.CreatedDate).getTime()) / 1000);
        if (diff >= 0) durationList.push(diff);
      }
    });

    const avgDuration = durationList.length > 0
      ? (durationList.reduce((a, b) => a + b, 0) / durationList.length).toFixed(1)
      : '0';

    const maxDuration = durationList.length > 0 ? Math.max(...durationList) : 0;
    const unsuccessful = (statusDistribution['Failed'] || 0) + (statusDistribution['Aborted'] || 0);
    const successRate = records.length > 0
      ? (((records.length - unsuccessful) / records.length) * 100).toFixed(1)
      : '100';

    const topClasses = Object.values(classDistribution).sort((a, b) => b.count - a.count).slice(0, 8);
    const topErrorClasses = Object.values(classDistribution).filter(c => c.errors > 0).sort((a, b) => b.errors - a.errors);

    return {
      total: records.length,
      totalErrors,
      totalProcessed,
      totalItems,
      avgDuration,
      maxDuration,
      successRate,
      typeDistribution,
      statusDistribution,
      topClasses,
      topErrorClasses
    };
  }, [records]);

  // 过滤后的列表
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const matchKeyword =
        !searchKeyword ||
        (r.ApexClass?.Name && r.ApexClass.Name.toLowerCase().includes(searchKeyword.toLowerCase())) ||
        (r.MethodName && r.MethodName.toLowerCase().includes(searchKeyword.toLowerCase())) ||
        (r.Id && r.Id.toLowerCase().includes(searchKeyword.toLowerCase())) ||
        (r.CreatedBy?.Name && r.CreatedBy.Name.toLowerCase().includes(searchKeyword.toLowerCase()));

      const matchType = selectedType === 'ALL' || r.JobType === selectedType;
      const matchStatus = selectedStatus === 'ALL' || r.Status === selectedStatus;

      return matchKeyword && matchType && matchStatus;
    });
  }, [records, searchKeyword, selectedType, selectedStatus]);

  // 导出 CSV
  const handleExportCSV = () => {
    if (filteredRecords.length === 0) return;
    const headers = [
      'JobId',
      'ApexClass',
      'JobType',
      'Status',
      'NumberOfErrors',
      'JobItemsProcessed',
      'TotalJobItems',
      'CreatedDate',
      'CompletedDate',
      'ExtendedStatus'
    ];
    const rows = filteredRecords.map((r) => [
      r.Id,
      r.ApexClass?.Name || r.MethodName || '',
      r.JobType || '',
      r.Status || '',
      r.NumberOfErrors || 0,
      r.JobItemsProcessed || 0,
      r.TotalJobItems || 0,
      r.CreatedDate || '',
      r.CompletedDate || '',
      `"${(r.ExtendedStatus || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,﻿' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `AsyncApexJob_BI_${timeRange}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 font-sans overflow-hidden">
      {/* 顶部导航控制条 */}
      <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-500/20">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
              <span>Apex 异步作业调度 BI 看板</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/60 font-mono">
                AsyncApexJob
              </span>
            </h1>
            <p className="text-xs text-slate-400">实时监控 BatchApex、Queueable、Scheduled 与 Future 作业生命周期与异常对账</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* 时间范围选择 */}
          <div className="inline-flex rounded-lg bg-slate-800 p-0.5 border border-slate-700 text-xs">
            <button
              onClick={() => setTimeRange('YESTERDAY')}
              className={`px-3 py-1.5 rounded-md transition-colors ${timeRange === 'YESTERDAY' ? 'bg-cyan-600 text-white font-medium shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              昨日 (Yesterday)
            </button>
            <button
              onClick={() => setTimeRange('TODAY')}
              className={`px-3 py-1.5 rounded-md transition-colors ${timeRange === 'TODAY' ? 'bg-cyan-600 text-white font-medium shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              今日 (Today)
            </button>
            <button
              onClick={() => setTimeRange('LAST_N_DAYS:7')}
              className={`px-3 py-1.5 rounded-md transition-colors ${timeRange === 'LAST_N_DAYS:7' ? 'bg-cyan-600 text-white font-medium shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              近 7 天
            </button>
          </div>

          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            <span>刷新</span>
          </button>

          <button
            onClick={handleExportCSV}
            disabled={filteredRecords.length === 0}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 text-xs transition disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>导出 CSV</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 border border-slate-700 text-xs"
            >
              关闭
            </button>
          )}
        </div>
      </div>

      {/* 主面板内容 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {error && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-sm flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">数据加载异常</p>
              <p className="text-xs text-rose-300/80 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* 顶部 KPI 核心卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* 作业总量 */}
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-800 relative overflow-hidden group hover:border-slate-700 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">总作业调度量</span>
              <Layers className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="mt-2 flex items-baseline space-x-2">
              <span className="text-2xl font-bold tracking-tight text-white">{metrics.total}</span>
              <span className="text-xs text-slate-500">笔</span>
            </div>
            <div className="mt-2 text-xs text-slate-400 flex items-center space-x-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>成功率 {metrics.successRate}%</span>
            </div>
          </div>

          {/* 错误数量 */}
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-800 group hover:border-rose-900/40 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">累计错误批次 (Errors)</span>
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            </div>
            <div className="mt-2 flex items-baseline space-x-2">
              <span className={`text-2xl font-bold tracking-tight ${metrics.totalErrors > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {metrics.totalErrors}
              </span>
              <span className="text-xs text-slate-500">次异常</span>
            </div>
            <div className="mt-2 text-xs text-slate-400">
              {metrics.topErrorClasses.length > 0 ? (
                <span className="text-rose-400/90 truncate block max-w-full">
                  主要受影响: {metrics.topErrorClasses[0].name}
                </span>
              ) : (
                <span className="text-emerald-400/80">全量作业运行顺畅无阻</span>
              )}
            </div>
          </div>

          {/* 处理记录项 */}
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-800 group hover:border-slate-700 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">已处理分片项 (Items)</span>
              <TrendingUp className="w-4 h-4 text-blue-400" />
            </div>
            <div className="mt-2 flex items-baseline space-x-2">
              <span className="text-2xl font-bold tracking-tight text-white">{metrics.totalProcessed.toLocaleString()}</span>
              <span className="text-xs text-slate-500">/ {metrics.totalItems.toLocaleString()}</span>
            </div>
            <div className="mt-2 text-xs text-slate-400">
              分块完成率: {metrics.totalItems > 0 ? ((metrics.totalProcessed / metrics.totalItems) * 100).toFixed(1) : 100}%
            </div>
          </div>

          {/* 平均耗时 */}
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-800 group hover:border-slate-700 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">作业平均耗时</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-2 flex items-baseline space-x-2">
              <span className="text-2xl font-bold tracking-tight text-white">{metrics.avgDuration}</span>
              <span className="text-xs text-slate-500">秒</span>
            </div>
            <div className="mt-2 text-xs text-slate-400">
              峰值耗时: {metrics.maxDuration}s
            </div>
          </div>

          {/* 活跃类型数 */}
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-800 group hover:border-slate-700 transition">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">并发调度类型</span>
              <BarChart3 className="w-4 h-4 text-purple-400" />
            </div>
            <div className="mt-2 flex items-baseline space-x-2">
              <span className="text-2xl font-bold tracking-tight text-white">
                {Object.keys(metrics.typeDistribution).length}
              </span>
              <span className="text-xs text-slate-500">种模式</span>
            </div>
            <div className="mt-2 text-xs text-slate-400 truncate">
              {Object.keys(metrics.typeDistribution).slice(0, 3).join(', ')}
            </div>
          </div>
        </div>

        {/* 中间图表分析区 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧：作业类型分布 (JobType) */}
          <div className="p-5 rounded-xl bg-slate-800/40 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
                  <PieChart className="w-4 h-4 text-cyan-400" />
                  <span>JobType 作业类型分布</span>
                </h3>
                <span className="text-xs text-slate-400">{records.length} 笔调度</span>
              </div>
              <div className="space-y-3">
                {Object.entries(metrics.typeDistribution)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => {
                    const percent = ((count / (metrics.total || 1)) * 100).toFixed(1);
                    return (
                      <div key={type} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-300 font-medium">{type}</span>
                          <span className="text-slate-400">
                            {count} <span className="text-slate-500">({percent}%)</span>
                          </span>
                        </div>
                        <div className="h-2 w-full bg-slate-700/60 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-500">
              * BatchApex 与 BatchApexWorker 属于大容量批量调度，Queueable 属于链式轻量队列。
            </div>
          </div>

          {/* 中间：TOP Apex 类执行频度 */}
          <div className="p-5 rounded-xl bg-slate-800/40 border border-slate-800 flex flex-col justify-between lg:col-span-2">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
                  <BarChart3 className="w-4 h-4 text-blue-400" />
                  <span>高频 Apex 执行类排行 (TOP 排行与错误感知)</span>
                </h3>
                <span className="text-xs text-slate-400">按执行频次降序</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {metrics.topClasses.map((item, idx) => {
                  const hasError = item.errors > 0;
                  return (
                    <div
                      key={item.name}
                      onClick={() => setSearchKeyword(item.name.replace('方法:', ''))}
                      className={`p-3 rounded-lg border transition cursor-pointer flex flex-col justify-between ${
                        hasError
                          ? 'bg-rose-950/20 border-rose-900/50 hover:border-rose-700'
                          : 'bg-slate-800/60 border-slate-700/60 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-2 truncate">
                          <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                            #{idx + 1}
                          </span>
                          <span className="text-xs font-semibold text-slate-200 truncate" title={item.name}>
                            {item.name}
                          </span>
                        </div>
                        {hasError ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-900/80 text-rose-300 border border-rose-700 font-mono">
                            {item.errors} Err
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono">
                            OK
                          </span>
                        )}
                      </div>
                      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                        <span>调度频次: <b className="text-white">{item.count}</b> 次</span>
                        <span>处理总片数: {item.processed}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-between">
              <span>点击卡片可快速筛选定位该类的所有历史调度详情</span>
              {searchKeyword && (
                <button
                  onClick={() => setSearchKeyword('')}
                  className="text-cyan-400 hover:underline"
                >
                  清除过滤: "{searchKeyword}"
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 底部：精细化作业数据明细表 */}
        <div className="rounded-xl bg-slate-800/40 border border-slate-800 overflow-hidden flex flex-col">
          {/* 表格工具栏 */}
          <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2 flex-1 min-w-[240px] max-w-md">
              <div className="relative w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="搜索类名、方法名、Job ID、创建人..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="w-full bg-slate-900/90 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {/* 类型过滤 */}
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">全部作业类型 ({records.length})</option>
                {Object.keys(metrics.typeDistribution).map((t) => (
                  <option key={t} value={t}>
                    {t} ({metrics.typeDistribution[t]})
                  </option>
                ))}
              </select>

              {/* 状态过滤 */}
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">全部运行状态</option>
                {Object.keys(metrics.statusDistribution).map((s) => (
                  <option key={s} value={s}>
                    {s} ({metrics.statusDistribution[s]})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 表格主体 */}
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-800/80 sticky top-0 z-10 text-slate-400 font-medium border-b border-slate-700">
                <tr>
                  <th className="py-2.5 px-4">作业 ID / 类名</th>
                  <th className="py-2.5 px-3">作业类型</th>
                  <th className="py-2.5 px-3">状态</th>
                  <th className="py-2.5 px-3">已处理 / 总批次</th>
                  <th className="py-2.5 px-3">错误数</th>
                  <th className="py-2.5 px-3">创建时间</th>
                  <th className="py-2.5 px-3">完成时间</th>
                  <th className="py-2.5 px-3">耗时</th>
                  <th className="py-2.5 px-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300 font-mono">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500 font-sans">
                      暂无匹配的作业记录
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((job) => {
                    const hasErr = (Number(job.NumberOfErrors) || 0) > 0;
                    let durationText = '-';
                    if (job.CreatedDate && job.CompletedDate) {
                      const sec = Math.round(
                        (new Date(job.CompletedDate).getTime() - new Date(job.CreatedDate).getTime()) / 1000
                      );
                      durationText = sec >= 0 ? `${sec}s` : '-';
                    }

                    return (
                      <tr
                        key={job.Id}
                        className="hover:bg-slate-800/50 transition cursor-pointer"
                        onClick={() => setSelectedJob(job)}
                      >
                        <td className="py-2.5 px-4">
                          <div className="flex flex-col">
                            <span className="text-white font-semibold font-sans">
                              {job.ApexClass?.Name || job.MethodName || '系统作业'}
                            </span>
                            <span className="text-[10px] text-slate-500">{job.Id}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[11px] font-sans">
                            {job.JobType}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-sans ${
                              job.Status === 'Completed'
                                ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                                : job.Status === 'Failed'
                                ? 'bg-rose-950/60 text-rose-400 border border-rose-800'
                                : 'bg-amber-950/60 text-amber-400 border border-amber-800'
                            }`}
                          >
                            <span>{job.Status}</span>
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span>
                            {job.JobItemsProcessed || 0} / {job.TotalJobItems || 0}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={hasErr ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                            {job.NumberOfErrors || 0}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-400">
                          {job.CreatedDate ? new Date(job.CreatedDate).toLocaleString() : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-400">
                          {job.CompletedDate ? new Date(job.CompletedDate).toLocaleString() : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-400 font-sans">
                          {durationText}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedJob(job);
                            }}
                            className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2 bg-slate-900 border-t border-slate-800 text-xs text-slate-500 flex justify-between items-center">
            <span>当前筛选显示: {filteredRecords.length} / 全量: {records.length} 笔作业</span>
            <span>SOQL: SELECT ... FROM AsyncApexJob WHERE CreatedDate = {timeRange}</span>
          </div>
        </div>
      </div>

      {/* 作业详情抽屉 / Modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FileCode className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-white text-base">作业详细元数据对账</h3>
              </div>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-800"
              >
                ESC / 关闭
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
                  <div className="text-slate-400">Job ID</div>
                  <div className="text-white font-mono mt-1 font-semibold">{selectedJob.Id}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
                  <div className="text-slate-400">Apex 类</div>
                  <div className="text-cyan-300 font-semibold mt-1">
                    {selectedJob.ApexClass?.Name || selectedJob.MethodName || '系统内部'}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
                  <div className="text-slate-400">作业模式 (JobType)</div>
                  <div className="text-white mt-1">{selectedJob.JobType}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
                  <div className="text-slate-400">当前状态 (Status)</div>
                  <div className="text-white mt-1">{selectedJob.Status}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
                  <div className="text-slate-400">批次处理进度</div>
                  <div className="text-white mt-1">
                    {selectedJob.JobItemsProcessed || 0} / {selectedJob.TotalJobItems || 0} (
                    {selectedJob.NumberOfErrors || 0} 异常)
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
                  <div className="text-slate-400">创建人 (CreatedBy)</div>
                  <div className="text-white mt-1">{selectedJob.CreatedBy?.Name || '-'}</div>
                </div>
              </div>

              {selectedJob.ExtendedStatus && (
                <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-800/50">
                  <div className="text-rose-400 font-semibold mb-1 flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>详细异常堆栈 (ExtendedStatus)</span>
                  </div>
                  <div className="text-rose-200 font-mono text-[11px] whitespace-pre-wrap break-all">
                    {selectedJob.ExtendedStatus}
                  </div>
                </div>
              )}

              <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-800 font-mono text-[11px] text-slate-400">
                <div>CreatedDate: {selectedJob.CreatedDate}</div>
                <div>CompletedDate: {selectedJob.CompletedDate}</div>
                <div>CronTriggerId: {selectedJob.CronTriggerId || 'None'}</div>
                <div>ParentJobId: {selectedJob.ParentJobId || 'None'}</div>
              </div>
            </div>
            <div className="px-6 py-3 bg-slate-800/50 border-t border-slate-800 text-right">
              <button
                onClick={() => setSelectedJob(null)}
                className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
