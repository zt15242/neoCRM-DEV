export interface NeoEnvironment {
  id: string;
  name: string;
  description?: string;
  isPreset: boolean;
  neoBaseURL: string;
  loginURL: string;
  tokenURL: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  scope?: string;
  oauthType?: string;
  accessType?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface UserInfo {
  userId?: string | number;
  name?: string;
  tenant_id?: string | number;
  tenantName?: string;
  email?: string;
  mobile?: string;
  avatarUrl?: string;
  [key: string]: any;
}

export interface TokenData {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  instance_uri?: string;
  tenant_id?: string | number;
  userInfo?: UserInfo;
  savedAt: number;
  expiresAt: number;
}

export interface SessionState {
  isLoggedIn: boolean;
  environment?: NeoEnvironment;
  tokenData?: TokenData;
  activeAccountId?: string;
}

export interface AccountRecord {
  id: string;
  environmentId: string;
  environmentName: string;
  tenantId?: string | number;
  tenantName?: string;
  userName?: string;
  instanceUri?: string;
  lastLoginAt: number;
  tokenData: TokenData;
}

export interface CliSyncResult {
  success: boolean;
  targetPath: string;
  message: string;
}

export interface TestConnectionResult {
  success: boolean;
  statusCode?: number;
  responseTimeMs?: number;
  message: string;
}

// ================= 实体与元数据类型 =================
export interface EntityMetadata {
  apiKey: string;
  label: string;
  description?: string;
  isStandard: boolean;
  enableBusitype?: boolean;
  enableGroupMember?: boolean;
  enableScriptExecutor?: boolean;
  enableCheckrule?: boolean;
  enableDuplicaterule?: boolean;
  detail?: boolean;
  objectType?: number;
}

export interface PickOption {
  optionLabel: string;
  optionCode?: number | string;
  optionApiKey?: string;
  active?: boolean;
}

export interface FieldMetadata {
  apiKey: string;
  label: string;
  itemType: number;
  typeName: string;
  custom: boolean;
  maxLength?: number;
  decimal?: number;
  referObjectApiKey?: string;
  pickOption?: PickOption[];
  description?: string;
}

export interface CreateEntityPayload {
  apiKey: string;
  label: string;
  description?: string;
  autoNumberFormat?: string;
  enableScriptExecutor?: boolean;
  enableBusitype?: boolean;
}

export interface CreateFieldPayload {
  apiKey: string;
  label: string;
  itemType: number;
  maxLength?: number;
  decimal?: number;
  pickOption?: { optionLabel: string; optionCode: number }[];
  description?: string;
}

// ================= 数据操作类型 =================
export interface QueryResultData {
  records: Record<string, any>[];
  totalSize: number;
  fields: string[];
}

export interface CreateRecordPayload {
  entityApiKey: string;
  data: Record<string, any>;
}

export interface UpdateRecordPayload {
  entityApiKey: string;
  id: string | number;
  data: Record<string, any>;
}

// ================= Excel 批量创建字段类型 =================
export interface ExcelFieldRow {
  id: string; // 本地临时行标识
  label: string; // 字段名称
  apiKey: string; // API Key
  itemType: number; // 映射后的系统类型数值
  typeName: string; // 类型中文名
  maxLength?: number;
  decimal?: number;
  optionsStr?: string; // 原始选项字符串
  pickOption?: { optionLabel: string; optionCode: number }[];
  description?: string;
  status: 'pending' | 'valid' | 'invalid' | 'exists' | 'success' | 'failed' | 'skipped';
  errorMessage?: string;
  selected: boolean;
}

export interface BatchCreateProgress {
  total: number;
  current: number;
  successCount: number;
  skipCount: number;
  failCount: number;
  currentField?: string;
}

// ================= 自动更新类型 =================
export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName?: string;
  releaseNotes?: string;
  publishedAt?: string;
  downloadUrl?: string;
  assetName?: string;
  size?: number;
  releasePageUrl?: string;
}

export interface DownloadProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}
