### 🚀 版本更新说明 (v1.3.5)

1. **自定义 MCP 扩展服务支持请求头与多模式鉴权**：
   - 新增鉴权方式选择：无鉴权、Bearer Token（支持令牌输入并自动生成 `Authorization: Bearer` 头）、账号密码（Basic Auth 自动生成 Base64 凭据）、自定义请求头；
   - 支持动态添加、修改与删除任意多个自定义 HTTP 请求头（如 `x-api-key`, `X-Tenant-Id`, `Cookie` 等）；
   - Stdio 本地进程模式新增环境变量与鉴权凭据键值对配置，支持传递子进程启动凭证；
   - MCP 服务列表卡片新增直观的鉴权与请求头状态徽章。
2. **Skill 技能库全功能支持 ZIP 技能包**：
   - 支持一键导入 `.zip` 技能包，兼容业界标准的 `SKILL.md`（带 YAML Frontmatter）、`skill.json`、`manifest.json` 及多文件知识库归档；
   - 支持将本地 `.zip` 技能包直接拖拽至技能库界面自动解压与识别；
   - 支持单技能与批量打包导出为标准 `.zip` 技能包（包含 `SKILL.md`, `skill.json`, `README.md`），方便团队共享；
   - 保持严格的安全底线：系统内置加密技能禁止导出与下载，仅支持个人自定义技能导入导出。
