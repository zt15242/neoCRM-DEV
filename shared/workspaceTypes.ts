import type { CrmProductType } from './types';

export type WorkspaceWidgetType = 'text' | 'crm-query' | 'mail-list' | 'async-apex-dashboard';

export interface WorkspaceWidget {
  id: string;
  type: WorkspaceWidgetType;
  title: string;
  text?: string;
  accountId?: string;
  connectorId?: string;
  query?: string;
  limit?: number;
  feishuIncludeRecords?: boolean;
  subscription?: {
    enabled: boolean;
    intervalMinutes: number;
    feishuEnabled: boolean;
    feishuBotId?: string;
  };
}

export interface WorkspacePage {
  id: string;
  name: string;
  description?: string;
  widgets: WorkspaceWidget[];
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceDataSources {
  crmAccounts: Array<{
    accountId: string;
    connectorId: string;
    connectorName: string;
    productType: CrmProductType;
    tenantName?: string;
    userName?: string;
  }>;
  mailAccounts: Array<{ accountId: string; name: string; email: string }>;
}

export interface WorkspaceWidgetResult {
  widgetId: string;
  success: boolean;
  records?: Array<Record<string, unknown>>;
  fields?: string[];
  totalSize?: number;
  error?: string;
  updatedAt: number;
}
