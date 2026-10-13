import { ApprovalDeployPlan, ApprovalNodeItem, ApprovalApproverRule } from '../../../shared/types';

/**
 * 清理大模型可能夹带的 JSON 注释或尾随逗号
 */
function sanitizeJsonString(raw: string): string {
  const withoutComments = raw.replace(/^[ \t]*\/\/.*$/gm, '');
  return withoutComments.replace(/,\s*([}\]])/g, '$1').trim();
}

/**
 * 从 AI 消息内容中提取新版审批流代码级部署方案 (ApprovalDeployPlan)
 */
export function extractApprovalPlanFromText(content: string): ApprovalDeployPlan | null {
  if (!content) return null;

  // 1. 优先尝试从专用代码块中提取 (忽略大小写: ```json:approval-plan, ```approval-plan, ```json)
  const codeBlockRegex = /```(?:[a-zA-Z0-9_:.-]*)[ \t]*\r?\n([\s\S]*?)(?:```|$)/gi;
  let blockMatch;

  while ((blockMatch = codeBlockRegex.exec(content)) !== null) {
    const candidate = sanitizeJsonString(blockMatch[1].trim());
    if (
      candidate.startsWith('{') &&
      candidate.includes('"flow"') &&
      candidate.includes('"nodes"') &&
      (candidate.includes('approval') || candidate.includes('approver') || candidate.includes('UserTask') || candidate.includes('withdrawFlag'))
    ) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed.flow && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
          return normalizeApprovalPlan(parsed);
        }
      } catch {}
    }
  }

  // 2. 尝试从全文本中寻找第一个包含 {"flow": ... "nodes": ...} 的完整 JSON 块
  const firstBrace = content.indexOf('{"flow"');
  const altBrace = firstBrace === -1 ? content.indexOf('{\n  "flow"') : firstBrace;
  const startIdx = altBrace !== -1 ? altBrace : content.indexOf('{');

  if (startIdx !== -1 && content.includes('"nodes"') && (content.includes('UserTask') || content.includes('approverRules'))) {
    let openCount = 0;
    let endIdx = -1;
    for (let i = startIdx; i < content.length; i++) {
      if (content[i] === '{') openCount++;
      else if (content[i] === '}') {
        openCount--;
        if (openCount === 0) {
          endIdx = i + 1;
          break;
        }
      }
    }

    if (endIdx !== -1) {
      const jsonCandidate = sanitizeJsonString(content.slice(startIdx, endIdx));
      try {
        const parsed = JSON.parse(jsonCandidate);
        if (parsed.flow && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
          return normalizeApprovalPlan(parsed);
        }
      } catch {}
    }
  }

  return null;
}

export function normalizeApprovalPlan(parsed: any): ApprovalDeployPlan {
  const flow = parsed.flow || {};
  const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];

  const nodes: ApprovalNodeItem[] = rawNodes.map((n: any, idx: number) => {
    const rawRules = Array.isArray(n.approverRules) ? n.approverRules : [];
    const approverRules: ApprovalApproverRule[] = rawRules.map((r: any) => ({
      assignmentType: String(r.assignmentType || '202') as any,
      itemApiKey: r.itemApiKey,
      itemApiKeyLabel: r.itemApiKeyLabel,
      approvers: Array.isArray(r.approvers)
        ? r.approvers.map((ap: any) => ({
            apiKey: ap.apiKey,
            label: ap.label || '指定审批人',
            infoType: ap.infoType,
          }))
        : undefined,
    }));

    const rawFields = Array.isArray(n.editableFields) ? n.editableFields : [];
    const editableFields = rawFields.map((ef: any) => ({
      itemApiKey: ef.itemApiKey,
      itemLabel: ef.itemLabel || ef.itemApiKey,
      isEditable: ef.isEditable ?? 1,
      isRequired: ef.isRequired ?? 0,
    }));

    return {
      id: n.id || `node_${idx + 1}`,
      nodeType: n.nodeType || 'UserTask',
      name: n.name || n.label || `节点 ${idx + 1}`,
      description: n.description,
      taskType: String(n.taskType || '1') as any,
      countersign: n.countersign,
      approverRules: approverRules.length > 0 ? approverRules : undefined,
      editableFields: editableFields.length > 0 ? editableFields : undefined,
      plussignFlag: n.plussignFlag,
      delegationFlag: n.delegationFlag,
      returnTargetType: n.returnTargetType,
      commentFlag: n.commentFlag,
      afterAgreeAction: n.afterAgreeAction,
    };
  });

  return {
    flow: {
      processName: flow.processName || flow.name || '审批流配置方案',
      entityApiKey: flow.entityApiKey || flow.entity || 'contract',
      entityLabel: flow.entityLabel || flow.entityApiKey || '业务实体',
      bizTypeApiKey: flow.bizTypeApiKey,
      bizTypeLabel: flow.bizTypeLabel,
      startupOrder: Number(flow.startupOrder) || 1,
      description: flow.description || '',
      withdrawFlag: flow.withdrawFlag ?? 1,
      singleStepWithdrawFlag: flow.singleStepWithdrawFlag ?? 2,
      sendApprovalNotice: flow.sendApprovalNotice ?? 1,
      entryFormula: flow.entryFormula || '',
    },
    nodes,
    edges: Array.isArray(parsed.edges) ? parsed.edges : [],
  };
}
