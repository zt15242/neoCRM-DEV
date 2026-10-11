import fs from 'node:fs';
import path from 'node:path';
import { dialog, BrowserWindow } from 'electron';
import * as XLSX from 'xlsx';
import { AiFileAttachment } from '../../shared/types';

export class FileService {
  /**
   * 打开系统原生文件选择器并解析文件
   */
  public async selectAndParseFile(win?: BrowserWindow | null): Promise<AiFileAttachment | null> {
    const dialogOptions: any = {
      title: '选择要分析的文件或数据表格',
      properties: ['openFile'],
      filters: [
        {
          name: '支持的文件 (Excel, CSV, 文本, 代码, JSON)',
          extensions: ['xlsx', 'xls', 'csv', 'txt', 'md', 'json', 'sql', 'js', 'ts', 'java', 'xml', 'yaml', 'yml'],
        },
        { name: '所有文件', extensions: ['*'] },
      ],
    };

    const result = win
      ? await dialog.showOpenDialog(win, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    return this.parseLocalFile(filePath);
  }

  /**
   * 解析本地文件路径
   */
  public parseLocalFile(filePath: string): AiFileAttachment {
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;

    const fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // 1. Excel / CSV 表格解析
    if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      try {
        const fileBuffer = fs.readFileSync(filePath);
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const sheetNames = workbook.SheetNames;
        const mainSheet = workbook.Sheets[sheetNames[0]];

        // 提取前 50 行并转为 Markdown 表格
        const rawJson: Record<string, any>[] = XLSX.utils.sheet_to_json(mainSheet, { defval: '' });
        const totalRows = rawJson.length;
        const previewRows = rawJson.slice(0, 50);

        let tableMarkdown = '';
        if (previewRows.length > 0) {
          const headers = Object.keys(previewRows[0]);
          tableMarkdown += `| ${headers.join(' | ')} |\n`;
          tableMarkdown += `| ${headers.map(() => '---').join(' | ')} |\n`;
          for (const row of previewRows) {
            tableMarkdown += `| ${headers.map((h) => String(row[h] ?? '').replace(/\|/g, '\\|').slice(0, 50)).join(' | ')} |\n`;
          }
        }

        const parsedContent = `【文件附件: ${fileName}】\n- 工作表列表: ${sheetNames.join(', ')}\n- 当前展示工作表: [${sheetNames[0]}] (总行数: ${totalRows} 行，展示前 ${previewRows.length} 行样本)\n\n数据表格预览:\n${tableMarkdown}`;
        const summaryText = `Excel 数据表: ${totalRows} 行数据, ${sheetNames.length} 个工作表`;

        return {
          id: fileId,
          name: fileName,
          size: fileSize,
          mimeType: ext === '.csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          parsedContent,
          summaryText,
        };
      } catch (e: any) {
        return {
          id: fileId,
          name: fileName,
          size: fileSize,
          mimeType: 'application/octet-stream',
          parsedContent: `【文件: ${fileName} 解析异常】: ${e.message}`,
          summaryText: `解析失败: ${e.message}`,
        };
      }
    }

    // 2. 文本与代码文件解析
    try {
      let content = fs.readFileSync(filePath, 'utf-8');
      const isTruncated = content.length > 30000;
      if (isTruncated) {
        content = content.slice(0, 30000) + '\n\n...[由于内容过长，已截取前 30,000 字符]...';
      }

      const parsedContent = `【文件附件: ${fileName}】\n\`\`\`${ext.replace(/^\./, '') || 'plaintext'}\n${content}\n\`\`\``;
      const summaryText = `文本文件 (${(fileSize / 1024).toFixed(1)} KB)${isTruncated ? ' [已截断前30K字符]' : ''}`;

      return {
        id: fileId,
        name: fileName,
        size: fileSize,
        mimeType: 'text/plain',
        parsedContent,
        summaryText,
      };
    } catch (e: any) {
      return {
        id: fileId,
        name: fileName,
        size: fileSize,
        mimeType: 'application/octet-stream',
        parsedContent: `【文件: ${fileName} 读取异常】: ${e.message}`,
        summaryText: `读取失败: ${e.message}`,
      };
    }
  }

  /**
   * 解析前端直接上传的文件 Buffer (用于拖拽上传)
   */
  public parseBuffer(fileName: string, buffer: Buffer): AiFileAttachment {
    const ext = path.extname(fileName).toLowerCase();
    const fileSize = buffer.length;
    const fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      try {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetNames = workbook.SheetNames;
        const mainSheet = workbook.Sheets[sheetNames[0]];

        const rawJson: Record<string, any>[] = XLSX.utils.sheet_to_json(mainSheet, { defval: '' });
        const totalRows = rawJson.length;
        const previewRows = rawJson.slice(0, 50);

        let tableMarkdown = '';
        if (previewRows.length > 0) {
          const headers = Object.keys(previewRows[0]);
          tableMarkdown += `| ${headers.join(' | ')} |\n`;
          tableMarkdown += `| ${headers.map(() => '---').join(' | ')} |\n`;
          for (const row of previewRows) {
            tableMarkdown += `| ${headers.map((h) => String(row[h] ?? '').replace(/\|/g, '\\|').slice(0, 50)).join(' | ')} |\n`;
          }
        }

        const parsedContent = `【文件附件: ${fileName}】\n- 工作表: ${sheetNames.join(', ')}\n- 当前展示工作表: [${sheetNames[0]}] (总数据行数: ${totalRows} 行)\n\n数据表格预览:\n${tableMarkdown}`;
        const summaryText = `Excel 表格: ${totalRows} 行数据`;

        return {
          id: fileId,
          name: fileName,
          size: fileSize,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          parsedContent,
          summaryText,
        };
      } catch (e: any) {
        return {
          id: fileId,
          name: fileName,
          size: fileSize,
          mimeType: 'application/octet-stream',
          parsedContent: `【文件解析异常】: ${e.message}`,
          summaryText: `解析失败`,
        };
      }
    }

    try {
      let content = buffer.toString('utf-8');
      if (content.length > 30000) {
        content = content.slice(0, 30000) + '\n\n...[已截取前 30,000 字符]...';
      }

      return {
        id: fileId,
        name: fileName,
        size: fileSize,
        mimeType: 'text/plain',
        parsedContent: `【文件附件: ${fileName}】\n\`\`\`\n${content}\n\`\`\``,
        summaryText: `文本文件 (${(fileSize / 1024).toFixed(1)} KB)`,
      };
    } catch (e: any) {
      return {
        id: fileId,
        name: fileName,
        size: fileSize,
        mimeType: 'application/octet-stream',
        parsedContent: `【文件无法按文本读取】`,
        summaryText: `二进制文件`,
      };
    }
  }
}
