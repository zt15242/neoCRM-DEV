/**
 * 依据环境对象与会话数据，动态、确定性地推导该环境专属的 Salesforce CLI (sf) 别名
 * 彻底消除所有环境硬编码为单一别名 (如 aliNewStageFull / DigitalDev) 导致的组织互相覆盖与串号混乱！
 */
export function resolveSalesforceAlias(env?: NeoEnvironment, tokenData?: TokenData): string {
  // 1. 若连接器显式配置了自定义 CLI 别名，严格优先遵循
  if (env?.cliAlias && env.cliAlias.trim()) {
    return env.cliAlias.trim().replace(/[^a-zA-Z0-9_.-]/g, '_');
  }

  // 2. 预置 Salesforce 连接器专属固定别名 (四套预置环境互不干扰)
  if (env?.id === 'sf-alicloud-production') return 'SF_Ali_Prod';
  if (env?.id === 'sf-sandbox' || env?.id === 'sf-alicloud-sandbox') return 'SF_Ali_Sandbox';
  if (env?.id === 'sf-global-production') return 'SF_Global_Prod';
  if (env?.id === 'sf-global-sandbox') return 'SF_Global_Sandbox';

  // 3. 从环境实例 URL / 我的域 (MyDomain) 提取组织代号，并附加连接器 ID 避免同域账号互相覆盖
  const instanceUrl = (tokenData?.instance_uri || env?.neoBaseURL || '').trim();
  if (instanceUrl) {
    try {
      const u = new URL(instanceUrl);
      const host = u.hostname.toLowerCase();
      // 例如 olympus--stagefull.sandbox.my.sfcrmproducts.cn -> olympus_stagefull
      const firstPart = host.split('.')[0];
      if (firstPart && !['login', 'test', 'www', 'api'].includes(firstPart)) {
        const sanitized = firstPart.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
        if (sanitized && sanitized.length >= 2) {
          const connectorSuffix = env?.id?.replace(/[^a-zA-Z0-9_]/g, '_').slice(-8);
          return connectorSuffix ? `${sanitized.slice(0, 31)}_${connectorSuffix}` : sanitized.slice(0, 40);
        }
      }
    } catch {}
  }

  // 4. 根据环境名称拼装英文字符别名 (若包含中文字符，自动剥离或拼合拼音/ID)
  if (env?.name) {
    const engPart = env.name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    if (engPart && engPart.length >= 2) {
      const connectorSuffix = env.id?.replace(/[^a-zA-Z0-9_]/g, '_').slice(-8);
      return connectorSuffix ? `SF_${engPart.slice(0, 31)}_${connectorSuffix}` : `SF_${engPart.slice(0, 37)}`;
    }
  }

  // 5. 基于环境 ID 保证全局唯一且不冲突
  if (env?.id) {
    const cleanId = env.id.replace(/[^a-zA-Z0-9_]/g, '_');
    return `SF_${cleanId.slice(0, 37)}`;
  }

  return 'SalesforceOrg';
}

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import axios, { AxiosRequestConfig } from 'axios';
import { execSync } from 'node:child_process';
import { NeoEnvironment, TokenData, EntityMetadata, FieldMetadata, QueryResultData } from '../../shared/types';
import { getSalesforceCliCommand, getSalesforceCliEnvironment } from './salesforceCliRuntime';

export class SalesforceService {
  private tokenRefreshCallback?: (env: NeoEnvironment, newToken: TokenData) => void;
  private authRecoveryPromises = new Map<string, Promise<string | null>>();

  public setTokenRefreshCallback(cb: (env: NeoEnvironment, newToken: TokenData) => void) {
    this.tokenRefreshCallback = cb;
  }

  private normalizeAccessToken(accessToken: string): string {
    return String(accessToken || '').trim().replace(/^(?:Bearer\s+)+/i, '').trim();
  }

  private getBearerAuthorization(accessToken: string): string {
    const normalizedToken = this.normalizeAccessToken(accessToken);
    if (!normalizedToken) throw new Error('Salesforce Access Token 为空');
    return `Bearer ${normalizedToken}`;
  }

  private getRequestErrorMessage(error: any): string {
    const data = error?.response?.data;
    if (Array.isArray(data)) {
      return data.map((item) => item?.message || item?.errorCode).filter(Boolean).join(' · ') || error?.message || 'Salesforce 请求失败';
    }
    if (data && typeof data === 'object') {
      return [data.message, data.errorCode].filter(Boolean).join(' · ') || error?.message || 'Salesforce 请求失败';
    }
    return error?.message || 'Salesforce 请求失败';
  }

  /**
   * 判断当前是否为 Salesforce 生产正式环境 (Production)
   * 生产环境严格禁止任何数据新建/修改/删除及元数据创建操作；测试/沙盒环境 (Sandbox/Test) 则不限制。
   */
  public isProductionEnvironment(env: NeoEnvironment, tokenData?: TokenData): boolean {
    if (env.productType !== 'salesforce') return false;

    // 1. 显式标记为 sandbox 或 test 的连接器放行 (不限制)
    if (env.envType === 'sandbox' || env.envType === 'test') {
      return false;
    }

    // 2. 检查实例域名或访问地址特征 (是否包含沙盒/测试标识)
    const url = (tokenData?.instance_uri || env.neoBaseURL || '').toLowerCase();
    if (
      url.includes('test.salesforce.com') ||
      url.includes('test.sfcrmproducts.cn') ||
      url.includes('.sandbox.') ||
      url.includes('--') ||
      /cs\d+\./.test(url)
    ) {
      return false;
    }

    // 3. 生产域名标识
    if (
      env.envType === 'production' ||
      url.includes('login.salesforce.com') ||
      url.includes('login.sfcrmproducts.cn')
    ) {
      return true;
    }

    return false;
  }

  private getBaseUrl(env: NeoEnvironment, tokenData: TokenData): string {
    const raw = tokenData.instance_uri || env.neoBaseURL || 'https://login.salesforce.com';
    return raw.endsWith('/') ? raw.slice(0, -1) : raw;
  }

  /**
   * 从本地磁盘 ~/.sfdx/*.json 直接提取已认证凭据与 Refresh Token
   */
  private getAuthFileFromDisk(username?: string, instanceUrl?: string): any | null {
    try {
      const sfdxDir = path.join(os.homedir(), '.sfdx');
      if (!fs.existsSync(sfdxDir)) return null;

      if (username) {
        const uFile = path.join(sfdxDir, `${username}.json`);
        if (fs.existsSync(uFile)) {
          return JSON.parse(fs.readFileSync(uFile, 'utf-8'));
        }
      }

      if (instanceUrl) {
        try {
          const host = new URL(instanceUrl).host.toLowerCase();
          const files = fs.readdirSync(sfdxDir).filter(
            (f) => f.endsWith('.json') && f !== 'alias.json' && f !== 'sfdx-config.json' && f !== 'key.json'
          );
          for (const f of files) {
            try {
              const content = JSON.parse(fs.readFileSync(path.join(sfdxDir, f), 'utf-8'));
              if (content.instanceUrl && content.instanceUrl.toLowerCase().includes(host)) {
                return content;
              }
            } catch {}
          }
        } catch {}
      }
    } catch {}
    return null;
  }

  /**
   * 自动探测并从本地 Salesforce CLI (sf) 或端点获取最新有效的 Access Token (跨平台兼顾 Windows)
   */
  private getLatestTokenFromCli(env?: NeoEnvironment, tokenData?: TokenData): string | null {
    try {
      const cmd = getSalesforceCliCommand();

      // 1. 尝试直接从本地磁盘 ~/.sfdx/*.json 读取（0ms 极速无开销）
      const username = tokenData?.userInfo?.name;
      const diskAuth = this.getAuthFileFromDisk(username, tokenData?.instance_uri || env?.neoBaseURL);
      if (diskAuth?.refreshToken && tokenData) tokenData.refresh_token = diskAuth.refreshToken;
      if (diskAuth?.accessToken && this.normalizeAccessToken(diskAuth.accessToken) !== this.normalizeAccessToken(tokenData?.access_token || '')) {
        return diskAuth.accessToken;
      }

      // 2. 依据当前环境动态推导专属别名，杜绝全局单一别名冲突
      const alias = resolveSalesforceAlias(env, tokenData);

      // 3. 使用 CLI 专用命令读取当前环境的 Access Token，避免依赖 org display 的敏感字段。
      let stdout = '';
      try {
        stdout = execSync(
          `"${cmd}" org auth show-access-token --target-org "${alias}" --json`.trim(),
          {
            encoding: 'utf-8',
            timeout: 15000,
            windowsHide: true,
            shell: true,
            env: getSalesforceCliEnvironment(),
          }
        );
      } catch {
        return null;
      }

      const jsonStart = stdout.indexOf('{');
      const jsonEnd = stdout.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const data = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1));
        const accessToken = data.result?.accessToken;
        if (accessToken) {
          if (username) {
            const authAfter = this.getAuthFileFromDisk(username, tokenData?.instance_uri || env?.neoBaseURL);
            if (authAfter?.refreshToken && tokenData) {
              tokenData.refresh_token = authAfter.refreshToken;
            }
          }
          return accessToken;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private recoverAccessTokenAfterAuthFailure(
    env: NeoEnvironment,
    tokenData: TokenData,
    baseUrl: string,
  ): Promise<string | null> {
    const userKey = tokenData.userInfo?.userId || tokenData.userInfo?.name || tokenData.tenant_id || 'unknown-user';
    const recoveryKey = `${env.id || 'salesforce'}|${baseUrl.toLowerCase()}|${userKey}`;
    const inFlight = this.authRecoveryPromises.get(recoveryKey);
    if (inFlight) return inFlight;

    let recovery: Promise<string | null>;
    recovery = Promise.resolve().then(async () => {
      try {
        const rejectedToken = this.normalizeAccessToken(tokenData.access_token);
        const cliToken = this.getLatestTokenFromCli(env, tokenData);
        const normalizedCliToken = this.normalizeAccessToken(cliToken || '');
        if (normalizedCliToken && normalizedCliToken !== rejectedToken) return normalizedCliToken;
        if (normalizedCliToken) {
          console.warn('[Salesforce] CLI 返回的 Access Token 与刚被拒绝的 token 相同，继续尝试 OAuth refresh_token。');
        }

        const diskAuth = this.getAuthFileFromDisk(tokenData.userInfo?.name, baseUrl);
        if (diskAuth?.refreshToken) tokenData.refresh_token = diskAuth.refreshToken;
        const refreshToken = diskAuth?.refreshToken || tokenData.refresh_token;
        const clientId = env.clientId || diskAuth?.clientId || '3MVG9xXFQGV9F.Wr9Z_1xbGt7Vq63R.tqieb_acTQQGYdprE5n0ogE.JkOqT5E4SoIs1YuRhbZjaXPEYTE3ap';
        const clientSecret = env.clientSecret || diskAuth?.clientSecret;

        if (!refreshToken) {
          console.warn('[Salesforce] 当前连接器没有可用的 refresh_token，无法静默续期。');
          return null;
        }

        const tokenEndpoints = Array.from(new Set([
          `${baseUrl}/services/oauth2/token`,
          env.tokenURL || '',
          'https://login.salesforce.com/services/oauth2/token',
          'https://test.sfcrmproducts.cn/services/oauth2/token',
          'https://login.sfcrmproducts.cn/services/oauth2/token',
        ].filter(Boolean)));

        for (let index = 0; index < tokenEndpoints.length; index += 1) {
          const tokenUrl = tokenEndpoints[index];
          try {
            const params = new URLSearchParams();
            params.append('grant_type', 'refresh_token');
            params.append('client_id', clientId);
            if (clientSecret) params.append('client_secret', clientSecret);
            params.append('refresh_token', refreshToken);

            const refreshRes = await axios.post(tokenUrl, params.toString(), {
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              timeout: 10000,
            });
            const refreshedToken = this.normalizeAccessToken(refreshRes.data?.access_token || '');
            if (refreshedToken && refreshedToken !== rejectedToken) {
              if (refreshRes.data?.refresh_token) tokenData.refresh_token = refreshRes.data.refresh_token;
              console.log(`[Salesforce] OAuth refresh_token 续期成功（端点尝试 ${index + 1}）。`);
              return refreshedToken;
            }
            console.warn(`[Salesforce] OAuth refresh 端点尝试 ${index + 1} 未返回新的 Access Token。`);
          } catch (refreshError: any) {
            const status = refreshError.response?.status;
            const oauthError = refreshError.response?.data?.error;
            console.warn(`[Salesforce] OAuth refresh 端点尝试 ${index + 1} 失败${status ? ` (HTTP ${status})` : ''}${oauthError ? ` · ${String(oauthError).slice(0, 100)}` : ''}。`);
          }
        }
        return null;
      } finally {
        if (this.authRecoveryPromises.get(recoveryKey) === recovery) {
          this.authRecoveryPromises.delete(recoveryKey);
        }
      }
    });
    this.authRecoveryPromises.set(recoveryKey, recovery);
    return recovery;
  }

  /**
   * 核心请求包装器：具备 401 自动无感重试与 Token 静默换新机制
   * 彻底避免因会话过期将 401 错误直接抛出给大模型或前端页面
   */
  private async requestWithAuth<T = any>(
    env: NeoEnvironment,
    tokenData: TokenData,
    config: AxiosRequestConfig
  ): Promise<T> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const fullUrl = config.url?.startsWith('http') ? config.url : `${baseUrl}${config.url}`;

    const headers = {
      'Content-Type': 'application/json',
      ...(config.headers || {}),
      Authorization: this.getBearerAuthorization(tokenData.access_token),
    };

    try {
      const res = await axios({
        ...config,
        url: fullUrl,
        headers,
        timeout: config.timeout || 20000,
      });
      return res.data;
    } catch (err: any) {
      const responseErrors = Array.isArray(err.response?.data) ? err.response.data : [err.response?.data];
      const errorCodes = responseErrors.map((item: any) => String(item?.errorCode || '').toUpperCase()).filter(Boolean);
      const isAuthFailure = err.response?.status === 401 || errorCodes.some((code: string) => ['INVALID_SESSION_ID', 'INVALID_AUTH_HEADER'].includes(code));

      if (isAuthFailure) {
        console.warn(`[Salesforce] 检测到认证错误 (${errorCodes.join(', ') || `HTTP ${err.response?.status || 'unknown'}`})，正在启动自动无感续期与重试...`);

        const newAccessToken = await this.recoverAccessTokenAfterAuthFailure(env, tokenData, baseUrl);

        // 3. 拿到有效新 Token 后，立即更新内存与本地持久化，并执行自动无感重试
        if (newAccessToken) {
          if (this.normalizeAccessToken(newAccessToken) !== this.normalizeAccessToken(tokenData.access_token)) {
            tokenData.access_token = newAccessToken;
            tokenData.savedAt = Date.now();
            tokenData.expiresAt = Date.now() + (tokenData.expires_in || 7200) * 1000;
            this.tokenRefreshCallback?.(env, tokenData);
          }

          console.log('[Salesforce] Access Token 续期成功，正在自动重发刚刚失败的 API 请求...');
          try {
            const retryRes = await axios({
              ...config,
              url: fullUrl,
              headers: {
                ...headers,
                Authorization: this.getBearerAuthorization(newAccessToken),
              },
              timeout: config.timeout || 20000,
            });
            return retryRes.data;
          } catch (retryError: any) {
            throw new Error(`Salesforce 续期后重试失败 · ${this.getRequestErrorMessage(retryError)}`);
          }
        }

        throw new Error(`Salesforce 认证失败（${errorCodes.join(', ') || `HTTP ${err.response?.status || 'unknown'}`}），本地 CLI 与 OAuth 静默续期均未取得新 token。请在连接器详情页重新登录该 Salesforce 环境后重试。`);
      }

      // 非 401 或重试后依然失败时抛出友好错误
      const apiMsg = this.getRequestErrorMessage(err);
      throw new Error(apiMsg || `Salesforce 请求失败 (HTTP ${err.response?.status || '网络异常'})`);
    }
  }

  /**
   * 1. 拉取 Salesforce 所有 SObject 列表 (GET /services/data/v59.0/sobjects/)
   */
  public async fetchObjectList(env: NeoEnvironment, tokenData: TokenData): Promise<EntityMetadata[]> {
    const data = await this.requestWithAuth(env, tokenData, {
      method: 'GET',
      url: '/services/data/v59.0/sobjects/',
    });
    const sobjects = data?.sobjects || [];

    return sobjects
      .filter((s: any) => s.queryable && !s.deprecatedAndHidden)
      .map((s: any) => ({
        apiKey: s.name,
        label: s.label || s.name,
        description: `Salesforce 【${s.label}】(${s.custom ? '自定义对象' : '标准对象'})`,
        isStandard: !s.custom,
        enableBusitype: true,
        enableGroupMember: false,
        enableScriptExecutor: false,
        enableCheckrule: true,
        enableDuplicaterule: true,
        detail: s.customSetting || false,
        objectType: s.custom ? 2 : 1,
      }));
  }

  /**
   * 2. 探测 Salesforce 指定 SObject 的 Describe 元数据 (GET /services/data/v59.0/sobjects/{sObjectName}/describe)
   */
  public async describeObject(
    env: NeoEnvironment,
    tokenData: TokenData,
    sObjectName: string
  ): Promise<FieldMetadata[]> {
    const data = await this.requestWithAuth(env, tokenData, {
      method: 'GET',
      url: `/services/data/v59.0/sobjects/${encodeURIComponent(sObjectName)}/describe`,
    });
    const fields = data?.fields || [];

    return fields.map((f: any) => {
      const typeStr = String(f.type || 'string').toLowerCase();
      let itemType = 1;
      if (typeStr === 'picklist') itemType = 3;
      else if (typeStr === 'multipicklist') itemType = 4;
      else if (typeStr === 'int' || typeStr === 'integer') itemType = 5;
      else if (typeStr === 'currency' || typeStr === 'double' || typeStr === 'percent') itemType = 6;
      else if (typeStr === 'date') itemType = 7;
      else if (typeStr === 'datetime') itemType = 8;
      else if (typeStr === 'reference') itemType = 10;
      else if (typeStr === 'boolean') itemType = 31;

      return {
        apiKey: f.name,
        label: f.label || f.name,
        itemType,
        typeName: f.type || 'string',
        currency: typeStr === 'currency',
        custom: Boolean(f.custom),
        maxLength: f.length,
        decimal: f.scale,
        referObjectApiKey: Array.isArray(f.referenceTo) && f.referenceTo.length > 0 ? f.referenceTo[0] : undefined,
        pickOption: Array.isArray(f.picklistValues)
          ? f.picklistValues.map((opt: any) => ({
              optionCode: opt.value,
              optionLabel: opt.label || opt.value,
            }))
          : undefined,
        description: f.inlineHelpText || (f.nillable ? '' : '必填字段'),
      };
    });
  }

  /**
   * 3. 执行 Salesforce SOQL 查询 (GET /services/data/v59.0/query/?q={soql})
   */
  public async executeQuery(
    env: NeoEnvironment,
    tokenData: TokenData,
    rawSoql: string
  ): Promise<QueryResultData> {
    const cleanSoql = rawSoql.replace(/^```(?:soql|sql)?\s*/i, '').replace(/\s*```$/i, '').trim().replace(/;+$/, '');
    const data = await this.requestWithAuth(env, tokenData, {
      method: 'GET',
      url: `/services/data/v59.0/query/?q=${encodeURIComponent(cleanSoql)}`,
      timeout: 25000,
    });

    const records = data?.records || [];
    const totalSize = Number(data?.totalSize || records.length);
    const fields = records.length > 0 ? Object.keys(records[0]).filter((k) => k !== 'attributes') : ['Id', 'Name'];

    return {
      records,
      totalSize,
      fields,
    };
  }

  public async executeQueryAll(
    env: NeoEnvironment,
    tokenData: TokenData,
    rawSoql: string,
    maxRecords = Number.MAX_SAFE_INTEGER
  ): Promise<QueryResultData> {
    const cleanSoql = rawSoql.replace(/^```(?:soql|sql)?\s*/i, '').replace(/\s*```$/i, '').trim().replace(/;+$/, '');
    const recordLimit = Math.max(0, Math.floor(maxRecords));
    const firstPage = await this.requestWithAuth(env, tokenData, {
      method: 'GET',
      url: `/services/data/v59.0/query/?q=${encodeURIComponent(cleanSoql)}`,
      timeout: 25000,
    });
    const records: Record<string, any>[] = [...(firstPage?.records || [])].slice(0, recordLimit);
    const totalSize = Number(firstPage?.totalSize ?? records.length);
    let fields = records.length > 0 ? Object.keys(records[0]).filter((key) => key !== 'attributes') : ['Id', 'Name'];
    let page = firstPage;
    const visitedUrls = new Set<string>();
    const baseOrigin = new URL(this.getBaseUrl(env, tokenData)).origin;

    while (page?.done === false && records.length < recordLimit) {
      if (!page.nextRecordsUrl) throw new Error('Salesforce 查询尚未完成，但分页响应未提供 nextRecordsUrl');
      const nextUrl = new URL(String(page.nextRecordsUrl), this.getBaseUrl(env, tokenData));
      if (nextUrl.origin !== baseOrigin || !nextUrl.pathname.startsWith('/services/data/')) {
        throw new Error('Salesforce 返回了无效的查询分页地址');
      }
      if (visitedUrls.has(nextUrl.href)) throw new Error('Salesforce 查询分页游标重复，已停止以避免重复读取');
      visitedUrls.add(nextUrl.href);

      const nextPage = await this.requestWithAuth(env, tokenData, { method: 'GET', url: nextUrl.href, timeout: 25000 });
      const pageRecords = Array.isArray(nextPage?.records) ? nextPage.records : [];
      if (records.length === 0 && pageRecords.length > 0) fields = Object.keys(pageRecords[0]).filter((key) => key !== 'attributes');
      records.push(...pageRecords.slice(0, recordLimit - records.length));
      page = nextPage;
    }

    return { records, totalSize, fields };
  }

  /**
   * 4. 查看单个记录详情 (GET /services/data/v59.0/sobjects/{sObjectName}/{id})
   */
  public async getRecordDetail(
    env: NeoEnvironment,
    tokenData: TokenData,
    sObjectName: string,
    recordId: string | number
  ): Promise<Record<string, any>> {
    return await this.requestWithAuth(env, tokenData, {
      method: 'GET',
      url: `/services/data/v59.0/sobjects/${encodeURIComponent(sObjectName)}/${encodeURIComponent(String(recordId))}`,
    });
  }

  /**
   * 5. 按关键字搜索记录 (通过 SOQL 模糊查询)
   */
  public async searchRecords(
    env: NeoEnvironment,
    tokenData: TokenData,
    sObjectName: string,
    keyword: string,
    limit = 50
  ): Promise<Array<{ id: string | number; name: string }>> {
    const safeKw = keyword ? keyword.replace(/'/g, "\\'") : '';
    let nameField = 'Name';
    const lowerObj = sObjectName.toLowerCase();
    if (lowerObj === 'case') nameField = 'CaseNumber';
    else if (lowerObj === 'contract') nameField = 'ContractNumber';
    else if (lowerObj === 'task' || lowerObj === 'event') nameField = 'Subject';

    try {
      const whereClause = safeKw ? ` WHERE ${nameField} LIKE '%${safeKw}%'` : '';
      const soql = `SELECT Id, ${nameField} FROM ${sObjectName}${whereClause} LIMIT ${limit}`;
      const res = await this.executeQuery(env, tokenData, soql);
      return (res.records || []).map((r: any) => ({
        id: r.Id,
        name: r[nameField] || r.Id,
      }));
    } catch {
      try {
        const whereClause = safeKw ? ` WHERE Name LIKE '%${safeKw}%'` : '';
        const soql = `SELECT Id, Name FROM ${sObjectName}${whereClause} LIMIT ${limit}`;
        const res = await this.executeQuery(env, tokenData, soql);
        return (res.records || []).map((r: any) => ({
          id: r.Id,
          name: r.Name || r.Id,
        }));
      } catch {
        const soql = `SELECT Id FROM ${sObjectName} LIMIT ${limit}`;
        const res = await this.executeQuery(env, tokenData, soql);
        return (res.records || []).map((r: any) => ({
          id: r.Id,
          name: r.Id,
        }));
      }
    }
  }

  /**
   * 6. 创建记录 (POST /services/data/v59.0/sobjects/{sObjectName})
   */
  public async createRecord(
    env: NeoEnvironment,
    tokenData: TokenData,
    sObjectName: string,
    recordData: Record<string, any>
  ): Promise<{ id: string; success: boolean }> {
    if (this.isProductionEnvironment(env, tokenData)) {
      throw new Error(`【安全生产红线拦截】当前连接的是 Salesforce 生产正式环境 (${env.name})，系统已强制开启生产写保护，严禁执行新建记录操作！沙盒测试环境 (Sandbox/Test) 不受限制。`);
    }
    const data = await this.requestWithAuth(env, tokenData, {
      method: 'POST',
      url: `/services/data/v59.0/sobjects/${encodeURIComponent(sObjectName)}`,
      data: recordData,
    });
    return { id: data.id, success: Boolean(data.success) };
  }

  /**
   * 7. 更新记录 (PATCH /services/data/v59.0/sobjects/{sObjectName}/{id})
   */
  public async updateRecord(
    env: NeoEnvironment,
    tokenData: TokenData,
    sObjectName: string,
    recordId: string | number,
    recordData: Record<string, any>
  ): Promise<{ success: boolean }> {
    if (this.isProductionEnvironment(env, tokenData)) {
      throw new Error(`【安全生产红线拦截】当前连接的是 Salesforce 生产正式环境 (${env.name})，系统已强制开启生产写保护，严禁执行更改/更新记录操作！沙盒测试环境 (Sandbox/Test) 不受限制。`);
    }
    await this.requestWithAuth(env, tokenData, {
      method: 'PATCH',
      url: `/services/data/v59.0/sobjects/${encodeURIComponent(sObjectName)}/${encodeURIComponent(String(recordId))}`,
      data: recordData,
    });
    return { success: true };
  }

  /**
   * 8. 删除记录 (DELETE /services/data/v59.0/sobjects/{sObjectName}/{id})
   */
  public async deleteRecord(
    env: NeoEnvironment,
    tokenData: TokenData,
    sObjectName: string,
    recordId: string | number
  ): Promise<{ success: boolean }> {
    if (this.isProductionEnvironment(env, tokenData)) {
      throw new Error(`【安全生产红线拦截】当前连接的是 Salesforce 生产正式环境 (${env.name})，系统已强制开启生产写保护，严禁执行删除记录操作！沙盒测试环境 (Sandbox/Test) 不受限制。`);
    }
    await this.requestWithAuth(env, tokenData, {
      method: 'DELETE',
      url: `/services/data/v59.0/sobjects/${encodeURIComponent(sObjectName)}/${encodeURIComponent(String(recordId))}`,
    });
    return { success: true };
  }

  /**
   * 9. 创建自定义对象 (Tooling API POST /services/data/v59.0/tooling/sobjects/CustomObject)
   */
  public async createCustomObject(
    env: NeoEnvironment,
    tokenData: TokenData,
    payload: { apiKey: string; label: string; description?: string; autoNumberFormat?: string }
  ): Promise<{ success: boolean; data?: any; createdApiKey?: string; error?: string }> {
    const cleanApiKey = payload.apiKey.trim().replace(/__c$/i, '');
    const fullName = `${cleanApiKey}__c`;
    const body = {
      FullName: fullName,
      Metadata: {
        label: payload.label.trim(),
        pluralLabel: `${payload.label.trim()}s`,
        description: payload.description || payload.label.trim(),
        nameField: {
          type: payload.autoNumberFormat ? 'AutoNumber' : 'Text',
          label: '名称',
          displayFormat: payload.autoNumberFormat || undefined,
        },
        deploymentStatus: 'Deployed',
        sharingModel: 'ReadWrite',
      },
    };

    try {
      const res = await this.requestWithAuth(env, tokenData, {
        method: 'POST',
        url: '/services/data/v59.0/tooling/sobjects/CustomObject',
        data: body,
      });
      return { success: true, createdApiKey: fullName, data: res };
    } catch (e: any) {
      const errMsg = e.response?.data?.[0]?.message || e.message;
      if (errMsg && (errMsg.includes('already exists') || errMsg.includes('DUPLICATE_DEVELOPER_NAME'))) {
        return { success: true, createdApiKey: fullName };
      }
      return { success: false, error: errMsg };
    }
  }

  /**
   * 10. 创建自定义字段 (Tooling API POST /services/data/v59.0/tooling/sobjects/CustomField)
   */
  public async createCustomField(
    env: NeoEnvironment,
    tokenData: TokenData,
    entityApiKey: string,
    payload: {
      apiKey: string;
      label: string;
      itemType: number;
      currency?: boolean;
      maxLength?: number;
      decimal?: number;
      pickOption?: any[];
      description?: string;
    }
  ): Promise<{ success: boolean; data?: any; createdApiKey?: string; error?: string }> {
    let cleanEntity = entityApiKey.trim();
    const standardObjects = new Set(['account', 'contact', 'opportunity', 'lead', 'order', 'case', 'contract', 'user']);
    if (!cleanEntity.endsWith('__c') && !standardObjects.has(cleanEntity.toLowerCase())) {
      cleanEntity = `${cleanEntity}__c`;
    }
    const cleanField = payload.apiKey.trim().replace(/__c$/i, '');
    const fullName = `${cleanEntity}.${cleanField}__c`;

    let sfType = 'Text';
    let length = payload.maxLength || 255;
    let precision = 18;
    let scale = payload.decimal !== undefined ? payload.decimal : 2;

    const it = Number(payload.itemType);
    if (it === 1) {
      sfType = 'Text';
      length = Math.min(Number(payload.maxLength) || 255, 255);
    } else if (it === 2) {
      sfType = 'LongTextArea';
      length = Math.min(Number(payload.maxLength) || 32768, 131072);
    } else if (it === 40) {
      sfType = 'Html'; // 富文本
      length = Math.min(Number(payload.maxLength) || 32768, 131072);
    } else if (it === 10) {
      sfType = 'Lookup'; // 查找关联
    } else if (it === 3) {
      sfType = 'Picklist';
    } else if (it === 4) {
      sfType = 'MultiselectPicklist';
    } else if (it === 5) {
      sfType = 'Number'; // 整数
      precision = 18;
      scale = 0;
    } else if (it === 6) {
      sfType = payload.currency !== false ? 'Currency' : 'Number';
      precision = 18;
      scale = payload.decimal !== undefined ? Number(payload.decimal) : 2;
    } else if (it === 33) {
      sfType = 'Percent';
      precision = 18;
      scale = payload.decimal !== undefined ? Number(payload.decimal) : 2;
    } else if (it === 7) {
      sfType = 'Date';
    } else if (it === 21) {
      sfType = 'DateTime';
    } else if (it === 31) {
      sfType = 'Checkbox';
    } else if (it === 22) {
      sfType = 'Phone';
    } else if (it === 23) {
      sfType = 'Email';
    } else if (it === 24) {
      sfType = 'Url';
    } else {
      sfType = 'Text';
      length = 255;
    }

    const metadata: Record<string, any> = {
      type: sfType,
      label: payload.label.trim(),
      description: payload.description || payload.label.trim(),
    };

    if (sfType === 'Text') {
      metadata.length = length;
    } else if (sfType === 'LongTextArea') {
      metadata.length = length;
      metadata.visibleLines = 3;
    } else if (sfType === 'Html') {
      metadata.length = length;
      metadata.visibleLines = 25;
    } else if (sfType === 'Number' || sfType === 'Currency' || sfType === 'Percent') {
      metadata.precision = precision;
      metadata.scale = scale;
    } else if (sfType === 'Checkbox') {
      metadata.defaultValue = false;
    } else if (sfType === 'Lookup') {
      let refObj = (payload.referObjectApiKey || 'Account').trim();
      const standardObjs = new Set(['account', 'contact', 'opportunity', 'lead', 'order', 'case', 'contract', 'user']);
      if (!refObj.endsWith('__c') && !standardObjs.has(refObj.toLowerCase())) {
        refObj = `${refObj}__c`;
      }
      metadata.referenceTo = refObj;
      metadata.relationshipLabel = `${payload.label.trim()}s`;
      metadata.relationshipName = `${cleanField}s`;
    } else if (sfType === 'Picklist' || sfType === 'MultiselectPicklist') {
      const opts = (payload.pickOption || []).map((o: any) => {
        const val = typeof o === 'string' ? o : o.optionLabel || o.label || o.name || '选项';
        return { fullName: val, default: false, label: val };
      });
      metadata.valueSet = {
        valueSetDefinition: {
          sorted: false,
          value: opts.length > 0 ? opts : [{ fullName: '默认选项', default: false, label: '默认选项' }],
        },
      };
      if (sfType === 'MultiselectPicklist') {
        metadata.visibleLines = 4;
      }
    }

    const body = {
      FullName: fullName,
      Metadata: metadata,
    };

    try {
      const res = await this.requestWithAuth(env, tokenData, {
        method: 'POST',
        url: '/services/data/v59.0/tooling/sobjects/CustomField',
        data: body,
      });

      // 关键修复：Salesforce 创建自定义字段后，默认对任何用户/管理员均为不可见状态 (无 FLS 读写权限)！
      // 系统在此处自动为当前用户的系统管理员权限集赋予该字段的【读取与编辑权限 (FieldPermissions)】，确保创建后在界面、SOQL 与前台可立即被搜索并展示
      try {
        const userId = tokenData.userInfo?.userId;
        if (userId) {
          const uRes = await this.executeQuery(env, tokenData, `SELECT ProfileId FROM User WHERE Id = '${userId}' LIMIT 1`);
          const profileId = uRes.records?.[0]?.ProfileId;
          if (profileId) {
            const psRes = await this.executeQuery(
              env,
              tokenData,
              `SELECT Id FROM PermissionSet WHERE ProfileId = '${profileId}' AND IsOwnedByProfile = true LIMIT 1`
            );
            const permSetId = psRes.records?.[0]?.Id;
            if (permSetId) {
              await this.requestWithAuth(env, tokenData, {
                method: 'POST',
                url: '/services/data/v59.0/sobjects/FieldPermissions',
                data: {
                  ParentId: permSetId,
                  SobjectType: cleanEntity,
                  Field: fullName,
                  PermissionsRead: true,
                  PermissionsEdit: it !== 9 && it !== 20,
                },
              });
              console.log(`[Salesforce] 已成功为字段 [${fullName}] 分配管理员字段级读写权限 (FLS)`);
            }
          }
        }
      } catch (flsErr: any) {
        console.warn('[Salesforce] 自动赋予字段级安全性 (FLS) 提示 (非致命):', flsErr.message);
      }

      return { success: true, createdApiKey: `${cleanField}__c`, data: res };
    } catch (e: any) {
      const rawMsg = e.response?.data?.[0]?.message || e.message;
      const rawCode = e.response?.data?.[0]?.errorCode;

      if (rawCode === 'CUSTOM_ENTITY_OR_FIELD_LIMIT' || (rawMsg && rawMsg.includes('maximum number of custom fields'))) {
        return {
          success: false,
          error: `【Salesforce 字段上限拦截】当前对象 [${cleanEntity}] 已达到 Salesforce 允许的自定义字段最大数量上限 (800个)！Salesforce 拒绝创建新字段。请前往 Salesforce 设置【对象管理器 > ${cleanEntity} > 字段与关系 > 已删除字段】彻底清空并释放已删除字段，或更换到其他业务对象。`,
        };
      }

      if (rawMsg && (rawMsg.includes('already exists') || rawMsg.includes('DUPLICATE_DEVELOPER_NAME'))) {
        return { success: true, createdApiKey: `${cleanField}__c` };
      }
      return { success: false, error: rawMsg };
    }
  }
}
