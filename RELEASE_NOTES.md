### 版本更新说明（v1.8.53）

1. 修复 Windows 打包时 OpenCode 工作区构建无法启动 Bun 的问题，改为直接调用锁定 Bun 包中的 Windows 可执行文件。
2. 包含 v1.8.52 对 Windows 文件权限测试的兼容修复。

请使用本版本重新获取 Windows 安装包；GitHub Actions 将重新构建 Windows 与 macOS 安装包。
