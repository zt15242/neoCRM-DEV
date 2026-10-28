import axios from 'axios';
import { createHash, randomUUID } from 'node:crypto';
import { NeoEnvironment, TokenData, EntityMetadata, FieldMetadata, QueryResultData } from '../../shared/types';

interface FxiaokeSqlQueryPlan {
  objectApiName: string;
  fieldProjection?: string[];
  filters: Array<{ field_name: string; field_values: string[]; operator: string }>;
  orders: Array<{ fieldName: string; isAsc: boolean }>;
  offset: number;
  limit?: number;
}

function splitSqlTopLevel(source: string, delimiter: ',' | 'AND' | 'OR'): string[] {
  const parts: string[] = [];
  let quote = '';
  let depth = 0;
  let start = 0;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === quote && source[index + 1] === quote) index++;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (char === '(') { depth++; continue; }
    if (char === ')') { depth--; continue; }
    if (depth !== 0) continue;
    const matchesDelimiter = delimiter === ','
      ? char === ','
      : source.slice(index, index + delimiter.length).toUpperCase() === delimiter
        && (index === 0 || /\s/.test(source[index - 1]))
        && (index + delimiter.length === source.length || /\s/.test(source[index + delimiter.length]));
    if (!matchesDelimiter) continue;
    parts.push(source.slice(start, index).trim());
    start = index + delimiter.length;
    index += delimiter.length - 1;
  }
  if (quote || depth !== 0) throw new Error('纷享销客查询包含未闭合的引号或括号');
  parts.push(source.slice(start).trim());
  return parts.filter(Boolean);
}

function parseFxiaokeSqlLiteral(raw: string): string {
  const value = raw.trim();
  if (/^'(?:[^']|'')*'$/.test(value)) return value.slice(1, -1).replace(/''/g, "'");
  if (/^"(?:[^"]|"")*"$/.test(value)) return value.slice(1, -1).replace(/""/g, '"');
  if (/^-?\d+(?:\.\d+)?$/.test(value) || /^(?:true|false)$/i.test(value) || /^[A-Z_][A-Z0-9_]*$/i.test(value)) return value;
  throw new Error(`纷享销客查询暂不支持此过滤值：${value}`);
}

function parseFxiaokeSql(rawSql: string): FxiaokeSqlQueryPlan {
  const sql = String(rawSql || '').trim().replace(/;+$/, '');
  if (/\b(?:GROUP\s+BY|HAVING|JOIN|UNION|DISTINCT)\b/i.test(sql)) throw new Error('纷享销客 OpenAPI 查询暂不支持 GROUP BY、JOIN、UNION 或 DISTINCT');
  const selectMatch = sql.match(/^SELECT\s+([\s\S]+?)\s+FROM\s+([A-Za-z_][A-Za-z0-9_]*)((?:[\s\S])*)$/i);
  if (!selectMatch) throw new Error('纷享销客查询必须使用 SELECT ... FROM <对象 API 名>');

  const selectText = selectMatch[1].trim();
  const objectApiName = selectMatch[2];
  const tail = selectMatch[3] || '';
  const whereMatch = tail.match(/\bWHERE\b[\s\S]*?(?=\bORDER\s+BY\b|\bLIMIT\b|\bOFFSET\b|$)/i);
  const orderMatch = tail.match(/\bORDER\s+BY\b[\s\S]*?(?=\bLIMIT\b|\bOFFSET\b|$)/i);
  const commaLimit = tail.match(/\bLIMIT\s+(\d+)\s*,\s*(\d+)/i);
  const standardLimit = tail.match(/\bLIMIT\s+(\d+)/i);
  const offsetMatch = tail.match(/\bOFFSET\s+(\d+)/i);
  let remainder = tail;
  for (const clause of [whereMatch?.[0], orderMatch?.[0], commaLimit?.[0], standardLimit?.[0], offsetMatch?.[0]]) {
    if (clause) remainder = remainder.replace(clause, ' ');
  }
  if (remainder.trim()) throw new Error(`纷享销客查询暂不支持此 SQL 子句：${remainder.trim()}`);

  const fieldProjection = selectText === '*'
    ? undefined
    : splitSqlTopLevel(selectText, ',').map((field) => {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) throw new Error(`纷享销客查询只支持直接选择字段，暂不支持：${field}`);
        return field;
      });

  const filters: FxiaokeSqlQueryPlan['filters'] = [];
  if (whereMatch) {
    const where = whereMatch[0].replace(/^\s*WHERE\s+/i, '').trim();
    if (splitSqlTopLevel(where, 'OR').length > 1) throw new Error('纷享销客 OpenAPI 查询不支持 SQL OR 条件，请改写为多个查询或平台筛选条件');
    for (const clause of splitSqlTopLevel(where, 'AND')) {
      const condition = clause.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(NOT\s+LIKE|LIKE|>=|<=|<>|!=|=|>|<|IN)\s*([\s\S]+)$/i);
      if (!condition) throw new Error(`纷享销客查询无法安全转换此 WHERE 条件：${clause}`);
      const [, field_name, rawOperator, rawValue] = condition;
      const operator = rawOperator.toUpperCase().replace(/\s+/g, ' ');
      let field_values: string[];
      let apiOperator: string;
      if (operator === 'IN') {
        if (!/^\([\s\S]*\)$/.test(rawValue.trim())) throw new Error(`纷享销客 IN 条件格式无效：${clause}`);
        field_values = splitSqlTopLevel(rawValue.trim().slice(1, -1), ',').map(parseFxiaokeSqlLiteral);
        apiOperator = 'IN';
      } else {
        let value = parseFxiaokeSqlLiteral(rawValue);
        if (value.toLowerCase() === 'null') throw new Error('纷享销客 NULL 条件需使用平台筛选操作符，不能按普通 SQL 值处理');
        if (operator.endsWith('LIKE')) value = value.replace(/^%|%$/g, '');
        field_values = [value];
        apiOperator = ({ '=': 'EQ', '!=': 'N', '<>': 'N', '>': 'GT', '>=': 'GTE', '<': 'LT', '<=': 'LTE', 'LIKE': 'LIKE', 'NOT LIKE': 'NLIKE' } as Record<string, string>)[operator];
      }
      filters.push({ field_name, field_values, operator: apiOperator });
    }
  }

  const orders = orderMatch
    ? splitSqlTopLevel(orderMatch[0].replace(/^\s*ORDER\s+BY\s+/i, ''), ',').map((item) => {
        const order = item.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+(ASC|DESC))?$/i);
        if (!order) throw new Error(`纷享销客查询暂不支持此排序表达式：${item}`);
        return { fieldName: order[1], isAsc: String(order[2] || 'ASC').toUpperCase() !== 'DESC' };
      })
    : [];

  return {
    objectApiName,
    fieldProjection,
    filters,
    orders,
    offset: commaLimit ? Number(commaLimit[1]) : Number(offsetMatch?.[1] || 0),
    limit: commaLimit ? Number(commaLimit[2]) : standardLimit ? Number(standardLimit[1]) : undefined,
  };
}

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
  public async queryAllData(
    env: NeoEnvironment,
    tokenData: TokenData,
    rawSql: string,
    maxRecords = Number.MAX_SAFE_INTEGER
  ): Promise<QueryResultData> {
    const plan = parseFxiaokeSql(rawSql);
    const effectiveLimit = Math.max(0, Math.floor(Math.min(plan.limit ?? maxRecords, maxRecords)));
    const pageSize = 100;
    const requestedFields = plan.fieldProjection;
    const pageProjection = requestedFields
      ? Array.from(new Set([...requestedFields, '_id', ...plan.orders.map((order) => order.fieldName)]))
      : undefined;
    const records: Record<string, any>[] = [];
    const seenPages = new Set<string>();
    let cursorId = '';
    let remainingOffset = plan.offset;
    let reportedTotal = 0;
    let fields: string[] = ['_id', 'name'];
    const sortAfterRead = plan.orders.length > 0;

    while (true) {
      const filters = cursorId
        ? [...plan.filters, { field_name: '_id', field_values: [cursorId], operator: 'GT' }]
        : plan.filters;
      const page = await this.queryData(env, tokenData, {
        objectApiName: plan.objectApiName,
        limit: pageSize,
        offset: 0,
        searchFilter: filters,
        fieldProjection: pageProjection,
        orders: [{ fieldName: '_id', isAsc: true }],
      });
      const pageRecords = page.records || [];
      if (reportedTotal === 0) reportedTotal = page.totalSize || 0;
      if (pageRecords.length === 0) break;

      const marker = createHash('sha1').update(JSON.stringify(pageRecords)).digest('hex');
      if (seenPages.has(marker)) throw new Error('纷享销客分页结果重复，已停止以避免重复读取');
      seenPages.add(marker);

      if (records.length === 0 && page.fields?.length) fields = page.fields;
      const lastId = String(pageRecords[pageRecords.length - 1]?._id || '');
      if (!lastId || lastId === cursorId) throw new Error('纷享销客深分页缺少新的 _id 游标，无法安全继续读取');
      cursorId = lastId;

      if (sortAfterRead) {
        records.push(...pageRecords);
      } else {
        const skipped = Math.min(remainingOffset, pageRecords.length);
        remainingOffset -= skipped;
        const eligible = pageRecords.slice(skipped);
        const remainingLimit = effectiveLimit === Number.MAX_SAFE_INTEGER ? eligible.length : Math.max(0, effectiveLimit - records.length);
        records.push(...eligible.slice(0, remainingLimit));
      }

      if (!sortAfterRead && records.length >= effectiveLimit) break;
    }

    if (sortAfterRead) {
      records.sort((left, right) => {
        for (const order of plan.orders) {
          const a = left[order.fieldName];
          const b = right[order.fieldName];
          if (a === b) continue;
          if (a === null || a === undefined) return order.isAsc ? 1 : -1;
          if (b === null || b === undefined) return order.isAsc ? -1 : 1;
          const numericA = Number(a);
          const numericB = Number(b);
          const comparison = Number.isFinite(numericA) && Number.isFinite(numericB)
            ? numericA - numericB
            : String(a).localeCompare(String(b), 'zh-CN', { numeric: true, sensitivity: 'base' });
          if (comparison !== 0) return order.isAsc ? comparison : -comparison;
        }
        return String(left._id || '').localeCompare(String(right._id || ''), 'en');
      });
      records.splice(0, plan.offset);
      if (effectiveLimit !== Number.MAX_SAFE_INTEGER) records.splice(effectiveLimit);
    }

    const outputRecords = requestedFields
      ? records.map((record) => Object.fromEntries(requestedFields.filter((field) => field in record).map((field) => [field, record[field]])))
      : records;
    fields = requestedFields || (outputRecords.length > 0 ? Object.keys(outputRecords[0]) : fields.filter((field) => field !== '_id' || !requestedFields));
    return { records: outputRecords, totalSize: reportedTotal || outputRecords.length + plan.offset, fields };
  }

  public async queryData(
    env: NeoEnvironment,
    tokenData: TokenData,
    params: { objectApiName?: string; limit?: number; offset?: number; searchFilter?: any; fieldProjection?: string[]; orders?: Array<{ fieldName: string; isAsc: boolean }>; sql?: string }
  ): Promise<QueryResultData> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const token = tokenData.access_token;
    const openCorpId = String(tokenData.userInfo?.userId || tokenData.tenant_id || '');
    const currentOpenUserId = await this.getActiveOpenUserId(env, tokenData);

    let targetObjName = params.objectApiName || 'AccountObj';
    let limit = Math.min(params.limit || 30, 100); // 纷享单页最大100
    let offset = params.offset || 0;

    // 如果传入的是 SQL 语句，解析其中的表名和 limit
    if (params.sql) {
      const fromMatch = params.sql.match(/\bFROM\s+([a-zA-Z0-9_]+)\b/i);
      if (fromMatch) {
        targetObjName = fromMatch[1];
      }
      const limitMatch = params.sql.match(/\bLIMIT\s+(\d+)\b/i);
      if (limitMatch) {
        limit = Math.min(parseInt(limitMatch[1], 10), 100);
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
          filters: Array.isArray(params.searchFilter) ? params.searchFilter : [],
          orders: params.orders || [],
          fieldProjection: params.fieldProjection,
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

  /**
   * 4. 获取纷享销客单个记录详情 (POST /cgi/crm/v2/data/get)
   */
  public async getRecordDetail(
    env: NeoEnvironment,
    tokenData: TokenData,
    objectApiName: string,
    recordId: string | number
  ): Promise<Record<string, any>> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const token = tokenData.access_token;
    const openCorpId = String(tokenData.userInfo?.userId || tokenData.tenant_id || '');
    const currentOpenUserId = await this.getActiveOpenUserId(env, tokenData);

    let targetObj = objectApiName.trim();
    if (!targetObj.endsWith('Obj') && !targetObj.endsWith('__c')) {
      targetObj = `${targetObj.charAt(0).toUpperCase()}${targetObj.slice(1)}Obj`;
    }

    const url = `${baseUrl}/cgi/crm/v2/data/get?thirdTraceId=${randomUUID()}`;
    const payload = {
      corpAccessToken: token,
      corpId: openCorpId,
      currentOpenUserId,
      data: {
        dataObjectApiName: targetObj,
        dataId: String(recordId),
      },
    };

    const res = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
    if (res.data?.errorCode !== 0 && res.data?.errorCode !== '0') {
      throw new Error(`获取纷享销客记录失败: ${res.data?.errorMessage || JSON.stringify(res.data)}`);
    }

    return res.data?.data?.data || {};
  }

  /**
   * 5. 按关键字搜索纷享销客记录
   */
  public async searchRecords(
    env: NeoEnvironment,
    tokenData: TokenData,
    objectApiName: string,
    keyword: string,
    limit = 50
  ): Promise<Array<{ id: string | number; name: string }>> {
    const cleanKw = String(keyword || '').trim();
    let sql = `SELECT _id, name FROM ${objectApiName}`;
    if (cleanKw) {
      sql += ` WHERE name LIKE '%${cleanKw.replace(/'/g, '')}%'`;
    }
    sql += ` LIMIT ${Math.min(limit, 50)}`;

    try {
      const res = await this.queryData(env, tokenData, {
        objectApiName,
        sql,
        limit,
      });
      return (res.records || []).map((r: any) => ({
        id: r._id || r.id,
        name: r.name || r._id || r.id,
      }));
    } catch {
      const res = await this.queryData(env, tokenData, { objectApiName, limit });
      return (res.records || []).map((r: any) => ({
        id: r._id || r.id,
        name: r.name || r._id || r.id,
      }));
    }
  }

  /**
   * 6. 创建纷享销客数据记录 (POST /cgi/crm/v2/data/create)
   */
  public async createRecord(
    env: NeoEnvironment,
    tokenData: TokenData,
    objectApiName: string,
    recordData: Record<string, any>
  ): Promise<{ dataId: string; success: boolean }> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const token = tokenData.access_token;
    const openCorpId = String(tokenData.userInfo?.userId || tokenData.tenant_id || '');
    const currentOpenUserId = await this.getActiveOpenUserId(env, tokenData);

    let targetObj = objectApiName.trim();
    if (!targetObj.endsWith('Obj') && !targetObj.endsWith('__c')) {
      targetObj = `${targetObj.charAt(0).toUpperCase()}${targetObj.slice(1)}Obj`;
    }

    const url = `${baseUrl}/cgi/crm/v2/data/create?thirdTraceId=${randomUUID()}`;
    const payload = {
      corpAccessToken: token,
      corpId: openCorpId,
      currentOpenUserId,
      data: {
        dataObjectApiName: targetObj,
        data: recordData,
      },
    };

    const res = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
    if (res.data?.errorCode !== 0 && res.data?.errorCode !== '0') {
      throw new Error(`创建纷享销客记录失败: ${res.data?.errorMessage || JSON.stringify(res.data)}`);
    }

    return { dataId: res.data?.data?.dataId, success: true };
  }

  /**
   * 7. 更新纷享销客数据记录 (POST /cgi/crm/v2/data/update)
   */
  public async updateRecord(
    env: NeoEnvironment,
    tokenData: TokenData,
    objectApiName: string,
    recordId: string | number,
    recordData: Record<string, any>
  ): Promise<{ success: boolean }> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const token = tokenData.access_token;
    const openCorpId = String(tokenData.userInfo?.userId || tokenData.tenant_id || '');
    const currentOpenUserId = await this.getActiveOpenUserId(env, tokenData);

    let targetObj = objectApiName.trim();
    if (!targetObj.endsWith('Obj') && !targetObj.endsWith('__c')) {
      targetObj = `${targetObj.charAt(0).toUpperCase()}${targetObj.slice(1)}Obj`;
    }

    const url = `${baseUrl}/cgi/crm/v2/data/update?thirdTraceId=${randomUUID()}`;
    const payload = {
      corpAccessToken: token,
      corpId: openCorpId,
      currentOpenUserId,
      data: {
        dataObjectApiName: targetObj,
        dataId: String(recordId),
        data: recordData,
      },
    };

    const res = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
    if (res.data?.errorCode !== 0 && res.data?.errorCode !== '0') {
      throw new Error(`更新纷享销客记录失败: ${res.data?.errorMessage || JSON.stringify(res.data)}`);
    }

    return { success: true };
  }

  /**
   * 8. 删除纷享销客数据记录 (POST /cgi/crm/v2/data/delete)
   */
  public async deleteRecord(
    env: NeoEnvironment,
    tokenData: TokenData,
    objectApiName: string,
    recordId: string | number
  ): Promise<{ success: boolean }> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const token = tokenData.access_token;
    const openCorpId = String(tokenData.userInfo?.userId || tokenData.tenant_id || '');
    const currentOpenUserId = await this.getActiveOpenUserId(env, tokenData);

    let targetObj = objectApiName.trim();
    if (!targetObj.endsWith('Obj') && !targetObj.endsWith('__c')) {
      targetObj = `${targetObj.charAt(0).toUpperCase()}${targetObj.slice(1)}Obj`;
    }

    const url = `${baseUrl}/cgi/crm/v2/data/delete?thirdTraceId=${randomUUID()}`;
    const payload = {
      corpAccessToken: token,
      corpId: openCorpId,
      currentOpenUserId,
      data: {
        dataObjectApiName: targetObj,
        dataId: String(recordId),
      },
    };

    const res = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
    if (res.data?.errorCode !== 0 && res.data?.errorCode !== '0') {
      throw new Error(`删除纷享销客记录失败: ${res.data?.errorMessage || JSON.stringify(res.data)}`);
    }

    return { success: true };
  }

  /**
   * 9. 创建纷享销客自定义业务对象 (POST /cgi/crm/v2/object/create)
   */
  public async createCustomObject(
    env: NeoEnvironment,
    tokenData: TokenData,
    payload: { apiKey: string; label: string; description?: string }
  ): Promise<{ success: boolean; data?: any; createdApiKey?: string; error?: string }> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const token = tokenData.access_token;
    const openCorpId = String(tokenData.userInfo?.userId || tokenData.tenant_id || '');
    const currentOpenUserId = await this.getActiveOpenUserId(env, tokenData);

    let cleanKey = payload.apiKey.trim().replace(/__c$/i, '').replace(/Obj$/i, '');
    const targetApiName = `${cleanKey}__c`;

    const url = `${baseUrl}/cgi/crm/v2/object/create?thirdTraceId=${randomUUID()}`;
    const reqBody = {
      corpAccessToken: token,
      corpId: openCorpId,
      currentOpenUserId,
      data: {
        apiName: targetApiName,
        displayName: payload.label.trim(),
        description: payload.description || payload.label.trim(),
      },
    };

    try {
      const res = await axios.post(url, reqBody, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
      if (res.data?.errorCode === 0 || res.data?.errorCode === '0') {
        return { success: true, createdApiKey: targetApiName, data: res.data?.data };
      }
      const errMsg = res.data?.errorMessage || JSON.stringify(res.data);
      if (errMsg.includes('已存在') || errMsg.includes('重复') || errMsg.includes('exist')) {
        return { success: true, createdApiKey: targetApiName };
      }
      return { success: false, error: errMsg };
    } catch (e: any) {
      const errMsg = e.response?.data?.errorMessage || e.message;
      if (errMsg && (errMsg.includes('已存在') || errMsg.includes('exist'))) {
        return { success: true, createdApiKey: targetApiName };
      }
      return { success: false, error: errMsg };
    }
  }

  /**
   * 10. 创建纷享销客自定义字段 (POST /cgi/crm/v2/field/create)
   */
  public async createCustomField(
    env: NeoEnvironment,
    tokenData: TokenData,
    objectApiName: string,
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
    const baseUrl = this.getBaseUrl(env, tokenData);
    const token = tokenData.access_token;
    const openCorpId = String(tokenData.userInfo?.userId || tokenData.tenant_id || '');
    const currentOpenUserId = await this.getActiveOpenUserId(env, tokenData);

    let targetObj = objectApiName.trim();
    if (!targetObj.endsWith('Obj') && !targetObj.endsWith('__c')) {
      targetObj = `${targetObj.charAt(0).toUpperCase()}${targetObj.slice(1)}Obj`;
    }

    const cleanFieldKey = payload.apiKey.trim().replace(/__c$/i, '');
    const targetFieldApiName = `${cleanFieldKey}__c`;

    let fxType = 'text';
    const it = Number(payload.itemType);
    if (it === 1) fxType = 'text';
    else if (it === 2) fxType = 'long_text';
    else if (it === 40) fxType = 'rich_text';
    else if (it === 10) fxType = 'reference';
    else if (it === 3) fxType = 'select';
    else if (it === 4) fxType = 'multi_select';
    else if (it === 5) fxType = 'integer';
    else if (it === 6) fxType = payload.currency !== false ? 'currency' : 'number';
    else if (it === 33) fxType = 'percent';
    else if (it === 7) fxType = 'date';
    else if (it === 21) fxType = 'date_time';
    else if (it === 31) fxType = 'boolean';
    else if (it === 22) fxType = 'phone';
    else if (it === 23) fxType = 'email';
    else if (it === 24) fxType = 'url';

    const url = `${baseUrl}/cgi/crm/v2/field/create?thirdTraceId=${randomUUID()}`;
    const reqBody: any = {
      corpAccessToken: token,
      corpId: openCorpId,
      currentOpenUserId,
      data: {
        objectApiName: targetObj,
        apiName: targetFieldApiName,
        displayName: payload.label.trim(),
        type: fxType,
        description: payload.description || payload.label.trim(),
      },
    };

    if (it === 3 || it === 4) {
      reqBody.data.options = (payload.pickOption || []).map((o: any, idx: number) => {
        const val = typeof o === 'string' ? o : o.optionLabel || o.label || o.name || `选项${idx + 1}`;
        return { label: val, value: String(idx + 1) };
      });
    }

    try {
      const res = await axios.post(url, reqBody, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
      if (res.data?.errorCode === 0 || res.data?.errorCode === '0') {
        return { success: true, createdApiKey: targetFieldApiName, data: res.data?.data };
      }
      const errMsg = res.data?.errorMessage || JSON.stringify(res.data);
      if (errMsg.includes('已存在') || errMsg.includes('重复') || errMsg.includes('exist')) {
        return { success: true, createdApiKey: targetFieldApiName };
      }
      return { success: false, error: errMsg };
    } catch (e: any) {
      const errMsg = e.response?.data?.errorMessage || e.message;
      if (errMsg && (errMsg.includes('已存在') || errMsg.includes('exist'))) {
        return { success: true, createdApiKey: targetFieldApiName };
      }
      return { success: false, error: errMsg };
    }
  }


  // ==================== 纷享销客 PaaS / APL 开发者接口 (share-dev 官方协议) ====================

  /**
   * 核心网关统一请求转发 (/FHH/EMDH...)
   */
  public async requestFHH(
    env: NeoEnvironment,
    tokenData: TokenData,
    subPath: string,
    body: any = {}
  ): Promise<any> {
    const certificate = env.devCertificate || tokenData.access_token || "";
    if (!certificate) {
      throw new Error("缺少纷享销客开发者证书 (devCertificate)，请在连接器配置中填写开发者证书");
    }

    let cleanPath = subPath.replace(/^\/+/, "");
    cleanPath = cleanPath.replace(/^FHH\/+/, "");
    cleanPath = cleanPath.replace(/^EM\dH/, "EMDH");

    // 默认使用官方主站域名，私有云或独立域名使用 env.neoBaseURL
    let domain = "https://www.fxiaoke.com";
    if (env.neoBaseURL && !env.neoBaseURL.includes("open.fxiaoke.com") && !env.neoBaseURL.includes("open-")) {
      domain = env.neoBaseURL.replace(/\/+$/, "");
    }

    const traceId = `E-E.desktop-ide-${Date.now()}`;
    const url = `${domain}/FHH/${cleanPath}?traceId=${traceId}`;

    const headers: Record<string, string> = {
      Authorization: certificate,
      "Content-Type": "application/json; charset=utf-8",
      "Accept-Language": "zh-cn",
    };

    const res = await axios.post(url, body, { headers, timeout: 20000 });
    const data = res.data;

    if (data?.Result && data.Result.StatusCode !== 0) {
      throw new Error(data.Result.FailureMessage || `PaaS API 失败: StatusCode ${data.Result.StatusCode}`);
    }

    return data?.Value !== undefined ? data.Value : data;
  }

  /**
   * 基于 Token 的异步任务长轮询 (用于 CompileCheck、Analyze、Debug、Update 等)
   */
  public async pollTask(
    env: NeoEnvironment,
    tokenData: TokenData,
    subPath: string,
    body: any = {},
    maxRetries = 12,
    intervalMs = 600
  ): Promise<any> {
    const taskToken = body.token || `${Date.now()}-${randomUUID()}`;
    const payload = { ...body, token: taskToken };

    for (let i = 0; i < maxRetries; i++) {
      const res = await this.requestFHH(env, tokenData, subPath, payload);
      // 若返回结果中不含 token 或 token 已被消费，表明后台异步处理完成
      if (!res?.token) {
        return res;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error(`任务轮询超时 (${maxRetries * intervalMs}ms): ${subPath}`);
  }

  /**
   * 拉取租户全部 APL 业务函数列表与源码 (POST /FHH/EMDHFUNC/biz/query)
   */
  public async fetchAPLList(
    env: NeoEnvironment,
    tokenData: TokenData,
    pageSize = 3000,
    pageNumber = 1
  ): Promise<any[]> {
    const res = await this.requestFHH(env, tokenData, "/EMDHFUNC/biz/query", { pageSize, pageNumber });
    return res?.function || res?.data?.function || (Array.isArray(res) ? res : []);
  }

  /**
   * 获取单个 APL 函数详情与最新源码 (POST /FHH/EMDHFUNC/biz/find)
   */
  public async getAPLDetail(
    env: NeoEnvironment,
    tokenData: TokenData,
    apiName: string,
    bindingObjectApiName?: string
  ): Promise<any> {
    return await this.requestFHH(env, tokenData, "/EMDHFUNC/biz/find", {
      api_name: apiName,
      binding_object_api_name: bindingObjectApiName || "",
    });
  }

  /**
   * 对 APL 源码进行语法编译检查 (POST /FHH/EMDHFUNC/runtime/compileCheck)
   */
  public async compileCheckAPL(
    env: NeoEnvironment,
    tokenData: TokenData,
    apiName: string,
    body: string
  ): Promise<{ success: boolean; compileError?: string }> {
    return await this.pollTask(env, tokenData, "/EMDHFUNC/runtime/compileCheck", {
      function: { api_name: apiName, body },
    });
  }

  /**
   * 保存或更新 APL 函数代码体 (POST /FHH/EMDHFUNC/biz/updateBody)
   */
  public async updateAPLBody(
    env: NeoEnvironment,
    tokenData: TokenData,
    apiName: string,
    body: string,
    commitLog = "Update from NeoCRM AI Studio"
  ): Promise<any> {
    return await this.pollTask(env, tokenData, "/EMDHFUNC/biz/updateBody", {
      function: {
        api_name: apiName,
        body,
        commit_log: commitLog,
      },
    });
  }

  /**
   * 在线调试运行 APL 函数 (POST /FHH/EMDHFUNC/runtime/debug)
   */
  public async debugAPL(
    env: NeoEnvironment,
    tokenData: TokenData,
    params: {
      apiName: string;
      code: string;
      bindingObjectApiName?: string;
      dataSourceRecordId?: string;
      inputs?: Array<{ name: string; type: string; value: any }>;
    }
  ): Promise<{ success: boolean; logInfo?: string; runResult?: any; errorInfo?: any }> {
    return await this.pollTask(env, tokenData, "/EMDHFUNC/runtime/debug", {
      api_name: params.apiName,
      binding_object_api_name: params.bindingObjectApiName || "NONE",
      data_source: params.dataSourceRecordId || "",
      function: {
        api_name: params.apiName,
        body: params.code,
      },
      input_data: params.inputs || [],
    });
  }

  /**
   * 拉取 PWC 前端组件代码清单与文件 (POST /FHH/EMDHCompBuild/VscodeExtension/downloadCode)
   */
  public async fetchPWCComponents(
    env: NeoEnvironment,
    tokenData: TokenData,
    type: "Component" | "Plugin" = "Component",
    apiName?: string
  ): Promise<any[]> {
    const res = await this.requestFHH(env, tokenData, "/EMDHCompBuild/VscodeExtension/downloadCode", {
      type,
      apiName: apiName || "",
    });
    return res?.components || res?.data?.components || (Array.isArray(res) ? res : []);
  }

  /**
   * 下载 PWC 组件单文件 (Base64 解码) (POST /FHH/EMDHCompBuild/VscodeExtension/downloadFile)
   */
  public async downloadPWCFile(
    env: NeoEnvironment,
    tokenData: TokenData,
    nPath: string
  ): Promise<Buffer> {
    const res = await this.requestFHH(env, tokenData, "/EMDHCompBuild/VscodeExtension/downloadFile", {
      nPath,
    });
    const base64Str = res?.base64String || "";
    return Buffer.from(base64Str, "base64");
  }

}
