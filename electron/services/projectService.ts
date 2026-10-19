import fs from 'node:fs';
import path from 'node:path';
import { app, shell } from 'electron';
import { WorkspaceProject } from '../../shared/types';

export class ProjectService {
  private getStoragePath(): string {
    const userData = app?.getPath ? app.getPath('userData') : process.cwd();
    return path.join(userData, 'neocrm_projects.json');
  }

  public getProjects(): WorkspaceProject[] {
    const file = this.getStoragePath();
    if (!fs.existsSync(file)) {
      const defaultProj: WorkspaceProject = {
        id: 'proj_default',
        name: path.basename(process.cwd()) || 'neoCRM-DEV',
        localPath: process.cwd(),
        description: '默认本地开发工程工作区',
        isDefault: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.writeStorage([defaultProj]);
      return [defaultProj];
    }

    try {
      const list = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (Array.isArray(list) && list.length > 0) {
        return list;
      }
    } catch {}

    const fallback: WorkspaceProject = {
      id: 'proj_default',
      name: path.basename(process.cwd()) || 'neoCRM-DEV',
      localPath: process.cwd(),
      description: '默认本地开发工程工作区',
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    return [fallback];
  }

  private writeStorage(projects: WorkspaceProject[]) {
    fs.writeFileSync(this.getStoragePath(), JSON.stringify(projects, null, 2), 'utf-8');
  }

  public saveProject(payload: Partial<WorkspaceProject> & { name: string; localPath: string }): WorkspaceProject {
    const projects = this.getProjects();
    const cleanPath = payload.localPath.trim();
    const cleanName = payload.name.trim();

    // 自动确保本地物理路径存在
    if (!fs.existsSync(cleanPath)) {
      fs.mkdirSync(cleanPath, { recursive: true });
    }

    if (payload.id) {
      const existing = projects.find((p) => p.id === payload.id);
      if (existing) {
        existing.name = cleanName;
        existing.localPath = cleanPath;
        existing.description = payload.description || '';
        existing.updatedAt = Date.now();
        this.writeStorage(projects);
        return existing;
      }
    }

    const newProject: WorkspaceProject = {
      id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      localPath: cleanPath,
      description: payload.description || '',
      isDefault: projects.length === 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    projects.push(newProject);
    this.writeStorage(projects);
    return newProject;
  }

  public deleteProject(projectId: string): boolean {
    let projects = this.getProjects();
    const target = projects.find((p) => p.id === projectId);
    if (target?.isDefault) {
      throw new Error('默认项目工作区不可删除');
    }
    projects = projects.filter((p) => p.id !== projectId);
    this.writeStorage(projects);
    return true;
  }

  private validateProjectFolder(folderPath?: string): string {
    if (!folderPath || !folderPath.trim()) {
      return path.resolve(process.cwd());
    }
    const resolved = path.resolve(folderPath.trim());
    if (resolved === '/' || resolved === '\\' || /^[a-zA-Z]:[/\\]?$/.test(resolved)) {
      throw new Error(`【安全沙箱拦截】禁止读取系统根目录: ${folderPath}`);
    }
    const lower = resolved.toLowerCase();
    if (
      lower.startsWith('/etc') ||
      lower.startsWith('/var') ||
      lower.startsWith('/usr') ||
      lower.startsWith('/bin') ||
      lower.startsWith('/sbin') ||
      lower.startsWith('/system') ||
      lower.startsWith('/library') ||
      lower.startsWith('c:\\windows') ||
      lower.startsWith('c:\\program')
    ) {
      throw new Error(`【安全沙箱拦截】禁止读取系统目录: ${folderPath}`);
    }
    if (!fs.existsSync(resolved)) {
      return path.resolve(process.cwd());
    }
    return resolved;
  }
  // 快速缓存，防止大任务工具连环触发造成瞬时万次磁盘扫描把主进程卡死
  private treeCache = new Map<string, { time: number; tree: any[] }>();
  private artifactsCache = new Map<string, { time: number; list: any[] }>();

  // 强化过滤清单：彻底屏蔽现代工程常见海量噪音目录
  private static readonly IGNORE_DIRS = new Set([
    '.git', 'node_modules', 'dist', 'dist-electron', '.dsh', 'build', 
    '.vscode', '.idea', 'coverage', '.next', '.nuxt', '.turbo', '.cache', 
    'target', 'bin', 'obj', '.gradle', '.cargo', 'vendor', '__pycache__', '.pytest_cache'
  ]);

  public listFiles(params?: { folderPath?: string; query?: string; maxFiles?: number }): Array<{
    name: string;
    relativePath: string;
    fullPath: string;
    ext: string;
    size: number;
  }> {
    const baseDir = this.validateProjectFolder(params?.folderPath);

    const maxFiles = params?.maxFiles || 200;
    const query = (params?.query || '').trim().toLowerCase();
    const results: Array<{ name: string; relativePath: string; fullPath: string; ext: string; size: number }> = [];

    const walk = (dir: string, depth = 0) => {
      if (depth > 5 || results.length >= maxFiles) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || ProjectService.IGNORE_DIRS.has(entry.name)) continue;
          const full = path.join(dir, entry.name);
          const rel = path.relative(baseDir, full);

          if (entry.isFile()) {
            if (!query || entry.name.toLowerCase().includes(query) || rel.toLowerCase().includes(query)) {
              let size = 0;
              try { size = fs.statSync(full).size; } catch {}
              results.push({
                name: entry.name,
                relativePath: rel,
                fullPath: full,
                ext: path.extname(entry.name).toLowerCase(),
                size,
              });
              if (results.length >= maxFiles) return;
            }
          } else if (entry.isDirectory()) {
            walk(full, depth + 1);
          }
        }
      } catch {}
    };

    walk(baseDir);
    return results;
  }

  public getDirTree(folderPath?: string, maxDepth = 6): Array<{
    name: string;
    path: string;
    relativePath: string;
    type: 'directory' | 'file';
    ext?: string;
    size?: number;
    children?: any[];
  }> {
    const baseDir = this.validateProjectFolder(folderPath);

    // 2.5 秒极速缓存守护：高频工具调用期间直接命中内存，消除万次同步 IO
    const now = Date.now();
    const cached = this.treeCache.get(baseDir);
    if (cached && now - cached.time < 2500) {
      return cached.tree;
    }

    let totalNodes = 0;
    const maxNodesCap = 1500; // 树节点安全熔断硬上限，防止海量文件打死前端渲染和主线程

    const scan = (dir: string, depth: number): any[] => {
      if (depth > maxDepth || totalNodes >= maxNodesCap) return [];
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        entries.sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name, 'en', { numeric: true });
        });

        const items: any[] = [];
        for (const entry of entries) {
          if (entry.name.startsWith('.') || ProjectService.IGNORE_DIRS.has(entry.name)) continue;
          const full = path.join(dir, entry.name);
          const rel = path.relative(baseDir, full);
          totalNodes++;

          if (entry.isDirectory()) {
            items.push({
              name: entry.name,
              path: full,
              relativePath: rel,
              type: 'directory',
              children: scan(full, depth + 1),
            });
          } else if (entry.isFile()) {
            let size = 0;
            try { size = fs.statSync(full).size; } catch {}
            items.push({
              name: entry.name,
              path: full,
              relativePath: rel,
              type: 'file',
              ext: path.extname(entry.name).toLowerCase(),
              size,
            });
          }
          if (totalNodes >= maxNodesCap) break;
        }
        return items;
      } catch {
        return [];
      }
    };

    const result = scan(baseDir, 1);
    this.treeCache.set(baseDir, { time: now, tree: result });
    return result;
  }

  public getRecentArtifacts(folderPath?: string, limit = 30): Array<{
    name: string;
    relativePath: string;
    fullPath: string;
    ext: string;
    size: number;
    mtime: number;
  }> {
    const baseDir = this.validateProjectFolder(folderPath);

    // 2.5 秒缓存守护
    const now = Date.now();
    const cached = this.artifactsCache.get(baseDir);
    if (cached && now - cached.time < 2500) {
      return cached.list;
    }

    const list: Array<{ name: string; relativePath: string; fullPath: string; ext: string; size: number; mtime: number }> = [];
    let scannedFiles = 0;
    const maxScanCap = 800; // 最多扫描 800 个文件，绝不进行全盘无节制递归

    const walk = (dir: string, depth = 0) => {
      if (depth > 4 || scannedFiles >= maxScanCap) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || ProjectService.IGNORE_DIRS.has(entry.name)) continue;
          const full = path.join(dir, entry.name);
          const rel = path.relative(baseDir, full);

          if (entry.isFile()) {
            scannedFiles++;
            const ext = path.extname(entry.name).toLowerCase();
            try {
              const stat = fs.statSync(full);
              list.push({
                name: entry.name,
                relativePath: rel,
                fullPath: full,
                ext,
                size: stat.size,
                mtime: stat.mtimeMs,
              });
            } catch {}
          } else if (entry.isDirectory()) {
            walk(full, depth + 1);
          }
          if (scannedFiles >= maxScanCap) break;
        }
      } catch {}
    };

    walk(baseDir);
    list.sort((a, b) => b.mtime - a.mtime);
    const sliced = list.slice(0, limit);
    this.artifactsCache.set(baseDir, { time: now, list: sliced });
    return sliced;
  }

  public async openFolder(folderPath: string): Promise<string> {
    if (fs.existsSync(folderPath)) {
      return shell.openPath(folderPath);
    }
    throw new Error(`本地路径不存在: ${folderPath}`);
  }
}
