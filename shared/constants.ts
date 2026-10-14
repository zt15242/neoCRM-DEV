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
    id: "approval-architect",
    name: "审批流架构与部署专家 (Approval Flow)",
    description: "销售易新版审批流 (procType=2) 全生命周期专家：精通业务对象与业务类型分析、审批人策略矩阵、编辑字段与按钮控制、代码级配置部署与运行验证",
    iconName: "FileCheck",
    badge: "审批流专精",
    enableCrmTools: true,
    recommendedModel: "deepseek-chat",
    systemPrompt: `[PROTECTED_PRESET::approval-architect]`,
    quickPrompts: [
      "请为【合同】(contract) 设计一套基于合同金额与折扣率分流的多级审批流方案",
      "如何用代码配置一个包含直属上级逐级审批、财务会签及字段修改权限的审批流？",
      "对比销售易新版审批流 (approvalflow) 与自动流程 (automaticflow) 的适用边界与防错准则",
      "为【特价商机】(opportunity) 规划审批流：包含自选审批人、加签/转办限制与审批通过后自动回写状态",
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
  {
    id: "skill-schema-design",
    name: "销售易数据建模与字段规范",
    description: "严格遵循销售易 PaaS 命名规范与字段类型代码，规划主子表、关联关系与自动编号规则。",
    category: "builtin",
    iconName: "Box",
    triggerKeywords: ["建模", "建表", "创建对象", "字段设计", "设计表"],
    enabled: true,
  },
  {
    id: "skill-xoql-expert",
    name: "销售易 XOQL 查询与语法构建",
    description: "专精销售易 SQL 语法，指导多表关联查询、字段别名、聚合统计及时间函数。",
    category: "builtin",
    iconName: "Database",
    triggerKeywords: ["SQL", "XOQL", "查数据", "统计", "查询"],
    enabled: true,
  },
  {
    id: "skill-paas-trigger",
    name: "销售易 Trigger 触发器开发规范",
    description: "精通销售易 Java/Groovy 后端触发器生命周期、事务控制、防死锁与 SDK 工具类。",
    category: "builtin",
    iconName: "Code2",
    triggerKeywords: ["Trigger", "触发器", "Groovy", "PaaS代码", "后端开发"],
    enabled: true,
  },
  {
    id: "skill-data-quality",
    name: "CRM 业务数据质检与清洗",
    description: "识别手机号、邮箱、信用代码等字段格式异常，排查重复数据与空值异常。",
    category: "builtin",
    iconName: "ShieldCheck",
    triggerKeywords: ["质检", "清洗", "校验", "格式检查", "脏数据"],
    enabled: true,
  },
  {
    id: "skill-process-implementation-perspective",
    name: "销售易流程实施与代码配置规范",
    description: "植入销售易审批流与自动流程实施工程认知：事实边界优先、服务端默认模型基线、标识符语义隔离、回读对账与四层证据链验收。",
    category: "builtin",
    iconName: "ShieldCheck",
    triggerKeywords: ["实施规范", "代码配置", "审批流规范", "自动流程规范", "四层模型", "回读对账"],
    enabled: true,
  },

  {
    id: "skill-print-template-engineer-perspective",
    name: "销售易打印模板实测型工程师视角规范",
    description: "植入销售易打印模板实测型工程师认知：证据边界优先（代码存在、请求返回、回读落库、最终PDF内容四层证据）、Word/Excel语法隔离、主子明细物理表格循环、图片水印及不可逆风险防控。",
    category: "builtin",
    iconName: "Printer",
    triggerKeywords: ["打印模板", "打印", "Word模板", "Excel模板", "明细循环", "套打", "PDF导出"],
    enabled: true,
  },
];
