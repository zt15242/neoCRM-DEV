import documentReadingSkill from './documentReadingSkill.json';
import { decryptBuiltinSkillAsset } from './protectedSkillAssets';

export const DOCUMENT_SKILL_ID = 'skill-document-reader';
export function getDocumentReadingSkill(name: string): string | null {
  return [DOCUMENT_SKILL_ID, 'document-reader'].includes(name) ? decryptBuiltinSkillAsset(documentReadingSkill.instruction) : null;
}

export const DOCUMENT_TOOLS_SPEC = [{
  type: 'function',
  function: {
    name: 'read_document',
    description: '本地读取 Excel/XLS/XLSX/CSV/ODS、Word/DOC/DOCX、PDF、PPT/PPTX、XMind 思维导图和文本文件。先用 mode=info 查看分段目录，再按工作表、PDF 页、幻灯片或思维导图画布读取，支持继续分页；不会执行宏、公式或外部链接。只允许当前项目和用户主动添加的附件。',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '当前项目文件路径或用户已上传附件的真实 fullPath' },
        mode: { type: 'string', enum: ['info', 'read'], description: 'info 仅返回目录和警告；read 返回文本，默认 read' },
        section: { type: 'string', description: 'sections 中返回的 id 或标题，例如 sheet-2、page-3、slide-1、body；不传则按文件顺序读取' },
        offset: { type: 'integer', description: '当前选定范围的起始行号，从 1 开始；继续读取时使用返回的 nextOffset' },
        limit: { type: 'integer', description: '最多返回行数，默认 200，上限 2000' },
        max_chars: { type: 'integer', description: '返回正文字符预算，默认 20000，范围 3000–30000' },
        section_offset: { type: 'integer', description: '分段目录起始位置，从 1 开始；目录每次最多 100 项，使用 nextSectionOffset 继续' },
      },
      required: ['file_path'],
    },
  },
}];
