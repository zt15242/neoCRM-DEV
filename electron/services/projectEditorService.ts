import fs from 'node:fs/promises';
import path from 'node:path';
import type { ProjectTextFile } from '../../shared/editorTypes';
import { workspaceMutationService } from './workspaceMutationService';

const LIMIT = 2 * 1024 * 1024;
const within = (root: string, file: string) => {
  const relative = path.relative(root, file);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

export class ProjectEditorService {
  constructor(private projectRoots: () => string[]) {}

  private async resolve(root: string, file: string): Promise<string> {
    if (!this.projectRoots().some(item => path.resolve(item) === path.resolve(root))) throw new Error('请先关联此项目目录');
    const [realRoot, realFile] = await Promise.all([fs.realpath(root), fs.realpath(file)]);
    if (!within(realRoot, realFile)) throw new Error('只能编辑当前项目内的文件');
    return realFile;
  }

  public async read(root: string, file: string): Promise<ProjectTextFile> {
    const full = await this.resolve(root, file);
    const snapshot = await workspaceMutationService.read(full, LIMIT);
    return { path: file, relativePath: path.relative(root, file), content: (snapshot.bom ? '\uFEFF' : '') + snapshot.content,
      lineEnding: snapshot.lineEnding, revision: snapshot.revision };
  }

  public async save(root: string, file: string, content: string, expectedRevision: string): Promise<ProjectTextFile> {
    if (typeof content !== 'string' || Buffer.byteLength(content) > LIMIT) throw new Error('内容超过内置编辑器的 2 MB 限制');
    if (content.includes('\0')) throw new Error('不能将二进制内容写入文本文件');
    const full = await this.resolve(root, file);
    const saved = await workspaceMutationService.write(full, content, { expectedRevision, limit: LIMIT, projectRoot: root });
    return { path: file, relativePath: path.relative(root, file), content: (saved.bom ? '\uFEFF' : '') + saved.content,
      lineEnding: saved.lineEnding, revision: saved.revision };
  }
}
