import { WorkflowDeployPlan, WorkflowNodeItem, WorkflowVariableItem } from '../../../shared/types';

/**
 * 清理大模型可能夹带的 JSON 注释或尾随逗号
 */
function sanitizeJsonString(raw: string): string {
  // 移除行尾注释 (避免误伤字符串中的 http://)
  const withoutComments = raw.replace(/^[ \t]*\/\/.*$/gm, '');
  // 移除对象或数组末尾的多余逗号
  return withoutComments.replace(/,\s*([}\]])/g, '$1').trim();
}

/**
 * 从 AI 消息内容中提取自动流程代码级部署方案 (WorkflowDeployPlan)
 */
export function extractWorkflowPlanFromText(content: string): WorkflowDeployPlan | null {
  if (!content) return null;

  // 1. 优先尝试从专用代码块中提取 (忽略大小写: ```json:workflow-plan, ```workflow-plan, ```json)
  const codeBlockRegex = /```(?:[a-zA-Z0-9_:.-]*)[ \t]*\r?\n([\s\S]*?)(?:```|$)/gi;
  let blockMatch;

  while ((blockMatch = codeBlockRegex.exec(content)) !== null) {
    const candidate = sanitizeJsonString(blockMatch[1].trim());
    if (
      candidate.startsWith('{') &&
      (candidate.includes('"flow"') || candidate.includes('"baseInfo"') || candidate.includes('"processName"') || candidate.includes('"title"')) &&
      (candidate.includes('"nodes"') || candidate.includes('"tasks"'))
    ) {
      try {
        const parsed = JSON.parse(candidate);
        const flowObj = parsed.flow || parsed.baseInfo || (parsed.entityApiKey ? parsed : null);
        const nodesArr = parsed.nodes || parsed.tasks;
        if (flowObj && Array.isArray(nodesArr) && nodesArr.length > 0) {
          return normalizeWorkflowPlan(parsed);
        }
      } catch {}
    }
  }

  // 2. 尝试从全文本中寻找包含 {"flow": ... "nodes": ...} 或 {"baseInfo": ... "nodes": ...} 的完整 JSON 块
  const firstBrace = content.indexOf('{"flow"');
  const baseBrace = firstBrace === -1 ? content.indexOf('{"baseInfo"') : firstBrace;
  const titleBrace = baseBrace === -1 ? content.indexOf('{"title"') : baseBrace;
  const startIdx = titleBrace !== -1 ? titleBrace : content.indexOf('{');

  if (startIdx !== -1 && (content.includes('"nodes"') || content.includes('"tasks"'))) {
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
        const flowObj = parsed.flow || parsed.baseInfo || (parsed.entityApiKey ? parsed : null);
        const nodesArr = parsed.nodes || parsed.tasks;
        if (flowObj && Array.isArray(nodesArr) && nodesArr.length > 0) {
          return normalizeWorkflowPlan(parsed);
        }
      } catch {}
    }
  }

  return null;
}

export function normalizeWorkflowPlan(parsed: any): WorkflowDeployPlan {
  const flow = parsed.flow || parsed.baseInfo || {};
  const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : (Array.isArray(parsed.tasks) ? parsed.tasks : []);
  const rawVars = Array.isArray(parsed.variables) ? parsed.variables : [];
  const rawActions = Array.isArray(parsed.actions) ? parsed.actions : [];

  const nodes: WorkflowNodeItem[] = rawNodes.map((n: any, idx: number) => {
    let actionCfg = n.actionConfig;
    if (!actionCfg && n.actionRef && rawActions.length > 0) {
      const matched = rawActions.find((a: any) => a.actionName === n.actionRef || a.name === n.actionRef);
      if (matched) actionCfg = matched;
    }

    return {
      id: n.id || n.taskDefKey || `node_${idx + 1}`,
      nodeType: n.nodeType || 'ServiceTask',
      name: n.name || n.nodeName || n.taskDefName || n.label || `节点 ${idx + 1}`,
      description: n.description,
      actionConfig: actionCfg,
      queryConfig: n.queryConfig,
      loopConfig: n.loopConfig,
      assignmentConfig: n.assignmentConfig,
    };
  });

  const variables: WorkflowVariableItem[] = rawVars.map((v: any) => ({
    apiKey: v.apiKey || v.name || 'var_1',
    describe: v.describe || v.description || v.apiKey || '流程变量',
    variavleType: v.variavleType === 2 || v.variableType === 2 ? 2 : 1,
    variavleDataType: String(v.variavleDataType || v.variableDataType || v.dataType || '1'),
    defaultValue: v.defaultValue,
    decimal: v.decimal,
    objectApiKey: v.objectApiKey,
    objectLabel: v.objectLabel,
  }));

  return {
    flow: {
      processName: flow.processName || flow.name || parsed.title || '自动流程方案',
      actKey: flow.actKey || flow.apiKey || parsed.actKey || `flow_${Date.now()}`,
      entityApiKey: flow.entityApiKey || flow.entity || parsed.entityApiKey || 'account',
      entityLabel: flow.entityLabel || flow.entityApiKey || parsed.entityLabel || parsed.entityApiKey || '业务对象',
      executeType: String(flow.executeType || parsed.executeType || '1'),
      description: flow.description || parsed.description || '',
      enableIntelligentMode: flow.enableIntelligentMode !== undefined ? (flow.enableIntelligentMode ? 1 : 2) : 2,
    },
    variables,
    nodes,
    branches: Array.isArray(parsed.branches) ? parsed.branches : [],
    edges: Array.isArray(parsed.edges) ? parsed.edges : [],
  };
}
