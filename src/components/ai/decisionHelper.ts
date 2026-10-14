export interface DecisionOption {
  label: string;
  value: string;
  description?: string;
}

export interface DecisionItem {
  id: string;
  title: string;
  question: string;
  options: DecisionOption[];
}

export interface DecisionRequestPayload {
  title?: string;
  items: DecisionItem[];
}

/**
 * 智能构建与业务上下文精准匹配的决策选项
 */
function buildContextualOptions(title: string, question: string): DecisionOption[] {
  const q = question.replace(/[`*]/g, "").trim();
  const options: DecisionOption[] = [];

  // 1. 合同对象 / 业务类型确认 (严格隔离，杜绝工单/维保串线)
  if ((title.includes("业务类型") || q.includes("busiType") || title.includes("主对象")) && (q.includes("合同") || q.includes("contract"))) {
    options.push({
      label: "作用于合同所有业务类型 (推荐)",
      value: "适用于合同主对象所有业务类型",
      description: "不限制特定合同类型，全量合同生效",
    });
    options.push({
      label: "指定特定业务类型 (如框架合同/销售合同)",
      value: "指定特定合同业务类型进行收敛",
      description: "仅针对特定业务类型的合同触发",
    });
    return options;
  }

  // 2. 字段定义 / 折扣率 / 金额维度
  if (title.includes("字段") || q.includes("discountRate") || q.includes("折扣") || q.includes("折让")) {
    const mField = q.match(/（如\s*([a-zA-Z0-9_]+)）|\((?:如\s*)?([a-zA-Z0-9_]+)\)/);
    const fieldName = mField ? (mField[1] || mField[2]) : "自定义字段";
    options.push({
      label: "初期先仅采用标准金额 (amount) 维度 (推荐)",
      value: "先采用标准金额 amount 维度流转",
      description: "使用已存在的标准金额字段分流，无需新建字段",
    });
    options.push({
      label: `使用/新增自定义字段 (${fieldName})`,
      value: `使用自定义字段 ${fieldName}`,
      description: `在租户元数据中补充创建 ${fieldName} 字段`,
    });
    return options;
  }

  // 3. 审批人选型 / 财务会签 / 主管审批
  if (title.includes("审批") || title.includes("选型") || title.includes("会签") || title.includes("财务")) {
    const mPreset = q.match(/(?:预设为|配置为)[“"「]([^”"」]+)[”"」]/);
    const presetVal = mPreset ? mPreset[1] : "指定角色：财务经理（并行会签 100% 通过）";
    options.push({
      label: `${presetVal} (推荐)`,
      value: presetVal,
      description: "按方案预设的审批人角色策略流转",
    });
    options.push({
      label: "调整为指定部门主管或由提单人自选",
      value: "调整为指定部门主管或人员自选",
      description: "按部门架构流转或由提单人自选",
    });
    return options;
  }

  // 4. 退回 / 驳回范围策略
  if (title.includes("退回") || title.includes("驳回")) {
    options.push({
      label: "按默认规则：退回上一节点 / 退回提交人 (推荐)",
      value: "按默认逐级退回规则",
      description: "财务退回上一级主管，主管退回提交人",
    });
    options.push({
      label: "支持退回至之前任意节点",
      value: "支持退回至之前任意节点",
      description: "审批人可自由选择回退到任意已通过历史节点",
    });
    return options;
  }

  // 5. 维保工单与服务个案 (仅在显式包含工单/维保关键词时才进入)
  if ((q.includes("工单") || q.includes("维保")) && (q.includes("equipmentMaintenance") || q.includes("case"))) {
    options.push({
      label: "使用自定义对象 equipmentMaintenance__c (设备维保工单) (推荐)",
      value: "使用自定义业务对象 equipmentMaintenance__c (设备维保工单)",
      description: "租户已启用的完整工单自定义对象",
    });
    options.push({
      label: "使用标准对象 case (服务个案)",
      value: "使用标准对象 case (服务个案)",
      description: "通用服务个案标准对象",
    });
    return options;
  }

  // 6. 状态流转联动控制
  if (title.includes("状态") || q.includes("status") || q.includes("待派工") || q.includes("处理中")) {
    options.push({
      label: "自动变更为处理中状态 (推荐)",
      value: "派工成功后直接将工单状态联动为处理中",
      description: "派单成功后系统自动联动流转状态",
    });
    options.push({
      label: "保留在待派工状态并发送通知提醒",
      value: "保留在待派工状态并发送通知提醒",
      description: "保留初始状态，由接单人人工核实后开工",
    });
    return options;
  }

  // 7. 动态分析问句中“是(否)...？还是...”或选项提示
  const mHaishi = q.match(/(?:是否|若)?([^？?；;。!！\n]+?)[？?；;。!！\s]*还是([^？?；;。!！\n]+)/);
  if (mHaishi) {
    const p1 = mHaishi[1].replace(/^(?:系统|当前|我们|租户)?(?:是否|是否需要|是否直接|能否)?/, "").trim();
    const p2 = mHaishi[2].replace(/^(?:需要|直接)?/, "").trim();
    if (p1.length >= 2 && p2.length >= 2) {
      options.push({
        label: `${p1} (推荐)`,
        value: p1,
        description: "采纳方案当前设定的默认流转规则",
      });
      options.push({
        label: p2,
        value: p2,
        description: "按备选业务规则调整",
      });
      return options;
    }
  }

  // 8. 默认兜底
  options.push({
    label: "采纳方案建议配置 (推荐)",
    value: "采纳当前推荐方案配置",
    description: "按 AI 架构师建议的最佳实践执行",
  });
  options.push({
    label: "按自定义业务规则调整",
    value: "按自定义规则调整",
    description: "可在下方'其他'选项中自由输入您的具体要求",
  });
  return options;
}

/**
 * 从消息中解析决策确认请求 (完全支持多样化 JSON 格式及 Markdown 启发式解析)
 */
export function extractDecisionsFromText(content: string): DecisionRequestPayload | null {
  if (!content) return null;

  // 1. 优先从 ```json:decision-request 中提取结构化决策
  const codeBlockRegex = /```(?:json:decision-request|decision-request)[ \t]*\r?\n([\s\S]*?)(?:```|$)/i;
  const match = codeBlockRegex.exec(content);
  if (match) {
    try {
      const parsed = JSON.parse(match[1].trim());

      // 格式 A: { items: [...] }
      if (Array.isArray(parsed.items) && parsed.items.length > 0) {
        return parsed;
      }

      // 格式 B: { questions: [...] }
      if (Array.isArray(parsed.questions) && parsed.questions.length > 0) {
        return {
          title: parsed.title || "方案决策与待确认事项",
          items: parsed.questions.map((q: any, i: number) => ({
            id: q.id || `decision_${i + 1}`,
            title: q.title || q.header || `决策项 ${i + 1}`,
            question: q.question || q.prompt || "",
            options: (q.options || []).map((opt: any) => ({
              label: typeof opt === "string" ? opt : opt.label,
              value: typeof opt === "string" ? opt : (opt.value || opt.label),
              description: typeof opt === "object" ? opt.description : undefined,
            })),
          })),
        };
      }

      // 格式 C: { question: "...", options: [...] } (大模型单问卷输出)
      if (Array.isArray(parsed.options) && parsed.options.length > 0) {
        return {
          title: parsed.title || "方案核对与关键业务决策",
          items: [
            {
              id: "decision_1",
              title: parsed.question || parsed.title || "请确认审批架构方案：",
              question: parsed.question || "请从以下预设方案中选择适合贵司业务的规则：",
              options: parsed.options.map((opt: any) => ({
                label: typeof opt === "string" ? opt : (opt.label || opt.name || opt.key),
                value: typeof opt === "string" ? opt : (opt.value || opt.label || opt.key),
                description: typeof opt === "object" ? opt.description : undefined,
              })),
            },
          ],
        };
      }

      // 格式 D: 直接为数组 [ { ... }, { ... } ]
      if (Array.isArray(parsed) && parsed.length > 0) {
        return {
          title: "方案决策与待确认事项",
          items: parsed.map((item: any, i: number) => ({
            id: item.id || `decision_${i + 1}`,
            title: item.title || item.question || `决策项 ${i + 1}`,
            question: item.question || "",
            options: (item.options || []).map((opt: any) => ({
              label: typeof opt === "string" ? opt : opt.label,
              value: typeof opt === "string" ? opt : (opt.value || opt.label),
              description: typeof opt === "object" ? opt.description : undefined,
            })),
          })),
        };
      }
    } catch {}
  }

  // 2. 启发式解析正文中的待确认清单 (例如 1. **折扣率字段依赖**：... 或 1. **确认事项 1**：...)
  if (
    !content.includes("待用户核对与确认事项清单") &&
    !content.includes("关键业务决策") &&
    !/确认事项\s*[0-9一二三四五六七八九十]/.test(content)
  ) {
    return null;
  }

  const sectionIdx = content.indexOf("待用户核对与确认事项清单");
  const altIdx = sectionIdx !== -1 ? sectionIdx : content.indexOf("关键业务决策");
  const targetText = altIdx !== -1 ? content.slice(altIdx) : content;

  // 拆分行，提取带有序号的问题项
  const lines = targetText.split("\n");
  const rawItems: Array<{ idx: number; tag: string; bodyLines: string[] }> = [];
  let curItem: any = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // 匹配如: 1. **折扣率字段依赖**： 或 1. **确认事项 1 (主对象)**:
    const itemMatch = line.match(/^(?:[1-9]\.|\•|\-|\*|\[\s*\])?\s*\**(?:\d+[\.、]\s*)?(?:(?:确认事项|决策事项|决策项)\s*[0-9一二三四五六七八九十]*\s*[（\(]?([^）\)]*)[）\)]?|([^\n：:]{2,30}))\**\s*[:：]\s*(.*)$/);

    if (itemMatch) {
      if (curItem) rawItems.push(curItem);
      const tag = (itemMatch[1] || itemMatch[2] || "").replace(/^\*+|\*+$/g, "").trim();
      const rest = (itemMatch[3] || "").replace(/^\*+|\*+$/g, "").trim();
      if (tag && !tag.includes("待用户核对") && !tag.includes("下一步指引") && !tag.includes("请从以下")) {
        curItem = {
          idx: rawItems.length + 1,
          tag,
          bodyLines: rest ? [rest] : [],
        };
      } else {
        curItem = null;
      }
    } else if (curItem) {
      if (line.startsWith("---") || line.startsWith("```") || line.includes("💡") || line.includes("下一步指引") || line.includes("请从以下")) {
        rawItems.push(curItem);
        curItem = null;
      } else if (line) {
        curItem.bodyLines.push(line.replace(/^[\s\-•*]+/, "").replace(/^\*+|\*+$/g, "").trim());
      }
    }
  }
  if (curItem) rawItems.push(curItem);

  if (rawItems.length === 0) return null;

  const items: DecisionItem[] = rawItems.map((it) => {
    const rawQuestion = it.bodyLines.join(" ");
    const cleanQuestion = rawQuestion
      .replace(/\*\*/g, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .trim();

    const title = it.tag.includes("确认") || it.tag.includes("事项") ? it.tag : `确认事项 ${it.idx}：${it.tag}`;
    const options = buildContextualOptions(title, rawQuestion);

    return {
      id: `decision_${it.idx}`,
      title,
      question: cleanQuestion,
      options,
    };
  });

  return {
    title: "方案核对与关键业务决策",
    items,
  };
}
