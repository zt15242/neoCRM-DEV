import * as XLSX from 'xlsx';
import { ExcelFieldRow, FieldMetadata } from '../../shared/types';

export const TYPE_NAME_MAP: Record<string, number> = {
  '文本': 1,
  '单行文本': 1,
  'text': 1,
  'string': 1,

  '多行文本': 2,
  '长文本': 2,
  'textarea': 2,

  '单选': 3,
  '单选列表': 3,
  '下拉': 3,
  'picklist': 3,
  'select': 3,

  '多选': 4,
  '多选列表': 4,
  'multi-picklist': 4,

  '整数': 5,
  '数字': 5,
  'int': 5,
  'integer': 5,

  '金额': 6,
  '货币': 6,
  'currency': 6,

  '日期': 7,
  'date': 7,

  '日期时间': 21,
  'datetime': 21,

  '电话': 22,
  '电话号码': 22,
  '手机': 22,
  'phone': 22,

  '邮箱': 23,
  '电子邮箱': 23,
  'email': 23,

  '网址': 24,
  '链接': 24,
  'url': 24,

  '布尔': 31,
  '布尔值': 31,
  '开关': 31,
  'boolean': 31,

  '百分比': 33,
  'percent': 33,

  '富文本': 40,
  'richtext': 40,
};

export const REVERSE_TYPE_NAME_MAP: Record<number, string> = {
  1: '单行文本',
  2: '多行文本',
  3: '单选列表',
  4: '多选列表',
  5: '整数',
  6: '金额',
  7: '日期',
  21: '日期时间',
  22: '电话',
  23: '邮箱',
  24: '网址',
  31: '布尔值',
  33: '百分比',
  40: '富文本',
};

/**
 * 智能映射表头键名
 */
function findColumnKey(row: Record<string, any>, candidates: string[]): string | null {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const found = keys.find((k) => k.trim().toLowerCase().includes(c.toLowerCase()));
    if (found) return found;
  }
  return null;
}

/**
 * 解析选项字符串为选项列表结构
 * 支持格式: "启用:1, 停用:2" 或 "选项A, 选项B, 选项C"
 */
export function parseOptionsString(rawStr?: string): { optionLabel: string; optionCode: number }[] {
  if (!rawStr || typeof rawStr !== 'string' || !rawStr.trim()) return [];

  const items = rawStr
    .split(/[,，;\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const result: { optionLabel: string; optionCode: number }[] = [];
  let autoCode = 1;

  for (const item of items) {
    if (item.includes(':') || item.includes('：')) {
      const parts = item.split(/[:：]/);
      const label = parts[0].trim();
      const code = parseInt(parts[1]?.trim() || '', 10);
      result.push({
        optionLabel: label,
        optionCode: isNaN(code) ? autoCode++ : code,
      });
    } else {
      result.push({
        optionLabel: item,
        optionCode: autoCode++,
      });
    }
  }

  return result;
}

/**
 * 解析 Excel 文件并转化为规范字段行
 */
export function parseExcelFile(
  fileBuffer: ArrayBuffer,
  existingFields: FieldMetadata[] = []
): { rows: ExcelFieldRow[]; error?: string } {
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return { rows: [], error: 'Excel 文件中未找到有效工作表' };
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rawData: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rawData.length) {
      return { rows: [], error: 'Excel 表格中没有数据行' };
    }

    const existingApiKeys = new Set(
      existingFields.map((f) => f.apiKey.toLowerCase().replace(/__c$/, ''))
    );

    const rows: ExcelFieldRow[] = [];

    rawData.forEach((row, index) => {
      // 智能识别各列名
      const labelKey = findColumnKey(row, ['字段名称', '显示名称', '名称', 'label', 'name']);
      const apiKeyKey = findColumnKey(row, ['api', '标识', 'key', 'code', '字段标识']);
      const typeKey = findColumnKey(row, ['类型', '字段类型', 'type']);
      const lengthKey = findColumnKey(row, ['长度', '最大长度', 'length']);
      const decimalKey = findColumnKey(row, ['小数', '小数位', 'decimal']);
      const optionsKey = findColumnKey(row, ['选项', '下拉', 'options', 'pickoption', '枚举']);
      const descKey = findColumnKey(row, ['描述', '说明', '备注', 'description', 'desc']);

      const rawLabel = String(labelKey ? row[labelKey] : '').trim();
      let rawApiKey = String(apiKeyKey ? row[apiKeyKey] : '').trim().replace(/__c$/, '');
      const rawType = String(typeKey ? row[typeKey] : '').trim().toLowerCase();
      const rawLength = lengthKey ? parseInt(row[lengthKey], 10) : NaN;
      const rawDecimal = decimalKey ? parseInt(row[decimalKey], 10) : NaN;
      const rawOptions = optionsKey ? String(row[optionsKey]).trim() : '';
      const rawDesc = descKey ? String(row[descKey]).trim() : '';

      // 跳过纯空行
      if (!rawLabel && !rawApiKey && !rawType) return;

      // 映射类型
      let itemType = 1; // 默认文本
      if (TYPE_NAME_MAP[rawType]) {
        itemType = TYPE_NAME_MAP[rawType];
      } else {
        const num = parseInt(rawType, 10);
        if (!isNaN(num) && REVERSE_TYPE_NAME_MAP[num]) {
          itemType = num;
        }
      }

      // 校验状态
      let status: ExcelFieldRow['status'] = 'valid';
      let errorMessage = '';

      if (!rawLabel) {
        status = 'invalid';
        errorMessage = '缺少字段名称';
      } else if (!rawApiKey) {
        status = 'invalid';
        errorMessage = '缺少 API Key';
      } else if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(rawApiKey)) {
        status = 'invalid';
        errorMessage = 'API Key 必须以字母开头且仅含字母/数字/下划线';
      } else if (existingApiKeys.has(rawApiKey.toLowerCase())) {
        status = 'exists';
        errorMessage = '当前实体中已存在同名 API Key 字段';
      }

      // 选项校验
      let pickOption: { optionLabel: string; optionCode: number }[] = [];
      if ([3, 4].includes(itemType)) {
        pickOption = parseOptionsString(rawOptions);
        if (pickOption.length === 0 && status === 'valid') {
          status = 'invalid';
          errorMessage = '单选/多选字段必须提供下拉选项内容';
        }
      }

      rows.push({
        id: `row_${index}_${Date.now()}_${Math.random()}`,
        label: rawLabel,
        apiKey: rawApiKey,
        itemType,
        typeName: REVERSE_TYPE_NAME_MAP[itemType] || '单行文本',
        maxLength: !isNaN(rawLength) ? rawLength : [1, 2, 40].includes(itemType) ? 200 : 16,
        decimal: !isNaN(rawDecimal) ? rawDecimal : 2,
        optionsStr: rawOptions,
        pickOption,
        description: rawDesc,
        status,
        errorMessage,
        selected: status === 'valid', // 校验通过默认勾选
      });
    });

    return { rows };
  } catch (err: any) {
    return { rows: [], error: `解析 Excel 失败: ${err.message}` };
  }
}

/**
 * 导出标准模板 Excel 文件
 */
export function generateTemplateExcel(entityApiKey = 'customEntity__c'): void {
  const headers = [
    '字段名称 (必填)',
    'API标识 (必填)',
    '字段类型 (必填)',
    '最大长度',
    '小数位数',
    '下拉选项 (单选/多选时填)',
    '字段说明 (可选)',
  ];

  const sampleRows = [
    [
      '客户等级',
      'customerLevel',
      '单选列表',
      '',
      '',
      '战略客户:1, 重点客户:2, 普通客户:3',
      '客户重要程度评级（支持指定数字代码）',
    ],
    [
      '企业规模',
      'companyScale',
      '单选列表',
      '',
      '',
      '50人以下, 50-200人, 200人以上',
      '自动生成 1, 2, 3 代码',
    ],
    [
      '信用额度',
      'creditLimit',
      '金额',
      16,
      2,
      '',
      '授信额度（元）',
    ],
    [
      '统一信用代码',
      'socialCreditCode',
      '单行文本',
      100,
      '',
      '',
      '企业营业执照统一社会信用代码',
    ],
    [
      '企业成立日期',
      'foundedDate',
      '日期',
      '',
      '',
      '',
      '工商成立日期',
    ],
    [
      '官方网址',
      'officialSite',
      '网址',
      '',
      '',
      '',
      '企业官方网站地址',
    ],
    [
      '是否重点关注',
      'isKeyFocus',
      '布尔值',
      '',
      '',
      '',
      '开关状态',
    ],
    [
      '补充备注',
      'remarks',
      '多行文本',
      1000,
      '',
      '',
      '详细备忘录',
    ],
  ];

  const worksheetData = [headers, ...sampleRows];
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  // 设置列宽
  worksheet['!cols'] = [
    { wch: 18 }, // 字段名称
    { wch: 22 }, // API标识
    { wch: 14 }, // 字段类型
    { wch: 10 }, // 最大长度
    { wch: 10 }, // 小数位数
    { wch: 36 }, // 下拉选项
    { wch: 32 }, // 字段说明
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '字段批量创建模板');

  // 生成并触发浏览器下载
  XLSX.writeFile(workbook, `NeoCRM_${entityApiKey}_字段批量导入模板.xlsx`);
}
