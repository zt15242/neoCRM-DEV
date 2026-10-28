import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { app } from 'electron';
import { build } from 'esbuild';
import type { AccountRecord, CrmProductType } from '../types';
import type { EmailAccount } from '../../shared/mailTypes';
import type { WorkspaceDataSources, WorkspacePage, WorkspaceWidget, WorkspaceWidgetResult, WorkspaceWidgetType } from '../../shared/workspaceTypes';
import { DataService } from './dataService';
import { EmailService } from './emailService';
import { SessionStore } from './sessionStore';
import { MetadataService } from './metadataService';
import { ProjectService } from './projectService';
import type { NeoEnvironment, TokenData } from '../types';

const MAX_QUERY_ROWS = 500;
const runtimeRequire = createRequire(import.meta.url);

export class WorkspaceService {
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
    const resolvedProjectRoot = projectRoot || this.getProjectRoot(input.projectId);
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
    if (account.productType !== 'salesforce') throw new Error('AsyncApexJob 看板仅支持 Salesforce 连接器');
    let query = String(rawQuery || '').trim().replace(/;\s*$/, '');
    if (!/^SELECT\b/i.test(query) || query.includes(';') || /\b(INSERT|UPDATE|DELETE|UPSERT|MERGE|DROP|ALTER|CREATE|TRUNCATE|EXEC|CALL)\b/i.test(query)) {
      throw new Error('只允许单条 Salesforce SOQL SELECT 查询');
    }
    const limit = query.match(/\bLIMIT\s+(\d+)/i);
    if (!limit) query += ' LIMIT 500';
    else if (Number(limit[1]) < 1 || Number(limit[1]) > MAX_QUERY_ROWS) query = query.replace(/\bLIMIT\s+\d+/i, 'LIMIT 500');
    const { environment, tokenData } = this.getAccountSession(accountId);
    const result = await this.dataService.executeQuery(environment, tokenData, query);
    if (!result.success || !result.data) throw new Error(result.error || 'Salesforce 查询失败');
    return {
      success: true,
      data: {
        records: result.data.records.slice(0, MAX_QUERY_ROWS),
        totalSize: result.data.totalSize,
        fields: result.data.fields,
      },
    };
  }

  public async runPage(pageId: string, projectRoot?: string): Promise<WorkspaceWidgetResult[]> {
    const page = this.listPages().find((item) => item.id === pageId);
    if (!page) throw new Error('找不到该自定义页面');
    const root = projectRoot || this.getProjectRoot(page.projectId);
    return Promise.all(page.widgets.filter((widget) => widget.type !== 'text').map((widget) => this.runWidget(widget, root)));
  }

  public async runWidgetById(pageId: string, widgetId: string, projectRoot?: string): Promise<WorkspaceWidgetResult> {
    const page = this.listPages().find((item) => item.id === pageId);
    const widget = page?.widgets.find((item) => item.id === widgetId);
    if (!widget) throw new Error('找不到该工作台组件');
    return this.runWidget(widget, projectRoot || this.getProjectRoot(page?.projectId));
  }

  public async previewWidget(pageId: string, widgetId: string, projectRoot?: string): Promise<WorkspaceWidgetResult> {
    return this.runWidgetById(pageId, widgetId, projectRoot);
  }

  private async runWidget(widget: WorkspaceWidget, projectRoot?: string): Promise<WorkspaceWidgetResult> {
    const updatedAt = Date.now();
    try {
      if (widget.type === 'custom-html' || widget.type === 'custom-tsx') {
        return await this.renderCustomWidget(widget, projectRoot, updatedAt);
      }
      if (widget.type === 'mail-list') {
        const records = this.emailService.getDashboardMailData(widget.accountId, this.clampLimit(widget.limit, 10, 50));
        return { widgetId: widget.id, success: true, records, fields: ['from', 'subject', 'date', 'snippet', 'isRead'], totalSize: records.length, updatedAt };
      }
      if (widget.type === 'async-apex-dashboard') {
        const query = widget.query || 'SELECT ApexClassId, ApexClass.Name, CompletedDate, CreatedBy.Name, CreatedDate, CronTriggerId, ExtendedStatus, Id, JobItemsProcessed, JobType, MethodName, NumberOfErrors, ParentJobId, Status, TotalJobItems FROM AsyncApexJob WHERE CreatedDate = YESTERDAY ORDER BY CreatedDate DESC LIMIT 500';
        const result = await this.queryConnector(widget.accountId || '', query);
        return { widgetId: widget.id, success: true, records: result.data?.records || [], fields: result.data?.fields || [], totalSize: result.data?.totalSize || 0, updatedAt: Date.now() };
      }
      if (widget.type !== 'crm-query') throw new Error('不支持的组件类型');
      const { query, accountId } = this.validateCrmQuery(widget);
      const account = this.getDataSources().crmAccounts.find((item) => item.accountId === accountId);
      if (!account) throw new Error('此组件绑定的 CRM 账号不存在或已移除');
      const { tokenData, environment } = this.getAccountSession(accountId);
      const result = await this.dataService.executeQuery(environment, tokenData, query);
      if (!result.success || !result.data) throw new Error(result.error || 'CRM 查询失败');
      return {
        widgetId: widget.id,
        success: true,
        records: result.data.records.slice(0, MAX_QUERY_ROWS),
        fields: result.data.fields,
        totalSize: result.data.totalSize,
        updatedAt: Date.now(),
      };
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

  private validateWidgetConfig(widget: WorkspaceWidget, projectRoot?: string): WorkspaceWidget {
    const supportedTypes: WorkspaceWidgetType[] = ['text', 'crm-query', 'mail-list', 'async-apex-dashboard', 'custom-html', 'custom-tsx'];
    if (!widget?.id || !supportedTypes.includes(widget.type)) throw new Error('页面中包含无效组件');
    const normalized = { ...widget, title: String(widget.title || '').trim().slice(0, 120) || '未命名组件' };
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
      const relativePath = String(normalized.relativePath || '').trim();
      if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes('\\') && path.sep !== '\\') {
        throw new Error(`组件“${normalized.title}”必须引用当前项目内的相对路径文件`);
      }
      const expectedExtension = normalized.type === 'custom-html' ? ['.html', '.htm'] : ['.tsx'];
      if (!expectedExtension.includes(path.extname(relativePath).toLowerCase())) {
        throw new Error(`组件“${normalized.title}”的文件类型必须是 ${expectedExtension.join(' 或 ')}`);
      }
      if (projectRoot) this.resolveProjectFile(relativePath, projectRoot, expectedExtension);
      normalized.relativePath = relativePath;
      normalized.buildStatus = 'pending';
      normalized.buildError = undefined;
    }
    return normalized;
  }

  private resolveProjectFile(relativePath: string, projectRoot: string, allowedExtensions: string[]): string {
    const root = path.resolve(projectRoot);
    const cleanRelative = relativePath.trim();
    if (!cleanRelative || path.isAbsolute(cleanRelative)) throw new Error('自定义组件只能引用当前项目内的相对路径');
    const resolved = path.resolve(root, cleanRelative);
    const relative = path.relative(root, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('自定义组件文件超出当前项目目录');
    if (!allowedExtensions.includes(path.extname(resolved).toLowerCase())) throw new Error('自定义组件文件扩展名不匹配');
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`自定义组件文件不存在: ${cleanRelative}`);
    try {
      const real = fs.realpathSync(resolved);
      const realRelative = path.relative(root, real);
      if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) throw new Error('自定义组件文件通过软链接越出当前项目目录');
    } catch (error: any) {
      if (error?.message?.includes('越出当前项目')) throw error;
    }
    return resolved;
  }

  private async renderCustomWidget(widget: WorkspaceWidget, projectRoot: string | undefined, updatedAt: number): Promise<WorkspaceWidgetResult> {
    if (!projectRoot) return { widgetId: widget.id, success: false, buildStatus: 'error', error: '自定义组件没有绑定当前项目目录', updatedAt };
    try {
      const allowedExtensions = widget.type === 'custom-html' ? ['.html', '.htm'] : ['.tsx'];
      const sourcePath = this.resolveProjectFile(widget.relativePath || '', projectRoot, allowedExtensions);
      const stat = fs.statSync(sourcePath);
      if (stat.size > 2 * 1024 * 1024) throw new Error('自定义组件文件超过 2MB，未加载');
      if (widget.type === 'custom-html') {
        return {
          widgetId: widget.id,
          success: true,
          content: fs.readFileSync(sourcePath, 'utf-8'),
          sourcePath: widget.relativePath,
          buildStatus: 'ready',
          updatedAt: Date.now(),
        };
      }

      const relativeImport = `./${path.relative(path.resolve(projectRoot), sourcePath).split(path.sep).join('/')}`;
      const entry = `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport Component from ${JSON.stringify(relativeImport)};\nconst value = Component && Component.default ? Component.default : Component;\nif (typeof value !== 'function') throw new Error('TSX 文件必须提供 default React 组件');\ncreateRoot(document.getElementById('root')).render(React.createElement(value));`;
      const result = await build({
        stdin: { contents: entry, resolveDir: path.resolve(projectRoot), sourcefile: '__neo_workspace_entry.tsx', loader: 'tsx' },
        bundle: true,
        write: false,
        outfile: path.join(os.tmpdir(), `neo-workspace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.js`),
        nodePaths: this.getRuntimeNodePaths(),
        format: 'iife',
        platform: 'browser',
        target: 'es2020',
        jsx: 'automatic',
        logLevel: 'silent',
      });
      const jsOutput = result.outputFiles?.find((file) => file.path.toLowerCase().endsWith('.js'));
      const cssOutput = result.outputFiles?.filter((file) => file.path.toLowerCase().endsWith('.css')) || [];
      const js = jsOutput?.text;
      if (!js) throw new Error('TSX 构建没有生成可预览内容');
      const safeScript = js.replaceAll('</script', '<\\/script');
      const css = cssOutput.map((file) => file.text).join('\n').replaceAll('</style', '<\\/style');
      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#root{margin:0;min-height:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{padding:16px;box-sizing:border-box;color:#0f172a}</style>${css ? `<style>${css}</style>` : ''}</head><body><div id="root"></div><script>${safeScript}</script></body></html>`;
      return { widgetId: widget.id, success: true, content: html, sourcePath: widget.relativePath, buildStatus: 'ready', updatedAt: Date.now() };
    } catch (error: any) {
      return { widgetId: widget.id, success: false, sourcePath: widget.relativePath, buildStatus: 'error', error: error?.message || '自定义组件构建失败', updatedAt };
    }
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
    const limit = query.match(/\bLIMIT\s+(\d+)/i);
    if (!limit) throw new Error('查询必须显式包含 LIMIT，最多允许返回 500 行');
    if (Number(limit[1]) < 1 || Number(limit[1]) > MAX_QUERY_ROWS) throw new Error('LIMIT 必须在 1 到 500 之间');
    return { query, accountId: widget.accountId };
  }

  private clampLimit(value: number | undefined, fallback: number, max: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(max, Math.floor(parsed))) : fallback;
  }
}
