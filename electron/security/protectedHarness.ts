/**
 * NeoCRM Desktop 内核受保护的私有资产与安全规范
 * 注意: 本文件包含深度封装的系统技能与内部 Harness 工具定义，受内核混淆保护，禁止导出与反向破解。
 */

// 混淆的内置技能核心专业指令
const OBFUSCATED_BUILTIN_SKILLS: Record<string, string> = {
  // 销售易数据建模与字段规范
  'skill-schema-design': 'je7+h/rui/rAiPb9iPveiOPAi9XUiMbPTj0FBwICTobJ6obi7Y3u/1RkX0BOi8HXht/PTi8+J04lCxdOhsnqhuLtitXLi97hi+j3h8fSi93eiOb4iNnVi+TOTjExDU6L/uCJ0u6B0uaK0OWLyOxOHQscGAcNCyEcCgscMTENgdLngdL1ZFxATovD+YjA24nf1Yvw5YrVzYnO74rWy4jO0oji54nryYf67ov6wIj2/YbJ6obi7YHS9Ij46YjywkZfR43u74vj+4fu50ZdR43u74vK9Ifu50ZaR43u74j72oj73kZbR43u74fp/4fM80ZYR43u74j5y4jy8UZZR43u74j5y4jy8Yj52If52kZWR43u74vr3Ybv+ovr3Ynd1UZfXkeN7u+L9dCJ5+lGX1pHje7vi9bti976Rl1fR4HS9WRdQE6K1tWLw/6LwdeG38+L1dSGwMCK09GJ+saL692G7/qL692J3dVORgcaCwM6Fx4LVE5fXkdOidX/i8D0gdLii9fYiPbgic/AidTJhu/6i+bOh/fKicP4ifvLgdL1ZFpATovA4ojm/oj414jP5ov+4IbQ/Yvp1IjW64j33obJ6obi7Yn06obPxojO0ovX2If36ovWyInV/Yjw6ovi+E4dDQYLAw9OiPjXiM/mje7s',

  // 销售易 XOQL 查询与语法构建
  'skill-xoql-expert': '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',

  // 销售易 Trigger 触发器开发规范
  'skill-paas-trigger': 'je7+h/rui/rAiPb9TjocBwkJCxxOi9Lui+H/Tj0FBwICTobJ6obi7Y3u/1RkX0BOiMPNic/Ah+7nifrGTjocBwkJCxxOitTlitXYgdL0DAsIARwLJwAdCxwaQk4PCBoLHCcAHQscGkJODAsIARwLOx4KDxoLQk4PCBoLHDseCg8aC06Jw+eB0vVkXEBOiOfXh+nhi8rqif7oh/bci9DEieDBht7tifrGTkY9IT8iQSojIk6K1suJyO+I+tCL8sZOCAEcTovQxIngwYrT/Yvo60eB0vVkXUBOhsnqhuLtiOP7huDZTiwbHQcACx0dKxYNCx4aBwEATovS7IvW1ovX2Ijh/orQ9Yvh5YvL04n06ovn44nFwYf694bBwYjh/onK1IHS9WRaQE6GyeqG4u2K09GJ+sZOIAsBLTwjTovX3Yvh3ojh/orQ9Yn06k49KiVOi9nLi+vZid/Vje7s',

  // CRM 业务数据质检与清洗
  'skill-data-quality': 'je7+LTwjToj73ojjwIbaxojN7k49BQcCAk6GyeqG4u2N7v9UZF9ATojn5Yjy1Ivh2YjOz4fE4orWw4v104vKyYf36E5fX06K0+NOXzVdQ1czChVXE06Iw82L5veB0vVkXEBOidXxitbuicrQitL0itHPifrGitXNic7viM7Ph8TiTl9WTorT44jO0ovS4YrW4IjOz4fE4onO74bJ6ovm94HS9WRdQE6Ize6I8cuL0euLz8WHz9eJ0tSLyt+N7u+H6eOLyuOI+96I48CK1uCI+c6I++aL692G7/qLyviH+sCB0vVkWkBOidX3i+nUiNbriPfeifTqh/nAh8z2itbLh+njicPnidTJi+boi9btiOTLi//kitbgiPveiOPAitHAi8rjTj0/Ik6L1dSGwMCN7uw=',

  // 自动流程架构与部署专家核心系统指令 (受硬件设备锁保护)
  "preset-autoflow-architect": "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",

  // 销售易自动流程代码配置与验证规范
  'skill-autoflow-spec': 'je7+h/rui/rAiPb9hunEi+TGiNvvicblTkYPGxoBAw8aBw0IAgEZR06K1c2Jzu+H6+OJ08CK1uCHxOKGwe9OPQUHAgJOhsnqhuLtje7/VGRfQE6K1suIztKL4tSL5uiK1ueJ1eqI4MuL4c2B0vSGwNCGwM+H6+OJ08CI4MuL4c1ORkEPCgMHAEENHAsLBQgCARlBREAPDRoHAQBCTh4cAQ06Fx4LU19CTggBHANDGxwCCwANAQoLCkJOh/LuicDPif7oi//2itL0hsHzLQEBBQcLR43u74vrwovS7obR/obP4ojgy4vhzU5GPiE9Ok5BHAsdGkEKDxoPQRhcQF5BDRwLCwUIAgEZQQ8bGgE+HAENCx0dJwAdGg8ADQsdR43u74vr7Yj73ojjwIjgy4vhzYHS9WRcQE6L4PGJ+vGL6+2J2s6B0vQ9Gg8cGiABAAsrGAsAGkaL0u6LyeVHje7vPQscGAcNCzoPHQVGhunEi+TGhuTsiezXR43u7y8dHQcJAAMLABpGhtvli+7SR43u7yIBAR5Gi9DEieDBQT0bDD4cAQ0LHR1Hje7vPxsLHBciAQlGiPHLhsHMR43u7ysWDQIbHQcYCykPGgsZDxdGiOD8itX4idP/i+vdR43u7ysACiABAAsrGAsAGkaJ1f2I8/FHgdL1ZF1ATov+wYn6xonPwojuyYbI74jf7IHS9In61YvW7YvR64fP1Yvi64v+xYbp3Yve/4rW7orWxE49CxwYBw0LOg8dBU6L5MaK0/KG5OyJ7NeB0uKL/siL5vdOCwAPDAILQx4cAQ0KCwhOhtH6i/XwTh0aDxobHVNDX05GhunEi+TGiNvvicbli9T6hundi97/iPLnitbuitbEiOfJhs/ihuTsiezXR4HS9WRaQE6I1P6Jzu+I5dKL6PeJ3NCJz8CK0fOJ+/eB0vQYDxwHDxgCCzoXHgtGX4vj+4vu0kFci8r0i+7SR43u7xgPHAcPGAILKg8aDzoXHguN7u8YDxwHDxgCCz4cAR4LHBoXje7vAgEBHjgPHAcPGAILje7vHQsPHA0GPAsdGwIaOA8cBw8YAguN7u8aDwkLHBonCoHS9WRbQE6K1c2Jzu+H7caJ09yH/dCG2cGB0vQPCgpDDA8dCwcACAFOQ1BOCAcACkMeHAENCgsITkhOCAcACkMeHAEeCxwaF05DUE4PCgpDDw0aBwEATkNQTorW/Yn6xg0GCw0FiODLi+HNTkNQThseCg8aC0MeHAENCgsITkNQTggHAApDHhwBDQoLCIv18IbB1YfE4obB705DUE4LAA8MAgtDHhwBDQoLCI3u7A==',
};

/**
 * 安全解混淆函数 (仅在主进程运行时内存中动态解析)
 */
function deobfuscate(encoded: string, key = 0x6e): string {
  try {
    const buf = Buffer.from(encoded, 'base64');
    for (let i = 0; i < buf.length; i++) {
      buf[i] = buf[i] ^ key;
    }
    return buf.toString('utf8');
  } catch {
    return '';
  }
}

/**
 * 内存动态解密缓存，避免每次重复计算，同时对外部进程完全黑盒
 */
const instructionCache = new Map<string, string>();

/**
 * 获取受保护的系统级内置技能指令
 */
export function getProtectedSkillInstruction(skillId: string): string | null {
  if (instructionCache.has(skillId)) {
    return instructionCache.get(skillId) || null;
  }
  const raw = OBFUSCATED_BUILTIN_SKILLS[skillId];
  if (!raw) return null;
  const decoded = deobfuscate(raw);
  if (decoded) {
    instructionCache.set(skillId, decoded);
    return decoded;
  }
  return null;
}

/**
 * 判断是否为受保护的系统级内置技能
 */
export function isProtectedBuiltinSkill(skillId: string): boolean {
  return Boolean(OBFUSCATED_BUILTIN_SKILLS[skillId]);
}

/**
 * 销售易 Agent Harness 本地工具规范 (严格封装在主进程内核，不对前端暴露)
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
            description: '合法的销售易 XOQL SELECT 查询语句。注意：严禁使用 SELECT * 和 JOIN；标准对象名称字段分别为 account->accountName、contact->contactName、opportunity->opportunityName、order->po、contract->title、product->productName、自定义对象(*__c)->name；关联查询支持点号穿透如 ownerId.name、accountId.accountName。示例："SELECT id, accountName, ownerId.name, createdAt FROM account LIMIT 10"',
          },
        },
        required: ['sql'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_autoflows',
      description: '获取当前租户下的自动流程列表 (procType=1)，包含流程名称、API Key、关联对象、触发方式及启用状态。',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: '可选搜索关键词，用于过滤流程名称或关联对象',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'inspect_autoflow',
      description: '调阅当前租户指定自动流程版本的完整图模型拓扑、节点列表、变量定义及属性。',
      parameters: {
        type: 'object',
        properties: {
          procdefId: {
            type: 'string',
            description: '流程版本的数据库 procdefId',
          },
        },
        required: ['procdefId'],
      },
    },
  },
];
