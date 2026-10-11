### 🚀 版本更新说明 (v1.3.6)

1. **全面打通自定义 MCP 扩展服务在 AI 对话中的挂载、探测与实时调用闭环**：
   - 新增完整的 `McpClientService` 标准 MCP 客户端引擎，支持远程 SSE (`text/event-stream` / Streamable HTTP) 与本地 Stdio 协议的 `initialize` 握手、`tools/list` 工具探测与 `tools/call` 实时调用；
   - **AI 对话输入框新增「🔌 MCP 扩展」挂载切换器**：可直观查看当前激活的外部 MCP 服务（如知识库 MCP）、切换挂载状态并查看其包含的工具数量；
   - **自动探测与同步工具列表**：保存自定义 MCP 服务或发起对话时，自动连接端点拉取真实的可用工具列表与 JSON Schema 参数，设置页卡片新增「🔄 一键同步工具」按钮；
   - **统一工具路由与双协议全支持**：在 OpenAI / DeepSeek 与 Google Gemini 原生协议中，自动将外部 MCP 服务的工具合并注入给大模型，并在系统提示词中明确引导优先调用外部 MCP 知识库，彻底解决询问 MCP 知识库时误查销售易对象表的问题。
