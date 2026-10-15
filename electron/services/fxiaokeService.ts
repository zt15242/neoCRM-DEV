import axios from 'axios';
import { randomUUID } from 'node:crypto';
import { NeoEnvironment, TokenData, EntityMetadata, FieldMetadata, QueryResultData } from '../../shared/types';

export class FxiaokeService {
  private activeUserCache = new Map<string, string>();

  private getBaseUrl(env: NeoEnvironment, tokenData: TokenData): string {
    const raw = tokenData.instance_uri || env.neoBaseURL || 'https://open.fxiaoke.com';
    return raw.endsWith('/') ? raw.slice(0, -1) : raw;
  }

  /**
   * 自动探测并获取一个可用的活跃员工 openUserId (FSUID_...)
   */
  public async getActiveOpenUserId(env: NeoEnvironment, tokenData: TokenData): Promise<string> {
    const cacheKey = `${tokenData.access_token}_${tokenData.tenant_id}`;
    if (this.activeUserCache.has(cacheKey)) {
      return this.activeUserCache.get(cacheKey)!;
    }

    const baseUrl = this.getBaseUrl(env, tokenData);
    const token = tokenData.access_token;
    const openCorpId = String(tokenData.userInfo?.userId || tokenData.tenant_id || '');

    try {
      const url = `${baseUrl}/cgi/user/simpleList?thirdTraceId=${randomUUID()}`;
      const payload = {
        corpAccessToken: token,
        corpId: openCorpId,
        currentOpenUserId: openCorpId,
        departmentId: 999999,
        fetchChild: true,
      };

      const res = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
      const userList = res.data?.userList || [];

      // 寻找首个有效员工
      for (const u of userList.slice(0, 15)) {
        if (u.openUserId && u.openUserId.startsWith('FSUID_')) {
          this.activeUserCache.set(cacheKey, u.openUserId);
          return u.openUserId;
        }
      }

      if (userList.length > 0 && userList[0].openUserId) {
        this.activeUserCache.set(cacheKey, userList[0].openUserId);
        return userList[0].openUserId;
      }
    } catch (e: any) {
      console.warn('获取纷享销客活跃员工 openUserId 异常:', e.message);
    }

    return openCorpId;
  }

  /**
   * 1. 拉取纷享销客租户所有对象列表 (POST /cgi/crm/v2/object/list)
   */
  public async fetchObjectList(env: NeoEnvironment, tokenData: TokenData): Promise<EntityMetadata[]> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const token = tokenData.access_token;
    const openCorpId = String(tokenData.userInfo?.userId || tokenData.tenant_id || '');
    const currentOpenUserId = await this.getActiveOpenUserId(env, tokenData);

    const url = `${baseUrl}/cgi/crm/v2/object/list?thirdTraceId=${randomUUID()}`;
    const payload = {
      corpAccessToken: token,
      corpId: openCorpId,
      currentOpenUserId,
      includeNull: true,
    };

    const res = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
    const data = res.data;

    if (data.errorCode !== 0 && data.errorCode !== '0') {
      throw new Error(`纷享销客获取对象列表失败: ${data.errorMessage || JSON.stringify(data)}`);
    }

    const objects = data.data?.objects || [];
    return objects.map((o: any) => ({
      apiKey: o.describeApiName || o.apiName,
      label: o.describeDisplayName || o.name || o.describeApiName,
      description: `纷享销客【${o.describeDisplayName || o.describeApiName}】(${o.defineType === 'package' ? '标准对象' : '自定义对象'})`,
      isStandard: o.defineType === 'package',
      enableBusitype: true,
      enableGroupMember: false,
      enableScriptExecutor: false,
      enableCheckrule: true,
      enableDuplicaterule: true,
      detail: o.isDetail || false,
      objectType: o.defineType === 'package' ? 1 : 2,
    }));
  }

  /**
   * 2. 探测纷享销客指定对象的元数据与字段定义 (POST /cgi/crm/v2/object/describe)
   */
  public async describeObject(
    env: NeoEnvironment,
    tokenData: TokenData,
    objectApiName: string
  ): Promise<FieldMetadata[]> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const token = tokenData.access_token;
    const openCorpId = String(tokenData.userInfo?.userId || tokenData.tenant_id || '');
    const currentOpenUserId = await this.getActiveOpenUserId(env, tokenData);

    // 标准化对象名称，例如 "account" -> "AccountObj", "contact" -> "ContactObj"
    let normalizedApiName = objectApiName.trim();
    const commonObjMap: Record<string, string> = {
      account: 'AccountObj',
      客户: 'AccountObj',
      contact: 'ContactObj',
      联系人: 'ContactObj',
      lead: 'LeadsObj',
      线索: 'LeadsObj',
      opportunity: 'NewOpportunityObj',
      商机: 'NewOpportunityObj',
      order: 'SalesOrderObj',
      订单: 'SalesOrderObj',
      合同: 'ContractObj',
      contract: 'ContractObj',
      product: 'ProductObj',
      产品: 'ProductObj',
      payment: 'PaymentObj',
      回款: 'PaymentObj',
    };
    if (commonObjMap[normalizedApiName.toLowerCase()] || commonObjMap[normalizedApiName]) {
      normalizedApiName = commonObjMap[normalizedApiName.toLowerCase()] || commonObjMap[normalizedApiName];
    } else if (!normalizedApiName.endsWith('Obj') && !normalizedApiName.endsWith('__c')) {
      normalizedApiName = `${normalizedApiName.charAt(0).toUpperCase()}${normalizedApiName.slice(1)}Obj`;
    }

    const url = `${baseUrl}/cgi/crm/v2/object/describe?thirdTraceId=${randomUUID()}`;
    const payload = {
      corpAccessToken: token,
      corpId: openCorpId,
      currentOpenUserId,
      apiName: normalizedApiName,
      includeDetail: true,
      includeNull: true,
    };

    const res = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
    const data = res.data;

    if (data.errorCode !== 0 && data.errorCode !== '0') {
      throw new Error(`纷享销客 Describe [${normalizedApiName}] 失败: ${data.errorMessage || JSON.stringify(data)}`);
    }

    const desc = data.data?.describe || {};
    const fieldsMap = desc.fields || {};

    return Object.entries(fieldsMap).map(([fKey, fVal]: any) => {
      const typeStr = String(fVal.type || 'text').toLowerCase();
      let itemType = 1; // 默认单行文本
      if (typeStr.includes('select') || typeStr.includes('radio') || typeStr === 'pick_list') itemType = 3;
      else if (typeStr.includes('multi_select') || typeStr.includes('check_box')) itemType = 4;
      else if (typeStr === 'integer' || typeStr === 'int' || typeStr === 'number') itemType = 5;
      else if (typeStr === 'currency' || typeStr === 'money' || typeStr.includes('amount')) itemType = 6;
      else if (typeStr === 'date') itemType = 7;
      else if (typeStr === 'datetime' || typeStr === 'timestamp') itemType = 8;
      else if (typeStr === 'reference' || typeStr === 'lookup' || typeStr === 'owner') itemType = 10;
      else if (typeStr.includes('file') || typeStr.includes('image')) itemType = 14;
      else if (typeStr === 'boolean' || typeStr === 'bool') itemType = 31;

      return {
        apiKey: fKey,
        label: fVal.label || fKey,
        itemType,
        typeName: fVal.type || 'text',
        currency: itemType === 6,
        custom: fVal.define_type === 'custom' || fKey.endsWith('__c'),
        maxLength: fVal.max_length,
        decimal: fVal.decimal_places,
        referObjectApiKey: fVal.target_api_name || fVal.describe_api_name,
        pickOption: Array.isArray(fVal.options)
          ? fVal.options.map((opt: any) => ({
              optionCode: opt.value ?? opt.id ?? opt.name,
              optionLabel: opt.label || opt.name || String(opt.value),
            }))
          : undefined,
        description: fVal.description || (fVal.is_required ? '必填字段' : ''),
      };
    });
  }

  /**
   * 3. 纷享销客数据查询 (POST /cgi/crm/v2/data/query)
   */
  public async queryData(
    env: NeoEnvironment,
    tokenData: TokenData,
    params: { objectApiName?: string; limit?: number; offset?: number; searchFilter?: any; sql?: string }
  ): Promise<QueryResultData> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const token = tokenData.access_token;
    const openCorpId = String(tokenData.userInfo?.userId || tokenData.tenant_id || '');
    const currentOpenUserId = await this.getActiveOpenUserId(env, tokenData);

    let targetObjName = params.objectApiName || 'AccountObj';
    let limit = Math.min(params.limit || 30, 50); // 纷享单页最大50
    let offset = params.offset || 0;

    // 如果传入的是 SQL 语句，解析其中的表名和 limit
    if (params.sql) {
      const fromMatch = params.sql.match(/\bFROM\s+([a-zA-Z0-9_]+)\b/i);
      if (fromMatch) {
        targetObjName = fromMatch[1];
      }
      const limitMatch = params.sql.match(/\bLIMIT\s+(\d+)\b/i);
      if (limitMatch) {
        limit = Math.min(parseInt(limitMatch[1], 10), 50);
      }
      const offsetMatch = params.sql.match(/\bOFFSET\s+(\d+)\b/i);
      if (offsetMatch) {
        offset = parseInt(offsetMatch[1], 10);
      }
    }

    const url = `${baseUrl}/cgi/crm/v2/data/query?thirdTraceId=${randomUUID()}`;
    const payload = {
      corpAccessToken: token,
      corpId: openCorpId,
      currentOpenUserId,
      data: {
        dataObjectApiName: targetObjName,
        search_query_info: {
          limit,
          offset,
        },
      },
    };

    let res = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
    let data = res.data;

    if (data.errorCode === 50009) {
      try {
        const userRes = await axios.post(`${baseUrl}/cgi/user/simpleList?thirdTraceId=${randomUUID()}`, {
          corpAccessToken: token,
          corpId: openCorpId,
          currentOpenUserId: openCorpId,
          departmentId: 999999,
          fetchChild: true,
        });
        const users = userRes.data?.userList || [];
        for (const u of users.slice(0, 20)) {
          if (u.openUserId && u.openUserId !== currentOpenUserId) {
            const retryPayload = {
              ...payload,
              currentOpenUserId: u.openUserId,
            };
            const retryRes = await axios.post(url, retryPayload, { headers: { 'Content-Type': 'application/json' }, timeout: 8000 });
            if (retryRes.data?.errorCode === 0) {
              res = retryRes;
              data = retryRes.data;
              const cacheKey = `${tokenData.access_token}_${tokenData.tenant_id}`;
              this.activeUserCache.set(cacheKey, u.openUserId);
              break;
            }
          }
        }
      } catch {}
    }

    if (data.errorCode !== 0 && data.errorCode !== '0') {
      throw new Error(`纷享销客查询 [${targetObjName}] 失败: ${data.errorMessage || JSON.stringify(data)}`);
    }

    const dataList = data.data?.dataList || [];
    const total = Number(data.data?.total || dataList.length);
    const fields = dataList.length > 0 ? Object.keys(dataList[0]) : ['_id', 'name'];

    return {
      records: dataList,
      totalSize: total,
      fields,
    };
  }
}
