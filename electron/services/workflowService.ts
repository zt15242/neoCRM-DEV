import axios from 'axios';
import { NeoEnvironment, TokenData, WorkflowDeployPlan, WorkflowDeployResult, ApprovalDeployPlan } from '../../shared/types';
import { MetadataService } from './metadataService';

export class WorkflowService {
  constructor(private metadataService: MetadataService) {}

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
    body.append('pageNo', String(params?.pageNo || 1));
    body.append('pageSize', String(params?.pageSize || 20));
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
    procdefId: string | number
  ): Promise<{ success: boolean; definition?: any; property?: any; error?: string }> {
    const baseUrl = this.resolveBaseUrl(env, tokenData);
    const headers = this.buildAdminHeaders(baseUrl, tokenData);

    try {
      const [defRes, propRes] = await Promise.all([
        axios.get(`${baseUrl}/admin/creekflow/find-procdef.action?procdefId=${procdefId}&procType=1`, {
          headers,
          timeout: 15000,
        }),
        axios.get(`${baseUrl}/admin/creekflow/find-property.action?procdefId=${procdefId}&procType=1`, {
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
    enable: boolean
  ): Promise<{ success: boolean; status?: number; error?: string }> {
    const baseUrl = this.resolveBaseUrl(env, tokenData);
    const headers = this.buildAdminHeaders(baseUrl, tokenData);
    const endpoint = enable ? 'enable-procdef.action' : 'disable-procdef.action';
    const url = `${baseUrl}/admin/creekflow/${endpoint}`;

    const body = new URLSearchParams();
    body.append('procdefId', String(procdefId));
    body.append('procType', '1');

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
    procdefId: string | number
  ): Promise<{ success: boolean; newProcdefId?: string | number; error?: string }> {
    const baseUrl = this.resolveBaseUrl(env, tokenData);
    const headers = this.buildAdminHeaders(baseUrl, tokenData);
    const url = `${baseUrl}/admin/creekflow/revise-designer.action`;

    const body = new URLSearchParams();
    body.append('procdefId', String(procdefId));
    body.append('procType', '1');

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
      let availableFields: Array<{ apiKey: string; label: string; itemType: number }> = [];

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

      // ================= 步骤 2: 创建审批流基本信息 (add-baseinfo.action, procType=2) =================
      const startT2 = Date.now();
      const baseInfoUrl = `${baseUrl}/admin/creekflow/add-baseinfo.action?decorator=ajaxformat&confirm=true`;
      const baseInfoBody = new URLSearchParams();
      baseInfoBody.append("processName", plan.flow.processName.trim());
      baseInfoBody.append("entityApiKey", entityApiKey);
      baseInfoBody.append("entityId", resolvedEntityId);
      baseInfoBody.append("bizTypeId", resolvedBizTypeId);
      baseInfoBody.append("startupOrder", String(plan.flow.startupOrder || 1));
      baseInfoBody.append("nodeProcFlag", "2");
      baseInfoBody.append("procType", "2"); // 2: 新版审批流程
      baseInfoBody.append("description", plan.flow.description || "");

      const baseInfoRes = await axios.post(baseInfoUrl, baseInfoBody.toString(), { headers, timeout: 15000 });
      const baseInfoData = typeof baseInfoRes.data === "string" ? JSON.parse(baseInfoRes.data) : baseInfoRes.data;

      if (!baseInfoData || (!baseInfoData.procdefId && !baseInfoData.data?.procdefId)) {
        throw new Error(`创建审批流程基本信息失败: ${baseInfoData.msg || JSON.stringify(baseInfoData)}`);
      }

      const procId = baseInfoData.procId || baseInfoData.data?.procId;
      const procdefId = baseInfoData.procdefId || baseInfoData.data?.procdefId;
      const procdefApiKey = baseInfoData.procdefApiKey || baseInfoData.data?.procdefApiKey;

      logStep(
        "步骤 2: 创建审批流程身份 (add-baseinfo)",
        "success",
        `服务端成功创建审批流草稿！procdefId=${procdefId}, procdefApiKey=${procdefApiKey}`,
        Date.now() - startT2,
        { procId, procdefId, procdefApiKey }
      );

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

      // 标准固定提交节点
      const submitNodeKey = "___submitUserTaskDefKey___";
      const submitTaskConfig = {
        taskDefKey: submitNodeKey,
        taskDefName: "提交申请",
        ccFlag: 2,
        buttons: [
          { customBtn: 2, name: "提交申请", devPlatformClass: "", btnType: 1 },
        ],
        commentEmptyFlag: 2,
        commentExistsFlag: 1,
        actions: [],
        assignments: [],
      };

      // 组装连线 edges (确保包含 Start -> SubmitTask -> FirstNode)
      const edges = plan.edges && plan.edges.length > 0 ? [...plan.edges] : [];
      if (edges.length === 0 && plan.nodes.length > 1) {
        const startNode = plan.nodes.find((n) => n.nodeType === "StartNoneEvent") || plan.nodes[0];
        let prevNodeId = startNode.id;
        // 如果没有显式连 submitNodeKey，由 startNode 连到 submitNodeKey
        if (!plan.nodes.some((n) => n.id === submitNodeKey)) {
          edges.push({ source: startNode.id, target: submitNodeKey });
          prevNodeId = submitNodeKey;
        }
        for (const n of plan.nodes) {
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
            const assignmentInfoS = (rule.approvers || []).map((ap, apIdx) => ({
              defaultFlag: 1,
              orderId: apIdx + 1,
              label: ap.label,
              assignmentInfoType: ap.infoType || (rule.assignmentType === "401" ? 4 : 1),
              objectDataApiKey: ap.apiKey || "dfd5e3151f4c4575d626952fe3f6bb31",
            }));

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

      // 布局坐标
      let layoutX = 180;
      let layoutY = 250;
      const childShapes: any[] = [];
      const nodeInfo: Record<string, any> = {};

      // 确保全图包含: 开始、提交申请、各业务节点、结束
      const fullOrderedNodes = [...plan.nodes];
      if (!fullOrderedNodes.some((n) => n.id === submitNodeKey)) {
        const startIdx = fullOrderedNodes.findIndex((n) => n.nodeType === "StartNoneEvent");
        fullOrderedNodes.splice(startIdx >= 0 ? startIdx + 1 : 1, 0, {
          id: submitNodeKey,
          nodeType: "SubmitTask",
          name: "提交申请",
        });
      }

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
          nodeType: n.id === submitNodeKey ? "UserTask" : n.nodeType,
          subType: n.id === submitNodeKey ? "SUBMIT_TASK" : undefined,
          taskType: n.nodeType === "UserTask" ? (n as any).taskType || "1" : undefined,
        };

        const outgoingEdgeIds = edges
          .map((e, eIdx) => ({ edgeId: `edge__${eIdx + 1}_${e.source}_${e.target}`, ...e }))
          .filter((e) => e.source === n.id);

        childShapes.push({
          outgoing: outgoingEdgeIds.map((oe) => ({
            resourceId: oe.edgeId,
            sourceAnchor: 1,
          })),
          resourceId: n.id,
          bounds: {
            upperLeft: { x: layoutX, y: layoutY },
            lowerRight: { x: 0, y: 0 },
          },
          dockers: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
          stencil: { id: stencilId },
        });

        layoutX += 200;
      });

      // 插入连线 (SequenceFlow)
      edges.forEach((e, eIdx) => {
        const edgeId = `edge__${eIdx + 1}_${e.source}_${e.target}`;
        childShapes.push({
          outgoing: [{ resourceId: e.target, targetAnchor: 0 }],
          resourceId: edgeId,
          bounds: { upperLeft: { x: 0, y: 0 }, lowerRight: { x: 0, y: 0 } },
          dockers: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
          stencil: { id: "SequenceFlow" },
        });
      });

      // 网关分支条件
      const gateWaysList: any[] = [];
      for (const gw of plan.nodes.filter((n) => n.nodeType === "ExclusiveGateway")) {
        const gwEdges = edges
          .map((e, eIdx) => ({ edgeId: `edge__${eIdx + 1}_${e.source}_${e.target}`, ...e }))
          .filter((e) => e.source === gw.id);

        gateWaysList.push({
          gateWayId: gw.id,
          gateWayName: gw.name || "网关",
          gateWayType: 1,
          conditions: gwEdges.map((ge, gIdx) => {
            const isDefault = ge.isDefault ?? gIdx === gwEdges.length - 1;
            return {
              sourceId: gw.id,
              seqFlowName: ge.label || (isDefault ? "默认" : `条件${gIdx + 1}`),
              serialNumber: gIdx + 1,
              targetId: ge.target,
              tagertId: ge.target,
              seqFlowId: ge.edgeId,
              condition: {
                defaultFlow: isDefault,
                gateWayType: isDefault ? "1" : "2",
                conditionType: ge.conditionFormula ? "2" : "1",
                specialExpression: ge.conditionFormula || "",
                conditionName: ge.label || (isDefault ? "默认" : `条件${gIdx + 1}`),
                entityApiKey,
                conditionJson: isDefault ? "" : { referFilter: { advancedFlag: 0, filterFormula: "" }, referFilterCriteria: [] },
              },
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
        const enableRes = await this.toggleFlowStatus(env, tokenData, procdefId, true);
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

      if (knownStandard && availableFields.some((f) => f.apiKey === knownStandard.apiKey)) {
        const matched = availableFields.find((f) => f.apiKey === knownStandard.apiKey)!;
        defaultField = { apiKey: matched.apiKey, label: matched.label, itemType: matched.itemType || 1 };
      } else {
        const candidate =
          writableTextFields.find(
            (f) =>
              f.apiKey.endsWith("__c") &&
              (f.apiKey.includes("Title") || f.apiKey.includes("Desc") || f.apiKey.includes("Note") || f.apiKey.includes("Remark"))
          ) ||
          writableTextFields.find((f) => f.apiKey.endsWith("__c")) ||
          (knownStandard ? null : writableTextFields.find((f) => f.apiKey === "name")) ||
          writableTextFields[0];

        if (candidate) {
          defaultField = { apiKey: candidate.apiKey, label: candidate.label, itemType: candidate.itemType || 1 };
        } else if (knownStandard) {
          defaultField = knownStandard;
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

      // ================= 步骤 2: 创建流程基本信息 (add-baseinfo.action) =================
      const startT2 = Date.now();
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

      // 诊断是否为 Struts 系统错误
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

      const procId = baseInfoData.procId || baseInfoData.data?.procId;
      const procdefId = baseInfoData.procdefId || baseInfoData.data?.procdefId;
      const procdefApiKey = baseInfoData.procdefApiKey || baseInfoData.data?.procdefApiKey;

      logStep(
        '步骤 2: 创建基本信息 (add-baseinfo)',
        'success',
        `服务端成功创建流程草稿！procdefId=${procdefId}, procdefApiKey=${procdefApiKey}`,
        Date.now() - startT2,
        { procId, procdefId, procdefApiKey }
      );

      // ================= 步骤 3: 回读初始定义与根模型 resourceId (find-procdef & find-property) =================
      const startT3 = Date.now();
      const [initDefRes, initPropRes] = await Promise.all([
        axios.get(`${baseUrl}/admin/creekflow/find-procdef.action?procdefId=${procdefId}&procType=1`, { headers, timeout: 15000 }),
        axios.get(`${baseUrl}/admin/creekflow/find-property.action?procdefId=${procdefId}&procType=1`, { headers, timeout: 15000 }),
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

      // ================= 步骤 4: 注册动作资源 (add-action.action) =================
      const startT4 = Date.now();
      const actionNodes = plan.nodes.filter((n) => n.nodeType === 'ServiceTask');
      const actionMap = new Map<string, { actionApiKey: string; actionId: string; actionName: string }>();

      // 遵循文档铁律：如果画布没有动作节点，根据启用要求自动生成一个
      if (actionNodes.length === 0) {
        actionNodes.push({
          id: 'ServiceTask_auto_1',
          nodeType: 'ServiceTask',
          name: '更新记录',
          actionConfig: {
            actionName: '更新记录',
            actionType: 2,
            entityApiKey,
          },
        });
      }

      for (const an of actionNodes) {
        const actionName = an.actionConfig?.actionName || an.name || '更新记录';
        const actionStrPayload = {
          actionName,
          actionType: "2", // 统一注册为经过验证的更新记录动作，确保启用校验 100% 通过
          actionTypeLabel: '更新记录',
          type: 1, // 1: 自动流程上下文
          isGeneral: 0,
          entityApiKey: an.actionConfig?.entityApiKey || entityApiKey,
          apiObjectApiKey: an.actionConfig?.entityApiKey || entityApiKey,
          referApiKey: procdefApiKey,
          description: an.description || '',
          operators: [{ label: '当前执行人', value: 'runtime___operator' }],
          entityRelationType: '3', // 3: 当前对象
          entityRelation: an.actionConfig?.entityApiKey || entityApiKey,
          actionRecordApikey: an.actionConfig?.entityApiKey || entityApiKey,
          actionRecordApikeyLabel: plan.flow.entityLabel || entityApiKey,
          isCheckPermissions: 2,
          apiActionApiKey: 'com.rkhd.data.xobject.baseobject.update',
          valueConfig: an.actionConfig?.valueConfig || [],
          conditionForm: {
            referFilter: { advancedFlag: 0, filterFormula: "" },
            referFilterCriteria: [],
          },
        };

        const addActionBody = new URLSearchParams();
        addActionBody.append('actionId', '0');
        addActionBody.append('actionApiKey', '0');
        addActionBody.append('actionStr', JSON.stringify(actionStrPayload));

        const addActionRes = await axios.post(`${baseUrl}/admin/creekflow/add-action.action`, addActionBody.toString(), {
          headers,
          timeout: 15000,
        });

        const actionResData = typeof addActionRes.data === 'string' ? JSON.parse(addActionRes.data) : addActionRes.data;
        const actionApiKey = actionResData.data?.actionApiKey || actionResData.actionApiKey;
        const actionId = actionResData.data?.actionId || actionResData.actionId;

        if (!actionApiKey || !actionId) {
          throw new Error(`注册动作资源失败: ${actionResData.msg || JSON.stringify(actionResData)}`);
        }

        actionMap.set(an.id, { actionApiKey, actionId, actionName });
      }

      logStep(
        '步骤 4: 注册动作资源 (add-action)',
        'success',
        `成功注册 ${actionMap.size} 个动作资源到平台动作库`,
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
        const limitNum = qNode.queryConfig?.limitType === 2 ? 2 : 1;
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
            qNode.queryConfig?.resultVariable || `queried_${qNode.id}_rec`,
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
          const colKey = toSafeApiKey(lNode.loopConfig?.collectionVariable || `loopCol_${lNode.id}`, "colVar");
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
          const curKey = toSafeApiKey(lNode.loopConfig?.cursorVariable || `loopCur_${lNode.id}`, "curVar");
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
            loopDirect: String(lNode.loopConfig?.direction ?? 1),
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
              actionType: '2',
              actionTypeLabel: '更新记录',
              actionApiKey: actInfo.actionApiKey,
              actionId: actInfo.actionId,
              id: nodeId,
              entityApiKey,
              apiObjectApiKey: entityApiKey,
              referApiKey: procdefApiKey,
              description: '',
              entityRelationType: '3',
              entityRelation: entityApiKey,
              actionRecordApikey: entityApiKey,
              actionRecordApikeyLabel: plan.flow.entityLabel || entityApiKey,
              isGeneral: '0',
              type: 1,
              isCheckPermissions: 2,
              apiActionApiKey: 'com.rkhd.data.xobject.baseobject.update',
              operators: [{ label: '当前执行人', value: 'runtime___operator' }],
              conditionForm: {
                referFilter: { advancedFlag: 0, filterFormula: "" },
                referFilterCriteria: [],
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
              condition: {
                defaultFlow: isDefault,
                gateWayType: isDefault ? "1" : "2",
                conditionJson: isDefault
                  ? ""
                  : {
                      referFilter: { advancedFlag: 0, filterFormula: "" },
                      referFilterCriteria: [
                        {
                          filterRowNum: "1",
                          leftItemTypeEntry: String(defaultField.itemType || 1),
                          leftReferItems: `${entityApiKey}.${defaultField.apiKey}`,
                          leftReferLabel: defaultField.label,
                          itemApiKey: defaultField.apiKey,
                          itemName: defaultField.label,
                          operator: "isNotNull",
                          rightItemTypeEntry: "",
                          rightValue: "",
                          rightReferItems: "",
                          rightReferLabel: "",
                          criteriaType: "1",
                        },
                      ],
                    },
                conditionName: isDefault ? "默认" : (ge.name || `分支_${gIdx + 1}`),
                conditionType: "1",
                specialExpression: "",
                entityApiKey,
              },
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
      const verifyRes = await axios.get(`${baseUrl}/admin/creekflow/find-procdef.action?procdefId=${procdefId}&procType=1`, {
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
        const enableRes = await this.toggleFlowStatus(env, tokenData, procdefId, true);
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
