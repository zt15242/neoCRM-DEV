import type { CrmProductType } from './types';

export type WorkspaceWidgetType =
  | 'text'
  | 'crm-query'
  | 'mail-list'
  | 'async-apex-dashboard'
  | 'custom-html'
  | 'custom-tsx';

export interface WorkspaceWidget {
  id: string;
  type: WorkspaceWidgetType;
  title: string;
  projectId?: string;
  relativePath?: string;
  buildStatus?: 'pending' | 'ready' | 'error';
  buildError?: string;
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
  projectId?: string;
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
  content?: string;
  sourcePath?: string;
  buildStatus?: 'ready' | 'error';
  error?: string;
  updatedAt: number;
}
