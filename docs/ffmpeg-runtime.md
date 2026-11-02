# 内置音频处理工具

会议音频导入使用独立的 ffmpeg 进程切片，随后逐段调用转写接口。发布安装包携带可执行文件，不依赖用户的 PATH，也不会在用户首次转写时下载工具。

## 构建

`electron-builder.yml` 的 `beforePack` 自动运行 `scripts/ffmpeg-before-pack.cjs`，按**构建目标**准备二进制；不是按构建机器架构选择。当前目标包括 Windows x64、macOS x64 和 macOS arm64。

下载来源和固定 SHA-256 记录在 `scripts/ffmpeg-manifest.json`。下载失败会重试官方备用地址，校验失败会中止打包。缓存位于忽略提交的 `resources/ffmpeg/<平台>-<架构>/`，许可、上游说明与来源信息会一起复制到安装包。

可执行文件安装在应用资源目录的 `bin/ffmpeg/ffmpeg.exe`（Windows）或 `bin/ffmpeg/ffmpeg`（macOS），位于 `app.asar` 之外。`afterPack` 检查真实打包路径、二进制及许可文件的哈希；构建目标与本机平台、架构一致时，还会运行工具并验证 65 秒音频切成三个片段。任何检查失败都会中止构建。

更新版本时需要同时更新清单中的发布版本、资产 ID 和哈希，重新运行打包检查。

## 本地开发

```sh
npm run prepare:ffmpeg
node scripts/test-ffmpeg-runtime.mjs
```

第一条命令默认准备当前平台和架构，也可显式指定，例如：

```sh
npm run prepare:ffmpeg -- win32 x64
```

开发环境优先使用已准备的二进制，缺失时回退到系统 PATH。发布安装包缺失二进制时会明确报错，而不会误用其他架构的工具。`NEOCRM_FFMPEG_PATH` 可显式覆盖为指定可执行文件，用于本地调试。

`test-ffmpeg-runtime.mjs` 直接导入 TypeScript 路径解析模块，需要支持 TypeScript 类型擦除的 Node.js 版本。打包钩子和自动切片验证为纯 JavaScript，兼容当前构建工作流的 Node.js 20。
