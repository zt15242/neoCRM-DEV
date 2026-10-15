### 🚀 版本更新说明 (v1.5.0)

1. **多 CRM 连接器中心架构全面升级 (Universal Connectors Hub)**：
   - 彻底打破单平台限制，升级为面向 **销售易 (NeoCRM)**、**Salesforce (Force.com / 阿里中国 & 全球版)**、**纷享销客 (FXIAOKE)** 及 **自定义 CRM** 的全能多生态连接器中心；
   - 彻底去除主页 13 个生硬死板的官方预置卡片占位，只纯净展示用户实际创建和配置的真实连接器；空状态下提供一键快速初始化模板；
   - **新增连接器独立详情页 (`ConnectorDetailView`)**：将原本堆叠在主界面下方的运行时看板与认证卡片完整收敛至详情页，主界面轻量化，详情页支持查看端点参数、网络即时测速、一键登录与完整会话管理。

2. **纷享销客 (FXIAOKE) OpenAPI v2 官方生态深度打通**：
   - 全面对齐纷享销客官方客户端凭证模式 (`client_credentials`)，支持配置 `appId` + `appSecret` + `permanentCode` 直连获取 7200 秒 Access Token；
   - 实现了企业首个活跃员工 OpenUserId 自动嗅探与权限容错机制；
   - 实现了全量业务对象列表拉取（实测拉取租户全量 156 个业务对象）与 Describe 字段探测（如客户 `AccountObj` 提取 405 个真实字段，联系人、合同、订单等详情）；
   - 支持通过 `execute_sql_query` 按 `LIMIT 50 OFFSET n` 规范进行只读数据查询与分页对账。

3. **Salesforce 阿里中国版 (*.sfcrmproducts.cn) & 全球版 (*.salesforce.com) 全面支持**：
   - 全面支持阿里云本土承载的 Salesforce 中国区域名体系（`login.sfcrmproducts.cn` / `test.sfcrmproducts.cn` / 专属 My Domain）与全球版端点；
   - 全面支持 **OAuth 2.0 PKCE 扩展安全协议**（自动生成 S256 挑战哈希 `code_challenge` 与 `code_verifier` 验签）；
   - 彻底解决 `redirect_uri_mismatch` 缺陷，规范消除末尾自动追加 `/` 斜杠问题，支持自定义配置并提供常用回调地址标签；
   - 修复此前请求越权敏感 scope 引发的 `invalid_scope: the requested scope is not allowed` 报错（遵从 Salesforce 官方规范，自动继承 Connected App 配置的授权范围）；
   - 自动解析 Salesforce 官方 OIDC UserInfo，准确提取真实企业租户（如奥林巴斯等）与用户信息；
   - 浏览器回调完成页升级为多 CRM 品牌自适应展现，彻底告别单平台模板；
   - 登录凭据自动双向同步至本地 Salesforce CLI (`sf`)，自动关联本地别名 `aliNewStageFull` 并使 CLI 立即处于 Connected 有效状态。

4. **双重自动续期与令牌保活引擎 (Proactive Auto-Renewal)**：
   - 针对纷享销客客户端凭据模式和 Salesforce/销售易不同特性，实现统一的 `renewToken`；
   - **主进程后台巡检**：每 30 秒自动轮询检测当前会话，当 Token 剩余时间小于 10 分钟或已过期时自动静默刷新；
   - **前端倒计时守护**：会话看板增加 `[● 自动续期]` 标识，并在即将到期时自动触发静默续期；修复手动续期按钮无 `refresh_token` 时报错的问题。

5. **线上代码与元数据本地工程一键拉取落盘 (`pull_crm_project_code`)**：
   - 新增多 CRM 通用工程拉取工具 `pull_crm_project_code`，彻底告别以往大模型仅输出 Markdown 虚假文本的问题，真实在本地磁盘创建工程目录与文件；
   - 纷享销客：自动拉取并落盘 `metadata/object_manifest.json`、核心对象 `metadata/objects/*.json`、查询脚本与 `package.json`，并自动完成 Git 初始化；
   - 销售易：支持下载并解压服务端代码包 ZIP 至 `src/codePackages/`，生成 `AllxObjects.md` 与字段定义；
   - Salesforce：自动生成 `manifest/package.xml`（包含全量 72,003 个组件清单）、初始化 `force-app` 结构并拉取真实 Apex 类与元数据。

6. **方案确认后自动调用工具执行铁律**：
   - 在 AI 调度引擎中植入最高优先级执行指令：当用户回复“确认”、“同意”、“不能自动执行吗”等指令时，强制 AI 必须立即调用 `bash` 或 `pull_crm_project_code` 工具在本地执行到底，严禁输出“请在终端按顺序执行”并让用户手动敲命令。

7. **右侧 Codex 项目文件树 10 层深度穿透与大文件夹分批加载**：
   - 将目录树扫描深度从原先的 4 层扩展至 10 层，彻底解决深度嵌套的 `force-app/main/default/classes` 无法展开看到具体代码文件的缺陷；
   - 增加文件夹子文件计数角标（如 `classes (6,470)`、`lwc (578)`、`triggers (502)`）；
   - 引入大文件夹分批加载保护（每次展示 100~150 项），配合上方实时文件名过滤，保障数千个类文件时依然丝滑流畅。

8. **1M Token 上下文溢出防冲垮守护与终端 ANSI 净化**：
   - 在 CLI 命令执行中注入 `CI=true` 与 `SF_USE_PROGRESS_BAR=false`，消除 Salesforce CLI 产生数百万字符动画进度条的问题；
   - 底层过滤 ANSI 控制序列并压缩重绘行；
   - 在 AI 工具返回注入点增加 `formatSafeToolResultString` 安全熔断，任何超大输出均被安全收敛在 25,000 字符内，彻底消除了 `HTTP 400: The input token count exceeds the maximum number of tokens allowed 1048576` 报错。
