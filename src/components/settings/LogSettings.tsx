import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, 
  FolderOpen, 
  Download, 
  Trash2, 
  RefreshCw, 
  Search, 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  Bug, 
  Copy, 
  Check, 
  Calendar, 
  Clock, 
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Terminal,
  Activity
} from 'lucide-react';
import { LogEntry, LogFileInfo, LogLevel } from '../../../shared/types';

interface LogSettingsProps {
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const LogSettings: React.FC<LogSettingsProps> = ({ showToast }) => {
  const [logFiles, setLogFiles] = useState<LogFileInfo[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [filteredCount, setFilteredCount] = useState<number>(0);
  const [currentFilePath, setCurrentFilePath] = useState<string>('');

  const [levelFilter, setLevelFilter] = useState<LogLevel | 'ALL'>('ALL');
  const [moduleFilter, setModuleFilter] = useState<string>('');
  const [keyword, setKeyword] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState<boolean>(false);

  const logListEndRef = useRef<HTMLDivElement>(null);

  // 1. 加载可用日志文件列表
  const loadFiles = async () => {
    if (!window.neoApi?.loggerGetLogFiles) return;
    try {
      const files = await window.neoApi.loggerGetLogFiles();
      setLogFiles(files);
      if (files.length > 0 && !selectedDate) {
        setSelectedDate(files[0].dateStr);
      }
    } catch (e: any) {
      console.warn('获取日志文件列表失败:', e);
    }
  };

  // 2. 加载当前选定日期的日志内容
  const loadLogs = async (silent = false) => {
    if (!window.neoApi?.loggerGetLogs) return;
    if (!silent) setLoading(true);
    try {
      const res = await window.neoApi.loggerGetLogs({
        date: selectedDate || undefined,
        level: levelFilter,
        module: moduleFilter || undefined,
        keyword: keyword || undefined,
        limit: 500,
      });
      setLogs(res.logs || []);
      setTotalCount(res.total || 0);
      setFilteredCount(res.filteredCount || 0);
      setCurrentFilePath(res.logFilePath || '');
    } catch (e: any) {
      if (!silent) showToast('error', `加载日志失败: ${e.message}`);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  useEffect(() => {
    loadLogs();
  }, [selectedDate, levelFilter, moduleFilter]);

  // 定时自动刷新
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadLogs(true);
    }, 4000);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedDate, levelFilter, moduleFilter, keyword]);

  // 打开日志所在系统文件夹
  const handleOpenDir = async () => {
    if (!window.neoApi?.loggerOpenLogDir) return;
    try {
      const ok = await window.neoApi.loggerOpenLogDir();
      if (ok) {
        showToast('success', '已在系统文件管理器中打开日志目录');
      } else {
        showToast('error', '打开日志目录失败');
      }
    } catch (e: any) {
      showToast('error', `操作失败: ${e.message}`);
    }
  };

  // 导出日志
  const handleExport = async () => {
    if (!window.neoApi?.loggerExportLog) return;
    try {
      const res = await window.neoApi.loggerExportLog(selectedDate);
      if (res.success) {
        showToast('success', res.message || '日志导出成功');
      } else if (res.message && res.message.includes('取消')) {
        showToast('info', '已取消导出');
      } else {
        showToast('error', res.message || '导出失败');
      }
    } catch (e: any) {
      showToast('error', `导出异常: ${e.message}`);
    }
  };

  // 清空历史日志
  const handleClearLogs = async () => {
    if (!window.confirm('确定要清空全部本地历史日志文件吗？该操作不可恢复。')) return;
    if (!window.neoApi?.loggerClearLogs) return;
    try {
      await window.neoApi.loggerClearLogs();
      showToast('success', '已成功清空历史日志');
      await loadFiles();
      await loadLogs();
    } catch (e: any) {
      showToast('error', `清空失败: ${e.message}`);
    }
  };

  // 复制单条日志
  const handleCopySingle = (entry: LogEntry) => {
    navigator.clipboard.writeText(entry.raw);
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // 复制全部过滤日志
  const handleCopyAll = () => {
    if (logs.length === 0) {
      showToast('info', '当前没有可复制的日志条目');
      return;
    }
    const fullText = logs.map((l) => l.raw).join('\n');
    navigator.clipboard.writeText(fullText);
    setCopiedAll(true);
    showToast('success', `已成功复制当前全部 ${logs.length} 条日志到剪贴板！`);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  // 切换详情展开
  const toggleDetails = (id: string) => {
    setExpandedDetails((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getLevelBadge = (level: LogLevel) => {
    switch (level) {
      case 'ERROR':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">ERROR</span>;
      case 'WARN':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">WARN</span>;
      case 'DEBUG':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-500 bg-slate-100 border border-slate-200">DEBUG</span>;
      case 'INFO':
      default:
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-700 border border-sky-200">INFO</span>;
    }
  };

  const currentFile = logFiles.find((f) => f.dateStr === selectedDate) || logFiles[0];

  return (
    <div className="space-y-4">
      {/* 1. 顶部操作与文件摘要横幅 */}
      <div className="p-4 bg-slate-900 rounded-2xl text-white shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 text-sky-400">
            <FileText className="w-5 h-5" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-bold text-white tracking-wide">软件运行日志 (System & Diagnostics Log)</h3>
              <span className="text-[10px] px-2 py-0.2 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                自动留存 14 天
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono truncate" title={currentFilePath}>
              当前文件: {currentFile?.fileName || 'app-today.log'} ({currentFile?.sizeFormatted || '0 KB'})
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0 flex-wrap">
          <button
            onClick={handleOpenDir}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-xl border border-slate-700 transition-colors flex items-center space-x-1.5 cursor-pointer shadow-2xs"
            title="在系统访达/资源管理器中查看全部日志原始文件"
          >
            <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
            <span>打开日志目录</span>
          </button>

          <button
            onClick={handleExport}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-xl border border-slate-700 transition-colors flex items-center space-x-1.5 cursor-pointer shadow-2xs"
            title="导出当前选中日期的日志文件"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>导出日志</span>
          </button>

          <button
            onClick={handleClearLogs}
            className="px-3 py-1.5 bg-slate-800 hover:bg-rose-950/60 hover:text-rose-300 text-slate-300 text-xs rounded-xl border border-slate-700 transition-colors flex items-center space-x-1.5 cursor-pointer shadow-2xs"
            title="清空所有历史日志文件"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>清空日志</span>
          </button>
        </div>
      </div>

      {/* 2. 过滤器控制条 (日期、级别、模块、搜索与实时自动刷新) */}
      <div className="p-3 bg-white border border-slate-200/90 rounded-2xl shadow-2xs space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* 日期选择下拉框 */}
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-slate-600 shrink-0 flex items-center space-x-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>日志日期:</span>
            </span>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-sky-500 cursor-pointer"
            >
              {logFiles.map((file) => (
                <option key={file.dateStr} value={file.dateStr}>
                  {file.dateStr} {file.isToday ? '(今天)' : ''} - {file.sizeFormatted}
                </option>
              ))}
            </select>
          </div>

          {/* 级别过滤器药丸 */}
          <div className="flex items-center space-x-1 p-0.5 bg-slate-100 rounded-xl border border-slate-200 text-xs overflow-x-auto">
            {(['ALL', 'ERROR', 'WARN', 'INFO', 'DEBUG'] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap text-[11px] ${
                  levelFilter === lvl
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {lvl === 'ALL' ? '全部级别' : lvl}
              </button>
            ))}
          </div>

          {/* 自动刷新与单次刷新 */}
          <div className="flex items-center space-x-2 shrink-0">
            <label className="flex items-center space-x-1.5 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span className="text-[11px] font-medium">实时监听 (4s)</span>
            </label>

            <button
              onClick={() => loadLogs()}
              disabled={loading}
              className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer shadow-2xs"
              title="刷新日志"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* 模块快速筛选与关键词搜索 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          {/* 常用模块胶囊 */}
          <div className="flex items-center space-x-1 overflow-x-auto py-0.5">
            <span className="text-slate-400 text-[11px] shrink-0">模块:</span>
            {['', 'Auth', 'Salesforce', 'Fxiaoke', 'NeoCRM', 'AI', 'Workflow', 'Process'].map((m) => (
              <button
                key={m}
                onClick={() => setModuleFilter(m)}
                className={`px-2 py-0.5 rounded-lg border text-[11px] transition-colors cursor-pointer shrink-0 ${
                  moduleFilter === m
                    ? 'bg-sky-50 text-sky-700 border-sky-300 font-bold'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {m || '全部'}
              </button>
            ))}
          </div>

          {/* 搜索框与一键复制全部 */}
          <div className="flex items-center space-x-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadLogs()}
                placeholder="搜索日志消息、报错或关键字..."
                className="w-full pl-8 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white"
              />
            </div>

            <button
              onClick={handleCopyAll}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-medium flex items-center space-x-1 shrink-0 transition-colors cursor-pointer"
              title="复制当前过滤展示的所有日志文本"
            >
              {copiedAll ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
              <span>复制日志</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. 日志流内容展示列表 */}
      <div className="bg-slate-950 rounded-2xl border border-slate-800 shadow-sm overflow-hidden flex flex-col min-h-[420px] max-h-[580px]">
        {/* 控制条状态 */}
        <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <div className="flex items-center space-x-2">
            <Terminal className="w-3.5 h-3.5 text-sky-400" />
            <span>日志记录 ({filteredCount} / 总计 {totalCount} 行)</span>
          </div>
          {autoRefresh && (
            <span className="flex items-center space-x-1 text-emerald-400 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>实时跟踪模式</span>
            </span>
          )}
        </div>

        {/* 虚拟滚动日志窗口 */}
        <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-1 select-text">
          {loading && logs.length === 0 ? (
            <div className="py-20 text-center text-slate-500 flex flex-col items-center justify-center space-y-2">
              <RefreshCw className="w-5 h-5 animate-spin text-sky-400" />
              <span>正在读取并解析系统日志...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="py-20 text-center text-slate-500 flex flex-col items-center justify-center space-y-2">
              <FileText className="w-8 h-8 text-slate-700" />
              <span>暂无符合过滤条件的运行日志记录</span>
            </div>
          ) : (
            logs.map((log) => {
              const isExpanded = expandedDetails.has(log.id);
              const isError = log.level === 'ERROR';
              const isWarn = log.level === 'WARN';

              return (
                <div
                  key={log.id}
                  className={`group px-2.5 py-1.5 rounded-lg border transition-colors ${
                    isError
                      ? 'bg-rose-950/20 border-rose-900/40 hover:bg-rose-950/30 text-rose-200'
                      : isWarn
                      ? 'bg-amber-950/20 border-amber-900/40 hover:bg-amber-950/30 text-amber-200'
                      : 'bg-slate-900/40 border-slate-850 hover:bg-slate-900/80 text-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start space-x-2 min-w-0 flex-1">
                      {/* 时间戳 */}
                      <span className="text-[10px] text-slate-500 shrink-0 pt-0.5 select-none">
                        {log.timestamp ? log.timestamp.split(' ')[1] || log.timestamp : '--:--:--'}
                      </span>

                      {/* 级别标签 */}
                      <span className="shrink-0">{getLevelBadge(log.level)}</span>

                      {/* 模块标签 */}
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-sky-400 border border-slate-700 shrink-0 font-medium">
                        [{log.module}]
                      </span>

                      {/* 消息正文 */}
                      <span className="break-all leading-relaxed whitespace-pre-wrap flex-1 text-slate-200 font-sans">
                        {log.message}
                      </span>
                    </div>

                    {/* 操作：展开详情 / 复制单行 */}
                    <div className="flex items-center space-x-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {log.details && (
                        <button
                          onClick={() => toggleDetails(log.id)}
                          className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 hover:text-white border border-slate-700 flex items-center space-x-0.5 cursor-pointer"
                          title="展开详细堆栈或上下文"
                        >
                          <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          <span>详情</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleCopySingle(log)}
                        className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                        title="复制此条日志"
                      >
                        {copiedId === log.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>

                  {/* 展开的详情堆栈 / JSON 数据 */}
                  {isExpanded && log.details && (
                    <div className="mt-2 p-2.5 rounded-lg bg-black/60 border border-slate-800 text-[11px] text-slate-300 font-mono break-all whitespace-pre-wrap select-text animate-in fade-in duration-100">
                      <div className="flex justify-between items-center text-[10px] text-slate-500 pb-1 mb-1 border-b border-slate-800/80">
                        <span>调用详情与异常堆栈 (Stack / Context):</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(log.details || '');
                            showToast('success', '已复制详情');
                          }}
                          className="text-sky-400 hover:text-sky-300"
                        >
                          复制详情
                        </button>
                      </div>
                      {log.details}
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={logListEndRef} />
        </div>
      </div>
    </div>
  );
};
