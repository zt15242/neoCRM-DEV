import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { AccountRecord, CrmProductType } from '../types';
import type { EmailAccount } from '../../shared/mailTypes';
import type { WorkspaceDataSources, WorkspacePage, WorkspaceWidget, WorkspaceWidgetResult } from '../../shared/workspaceTypes';
import { DataService } from './dataService';
import { EmailService } from './emailService';
import { SessionStore } from './sessionStore';
import { MetadataService } from './metadataService';
import type { NeoEnvironment, TokenData } from '../types';

const MAX_QUERY_ROWS = 500;

export class WorkspaceService {
  constructor(
    private sessionStore: SessionStore,
    private dataService: DataService,
    private emailService: EmailService,
    private metadataService: MetadataService,
  ) {}

  private getFilePath(): string {
    const userData = app?.getPath ? app.getPath('userData') : process.cwd();
    return path.join(userData, 'neocrm_workspace_pages.json');
  }

  public listPages(): WorkspacePage[] {
    try {
      const raw = fs.readFileSync(this.getFilePath(), 'utf-8');
      const pages = JSON.parse(raw);
      return Array.isArray(pages) ? pages : [];
    } catch {
      return [];
    }
  }

  public savePage(input: WorkspacePage): WorkspacePage[] {
    if (!input || !input.id || !input.name?.trim()) throw new Error('页面名称不能为空');
    if (!Array.isArray(input.widgets) || input.widgets.length > 40) throw new Error('页面组件数量无效');
    const now = Date.now();
    const pages = this.listPages();
    const previous = pages.find((page) => page.id === input.id);
    const page: WorkspacePage = {
      ...input,
      name: input.name.trim().slice(0, 80),
      description: input.description?.slice(0, 500),
      widgets: input.widgets.map((widget) => this.validateWidgetConfig(widget)),
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

  public async runPage(pageId: string): Promise<WorkspaceWidgetResult[]> {
    const page = this.listPages().find((item) => item.id === pageId);
    if (!page) throw new Error('找不到该自定义页面');
    return Promise.all(page.widgets.filter((widget) => widget.type !== 'text').map((widget) => this.runWidget(widget)));
  }

  public async runWidgetById(pageId: string, widgetId: string): Promise<WorkspaceWidgetResult> {
    const page = this.listPages().find((item) => item.id === pageId);
    const widget = page?.widgets.find((item) => item.id === widgetId);
    if (!widget) throw new Error('找不到该工作台组件');
    return this.runWidget(widget);
  }

  private async runWidget(widget: WorkspaceWidget): Promise<WorkspaceWidgetResult> {
    const updatedAt = Date.now();
    try {
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

  private validateWidgetConfig(widget: WorkspaceWidget): WorkspaceWidget {
    if (!widget?.id || !['text', 'crm-query', 'mail-list', 'async-apex-dashboard'].includes(widget.type)) throw new Error('页面中包含无效组件');
    const normalized = { ...widget, title: String(widget.title || '').trim().slice(0, 120) || '未命名组件' };
    if (normalized.subscription) {
      const intervalMinutes = Number(normalized.subscription.intervalMinutes);
      normalized.subscription = {
        enabled: !!normalized.subscription.enabled && normalized.type !== 'text',
        intervalMinutes: Number.isFinite(intervalMinutes) ? Math.max(15, Math.min(10080, Math.floor(intervalMinutes))) : 60,
        feishuEnabled: !!normalized.subscription.feishuEnabled && normalized.type !== 'text',
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
    return normalized;
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
