### 版本更新说明 (v1.8.22)

1. 修复 Windows 安装版自定义 TSX 组件无法解析 React、ReactDOM 和 lucide-react 依赖的问题。
2. 将组件编译依赖解包到应用目录，并让 esbuild 从解包目录解析。
3. Windows 发布流水线增加真实 TSX 依赖打包冒烟测试，提前发现组件运行时缺包问题。
