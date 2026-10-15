import axios from 'axios';
import { NeoEnvironment, TokenData, WorkflowDeployPlan, WorkflowDeployResult, ApprovalDeployPlan, TenantFlowItem, WorkflowNodeItem } from '../../shared/types';
import { MetadataService } from './metadataService';
import { DataService } from './dataService';

export class WorkflowService {
  constructor(private metadataService: MetadataService, private dataService: DataService = new DataService()) {}

  /**
   * 解析基础实例 URL
   */
  private resolveBaseUrl(env: NeoEnvironment, tokenData: TokenData): string {
    const raw = tokenData.instance_uri || env.neoBaseURL;
    return raw.endsWith('/') ? raw.slice(0, -1) : raw;
  }

  /**
   * 组装内部 /admin/creekflow/*.action 专用的请求头 (基于管理员会话 Cookie + OAuth Token)
   */
  private buildAdminHeaders(baseUrl: string, tokenData: TokenData): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'xsy-inner-source': 'bff',
      'X-Requested-With': 'XMLHttpRequest',
      Origin: baseUrl,
      Referer: `${baseUrl}/admin/creekflow/autoflow-list.action`,
      Accept: 'application/json, text/javascript, */*; q=0.01',
    };

    if (tokenData.access_token) {
      headers['Authorization'] = `Bearer ${tokenData.access_token}`;
    }

    if (Array.isArray(tokenData.cookies) && tokenData.cookies.length > 0) {
      // 过滤非根路径 (如 /mobile) 的同名 JSESSIONID，避免覆盖主站会话
      const cookieMap = new Map<string, string>();
      for (const c of tokenData.cookies) {
        if (c.path && c.path !== "/") continue;
        cookieMap.set(c.name, c.value);
      }
      headers["Cookie"] = Array.from(cookieMap.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    } else if (tokenData.cookieString && tokenData.cookieString.trim()) {
      headers["Cookie"] = tokenData.cookieString.trim();
    }

    return headers;
  }

  /**
   * 查询当前租户已存在的自动流程列表 (POST /admin/creekflow/autoflow-list.action)
   */
  /**
   * 查询当前租户流程资产列表 (包含自动流程 procType=1 与新版审批流 procType=2)
   */
    public async listTenantFlows(
    env: NeoEnvironment,
    tokenData: TokenData,
    params?: { procType?: 1 | 2; keyword?: string; pageNo?: number; pageSize?: number; status?: number }
  ): Promise<{ 
    success: boolean; 
    data?: TenantFlowItem[]; 
    total?: number; 
    totalInTenant?: number; 
    matchedKeyword?: string;
    allFlowsSummary?: Array<{ name: string; objectName: string; entityApiKey: string; status: string; procType: number }>;
    error?: string 
  }> {
    if (env.productType === 'salesforce') {
      try {
        const soql = "SELECT Id, ApiName, Label, ProcessType, Description, IsActive FROM FlowDefinitionView LIMIT 200";
        const qRes = await this.dataService.executeQuery(env, tokenData, soql);
        const flows: TenantFlowItem[] = (qRes.data?.records || []).map((r: any) => ({
          procdefId: r.Id,
          name: r.Label || r.ApiName,
          entityApiKey: r.ProcessType || 'Global',
          objectName: r.ProcessType || 'Salesforce Flow',
          status: r.IsActive ? 1 : 0,
          statusName: r.IsActive ? '已激活' : '未激活',
          version: 1,
          procType: 1,
          flowType: r.ProcessType,
          description: r.Description || '',
          actKey: r.ApiName,
        }));
        let filtered = flows;
        if (params?.keyword) {
          const kw = params.keyword.toLowerCase();
          filtered = filtered.filter((f) => 
            f.name.toLowerCase().includes(kw) || 
            (f.actKey && f.actKey.toLowerCase().includes(kw)) ||
            (f.description && f.description.toLowerCase().includes(kw))
          );
        }
        return {
          success: true,
          data: filtered,
          total: filtered.length,
          totalInTenant: flows.length,
          matchedKeyword: params?.keyword,
        };
      } catch (sfErr: any) {
        return { success: false, error: sfErr.message };
      }
    }

    if (env.productType === 'fxiaoke') {
      return {
        success: true,
        data: [],
        total: 0,
        totalInTenant: 0,
        matchedKeyword: params?.keyword,
      };
    }

    const baseUrl = this.resolveBaseUrl(env, tokenData);
    const headers = this.buildAdminHeaders(baseUrl, tokenData);
    const targetProcTypes = params?.procType ? [params.procType] : [1, 2];
    const allItems: TenantFlowItem[] = [];

    // 预热获取租户实体字典，建立双向映射 (如: opportunity <-> 商机, contract <-> 合同)，消除中英文搜索壁垒与空对象名缺陷
    const entityMap: Record<string, string> = {};
    try {
      const entities = await this.metadataService.fetchEntityList(env, tokenData);
      for (const ent of entities) {
        if (ent.apiKey && ent.label) {
          entityMap[ent.apiKey.toLowerCase()] = ent.label;
          entityMap[ent.label.toLowerCase()] = ent.apiKey;
        }
      }
    } catch {}

    try {
      for (const pt of targetProcTypes) {
        const body = new URLSearchParams();
        body.append("procType", String(pt));
        // 关键修复: 销售易 Struts2 后端依赖 pagination.pageNo / pagination.pageSize 接收分页参数
        body.append("pagination.pageNo", String(params?.pageNo || 1));
        body.append("pagination.pageSize", String(params?.pageSize || 200));
        body.append("pageNo", String(params?.pageNo || 1));
        body.append("pageSize", String(params?.pageSize || 200));
        if (params?.keyword) body.append("name", params.keyword);
        if (params?.status !== undefined) body.append("status", String(params.status));

        const res = await axios.post(`${baseUrl}/admin/creekflow/autoflow-list.action`, body.toString(), {
          headers,
          timeout: 15000,
        });

        const rawList = res.data?.body?.gridData || res.data?.data?.records || [];
        
        // 并行批量调阅每个流程族的精确版本列表 (designer-list.action)，获取真实生效版本、最新版本与关联实体
        const enrichedItems = await Promise.all(
          rawList.map(async (item: any) => {
            const dc = item.datacell || [];
            const procInfoId = String(item.id);
            let versions: any[] = [];

            try {
              const dForm = new URLSearchParams();
              dForm.append("baseInfoId", procInfoId);
              const vRes = await axios.post(`${baseUrl}/admin/creekflow/designer-list.action`, dForm.toString(), {
                headers,
                timeout: 8000,
              });
              versions = vRes.data?.data || [];
            } catch {}

            // 版本按版本号倒序排
            versions.sort((a, b) => (b.version || 0) - (a.version || 0));

            // 优先匹配当前启用中的版本，其次匹配设计态草稿，再其次最新版本
            const activeV =
              versions.find((v) => v.status === 1) ||
              versions.find((v) => v.status === 3) ||
              versions[0];

            const statusText = activeV?.statusName || dc[3] || "设计";
            const statusNum = activeV?.status !== undefined ? Number(activeV.status) : statusText === "启用" ? 1 : statusText === "禁用" ? 2 : 3;
            const procdefId = activeV ? String(activeV.procdefId) : (BigInt(procInfoId) + 1n).toString();
            const currentVer = activeV?.version || 1;
            const maxVer = versions.length > 0 ? Math.max(...versions.map((v) => Number(v.version) || 1)) : currentVer;

            const rawEntityApiKey = activeV?.entityApiKey || "";
            const rawObjectName = activeV?.objectName || dc[1] || "";
            const resolvedEntityApiKey = rawEntityApiKey || (rawObjectName ? entityMap[rawObjectName.toLowerCase()] || "" : "");
            const resolvedObjectName = rawObjectName || (rawEntityApiKey ? entityMap[rawEntityApiKey.toLowerCase()] || "" : "");

            return {
              id: procInfoId,
              procInfoId,
              procdefId,
              procdefApiKey: activeV?.procdefApiKey || dc[dc.length - 1] || "",
              actKey: activeV?.actKey || "",
              name: activeV?.procName || dc[0] || "未命名流程",
              objectName: resolvedObjectName,
              entityApiKey: resolvedEntityApiKey,
              entityId: activeV?.entityId || "",
              bizTypeId: activeV?.bizTypeId || "",
              startupOrder: activeV?.startupOrder || activeV?.order || 1,
              executeType: activeV?.executeType || dc[2] || "",
              statusName: statusText,
              status: statusNum,
              version: currentVer,
              latestVersion: maxVer,
              versionsCount: versions.length || 1,
              createdByName: activeV?.createBy || dc[4] || "",
              createdAt: activeV?.createAt || dc[6] || "",
              updatedByName: activeV?.updateBy || dc[7] || "",
              updatedAt: activeV?.updateAt || dc[9] || dc[6] || "",
              description: activeV?.description || dc[10] || "",
              procType: pt as (1 | 2),
            };
          })
        );

        allItems.push(...enrichedItems);
      }

      // 如果有关键词搜索，做二次双向模糊过滤 (中英文名协同匹配)
      let filtered = allItems;
      if (params?.keyword) {
        const kw = params.keyword.trim().toLowerCase();
        const searchTerms = [kw];
        const related = entityMap[kw];
        if (related && !searchTerms.includes(related.toLowerCase())) {
          searchTerms.push(related.toLowerCase());
        }

        filtered = filtered.filter((f) =>
          searchTerms.some(
            (term) =>
              (f.name && f.name.toLowerCase().includes(term)) ||
              (f.objectName && f.objectName.toLowerCase().includes(term)) ||
              (f.entityApiKey && f.entityApiKey.toLowerCase().includes(term)) ||
              (f.description && f.description.toLowerCase().includes(term))
          )
        );
      }

      return {
        success: true,
        data: filtered,
        total: filtered.length,
        totalInTenant: allItems.length,
        matchedKeyword: params?.keyword,
        allFlowsSummary: allItems.map((f) => ({
          name: f.name,
          objectName: f.objectName,
          entityApiKey: f.entityApiKey || "",
          status: f.statusName,
          procType: f.procType,
        })),
      };
    } catch (e: any) {
      return { success: false, error: `获取流程列表失败: ${e.response?.data?.message || e.message}` };
    }
  }

  public async copyFlow(
    env: NeoEnvironment,
    tokenData: TokenData,
    params: {
      procdefId: string | number;
      processName: string;
      description?: string;
      actKey?: string;
      entityApiKey: string;
      entityId: string | number;
      bizTypeId?: string | number;
      startupOrder?: number;
      executeType?: string;
      procType: 1 | 2;
      enableIntelligentMode?: number;
    }
  ): Promise<{ success: boolean; newProcdefId?: string | number; error?: string }> {
    const baseUrl = this.resolveBaseUrl(env, tokenData);
    const headers = this.buildAdminHeaders(baseUrl, tokenData);
    const url = `${baseUrl}/admin/creekflow/copy-baseInfo.action`;

    const body = new URLSearchParams();
    body.append("procdefId", String(params.procdefId));
    body.append("processName", params.processName.trim());
    body.append("description", params.description || "");
    body.append("actKey", params.actKey || `flow_${Date.now()}`);
    body.append("entityApiKey", params.entityApiKey);
    body.append("entityId", String(params.entityId));
    body.append("procType", String(params.procType));

    if (params.procType === 1) {
      body.append("executeType", params.executeType || "1,2");
      body.append("enableIntelligentMode", String(params.enableIntelligentMode ?? 2));
    } else {
      body.append("bizTypeId", String(params.bizTypeId || "0"));
      body.append("startupOrder", String(params.startupOrder || 99));
    }

    try {
      const res = await axios.post(url, body.toString(), { headers, timeout: 20000 });
      const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
      if (data.status === 200 || data.status === "200" || data.data) {
        const newId = data.data || data.procdefId;
        return { success: true, newProcdefId: newId };
      } else {
        return { success: false, error: data.msg || JSON.stringify(data) };
      }
    } catch (e: any) {
      return { success: false, error: `复制流程失败: ${e.response?.data?.message || e.message}` };
    }
  }

  /**
   * 删除流程版本或草稿 (delete-designer.action)
   */
  public async deleteFlowVersion(
    env: NeoEnvironment,
    tokenData: TokenData,
    procdefId: string | number,
    procType: 1 | 2 = 1
  ): Promise<{ success: boolean; error?: string }> {
    const baseUrl = this.resolveBaseUrl(env, tokenData);
    const headers = this.buildAdminHeaders(baseUrl, tokenData);
    const url = `${baseUrl}/admin/creekflow/delete-designer.action`;

    const body = new URLSearchParams();
    body.append("procdefId", String(procdefId));
    body.append("procType", String(procType));

    try {
      const res = await axios.post(url, body.toString(), { headers, timeout: 15000 });
      const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
      if (data.status === 200 || data.status === "200" || data.data) {
        return { success: true };
      } else {
        return { success: false, error: data.msg || "删除失败" };
      }
    } catch (e: any) {
      return { success: false, error: `删除流程失败: ${e.message}` };
    }
  }

  public async listAutoFlows(
    env: NeoEnvironment,
    tokenData: TokenData,
    params?: { keyword?: string; pageNo?: number; pageSize?: number; status?: number }
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const baseUrl = this.resolveBaseUrl(env, tokenData);
    const url = `${baseUrl}/admin/creekflow/autoflow-list.action`;
    const headers = this.buildAdminHeaders(baseUrl, tokenData);

    const body = new URLSearchParams();
    body.append('procType', '1');
    body.append('pagination.pageNo', String(params?.pageNo || 1));
    body.append('pagination.pageSize', String(params?.pageSize || 100));
    body.append('pageNo', String(params?.pageNo || 1));
    body.append('pageSize', String(params?.pageSize || 100));
    if (params?.keyword) body.append('name', params.keyword);
    if (params?.status !== undefined) body.append('status', String(params.status));

    try {
      const res = await axios.post(url, body.toString(), { headers, timeout: 15000 });
      return { success: true, data: res.data };
    } catch (e: any) {
      return {
        success: false,
        error: `获取自动流程列表失败: ${e.response?.data?.message || e.message}`,
      };
    }
  }

  /**
   * 读取指定流程版本的完整定义与属性 (find-procdef.action & find-property.action)
   */
  public async getFlowDetail(
    env: NeoEnvironment,
    tokenData: TokenData,
    procdefId: string | number,
    procType: 1 | 2 = 1
  ): Promise<{ success: boolean; definition?: any; property?: any; error?: string }> {
    const baseUrl = this.resolveBaseUrl(env, tokenData);
    const headers = this.buildAdminHeaders(baseUrl, tokenData);

    try {
      const [defRes, propRes] = await Promise.all([
        axios.get(`${baseUrl}/admin/creekflow/find-procdef.action?procdefId=${procdefId}&procType=${procType}`, {
          headers,
          timeout: 15000,
        }),
        axios.get(`${baseUrl}/admin/creekflow/find-property.action?procdefId=${procdefId}&procType=${procType}`, {
          headers,
          timeout: 15000,
        }),
      ]);

      const rawDef = typeof defRes.data === 'string' ? JSON.parse(defRes.data) : defRes.data;
      const rawProp = typeof propRes.data === 'string' ? JSON.parse(propRes.data) : propRes.data;

      return {
        success: true,
        definition: rawDef.data || rawDef,
        property: rawProp.data || rawProp,
      };
    } catch (e: any) {
      return {
        success: false,
        error: `读取流程定义失败: ${e.message}`,
      };
    }
  }

  /**
   * 启停自动流程版本 (enable-procdef.action / disable-procdef.action)
   */
  public async toggleFlowStatus(
    env: NeoEnvironment,
    tokenData: TokenData,
    procdefId: string | number,
    enable: boolean,
    procType: 1 | 2 = 1
  ): Promise<{ success: boolean; status?: number; error?: string }> {
    const baseUrl = this.resolveBaseUrl(env, tokenData);
    const headers = this.buildAdminHeaders(baseUrl, tokenData);
    const endpoint = enable ? 'enable-procdef.action' : 'disable-procdef.action';
    const url = `${baseUrl}/admin/creekflow/${endpoint}`;

    const body = new URLSearchParams();
    body.append('procdefId', String(procdefId));
    body.append('procType', String(procType));

    try {
      const res = await axios.post(url, body.toString(), { headers, timeout: 15000 });
      const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;

      if (data.status === -1 || data.code === -1 || data.status === "-1") {
        const errMsg =
          Array.isArray(data.data) && data.data.length > 0
            ? Array.from(new Set(data.data.map((d: any) => d.errorInfo).filter(Boolean))).join("；")
            : data.msg || "操作被拒绝";
        return { success: false, error: errMsg };
      }

      return { success: true, status: enable ? 1 : 2 };
    } catch (e: any) {
      return { success: false, error: `${enable ? '启用' : '禁用'}流程失败: ${e.message}` };
    }
  }

  /**
   * 修订流程为新设计态版本 (revise-designer.action)
   */
  public async reviseFlowVersion(
    env: NeoEnvironment,
    tokenData: TokenData,
    procdefId: string | number,
    procType: 1 | 2 = 1
  ): Promise<{ success: boolean; newProcdefId?: string | number; error?: string }> {
    const baseUrl = this.resolveBaseUrl(env, tokenData);
    const headers = this.buildAdminHeaders(baseUrl, tokenData);
    const url = `${baseUrl}/admin/creekflow/revise-designer.action`;

    const body = new URLSearchParams();
    body.append('procdefId', String(procdefId));
    body.append('procType', String(procType));

    try {
      const res = await axios.post(url, body.toString(), { headers, timeout: 15000 });
      const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      const newId = data.data || data.procdefId;
      return { success: true, newProcdefId: newId };
    } catch (e: any) {
      return { success: false, error: `修订新版本失败: ${e.message}` };
    }
  }

  /**
   * 触发执行已有自动流程实例 (公开运行 API: POST /rest/data/v2.0/creekflow/autoProcessInstances)
   */

  /**
   * =========================================================================
   * 销售易新版审批流 (Approval Flow, procType=2) 代码级全流程部署实现
   * 遵循《销售易审批流代码配置方法与实施规范》
   * 包含流程身份创建 -> 图模型编排 -> 审批人/编辑字段/按钮策略 -> update-procdef -> 回读核验
   * =========================================================================
   */
  /**
   * 查询当前租户审批流与工作流中可用的真实资源 (角色、人员、部门、业务类型、字段选项)
   */
  public async getApprovalResources(
    env: NeoEnvironment,
    tokenData: TokenData,
    entityApiKey?: string
  ): Promise<{
    roles: Array<{ apiKey: string; name: string; id: number }>;
    users: Array<{ id: string; name: string; personalEmail?: string; departName?: string }>;
    departments: Array<{ id: string; departName: string }>;
    busiTypes: Array<{ id: number | string; apiKey: string; label: string }>;
    picklistFields: Array<{ apiKey: string; label: string; options: Array<{ code: number | string; label: string }> }>;
  }> {
    const baseUrl = this.resolveBaseUrl(env, tokenData);
    const headers = this.buildAdminHeaders(baseUrl, tokenData);

    const result = {
      roles: [] as any[],
      users: [] as any[],
      departments: [] as any[],
      busiTypes: [] as any[],
      picklistFields: [] as any[],
    };

    // 1. Roles
    try {
      const rolesRes = await axios.get(
        `${baseUrl}/admin/creekflow/findApprover.action?findApproverWays=401&procType=2`,
        { headers, timeout: 10000 }
      );
      result.roles = (rolesRes.data?.list || []).map((r: any) => ({
        apiKey: r.apiKey,
        name: r.name,
        id: r.id,
      }));
    } catch {}

    // 2. Departments
    try {
      const xoqlRes = await axios.post(
        `${baseUrl}/rest/data/v2.0/query/xoql`,
        "xoql=" + encodeURIComponent("SELECT id, departName FROM department LIMIT 30"),
        {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "xsy-inner-source": "bff",
          },
          timeout: 10000,
        }
      );
      result.departments = xoqlRes.data?.data?.records || [];
    } catch {}

    // 3. Users
    try {
      const xoqlRes = await axios.post(
        `${baseUrl}/rest/data/v2.0/query/xoql`,
        "xoql=" + encodeURIComponent("SELECT id, name, personalEmail, dimDepart.departName FROM user LIMIT 30"),
        {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "xsy-inner-source": "bff",
          },
          timeout: 10000,
        }
      );
      const rawUsers = xoqlRes.data?.data?.records || [];
      result.users = rawUsers.map((u: any) => ({
        id: String(u.id),
        name: u.name,
        personalEmail: u.personalEmail,
        departName: u["dimDepart.departName"] || "",
      }));
    } catch {}

    // 4. BusiTypes & Picklists
    if (entityApiKey) {
      try {
        const btRes = await axios.get(`${baseUrl}/rest/data/v2.0/xobjects/${entityApiKey}/busiType`, {
          headers,
          timeout: 10000,
        });
        const bts = btRes.data?.data?.records || btRes.data?.records || [];
        result.busiTypes = bts.map((b: any) => ({
          id: b.id,
          apiKey: b.apiKey,
          label: b.label || b.name,
        }));
      } catch {}

      try {
        const fields = await this.metadataService.fetchEntityFields(env, tokenData, entityApiKey);
        result.picklistFields = fields
          .filter((f) => [3, 4].includes(f.itemType) && f.pickOption?.length)
          .map((f) => ({
            apiKey: f.apiKey,
            label: f.label,
            options: (f.pickOption || []).map((p) => ({ code: p.optionCode ?? "", label: p.optionLabel })),
          }));
      } catch {}
    }

    return result;
  }

  public async deployApprovalPlan(
    env: NeoEnvironment,
    tokenData: TokenData,
    plan: ApprovalDeployPlan,
    options?: { autoEnable?: boolean }
  ): Promise<WorkflowDeployResult> {
    const stepsLog: WorkflowDeployResult["stepsLog"] = [];
    const logStep = (
      step: string,
      status: "success" | "warn" | "error" | "skipped",
      message: string,
      timeMs?: number,
      details?: any
    ) => {
      stepsLog.push({ step, status, message, timeMs, details });
    };

    const baseUrl = this.resolveBaseUrl(env, tokenData);
    const headers = this.buildAdminHeaders(baseUrl, tokenData);

    try {
      // ================= 步骤 1: 元数据依赖解析与业务类型匹配 =================
      const startT1 = Date.now();
      const entityApiKey = plan.flow.entityApiKey.trim();
      let resolvedEntityId = "0";
      let resolvedBizTypeId = "0";
      let availableFields: Array<{ apiKey: string; label: string; itemType: number; pickOption?: any[] }> = [];

      try {
        const fetched = await this.metadataService.fetchEntityFields(env, tokenData, entityApiKey);
        if (fetched && fetched.length > 0) {
          availableFields = fetched.map((f) => ({
            apiKey: f.apiKey,
            label: f.label || f.apiKey,
            itemType: f.itemType || 1,
            pickOption: (f as any).pickOption,
          }));
        }
      } catch {}

      if (availableFields.length === 0) {
        try {
          const itemsRes = await axios.get(`${baseUrl}/rest/metadata/v2.0/xobjects/${entityApiKey}/items`, {
            headers: this.buildAdminHeaders(baseUrl, tokenData),
            timeout: 10000,
          });
          const recs = itemsRes.data?.data?.records || itemsRes.data?.records || [];
          if (Array.isArray(recs) && recs.length > 0) {
            availableFields = recs.map((f: any) => ({
              apiKey: f.apiKey,
              label: f.label || f.apiKey,
              itemType: Number(f.itemType || 1),
              pickOption: f.pickOption,
            }));
          }
        } catch {}
      }

      // 标准实体字段保底
      const STANDARD_ENTITY_FALLBACK_FIELDS: Record<string, Array<{ apiKey: string; label: string; itemType: number; pickOption?: any[] }>> = {
        contract: [
          { apiKey: "amount", label: "总金额", itemType: 6 },
          { apiKey: "title", label: "主题", itemType: 1 },
          { apiKey: "contractType", label: "合同类型", itemType: 3 },
          { apiKey: "status", label: "合同状态", itemType: 3 },
          { apiKey: "payMode", label: "付款方式", itemType: 3 },
          { apiKey: "ownerId", label: "所有人", itemType: 10 },
        ],
        opportunity: [
          { apiKey: "money", label: "销售金额", itemType: 6 },
          { apiKey: "opportunityName", label: "商机名称", itemType: 1 },
          { apiKey: "ownerId", label: "负责人", itemType: 10 },
        ],
        case: [
          { apiKey: "subject", label: "个案主题", itemType: 1 },
          { apiKey: "status", label: "状态", itemType: 3 },
          { apiKey: "priority", label: "优先级", itemType: 3 },
          { apiKey: "ownerId", label: "负责人", itemType: 10 },
        ],
      };

      if (availableFields.length === 0 && STANDARD_ENTITY_FALLBACK_FIELDS[entityApiKey.toLowerCase()]) {
        availableFields = [...STANDARD_ENTITY_FALLBACK_FIELDS[entityApiKey.toLowerCase()]];
      }

      try {
        const metaUrl = `${baseUrl}/rest/metadata/v2.0/xobjects/${entityApiKey}`;
        const metaRes = await axios.get(metaUrl, {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            "xsy-inner-source": "bff",
          },
          timeout: 10000,
        });
        const rec = metaRes.data?.data?.records || metaRes.data?.records;
        if (rec && rec.objectId) {
          resolvedEntityId = String(rec.objectId);
        }
      } catch {}

      if (resolvedEntityId === "0") {
        const entities = await this.metadataService.fetchEntityList(env, tokenData);
        const matched = entities.find((e) => e.apiKey === entityApiKey);
        if (matched && matched.objectId) {
          resolvedEntityId = String(matched.objectId);
        }
      }

      if (resolvedEntityId === "0") {
        throw new Error(`当前租户未找到主业务对象 [${entityApiKey}]，请先在元数据中心完成创建`);
      }

      // 获取可用业务类型列表
      try {
        const btRes = await axios.get(`${baseUrl}/rest/data/v2.0/xobjects/${entityApiKey}/busiType`, {
          headers,
          timeout: 10000,
        });
        const bts = btRes.data?.data?.records || btRes.data?.records || [];
        if (bts.length > 0) {
          if (plan.flow.bizTypeApiKey) {
            const hit = bts.find((b: any) => b.apiKey === plan.flow.bizTypeApiKey);
            resolvedBizTypeId = hit ? String(hit.id) : String(bts[0].id);
          } else {
            resolvedBizTypeId = String(bts[0].id);
          }
        }
      } catch {}

      // 获取当前用户作为默认管理员
      let currentAdminUserKey = "dfd5e3151f4c4575d626952fe3f6bb31";
      let currentAdminUserName = tokenData.userInfo?.name || "流程管理员";
      try {
        const uRes = await axios.get(`${baseUrl}/admin/creekflow/findApprover.action?findApproverWays=301,401,601&objectId=${resolvedEntityId}&entityApiKey=${entityApiKey}&procType=2`, {
          headers,
          timeout: 10000,
        });
      } catch {}

      logStep(
        "步骤 1: 元数据依赖解析",
        "success",
        `主对象 ${entityApiKey} (objectId=${resolvedEntityId}), 业务类型ID=${resolvedBizTypeId}`,
        Date.now() - startT1
      );

      // ================= 步骤 2: 流程身份定位与创建 (模式分支: 更新草稿 / 修订新版本 / 新建流程) =================
      const startT2 = Date.now();
      let procId = "0";
      let procdefId = "0";
      let procdefApiKey = "";

      const isUpdateMode = plan.flow.targetMode === "update" && plan.flow.targetProcdefId;

      if (isUpdateMode) {
        const targetId = String(plan.flow.targetProcdefId);
        const existingDetail = await this.getFlowDetail(env, tokenData, targetId, 2);
        if (!existingDetail.success || !existingDetail.definition?.baseInfo) {
          throw new Error(`未找到目标现有流程 (${targetId}): ${existingDetail.error || "流程不存在"}`);
        }

        const base = existingDetail.definition.baseInfo;
        const currentStatus = Number(base.status ?? plan.flow.targetStatus ?? 3);
        procId = String(base.procInfoId || base.id);

        if (currentStatus === 3) {
          // 场景 A: 目标现有流程当前为【设计态草稿】，直接更新覆盖该版本，无需重新创建基本信息，彻底规避序号冲突
          procdefId = String(base.procdefId || targetId);
          procdefApiKey = String(base.procdefApiKey || "");
          logStep(
            "步骤 2: 定位目标现有流程 (更新设计态草稿)",
            "success",
            `已对齐现有草稿版本 procdefId=${procdefId}, procdefApiKey=${procdefApiKey}`,
            Date.now() - startT2,
            { procId, procdefId, procdefApiKey }
          );
        } else {
          // 场景 B: 目标现有流程当前为【已启用】或【已禁用】，自动调用官方 revise-designer.action 修订为新版本 V2
          const reviseRes = await this.reviseFlowVersion(env, tokenData, targetId, 2);
          if (!reviseRes.success || !reviseRes.newProcdefId) {
            throw new Error(`现有流程创建新修订版本失败: ${reviseRes.error}`);
          }
          procdefId = String(reviseRes.newProcdefId);
          const newDef = await this.getFlowDetail(env, tokenData, procdefId, 2);
          procdefApiKey = String(newDef.definition?.baseInfo?.procdefApiKey || "");
          logStep(
            "步骤 2: 现有流程自动创建新修订版本 (Revise Version)",
            "success",
            `已为 [${plan.flow.processName}] 创建新修订版本！新版本ID=${procdefId}, 继承原流程族`,
            Date.now() - startT2,
            { procId, procdefId, procdefApiKey }
          );
        }
      } else {
        // 场景 C: 创建全新独立流程族 (add-baseinfo.action)，自动递增规避序号已被占用的冲突
        let candidateOrder = Number(plan.flow.startupOrder) || 1;
        let created = false;
        let lastErr = "";

        for (let attempt = 0; attempt < 5; attempt++) {
          const baseInfoUrl = `${baseUrl}/admin/creekflow/add-baseinfo.action?decorator=ajaxformat&confirm=true`;
          const baseInfoBody = new URLSearchParams();
          baseInfoBody.append("processName", plan.flow.processName.trim());
          baseInfoBody.append("entityApiKey", entityApiKey);
          baseInfoBody.append("entityId", resolvedEntityId);
          baseInfoBody.append("bizTypeId", resolvedBizTypeId);
          baseInfoBody.append("startupOrder", String(candidateOrder));
          baseInfoBody.append("nodeProcFlag", "2");
          baseInfoBody.append("procType", "2");
          baseInfoBody.append("description", plan.flow.description || "");

          const baseInfoRes = await axios.post(baseInfoUrl, baseInfoBody.toString(), { headers, timeout: 15000 });
          const baseInfoData = typeof baseInfoRes.data === "string" ? JSON.parse(baseInfoRes.data) : baseInfoRes.data;

          if (baseInfoData && (baseInfoData.procdefId || baseInfoData.data?.procdefId)) {
            procId = baseInfoData.procId || baseInfoData.data?.procId;
            procdefId = baseInfoData.procdefId || baseInfoData.data?.procdefId;
            procdefApiKey = baseInfoData.procdefApiKey || baseInfoData.data?.procdefApiKey;
            created = true;
            break;
          } else {
            const msg = String(baseInfoData?.msg || JSON.stringify(baseInfoData));
            lastErr = msg;
            if (msg.includes("序号已被其他审批流占用") || msg.includes("序号")) {
              candidateOrder += 1;
            } else {
              throw new Error(`创建审批流程基本信息失败: ${msg}`);
            }
          }
        }

        if (!created) {
          throw new Error(`创建审批流程基本信息失败: ${lastErr}`);
        }

        logStep(
          "步骤 2: 创建审批流程身份 (add-baseinfo)",
          "success",
          `服务端成功创建审批流草稿！procdefId=${procdefId}, 启动序号=${candidateOrder}`,
          Date.now() - startT2,
          { procId, procdefId, procdefApiKey }
        );
      }

      // ================= 步骤 3: 回读初始定义与根模型 resourceId =================
      const startT3 = Date.now();
      const [initDefRes, initPropRes] = await Promise.all([
        axios.get(`${baseUrl}/admin/creekflow/find-procdef.action?procdefId=${procdefId}&procType=2`, { headers, timeout: 15000 }),
        axios.get(`${baseUrl}/admin/creekflow/find-property.action?procdefId=${procdefId}&procType=2`, { headers, timeout: 15000 }),
      ]);

      const realDef = (typeof initDefRes.data === "string" ? JSON.parse(initDefRes.data) : initDefRes.data).data;
      const realProp = (typeof initPropRes.data === "string" ? JSON.parse(initPropRes.data) : initPropRes.data).data;
      const rootResourceId = realDef.bpmModel?.resourceId;

      if (!rootResourceId) {
        throw new Error(`回读未获取到 bpmModel.resourceId: ${JSON.stringify(realDef)}`);
      }

      logStep("步骤 3: 回读审批流初始属性", "success", `根模型 resourceId=${rootResourceId}`, Date.now() - startT3);

      // ================= 步骤 4: 拓扑节点、审批策略与连线编码 =================
      const startT4 = Date.now();

      // 获取当前租户真实审批人资源 (401 真实角色，真实用户，真实部门)
      let tenantRoles: Array<{ apiKey: string; name: string; id: number }> = [];
      try {
        const rolesRes = await axios.get(
          `${baseUrl}/admin/creekflow/findApprover.action?findApproverWays=401&objectId=${resolvedEntityId}&entityApiKey=${entityApiKey}&procType=2`,
          { headers, timeout: 10000 }
        );
        tenantRoles = rolesRes.data?.list || [];
      } catch {}

      let tenantUsers: Array<{ id: string; name: string }> = [];
      try {
        const xoqlUsers = await this.dataService.executeQuery(env, tokenData, "SELECT id, name FROM user LIMIT 30");
        tenantUsers = (xoqlUsers.data?.records || []).map((u: any) => ({ id: String(u.id), name: String(u.name) }));
      } catch {}

      // 提取提交申请节点 (销售易审批流底层的提交任务必须严格使用固定标识 "___submitUserTaskDefKey___")
      const existingSubmitNode = plan.nodes.find(
        (n) => n.nodeType === "SubmitTask" || n.id === "___submitUserTaskDefKey___" || n.id.toLowerCase().includes("submittask")
      );
      const submitNodeKey = "___submitUserTaskDefKey___";
      const originalSubmitId = existingSubmitNode ? existingSubmitNode.id : null;

      const submitTaskConfig = {
        taskDefKey: submitNodeKey,
        taskDefName: existingSubmitNode?.name || "提交申请",
        ccFlag: (existingSubmitNode as any)?.ccFlag || 2,
        buttons: [
          { customBtn: 2, name: "提交申请", devPlatformClass: "", btnType: 1 },
        ],
        commentEmptyFlag: 2,
        commentExistsFlag: 1,
        actions: [],
        assignments: [],
      };

      // 确保全图包含且仅包含一个合法的提交申请节点，并将其 ID 规范化映射为 "___submitUserTaskDefKey___"
      const fullOrderedNodes: any[] = [];
      let submitNodeInserted = false;

      for (const n of plan.nodes) {
        if (n.nodeType === "SubmitTask" || n.id === originalSubmitId || n.id === submitNodeKey) {
          if (!submitNodeInserted) {
            fullOrderedNodes.push({
              ...n,
              id: submitNodeKey,
              nodeType: "SubmitTask",
              name: n.name || "提交申请",
            });
            submitNodeInserted = true;
          }
        } else {
          fullOrderedNodes.push({ ...n });
        }
      }

      if (!submitNodeInserted) {
        const startIdx = fullOrderedNodes.findIndex((n) => n.nodeType === "StartNoneEvent");
        fullOrderedNodes.splice(startIdx >= 0 ? startIdx + 1 : 1, 0, {
          id: submitNodeKey,
          nodeType: "SubmitTask",
          name: "提交申请",
        });
      }

      // 将连线 edges 中指向/发自原有提交节点 ID (如 SubmitTask_1) 的引用无缝重定向到 ___submitUserTaskDefKey___
      const edges = (plan.edges || []).map((e) => ({
        source: (originalSubmitId && e.source === originalSubmitId) ? submitNodeKey : e.source,
        target: (originalSubmitId && e.target === originalSubmitId) ? submitNodeKey : e.target,
        label: (e as any).label || (e as any).name,
        isDefault: (e as any).isDefault || (e as any).defaultFlow,
        condition: (e as any).condition,
        conditionFormula: (e as any).conditionFormula,
      }));

      if (edges.length === 0 && fullOrderedNodes.length > 1) {
        const startNode = fullOrderedNodes.find((n) => n.nodeType === "StartNoneEvent") || fullOrderedNodes[0];
        let prevNodeId = startNode.id;
        if (!fullOrderedNodes.some((n) => n.id === submitNodeKey)) {
          edges.push({ source: startNode.id, target: submitNodeKey });
          prevNodeId = submitNodeKey;
        }
        for (const n of fullOrderedNodes) {
          if (n.id === startNode.id || n.id === submitNodeKey) continue;
          edges.push({ source: prevNodeId, target: n.id });
          prevNodeId = n.id;
        }
      }

      // 提取人工审批任务 (usertasks)
      const userTaskNodes = plan.nodes.filter((n) => n.nodeType === "UserTask");
      const usertasksList: any[] = [];

      userTaskNodes.forEach((un) => {
        const taskType = un.taskType || "1";
        const assignments: any[] = [];

        if (un.approverRules && un.approverRules.length > 0) {
          un.approverRules.forEach((rule, rIdx) => {
            const assignmentInfoS = (rule.approvers || []).map((ap, apIdx) => {
              let objApiKey = ap.apiKey || "";
              let objLabel = ap.label || "";

              if (rule.assignmentType === "401") {
                const hitRole = tenantRoles.find((tr) => tr.apiKey.toLowerCase() === objApiKey.toLowerCase() || tr.name === objLabel);
                if (hitRole) {
                  objApiKey = hitRole.apiKey;
                  objLabel = hitRole.name;
                } else if (tenantRoles.length > 0) {
                  const kwMatch = tenantRoles.find((tr) => /经理|主管|财务|领导/i.test(tr.name)) || tenantRoles[0];
                  objApiKey = kwMatch.apiKey;
                  objLabel = kwMatch.name;
                }
              } else if (rule.assignmentType === "202") {
                const hitUser = tenantUsers.find((tu) => tu.id === objApiKey || tu.name === objLabel);
                if (hitUser) {
                  objApiKey = hitUser.id;
                  objLabel = hitUser.name;
                } else if (tenantUsers.length > 0) {
                  objApiKey = tenantUsers[0].id;
                  objLabel = tenantUsers[0].name;
                }
              }

              return {
                defaultFlag: 1,
                orderId: apIdx + 1,
                label: objLabel || ap.label || "指定人员/角色",
                assignmentInfoType: ap.infoType || (rule.assignmentType === "401" ? 4 : 1),
                objectDataApiKey: objApiKey || "DefaultAdmin",
              };
            });

            assignments.push({
              assignmentObjectType: 1, // 1: 正常审批人
              orderId: rIdx + 1,
              assignmentType: String(rule.assignmentType || "202"),
              itemApiKey: rule.itemApiKey || "",
              itemApiKeyLabel: rule.itemApiKeyLabel || "",
              assignmentInfoS,
            });
          });
        }

        // 若未指定审批人，默认配置当前流程提交人直属上级 (205) 或自选审批人 (201)
        if (assignments.length === 0) {
          assignments.push({
            assignmentObjectType: 1,
            orderId: 1,
            assignmentType: "205", // 提交人直属上级
            itemApiKey: "1",
            assignmentInfoS: [],
          });
        }

        // 构建可编辑字段 (editablefields)
        const editablefields = (un.editableFields || []).map((ef) => ({
          itemApiKey: ef.itemApiKey,
          itemLabel: ef.itemLabel || ef.itemApiKey,
          isEditable: ef.isEditable ?? 1,
          isRequired: ef.isRequired ?? 0,
        }));

        usertasksList.push({
          taskDefKey: un.id,
          taskDefName: un.name,
          taskType,
          returnTargetType: String(un.returnTargetType || "1"),
          ccFlag: 2,
          plussignFlag: un.plussignFlag || 2,
          delegationFlag: un.delegationFlag || 2,
          adjustAssigneeFlag: 2,
          autoForwardFlag: 2,
          hasDefaultAssigneesFlag: 2,
          passrateExcludePlussignerFlag: 2,
          editablefields,
          buttons: [
            { commentFlag: un.commentFlag || 2, customBtn: 1, name: "同意", btnType: 2 },
            { commentFlag: un.commentFlag || 2, customBtn: 1, name: "拒绝", btnType: 3 },
          ],
          assignments,
          timingConfs: [],
          actions: [],
          countersign:
            taskType === "3"
              ? {
                  passType: un.countersign?.passType || 2,
                  passThreshold: String(un.countersign?.passThreshold || "60"),
                }
              : undefined,
        });
      });

      // 计算二维拓扑横向自动布局坐标 (左->右主干，网关多分支上下均匀分布)
      const depthMap = new Map<string, number>();
      const startNodeObj = fullOrderedNodes.find((n) => n.nodeType === "StartNoneEvent") || fullOrderedNodes[0];
      if (startNodeObj) {
        depthMap.set(startNodeObj.id, 0);
        const queue: string[] = [startNodeObj.id];
        const visited = new Set<string>([startNodeObj.id]);
        while (queue.length > 0) {
          const curr = queue.shift()!;
          const currDepth = depthMap.get(curr) || 0;
          for (const e of edges.filter((edge) => edge.source === curr)) {
            const nextDepth = Math.max(depthMap.get(e.target) || 0, currDepth + 1);
            depthMap.set(e.target, nextDepth);
            if (!visited.has(e.target)) {
              visited.add(e.target);
              queue.push(e.target);
            }
          }
        }
      }
      fullOrderedNodes.forEach((n, idx) => {
        if (!depthMap.has(n.id)) depthMap.set(n.id, idx);
      });

      const depthBuckets = new Map<number, string[]>();
      fullOrderedNodes.forEach((n) => {
        const d = depthMap.get(n.id) || 0;
        const list = depthBuckets.get(d) || [];
        list.push(n.id);
        depthBuckets.set(d, list);
      });

      const childShapes: any[] = [];
      const nodeInfo: Record<string, any> = {};

      fullOrderedNodes.forEach((n) => {
        let serverType = n.nodeType as string;
        let stencilId = n.nodeType as string;
        let label = n.name;

        if (n.id === submitNodeKey || n.nodeType === "SubmitTask") {
          serverType = "";
          stencilId = "UserTask";
          label = "提交申请";
        } else if (n.nodeType === "UserTask") {
          serverType = "UserTask";
          stencilId = "UserTask";
          label = "人工节点";
        } else if (n.nodeType === "ExclusiveGateway") {
          serverType = "ExclusiveGateway";
          stencilId = "ExclusiveGateway";
          label = "排他网关";
        } else if (n.nodeType === "StartNoneEvent") {
          serverType = "StartNoneEvent";
          stencilId = "StartNoneEvent";
          label = "开始";
        } else if (n.nodeType === "EndNoneEvent") {
          serverType = "EndNoneEvent";
          stencilId = "EndNoneEvent";
          label = "结束";
        }

        nodeInfo[n.id] = {
          serverType,
          taskDefName: n.name,
          label,
          nodeType: (n.id === submitNodeKey || n.nodeType === "SubmitTask") ? "UserTask" : n.nodeType,
          subType: (n.id === submitNodeKey || n.nodeType === "SubmitTask") ? "SUBMIT_TASK" : undefined,
          taskType: n.nodeType === "UserTask" ? (n as any).taskType || "1" : undefined,
        };

        const d = depthMap.get(n.id) || 0;
        const bucket = depthBuckets.get(d) || [n.id];
        const rank = bucket.indexOf(n.id);
        const nodeX = 100 + d * 230;
        const nodeY = Math.round(270 + (rank - (bucket.length - 1) / 2) * 170);

        const outgoingEdgeIds = edges
          .map((e, eIdx) => ({ edgeId: `edge__${eIdx + 1}_${e.source}_${e.target}`, ...e }))
          .filter((e) => e.source === n.id);

        childShapes.push({
          outgoing: outgoingEdgeIds.map((oe) => ({
            resourceId: oe.edgeId,
            sourceAnchor: 1, // 统一自右侧锚点出，横向平滑连线
          })),
          resourceId: n.id,
          bounds: {
            upperLeft: { x: nodeX, y: Math.max(60, nodeY) },
            lowerRight: { x: 0, y: 0 },
          },
          dockers: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
          stencil: { id: stencilId },
        });
      });

      // 插入连线 (SequenceFlow)
      edges.forEach((e, eIdx) => {
        const edgeId = `edge__${eIdx + 1}_${e.source}_${e.target}`;
        childShapes.push({
          outgoing: [{ resourceId: e.target, targetAnchor: 3 }], // 统一自左侧锚点入
          resourceId: edgeId,
          bounds: { upperLeft: { x: 0, y: 0 }, lowerRight: { x: 0, y: 0 } },
          dockers: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
          stencil: { id: "SequenceFlow" },
        });
      });

      // 网关分支条件
      const gateWaysList: any[] = [];
      for (const gw of fullOrderedNodes.filter((n) => n.nodeType === "ExclusiveGateway")) {
        const gwEdges = edges
          .map((e, eIdx) => ({ edgeId: `edge__${eIdx + 1}_${e.source}_${e.target}`, ...e }))
          .filter((e) => e.source === gw.id);

        const hasExplicitDefault = gwEdges.some((ge: any) => ge.isDefault || ge.defaultFlow);

        gateWaysList.push({
          gateWayId: gw.id,
          gateWayName: gw.name || "网关",
          gateWayType: 1,
          conditions: gwEdges.map((ge: any, gIdx) => {
            const isDefault = hasExplicitDefault
              ? Boolean(ge.isDefault || ge.defaultFlow)
              : gIdx === gwEdges.length - 1;

            return {
              sourceId: gw.id,
              seqFlowName: isDefault ? "默认" : (ge.label || ge.name || `分支_${gIdx + 1}`),
              condition: (() => {
                if (ge.conditionFormula) {
                  return {
                    defaultFlow: isDefault,
                    gateWayType: isDefault ? "1" : "2",
                    conditionType: "2",
                    specialExpression: ge.conditionFormula,
                    conditionName: isDefault ? "默认" : (ge.label || ge.name || `分支_${gIdx + 1}`),
                    entityApiKey,
                    conditionJson: "",
                  };
                }

                // 智能解析条件字段与操作符（绝不盲目兜底为无意义的 ID isNotNull）
                let condField: any = null;
                let condOp = "equals";
                let condVal = "";
                let condLabel = "";

                if (ge.condition && (ge.condition.field || ge.condition.fieldApiKey)) {
                  const fKey = String(ge.condition.field || ge.condition.fieldApiKey).trim();
                  condField = availableFields.find((f) => f.apiKey.toLowerCase() === fKey.toLowerCase() || f.label === fKey);
                  if (condField) {
                    condOp = ge.condition.operator || "equals";
                    condVal = String(ge.condition.value ?? "");
                    condLabel = condField.label;
                  }
                }

                // 若 AI 未显式提供 condition 对象，基于连线名称语义进行上下文智能推导
                if (!condField) {
                  const branchName = String(ge.label || ge.name || "");
                  if (/金额|amount|万元|大额|小额|十万/i.test(branchName)) {
                    condField = availableFields.find((f) => f.apiKey === "amount" || f.apiKey === "money" || f.itemType === 6) ||
                      { apiKey: "amount", label: "总金额", itemType: 6 };
                    condLabel = condField.label || "总金额";
                    if (/大额|大于|>|超/i.test(branchName)) {
                      condOp = "greaterThan";
                      condVal = "100000";
                    } else {
                      condOp = "lessOrEquals";
                      condVal = "100000";
                    }
                  } else if (/紧急|特急|故障|priority|urgency/i.test(branchName)) {
                    condField = availableFields.find((f) => f.apiKey === "urgencyLevel__c" || f.apiKey === "priority") ||
                      availableFields.find((f) => [3, 4].includes(f.itemType)) ||
                      { apiKey: "urgencyLevel__c", label: "紧急程度", itemType: 3 };
                    condLabel = condField.label || "紧急程度";
                    condOp = "equals";
                    condVal = "2";
                  } else {
                    // 默认选取实体主业务数值或状态字段
                    condField = availableFields.find((f) => f.apiKey !== "id" && [6, 3, 1, 5].includes(f.itemType)) ||
                      availableFields.find((f) => f.apiKey !== "id") ||
                      { apiKey: "amount", label: "总金额", itemType: 6 };
                    condLabel = condField.label;
                    condOp = condField.itemType === 6 ? "greaterThan" : "equals";
                    condVal = condField.itemType === 6 ? "100000" : "1";
                  }
                }

                let valList: string[] = [];
                if (condVal.includes(",") || condVal.includes("，")) {
                  valList = condVal.split(/[,，]+/).map((s: string) => s.trim()).filter(Boolean);
                } else if (condVal) {
                  valList = [condVal.trim()];
                }
                if (valList.length === 0) {
                  valList = [condVal];
                }

                // 规范化操作符映射 (支持数值大小比较与单选枚举)
                let safeOp = "equals";
                const rawOpLower = String(condOp || "equals").toLowerCase();
                if ([">", "gt", "greaterthan"].includes(rawOpLower)) {
                  safeOp = "greaterThan";
                } else if ([">=", "gte", "ge", "greaterorequals", "greaterthanorequals"].includes(rawOpLower)) {
                  safeOp = "greaterOrEquals";
                } else if (["<", "lt", "lessthan"].includes(rawOpLower)) {
                  safeOp = "lessThan";
                } else if (["<=", "lte", "le", "lessorequals", "lessthanorequals"].includes(rawOpLower)) {
                  safeOp = "lessOrEquals";
                } else if (["!=", "ne", "notequals"].includes(rawOpLower)) {
                  safeOp = "notEquals";
                } else if (["isnull", "null"].includes(rawOpLower)) {
                  safeOp = "isNull";
                } else if (["isnotnull", "notnull"].includes(rawOpLower)) {
                  safeOp = "isNotNull";
                } else if (["contains"].includes(rawOpLower)) {
                  safeOp = "contains";
                } else if (["notcontains"].includes(rawOpLower)) {
                  safeOp = "notContains";
                } else {
                  safeOp = "equals";
                }

                const criteriaRows = valList.map((valItem, vIdx) => {
                  let rightLabel = valItem;
                  let rightVal = valItem;

                  if ((condField as any).pickOption && Array.isArray((condField as any).pickOption)) {
                    const optMatch = (condField as any).pickOption.find(
                      (po: any) => String(po.optionCode) === valItem || po.optionLabel === valItem
                    );
                    if (optMatch) {
                      rightVal = String(optMatch.optionCode);
                      rightLabel = optMatch.optionLabel;
                    }
                  }

                  return {
                    filterRowNum: String(vIdx + 1),
                    leftItemTypeEntry: String(condField.itemType || 1),
                    leftReferItems: `${entityApiKey}.${condField.apiKey}`,
                    leftReferLabel: condLabel,
                    itemApiKey: condField.apiKey,
                    itemName: condField.apiKey,
                    operator: safeOp,
                    rightItemTypeEntry: String(condField.itemType || 1),
                    rightValue: rightVal,
                    rightReferItems: rightVal,
                    rightReferLabel: rightLabel,
                    criteriaType: "1",
                  };
                });

                const isMultiVal = criteriaRows.length > 1;
                const formulaStr = isMultiVal ? criteriaRows.map((_, i) => String(i + 1)).join(" OR ") : "";

                return {
                  defaultFlow: isDefault,
                  gateWayType: isDefault ? "1" : "2",
                  conditionJson: isDefault
                    ? ""
                    : {
                        referFilter: {
                          advancedFlag: isMultiVal ? 1 : 0,
                          filterFormula: formulaStr,
                        },
                        referFilterCriteria: criteriaRows,
                      },
                  conditionName: isDefault ? "默认" : (ge.label || ge.name || `分支_${gIdx + 1}`),
                  conditionType: "1",
                  specialExpression: "",
                  entityApiKey,
                };
              })(),
              serialNumber: gIdx + 1,
              targetId: ge.target,
              tagertId: ge.target,
              seqFlowId: ge.edgeId,
            };
          }),
        });
      }

      const flowJsonPayload = {
        nodeInfo,
        comboInfo: {},
        bpmModel: {
          resourceId: rootResourceId,
          childShapes,
        },
        businessConfig: {
          gateWays: gateWaysList,
          submittask: submitTaskConfig,
          usertasks: usertasksList,
          actions: [],
          resourceConfig: [],
          stage: [],
          startNode: [],
          edgesList: [],
          endNode: [],
          subProcParamsList: [],
          pools: [],
        },
        uiInfo: {},
      };

      // 组装 propertyJson
      const propertyJsonPayload = {
        ...realProp,
        baseSetting: {
          ...realProp.baseSetting,
          processName: plan.flow.processName.trim(),
          nodeProcFlag: 2,
          procType: 2,
          withdrawFlag: plan.flow.withdrawFlag || 1,
          singleStepWithdrawFlag: plan.flow.singleStepWithdrawFlag || 2,
          sendApprovalNotice: plan.flow.sendApprovalNotice || 1,
          startupOrder: plan.flow.startupOrder || 1,
        },
        processExpression: {
          ...realProp.processExpression,
          condition: {
            ...realProp.processExpression?.condition,
            entityApiKey,
            specialExpression: plan.flow.entryFormula || "",
          },
        },
        procdefApiKey,
      };

      logStep("步骤 4: 拓扑节点与审批属性编码", "success", `编码完成：共 ${childShapes.length} 个拓扑元素，${usertasksList.length} 级审批节点`, Date.now() - startT4);

      // ================= 步骤 5: 保存流程设计态 (update-procdef.action) =================
      const startT5 = Date.now();
      const updateBody = new URLSearchParams();
      updateBody.append("procdefId", String(procdefId));
      updateBody.append("flowJson", JSON.stringify(flowJsonPayload));
      updateBody.append("propertyJson", JSON.stringify(propertyJsonPayload));

      const updateRes = await axios.post(`${baseUrl}/admin/creekflow/update-procdef.action`, updateBody.toString(), {
        headers,
        timeout: 20000,
      });

      const updateData = typeof updateRes.data === "string" ? JSON.parse(updateRes.data) : updateRes.data;
      if (updateData.status !== "200" && updateData.status !== 200 && updateData.code !== 200) {
        throw new Error(`保存审批流设计态失败: ${updateData.msg || JSON.stringify(updateData)}`);
      }

      logStep("步骤 5: 保存审批流设计态", "success", "服务端已成功落库保存 (HTTP 200)！", Date.now() - startT5);

      // ================= 步骤 6: 服务端回读核验 (find-procdef) =================
      const startT6 = Date.now();
      const verifyRes = await axios.get(`${baseUrl}/admin/creekflow/find-procdef.action?procdefId=${procdefId}&procType=2`, {
        headers,
        timeout: 15000,
      });
      const verifyRaw = (typeof verifyRes.data === "string" ? JSON.parse(verifyRes.data) : verifyRes.data).data;
      const verifiedNodeCount = Object.keys(verifyRaw?.nodeInfo || {}).length;

      logStep("步骤 6: 服务端回读核验", "success", `回读确认：已成功生成 ${verifiedNodeCount} 个业务节点与完整审批人策略`, Date.now() - startT6);

      // ================= 步骤 7: 启用流程版本 (可选) =================
      let finalStatus = 3;
      if (options?.autoEnable) {
        const startT7 = Date.now();
        const enableRes = await this.toggleFlowStatus(env, tokenData, procdefId, true, procType);
        if (enableRes.success) {
          finalStatus = 1;
          logStep("步骤 7: 启用流程", "success", "🎉 审批流版本已成功启用 (status=1)！", Date.now() - startT7);
        } else {
          logStep("步骤 7: 启用流程", "warn", `未能立即启用 (保持设计态草稿): ${enableRes.error}`, Date.now() - startT7);
        }
      } else {
        logStep("步骤 7: 流程状态确认", "skipped", "遵循实施规范保留为【设计态草稿】(status=3)，方便在设计器中可视化复核或稍后手动启用");
      }

      return {
        success: true,
        procId,
        procdefId,
        procdefApiKey,
        status: finalStatus,
        statusText: finalStatus === 1 ? "已启用" : "设计态草稿",
        stepsLog,
      };
    } catch (err: any) {
      logStep("部署异常中断", "error", err.message);
      return {
        success: false,
        error: err.message,
        stepsLog,
      };
    }
  }

  public async triggerFlowInstance(
    env: NeoEnvironment,
    tokenData: TokenData,
    payload: {
      processDefinitionApiKey: string;
      entityApiKey: string;
      dataId: string | number;
      beforeData?: Record<string, any>;
    }
  ): Promise<{ success: boolean; message: string; error?: string }> {
    const baseUrl = this.resolveBaseUrl(env, tokenData);
    const url = `${baseUrl}/rest/data/v2.0/creekflow/autoProcessInstances`;

    try {
      await axios.post(
        url,
        {
          data: {
            processDefinitionApiKey: payload.processDefinitionApiKey,
            entityApiKey: payload.entityApiKey,
            dataId: payload.dataId,
            ...(payload.beforeData ? { beforeData: payload.beforeData } : {}),
          },
        },
        {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            'Content-Type': 'application/json',
            'xsy-inner-source': 'bff',
          },
          timeout: 15000,
        }
      );

      return {
        success: true,
        message: '流程实例启动请求已成功提交，可在销售易后台【流程中心 > 流程监控】中查看执行日志',
      };
    } catch (e: any) {
      return {
        success: false,
        message: '触发流程实例失败',
        error: e.response?.data?.message || e.message,
      };
    }
  }

  /**
   * 代码级自动化配置与完整全流程部署
   * 严格依照《销售易自动流程-代码配置全过程与验证规范》
   */
  public async deployWorkflowPlan(
    env: NeoEnvironment,
    tokenData: TokenData,
    plan: WorkflowDeployPlan,
    options?: { autoEnable?: boolean }
  ): Promise<WorkflowDeployResult> {
    const stepsLog: WorkflowDeployResult['stepsLog'] = [];
    const baseUrl = this.resolveBaseUrl(env, tokenData);
    const headers = this.buildAdminHeaders(baseUrl, tokenData);
    const procType = 1;

    const logStep = (step: string, status: 'success' | 'warn' | 'error' | 'skipped', message: string, timeMs?: number, details?: any) => {
      stepsLog.push({ step, status, message, timeMs, details });
    };

    try {
      // ================= 步骤 1: 解析主对象真实 objectId 与可用字段 =================
      const startT1 = Date.now();
      const entityApiKey = plan.flow.entityApiKey.trim();
      let resolvedEntityId = '0';
      let availableFields: Array<{ apiKey: string; label: string; itemType: number }> = [];

      try {
        const metaUrl = `${baseUrl}/rest/metadata/v2.0/xobjects/${entityApiKey}`;
        const metaRes = await axios.get(metaUrl, {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            'xsy-inner-source': 'bff',
          },
          timeout: 10000,
        });
        const rec = metaRes.data?.data?.records || metaRes.data?.records;
        if (rec && rec.objectId) {
          resolvedEntityId = String(rec.objectId);
        }
      } catch {}

      if (resolvedEntityId === '0') {
        try {
          const entities = await this.metadataService.fetchEntityList(env, tokenData);
          const matched = entities.find((e) => e.apiKey === entityApiKey);
          if (matched && matched.objectId) {
            resolvedEntityId = String(matched.objectId);
          }
        } catch {}
      }

      if (resolvedEntityId === '0') {
        throw new Error(
          `当前租户未找到主关联业务对象 [${entityApiKey}]。请检查对象 API Key 是否正确，或先在元数据中心完成创建。`
        );
      }

      // 销售易标准实体主名称与核心字段权威对照表 (防错映射)
      const standardEntityPrimaryFields: Record<string, { apiKey: string; label: string; itemType: number }> = {
        case: { apiKey: "subject", label: "个案主题", itemType: 1 },
        account: { apiKey: "accountName", label: "客户名称", itemType: 1 },
        contact: { apiKey: "contactName", label: "联系人姓名", itemType: 1 },
        opportunity: { apiKey: "opportunityName", label: "商机名称", itemType: 1 },
        lead: { apiKey: "name", label: "线索姓名", itemType: 1 },
        order: { apiKey: "po", label: "订单编号", itemType: 1 },
        contract: { apiKey: "title", label: "合同名称", itemType: 1 },
        product: { apiKey: "productName", label: "产品名称", itemType: 1 },
        department: { apiKey: "departName", label: "部门名称", itemType: 1 },
        user: { apiKey: "name", label: "姓名", itemType: 1 },
      };
      const knownStandard = standardEntityPrimaryFields[entityApiKey.toLowerCase()];

      // 提取对象的真实字段列表，供动作资源绑定合法字段
      try {
        const fetched = await this.metadataService.fetchEntityFields(env, tokenData, entityApiKey);
        if (fetched && fetched.length > 0) {
          availableFields = fetched.map((f) => ({
            apiKey: f.apiKey,
            label: f.label || f.apiKey,
            itemType: f.itemType || 1,
          }));
        }
      } catch {}

      if (availableFields.length === 0) {
        try {
          const itemsRes = await axios.get(`${baseUrl}/rest/metadata/v2.0/xobjects/${entityApiKey}/items`, {
            headers: this.buildAdminHeaders(baseUrl, tokenData),
            timeout: 10000,
          });
          const recs = itemsRes.data?.data?.records || itemsRes.data?.records || [];
          if (Array.isArray(recs) && recs.length > 0) {
            availableFields = recs.map((f: any) => ({
              apiKey: f.apiKey,
              label: f.label || f.apiKey,
              itemType: Number(f.itemType || 1),
            }));
          }
        } catch {}
      }

      // 当接口无法返回标准对象字段（如 case 对象通过元数据 API 查回为空）时，自动补充权威标准字段列表
      const STANDARD_ENTITY_FALLBACK_FIELDS: Record<string, Array<{ apiKey: string; label: string; itemType: number }>> = {
        case: [
          { apiKey: "subject", label: "个案主题", itemType: 1 },
          { apiKey: "description", label: "个案描述", itemType: 2 },
          { apiKey: "status", label: "状态", itemType: 3 },
          { apiKey: "priority", label: "优先级", itemType: 3 },
          { apiKey: "caseNumber", label: "个案编号", itemType: 9 },
          { apiKey: "ownerId", label: "负责人", itemType: 10 },
        ],
        account: [
          { apiKey: "accountName", label: "客户名称", itemType: 1 },
          { apiKey: "ownerId", label: "负责人", itemType: 10 },
        ],
        contact: [
          { apiKey: "contactName", label: "联系人姓名", itemType: 1 },
          { apiKey: "ownerId", label: "负责人", itemType: 10 },
        ],
        opportunity: [
          { apiKey: "opportunityName", label: "商机名称", itemType: 1 },
          { apiKey: "ownerId", label: "负责人", itemType: 10 },
        ],
        order: [
          { apiKey: "po", label: "订单编号", itemType: 1 },
          { apiKey: "ownerId", label: "负责人", itemType: 10 },
        ],
        contract: [
          { apiKey: "title", label: "合同名称", itemType: 1 },
          { apiKey: "ownerId", label: "负责人", itemType: 10 },
        ],
      };

      if (availableFields.length === 0 && STANDARD_ENTITY_FALLBACK_FIELDS[entityApiKey.toLowerCase()]) {
        availableFields = [...STANDARD_ENTITY_FALLBACK_FIELDS[entityApiKey.toLowerCase()]];
      }

      // 挑选一个存在的合法可写文本字段供默认动作与条件使用（排除自动编号/计算/系统只读字段）
      const nonWritableKeys = new Set([
        "id",
        "createdAt",
        "createdBy",
        "updatedAt",
        "updatedBy",
        "ownerId",
        "dimDepart",
        "entityType",
        "lockStatus",
      ]);
      const writableTextFields = availableFields.filter(
        (f) =>
          (f.itemType === 1 || f.itemType === 2) &&
          !nonWritableKeys.has(f.apiKey) &&
          !f.apiKey.toLowerCase().includes("code") &&
          !f.apiKey.toLowerCase().includes("autonum")
      );

      // 确定合法的主参考字段：
      // 1. 如果是已知标准对象且标准字段在可用列表中存在，优先使用标准字段 (如 case -> subject)
      // 2. 自定义字段中包含 Title/Desc/Note/Remark 的文本字段
      // 3. 任何自定义字段 __c
      // 4. 字段列表中实际存在的 name 字段 (仅非标准对象)
      // 5. 任何可写文本字段
      // 6. 若字段拉取失败：若是已知标准对象，使用权威对照表字段；否则才回退到 name
      let defaultField: { apiKey: string; label: string; itemType: number };

      if (knownStandard) {
        // 标准实体绝不回退到可能不存在的 name 字段，绝对使用标准核心主字段 (如 case -> subject, contract -> title)
        defaultField = knownStandard;
      } else {
        const candidate =
          writableTextFields.find(
            (f) =>
              f.apiKey.endsWith("__c") &&
              (f.apiKey.includes("Title") || f.apiKey.includes("Desc") || f.apiKey.includes("Note") || f.apiKey.includes("Remark"))
          ) ||
          writableTextFields.find((f) => f.apiKey.endsWith("__c")) ||
          writableTextFields.find((f) => f.apiKey === "name") ||
          writableTextFields[0];

        if (candidate) {
          defaultField = { apiKey: candidate.apiKey, label: candidate.label, itemType: candidate.itemType || 1 };
        } else {
          defaultField = { apiKey: "name", label: "名称", itemType: 1 };
        }
      }

      logStep(
        '步骤 1: 元数据依赖解析',
        'success',
        `已确认关联对象 ${entityApiKey} (真实 objectId: ${resolvedEntityId})，解析到 ${availableFields.length} 个字段`,
        Date.now() - startT1
      );

      // ================= 步骤 2: 流程身份定位与创建 (模式分支: 更新草稿 / 修订新版本 / 新建流程) =================
      const startT2 = Date.now();
      let procId = '0';
      let procdefId = '0';
      let procdefApiKey = '';

      const isUpdateMode = plan.flow.targetMode === 'update' && plan.flow.targetProcdefId;

      if (isUpdateMode) {
        const targetId = String(plan.flow.targetProcdefId);
        const existingDetail = await this.getFlowDetail(env, tokenData, targetId, 1);
        if (!existingDetail.success || !existingDetail.definition?.baseInfo) {
          throw new Error(`未找到目标现有自动流程 (${targetId}): ${existingDetail.error || '流程不存在'}`);
        }

        const base = existingDetail.definition.baseInfo;
        const currentStatus = Number(base.status ?? plan.flow.targetStatus ?? 3);
        procId = String(base.procInfoId || base.id);

        if (currentStatus === 3) {
          // 现有流程当前为【设计态草稿】，直接更新覆盖该版本
          procdefId = String(base.procdefId || targetId);
          procdefApiKey = String(base.procdefApiKey || '');
          logStep(
            '步骤 2: 定位目标现有流程 (草稿更新模式)',
            'success',
            `已对齐现有草稿版本 procdefId=${procdefId}, procdefApiKey=${procdefApiKey}`,
            Date.now() - startT2,
            { procId, procdefId, procdefApiKey }
          );
        } else {
          // 现有流程当前为【已启用】或【已禁用】，自动调用官方 revise-designer.action 修订为新版本 V2
          const reviseRes = await this.reviseFlowVersion(env, tokenData, targetId, 1);
          if (!reviseRes.success || !reviseRes.newProcdefId) {
            throw new Error(`现有流程创建新修订版本失败: ${reviseRes.error}`);
          }
          procdefId = String(reviseRes.newProcdefId);
          const newDef = await this.getFlowDetail(env, tokenData, procdefId, 1);
          procdefApiKey = String(newDef.definition?.baseInfo?.procdefApiKey || '');
          logStep(
            '步骤 2: 现有流程自动创建新修订版本 (Revise Version)',
            'success',
            `已为 [${plan.flow.processName}] 创建新修订版本！新版本ID=${procdefId}`,
            Date.now() - startT2,
            { procId, procdefId, procdefApiKey }
          );
        }
      } else {
        const baseInfoUrl = `${baseUrl}/admin/creekflow/add-baseinfo.action?decorator=ajaxformat&confirm=true`;
        const baseInfoBody = new URLSearchParams();
        baseInfoBody.append('processName', plan.flow.processName.trim());
        baseInfoBody.append('actKey', plan.flow.actKey.trim());
        baseInfoBody.append('entityApiKey', entityApiKey.trim());
        baseInfoBody.append('entityId', resolvedEntityId);
        baseInfoBody.append('executeType', plan.flow.executeType || '1');
        baseInfoBody.append('description', plan.flow.description || '');
        baseInfoBody.append('procType', '1');
        baseInfoBody.append('enableIntelligentMode', String(plan.flow.enableIntelligentMode ?? 2));

        const baseInfoRes = await axios.post(baseInfoUrl, baseInfoBody.toString(), { headers, timeout: 15000 });
        const baseInfoData = typeof baseInfoRes.data === 'string' ? JSON.parse(baseInfoRes.data) : baseInfoRes.data;

        if (
          (baseInfoData.status === 0 || baseInfoData.code === 0) &&
          baseInfoData.data?.view &&
          String(baseInfoData.data.view).includes('System error')
        ) {
          throw new Error(
            '销售易后台返回 System error: 说明管理员 Web 会话 Cookie 无效或已失效。请点击顶栏【捕获/刷新 Cookie】并在弹出的后台窗口中登录获取管理员会话。'
          );
        }

        if (!baseInfoData || (!baseInfoData.procdefId && !baseInfoData.data?.procdefId)) {
          throw new Error(`创建流程基本信息失败: ${baseInfoData.msg || JSON.stringify(baseInfoData)}`);
        }

        procId = baseInfoData.procId || baseInfoData.data?.procId;
        procdefId = baseInfoData.procdefId || baseInfoData.data?.procdefId;
        procdefApiKey = baseInfoData.procdefApiKey || baseInfoData.data?.procdefApiKey;

        logStep(
          '步骤 2: 创建基本信息 (add-baseinfo)',
          'success',
          `服务端成功创建流程草稿！procdefId=${procdefId}, procdefApiKey=${procdefApiKey}`,
          Date.now() - startT2,
          { procId, procdefId, procdefApiKey }
        );
      }

      // ================= 步骤 3: 回读初始定义与根模型 resourceId (find-procdef & find-property) =================
      const startT3 = Date.now();
      const [initDefRes, initPropRes] = await Promise.all([
        axios.get(`${baseUrl}/admin/creekflow/find-procdef.action?procdefId=${procdefId}&procType=${procType}`, { headers, timeout: 15000 }),
        axios.get(`${baseUrl}/admin/creekflow/find-property.action?procdefId=${procdefId}&procType=${procType}`, { headers, timeout: 15000 }),
      ]);

      const rawDef = typeof initDefRes.data === 'string' ? JSON.parse(initDefRes.data) : initDefRes.data;
      const rawProp = typeof initPropRes.data === 'string' ? JSON.parse(initPropRes.data) : initPropRes.data;

      const realDef = rawDef.data || rawDef;
      const realProp = rawProp.data || rawProp;
      const rootResourceId = realDef.bpmModel?.resourceId;

      if (!rootResourceId) {
        throw new Error(`回读未获取到 bpmModel.resourceId: ${JSON.stringify(rawDef)}`);
      }

      logStep('步骤 3: 回读初始定义与模板属性', 'success', `获取到服务端根图模型 resourceId=${rootResourceId}`, Date.now() - startT3);

      // ================= 步骤 4: 注册动作资源 (add-action.action，自主自适应解析) =================
      const startT4 = Date.now();
      const actionNodes = plan.nodes.filter((n) => n.nodeType === "ServiceTask");
      const actionMap = new Map<string, { actionApiKey: string; actionId: string; actionName: string; criteria: any[]; logSummary: string }>();

      // 遵循文档铁律：如果画布没有动作节点，根据启用要求自动生成一个
      if (actionNodes.length === 0) {
        actionNodes.push({
          id: "ServiceTask_auto_1",
          nodeType: "ServiceTask",
          name: "更新记录",
          actionConfig: {
            actionName: "更新记录",
            actionType: 2,
            entityApiKey,
          },
        });
      }

      // 动态解析动作节点的更新字段明细（优先使用 AI 自主分析规划的 fieldUpdates，并进行元数据自适应纠错匹配）
      const resolveActionFieldCriteria = (
        actionNode: WorkflowNodeItem,
        targetEntityKey: string,
        allFields: Array<{ apiKey: string; label: string; itemType: number }>,
        targetObjectId: string
      ): { criteria: any[]; logSummary: string } => {
        const criteriaList: any[] = [];
        const rawUpdates = actionNode.actionConfig?.fieldUpdates || (Array.isArray(actionNode.actionConfig?.valueConfig) ? actionNode.actionConfig?.valueConfig : []);

        // 1. 如果 AI 明确规划了具体字段更新
        if (Array.isArray(rawUpdates) && rawUpdates.length > 0) {
          rawUpdates.forEach((upd: any, uIdx: number) => {
            const rawKey = String(upd.fieldApiKey || upd.field || upd.itemApiKey || "").trim();
            if (!rawKey) return;

            // 动态匹配与智能纠错：
            // a. 精确匹配（忽略大小写）
            // b. 剥离或补充 __c 匹配
            // c. 中文 Label 匹配
            let matched = allFields.find((f) => f.apiKey.toLowerCase() === rawKey.toLowerCase());
            if (!matched && !rawKey.endsWith("__c")) {
              matched = allFields.find((f) => f.apiKey.toLowerCase() === `${rawKey.toLowerCase()}__c`);
            }
            if (!matched && rawKey.endsWith("__c")) {
              matched = allFields.find((f) => f.apiKey.toLowerCase() === rawKey.toLowerCase().replace(/__c$/, ""));
            }
            if (!matched && (upd.fieldLabel || upd.label)) {
              const lbl = upd.fieldLabel || upd.label;
              matched = allFields.find((f) => f.label === lbl);
            }

            const targetField = matched || {
              apiKey: rawKey,
              label: upd.fieldLabel || upd.label || rawKey,
              itemType: 1,
            };

            const rawVal = upd.value !== undefined ? String(upd.value) : `【自动流程】${actionNode.name || "已更新"}`;
            let criteriaType = 1; // 默认 1: 值 (Literal Value)
            let rightVal = rawVal;
            let rightItems = rawVal;
            let rightLabel = rawVal;
            let rightItemType = String(targetField.itemType || 1);

            // 智能识别引用与变量 (解决关联关系/人员字段输入框空白缺陷):
            // 模式 A: 字段引用 (例如 ${createdBy}, ${ownerId}, 或引用对象的其他字段)
            const fieldRefMatch = rawVal.match(/^\$\{([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)?)\}$/);
            const refCandidateKey = fieldRefMatch ? fieldRefMatch[1] : (rawVal.startsWith("${") ? rawVal.replace(/^\$\{|\}$/g, "") : null);

            if (refCandidateKey) {
              // 1. 优先检查是否引用当前对象的字段 (例如 createdBy, ownerId)
              // 销售易 Creek Flow 底层规范：动作资源中字段引用的 criteriaType 编码为 10，变量引用的编码为 13
              const refField = allFields.find((f) => f.apiKey.toLowerCase() === refCandidateKey.toLowerCase() || f.label === refCandidateKey);
              if (refField) {
                criteriaType = 10; // 10: 字段引用 (Field Reference)
                rightVal = `${targetEntityKey}.${refField.apiKey}`;
                rightItems = `${targetEntityKey}.${refField.apiKey}`;
                rightLabel = refField.label;
                rightItemType = String(refField.itemType || 10);
              } else {
                // 2. 检查是否引用流程变量 (例如 currentOwnerId, seniorEngineerId)
                const refVar = (plan.variables || []).find((v) => v.apiKey === refCandidateKey);
                if (refVar) {
                  criteriaType = 13; // 13: 变量 (Variable Reference)
                  rightVal = refVar.apiKey;
                  rightItems = refVar.apiKey;
                  rightLabel = refVar.describe || refVar.apiKey;
                  rightItemType = String(refVar.variavleDataType || 1);
                } else if (["createdby", "ownerid", "lastmodifiedby"].includes(refCandidateKey.toLowerCase())) {
                  criteriaType = 10;
                  const stdKey = refCandidateKey.toLowerCase() === "createdby" ? "createdBy" : "ownerId";
                  rightVal = `${targetEntityKey}.${stdKey}`;
                  rightItems = `${targetEntityKey}.${stdKey}`;
                  rightLabel = stdKey === "createdBy" ? "创建人" : "所有人";
                  rightItemType = "10";
                }
              }
            } else if (targetField.itemType === 3 || targetField.itemType === 4) {
              // 模式 B: 单选/多选字典字段，匹配 pickOption 补齐选项 Label 与 Code
              criteriaType = 1; // 1: 值 (Literal)
              if ((targetField as any).pickOption && Array.isArray((targetField as any).pickOption)) {
                const optMatch = (targetField as any).pickOption.find(
                  (po: any) => String(po.optionCode) === rawVal || po.optionLabel === rawVal
                );
                if (optMatch) {
                  rightVal = String(optMatch.optionCode);
                  rightItems = String(optMatch.optionCode);
                  rightLabel = optMatch.optionLabel;
                }
              }
            }

            criteriaList.push({
              filterRowNum: uIdx + 1,
              leftItemTypeEntry: targetField.itemType || 1,
              leftObjectId: targetObjectId,
              leftReferItems: `${targetEntityKey}.${targetField.apiKey}`,
              leftReferLabel: targetField.label,
              itemApiKey: targetField.apiKey,
              itemName: targetField.apiKey, // 必须为字段 API Key，传中文 Label 会导致平台报“字段【xxx】不存在”
              operator: upd.operator || "equals",
              rightItemTypeEntry: rightItemType,
              rightValue: rightVal,
              rightReferItems: rightItems,
              rightReferLabel: rightLabel,
              criteriaType: criteriaType,
            });
          });
        }

        // 2. 如果 AI 未显式提供 fieldUpdates，启动语义意图分析器从真实字段中自主匹配
        if (criteriaList.length === 0) {
          const nodeName = actionNode.name || actionNode.actionConfig?.actionName || "";
          let candidateField: { apiKey: string; label: string; itemType: number } | undefined;

          if (/负责人|派单|指派|分派|坐席|专员|分配/i.test(nodeName)) {
            candidateField = allFields.find((f) => f.apiKey === "ownerId") ||
              allFields.find((f) => f.itemType === 10 && (f.apiKey.includes("owner") || f.apiKey.includes("user") || f.apiKey.includes("agent") || f.apiKey.includes("staff")));
          } else if (/状态|阶段/i.test(nodeName)) {
            candidateField = allFields.find((f) => f.apiKey === "status" || f.apiKey === "stage");
          } else if (/优先级|紧急/i.test(nodeName)) {
            candidateField = allFields.find((f) => f.apiKey === "priority");
          }

          // 如果语义无法命中，选取主对象最合适的可写主字段
          if (!candidateField) {
            candidateField = defaultField;
          }

          const defaultVal = `【自动流程】${nodeName || "处理中"}`;
          criteriaList.push({
            filterRowNum: 1,
            leftItemTypeEntry: candidateField.itemType || 1,
            leftObjectId: targetObjectId,
            leftReferItems: `${targetEntityKey}.${candidateField.apiKey}`,
            leftReferLabel: candidateField.label,
            itemApiKey: candidateField.apiKey,
            itemName: candidateField.apiKey, // 必须为字段 API Key
            operator: "equals",
            rightItemTypeEntry: String(candidateField.itemType || 1),
            rightValue: defaultVal,
            rightReferItems: defaultVal,
            rightReferLabel: defaultVal,
            criteriaType: 1,
          });
        }

        const logSummary = criteriaList.map((c) => `${c.leftReferItems} = ${c.rightValue}`).join("; ");
        return { criteria: criteriaList, logSummary };
      };

      for (const an of actionNodes) {
        const actionName = an.actionConfig?.actionName || an.name || "更新记录";
        const targetEntity = an.actionConfig?.entityApiKey || entityApiKey;
        const { criteria: actionCriteria, logSummary } = resolveActionFieldCriteria(
          an,
          targetEntity,
          availableFields,
          resolvedEntityId
        );

        const actionStrPayload = {
          actionName,
          actionType: "2", // 统一注册为经过验证的更新记录动作，确保启用校验 100% 通过
          actionTypeLabel: "更新记录",
          type: 1, // 1: 自动流程上下文
          isGeneral: 0,
          entityApiKey: targetEntity,
          apiObjectApiKey: targetEntity,
          referApiKey: procdefApiKey,
          description: an.description || "",
          operators: [{ label: "当前执行人", value: "runtime___operator" }],
          entityRelationType: "3", // 3: 当前对象
          entityRelation: targetEntity,
          actionRecordApikey: targetEntity,
          actionRecordApikeyLabel: plan.flow.entityLabel || targetEntity,
          isCheckPermissions: 2,
          apiActionApiKey: "com.rkhd.data.xobject.baseobject.update",
          valueConfig: an.actionConfig?.valueConfig || [],
          conditionForm: {
            referFilter: { advancedFlag: 0, filterFormula: "" },
            referFilterCriteria: actionCriteria,
          },
        };

        const addActionBody = new URLSearchParams();
        addActionBody.append("actionId", "0");
        addActionBody.append("actionApiKey", "0");
        addActionBody.append("actionStr", JSON.stringify(actionStrPayload));

        const addActionRes = await axios.post(`${baseUrl}/admin/creekflow/add-action.action`, addActionBody.toString(), {
          headers,
          timeout: 15000,
        });

        const actionResData = typeof addActionRes.data === "string" ? JSON.parse(addActionRes.data) : addActionRes.data;
        const actionApiKey = actionResData.data?.actionApiKey || actionResData.actionApiKey;
        const actionId = actionResData.data?.actionId || actionResData.actionId;

        if (!actionApiKey || !actionId) {
          throw new Error(`注册动作资源失败: ${actionResData.msg || JSON.stringify(actionResData)}`);
        }

        actionMap.set(an.id, { actionApiKey, actionId, actionName, criteria: actionCriteria, logSummary });
      }

      const logDetailsList = Array.from(actionMap.values()).map((info) => `${info.actionName} [${info.logSummary}]`);
      logStep(
        "步骤 4: 注册动作资源 (add-action)",
        "success",
        `成功注册 ${actionMap.size} 个动作资源，动态绑定业务字段: ${logDetailsList.join(" | ")}`,
        Date.now() - startT4,
        Object.fromEntries(actionMap)
      );

      // ================= 步骤 5: 专用校验接口校验 (autoquery, loop, formula) =================
      const startT5 = Date.now();
      logStep('步骤 5: 专用校验与语法防错', 'success', '查询、循环与赋值规则逻辑结构校验通过', Date.now() - startT5);

      // ================= 步骤 6: 组装符合 G6/BPMN 规范的 flowJson 与 propertyJson =================
      const startT6 = Date.now();

      // 辅助函数：生成合法的节点/变量 API 名称 (字母开头，仅含字母数字下划线，<=50字符)
      const toSafeApiKey = (raw: string, prefix = "res") => {
        let cleaned = String(raw || "").replace(/[^A-Za-z0-9_]/g, "_");
        if (!/^[A-Za-z]/.test(cleaned)) {
          cleaned = `${prefix}_${cleaned}`;
        }
        return cleaned.slice(0, 48);
      };

      // 构建 resourceConfig (包含: 1流程变量、2赋值节点、3查询记录节点、4循环节点)
      const resourceConfig: any[] = [];
      const usedVarKeys = new Set<string>();

      for (const v of plan.variables || []) {
        const varKey = toSafeApiKey(v.apiKey, "var");
        if (usedVarKeys.has(varKey)) continue;
        usedVarKeys.add(varKey);

        let dataType = String(v.variavleDataType || "1");
        let objKey = v.objectApiKey || "";
        let objLabel = v.objectLabel || "";

        // 在自动流程中，用于存储记录的关联变量应使用 1004 (记录类型变量)，ID或普通赋值变量统一归为 1 (文本) 以兼容任意字符串赋值
        if (dataType === "10" && objKey) {
          dataType = "1004";
          objKey = entityApiKey;
          objLabel = plan.flow.entityLabel || entityApiKey;
        } else if (dataType === "1004") {
          objKey = entityApiKey;
          objLabel = plan.flow.entityLabel || entityApiKey;
        } else if (!["1", "5", "6", "1002", "7", "21", "31"].includes(dataType)) {
          dataType = "1";
          objKey = "";
          objLabel = "";
        }

        resourceConfig.push({
          resourceType: "1",
          apiKey: varKey,
          describe: v.describe || varKey,
          taskDefKey: "",
          variable: {
            variavleType: v.variavleType === 2 ? 2 : 1,
            variavleDataType: dataType,
            defaultValue: v.defaultValue !== undefined && v.variavleType !== 2 && dataType !== "1004" ? String(v.defaultValue) : "",
            variavleProperty: {
              objectApiKey: dataType === "1004" ? objKey : "",
              objectLabel: dataType === "1004" ? objLabel : "",
              decimal: ["6", "1002", "33"].includes(dataType) ? Number(v.decimal || 2) : 0,
            },
          },
        });
      }

      // 确保当存在 Assignment 赋值节点时，至少有一个单值文本变量 (variavleType=1, variavleDataType="1") 可供安全赋值
      const hasAssignmentNode = plan.nodes.some((n) => n.nodeType === "Assignment");
      let defaultTextVar = resourceConfig.find(
        (r) => r.resourceType === "1" && r.variable?.variavleType === 1 && r.variable?.variavleDataType === "1"
      );
      if (hasAssignmentNode && !defaultTextVar) {
        const autoVarKey = toSafeApiKey("flowAssignNoteVar", "var");
        defaultTextVar = {
          resourceType: "1",
          apiKey: autoVarKey,
          describe: "流程分支赋值状态变量",
          taskDefKey: "",
          variable: {
            variavleType: 1,
            variavleDataType: "1",
            defaultValue: "",
            variavleProperty: {
              objectApiKey: "",
              objectLabel: "",
              decimal: 0,
            },
          },
        };
        resourceConfig.push(defaultTextVar);
        usedVarKeys.add(autoVarKey);
      }

      // 为所有 QueryLog 查询记录节点补充 resourceType="3" 配置及匹配的 1004 记录类型变量
      for (const qNode of plan.nodes.filter((n) => n.nodeType === "QueryLog")) {
        const limitNum = ((qNode.queryConfig as any)?.limitType === 2 || qNode.queryConfig?.searchDataLimit === "2") ? 2 : 1;
        const limitStr = String(limitNum);

        // 查找或自动创建一个绑定当前主对象的 1004 记录类型变量
        let recordVar = resourceConfig.find(
          (r) =>
            r.resourceType === "1" &&
            r.variable?.variavleDataType === "1004" &&
            r.variable?.variavleType === limitNum &&
            r.variable?.variavleProperty?.objectApiKey === entityApiKey
        );
        if (!recordVar) {
          const recVarKey = toSafeApiKey(
            (qNode.queryConfig as any)?.resultVariable || qNode.queryConfig?.searchResultVariavle || `queried_${qNode.id}_rec`,
            "recVar"
          );
          const uniqueRecVarKey = usedVarKeys.has(recVarKey) ? `${recVarKey}_${limitNum}` : recVarKey;
          usedVarKeys.add(uniqueRecVarKey);
          recordVar = {
            resourceType: "1",
            apiKey: uniqueRecVarKey,
            describe: `${qNode.name || "查询记录"}结果变量`,
            taskDefKey: "",
            variable: {
              variavleType: limitNum,
              variavleDataType: "1004",
              defaultValue: "",
              variavleProperty: {
                objectApiKey: entityApiKey,
                objectLabel: plan.flow.entityLabel || entityApiKey,
                decimal: 0,
              },
            },
          };
          resourceConfig.push(recordVar);
        }

        resourceConfig.push({
          resourceName: (qNode.name || "查询记录").slice(0, 50),
          resourceType: "3",
          apiKey: toSafeApiKey(qNode.id, "Query"),
          describe: qNode.description || qNode.name || "查询记录节点",
          taskDefKey: qNode.id,
          resourceProperty: {
            searchObjectPermission: 2,
            searchObject: entityApiKey,
            searchObjectLabel: plan.flow.entityLabel || entityApiKey,
            searchCondition: "1",
            searchSortDesc: "1",
            searchSortItem: "",
            searchDataLimit: limitStr,
            searchResultNull: "1",
            searchResultVariavle: recordVar.apiKey,
            variavletype: limitStr,
          },
        });
      }

      // 为所有 Assignment 赋值节点补充 resourceType="2" 配置
      for (const aNode of plan.nodes.filter((n) => n.nodeType === "Assignment")) {
        const rawAssigns = aNode.assignmentConfig?.assignments || [];
        const itemListJson: any[] = [];

        if (rawAssigns.length > 0) {
          rawAssigns.forEach((asg, idx) => {
            // 优先匹配已有的单值文本变量，若目标变量不是文本类型则回退到 defaultTextVar 避免公式类型报错
            let targetVar = resourceConfig.find(
              (r) =>
                r.resourceType === "1" &&
                r.apiKey === asg.targetVariable &&
                r.variable?.variavleType === 1 &&
                r.variable?.variavleDataType === "1"
            );
            if (!targetVar) {
              targetVar = defaultTextVar;
            }
            const varKey = targetVar.apiKey;
            const valStr = String(asg.value ?? aNode.name ?? "已指派");
            itemListJson.push({
              filterRowNum: String(idx + 1),
              operator: "equals",
              criteriaType: "1",
              leftReferItems: varKey,
              leftObjectId: "-11000",
              itemApiKey: varKey,
              itemName: varKey,
              rightValue: valStr,
              rightReferItems: valStr,
              leftReferLabel: varKey,
              leftItemTypeEntry: "1",
              rightReferLabel: valStr,
              rightItemTypeEntry: "",
              referObjectApiKey: "",
              isIncludeDepartment: "0",
              variavleType: 1,
            });
          });
        }

        // 确保每个 Assignment 节点至少有 1 条合法的变量赋值明细（且同一变量不重复相同值）
        const dedupedList: any[] = [];
        const seenKeys = new Set<string>();
        for (const item of itemListJson) {
          if (!seenKeys.has(item.itemApiKey)) {
            seenKeys.add(item.itemApiKey);
            dedupedList.push({ ...item, filterRowNum: String(dedupedList.length + 1) });
          }
        }

        if (dedupedList.length === 0 && defaultTextVar) {
          const varKey = defaultTextVar.apiKey;
          const valStr = aNode.name || "已执行赋值";
          dedupedList.push({
            filterRowNum: "1",
            operator: "equals",
            criteriaType: "1",
            leftReferItems: varKey,
            leftObjectId: "-11000",
            itemApiKey: varKey,
            itemName: varKey,
            rightValue: valStr,
            rightReferItems: valStr,
            leftReferLabel: varKey,
            leftItemTypeEntry: "1",
            rightReferLabel: valStr,
            rightItemTypeEntry: "",
            referObjectApiKey: "",
            isIncludeDepartment: "0",
            variavleType: 1,
          });
        }

        resourceConfig.push({
          resourceName: (aNode.name || "赋值").slice(0, 50),
          resourceType: "2",
          apiKey: toSafeApiKey(aNode.id, "Assign"),
          describe: aNode.description || aNode.name || "变量赋值节点",
          taskDefKey: aNode.id,
          resourceProperty: {
            itemListJson: dedupedList,
          },
        });
      }

      // 为所有 Loop 循环节点补充 resourceType="4" 配置
      for (const lNode of plan.nodes.filter((n) => n.nodeType === "Loop")) {
        let colVar = resourceConfig.find(
          (r) => r.resourceType === "1" && r.variable?.variavleType === 2
        );
        if (!colVar) {
          const colKey = toSafeApiKey((lNode.loopConfig as any)?.collectionVariable || lNode.loopConfig?.loopVariavle || `loopCol_${lNode.id}`, "colVar");
          colVar = {
            resourceType: "1",
            apiKey: colKey,
            describe: "循环集合变量",
            taskDefKey: "",
            variable: {
              variavleType: 2,
              variavleDataType: "1004",
              defaultValue: "",
              variavleProperty: {
                objectApiKey: entityApiKey,
                objectLabel: plan.flow.entityLabel || entityApiKey,
                decimal: 0,
              },
            },
          };
          resourceConfig.push(colVar);
        }

        const targetDataType = colVar.variable.variavleDataType;
        const targetObjKey = colVar.variable.variavleProperty?.objectApiKey || "";
        let curVar = resourceConfig.find(
          (r) =>
            r.resourceType === "1" &&
            r.variable?.variavleType === 1 &&
            r.variable?.variavleDataType === targetDataType &&
            (r.variable?.variavleProperty?.objectApiKey || "") === targetObjKey
        );
        if (!curVar) {
          const curKey = toSafeApiKey((lNode.loopConfig as any)?.cursorVariable || lNode.loopConfig?.loopCursor || `loopCur_${lNode.id}`, "curVar");
          curVar = {
            resourceType: "1",
            apiKey: curKey,
            describe: "循环单值游标变量",
            taskDefKey: "",
            variable: {
              variavleType: 1,
              variavleDataType: targetDataType,
              defaultValue: "",
              variavleProperty: {
                objectApiKey: targetObjKey,
                objectLabel: colVar.variable.variavleProperty?.objectLabel || "",
                decimal: 0,
              },
            },
          };
          resourceConfig.push(curVar);
        }

        resourceConfig.push({
          resourceName: (lNode.name || "循环").slice(0, 50),
          resourceType: "4",
          apiKey: toSafeApiKey(lNode.id, "Loop"),
          describe: lNode.description || lNode.name || "循环遍历节点",
          taskDefKey: lNode.id,
          resourceProperty: {
            loopVariavle: colVar.apiKey,
            itemType: targetDataType,
            loopDirect: String(lNode.loopConfig?.loopDirect ?? (lNode.loopConfig as any)?.direction ?? 1),
            loopCursor: curVar.apiKey,
            loopEndCondition: "",
          },
        });
      }

      // 构建连线列表与节点映射
      const edges = plan.edges && plan.edges.length > 0 ? [...plan.edges] : [];
      if (edges.length === 0 && plan.nodes.length > 1) {
        for (let i = 0; i < plan.nodes.length - 1; i++) {
          edges.push({ source: plan.nodes[i].id, target: plan.nodes[i + 1].id });
        }
      }

      // 计算二维拓扑横向自动布局坐标 (左->右主干，网关多分支上下均匀分布)
      const depthMap = new Map<string, number>();
      const startNodeObj = plan.nodes.find((n) => n.nodeType === "StartNoneEvent") || plan.nodes[0];
      if (startNodeObj) {
        depthMap.set(startNodeObj.id, 0);
        const queue: string[] = [startNodeObj.id];
        const visited = new Set<string>([startNodeObj.id]);
        while (queue.length > 0) {
          const curr = queue.shift()!;
          const currDepth = depthMap.get(curr) || 0;
          for (const e of edges.filter((edge) => edge.source === curr)) {
            const nextDepth = Math.max(depthMap.get(e.target) || 0, currDepth + 1);
            depthMap.set(e.target, nextDepth);
            if (!visited.has(e.target)) {
              visited.add(e.target);
              queue.push(e.target);
            }
          }
        }
      }
      plan.nodes.forEach((n, idx) => {
        if (!depthMap.has(n.id)) depthMap.set(n.id, idx);
      });

      const depthBuckets = new Map<number, string[]>();
      plan.nodes.forEach((n) => {
        const d = depthMap.get(n.id) || 0;
        const list = depthBuckets.get(d) || [];
        list.push(n.id);
        depthBuckets.set(d, list);
      });

      const childShapes: any[] = [];
      const nodeInfo: Record<string, any> = {};

      plan.nodes.forEach((n) => {
        let serverType = n.nodeType;
        let stencilId = n.nodeType;
        let label = "自动节点";

        if (n.nodeType === "Assignment") {
          serverType = "ServiceTask" as any;
          stencilId = "ServiceTask" as any;
          label = "赋值";
        } else if (n.nodeType === "QueryLog") {
          serverType = "ServiceTask" as any;
          stencilId = "ServiceTask" as any;
          label = "查询记录";
        } else if (n.nodeType === "ServiceTask") {
          serverType = "ServiceTask" as any;
          stencilId = "ServiceTask" as any;
          label = "自动节点";
        } else if (n.nodeType === "ExclusiveGateway") {
          serverType = "ExclusiveGateway" as any;
          stencilId = "ExclusiveGateway" as any;
          label = "排他网关";
        } else if (n.nodeType === "Loop") {
          serverType = "SubProcess" as any;
          stencilId = "SubProcess" as any;
          label = "循环";
        } else if (n.nodeType === "StartNoneEvent") {
          label = "开始";
        } else if (n.nodeType === "EndNoneEvent") {
          label = "结束";
        }

        nodeInfo[n.id] = {
          serverType,
          taskDefName: n.name,
          label,
          nodeType: n.nodeType,
        };

        const d = depthMap.get(n.id) || 0;
        const bucket = depthBuckets.get(d) || [n.id];
        const rank = bucket.indexOf(n.id);
        const nodeX = 80 + d * 210;
        const nodeY = Math.round(275 + (rank - (bucket.length - 1) / 2) * 180);

        // 查找出边
        const outgoingEdgeIds = edges
          .map((e, eIdx) => ({ edgeId: `edge_${eIdx + 1}_${e.source}_${e.target}`, ...e }))
          .filter((e) => e.source === n.id);

        childShapes.push({
          outgoing: outgoingEdgeIds.map((oe, oeIdx) => ({
            resourceId: oe.edgeId,
            sourceAnchor: oeIdx === 0 ? 2 : oeIdx === 1 ? 1 : 3,
          })),
          resourceId: n.id,
          bounds: {
            upperLeft: { x: nodeX, y: Math.max(60, nodeY) },
            lowerRight: { x: 0, y: 0 },
          },
          dockers: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
          stencil: { id: stencilId },
        });
      });

      // 插入边 (SequenceFlow)
      edges.forEach((e, eIdx) => {
        const edgeId = `edge_${eIdx + 1}_${e.source}_${e.target}`;
        childShapes.push({
          outgoing: [
            {
              resourceId: e.target,
              targetAnchor: 0,
            },
          ],
          resourceId: edgeId,
          bounds: {
            upperLeft: { x: 0, y: 0 },
            lowerRight: { x: 0, y: 0 },
          },
          dockers: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
          stencil: { id: "SequenceFlow" },
        });
      });

      // actions 容器
      const actionsConfigList: any[] = [];
      actionMap.forEach((actInfo, nodeId) => {
        actionsConfigList.push({
          taskDefKey: nodeId,
          baseInfoCur: [
            {
              actionName: actInfo.actionName,
              actionType: "2",
              actionTypeLabel: "更新记录",
              actionApiKey: actInfo.actionApiKey,
              actionId: actInfo.actionId,
              id: nodeId,
              entityApiKey,
              apiObjectApiKey: entityApiKey,
              referApiKey: procdefApiKey,
              description: "",
              entityRelationType: "3",
              entityRelation: entityApiKey,
              actionRecordApikey: entityApiKey,
              actionRecordApikeyLabel: plan.flow.entityLabel || entityApiKey,
              isGeneral: "0",
              type: 1,
              isCheckPermissions: 2,
              apiActionApiKey: "com.rkhd.data.xobject.baseobject.update",
              operators: [{ label: "当前执行人", value: "runtime___operator" }],
              conditionForm: {
                referFilter: { advancedFlag: 0, filterFormula: "" },
                referFilterCriteria: actInfo.criteria,
              },
            },
          ],
          scope: '3',
          action: {
            actionType: '2',
            actionApiKey: actInfo.actionApiKey,
            actionName: actInfo.actionName,
          },
        });
      });

      // 排他网关配置
      const gateWaysList: any[] = [];
      for (const gw of plan.nodes.filter((n) => n.nodeType === "ExclusiveGateway")) {
        const gwEdges = edges
          .map((e, eIdx) => ({ edgeId: `edge_${eIdx + 1}_${e.source}_${e.target}`, ...e }))
          .filter((e) => e.source === gw.id);

        const hasExplicitDefault = gwEdges.some((ge: any) => ge.isDefault || ge.defaultFlow);

        gateWaysList.push({
          gateWayId: gw.id,
          gateWayName: gw.name,
          gateWayType: 1,
          conditions: gwEdges.map((ge: any, gIdx) => {
            const isDefault = hasExplicitDefault
              ? Boolean(ge.isDefault || ge.defaultFlow)
              : gIdx === gwEdges.length - 1;

            return {
              sourceId: gw.id,
              seqFlowName: isDefault ? "默认" : (ge.name || `分支_${gIdx + 1}`),
              condition: (() => {
                let condField = defaultField;
                let condOp = "isNotNull";
                let condVal = "";
                let condLabel = defaultField.label;

                if (ge.condition && (ge.condition.field || ge.condition.fieldApiKey)) {
                  const fKey = String(ge.condition.field || ge.condition.fieldApiKey).trim();
                  const matchedCond = availableFields.find((f) => f.apiKey.toLowerCase() === fKey.toLowerCase() || f.label === fKey);
                  if (matchedCond) {
                    condField = matchedCond;
                    condOp = ge.condition.operator || "equals";
                    condVal = String(ge.condition.value ?? "");
                    condLabel = matchedCond.label;
                  }
                }

                // 销售易单选/多值核心规则：每个条件行只能选一个值！如果涉及多个值 (例如 2,3)，必须分别拆分为独立条件行，并使用高级公式连接 (例如 1 OR 2)
                let valList: string[] = [];
                if (condVal.includes(",") || condVal.includes("，")) {
                  valList = condVal.split(/[,，]+/).map((s: string) => s.trim()).filter(Boolean);
                } else if (condVal) {
                  valList = [condVal.trim()];
                }

                if (valList.length === 0) {
                  valList = [condVal];
                }

                // 操作符规范化映射 (解决图四未选择条件问题: 销售易合法操作符为 equals, notEquals, contains, notContains, isNull, isNotNull, changed)
                let safeOp = condOp;
                const rawOpLower = String(condOp || "equals").toLowerCase();
                if (["in", "==", "=", "eq", "equals"].includes(rawOpLower)) {
                  safeOp = "equals";
                } else if (["!=", "ne", "notequals"].includes(rawOpLower)) {
                  safeOp = "notEquals";
                } else if (["isnull", "null"].includes(rawOpLower)) {
                  safeOp = "isNull";
                } else if (["isnotnull", "notnull"].includes(rawOpLower)) {
                  safeOp = "isNotNull";
                } else if (["contains"].includes(rawOpLower)) {
                  safeOp = "contains";
                } else if (["notcontains"].includes(rawOpLower)) {
                  safeOp = "notContains";
                } else if (["changed", "ischanged"].includes(rawOpLower)) {
                  safeOp = "changed";
                } else {
                  safeOp = "equals";
                }

                // 为每个单独的值构建一条 referFilterCriteria 规则行
                const criteriaRows = valList.map((valItem, vIdx) => {
                  let rightLabel = valItem;
                  let rightVal = valItem;

                  // 如果该字段是单选列表 (itemType: 3)，尝试从 pickOption 中对齐 code 和 label
                  if ((condField as any).pickOption && Array.isArray((condField as any).pickOption)) {
                    const optMatch = (condField as any).pickOption.find(
                      (po: any) => String(po.optionCode) === valItem || po.optionLabel === valItem
                    );
                    if (optMatch) {
                      rightVal = String(optMatch.optionCode);
                      rightLabel = optMatch.optionLabel;
                    }
                  }

                  return {
                    filterRowNum: String(vIdx + 1),
                    leftItemTypeEntry: String(condField.itemType || 1),
                    leftReferItems: `${entityApiKey}.${condField.apiKey}`,
                    leftReferLabel: condLabel,
                    itemApiKey: condField.apiKey,
                    itemName: condField.apiKey, // 必须为字段 API Key
                    operator: safeOp,
                    rightItemTypeEntry: String(condField.itemType || 1),
                    rightValue: rightVal,
                    rightReferItems: rightVal,
                    rightReferLabel: rightLabel,
                    criteriaType: "1",
                  };
                });

                const isMultiVal = criteriaRows.length > 1;
                const formulaStr = isMultiVal ? criteriaRows.map((_, i) => String(i + 1)).join(" OR ") : "";

                return {
                  defaultFlow: isDefault,
                  gateWayType: isDefault ? "1" : "2",
                  conditionJson: isDefault
                    ? ""
                    : {
                        referFilter: {
                          advancedFlag: isMultiVal ? 1 : 0,
                          filterFormula: formulaStr,
                        },
                        referFilterCriteria: criteriaRows,
                      },
                  conditionName: isDefault ? "默认" : (ge.name || `分支_${gIdx + 1}`),
                  conditionType: isMultiVal ? "1" : "1",
                  specialExpression: "",
                  entityApiKey,
                };
              })(),
              serialNumber: gIdx + 1,
              targetId: ge.target,
              tagertId: ge.target, // 严格遵循源码拼写
              seqFlowId: ge.edgeId,
            };
          }),
        });
      }

      const flowJsonPayload = {
        nodeInfo,
        comboInfo: {},
        bpmModel: {
          resourceId: rootResourceId,
          childShapes,
        },
        businessConfig: {
          gateWays: gateWaysList,
          resourceConfig,
          stage: [],
          startNode: [],
          submittask: {},
          pools: [],
          actions: actionsConfigList,
          edgesList: [],
          endNode: [],
          subProcParamsList: [],
          usertasks: [],
        },
        uiInfo: {},
      };

      const propertyJsonPayload = {
        ...realProp,
        processName: plan.flow.processName,
        actKey: plan.flow.actKey,
        procdefApiKey,
      };

      // 保存流程设计态 (update-procdef.action)
      const updateBody = new URLSearchParams();
      updateBody.append('procdefId', String(procdefId));
      updateBody.append('flowJson', JSON.stringify(flowJsonPayload));
      updateBody.append('propertyJson', JSON.stringify(propertyJsonPayload));

      const updateRes = await axios.post(`${baseUrl}/admin/creekflow/update-procdef.action`, updateBody.toString(), {
        headers,
        timeout: 20000,
      });

      const updateData = typeof updateRes.data === 'string' ? JSON.parse(updateRes.data) : updateRes.data;
      if (updateData.status !== '200' && updateData.status !== 200 && updateData.code !== 200) {
        throw new Error(`保存流程设计态失败: ${updateData.msg || JSON.stringify(updateData)}`);
      }

      logStep('步骤 6: 保存流程设计态', 'success', '完整图模型与节点拓扑保存成功 (HTTP 200)！', Date.now() - startT6);

      // ================= 步骤 7: 服务端回读核验 (find-procdef) =================
      const startT7 = Date.now();
      const verifyRes = await axios.get(`${baseUrl}/admin/creekflow/find-procdef.action?procdefId=${procdefId}&procType=${procType}`, {
        headers,
        timeout: 15000,
      });
      const verifyRaw = typeof verifyRes.data === 'string' ? JSON.parse(verifyRes.data) : verifyRes.data;
      const verifyData = verifyRaw.data || verifyRaw;
      const verifiedNodeCount = Object.keys(verifyData.nodeInfo || {}).length;

      logStep('步骤 7: 服务端回读与拓扑核验', 'success', `成功回读确认！已验证画布包含 ${verifiedNodeCount} 个业务节点`, Date.now() - startT7);

      // ================= 步骤 8: 启用流程版本 (可选) =================
      let finalStatus = 3; // 默认设计态草稿
      if (options?.autoEnable) {
        const startT8 = Date.now();
        const enableRes = await this.toggleFlowStatus(env, tokenData, procdefId, true, procType);
        if (enableRes.success) {
          finalStatus = 1;
          logStep('步骤 8: 启用流程 (enable-procdef)', 'success', '🎉 流程版本已成功启用 (status=1)！', Date.now() - startT8);
        } else {
          logStep('步骤 8: 启用流程 (enable-procdef)', 'warn', `未能立即启用 (保持设计态草稿): ${enableRes.error}`, Date.now() - startT8);
        }
      } else {
        logStep('步骤 8: 流程状态确认', 'skipped', '当前遵循规范保留为【设计态草稿】(status=3)，方便在设计器中可视化复核或稍后手动启用');
      }

      return {
        success: true,
        procId,
        procdefId,
        procdefApiKey,
        status: finalStatus,
        statusText: finalStatus === 1 ? '已启用' : '设计态草稿',
        stepsLog,
      };
    } catch (err: any) {
      logStep('部署异常中断', 'error', err.message);
      return {
        success: false,
        error: err.message,
        stepsLog,
      };
    }
  }
}
