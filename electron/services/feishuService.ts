import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import { app, safeStorage } from 'electron';
import type { FeishuWorkspaceSettings } from '../../shared/feishuTypes';
import type { WorkspacePage, WorkspaceWidget, WorkspaceWidgetResult } from '../../shared/workspaceTypes';
import { WorkspaceService } from './workspaceService';

interface StoredConfig {
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

  private write(config: StoredConfig) {
    fs.writeFileSync(this.getPath(), JSON.stringify(config, null, 2), 'utf-8');
  }

  private decrypt(config: StoredConfig): string {
    if (!config.encryptedWebhook) return '';
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储不可用，未能读取飞书 Webhook');
    return safeStorage.decryptString(Buffer.from(config.encryptedWebhook, 'base64'));
  }

  public getSettings(): FeishuWorkspaceSettings {
    return { configured: !!this.read().encryptedWebhook };
  }

  public saveSettings(input: { webhookUrl?: string }): FeishuWorkspaceSettings {
    const existing = this.read();
    const url = String(input.webhookUrl || '').trim();
    let encryptedWebhook = existing.encryptedWebhook;
    if (url && url !== '已加密保存') {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || !/(^|\.)((feishu|larksuite)\.cn)$|(^|\.)larksuite\.com$/i.test(parsed.hostname)) {
        throw new Error('请输入有效的飞书或 Lark HTTPS 自定义机器人 Webhook');
      }
      if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储不可用，不能安全保存 Webhook');
      encryptedWebhook = safeStorage.encryptString(url).toString('base64');
    }
    this.write({ ...existing, encryptedWebhook });
    return this.getSettings();
  }

  public async testMessage(): Promise<{ success: boolean; message: string }> {
    const webhook = this.decrypt(this.read());
    if (!webhook) throw new Error('请先保存飞书 Webhook');
    await this.postText(webhook, 'NeoCRM 自定义工作台飞书机器人连接测试成功。');
    return { success: true, message: '测试消息已发送' };
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
            const webhook = this.decrypt(this.read());
            if (!webhook) throw new Error('尚未配置飞书机器人 Webhook');
            await this.postText(webhook, this.formatSummary(page, widget, result, !runError));
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

  private formatSummary(page: WorkspacePage, widget: WorkspaceWidget, result: WorkspaceWidgetResult | undefined, success: boolean): string {
    const count = result.records?.length ?? 0;
    return [
      `工作台订阅：${page.name}`,
      `组件：${widget.title}`,
      success ? `运行状态：成功 · ${count} 条结果` : '运行状态：失败，请在 NeoCRM 工作台检查组件状态',
      `运行时间：${new Date(result?.updatedAt || Date.now()).toLocaleString()}`,
      '此消息仅包含运行摘要，不包含 CRM 记录内容或邮件正文。',
    ].join('\n');
  }

  private async postText(webhook: string, text: string): Promise<void> {
    const response = await axios.post(webhook, { msg_type: 'text', content: { text } }, { timeout: 12000 });
    if (response.data?.code !== undefined && response.data.code !== 0) throw new Error(response.data?.msg || `飞书机器人返回错误码 ${response.data.code}`);
    if (response.data?.StatusCode !== undefined && response.data.StatusCode !== 0) throw new Error(response.data?.StatusMessage || `飞书机器人返回错误码 ${response.data.StatusCode}`);
  }
}
