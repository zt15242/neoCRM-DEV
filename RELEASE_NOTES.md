### 🚀 版本更新说明 (v1.8.3)

1. **彻底解决 Windows 系统下 Salesforce CLI 联通与自动续期失效缺陷**：
   - **修复 Windows 命令执行语法冲突**：全面排查并彻底移除了在 Windows `cmd.exe` 终端下导致崩溃的 `SF_TEMP_SHOW_SECRETS=true` 行内环境变量语法，统一通过 Node.js 子进程 `options.env` 跨平台安全注入环境变量，确保 Windows 下 `sf.cmd` 执行 100% 顺畅；
   - **多级组织别名解析与缺省回退**：适配 Salesforce CLI v2 最新规范，依次从 `~/.sf/config.json` (`target-org`)、`~/.sfdx/sfdx-config.json` (`defaultusername`) 与 `alias.json` 解析活跃组织；增加默认组织缺省回退，彻底消除因别名匹配失败导致的读取中断；
   - **补齐 `refresh_token` 磁盘全自动读取与持久化**：解决通过 CLI 登录后会话对象中缺失 `refresh_token` 的历史问题，自动从本地磁盘 `~/.sfdx/<username>.json` 提取 `refreshToken`、`clientId` 与 `clientSecret`，使会话具备全生命周期自动续期能力。

2. **Salesforce 三层 401 无感静默自愈与后台定时续期**：
   - **API 401 故障无感重发机制**：在执行 SOQL 数据查询、Describe 元数据探测或 DML 记录操作过程中，一旦遇到 `INVALID_SESSION_ID`（会话过期），系统自动通过【磁盘缓存即时探测 -> 本地 sf CLI 自动联动刷新 -> 云端 OAuth2 多端点接口换新】三层自愈防线在后台完成 Token 轮转，并无感重新下发刚才失败的 API 请求，彻底告别“频繁提示过期需重新登录”；
   - **后台 30 秒定时续期双通道**：优化后台静默保活引擎，支持 OAuth2 云端换新与本地 sf CLI 双向联动，维持组织会话长效稳定连接。

3. **Windows 环境下 Salesforce 官方浏览器授权强制唤起保障**：
   - 针对 Windows Electron 宿主子进程环境下调用 `sf.cmd org login web` 有时无法唤起系统默认浏览器的问题，实时捕获标准输出中的授权 URL 并主动调度 Electron 原生 `shell.openExternal` 强制唤起默认浏览器，保障登录流程 100% 顺畅。

4. **UI 视觉与交互体验精简优化**：
   - 针对内置的 **WorkBuddy / CodeBuddy 原生反向代理**卡片，彻底隐藏了冗余且易引起困惑的手动 API Key 与 Base URL 输入框，聚焦微信/客户端二维码扫码登录、在线账号状态展示、一键换号与动态模型探测同步。

---

### 🚀 版本更新说明 (v1.8.2)

1. **深度内置 WorkBuddy / CodeBuddy 原生反向代理与微信/网页扫码登录机制**：
   - **完全自研原生内联集成**：直接在 Electron 主进程中实现 WorkBuddy 完整反向代理机制，彻底摆脱对外部独立 Python 运行时或 Docker 容器的依赖，应用开箱即用；
   - **一键二维码扫码授权 (`WorkBuddyAuthModal`)**：
     - 支持 **🇨🇳 国内版 (`codebuddy.cn`)** 与 **🌐 国际版 (`workbuddy.ai`)** 双区域一键切换；
     - 自动调用官方微服务获取安全授权会话，直接生成高清登录二维码，支持使用手机微信扫一扫、腾讯微伴客户端扫码，或一键跳转默认浏览器确认授权；
     - 毫秒级轮询鉴权状态，成功后自动解析并保存用户 Token、UID、昵称及有效期；
   - **全生命周期 Token 静默保活与续期**：
     - 内置 Refresh Token 自动轮转与静默续期守护程序，临近过期前 5 分钟自动换取最新凭证，用户扫码一次长期稳定使用；
   - **官方客户端级请求指纹与 Header 对齐**：
     - 精准对齐官方桌面端 15+ 项请求指纹与通信标头（`X-IDE-Name: WorkBuddy`、`X-IDE-Version`、`X-Agent-Intent`、`X-Conversation-ID`、`X-Request-ID`、`X-Domain` 等）；
     - 自动优化思维链（`thinking`）与 `max_tokens` 参数，原生支持流式（SSE）与非流式响应；
   - **内置本地标准 OpenAI 代理服务 (`http://127.0.0.1:8788/v1`)**：
     - 主进程自动在本地端口 8788 启动轻量级 HTTP 代理网关，提供 `GET /v1/models`、`POST /v1/chat/completions` 及 `GET /health` 端点；
     - 不仅供应用内部 AI 智能体流畅调度，还支持外部工具（如 Codex CLI、Cursor、Aider 等）无缝连接使用已登录的 WorkBuddy 账号模型！

---

### 🚀 版本更新说明 (v1.8.1)

1. **全新集成「WorkBuddy2API-Hub」多账号网关模型渠道**：
   - **参考开源项目接入**：深度对接官方开源项目 [workbuddy2api-hub](https://github.com/ardeyouxipianyi/workbuddy2api-hub.git)，将腾讯 **WorkBuddy**（国际版 `www.workbuddy.ai`）与 **CodeBuddy**（国内版 `codebuddy.cn`）多账号代理中枢无缝接入平台模型供应商体系；
   - **双区域官方对齐模型库**：开箱预置 12 个官方高频前沿模型：
     - `default-model` (Auto 智能自动调度)
     - `deepseek-v4.1-flash` (全能编码·极速版)
     - `deepseek-v4-pro` (国内旗舰·深度版)
     - `deepseek-r1-0528` (深度推理版)
     - `gpt-6-astra` (前沿预览)
     - `gpt-5.3-codex` (代码专精)
     - `glm-5.3` (智谱旗舰)
     - `kimi-k3` (长文本推理)
     - `hy4-preview` (腾讯混元 Hy4 Preview)
     - `fast-model` (Fast 轻量速答)
     - `primary-model` (Primary 主力编码)
     - `deep-model` (Deep 深度思考)
   - **一键动态模型探测与热切**：支持点击「探测可用模型」，实时调用网关 `GET /v1/models` 接口探测本地与远程已挂载的全量最新模型目录并自动同步；
   - **无鉴权本地单机与多 Key 适配**：对本地代理 `127.0.0.1:8788/v1` 支持单机免 Key 自动接入，同时兼容看板设置中的多 Key 独立出口调度模式；
   - **快捷看板联动**：供应商设置卡片提供一键跳转直达本地 `http://127.0.0.1:8788/` Web 管理看板，轻松管理账号 OAuth、每日任务签到与配额护栏。

---

### 🚀 版本更新说明 (v1.8.0)

1. **全新上线「Nex 页面扩展大师 (Nex Architect)」角色与全流程工程闭环**：
   - **专精角色定位**：聚焦销售易 Nex 2.0 页面扩展（`view(ctx, props)`）全生命周期架构、组件级作用域联动与代码级自动化发布部署，徽标「Nex部署大师」，图标 `LayoutTemplate`；
   - **多端与全场景适配**：全量支持四类页面场景（`EntityForm` 表单新建/编辑页、`EntityDetail` 详情页、`EntityList` 列表页、`neoUIFramework` 首页框架）与双端类型（`web` PC端 / `h5` 移动端）；
   - **实测型工程认知铁律**：深度注入 `NEX_ARCHITECT_INSTRUCTION` 受保护系统指令，严格遵循“字段真实性先行”（优先调用 `get_entity_fields` 真实校验）、“组件定位 Scope 铁律”（`scope: { itemApiKey }` 与 `scope: { buttonApiKey }`）、“数据响应式回写”（`setFormData` 动态联动）与“物理代码文件真实落盘”（直接创建项目工作区物理文件，严禁仅空谈 Markdown）。

2. **强制接入设备硬件安全许可锁控制体系 (全链路设防)**：
   - **底层统一授权控制**：与自动流程架构师 (`autoflow-architect`)、审批流专精 (`approval-architect`) 及 BI分析部署大师 (`neobi-architect`) 统一绑定底层硬件级设备安全许可锁（`workflowLicenseStatus`）；
   - **状态感知与天数展示**：App 侧边栏与 AI 会话角色切换下拉框实时呈现授权锁状态，已激活设备直观展示绿色安全胶囊与有效剩余天数（`剩X天`），未激活显示 `🔒`；
   - **未授权提问自动拦截**：当设备未激活或密码未验证时，选择该角色或提问将直接触发拦截并弹出激活对话框，彻底阻止未授权使用；
   - **输入框状态胶囊联动**：输入框左下角自适应展示 Nex 角色安全锁状态，支持一键点击查看机器码与天数。

3. **新增销售易 Nex 2.0 代码级专属工具链与 Service 服务层 (`NexService`)**：
   - **`list_nex_extensions`**：全域扫描当前租户线上已注册扩展与本地工作区 `src/nex/` 资产列表及版本状态；
   - **`get_nex_extension_code`**：一键拉取指定扩展的源码、版本信息与清单配置；
   - **`generate_nex_extension`**：根据业务需求自动在本地工作区创建结构完整的 `src/nex/{nexName}/index.js`、`manifest.json` 与 `README.md`，包含生命周期、字段联动事件与操作按钮；
   - **`deploy_nex_extension`**：对扩展代码进行静态合规性检查、计算 SHA-256 代码指纹，并封装派发官方 `getDeployCode_neoAgg` 部署载荷，实现全租户生效与版本自动递增。

4. **快捷交互与逆向架构手册**：
   - **斜杠快捷指令**：在 AI 智能体输入框新增 `/nex` 快捷指令，一键切换并激活 Nex 页面扩展开发上下文；
   - **官方逆向资产归档**：集成销售易官方 Chrome 开发者插件 (`xsy-breeze-vsc-tools`) 14 大逆向通信指令集与 REA 存证手册 (`nex-dev-tool-reverse-engineering.md`)；
   - **修复冷启动加载报错**：彻底消除主进程类实例化时由于模块缺失导致的 `ReferenceError: NexService is not defined`。

---

### 🚀 版本更新说明 (v1.7.9)

1. **纷享销客 PaaS 开发者接口全链路打通 (share-dev 逆向架构落地)**：
   - **开发者证书全生命周期支持**：深入解构官方 VS Code/Cursor 插件 (`sharecrm.share-dev`) 底层微服务通信协议 (`/FHH/EMDH...`) 与长轮询机制；在连接器设置中心新增并完整持久化 **`devCertificate`（开发者证书）**，修复了此前因后端数据模型构造遗漏导致保存丢失的缺陷；
   - **活跃会话环境实时联动更新**：连接器更新开发者证书后，立即自动同步刷新当前活跃会话与历史记录，无需退出重新登录即可生效；
   - **一键拉取租户全量 APL 业务函数 Groovy 源码**：`CodeSyncService` 与 `FxiaokeService` 全面打通官方网关 `POST /FHH/EMDHFUNC/biz/query`，拉取工程时自动将租户下所有的 APL 业务函数按绑定业务对象归档至 `src/apl/<bindingObject>/<apiName>.groovy`，自动注入规范注释并生成 `apl_manifest.json` 索引清单！

2. **彻底修复工作区 Git 差异检查 (`workspace_changes`) 安全沙箱误拦截缺陷**：
   - 深入排查并修复 `aiService` 调度 `workspace_changes` 时因参数缺省导致沙箱校验器错误回退至应用启动目录 (`process.cwd()`)、误将当前真实工作区判定为“越界访问”的问题；
   - 在 `dshToolService.ts` 中实现工作区根路径自适应锚定，彻底消除跨项目误报拦截，保障代码拉取与工程变更对账顺畅无阻。

3. **全面支持 DeepSeek Harness (DSH) 官方四大运行模式**：
   - **⚡️ 标准模式 (Standard Mode)**：官方经典 ReAct 自主智能体，按步调用原生 20+ 个工具，自主闭环排查并自愈推进到底；
   - **🧬 PTC 模式 (Program-Through-Chat)**：隐藏琐碎单步工具，单一入口暴露 `run_code`，在独立 Node VM 容器中执行异步 JS/TS 脚本调用 `tools.*` SDK，一次性高效执行复合数据管道；
   - **🍃 极简模式 (Minimal Mode)**：对齐 DSH 官方极简预设规范，仅开放单一持久终端 `bash` 工具，零多余工具开销，极速响应；
   - **📋 方案规划模式 (Plan Mode)**：只读安全调研，输出结构化方案经用户审批确认后执行；
   - 支持快捷指令：`/standard`, `/ptc`, `/minimal`, `/plan`。

4. **新增「BI分析部署大师 (NeoBI Architect)」专属角色并强制上锁**：
   - 基于《销售易智能分析代码实施指南》打造新版 NeoBI (`/rest/neobi/v2.0/`) 全生命周期部署大师，图标 `BarChart3`；
   - 严格植入十步依赖实施链、统计粒度与基数防错铁律、`web.dataConfig` 与 `server` 双套配置同步铁律、21 类图表配方与五大交互（全局筛选、图表联动、维度下钻、对象列表穿透、带参跳转）；
   - 与自动流程、审批流共享统一底层设备安全锁，全链路设防。

5. **Salesforce 鉴权续期与 Token 轮转持久化**：
   - 监听 `sf org login sfdx-url` 后的 Refresh Token 轮转机制，自动读取最新凭据并写回本地会话存储；
   - 在会话仪表盘中为到期凭证显式提供系统默认浏览器一键重新登录通道。
