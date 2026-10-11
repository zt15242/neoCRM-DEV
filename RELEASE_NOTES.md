1、修复 AI 执行只读 SQL 工具 (execute_sql_query) 报错问题：
   - 修复调用 dataService.executeQuery 时未解构 queryRes.data 导致抛出 `Cannot read properties of undefined (reading 'slice')` 的异常；
   - 增加对 SQL 执行状态与空结果集的安全判空保护，若 SQL 语法有误则将真实错误信息透传回模型进行自动修正；
2、修复 AI 对话工具调用死循环与“无回答内容”问题：
   - 新增工具调用智能去重与「上下文直注总结兜底机制」，确保 100% 流式输出完整、详尽的 Markdown 分析报告；
   - 优化对象检索工具单次返回容量至 250 个；
3、全面支持 Google Gemini 官方生态与 DeepSeek Harness 风格 AI 对话工作台。
