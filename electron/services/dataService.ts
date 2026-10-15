import axios from 'axios';
import { NeoEnvironment, TokenData, QueryResultData } from '../../shared/types';
import { FxiaokeService } from './fxiaokeService';
import { SalesforceService } from './salesforceService';

/**
 * 销售易标准实体主名称字段映射表
 * (注意: 销售易中许多标准实体的名称字段并非 name，如客户为 accountName、联系人为 contactName、商机为 opportunityName)
 */
export const STANDARD_ENTITY_NAME_FIELD_MAP: Record<string, string> = {
  account: 'accountName',
  contact: 'contactName',
  opportunity: 'opportunityName',
  lead: 'name',
  order: 'po',
  contract: 'title',
  product: 'productName',
  user: 'name',
  department: 'departName',
  campaign: 'campaignName',
  stage: 'stageName',
};

import { AuthService } from './authService';

export class DataService {
  private fxiaokeService = new FxiaokeService();
  private salesforceService = new SalesforceService();
  private tokenRefreshCallback?: (env: NeoEnvironment, newToken: TokenData) => void;

  constructor(private authService?: AuthService) {}

  public setTokenRefreshCallback(cb: (env: NeoEnvironment, newToken: TokenData) => void) {
    this.tokenRefreshCallback = cb;
    this.salesforceService.setTokenRefreshCallback(cb);
  }

  /**
   * 自动 401 拦截与静默续期重试守护器
   */
  private async withAutoRetry<T>(
    env: NeoEnvironment,
    tokenData: TokenData,
    fn: (currToken: TokenData) => Promise<T>
  ): Promise<T> {
    try {
      return await fn(tokenData);
    } catch (err: any) {
      const is401 =
        err.response?.status === 401 ||
        err.message?.includes('401') ||
        err.message?.includes('INVALID_SESSION_ID') ||
        err.message?.includes('Session expired') ||
        err.message?.includes('expired access/refresh token');

      if (is401 && this.authService) {
        console.warn(`[DataService] 检测到 [${env.name}] 会话失效 (401)，正在自动执行静默续期...`);
        try {
          const newToken = await this.authService.renewToken(env, tokenData);
          this.tokenRefreshCallback?.(env, newToken);
          return await fn(newToken);
        } catch (renewErr: any) {
          throw new Error(`当前环境 [${env.name}] 认证会话已过期，请在连接器详情页重新点击登录 (${renewErr.message})`);
        }
      }
      throw err;
    }
  }
  // 内存缓存: key 为 `${entityApiKey}_${id}` -> name
  private nameCache = new Map<string, string>();
  private busiTypeCache = new Map<string, Array<{ id: string | number; apiKey: string; label: string; active?: boolean; custom?: boolean }>>();
  private entityPrimaryFieldCache = new Map<string, string>();

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
   * 数据新增与更新专用请求头 (带 xsy-execoption 与 xsy-criteria)
   */
  private getDmlHeaders(tokenData: TokenData) {
    return {
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json',
      'xsy-inner-source': 'bff',
      'xsy-execoption': '-1025',
      'xsy-criteria': '10',
    };
  }

  /**
   * 获取指定对象的主名称字段 API Key
   */
  public getPrimaryNameField(entityApiKey: string): string {
    const key = String(entityApiKey || '').trim();
    if (this.entityPrimaryFieldCache.has(key)) {
      return this.entityPrimaryFieldCache.get(key)!;
    }
    return STANDARD_ENTITY_NAME_FIELD_MAP[key] || 'name';
  }

  /**
   * 获取指定对象的所有业务类型 (Business Types / entityBelongType)
   */
  public async fetchEntityBusiTypes(
    env: NeoEnvironment,
    tokenData: TokenData,
    hostEntityApiKey: string
  ): Promise<Array<{ id: string | number; apiKey: string; label: string; active?: boolean; custom?: boolean }>> {
    const cleanEntity = String(hostEntityApiKey || '').trim();
    if (!cleanEntity || cleanEntity === 'entityBelongType') return [];

    const cacheKey = `${tokenData.tenant_id || 't'}_${cleanEntity}`;
    if (this.busiTypeCache.has(cacheKey)) {
      return this.busiTypeCache.get(cacheKey)!;
    }

    const baseUrl = this.getBaseUrl(env, tokenData);
    const headers = this.getHeaders(tokenData);
    let list: Array<{ id: string | number; apiKey: string; label: string; active?: boolean; custom?: boolean }> = [];

    // 优先调用 /rest/data/v2.0/xobjects/{entityApiKey}/busiType
    try {
      const res = await axios.get(`${baseUrl}/rest/data/v2.0/xobjects/${cleanEntity}/busiType`, {
        headers,
        timeout: 12000,
      });
      const records = res.data?.data?.records || res.data?.records;
      if (Array.isArray(records) && records.length > 0) {
        list = records.map((r: any) => ({
          id: r.id,
          apiKey: r.apiKey || '',
          label: r.label || r.apiKey || String(r.id),
          active: r.active !== false,
          custom: !!r.custom,
        }));
      }
    } catch {}

    // 兜底调用 /rest/metadata/v3.1/xobjects/{entityApiKey}/busiTypes
    if (list.length === 0) {
      try {
        const res2 = await axios.get(`${baseUrl}/rest/metadata/v3.1/xobjects/${cleanEntity}/busiTypes`, {
          headers,
          timeout: 12000,
        });
        const records2 = Array.isArray(res2.data?.data) ? res2.data.data : res2.data?.data?.records;
        if (Array.isArray(records2) && records2.length > 0) {
          list = records2.map((r: any) => ({
            id: r.id,
            apiKey: r.apiKey || '',
            label: r.label || r.apiKey || String(r.id),
            active: r.active !== false,
            custom: !!r.custom,
          }));
        }
      } catch {}
    }

    if (list.length > 0) {
      this.busiTypeCache.set(cacheKey, list);
      for (const bt of list) {
        const display =
          bt.label && bt.apiKey && bt.label !== bt.apiKey
            ? `${bt.label} (${bt.apiKey})`
            : bt.label || bt.apiKey;
        this.nameCache.set(`entityBelongType:${cleanEntity}_${bt.id}`, display);
        this.nameCache.set(`entityBelongType_${bt.id}`, display);
      }
    }

    return list;
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
      record.departName ||
      record.po ||
      record.title ||
      record.label ||
      record.fullName ||
      record.userName ||
      record.code ||
      ''
    );
  }

  /**
   * 清洗与智能转译 SQL / XOQL 语句，自动修复常见平台不支持的语法与标准对象名称字段错写
   */
  public sanitizeAndRewriteXoql(rawSql: string): { sql: string; rejectReason?: string } {
    let sql = String(rawSql || '').trim();

    // 1. 移除 Markdown 代码块包裹、注释与末尾分号
    sql = sql.replace(/^```(?:sql|xoql)?\s*/i, '').replace(/\s*```$/i, '');
    sql = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
    sql = sql
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/;+$/, '')
      .trim();

    if (!sql) {
      return { sql: '', rejectReason: 'SQL 查询语句不能为空' };
    }

    if (!/^SELECT\b/i.test(sql)) {
      return {
        sql,
        rejectReason: '销售易 XOQL 查询仅支持以 SELECT 开头的查询语句',
      };
    }

    // 2. 检测平台不支持的 JOIN 语法，给出明确转换指引
    if (/\b(?:LEFT|RIGHT|INNER|FULL|CROSS)?\s*JOIN\s+[A-Za-z0-9_]+(?:\s+(?:AS\s+)?[A-Za-z0-9_]+)?\s+ON\b/i.test(sql)) {
      return {
        sql,
        rejectReason:
          '销售易 XOQL 不支持 JOIN ... ON 多表连接语法。请改用关联字段点号穿透查询（例如：SELECT id, contactName, accountId.accountName FROM contact）或使用 IN 子查询。',
      };
    }

    // 3. 自动修正标准关联字段的点号穿透名称 (例如 accountId.name -> accountId.accountName)
    sql = sql.replace(/\b(accountId|parentAccountId)\.name\b/g, '$1.accountName');
    sql = sql.replace(/\b(contactId)\.name\b/g, '$1.contactName');
    sql = sql.replace(/\b(opportunityId)\.name\b/g, '$1.opportunityName');
    sql = sql.replace(/\b(productId)\.name\b/g, '$1.productName');
    sql = sql.replace(/\b(dimDepart|departmentId|departId)\.name\b/g, '$1.departName');
    sql = sql.replace(/\b(orderId)\.name\b/g, '$1.po');
    sql = sql.replace(/\b(contractId)\.name\b/g, '$1.title');

    // 4. 识别主表对象名称，修正 SELECT * 以及标准对象误写 name 字段
    const fromMatch = sql.match(/\bFROM\s+([A-Za-z0-9_]+)\b/i);
    const mainEntity = fromMatch ? fromMatch[1] : '';
    const primaryNameField = this.getPrimaryNameField(mainEntity);

    // 展开 SELECT * (销售易 XOQL 不允许使用 *)
    if (/^SELECT\s+\*\s+FROM\b/i.test(sql)) {
      const noOwnerEntities = new Set(['product', 'user', 'department', 'pricebook', 'territory']);
      const defaultCols = noOwnerEntities.has(mainEntity)
        ? `id, ${primaryNameField}, createdAt, updatedAt`
        : `id, ${primaryNameField}, ownerId, createdAt, updatedAt`;
      sql = sql.replace(/^SELECT\s+\*\s+FROM\b/i, `SELECT ${defaultCols} FROM`);
    }

    // 若主表为标准对象且其名称字段不是 name (例如 account -> accountName)，自动将独立的 name 替换为真实主名称字段
    if (mainEntity && primaryNameField !== 'name' && !/\(\s*SELECT\b/i.test(sql)) {
      // 替换 mainEntity.name -> mainEntity.accountName
      const qualifiedRegex = new RegExp(`\\b${mainEntity}\\.name\\b`, 'g');
      sql = sql.replace(qualifiedRegex, `${mainEntity}.${primaryNameField}`);

      // 替换未带点号前缀的独立字段名 name (但保留 AS name 别名)
      sql = sql.replace(/(?<![.\w])name(?![.\w(])/g, (match, offset, fullStr) => {
        const before = fullStr.slice(0, offset).trimEnd();
        // 如果前面是 AS 或者其他字段名(代表别名)，则不替换
        if (/\bAS$/i.test(before)) {
          return match;
        }
        return primaryNameField;
      });
    }

    // 5. 规范化 = NULL / != NULL / <> NULL 为 IS NULL / IS NOT NULL
    sql = sql.replace(/\s*=\s*null\b/gi, ' IS NULL');
    sql = sql.replace(/\s*(?:!=|<>)\s*null\b/gi, ' IS NOT NULL');

    // 6. 自动转译 SQL 时间函数与日期字符串为 13 位毫秒时间戳 (销售易日期时间底层均为毫秒 Long)
    const nowMs = Date.now();
    const todayStartMs = new Date().setHours(0, 0, 0, 0);
    sql = sql.replace(/\b(?:NOW|CURRENT_TIMESTAMP|SYSDATE)\s*\(\s*\)/gi, String(nowMs));
    sql = sql.replace(/\b(?:CURDATE|CURRENT_DATE|TODAY)\s*\(\s*\)/gi, String(todayStartMs));

    // 转译 YEAR(field) = 2026 为毫秒时间戳区间
    sql = sql.replace(
      /\bYEAR\s*\(\s*([A-Za-z0-9_.]+)\s*\)\s*=\s*['"]?(\d{4})['"]?/gi,
      (_, field, yyyy) => {
        const start = new Date(`${yyyy}-01-01T00:00:00`).getTime();
        const end = new Date(`${yyyy}-12-31T23:59:59.999`).getTime();
        return `(${field} >= ${start} AND ${field} <= ${end})`;
      }
    );

    // 转译 BETWEEN 'YYYY-MM-DD...' AND 'YYYY-MM-DD...'
    sql = sql.replace(
      /\bBETWEEN\s+['"](\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?)['"]\s+AND\s+['"](\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?)['"]/gi,
      (full, d1, d2) => {
        const t1 = new Date(d1.length === 10 ? `${d1}T00:00:00` : d1).getTime();
        const t2 = new Date(d2.length === 10 ? `${d2}T23:59:59.999` : d2).getTime();
        if (!isNaN(t1) && !isNaN(t2)) {
          return `BETWEEN ${t1} AND ${t2}`;
        }
        return full;
      }
    );

    // 转译 >= 'YYYY-MM-DD' / <= 'YYYY-MM-DD' 等比较条件中的日期字符串为毫秒时间戳
    sql = sql.replace(
      /(>=|<=|>|<)\s*['"](\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?)['"]/g,
      (full, op, dateStr) => {
        const isEndBound = (op === '<=' || op === '<') && dateStr.length === 10 && op === '<=';
        const normalized =
          dateStr.length === 10
            ? isEndBound
              ? `${dateStr}T23:59:59.999`
              : `${dateStr}T00:00:00`
            : dateStr;
        const ts = new Date(normalized).getTime();
        return !isNaN(ts) ? `${op} ${ts}` : full;
      }
    );

    // 7. 修复销售易 XOQL 中 HAVING 和 ORDER BY 不支持直接引用聚合函数别名的问题
    // 例如: SELECT ownerId, COUNT(id) cnt FROM account GROUP BY ownerId ORDER BY cnt DESC
    // 自动将 ORDER BY / HAVING 中的 cnt 还原为 COUNT(id)
    const selectClauseMatch = sql.match(/^SELECT\s+([\s\S]+?)\s+FROM\b/i);
    if (selectClauseMatch) {
      const selectPart = selectClauseMatch[1];
      const aggAliasMap = new Map<string, string>();
      const aggRegex = /\b((?:COUNT|SUM|AVG|MAX|MIN)\s*\([^)]+\))\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*)\b/gi;
      let m: RegExpExecArray | null;
      while ((m = aggRegex.exec(selectPart)) !== null) {
        const aggExpr = m[1].replace(/\s+/g, '');
        const aliasName = m[2];
        if (!/^(FROM|WHERE|GROUP|ORDER|HAVING|LIMIT)$/i.test(aliasName)) {
          aggAliasMap.set(aliasName, aggExpr);
        }
      }

      if (aggAliasMap.size > 0) {
        sql = sql.replace(/\b(HAVING|ORDER\s+BY)\s+([\s\S]+?)(?=\bORDER\s+BY\b|\bLIMIT\b|$)/gi, (fullClause, kw, exprBody) => {
          let updatedBody = exprBody;
          aggAliasMap.forEach((aggExpr, aliasName) => {
            const aliasRe = new RegExp(`(?<![.\\w])${aliasName}(?![.\\w(])`, 'g');
            updatedBody = updatedBody.replace(aliasRe, aggExpr);
          });
          return `${kw} ${updatedBody}`;
        });
      }
    }

    return { sql };
  }

  /**
   * 规范化 XOQL 返回的记录列表 (将单选/多选字段返回的纯文本数组 ["A(重点客户)"] 展平为易读字符串)
   */
  private normalizeRecords(records: Record<string, any>[]): Record<string, any>[] {
    if (!Array.isArray(records)) return [];
    return records.map((rec) => {
      if (!rec || typeof rec !== 'object') return rec;
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(rec)) {
        if (
          Array.isArray(v) &&
          v.length > 0 &&
          v.every((item) => typeof item === 'string' || typeof item === 'number')
        ) {
          out[k] = v.join(', ');
        } else if (Array.isArray(v) && v.length === 0) {
          out[k] = '';
        } else {
          out[k] = v;
        }
      }
      return out;
    });
  }

  /**
   * 将平台底层英文报错翻译为可读性强的中文诊断提示
   */
  private formatPlatformSqlError(code: string | number, rawMsg: string, executedSql: string): string {
    const msg = String(rawMsg || 'SQL 执行失败');

    const noColMatch =
      msg.match(/no such column \[([^\]]+)\] on entity \[([^\]]+)\]/i) ||
      msg.match(/column not exist\[([^\]]+)\]/i);
    if (noColMatch) {
      const col = noColMatch[1];
      const ent = noColMatch[2] || '';
      const nameHint =
        ent && STANDARD_ENTITY_NAME_FIELD_MAP[ent] && STANDARD_ENTITY_NAME_FIELD_MAP[ent] !== 'name'
          ? `（提示：标准对象 [${ent}] 的名称字段为 ${STANDARD_ENTITY_NAME_FIELD_MAP[ent]} 而非 name）`
          : '（请检查字段 API Key 拼写与大小写，或先查看实体字段字典）';
      return `字段不存在 [${code}]：${ent ? `对象 [${ent}] 中` : ''}不存在字段 [${col}] ${nameHint}`;
    }

    const noEntMatch = msg.match(/entity \[([^\]]+)\] is not supported/i);
    if (noEntMatch) {
      return `实体对象不存在或不支持查询 [${code}]：未找到对象 [${noEntMatch[1]}]（请检查对象 API Key 大小写或 __c 后缀）`;
    }

    if (msg.includes("character '*' is not supported") || msg.includes("keyword '*' is not allowed")) {
      return `语法限制 [${code}]：销售易 XOQL 不支持 SELECT *，请显式指定要查询的字段名`;
    }

    if (msg.includes('unknown error parsing query') || msg.includes('sql format error')) {
      return `SQL 语法解析错误 [${code}]：${msg}（请检查是否包含平台不支持的函数或关键字，转换后语句: ${executedSql}）`;
    }

    return `查询失败 [${code}]：${msg}`;
  }

  /**
   * 执行 SQL / XOQL 查询获取数据列表
   * 优先使用销售易官方 POST /rest/data/v2.0/query/xoql 引擎（支持聚合统计、GROUP BY、关联点号穿透 ownerId.name、子查询与全字段类型）
   */
  public async executeQuery(
    env: NeoEnvironment,
    tokenData: TokenData,
    rawSql: string
  ): Promise<{ success: boolean; data?: QueryResultData; error?: string }> {
    return await this.withAutoRetry(env, tokenData, async (currentToken) => {
      return await this.doExecuteQuery(env, currentToken, rawSql);
    });
  }

  private async doExecuteQuery(
    env: NeoEnvironment,
    tokenData: TokenData,
    rawSql: string
  ): Promise<{ success: boolean; data?: QueryResultData; error?: string }> {
    if (env.productType === 'fxiaoke') {
      try {
        const data = await this.fxiaokeService.queryData(env, tokenData, { sql: rawSql });
        return { success: true, data };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }
    if (env.productType === 'salesforce') {
      try {
        const data = await this.salesforceService.executeQuery(env, tokenData, rawSql);
        return { success: true, data };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }
    const { sql, rejectReason } = this.sanitizeAndRewriteXoql(rawSql);
    if (rejectReason) {
      return { success: false, error: rejectReason };
    }

    const baseUrl = this.getBaseUrl(env, tokenData);
    const xoqlUrl = `${baseUrl}/rest/data/v2.0/query/xoql`;
    const xoqlHeaders = {
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'xsy-inner-source': 'bff',
    };

    try {
      const formBody = new URLSearchParams();
      formBody.append('xoql', sql);

      const res = await axios.post(xoqlUrl, formBody.toString(), {
        headers: xoqlHeaders,
        timeout: 25000,
      });

      const resCode = res.data?.code !== undefined ? String(res.data.code) : '200';
      if (resCode !== '200' && resCode !== '0') {
        const rawErr = res.data?.msg || res.data?.message || JSON.stringify(res.data);
        return {
          success: false,
          error: this.formatPlatformSqlError(resCode, rawErr, sql),
        };
      }

      const result = res.data?.data || res.data?.result || {};
      const rawRecords: Record<string, any>[] = Array.isArray(result.records) ? result.records : [];
      const records = this.normalizeRecords(rawRecords);
      const totalSize = result.totalSize !== undefined ? Number(result.totalSize) : records.length;

      let fields: string[] = [];
      if (records.length > 0) {
        fields = Object.keys(records[0]);
      } else {
        const match = sql.match(/SELECT\s+([\s\S]*?)\s+FROM\b/i);
        if (match && match[1]) {
          fields = match[1]
            .split(',')
            .map((f) => f.trim().split(/\s+/).pop() || f.trim())
            .filter(Boolean);
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
      const errData = e.response?.data;
      const errMsg =
        errData?.msg ||
        errData?.message ||
        errData?.error?.message ||
        errData?.error ||
        (typeof errData === 'string' ? errData : null) ||
        (errData ? JSON.stringify(errData) : null) ||
        e.message;
      return {
        success: false,
        error: this.formatPlatformSqlError(e.response?.status || 'ERR', errMsg, sql),
      };
    }
  }

  /**
   * 将用户的 SQL 语句清洗转换为符合销售易滚动/分页查询规范的基础语句
   */
  public normalizeSqlForScroll(rawSql: string): string {
    const { sql: sanitized } = this.sanitizeAndRewriteXoql(rawSql);
    let sql = sanitized.replace(/;+$/, '');
    // 移除末尾的 LIMIT
    sql = sql.replace(/\s+LIMIT\s+\d+(?:\s*,\s*\d+)?(?:\s+OFFSET\s+\d+)?$/i, '');
    return sql.trim();
  }

  /**
   * 执行大数据量滚动/自动分页查询 (Scroll / Paginated Query Mode)，突破单次返回条数限制
   * 采用 XOQL 分页拉取引擎 (LIMIT offset, batchCount)，全面兼容关联字段 (ownerId.name)、业务维度字段 (dimArea)、ORDER BY 等语法
   */
  public async executeScrollQuery(
    env: NeoEnvironment,
    tokenData: TokenData,
    rawSql: string,
    batchCount = 1000,
    maxLimit = 50000,
    onProgress?: (progress: { current: number; total: number; percent: number; page: number }) => void
  ): Promise<{ success: boolean; data?: QueryResultData; error?: string }> {
    const { sql: checkedSql, rejectReason } = this.sanitizeAndRewriteXoql(rawSql);
    if (rejectReason) {
      return { success: false, error: rejectReason };
    }

    // Salesforce 和 纷享销客直接走原生单次/分页执行即可
    if (env.productType === 'salesforce' || env.productType === 'fxiaoke') {
      return this.executeQuery(env, tokenData, rawSql);
    }

    // 如果是聚合查询 (GROUP BY 或 COUNT/SUM/AVG/MAX/MIN)，直接走单次 XOQL 查询即可返回完整统计结果
    if (
      /\bGROUP\s+BY\b/i.test(checkedSql) ||
      /^SELECT\s+(?:COUNT|SUM|AVG|MAX|MIN)\s*\(/i.test(checkedSql)
    ) {
      return this.executeQuery(env, tokenData, checkedSql);
    }

    const baseUrl = this.getBaseUrl(env, tokenData);
    const xoqlUrl = `${baseUrl}/rest/data/v2.0/query/xoql`;
    const xoqlHeaders = {
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'xsy-inner-source': 'bff',
    };

    const baseSql = this.normalizeSqlForScroll(checkedSql);
    const pageSize = Math.min(2000, Math.max(50, batchCount || 1000));
    const allRecords: Record<string, any>[] = [];
    let offset = 0;
    let page = 1;
    let hasMore = true;

    try {
      while (hasMore && allRecords.length < maxLimit) {
        const remaining = maxLimit - allRecords.length;
        const currentLimit = Math.min(pageSize, remaining);
        const pagedSql = `${baseSql} LIMIT ${offset}, ${currentLimit}`;

        const formBody = new URLSearchParams();
        formBody.append('xoql', pagedSql);

        const res = await axios.post(xoqlUrl, formBody.toString(), {
          headers: xoqlHeaders,
          timeout: 45000,
        });

        const resCode = res.data?.code !== undefined ? String(res.data.code) : '200';
        if (resCode !== '200' && resCode !== '0') {
          const rawErr = res.data?.msg || res.data?.message || JSON.stringify(res.data);
          return {
            success: false,
            error: this.formatPlatformSqlError(resCode, rawErr, pagedSql),
          };
        }

        const result = res.data?.data || res.data?.result || {};
        const rawBatch: Record<string, any>[] = Array.isArray(result.records) ? result.records : [];
        const batch = this.normalizeRecords(rawBatch);

        allRecords.push(...batch);

        if (onProgress) {
          const estimatedTotal =
            batch.length < currentLimit
              ? allRecords.length
              : Math.max(allRecords.length + currentLimit, allRecords.length);
          onProgress({
            current: allRecords.length,
            total: estimatedTotal,
            percent:
              batch.length < currentLimit
                ? 100
                : Math.min(95, Math.round((allRecords.length / estimatedTotal) * 100)),
            page,
          });
        }

        if (batch.length < currentLimit) {
          hasMore = false;
        } else {
          offset += batch.length;
          page++;
        }

        if (page > 100) break;
      }

      let fields: string[] = [];
      if (allRecords.length > 0) {
        fields = Object.keys(allRecords[0]);
      } else {
        const match = baseSql.match(/SELECT\s+([\s\S]*?)\s+FROM\b/i);
        if (match && match[1]) {
          fields = match[1]
            .split(',')
            .map((f) => f.trim().split(/\s+/).pop() || f.trim())
            .filter(Boolean);
        }
      }

      return {
        success: true,
        data: {
          records: allRecords,
          totalSize: allRecords.length,
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
    if (env.productType === 'salesforce') {
      try {
        const data = await this.salesforceService.getRecordDetail(env, tokenData, entityApiKey, id);
        return { success: true, data };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }
    if (env.productType === 'fxiaoke') {
      try {
        const data = await this.fxiaokeService.getRecordDetail(env, tokenData, entityApiKey, id);
        return { success: true, data };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }
    const baseUrl = this.getBaseUrl(env, tokenData);
    const headers = this.getHeaders(tokenData);
    const url = `${baseUrl}/rest/data/v2.0/xobjects/${entityApiKey}/${id}`;

    try {
      const res = await axios.get(url, { headers, timeout: 15000 });
      if (res.data?.data || res.data?.result || res.data) {
        const rec = res.data?.data || res.data?.result || res.data;
        const extractedName = this.extractRecordName(rec);
        if (extractedName) {
          this.nameCache.set(`${entityApiKey}_${id}`, extractedName);
        }
        return { success: true, data: rec };
      }
      return { success: false, error: '未返回有效记录数据' };
    } catch (e: any) {
      try {
        const primaryName = this.getPrimaryNameField(entityApiKey);
        const fallbackSql = `SELECT id, ${primaryName} FROM ${entityApiKey} WHERE id = ${id}`;
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
   * 智能获取单条记录的显示名称
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

    // 处理业务类型 (entityBelongType 或 entityBelongType:<entity>)
    if (entityApiKey.startsWith('entityBelongType')) {
      const hostEntity = entityApiKey.includes(':') ? entityApiKey.split(':')[1] : '';
      if (hostEntity) {
        await this.fetchEntityBusiTypes(env, tokenData, hostEntity);
        const hit =
          this.nameCache.get(`entityBelongType:${hostEntity}_${id}`) ||
          this.nameCache.get(`entityBelongType_${id}`);
        if (hit) return hit;
      } else {
        const genericHit = this.nameCache.get(`entityBelongType_${id}`);
        if (genericHit) return genericHit;
        for (const candidate of ['account', 'order', 'opportunity', 'contact', 'lead', 'contract']) {
          await this.fetchEntityBusiTypes(env, tokenData, candidate);
          const found = this.nameCache.get(`entityBelongType_${id}`);
          if (found) return found;
        }
      }
      return '';
    }

    try {
      const primaryName = this.getPrimaryNameField(entityApiKey);
      const qRes = await this.executeQuery(
        env,
        tokenData,
        `SELECT id, ${primaryName} FROM ${entityApiKey} WHERE id = ${id} LIMIT 1`
      );
      if (qRes.success && qRes.data?.records?.[0]) {
        const name =
          this.extractRecordName(qRes.data.records[0]) || String(qRes.data.records[0][primaryName] || '');
        if (name) {
          this.nameCache.set(cacheKey, name);
          return name;
        }
      }
    } catch {}

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
   * 批量获取指定记录的显示名称 (支持业务类型 entityBelongType 解析与单次 XOQL IN 批量查询)
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

    // 1. 如果是业务类型字段 (entityBelongType:<hostEntity> 或 entityBelongType)
    if (entityApiKey.startsWith('entityBelongType')) {
      const hostEntity = entityApiKey.includes(':') ? entityApiKey.split(':')[1] : '';
      if (hostEntity) {
        await this.fetchEntityBusiTypes(env, tokenData, hostEntity);
      } else {
        for (const candidate of ['account', 'order', 'opportunity', 'contact', 'lead', 'contract']) {
          await this.fetchEntityBusiTypes(env, tokenData, candidate);
        }
      }
      for (const id of unCachedIds) {
        const found =
          (hostEntity && this.nameCache.get(`entityBelongType:${hostEntity}_${id}`)) ||
          this.nameCache.get(`entityBelongType_${id}`);
        if (found) {
          nameMap[String(id)] = found;
        }
      }
      return nameMap;
    }

    // 2. 普通业务对象：优先通过单次 XOQL IN 查询批量解析名称
    const primaryName = this.getPrimaryNameField(entityApiKey);
    const validNumericIds = unCachedIds.filter((id) => /^\d+$/.test(String(id)));
    if (validNumericIds.length > 0) {
      try {
        const inSql = `SELECT id, ${primaryName} FROM ${entityApiKey} WHERE id IN (${validNumericIds.join(', ')}) LIMIT ${validNumericIds.length}`;
        const batchRes = await this.executeQuery(env, tokenData, inSql);
        if (batchRes.success && batchRes.data?.records) {
          for (const rec of batchRes.data.records) {
            const rId = String(rec.id || '');
            const rName = this.extractRecordName(rec) || String(rec[primaryName] || '');
            if (rId && rName) {
              this.nameCache.set(`${entityApiKey}_${rId}`, rName);
              nameMap[rId] = rName;
            }
          }
        }
      } catch {}
    }

    // 对仍未命中的 ID 兜底单条查询
    const remainingIds = unCachedIds.filter((id) => !nameMap[String(id)]);
    if (remainingIds.length > 0) {
      await Promise.all(
        remainingIds.map(async (id) => {
          try {
            const name = await this.getRecordName(env, tokenData, entityApiKey, id);
            if (name) {
              nameMap[String(id)] = name;
            }
          } catch {}
        })
      );
    }

    return nameMap;
  }

  /**
   * 动态探测实体对象的主显示字段
   */
  private async detectEntityDisplayField(
    env: NeoEnvironment,
    tokenData: TokenData,
    entityApiKey: string
  ): Promise<string> {
    if (this.entityPrimaryFieldCache.has(entityApiKey)) {
      return this.entityPrimaryFieldCache.get(entityApiKey)!;
    }
    try {
      const baseUrl = this.getBaseUrl(env, tokenData);
      const headers = this.getHeaders(tokenData);
      const res = await axios.get(`${baseUrl}/rest/metadata/v2.0/xobjects/${entityApiKey}/items`, {
        headers,
        timeout: 10000,
      });
      const items: any[] = res.data?.data?.records || res.data?.records || [];
      const candidate =
        items.find((i) => i.apiKey === 'name') ||
        items.find((i) => i.itemType === 9 || i.itemType === 13) ||
        items.find((i) => i.itemType === 1 && String(i.apiKey).toLowerCase().includes('name')) ||
        items.find((i) => i.itemType === 1 && String(i.apiKey).toLowerCase().includes('title')) ||
        items.find((i) => i.itemType === 1 && String(i.apiKey).toLowerCase().includes('code')) ||
        items.find((i) => i.itemType === 1);
      if (candidate?.apiKey) {
        this.entityPrimaryFieldCache.set(entityApiKey, candidate.apiKey);
        return candidate.apiKey;
      }
    } catch {}
    return 'id';
  }

  /**
   * 搜索实体记录或业务类型 (支持全量拉取与服务端关键词检索)
   */
  public async searchRecords(
    env: NeoEnvironment,
    tokenData: TokenData,
    entityApiKey: string,
    keyword: string,
    limit = 2000
  ): Promise<{ success: boolean; records: Record<string, any>[]; error?: string }> {
    const cleanKeyword = String(keyword || '').trim();

    // 1. 业务类型专用通道 (entityBelongType 或 entityBelongType:<hostEntity>)
    if (entityApiKey.startsWith('entityBelongType')) {
      const hostEntity = entityApiKey.includes(':') ? entityApiKey.split(':')[1] : 'account';
      const busiTypes = await this.fetchEntityBusiTypes(env, tokenData, hostEntity);
      let mapped = busiTypes.map((bt) => ({
        id: bt.id,
        name: bt.label || bt.apiKey,
        apiKey: bt.apiKey,
        custom: bt.custom,
        active: bt.active,
        _displayName:
          bt.label && bt.apiKey && bt.label !== bt.apiKey
            ? `${bt.label} (${bt.apiKey})`
            : bt.label || bt.apiKey,
      }));

      if (cleanKeyword) {
        const kw = cleanKeyword.toLowerCase();
        mapped = mapped.filter(
          (item) =>
            String(item._displayName).toLowerCase().includes(kw) ||
            String(item.apiKey).toLowerCase().includes(kw) ||
            String(item.id).includes(kw)
        );
      }

      return { success: true, records: mapped };
    }

    // 2. 普通业务对象记录检索 (使用 XOQL 高速拉取全量/大批量记录，单次支持高达 2000~10000 条)
    const effectiveLimit = Math.max(100, Math.min(10000, limit || 2000));
    let primaryName = this.getPrimaryNameField(entityApiKey);

    const buildQuerySql = (nameCol: string, kw: string) => {
      const selectCols = nameCol && nameCol !== 'id' ? `id, ${nameCol}` : 'id';
      if (kw) {
        if (/^\d{8,20}$/.test(kw)) {
          return `SELECT ${selectCols} FROM ${entityApiKey} WHERE id = ${kw}`;
        }
        const safeKw = kw.replace(/'/g, '');
        if (nameCol && nameCol !== 'id') {
          return `SELECT ${selectCols} FROM ${entityApiKey} WHERE ${nameCol} LIKE '%${safeKw}%'`;
        }
      }
      return `SELECT ${selectCols} FROM ${entityApiKey}`;
    };

    let sql = buildQuerySql(primaryName, cleanKeyword);
    let res =
      effectiveLimit > 1000
        ? await this.executeScrollQuery(env, tokenData, sql, 1000, effectiveLimit)
        : await this.executeQuery(env, tokenData, `${sql} LIMIT 0, ${effectiveLimit}`);

    // 若预设的主名称字段在该实体上不存在，自动探测真实显示字段并重试
    if (!res.success && res.error?.includes('字段不存在')) {
      primaryName = await this.detectEntityDisplayField(env, tokenData, entityApiKey);
      sql = buildQuerySql(primaryName, cleanKeyword);
      res =
        effectiveLimit > 1000
          ? await this.executeScrollQuery(env, tokenData, sql, 1000, effectiveLimit)
          : await this.executeQuery(env, tokenData, `${sql} LIMIT 0, ${effectiveLimit}`);
    }

    // 如果带关键词的 LIKE 查询未命中，自动拉取全量并在内存中按名称或ID精准匹配
    if (cleanKeyword && (!res.success || !res.data?.records?.length)) {
      const fullSql = buildQuerySql(primaryName, '');
      const fullRes =
        effectiveLimit > 1000
          ? await this.executeScrollQuery(env, tokenData, fullSql, 1000, effectiveLimit)
          : await this.executeQuery(env, tokenData, `${fullSql} LIMIT 0, ${effectiveLimit}`);
      if (fullRes.success && fullRes.data?.records) {
        const kwLower = cleanKeyword.toLowerCase();
        const filtered = fullRes.data.records.filter((r) => {
          const nameVal = String(this.extractRecordName(r) || r[primaryName] || '').toLowerCase();
          return nameVal.includes(kwLower) || String(r.id || '').toLowerCase().includes(kwLower);
        });
        res = {
          success: true,
          data: {
            records: filtered,
            totalSize: filtered.length,
            fields: fullRes.data.fields,
          },
        };
      }
    }

    if (!res.success || !res.data) {
      return { success: false, records: [], error: res.error };
    }

    const records = res.data.records.map((r) => {
      const name = this.extractRecordName(r) || (primaryName !== 'id' ? String(r[primaryName] || '') : '');
      if (r.id && name) {
        this.nameCache.set(`${entityApiKey}_${r.id}`, name);
      }
      return {
        ...r,
        _displayName: name || `记录 #${r.id}`,
      };
    });

    return { success: true, records };
  }

  /**
   * 创建数据记录 (Insert)
   * 请求头严格携带 xsy-execoption: -1025 与 xsy-criteria: 10
   */
  public async createRecord(
    env: NeoEnvironment,
    tokenData: TokenData,
    entityApiKey: string,
    recordData: Record<string, any>
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const headers = this.getDmlHeaders(tokenData);
    const url = `${baseUrl}/rest/data/v2.0/xobjects/${entityApiKey}`;

    try {
      const res = await axios.post(url, { data: recordData }, { headers, timeout: 20000 });
      const isSuccess =
        (res.data?.code === 200 ||
          res.data?.code === '200' ||
          res.data?.msg === 'OK' ||
          !!res.data?.id ||
          !!res.data?.data?.id) &&
        !res.data?.errorInfo &&
        !String(res.data?.code).startsWith('5');
      if (isSuccess) {
        return { success: true, data: res.data?.data || res.data };
      }
      return {
        success: false,
        error: res.data?.msg || res.data?.message || JSON.stringify(res.data),
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
   * 请求头严格携带 xsy-execoption: -1025 与 xsy-criteria: 10
   */
  public async updateRecord(
    env: NeoEnvironment,
    tokenData: TokenData,
    entityApiKey: string,
    id: string | number,
    recordData: Record<string, any>
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const headers = this.getDmlHeaders(tokenData);
    const url = `${baseUrl}/rest/data/v2.0/xobjects/${entityApiKey}/${id}`;

    try {
      const res = await axios.patch(url, { data: recordData }, { headers, timeout: 20000 });
      const isSuccess =
        (res.data?.code === 200 ||
          res.data?.code === '200' ||
          res.data?.msg === 'OK' ||
          !!res.data?.success) &&
        !res.data?.errorInfo &&
        !String(res.data?.code).startsWith('5');
      if (isSuccess) {
        return { success: true, data: res.data?.data || res.data };
      }
      return {
        success: false,
        error: res.data?.msg || res.data?.message || JSON.stringify(res.data),
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
    if (env.productType === 'salesforce') {
      try {
        const res = await this.salesforceService.deleteRecord(env, tokenData, entityApiKey, id);
        return { success: res.success };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }
    if (env.productType === 'fxiaoke') {
      try {
        const res = await this.fxiaokeService.deleteRecord(env, tokenData, entityApiKey, id);
        return { success: res.success };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }
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
        error: res.data?.msg || res.data?.message || JSON.stringify(res.data),
      };
    } catch (e: any) {
      return {
        success: false,
        error: e.response?.data?.msg || e.response?.data?.message || e.message,
      };
    }
  }
}
