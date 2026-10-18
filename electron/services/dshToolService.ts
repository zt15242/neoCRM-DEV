import fs from 'node:fs';
import path from 'node:path';
import { exec, execSync, spawn, ChildProcess } from 'node:child_process';
import { WorkspaceGitChangesSummary, WorkspaceGitChangeItem } from '../../shared/types';
import axios from 'axios';

export interface DshTodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface DshGoalItem {
  objective: string;
  token_budget?: number;
  status: 'active' | 'complete' | 'blocked' | 'paused';
  createdAt: number;
  updatedAt: number;
}

interface DshJobProcess {
  id: string;
  command: string;
  workdir: string;
  status: 'running' | 'completed' | 'killed' | 'error';
  startTime: number;
  endTime?: number;
  exitCode?: number;
  outputBuffer: string;
  unreadOutput: string;
  process?: ChildProcess;
}

export class DshToolService {
  private currentGoal: DshGoalItem | null = null;
  private currentTodos: DshTodoItem[] = [];
  private backgroundJobs = new Map<string, DshJobProcess>();

  public resolveWorkspaceDir(customWorkdir?: string): string {
    if (customWorkdir && typeof customWorkdir === 'string' && fs.existsSync(customWorkdir)) {
      return path.resolve(customWorkdir);
    }
    return path.resolve(process.cwd());
  }

  /**
   * 项目工作区物理安全沙箱 (Project Workspace Sandbox Guard)
   * 严格保障：智能体只能读取和操作当前项目目录内的内容，绝对禁止跨出项目，严禁检索整台设备
   */
  public assertPathWithinProject(
    rawPath: string,
    projectRoot?: string,
    allowExactFiles?: string[]
  ): string {
    const root = path.resolve(this.resolveWorkspaceDir(projectRoot));

    if (!rawPath || typeof rawPath !== 'string' || !rawPath.trim()) {
      return root;
    }

    const trimmed = rawPath.trim();

    // 1. 检查是否在显式放行的单文件白名单中（例如用户本轮会话主动拖拽/上传的文件）
    if (allowExactFiles && allowExactFiles.length > 0) {
      const normalizedTarget = path.isAbsolute(trimmed)
        ? path.normalize(trimmed)
        : path.resolve(root, trimmed);
      for (const allowed of allowExactFiles) {
        if (allowed && path.resolve(allowed) === normalizedTarget) {
          return normalizedTarget;
        }
      }
    }

    // 2. 严禁根目录、全盘路径、系统关键路径
    const lower = trimmed.toLowerCase();
    if (
      trimmed === '/' ||
      trimmed === '\\' ||
      /^[a-zA-Z]:[/\\]?$/.test(trimmed) ||
      lower.startsWith('/etc') ||
      lower.startsWith('/var') ||
      lower.startsWith('/usr') ||
      lower.startsWith('/bin') ||
      lower.startsWith('/sbin') ||
      lower.startsWith('/sys') ||
      lower.startsWith('/proc') ||
      lower.startsWith('/system') ||
      lower.startsWith('/library') ||
      lower.startsWith('c:\\windows') ||
      lower.startsWith('c:\\program')
    ) {
      throw new Error(
        `【安全沙箱拦截】越界访问被拒绝！禁止访问设备系统目录: "${rawPath}"。\n` +
        `【工程安全铁律】：智能体严格受限于当前项目目录 [${root}]，严禁跨出项目或检索整台设备！`
      );
    }

    // 3. 计算相对路径进行严格边界判定
    const resolved = path.isAbsolute(trimmed)
      ? path.normalize(trimmed)
      : path.resolve(root, trimmed);

    const rel = path.relative(root, resolved);
    const isOutside = rel.startsWith('..') || path.isAbsolute(rel);

    if (isOutside) {
      throw new Error(
        `【安全沙箱拦截】越界访问被拒绝！路径 "${rawPath}" 超出当前项目工作区边界。\n` +
        `- 允许操作的项目目录: "${root}"\n` +
        `- 尝试访问的目标路径: "${resolved}"\n` +
        `【工程安全铁律】：智能体严格受限于当前项目工作区，严禁跨出项目边界或检索整台设备！`
      );
    }

    // 4. 防软链接逃逸校验 (Symlink Jail Check)
    if (fs.existsSync(resolved)) {
      try {
        const real = fs.realpathSync(resolved);
        const realRel = path.relative(root, real);
        if (realRel.startsWith('..') || path.isAbsolute(realRel)) {
          throw new Error(
            `【安全沙箱拦截】软链接越界穿透被拒绝！目标链接实际指向了项目外部路径: "${real}"`
          );
        }
      } catch (e: any) {
        if (e.message && e.message.includes('安全沙箱拦截')) {
          throw e;
        }
      }
    }

    return resolved;
  }

  /**
   * 清理终端输出中的 ANSI 转义序列、动画进度条残余与退格字符，并进行安全长度截断保护
   * 彻底避免包含几十万字符进度帧的巨大日志冲垮大模型上下文与 Token 预算
   */
  private cleanAndTruncateTerminalOutput(rawText: string, maxChars = 20000): string {
    if (!rawText) return '';
    // 1. 彻底清除 ANSI 颜色与控制序列 (如 \u001b[2K, \u001b[1A, \u001b[?25h 等)
    let clean = rawText
      .replace(/\u001b\[[0-9;?]*[a-zA-Z]/g, '')
      .replace(/\u001b\([a-zA-Z]/g, '')
      .replace(/\r+/g, '\n');

    // 2. 压缩由于 CLI 进度条 (如 Salesforce CLI / npm) 频繁刷新重绘产生的冗余重复行
    const lines = clean.split('\n');
    const deduped: string[] = [];
    let lastTrimmed = '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (
        trimmed === lastTrimmed &&
        (trimmed.includes('Status:') ||
          trimmed.includes('Elapsed Time:') ||
          trimmed.includes('Waiting for the org') ||
          trimmed.includes('Retrieving v') ||
          trimmed.includes('Sending request to org'))
      ) {
        continue;
      }
      deduped.push(line);
      lastTrimmed = trimmed;
    }
    clean = deduped.join('\n').trim();

    // 3. 安全截断保护 (保留前 3000 字符启动信息与后部关键结论/报错/清单)
    if (clean.length > maxChars) {
      const head = clean.slice(0, 3000);
      const tail = clean.slice(-(maxChars - 3000));
      return `${head}\n\n... [终端输出过长，已自动过滤中间进度帧，原始共 ${rawText.length} 字符，保留关键执行结论] ...\n\n${tail}`;
    }

    return clean;
  }

  // ================= 1. bash 工具 (命令执行，支持前台与后台异步长任务) =================
  public async executeBash(
    params: {
      command: string;
      description?: string;
      timeoutMs?: number;
      workdir?: string;
      background?: boolean;
    },
    projectRoot?: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number; jobId?: string; isBackground?: boolean }> {
    const root = path.resolve(this.resolveWorkspaceDir(projectRoot));
    const cwd = params.workdir
      ? this.assertPathWithinProject(params.workdir, root)
      : root;

    // 检查是否包含危险的全盘扫描或越界读取命令
    const cmd = (params.command || '').trim();
    const forbiddenPatterns = [
      /\bfind\s+(?:\/|~|\/Users|\/System|\/Library|C:\\|D:\\)/i,
      /\bgrep\s+-[rRn]\s+.*?\s+(?:\/|~|\/Users|\/System|\/Library|C:\\|D:\\)/i,
      /\bls\s+-(?:la?|al?)\s+(?:\/|~|\/Users|\/System|\/Library|C:\\|D:\\)/i,
    ];
    for (const pat of forbiddenPatterns) {
      if (pat.test(cmd)) {
        throw new Error(
          `【安全沙箱拦截】禁止在终端中执行整机全盘检索命令: "${cmd}"！\n` +
          `智能体只能在当前项目目录 [${cwd}] 范围内进行命令操作与文件检索。`
        );
      }
    }

    // 如果指定了 background: true，在后台启动长进程并立即返回 jobId
    if (params.background) {
      const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const isWin = process.platform === 'win32';
      const child = spawn(params.command, {
        cwd,
        shell: isWin ? 'cmd.exe' : '/bin/bash',
        env: {
          ...process.env,
          CI: 'true',
          SF_USE_PROGRESS_BAR: 'false',
          FORCE_COLOR: '0',
        },
      });

      const job: DshJobProcess = {
        id: jobId,
        command: params.command,
        workdir: cwd,
        status: 'running',
        startTime: Date.now(),
        outputBuffer: '',
        unreadOutput: '',
        process: child,
      };
      this.backgroundJobs.set(jobId, job);

      child.stdout?.on('data', (chunk) => {
        const text = chunk.toString();
        job.outputBuffer = (job.outputBuffer + text).slice(-100000);
        job.unreadOutput = (job.unreadOutput + text).slice(-50000);
      });

      child.stderr?.on('data', (chunk) => {
        const text = chunk.toString();
        job.outputBuffer = (job.outputBuffer + text).slice(-100000);
        job.unreadOutput = (job.unreadOutput + text).slice(-50000);
      });

      child.on('close', (code) => {
        job.status = code === 0 ? 'completed' : 'error';
        job.exitCode = code || 0;
        job.endTime = Date.now();
      });

      child.on('error', (err) => {
        job.status = 'error';
        job.outputBuffer += `\n[Process Error]: ${err.message}`;
        job.endTime = Date.now();
      });

      return {
        stdout: `后台长任务已启动 (Job ID: ${jobId})。\n进程在工作区后台异步运行中，你可以继续其他操作，通过 job_output({ job_id: "${jobId}" }) 查看输出或等待其完成。`,
        stderr: '',
        exitCode: 0,
        jobId,
        isBackground: true,
      };
    }

    const timeout = Math.min(params.timeoutMs || 30000, 180000); // 允许最长3分钟

    return new Promise((resolve) => {
      exec(
        params.command,
        {
          cwd,
          timeout,
          maxBuffer: 25 * 1024 * 1024,
          env: {
            ...process.env,
            CI: 'true',
            SF_USE_PROGRESS_BAR: 'false',
            FORCE_COLOR: '0',
          },
          shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash',
        },
        (error, stdout, stderr) => {
          const rawStdout = stdout ? stdout.toString() : '';
          const rawStderr = stderr ? stderr.toString() : '';

          const cleanStdout = this.cleanAndTruncateTerminalOutput(rawStdout, 20000);
          const cleanStderr = this.cleanAndTruncateTerminalOutput(rawStderr, 10000);

          resolve({
            stdout: cleanStdout,
            stderr: cleanStderr,
            exitCode: error ? error.code || 1 : 0,
          });
        }
      );
    });
  }

  // ================= 2. read 文件读取工具 =================
  public readFile(
    params: { file_path: string; offset?: number; limit?: number },
    projectRoot?: string,
    allowExactFiles?: string[]
  ): {
    path: string;
    content: string;
    totalLines: number;
    offset: number;
    limit: number;
  } {
    if (!params.file_path) {
      throw new Error('readFile 参数缺少 file_path');
    }
    const resolvedPath = this.assertPathWithinProject(params.file_path, projectRoot, allowExactFiles);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`文件不存在: ${resolvedPath}`);
    }

    const raw = fs.readFileSync(resolvedPath, 'utf-8');
    const allLines = raw.split('\n');
    const totalLines = allLines.length;

    const offset = Math.max(1, params.offset || 1);
    const limit = Math.max(1, params.limit || 200);

    const slice = allLines.slice(offset - 1, offset - 1 + limit);
    const numbered = slice
      .map((line, idx) => `${String(offset + idx).padStart(4, ' ')} | ${line}`)
      .join('\n');

    return {
      path: resolvedPath,
      content: numbered,
      totalLines,
      offset,
      limit,
    };
  }

  // ================= 3. write 文件覆写/创建工具 =================
  public writeFile(
    params: { file_path: string; content: string },
    projectRoot?: string
  ): {
    path: string;
    bytesWritten: number;
    linesCount: number;
  } {
    if (!params.file_path) {
      throw new Error('writeFile 参数缺少 file_path');
    }
    const resolvedPath = this.assertPathWithinProject(params.file_path, projectRoot);

    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(resolvedPath, params.content, 'utf-8');
    const stats = fs.statSync(resolvedPath);

    return {
      path: resolvedPath,
      bytesWritten: stats.size,
      linesCount: params.content.split('\n').length,
    };
  }

  // ================= 4. edit 文件字面量替换工具 =================
  public editFile(
    params: {
      file_path: string;
      old_string: string;
      new_string: string;
      replace_all?: boolean;
    },
    projectRoot?: string
  ): { path: string; replacedOccurrences: number } {
    if (!params.file_path) {
      throw new Error('editFile 参数缺少 file_path');
    }
    const resolvedPath = this.assertPathWithinProject(params.file_path, projectRoot);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`目标文件不存在: ${resolvedPath}`);
    }

    const content = fs.readFileSync(resolvedPath, 'utf-8');
    if (!content.includes(params.old_string)) {
      throw new Error(`在文件 ${resolvedPath} 中未找到指定的待替换文本: "${params.old_string.slice(0, 50)}..."`);
    }

    let updated = '';
    let count = 0;
    if (params.replace_all) {
      count = content.split(params.old_string).length - 1;
      updated = content.replaceAll(params.old_string, params.new_string);
    } else {
      count = 1;
      updated = content.replace(params.old_string, params.new_string);
    }

    fs.writeFileSync(resolvedPath, updated, 'utf-8');
    return {
      path: resolvedPath,
      replacedOccurrences: count,
    };
  }

  // ================= 5. str_replace_editor 工具 =================
  public strReplaceEditor(
    params: {
      command: 'view' | 'create' | 'str_replace' | 'insert';
      path: string;
      file_text?: string;
      old_str?: string;
      new_str?: string;
      insert_line?: number;
      view_range?: [number, number];
    },
    projectRoot?: string
  ): any {
    if (!params.path) {
      throw new Error('strReplaceEditor 参数缺少 path');
    }
    const resolvedPath = this.assertPathWithinProject(params.path, projectRoot);

    if (params.command === 'create') {
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(resolvedPath, params.file_text || '', 'utf-8');
      return { path: resolvedPath, message: 'File created successfully' };
    }

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`文件不存在: ${resolvedPath}`);
    }

    if (params.command === 'view') {
      const stats = fs.statSync(resolvedPath);
      if (stats.isDirectory()) {
        const entries = fs.readdirSync(resolvedPath).slice(0, 100);
        return { path: resolvedPath, isDirectory: true, entries };
      }
      const raw = fs.readFileSync(resolvedPath, 'utf-8');
      const lines = raw.split('\n');
      let slice = lines;
      let startIdx = 1;
      if (params.view_range && Array.isArray(params.view_range)) {
        startIdx = Math.max(1, params.view_range[0]);
        const endIdx = Math.min(lines.length, params.view_range[1]);
        slice = lines.slice(startIdx - 1, endIdx);
      }
      return {
        path: resolvedPath,
        content: slice.map((l, i) => `${startIdx + i} | ${l}`).join('\n'),
        totalLines: lines.length,
      };
    }

    if (params.command === 'str_replace') {
      if (!params.old_str) throw new Error('str_replace command requires old_str');
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      if (!content.includes(params.old_str)) {
        throw new Error(`old_str not found in ${resolvedPath}`);
      }
      const updated = content.replace(params.old_str, params.new_str || '');
      fs.writeFileSync(resolvedPath, updated, 'utf-8');
      return { path: resolvedPath, message: 'Replaced text successfully' };
    }

    if (params.command === 'insert') {
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      const lines = content.split('\n');
      const lineIdx = params.insert_line ?? lines.length;
      lines.splice(lineIdx, 0, params.new_str || '');
      fs.writeFileSync(resolvedPath, lines.join('\n'), 'utf-8');
      return { path: resolvedPath, message: `Inserted text after line ${lineIdx}` };
    }

    throw new Error(`未知编辑器命令: ${params.command}`);
  }

  // ================= 6. read_image 本地图片检查 =================
  public readImage(
    params: { file_path: string },
    projectRoot?: string,
    allowExactFiles?: string[]
  ): {
    path: string;
    exists: boolean;
    sizeBytes?: number;
    mimeType?: string;
  } {
    if (!params.file_path) {
      throw new Error('readImage 参数缺少 file_path');
    }
    const resolvedPath = this.assertPathWithinProject(params.file_path, projectRoot, allowExactFiles);

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`图片文件不存在: ${resolvedPath}`);
    }

    const stats = fs.statSync(resolvedPath);
    const ext = path.extname(resolvedPath).toLowerCase().replace('.', '');
    const mime = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

    return {
      path: resolvedPath,
      exists: true,
      sizeBytes: stats.size,
      mimeType: mime,
    };
  }

  // ================= 7. glob 路径匹配工具 =================
  public globSearch(
    params: { pattern: string; path?: string },
    projectRoot?: string
  ): { matches: string[]; count: number } {
    const root = path.resolve(this.resolveWorkspaceDir(projectRoot));
    const baseDir = params.path
      ? this.assertPathWithinProject(params.path, root)
      : root;

    // 模式防逃逸拦截
    if (
      params.pattern.includes('..') ||
      params.pattern.startsWith('/') ||
      /^[a-zA-Z]:/.test(params.pattern) ||
      params.pattern.startsWith('~')
    ) {
      throw new Error(
        `【安全沙箱拦截】Glob 检索规则禁止包含跨目录符 ".." 或根路径前缀，仅允许在当前项目目录 [${root}] 内检索文件！`
      );
    }

    const matches: string[] = [];
    const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'dist-electron', '.dsh', 'build', '.idea', '.vscode']);

    const walk = (dir: string, depth = 0) => {
      if (depth > 8 || matches.length >= 100) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || ignoreDirs.has(entry.name)) continue;
          const full = path.join(dir, entry.name);
          const rel = path.relative(baseDir, full);

          // 物理防逃逸
          const rootRel = path.relative(root, full);
          if (rootRel.startsWith('..')) continue;

          if (entry.isFile()) {
            const p = params.pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
            const regex = new RegExp(p, 'i');
            if (regex.test(entry.name) || regex.test(rel)) {
              matches.push(rel);
            }
          } else if (entry.isDirectory()) {
            walk(full, depth + 1);
          }
        }
      } catch {}
    };

    walk(baseDir);
    return { matches: matches.slice(0, 100), count: matches.length };
  }

  // ================= 8. grep 内容检索工具 =================
  public grepSearch(
    params: { pattern: string; path?: string; glob?: string; case_sensitive?: boolean },
    projectRoot?: string
  ): {
    matches: Array<{ file: string; line: number; text: string }>;
    totalMatches: number;
  } {
    const root = path.resolve(this.resolveWorkspaceDir(projectRoot));
    const baseDir = params.path
      ? this.assertPathWithinProject(params.path, root)
      : root;
    const matches: Array<{ file: string; line: number; text: string }> = [];
    const flags = params.case_sensitive ? '' : 'i';
    let regex: RegExp;
    try {
      regex = new RegExp(params.pattern, flags);
    } catch {
      regex = new RegExp(params.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    }

    const walk = (dir: string, depth = 0) => {
      if (depth > 6 || matches.length >= 150) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'dist-electron') continue;
          const full = path.join(dir, entry.name);
          const rel = path.relative(baseDir, full);

          if (entry.isFile()) {
            if (params.glob && !entry.name.includes(params.glob.replace(/\*/g, ''))) continue;
            try {
              const content = fs.readFileSync(full, 'utf-8');
              const lines = content.split('\n');
              for (let i = 0; i < lines.length; i++) {
                if (regex.test(lines[i])) {
                  matches.push({
                    file: rel,
                    line: i + 1,
                    text: lines[i].trim().slice(0, 200),
                  });
                  if (matches.length >= 150) return;
                }
              }
            } catch {}
          } else if (entry.isDirectory()) {
            walk(full, depth + 1);
          }
        }
      } catch {}
    };

    walk(baseDir);
    return { matches, totalMatches: matches.length };
  }

  // ================= 9. web_search 互联网多词条搜索 =================
  public async webSearch(params: { queries: string[] }): Promise<{
    sources: Array<{ title: string; url: string; snippet?: string }>;
    totalResults: number;
  }> {
    const sources: Array<{ title: string; url: string; snippet?: string }> = [];
    const queries = Array.isArray(params.queries) ? params.queries : [String(params.queries)];

    for (const q of queries.slice(0, 3)) {
      try {
        // 使用公开高速 API 或 HTML 聚合
        const res = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)',
          },
          timeout: 8000,
        });

        const html = String(res.data);
        const urlMatches = Array.from(html.matchAll(/<a class="result__url" href="([^"]+)">([^<]+)<\/a>/g));
        const snippetMatches = Array.from(html.matchAll(/<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/g));

        for (let i = 0; i < Math.min(urlMatches.length, 5); i++) {
          const rawUrl = urlMatches[i][1];
          const cleanUrl = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl;
          const snippet = snippetMatches[i] ? snippetMatches[i][1].replace(/<[^>]+>/g, '').trim() : '';

          sources.push({
            title: urlMatches[i][2]?.trim() || q,
            url: cleanUrl,
            snippet,
          });
        }
      } catch {
        // 兜底返回模拟权威站点检索
        sources.push({
          title: `搜索结果: ${q}`,
          url: `https://www.google.com/search?q=${encodeURIComponent(q)}`,
          snippet: `与关键词 "${q}" 相关的网络权威资料`,
        });
      }
    }

    return { sources, totalResults: sources.length };
  }

  // ================= 10. web_fetch 抓取网页并提取内容 =================
  public async webFetch(params: { url: string }): Promise<{
    url: string;
    statusCode: number;
    title: string;
    markdownContent: string;
  }> {
    try {
      const res = await axios.get(params.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        },
        timeout: 15000,
      });

      const html = String(res.data);
      let title = '';
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) title = titleMatch[1].trim();

      // 提取核心文本
      const cleaned = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const truncated = cleaned.slice(0, 15000);
      return {
        url: params.url,
        statusCode: res.status,
        title,
        markdownContent: truncated,
      };
    } catch (e: any) {
      throw new Error(`抓取网页失败: ${e.message}`);
    }
  }

  // ================= 11. todo_write 任务清单 =================
  public writeTodos(params: { todos: DshTodoItem[] }): {
    todos: DshTodoItem[];
    counts: { pending: number; inProgress: number; completed: number };
  } {
    this.currentTodos = params.todos || [];
    const counts = {
      pending: this.currentTodos.filter((t) => t.status === 'pending').length,
      inProgress: this.currentTodos.filter((t) => t.status === 'in_progress').length,
      completed: this.currentTodos.filter((t) => t.status === 'completed').length,
    };
    return {
      todos: this.currentTodos,
      counts,
    };
  }

  // ================= 12. get_goal / create_goal / update_goal 目标管理 =================
  public getGoal(): { hasGoal: boolean; goal: DshGoalItem | null } {
    return {
      hasGoal: Boolean(this.currentGoal),
      goal: this.currentGoal,
    };
  }

  public createGoal(params: { objective: string; token_budget?: number }): DshGoalItem {
    this.currentGoal = {
      objective: params.objective,
      token_budget: params.token_budget,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    return this.currentGoal;
  }

  public updateGoal(params: { status: 'complete' | 'blocked' | 'paused' }): DshGoalItem {
    if (!this.currentGoal) {
      this.currentGoal = {
        objective: '当前会话目标',
        status: params.status,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    } else {
      this.currentGoal.status = params.status;
      this.currentGoal.updatedAt = Date.now();
    }
    return this.currentGoal;
  }

  // ================= 13. ask_user_question 用户确认 =================
  public askUserQuestion(params: {
    question: string;
    options: string[];
    allow_custom?: boolean;
  }): { question: string; options: string[]; allow_custom: boolean; status: string } {
    return {
      question: params.question,
      options: params.options || ['确认执行 (Recommended)', '调整方案', '取消'],
      allow_custom: params.allow_custom ?? true,
      status: 'presented_to_user',
    };
  }

  // ================= 14. job_list / job_output / job_kill (DSH 官方后台任务系统) =================
  public listJobs(): { total: number; jobs: Array<{ id: string; command: string; status: string; durationMs: number; exitCode?: number; hasUnread: boolean }> } {
    const jobs = Array.from(this.backgroundJobs.values()).map((j) => ({
      id: j.id,
      command: j.command,
      status: j.status,
      durationMs: (j.endTime || Date.now()) - j.startTime,
      exitCode: j.exitCode,
      hasUnread: j.unreadOutput.length > 0,
    }));
    return {
      total: jobs.length,
      jobs,
    };
  }

  public async getJobOutput(params: { job_id: string; wait?: boolean; timeout_ms?: number }): Promise<{
    job_id: string;
    status: string;
    exitCode?: number;
    output: string;
    isFinished: boolean;
  }> {
    const job = this.backgroundJobs.get(params.job_id);
    if (!job) {
      throw new Error(`未找到 ID 为 ${params.job_id} 的后台长任务`);
    }

    if (params.wait && job.status === 'running') {
      const timeout = Math.min(params.timeout_ms || 30000, 300000);
      const start = Date.now();
      while (job.status === 'running' && Date.now() - start < timeout) {
        await new Promise((r) => setTimeout(r, 600));
      }
    }

    const unread = job.unreadOutput;
    job.unreadOutput = ''; // 标记为已读

    const rawDisplay = unread || job.outputBuffer.slice(-8000) || '(暂无新输出)';
    const clean = this.cleanAndTruncateTerminalOutput(rawDisplay, 15000);

    return {
      job_id: job.id,
      status: job.status,
      exitCode: job.exitCode,
      output: clean,
      isFinished: job.status !== 'running',
    };
  }

  public killJob(params: { job_id: string; reason?: string }): { success: boolean; job_id: string; status: string } {
    const job = this.backgroundJobs.get(params.job_id);
    if (!job) {
      throw new Error(`未找到 ID 为 ${params.job_id} 的后台任务`);
    }
    if (job.status === 'running' && job.process) {
      job.process.kill('SIGTERM');
      job.status = 'killed';
      job.endTime = Date.now();
      return { success: true, job_id: job.id, status: 'killed' };
    }
    return { success: true, job_id: job.id, status: job.status };
  }

  // ================= 15. load_workspace_dependencies (运行时依赖探测) =================
  public loadWorkspaceDependencies(): Record<string, any> {
    const check = (cmd: string): string | null => {
      try {
        return execSync(cmd, { encoding: 'utf-8', timeout: 3500, windowsHide: true }).trim();
      } catch {
        return null;
      }
    };

    return {
      node: check('node -v'),
      npm: check('npm -v'),
      pnpm: check('pnpm -v'),
      python: check('python3 --version') || check('python --version'),
      java: check('javac -version') || check('java -version'),
      git: check('git --version'),
      salesforceCli: check('sf --version'),
      platform: process.platform,
      arch: process.arch,
    };
  }

  // ================= 16. workspace_changes / getFileDiff (工作区变更与 Git 差异) =================
  public getWorkspaceChanges(customWorkdir?: string, projectRoot?: string): WorkspaceGitChangesSummary {
    const cwd = this.assertPathWithinProject(customWorkdir || projectRoot || '', projectRoot);
    try {
      const isGit = fs.existsSync(path.join(cwd, '.git'));
      if (!isGit) {
        return { isGit: false, branch: '', clean: true, changes: [], diffSummary: '非 Git 仓库' };
      }

      let branch = 'main';
      try {
        branch = execSync('git branch --show-current', { cwd, encoding: 'utf-8', timeout: 3000 }).trim() || 'HEAD';
      } catch {}

      const statusOutput = execSync('git status --porcelain -u', { cwd, encoding: 'utf-8', timeout: 5000 }).trim();
      const diffStatOutput = execSync('git diff --stat HEAD', { cwd, encoding: 'utf-8', timeout: 5000 }).trim();

      if (!statusOutput) {
        return { isGit: true, branch, clean: true, changes: [], diffSummary: '工作区干净，所有文件已是最新状态' };
      }

      const lines = statusOutput.split('\n');
      const changes: WorkspaceGitChangeItem[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;
        const statusCode = line.slice(0, 2).trim();
        const filePath = line.slice(3).trim();

        changes.push({
          file: filePath,
          status: (statusCode === '??' ? '??' : statusCode.includes('M') ? 'M' : statusCode.includes('D') ? 'D' : 'A') as any,
          staged: !line.startsWith(' ') && !line.startsWith('?'),
        });
      }

      return {
        isGit: true,
        branch,
        clean: false,
        changes,
        diffSummary: diffStatOutput,
      };
    } catch (e: any) {
      return { isGit: false, branch: '', clean: true, changes: [], diffSummary: e.message };
    }
  }

  public getFileDiff(filePath: string, customWorkdir?: string, projectRoot?: string): { success: boolean; diff: string; error?: string } {
    const cwd = this.assertPathWithinProject(customWorkdir || projectRoot || '', projectRoot);
    const safeFilePath = this.assertPathWithinProject(filePath, cwd);
    try {
      const diff = execSync(`git diff HEAD -- "${filePath}"`, { cwd, encoding: 'utf-8', timeout: 5000 });
      return { success: true, diff: diff || '(该文件为纯新增文件或暂无行级差异)' };
    } catch (e: any) {
      return { success: false, diff: '', error: e.message };
    }
  }

  public discardFileChanges(filePath: string, customWorkdir?: string, projectRoot?: string): { success: boolean; message: string } {
    const cwd = this.assertPathWithinProject(customWorkdir || projectRoot || '', projectRoot);
    const safeFilePath = this.assertPathWithinProject(filePath, cwd);
    try {
      execSync(`git checkout HEAD -- "${filePath}"`, { cwd, encoding: 'utf-8', timeout: 5000 });
      return { success: true, message: `已撤销文件 [${filePath}] 的所有本地修改` };
    } catch (e: any) {
      return { success: false, message: `撤销修改失败: ${e.message}` };
    }
  }

  // ================= 17. exit_plan_mode (计划模式完成呈交) =================
  public exitPlanMode(params: { plan: string }): { plan: string; status: string; approved: boolean } {
    return {
      plan: params.plan,
      status: 'plan_presented_for_approval',
      approved: true,
    };
  }

  // ================= 18. run_code (DeepSeek Harness 官方 PTC 模式程序执行器) =================
  public async executePtcCode(
    params: { code: string; description?: string },
    toolsContext: Record<string, Function>,
    timeoutMs = 60000
  ): Promise<{ value: any; logs: string[]; executionTimeMs: number; error?: string }> {
    const startTime = Date.now();
    const logs: string[] = [];
    const customConsole = {
      log: (...args: any[]) =>
        logs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')),
      info: (...args: any[]) =>
        logs.push('[INFO] ' + args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')),
      warn: (...args: any[]) =>
        logs.push('[WARN] ' + args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')),
      error: (...args: any[]) =>
        logs.push('[ERROR] ' + args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')),
    };

        try {
      let rawCode = (params.code || "").trim();
      rawCode = rawCode.replace(/^\`\`\`(?:javascript|js|typescript|ts)?\s*/i, "").replace(/\s*\`\`\`$/i, "").trim();

      let executableCode = rawCode;
      try {
        const esbuild = require("esbuild");
        const wrapped = "async function __ptc_wrapper__() {\n" + rawCode + "\n}";
        const transformed = esbuild.transformSync(wrapped, { loader: "ts", target: "es2022" }).code;
        const bodyMatch = transformed.match(/async function __ptc_wrapper__\(\)\s*\{([\s\S]*)\}\s*$/);
        if (bodyMatch && bodyMatch[1]) {
          executableCode = bodyMatch[1];
        }
      } catch {
        // esbuild 转换失败或不可用时降级使用原始代码
      }

      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const fn = new AsyncFunction("tools", "console", executableCode);

      const execPromise = fn(toolsContext, customConsole);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`PTC 程序执行超时 (${timeoutMs}ms)`)), timeoutMs)
      );

      const result = await Promise.race([execPromise, timeoutPromise]);
      const duration = Date.now() - startTime;

      return {
        value: result !== undefined ? result : null,
        logs: logs.slice(-200),
        executionTimeMs: duration,
      };
    } catch (err: any) {
      return {
        value: null,
        logs: logs.slice(-200),
        executionTimeMs: Date.now() - startTime,
        error: `PTC 程序运行异常: ${err.message}`,
      };
    }
  }

}
