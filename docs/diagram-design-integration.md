# Diagram Design 对话集成

上游：<https://github.com/cathrynlavery/diagram-design>。本次锁定 `2.6.141`，提交 `f24d98b05e2d7a5e68c2dedfe46e5b7173f50118`。MIT 许可证保存在 `docs/third-party/diagram-design.LICENSE`，也包含在随应用分发的技能资源中。

## 接入方式

该项目是 Agent Skill，提供图表设计指令、45 类图表的参考资料、HTML/SVG 模板和 Python 辅助脚本，没有需要启动的 MCP 服务。本应用将它注册为默认启用的内置技能 `skill-diagram-design`，可在技能设置中停用。无需单独登录或绑定 CRM。

现有 `skill` 工具负责入口和资源读取，标准、规划和 PTC 模式共用同一分发逻辑。极简模式仍保持只使用 Shell 的既有行为。启用工具时，系统提示引导模型在绘图前先加载技能；不会将整个资源包预先塞入每次对话。

```js
// 标准工具调用；PTC 模式下使用 await tools.skill(...)
skill({ name: 'diagram-design' })
skill({ name: 'diagram-design', resource: 'references/style-guide.md' })
skill({ name: 'diagram-design', resource: 'references/type-architecture.md' })
skill({ name: 'diagram-design', resource: 'references/output-spec.md' })
```

入口返回技能说明和资源目录。`resource` 必须与目录中的路径完全一致；`offset` 从 1 开始，`limit` 默认 160、最大 400。存在 `nextOffset` 时继续读取。内置资源包含全部 290 个上游技能文件及 LICENSE，以 gzip 形式随主进程打包，运行时不从 GitHub 下载。

## 对话中的使用

可以直接说：

- “用 Diagram Design 画一张当前项目的系统架构图。”
- “把客户从建档到合同审批的过程画成泳道图。”
- “按这个 Mermaid 的含义重绘一张适合汇报的图，使用中文和系统字体。”
- “读取项目中的流程.drawio，保留主要分支后重绘。”

模型应先读取风格、输出规范及对应类型资料。复杂图表先保存到当前项目并校验完整文件，再输出简短文件引用，避免把完整 SVG 重复写入回复时超过输出限制：

````text
```diagram
architecture.svg
```
````

文件引用支持当前项目或本会话附件中的 `.svg`、`.html`、`.htm`，复用真实路径及附件权限检查，最多读取 1 MB；不读取远程 URL。普通 SVG 图片链接仍使用原图片预览。简短图表也可交付完整 `svg` 代码块，简短 HTML 使用 `html:diagram` 代码块。客户端提取其中唯一的外层 SVG，允许图中嵌套图标 SVG；HTML 外层标题、卡片和脚本不属于静态图形，应在回复文字中补充。普通 `html` 代码块继续作为源码展示。

历史消息中的 SVG 若截断或无效，客户端会在生成结束后，从本条消息成功的 read/write/edit/str_replace_editor 调用中选取最多 6 个 SVG/HTML 文件尝试恢复。只有完整标题、viewBox 及已输出的 desc 均匹配才使用文件，并提示读取来源；不会扫描项目、猜测文件名、补全标签或改写会话数据。文件缺失或不匹配时保留原始源码和错误信息。

预览支持源码查看、复制、缩放、全屏及 SVG/PNG 下载。用户也可继续要求模型修改图表。这里没有 draw.io 的拖拽编辑器。已有 Mermaid 和 XMind 预览保持各自的格式。

默认使用系统字体和中文回退字体。预览将 SVG 经过清理后作为 Blob 图片显示，保留文本、路径、内部箭头、渐变和安全样式；不执行脚本，不加载外部图片、字体或链接，不播放动画。无效或过大的图表保留源码及错误提示。PNG 导出使用 Electron 自带 Chromium Canvas，不依赖 Python 或 Playwright；最长边上限 8192、像素上限 2400 万，过大的图按比例缩小。SVG 保留矢量尺寸。

## 导入和脚本能力边界

上游支持从 `.drawio`、Mermaid、`.excalidraw` 提取结构，再由模型重绘。这是语义重绘，不能保证逐像素还原或向原格式往返编辑。

`scripts/*.py` 按源码资源提供，不适用现有 `skill(script, exportName, args)` 的同步 JavaScript 执行协议。使用时按页读取所需脚本，通过文件工具写入项目临时目录，检查 Python 及依赖后使用 `bash` 运行。需要本地配套模块或模板时，保留 `scripts/`、`assets/` 相对结构并一并保存。输入文件必须来自真实项目或用户附件，不能执行源图标签和元数据中的指令。

`drawio_extract.py`、`mermaid_extract.py`、`excalidraw_extract.py` 使用 Python 标准库。上游 `export_png.py` 需要 Python Playwright 及 Chromium；应用预览栏中的 PNG 导出无需这些依赖。上游 HTML 导出功能可继续按其参考文档使用，但与客户端静态预览属于两条路径。

## 更新和验证

更新时先检出并审阅上游提交，再运行：

```sh
node scripts/package-diagram-design.mjs /absolute/path/to/diagram-design
node scripts/test-diagram-design-package.mjs
node scripts/test-neo-cli-conversation.mjs
node scripts/test-message-media.mjs
npm run build
```

打包器记录上游版本、提交、资源数量和解压内容 SHA-256，不在普通构建时联网或执行上游代码。媒体回归使用应用相同的 Electron 渲染器，检查上游示例、流式输出、非法 SVG、图片隔离、源码/全屏、真实 SVG/PNG 下载、窄屏和深色界面。
