### 🚀 版本更新说明 (v1.7.1)

1. **彻底解决多轮对话“接不上上下文、前序记忆断层”核心缺陷**：
   - **工具历史全量恢复还原**：深入排查发现，此前在构建多轮历史给大模型时，只传递了文本，完全丢失了前序轮次中 assistant 发起的 `tool_calls` 以及对应的 `role: 'tool'` 结果；
   - 现已全面对齐 OpenAI 与 Gemini 原生流标准：每一轮历史中完整保留并还原所有的 `tool_calls` 和工具返回数据，大模型在多轮对话中能够清晰、完整地继承之前的每一项操作、对象数据与文件产物，对话永远接续顺畅！

2. **会话与上下文全面实现按项目隔离 (Project Isolation)**：
   - **双向联动同步**：在左侧切换项目文件夹时，自动将当前对话切换为该项目下的最近会话（若该项目暂无会话则自动进入该项目的专属新会话草稿）；
   - **会话强制绑定项目**：新建会话时严格绑定当前项目的 `projectId: activeProject.id`，彻底消除跨项目会话串味与历史混杂问题；
   - **工作台项目身份高亮**：工作台顶部与空状态视图清晰标识当前项目的物理工作区路径（如 `📁 [奥林巴斯] 专属工作区会话`）。

3. **对齐 DeepSeek Harness 官方标准物理文件挂载与编辑闭环**：
   - 参照 DSH 官方 `dsh-attachment` 规范，对所有通过 `@` 引用或上传的工作区文件进行结构化标准化包装：
     * 显式向大模型注入文件的 **物理绝对路径 (`fullPath`)**、**工作区相对路径 (`relativePath`)** 与大小；
     * 注入自主编辑指引：指导大模型在需要修改该文件时，直接调用 `str_replace_editor` 或 `edit` 传入物理绝对路径进行高保真替换；
   - 彻底解决了大模型只看到一段孤立文本，不知道文件真实物理路径、无法对原文件进行精准分析与编辑的问题。

4. **全面实现 DeepSeek Harness 官方自动上下文压缩引擎 (Auto-Compaction)**：
   - 当会话消息数达到 8 条以上，或历史字符估算达到上下文承载阈值时，系统在后台**自动静默触发结构化记忆压缩**；
   - 采用 DSH 官方标准的 **8 节结构化工程 Checkpoint 模板**（Primary Request and Intent, Key Technical Concepts & CRM Objects, Files, Code & Artifacts, Errors and Fixes, Pending Jobs, Current Work & Progress, Next Step, Critical Context & User Preferences）；
   - 将前半部分过长历史浓缩为 Checkpoint 摘要存入 `compactionSummary` 并保留最近几轮对话，实现**核心工程记忆永久保留、Token 极大精简、长对话永远不断线且不超限！**
