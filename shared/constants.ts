export const DEFAULT_AUTH_CONFIG = {
  clientId: '04c8b45c4dbe36426a660bf70d3fe3e7',
  clientSecret: '370817d1336a3737f95c671eea39a23b',
  redirectUri: 'http://localhost:1028',
  scope: 'all',
  oauthType: 'standard',
  accessType: 'offline',
};

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
    id: 'harness-agent',
    name: 'NeoCRM 全能架构师 (Harness Agent)',
    description: '连接当前租户环境，支持自动调用元数据与数据工具查对象、查字段、执行 SQL 诊断',
    iconName: 'Sparkles',
    badge: '推荐',
    enableCrmTools: true,
    recommendedModel: 'deepseek-chat',
    systemPrompt: `你是一个专业的销售易 (NeoCRM) 资深架构师兼全栈开发者，运行在 NeoCRM 开发者桌面工作台环境内。
你具备以下核心技能：
1. 精通销售易 PaaS 平台元数据模型（实体对象、自定义对象、字段类型、关联关系等）。
2. 精通销售易 SQL / XOQL 语法体系与查询优化。
3. 当用户询问租户中的对象或字段结构时，若当前开启了 CRM 本地工具，可主动调用工具获取真实环境数据，绝不凭空臆造字段 API Key。
4. 回答始终保持专业、严谨、条理清晰，使用标准 Markdown 格式排版；遇到代码或 SQL 均使用标准代码块标注语言类型。`,
    quickPrompts: [
      '列出当前租户所有的自定义对象并分析结构',
      '帮我查询客户(account)对象的核心字段并写一条查询最近10个客户的SQL',
      '检查当前租户的环境信息与登录状态',
      '我需要设计一个售后工单系统，请规划主子表与关联字段',
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
    systemPrompt: `你是一个精通销售易 (NeoCRM) SQL / XOQL 查询的专业数据分析师。
销售易 SQL 规范与特性：
- 支持标准 SELECT 字段 FROM 对象 WHERE 条件 ORDER BY 排序 LIMIT 限制。
- 关联字段（如 accountId）查询关联对象名称时，销售易支持类似 accountId.name 或直接查 ID 并结合 lookup。
- 绝不使用 DELETE/DROP/UPDATE，只编写查询语句。
- 编写 SQL 时，请包裹在标准 sql 代码块中，并清晰说明各查询字段含义和过滤逻辑。`,
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
  {
    id: 'paas-coder',
    name: 'PaaS 后端脚本与前端组件专家',
    description: '销售易 Java/Groovy 触发器 (Trigger)、自定义 REST API、自定义 React 前端组件 (内测开发中)',
    iconName: 'Code2',
    badge: '暂未开放',
    disabled: true,
    disabledReason: '该预设角色正在进行深度适配与内测，暂未开放使用',
    enableCrmTools: false,
    recommendedModel: 'deepseek-chat',
    systemPrompt: `你是一个精通销售易 NeoCRM PaaS 扩展开发的顶级全栈专家。
你的专长包括：
1. NeoCRM 后端 Trigger 触发器生命周期（beforeInsert, afterInsert, beforeUpdate, afterUpdate 等）。
2. NeoCRM SDK 工具类与 API 规范（DML 批处理、XOQL 查询、FutureTask 异步任务、自定义 REST API 编写）。
3. NeoCRM 前端自定义组件开发规范（React 16/18 + TypeScript，NeoEntityList，propsSchema 等）。
4. 代码必须遵循安全防护准则，包含完整的异常处理与性能考量。`,
    quickPrompts: [
      '编写一个 Trigger：当客户级别变更为VIP时自动创建一条跟进任务',
      '编写一个销售易自定义 REST API：批量接收外部订单并写入系统',
      '提供一个销售易前端自定义组件的基本目录结构与 model.ts 模板',
      '如何使用 NeoCRM SDK 进行跨对象的批量更新与防死锁事务处理？',
    ],
  },
  {
    id: 'deepseek-reasoner',
    name: 'DeepSeek 深度推理与综合分析',
    description: '使用 DeepSeek-R1 完整思考推理链，解决复杂业务逻辑、数学推导与架构设计难题',
    iconName: 'BrainCircuit',
    badge: 'R1 推理',
    enableCrmTools: false,
    recommendedModel: 'deepseek-reasoner',
    systemPrompt: `你是一个具备强大逻辑推理能力的 AI 专家（由 DeepSeek-R1 驱动）。
你会进行深入思考，步步推演，抽丝剥茧地分析复杂的技术架构、业务场景、算法或逻辑漏洞。
请以严密逻辑展现你的推理思考与解决策略。`,
    quickPrompts: [
      '深入分析多租户 CRM 系统在高并发数据同步场景下的数据一致性与幂等设计',
      '对比销售易触发器与工作流自动化的性能瓶颈与适用边界',
      '帮我梳理一套复杂的销售提成多梯度计算公式与规则引擎推导',
      '如何设计一个跨系统（ERP + CRM）主数据双向同步的状态机与补偿机制？',
    ],
  },
];

/**
 * 销售易 Agent Harness 本地工具列表 (给大模型 Function Calling)
 */
export const CRM_HARNESS_TOOLS_SPEC = [
  {
    type: 'function',
    function: {
      name: 'get_tenant_info',
      description: '获取当前用户在工作台中登录的销售易租户信息、环境名称、用户姓名及当前连接状态。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_entities',
      description: '获取当前租户下的所有实体业务对象（标准对象和自定义对象）。可用于查找某个对象是否存在、获取对象的 apiKey 与名称。',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: '可选搜索关键词，用于过滤对象名称或 apiKey，如 "客户" 或 "account"',
          },
          isCustomOnly: {
            type: 'boolean',
            description: '是否只查询自定义对象，默认 false 查询所有',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_entity_fields',
      description: '获取指定业务实体的完整字段列表与元数据详情（包含字段中文名 label、API Key、类型代码 itemType、类型名称、是否必填、关联目标等）。',
      parameters: {
        type: 'object',
        properties: {
          entityApiKey: {
            type: 'string',
            description: '实体对象的 API Key，例如 "account"（客户）、"opportunity"（商机）等',
          },
        },
        required: ['entityApiKey'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_sql_query',
      description: '在当前租户数据库执行只读的销售易 SQL 查询（XOQL），用于检索真实业务数据样本。只允许 SELECT 语句，单次限制返回最多 50 条。',
      parameters: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description: '合法的销售易 SELECT 查询语句，例如 "SELECT id, name, createdAt FROM account LIMIT 10"',
          },
        },
        required: ['sql'],
      },
    },
  },
];

import { McpServerConfig, AiSkillItem } from './types';

/**
 * 默认预置的 MCP 服务器 (Model Context Protocol)
 */
export const BUILTIN_MCP_SERVERS: McpServerConfig[] = [
  {
    id: 'neocrm-paas-mcp',
    name: 'NeoCRM 销售易 PaaS 本地服务 (内置)',
    description: '提供当前已连接租户的事实感知、实体元数据检索、字段字典定义与只读 SQL 执行能力。',
    type: 'builtin',
    enabled: true,
    tools: [
      {
        name: 'get_tenant_info',
        description: '获取当前用户在工作台中登录的销售易租户信息、环境名称与连接状态。',
      },
      {
        name: 'list_entities',
        description: '获取当前租户下的所有实体业务对象（标准对象和自定义对象）。',
      },
      {
        name: 'get_entity_fields',
        description: '获取指定业务实体的完整字段列表与元数据详情。',
      },
      {
        name: 'execute_sql_query',
        description: '在当前租户数据库执行只读的销售易 SQL 查询（XOQL），检索业务样本数据。',
      },
    ],
  },
];

/**
 * 默认预置的系统技能 (Built-in Skills)
 */
export const BUILTIN_AI_SKILLS: AiSkillItem[] = [
  {
    id: 'skill-schema-design',
    name: '销售易数据建模与字段规范',
    description: '严格遵循销售易 PaaS 命名规范与字段类型代码，规划主子表、关联关系与自动编号规则。',
    category: 'builtin',
    iconName: 'Box',
    triggerKeywords: ['建模', '建表', '创建对象', '字段设计', '设计表'],
    enabled: true,
    systemInstruction: `【销售易数据建模 Skill 规范】:
1. 对象 API Key 规范以小写驼峰或添加 __c 后缀（例如 serviceOrder__c）；
2. 字段类型代码严格按照销售易规范：文本(1)、单选(3)、多选(4)、整数(5)、金额(6)、日期(7)、日期时间(8)、关联关系(10)、图片(14)、布尔(31)；
3. 主子对象建议使用关联关系 (itemType: 10) 绑定，并明确级联删除策略；
4. 完成方案后输出清晰规范的表格并附带结构化 schema 方案。`,
  },
  {
    id: 'skill-xoql-expert',
    name: '销售易 XOQL 查询与语法构建',
    description: '专精销售易 SQL 语法，指导多表关联查询、字段别名、聚合统计及时间函数。',
    category: 'builtin',
    iconName: 'Database',
    triggerKeywords: ['SQL', 'XOQL', '查数据', '统计', '查询'],
    enabled: true,
    systemInstruction: `【销售易 XOQL 编写 Skill 规范】:
1. 销售易查询只允许 SELECT 语句，杜绝 DML 操作；
2. 关联字段通过 lookup 查询关联对象属性，如 accountId.name；
3. 标准客户对象的名称字段为 name，联系人为 name，商机为 opportunityName；
4. 始终建议在查询中附带合理的 LIMIT 限制以提高执行效率。`,
  },
  {
    id: 'skill-paas-trigger',
    name: '销售易 Trigger 触发器开发规范',
    description: '精通销售易 Java/Groovy 后端触发器生命周期、事务控制、防死锁与 SDK 工具类。',
    category: 'builtin',
    iconName: 'Code2',
    triggerKeywords: ['Trigger', '触发器', 'Groovy', 'PaaS代码', '后端开发'],
    enabled: true,
    systemInstruction: `【销售易 Trigger 开发 Skill 规范】:
1. 正确选用 Trigger 事件：beforeInsert, afterInsert, beforeUpdate, afterUpdate 等；
2. 批量处理防循环调用 (SOQL/DML 严禁放在 for 循环体内)；
3. 规范捕获 BusinessException 异常并提供友好的前端错误提示；
4. 规范使用 NeoCRM 平台提供的 SDK 工具类。`,
  },
  {
    id: 'skill-data-quality',
    name: 'CRM 业务数据质检与清洗',
    description: '识别手机号、邮箱、信用代码等字段格式异常，排查重复数据与空值异常。',
    category: 'builtin',
    iconName: 'ShieldCheck',
    triggerKeywords: ['质检', '清洗', '校验', '格式检查', '脏数据'],
    enabled: true,
    systemInstruction: `【CRM 数据质检 Skill 规范】:
1. 手机号校验中国大陆 11 位 1[3-9]d{9} 正则；
2. 统一社会信用代码校验 18 位格式与校验码规则；
3. 检查必填项缺失、重复数据与无效关联外键；
4. 给出清晰的问题严重等级分布报告与数据修复 SQL 建议。`,
  },
];
