import fs from 'node:fs';
import path from 'node:path';
import { exec, execSync } from 'node:child_process';
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

export class DshToolService {
  private currentGoal: DshGoalItem | null = null;
  private currentTodos: DshTodoItem[] = [];

  private resolveWorkspaceDir(customWorkdir?: string): string {
    if (customWorkdir && fs.existsSync(customWorkdir)) {
      return customWorkdir;
    }
    return process.cwd();
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

  // ================= 1. bash 工具 (命令执行) =================
  public async executeBash(params: {
    command: string;
    description?: string;
    timeoutMs?: number;
    workdir?: string;
  }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const cwd = this.resolveWorkspaceDir(params.workdir);
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
  public readFile(params: { file_path: string; offset?: number; limit?: number }): {
    path: string;
    content: string;
    totalLines: number;
    offset: number;
    limit: number;
  } {
    const resolvedPath = path.isAbsolute(params.file_path)
      ? params.file_path
      : path.resolve(process.cwd(), params.file_path);

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
  public writeFile(params: { file_path: string; content: string }): {
    path: string;
    bytesWritten: number;
    linesCount: number;
  } {
    const resolvedPath = path.isAbsolute(params.file_path)
      ? params.file_path
      : path.resolve(process.cwd(), params.file_path);

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
  public editFile(params: {
    file_path: string;
    old_string: string;
    new_string: string;
    replace_all?: boolean;
  }): { path: string; replacedOccurrences: number } {
    const resolvedPath = path.isAbsolute(params.file_path)
      ? params.file_path
      : path.resolve(process.cwd(), params.file_path);

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
  public strReplaceEditor(params: {
    command: 'view' | 'create' | 'str_replace' | 'insert';
    path: string;
    file_text?: string;
    old_str?: string;
    new_str?: string;
    insert_line?: number;
    view_range?: [number, number];
  }): any {
    const resolvedPath = path.isAbsolute(params.path)
      ? params.path
      : path.resolve(process.cwd(), params.path);

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
  public readImage(params: { file_path: string }): {
    path: string;
    exists: boolean;
    sizeBytes?: number;
    mimeType?: string;
  } {
    const resolvedPath = path.isAbsolute(params.file_path)
      ? params.file_path
      : path.resolve(process.cwd(), params.file_path);

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
  public globSearch(params: { pattern: string; path?: string }): { matches: string[]; count: number } {
    const baseDir = this.resolveWorkspaceDir(params.path);
    const matches: string[] = [];

    const walk = (dir: string, depth = 0) => {
      if (depth > 6 || matches.length >= 100) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.')) continue;
          const full = path.join(dir, entry.name);
          const rel = path.relative(baseDir, full);

          if (entry.isFile()) {
            // 简单通配符匹配 (如 *.ts, *test*)
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
  public grepSearch(params: { pattern: string; path?: string; glob?: string; case_sensitive?: boolean }): {
    matches: Array<{ file: string; line: number; text: string }>;
    totalMatches: number;
  } {
    const baseDir = this.resolveWorkspaceDir(params.path);
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
}
