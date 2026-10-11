1、修复 AI 执行 SQL 工具 (execute_sql_query) 偶发空指针与错误提示机制：
   - 修复访问 queryRes 时未正确解构 queryRes.data 导致的 `Cannot read properties of undefined (reading 'slice')` 异常；
   - 增强数据服务底层错误信息捕获逻辑，深度兼容各种 HTTP 错误返回体；
   - 增加销售易标准字段智能自愈提示（提醒模型标准客户对象的名称字段为 name 而非 accountName，引导模型自愈修正 SQL）；
2、修复 AI 工具调用多轮收敛机制，杜绝“无回答内容”；
3、全面支持 Google Gemini 官方生态与 DeepSeek Harness 架构。
