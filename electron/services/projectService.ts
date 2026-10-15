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

  public listFiles(params?: { folderPath?: string; query?: string; maxFiles?: number }): Array<{
    name: string;
    relativePath: string;
    fullPath: string;
    ext: string;
    size: number;
  }> {
    const baseDir = params?.folderPath && fs.existsSync(params.folderPath)
      ? params.folderPath
      : process.cwd();

    const maxFiles = params?.maxFiles || 200;
    const query = (params?.query || '').trim().toLowerCase();
    const results: Array<{ name: string; relativePath: string; fullPath: string; ext: string; size: number }> = [];
    const ignoreDirs = new Set(['.git', 'node_modules', 'dist', 'dist-electron', '.dsh', 'build', '.vscode', '.idea']);

    const walk = (dir: string, depth = 0) => {
      if (depth > 6 || results.length >= maxFiles) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || ignoreDirs.has(entry.name)) continue;
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

  public getDirTree(folderPath?: string, maxDepth = 4): Array<{
    name: string;
    path: string;
    relativePath: string;
    type: 'directory' | 'file';
    ext?: string;
    size?: number;
    children?: any[];
  }> {
    const baseDir = folderPath && fs.existsSync(folderPath) ? folderPath : process.cwd();
    const ignoreDirs = new Set(['.git', 'node_modules', 'dist', 'dist-electron', '.dsh', 'build', '.idea', '.vscode']);

    const scan = (dir: string, depth: number): any[] => {
      if (depth > maxDepth) return [];
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        entries.sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name, 'en', { numeric: true });
        });

        const items: any[] = [];
        for (const entry of entries) {
          if (entry.name.startsWith('.') || ignoreDirs.has(entry.name)) continue;
          const full = path.join(dir, entry.name);
          const rel = path.relative(baseDir, full);

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
        }
        return items;
      } catch {
        return [];
      }
    };

    return scan(baseDir, 1);
  }

  public getRecentArtifacts(folderPath?: string, limit = 30): Array<{
    name: string;
    relativePath: string;
    fullPath: string;
    ext: string;
    size: number;
    mtime: number;
  }> {
    const baseDir = folderPath && fs.existsSync(folderPath) ? folderPath : process.cwd();
    const ignoreDirs = new Set(['.git', 'node_modules', 'dist', 'dist-electron', '.dsh', 'build', '.idea', '.vscode']);
    const list: Array<{ name: string; relativePath: string; fullPath: string; ext: string; size: number; mtime: number }> = [];

    const walk = (dir: string, depth = 0) => {
      if (depth > 5) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || ignoreDirs.has(entry.name)) continue;
          const full = path.join(dir, entry.name);
          const rel = path.relative(baseDir, full);

          if (entry.isFile()) {
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
        }
      } catch {}
    };

    walk(baseDir);
    list.sort((a, b) => b.mtime - a.mtime);
    return list.slice(0, limit);
  }

  public async openFolder(folderPath: string): Promise<string> {
    if (fs.existsSync(folderPath)) {
      return shell.openPath(folderPath);
    }
    throw new Error(`本地路径不存在: ${folderPath}`);
  }
}
