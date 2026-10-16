import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { app, shell, dialog, BrowserWindow } from 'electron';
import { LogEntry, LogFileInfo, GetLogsOptions, LogLevel } from '../../shared/types';

export class LoggerService {
  private logDir: string;
  private isIntercepted = false;
  private originalConsole: {
    log: typeof console.log;
    info: typeof console.info;
    warn: typeof console.warn;
    error: typeof console.error;
    debug: typeof console.debug;
  } | null = null;

  constructor() {
    this.logDir = this.resolveLogDirectory();
    this.ensureDirectoryExists();
    this.cleanOldLogs(14); // 保留14天日志
  }

  private resolveLogDirectory(): string {
    try {
      const userData = app?.getPath ? app.getPath('userData') : '';
      if (userData) {
        return path.join(userData, 'logs');
      }
    } catch {}
    return path.join(os.homedir(), '.neocrm-desktop', 'logs');
  }

  private ensureDirectoryExists() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (e) {
      console.error('无法创建日志目录:', e);
    }
  }

  private getTodayDateStr(): string {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getTodayLogFilePath(): string {
    return path.join(this.logDir, `app-${this.getTodayDateStr()}.log`);
  }

  private formatTime(d = new Date()): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    const millis = String(d.getMilliseconds()).padStart(3, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${millis}`;
  }

  /**
   * 核心写日志方法
   */
  public writeLog(level: LogLevel, module: string, message: string, details?: any) {
    this.ensureDirectoryExists();
    const filePath = this.getTodayLogFilePath();
    const timeStr = this.formatTime();
    let detailStr = '';
    if (details !== undefined && details !== null) {
      if (details instanceof Error) {
        detailStr = details.stack || details.message;
      } else if (typeof details === 'object') {
        try {
          detailStr = JSON.stringify(details);
        } catch {
          detailStr = String(details);
        }
      } else {
        detailStr = String(details);
      }
    }

    const cleanMsg = String(message || '').replace(/\r?\n/g, ' ');
    const logLine = detailStr
      ? `[${timeStr}] [${level}] [${module}] ${cleanMsg} | Details: ${detailStr}\n`
      : `[${timeStr}] [${level}] [${module}] ${cleanMsg}\n`;

    try {
      fs.appendFileSync(filePath, logLine, 'utf-8');
    } catch (err) {
      this.originalConsole?.error?.('写入日志文件失败:', err);
    }
  }

  public debug(module: string, message: string, details?: any) {
    this.writeLog('DEBUG', module, message, details);
  }

  public info(module: string, message: string, details?: any) {
    this.writeLog('INFO', module, message, details);
  }

  public warn(module: string, message: string, details?: any) {
    this.writeLog('WARN', module, message, details);
  }

  public error(module: string, message: string, details?: any) {
    this.writeLog('ERROR', module, message, details);
  }

  /**
   * 自动清理超过指定天数的旧日志文件
   */
  public cleanOldLogs(retentionDays = 14) {
    try {
      if (!fs.existsSync(this.logDir)) return;
      const files = fs.readdirSync(this.logDir);
      const now = Date.now();
      const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;

      for (const file of files) {
        if (!file.startsWith('app-') || !file.endsWith('.log')) continue;
        const fullPath = path.join(this.logDir, file);
        try {
          const stats = fs.statSync(fullPath);
          if (now - stats.mtimeMs > maxAgeMs) {
            fs.unlinkSync(fullPath);
          }
        } catch {}
      }
    } catch (e) {
      this.originalConsole?.warn?.('清理过期日志异常:', e);
    }
  }

  /**
   * 全局托管 Node.js 进程 console.* 输出与未捕获异常
   */
  public interceptConsole() {
    if (this.isIntercepted) return;
    this.isIntercepted = true;

    this.originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    };

    const extractModuleAndMessage = (args: any[]): { module: string; message: string; details?: any } => {
      if (args.length === 0) return { module: 'App', message: '' };

      const first = args[0];
      let module = 'App';
      let message = '';

      if (typeof first === 'string') {
        const modMatch = first.match(/^\[(.*?)\]\s*(.*)$/);
        if (modMatch) {
          module = modMatch[1];
          message = modMatch[2];
        } else {
          message = first;
        }
      } else {
        try {
          message = JSON.stringify(first);
        } catch {
          message = String(first);
        }
      }

      let details: any = undefined;
      if (args.length > 1) {
        details = args.slice(1);
        if (details.length === 1) details = details[0];
      }

      return { module, message, details };
    };

    console.log = (...args: any[]) => {
      this.originalConsole?.log(...args);
      const { module, message, details } = extractModuleAndMessage(args);
      this.writeLog('INFO', module, message, details);
    };

    console.info = (...args: any[]) => {
      this.originalConsole?.info(...args);
      const { module, message, details } = extractModuleAndMessage(args);
      this.writeLog('INFO', module, message, details);
    };

    console.warn = (...args: any[]) => {
      this.originalConsole?.warn(...args);
      const { module, message, details } = extractModuleAndMessage(args);
      this.writeLog('WARN', module, message, details);
    };

    console.error = (...args: any[]) => {
      this.originalConsole?.error(...args);
      const { module, message, details } = extractModuleAndMessage(args);
      this.writeLog('ERROR', module, message, details);
    };

    // 捕获未处理全局异常
    process.on('uncaughtException', (err) => {
      this.writeLog('ERROR', 'Process', '未捕获的全局异常 (uncaughtException)', err);
    });

    process.on('unhandledRejection', (reason) => {
      this.writeLog('ERROR', 'Process', '未处理的 Promise Rejection (unhandledRejection)', reason);
    });

    this.info('System', `日志服务已启动，日志目录: ${this.logDir}`);
  }

  /**
   * 获取所有可用日志文件列表
   */
  public getLogFiles(): LogFileInfo[] {
    this.ensureDirectoryExists();
    try {
      const files = fs.readdirSync(this.logDir);
      const todayStr = this.getTodayDateStr();
      const result: LogFileInfo[] = [];

      for (const fileName of files) {
        if (!fileName.startsWith('app-') || !fileName.endsWith('.log')) continue;
        const filePath = path.join(this.logDir, fileName);
        try {
          const stats = fs.statSync(filePath);
          const dateMatch = fileName.match(/^app-(\d{4}-\d{2}-\d{2})\.log$/);
          const dateStr = dateMatch ? dateMatch[1] : '';
          const sizeKb = (stats.size / 1024).toFixed(1);
          const sizeFormatted = stats.size > 1024 * 1024
            ? `${(stats.size / (1024 * 1024)).toFixed(2)} MB`
            : `${sizeKb} KB`;

          result.push({
            fileName,
            filePath,
            dateStr,
            sizeBytes: stats.size,
            sizeFormatted,
            updatedAt: stats.mtimeMs,
            isToday: dateStr === todayStr,
          });
        } catch {}
      }

      result.sort((a, b) => b.dateStr.localeCompare(a.dateStr));
      return result;
    } catch {
      return [];
    }
  }

  /**
   * 结构化检索指定日期的日志记录
   */
  public getLogs(options: GetLogsOptions = {}): {
    total: number;
    filteredCount: number;
    logs: LogEntry[];
    currentDate: string;
    logFilePath: string;
  } {
    this.ensureDirectoryExists();
    const dateStr = options.date || this.getTodayDateStr();
    const filePath = path.join(this.logDir, `app-${dateStr}.log`);

    if (!fs.existsSync(filePath)) {
      return {
        total: 0,
        filteredCount: 0,
        logs: [],
        currentDate: dateStr,
        logFilePath: filePath,
      };
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const rawLines = content.split('\n').filter((l) => Boolean(l.trim()));
      const total = rawLines.length;

      const levelFilter = options.level && options.level !== 'ALL' ? options.level.toUpperCase() : null;
      const kwFilter = options.keyword?.trim().toLowerCase() || null;
      const modFilter = options.module?.trim().toLowerCase() || null;
      const limit = Math.min(options.limit || 300, 1000);

      const parsedLogs: LogEntry[] = [];

      // 逆序读取最新日志优先展示
      for (let i = rawLines.length - 1; i >= 0; i--) {
        const line = rawLines[i];
        // 匹配格式: [2026-10-16 14:35:21.123] [INFO] [Auth] Message | Details: ...
        const match = line.match(/^\[(.*?)\]\s+\[(.*?)\]\s+\[(.*?)\]\s+(.*?)(?:\s+\|\s+Details:\s+(.*))?$/);

        let entry: LogEntry;
        if (match) {
          entry = {
            id: `log_${dateStr}_${i}`,
            timestamp: match[1],
            level: (match[2] as LogLevel) || 'INFO',
            module: match[3] || 'App',
            message: match[4] || '',
            details: match[5] || undefined,
            raw: line,
          };
        } else {
          entry = {
            id: `log_${dateStr}_${i}`,
            timestamp: '',
            level: 'INFO',
            module: 'App',
            message: line,
            raw: line,
          };
        }

        // 过滤级别
        if (levelFilter && entry.level !== levelFilter) {
          continue;
        }

        // 过滤模块
        if (modFilter && !entry.module.toLowerCase().includes(modFilter)) {
          continue;
        }

        // 过滤关键词
        if (kwFilter) {
          const matchMsg = entry.message.toLowerCase().includes(kwFilter);
          const matchMod = entry.module.toLowerCase().includes(kwFilter);
          const matchDet = entry.details?.toLowerCase().includes(kwFilter);
          if (!matchMsg && !matchMod && !matchDet) {
            continue;
          }
        }

        parsedLogs.push(entry);
        if (parsedLogs.length >= limit) {
          break;
        }
      }

      return {
        total,
        filteredCount: parsedLogs.length,
        logs: parsedLogs,
        currentDate: dateStr,
        logFilePath: filePath,
      };
    } catch (e: any) {
      return {
        total: 0,
        filteredCount: 0,
        logs: [
          {
            id: 'err_1',
            timestamp: this.formatTime(),
            level: 'ERROR',
            module: 'Logger',
            message: `读取日志异常: ${e.message}`,
            raw: e.message,
          },
        ],
        currentDate: dateStr,
        logFilePath: filePath,
      };
    }
  }

  /**
   * 在操作系统的访达/资源管理器中一键打开日志目录
   */
  public async openLogDirectory(): Promise<boolean> {
    this.ensureDirectoryExists();
    try {
      await shell.openPath(this.logDir);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 清理所有历史日志
   */
  public clearAllLogs(): boolean {
    try {
      if (!fs.existsSync(this.logDir)) return true;
      const files = fs.readdirSync(this.logDir);
      for (const file of files) {
        if (file.endsWith('.log')) {
          try {
            fs.unlinkSync(path.join(this.logDir, file));
          } catch {}
        }
      }
      this.info('Logger', '用户已手动清空全部历史运行日志');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 导出指定日期的日志文件至用户选定位置
   */
  public async exportLogFile(parentWindow?: BrowserWindow, targetDate?: string): Promise<{ success: boolean; filePath?: string; message?: string }> {
    const dateStr = targetDate || this.getTodayDateStr();
    const sourcePath = path.join(this.logDir, `app-${dateStr}.log`);

    if (!fs.existsSync(sourcePath)) {
      return { success: false, message: `未找到 ${dateStr} 的日志文件` };
    }

    try {
      const res = await dialog.showSaveDialog(parentWindow || undefined as any, {
        title: `导出运行日志 - ${dateStr}`,
        defaultPath: path.join(app.getPath('desktop'), `NeoCRM-App-Log-${dateStr}.log`),
        filters: [{ name: 'Log 文件', extensions: ['log', 'txt'] }],
      });

      if (res.canceled || !res.filePath) {
        return { success: false, message: '已取消导出' };
      }

      fs.copyFileSync(sourcePath, res.filePath);
      return { success: true, filePath: res.filePath, message: `日志已成功导出至: ${res.filePath}` };
    } catch (e: any) {
      return { success: false, message: `导出日志失败: ${e.message}` };
    }
  }
}
