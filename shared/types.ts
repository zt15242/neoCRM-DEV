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
  // Web 控制台与内部 /admin/ 接口会话 Cookie (如 JSESSIONID 等)
  cookieString?: string;
  cookies?: Array<{ name: string; value: string; domain?: string; path?: string }>;
  cookieSavedAt?: number;
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
  objectId?: number | string;
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
  currency?: boolean; // 当 itemType=6 时: true 为货币 (Currency), false 为实数/浮点 (Decimal/Float)
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
  currency?: boolean; // 当 itemType=6 时: true 为货币 (Currency), false 为实数/浮点 (Decimal/Float)
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
  currency?: boolean; // 当 itemType=6 时是否为货币
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

export type McpAuthType = 'none' | 'bearer' | 'basic' | 'custom';

export interface McpServerConfig {
  id: string;
  name: string;
  description?: string;
  type: 'builtin' | 'stdio' | 'sse';
  enabled: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>; // Stdio 进程环境变量 (如 API_KEY, TOKEN 等)
  url?: string; // SSE 远程端点
  authType?: McpAuthType;
  bearerToken?: string;
  basicUsername?: string;
  basicPassword?: string;
  headers?: Record<string, string>; // 自定义请求头 (含 Authorization / API Key 等)
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
  projectId?: string; // 关联的本地项目 ID
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
  currency?: boolean; // 当 itemType=6 时是否为货币
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

// ================= 销售易自动流程 (Automatic Flow) 代码配置与部署契约 =================
export interface WorkflowNodeItem {
  id: string; // 节点 ID, 如 StartEvent_1, ServiceTask_1, QueryLog_1, Gateway_1, Loop_1, Assignment_1, EndEvent_1
  nodeType: "StartNoneEvent" | "ServiceTask" | "Assignment" | "QueryLog" | "Loop" | "ExclusiveGateway" | "EndNoneEvent";
  name: string; // 节点显示名称
  description?: string;
  actionConfig?: {
    actionName: string;
    actionType: number; // 2: 更新记录, 1: 创建记录, 3: 系统通知, 4: 发送邮件, 5: 业务事件...
    entityApiKey?: string;
    valueConfig?: any;
    fieldUpdates?: Array<{
      fieldApiKey?: string;
      fieldLabel?: string;
      operator?: string;
      value?: any;
    }>;
    description?: string;
  };
  queryConfig?: {
    searchObject: string; // 目标对象 API Key
    searchObjectLabel?: string;
    searchDataLimit: "1" | "2"; // 1: 第一条, 2: 全部最多1000条
    searchResultVariavle: string; // 存储结果的集合变量或对象变量名
    searchSortDesc?: "1" | "2" | "3"; // 1默认, 3升序, 2降序
    searchSortItem?: string;
    conditions?: Array<{
      field: string;
      operator: string;
      value: any;
    }>;
  };
  loopConfig?: {
    loopVariavle: string; // 循环遍历的多值集合变量
    loopCursor: string; // 循环单值游标变量
    loopDirect?: number; // 1: 正向, 0: 反向
  };
  assignmentConfig?: {
    assignments: Array<{
      targetVariable: string;
      operator: string;
      value: any;
    }>;
  };
}

export interface WorkflowVariableItem {
  apiKey: string; // 变量 API Key (跨节点引用)
  describe: string; // 描述与中文名
  variavleType: 1 | 2; // 1: 单值, 2: 多值集合 (严格遵循源码拼写)
  variavleDataType: string; // 1文本, 3单选, 5整数, 6实数, 1002货币, 7日期, 21时间, 31布尔, 10关联, 1003ID, 1004记录类型...
  defaultValue?: any;
  decimal?: number;
  objectApiKey?: string; // 绑定对象 (当数据类型为关联或记录类型时)
  objectLabel?: string;
}

export interface WorkflowGatewayBranch {
  seqFlowId: string;
  name: string;
  targetNodeId: string; // 连线目标节点 ID
  isDefault: boolean; // 是否为默认分支
  conditionFormula?: string;
}

export interface WorkflowDeployPlan {
  flow: {
    processName: string; // 流程名称
    actKey: string; // 流程 API Key (唯一, 字母开头, <=50 字符)
    entityApiKey: string; // 主关联对象 API Key
    entityLabel?: string;
    executeType: string; // 1: 创建, 2: 编辑, 5: 平台事件, 6: 页面按钮, 7: 智能体操作 (逗号拼接)
    description?: string;
    enableIntelligentMode?: number; // 1: 开启, 2: 关闭 (默认 2)
    targetMode?: "update" | "create";
    targetProcdefId?: string | number;
    targetStatus?: number;
  };
  variables: WorkflowVariableItem[];
  nodes: WorkflowNodeItem[];
  branches?: WorkflowGatewayBranch[];
  edges?: Array<{ source: string; target: string; label?: string }>;
}

export interface TenantFlowItem {
  id: string; // 流程家族 ID (procInfoId)
  procInfoId: string;
  procdefId: string;
  procdefApiKey?: string;
  actKey?: string;
  name: string;
  objectName: string;
  entityApiKey?: string;
  entityId?: string | number;
  bizTypeId?: string | number;
  startupOrder?: number;
  executeType?: string;
  statusName: string; // "启用" | "设计" | "禁用"
  status: number; // 1: 启用, 3: 设计, 2: 禁用
  version?: number; // 当前版本号 (如 1, 2)
  latestVersion?: number; // 流程族下的最新版本号
  versionsCount?: number; // 版本总数
  createdByName?: string;
  createdAt?: string;
  updatedByName?: string;
  updatedAt?: string;
  description?: string;
  procType: 1 | 2; // 1: 自动流程, 2: 审批流
}

export interface WorkflowDeployResult {
  success: boolean;
  procId?: string | number;
  procdefId?: string | number;
  procdefApiKey?: string;
  status?: number; // 1: 启用, 2: 禁用, 3: 设计态草稿
  statusText?: string;
  error?: string;
  stepsLog?: Array<{
    step: string;
    status: "success" | "warn" | "error" | "skipped";
    message: string;
    timeMs?: number;
    details?: any;
  }>;
}

/**
 * 自动流程代码配置功能 — 本地离线设备授权锁状态
 */
export interface WorkflowLicenseStatus {
  /** 当前设备的唯一硬件机器码（一机一码，重装/刷机或换设备后必变） */
  machineCode: string;
  /** 当前是否已激活且在有效期内 */
  isAuthorized: boolean;
  /** 状态类型 */
  status: "active" | "expired" | "device_mismatch" | "unactivated" | "clock_tampered";
  /** 剩余有效天数 */
  remainingDays: number;
  /** 授权总天数（默认 30 天） */
  totalDays?: number;
  /** 签发时间戳 (ms) */
  issuedAt?: number;
  /** 到期时间戳 (ms) */
  expiresAt?: number;
  /** 到期日期字符串 (YYYY-MM-DD) */
  expireDateStr?: string;
  /** 脱敏后的随机凭证 ID (例如 xiaowukeji-2026-11-12-****A1B2) */
  credentialSummary?: string;
  /** 防暴力破解：当前是否处于错误冷却锁定期 */
  isLockedOut: boolean;
  /** 防暴力破解：剩余锁定冷却秒数 */
  lockRemainingSeconds: number;
  /** 防暴力破解：当前已连续失败次数 */
  failedAttempts: number;
  /** 状态说明或错误提示 */
  message?: string;
}

export interface WorkflowLicenseActivateResult {
  success: boolean;
  message: string;
  status: WorkflowLicenseStatus;
}

/**
 * 销售易审批流 (Approval Flow, procType=2) 代码级配置与部署契约
 */
export interface ApprovalApproverRule {
  /**
   * 审批人策略编码:
   * 201: 自选审批人
   * 202: 固定审批人 / 对象字段选人
   * 203: 流程提交人
   * 204: 上一节点直属上级
   * 205: 提交人直属上级
   * 401: 指定角色
   */
  assignmentType: "201" | "202" | "203" | "204" | "205" | "301" | "401" | "601";
  /** 当为字段选人或直属上级层级时的 itemApiKey (如 "1" 或 "account.ownerId") */
  itemApiKey?: string;
  itemApiKeyLabel?: string;
  /** 指定用户或角色列表 */
  approvers?: Array<{
    apiKey?: string;
    label: string;
    infoType?: 1 | 2 | 3 | 4; // 1用户 2部门 3用户组 4角色
  }>;
}

export interface ApprovalNodeItem {
  id: string;
  nodeType: "StartNoneEvent" | "SubmitTask" | "UserTask" | "ExclusiveGateway" | "EndNoneEvent";
  name: string;
  description?: string;
  /** 审批方式: "1" 单人审批, "2" 多人任签(一人通过即通过), "3" 多人并行会签 */
  taskType?: "1" | "2" | "3";
  /** 会签规则 (当 taskType="3" 时生效): passType=1(至少一人) / 2(百分比，如 "60" 或 "100") */
  countersign?: {
    passType: 1 | 2;
    passThreshold: string;
  };
  /** 审批人策略列表 */
  approverRules?: ApprovalApproverRule[];
  /** 允许审批人修改的字段 API Key 列表 */
  editableFields?: Array<{
    itemApiKey: string;
    itemLabel?: string;
    isEditable?: 0 | 1;
    isRequired?: 0 | 1;
  }>;
  /** 是否允许加签: 1允许 2禁止 */
  plussignFlag?: 1 | 2;
  /** 是否允许转办: 1允许 2禁止 */
  delegationFlag?: 1 | 2;
  /** 拒绝回退方式: "1" 退回初始节点, "2" 退回上一节点, "3" 退回之前任意节点 */
  returnTargetType?: "1" | "2" | "3";
  /** 审批意见设置: 1必填 2选填 3免填 */
  commentFlag?: 1 | 2 | 3;
  /** 节点通过后触发的更新记录事件 (可选) */
  afterAgreeAction?: {
    actionName: string;
    fieldApiKey?: string;
    fieldValue?: string;
  };
}

export interface ApprovalDeployPlan {
  flow: {
    processName: string;
    entityApiKey: string;
    entityLabel?: string;
    bizTypeApiKey?: string;
    bizTypeLabel?: string;
    startupOrder?: number;
    description?: string;
    /** 撤回策略: 1允许撤回 2禁止撤回 3仅提交人可撤回 */
    withdrawFlag?: 1 | 2 | 3;
    /** 单步收回: 1允许 2禁止 */
    singleStepWithdrawFlag?: 1 | 2;
    /** 审批通知: 1发送 2关闭 */
    sendApprovalNotice?: 1 | 2;
    /** 准入初始条件公式 (可选，如留空则默认满足) */
    entryFormula?: string;
    targetMode?: "update" | "create";
    targetProcdefId?: string | number;
    targetStatus?: number;
  };
  nodes: ApprovalNodeItem[];
  edges?: Array<{
    source: string;
    target: string;
    label?: string;
    isDefault?: boolean;
    conditionFormula?: string;
  }>;
}

export interface PrintObjectItem {
  objectId: number;
  apiKey: string;
  label: string;
  allNum: number;
  enableNum: number;
  wordModelUrl?: string;
  excelModelUrl?: string;
}

export interface PrintTemplateItem {
  id: string;
  name: string;
  systemId: number;
  entityApiKey?: string;
  objectLabel?: string;
  status: number; // 1: 启用, 0: 禁用
  statusName: string;
  outputType: number; // 0: PDF, 1: 原格式
  outputTypeName: string;
  fileName: string;
  fileUrl: string;
  printFileName?: string;
  langCode?: string;
  languageCode?: string;
  printCondition?: string;
  hasCondition?: boolean;
  createdAt?: number;
  createdBy?: number;
  updatedAt?: number;
  updatedBy?: number;
}

export interface WorkspaceProject {
  id: string;
  name: string;
  localPath: string; // 本地物理目录路径 (如 /Users/xiiaowu/Desktop/销售易/neoCRM-DEV)
  description?: string;
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectDirNode {
  name: string;
  path: string;
  relativePath: string;
  type: 'directory' | 'file';
  ext?: string;
  size?: number;
  children?: ProjectDirNode[];
}

export interface WorkspaceArtifactItem {
  name: string;
  relativePath: string;
  fullPath: string;
  ext: string;
  size: number;
  mtime: number;
}
