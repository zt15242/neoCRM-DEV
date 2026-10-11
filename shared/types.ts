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
  referObjectApiKey?: string;
  cascadeDelete?: number;
  linkLabel?: string;
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
  referObjectApiKey?: string;
  cascadeDelete?: number;
  linkLabel?: string;
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

export interface ScrollProgress {
  current: number;
  total: number;
  percent: number;
  page: number;
}

// ================= AI 对话平台与设置相关类型 (参考 DeepSeek Harness) =================

export type AiProtocol = 'openai-completions' | 'openai-responses' | 'anthropic-messages' | 'google-gemini';

export interface AiModelItem {
  id: string;
  name: string;
  reasoning?: boolean; // 是否具备深度推理/思考模式（如 DeepSeek-R1 / o1 / o3）
  tools?: boolean; // 是否支持 Function / Tool Calling
  contextWindow?: number;
  maxOutputTokens?: number;
}

export interface AiProviderConfig {
  id: string; // 唯一标识，如 deepseek, openai, siliconflow, custom_xxx
  name: string; // 供应商名称，如 DeepSeek 官方平台
  type: 'official-deepseek' | 'builtin-thirdparty' | 'custom';
  protocol: AiProtocol;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  models: AiModelItem[];
  description?: string;
  website?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface AiHarnessSettings {
  defaultProviderId: string;
  defaultModelId: string;
  temperature: number;
  maxTokens: number;
  contextLimit: number; // 携带的历史轮数
  stream: boolean;
  enableCrmTools: boolean; // 是否允许 AI 自动调用销售易本地工具 (Agent Loop)
  enableSqlTool: boolean; // 是否允许 AI 执行只读 SQL
  injectTenantContext: boolean; // 是否自动注入当前租户环境上下文
  customSystemPrompt: string; // 用户自定义追加的系统提示词
  defaultStartupTab: 'dashboard' | 'metadata' | 'data' | 'ai' | 'settings';
  defaultSqlLimit: number;
}

export interface AiFileAttachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  parsedContent: string; // 解析出的文本或表格数据
  summaryText?: string; // 简要说明，例如 "Excel工作表: 3个Sheet, 150行"
}

export interface McpToolItem {
  name: string;
  description: string;
  inputSchema?: any;
}

export interface McpServerConfig {
  id: string;
  name: string;
  description?: string;
  type: 'builtin' | 'stdio' | 'sse';
  enabled: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  tools?: McpToolItem[];
}

export interface AiSkillItem {
  id: string;
  name: string;
  description: string;
  category: 'builtin' | 'personal'; // 系统内置 vs 个人自定义
  iconName?: string;
  systemInstruction?: string;
  triggerKeywords?: string[];
  enabled: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface AiCompactedSummary {
  originalMessageCount: number;
  summary: string;
  compactedAt: number;
}

export interface AiConfigData {
  providers: AiProviderConfig[];
  settings: AiHarnessSettings;
  mcpServers?: McpServerConfig[];
  skills?: AiSkillItem[];
}

export interface AiToolCallRecord {
  id: string;
  name: string; // get_tenant_info | list_entities | get_entity_fields | execute_sql_query
  arguments: Record<string, any>;
  status: 'running' | 'success' | 'error';
  resultSummary?: string;
  resultData?: any;
  durationMs?: number;
  error?: string;
}

export interface AiContextEntityRef {
  apiKey: string;
  label: string;
  isStandard?: boolean;
  fieldsCount?: number;
  fieldsSample?: { apiKey: string; label: string; typeName: string }[];
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  reasoningContent?: string; // 深度思考内容 (DeepSeek-R1 或 <think>)
  reasoningDurationMs?: number;
  isThinkingFinished?: boolean;
  toolCalls?: AiToolCallRecord[];
  entityRefs?: AiContextEntityRef[];
  attachments?: AiFileAttachment[]; // 上传的文件附件
  skillIds?: string[]; // 本条消息引用的技能
  providerId?: string;
  modelId?: string;
  createdAt: number;
  error?: string;
}

export interface AiChatSession {
  id: string;
  title: string;
  presetId: string;
  providerId: string;
  modelId: string;
  messages: AiChatMessage[];
  entityRefs?: AiContextEntityRef[];
  activeSkillIds?: string[]; // 当前会话挂载的技能 ID
  compactionSummary?: AiCompactedSummary; // 上下文压缩摘要
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
}

export interface AiStreamEvent {
  requestId: string;
  sessionId: string;
  messageId: string;
  type: 'reasoning_delta' | 'content_delta' | 'tool_start' | 'tool_update' | 'done' | 'error';
  delta?: string;
  toolCall?: AiToolCallRecord;
  error?: string;
}

export interface PlannedFieldItem {
  apiKey: string;
  label: string;
  itemType: number;
  typeName: string;
  maxLength?: number;
  decimal?: number;
  referObjectApiKey?: string;
  pickOption?: { optionLabel: string; optionCode: number }[];
  description?: string;
}

export interface SchemaPlanPayload {
  entity: CreateEntityPayload;
  fields: PlannedFieldItem[];
}

export interface AiAgentPreset {
  id: string;
  name: string;
  description: string;
  iconName: string;
  badge?: string;
  disabled?: boolean;
  disabledReason?: string;
  systemPrompt: string;
  recommendedModel?: string;
  enableCrmTools: boolean;
  quickPrompts: string[];
}
