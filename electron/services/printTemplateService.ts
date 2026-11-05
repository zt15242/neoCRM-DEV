import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import FormData from 'form-data';
import type { AxiosRequestConfig } from 'axios';
import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  Table, 
  TableRow, 
  TableCell, 
  WidthType, 
  AlignmentType, 
  ShadingType 
} from 'docx';
import { NeoEnvironment, TokenData } from '../../shared/types';
import { MetadataService } from './metadataService';

export class PrintTemplateService {
  constructor(
    private metadataService: MetadataService,
    private uploadRequest: (url: string, data: FormData, config: AxiosRequestConfig) => Promise<{ data: any }> =
      (url, data, config) => axios.post(url, data, config),
    private definitionRequest: (url: string, data: string, config: AxiosRequestConfig) => Promise<{ data: any }> =
      (url, data, config) => axios.post(url, data, config),
  ) {}

  private resolveBaseUrl(env: NeoEnvironment, tokenData: TokenData): string {
    const raw = tokenData.instance_uri || env.neoBaseURL;
    return raw.endsWith('/') ? raw.slice(0, -1) : raw;
  }

  private buildAdminHeaders(baseUrl: string, tokenData: TokenData): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'xsy-inner-source': 'bff',
      'X-Requested-With': 'XMLHttpRequest',
      Origin: baseUrl,
      Referer: `${baseUrl}/admin/template-manage/index.action`,
      Accept: 'application/json, text/javascript, */*; q=0.01',
    };

    const cookie = this.getAdminCookie(tokenData);
    if (!cookie) throw new Error('打印模板后台接口需要会话 Cookie，请先捕获或刷新 Cookie');
    headers['Cookie'] = cookie;

    return headers;
  }

  private getAdminCookie(tokenData: TokenData): string {
    if (Array.isArray(tokenData.cookies) && tokenData.cookies.length > 0) {
      return tokenData.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    }
    return tokenData.cookieString?.trim() || '';
  }

  public async uploadTemplateFile(
    env: NeoEnvironment,
    tokenData: TokenData,
    params: { filePath: string; fileName?: string },
    signal?: AbortSignal,
  ): Promise<{ success: boolean; data?: { fileName: string; fileUrl: string }; error?: string }> {
    const baseUrl = this.resolveBaseUrl(env, tokenData);
    const cookie = this.getAdminCookie(tokenData);
    if (!cookie) return { success: false, error: '打印模板文件上传需要后台会话 Cookie，请先捕获或刷新 Cookie' };

    const filePath = path.resolve(params.filePath);
    let stats: fs.Stats;
    try { stats = fs.statSync(filePath); } catch { return { success: false, error: '指定的模板文件不存在或无法读取' }; }
    if (!stats.isFile()) return { success: false, error: '模板上传路径必须是文件' };
    if (stats.size === 0 || stats.size > 50 * 1024 * 1024) return { success: false, error: '模板文件大小必须大于 0 且不超过 50 MB' };
    const fileName = path.basename(params.fileName?.trim() || filePath);
    if (!/\.(docx?|xlsx?)$/i.test(fileName)) return { success: false, error: '仅支持 Word 或 Excel 模板文件（.doc/.docx/.xls/.xlsx）' };

    const form = new FormData();
    form.append('uploadFile', fs.createReadStream(filePath), { filename: fileName });
    form.append('fileName', fileName);
    form.append('encoding', 'utf-8');
    signal?.throwIfAborted();
    try {
      const response = await this.uploadRequest(`${baseUrl}/admin/translation_v3/fileUpload.action`, form, {
        headers: { ...form.getHeaders(), Cookie: cookie, 'X-Requested-With': 'XMLHttpRequest',
          Origin: baseUrl, Referer: `${baseUrl}/admin/template-manage/index.action`, Accept: 'application/json, text/javascript, */*; q=0.01' },
        timeout: 60000,
        maxRedirects: 0,
        maxBodyLength: 50 * 1024 * 1024,
        signal,
      });
      const envelope = response.data;
      const payload = envelope?.data?.data || envelope?.data || envelope;
      const rejected = envelope?.success === false || envelope?.status === -1 || envelope?.status === '-1' ||
        (envelope?.code !== undefined && ![0, '0', 200, '200'].includes(envelope.code));
      if (rejected) throw new Error(envelope?.msg || envelope?.message || '平台拒绝了文件上传');
      if (typeof payload?.fileUrl !== 'string' || !payload.fileUrl || typeof payload?.fileName !== 'string' || !payload.fileName) {
        throw new Error('上传接口未返回 fileUrl/fileName，不能确认文件已上传');
      }
      return { success: true, data: { fileName: payload.fileName, fileUrl: payload.fileUrl } };
    } catch (error: any) {
      if (signal?.aborted || error?.name === 'AbortError') throw error;
      let reason = String(error?.response?.data?.msg || error?.response?.data?.message || error?.message || error);
      for (const secret of [tokenData.access_token, tokenData.refresh_token, tokenData.cookieString,
        ...(tokenData.cookies || []).map(cookie => cookie.value)]) {
        if (secret) reason = reason.split(secret).join('[REDACTED]');
      }
      return { success: false, error: `上传打印模板文件失败: ${reason.slice(0, 500)}` };
    }
  }

  public async createPrintTemplate(
    env: NeoEnvironment,
    tokenData: TokenData,
    params: {
      filePath: string;
      entityApiKey: string;
      objectId?: number | string;
      name: string;
      printFileName?: string;
      description?: string;
      outputType: 0 | 1 | 2;
    },
    signal?: AbortSignal,
  ): Promise<{ success: boolean; verified?: boolean; uploaded?: boolean; data?: Record<string, unknown>; error?: string }> {
    const name = params.name.trim();
    if (!name || name.length > 100) return { success: false, error: '模板名称必须为 1 到 100 个字符' };
    if (![0, 1, 2].includes(params.outputType)) return { success: false, error: 'outputType 仅支持 0（Word/Excel 原文件）、1（PDF）、2（前台自选格式）' };
    const objects = await this.listPrintObjects(env, tokenData);
    if (!objects.success || !objects.data) return { success: false, error: objects.error || '无法读取当前租户打印对象，停止创建' };
    let target = objects.data.find((item) => params.objectId != null
      ? Number(item.objectId) === Number(params.objectId)
      : item.apiKey.toLowerCase() === params.entityApiKey.trim().toLowerCase());
    if (!target) {
      let entities: any[];
      try {
        entities = await this.metadataService.fetchEntityList(env, tokenData);
      } catch (error: any) {
        return { success: false, error: `打印对象列表中没有目标对象，且当前租户元数据读取失败：${error.message || error}` };
      }
      const entity = entities.find((item) => item.apiKey?.toLowerCase() === params.entityApiKey.trim().toLowerCase());
      const entityObjectId = Number(entity?.objectId || entity?.id);
      if (!entity || !Number.isFinite(entityObjectId) || entityObjectId <= 0) {
        return { success: false, error: `当前租户打印对象列表和实体元数据中均找不到 ${params.entityApiKey || params.objectId}` };
      }
      if (params.objectId != null && entityObjectId !== Number(params.objectId)) {
        return { success: false, error: `对象 ID ${params.objectId} 与当前租户元数据中的 ${params.entityApiKey}（${entityObjectId}）不匹配` };
      }
      target = {
        objectId: entityObjectId,
        apiKey: entity.apiKey,
        label: entity.label || entity.apiKey,
        allNum: 0,
        enableNum: 0,
      };
    }
    if (params.entityApiKey && target.apiKey.toLowerCase() !== params.entityApiKey.trim().toLowerCase()) {
      return { success: false, error: `对象 ID ${params.objectId} 与 API Key ${params.entityApiKey} 不匹配` };
    }

    const before = await this.listAllTemplatesByObject(env, tokenData, target.objectId, signal);
    if (!before.success || !before.data) return { success: false, error: before.error || '无法读取目标对象的现有模板，停止创建' };
    if (before.data.some((item) => item.name.trim().toLowerCase() === name.toLowerCase())) {
      return { success: false, error: `目标对象已存在同名模板“${name}”，为避免重复创建已停止；请先核对现有模板` };
    }

    const uploaded = await this.uploadTemplateFile(env, tokenData, { filePath: params.filePath }, signal);
    if (!uploaded.success || !uploaded.data) return { success: false, error: uploaded.error || '模板文件上传失败' };
    const baseUrl = this.resolveBaseUrl(env, tokenData);
    const payload: Record<string, unknown> = {
      id: null,
      systemId: target.objectId,
      langCode: '$UserLangCode',
      status: 0,
      name,
      fileName: uploaded.data.fileName,
      fileUrl: uploaded.data.fileUrl,
      outputType: params.outputType,
      printFileName: params.printFileName?.trim() || name,
      ...(params.description?.trim() ? { description: params.description.trim() } : {}),
    };
    const form = new URLSearchParams();
    form.append('templateParam', JSON.stringify(payload));
    let saveError: unknown;
    try {
      signal?.throwIfAborted();
      const response = await this.definitionRequest(`${baseUrl}/admin/template-manage/save-template-print.action`, form.toString(), {
        headers: this.buildAdminHeaders(baseUrl, tokenData), timeout: 30000, signal,
      });
      const result = response.data;
      const accepted = result?.status === 0 || result?.status === '0';
      if (!accepted || result?.success === false || result?.error) {
        throw new Error(result?.msg || result?.message || '保存接口未返回确认成功状态');
      }
    } catch (error: any) {
      saveError = error;
    }

    // A save timeout may happen after persistence. Read before deciding whether anything failed.
    const after = signal?.aborted
      ? { success: false, error: '当前操作已取消，无法回读模板定义' }
      : await this.listAllTemplatesByObject(env, tokenData, target.objectId, signal);
    const created = after.success ? after.data?.find((item) => Number(item.systemId) === target.objectId &&
      item.name.trim().toLowerCase() === name.toLowerCase() && item.fileName === uploaded.data!.fileName &&
      item.fileUrl === uploaded.data!.fileUrl) : undefined;
    if (created) {
      return { success: true, verified: true, uploaded: true, data: {
        templatePrintId: created.id, name: created.name, entityApiKey: target.apiKey, objectId: target.objectId,
        objectLabel: target.label, fileName: created.fileName, outputType: created.outputType,
        status: created.status, statusName: created.statusName,
      } };
    }
    const reason = signal?.aborted
      ? '文件已上传，但保存/回读流程被取消，模板定义状态未知'
      : saveError instanceof Error ? saveError.message : '保存后回读未发现模板';
    return { success: false, uploaded: true, error: `文件已上传（${uploaded.data.fileName}），模板定义尚未确认创建；${reason}。未自动重试以避免重复创建。${after.error ? ` 回读失败：${after.error}` : ''}` };
  }

  /**
   * 解析业务实体的 objectId 与 apiKey
   */
  public async resolveEntityIdentifier(
    env: NeoEnvironment,
    tokenData: TokenData,
    params: { objectId?: number | string; entityApiKey?: string }
  ): Promise<{ objectId: number; entityApiKey: string; label: string }> {
    const baseUrl = this.resolveBaseUrl(env, tokenData);
    const headers = this.buildAdminHeaders(baseUrl, tokenData);

    let objectList: any[] = [];
    try {
      const objRes = await axios.get(`${baseUrl}/admin/template-manage/object.action`, { headers, timeout: 10000 });
      objectList = objRes.data?.data?.list || [];
    } catch {}

    if (objectList.length === 0) {
      try {
        const fallbackList = await this.metadataService.fetchEntityList(env, tokenData);
        objectList = fallbackList.map((f: any) => ({
          objectId: f.objectId || f.id,
          id: f.objectId || f.id,
          apiKey: f.apiKey,
          label: f.label || f.name,
        }));
      } catch {}
    }

    if (params.objectId) {
      const numId = Number(params.objectId);
      const matched = objectList.find((o: any) => Number(o.objectId || o.id) === numId);
      if (matched) {
        return {
          objectId: numId,
          entityApiKey: matched.apiKey || matched.name,
          label: matched.label || matched.apiKey,
        };
      }
    }

    if (params.entityApiKey) {
      const key = params.entityApiKey.trim().toLowerCase();
      const matched = objectList.find((o: any) => (o.apiKey || o.name || '').toLowerCase() === key || (o.label || '').toLowerCase() === key);
      if (matched) {
        return {
          objectId: Number(matched.objectId || matched.id),
          entityApiKey: matched.apiKey || matched.name,
          label: matched.label || matched.apiKey,
        };
      }
    }

    return {
      objectId: Number(params.objectId) || 1,
      entityApiKey: params.entityApiKey || 'account',
      label: params.entityApiKey || '客户',
    };
  }

  /**
   * 1. 查询当前租户支持配置打印模板的所有业务对象及其模板统计
   * (GET /admin/template-manage/object.action & POST /admin/template-manage/template-count-list.action)
   */
  public async listPrintObjects(env: NeoEnvironment, tokenData: TokenData): Promise<{
    success: boolean;
    data?: Array<{
      objectId: number;
      apiKey: string;
      label: string;
      allNum: number;
      enableNum: number;
      wordModelUrl?: string;
      excelModelUrl?: string;
    }>;
    error?: string;
  }> {
    const baseUrl = this.resolveBaseUrl(env, tokenData);
    const headers = this.buildAdminHeaders(baseUrl, tokenData);

    try {
      // 1. 获取已配置模板的对象统计 (template-count-list)
      const countBody = new URLSearchParams();
      countBody.append('pageNo', '1');
      countBody.append('pageSize', '100');

      const [countRes, objRes] = await Promise.all([
        axios.post(`${baseUrl}/admin/template-manage/template-count-list.action`, countBody.toString(), { headers, timeout: 12000 }).catch(() => null),
        axios.get(`${baseUrl}/admin/template-manage/object.action`, { headers, timeout: 12000 }).catch(() => null),
      ]);

      const countMap = new Map<number, { allNum: number; enableNum: number; word?: string; excel?: string }>();
      const countData = countRes?.data?.data?.dataList || countRes?.data?.data || [];
      if (Array.isArray(countData)) {
        for (const item of countData) {
          const objId = Number(item.objectId);
          countMap.set(objId, {
            allNum: Number(item.allNum || 0),
            enableNum: Number(item.enableNum || 0),
            word: item.templateModelDto?.word,
            excel: item.templateModelDto?.excel,
          });
        }
      }

      const allObjects = objRes?.data?.data?.list || [];
      const result = allObjects.map((o: any) => {
        const objId = Number(o.objectId || o.id);
        const stats = countMap.get(objId) || { allNum: 0, enableNum: 0 };
        return {
          objectId: objId,
          apiKey: o.apiKey || o.name,
          label: o.label || o.apiKey,
          allNum: stats.allNum,
          enableNum: stats.enableNum,
          wordModelUrl: stats.word,
          excelModelUrl: stats.excel,
        };
      });

      // 已配置模板的对象优先排在前面，其余按中文首字母排序
      result.sort((a: any, b: any) => {
        if (b.allNum !== a.allNum) return b.allNum - a.allNum;
        return a.label.localeCompare(b.label, 'zh-Hans-CN');
      });

      return { success: true, data: result };
    } catch (e: any) {
      return { success: false, error: `查询打印对象列表失败: ${e.response?.data?.message || e.message}` };
    }
  }

  /**
   * 2. 查询指定业务对象已配置的打印模板列表
   * (POST /admin/template-manage/template-object-list.action)
   */
  public async listTemplatesByObject(
    env: NeoEnvironment,
    tokenData: TokenData,
    params: { objectId?: number | string; entityApiKey?: string; pageNo?: number; pageSize?: number }
  ): Promise<{
    success: boolean;
    data?: any[];
    total?: number;
    entityApiKey?: string;
    objectLabel?: string;
    objectId?: number;
    error?: string;
  }> {
    const baseUrl = this.resolveBaseUrl(env, tokenData);
    const headers = this.buildAdminHeaders(baseUrl, tokenData);

    try {
      const resolved = await this.resolveEntityIdentifier(env, tokenData, params);
      const body = new URLSearchParams();
      body.append('systemId', String(resolved.objectId));
      body.append('pageNo', String(params.pageNo || 1));
      body.append('pageSize', String(params.pageSize || 50));

      const res = await axios.post(`${baseUrl}/admin/template-manage/template-object-list.action`, body.toString(), {
        headers,
        timeout: 15000,
      });

      const raw = res.data?.data?.data || res.data?.data || {};
      const list = raw.currentPageDatas || raw.records || [];
      const total = Number(raw.dataCount || raw.total || list.length);

      const enriched = list.map((t: any) => ({
        id: String(t.id),
        name: t.name || '未命名模板',
        systemId: Number(t.systemId || resolved.objectId),
        entityApiKey: resolved.entityApiKey,
        objectLabel: resolved.label,
        status: Number(t.status || 0),
        statusName: Number(t.status) === 1 ? '启用' : '禁用',
        outputType: Number(t.outputType ?? 0),
        outputTypeName: Number(t.outputType) === 0 ? 'Word/Excel 原文件' : Number(t.outputType) === 1 ? 'PDF 导出' : '前台自选格式',
        fileName: t.fileName || '',
        fileUrl: t.fileUrl || '',
        printFileName: t.printFileName || '',
        langCode: t.langCode || '$UserLangCode',
        languageCode: t.languageCode || 'zh',
        printCondition: t.printCondition,
        hasCondition: Boolean(t.printCondition && t.printCondition !== '{}' && t.printCondition !== '[]'),
        createdAt: t.createdAt,
        createdBy: t.createdBy,
        updatedAt: t.updatedAt,
        updatedBy: t.updatedBy,
      }));

      return {
        success: true,
        data: enriched,
        total,
        entityApiKey: resolved.entityApiKey,
        objectLabel: resolved.label,
        objectId: resolved.objectId,
      };
    } catch (e: any) {
      return { success: false, error: `查询模板列表失败: ${e.response?.data?.message || e.message}` };
    }
  }

  private async listAllTemplatesByObject(
    env: NeoEnvironment,
    tokenData: TokenData,
    objectId: number,
    signal?: AbortSignal,
  ): Promise<{ success: boolean; data?: any[]; error?: string }> {
    const pageSize = 100;
    const first = await this.listTemplatesByObject(env, tokenData, { objectId, pageNo: 1, pageSize });
    if (!first.success || !first.data) return { success: false, error: first.error || '无法读取模板列表' };
    const pages = Math.ceil((first.total || first.data.length) / pageSize);
    if (pages > 50) return { success: false, error: '目标对象模板超过安全核对上限，停止创建以避免重复' };
    const all = [...first.data];
    for (let pageNo = 2; pageNo <= pages; pageNo++) {
      signal?.throwIfAborted();
      const page = await this.listTemplatesByObject(env, tokenData, { objectId, pageNo, pageSize });
      if (!page.success || !page.data) return { success: false, error: page.error || `读取模板第 ${pageNo} 页失败` };
      all.push(...page.data);
    }
    return { success: true, data: all };
  }

  /**
   * 3. 查询指定业务对象的打印可用字段与明细关联子对象
   * (POST /admin/template-manage/object-items.action & GET /admin/template-manage/object-links.action)
   */
  public async getPrintTemplateFields(
    env: NeoEnvironment,
    tokenData: TokenData,
    params: { objectId?: number | string; entityApiKey?: string }
  ): Promise<{
    success: boolean;
    data?: {
      objectId: number;
      entityApiKey: string;
      objectLabel: string;
      mainFields: Array<{ apiKey: string; label: string; itemType: number; placeholder: string }>;
      childLinks: Array<{ apiKey: string; label: string; objectId: number; loopSyntax: string }>;
      functionFields: Array<{ name: string; syntax: string; description: string }>;
    };
    error?: string;
  }> {
    const baseUrl = this.resolveBaseUrl(env, tokenData);
    const headers = this.buildAdminHeaders(baseUrl, tokenData);

    try {
      const resolved = await this.resolveEntityIdentifier(env, tokenData, params);
      const itemsBody = new URLSearchParams();
      itemsBody.append('objectId', String(resolved.objectId));

      const [itemsRes, linksRes] = await Promise.all([
        axios.post(`${baseUrl}/admin/template-manage/object-items.action`, itemsBody.toString(), { headers, timeout: 15000 }),
        axios.get(`${baseUrl}/admin/template-manage/object-links.action?objectId=${resolved.objectId}`, { headers, timeout: 15000 }).catch(() => null),
      ]);

      const rawItems = itemsRes.data?.data?.items || [];
      const mainFields = rawItems.map((f: any) => ({
        apiKey: f.apiKey,
        label: f.label || f.apiKey,
        itemType: Number(f.itemType || 1),
        placeholder: `##{${f.apiKey}}`,
      }));

      const rawLinks = linksRes?.data?.data?.objectList || [];
      const childLinks = rawLinks.map((l: any) => {
        const cKey = l.apiKey || l.name;
        return {
          apiKey: cKey,
          label: l.label || l.apiKey,
          objectId: Number(l.objectId || l.id),
          loopSyntax: `##={begin:${cKey}_prt} ... ##={prt.字段API} ... ##={end}`,
          beginTag: `##={begin:${cKey}_prt}`,
          fieldSyntax: `##={prt.字段API}`,
          endTag: `##={end}`,
        };
      });

      const functionFields = [
        { name: '当前时间(默认格式)', syntax: '##={fun_now}', description: '输出系统当前打印时间' },
        { name: '当前时间(格式化)', syntax: '##={fun_now:style=YYYY-MM-DD}', description: '按指定格式输出年月日' },
        { name: '当前时间(带时分秒)', syntax: '##={fun_now:style=YYYY-MM-DD HH:mm:ss}', description: '按指定格式输出完整时间戳' },
        { name: '关联对象穿透字段', syntax: '##{ownerId.name}', description: '穿透访问关联主对象的字段' },
        { name: '创建人姓名', syntax: '##{createdBy.name}', description: '记录创建人中文名称' },
      ];

      return {
        success: true,
        data: {
          objectId: resolved.objectId,
          entityApiKey: resolved.entityApiKey,
          objectLabel: resolved.label,
          mainFields,
          childLinks,
          functionFields,
        },
      };
    } catch (e: any) {
      return { success: false, error: `查询打印可用字段失败: ${e.response?.data?.message || e.message}` };
    }
  }

  /**
   * 4. 下载系统官方 Word / Excel 打印模板范例文件链接
   * (POST /admin/template-manage/download-template-model.action)
   */
  public async downloadTemplateSample(
    env: NeoEnvironment,
    tokenData: TokenData,
    params: { objectId?: number | string; entityApiKey?: string }
  ): Promise<{
    success: boolean;
    data?: {
      word?: string;
      excel?: string;
      objectId: number;
      entityApiKey: string;
      objectLabel: string;
    };
    error?: string;
  }> {
    const baseUrl = this.resolveBaseUrl(env, tokenData);
    const headers = this.buildAdminHeaders(baseUrl, tokenData);

    try {
      const resolved = await this.resolveEntityIdentifier(env, tokenData, params);
      const body = new URLSearchParams();
      body.append('systemId', String(resolved.objectId));

      const res = await axios.post(`${baseUrl}/admin/template-manage/download-template-model.action`, body.toString(), {
        headers,
        timeout: 15000,
      });

      const modelDto = res.data?.data?.data || res.data?.data || {};
      return {
        success: true,
        data: {
          word: modelDto.word || '',
          excel: modelDto.excel || '',
          objectId: resolved.objectId,
          entityApiKey: resolved.entityApiKey,
          objectLabel: resolved.label,
        },
      };
    } catch (e: any) {
      return { success: false, error: `获取模板范例链接失败: ${e.response?.data?.message || e.message}` };
    }
  }

  /**
   * 5. 启用或禁用打印模板
   * (POST /admin/template-manage/update-template-print-status.action)
   */
  public async toggleTemplateStatus(
    env: NeoEnvironment,
    tokenData: TokenData,
    templatePrintId: string | number,
    enable: boolean
  ): Promise<{ success: boolean; status?: number; error?: string }> {
    const baseUrl = this.resolveBaseUrl(env, tokenData);
    const headers = this.buildAdminHeaders(baseUrl, tokenData);

    try {
      const targetStatus = enable ? 1 : 0;
      const body = new URLSearchParams();
      body.append('templatePrintId', String(templatePrintId));
      body.append('templatePrintStatus', String(targetStatus));

      const res = await axios.post(`${baseUrl}/admin/template-manage/update-template-print-status.action`, body.toString(), {
        headers,
        timeout: 15000,
      });

      if (res.data?.status !== 0 && res.data?.status !== '0' && res.data?.code !== 200) {
        throw new Error(res.data?.msg || res.data?.statusText || '切换状态失败');
      }

      return { success: true, status: targetStatus };
    } catch (e: any) {
      return { success: false, error: `切换模板启停状态失败: ${e.response?.data?.message || e.message}` };
    }
  }

  /**
   * 6. 删除打印模板
   * (POST /admin/template-manage/delete-template-print.action)
   */
  public async deleteTemplate(
    env: NeoEnvironment,
    tokenData: TokenData,
    templatePrintId: string | number
  ): Promise<{ success: boolean; error?: string }> {
    const baseUrl = this.resolveBaseUrl(env, tokenData);
    const headers = this.buildAdminHeaders(baseUrl, tokenData);

    try {
      const body = new URLSearchParams();
      body.append('templatePrintId', String(templatePrintId));

      const res = await axios.post(`${baseUrl}/admin/template-manage/delete-template-print.action`, body.toString(), {
        headers,
        timeout: 15000,
      });

      if (res.data?.status !== 0 && res.data?.status !== '0' && res.data?.code !== 200) {
        throw new Error(res.data?.msg || res.data?.statusText || '删除模板失败');
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: `删除打印模板失败: ${e.response?.data?.message || e.message}` };
    }
  }

  /**
   * 7. 触发打印生成导出预览文件 (公开运行 API)
   * (GET /rest/template/v2.0/{apiKey}/{recordId}/{templateId}/{exportType})
   */
  public async renderPrintDocument(
    env: NeoEnvironment,
    tokenData: TokenData,
    params: {
      entityApiKey: string;
      recordId: string | number;
      templateId: string | number;
      exportType?: 1 | 2 | 3; // 1: PDF (默认), 2: Word, 3: Excel
    }
  ): Promise<{
    success: boolean;
    data?: {
      base64?: string;
      fileUrl?: string;
      fileName?: string;
      exportType: number;
    };
    error?: string;
  }> {
    const baseUrl = this.resolveBaseUrl(env, tokenData);
    const exportType = params.exportType || 1;
    const url = `${baseUrl}/rest/template/v2.0/${params.entityApiKey}/${params.recordId}/${params.templateId}/${exportType}`;

    try {
      const res = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
        timeout: 30000,
      });

      const resData = res.data;
      if (typeof resData === 'string') {
        return {
          success: true,
          data: {
            base64: resData,
            exportType,
          },
        };
      }

      if (resData.code && resData.code !== 200 && resData.code !== '200') {
        throw new Error(resData.message || resData.msg || '运行打印生成失败');
      }

      const innerData = resData.data;
      if (typeof innerData === 'string') {
        return {
          success: true,
          data: {
            base64: innerData,
            exportType,
          },
        };
      }

      return {
        success: true,
        data: {
          base64: innerData?.data,
          fileUrl: innerData?.url,
          fileName: innerData?.fileName,
          exportType,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        error: `运行打印预览失败: ${e.response?.data?.message || e.message}`,
      };
    }
  }

  /**
   * 8. 直接在当前项目工作区生成标准销售易 Word (.docx) 打印模板文件 (原生物理文档落库)
   */
  public async generatePrintTemplate(params: {
    entityApiKey: string;
    fileName?: string;
    title?: string;
    objectLabel?: string;
    headerFields?: Array<{ apiKey: string; label: string }>;
    detailTable?: {
      childObjectApiKey: string;
      childObjectLabel?: string;
      columns: Array<{ apiKey: string; label: string }>;
    } | null;
    detailTables?: Array<{
      childObjectApiKey: string;
      childObjectLabel?: string;
      columns: Array<{ apiKey: string; label: string }>;
    }> | null;
    includeSignatures?: boolean;
    workdir?: string;
  }): Promise<{
    success: boolean;
    fileName: string;
    fullPath: string;
    relativePath: string;
    sizeBytes: number;
    message: string;
    error?: string;
  }> {
    try {
      const targetDir = params.workdir && fs.existsSync(params.workdir)
        ? params.workdir
        : process.cwd();

      const objectLabel = params.objectLabel || params.entityApiKey;
      let safeFileName = params.fileName?.trim() || `${objectLabel}_业务打印模板.docx`;
      if (!safeFileName.endsWith('.docx') && !safeFileName.endsWith('.doc')) {
        safeFileName += '.docx';
      }

      const fullPath = path.join(targetDir, safeFileName);
      const title = params.title || `【${objectLabel}】业务打印档案`;

      const children: any[] = [];

      // 1. 文档大标题
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 100, after: 120 },
          children: [
            new TextRun({
              text: title,
              bold: true,
              size: 34, // 17pt
              color: '0F172A',
            }),
          ],
        })
      );

      // 2. 副标题与元数据
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
          children: [
            new TextRun({
              text: `单据编号: ##{id}    打印时间: ##={fun_now:style=YYYY-MM-DD HH:mm:ss}    打印人: ##{ownerId.name}`,
              size: 19, // 9.5pt
              color: '64748B',
            }),
          ],
        })
      );

      // 3. 一、核心主表信息 (4列平铺排版)
      children.push(
        new Paragraph({
          spacing: { before: 200, after: 120 },
          children: [
            new TextRun({
              text: `一、 【${objectLabel}】核心基础信息`,
              bold: true,
              size: 22, // 11pt
              color: '1E293B',
            }),
          ],
        })
      );

      const fields = (params.headerFields && params.headerFields.length > 0)
        ? params.headerFields
        : [
            { label: `${objectLabel}名称`, apiKey: `${params.entityApiKey}Name` },
            { label: '负责人', apiKey: 'ownerId.name' },
            { label: '创建时间', apiKey: 'createdAt' },
            { label: '业务类型', apiKey: 'entityType' },
          ];

      const rows: TableRow[] = [];
      for (let i = 0; i < fields.length; i += 2) {
        const f1 = fields[i];
        const f2 = fields[i + 1];

        const cells: TableCell[] = [
          new TableCell({
            width: { size: 18, type: WidthType.PERCENTAGE },
            shading: { fill: 'F8FAFC', type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: f1.label, bold: true, size: 20, color: '334155' })] })],
          }),
          new TableCell({
            width: { size: 32, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: `##{${f1.apiKey}}`, size: 20, color: '0F172A' })] })],
          }),
        ];

        if (f2) {
          cells.push(
            new TableCell({
              width: { size: 18, type: WidthType.PERCENTAGE },
              shading: { fill: 'F8FAFC', type: ShadingType.CLEAR },
              children: [new Paragraph({ children: [new TextRun({ text: f2.label, bold: true, size: 20, color: '334155' })] })],
            }),
            new TableCell({
              width: { size: 32, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: `##{${f2.apiKey}}`, size: 20, color: '0F172A' })] })],
            })
          );
        } else {
          cells.push(
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              columnSpan: 2,
              children: [new Paragraph({ children: [] })],
            })
          );
        }

        rows.push(new TableRow({ children: cells }));
      }

      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows,
        })
      );

      // 4. 二、明细子对象表格集合 (支持渲染多个相关对象明细，物理表格循环行 - 严格遵循起始 ##={begin:子对象_prt} 与结束 ##={end} 规范)
      let effectiveTables: Array<{
        childObjectApiKey: string;
        childObjectLabel?: string;
        columns: Array<{ apiKey: string; label: string }>;
      }> = [];

      if (params.detailTables && params.detailTables.length > 0) {
        effectiveTables = params.detailTables.filter((t) => t && t.columns && t.columns.length > 0);
      } else if (params.detailTable && params.detailTable.columns && params.detailTable.columns.length > 0) {
        effectiveTables = [params.detailTable];
      } else {
        const entKey = params.entityApiKey.toLowerCase();
        if (entKey === 'order' || entKey === '订单') {
          // 订单默认包含全部相关对象明细：1) 订购产品清单 2) 订单回款/支付明细
          effectiveTables = [
            {
              childObjectApiKey: 'orderProduct',
              childObjectLabel: '订购产品与商品清单',
              columns: [
                { label: '产品编码', apiKey: 'productCode' },
                { label: '产品名称', apiKey: 'productName' },
                { label: '销售单价', apiKey: 'price' },
                { label: '数量', apiKey: 'quantity' },
                { label: '单位', apiKey: 'unit' },
                { label: '小计金额', apiKey: 'amount' },
              ],
            },
            {
              childObjectApiKey: 'orderPayment',
              childObjectLabel: '订单回款与支付流水明细',
              columns: [
                { label: '支付流水号', apiKey: 'payNo' },
                { label: '支付方式', apiKey: 'payType' },
                { label: '支付金额', apiKey: 'payAmount' },
                { label: '支付状态', apiKey: 'status' },
                { label: '完成时间', apiKey: 'payTime' },
              ],
            },
          ];
        } else if (entKey === 'account' || entKey === '客户') {
          // 客户全景档案默认包含三大核心相关对象明细列表：1) 关键联系人明细 2) 商机推进全景 3) 历史成交订单
          effectiveTables = [
            {
              childObjectApiKey: 'contact',
              childObjectLabel: '关键联系人列表',
              columns: [
                { label: '联系人姓名', apiKey: 'name' },
                { label: '职务', apiKey: 'title' },
                { label: '移动电话', apiKey: 'mobile' },
                { label: '电子邮箱', apiKey: 'email' },
                { label: '部门', apiKey: 'department' },
              ],
            },
            {
              childObjectApiKey: 'opportunity',
              childObjectLabel: '商机推进全景列表',
              columns: [
                { label: '商机名称', apiKey: 'opportunityName' },
                { label: '预计金额', apiKey: 'money' },
                { label: '当前阶段', apiKey: 'saleStageId' },
                { label: '预计结单日', apiKey: 'closeDate' },
                { label: '负责人', apiKey: 'ownerId.name' },
              ],
            },
            {
              childObjectApiKey: 'order',
              childObjectLabel: '历史成交订单列表',
              columns: [
                { label: '订单编号', apiKey: 'orderNo' },
                { label: '订单金额', apiKey: 'totalAmount' },
                { label: '签约日期', apiKey: 'orderDate' },
                { label: '订单状态', apiKey: 'status' },
                { label: '负责人', apiKey: 'ownerId.name' },
              ],
            },
          ];
        } else if (entKey === 'contract' || entKey === '合同') {
          effectiveTables = [
            {
              childObjectApiKey: 'orderProduct',
              childObjectLabel: '合同产品与服务清单',
              columns: [
                { label: '产品名称', apiKey: 'productName' },
                { label: '数量', apiKey: 'quantity' },
                { label: '销售单价', apiKey: 'price' },
                { label: '小计金额', apiKey: 'amount' },
              ],
            },
          ];
        } else if (entKey.includes('maintenance') || entKey.includes('工单') || entKey === 'case') {
          effectiveTables = [
            {
              childObjectApiKey: 'caseComment',
              childObjectLabel: '服务处理与流转明细',
              columns: [
                { label: '处理环节', apiKey: 'stepName' },
                { label: '处理人员', apiKey: 'ownerId.name' },
                { label: '处理时间', apiKey: 'createdAt' },
                { label: '处理意见/说明', apiKey: 'comment' },
              ],
            },
          ];
        }
      }

      // 循环渲染每一个明细表格
      const sectionNumChinese = ['二', '三', '四', '五', '六'];
      effectiveTables.forEach((tableItem, tIdx) => {
        const childLabel = tableItem.childObjectLabel || `关联明细 ${tIdx + 1}`;
        const childKey = tableItem.childObjectApiKey || 'items';
        const cols = tableItem.columns;
        const colWidth = Math.floor(100 / cols.length);
        const sectionHeader = sectionNumChinese[tIdx] || `${tIdx + 2}`;

        children.push(
          new Paragraph({
            spacing: { before: 300, after: 120 },
            children: [
              new TextRun({
                text: `${sectionHeader}、 【${childLabel}】列表 (物理表格循环)`,
                bold: true,
                size: 22,
                color: '1E293B',
              }),
            ],
          })
        );

        // 第 0 行：循环起始参数行 ##={begin:子对象_prt}
        const startRow = new TableRow({
          children: cols.map(() =>
            new TableCell({
              width: { size: colWidth, type: WidthType.PERCENTAGE },
              shading: { fill: 'F8FAFC', type: ShadingType.CLEAR },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: `##={begin:${childKey}_prt}`,
                      size: 18,
                      bold: true,
                      color: '475569',
                    }),
                  ],
                }),
              ],
            })
          ),
        });

        // 第 1 行：表头重复控制开始 ##={fun_table notes:head=begin&repeat=Y}
        const headStartRow = new TableRow({
          children: cols.map(() =>
            new TableCell({
              width: { size: colWidth, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: '##={fun_table notes:head=begin&repeat=Y}',
                      size: 16,
                      color: '94A3B8',
                    }),
                  ],
                }),
              ],
            })
          ),
        });

        // 第 2 行：表头中文列名
        const thRow = new TableRow({
          tableHeader: true,
          children: cols.map((col) =>
            new TableCell({
              width: { size: colWidth, type: WidthType.PERCENTAGE },
              shading: { fill: 'E2E8F0', type: ShadingType.CLEAR },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: col.label, bold: true, size: 20, color: '1E293B' })],
                }),
              ],
            })
          ),
        });

        // 第 3 行：表头重复控制结束 ##={fun_table notes:head=end}
        const headEndRow = new TableRow({
          children: cols.map(() =>
            new TableCell({
              width: { size: colWidth, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: '##={fun_table notes:head=end}',
                      size: 16,
                      color: '94A3B8',
                    }),
                  ],
                }),
              ],
            })
          ),
        });

        // 第 4 行：数据循环行 ##={prt.字段API}
        const loopRow = new TableRow({
          children: cols.map((col) =>
            new TableCell({
              width: { size: colWidth, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: `##={prt.${col.apiKey}}`,
                      size: 20,
                      color: '0F172A',
                    }),
                  ],
                }),
              ],
            })
          ),
        });

        // 第 5 行：循环结束参数行 ##={end}
        const endRow = new TableRow({
          children: cols.map(() =>
            new TableCell({
              width: { size: colWidth, type: WidthType.PERCENTAGE },
              shading: { fill: 'F8FAFC', type: ShadingType.CLEAR },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: '##={end}',
                      size: 18,
                      bold: true,
                      color: '475569',
                    }),
                  ],
                }),
              ],
            })
          ),
        });

        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [startRow, headStartRow, thRow, headEndRow, loopRow, endRow],
          })
        );
      });

      // 追加审批历史记录专用循环表格
      children.push(
        new Paragraph({
          spacing: { before: 300, after: 120 },
          children: [
            new TextRun({
              text: '【系统审批流转历史记录】',
              bold: true,
              size: 22,
              color: '1E293B',
            }),
          ],
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  shading: { fill: 'F8FAFC', type: ShadingType.CLEAR },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '##={begin:approvalHistories_prt}', size: 18, bold: true, color: '475569' })] })],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '##{prt}', size: 20, color: '0F172A' })] })],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  shading: { fill: 'F8FAFC', type: ShadingType.CLEAR },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '##={end}', size: 18, bold: true, color: '475569' })] })],
                }),
              ],
            }),
          ],
        })
      );

      // 5. 三、审核与业务签章区
      if (params.includeSignatures !== false) {
        children.push(
          new Paragraph({
            spacing: { before: 360, after: 120 },
            children: [
              new TextRun({
                text: '三、 审核与业务签章',
                bold: true,
                size: 22,
                color: '1E293B',
              }),
            ],
          })
        );

        const signRows = [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 33, type: WidthType.PERCENTAGE },
                shading: { fill: 'F8FAFC', type: ShadingType.CLEAR },
                children: [new Paragraph({ children: [new TextRun({ text: '需方（客户盖章）: ##{accountId.accountName}', bold: true, size: 20 })] })],
              }),
              new TableCell({
                width: { size: 33, type: WidthType.PERCENTAGE },
                shading: { fill: 'F8FAFC', type: ShadingType.CLEAR },
                children: [new Paragraph({ children: [new TextRun({ text: '部门负责人审批', bold: true, size: 20 })] })],
              }),
              new TableCell({
                width: { size: 34, type: WidthType.PERCENTAGE },
                shading: { fill: 'F8FAFC', type: ShadingType.CLEAR },
                children: [new Paragraph({ children: [new TextRun({ text: '业务用章处', bold: true, size: 20 })] })],
              }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({
                children: [
                  new Paragraph({ spacing: { before: 800, after: 100 }, children: [new TextRun({ text: '签字: ____________', size: 18, color: '64748B' })] }),
                  new Paragraph({ children: [new TextRun({ text: '日期: ____年__月__日', size: 18, color: '64748B' })] }),
                ],
              }),
              new TableCell({
                children: [
                  new Paragraph({ spacing: { before: 800, after: 100 }, children: [new TextRun({ text: '签字: ____________', size: 18, color: '64748B' })] }),
                  new Paragraph({ children: [new TextRun({ text: '日期: ____年__月__日', size: 18, color: '64748B' })] }),
                ],
              }),
              new TableCell({
                children: [
                  new Paragraph({ spacing: { before: 800, after: 100 }, children: [new TextRun({ text: '盖章: ____________', size: 18, color: '64748B' })] }),
                  new Paragraph({ children: [new TextRun({ text: '日期: ____年__月__日', size: 18, color: '64748B' })] }),
                ],
              }),
            ],
          }),
        ];

        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: signRows,
          })
        );
      }

      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                margin: { top: 1152, bottom: 1152, left: 1152, right: 1152 },
              },
            },
            children,
          },
        ],
      });

      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(fullPath, buffer);
      const stat = fs.statSync(fullPath);

      return {
        success: true,
        fileName: safeFileName,
        fullPath,
        relativePath: path.relative(targetDir, fullPath) || safeFileName,
        sizeBytes: stat.size,
        message: `成功在工作区生成标准销售易打印模板文件: ${safeFileName} (${(stat.size / 1024).toFixed(1)} KB)`,
      };
    } catch (e: any) {
      return {
        success: false,
        fileName: params.fileName || 'template.docx',
        fullPath: '',
        relativePath: '',
        sizeBytes: 0,
        message: `生成打印模板失败: ${e.message}`,
        error: e.message,
      };
    }
  }

}
