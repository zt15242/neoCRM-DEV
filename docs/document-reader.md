# 文档读取

文件分析使用应用内置解析工具和加密的「文档阅读与核对」技能，不需要用户配置 Office、Python 或额外的 MCP 服务。上传、粘贴、拖拽、项目文件引用及对话工具调用使用相同的解析入口。

| 格式 | 提取范围 |
| --- | --- |
| XLS、XLSX、XLSM、CSV、TSV、ODS | 所有工作表，保留单元格地址、公式及缓存结果；不运行公式、宏或刷新外部数据 |
| DOC、DOCX | 正文、表格文字、页眉、页脚、脚注、尾注和文本框；不提供渲染后的页码 |
| PDF | 按页提取可复制文字，包含中文 CMap 支持；无文本页明确提示未执行 OCR |
| PPTX | 按演示文稿实际顺序提取幻灯片文字、表格文字及演讲者备注 |
| PPT | 旧格式的文本记录；可能重复，不能保证幻灯片顺序；逐页核对建议转为 PPTX |
| 文本和代码 | UTF-8，支持带 BOM 的 UTF-16 |

图片、图表、SmartArt 和复杂版式的视觉信息不属于文本提取范围。扫描版 PDF 不会被当作空文件；需要 OCR 时应另行接入识别能力。

## 工具

`read` 自动识别 Office/PDF。推荐使用 `read_document` 查看目录后选择分段：

```js
await tools.read_document({ file_path: "财务.xlsx", mode: "info" });
await tools.read_document({ file_path: "财务.xlsx", section: "sheet-2", offset: 1, limit: 200 });
await tools.read_document({ file_path: "说明.pdf", section: "page-3" });
await tools.read_document({ file_path: "汇报.pptx", section: "slide-2" });
```

`offset` 是当前选定范围的行号；不传 `section` 时按整个文件的分段顺序分页。用返回的 `nextOffset` 继续当前范围，用 `nextSectionOffset` 作为 `section_offset` 继续查看分段目录。超过 2000 字符的单行会拆成可寻址的多行，分页不会丢失其尾部。

正文默认 200 行、20000 字符，每次最多 2000 行、30000 字符。目录每次最多 100 个分段。单文件上限 50 MB，压缩包展开上限 128 MB，提取文本上限 800 万字符；超过限制会明确失败，不能当作完整读取成功。

## 附件与会话

输入框支持从 Finder / 资源管理器复制一个或多个文件后按 Cmd+V / Ctrl+V 粘贴，也支持剪贴板截图和拖拽。普通文字、代码和从 Excel 复制的单元格保留原有文字粘贴行为。单文件最大 50 MB，文件添加期间显示进度并暂停发送；单个文件失败不会中断同批其他文件。

附件区可以移除文件，较多时在限定高度内滚动。支持的文档自动提取文字；压缩包、音视频及其他二进制格式可作为文件附件保留，明确显示「暂无预览」，不声称已解析内容。图片保留原件；当前 `read_image` 仅返回文件信息，图像识别需要另外具备图片理解能力。

具有真实路径的文件保留原路径引用；没有路径的剪贴板或拖拽数据保存到应用数据目录 `ai-attachments` 下，每个附件使用独立目录。对话可在预览之后继续读取原件；同一主会话派发的代理继承这些已授权附件的路径。只有用户主动添加的准确文件路径可在项目外读取，其他目录访问及写入边界不变。

附件中的指令作为资料处理。Office/PDF 不允许通过普通文本替换工具覆写。损坏或密码保护的文档在解析时明确报错，失败上传会清理临时原件。其他二进制格式仅添加文件引用，不进行文本解析。

## 运行与验证

PDF.js 和 Word 解析库保留为主进程外部依赖，打包时包含 PDF worker、CMaps 及字体资料。PDF 文本提取有纯 JavaScript 矩阵实现，支持没有可用原生 Canvas 二进制的架构。开发时文档测试需要 Node.js 22.13 及以上；桌面端使用 Electron 自带的运行时。

```sh
node scripts/test-composer-file-paste.mjs
node scripts/test-document-reader.mjs
NEO_TEST_NO_CANVAS=1 node scripts/test-document-reader.mjs
NEO_TEST_PACKAGED=1 node scripts/test-document-reader.mjs
node scripts/test-agent-sessions.mjs
node scripts/test-chat-session-isolation.mjs
npm run build
```

测试包含中文 Word/PDF、旧版 DOC、旧版 PPT 文本记录、第二张工作表、预览之后的行、公式空缓存、大文件分页、密码保护、大小限制、附件白名单、标准/PTC/Gemini 调用，以及 Electron ASAR 中的实际解析。

粘贴测试覆盖系统文件列表的中文路径、Finder 二进制/文本 plist、Windows DROPFILES 和 Linux URI 列表；在实际 Electron 输入框验证多文件/截图粘贴、普通文字未被劫持、部分失败、附件发送和读取期间的发送拦截，全程不改写系统剪贴板。
