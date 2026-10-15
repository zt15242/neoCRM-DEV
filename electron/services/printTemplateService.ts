import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';
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
  constructor(private metadataService: MetadataService) {}

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

    if (tokenData.access_token) {
      headers['Authorization'] = `Bearer ${tokenData.access_token}`;
    }

    if (Array.isArray(tokenData.cookies) && tokenData.cookies.length > 0) {
      const cookieMap = new Map<string, string>();
      for (const c of tokenData.cookies) {
        if (!c.path || c.path === '/' || c.path === '') {
          cookieMap.set(c.name, `${c.name}=${c.value}`);
        } else if (!cookieMap.has(c.name)) {
          cookieMap.set(c.name, `${c.name}=${c.value}`);
        }
      }
      headers['Cookie'] = Array.from(cookieMap.values()).join('; ');
    } else if (tokenData.cookieString) {
      headers['Cookie'] = tokenData.cookieString;
    }

    return headers;
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
        outputTypeName: Number(t.outputType) === 1 ? 'Word/原格式' : 'PDF 导出',
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

      // 4. 二、明细子对象表格 (物理表格循环行 - 严格遵循起始 ##={begin:子对象_prt} 与结束 ##={end} 规范)
      // 若未显式传入 detailTable，根据常见对象智能匹配默认明细子表
      let effectiveDetailTable = params.detailTable;
      if (!effectiveDetailTable || !effectiveDetailTable.columns || effectiveDetailTable.columns.length === 0) {
        const entKey = params.entityApiKey.toLowerCase();
        if (entKey === 'account' || entKey === '客户') {
          effectiveDetailTable = {
            childObjectApiKey: 'contact',
            childObjectLabel: '客户联系人明细',
            columns: [
              { label: '联系人姓名', apiKey: 'contactName' },
              { label: '职务', apiKey: 'title' },
              { label: '移动电话', apiKey: 'mobile' },
              { label: '电子邮箱', apiKey: 'email' },
            ],
          };
        } else if (entKey === 'contract' || entKey === '合同') {
          effectiveDetailTable = {
            childObjectApiKey: 'orderProduct',
            childObjectLabel: '合同产品与服务清单',
            columns: [
              { label: '产品名称', apiKey: 'productName' },
              { label: '数量', apiKey: 'quantity' },
              { label: '销售单价', apiKey: 'price' },
              { label: '小计金额', apiKey: 'amount' },
            ],
          };
        } else if (entKey === 'order' || entKey === '订单') {
          effectiveDetailTable = {
            childObjectApiKey: 'orderProduct',
            childObjectLabel: '订单商品明细',
            columns: [
              { label: '商品名称', apiKey: 'productName' },
              { label: '订购数量', apiKey: 'quantity' },
              { label: '单价', apiKey: 'price' },
              { label: '小计金额', apiKey: 'amount' },
            ],
          };
        } else if (entKey.includes('maintenance') || entKey.includes('工单') || entKey === 'case') {
          effectiveDetailTable = {
            childObjectApiKey: 'caseComment',
            childObjectLabel: '服务处理与流转明细',
            columns: [
              { label: '处理环节', apiKey: 'stepName' },
              { label: '处理人员', apiKey: 'ownerId.name' },
              { label: '处理时间', apiKey: 'createdAt' },
              { label: '处理意见/说明', apiKey: 'comment' },
            ],
          };
        }
      }

      if (effectiveDetailTable && effectiveDetailTable.columns && effectiveDetailTable.columns.length > 0) {
        const childLabel = effectiveDetailTable.childObjectLabel || '关联明细';
        const childKey = effectiveDetailTable.childObjectApiKey || 'items';
        const cols = effectiveDetailTable.columns;
        const colWidth = Math.floor(100 / cols.length);

        children.push(
          new Paragraph({
            spacing: { before: 300, after: 120 },
            children: [
              new TextRun({
                text: `二、 【${childLabel}】列表 (物理表格循环)`,
                bold: true,
                size: 22,
                color: '1E293B',
              }),
            ],
          })
        );

        // 第 0 行：循环起始参数行 ##={begin:子对象_prt} (销售易列表打印必须包含的起始参数)
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

        // 第 5 行：循环结束参数行 ##={end} (销售易列表打印必须包含的结束参数)
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
      }

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
                children: [new Paragraph({ children: [new TextRun({ text: '经办人签字', bold: true, size: 20 })] })],
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
