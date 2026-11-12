# OpenCode 对话工作区集成

更新日期：2026-11-12

## 目标范围

保留 NeoCRM 的 Electron 外壳、主导航、左侧项目/会话导航、业务入口、连接器、设置、会议助手和邮件。只替换截图红框内的中央对话工作区与代码编辑体验，接入 OpenCode 的会话 UI、模型、技能、上下文管理、工具循环和代码编辑能力。

会议与邮件继续是 NeoCRM 的独立页面。销售易连接器继续由 NeoCRM 管理，识别为销售易环境，不映射成 Salesforce。

## 上游基线

- 仓库：`https://github.com/anomalyco/opencode`
- 核对提交：`134136db152c1b5073efb8f2f005438ef336c6d7`（2026-11-11）
- 上游 UI 主体在 `packages/app`，使用 Solid；Electron 桌面壳位于 `packages/desktop`；Agent/server/tool 能力由 CLI/server 和插件体系提供。
- 上游采用 Bun workspaces，`packages/app` 不是独立可安装的 npm 聊天组件。根许可证为 MIT；分发上游代码需保留版权和许可文本。

## 集成方式

NeoCRM 继续作为外层应用。OpenCode 中央工作区以独立 renderer 面板嵌入现有 AI 页面。上游公开的 `packages/app` 入口会渲染完整 `AppInterface`，带有 OpenCode 自己的项目/会话导航；中心会话视图依赖 Solid 上下文，并未作为独立组件导出。因此不能直接嵌完整 app，也不能把 Solid 组件混入 React 树。UI 需要基于固定 SHA 构建 workspace-only 入口，只挂载中央会话/编辑区。

Agent 不能通过随 UI 一起启动的通用 CLI/server 绕开 NeoCRM 现有权限模型。模型调用继续复用 NeoCRM `ModelGateway` 与隔离的 `AgentRuntimeHost`；项目读取/修改继续复用 `ProjectEditorService`；CRM、浏览器和文件工具通过现有主进程服务执行。下一阶段需要实现 OpenCode UI 所需的窄协议适配层，将每个工具调用映射到现有工具注册表、项目根路径约束、许可/确认和审计逻辑。未映射的工具必须不可用，不能给新 renderer 直接 shell 或任意目录访问。

会议和邮件在 NeoCRM 外壳内保持各自的导航和 UI。销售易 Cookie、模型 API Key 只由主进程持有，renderer 与 Agent 上下文只能得到调用结果，不得得到凭据。

OpenCode 的模型、技能和会话配置不会默认兼容 NeoCRM 现有格式。需要可恢复的导入器与双读验证；源会话和配置先保留，不做原地转换。NeoCRM 设置页仍管理 CRM 连接器及业务能力；模型配置迁移后由 OpenCode 工作区负责，避免两个 UI 同时写模型设置。

## 适配契约

OpenCode UI 通过 `OpenCode.make({ baseUrl, fetch })` 使用 HTTP API；NeoCRM 目前通过 Electron preload 暴露 IPC，AI Agent 由 `AiService.startChatStream` 执行。两者不能直接互换。workspace renderer 的 `fetch` 需要接入受限 RPC adapter，由 adapter 校验项目、会话和权限，再调用既有服务；不能另起一个完整 OpenCode server 来取得“兼容”。

| OpenCode UI 能力 | NeoCRM 目标服务 | 需要适配的数据/控制 |
| --- | --- | --- |
| `GET /api/info`、location/project | NeoCRM workspace capability manifest、当前关联项目 | 只暴露已选项目路径与只读项目标识 |
| provider/model/agent/skill list | `AiService.getAiConfigAsync()`、安全锁状态 | 只投影启用的供应商/模型、可见 Agent 与个人技能；不返回 API Key |
| session create/list/messages/rename/delete | `SessionRepository` 与现有 session IPC | 显式映射 `ses_`/`sess_` ID；消息使用现有分页仓库；不迁移旧会话 |
| session inbox list | NeoCRM AgentRuntime | 返回空列表；提示直接进入 AgentRuntime，不建立第二套待处理队列；队列修改和撤回明确返回 403 |
| session prompt/cancel/model/agent | `aiStartChatStream`、`aiAbortChatStream`、`aiPersistSession` | 所有模型请求走 NeoCRM AgentRuntime；将 `AiStreamEvent` 转成 OpenCode SSE；仅能选择已启用模型和当前授权 Agent |
| streaming text/reasoning/tool events | `OpenCodeStream` adapter | 先发上游要求的 part started 事件；按 session/request/message ID 归属增量；进度写入限速合并，终态持久化完成后才发 execution idle |
| file list/find/read/write | `ProjectService`、`ProjectEditorService` | 仅当前项目根内相对路径；读取记录 revision，写入要求该 revision；拒绝越界、未先读和大于 2 MB 文件 |
| tool execution | 既有 `AiService` 工具注册表及具体 service | 沿用工具参数校验、销售易登录/授权和确认；没有独立 shell/CRM Cookie/MCP 执行宿主 |
| 其他 API 与权限请求 | 默认拒绝 | 未映射路由返回 404；权限 API 返回 403；不会套用 OpenCode 默认允许规则 |

模型调用、技能解析、文件写入和 CRM 工具都必须由同一套 NeoCRM capability path 执行；OpenCode UI 是会话和编辑的 renderer。这样可迁移对话呈现与交互，而无需让第二个 Agent host 获得独立权限。

## 实施切片

| 阶段 | 交付 | 验收 |
| --- | --- | --- |
| W0 中央面板原型 | 固定上游 SHA；workspace-only 单会话路由、独立静态资源协议 | 已接入源码和构建；需桌面运行验收路由和完整视觉状态 |
| W1 受控 Agent 适配 | 会话、模型、流事件、取消适配 NeoCRM `AiService`/`ModelGateway` | 代码已接入；需通过真实 renderer 发消息/取消/工具流回归 |
| W2 工具能力映射 | 文件查看/编辑接入 `ProjectEditorService`；未映射路由拒绝 | 路径边界与 revision 校验已接入；CRM 写入、浏览器预览和附件仍需逐项联调 |
| W3 历史与设置迁移 | 导入旧会话、技能和模型配置；提供结果报告与可恢复备份 | 多轮/工具/附件/压缩记录核对通过，失败可重跑，原库可回退 |
| W4 双平台灰度 | Windows/macOS 安装、升级、内存、并发、通知、文件选择与业务回归 | 先内部开关灰度；达到验收后移除旧工作区代码 |

## 安全与兼容边界

- 新 UI 没有独立通用执行宿主；它不能直接获得 shell、任意文件路径或 CRM Cookie。
- 上游 API 中的每个工具必须显式映射到 NeoCRM 现有工具权限；遇到未映射工具时应拒绝调用并报告能力不可用。
- CRM 修改、上传、部署、删除操作保留原有确认与授权流程；先以只读工具验证主进程 RPC。
- NeoCRM 业务侧栏、销售易连接器、会议和邮件维持现有组件和路由；工作区替换不代表整套桌面应用替换。
- 每个阶段都保留旧工作区可运行的回退开关，完成数据和双平台验收后再删除。

## 当前状态

OpenCode 上游源码以 submodule 固定在 `134136db152c1b5073efb8f2f005438ef336c6d7`，保留 MIT 许可。`npm run build:opencode-workspace` 使用项目锁定的 Bun 1.4.4 构建 workspace-only bundle 至 `public/opencode-ui`；普通 `npm run build` 与 `npm run dev` 会自动运行它。

NeoCRM AI 中央区域现挂载上游 Solid 会话工作区，外层 Electron、项目/会话导航、连接器、会议和邮件继续由 NeoCRM 承载。iframe 的 fetch 通过 `MessageChannel` RPC 回主 renderer，再由 preload 调用 NeoCRM IPC；主进程只为 OpenCode UI 暴露只读 `neocrm-ui://` 静态资源协议。模型凭据和 CRM Cookie 不进入 iframe。

当前 API 适配覆盖 OpenCode 会话列表/创建/消息分页/提示/中断/改名/删除，模型/Agent/个人技能列表与选择，SSE 时间线，项目目录/查找/读取及 revision-checked 文本写入。流式正文、推理、工具状态、token/cost 与终态会按请求身份映射，并保存到 NeoCRM 会话历史；停止后拒绝迟到事件。附件上传、审批和权限 API、压缩/日志/统计、浏览器工具 UI、自定义工作台工具仍未完成；没有映射的接口默认返回拒绝。文件写入限制为当前项目内已读取过的 UTF-8 文本，单文件上限 2 MB。

已通过 `npx tsc --noEmit`、`npm run test:opencode-workspace`、完整生产构建、NeoCRM Agent/文件编辑/会议回归、OpenCode 服务器状态单测（8 项）、补丁反向校验和 `git diff --check`。桌面联调修复了初始化空路由、Base64URL server key、缺失 inbox 只读接口、SSE 订阅随 React 会话更新反复断开、缺少 text/reasoning started 事件、未保存流式结果、desc history order 反转，以及 editor 相对路径和 CRLF 保留。Electron 中用键盘输入 `READY` 测试提示完成真实 Gemini 调用；8 秒后返回正文、token/cost 信息，输入区恢复可用；SQLite 确认 user+assistant 消息、正文和 usage 已保存。隔离测试覆盖并发会话切换、停止/错误、迟到事件、慢磁盘下合并保存、分页方向、文件 revision/conflict/path/symlink。NeoCRM inbox 列表返回空值，队列修改/撤回明确拒绝；附件上传、审批和权限 API、压缩/日志/统计、浏览器工具 UI、自定义工作台工具仍未完成。资源根路径为开发模式 `VITE_PUBLIC/opencode-ui`、打包模式 `DIST/opencode-ui`。真实工具流、Windows/macOS 安装包仍待运行验证。旧历史由 NeoCRM SQLite 原样保留，未迁移。
