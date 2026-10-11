1、新增 AI 对话平台 (参考 DeepSeek Harness 开源架构)：
   - 专为销售易 (NeoCRM) 开发者与实施顾问打造的智能工作台；
   - 原生支持 DeepSeek-V3 极速对话与 DeepSeek-R1 深度推理，支持流式思维链展开折叠与耗时展示；
   - 全面支持 Google Gemini 官方生态：支持 Gemini 2.5 Pro、Gemini 2.5 Flash、Gemini 2.0 Flash 及思考实验版，支持原生 SSE 流式输出、原生深度思考 (thought) 解析与 Function Calling 工具调用；
   - 搭载销售易 Agent Harness 本地工具：AI 可自动感知当前登录租户、读取对象字典与字段元数据、执行安全只读 SQL，并展示调用轨迹；
   - 支持「@ 引用对象元数据」一键挂载指定业务对象的字段字典作为对话上下文；
   - 代码块增强：AI 生成的 SQL 语句支持在气泡内一键直达执行，就地渲染数据表格并导出 Excel；
   - 内置 5 大智能体预设角色（全能架构师、SQL 专家、实体设计器、PaaS 触发器专家、深度思考）；
2、新增系统与 AI 设置中心 (Settings Studio)：
   - 模型供应商管理：支持 DeepSeek 官方直连、Google Gemini 官方直连、预置第三方云平台 (SiliconFlow/OpenAI/Moonshot/智谱/通义千问/Claude) 以及自定义模型 API (支持 Ollama / 公司网关 / 探测可用模型 / 连接测试)；
   - 智能体引擎偏好：配置默认模型路由、本地工具开关、租户上下文注入、生成温度、Max Tokens 及全局自定义提示词；
   - 通用偏好设置：支持设置默认启动页面、SQL 查询默认行数与缓存清理；
3、导航栏与交互全面升级，支持快捷键 Enter 发送、中断生成与历史对话持久化。
