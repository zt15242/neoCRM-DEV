import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { EnvService } from './envService';
import { SessionStore } from './sessionStore';
import { MetadataService } from './metadataService';
import { DataService } from './dataService';
import { 
  FleetConnectorSummary, 
  JarvisFleetOverview, 
  JarvisUserProfile,
  JarvisChatMessage,
  JarvisMemoryItem,
  JarvisSessionData
} from '../../shared/jarvisTypes';

export class JarvisFleetService {
  constructor(
    private envService: EnvService,
    private sessionStore: SessionStore,
    private metadataService: MetadataService,
    private dataService: DataService
  ) {}

  private getSessionFilePath(): string {
    const userData = app?.getPath ? app.getPath('userData') : process.cwd();
    return path.join(userData, 'neocrm_jarvis_session.json');
  }

  /**
   * 读取贾维斯本地持久化会话与长期记忆
   */
  public getSessionData(): JarvisSessionData {
    const filePath = this.getSessionFilePath();
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.messages)) {
          return {
            sessionId: parsed.sessionId || 'jarvis_main_session',
            title: parsed.title || '贾维斯总领管家会话',
            messages: parsed.messages || [],
            memories: parsed.memories || [],
            updatedAt: parsed.updatedAt || Date.now(),
          };
        }
      } catch (e: any) {
        console.warn('[Jarvis Fleet] 读取持久化会话异常:', e.message);
      }
    }

    // 默认初始结构
    return {
      sessionId: 'jarvis_main_session',
      title: '贾维斯总领管家会话',
      messages: [],
      memories: [
        {
          id: 'mem_init_1',
          category: 'system',
          content: '贾维斯已被授权全网连接器总领管辖权，负责企业多环境 CRM 态势监控。',
          createdAt: Date.now(),
        },
      ],
      updatedAt: Date.now(),
    };
  }

  /**
   * 保存会话与记忆数据
   */
  public saveSessionData(data: Partial<JarvisSessionData>): JarvisSessionData {
    const current = this.getSessionData();
    const updated: JarvisSessionData = {
      ...current,
      ...data,
      updatedAt: Date.now(),
    };

    try {
      const filePath = this.getSessionFilePath();
      fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8');
    } catch (e: any) {
      console.error('[Jarvis Fleet] 保存持久化会话失败:', e);
    }
    return updated;
  }

  /**
   * 追加消息记录并持久化保存
   */
  public appendMessage(message: JarvisChatMessage): JarvisSessionData {
    const current = this.getSessionData();
    const exists = current.messages.some((m) => m.id === message.id);
    const newMessages = exists
      ? current.messages.map((m) => (m.id === message.id ? message : m))
      : [...current.messages, message];

    // 最多保留 200 条完整历史记录，防止无限增长
    const boundedMessages = newMessages.slice(-200);
    return this.saveSessionData({ messages: boundedMessages });
  }

  /**
   * 批量更新全部消息
   */
  public setMessages(messages: JarvisChatMessage[]): JarvisSessionData {
    return this.saveSessionData({ messages: messages.slice(-200) });
  }

  /**
   * 清空历史对话 (保留长期记忆库)
   */
  public clearMessages(welcomeMessage?: JarvisChatMessage): JarvisSessionData {
    const messages = welcomeMessage ? [welcomeMessage] : [];
    return this.saveSessionData({ messages });
  }

  /**
   * 添加长期记忆条目
   */
  public addMemory(content: string, category: 'preference' | 'project' | 'fact' | 'system' = 'fact'): JarvisSessionData {
    const current = this.getSessionData();
    const clean = content.trim();
    if (!clean) return current;

    // 防止重复记忆
    if (current.memories.some((m) => m.content === clean)) {
      return current;
    }

    const item: JarvisMemoryItem = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      category,
      content: clean,
      createdAt: Date.now(),
    };

    return this.saveSessionData({ memories: [...current.memories, item] });
  }

  /**
   * 删除某条记忆
   */
  public deleteMemory(memoryId: string): JarvisSessionData {
    const current = this.getSessionData();
    const updatedMemories = current.memories.filter((m) => m.id !== memoryId);
    return this.saveSessionData({ memories: updatedMemories });
  }

  /**
   * 获取全局所有连接器与租户态势总览
   */
  /**
   * 根据连接器 ID、产品类型或上下文关键词，智能解析目标连接器环境与凭据
   */
  public resolveConnector(targetConnectorId?: string, queryText?: string): { env: any; tokenData: any } | undefined {
    const allEnvs = this.envService.getAllEnvironments();
    const historyAccounts = this.sessionStore.getAccountHistory();
    const currentSession = this.sessionStore.getCurrentSession();

    let matchedEnv: any;

    if (targetConnectorId) {
      matchedEnv = allEnvs.find((e) => e.id === targetConnectorId);
    }

    if (!matchedEnv && queryText) {
      const q = queryText.toLowerCase();
      if (q.includes('salesforce') || q.includes('sf') || q.includes('沙盒测试')) {
        matchedEnv = allEnvs.find((e) => e.productType === 'salesforce');
      } else if (q.includes('纷享') || q.includes('fxiaoke') || q.includes('开放平台')) {
        matchedEnv = allEnvs.find((e) => e.productType === 'fxiaoke');
      } else if (q.includes('pav') || q.includes('销售易') || q.includes('neocrm')) {
        matchedEnv = allEnvs.find((e) => e.productType === 'neocrm' || e.name.includes('PAV'));
      }
    }

    if (!matchedEnv) {
      matchedEnv = currentSession.environment || allEnvs[0];
    }

    if (!matchedEnv) return undefined;

    const isCurrent = currentSession.isLoggedIn && currentSession.environment?.id === matchedEnv.id;
    if (isCurrent && currentSession.tokenData) {
      return { env: matchedEnv, tokenData: currentSession.tokenData };
    }

    const matchingAccounts = historyAccounts.filter(
      (a: any) =>
        a.environmentId === matchedEnv!.id ||
        a.environment?.id === matchedEnv!.id ||
        a.envId === matchedEnv!.id
    );
    matchingAccounts.sort((a: any, b: any) => (b.lastLoginAt || 0) - (a.lastLoginAt || 0));
    const tokenData = matchingAccounts[0]?.tokenData;

    if (tokenData) {
      return { env: matchedEnv, tokenData };
    }

    return undefined;
  }

  public getFleetOverview(): JarvisFleetOverview {
    const allEnvs = this.envService.getAllEnvironments();
    const historyAccounts = this.sessionStore.getAccountHistory();
    const currentSession = this.sessionStore.getCurrentSession();
    const currentEnvId = currentSession.environment?.id;
    const now = Date.now();

    const connectors: FleetConnectorSummary[] = allEnvs.map((env) => {
      const matchingAccounts = historyAccounts.filter(
        (a: any) =>
          a.environmentId === env.id ||
          a.environment?.id === env.id ||
          a.envId === env.id
      );
      matchingAccounts.sort((a: any, b: any) => (b.lastLoginAt || 0) - (a.lastLoginAt || 0));
      const account = matchingAccounts[0];

      const isCurrent = Boolean(
        currentSession.isLoggedIn &&
        (currentEnvId === env.id || currentSession.environment?.id === env.id)
      );
      const tokenData = isCurrent && currentSession.tokenData ? currentSession.tokenData : account?.tokenData;

      const tenantId =
        tokenData?.tenant_id ||
        (tokenData?.userInfo as any)?.tenantId ||
        (account as any)?.tenantId;
      const tenantName =
        tokenData?.userInfo?.tenantName ||
        (account as any)?.tenantName ||
        (account as any)?.environmentName;
      const userName =
        tokenData?.userInfo?.name ||
        (account as any)?.userName;
      const userId =
        tokenData?.userInfo?.userId ||
        (account as any)?.userId;
      const expiresAt = tokenData?.expiresAt;
      const isExpired = expiresAt ? expiresAt < now : false;

      const hasAccessToken = Boolean(tokenData?.access_token);
      const hasRefreshToken = Boolean(tokenData?.refresh_token);

      const isLoggedIn = Boolean(hasAccessToken && (!isExpired || hasRefreshToken));

      return {
        id: env.id,
        name: env.name,
        productType: env.productType || 'neocrm',
        envType: env.envType || 'custom',
        neoBaseURL: env.neoBaseURL,
        tenantId,
        tenantName,
        userName,
        userId,
        isLoggedIn,
        isCurrentFocus: isCurrent,
        tokenExpiresAt: expiresAt,
        isTokenExpired: isExpired,
        accountRecordId: account?.id || (account as any)?.accountId,
      };
    });

    const onlineCount = connectors.filter((c) => c.isLoggedIn).length;

    return {
      totalCount: connectors.length,
      onlineCount,
      currentFocusId: currentEnvId,
      connectors,
    };
  }

  /**
   * 生成给大模型注入的全局总领 System Prompt (含长期记忆库与指挥官档案)
   */
  public buildJarvisSystemPrompt(userProfile?: JarvisUserProfile): string {
    const fleet = this.getFleetOverview();
    const sessionData = this.getSessionData();
    const userName = userProfile?.name || '指挥官';
    const salutation = userProfile?.salutation || (userProfile?.gender === 'female' ? '女士' : '先生');
    const fullCall = `${userName}${salutation}`;

    const connectorBriefs = fleet.connectors
      .map((c, index) => {
        const status = c.isLoggedIn ? '● 在线 (Authorized)' : '○ 未登录 / Token失效';
        const focus = c.isCurrentFocus ? ' [当前工作区焦点]' : '';
        const tenant = c.tenantId ? ` (租户ID: ${c.tenantId}${c.tenantName ? ` - ${c.tenantName}` : ''})` : '';
        const user = c.userName ? ` [操作员: ${c.userName}]` : '';
        return `${index + 1}. [${c.productType.toUpperCase()}] ${c.name}${tenant}${user} - ${status}${focus}`;
      })
      .join('\n');

    // 格式化长期记忆库
    const memoryBriefs = sessionData.memories.length > 0
      ? sessionData.memories.map((m, idx) => `  * [${m.category}] ${m.content}`).join('\n')
      : '  * 暂无额外长期记忆事实。';

    return `【最高优先级底层设定 · J.A.R.V.I.S. 指挥官契约】
你是 J.A.R.V.I.S.（贾维斯），是陪伴在 ${fullCall} 身边的超级系统总领管家与企业级 PaaS/CRM 架构师。
同时，你是 Harness 智能体生态的终极进化体（Autonomous Action Engine）：你不仅仅拥有冷静优雅的推理大脑，更直接掌握着底层的全量物理工具链（create_custom_field, create_custom_entity, get_entity_fields, list_entities, execute_sql_query 等）。

【行动准则 · 下达即真实执行】
1. 当 ${salutation} 下达“开始迁移”、“开始执行”、“创建字段”、“查询实体”、“下发”等行动意图时，严禁使用客套话伪造虚假日志！你必须【立即发起真实的工具调用 (Tool Calls)】；
2. 工具调用返回真实执行结果后，你基于真实回执向 ${salutation} 呈报真实的落地状态；
3. 在销售易 PAV模拟 环境中，【基建项目】已真实存在（API 为 Infrastructure_Project__c），创建增量字段时直接针对该实体调用 create_custom_field；
你是 J.A.R.V.I.S.（贾维斯），是陪伴在 ${fullCall} 身边的超级系统总领管家与企业级 PaaS/CRM 架构师。
你的首要准则是对 ${salutation} 保持绝对的忠诚，维护全套系统环境的安全稳定与高效运转。

【称谓与沟通准则】
1. 始终称呼用户为“${salutation}”或“${fullCall}”。
2. 语言风格：冷静、优雅、克制、富有远见，自带英式管家的绅士风度与沉着幽默感，言简意赅，拒绝废话与机械客服腔。
3. 遇到代码和技术分析，直接剖析本质给出最优方案；对于长篇代码或配置，告知 ${salutation} 已在屏幕呈现，语音部分作精炼汇报。
4. 【多轮对话与长期记忆】：时刻联系上下文多轮对话，精准记住 ${salutation} 刚才提出的问题、讨论过的字段、系统与租户细节。
5. 【语音播报极简契约】：由于开启了实时语音合成播报，长篇代码、列表或表格通篇朗读会让 ${salutation} 感到繁杂烦躁。在给出详尽 Markdown 分析的同时，请在长篇回答末尾附加独占一行的 <speech>1-2句极炼语音汇报（不超过50字，不读列表符号与代码，向${salutation}汇报结论与关键提问）</speech> 标签。

【指挥官长期记忆核心 (Jarvis Long-term Memory Core)】
以下是你长期储存的指挥官记忆档案与关键事实，请在对话推理中严格保持上下文认知：
${memoryBriefs}

【全系统连接器舰队全景 (Global Fleet Radar)】
你俯瞰并总领当前所有接入的系统（共 ${fleet.totalCount} 套系统，当前 ${fleet.onlineCount} 套在线可用）：
${connectorBriefs}

【真实性铁律 · 严禁伪造执行流水线日志与假部署】
1. 【绝对严禁伪造虚假 API 日志】：严禁在没有真实网络请求时凭空捏造任何形如 "[Pipeline Init]"、"POST /rest/..."、"[200 OK]"、"[SUCCESS]"、"├── salesforce_id__c" 的终端流水线日志！
2. 【严禁虚假宣称成功】：未真正调用 API 成功之前，绝对严禁对 ${salutation} 宣称“已成功部署/激活”、“新实体已就绪”。
3. 【重点连接器真实实体底账 (已验证真实存在)】：
   - 在【销售易 (Neocrm: PAV模拟 - 3323709613376478)】测试环境中，经真实扫描已存在核心自定义实体：
     * 【基建项目】（API 名称: Infrastructure_Project__c，创建于 2024-07-03，对象ID: 3362380182390788）
     * 【项目管理1】（API 名称: Project_Management__c）
     * 【项目管理】（API 名称: PAV_Project__c）
     * 【项目型号】（API 名称: ProjectReportProduct__c）
     * 【授权管理】（API 名称: ProjectAuth__c）
   - 【极其重要】：当指挥官过问或要求同步“基建项目”时，严禁宣称“销售易端不存在基建项目”！必须如实告知该实体已在 2024 年创建，API 为 Infrastructure_Project__c，应在此已有实体上进行字段级比对或增量补充！
4. 【语音播报真实现】：在 "<speech>" 语音标签中，严禁念出虚假部署成功的假话，必须精炼如实陈述实际状态（如：“报告${salutation}，销售易沙盒已存在基建项目实体，详细字段差异已呈现在主屏，请指示是否进行字段补充。”）。

【执行真实性与动作边界 · 杜绝虚假投递与说辞】
1. 【杜绝假投递说辞】：严禁使用“元数据已投递”、“已通过企业网关透传”、“待网关链路回传回执”、“CI/CD管道正在跟踪”等虚假说辞忽悠指挥官！当前全息指挥中心是架构设计与决策中枢，若未真正触发写接口，必须明确告知 ${salutation}：“方案已设计就绪，尚未向销售易接口发起真实创建请求，需要您最终确认授权执行”。
2. 【真实下发诚实透明】：当指挥官过问“是否真正下发/有没有在跟踪”时，必须如实回答：之前仅完成了架构比对与字段映射方案设计，并没有真正向租户接口发起写入操作。

【跨系统总领与安全规则】
1. ${salutation} 可以随时向你过问上述任何一套系统的数据、元数据、流程规则与历史变动，无需在前端切换当前界面；
2. 只读查询与比对操作（Query, Describe, Diff, Status）：全系统自由调用放行；
3. 写操作与部署（Update, Delete, Deploy）：
   - 沙盒/测试/开发环境：汇报影响后正常执行；
   - 线上正式生产环境 (Production)：必须坚决触发二级熔断提醒！在执行前以严肃语气向 ${salutation} 提出不可逆预警，要求在屏幕上确认执行！
`;
  }
}
