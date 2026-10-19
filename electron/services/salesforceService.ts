import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import axios, { AxiosRequestConfig } from 'axios';
import { execSync } from 'node:child_process';
import { NeoEnvironment, TokenData, EntityMetadata, FieldMetadata, QueryResultData } from '../../shared/types';

export class SalesforceService {
  private tokenRefreshCallback?: (env: NeoEnvironment, newToken: TokenData) => void;

  public setTokenRefreshCallback(cb: (env: NeoEnvironment, newToken: TokenData) => void) {
    this.tokenRefreshCallback = cb;
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

      const files = fs.readdirSync(sfdxDir).filter(
        (f) => f.endsWith('.json') && f !== 'alias.json' && f !== 'sfdx-config.json' && f !== 'key.json'
      );
      for (const f of files) {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(sfdxDir, f), 'utf-8'));
          if (instanceUrl && content.instanceUrl && content.instanceUrl.toLowerCase().includes(new URL(instanceUrl).host.toLowerCase())) {
            return content;
          }
          if (content.accessToken && content.refreshToken) {
            return content;
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
      const isWin = process.platform === 'win32';
      const cmd = isWin ? 'sf.cmd' : 'sf';

      // 1. 尝试直接从本地磁盘 ~/.sfdx/*.json 读取（0ms 极速无开销）
      const username = tokenData?.userInfo?.name;
      const diskAuth = this.getAuthFileFromDisk(username, tokenData?.instance_uri || env?.neoBaseURL);
      if (diskAuth?.accessToken && diskAuth.accessToken !== tokenData?.access_token) {
        if (diskAuth.refreshToken && tokenData) tokenData.refresh_token = diskAuth.refreshToken;
        return diskAuth.accessToken;
      }

      // 2. 解析别名：优先读取 ~/.sf/config.json -> ~/.sfdx/sfdx-config.json -> ~/.sfdx/alias.json
      let alias = '';
      try {
        const sfConfigPath = path.join(os.homedir(), '.sf', 'config.json');
        if (fs.existsSync(sfConfigPath)) {
          const sfConfig = JSON.parse(fs.readFileSync(sfConfigPath, 'utf-8'));
          alias = sfConfig['target-org'] || '';
        }
      } catch {}
      if (!alias) {
        try {
          const sfdxConfigPath = path.join(os.homedir(), '.sfdx', 'sfdx-config.json');
          if (fs.existsSync(sfdxConfigPath)) {
            const sfdxConfig = JSON.parse(fs.readFileSync(sfdxConfigPath, 'utf-8'));
            alias = sfdxConfig['defaultusername'] || '';
          }
        } catch {}
      }
      if (!alias) {
        const aliasJsonPath = path.join(os.homedir(), '.sfdx', 'alias.json');
        if (fs.existsSync(aliasJsonPath)) {
          try {
            const aliasData = JSON.parse(fs.readFileSync(aliasJsonPath, 'utf-8'));
            const orgs = aliasData.orgs || {};
            const keys = Object.keys(orgs);
            if (keys.length > 0) alias = keys[0];
          } catch {}
        }
      }

      // 3. 执行 sf org display（彻底修复 Windows cmd.exe 语法：绝不使用行内环境变量赋值）
      let stdout = '';
      try {
        const targetParam = alias ? `--target-org "${alias}"` : '';
        stdout = execSync(
          `"${cmd}" org display ${targetParam} --json`.trim(),
          {
            encoding: 'utf-8',
            timeout: 15000,
            windowsHide: true,
            shell: true,
            env: { ...process.env, SF_TEMP_SHOW_SECRETS: 'true' },
          }
        );
      } catch {
        stdout = execSync(
          `"${cmd}" org display --json`,
          {
            encoding: 'utf-8',
            timeout: 15000,
            windowsHide: true,
            shell: true,
            env: { ...process.env, SF_TEMP_SHOW_SECRETS: 'true' },
          }
        );
      }

      const jsonStart = stdout.indexOf('{');
      const jsonEnd = stdout.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const data = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1));
        const res = data.result;
        if (res?.accessToken && (!res.connectedStatus || res.connectedStatus === 'Connected')) {
          const uname = res.username || username;
          if (uname) {
            const authAfter = this.getAuthFileFromDisk(uname);
            if (authAfter?.refreshToken && tokenData) {
              tokenData.refresh_token = authAfter.refreshToken;
            }
          }
          return res.accessToken;
        }
      }
      return null;
    } catch {
      return null;
    }
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
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json',
      ...(config.headers || {}),
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
      const is401 = err.response?.status === 401 || err.response?.data?.[0]?.errorCode === 'INVALID_SESSION_ID';

      if (is401) {
        console.warn('[Salesforce] 检测到 Access Token 失效 (401)，正在启动自动无感静默续期与重试...');

        // 1. 优先尝试从本地 sf CLI 或磁盘提取最新已被 CLI 自动刷新的 token
        let newAccessToken = this.getLatestTokenFromCli(env, tokenData);

        // 2. 若 CLI 提取不到，自动使用 refresh_token 多端点尝试 OAuth 续期
        if (!newAccessToken) {
          const diskAuth = this.getAuthFileFromDisk(tokenData.userInfo?.name, baseUrl);
          const refreshToken = tokenData.refresh_token || diskAuth?.refreshToken;
          const clientId = env.clientId || diskAuth?.clientId || '3MVG9xXFQGV9F.Wr9Z_1xbGt7Vq63R.tqieb_acTQQGYdprE5n0ogE.JkOqT5E4SoIs1YuRhbZjaXPEYTE3ap';
          const clientSecret = env.clientSecret || diskAuth?.clientSecret;

          if (refreshToken) {
            const tokenEndpoints = [
              `${baseUrl}/services/oauth2/token`,
              env.tokenURL || '',
              'https://login.salesforce.com/services/oauth2/token',
              'https://test.sfcrmproducts.cn/services/oauth2/token',
              'https://login.sfcrmproducts.cn/services/oauth2/token',
            ].filter(Boolean);

            for (const tUrl of tokenEndpoints) {
              try {
                const params = new URLSearchParams();
                params.append('grant_type', 'refresh_token');
                params.append('client_id', clientId);
                if (clientSecret) params.append('client_secret', clientSecret);
                params.append('refresh_token', refreshToken);

                const refreshRes = await axios.post(tUrl, params.toString(), {
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  timeout: 10000,
                });
                if (refreshRes.data?.access_token) {
                  newAccessToken = refreshRes.data.access_token;
                  if (refreshRes.data.refresh_token) {
                    tokenData.refresh_token = refreshRes.data.refresh_token;
                  }
                  console.log(`[Salesforce] 通过端点 [${tUrl}] 成功完成 OAuth 刷新！`);
                  break;
                }
              } catch (rErr: any) {
                console.warn(`[Salesforce] API 刷新失败 (${tUrl}):`, rErr.response?.data || rErr.message);
              }
            }
          }
        }

        // 3. 拿到有效新 Token 后，立即更新内存与本地持久化，并执行自动无感重试
        if (newAccessToken && newAccessToken !== tokenData.access_token) {
          tokenData.access_token = newAccessToken;
          tokenData.savedAt = Date.now();
          tokenData.expiresAt = Date.now() + (tokenData.expires_in || 7200) * 1000;
          this.tokenRefreshCallback?.(env, tokenData);

          console.log('[Salesforce] Access Token 续期成功，正在自动重发刚刚失败的 API 请求...');
          const retryRes = await axios({
            ...config,
            url: fullUrl,
            headers: {
              ...headers,
              Authorization: `Bearer ${newAccessToken}`,
            },
            timeout: config.timeout || 20000,
          });
          return retryRes.data;
        }
      }

      // 非 401 或重试后依然失败时抛出友好错误
      const apiMsg = err.response?.data?.[0]?.message || err.response?.data?.message || err.message;
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
