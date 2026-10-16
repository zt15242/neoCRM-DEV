### 🚀 版本更新说明 (v1.6.2)

1. **彻底解决智能体“不自动生成文件、不生成/运行脚本、不读取分析文件”的核心缺陷**：
   - **反幻觉红线 (Anti-Hallucination Guardrail)**：严厉禁止大模型在回答中空口声称“已在本地生成物理文件：D:\xxx.docx”、“经 Python 脚本直接运行验证...”等虚假推断与假动作！
   - **脚本生成与执行强制闭环**：当用户涉及生成脚本、运行脚本或读取分析代码时，强制在首轮调用 `read` 读取物理文件，调用 `write` 生成代码落盘，调用 `bash` 真实运行脚本并捕获真实 stdout/stderr 回报用户；
   - **模板生成物理文件直通**：当用户提出“生成订单模板”、“包含相关明细”、“Word/docx文件”时，大模型必须在第一轮调用 `get_print_template_fields` 获取线上真实字段，第二轮必须立即调用 `generate_print_template` 在当前项目工作区生成真实的 `.docx` 物理文件，并在右侧项目产物面板中一键打开！

2. **多明细子对象表格循环生成支持 (`detailTables`)**：
   - 升级 `printTemplateService.generatePrintTemplate`，全面支持传入多个相关子明细表格配置（`detailTables` 数组）；
   - 针对销售订单（`order`），自动完整生成：
     * **订购商品明细表**：`##={begin:orderProduct_prt}` -> `##={prt.productCode}`, `##={prt.productName}`, `##={prt.price}`, `##={prt.quantity}`, `##={prt.amount}` -> `##={end}`；
     * **订单回款与支付流水表**：`##={begin:orderPayment_prt}` -> `##={prt.payNo}`, `##={prt.payType}`, `##={prt.payAmount}` -> `##={end}`；
     * **系统审批流历史表**：`##={begin:approvalHistories_prt}` -> `##{prt}` -> `##={end}`；
     * **商务签章区**：准确带出需方盖章全称 `##{accountId.accountName}`。

3. **对象字段真实性强核验与不存在字段校准 (Truth-Grounded Field Calibration)**：
   - 针对用户提出的“看看其他对象是否存在字段，现在有的字段名称有问题，有的可能不是name是别的”，在 AI 调度引擎中植入最高优先级字段核验指令；
   - 强制模型在首轮必须调用 `get_entity_fields` 或 `get_print_template_fields` 向 CRM 平台拉取实时字段定义，严禁凭空臆造不存在的字段（如销售易中客户是 `accountName` 而非 `name`，合同是 `title` 而非 `name`，订单是 `po`，订单产品明细是 `productName`，严禁臆造 `poStatus`、`initAmount`、`paymentBalance` 等不存在的字段），向用户输出精准严格的真实字段对照表。
