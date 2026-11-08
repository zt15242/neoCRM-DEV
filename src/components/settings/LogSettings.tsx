import React, { useState, useEffect, useRef } from 'react';
import { FileText, FolderOpen, Download, Trash2, RefreshCw, Search, Copy, Check, ChevronRight } from 'lucide-react';
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

  const requestRef = useRef(0);

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
    const request = ++requestRef.current;
    if (!silent) setLoading(true);
    try {
      const res = await window.neoApi.loggerGetLogs({
        date: selectedDate || undefined,
        level: levelFilter,
        module: moduleFilter || undefined,
        keyword: keyword || undefined,
        limit: 500,
      });
      if (request !== requestRef.current) return;
      setLogs(res.logs || []);
      setTotalCount(res.total || 0);
      setFilteredCount(res.filteredCount || 0);
      setCurrentFilePath(res.logFilePath || '');
    } catch (e: any) {
      if (!silent && request === requestRef.current) showToast('error', `加载日志失败: ${e.message}`);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  useEffect(() => {
    loadLogs();
  }, [selectedDate, levelFilter, moduleFilter]);

  useEffect(() => {
    const timer = setTimeout(() => loadLogs(), 300);
    return () => clearTimeout(timer);
  }, [keyword]);

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
      const cleared = await window.neoApi.loggerClearLogs();
      if (!cleared) throw new Error('日志文件未能清空');
      setSelectedDate('');
      showToast('success', '已成功清空历史日志');
      await loadFiles();
      await loadLogs();
    } catch (e: any) {
      showToast('error', `清空失败: ${e.message}`);
    }
  };

  // 复制单条日志
  const handleCopySingle = async (entry: LogEntry) => {
    try { await navigator.clipboard.writeText(entry.raw); } catch { showToast('error', '复制失败，请检查剪贴板权限'); return; }
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // 复制全部过滤日志
  const handleCopyAll = async () => {
    if (logs.length === 0) {
      showToast('info', '当前没有可复制的日志条目');
      return;
    }
    const fullText = logs.map((l) => l.raw).join('\n');
    try { await navigator.clipboard.writeText(fullText); } catch { showToast('error', '复制失败，请检查剪贴板权限'); return; }
    setCopiedAll(true);
    showToast('success', `已成功复制当前显示的 ${logs.length} 条日志到剪贴板！`);
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

  const currentFile = logFiles.find((f) => f.dateStr === selectedDate) || logFiles[0];

  return (
    <div className="log-settings">
      <header className="log-settings__heading">
        <div><h3>软件运行日志</h3><p title={currentFilePath}>{currentFile?.fileName || '暂无日志文件'}{currentFile ? ` · ${currentFile.sizeFormatted}` : ''} · 自动留存 14 天</p></div>
        <div className="log-settings__actions">
          <button onClick={handleOpenDir}><FolderOpen size={14} />打开目录</button>
          <button onClick={handleExport}><Download size={14} />导出日志</button>
          <button onClick={handleClearLogs}><Trash2 size={14} />清空日志</button>
        </div>
      </header>
      <section className="log-settings__filters" aria-label="日志筛选">
        <div className="log-settings__filter-row">
          <label>日志日期 <select value={selectedDate} onChange={e => setSelectedDate(e.target.value)} aria-label="日志日期">
            {logFiles.length === 0 && <option value="">暂无日志</option>}
            {logFiles.map(file => <option key={file.dateStr} value={file.dateStr}>{file.dateStr}{file.isToday ? '（今天）' : ''} · {file.sizeFormatted}</option>)}
          </select></label>
          <label>日志级别 <select value={levelFilter} onChange={e => setLevelFilter(e.target.value as LogLevel | 'ALL')} aria-label="日志级别">
            {(['ALL', 'ERROR', 'WARN', 'INFO', 'DEBUG'] as const).map(level => <option key={level} value={level}>{level === 'ALL' ? '全部级别' : level}</option>)}
          </select></label>
          <label>模块 <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)} aria-label="模块">
            {['', 'Auth', 'Salesforce', 'Fxiaoke', 'NeoCRM', 'AI', 'Workflow', 'Process'].map(m => <option key={m} value={m}>{m || '全部模块'}</option>)}
          </select></label>
          <label className="log-settings__live"><input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />实时刷新</label>
          <button className="log-settings__refresh" onClick={() => loadLogs()} disabled={loading} aria-label="刷新日志" title="刷新日志"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
        </div>
        <div className="log-settings__search-row">
          <label className="log-settings__search"><Search size={15} /><input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜索消息、详情或模块" aria-label="搜索日志" /></label>
          <button onClick={handleCopyAll}>{copiedAll ? <Check size={14} /> : <Copy size={14} />}复制显示内容</button>
        </div>
      </section>
      <section className="log-settings__records" aria-label="日志记录">
        <div className="log-settings__records-heading"><strong>日志记录</strong><span>{filteredCount} 条匹配 / 共 {totalCount} 条{filteredCount > logs.length ? ` · 显示最近 ${logs.length} 条` : ''}</span>{autoRefresh && <span>每 4 秒刷新</span>}</div>
        <div className="log-settings__list">
          {loading && logs.length === 0 ? <div className="log-settings__empty">正在读取日志…</div> : logs.length === 0 ? <div className="log-settings__empty"><FileText size={22} /><span>暂无符合条件的日志</span></div> : logs.map(log => {
            const expanded = expandedDetails.has(log.id);
            return <article className="log-settings__entry" key={log.id}>
              <div className="log-settings__entry-head">
                <time>{log.timestamp ? log.timestamp.split(' ')[1] || log.timestamp : '—'}</time>
                <span className={`log-settings__level log-settings__level--${log.level.toLowerCase()}`}>{log.level}</span>
                <span className="log-settings__module">{log.module}</span>
                <div className="log-settings__entry-actions">
                  {log.details && <button onClick={() => toggleDetails(log.id)} aria-expanded={expanded}><ChevronRight size={13} className={expanded ? 'log-settings__chevron--open' : ''} />{expanded ? '收起详情' : '查看详情'}</button>}
                  <button onClick={() => handleCopySingle(log)} aria-label="复制此条日志" title="复制此条日志">{copiedId === log.id ? <Check size={14} /> : <Copy size={14} />}</button>
                </div>
              </div>
              <div className="log-settings__message">{log.message || '（无消息）'}</div>
              {expanded && log.details && <pre className="log-settings__details">{log.details}</pre>}
            </article>;
          })}
        </div>
      </section>
    </div>
  );
};
