### 🚀 版本更新说明 (v1.8.11)

1. **邮件系统全面升级为 50ms 极速增量收取与双模同步架构**：
   - **毫秒级增量检测 (`mode: 'incremental'`)**：彻底废除此前定时自动收取每次全量重扫 1900+ 封邮件的重型开销；系统自动记录上次同步最大序号 (`lastSyncSeq`)，后续后台定时自动获取（每 2 分钟）与日常手动收取时，仅检查大于该序号的新邮件，无新信时 50ms 极速退出，零资源浪费；
   - **双模同步按键**：顶部状态栏保留 **「📥 同步全部历史邮件」**（执行收件箱全量目录扫描对账）与 **「⚡ 快速增量收取」**，双模切换清晰直观；
   - **历史正文 200ms 按需加载与缓存**：收件箱千封历史邮件目录完整呈现，点击任意未预取正文的历史邮件时，系统毫秒级从真实 IMAP 抓取正文并缓存，阅读顺畅无阻。

2. **全面修复「全部回复 (Reply All)」抄送人缺失缺陷**：
   - 重构 `getReplyAllData` 算子：原发件人精准进入 `To` 收件人；
   - 自动提取原邮件 `To` 与 `Cc` 中除了“当前用户自己”与“原发件人”以外的所有其他干系人，完成去重后自动填入 `Cc` 抄送栏；
   - 弹出的写信窗口自动展开抄送栏并完整呈现所有抄送成员，原邮件信头与引用文本格式化带入，确保团队协同无遗漏。

3. **邮箱 UI 交互与文件夹联动彻底加固**：
   - **文件夹联动切换**：点击左侧导航栏切换文件夹（如从收件箱切到已发送）时，右侧主详情区**自动联动切换至该文件夹下的第 1 封邮件**，彻底根除切到已发送箱后右侧依然残留显示收件箱上一封邮件的界面错乱；
   - **已发送箱列表直观化呈现**：已发送列表行顶部自适应切换为 **`收件人: 对方姓名/邮箱`**（不再冗余显示自己的名字），标签精准展示 `已发送`；
   - **列表筛选器新增显式「全部」按键**：列表顶部新增 `全部` / `未读` / `紧急` / `已分析` 独立切换胶囊，支持一键清空筛选状态，切换时自动重置邮件焦点；
   - **快捷回复条事件联动打通**：详情底部的即时输入框与“切换至全功能写信窗口 (含 AI 智能扩写)”链接无缝打通，输入的文字可直接带入弹窗继续编辑或直接发出。

---

### 🚀 版本更新说明 (v1.8.10)

1. **全新上线 Foxmail 风格企业级真实智能邮件客户端与 AI 副驾驶系统**：
   - **经典 Foxmail 四栏桌面协同布局**：
     - 左栏：支持多账户切换、未读角标、标准文件夹（收件箱、发件箱、草稿箱、星标关注、已删除）与联系人画像中心快捷入口；
     - 中栏：支持发件人、主题、正文、标签全文检索与分类筛选，直观透出 AI 需求分析与紧急程度小徽章；
     - 右栏：高保真信头展示、HTML / 纯文本邮件正文安全隔离渲染、附件预览下载、底部快速一键回复条；
     - 协同栏：可折叠/展开的 AI 智能副驾驶协同抽屉。
   - **全面支持 8 大主流邮件服务商真实登录 (零假数据)**：
     - 完整覆盖：腾讯企业邮、QQ邮箱、Exchange、Microsoft 365 国际版、Microsoft 365 国内版 (世纪互联)、Gmail、163邮箱、其它企业自建邮箱；
     - 引入生产级 `imapflow`、`nodemailer` 与 `mailparser`，支持真实的 TLS/IMAP 握手认证校验、邮件报文拉取解析以及 SMTP 外网真实邮件发送；
     - 彻底清除所有预置模拟账号与模拟邮件，支持多真实邮箱账户创建、独立收件箱隔离与合并视图自由切换。
   - **AI 邮件需求深度分析 (Needs & Intent Analysis)**：
     - 剥离客套言辞，提炼核心业务主导意图与要旨概括；
     - 自动归类提炼核心业务需求清单（功能、商务、合同、支持、二次开发）；
     - 情绪与紧迫等级仪表盘（高/中/低），输出事实判定依据；
     - 梳理关键跟进行动项 (Action Items Checklist，带责任角色建议与时效要求)；
     - 输出商业博弈洞察并自动关联当前 CRM 业务线索。
   - **AI 定制化智能回复生成器 (Smart Reply Generator)**：
     - 支持 6 种商务语气模板（商务严谨、温和礼貌、简洁高效、商务谈判还价、技术专业、礼貌婉拒）；
     - 自动结合发件人人物性格特征自适应调整措辞，支持输入用户自定义重点指示，生成策略构思说明并一键采纳填入写信窗口。
   - **根据【指定邮箱】深度挖掘人物画像 (Persona & Profiling)**：
     - 支持输入任意指定联系人邮箱地址，360° 深度透视其决策者层级（核心决策把关人/技术架构负责人/商务采购官/业务关键人）；
     - 提炼性格特质标签、沟通风格深度解读、核心利益关切与历史痛点、合作阻力风险预警；
     - 💡 面授机宜输出**高价值后续沟通与谈判破局策略建议 (公关锦囊)**；
     - 配备联系人私有业务跟进备忘便签，支持本地随时编辑保存。
   - **写邮件独立弹窗与 AI 代写润色助手**：
     - 弹出式独立写信窗口，支持收件人、抄送、主题、富文本正文；
     - 内置 AI 智能代写助手：输入粗略要点，一键自动扩写为标准得体的商务中英文邮件。

2. **全面对齐开源 workbuddy2api-hub (v1.8.0) 修复反代调用异常**：
   - **出站指纹头族严格对齐官方 5.8.x 实测规范**：修复 `X-Conversation-ID` 剥离连字符导致的 `11-128 (conversation id missing)` 渠道校验拦截，补充 `monitor_promptPrepareStartTime`、`monitor_httpSendTime` 与 `X-Request-Trace-Id` 监控头，国内版 UA 升至 `5.8.3`，国际版对齐 `5.8.4`；
   - **上游 WAF 敏感特征免疫清洗 (`sanitizeUpstreamMessages`)**：将 `developer` 角色归一化为 `system`，过滤敏感语序指纹，杜绝非法渠道拦截；
   - **内存直连派发机制 (Zero-Port Conflict)**：选择 WorkBuddy 时系统在进程内直接调度流式管道，彻底摆脱对本地 8788 端口监听的依赖，彻底免除端口冲突与网络拦截；
   - **扫码登录排错交互强化**：显著置顶电脑默认浏览器一键授权主入口，增加微信拦截跨域 Cookie 的明确指引。

---

### 🚀 版本更新说明 (v1.8.9)

1. **彻底根除正文被后台压缩提示文本污染的致命缺陷**：
   - 彻底切断自动上下文压缩时通过 `content_delta` 派发提示文本的逻辑，自动压缩全面回归纯后台静默无感运转；
   - 解决 AI 助手回答区域被生硬插入 `> *[前序上下文达到阈值，已自动提炼 DSH 8 节工程 Checkpoint 压缩记忆...]*` 导致真实业务解答缺失、交互截断的问题；
   - 压缩提炼完成后仅通过顶部卡片与轻量通知呈现，助手的正文输出保持 100% 干净，只呈现真实的业务分析、字段与数据。

2. **多工具执行收敛轮 (Synthesis Round) 路由端点与数据保底强化**：
   - 全面修复大任务多工具执行完毕后，收敛总结轮缺少 `/v1` 智能补全导致部分反代网关报错的问题；
   - 增加对总结响应对象的安全空值防御（避免极端网络超时时出现空指针异常），并内置物理工具执行结果的结构化 Markdown 保底渲染，彻底打通“工具执行 ➔ 汇总解析 ➔ 表格呈现”的完整闭环。

3. **系统提示词精简与 DSH 标准 Checkpoint 注入规范**：
   - 严格遵循 DeepSeek Harness 标准规范，取消系统提示词中重复塞入 Checkpoint 的臃肿设计，前序历史工程记忆仅作为对话流首部 `<compacted-summary>` 结构化切片注入；
   - 消除单轮上下文数千 Token 的重复浪费，大幅缩短模型首字响应时延 (TTFT)，确保多轮复杂数据检索与跨系统比对时序清晰严密。

---

### 🚀 版本更新说明 (v1.8.8)

1. **彻底修复长对话自动压缩 (Context Auto-Compaction) 失灵与时序断裂问题**：
   - **全要素真实上下文计量引擎**：彻底摒弃仅计算 `m.content` 导致漏算海量工具回执的缺陷，将 `m.content`、`m.toolCalls.arguments`、`m.toolCalls.resultData` 及 `attachments` 真实体积全量纳入计量，未压缩达到 6 轮或真实字符达到 22,000 时灵敏自愈触发压缩，彻底解决自动压缩“永远不触发”、最终硬踩 Cloudflare 524 超时的问题；
   - **严格对齐用户提问轮次边界 (User Turn Boundary Alignment)**：依据 DeepSeek Harness 官方规范，压缩切分点向前寻找并严格对齐至 `user` 提问起始边界，保留活跃尾部（Verbatim Tail）始终由合法 User 消息开启，彻底根除 Assistant/Tool 孤立置顶导致的“对话断开、接不上上文”致命 Bug；
   - **工具数据全量注入压缩提示词**：无论 Assistant 文本是否有内容，均将执行工具的名称、关键入参、回执摘要与数据样本完整编码输入总结引擎，杜绝 Checkpoint 沦为空洞套话；
   - **DSH 标准 `<compacted-summary>` 结构化对话注入**：在上下文历史队列首部以官方标准结构块注入前序记忆，并由助手进行确认吸收，确保大模型 100% 紧密承接前序工程与字段事实；
   - **高可用总结灾备与极速体验**：自动压缩触发时实时下发流式提示消除假死感，主模型异常时自动无感接入 SiliconFlow DeepSeek-V3 毫秒级生成 Checkpoint，确保压缩 100% 成功。

2. **语法级安全的工具剪枝服务 (`pruneConversationHistory`)**：
   - 遵循 DSH `@deepseek-ai/dsh-compaction-tool-result-pruner` 规范重构工具剪枝；
   - 针对结构化 JSON 数据做语义级数组与字段收缩，杜绝字符串暴力截断导致 JSON 语法破坏与解析报错；针对文本日志采用 `Head (70%) + [... DSH Pruned ...] + Tail (20%)` 安全剪枝。

---

### 🚀 版本更新说明 (v1.8.7)

1. **彻底解决大任务频繁触发 Cloudflare HTTP 524 超时与模型中断**：
   - **动态滑动窗口与工具上下文智能修剪 (`pruneConversationHistory`)**：
     - 冷热工具数据分离：保留最近 2 项活跃工具调用的高精完整细节，将更早的前序工具输出按需压缩摘要至精简预览，并标注 `[前序输出已自动精简，保障通信时效]`；
     - 彻底消除多步工具调用（如连续执行 15+ 项工具）导致的单轮上下文膨胀至 15 万 Token 导致的计算瓶颈，从根本上避开 Cloudflare 中转网关 100 秒的超时硬限制；
   - **历史跨轮次工具结果防膨胀优化**：
     - 将前序历史消息加载时的工具结果上限由 20,000 字符收敛至 3,500 字符，消除长历史对话的无谓 Token 虚胖，提速 Prefill 首字响应；
   - **兜底总结轮 Payload 绝对安全硬上限**：
     - 为工具数据收敛提取增加 `formatSafeToolResultString(t.data, 2000)` 并设定 25,000 字符绝对安全上限，杜绝未截断的大型 JSON 塞入最后一轮导致超时。

2. **上游网关超时与抖动自动无感重试机制 (`fetchWithRetry`)**：
   - **多级渐进退避重试**：自动拦截 `HTTP 524` (Cloudflare Timeout)、`504` (Gateway Timeout)、`502`、`503` 及 `429` 瞬时错误，执行最多 2 次自动重试；
   - **超时激进压缩自愈**：检测到 524 超时时，立即开启 `aggressive` 激进压缩模式并给出网关状态提示，大幅缩减预填耗时，重试成功后流程平滑继续执行，任务不再半途夭折。

3. **Cloudflare / Nginx 原始 HTML 报错结构化清洗 (`cleanHttpError`)**：
   - 彻底拦截并清洗网关反代直接抛出的整页原始 HTML（如 10KB 的 Cloudflare 524 错误页），结构化提取中文友好错误说明，杜绝生涩混乱的 HTML 源码块直接倾倒污染用户界面。

---

### 🚀 版本更新说明 (v1.8.6)

1. **彻底解决 Salesforce CLI 别名 (sf alias) 混乱与多环境踩踏覆盖问题**：
   - **摒弃全局硬编码别名**：彻底移除了此前导致所有连接器共享单一别名（如 `aliNewStageFull` / `DigitalDev`）的历史硬编码与提示词静态绑定；
   - **全新 6 层环境专属动态推导算法 (`resolveSalesforceAlias`)**：
     1. **连接器自定义优先**：当连接器配置了专属别名（`cliAlias`）时，严格优先使用；
     2. **账号/组织既有绑定对齐**：自动匹配本地 `~/.sfdx/alias.json` 中与当前登录用户 (`username`) 或组织 ID (`orgId`) 精确绑定的历史别名；
     3. **官方预置环境专属别名隔离**：阿里中国生产 (`SF_Ali_Prod`)、阿里中国沙盒 (`SF_Ali_Sandbox`)、全球版生产 (`SF_Global_Prod`)、全球版沙盒 (`SF_Global_Sandbox`) 四套预置环境互不干扰；
     4. **基于“我的域 (MyDomain)”智能推导**：自定义连接器自动从实例 URL 提取专属子域名（例如 `olympus--stagefull` ➔ `olympus_stagefull`，`canon--uat` ➔ `canon_uat`）；
     5. **环境名称与唯一 ID 兜底保底**：确保极端缺少域名时依然生成全局唯一的合法别名（如 `SF_xxxx`），各环境各行其道，绝不串号；
   - **全链路凭据与 CLI 联动更新**：
     - `sessionStore.syncToSalesforceCli` 与 `authService.loginWithSalesforceCli` 仅更新当前环境对应的专属别名，杜绝多组织互相覆盖；
     - 磁盘凭据读取 (`getAuthFromDiskByAlias` 与 `getAuthFileFromDisk`) 严格按照当前环境的实例域名与别名匹配，杜绝跨组织误取其他环境的文件；
     - AI 智能体上下文动态注入当前环境真实别名 (`${sfAlias}`)，消除模型幻觉；
   - **连接器中心交互体验升级**：
     - 在【新建/编辑连接器】弹窗中新增「Salesforce CLI 组织专属别名 (sf alias)」配置项；
     - 在【连接器详情页】参数面板中直观呈现当前环境专属别名及「环境隔离」徽章。

---

### 🚀 版本更新说明 (v1.8.5)

1. **Salesforce 生产环境写保护与沙盒/测试环境自由操作分级体系**：
   - **生产环境只读红线保护**：引入 `isProductionEnvironment` 智能研判引擎，当连接为 Salesforce 生产正式环境 (`Production` 或直连 `login.salesforce.com` / `login.sfcrmproducts.cn`) 时，底层严格拦截 `createRecord` (新建记录)、`updateRecord` (更改记录)、`deleteRecord` (删除记录)、`createCustomObject` (新建对象) 及 `createCustomField` (新建字段)，防范误操作；
   - **沙盒/测试环境自由操作**：命中 `Sandbox`、`Test`、`.sandbox.`、`--` 沙盒特征的环境完全开放写操作权限，在用户确认方案后自由执行记录增删改与字段创建。

2. **Salesforce 流程资产 (Flow / Process Builder) 零门槛扫描与安全锁精准收敛**：
   - **安全许可锁精准收敛**：明确底层安全许可锁仅针对销售易 (NeoCRM) 平台内部流程与审批流；当连接 Salesforce 或其他第三方 CRM 时，彻底解除安全锁拦截；
   - **Tooling API 流程打通**：在 `workflowService.getFlowDetail` 中补齐对 Salesforce `FlowDefinitionView` 原生 SOQL 查询与属性映射，支持直接调阅 Salesforce 流程元数据详情；
   - **智能体系统提示词对齐**：植入规范铁律，排查 Salesforce 时必须直接调用 `list_flows` 调阅流程，绝不提示“流程需授权密码”或中断排查。

3. **后台长任务 (DSH Background Jobs) 全流程实时可见与单例任务池打通**：
   - **全局进程单例任务池**：重构 `backgroundJobs` 任务调度表为跨模块静态单例，打通主进程 IPC 与智能体工具执行层；
   - **所有前台/后台长命令自动登记追踪**：无论是后台异步命令还是智能体调用的长耗时 Python 脚本、构建等，一律登记到任务表，支持黄色呼吸灯运行中状态、秒级耗时、完成/错误状态统计与点击实时查阅输出流；
   - **面板实时轮询**：右侧面板停留在【后台任务】Tab 时每 1.5 秒自动轮询，标签页实时展示正在运行的任务计数。

4. **大任务工具调用卡片自动聚合折叠 (`ToolCallsGroup`)**：
   - 当调用 2 项及以上工具且已有正文或执行完成时，自动聚合折叠为一行高度仅约 34px 的超紧凑状态栏（如 `🛠️ 已调用 15 项工具 · 终端命令 ×11 文件写入 ×2 (7.3s)`）；
   - 支持一键展开/收起，杜绝多工具卡片占据过多屏幕空间，使页面核心阅读区聚焦在回答与成果资产上。

5. **切换会话/页面后台流程持续无缝推进与防止提前截止**：
   - 常驻挂载 `<AiHarnessStudio>` 消除 Tab 切换导致的组件条件注销与流事件解绑；
   - 升级为按会话隔离的流状态字典 `activeStreams`，多会话并发安全；
   - 彻底修复当正文尚未输出时因切换会话跌入“已执行完成 / 继续输出总结”假截止分支的 Bug。

6. **用户发送消息快捷复制与自由划选支持**：
   - 用户消息气泡增加悬停快捷复制按钮与底部文字复制链接，支持一键复制到剪贴板；
   - 注入 `select-text` 与清晰对比度选区样式，支持鼠标直接拖拽划选文本。

7. **输入框高度塌陷与无法输入 Bug 彻底修复**：
   - 强制物理级 `minHeight: 36px` 与 `min-h-[36px]` 约束，杜绝在切换 Tab 导致 `scrollHeight` 为 0 时输入框被压扁压没；
   - 点击输入框卡片空白区域全自动聚焦文本域。

8. **左侧工具栏一键折叠隐藏与全屏画布交互 (Cmd+B / Ctrl+B)**：
   - 侧边栏顶部增加 `<PanelLeftClose>` 按钮，折叠后主工作区顶部呈现对称 `<PanelLeftOpen>` 按钮；
   - 支持全平台快捷键 `Cmd+B` (Mac) / `Ctrl+B` (Windows/Linux)；
   - 顶部布局严格注入 macOS 红绿灯安全边距 (`pl-20`)，彻底解决非 AI 页面折叠后红绿灯与标题重叠错位问题。

9. **版本号动态联动与 Git 敏感地址脱敏安全防护**：
   - 彻底移除了界面硬编码的 `v1.7.9`，通过 `__APP_VERSION__` / `getAppVersion` 与 `package.json` 自动联动呈现最新版本；
   - 移除 WorkBuddy 卡片右上角跳转 Git 的外链按钮；
   - 日志系统与自动更新输出增加 `sanitizeLogString` 脱敏网，将 `ssh://git@...`、`From https://.../*.git` 自动脱敏为 `[REDACTED_GIT_URL]`，严防业务仓库地址泄露。

---

### 🚀 版本更新说明 (v1.8.4)

1. **深度排查并彻底解决大任务/海量文件下软件卡死与 CPU 飙高**：
   - **磁盘目录扫描 2.5 秒内存级缓存与防抖**：针对大任务中密集执行工具导致高频全量递归遍历磁盘的严重缺陷，在主进程 `projectService.ts` 中建立 `treeCache` 与 `artifactsCache` 短周期内存缓存；并在前端 `CodexTerminalPanel.tsx` 中引入 1000ms 防抖更新机制，彻底消除高频重复磁盘 IO 锁死主线程；
   - **海量噪音目录过滤与节点硬上限熔断**：为 `getDirTree` 设置 6 层最大深度与 `maxNodesCap = 1500` 节点硬上限，全面屏蔽 `coverage`, `.next`, `.nuxt`, `.turbo`, `.cache`, `target`, `bin`, `obj`, `.gradle`, `.cargo`, `vendor` 等现代工程高频构建目录，杜绝无节制递归扩散；
   - **前端消息列表与全文本正则扫描极致记忆化**：使用 `React.memo` 深度包裹 `AiMessageItem` 与 `MarkdownRenderer`，将 `extractDecisionsFromText`、`extractSchemaPlanFromText`、`extractWorkflowPlanFromText` 等开销巨大的全文本正则扫描全部改为 `useMemo`，使历史几十条长文本消息在流式吐字期间保持 0 重绘，前端 CPU 消耗大幅降低。

2. **彻底解决 Salesforce 认证后主进程卡死 15 秒与自动续期失效**：
   - **保存会话后台非阻塞异步化**：将 `sessionStore.saveSession` 中的 `syncToSalesforceCli` 改造为后台非阻塞异步执行（基于 `child_process.exec`），认证完成后前端界面 0ms 瞬间显示“已连接”，完全消除由于同步 `execSync` 引起的窗口假死与未响应；
   - **本地磁盘凭据 0ms 极速命中**：新增 `getAuthFromDiskByAlias`，优先直接读取本地磁盘已认证的 `~/.sfdx/<username>.json` 缓存文件（耗时 0.2ms），彻底避免在每次换号或切换环境时重复唤起重量级 CLI 子进程；
   - **全生命周期持久化与三层 401 静默自愈**：补齐 `refresh_token` 磁盘全自动提取，建立【磁盘缓存即时探测 -> 本地 sf CLI 自动联动 -> 云端 OAuth2 多端点接口换新】三层自愈防线。

3. **MCP 扩展服务安全鉴权与认证体系全面强化与升级**：
   - **全方位身份认证与凭据配置 (Authentication)**：
     - **Bearer Token 认证**：支持配置 API Key / JWT 令牌，出站请求自动规范组装 `Authorization: Bearer <token>`（带明文/密文小眼睛切换）；
     - **Basic 认证**：用户名与密码独立输入，自动 RFC 7617 Base64 编码并注入 `Authorization: Basic <base64>`；
     - **自定义 Header 鉴权**：支持自由指定鉴权 Header 键名（如 `x-api-key`、`Private-Token`）与密钥值；
     - **附加自定义 Headers**：支持动态扩展任意数量的自定义 Header（如 `Cookie`、`X-Tenant-Id` 等）；
     - **Stdio 环境变量鉴权注入**：支持为 Stdio 本地进程注入 `GITHUB_TOKEN`、`API_KEY` 等环境变量；
   - **支持标准 JSON 快速导入/粘贴**：弹窗支持一键粘贴 Claude Desktop 或 Cursor 格式的 `mcpServers` JSON 配置并自动解析填表；
   - **插件中心与设置中心能力对齐**：在【插件与扩展中心】的新增 MCP 弹窗中同步补齐了完整的鉴权配置选项。

---

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
