import { decryptBuiltinSkillAsset } from './protectedSkillAssets';
import skills from './neoNexCliSkills.json';
import type { SessionState } from '../../shared/types';

const nexSkillAliases = new Set([
  'neo-nex-dev', 'skill-neo-nex-dev', 'salesyi-nex-dev', 'skill-salesyi-nex-dev',
  'preset-nex-architect', 'nex-architect',
]);

export function getNeoCliConversationSkill(name: string): string | null {
  if (nexSkillAliases.has(name)) return decryptBuiltinSkillAsset(skills['neo-nex-dev']);
  if (name === 'neo-cli-usage' || name === 'skill-neo-cli-usage') return decryptBuiltinSkillAsset(skills['neo-cli-usage']);
  return null;
}

export const LEGACY_NEX_TOOLS = new Set([
  'list_nex_extensions', 'get_nex_extension_code', 'generate_nex_extension', 'deploy_nex_extension',
]);
export const NEO_CLI_ONLY_WRITE_TOOLS = new Set(['create_custom_entity', 'create_custom_field']);

export function isNexConversation(content: string): boolean {
  return /\bnex\b|页面扩展|扩展代码/i.test(content);
}

export function filterNeoCliTools<T extends { function?: { name?: string } }>(tools: T[]): T[] {
  return tools.filter((tool) => {
    const name = tool.function?.name || '';
    return !LEGACY_NEX_TOOLS.has(name) && !NEO_CLI_ONLY_WRITE_TOOLS.has(name);
  });
}

export function getNeoCliSessionInstruction(preparation: { success: boolean; message: string; session: SessionState }): string {
  const loggedIn = !!(preparation.session.isLoggedIn && preparation.session.environment && preparation.session.tokenData);
  return `【销售易连接器共享授权】
当前销售易连接器状态：${loggedIn ? '已登录（宿主当前会话）' : '未登录或没有可用会话'}。此状态独立于 CLI 准备结果，不代表已经验证所有接口权限。
当前工作区准备结果：${preparation.message}。
${preparation.success ? '项目清单和 CLI 共享授权已验证就绪。' : 'CLI 尚未就绪；不得声称初始化或同步成功。'}
CLI 准备失败不代表连接器登录失效；连接器已登录时，CLI 未覆盖的业务类型仍可通过 list_business_types / deploy_business_type 执行。
缺少 neo-project.json 时由宿主自动补齐并复用当前连接器会话，不调用 neo init，不调用 neo login，不要求用户重新鉴权。
授权状态以宿主当前会话和当前连接器工具的实际响应为准。历史消息、压缩摘要、旧 .neo-cli/token.json 或旧脚本返回的 401 不能证明当前连接器失效；需要核实时使用 get_tenant_info 和目标专用只读工具，不读取任何凭证文件。
禁止要求用户提供 access token、refresh token、Cookie，禁止生成“提供有效 token / 手动后台写入 / 仅生成 source”的写入通道选择卡。宿主工具已经管理授权，用户只需确认业务内容和实际写入范围。
销售易功能统一遵循 NEO_CLI_FIRST_ROUTING：先运行当前项目中的 neo CLI；只有该功能没有 CLI 命令，或 CLI 执行失败后，才使用现有连接器能力。任何回退都要在结果中说明实际来源和原因。
若 CLI 仍报错，不要重复登录、猜测环境或反复执行同一失败命令；保留原始错误和准备结果。不得把本地文件或失败的接口探测当作租户查询结果。
只有连接器自身明确未登录或授权失效时，才通过连接器界面处理登录。`;
}

/** Keep obsolete login/file routes out of both native tools and the PTC SDK. */
export function assertNeoConnectorToolAccess(name: string, args: Record<string, unknown>): void {
  const command = name === 'bash' ? String(args.command || '') : '';
  const file = ['read', 'read_document', 'write', 'edit', 'str_replace_editor', 'read_image', 'grep', 'glob'].includes(name)
    ? String(args.file_path || args.path || args.pattern || '') : '';
  const credentialPath = /(?:^|[\\/\s'"`])\.(?:neo-cli[\\/]token\.json|neocrm-cli[\\/]auth(?:[\\/]|\b))/i;
  if (credentialPath.test(command) || credentialPath.test(file)) {
    throw new Error('销售易授权由宿主连接器管理，禁止读取或改写 CLI 凭证文件。请使用 get_tenant_info 核对当前连接器，业务类型使用 list_business_types / deploy_business_type；旧凭证错误不代表当前连接器失效。');
  }
  if (/(?:^|[\s/\\'"`])neo(?:\.cmd|\.exe)?["']?\s+(?:loginstatus|login|logout)\b/i.test(command)) {
    throw new Error('销售易对话复用当前连接器登录态，禁止执行 neo login / logout / loginstatus。CLI 共享准备由宿主完成；需要核对会话时使用 get_tenant_info，不要求用户另交 token。');
  }
}

export const NEO_CLI_FIRST_ROUTING = `【销售易功能统一 CLI 优先路由】
对当前销售易连接器的每项租户操作，先判断 CLI 1.0.8 是否有对应命令。存在时先在当前工作区执行实际 neo 命令，再使用结果；CLI 命令失败、超时或返回无效结果后，才允许调用对应的旧连接器工具作为兼容回退。回退必须报告 CLI 命令、失败原因和最终数据来源，不能把连接器回退描述成 CLI 成功。CLI 成功返回空数据是有效结果，不得回退。

CLI 已覆盖的功能包括：
- 实体列表与字段结构：neo list object；neo describe object --api-key <apiKey>。
- 审批流：neo list approvalprocess；neo retrieve approvalprocess --definition-id <id>。
- 页面布局、通用选项集、校验/查重规则、UI 组件、NEX、后端代码包：使用对应的 neo list / describe / retrieve / generate / deploy / enable / disable 命令。
- 自动流程或指定元数据类型若 CLI 1.0.8 没有对应子命令，则使用既有连接器流程适配器，并标明 CLI 不覆盖该能力。

CLI 1.0.8 没有普通业务记录 XOQL 查询、记录创建/更新/删除或打印模板查询命令。这些操作直接使用现有连接器工具；不要虚构 neo query 或 neo data 命令。

业务类型查询、创建和更新由 list_business_types / deploy_business_type 专用工具处理：CLI 1.0.8 没有对应写入命令，宿主复用当前连接器授权调用 Metadata API 并回读，不要求用户去后台操作。不要虚构 neo deploy business-type，也不要把 enableBusitype 开关或子表单布局配置当作创建业务类型。

销售易自定义对象与字段写入必须使用 source-driven 的 neo generate / neo deploy 流程。禁止用旧连接器 create_custom_entity / create_custom_field 直写或在 CLI 写入失败后降级直写；先检查 source 与 dry-run，并遵守部署确认门禁。

运行命令使用当前对话绑定的项目目录，禁止调用 neo login、neo logout 或会输出令牌的 neo loginstatus。CLI 准备失败时不重新鉴权；写入操作仍遵守用户确认和现有安全门禁。`;

export const NEO_NEX_CLI_ROUTING = `【NEX 查询与源码获取执行通道】
NEX 必须按已加载的 neo-cli-usage 和 neo-nex-dev 技能使用当前工作区的 neo CLI。禁止调用旧 list_nex_extensions / get_nex_extension_code / generate_nex_extension / deploy_nex_extension，也不能探测旧 BFF 接口或用本地 src/nex 扫描冒充租户结果。
通过 bash（PTC 用 tools.bash）先执行 neo list nex --help 与 neo retrieve nex --help 核实参数，再执行 neo list nex 查询真实 codeName、终端和版本。CLI 1.0.8 的这两个命令不支持 --json。
用户只要求“列出/有哪些”时，报告真实远端列表即可；用户说“获取/拉取/下载 NEX”时，必须进一步执行 neo retrieve nex -n <真实 codeName> --nex-version <列表中的 v1.0 或 v2.0>，或用 --object <真实对象 apiKey> 拉取该对象下所有 NEX，并核实命令返回的本地源码路径。单段命令默认 v2.0，列表标记 v1.0 时必须显式指定。泛指“获取 NEX”时，先 list，再按返回的真实范围拉取；不能只列目录就声称源码已获取。
若 API 返回资源不存在（1010003）、权限不足或认证错误，如实说明 CLI 返回与未完成范围；禁止静默改成展示本地草稿并声称查询成功。没有返回任何扩展时，说明远端返回为空，不能编造代码。
本地源码目录以 neo-project.json 的 sourceDir 和 CLI 实际输出为准。上传草稿、发布、停用仍须用户明确授权；查询与源码拉取无需重新登录。`;

export function isApprovalConversation(content: string): boolean {
  return /审批流|审批流程|approvalprocess|approval[\s_-]*flow/i.test(content);
}

export function isBusinessTypeConversation(content: string): boolean {
  return /业务类型|busi_?types?|business[\s_-]*types?/i.test(content);
}

export const NEO_BUSINESS_TYPE_ROUTING = `【销售易业务类型创建与部署】
当前已加载 neo-entity-management。用户要求查询、创建、修改或部署业务类型时，主动调用 list_business_types 查询真实目标对象的业务类型。创建业务类型与启用对象的 enableBusitype、配置业务类型子表单是不同操作。
CLI 1.0.8 没有业务类型写入命令，使用宿主 deploy_business_type；它复用连接器登录态，不重新鉴权，不用 bash/curl 读取凭证或手写 HTTP。
这是已内置的部署通道，不询问用户选用 token、后台手工或本地 source 通道。旧接口报错后仍通过当前 list_business_types / deploy_business_type 核实，不沿用历史凭证结论。
可以传 entityApiKey 和 apiKey、label、description、active，或传 entityApiKey 和当前项目内已有的 sourceFile（businessTypes/*.business-type.json）。先用 dryRun=true 取得目标租户、create/update/unchanged 判定和变更清单；本地生成 source 不代表已部署。
向用户展示预演结果。用户已明确授权同一租户、同一范围的写入时继续执行 dryRun=false、confirm=true；否则请求用户确认该清单。不要在已获得明确授权后再次要求重复确认。
只有工具返回 success=true、verified=true 且 dryRun=false 才可报告已部署。verificationPending=true 或写入状态未知时，先 list_business_types 回读核实，不重复写入；如实说明未完成范围。标准对象的业务类型也由此专用工具处理，不要误套标准对象整体不可 deploy 的限制。
PTC 模式使用 tools.list_business_types / tools.deploy_business_type，执行路径和确认规则相同。`;

export const NEO_APPROVAL_CLI_ROUTING = `【审批流读取：CLI 优先，失败才回退】
查询销售易审批流时先加载 neo-cli-usage 与 neo-approval-flow-designer。目录使用 neo list approvalprocess --json；定义使用 neo retrieve approvalprocess --definition-id <真实定义 ID> --json。
宿主的 list_flows(procType=2) 和 get_flow_detail(procType=2) 已封装同一 CLI 优先策略，可直接调用；宿主自动准备 neo-project.json 并复用连接器会话。
CLI 成功返回空目录也算成功，不能据此回退。只有 CLI 无法执行、超时、退出非零、响应或快照无效时，宿主才调用原有适配器；结果会标明 source、cliCommands 和 fallbackReason。不得声称使用了未实际执行的通道。
不要在 CLI 失败后反复登录，也不要重复执行相同失败的查询。读取失败时应保留失败原因；两种方式均失败时报告失败，不得说成零条审批流。`;
