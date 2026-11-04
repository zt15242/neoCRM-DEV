const tool = (name: string, description: string, properties: Record<string, any>, required: string[] = []) => ({
  type: 'function', function: { name, description, parameters: { type: 'object', properties, required } },
});
const task = {
  title: { type: 'string', description: '侧边栏展示的简短标题' },
  task: { type: 'string', description: '明确、独立、可验收的任务；包含所需背景、已获授权范围和交付要求' },
};
const sessionId = { sessionId: { type: 'string', description: '本会话创建的自主会话或子代理 ID' } };
export const AGENT_TOOLS_SPEC = [
  tool('create_session', '自主创建独立会话并在后台启动任务；继承当前项目、模型、技能和连接器。返回会话 ID，使用 wait_agents 获取实际结果。', task, ['title', 'task']),
  tool('spawn_agent', '创建子代理会话并异步执行独立子任务。可连续调用派发多个互不冲突的任务，再 wait_agents 等待与汇总。', task, ['title', 'task']),
  tool('list_agents', '查询本会话创建的自主会话与子代理状态、最新结果及错误。', {}),
  tool('wait_agents', '等待指定代理全部结束或超时，返回真实状态与结果。超时仅返回进度，不代表完成。可重复等待。', {
    sessionIds: { type: 'array', items: { type: 'string' }, description: '代理会话 ID，最多 8 个' },
    timeoutMs: { type: 'number', description: '等待毫秒数，0 到 30000，默认 30000' },
  }, ['sessionIds']),
  tool('send_agent_message', '向本会话已结束的代理追加任务并继续执行。运行中的代理须先等待或停止；保留已有上下文。', {
    ...sessionId, message: { type: 'string', description: '继续执行的具体要求' },
  }, ['sessionId', 'message']),
  tool('stop_agent', '停止本会话创建的指定代理，取消排队或正在执行的请求。', sessionId, ['sessionId']),
];
export const AGENT_TOOL_NAMES = new Set(AGENT_TOOLS_SPEC.map(item => item.function.name));
export const AGENT_ROUTING_INSTRUCTION = `【会话创建与子代理协作】
你可以用 create_session 创建独立后台会话；用 spawn_agent 将复杂任务拆成职责清晰、互不冲突的子任务并行执行。简单任务直接完成，不必派发。
连续派发后用 wait_agents 等待结果，检查每个代理的状态与输出，再在主会话整合、核验并交付。queued/running/超时都不代表完成；失败或等待用户输入时应如实说明。不要只创建代理就声称任务已完成。
子会话继承当前项目、模型、技能、MCP 和连接器登录态，无需重新登录；只获得 task 中的背景和自身历史，不会自动复制主会话全文。派发时写清上下文、文件职责和已获授权范围，避免多个代理改同一文件。代理不能扩大用户授权或绕过确认、方案模式与受保护功能限制。
最多并行 3 个后台会话，每轮最多创建或继续 8 次；子代理和自主会话不能继续派生。主会话停止时会取消它创建的后台任务。
标准模式直接调用这些工具；PTC 模式使用 tools.create_session、tools.spawn_agent、tools.list_agents、tools.wait_agents、tools.send_agent_message、tools.stop_agent。
若子代理返回等待用户确认或问题，应向用户转达，获得答复后再 send_agent_message 继续。`;
