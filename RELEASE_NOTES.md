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
