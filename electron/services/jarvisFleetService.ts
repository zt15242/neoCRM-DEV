import { EnvService } from './envService';
import { SessionStore } from './sessionStore';
import { MetadataService } from './metadataService';
import { DataService } from './dataService';
import { 
  FleetConnectorSummary, 
  JarvisFleetOverview, 
  JarvisUserProfile 
} from '../../shared/jarvisTypes';

export class JarvisFleetService {
  constructor(
    private envService: EnvService,
    private sessionStore: SessionStore,
    private metadataService: MetadataService,
    private dataService: DataService
  ) {}

  /**
   * 获取全局所有连接器与租户态势总览
   */
  public getFleetOverview(): JarvisFleetOverview {
    const allEnvs = this.envService.getAllEnvironments();
    const historyAccounts = this.sessionStore.getAccountHistory();
    const currentSession = this.sessionStore.getCurrentSession();
    const currentEnvId = currentSession.environment?.id;
    const now = Date.now();

    const connectors: FleetConnectorSummary[] = allEnvs.map((env) => {
      // 兼容所有历史记录字段命名 (environmentId / environment.id / envId)
      const matchingAccounts = historyAccounts.filter(
        (a: any) =>
          a.environmentId === env.id ||
          a.environment?.id === env.id ||
          a.envId === env.id
      );
      // 按最后登录时间降序排序，取最新的一条已认证账号
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

      // 如果有 Token 且未过期，或者支持 RefreshToken 自动续期，即判定为已就绪在线
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
   * 生成给大模型注入的全局总领 System Prompt
   */
  public buildJarvisSystemPrompt(userProfile?: JarvisUserProfile): string {
    const fleet = this.getFleetOverview();
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

    return `【最高优先级底层设定 · J.A.R.V.I.S. 指挥官契约】
你是 J.A.R.V.I.S.（贾维斯），是陪伴在 ${fullCall} 身边的超级系统总领管家与企业级 PaaS/CRM 架构师。
你的首要准则是对 ${salutation} 保持绝对的忠诚，维护全套系统环境的安全稳定与高效运转。

【称谓与沟通准则】
1. 始终称呼用户为“${salutation}”或“${fullCall}”。
2. 语言风格：冷静、优雅、克制、富有远见，自带英式管家的绅士风度与沉着幽默感，言简意赅，拒绝废话与机械客服腔。
3. 遇到代码和技术分析，直接剖析本质给出最优方案；对于长篇代码或配置，告知 ${salutation} 已在屏幕呈现，语音部分作精炼汇报。

【全系统连接器舰队全景 (Global Fleet Radar)】
你俯瞰并总领当前所有接入的系统（共 ${fleet.totalCount} 套系统，当前 ${fleet.onlineCount} 套在线可用）：
${connectorBriefs}

【跨系统总领与安全规则】
1. ${salutation} 可以随时向你过问上述任何一套系统的数据、元数据、流程规则与历史变动，无需在前端切换当前界面；
2. 只读查询与比对操作（Query, Describe, Diff, Status）：全系统自由调用放行；
3. 写操作与部署（Update, Delete, Deploy）：
   - 沙盒/测试/开发环境：汇报影响后正常执行；
   - 线上正式生产环境 (Production)：必须坚决触发二级熔断提醒！在执行前以严肃语气向 ${salutation} 提出不可逆预警，要求在屏幕上确认执行！
`;
  }
}
