import files from './pageCodeSkill.json';

export const PAGE_CODE_SKILL_ID = 'skill-neo-page-code-management';
export const isPageCodeSkill = (name: string) => [PAGE_CODE_SKILL_ID, 'neo-page-code-management'].includes(name);
const adapter = `# 桌面应用执行约定\n页面代码技能可调用 execute_open_api 使用当前连接器后台 Cookie（authMode: "cookie"），上传完整 ZIP 使用 bodyEncoding: "multipart"，file 为 {fieldName:"file",filePath:项目或用户附件路径,contentType:"application/zip"}，body 包含 commitMsg。上传需要用户明确授权并传 confirm:true。具体接口和已验证边界先读取 references/browser-workflow.md。Cookie 由宿主注入，不要读取或输出凭据。通用传输的 multipart 和 Cookie 已在 PAV 模拟沙盒的禁用测试记录上验证；不同租户的登录与认证仍须实际验证。对业务成功必须核验响应并回读；上传超时先回读，禁止盲目重试。用户明确授权的租户写入应核对目标与变更；未验证接口不得猜测。\n\n`;
export function getPageCodeInstruction(name: string): string | null {
  return isPageCodeSkill(name) ? adapter + files['SKILL.md'] : null;
}
export function readPageCodeSkill(name: string, input: { resource?: unknown; offset?: number; limit?: number; script?: unknown }): Record<string, unknown> | null {
  if (!isPageCodeSkill(name)) return null;
  if (input.script !== undefined) throw new Error('页面代码技能没有可执行脚本');
  if (input.resource !== undefined) {
    if (input.resource !== 'references/browser-workflow.md') throw new Error('未找到页面代码技能参考资料');
    const offset = input.offset ?? 1, limit = input.limit ?? 160;
    if (!Number.isInteger(offset) || offset < 1 || !Number.isInteger(limit) || limit < 1 || limit > 400) throw new Error('资源 offset 从 1 开始，limit 须为 1–400 的整数');
    const lines = files['references/browser-workflow.md'].split(/\r?\n/);
    const content = lines.slice(offset - 1, offset - 1 + limit);
    return { name: 'neo-page-code-management', resource: input.resource, offset, totalLines: lines.length, content: content.join('\n'), nextOffset: offset - 1 + content.length < lines.length ? offset + content.length : null };
  }
  return { name: 'neo-page-code-management', instruction: getPageCodeInstruction(name), resources: [{ resource: 'references/browser-workflow.md', lines: files['references/browser-workflow.md'].split(/\r?\n/).length }] };
}
