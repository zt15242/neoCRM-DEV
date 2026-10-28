import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { app, safeStorage } from 'electron';
import type { FeishuWorkspaceSettings } from '../../shared/feishuTypes';
import type { WorkspacePage, WorkspaceWidget, WorkspaceWidgetResult } from '../../shared/workspaceTypes';
import { WorkspaceService } from './workspaceService';

interface StoredConfig {
  bots?: Array<{ id: string; name: string; encryptedWebhook: string }>;
  encryptedWebhook?: string;
  widgetRuns?: Record<string, { lastRunAt: number; lastStatus: 'success' | 'error'; lastError?: string }>;
}

export class FeishuService {
  private readonly runningWidgets = new Set<string>();

  constructor(private workspaceService: WorkspaceService) {}

  private getPath() {
    return path.join(app?.getPath ? app.getPath('userData') : process.cwd(), 'neocrm_feishu_workspace.json');
  }

  private read(): StoredConfig {
    try { return JSON.parse(fs.readFileSync(this.getPath(), 'utf-8')); } catch { return {}; }
  }

  private getBots(config: StoredConfig): Array<{ id: string; name: string; encryptedWebhook: string }> {
    if (config.bots?.length) return config.bots;
    return config.encryptedWebhook ? [{ id: 'legacy', name: '飞书机器人', encryptedWebhook: config.encryptedWebhook }] : [];
  }

  private write(config: StoredConfig) {
    fs.writeFileSync(this.getPath(), JSON.stringify(config, null, 2), 'utf-8');
  }

  private decrypt(config: StoredConfig): string {
    if (!config.encryptedWebhook) return '';
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储不可用，未能读取飞书 Webhook');
    return safeStorage.decryptString(Buffer.from(config.encryptedWebhook, 'base64'));
  }

  public getSettings(): FeishuWorkspaceSettings {
    const bots = this.getBots(this.read()).map(({ id, name }) => ({ id, name }));
    return { configured: bots.length > 0, bots };
  }

  public addBot(input: { name?: string; webhookUrl?: string }): FeishuWorkspaceSettings {
    const existing = this.read();
    const url = String(input.webhookUrl || '').trim();
    const name = String(input.name || '').trim().slice(0, 60);
    if (!name) throw new Error('请填写机器人名称');
    if (!url) throw new Error('请填写机器人 Webhook');
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !/(^|\.)((feishu|larksuite)\.cn)$|(^|\.)larksuite\.com$/i.test(parsed.hostname)) {
      throw new Error('请输入有效的飞书或 Lark HTTPS 自定义机器人 Webhook');
    }
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储不可用，不能安全保存 Webhook');
    const bots = this.getBots(existing);
    if (bots.some((bot) => bot.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('机器人名称已存在');
    bots.push({ id: randomUUID(), name, encryptedWebhook: safeStorage.encryptString(url).toString('base64') });
    this.write({ ...existing, bots, encryptedWebhook: undefined });
    return this.getSettings();
  }

  public removeBot(botId: string): FeishuWorkspaceSettings {
    const config = this.read();
    const bots = this.getBots(config);
    if (!bots.some((bot) => bot.id === botId)) throw new Error('找不到指定的飞书机器人');
    const isReferenced = this.workspaceService.listPages().some((page) => page.widgets.some((widget) => {
      if (!widget.subscription?.feishuEnabled) return false;
      const targetId = widget.subscription.feishuBotId || (bots.some((bot) => bot.id === 'legacy') ? 'legacy' : bots.length === 1 ? bots[0].id : '');
      return targetId === botId;
    }));
    if (isReferenced) throw new Error('此机器人仍被工作台订阅使用，请先修改对应组件的推送目标');
    this.write({ ...config, bots: bots.filter((bot) => bot.id !== botId), encryptedWebhook: undefined });
    return this.getSettings();
  }

  public async testMessage(botId: string): Promise<{ success: boolean; message: string }> {
    const bot = this.getBots(this.read()).find((item) => item.id === botId);
    if (!bot) throw new Error('请先配置并选择飞书机器人');
    const webhook = this.decrypt({ encryptedWebhook: bot.encryptedWebhook });
    await this.postCard(webhook, this.buildTestCard());
    return { success: true, message: `测试消息已发送到「${bot.name}」` };
  }

  public async runScheduler(): Promise<void> {
    const pages = this.workspaceService.listPages();
    const due: Array<{ page: WorkspacePage; widget: WorkspaceWidget }> = [];
    const config = this.read();
    const now = Date.now();

    for (const page of pages) {
      for (const widget of page.widgets) {
        const subscription = widget.subscription;
        if (!subscription?.enabled || widget.type === 'text' || this.runningWidgets.has(widget.id)) continue;
        const previous = config.widgetRuns?.[widget.id]?.lastRunAt || 0;
        const intervalMs = Math.max(15, Number(subscription.intervalMinutes) || 60) * 60_000;
        if (now - previous >= intervalMs) due.push({ page, widget });
      }
    }

    for (const { page, widget } of due) {
      this.runningWidgets.add(widget.id);
      try {
        const latest = this.read();
        latest.widgetRuns ||= {};
        latest.widgetRuns[widget.id] = { lastRunAt: Date.now(), lastStatus: 'success' };
        this.write(latest);
        let result: WorkspaceWidgetResult | undefined;
        let runError: unknown;
        try {
          result = await this.workspaceService.runWidgetById(page.id, widget.id);
          if (!result.success) runError = new Error(result.error || '组件运行失败');
        } catch (error) {
          runError = error;
        }
        try {
          if (widget.subscription?.feishuEnabled) {
            const bots = this.getBots(this.read());
            const botId = widget.subscription.feishuBotId || (bots.some((item) => item.id === 'legacy') ? 'legacy' : bots.length === 1 ? bots[0].id : '');
            const bot = bots.find((item) => item.id === botId);
            if (!bot) throw new Error('此组件未选择有效的飞书机器人');
            const webhook = this.decrypt({ encryptedWebhook: bot.encryptedWebhook });
            await this.postCard(webhook, this.buildDashboardCard(page, widget, result, !runError));
          }
        } catch (error) {
          runError ||= error;
        }
        const finished = this.read();
        finished.widgetRuns ||= {};
        finished.widgetRuns[widget.id] = {
          lastRunAt: finished.widgetRuns[widget.id]?.lastRunAt || Date.now(),
          lastStatus: runError ? 'error' : 'success',
          lastError: runError ? '组件执行或飞书推送失败，请在应用内检查连接状态。' : undefined,
        };
        this.write(finished);
      } finally {
        this.runningWidgets.delete(widget.id);
      }
    }
  }

  private buildDashboardCard(page: WorkspacePage, widget: WorkspaceWidget, result: WorkspaceWidgetResult | undefined, success: boolean) {
    const records = result?.records || [];
    const matchedCount = result?.totalSize ?? records.length;
    const updatedAt = result?.updatedAt || Date.now();
    const source = this.workspaceService.getDataSources();
    const crmSource = source.crmAccounts.find((item) => item.accountId === widget.accountId);
    const mailSource = source.mailAccounts.find((item) => item.accountId === widget.accountId);
    const sourceLabel = crmSource?.connectorName || mailSource?.name || (widget.type === 'mail-list' ? '邮箱' : '数据组件');
    const elements: Array<Record<string, unknown>> = [
      { tag: 'markdown', content: `**${this.cardText(page.name, 80)}**　${this.cardText(widget.title, 80)}\n${success ? '运行成功' : '运行失败，请在 NeoCRM 工作台检查组件'}` },
      {
        tag: 'column_set',
        flex_mode: 'stretch',
        background_style: 'grey',
        columns: [
          this.metricColumn('匹配记录', success ? matchedCount.toLocaleString() : '—'),
          this.metricColumn('数据来源', sourceLabel),
          this.metricColumn('组件类型', this.widgetTypeName(widget.type)),
        ],
      },
      { tag: 'markdown', content: `更新时间：${new Date(updatedAt).toLocaleString()}` },
    ];

    const chart = success && widget.type !== 'mail-list' ? this.buildChart(records, result?.fields || []) : undefined;
    if (chart) elements.push({ tag: 'chart', aspect_ratio: '16:9', color_theme: 'brand', chart_spec: chart });

    if (success && widget.feishuIncludeRecords && records.length && widget.type !== 'mail-list') {
      const table = this.buildPreviewTable(records, result?.fields || []);
      if (table) {
        elements.push({ tag: 'markdown', content: '**数据预览 · 最多 6 行**' }, table);
      }
    }

    if (success && !chart && widget.type === 'mail-list') {
      elements.push({ tag: 'markdown', content: `邮件组件已刷新 **${records.length}** 封邮件。为保护隐私，卡片不展示发件人、主题或正文。` });
    } else if (success && !chart && !records.length) {
      elements.push({ tag: 'markdown', content: '当前查询没有匹配记录。' });
    }

    elements.push({ tag: 'hr' }, { tag: 'markdown', content: '由 NeoCRM 自定义工作台自动生成' });

    return {
      msg_type: 'interactive',
      card: {
        schema: '2.0',
        config: { update_multi: true },
        header: {
          title: { tag: 'plain_text', content: this.cardText(widget.title, 80) },
          subtitle: { tag: 'plain_text', content: this.cardText(page.name, 80) },
          template: success ? 'blue' : 'red',
          padding: '12px 12px 12px 12px',
        },
        body: { direction: 'vertical', padding: '12px 12px 12px 12px', elements },
      },
    };
  }

  private metricColumn(label: string, value: string): Record<string, unknown> {
    return {
      tag: 'column', width: 'weighted', weight: 1, vertical_align: 'top',
      elements: [{ tag: 'markdown', content: `**${label}**\n${this.cardText(value, 48)}` }],
    };
  }

  private widgetTypeName(type: WorkspaceWidget['type']): string {
    return ({ 'crm-query': 'CRM 查询', 'mail-list': '邮件列表', 'async-apex-dashboard': 'BI 看板', 'custom-html': '自定义 HTML', 'custom-tsx': '自定义 TSX', text: '文本' })[type];
  }

  private buildChart(records: Array<Record<string, unknown>>, fields: string[]): Record<string, unknown> | undefined {
    if (records.length < 2 || fields.length === 0) return undefined;
    const get = (record: Record<string, unknown>, field: string) => this.fieldValue(record, field);
    const statusField = fields.find((field) => /status|state|type/i.test(field));
    if (statusField) {
      const counts = new Map<string, number>();
      for (const record of records) {
        const value = this.cellText(get(record, statusField));
        if (value) counts.set(value.slice(0, 40), (counts.get(value) || 0) + 1);
      }
      if (counts.size >= 2 && counts.size <= 12) {
        return this.barChart([...counts.entries()].map(([category, value]) => ({ category, value })), statusField);
      }
    }

    const toNumber = (value: unknown): number | undefined => {
      if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'object') return undefined;
      if (typeof value === 'string' && !value.trim()) return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };
    const numericField = fields
      .filter((field) => !/(^|[._])id$|date|time/i.test(field))
      .map((field) => ({ field, values: records.map((record) => toNumber(get(record, field))) }))
      .filter(({ values }) => values.filter((value) => value !== undefined).length >= 2)
      .sort((a, b) => this.metricPriority(b.field) - this.metricPriority(a.field))[0];
    if (!numericField) return undefined;

    const categoryField = fields.find((field) => field !== numericField.field && !/(^|[._])id$|date|time/i.test(field));
    const points = records.slice(0, 10).map((record, index) => ({
      category: categoryField ? this.cellText(get(record, categoryField)).slice(0, 32) || `记录 ${index + 1}` : `记录 ${index + 1}`,
      value: toNumber(get(record, numericField.field)),
    })).filter((point): point is { category: string; value: number } => point.value !== undefined);
    return points.length >= 2 ? this.barChart(points, numericField.field) : undefined;
  }

  private barChart(points: Array<{ category: string; value: number }>, seriesName: string): Record<string, unknown> {
    return {
      type: 'bar',
      data: [{ id: 'workspace_data', values: points }],
      xField: 'category',
      yField: 'value',
      seriesField: undefined,
      legends: { visible: false },
      label: { visible: true },
      title: { visible: true, text: this.cardText(seriesName, 50) },
    };
  }

  private metricPriority(field: string): number {
    if (/count|total|amount|sum|processed|error|duration|value|number/i.test(field)) return 2;
    return 1;
  }

  private buildPreviewTable(records: Array<Record<string, unknown>>, fields: string[]): Record<string, unknown> | undefined {
    const columns = fields.slice(0, 5);
    if (!columns.length) return undefined;
    return {
      tag: 'table', page_size: 6, row_height: 'low',
      columns: columns.map((field, index) => ({ name: `f${index}`, display_name: this.cardText(field, 40), data_type: 'text', width: 'auto' })),
      rows: records.slice(0, 6).map((record) => Object.fromEntries(columns.map((field, index) => [`f${index}`, this.cardText(this.cellText(this.fieldValue(record, field)), 72)]))),
    };
  }

  private fieldValue(record: Record<string, unknown>, field: string): unknown {
    if (field in record) return record[field];
    return field.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, record);
  }

  private cellText(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return String(record.Name ?? record.name ?? record.label ?? record.value ?? '[对象]');
    }
    return String(value);
  }

  private cardText(value: string, maxLength: number): string {
    return String(value || '').replace(/[<>]/g, '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, maxLength);
  }

  private buildTestCard() {
    return {
      msg_type: 'interactive',
      card: {
        schema: '2.0', config: { update_multi: true },
        header: { title: { tag: 'plain_text', content: '飞书工作台连接测试' }, template: 'green' },
        body: { direction: 'vertical', padding: '12px 12px 12px 12px', elements: [
          { tag: 'markdown', content: '**机器人连接成功**\n工作台订阅将以飞书原生看板卡片推送。' },
          { tag: 'column_set', flex_mode: 'stretch', background_style: 'grey', columns: [
            this.metricColumn('发送方式', '交互卡片'),
            this.metricColumn('渲染内容', '指标 · 图表 · 表格'),
            this.metricColumn('测试时间', new Date().toLocaleTimeString()),
          ] },
        ] },
      },
    };
  }

  private async postCard(webhook: string, body: Record<string, unknown>): Promise<void> {
    const serialized = JSON.stringify(body);
    if (Buffer.byteLength(serialized, 'utf8') > 18_000) throw new Error('飞书看板卡片超过安全大小限制，请减少查询字段或关闭明细预览');
    const response = await axios.post(webhook, body, { timeout: 12000 });
    if (response.data?.code !== undefined && response.data.code !== 0) throw new Error(response.data?.msg || `飞书机器人返回错误码 ${response.data.code}`);
    if (response.data?.StatusCode !== undefined && response.data.StatusCode !== 0) throw new Error(response.data?.StatusMessage || `飞书机器人返回错误码 ${response.data.StatusCode}`);
  }
}
