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
