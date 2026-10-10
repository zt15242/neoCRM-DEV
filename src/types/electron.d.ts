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
  DownloadProgress
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

      getCurrentSession: () => Promise<SessionState>;
      getAccountHistory: () => Promise<AccountRecord[]>;
      switchAccount: (accountId: string) => Promise<SessionState | null>;
      deleteAccountRecord: (accountId: string) => Promise<boolean>;

      syncToNeoCli: (targetDirPath?: string) => Promise<CliSyncResult>;
      selectFolder: () => Promise<string | null>;
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
      createEntity: (payload: CreateEntityPayload) => Promise<{ success: boolean; data?: any; error?: string }>;
      createField: (entityApiKey: string, payload: CreateFieldPayload) => Promise<{ success: boolean; data?: any; error?: string }>;
      exportDictionary: (targetDir?: string) => Promise<{ success: boolean; filePath: string; message: string }>;

      // 数据
      getRecordDetail: (entityApiKey: string, id: string | number) => Promise<{ success: boolean; data?: Record<string, any>; error?: string }>;
      searchRecords: (entityApiKey: string, keyword: string, limit?: number) => Promise<{ success: boolean; records: Record<string, any>[]; error?: string }>;
      getBatchNames: (entityApiKey: string, ids: (string | number)[]) => Promise<Record<string, string>>;
      executeQuery: (sql: string) => Promise<{ success: boolean; data?: QueryResultData; error?: string }>;
      createRecord: (entityApiKey: string, data: Record<string, any>) => Promise<{ success: boolean; data?: any; error?: string }>;
      updateRecord: (entityApiKey: string, id: string | number, data: Record<string, any>) => Promise<{ success: boolean; data?: any; error?: string }>;
      deleteRecord: (entityApiKey: string, id: string | number) => Promise<{ success: boolean; error?: string }>;
    };
  }
}

export {};
