import fs from 'node:fs/promises';
import path from 'node:path';
import type { ProjectDirectoryRequest, ProjectDirectoryResult, ProjectDirNode } from '../../shared/types';

export const PROJECT_IGNORED_DIRECTORIES = new Set([
  '.git', 'node_modules', 'dist', 'dist-electron', '.dsh', 'build',
  '.vscode', '.idea', 'coverage', '.next', '.nuxt', '.turbo', '.cache',
  'target', 'bin', 'obj', '.gradle', '.cargo', 'vendor', '__pycache__', '.pytest_cache',
]);

const isWithin = (root: string, directory: string) => {
  const relative = path.relative(root, directory);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

/** Read one directory at a time; search walks asynchronously without a global node cutoff. */
export class ProjectDirectoryReader {
  private cache = new Map<string, { time: number; nodes: ProjectDirNode[] }>();

  private async list(root: string, directory: string, force: boolean): Promise<ProjectDirNode[]> {
    const key = JSON.stringify([root, directory]);
    const cached = this.cache.get(key);
    if (!force && cached && Date.now() - cached.time < 2500) {
      return cached.nodes.map((node) => ({ ...node }));
    }
    const entries = (await fs.readdir(directory, { withFileTypes: true }))
      .filter((entry) => !entry.name.startsWith('.') && !PROJECT_IGNORED_DIRECTORIES.has(entry.name)
        && (entry.isDirectory() || entry.isFile()));
    entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory())
      || a.name.localeCompare(b.name, 'en', { numeric: true }));
    const nodes: ProjectDirNode[] = entries.map((entry) => {
      const fullPath = path.join(directory, entry.name);
      return {
        name: entry.name, path: fullPath, relativePath: path.relative(root, fullPath),
        type: entry.isDirectory() ? 'directory' : 'file',
        ...(entry.isFile() ? { ext: path.extname(entry.name).toLowerCase() } : {}),
      };
    });
    // Limit cache entries, never the returned directory contents.
    this.cache.delete(key);
    this.cache.set(key, { time: Date.now(), nodes });
    if (this.cache.size > 256) this.cache.delete(this.cache.keys().next().value!);
    return nodes.map((node) => ({ ...node }));
  }

  public async read(params: ProjectDirectoryRequest, maxDepth = 1): Promise<ProjectDirectoryResult> {
    if (!params.folderPath?.trim()) throw new Error('请先选择项目目录');
    const root = path.resolve(params.folderPath);
    const directory = path.resolve(params.directoryPath || root);
    if (!isWithin(root, directory)) throw new Error('读取目录必须位于当前项目内');
    // Do not follow directory links outside the project, or silently fall back to the app checkout.
    const [realRoot, realDirectory] = await Promise.all([fs.realpath(root), fs.realpath(directory)]);
    if (!isWithin(realRoot, realDirectory)) throw new Error('读取目录必须位于当前项目内');

    const query = params.query?.trim().toLowerCase() || '';
    const result: ProjectDirectoryResult = { nodes: [], errors: [] };
    const jobs: Array<{ directory: string; target: ProjectDirNode[]; depth: number }> = [
      { directory, target: result.nodes, depth: 1 },
    ];
    let next = 0;
    while (next < jobs.length) {
      const batch = jobs.slice(next, next + 8);
      next += batch.length;
      await Promise.all(batch.map(async (job) => {
        let nodes: ProjectDirNode[];
        try {
          nodes = await this.list(root, job.directory, Boolean(params.force));
        } catch (error) {
          if (job.directory === directory) throw error;
          result.errors.push({ path: job.directory, message: error instanceof Error ? error.message : String(error) });
          return;
        }
        for (const node of nodes) {
          job.target.push(node);
          if (node.type === 'directory' && (query || job.depth < maxDepth)) {
            node.children = [];
            jobs.push({ directory: node.path, target: node.children, depth: job.depth + 1 });
          }
        }
      }));
    }
    if (query) {
      const filter = (nodes: ProjectDirNode[]): ProjectDirNode[] => nodes.flatMap((node) => {
        const children = node.children && filter(node.children);
        const matches = node.relativePath.toLowerCase().includes(query) || node.name.toLowerCase().includes(query);
        return matches || children?.length ? [{ ...node, ...(children ? { children } : {}) }] : [];
      });
      result.nodes = filter(result.nodes);
    }
    return result;
  }
}
