# 会话存储与迁移

当前实现保留 Electron、React 和 TypeScript，历史存储使用 Electron 自带 SQLite，数据库操作在工作线程执行。

## 数据文件

文件均位于 Electron `userData` 目录，通常为 macOS 的 `~/Library/Application Support/neocrm-desktop` 或 Windows 的 `%APPDATA%/neocrm-desktop`，实际以应用运行配置为准。

| 文件或目录 | 用途 |
| --- | --- |
| `neocrm_ai_sessions.sqlite` | 迁移后的会话、消息、顺序、摘要及后台任务状态 |
| 同名的 `-wal`、`-shm` | SQLite 的运行文件；应用运行时不要单独移动或删除 |
| `ai-session-resources/` | 超过 64 KiB 的消息原文，以内容哈希引用和校验 |
| `neocrm_ai_sessions.json` | 迁移源文件，迁移后保留，不再更新 |
| `neocrm_ai_sessions.json.backup-<sha256>` | 首次导入前核验过的旧历史备份 |
| `neocrm_ai_sessions.sqlite.lock` | 应用实例独占标记，正常关闭会移除 |

## 首次运行

首次访问会话时自动迁移。旧 JSON 先备份，再逐条导入临时数据库、回读核对，成功后才使用 SQLite。损坏数据、重复会话或消息 ID 会阻止迁移并提示错误；系统不会用空历史覆盖原文件。

失败后先退出应用、保留原文件与备份，再修复数据或恢复已知正确的备份，重新启动即可重试。不要在同一数据目录同时运行新旧版本。检测到仍在使用数据的实例时，应先关闭该实例；不要直接删除仍有进程占用的锁。

升级后创建的新会话只在 SQLite 中。原 JSON 和迁移备份只代表迁移时的状态。清空聊天记录会清空数据库中的会话，并阻止执行中的迟到结果重新创建它们；迁移源和历史备份会继续保留。

## 备份和降级

普通备份应先完全退出 NeoCRM，再一起复制 SQLite 和 `ai-session-resources/`。保留原 JSON 和所有迁移备份，便于核对。不要仅复制仍在运行的 `.sqlite` 主文件。

需要恢复旧版兼容 JSON 时，在源码仓库完成构建，并在应用退出后运行：

```bash
npm run build
node scripts/export-ai-history.mjs --data-dir "/实际应用数据目录" --output "/新的备份目录/current-ai-sessions.json"
```

导出工具使用当前 Electron 的 SQLite，逐条读取包含消息的会话，将资源原文嵌回 JSON，输出会话数、消息数和校验值。目标目录须已存在，目标文件须不存在；不会覆盖已有文件。数据库被另一个应用实例占用时会停止。

降级前核对导出的数量、关键会话、工具结果与摘要，并备份完整的新存储。退出所有版本后，将导出文件复制到旧版所使用的 `neocrm_ai_sessions.json` 路径；不要把迁移时的旧 JSON 当作最新导出。新 SQLite 和资源目录应继续保留，便于恢复；之后在两个版本中分别产生的历史不会自动合并。

## 验证和当前边界

```bash
npm run test:agent-storage
node scripts/verify-built-session-store.mjs dist-electron
node scripts/verify-built-session-store.mjs "/实际应用包/Contents/Resources/app.asar"
```

存储测试在 Electron 的 Node 中运行，覆盖迁移、损坏数据保护、分页、资源校验、增量保存、后台任务与取消。打包检查直接从实际 ASAR 启动工作线程，没有用解包副本替代。

会话列表只加载摘要；当前会话仍读取全文，数据库消息分页接口已准备好，聊天页分页渲染尚未接入。模型执行仍在主进程，工作线程不会提供完整的进程崩溃隔离。Windows 实机、长期并发内存和异常断电恢复仍需后续验收。
