### 🚀 版本更新说明 (v1.6.1)

1. **全面对齐 DeepSeek Harness 官方 223 个内置插件架构 (Built-in Plugins)**：
   - 彻底打破此前只展示“已安装插件 (9)”的局限，按官方 DSH Desktop 规范完整接入 **223 个内置插件**：
     * **会话插件 (29 个，由 Agent 预设按会话组成)**：包含智能体执行循环（`dsh-agent-loop`）、指令注入（`dsh-agent-instructions`）、目标轮次驱动器（`dsh-goal-round-driver`）、文件原子读写驱动（`dsh-fs` / `dsh-tool-fs`）、代码高精编辑器（`dsh-tool-str-replace-editor`）、全文与正则检索（`dsh-tool-fs-search`）、终端进程执行驱动（`dsh-tool-bash`）、实时网络抓取（`dsh-tool-web`）、多 CRM 在线连接器驱动等；
     * **全局插件 (194 个，系统与所有会话共用)**：涵盖多智能体子代理（`dsh-subagent`）、沙箱隔离策略（`dsh-sandbox`）、会话持久化投影（`dsh-session-persistence` / `dsh-session-projection`）、MCP 客户端网关（`dsh-mcp-client`）、技能库文件系统（`dsh-skill-filesystem`）、令牌溢出熔断（`dsh-token-meter` / `dsh-spill`）等全套系统级组件；
   - **界面交互 1:1 还原 DSH 官方设计**：支持顶部操作栏（打开配置文件、导出诊断信息、打开终端）、搜索插件、预设模式切换（标准模式、专家模式、极简模式）及卡片运行状态监控。

2. **解决智能体“不知道做什么”的核心突破：植入 DSH 智能体自主行动协议 (Autonomous Agent Protocol)**：
   - 在 AI 调度引擎 System Prompt 中深度植入 DeepSeek Harness 官方智能体行为准则，彻底告别被动呆板与推卸命令：
     * **先调查后结论 (Investigate First)**：严禁空泛分析，遇到任务第一时间主动调用工具查清环境、目录与代码客观事实；
     * **任务拆解与待办对账 (Todo State Machine)**：复杂工程任务自主调用 `todo_write` 维护结构化待办清单，实时跟踪进展；
     * **代码与工程自主落地 (Execute Direct)**：编写代码自动调用 `write` / `edit` / `str_replace_editor` 落盘，执行命令自动调用 `bash` 运行到底，严禁把代码和命令贴在回复中让用户手动执行；
     * **闭环验证与容错自愈 (Verify & Self-Heal)**：执行后自动核验 exitCode 与文件生成状态，遇错自主分析参数重试，直至任务彻底闭环！
