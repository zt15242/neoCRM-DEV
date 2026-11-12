/** Accept complete JSON snapshots from compatible gateways and normal string deltas.
 * Never repair truncated JSON or invent missing tool parameters. */
export function appendToolArguments(previous: string, incoming: unknown): string {
  const next = typeof incoming === 'string' ? incoming : JSON.stringify(incoming);
  if (next === undefined) return previous;
  if (!previous) return next;
  try {
    const value = JSON.parse(next);
    if (value && typeof value === 'object' && !Array.isArray(value) && next.startsWith(previous)) return next;
  } catch { /* normal partial string delta */ }
  return previous + next;
}

export function toolArgumentError(name: string): string {
  const base = '工具参数 JSON 不完整或无效，尚未执行工具。';
  if (name === 'bash') return base + 'bash 必须提供完整的 JSON 对象和 command 字符串；请缩短命令、不要输出 Markdown 围栏，并在重试时只重新给出完整参数。';
  if (name === 'skill') return base + 'skill 必须提供 name 字符串；resource、script 和 args 需符合技能工具定义。请只重新给出完整 JSON 参数。';
  if (name === 'browser_control') return base + 'browser_control 必须提供完整 JSON 对象和 action；元素操作需要最近快照返回的 ref，tabId 使用 tabs 返回的标签页 ID。请重新生成本次调用参数，不要重复已成功的点击或输入。';
  if (name === 'write') return base + 'write 必须提供 file_path 和完整 content；输出被截断时请缩短或拆分 content 后重新调用。';
  if (name === 'run_code') return base + 'run_code 必须提供完整 code；输出被截断时请缩短或拆分 code 后重新调用。';
  return base + '请按该工具的参数定义重新提供完整 JSON 对象。';
}

export function parseToolArguments(name: string, raw: unknown): Record<string, any> {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new Error(toolArgumentError(name)); }
}
