import * as XLSX from 'xlsx';
import { FieldMetadata } from '../../shared/types';

export interface ExcelDataRow {
  _rowId: string;
  _action: 'create' | 'update';
  id?: string | number;
  data: Record<string, any>;
  displayPreview: string; // 简要预览
  status: 'pending' | 'success' | 'failed' | 'skipped';
  errorMessage?: string;
  selected: boolean;
}

/**
 * 判断字段是否为只读/系统属性 (模板中跳过或标注)
 */
export function isReadOnlyField(f: FieldMetadata): boolean {
  if (f.itemType === 9 || f.itemType === 13) return true; // 自动编号
  if (f.itemType === 20 || f.itemType === 27 || f.itemType === 28) return true; // 计算/汇总
  if (['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'deleteFlag', 'version'].includes(f.apiKey)) {
    return true;
  }
  return false;
}

/**
 * 生成当前对象的标准业务数据 Excel 导入模板
 */
export function generateDataTemplateExcel(
  entityApiKey: string,
  entityLabel: string,
  fields: FieldMetadata[]
): void {
  // 过滤可填字段
  const writableFields = fields.filter((f) => !isReadOnlyField(f));

  // 表头定义: 第一列为 ID (更新用)，后面为各业务字段
  const headers = [
    '数据ID(仅更新填) (id)',
    ...writableFields.map((f) => `${f.label} (${f.apiKey})`),
  ];

  // 示例数据行
  const sampleRow1 = [
    '', // 新增时留空
    ...writableFields.map((f) => {
      if (f.itemType === 1) return '示例文本内容';
      if (f.itemType === 5) return 100;
      if (f.itemType === 6) return 8800.50;
      if (f.itemType === 7) return '2026-06-18';
      if (f.itemType === 21) return '2026-06-18 10:30:00';
      if (f.itemType === 22) return '13800000000';
      if (f.itemType === 23) return 'demo@example.com';
      if (f.itemType === 31) return 'true';
      if ([3, 4].includes(f.itemType) && f.pickOption?.length) {
        return f.pickOption[0].optionCode ?? f.pickOption[0].optionLabel;
      }
      if (f.referObjectApiKey) return '4172298234169380'; // 关联 ID 示例
      return '';
    }),
  ];

  const sampleRow2 = [
    '4172325833984013', // 更新示例: 填入现有数据 ID
    ...writableFields.map((f, idx) => {
      if (idx === 0) return '更新后的名称示例';
      return '';
    }),
  ];

  const data = [headers, sampleRow1, sampleRow2];
  const worksheet = XLSX.utils.aoa_to_sheet(data);

  // 设置列宽
  worksheet['!cols'] = [
    { wch: 24 }, // ID
    ...writableFields.map((f) => ({ wch: Math.max(16, f.label.length * 3 + f.apiKey.length) })),
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '数据导入');

  XLSX.writeFile(workbook, `NeoCRM_${entityLabel}_(${entityApiKey})_数据导入模板.xlsx`);
}

/**
 * 解析用户上传的 Excel 数据文件
 */
export function parseDataExcelFile(
  fileBuffer: ArrayBuffer,
  fields: FieldMetadata[]
): { rows: ExcelDataRow[]; totalCount: number; createCount: number; updateCount: number; error?: string } {
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { rows: [], totalCount: 0, createCount: 0, updateCount: 0, error: '未找到工作表' };

    const sheet = workbook.Sheets[sheetName];
    const rawData: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rawData.length) {
      return { rows: [], totalCount: 0, createCount: 0, updateCount: 0, error: '表格中没有数据行' };
    }

    // 建立表头映射字典: 支持 "客户名称 (accountName)"、"客户名称"、"accountName"
    const fieldMap: Record<string, FieldMetadata> = {};
    fields.forEach((f) => {
      fieldMap[f.apiKey.toLowerCase()] = f;
      fieldMap[f.label.toLowerCase()] = f;
      fieldMap[`${f.label} (${f.apiKey})`.toLowerCase()] = f;
      fieldMap[`${f.label}(${f.apiKey})`.toLowerCase()] = f;
    });

    const rows: ExcelDataRow[] = [];
    let createCount = 0;
    let updateCount = 0;

    rawData.forEach((rawRow, index) => {
      const recordPayload: Record<string, any> = {};
      let rowId: string | number | undefined = undefined;

      // 遍历每一列
      Object.entries(rawRow).forEach(([colKey, val]) => {
        const cleanCol = colKey.trim().toLowerCase();
        const strVal = typeof val === 'string' ? val.trim() : val;
        if (strVal === '' || strVal === null || strVal === undefined) return;

        // 检查是否为 ID 列
        if (
          cleanCol === 'id' ||
          cleanCol.includes('(id)') ||
          cleanCol.includes('数据id') ||
          cleanCol === '记录id'
        ) {
          rowId = String(strVal);
          return;
        }

        // 匹配字段
        let matchedField: FieldMetadata | undefined = fieldMap[cleanCol];
        if (!matchedField) {
          // 模糊尝试提取括号内的 apiKey: 如 "xxx (accountName)"
          const bracketMatch = colKey.match(/\(([a-zA-Z0-9_]+)\)/);
          if (bracketMatch && fieldMap[bracketMatch[1].toLowerCase()]) {
            matchedField = fieldMap[bracketMatch[1].toLowerCase()];
          }
        }

        if (matchedField) {
          // 跳过只读字段
          if (isReadOnlyField(matchedField)) return;

          // 类型转换处理
          if (matchedField.itemType === 5) {
            const num = parseInt(strVal, 10);
            recordPayload[matchedField.apiKey] = isNaN(num) ? strVal : num;
          } else if (matchedField.itemType === 6 || matchedField.itemType === 33) {
            const num = parseFloat(strVal);
            recordPayload[matchedField.apiKey] = isNaN(num) ? strVal : num;
          } else if (matchedField.itemType === 31) {
            recordPayload[matchedField.apiKey] =
              strVal === true || strVal === 'true' || strVal === '1' || strVal === '是';
          } else if ([3, 4].includes(matchedField.itemType) && matchedField.pickOption?.length) {
            // 下拉匹配：优先尝试数字代码，若填的是文本标签则自动反查出 optionCode
            const foundOption = matchedField.pickOption.find(
              (o) => String(o.optionLabel) === String(strVal) || String(o.optionCode) === String(strVal)
            );
            recordPayload[matchedField.apiKey] = foundOption?.optionCode !== undefined
              ? foundOption.optionCode
              : strVal;
          } else {
            recordPayload[matchedField.apiKey] = strVal;
          }
        }
      });

      // 如果整行为空则跳过
      if (Object.keys(recordPayload).length === 0 && !rowId) return;

      const isUpdate = !!rowId;
      if (isUpdate) updateCount++;
      else createCount++;

      // 提取预览文字
      const previewText = Object.entries(recordPayload)
        .slice(0, 3)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' | ');

      rows.push({
        _rowId: `row_${index}_${Date.now()}_${Math.random()}`,
        _action: isUpdate ? 'update' : 'create',
        id: rowId,
        data: recordPayload,
        displayPreview: previewText || (isUpdate ? `更新数据 ID: ${rowId}` : '新记录'),
        status: 'pending',
        selected: true,
      });
    });

    return {
      rows,
      totalCount: rows.length,
      createCount,
      updateCount,
    };
  } catch (err: any) {
    return { rows: [], totalCount: 0, createCount: 0, updateCount: 0, error: `解析 Excel 失败: ${err.message}` };
  }
}
