declare const __APP_VERSION__: string | undefined;
export const CURRENT_APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? `v${__APP_VERSION__}` : 'v1.8.52';

export const DEFAULT_AUTH_CONFIG = {
  clientId: '04c8b45c4dbe36426a660bf70d3fe3e7',
  clientSecret: '370817d1336a3737f95c671eea39a23b',
  redirectUri: 'http://localhost:1028',
  scope: 'all',
  oauthType: 'standard',
  accessType: 'offline',
};

/**
 * 内置硅基流动高可用容灾与极速语音识别 Key (SenseVoice & DeepSeek-V3 灾备)
 */
export const BUILTIN_SILICONFLOW_KEY = 'sk-zkjveblwlnhgteyxbxkcvhryfhwbsxfmvlcroidaevapmupb';

/**
 * 销售易 PaaS 平台官方字段类型代码对照表 (itemType)
 */
export const ITEM_TYPE_MAP: Record<number, string> = {
  1: '单行文本',
  2: '多行文本',
  3: '单选列表',
  4: '多选列表',
  5: '整数',
  6: '金额',
  7: '日期',
  8: '日期时间',
  9: '自动编号',
  10: '关联关系',
  11: '选项列表',
  12: '多选列表',
  13: '自动编号',
  14: '图片',
  15: '地理位置',
  16: '电话号码',
  17: '电子邮箱',
  18: '网址链接',
  19: '长整数',
  20: '计算字段',
  21: '日期时间',
  22: '电话号码',
  23: '电子邮箱',
  24: '网址链接',
  25: '级联选项',
  26: '复合/查找',
  27: '统计字段',
  28: '自动计算',
  29: '图片',
  30: '业务标签',
  31: '布尔值',
  32: '地理位置',
  33: '百分比',
  34: '多态关联',
  38: '日期范围',
  39: '附件/文件',
  40: '富文本',
  41: '多值关联',
  99: '业务维度',
};

import { AiAgentPreset, AiHarnessSettings, AiProviderConfig } from './types';

/**
 * 默认预置的大模型供应商 (参考 DeepSeek Harness 架构)
 */
export const BUILTIN_AI_PROVIDERS: AiProviderConfig[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek 官方平台',
    type: 'official-deepseek',
    protocol: 'openai-completions',
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
    enabled: true,
    website: 'https://platform.deepseek.com/',
    description: 'DeepSeek 官方大模型 API，支持 DeepSeek-V3 极速通用模型与 DeepSeek-R1 深度推理模型。',
    models: [
      { id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash', reasoning: true, tools: true, contextWindow: 1048576, maxOutputTokens: 393216 },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', reasoning: true, tools: true, contextWindow: 1048576, maxOutputTokens: 393216 },
      {
        id: 'deepseek-chat',
        name: 'DeepSeek-V3 (deepseek-chat)',
        reasoning: false,
        tools: true,
        contextWindow: 65536,
        maxOutputTokens: 8192,
      },
      {
        id: 'deepseek-reasoner',
        name: 'DeepSeek-R1 深度推理 (deepseek-reasoner)',
        reasoning: true,
        tools: false,
        contextWindow: 65536,
        maxOutputTokens: 8192,
      },
    ],
  },
  {
    id: "workbuddy",
    name: "WorkBuddy2API-Hub (腾讯 WorkBuddy / CodeBuddy)",
    type: "builtin-thirdparty",
    protocol: "openai-completions",
    baseUrl: "http://127.0.0.1:8788/v1",
    apiKey: "",
    enabled: true,
    description: "WorkBuddy2API-Hub 多账号网关中枢：聚合腾讯 WorkBuddy (国际版 workbuddy.ai) 与 CodeBuddy (国内版 codebuddy.cn)，提供标准 OpenAI 兼容接口，支持 DeepSeek-V4.1-Flash、GPT-6-Astra、GPT-5.3-Codex、GLM-5.3 等全量官方模型与智能调度。",
    models: [
      {
        id: "default-model",
        name: "Auto (智能自动调度)",
        reasoning: true,
        tools: true,
        contextWindow: 176000,
        maxOutputTokens: 24000,
      },
      {
        id: "deepseek-v4.1-flash",
        name: "DeepSeek-V4.1-Flash (全能编码·极速)",
        reasoning: true,
        tools: true,
        contextWindow: 176000,
        maxOutputTokens: 24000,
      },
      {
        id: "deepseek-v4-pro",
        name: "DeepSeek-V4-Pro (国内旗舰·深度)",
        reasoning: true,
        tools: true,
        contextWindow: 176000,
        maxOutputTokens: 24000,
      },
      {
        id: "deepseek-r1-0528",
        name: "DeepSeek-R1 (深度推理)",
        reasoning: true,
        tools: false,
        contextWindow: 65536,
        maxOutputTokens: 8192,
      },
      {
        id: "gpt-6-astra",
        name: "GPT-6-Astra (前沿预览)",
        reasoning: true,
        tools: true,
        contextWindow: 200000,
        maxOutputTokens: 32000,
      },
      {
        id: "gpt-5.3-codex",
        name: "GPT-5.3-Codex (代码专精)",
        reasoning: true,
        tools: true,
        contextWindow: 200000,
        maxOutputTokens: 32000,
      },
      {
        id: "glm-5.3",
        name: "GLM-5.3 (智谱旗舰)",
        reasoning: true,
        tools: true,
        contextWindow: 128000,
        maxOutputTokens: 16384,
      },
      {
        id: "kimi-k3",
        name: "Kimi-K3 (长文本推理)",
        reasoning: true,
        tools: true,
        contextWindow: 200000,
        maxOutputTokens: 32000,
      },
      {
        id: "hy4-preview",
        name: "腾讯混元 Hy4 Preview",
        reasoning: true,
        tools: true,
        contextWindow: 176000,
        maxOutputTokens: 24000,
      },
      {
        id: "fast-model",
        name: "Fast (轻量速答)",
        reasoning: true,
        tools: true,
        contextWindow: 200000,
        maxOutputTokens: 32000,
      },
      {
        id: "primary-model",
        name: "Primary (主力编码)",
        reasoning: true,
        tools: true,
        contextWindow: 200000,
        maxOutputTokens: 32000,
      },
      {
        id: "deep-model",
        name: "Deep (深度思考)",
        reasoning: true,
        tools: false,
        contextWindow: 200000,
        maxOutputTokens: 32000,
      },
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini 官方',
    type: 'builtin-thirdparty',
    protocol: 'google-gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: '',
    enabled: false,
    website: 'https://aistudio.google.com/app/apikey',
    description: 'Google 官方 Gemini 大模型 (AI Studio)，支持 Gemini 2.5 Pro / Flash 超长上下文、原生深度思考与工具调用。',
    models: [
      { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', reasoning: true, tools: true, contextWindow: 1048576, maxOutputTokens: 65536 },
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro (旗舰推理与编码)',
        reasoning: true,
        tools: true,
        contextWindow: 1048576,
        maxOutputTokens: 65536,
      },
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash (高速全能)',
        reasoning: true,
        tools: true,
        contextWindow: 1048576,
        maxOutputTokens: 65536,
      },
      {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash (极速响应)',
        reasoning: false,
        tools: true,
        contextWindow: 1048576,
        maxOutputTokens: 8192,
      },
      {
        id: 'gemini-2.0-flash-thinking-exp',
        name: 'Gemini 2.0 Flash Thinking (深度思考)',
        reasoning: true,
        tools: false,
        contextWindow: 1048576,
        maxOutputTokens: 65536,
      },
    ],
  },
  {
    id: 'siliconflow',
    name: '硅基流动 (SiliconFlow)',
    type: 'builtin-thirdparty',
    protocol: 'openai-completions',
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKey: '',
    enabled: false,
    website: 'https://cloud.siliconflow.cn/',
    description: '国内高速大模型托管云，包含高速满血 DeepSeek-V3/R1 与 Qwen 系列开源模型。',
    models: [
      {
        id: 'deepseek-ai/DeepSeek-V3',
        name: 'DeepSeek-V3 满血版',
        reasoning: false,
        tools: true,
        contextWindow: 65536,
        maxOutputTokens: 8192,
      },
      {
        id: 'deepseek-ai/DeepSeek-R1',
        name: 'DeepSeek-R1 深度思考',
        reasoning: true,
        tools: false,
        contextWindow: 65536,
        maxOutputTokens: 8192,
      },
      {
        id: 'Qwen/Qwen2.5-72B-Instruct',
        name: '通义千问 2.5 72B',
        reasoning: false,
        tools: true,
        contextWindow: 32768,
        maxOutputTokens: 4096,
      },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI 官方',
    type: 'builtin-thirdparty',
    protocol: 'openai-completions',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    enabled: false,
    website: 'https://platform.openai.com/',
    description: 'OpenAI 官方 API 服务，支持 GPT-4o、o3-mini 等高智能模型。',
    models: [
      {
        id: 'gpt-4o',
        name: 'GPT-4o (全能旗舰)',
        reasoning: false,
        tools: true,
        contextWindow: 128000,
        maxOutputTokens: 16384,
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini (轻量极速)',
        reasoning: false,
        tools: true,
        contextWindow: 128000,
        maxOutputTokens: 16384,
      },
      {
        id: 'o3-mini',
        name: 'o3-mini (高级推理思考)',
        reasoning: true,
        tools: true,
        contextWindow: 200000,
        maxOutputTokens: 65536,
      },
    ],
  },
  {
    id: 'moonshot',
    name: '月之暗面 (Kimi / Moonshot)',
    type: 'builtin-thirdparty',
    protocol: 'openai-completions',
    baseUrl: 'https://api.moonshot.cn/v1',
    apiKey: '',
    enabled: false,
    website: 'https://platform.moonshot.cn/',
    description: 'Moonshot 长文本与上下文理解大模型。',
    models: [
      {
        id: 'kimi-k2-0711-preview',
        name: 'Kimi K2 Preview',
        reasoning: false,
        tools: true,
        contextWindow: 131072,
        maxOutputTokens: 8192,
      },
      {
        id: 'moonshot-v1-32k',
        name: 'Moonshot v1 32k',
        reasoning: false,
        tools: true,
        contextWindow: 32768,
        maxOutputTokens: 4096,
      },
      {
        id: 'moonshot-v1-128k',
        name: 'Moonshot v1 128k',
        reasoning: false,
        tools: true,
        contextWindow: 131072,
        maxOutputTokens: 8192,
      },
    ],
  },
  {
    id: 'zhipu',
    name: '智谱清言 (GLM / BigModel)',
    type: 'builtin-thirdparty',
    protocol: 'openai-completions',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKey: '',
    enabled: false,
    website: 'https://open.bigmodel.cn/',
    description: '智谱 AI 开放平台，支持 GLM-4-Plus 与 GLM-Zero 深度思考。',
    models: [
      {
        id: 'glm-4-plus',
        name: 'GLM-4 Plus 旗舰版',
        reasoning: false,
        tools: true,
        contextWindow: 128000,
        maxOutputTokens: 4096,
      },
      {
        id: 'glm-4-flash',
        name: 'GLM-4 Flash 极速免费版',
        reasoning: false,
        tools: true,
        contextWindow: 128000,
        maxOutputTokens: 4096,
      },
      {
        id: 'glm-zero-preview',
        name: 'GLM-Zero 深度推理',
        reasoning: true,
        tools: false,
        contextWindow: 32768,
        maxOutputTokens: 8192,
      },
    ],
  },
  {
    id: 'dashscope',
    name: '阿里云百炼 (通义千问)',
    type: 'builtin-thirdparty',
    protocol: 'openai-completions',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: '',
    enabled: false,
    website: 'https://bailian.console.aliyun.com/',
    description: '阿里巴巴通义千问兼容 OpenAI 协议接口，支持超长上下文与 QwQ 深度推理。',
    models: [
      {
        id: 'qwen-max',
        name: '通义千问 Max 旗舰',
        reasoning: false,
        tools: true,
        contextWindow: 32768,
        maxOutputTokens: 8192,
      },
      {
        id: 'qwen-plus',
        name: '通义千问 Plus 均衡',
        reasoning: false,
        tools: true,
        contextWindow: 131072,
        maxOutputTokens: 8192,
      },
      {
        id: 'qwq-32b',
        name: 'QwQ 32B 深度思考',
        reasoning: true,
        tools: false,
        contextWindow: 32768,
        maxOutputTokens: 8192,
      },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    type: 'builtin-thirdparty',
    protocol: 'anthropic-messages',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKey: '',
    enabled: false,
    website: 'https://console.anthropic.com/',
    description: 'Anthropic 官方 Claude 系列大模型。',
    models: [
      {
        id: 'claude-3-7-sonnet-latest',
        name: 'Claude 3.7 Sonnet (混合思考)',
        reasoning: true,
        tools: true,
        contextWindow: 200000,
        maxOutputTokens: 8192,
      },
      {
        id: 'claude-3-5-sonnet-latest',
        name: 'Claude 3.5 Sonnet',
        reasoning: false,
        tools: true,
        contextWindow: 200000,
        maxOutputTokens: 8192,
      },
      {
        id: 'claude-3-5-haiku-latest',
        name: 'Claude 3.5 Haiku (超轻速)',
        reasoning: false,
        tools: true,
        contextWindow: 200000,
        maxOutputTokens: 8192,
      },
    ],
  },
];

/**
 * 默认系统偏好设置
 */
export const DEFAULT_AI_SETTINGS: AiHarnessSettings = {
  defaultProviderId: 'deepseek',
  defaultModelId: 'deepseek-chat',
  temperature: 0.3,
  maxTokens: 4096,
  contextLimit: 20,
  stream: true,
  enableCrmTools: true,
  enableSqlTool: true,
  injectTenantContext: true,
  customSystemPrompt: '',
  defaultStartupTab: 'dashboard',
  defaultSqlLimit: 100,
};

/**
 * 5 大内置 Agent 预设角色 (Harness Agent Presets)
 */
export const AI_AGENT_PRESETS: AiAgentPreset[] = [
  {
    id: "nex-architect",
    name: "Nex页面扩展大师 (Nex Architect)",
    description: "NeoCRM NEX 1.0/2.0 标准页面扩展代码开发专家 (neo-nex-dev)：基于 neo CLI，针对对象表单、列表、详情、首页通过 view(ctx, props) 覆盖属性/挂事件，实现字段联动、校验、自定义按钮与安全部署",
    iconName: "LayoutTemplate",
    badge: "Nex部署大师",
    enableCrmTools: true,
    recommendedModel: "deepseek-chat",
    systemPrompt: `[PROTECTED_PRESET::nex-architect]`,
    quickPrompts: [
      "请为【商机】(newOpportunity) 的新建/编辑表单设计一套当阶段变更为赢单时必填赢单原因的 Nex 2.0 扩展代码",
      "为【客户】(account) 详情页设计一个调用自定义 REST 接口并弹出 Toast 确认的 Nex 按钮扩展",
      "如何用 neo CLI 查询、生成、检索与发布表单及列表页的 NEX 扩展代码？",
      "查询当前租户已部署的 NEX 扩展代码列表，并在本地生成增量升级代码与部署草案",
    ],
  },
  {
    id: "neobi-architect",
    name: "BI分析部署大师 (NeoBI Architect)",
    description: "销售易智能分析 (NeoBI / v2.0) 全生命周期代码级部署大师：精通数据源建模、21类图表配置、双套配置 (web.dataConfig + server)、多看板布局、联动下钻、指标计算、外部对象及代码级部署与独立查询验收",
    iconName: "BarChart3",
    badge: "BI部署大师",
    enableCrmTools: true,
    recommendedModel: "deepseek-chat",
    systemPrompt: `[PROTECTED_PRESET::neobi-architect]`,
    quickPrompts: [
      "请为【销售业绩分析】设计一套包含商机与客户双表左连接的数据源及漏斗图配置方案",
      "如何用代码配置包含按月趋势折线图、部门排行榜与关键 KPI 的 NeoBI 智能分析看板？",
      "说明 NeoBI 视图模型中 web.dataConfig 与 server 双套配置的映射规则与防丢配置铁律",
      "为当前租户规划一套包含看板全局时间筛选、图表联动、维度下钻与详情穿透的报表交付链",
    ],
  },
  {
    id: "approval-architect",
    name: "审批流架构与部署专家 (Approval Flow)",
    description: "面向业务管理员的 NeoCRM 审批流设计助手 (neo-approval-flow-designer)：把业务需求或 ApprovalList/1.0 Excel 转成可审阅审批方案，支持查询既有流程、校验、经确认创建设计态流程与安全版本管理",
    iconName: "FileCheck",
    badge: "审批流专精",
    enableCrmTools: true,
    recommendedModel: "deepseek-chat",
    systemPrompt: `[PROTECTED_PRESET::approval-architect]`,
    quickPrompts: [
      "请为【合同】(contract) 设计一套基于合同金额与折扣率分流的多级审批流方案",
      "根据我提供的审批需求或 Excel 流程清单，进行合法性校验并生成设计态审批流草案",
      "查询当前租户已存在的审批流定义列表，分析其审批人策略与流转分支",
      "如何通过 neo CLI 管理审批流版本、执行 check 预检并安全创建设计态流程？",
    ],
  },
  {
    id: "print-template-architect",
    name: "打印模板架构与设计专家 (Print Template)",
    description: "销售易打印模板全生命周期专家：精通 Word/Excel 模板标记语法、主子明细嵌套循环、打印条件、图片水印与代码级配置全流程",
    iconName: "Printer",
    badge: "打印专精",
    enableCrmTools: true,
    recommendedModel: "deepseek-chat",
    systemPrompt: `[PROTECTED_PRESET::print-template-architect]`,
    quickPrompts: [
      "请为【合同】(contract) 设计一套包含主信息、产品明细列表与签章的 Word 打印模板规范",
      "如何编写包含二级明细循环与图片水印的销售易 Word 打印模板标记？",
      "查询当前租户支持打印模板的业务对象，以及现有模板资产现状",
      "为【报价单】(quote) 规划带格式化时间与条件显示的 Excel 打印模板方案",
    ],
  },
  {
    id: "autoflow-architect",
    name: "自动流程架构与部署专家 (Automatic Flow)",
    description: "销售易自动流程 (procType=1) 全生命周期专家：精通方案分析、拓扑与变量设计、代码级配置部署与运行验证",
    iconName: "Workflow",
    badge: "工作流专精",
    enableCrmTools: true,
    recommendedModel: "deepseek-chat",
    systemPrompt: `[PROTECTED_PRESET::autoflow-architect]`,
    quickPrompts: [
      "请为【服务工单】设计一套创建或更新时自动分流派单的自动流程方案",
      "根据文档规范，如何用代码配置一个包含查询关联记录、循环处理和字段回写的自动流程？",
      "对比销售易自动流程 (automaticflow)、触发器 (Trigger) 与审批流 (approvalFlow) 的适用场景",
      "我需要设计一个商机赢单时批量创建交付任务并发送通知的自动流程并生成部署方案",
    ],
  },
  {
    id: 'harness-agent',
    name: '全能 CRM 架构师 (Universal CRM Agent)',
    description: '全域多平台 CRM 核心智能体：动态感知当前连接的 CRM 平台与账号环境（销售易、Salesforce、纷享销客等），支持跨平台数据查询、自动化流与代码开发',
    iconName: 'Sparkles',
    badge: '全域推荐',
    enableCrmTools: true,
    recommendedModel: 'deepseek-chat',
    systemPrompt: `你是一个具备多平台架构能力的全能 CRM 资深架构师兼全栈开发者（Universal CRM Agent），运行在开发者桌面工作台环境内。
你可以连接并管理多个 CRM 平台的连接器账号（销售易 NeoCRM、Salesforce、纷享销客 FXIAOKE 等），并根据当前连接器自动切换专业架构视角：
1. 销售易平台 (NeoCRM PaaS)：熟练掌握其 PaaS 元数据模型、XOQL 语法（严禁 SELECT * 与 JOIN，支持点号穿透）、Creek Flow 自动流程与审批流、打印模板引擎规范。
2. Salesforce 平台 (Force.com / Core CRM)：熟练掌握标准与自定义对象 (__c)、SOQL/SOSL 查询语法、Record-Triggered Flow、Apex 触发器开发规范及严格的生产安全操作准则。
3. 纷享销客平台 (FXIAOKE / sharecrm)：遵循其 OpenAPI v2 客户端凭据模式（appId + appSecret + permanentCode）与 sharecrm CLI 规范，掌握核心对象（AccountObj, ContactObj, ContractObj 等）与大批量分页对账规则。
4. 【实时工具调用第一准则】：当连接到任何 CRM 平台（销售易、Salesforce、纷享销客等）时，凡是涉及查询租户对象信息、字段元数据或业务数据，必须第一时间调用工具（list_entities、get_entity_fields、execute_sql_query）执行接口获取真实数据，严禁仅输出概念性说明！`,
    quickPrompts: [
      '检查当前已连接的 CRM 平台环境与连接器账号状态',
      '帮我分析当前连接平台的主对象与核心字段结构',
      '根据当前 CRM 平台特性，编写一条安全的数据检索查询',
      '为当前平台设计一套标准业务对象与主子表关联模型',
    ],
  },
  {
    id: 'salesforce-architect',
    name: 'Salesforce 架构与自动化专家 (Salesforce)',
    description: 'Salesforce 全生态架构专家：精通 SOQL/SOSL 查询、标准与自定义对象 (__c)、Flow 自动化流、Apex 触发器与安全审计',
    iconName: 'Cloud',
    badge: 'Salesforce',
    enableCrmTools: true,
    recommendedModel: 'deepseek-chat',
    systemPrompt: `[PROTECTED_PRESET::salesforce-architect]`,
    quickPrompts: [
      '用 SOQL 编写查询最近 10 个未完结的商机及其关联客户与阶段信息',
      '如何配置一个在商机赢单时自动创建交付任务并发送通知的 Record-Triggered Flow？',
      '设计一套自定义对象 Project__c 与 Milestone__c 的主子表结构与汇总字段 (Roll-Up Summary)',
      '编写一个规范的 Apex 触发器 Handler 模板，包含防递归控制与批量化 (Bulkify) 最佳实践',
    ],
  },
  {
    id: 'fxiaoke-architect',
    name: '纷享销客架构与对接专家 (FXIAOKE)',
    description: '纷享销客开放平台专家：精通 OpenAPI v2 客户端凭据模式授权、自建应用对接、对象 API 调用与数据治理',
    iconName: 'Flame',
    badge: '纷享销客',
    enableCrmTools: true,
    recommendedModel: 'deepseek-chat',
    systemPrompt: `[PROTECTED_PRESET::fxiaoke-architect]`,
    quickPrompts: [
      '基于 OpenAPI v2 客户端凭证模式，说明如何通过 appId + appSecret + permanentCode 获取访问令牌',
      '编写使用 sharecrm CLI 统计今年已签约合同 (ContractObj) 总金额的查询与汇总脚本',
      '查询纷享销客客户 (AccountObj) 与联系人 (ContactObj) 的对象定义与字段列表',
      '如何通过 OpenAPI 实现销售订单 (SalesOrderObj) 数据回写与状态流转？',
    ],
  },
  {
    id: 'sql-builder',
    name: 'SQL / XOQL 智能构建专家',
    description: '专注于销售易 SQL 查询编写、关联字段查询 (Lookup.name)、聚合统计与条件筛选',
    iconName: 'Database',
    badge: 'SQL专精',
    enableCrmTools: true,
    recommendedModel: 'deepseek-chat',
    systemPrompt: `你是一个精通销售易 (NeoCRM) XOQL / SQL 查询的专业数据分析师。
【销售易 XOQL 核心语法规范（必须严格遵守）】：
1. 严禁使用 SELECT *（必须显式指定字段名），严禁使用 JOIN / LEFT JOIN / INNER JOIN 语法！
2. 跨对象关联字段查询使用点号穿透（Lookup Dot-Notation）：
   - 例如查询负责人姓名：ownerId.name、创建人姓名：createdBy.name、所属部门：dimDepart.departName
   - 查询关联客户名称：accountId.accountName（注意客户对象的名称字段是 accountName 而非 name！）
3. 销售易标准对象主名称字段对照表：
   - 客户 (account) -> accountName
   - 联系人 (contact) -> contactName
   - 销售机会/商机 (opportunity) -> opportunityName
   - 销售线索 (lead) -> name, companyName
   - 订单 (order) -> po
   - 合同 (contract) -> title
   - 产品 (product) -> productName
   - 部门 (department) -> departName
   - 用户 (user) 及自定义对象 (*__c) -> name
4. 聚合与分组规范：
   - 支持 COUNT(id)、SUM(field)、AVG(field)、MAX(field)、MIN(field) 与 GROUP BY；
   - 【重要】：ORDER BY 和 HAVING 中严禁直接写聚合列别名（如 ORDER BY cnt DESC 会报错），必须写原聚合表达式（如 ORDER BY COUNT(id) DESC）。
5. 日期与选项值规范：
   - 日期时间字段（createdAt、updatedAt、closeDate 等）底层存储为 13 位毫秒级时间戳；
   - 空值过滤必须使用 IS NULL 或 IS NOT NULL；
   - 编写 SQL 前，若不确定目标对象的字段 API Key，请先调用 get_entity_fields 工具核实真实字段列表。
6. 编写 SQL 时请包裹在标准 sql 代码块中，清晰说明查询字段含义与过滤逻辑。`,
    quickPrompts: [
      '写一条查询今年所有已赢单商机及所属客户名称的 SQL',
      '查询最近创建的 50 条客户记录，包含负责人和创建时间',
      '帮我统计各个行业分类下的客户数量分布',
      '如何编写查询某客户下所有联系人与历史跟进记录的关联 SQL',
    ],
  },
  {
    id: 'schema-designer',
    name: '实体模型与字段设计器',
    description: '根据业务场景规划业务对象 (Entity)、字段类型、主子明细关系与自动编号规则',
    iconName: 'Box',
    badge: '数据建模',
    enableCrmTools: true,
    recommendedModel: 'deepseek-chat',
    systemPrompt: `你是一个销售易 PaaS 数据模型与实体关系架构专家。
你可以帮助用户根据业务需求设计业务实体与字段。
规范与要求：
1. 业务实体规范：对象 API Key 规范以小写英文驼峰或加 __c 后缀（如 serviceTicket__c）。
2. 字段类型代码 (itemType)：文本:1, 文本域:2, 单选:3, 多选:4, 整数:5, 金额:6, 日期:7, 日期时间:8, 自动编号:9, 关联关系:10, 图片:14, 电话:16, 邮箱:17, 网址:18, 布尔:31。
3. 首先输出结构清晰的 Markdown 表格和分析说明。
4. 【关键要求】：当你为用户设计了一套具体的新实体或新字段方案时，请在回答的末尾使用 【json:schema-plan】 代码块输出完整的结构化配置，工作台将自动为用户生成「一键在租户中创建此对象与字段」的确认对话框！
输出格式范例：
标准格式 【json:schema-plan】
{
  "entity": {
    "apiKey": "equipmentRepair__c",
    "label": "设备维保单",
    "description": "设备售后维保与维修记录",
    "autoNumberFormat": "REP-{YYYY}{MM}{DD}-{0000}",
    "enableScriptExecutor": true,
    "enableBusitype": false
  },
  "fields": [
    { "apiKey": "repairTitle__c", "label": "维保主题", "itemType": 1, "typeName": "单行文本", "maxLength": 100 },
    { "apiKey": "account__c", "label": "关联客户", "itemType": 10, "typeName": "关联关系", "referObjectApiKey": "account" },
    { "apiKey": "repairCost__c", "label": "维修费用", "itemType": 6, "typeName": "金额", "decimal": 2 },
    { "apiKey": "repairStatus__c", "label": "处理状态", "itemType": 3, "typeName": "单选列表", "pickOption": [{ "optionLabel": "待处理", "optionCode": 1 }, { "optionLabel": "处理中", "optionCode": 2 }, { "optionLabel": "已完成", "optionCode": 3 }] }
  ]
}
`,
    quickPrompts: [
      '帮我设计一套【设备维保管理】业务对象与核心字段表',
      '规划一个主子明细关系的对象（如采购订单与订单行明细）',
      '设计客户档案增加多个维度的评级和信用字段',
      '如何设计一个支持多业务类型的合同审批对象？',
    ],
  },

];

import { McpServerConfig, AiSkillItem } from "./types";

/**
 * 默认预置的 MCP 服务器 (Model Context Protocol)
 * 注意: 内置本地服务由桌面内核底层托管，不向前端暴露内部工具清单与调用签名
 */
export const BUILTIN_MCP_SERVERS: McpServerConfig[] = [
  {
    id: "neocrm-paas-mcp",
    name: "NeoCRM 销售易 PaaS 本地服务 (内置)",
    description: "提供当前已连接租户的事实感知、实体元数据检索、字段字典定义与只读 SQL 执行能力（已受桌面内核沙箱保护）。",
    type: "builtin",
    enabled: true,
    tools: [],
  },
];

/**
 * 默认预置的系统技能 (Built-in Skills)
 * 注意: 核心系统指令已移入桌面内核安全沙箱混淆保护，绝不向渲染进程或配置文件明文暴露
 */
export const BUILTIN_AI_SKILLS: AiSkillItem[] = [
  { id: 'skill-neo-page-code-management', name: '销售易页面代码管理', description: '页面代码包下载、修改、上传及回读流程；需要可用浏览器或用户在后台操作。', category: 'builtin', iconName: 'FileCode', enabled: true, triggerKeywords: ['页面代码', '页面代码包', 'pageCode', '页面安装包'] },
  {
    id: 'skill-diagram-design', name: 'Diagram Design 图表设计',
    description: '基于 Diagram Design 生成架构图、流程图、时序图、ER 图、泳道图等 SVG 图表，按需读取设计参考，支持重绘 draw.io、Mermaid 和 Excalidraw。',
    category: 'builtin', iconName: 'Workflow', enabled: true,
    triggerKeywords: ['diagram', '架构图', '流程图', '时序图', '泳道图', 'ER图', 'draw.io', 'Excalidraw', '图表设计'],
  },
  {
    id: 'skill-document-reader', name: '文档阅读与核对',
    description: '读取 Excel、Word、PDF、PPT 和文本资料，按工作表、页码或幻灯片分段核对，保留来源及解析限制。',
    category: 'builtin', iconName: 'FileText', enabled: true,
    triggerKeywords: ['Excel', 'Word', 'PDF', 'PPT', '文档', '表格', '读取文件', '幻灯片'],
  },
  {
    id: 'skill-neobi-architect', name: 'BI 分析部署规范',
    description: 'BI 分析方案设计、配置验证与部署规范。',
    category: 'builtin', iconName: 'BarChart3', triggerKeywords: [], enabled: true,
  },
  {
    id: 'skill-autoflow-architect', name: '自动流程架构与部署规范',
    description: '自动流程节点、变量和部署验证规范。',
    category: 'builtin', iconName: 'Workflow', triggerKeywords: [], enabled: true,
  },
  {
    id: 'skill-manage-neocrm-permissions', name: '销售易用户及权限管理',
    description: '配置用户生命周期、角色、职能、许可、公共组、共享范围与权限审计，构造请求并核对实际权限效果。',
    category: 'builtin', iconName: 'ShieldCheck', enabled: true,
    triggerKeywords: ['用户管理', '权限管理', '角色权限', '职能', '许可分配', '公共组', '共享规则'],
  },
  {
    id: 'skill-configure-neocrm-mobile', name: '销售易移动端配置',
    description: '配置移动 APP、导航、首页、详情和列表布局、职能分配、外观与离线包，区分后台回读和真机验证。',
    category: 'builtin', iconName: 'Smartphone', enabled: true,
    triggerKeywords: ['移动端配置', '移动APP', '移动导航', 'NeoH5', '移动布局', '离线包'],
  },
  // 1. 审批流与 NEX 核心替换技能 (官方 neo CLI 最新技能包)
  {
    id: "skill-neo-approval-flow-designer",
    name: "销售易审批流设计助手 (neo-approval-flow-designer)",
    description: "面向业务管理员的 NeoCRM 审批流设计助手。把一句业务需求或 ApprovalList/1.0 Excel 转成可审阅的审批方案，支持查询既有流程、校验、经确认创建设计态流程，以及安全地管理版本和启停。",
    category: "builtin",
    iconName: "FileCheck",
    triggerKeywords: ["审批流", "审批流设计", "approvalprocess", "ApprovalList", "审批人策略", "退回驳回", "设计态流程"],
    enabled: true,
  },
  {
    id: "skill-neo-nex-dev",
    name: "销售易 NEX 页面扩展代码开发 (neo-nex-dev)",
    description: "NeoCRM NEX 1.0/2.0 标准页面扩展代码开发技能（基于 neo CLI）。针对对象表单、列表、详情、首页通过 view(ctx, props) 覆盖属性/挂事件，运行时深合并生效，实现字段联动、条件显隐、保存校验、自定义按钮与安全部署。",
    category: "builtin",
    iconName: "LayoutTemplate",
    triggerKeywords: ["NEX", "扩展代码", "表单扩展", "列表扩展", "详情扩展", "首页扩展", "beforeSave", "onChange", "字段联动", "view(ctx,props)"],
    enabled: true,
  },

  // 2. 销售易 neocrm-cli 官方全套技能包 (全量内置)
  {
    id: "skill-neo-cli-usage",
    name: "neocrm-cli 命令行工具链 (neo-cli-usage)",
    description: "neocrm-cli（neo 命令）使用技能。NeoCRM（销售易）是同一款产品；neocrm-cli 是该产品面向开发者提供的命令行工具。执行或解释 neo 命令、查询/部署/检索 NeoCRM 元数据、排查 neo 环境，覆盖 CLI 完整工作流。",
    category: "builtin",
    iconName: "Terminal",
    triggerKeywords: ["neo", "neocrm-cli", "neo命令", "CLI", "命令行", "元数据部署", "neo retrieve", "neo deploy"],
    enabled: true,
  },
  {
    id: "skill-neo-backend-dev",
    name: "销售易后端 PaaS 开发与触发器 (neo-backend-dev)",
    description: "Neo 后端 PaaS 开发技能（基于 neocrm CLI 的 codepackage 命令）。当需要查询数据（SQL/XOQL）或执行 DML 操作、开发 Trigger 触发器、自定义 REST API、计划作业、流程扩展脚本，使用 FutureTask、BatchJobPro 等 SDK 工具类时使用。",
    category: "builtin",
    iconName: "Code2",
    triggerKeywords: ["后端开发", "Trigger", "触发器", "PaaS", "REST API", "codepackage", "FutureTask", "BatchJobPro"],
    enabled: true,
  },
  {
    id: "skill-neo-entity-management",
    name: "销售易实体模型与字段字典 (neo-entity-management)",
    description: "Neo 实体模型管理技能。查询实体定义、字段类型与关联，创建实体与字段，查询、创建、更新和部署业务类型，设计数据模型。",
    category: "builtin",
    iconName: "Box",
    triggerKeywords: ["实体管理", "业务对象", "字段定义", "自定义实体", "数据字典", "创建字段", "实体关系", "业务类型", "businessType", "busiType"],
    enabled: true,
  },
  {
    id: "skill-neo-layout-management",
    name: "销售易后台页面布局管理 (neo-layout-management)",
    description: "CRM 后台布局管理技能（表单布局 + 详情页布局 + 列表布局）。管理布局字段、组件池、视图分配、字段规则与影响分析。",
    category: "builtin",
    iconName: "Layers",
    triggerKeywords: ["布局管理", "表单布局", "详情页布局", "列表布局", "视图分配", "布局规则"],
    enabled: true,
  },
  {
    id: "skill-neo-entity-rule-management",
    name: "销售易字段默认值与校验查重 (neo-entity-rule-management)",
    description: "设计并以 neocrm-cli 管理 NeoCRM 对象的字段默认值、校验规则和查重规则。覆盖业务语义澄清、source 元数据生成、现状拉取、部署与回读。",
    category: "builtin",
    iconName: "ShieldCheck",
    triggerKeywords: ["字段默认值", "校验规则", "查重规则", "业务规则", "validateExpression"],
    enabled: true,
  },
  {
    id: "skill-neo-formula-dev",
    name: "销售易公式字段与父子汇总 (neo-formula-dev)",
    description: "用于 NeoCRM 公式字段、本地父子汇总字段 source 与校验规则表达式。校验规则使用 validateExpression 的 validateType=4，计算字段使用 validateType=2/3，汇总字段使用 aggregateFormula 直接创建更新。",
    category: "builtin",
    iconName: "Sparkles",
    triggerKeywords: ["公式字段", "计算字段", "父子汇总", "aggregateFormula", "公式开发"],
    enabled: true,
  },
  {
    id: "skill-neo-frontend-dev",
    name: "销售易前端自定义组件开发 (neo-frontend-dev)",
    description: "Neo 前端自定义组件开发技能（React 16 + TypeScript，基于 neo CLI）。开发、改造或发布 NeoCRM 自定义组件，配置 model.ts/propsSchema，接入平台实体或自定义 API，编写事件动作与样式隔离。",
    category: "builtin",
    iconName: "Code2",
    triggerKeywords: ["前端组件", "React", "自定义组件", "model.ts", "propsSchema", "NeoEntityGrid"],
    enabled: true,
  },
  {
    id: "skill-neo-global-pick-management",
    name: "销售易通用选项集管理 (neo-global-pick-management)",
    description: "使用 neo CLI 发现、创建、同步、预演和部署 NeoCRM 通用选项集（Global Pick）。当需要复用、新建、修改、停用或验证通用选项集时使用。",
    category: "builtin",
    iconName: "Database",
    triggerKeywords: ["通用选项集", "Global Pick", "选项集", "枚举管理", "复用选项"],
    enabled: true,
  },
  {
    id: "skill-neo-platform-capabilities",
    name: "销售易平台能力与知识检索 (neo-platform-capabilities)",
    description: "NeoCRM 平台能力与开发知识检索技能。当询问 NeoCRM 是否支持某项功能、审批流/API/NEX/组件/数据模型能力、平台约束或实现方式时使用。通过 neo platform search 验证。",
    category: "builtin",
    iconName: "Sparkles",
    triggerKeywords: ["平台能力", "开发知识", "能力检索", "平台约束", "实现方式"],
    enabled: true,
  },
  {
    id: "skill-neo-solution-design",
    name: "销售易项目方案设计与架构 (neo-solution-design)",
    description: "Neo 项目方案设计技能（基于 neo 工具链）。分析业务需求并拆解为技术任务，设计前后端组件架构、自定义 API 接口、数据模型和实体关系，输出技术方案文档。",
    category: "builtin",
    iconName: "Workflow",
    triggerKeywords: ["方案设计", "技术架构", "PRD推导", "前后端架构", "技术方案文档"],
    enabled: true,
  },
  {
    id: "skill-neo-task-summary",
    name: "销售易任务总结与交付回顾 (neo-task-summary)",
    description: "Neo 任务总结技能，辅助生成结构化的任务回顾文档，总结开发任务与执行问题，沉淀交付资产。",
    category: "builtin",
    iconName: "FileText",
    triggerKeywords: ["任务总结", "执行回顾", "任务文档", "开发回顾"],
    enabled: true,
  },

  // 3. 打印模板、多平台 CRM 与基础建模技能
  {
    id: "skill-print-template-engineer-perspective",
    name: "销售易打印模板实测型工程师视角规范",
    description: "植入销售易打印模板实测型工程师认知：证据边界优先（代码存在、请求返回、回读落库、最终PDF内容四层证据）、Word/Excel语法隔离、主子明细物理表格循环、图片水印及不可逆风险防控。",
    category: "builtin",
    iconName: "Printer",
    triggerKeywords: ["打印模板", "打印", "Word模板", "Excel模板", "明细循环", "套打", "PDF导出"],
    enabled: true,
  },
  {
    id: "skill-salesforce-cli",
    name: "Salesforce CLI (sf) 架构与安全操作规范",
    description: "基于官方 sf v2 工具链，规范执行 SOQL/SOSL 查询、元数据检索与部署、数据导入导出、Apex 执行与生产安全分级。",
    category: "builtin",
    iconName: "Cloud",
    triggerKeywords: ["Salesforce", "SOQL", "SOSL", "Apex", "Flow", "sf", "Force.com"],
    enabled: true,
  },
  {
    id: "skill-fxiaoke-crm-cli",
    name: "纷享销客 (sharecrm) CLI 与 OpenAPI v2 规范",
    description: "基于 sharecrm CLI 与 OpenAPI v2 规范，执行对象元数据 Describe 探测、SQL 分页查询、聚合指标统计与自建应用直连。",
    category: "builtin",
    iconName: "Flame",
    triggerKeywords: ["纷享销客", "纷享", "sharecrm", "fxiaoke", "AccountObj", "ContractObj"],
    enabled: true,
  },

];
