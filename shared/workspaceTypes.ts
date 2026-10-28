import type { CrmProductType } from './types';

export type WorkspaceWidgetType =
  | 'text'
  | 'crm-query'
  | 'mail-list'
  | 'async-apex-dashboard'
  | 'custom-html'
  | 'custom-tsx';

export type WorkspaceWidgetColumnSpan = 1 | 2 | 3 | 4;
export type WorkspaceWidgetHeight = 320 | 480 | 640 | 800;

export interface WorkspaceWidget {
  id: string;
  type: WorkspaceWidgetType;
  title: string;
  columnSpan?: WorkspaceWidgetColumnSpan;
  height?: WorkspaceWidgetHeight;
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

export interface WorkspaceComponentFile {
  relativePath: string;
  ext: string;
  size: number;
}

export interface WorkspaceComponentFileList {
  rootPath: string;
  files: WorkspaceComponentFile[];
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
  executionId?: string;
  records?: Array<Record<string, unknown>>;
  fields?: string[];
  totalSize?: number;
  connector?: {
    accountId: string;
    connectorName: string;
    productType: CrmProductType;
  };
  query?: string;
  content?: string;
  sourcePath?: string;
  buildStatus?: 'ready' | 'error';
  error?: string;
  updatedAt: number;
}

export type WorkspaceExecutionLogStage = 'run' | 'config' | 'load' | 'dependency' | 'build' | 'style' | 'query' | 'render' | 'runtime';
export type WorkspaceExecutionLogStatus = 'info' | 'success' | 'error';

export interface WorkspaceExecutionLog {
  id: string;
  pageId: string;
  pageName: string;
  widgetId: string;
  widgetTitle: string;
  executionId?: string;
  batchId?: string;
  sequence?: number;
  trigger?: 'manual' | 'scheduled' | 'preview';
  stage: WorkspaceExecutionLogStage;
  status: WorkspaceExecutionLogStatus;
  message: string;
  timestamp: number;
  durationMs?: number;
}
