import axios from 'axios';
import { NeoEnvironment, TokenData, QueryResultData } from '../../shared/types';

export class DataService {
  // 内存缓存: key 为 `${entityApiKey}_${id}` -> name
  private nameCache = new Map<string, string>();

  private getBaseUrl(env: NeoEnvironment, tokenData: TokenData): string {
    const raw = tokenData.instance_uri || env.neoBaseURL;
    return raw.endsWith('/') ? raw.slice(0, -1) : raw;
  }

  private getHeaders(tokenData: TokenData) {
    return {
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json',
      'xsy-inner-source': 'bff',
    };
  }

  /**
   * 从记录对象中按优先级提取人类可读的名称 (Name)
   */
  public extractRecordName(record: Record<string, any>): string {
    if (!record || typeof record !== 'object') return '';
    return (
      record.name ||
      record.accountName ||
      record.contactName ||
      record.opportunityName ||
      record.leadName ||
      record.priceListName ||
      record.pricebookName ||
      record.territoryName ||
      record.campaignName ||
      record.orderName ||
      record.contractName ||
      record.productName ||
      record.title ||
      record.label ||
      record.fullName ||
      record.userName ||
      record.code ||
      ''
    );
  }

  /**
   * 执行 SQL 查询获取数据列表
   */
  public async executeQuery(
    env: NeoEnvironment,
    tokenData: TokenData,
    sql: string
  ): Promise<{ success: boolean; data?: QueryResultData; error?: string }> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const headers = this.getHeaders(tokenData);
    const encodedSql = encodeURIComponent(sql.trim());
    const url = `${baseUrl}/rest/data/v2/query?q=${encodedSql}`;

    try {
      const res = await axios.get(url, { headers, timeout: 25000 });
      const result = res.data?.result || res.data?.data || {};
      const records: Record<string, any>[] = result.records || [];
      const totalSize = result.totalSize !== undefined ? result.totalSize : records.length;

      let fields: string[] = [];
      if (records.length > 0) {
        fields = Object.keys(records[0]);
      } else {
        const match = sql.match(/SELECT\s+(.*?)\s+FROM/i);
        if (match && match[1]) {
          fields = match[1].split(',').map((f) => f.trim().split(/\s+/).pop() || f.trim());
        }
      }

      return {
        success: true,
        data: {
          records,
          totalSize,
          fields,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: e.response?.data?.msg || e.response?.data?.message || e.message,
      };
    }
  }

  /**
   * 获取单条记录完整详细信息
   */
  public async getRecordDetail(
    env: NeoEnvironment,
    tokenData: TokenData,
    entityApiKey: string,
    id: string | number
  ): Promise<{ success: boolean; data?: Record<string, any>; error?: string }> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const headers = this.getHeaders(tokenData);
    const url = `${baseUrl}/rest/data/v2.0/xobjects/${entityApiKey}/${id}`;

    try {
      const res = await axios.get(url, { headers, timeout: 15000 });
      if (res.data?.data || res.data?.result || res.data) {
        const rec = res.data?.data || res.data?.result || res.data;
        // 顺便写入缓存
        const extractedName = this.extractRecordName(rec);
        if (extractedName) {
          this.nameCache.set(`${entityApiKey}_${id}`, extractedName);
        }
        return { success: true, data: rec };
      }
      return { success: false, error: '未返回有效记录数据' };
    } catch (e: any) {
      // 降级通过 SQL 查询
      try {
        const fallbackSql = `SELECT id FROM ${entityApiKey} WHERE id = ${id}`;
        const qRes = await this.executeQuery(env, tokenData, fallbackSql);
        if (qRes.success && qRes.data?.records.length) {
          const rec = qRes.data.records[0];
          return { success: true, data: rec };
        }
      } catch {}
      return {
        success: false,
        error: e.response?.data?.msg || e.response?.data?.message || e.message,
      };
    }
  }

  /**
   * 智能获取单条记录的显示名称 (包含缓存和智能查找)
   */
  public async getRecordName(
    env: NeoEnvironment,
    tokenData: TokenData,
    entityApiKey: string,
    id: string | number
  ): Promise<string> {
    if (!id || !entityApiKey) return '';
    const cacheKey = `${entityApiKey}_${id}`;
    if (this.nameCache.has(cacheKey)) {
      return this.nameCache.get(cacheKey)!;
    }

    try {
      const detail = await this.getRecordDetail(env, tokenData, entityApiKey, id);
      if (detail.success && detail.data) {
        const name = this.extractRecordName(detail.data);
        if (name) {
          this.nameCache.set(cacheKey, name);
          return name;
        }
      }
    } catch {}

    return '';
  }

  /**
   * 批量获取指定记录的显示名称 (带并发控制和缓存)
   */
  public async getBatchNames(
    env: NeoEnvironment,
    tokenData: TokenData,
    entityApiKey: string,
    ids: (string | number)[]
  ): Promise<Record<string, string>> {
    const idList = ids.filter(Boolean);
    if (!idList.length) return {};

    const nameMap: Record<string, string> = {};
    const unCachedIds: (string | number)[] = [];

    for (const id of Array.from(new Set(idList))) {
      const cacheKey = `${entityApiKey}_${id}`;
      if (this.nameCache.has(cacheKey)) {
        nameMap[String(id)] = this.nameCache.get(cacheKey)!;
      } else {
        unCachedIds.push(id);
      }
    }

    if (unCachedIds.length === 0) {
      return nameMap;
    }

    // 针对未缓存的记录，进行快速并发单条或查询
    await Promise.all(
      unCachedIds.map(async (id) => {
        try {
          const name = await this.getRecordName(env, tokenData, entityApiKey, id);
          if (name) {
            nameMap[String(id)] = name;
          }
        } catch {}
      })
    );

    return nameMap;
  }

  /**
   * 搜索实体记录 (用于 Lookup 选择器)
   */
  public async searchRecords(
    env: NeoEnvironment,
    tokenData: TokenData,
    entityApiKey: string,
    keyword: string,
    limit = 25
  ): Promise<{ success: boolean; records: Record<string, any>[]; error?: string }> {
    const cleanKeyword = keyword.trim();
    // 优先通过常用字段列表拉取
    let sql = `SELECT id FROM ${entityApiKey} WHERE id > 0 LIMIT ${limit}`;
    if (cleanKeyword && /^\d+$/.test(cleanKeyword)) {
      sql = `SELECT id FROM ${entityApiKey} WHERE id = ${cleanKeyword} LIMIT ${limit}`;
    }

    const res = await this.executeQuery(env, tokenData, sql);
    if (!res.success || !res.data) {
      return { success: false, records: [], error: res.error };
    }

    const records = res.data.records;
    // 为返回的每条记录并发补全名称 (如果只有 id)
    await Promise.all(
      records.map(async (r) => {
        let name = this.extractRecordName(r);
        if (!name) {
          name = await this.getRecordName(env, tokenData, entityApiKey, r.id);
        }
        r._displayName = name || `记录 #${r.id}`;
      })
    );

    return { success: true, records };
  }

  /**
   * 创建数据记录 (Insert)
   */
  public async createRecord(
    env: NeoEnvironment,
    tokenData: TokenData,
    entityApiKey: string,
    recordData: Record<string, any>
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const headers = this.getHeaders(tokenData);
    const url = `${baseUrl}/rest/data/v2.0/xobjects/${entityApiKey}`;

    try {
      const res = await axios.post(url, { data: recordData }, { headers, timeout: 15000 });
      if (res.data?.code === 200 || res.data?.code === '200' || res.data?.id || res.data?.data?.id) {
        return { success: true, data: res.data?.data || res.data };
      }
      return { 
        success: false, 
        error: res.data?.msg || res.data?.message || JSON.stringify(res.data) 
      };
    } catch (e: any) {
      return {
        success: false,
        error: e.response?.data?.msg || e.response?.data?.message || e.message,
      };
    }
  }

  /**
   * 更新数据记录 (Update / Patch)
   */
  public async updateRecord(
    env: NeoEnvironment,
    tokenData: TokenData,
    entityApiKey: string,
    id: string | number,
    recordData: Record<string, any>
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const headers = this.getHeaders(tokenData);
    const url = `${baseUrl}/rest/data/v2.0/xobjects/${entityApiKey}/${id}`;

    try {
      const res = await axios.patch(url, { data: recordData }, { headers, timeout: 15000 });
      if (res.data?.code === 200 || res.data?.code === '200' || res.data?.success || res.status === 200) {
        return { success: true, data: res.data?.data || res.data };
      }
      return { 
        success: false, 
        error: res.data?.msg || res.data?.message || JSON.stringify(res.data) 
      };
    } catch (e: any) {
      return {
        success: false,
        error: e.response?.data?.msg || e.response?.data?.message || e.message,
      };
    }
  }

  /**
   * 删除数据记录 (Delete)
   */
  public async deleteRecord(
    env: NeoEnvironment,
    tokenData: TokenData,
    entityApiKey: string,
    id: string | number
  ): Promise<{ success: boolean; error?: string }> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const headers = this.getHeaders(tokenData);
    const url = `${baseUrl}/rest/data/v2.0/xobjects/${entityApiKey}/${id}`;

    try {
      const res = await axios.delete(url, { headers, timeout: 15000 });
      if (res.data?.code === 200 || res.data?.code === '200' || res.status === 200) {
        return { success: true };
      }
      return { 
        success: false, 
        error: res.data?.msg || res.data?.message || JSON.stringify(res.data) 
      };
    } catch (e: any) {
      return {
        success: false,
        error: e.response?.data?.msg || e.response?.data?.message || e.message,
      };
    }
  }
}
