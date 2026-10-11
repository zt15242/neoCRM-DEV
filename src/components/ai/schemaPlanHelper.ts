import { SchemaPlanPayload, PlannedFieldItem } from '../../../shared/types';
import { ITEM_TYPE_MAP } from '../../../shared/constants';

/**
 * 从 AI 消息内容中提取数据建模设计方案
 */
export function extractSchemaPlanFromText(content: string): SchemaPlanPayload | null {
  if (!content) return null;

  // 1. 优先尝试从代码块中提取 (支持 ```json:schema-plan, ```schema-plan, ```json 等)
  const codeBlockRegex = /```(?:json:schema-plan|schema-plan|json)?[ \t]*\r?\n([\s\S]*?)(?:```|$)/g;
  let blockMatch;

  while ((blockMatch = codeBlockRegex.exec(content)) !== null) {
    const candidate = blockMatch[1].trim();
    if (candidate.startsWith('{') && candidate.includes('"entity"') && candidate.includes('"fields"')) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed.entity && Array.isArray(parsed.fields) && parsed.fields.length > 0) {
          return normalizeSchemaPlan(parsed);
        }
      } catch {}
    }
  }

  // 2. 尝试从全文本中寻找第一个包含 {"entity": ... "fields": ...} 的完整 JSON 块
  const firstBrace = content.indexOf('{"entity"');
  const altBrace = firstBrace === -1 ? content.indexOf('{\n  "entity"') : firstBrace;
  const startIdx = altBrace !== -1 ? altBrace : content.indexOf('{');

  if (startIdx !== -1 && content.includes('"fields"')) {
    // 寻找匹配的花括号
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
      const jsonCandidate = content.slice(startIdx, endIdx);
      try {
        const parsed = JSON.parse(jsonCandidate);
        if (parsed.entity && Array.isArray(parsed.fields) && parsed.fields.length > 0) {
          return normalizeSchemaPlan(parsed);
        }
      } catch {}
    }
  }

  // 3. 启发式探测：若消息包含 Markdown 表格与对象名称说明
  const entityMatch = content.match(/(?:对象名称|业务对象|实体名称|Entity)[:：]\s*([^\n(（]+)[(（]([a-zA-Z0-9_]+__c|[a-zA-Z0-9_]+)[)）]/i);
  if (entityMatch && content.includes('|') && (content.includes('API Key') || content.includes('字段类型'))) {
    const label = entityMatch[1].trim();
    const apiKey = entityMatch[2].trim();

    const lines = content.split('\n');
    const fields: PlannedFieldItem[] = [];

    for (const line of lines) {
      if (!line.includes('|')) continue;
      const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
      if (cells.length < 3) continue;

      const keyCell = cells.find((c) => /^[a-zA-Z][a-zA-Z0-9_]*(__c)?$/.test(c.replace(/[`*]/g, '')));
      if (keyCell && !keyCell.toLowerCase().includes('apikey')) {
        const cleanKey = keyCell.replace(/[`*]/g, '');
        const fieldLabel = cells[0].replace(/[*`_]/g, '');

        let itemType = 1;
        let typeName = '单行文本';
        const typeStr = cells.find((c) => /文本|数字|金额|日期|关联|单选|多选|图片/.test(c)) || '';
        if (typeStr.includes('金额')) { itemType = 6; typeName = '金额'; }
        else if (typeStr.includes('关联')) { itemType = 10; typeName = '关联关系'; }
        else if (typeStr.includes('单选')) { itemType = 3; typeName = '单选列表'; }
        else if (typeStr.includes('多选')) { itemType = 4; typeName = '多选列表'; }
        else if (typeStr.includes('日期时间')) { itemType = 8; typeName = '日期时间'; }
        else if (typeStr.includes('日期')) { itemType = 7; typeName = '日期'; }
        else if (typeStr.includes('整数') || typeStr.includes('数字')) { itemType = 5; typeName = '整数'; }

        if (!fields.some((f) => f.apiKey === cleanKey)) {
          fields.push({
            apiKey: cleanKey,
            label: fieldLabel,
            itemType,
            typeName,
          });
        }
      }
    }

    if (fields.length >= 2) {
      return {
        entity: {
          apiKey,
          label,
          enableScriptExecutor: true,
        },
        fields,
      };
    }
  }

  return null;
}

function normalizeSchemaPlan(parsed: any): SchemaPlanPayload {
  return {
    entity: {
      apiKey: parsed.entity.apiKey || 'customObject__c',
      label: parsed.entity.label || '自定义对象',
      description: parsed.entity.description,
      autoNumberFormat: parsed.entity.autoNumberFormat,
      enableScriptExecutor: parsed.entity.enableScriptExecutor ?? true,
      enableBusitype: parsed.entity.enableBusitype ?? false,
    },
    fields: parsed.fields.map((f: any) => ({
      apiKey: f.apiKey,
      label: f.label,
      itemType: Number(f.itemType) || 1,
      typeName: f.typeName || ITEM_TYPE_MAP[Number(f.itemType) || 1] || '单行文本',
      maxLength: f.maxLength,
      decimal: f.decimal,
      referObjectApiKey: f.referObjectApiKey,
      pickOption: f.pickOption,
      description: f.description,
    })),
  };
}
