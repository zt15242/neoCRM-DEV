/**
 * NeoCRM Desktop 内核受保护的私有资产与安全规范
 * 注意: 本文件包含深度封装的系统技能与内部 Harness 工具定义，受内核混淆保护，禁止导出与反向破解。
 */

// 混淆的内置技能核心专业指令
const OBFUSCATED_BUILTIN_SKILLS: Record<string, string> = {
  // 销售易数据建模与字段规范
  'skill-schema-design': 'je7+h/rui/rAiPb9iPveiOPAi9XUiMbPTj0FBwICTobJ6obi7Y3u/1RkX0BOi8HXht/PTi8+J04lCxdOhsnqhuLtitXLi97hi+j3h8fSi93eiOb4iNnVi+TOTjExDU6L/uCJ0u6B0uaK0OWLyOxOHQscGAcNCyEcCgscMTENgdLngdL1ZFxATovD+YjA24nf1Yvw5YrVzYnO74rWy4jO0oji54nryYf67ov6wIj2/YbJ6obi7YHS9Ij46YjywkZfR43u74vj+4fu50ZdR43u74vK9Ifu50ZaR43u74j72oj73kZbR43u74fp/4fM80ZYR43u74j5y4jy8UZZR43u74j5y4jy8Yj52If52kZWR43u74vr3Ybv+ovr3Ynd1UZfXkeN7u+L9dCJ5+lGX1pHje7vi9bti976Rl1fR4HS9WRdQE6K1tWLw/6LwdeG38+L1dSGwMCK09GJ+saL692G7/qL692J3dVORgcaCwM6Fx4LVE5fXkdOidX/i8D0gdLii9fYiPbgic/AidTJhu/6i+bOh/fKicP4ifvLgdL1ZFpATovA4ojm/oj414jP5ov+4IbQ/Yvp1IjW64j33obJ6obi7Yn06obPxojO0ovX2If36ovWyInV/Yjw6ovi+E4dDQYLAw9OiPjXiM/mje7s',

  // 销售易 XOQL 查询与语法构建
  'skill-xoql-expert': 'je7+h/rui/rAiPb9TjYhPyJOidL4i+j3Tj0FBwICTobJ6obi7Y3u/1RkX0BOh/rui/rAiPb9iPHLhsHMi+HEi+vvhsDWTj0rIistOk6GwcOL4cuB0uKI8/KJ1fNOKiMiToj944rT8oHS9WRcQE6L692G7/qLw/mIwNuH7vSG0elOAgEBBRseTojxy4bBzIvr3Ybv+ovB14bfz4vf8IjuyYHS4ovI7E4PDQ0BGwAaJwpAAA8DC4HS9WRdQE6IzumL6eiLwMyI5tmLwdeG38+J9OqL/uOJyd6Lw/mIwNuK1tROAA8DC4HS4obv+ond1YrU1IrW1E4ADwMLgdLii/voiPLUitbUTgEeHgEcGhsABxoXIA8DC4HS9WRaQE6LyeWJ1eaL1dSGwMCL8saI8cuGwcyK1sOH9+qL1siL/uaJ/uiJ9OpOIicjJzpOh/f+i+bYitXLiOH+h8X2iOfJhs/iiPvmieDpje7s',

  // 销售易 Trigger 触发器开发规范
  'skill-paas-trigger': 'je7+h/rui/rAiPb9TjocBwkJCxxOi9Lui+H/Tj0FBwICTobJ6obi7Y3u/1RkX0BOiMPNic/Ah+7nifrGTjocBwkJCxxOitTlitXYgdL0DAsIARwLJwAdCxwaQk4PCBoLHCcAHQscGkJODAsIARwLOx4KDxoLQk4PCBoLHDseCg8aC06Jw+eB0vVkXEBOiOfXh+nhi8rqif7oh/bci9DEieDBht7tifrGTkY9IT8iQSojIk6K1suJyO+I+tCL8sZOCAEcTovQxIngwYrT/Yvo60eB0vVkXUBOhsnqhuLtiOP7huDZTiwbHQcACx0dKxYNCx4aBwEATovS7IvW1ovX2Ijh/orQ9Yvh5YvL04n06ovn44nFwYf694bBwYjh/onK1IHS9WRaQE6GyeqG4u2K09GJ+sZOIAsBLTwjTovX3Yvh3ojh/orQ9Yn06k49KiVOi9nLi+vZid/Vje7s',

  // CRM 业务数据质检与清洗
  'skill-data-quality': 'je7+LTwjToj73ojjwIbaxojN7k49BQcCAk6GyeqG4u2N7v9UZF9ATojn5Yjy1Ivh2YjOz4fE4orWw4v104vKyYf36E5fX06K0+NOXzVdQ1czChVXE06Iw82L5veB0vVkXEBOidXxitbuicrQitL0itHPifrGitXNic7viM7Ph8TiTl9WTorT44jO0ovS4YrW4IjOz4fE4onO74bJ6ovm94HS9WRdQE6Ize6I8cuL0euLz8WHz9eJ0tSLyt+N7u+H6eOLyuOI+96I48CK1uCI+c6I++aL692G7/qLyviH+sCB0vVkWkBOidX3i+nUiNbriPfeifTqh/nAh8z2itbLh+njicPnidTJi+boi9btiOTLi//kitbgiPveiOPAitHAi8rjTj0/Ik6L1dSGwMCN7uw=',
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
            description: '合法的销售易 SELECT 查询语句，例如 "SELECT id, name, createdAt FROM account LIMIT 10"',
          },
        },
        required: ['sql'],
      },
    },
  },
];
