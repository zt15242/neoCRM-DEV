import { 
  NeoEnvironment, 
  SessionState, 
  AccountRecord, 
  CliSyncResult, 
  TestConnectionResult,
  EntityMetadata,
  FieldMetadata,
  CreateEntityPayload,
  CreateFieldPayload,
  QueryResultData,
  UpdateInfo,
  DownloadProgress,
  ScrollProgress,
  AiConfigData,
  AiHarnessSettings,
  AiProviderConfig,
  AiChatSession,
  AiStreamEvent,
  AiModelItem,
  AiFileAttachment,
  McpServerConfig,
  AiSkillItem,
  WorkflowDeployPlan,
  WorkflowDeployResult,
  WorkflowLicenseStatus,
  WorkflowLicenseActivateResult
} from '../../shared/types';

declare global {
  interface Window {
    neoApi: {
      getEnvironments: () => Promise<NeoEnvironment[]>;
      saveCustomEnvironment: (env: Partial<NeoEnvironment> & { name: string; neoBaseURL: string }) => Promise<NeoEnvironment>;
      deleteCustomEnvironment: (id: string) => Promise<boolean>;
      testConnectivity: (url: string) => Promise<TestConnectionResult>;

      loginWithBrowser: (envId: string) => Promise<SessionState>;
      loginWithEmbeddedWindow: (envId: string) => Promise<SessionState>;
      loginWithPassword: (envId: string, username: string, pass: string) => Promise<SessionState>;
      cancelLogin: () => Promise<boolean>;
      refreshToken: () => Promise<SessionState>;
      logout: () => Promise<SessionState>;
      captureWebCookie: () => Promise<SessionState>;
      updateSessionCookie: (cookieString: string) => Promise<SessionState>;

      getCurrentSession: () => Promise<SessionState>;
      getAccountHistory: () => Promise<AccountRecord[]>;
      switchAccount: (accountId: string) => Promise<SessionState | null>;
      deleteAccountRecord: (accountId: string) => Promise<boolean>;

      syncToNeoCli: (targetDirPath?: string) => Promise<CliSyncResult>;
      selectFolder: () => Promise<string | null>;
      // 本地项目工作区 (Projects)
      projectGetProjects: () => Promise<WorkspaceProject[]>;
      projectSaveProject: (payload: Partial<WorkspaceProject> & { name: string; localPath: string }) => Promise<WorkspaceProject>;
      projectDeleteProject: (projectId: string) => Promise<boolean>;
      projectOpenFolder: (folderPath: string) => Promise<string>;
      projectListFiles: (params?: { folderPath?: string; query?: string; maxFiles?: number }) => Promise<Array<{
        name: string;
        relativePath: string;
        fullPath: string;
        ext: string;
        size: number;
      }>>;
      fileParseLocalPath: (filePath: string) => Promise<AiFileAttachment>;
      testApiCall: () => Promise<{ success: boolean; data?: any; error?: string }>;
      openExternal: (url: string) => Promise<void>;
      openDesigner: (type: 'web' | 'h5') => Promise<void>;
      getPlatform: () => Promise<string>;

      // 图片操作
      fetchImageDataUrl: (fileId: string | number) => Promise<{ success: boolean; dataUrl?: string; error?: string }>;
      uploadImage: (base64Data: string, fileName: string, mimeType?: string) => Promise<{ success: boolean; fileId?: number | string; fileName?: string; error?: string }>;
      // 自动更新
      checkForUpdates: () => Promise<UpdateInfo>;
      downloadUpdate: (downloadUrl: string, fileName: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      openInstaller: () => Promise<boolean>;
      gitPullUpdate: () => Promise<{ success: boolean; output: string }>;
      onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void;
      minimizeWindow: () => Promise<void>;
      maximizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;

      // 元数据
      getEntities: () => Promise<EntityMetadata[]>;
      getFields: (entityApiKey: string) => Promise<FieldMetadata[]>;
      createEntity: (payload: CreateEntityPayload) => Promise<{ success: boolean; data?: any; createdApiKey?: string; error?: string }>;
      createField: (entityApiKey: string, payload: CreateFieldPayload) => Promise<{ success: boolean; data?: any; error?: string }>;
      exportDictionary: (targetDir?: string) => Promise<{ success: boolean; filePath: string; message: string }>;

      // 数据
      getRecordDetail: (entityApiKey: string, id: string | number) => Promise<{ success: boolean; data?: Record<string, any>; error?: string }>;
      searchRecords: (entityApiKey: string, keyword: string, limit?: number) => Promise<{ success: boolean; records: Record<string, any>[]; error?: string }>;
      getBatchNames: (entityApiKey: string, ids: (string | number)[]) => Promise<Record<string, string>>;
      executeScrollQuery: (sql: string, batchCount?: number, maxLimit?: number) => Promise<{ success: boolean; data?: QueryResultData; error?: string }>;
      onScrollProgress: (callback: (progress: ScrollProgress) => void) => () => void;
      executeQuery: (sql: string) => Promise<{ success: boolean; data?: QueryResultData; error?: string }>;
      createRecord: (entityApiKey: string, data: Record<string, any>) => Promise<{ success: boolean; data?: any; error?: string }>;
      updateRecord: (entityApiKey: string, id: string | number, data: Record<string, any>) => Promise<{ success: boolean; data?: any; error?: string }>;
      deleteRecord: (entityApiKey: string, id: string | number) => Promise<{ success: boolean; error?: string }>;
// AI 对话平台与模型设置 (参考 DeepSeek Harness)
      aiGetConfig: () => Promise<AiConfigData>;
      aiSaveSettings: (settings: Partial<AiHarnessSettings>) => Promise<AiHarnessSettings>;
      aiSaveProvider: (provider: AiProviderConfig) => Promise<AiProviderConfig[]>;
      aiDeleteProvider: (id: string) => Promise<AiProviderConfig[]>;
      aiTestProvider: (provider: AiProviderConfig) => Promise<{ success: boolean; message: string; responseTimeMs?: number }>;
      aiFetchModels: (provider: AiProviderConfig) => Promise<{ success: boolean; models: AiModelItem[]; error?: string }>;
      aiGetSessions: () => Promise<AiChatSession[]>;
      aiSaveSession: (session: AiChatSession) => Promise<AiChatSession[]>;
      aiDeleteSession: (sessionId: string) => Promise<AiChatSession[]>;
      aiClearSessions: () => Promise<boolean>;
      aiStartChatStream: (params: {
        requestId: string;
        sessionId: string;
        messageId: string;
        providerId: string;
        modelId: string;
        presetPrompt?: string;
        messages: any[];
        enableTools?: boolean;
        activeSkillIds?: string[];
        activeMcpServerIds?: string[];
        compactionSummary?: any;
      }) => Promise<boolean>;
      aiAbortChatStream: (requestId: string) => Promise<boolean>;
      aiSelectAndParseFile: () => Promise<AiFileAttachment | null>;
      aiParseFileBuffer: (fileName: string, buffer: ArrayBuffer) => Promise<AiFileAttachment>;
      aiSaveMcpServer: (server: McpServerConfig) => Promise<McpServerConfig[]>;
      aiDeleteMcpServer: (id: string) => Promise<McpServerConfig[]>;
      aiSyncMcpTools: (serverId: string) => Promise<{ success: boolean; server?: McpServerConfig; tools?: McpToolItem[]; error?: string }>;
      aiSaveSkill: (skill: AiSkillItem) => Promise<AiSkillItem[]>;
      aiDeleteSkill: (id: string) => Promise<AiSkillItem[]>;
      aiCompactSession: (sessionId: string) => Promise<AiChatSession | null>;
      aiImportSkillZip: () => Promise<{
        success: boolean;
        skills?: AiSkillItem[];
        importedCount?: number;
        importedNames?: string[];
        error?: string;
        canceled?: boolean;
      }>;
      aiImportSkillZipBuffer: (
        fileName: string,
        buffer: ArrayBuffer
      ) => Promise<{
        success: boolean;
        skills?: AiSkillItem[];
        importedCount?: number;
        importedNames?: string[];
        error?: string;
      }>;
      aiExportSkillZip: (skillIds?: string[]) => Promise<{
        success: boolean;
        filePath?: string;
        error?: string;
        canceled?: boolean;
      }>;
      onAiStreamEvent: (callback: (event: AiStreamEvent) => void) => () => void;
      // 自动流程 (Automatic Flow) & 本地设备安全锁
      workflowGetLicenseStatus: () => Promise<WorkflowLicenseStatus>;
      workflowActivateLicense: (password: string) => Promise<WorkflowLicenseActivateResult>;
      workflowDeployPlan: (plan: WorkflowDeployPlan, options?: { autoEnable?: boolean }) => Promise<WorkflowDeployResult>;
      workflowDeployApprovalPlan: (plan: ApprovalDeployPlan, TenantFlowItem, options?: { autoEnable?: boolean }) => Promise<WorkflowDeployResult>;
      workflowGetApprovalResources: (entityApiKey?: string) => Promise<{
        roles: Array<{ apiKey: string; name: string; id: number }>;
        users: Array<{ id: string; name: string; personalEmail?: string; departName?: string }>;
        departments: Array<{ id: string; departName: string }>;
        busiTypes: Array<{ id: number | string; apiKey: string; label: string }>;
        picklistFields: Array<{ apiKey: string; label: string; options: Array<{ code: number | string; label: string }> }>;
      }>;
      workflowListTenantFlows: (params?: { procType?: 1 | 2; keyword?: string; pageNo?: number; pageSize?: number; status?: number }) => Promise<{ success: boolean; data?: TenantFlowItem[]; total?: number; totalInTenant?: number; matchedKeyword?: string; allFlowsSummary?: any[]; error?: string }>;
      workflowCopyFlow: (params: {
        procdefId: string | number;
        processName: string;
        description?: string;
        actKey?: string;
        entityApiKey: string;
        entityId: string | number;
        bizTypeId?: string | number;
        startupOrder?: number;
        executeType?: string;
        procType: 1 | 2;
        enableIntelligentMode?: number;
      }) => Promise<{ success: boolean; newProcdefId?: string | number; error?: string }>;
      workflowDeleteFlow: (procdefId: string | number, procType?: number) => Promise<{ success: boolean; error?: string }>;
      workflowListFlows: (params?: { keyword?: string; pageNo?: number; pageSize?: number; status?: number }) => Promise<{ success: boolean; data?: any; error?: string }>;
      workflowGetFlowDetail: (procdefId: string | number, procType?: number) => Promise<{ success: boolean; definition?: any; property?: any; error?: string }>;
      workflowToggleStatus: (procdefId: string | number, enable: boolean, procType?: number) => Promise<{ success: boolean; status?: number; error?: string }>;
      workflowReviseVersion: (procdefId: string | number, procType?: number) => Promise<{ success: boolean; newProcdefId?: string | number; error?: string }>;
      workflowTriggerInstance: (payload: { processDefinitionApiKey: string; entityApiKey: string; dataId: string | number; beforeData?: Record<string, any> }) => Promise<{ success: boolean; message: string; error?: string }>;
      // 打印模板 (Print Template)
      printListObjects: () => Promise<{ success: boolean; data?: PrintObjectItem[]; error?: string }>;
      printListTemplates: (params?: { objectId?: number | string; entityApiKey?: string; pageNo?: number; pageSize?: number }) => Promise<{ success: boolean; data?: PrintTemplateItem[]; total?: number; entityApiKey?: string; objectLabel?: string; objectId?: number; error?: string }>;
      printGetFields: (params: { objectId?: number | string; entityApiKey?: string }) => Promise<{ success: boolean; data?: any; error?: string }>;
      printDownloadSample: (params: { objectId?: number | string; entityApiKey?: string }) => Promise<{ success: boolean; data?: { word?: string; excel?: string; objectId: number; entityApiKey: string; objectLabel: string }; error?: string }>;
      printToggleStatus: (templatePrintId: string | number, enable: boolean) => Promise<{ success: boolean; status?: number; error?: string }>;
      printDeleteTemplate: (templatePrintId: string | number) => Promise<{ success: boolean; error?: string }>;
      printRenderDocument: (params: { entityApiKey: string; recordId: string | number; templateId: string | number; exportType?: 1 | 2 | 3 }) => Promise<{ success: boolean; data?: any; error?: string }>;
    };
  }
}

export {};
