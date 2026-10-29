import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import tailwindcss from '@tailwindcss/postcss';
import { app, BrowserWindow, dialog } from 'electron';
import { build, stop, type BuildOptions, type BuildResult } from 'esbuild';
import postcss from 'postcss';
import type { AccountRecord, CrmProductType } from '../types';
import type { EmailAccount } from '../../shared/mailTypes';
import type { WorkspaceDataSources, WorkspaceExecutionLog, WorkspaceExecutionLogStage, WorkspaceExecutionLogStatus, WorkspacePage, WorkspaceWidget, WorkspaceWidgetResult, WorkspaceWidgetType } from '../../shared/workspaceTypes';
import { DataService } from './dataService';
import { EmailService } from './emailService';
import { SessionStore } from './sessionStore';
import { MetadataService } from './metadataService';
import { ProjectService } from './projectService';
import type { NeoEnvironment, TokenData } from '../types';

const MAX_COMPONENT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_COMPONENT_PACKAGE_BYTES = 20 * 1024 * 1024;
const MAX_COMPONENT_EXECUTION_LOGS = 2000;
const MAX_COMPONENT_LOG_MESSAGE_CHARS = 1200;
const COMPONENT_ENTRY_EXTENSIONS = new Set(['.html', '.htm', '.tsx', '.ts', '.jsx', '.js']);
const COMPONENT_FILE_EXTENSIONS = new Set([...COMPONENT_ENTRY_EXTENSIONS, '.css', '.json', '.svg', '.txt', '.md']);
const runtimeRequire = createRequire(import.meta.url);

interface WorkspaceExecutionContext {
  pageId: string;
  widgetId: string;
  executionId: string;
  batchId: string;
  trigger: 'manual' | 'scheduled' | 'preview';
}

export class WorkspaceService {
  private readonly tailwindCssCache = new Map<string, { signature: string; css: string }>();
  private readonly queryCountsByExecution = new Map<string, number>();
  private readonly executionContexts = new Map<string, WorkspaceExecutionContext>();
  private componentBuildQueue: Promise<void> = Promise.resolve();

  constructor(
    private sessionStore: SessionStore,
    private dataService: DataService,
    private emailService: EmailService,
    private metadataService: MetadataService,
    private projectService?: ProjectService,
  ) {}

  private getFilePath(): string {
    const userData = app?.getPath ? app.getPath('userData') : process.cwd();
    return path.join(userData, 'neocrm_workspace_pages.json');
  }

  private getComponentLogsPath(): string {
    const userData = app?.getPath ? app.getPath('userData') : process.cwd();
    return path.join(userData, 'neocrm_workspace_component_logs.json');
  }

  private readComponentLogs(): WorkspaceExecutionLog[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.getComponentLogsPath(), 'utf8'));
      return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') as WorkspaceExecutionLog[] : [];
    } catch {
      return [];
    }
  }

  private writeComponentLogs(logs: WorkspaceExecutionLog[]): void {
    fs.writeFileSync(this.getComponentLogsPath(), JSON.stringify(logs.slice(-MAX_COMPONENT_EXECUTION_LOGS)), 'utf8');
  }

  public listComponentExecutionLogs(pageId: string, widgetId: string, limit = 100): WorkspaceExecutionLog[] {
    const boundedLimit = Math.max(1, Math.min(500, Math.floor(Number(limit) || 100)));
    return this.readComponentLogs()
      .filter((item) => item.pageId === pageId && item.widgetId === widgetId)
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, boundedLimit);
  }

  public clearComponentExecutionLogs(pageId: string, widgetId: string): number {
    const logs = this.readComponentLogs();
    const remaining = logs.filter((item) => item.pageId !== pageId || item.widgetId !== widgetId);
    this.writeComponentLogs(remaining);
    return logs.length - remaining.length;
  }

  public appendComponentExecutionLog(
    pageId: string,
    widgetId: string,
    stage: WorkspaceExecutionLogStage,
    status: WorkspaceExecutionLogStatus,
    message: string,
    durationMs?: number,
    executionId?: string,
    batchId?: string,
    trigger?: WorkspaceExecutionContext['trigger'],
    trustedInternal = false,
  ): WorkspaceExecutionLog | undefined {
    const page = this.listPages().find((item) => item.id === pageId);
    const widget = page?.widgets.find((item) => item.id === widgetId);
    if (!page || !widget) return undefined;
    const executionContext = executionId ? this.executionContexts.get(executionId) : undefined;
    if (executionId && (!/^[a-zA-Z0-9_-]{1,100}$/.test(executionId) || (!trustedInternal && (executionContext?.pageId !== pageId || executionContext?.widgetId !== widgetId)))) return undefined;
    batchId = executionContext?.batchId || batchId;
    trigger = executionContext?.trigger || trigger;
    const allowedStages: WorkspaceExecutionLogStage[] = ['run', 'config', 'load', 'dependency', 'build', 'style', 'query', 'render', 'runtime'];
    const allowedStatuses: WorkspaceExecutionLogStatus[] = ['info', 'success', 'error'];
    if (!allowedStages.includes(stage) || !allowedStatuses.includes(status)) throw new Error('组件执行日志类型无效');
    const logs = this.readComponentLogs();
    const sequence = executionId ? logs.reduce((max, item) => item.executionId === executionId ? Math.max(max, Number(item.sequence) || 0) : max, 0) + 1 : undefined;
    const entry: WorkspaceExecutionLog = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      pageId,
      pageName: page.name,
      widgetId,
      widgetTitle: widget.title,
      ...(executionId ? { executionId } : {}),
      ...(batchId ? { batchId } : {}),
      ...(sequence ? { sequence } : {}),
      ...(trigger ? { trigger } : {}),
      stage,
      status,
      message: String(message || '')
        .replace(/\bSELECT\b[\s\S]*$/i, '[查询正文已隐藏]')
        .replace(/\bWHERE\b[\s\S]*?(?=\b(?:GROUP\s+BY|ORDER\s+BY|LIMIT|OFFSET)\b|$)/gi, 'WHERE [过滤条件值已隐藏] ')
        .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
        .replace(/["']?(?:access_token|refresh_token|client_secret|permanentCode|authorization)["']?\s*[:=]\s*["']?[^"',\s;}]+["']?/gi, '[redacted]')
        .slice(0, MAX_COMPONENT_LOG_MESSAGE_CHARS) || '无详细信息',
      timestamp: Date.now(),
      ...(Number.isFinite(durationMs) ? { durationMs: Math.max(0, Math.min(86_400_000, Math.floor(durationMs!))) } : {}),
    };
    logs.push(entry);
    this.writeComponentLogs(logs);
    return entry;
  }

  private recordComponentLog(
    pageId: string,
    widgetId: string,
    stage: WorkspaceExecutionLogStage,
    status: WorkspaceExecutionLogStatus,
    message: string,
    durationMs?: number,
    context?: WorkspaceExecutionContext,
  ): void {
    try {
      this.appendComponentExecutionLog(
        context?.pageId || pageId,
        context?.widgetId || widgetId,
        stage,
        status,
        message,
        durationMs,
        context?.executionId,
        context?.batchId,
        context?.trigger,
        true,
      );
    } catch {}
  }

  private summarizeReadQuery(query: string): string {
    const select = query.match(/^\s*SELECT\s+([\s\S]+?)\s+FROM\s+([a-zA-Z_][\w.]*)/i);
    if (!select) return '只读查询（查询正文隐藏）';
    const fields = select[1].split(',').map((field) => field.trim()).filter(Boolean);
    const shownFields = fields.slice(0, 8).join(', ');
    const where = query.match(/\bWHERE\b([\s\S]*?)(?:\b(?:GROUP\s+BY|ORDER\s+BY|LIMIT|OFFSET)\b|$)/i)?.[1];
    const conditionCount = where ? (where.match(/\b(?:AND|OR)\b/gi)?.length || 0) + 1 : 0;
    const limit = query.match(/\bLIMIT\s+(\d+)/i)?.[1];
    return [
      `对象 ${select[2]}`,
      `字段 ${shownFields || '未解析'}${fields.length > 8 ? ` 等 ${fields.length} 项` : ''}`,
      conditionCount ? `${conditionCount} 个过滤条件（值已隐藏）` : '无 WHERE 过滤',
      limit ? `最多 ${limit} 行` : undefined,
    ].filter(Boolean).join(' · ');
  }

  private nextQueryOrdinal(executionId: string): number {
    const next = (this.queryCountsByExecution.get(executionId) || 0) + 1;
    this.queryCountsByExecution.set(executionId, next);
    if (this.queryCountsByExecution.size > 500) this.queryCountsByExecution.delete(this.queryCountsByExecution.keys().next().value!);
    return next;
  }

  private getComponentsRoot(): string {
    const userData = app?.getPath ? app.getPath('userData') : path.join(process.cwd(), '.neocrm');
    const root = path.join(userData, 'workspace-components');
    try {
      const stat = fs.lstatSync(root);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('应用组件库路径必须是普通目录');
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
      fs.mkdirSync(root, { recursive: true });
    }
    return root;
  }

  public listComponentFiles(): { rootPath: string; files: Array<{ relativePath: string; ext: string; size: number }> } {
    const root = this.getComponentsRoot();
    const files: Array<{ relativePath: string; ext: string; size: number }> = [];
    const walk = (directory: string, depth = 0) => {
      if (depth > 8 || files.length >= 1000) return;
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '.git') continue;
        const fullPath = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
          continue;
        }
        const ext = path.extname(entry.name).toLowerCase();
        if (!entry.isFile() || !COMPONENT_ENTRY_EXTENSIONS.has(ext)) continue;
        const stat = fs.statSync(fullPath);
        files.push({ relativePath: path.relative(root, fullPath).split(path.sep).join('/'), ext, size: stat.size });
        if (files.length >= 1000) break;
      }
    };
    walk(root);
    return { rootPath: root, files };
  }

  public writeComponentFile(packageId: string, relativePath: string, content: string): { relativePath: string; size: number } {
    const target = this.resolveComponentPackagePath(packageId, relativePath, true);
    const body = String(content ?? '');
    const size = Buffer.byteLength(body, 'utf8');
    if (size > MAX_COMPONENT_FILE_BYTES) throw new Error('自定义组件单个源码文件不能超过 2 MB');
    fs.mkdirSync(path.dirname(target.fullPath), { recursive: true });
    fs.writeFileSync(target.fullPath, body, 'utf8');
    const manifestPath = path.join(this.getComponentsRoot(), packageId, 'neocrm-component.json');
    if (COMPONENT_ENTRY_EXTENSIONS.has(path.extname(target.packageRelativePath).toLowerCase()) && !fs.existsSync(manifestPath)) {
      fs.writeFileSync(manifestPath, JSON.stringify({ format: 'neocrm-component', version: 1, id: packageId, entry: target.packageRelativePath }, null, 2), 'utf8');
    }
    return { relativePath: target.relativePath, size };
  }

  public async importComponentFile(): Promise<{ canceled: boolean; relativePath?: string; fileName?: string }> {
    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() || undefined, {
      title: '导入自定义组件源码',
      properties: ['openFile'],
      filters: [{ name: 'HTML / TypeScript / JavaScript', extensions: ['html', 'htm', 'tsx', 'ts', 'jsx', 'js'] }],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const sourcePath = result.filePaths[0];
    const stat = fs.statSync(sourcePath);
    if (!stat.isFile() || stat.size > MAX_COMPONENT_FILE_BYTES) throw new Error('组件源码必须是 2 MB 以内的文件');
    const fileName = path.basename(sourcePath);
    const packageId = `imported-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const imported = this.writeComponentFile(packageId, fileName, fs.readFileSync(sourcePath, 'utf8'));
    return { canceled: false, relativePath: imported.relativePath, fileName };
  }

  public listPages(projectId?: string): WorkspacePage[] {
    try {
      const raw = fs.readFileSync(this.getFilePath(), 'utf-8');
      const pages = JSON.parse(raw);
      if (!Array.isArray(pages)) return [];
      return projectId ? pages.filter((page) => !page.projectId || page.projectId === projectId) : pages;
    } catch {
      return [];
    }
  }

  public savePage(input: WorkspacePage, projectRoot?: string): WorkspacePage[] {
    if (!input || !input.id || !input.name?.trim()) throw new Error('页面名称不能为空');
    if (!Array.isArray(input.widgets) || input.widgets.length > 40) throw new Error('页面组件数量无效');
    const now = Date.now();
    const pages = this.listPages();
    const previous = pages.find((page) => page.id === input.id);
    const projectRootById = input.projectId ? this.getProjectRoot(input.projectId) : undefined;
    if (input.projectId && this.projectService && !projectRootById) throw new Error('页面所属项目不存在，请返回页面列表后重新打开');
    if (projectRoot && projectRootById && path.resolve(projectRoot) !== path.resolve(projectRootById)) {
      throw new Error('页面所属项目与当前工作区不一致，请切换回页面所属项目后再保存');
    }
    const resolvedProjectRoot = projectRootById || projectRoot || this.getProjectRoot(input.projectId);
    const resolvedProjectId = input.projectId || (resolvedProjectRoot && this.projectService?.getProjects().find((project) => path.resolve(project.localPath) === path.resolve(resolvedProjectRoot))?.id);
    const page: WorkspacePage = {
      ...input,
      projectId: resolvedProjectId,
      name: input.name.trim().slice(0, 80),
      description: input.description?.slice(0, 500),
      widgets: input.widgets.map((widget) => this.validateWidgetConfig(widget, resolvedProjectRoot)),
      createdAt: previous?.createdAt || input.createdAt || now,
      updatedAt: now,
    };
    const next = [page, ...pages.filter((item) => item.id !== page.id)];
    fs.writeFileSync(this.getFilePath(), JSON.stringify(next, null, 2), 'utf-8');
    return next;
  }

  public deletePage(pageId: string): WorkspacePage[] {
    const pages = this.listPages().filter((page) => page.id !== pageId);
    fs.writeFileSync(this.getFilePath(), JSON.stringify(pages, null, 2), 'utf-8');
    return pages;
  }

  public async exportPagePackage(pageId: string): Promise<{ canceled: boolean; filePath?: string }> {
    const page = this.listPages().find((item) => item.id === pageId);
    if (!page) throw new Error('找不到要导出的工作台页面');
    const safeName = page.name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || '工作台页面';
    const result = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow() || undefined, {
      title: '导出工作台页面与组件包',
      defaultPath: `${safeName}.neoworkspace.zip`,
      filters: [{ name: 'NeoCRM 工作台组件包', extensions: ['zip'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };

    const zip = new JSZip();
    const exportedPage: WorkspacePage = {
      ...page,
      widgets: page.widgets.map(({ buildStatus, buildError, ...widget }) => widget),
    };
    zip.file('neocrm-workspace-package.json', JSON.stringify({ format: 'neocrm-workspace-package', version: 1, exportedAt: Date.now() }, null, 2));
    const componentRoot = this.getComponentsRoot();
    const packageIds = new Map<string, string>();
    const componentBudget = { fileCount: 0, totalBytes: 0 };
    for (const widget of exportedPage.widgets) {
      if (widget.type !== 'custom-html' && widget.type !== 'custom-tsx') continue;
      const relative = this.normalizeComponentRelativePath(widget.relativePath || '');
      const packageId = relative.split('/')[0];
      const allowedExtensions = widget.type === 'custom-html' ? ['.html', '.htm'] : ['.tsx', '.ts', '.jsx', '.js'];
      const managedDir = path.join(componentRoot, packageId);
      let managedPath: string | undefined;
      try { managedPath = this.resolveProjectFile(relative, componentRoot, allowedExtensions); } catch {}
      if (managedPath && fs.existsSync(managedDir) && fs.statSync(managedDir).isDirectory()) {
        const exportKey = `managed:${packageId}`;
        if (!packageIds.has(exportKey)) {
          this.addComponentDirectoryToZip(zip, managedDir, packageId, componentBudget);
          packageIds.set(exportKey, packageId);
        }
        continue;
      }

      const legacyRoot = this.getProjectRoot(page.projectId);
      if (!legacyRoot) throw new Error(`组件包“${widget.title}”不在应用组件库中，请先导入组件文件后再分享`);
      const legacyPath = this.resolveProjectFile(relative, legacyRoot, allowedExtensions);
      const legacyDirectory = path.dirname(legacyPath);
      const exportKey = `legacy:${legacyDirectory}`;
      let legacyPackageId = packageIds.get(exportKey);
      if (!legacyPackageId) {
        legacyPackageId = `legacy-${widget.id}`;
        const archiveDirectory = path.posix.join('components', legacyPackageId, path.relative(legacyRoot, legacyDirectory).split(path.sep).join('/'));
        this.addSourceDirectoryToZip(zip, legacyDirectory, archiveDirectory, componentBudget);
        packageIds.set(exportKey, legacyPackageId);
      }
      widget.relativePath = `${legacyPackageId}/${path.relative(legacyRoot, legacyPath).split(path.sep).join('/')}`;
    }
    zip.file('page.json', JSON.stringify(exportedPage, null, 2));
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    if (buffer.byteLength > MAX_COMPONENT_PACKAGE_BYTES) throw new Error('组件包压缩后超过 20 MB，未导出');
    fs.writeFileSync(result.filePath, buffer);
    return { canceled: false, filePath: result.filePath };
  }

  public async importPagePackage(projectId?: string): Promise<{ canceled: boolean; page?: WorkspacePage; pages?: WorkspacePage[] }> {
    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() || undefined, {
      title: '导入工作台页面与组件包',
      properties: ['openFile'],
      filters: [{ name: 'NeoCRM 工作台组件包', extensions: ['zip'] }],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const archive = fs.readFileSync(result.filePaths[0]);
    if (archive.byteLength > MAX_COMPONENT_PACKAGE_BYTES) throw new Error('组件包不能超过 20 MB');
    const zip = await JSZip.loadAsync(archive);
    const pageEntry = zip.file('page.json');
    if (!pageEntry) throw new Error('组件包中没有 page.json');
    if (this.isZipSymbolicLink(pageEntry)) throw new Error('组件包页面配置不能是软链接');
    const pageData = JSON.parse((await this.readZipEntryWithLimit(pageEntry, 1024 * 1024)).toString('utf8')) as WorkspacePage;
    if (!pageData?.name || !Array.isArray(pageData.widgets) || pageData.widgets.length > 40 || pageData.widgets.some((widget) => !widget || typeof widget !== 'object')) throw new Error('组件包中的页面配置无效');

    const componentRoot = this.getComponentsRoot();
    const prefix = `imported-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const packageIds = new Map<string, string>();
    const expectedEntries = new Set<string>();
    const customWidgets = pageData.widgets.filter((widget) => widget.type === 'custom-html' || widget.type === 'custom-tsx');
    for (const widget of customWidgets) {
      const relative = this.normalizeComponentRelativePath(widget.relativePath || '');
      const oldId = relative.split('/')[0];
      if (!packageIds.has(oldId)) packageIds.set(oldId, `${prefix}-${packageIds.size + 1}`);
      widget.relativePath = `${packageIds.get(oldId)}${relative.slice(oldId.length)}`;
      expectedEntries.add(`components/${relative}`);
    }
    for (const id of packageIds.values()) {
      if (fs.existsSync(path.join(componentRoot, id))) throw new Error('导入组件包 ID 冲突，请重新导入');
    }

    const importedFiles: string[] = [];
    const createdPackageIds = new Set<string>();
    let totalBytes = 0;
    let fileCount = 0;
    try {
      const entries: Array<{ path: string; entry: JSZip.JSZipObject }> = [];
      zip.forEach((entryPath, entry) => {
        if (entry.dir || entryPath === 'page.json' || entryPath === 'neocrm-workspace-package.json') return;
        const safePath = this.normalizePackageArchivePath(entryPath);
        if (!safePath.startsWith('components/')) throw new Error(`组件包包含不允许的文件路径: ${entryPath}`);
        if (this.isZipSymbolicLink(entry)) throw new Error(`组件包不允许包含软链接: ${entryPath}`);
        entries.push({ path: safePath, entry });
      });
      if (entries.length > 500) throw new Error('组件包文件数量不能超过 500');
      const includedEntries = new Set(entries.map((item) => item.path));
      for (const expected of expectedEntries) {
        if (!includedEntries.has(expected)) throw new Error(`组件包缺少页面引用的入口文件: ${expected.slice('components/'.length)}`);
      }
      for (const item of entries) {
        const segments = item.path.slice('components/'.length).split('/');
        if (segments.length < 2) throw new Error(`组件包路径格式无效: ${item.path}`);
        const oldId = segments[0];
        const newId = packageIds.get(oldId);
        if (!newId) throw new Error(`组件包包含未被页面引用的组件目录: ${oldId}`);
        const data = await this.readZipEntryWithLimit(item.entry, 5 * 1024 * 1024);
        totalBytes += data.byteLength;
        fileCount++;
        if (data.byteLength > 5 * 1024 * 1024 || totalBytes > MAX_COMPONENT_PACKAGE_BYTES || fileCount > 500) throw new Error('组件包解压内容超过安全限制');
        const relativePath = segments.slice(1).join('/');
        const target = this.resolveComponentPackagePath(newId, relativePath, true);
        const packageRoot = path.join(componentRoot, newId);
        if (!createdPackageIds.has(newId)) {
          fs.mkdirSync(packageRoot);
          createdPackageIds.add(newId);
        }
        fs.mkdirSync(path.dirname(target.fullPath), { recursive: true });
        fs.writeFileSync(target.fullPath, data);
        importedFiles.push(target.fullPath);
      }
      const page: WorkspacePage = {
        ...pageData,
        id: `page_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        projectId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const pages = this.savePage(page);
      return { canceled: false, page: pages.find((item) => item.id === page.id), pages: this.listPages(projectId) };
    } catch (error) {
      for (const file of importedFiles) {
        try { fs.unlinkSync(file); } catch {}
      }
      for (const id of createdPackageIds) {
        const dir = path.join(componentRoot, id);
        try { if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); } catch {}
      }
      throw error;
    }
  }

  public getDataSources(): WorkspaceDataSources {
    const history = this.sessionStore.getAccountHistory();
    const current = this.sessionStore.getCurrentSession();
    const crmRecords = [...history];
    if (current.isLoggedIn && current.environment && current.tokenData) {
      const currentId = current.activeAccountId || `${current.environment.id}_${current.tokenData.tenant_id || 'unknown'}_${current.tokenData.userInfo?.userId || 'u'}`;
      if (!crmRecords.some((item) => item.id === currentId)) {
        crmRecords.unshift({
          id: currentId,
          environmentId: current.environment.id,
          environmentName: current.environment.name,
          tenantName: current.tokenData.userInfo?.tenantName,
          userName: current.tokenData.userInfo?.name,
          lastLoginAt: Date.now(),
          tokenData: current.tokenData,
          environment: current.environment,
        });
      }
    }
    const unique = new Map<string, AccountRecord>();
    for (const record of crmRecords) {
      if (record.environment && record.tokenData?.access_token) unique.set(record.id, record);
    }
    const crmAccounts = Array.from(unique.values()).map((record) => ({
      accountId: record.id,
      connectorId: record.environmentId,
      connectorName: record.environmentName,
      productType: (record.environment?.productType || 'neocrm') as CrmProductType,
      tenantName: record.tenantName,
      userName: record.userName,
    }));
    const mailAccounts = this.emailService.getAccounts().map((account: EmailAccount) => ({
      accountId: account.id,
      name: account.name,
      email: account.email,
    }));
    return { crmAccounts, mailAccounts };
  }

  public async listConnectorEntities(accountId: string) {
    const { environment, tokenData } = this.getAccountSession(accountId);
    return this.metadataService.fetchEntityList(environment, tokenData);
  }

  public async getConnectorEntityFields(accountId: string, entityApiKey: string) {
    const { environment, tokenData } = this.getAccountSession(accountId);
    if (!entityApiKey?.trim()) throw new Error('缺少对象 API 名');
    return this.metadataService.fetchEntityFields(environment, tokenData, entityApiKey.trim());
  }

  public async queryConnector(accountId: string, rawQuery: string) {
    const account = this.getDataSources().crmAccounts.find((item) => item.accountId === accountId);
    if (!account) throw new Error('此 CRM 账号不存在或已移除');
    let query = String(rawQuery || '').trim().replace(/;\s*$/, '');
    if (query.length > 20_000) throw new Error('CRM 查询超过 20,000 个字符');
    if (!/^SELECT\b/i.test(query) || query.includes(';') || /\b(INSERT|UPDATE|DELETE|UPSERT|MERGE|DROP|ALTER|CREATE|TRUNCATE|EXEC|CALL)\b/i.test(query)) {
      throw new Error('只允许单条 CRM SELECT 查询');
    }
    const { environment, tokenData } = this.getAccountSession(accountId);
    const result = await this.dataService.executeQueryAll(environment, tokenData, query);
    if (!result.success || !result.data) throw new Error(result.error || 'Salesforce 查询失败');
    return {
      success: true,
      data: {
        records: result.data.records,
        totalSize: result.data.totalSize,
        fields: result.data.fields,
      },
    };
  }

  public async queryComponentConnector(pageId: string, widgetId: string, executionId: string, accountId: string, query: string) {
    const startedAt = Date.now();
    const context = this.executionContexts.get(executionId);
    if (!context || context.pageId !== pageId || context.widgetId !== widgetId) throw new Error('组件执行上下文已失效，请重新运行组件');
    const widget = this.listPages().find((item) => item.id === pageId)?.widgets.find((item) => item.id === widgetId);
    if (!widget || widget.accountId !== accountId) throw new Error('查询账号与组件绑定的 CRM 连接器不一致');
    const ordinal = this.nextQueryOrdinal(executionId);
    const connector = this.getDataSources().crmAccounts.find((item) => item.accountId === accountId);
    this.recordComponentLog(pageId, widgetId, 'query', 'info', `动态查询 #${ordinal} 已发起 · ${connector?.connectorName || '未知连接器'} (${connector?.productType || '未知平台'}) · ${this.summarizeReadQuery(query)}`, undefined, context);
    try {
      const result = await this.queryConnector(accountId, query);
      this.recordComponentLog(pageId, widgetId, 'query', 'success', `动态查询 #${ordinal} 完成 · 返回 ${result.data?.records.length || 0} 行 / 共 ${result.data?.totalSize || 0} 行 · ${result.data?.fields.length || 0} 个字段`, Date.now() - startedAt, context);
      return result;
    } catch (error: any) {
      const message = String(error?.message || 'CRM 查询失败');
      this.recordComponentLog(pageId, widgetId, 'query', 'error', `动态查询 #${ordinal} 失败 · ${message}`, Date.now() - startedAt, context);
      throw error;
    }
  }

  public async runPage(pageId: string, projectRoot?: string): Promise<WorkspaceWidgetResult[]> {
    const page = this.listPages().find((item) => item.id === pageId);
    if (!page) throw new Error('找不到该自定义页面');
    const root = this.resolvePageProjectRoot(page, projectRoot);
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return Promise.all(page.widgets.filter((widget) => widget.type !== 'text').map((widget) => this.runWidget(page, widget, root, 'manual', batchId)));
  }

  public async runWidgetById(pageId: string, widgetId: string, projectRoot?: string, trigger: WorkspaceExecutionContext['trigger'] = 'scheduled'): Promise<WorkspaceWidgetResult> {
    const page = this.listPages().find((item) => item.id === pageId);
    const widget = page?.widgets.find((item) => item.id === widgetId);
    if (!widget) throw new Error('找不到该工作台组件');
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return this.runWidget(page!, widget, this.resolvePageProjectRoot(page!, projectRoot), trigger, batchId);
  }

  public async previewWidget(pageId: string, widgetId: string, projectRoot?: string): Promise<WorkspaceWidgetResult> {
    return this.runWidgetById(pageId, widgetId, projectRoot, 'preview');
  }

  private async runWidget(page: WorkspacePage, widget: WorkspaceWidget, projectRoot: string | undefined, trigger: WorkspaceExecutionContext['trigger'], batchId: string): Promise<WorkspaceWidgetResult> {
    const startedAt = Date.now();
    const context: WorkspaceExecutionContext = {
      pageId: page.id,
      widgetId: widget.id,
      executionId: `exec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      batchId,
      trigger,
    };
    this.executionContexts.set(context.executionId, context);
    if (this.executionContexts.size > 500) this.executionContexts.delete(this.executionContexts.keys().next().value!);
    this.recordComponentLog(page.id, widget.id, 'run', 'info', `运行开始 · ${trigger === 'manual' ? '用户手动刷新' : trigger === 'scheduled' ? '定时订阅任务' : '组件预览加载'}`, undefined, context);
    const account = widget.accountId ? this.getDataSources().crmAccounts.find((item) => item.accountId === widget.accountId) : undefined;
    this.recordComponentLog(page.id, widget.id, 'config', 'info', `组件类型=${widget.type} · CRM=${account ? `${account.connectorName} (${account.productType})` : '未绑定'} · 初始查询=${widget.query ? '已配置' : '未配置'}`, undefined, context);
    this.recordComponentLog(page.id, widget.id, 'config', 'success', '运行配置读取完成', undefined, context);
    const result = await this.executeWidget(page, widget, projectRoot, context);
    this.recordComponentLog(
      page.id,
      widget.id,
      'run',
      result.success ? 'success' : 'error',
      result.success
        ? `${widget.type === 'custom-html' || widget.type === 'custom-tsx' ? '资源构建完成 · 等待 iframe 组件挂载' : '运行完成'} · ${Date.now() - startedAt} ms`
        : `运行失败 · ${result.error || '组件执行失败'}`,
      Date.now() - startedAt,
      context,
    );
    return { ...result, executionId: context.executionId };
  }

  private async executeWidget(page: WorkspacePage, widget: WorkspaceWidget, projectRoot: string | undefined, context: WorkspaceExecutionContext): Promise<WorkspaceWidgetResult> {
    const updatedAt = Date.now();
    try {
      if (widget.type === 'custom-html' || widget.type === 'custom-tsx') {
        return await this.renderCustomWidget(page, widget, projectRoot, updatedAt, context);
      }
      if (widget.type === 'mail-list') {
        const records = this.emailService.getDashboardMailData(widget.accountId, this.clampLimit(widget.limit, 10, 50));
        return { widgetId: widget.id, success: true, records, fields: ['from', 'subject', 'date', 'snippet', 'isRead'], totalSize: records.length, updatedAt };
      }
      if (widget.type === 'async-apex-dashboard') {
        const query = widget.query || 'SELECT ApexClassId, ApexClass.Name, CompletedDate, CreatedBy.Name, CreatedDate, CronTriggerId, ExtendedStatus, Id, JobItemsProcessed, JobType, MethodName, NumberOfErrors, ParentJobId, Status, TotalJobItems FROM AsyncApexJob WHERE CreatedDate = YESTERDAY ORDER BY CreatedDate DESC';
        const ordinal = this.nextQueryOrdinal(context.executionId);
        const account = this.getDataSources().crmAccounts.find((item) => item.accountId === widget.accountId);
        this.recordComponentLog(page.id, widget.id, 'query', 'info', `预置查询 #${ordinal} 已发起 · ${account?.connectorName || '未知连接器'} (${account?.productType || '未知平台'}) · ${this.summarizeReadQuery(query)}`, undefined, context);
        const queryStartedAt = Date.now();
        try {
          const result = await this.queryConnector(widget.accountId || '', query);
          this.recordComponentLog(page.id, widget.id, 'query', 'success', `预置查询 #${ordinal} 完成 · 返回 ${result.data?.records.length || 0} 行 / 共 ${result.data?.totalSize || 0} 行 · ${result.data?.fields.length || 0} 个字段`, Date.now() - queryStartedAt, context);
          return { widgetId: widget.id, success: true, records: result.data?.records || [], fields: result.data?.fields || [], totalSize: result.data?.totalSize || 0, updatedAt: Date.now() };
        } catch (error: any) {
          this.recordComponentLog(page.id, widget.id, 'query', 'error', `预置查询 #${ordinal} 失败 · ${String(error?.message || 'CRM 查询失败')}`, Date.now() - queryStartedAt, context);
          throw error;
        }
      }
      if (widget.type !== 'crm-query') throw new Error('不支持的组件类型');
      let validated: { query: string; accountId: string };
      const validationStartedAt = Date.now();
      try {
        validated = this.validateCrmQuery(widget);
        this.recordComponentLog(page.id, widget.id, 'query', 'success', `CRM 查询配置校验通过 · ${this.summarizeReadQuery(validated.query)}`, Date.now() - validationStartedAt, context);
      } catch (error: any) {
        this.recordComponentLog(page.id, widget.id, 'query', 'error', `CRM 查询配置校验失败 · ${String(error?.message || '查询配置无效')}`, Date.now() - validationStartedAt, context);
        throw error;
      }
      const { query, accountId } = validated;
      const account = this.getDataSources().crmAccounts.find((item) => item.accountId === accountId);
      if (!account) {
        this.recordComponentLog(page.id, widget.id, 'query', 'error', 'CRM 查询无法执行 · 绑定的连接器账号不存在或已移除', undefined, context);
        throw new Error('此组件绑定的 CRM 账号不存在或已移除');
      }
      const queryStartedAt = Date.now();
      const ordinal = this.nextQueryOrdinal(context.executionId);
      this.recordComponentLog(page.id, widget.id, 'query', 'info', `CRM 查询 #${ordinal} 已发起 · ${account.connectorName} (${account.productType}) · ${this.summarizeReadQuery(query)}`, undefined, context);
      try {
        const { tokenData, environment } = this.getAccountSession(accountId);
        this.recordComponentLog(page.id, widget.id, 'query', 'success', `连接器授权会话可用 · ${account.connectorName}`, undefined, context);
        const result = await this.dataService.executeQueryAll(environment, tokenData, query);
        if (!result.success || !result.data) throw new Error(result.error || 'CRM 查询失败');
        this.recordComponentLog(page.id, widget.id, 'query', 'success', `CRM 查询 #${ordinal} 完成 · 返回 ${result.data.records.length} 行 / 共 ${result.data.totalSize} 行 · ${result.data.fields.length} 个字段`, Date.now() - queryStartedAt, context);
        return {
          widgetId: widget.id,
          success: true,
          records: result.data.records,
          fields: result.data.fields,
          totalSize: result.data.totalSize,
          updatedAt: Date.now(),
        };
      } catch (error: any) {
        this.recordComponentLog(page.id, widget.id, 'query', 'error', `CRM 查询 #${ordinal} 失败 · ${String(error?.message || 'CRM 查询失败')}`, Date.now() - queryStartedAt, context);
        throw error;
      }
    } catch (error: any) {
      return { widgetId: widget.id, success: false, error: error?.message || '组件运行失败', updatedAt };
    }
  }

  private getAccountSession(accountId: string): { environment: NeoEnvironment; tokenData: TokenData } {
    const record = this.sessionStore.getAccountHistory().find((item) => item.id === accountId);
    const current = this.sessionStore.getCurrentSession();
    const tokenData = record?.tokenData || (current.activeAccountId === accountId ? current.tokenData : undefined);
    const environment = record?.environment || (current.activeAccountId === accountId ? current.environment : undefined);
    if (!tokenData?.access_token || !environment) throw new Error('此 CRM 账号没有可用的授权会话，请在连接器详情中重新登录');
    return { environment, tokenData };
  }

  private getProjectRoot(projectId?: string): string | undefined {
    if (!projectId || !this.projectService) return undefined;
    return this.projectService.getProjects().find((project) => project.id === projectId)?.localPath;
  }

  private resolvePageProjectRoot(page: WorkspacePage, requestedRoot?: string): string | undefined {
    if (page.projectId && this.projectService) return this.getProjectRoot(page.projectId);
    return requestedRoot || this.getProjectRoot(page.projectId);
  }

  private validateWidgetConfig(widget: WorkspaceWidget, projectRoot?: string): WorkspaceWidget {
    const supportedTypes: WorkspaceWidgetType[] = ['text', 'crm-query', 'mail-list', 'async-apex-dashboard', 'custom-html', 'custom-tsx'];
    if (!widget?.id || !supportedTypes.includes(widget.type)) throw new Error('页面中包含无效组件');
    const normalized = { ...widget, title: String(widget.title || '').trim().slice(0, 120) || '未命名组件' };
    const columnSpan = Number(normalized.columnSpan);
    normalized.columnSpan = ([1, 2, 3, 4].includes(columnSpan) ? columnSpan : normalized.type === 'async-apex-dashboard' ? 4 : 2) as WorkspaceWidget['columnSpan'];
    const height = Number(normalized.height);
    normalized.height = ([320, 480, 640, 800].includes(height) ? height : normalized.type === 'async-apex-dashboard' ? 640 : 480) as WorkspaceWidget['height'];
    normalized.feishuIncludeRecords = !!normalized.feishuIncludeRecords && normalized.type !== 'text' && normalized.type !== 'mail-list';
    if (normalized.subscription) {
      const intervalMinutes = Number(normalized.subscription.intervalMinutes);
      normalized.subscription = {
        enabled: !!normalized.subscription.enabled && normalized.type !== 'text',
        intervalMinutes: Number.isFinite(intervalMinutes) ? Math.max(15, Math.min(10080, Math.floor(intervalMinutes))) : 60,
        feishuEnabled: !!normalized.subscription.feishuEnabled && normalized.type !== 'text',
        feishuBotId: normalized.subscription.feishuBotId || undefined,
      };
      if (!normalized.subscription.enabled) normalized.subscription.feishuEnabled = false;
    }
    if (normalized.type === 'crm-query') {
      const { accountId } = this.validateCrmQuery(normalized);
      if (!this.getDataSources().crmAccounts.some((item) => item.accountId === accountId)) throw new Error(`组件“${normalized.title}”绑定的 CRM 账号无效`);
    }
    if (normalized.type === 'mail-list') {
      normalized.limit = this.clampLimit(normalized.limit, 10, 50);
      if (normalized.accountId && !this.emailService.getAccounts().some((item) => item.id === normalized.accountId)) throw new Error(`组件“${normalized.title}”绑定的邮箱账号无效`);
    }
    if (normalized.type === 'async-apex-dashboard') {
      if (!normalized.accountId) throw new Error(`组件“${normalized.title}”需要绑定 Salesforce 账号`);
      const account = this.getDataSources().crmAccounts.find((item) => item.accountId === normalized.accountId);
      if (account?.productType !== 'salesforce') throw new Error(`组件“${normalized.title}”仅能绑定 Salesforce 账号`);
    }
    if (normalized.type === 'text') normalized.text = String(normalized.text || '').slice(0, 3000);
    if (normalized.type === 'custom-html' || normalized.type === 'custom-tsx') {
      const relativePath = this.normalizeComponentRelativePath(String(normalized.relativePath || ''));
      const expectedExtension = normalized.type === 'custom-html' ? ['.html', '.htm'] : ['.tsx', '.ts', '.jsx', '.js'];
      if (!expectedExtension.includes(path.extname(relativePath).toLowerCase())) {
        throw new Error(`组件“${normalized.title}”的入口文件类型必须是 ${expectedExtension.join('、')}`);
      }
      const componentRoot = this.getComponentsRoot();
      const managedFile = path.resolve(componentRoot, ...relativePath.split('/'));
      if (fs.existsSync(managedFile)) {
        this.resolveProjectFile(relativePath, componentRoot, expectedExtension);
      } else if (projectRoot) {
        this.resolveProjectFile(relativePath, projectRoot, expectedExtension);
      } else {
        this.resolveProjectFile(relativePath, componentRoot, expectedExtension);
      }
      this.validateCustomWidgetQuery(normalized);
      normalized.relativePath = relativePath;
      normalized.buildStatus = 'pending';
      normalized.buildError = undefined;
    }
    return normalized;
  }

  private resolveProjectFile(relativePath: string, projectRoot: string, allowedExtensions: string[]): string {
    const root = path.resolve(projectRoot);
    const cleanRelative = relativePath.trim();
    if (!cleanRelative || path.isAbsolute(cleanRelative) || path.win32.isAbsolute(cleanRelative)) throw new Error('自定义组件只能引用受管组件目录内的相对路径');
    const resolved = path.resolve(root, ...cleanRelative.replaceAll('\\', '/').split('/'));
    const relative = path.relative(root, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('自定义组件文件超出允许的目录');
    if (!allowedExtensions.includes(path.extname(resolved).toLowerCase())) throw new Error('自定义组件文件扩展名不匹配');
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`自定义组件文件不存在: ${cleanRelative}（检查目录: ${root}）`);
    try {
      const real = fs.realpathSync(resolved);
      const realRelative = path.relative(root, real);
      if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) throw new Error('自定义组件文件通过软链接越出允许的目录');
    } catch (error: any) {
      if (error?.message?.includes('越出允许的目录')) throw error;
    }
    return resolved;
  }

  private normalizeComponentRelativePath(relativePath: string): string {
    const normalized = String(relativePath || '').trim().replaceAll('\\', '/');
    const segments = normalized.split('/');
    if (!normalized || normalized.startsWith('/') || path.win32.isAbsolute(normalized) || segments.some((segment) => !segment || segment === '.' || segment === '..' || /[\0-\x1f<>:"|?*]/.test(segment) || /[ .]$/.test(segment))) {
      throw new Error('自定义组件路径必须是应用组件库内的相对路径，不能包含空段或目录跳转');
    }
    return segments.join('/');
  }

  private resolveComponentPackagePath(packageId: string, relativePath: string, allowAssets = false): { fullPath: string; relativePath: string; packageRelativePath: string } {
    const cleanPackageId = String(packageId || '').trim();
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(cleanPackageId)) throw new Error('组件包 ID 只能包含英文字母、数字、连字符和下划线');
    const cleanRelative = this.normalizeComponentRelativePath(relativePath);
    const ext = path.extname(cleanRelative).toLowerCase();
    const allowedExtensions = allowAssets ? COMPONENT_FILE_EXTENSIONS : COMPONENT_ENTRY_EXTENSIONS;
    if (!allowedExtensions.has(ext)) throw new Error(`组件包暂不支持 ${ext || '无扩展名'} 文件`);
    const root = this.getComponentsRoot();
    const packageRoot = path.resolve(root, cleanPackageId);
    try {
      if (fs.lstatSync(packageRoot).isSymbolicLink()) throw new Error('组件包目录不能是软链接');
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const fullPath = path.resolve(packageRoot, ...cleanRelative.split('/'));
    const packageRelative = path.relative(packageRoot, fullPath);
    if (packageRelative.startsWith('..') || path.isAbsolute(packageRelative)) throw new Error('组件包文件不能超出包目录');
    let cursor = packageRoot;
    for (const segment of cleanRelative.split('/')) {
      cursor = path.join(cursor, segment);
      try { if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('组件包不能通过软链接写入其他目录'); } catch (error: any) { if (error?.code !== 'ENOENT') throw error; }
    }
    return { fullPath, relativePath: `${cleanPackageId}/${cleanRelative}`, packageRelativePath: cleanRelative };
  }

  private normalizePackageArchivePath(filePath: string): string {
    const normalized = String(filePath || '').replaceAll('\\', '/');
    const segments = normalized.split('/');
    if (!normalized || normalized.startsWith('/') || path.win32.isAbsolute(normalized) || segments.some((segment) => !segment || segment === '.' || segment === '..' || /[\0-\x1f<>:"|?*]/.test(segment) || /[ .]$/.test(segment))) {
      throw new Error(`组件包含有不安全路径: ${filePath}`);
    }
    return segments.join('/');
  }

  private addComponentDirectoryToZip(zip: JSZip, sourceDir: string, packageId: string, budget: { fileCount: number; totalBytes: number }): void {
    this.addSourceDirectoryToZip(zip, sourceDir, `components/${packageId}`, budget);
  }

  private addSourceDirectoryToZip(zip: JSZip, sourceDir: string, archiveDirectory: string, budget: { fileCount: number; totalBytes: number }): void {
    const ignored = new Set(['node_modules', '.git', '.DS_Store']);
    const addDirectory = (directory: string) => {
      if (path.relative(sourceDir, directory).split(path.sep).length > 10) throw new Error('组件目录层级超过 10 层');
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || ignored.has(entry.name) || entry.isSymbolicLink()) continue;
        const fullPath = path.join(directory, entry.name);
        const relative = path.relative(sourceDir, fullPath).split(path.sep).join('/');
        if (entry.isDirectory()) addDirectory(fullPath);
        else if (entry.isFile()) {
          const stat = fs.statSync(fullPath);
          if (!COMPONENT_FILE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
          if (stat.size > 5 * 1024 * 1024) throw new Error(`组件包文件超过 5 MB: ${relative}`);
          budget.fileCount++;
          budget.totalBytes += stat.size;
          if (budget.fileCount > 500 || budget.totalBytes > MAX_COMPONENT_PACKAGE_BYTES) throw new Error('组件源码总量超过组件包安全限制');
          zip.file(`${archiveDirectory}/${relative}`, fs.readFileSync(fullPath));
        }
      }
    };
    addDirectory(sourceDir);
  }

  private isZipSymbolicLink(entry: JSZip.JSZipObject): boolean {
    const permissions = entry.unixPermissions;
    if (typeof permissions === 'number') return (permissions & 0o170000) === 0o120000;
    if (typeof permissions === 'string') return (parseInt(permissions, 8) & 0o170000) === 0o120000;
    return false;
  }

  private readZipEntryWithLimit(entry: JSZip.JSZipObject, maxBytes: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const stream = entry.nodeStream('nodebuffer');
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        stream.destroy();
        reject(error);
      };
      stream.on('data', (chunk: Buffer | Uint8Array) => {
        if (settled) return;
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buffer.byteLength;
        if (totalBytes > maxBytes) {
          fail(new Error(`组件包条目解压后超过安全上限 (${maxBytes} bytes)`));
          return;
        }
        chunks.push(buffer);
      });
      stream.once('error', fail);
      stream.once('end', () => {
        if (settled) return;
        settled = true;
        resolve(Buffer.concat(chunks, totalBytes));
      });
    });
  }

  private async renderCustomWidget(page: WorkspacePage, widget: WorkspaceWidget, projectRoot: string | undefined, updatedAt: number, context: WorkspaceExecutionContext): Promise<WorkspaceWidgetResult> {
    let stage: WorkspaceExecutionLogStage = 'load';
    let stageStartedAt = Date.now();
    this.recordComponentLog(page.id, widget.id, stage, 'info', '解析组件入口路径并检查文件', undefined, context);
    try {
      const allowedExtensions = widget.type === 'custom-html' ? ['.html', '.htm'] : ['.tsx', '.ts', '.jsx', '.js'];
      const managedRoot = this.getComponentsRoot();
      let sourcePath: string;
      let sourceRoot = managedRoot;
      try {
        sourcePath = this.resolveProjectFile(widget.relativePath || '', managedRoot, allowedExtensions);
      } catch (managedError) {
        if (!projectRoot) throw managedError;
        sourceRoot = projectRoot;
        sourcePath = this.resolveProjectFile(widget.relativePath || '', projectRoot, allowedExtensions);
      }
      const stat = fs.statSync(sourcePath);
      if (stat.size > MAX_COMPONENT_FILE_BYTES) throw new Error('自定义组件文件超过 2 MB，未加载');
      this.recordComponentLog(page.id, widget.id, stage, 'success', `入口已解析 · ${sourceRoot === managedRoot ? '应用组件库' : '项目兼容目录'} · ${widget.relativePath || path.basename(sourcePath)} · ${stat.size} bytes`, Date.now() - stageStartedAt, context);
      const connectorData = await this.loadCustomWidgetData(page, widget, context);
      const bootstrapData = {
        connector: connectorData?.connector || null,
        query: connectorData?.query || null,
        records: connectorData?.records || [],
        fields: connectorData?.fields || [],
        totalSize: connectorData?.totalSize || 0,
        updatedAt: connectorData?.updatedAt || Date.now(),
      };
      if (widget.type === 'custom-html') {
        stage = 'build';
        stageStartedAt = Date.now();
        this.recordComponentLog(page.id, widget.id, stage, 'info', 'HTML 组件跳过 TS/JS 编译，注入隔离运行桥和初始数据', undefined, context);
        const source = fs.readFileSync(sourcePath, 'utf-8');
        const content = this.injectCustomDataBootstrap(source, bootstrapData);
        this.recordComponentLog(page.id, widget.id, stage, 'success', `HTML 已准备 · 输出 ${Buffer.byteLength(content, 'utf8')} bytes`, Date.now() - stageStartedAt, context);
        stage = 'render';
        stageStartedAt = Date.now();
        this.recordComponentLog(page.id, widget.id, stage, 'info', 'iframe 文档已装配，等待浏览器加载与页面脚本就绪', undefined, context);
        return {
          widgetId: widget.id,
          success: true,
          content,
          sourcePath: widget.relativePath,
          buildStatus: 'ready',
          ...connectorData,
          updatedAt: Date.now(),
        };
      }

      stage = 'build';
      stageStartedAt = Date.now();
      this.recordComponentLog(page.id, widget.id, stage, 'info', `开始 TS/JS 编译 · ${widget.relativePath || path.basename(sourcePath)} · 浏览器目标 es2020`, undefined, context);
      const relativeImport = `./${path.relative(path.resolve(sourceRoot), sourcePath).split(path.sep).join('/')}`;
      const entry = `import React from 'react';
import { createRoot } from 'react-dom/client';
import * as ComponentModule from ${JSON.stringify(relativeImport)};
const value = ComponentModule.default ?? ComponentModule;
const mount = ComponentModule.mount ?? value?.mount;
const root = document.getElementById('root');
const reportError = (error) => window.parent.postMessage({ type: 'neoCRM:runtime-log', message: String(error?.message || error || '组件运行时错误') }, '*');
const reportReady = (message) => window.parent.postMessage({ type: 'neoCRM:runtime-ready', message }, '*');
class ComponentErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { reportError(error); }
  componentDidMount() { reportReady('React 组件树已挂载'); }
  render() { return this.state.failed ? React.createElement('pre', { style: { color: '#b91c1c', whiteSpace: 'pre-wrap' } }, '组件运行失败，请查看执行日志。') : this.props.children; }
}
if (typeof mount === 'function') Promise.resolve(mount(root, { data: window.neoCRMData, crm: window.neoCRM })).then(() => reportReady('mount(root, context) 已完成')).catch(reportError);
else if (typeof value === 'function' || value?.$$typeof) createRoot(root).render(React.createElement(ComponentErrorBoundary, null, React.createElement(value)));
else throw new Error('TS/JS 入口必须导出 default React 组件，或导出 mount(root, context) 函数');`;
      const buildStartedAt = Date.now();
      const styleStartedAt = Date.now();
      this.recordComponentLog(page.id, widget.id, 'dependency', 'info', '解析并打包组件 imports 与本地依赖', undefined, context);
      this.recordComponentLog(page.id, widget.id, 'style', 'info', '扫描组件目录 class 并生成隔离样式', undefined, context);
      const buildOptions: BuildOptions = {
        stdin: { contents: entry, resolveDir: path.resolve(sourceRoot), sourcefile: '__neo_workspace_entry.tsx', loader: 'tsx' },
        bundle: true,
        write: false,
        outfile: path.join(os.tmpdir(), `neo-workspace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.js`),
        nodePaths: this.getRuntimeNodePaths(),
        format: 'iife',
        platform: 'browser',
        target: 'es2020',
        jsx: 'automatic',
        metafile: true,
        define: {
          __filename: JSON.stringify(`/${widget.relativePath || 'component.js'}`),
          __dirname: JSON.stringify(`/${path.posix.dirname((widget.relativePath || 'component.js').replaceAll('\\', '/'))}`),
        },
        logLevel: 'silent',
      };
      const [buildOutcome, styleOutcome] = await Promise.allSettled([
        this.buildCustomWidgetBundle(buildOptions, () => this.recordComponentLog(page.id, widget.id, 'dependency', 'info', 'esbuild 构建服务管道已断开，正在自动重启并重试一次', undefined, context)),
        this.buildCustomWidgetTailwindCss(sourcePath),
      ]);
      if (buildOutcome.status === 'rejected') {
        this.recordComponentLog(page.id, widget.id, 'dependency', 'error', String(buildOutcome.reason?.message || '组件依赖构建失败'), Date.now() - buildStartedAt, context);
      }
      if (styleOutcome.status === 'rejected') {
        this.recordComponentLog(page.id, widget.id, 'style', 'error', String(styleOutcome.reason?.message || '组件样式构建失败'), Date.now() - styleStartedAt, context);
      }
      if (buildOutcome.status === 'rejected' || styleOutcome.status === 'rejected') {
        throw buildOutcome.status === 'rejected' ? buildOutcome.reason : (styleOutcome as PromiseRejectedResult).reason;
      }
      const result = buildOutcome.value;
      const tailwindCss = styleOutcome.value;
      const inputPaths = Object.keys(result.metafile?.inputs || {});
      const dependencyNames = inputPaths.slice(0, 8).map((input) => input.replaceAll('\\', '/').split('/').slice(-3).join('/'));
      this.recordComponentLog(page.id, widget.id, 'dependency', 'success', `依赖打包完成 · ${inputPaths.length} 个输入模块${dependencyNames.length ? ` · ${dependencyNames.join(', ')}${inputPaths.length > dependencyNames.length ? '…' : ''}` : ''}`, Date.now() - buildStartedAt, context);
      this.recordComponentLog(page.id, widget.id, 'style', 'success', `隔离样式已生成 · ${Buffer.byteLength(tailwindCss.css, 'utf8')} bytes${tailwindCss.cached ? ' · 命中缓存' : ' · 本次编译'}`, Date.now() - styleStartedAt, context);
      const jsOutput = result.outputFiles?.find((file) => file.path.toLowerCase().endsWith('.js'));
      const cssOutput = result.outputFiles?.filter((file) => file.path.toLowerCase().endsWith('.css')) || [];
      const js = jsOutput?.text;
      if (!js) throw new Error('组件构建没有生成可预览内容');
      const safeScript = js.replaceAll('</script', '<\\/script');
      const safeTailwindCss = tailwindCss.css.replaceAll('</style', '<\\/style');
      const css = cssOutput.map((file) => file.text).join('\n').replaceAll('</style', '<\\/style');
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'"><style>${safeTailwindCss}</style><style>html,body,#root{margin:0;min-height:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{padding:16px;box-sizing:border-box;color:#0f172a}</style>${css ? `<style>${css}</style>` : ''}</head><body><div id="root"></div>${this.buildCustomDataScript(bootstrapData)}<script>${safeScript}</script></body></html>`;
      this.recordComponentLog(page.id, widget.id, stage, 'success', `组件构建完成 · JS ${Buffer.byteLength(js, 'utf8')} bytes · CSS ${Buffer.byteLength(css, 'utf8')} bytes · iframe HTML ${Buffer.byteLength(html, 'utf8')} bytes`, Date.now() - stageStartedAt, context);
      stage = 'render';
      stageStartedAt = Date.now();
      this.recordComponentLog(page.id, widget.id, stage, 'info', 'iframe 文档已装配，等待浏览器加载与 React/mount 挂载', undefined, context);
      return { widgetId: widget.id, success: true, content: html, sourcePath: widget.relativePath, buildStatus: 'ready', ...connectorData, updatedAt: Date.now() };
    } catch (error: any) {
      const message = String(error?.message || '自定义组件构建失败');
      this.recordComponentLog(page.id, widget.id, stage, 'error', message, Date.now() - stageStartedAt, context);
      return { widgetId: widget.id, success: false, sourcePath: widget.relativePath, buildStatus: 'error', error: message, updatedAt };
    }
  }

  private buildCustomWidgetBundle(options: BuildOptions, onRestart?: () => void): Promise<BuildResult> {
    const task = this.componentBuildQueue.then(async () => {
      try {
        return await build(options);
      } catch (error: any) {
        const message = String(error?.message || error || '');
        if (!/The service (?:is no longer running|was stopped)|write EPIPE|\bEPIPE\b/i.test(message)) throw error;

        onRestart?.();
        try {
          await stop();
          return await build(options);
        } catch (retryError: any) {
          const retryMessage = String(retryError?.message || retryError || '未知错误');
          throw new Error(`组件构建服务异常退出，已自动重启并重试但仍失败。请重启 NeoCRM 后重试；若问题持续，请导出软件日志。原始错误：${retryMessage}`);
        }
      }
    });
    this.componentBuildQueue = task.then(() => undefined, () => undefined);
    return task;
  }

  private async buildCustomWidgetTailwindCss(sourcePath: string): Promise<{ css: string; cached: boolean }> {
    const sourceStat = fs.statSync(sourcePath);
    const signature = `${sourceStat.mtimeMs}:${sourceStat.size}`;
    const cached = this.tailwindCssCache.get(sourcePath);
    if (cached?.signature === signature) return { css: cached.css, cached: true };

    const sourceRoot = path.dirname(sourcePath);
    const tailwindCssPath = runtimeRequire.resolve('tailwindcss/index.css').replaceAll('\\', '/');
    const stylesheet = `@import ${JSON.stringify(tailwindCssPath)};\n@source ${JSON.stringify(`./${path.basename(sourcePath)}`)};`;
    const result = await postcss([tailwindcss({ base: sourceRoot, optimize: false })]).process(stylesheet, {
      from: path.join(sourceRoot, '__neo_workspace_runtime__.css'),
    });
    this.tailwindCssCache.set(sourcePath, { signature, css: result.css });
    if (this.tailwindCssCache.size > 100) {
      const oldestKey = this.tailwindCssCache.keys().next().value;
      if (oldestKey) this.tailwindCssCache.delete(oldestKey);
    }
    return { css: result.css, cached: false };
  }

  private serializeCustomData(data: Record<string, unknown>): string {
    return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (char) => ({ '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029' })[char] || char);
  }

  private buildCustomDataScript(data: Record<string, unknown>): string {
    return `<script>
      window.neoCRMData=${this.serializeCustomData(data)};
      (function () {
        function reportRuntimeError(error) {
          var message = String(error && (error.message || error.reason || error) || '').slice(0, 1200);
          if (message) window.parent.postMessage({ type: 'neoCRM:runtime-log', message: message }, '*');
        }
        function reportRuntimeReady() {
          window.parent.postMessage({ type: 'neoCRM:runtime-ready', message: 'HTML 文档与数据桥已就绪' }, '*');
        }
        window.addEventListener('error', function (event) { reportRuntimeError(event.error || event.message); });
        window.addEventListener('unhandledrejection', function (event) { reportRuntimeError(event.reason); });
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', reportRuntimeReady, { once: true });
        else reportRuntimeReady();
        var pending = new Map();
        var sequence = 0;
        window.addEventListener('message', function (event) {
          if (event.source !== window.parent || event.data?.type !== 'neoCRM:query:result') return;
          var item = pending.get(event.data.requestId);
          if (!item) return;
          clearTimeout(item.timer);
          pending.delete(event.data.requestId);
          event.data.error ? item.reject(new Error(event.data.error)) : item.resolve(event.data.result);
        });
        window.neoCRM = Object.freeze({
          query: function (query) {
            if (!window.neoCRMData.connector) return Promise.reject(new Error('此组件未绑定 CRM 连接器'));
            if (typeof query !== 'string' || query.length > 20000) return Promise.reject(new Error('查询内容无效或超过长度限制'));
            var requestId = Date.now() + '-' + (++sequence);
            return new Promise(function (resolve, reject) {
              var timer = setTimeout(function () {
                pending.delete(requestId);
                reject(new Error('CRM 查询超时'));
              }, 30000);
              pending.set(requestId, { resolve: resolve, reject: reject, timer: timer });
              window.parent.postMessage({ type: 'neoCRM:query', requestId: requestId, query: query }, '*');
            });
          }
        });
      })();
    </script>`;
  }

  private injectCustomDataBootstrap(html: string, data: Record<string, unknown>): string {
    const injected = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'">${this.buildCustomDataScript(data)}`;
    if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, (head) => `${head}${injected}`);
    if (/<html\b[^>]*>/i.test(html)) return html.replace(/<html\b[^>]*>/i, (tag) => `${tag}<head>${injected}</head>`);
    return `<!doctype html><html><head>${injected}</head><body>${html.replace(/<!doctype[^>]*>/i, '')}</body></html>`;
  }

  private async loadCustomWidgetData(page: WorkspacePage, widget: WorkspaceWidget, context: WorkspaceExecutionContext): Promise<Pick<WorkspaceWidgetResult, 'records' | 'fields' | 'totalSize' | 'connector' | 'query' | 'updatedAt'> | undefined> {
    let validated: { accountId: string; query?: string } | undefined;
    try {
      validated = this.validateCustomWidgetQuery(widget);
    } catch (error: any) {
      this.recordComponentLog(page.id, widget.id, 'query', 'error', `初始 CRM 查询配置校验失败 · ${String(error?.message || '查询配置无效')}`, undefined, context);
      throw error;
    }
    if (!validated) {
      this.recordComponentLog(page.id, widget.id, 'query', 'info', '初始 CRM 查询已跳过 · 未绑定连接器且未配置查询', undefined, context);
      return undefined;
    }
    const account = this.getDataSources().crmAccounts.find((item) => item.accountId === validated.accountId);
    if (!account) {
      this.recordComponentLog(page.id, widget.id, 'query', 'error', '初始 CRM 查询无法执行 · 绑定的连接器账号不存在或已移除', undefined, context);
      throw new Error('自定义组件绑定的 CRM 账号不存在或已移除');
    }
    if (!validated.query) {
      this.recordComponentLog(page.id, widget.id, 'query', 'info', `初始 CRM 查询已跳过 · 已绑定 ${account.connectorName}，但未配置查询语句`, undefined, context);
      return {
        records: [],
        fields: [],
        totalSize: 0,
        connector: { accountId: account.accountId, connectorName: account.connectorName, productType: account.productType },
        updatedAt: Date.now(),
      };
    }
    const startedAt = Date.now();
    const ordinal = this.nextQueryOrdinal(context.executionId);
    this.recordComponentLog(page.id, widget.id, 'query', 'info', `初始 CRM 查询 #${ordinal} 已发起 · ${account.connectorName} (${account.productType}) · ${this.summarizeReadQuery(validated.query)}`, undefined, context);
    try {
      const { environment, tokenData } = this.getAccountSession(validated.accountId);
      this.recordComponentLog(page.id, widget.id, 'query', 'success', `连接器授权会话可用 · ${account.connectorName}`, undefined, context);
      const result = await this.dataService.executeQueryAll(environment, tokenData, validated.query);
      if (!result.success || !result.data) throw new Error(result.error || '自定义组件连接器查询失败');
      this.recordComponentLog(page.id, widget.id, 'query', 'success', `初始 CRM 查询 #${ordinal} 完成 · 返回 ${result.data.records.length} 行 / 共 ${result.data.totalSize} 行 · ${result.data.fields.length} 个字段`, Date.now() - startedAt, context);
      return {
        records: result.data.records,
        fields: result.data.fields,
        totalSize: result.data.totalSize,
        connector: { accountId: account.accountId, connectorName: account.connectorName, productType: account.productType },
        query: validated.query,
        updatedAt: Date.now(),
      };
    } catch (error: any) {
      this.recordComponentLog(page.id, widget.id, 'query', 'error', `初始 CRM 查询 #${ordinal} 失败 · ${String(error?.message || '自定义组件连接器查询失败')}`, Date.now() - startedAt, context);
      throw error;
    }
  }

  private validateCustomWidgetQuery(widget: WorkspaceWidget): { accountId: string; query?: string } | undefined {
    const accountId = String(widget.accountId || '').trim();
    const query = String(widget.query || '').trim().replace(/;\s*$/, '');
    if (!accountId && !query) return undefined;
    if (!accountId) throw new Error(`组件“${widget.title}”配置只读查询前必须先绑定 CRM 连接器账号`);
    if (!this.getDataSources().crmAccounts.some((item) => item.accountId === accountId)) throw new Error(`组件“${widget.title}”绑定的 CRM 账号无效`);
    if (!query) return { accountId };
    if (query.length > 20_000) throw new Error(`组件“${widget.title}”查询超过 20,000 个字符`);
    if (!/^SELECT\b/i.test(query) || query.includes(';') || /\b(INSERT|UPDATE|DELETE|UPSERT|MERGE|DROP|ALTER|CREATE|TRUNCATE|EXEC|CALL)\b/i.test(query)) {
      throw new Error(`组件“${widget.title}”只允许单条只读 SELECT 查询`);
    }
    return { accountId, query };
  }

  private getRuntimeNodePaths(): string[] {
    const paths = [path.resolve(process.cwd(), 'node_modules')];
    try {
      const reactEntry = runtimeRequire.resolve('react');
      paths.push(path.dirname(path.dirname(reactEntry)));
    } catch {
      // 运行时依赖缺失时交给 esbuild 返回明确的构建错误。
    }
    return Array.from(new Set(paths));
  }

  private validateCrmQuery(widget: WorkspaceWidget): { query: string; accountId: string } {
    const query = String(widget.query || '').trim().replace(/;\s*$/, '');
    if (!widget.accountId) throw new Error(`组件“${widget.title}”需要绑定 CRM 账号`);
    if (!/^SELECT\b/i.test(query)) throw new Error(`组件“${widget.title}”只允许 SELECT 查询`);
    if (query.includes(';') || /\b(INSERT|UPDATE|DELETE|UPSERT|MERGE|DROP|ALTER|CREATE|TRUNCATE|EXEC|CALL)\b/i.test(query)) {
      throw new Error('看板查询仅允许单条只读 SELECT 语句');
    }
    return { query, accountId: widget.accountId };
  }

  private clampLimit(value: number | undefined, fallback: number, max: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(max, Math.floor(parsed))) : fallback;
  }
}
