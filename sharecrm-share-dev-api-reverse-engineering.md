# 纷享销客官方 VS Code/Cursor 插件 (share-dev) 深度逆向与 API 调用手册

> **分析目标**：纷享销客（ShareCRM）开发者工具插件  
> **插件路径**：`/Users/xiiaowu/.cursor/extensions/sharecrm.share-dev-0.0.6-universal/`  
> **插件标识**：`sharecrm.share-dev` (v0.0.6-universal)  
> **上游仓库**：`https://git.firstshare.cn/fe-paas/web-ide.git`  
> **文档目的**：全面解构该插件的底层架构、通信协议、鉴权方式及所有 REST/PaaS 接口，以便在外部脚本、CI/CD 自动化流水线、第三方后台中独立调用这些 API。

---

## 目录
1. [逆向分析概述与工程架构](#1-逆向分析概述与工程架构)
2. [底层通信协议与鉴权体系](#2-底层通信协议与鉴权体系)
   - 2.1 基础配置与端点规则
   - 2.2 核心鉴权机制 (Authorization)
   - 2.3 微服务网关路由重写规则 (`EM\dH` -> `EMDH`)
   - 2.4 异步任务轮询协议 (`pollingFunctionByToken`)
   - 2.5 统一响应信封规范
3. [APL 业务函数接口全集 (Groovy)](#3-apl-业务函数接口全集-groovy)
   - 3.1 函数列表获取与详情查询
   - 3.2 历史版本查询、对比与获取
   - 3.3 静态扫描 (Analyze) 与编译检查 (Compile Check)
   - 3.4 保存与批量更新函数体 (Update & Batch Update)
   - 3.5 新建函数、模板生成与 AI 生成函数名
   - 3.6 在线调试与运行 (Debug Runtime)
   - 3.7 命名空间与系统权限校验
4. [PWC 前端组件与插件开发接口 (UI PaaS)](#4-pwc-前端组件与插件开发接口-ui-paas)
   - 4.1 组件/插件拉取与文件树下载
   - 4.2 单文件上传与下载 (Base64 机制)
   - 4.3 源码提交与组件更新
   - 4.4 云端异步构建与结果轮询
   - 4.5 本地热重载与调试原理 (`beefly` DevServer)
5. [CRM 实体对象与字段元数据接口](#5-crm-实体对象与字段元数据接口)
   - 5.1 获取实体清单 (`findDescribeManageList`)
   - 5.2 获取对象完整字段定义与元数据 (`findDescribeByApiName`)
   - 5.3 实体记录列表查询 (`controller/List`)
6. [其他支撑服务与资源端点](#6-其他支撑服务与资源端点)
   - 6.1 离线开发文档包下载
   - 6.2 语法补全与定义库 CDN
   - 6.3 Copilot AI 助手接口
7. [第三方调用实战与 SDK 代码示例](#7-第三方调用实战与-sdk-代码示例)
   - 7.1 Node.js / TypeScript 通用客户端类
   - 7.2 Python 客户端类
   - 7.3 cURL 快速验证命令
8. [逆向总结与避坑要点](#8-逆向总结与避坑要点)

---

## 1. 逆向分析概述与工程架构

通过 REA 工具链（AST 语法结构恢复、Sourcemap 映射表对齐及模块解包），插件整体结构如下：

```
sharecrm.share-dev-0.0.6-universal/
├── package.json              # 插件贡献点：配置项、右键菜单、视图容器、命令定义
├── extension-desktop.js      # 主进程逻辑 (800KB Webpack 打包，已解构成 43 个源模块)
├── extension-desktop.js.map  # 完整的源码映射表 (含原始 src 目录结构)
├── webviews/                 # 富交互界面
│   ├── dev-tools/            # React + Ant Design + Vue 构建的开发工具面板
│   └── share-ai/             # 基于 ai-helper-web 的 AI 交互助手面板
├── resources/                # 预置模板与静态资源
│   ├── snippets/             # Groovy 代码片段与 FxUI 补全定义 (pwc-completion.json)
│   └── template/             # 对象与字段导出 Markdown 的 EJS 模板
└── node_modules/             # 依赖库 (包含 beefly, axios, crypto-js 等)
```

### 运行时通信流

```
┌────────────────────────────────────────────────────────┐
│                   VS Code / Cursor 界面                 │
│  (资源管理器右键、APL 版本对比面板、Webview 调试面板)     │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│              RequestService (请求服务核心)               │
│  - 注入 Authorization: <certificate>                   │
│  - 注入 traceId: E-E.desktop-ide-<timestamp>           │
│  - 路由替换: /EM\dH/ -> /EMDH/                         │
│  - 补全前缀: /FHH...                                    │
│  - 异步轮询: pollingFunctionByToken                     │
└───────────────────────────┬────────────────────────────┘
                            │ HTTPS POST (JSON / Base64)
┌───────────────────────────▼────────────────────────────┐
│            纷享销客 OpenAPI / PaaS 统一网关             │
│  https://www.fxiaoke.com/FHH/EMDH[FUNC|CompBuild|NCRM] │
└────────────────────────────────────────────────────────┘
```

---

## 2. 底层通信协议与鉴权体系

要在外部独立调用这套 API，必须完全复现其通信协议与请求生命周期。

### 2.1 基础配置与端点规则
- **企业域名 (`baseURL`)**：默认为 `https://www.fxiaoke.com`（若企业为私有云部署或独立域名，替换为实际域名）。
- **统一网关前缀**：所有业务请求路径统一以 `/FHH` 开头。
- **HTTP Method**：所有核心接口均使用 **`POST`**。
- **Content-Type**：`application/json; charset=utf-8`。

### 2.2 核心鉴权机制 (Authorization)
插件通过扩展配置 `sharedev.certificate` 读取**开发者证书 (Developer Certificate)**：
- **请求头**：
  ```http
  Authorization: <开发者证书字符串>
  Accept-Language: zh-cn
  ```
- **证书来源**：登录纷享销客管理后台 / PaaS 开发者平台，在开发者中心或 Web IDE 设置中生成并复制“开发者证书”。该证书是高权限的长效访问凭证，无需复杂的 OAuth 授权码交换。

### 2.3 微服务网关路由重写规则
源码中在定义各个子模块时，常出现类似 `/EM1HFUNC/`、`/EM2HCompBuild/`、`/EM9HCompBuild/` 的内部服务前缀。`RequestService.ts` 内部包含核心重写规则：
```javascript
config.url = config.url.replace(/EM\dH/, 'EMDH');
if (!config.url.startsWith('/FHH')) {
    config.url = `/FHH${config.url}`;
}
```
**映射关系表**：
| 插件内部模块路径 | 实际网关对外路径 | 所属微服务 |
| :--- | :--- | :--- |
| `/EM1HFUNC/...` | `/FHH/EMDHFUNC/...` | APL 业务函数服务 (Function) |
| `/EM2HCompBuild/...` | `/FHH/EMDHCompBuild/...` | PWC 代码拉取/上传与打包 |
| `/EM9HCompBuild/...` | `/FHH/EMDHCompBuild/...` | PWC 异步编译流水线 |
| `/EM1HNCRM/...` | `/FHH/EMDHNCRM/...` | CRM 实体对象与业务数据控制器 |
| `/EM1HAIGC/...` | `/FHH/EMDHAIGC/...` | PaaS AI 助手服务 |
| `/EMDHFUNC/...` | `/FHH/EMDHFUNC/...` | 权限校验与通用运行时服务 |

> **关键要点**：外部独立调用时，**直接使用 `/FHH/EMDH...` 即可**。

### 2.4 链路追踪参数 (TraceId)
每个请求的 Query Params 必须携带 `traceId`，否则可能会在部分安全网关被拦截：
```
?traceId=E-E.desktop-ide-<当前时间戳毫秒>
```

### 2.5 异步任务轮询协议 (`pollingFunctionByToken`)
纷享销客对耗时较长或需要排队的操作（代码静态检查、编译、创建、保存、运行调试），采用了**基于 Token 的长轮询机制**：
1. **客户端首次发起请求**：生成唯一 Token：`${Date.now()}-${uuid()}`，放入请求体的 `token` 字段。
2. **服务端返回**：若接口返回结果中依然包含 `token` 字段，表示任务正在后台异步处理或排队中。
3. **客户端轮询**：客户端等待短时间（例如 500ms），使用相同的 `token` 再次 POST 请求该接口。
4. **结束判定**：
   - 当返回结果中不再包含 `token`，且携带正式数据时，表明操作完成。
   - 若轮询达到最大次数（默认 10 次）仍未结束，判定为超时失败。

### 2.6 统一响应信封规范
```json
{
  "Result": {
    "StatusCode": 0,
    "FailureMessage": null
  },
  "Value": {
    /* 实际业务数据，部分接口可能直接挂在根对象上 */
  }
}
```
- `Result.StatusCode === 0`：执行成功。
- `Result.StatusCode !== 0`：执行失败，异常信息见 `Result.FailureMessage` 或 `Error.Message`。

---

## 3. APL 业务函数接口全集 (Groovy)

APL (Application Programming Language) 是纷享销客 PaaS 的后端 Groovy 脚本引擎。

### 3.1 获取函数列表
- **接口路径**：`POST /FHH/EMDHFUNC/biz/query`
- **功能描述**：全量拉取租户下已定义的所有 APL 函数元数据与代码。
- **请求体**：
  ```json
  {
    "pageSize": 3000,
    "pageNumber": 1
  }
  ```
- **响应体核心字段**：
  ```json
  {
    "Result": { "StatusCode": 0 },
    "Value": {
      "function": [
        {
          "api_name": "calc_order_discount",
          "function_name": "计算订单折扣",
          "type": "function",
          "package_name": "crm.custom.apl.order",
          "version": 3,
          "is_active": true,
          "is_control": false,
          "lang": 0,
          "binding_object_api_name": "SalesOrderObj",
          "return_type": "BigDecimal",
          "remark": "根据客户等级计算折扣",
          "body": "def execute() { ... }",
          "parameters": [
            {
              "name": "customerId",
              "type": "String",
              "default_value": "",
              "description": "客户ID"
            }
          ]
        }
      ]
    }
  }
  ```

### 3.2 获取单个/批量函数详情
- **单个函数接口**：`POST /FHH/EMDHFUNC/biz/find`
  - **请求体**：
    ```json
    {
      "api_name": "calc_order_discount",
      "binding_object_api_name": "SalesOrderObj"
    }
    ```
- **批量函数接口**：`POST /FHH/EMDHFUNC/biz/batchQuery`
  - **请求体**：
    ```json
    {
      "apiNames": ["calc_order_discount", "check_credit_limit"]
    }
    ```

### 3.3 历史版本查询与恢复
- **查询版本历史**：`POST /FHH/EMDHFUNC/biz/queryVersions`
  - **请求体**：
    ```json
    {
      "api_name": "calc_order_discount",
      "binding_object_api_name": "SalesOrderObj"
    }
    ```
  - **响应**：包含 `functions` 数组，每项包含 `id`（版本ID）、`version`、`update_time`、`last_modified_by`、`commit_log`。
- **获取特定历史版本内容**：`POST /FHH/EMDHFUNC/biz/findFunctionVersion`
  - **请求体**：
    ```json
    {
      "id": "64a789efc0123456789abcde",
      "api_name": "calc_order_discount",
      "binding_object_api_name": "SalesOrderObj"
    }
    ```
  - **响应**：`result.function.body` 返回该历史版本时的完整源码。

### 3.4 静态代码扫描分析 (Analyze)
在保存前，服务端会对 APL 源码进行静态规则检查（扫描代码坏味道、安全性限制、死循环风险等）。
- **单函数扫描**：`POST /FHH/EMDHFUNC/runtime/analyze`
- **批量扫描**：`POST /FHH/EMDHFUNC/runtime/batchAnalyze`
- **请求体**（需携带 Token 轮询）：
  ```json
  {
    "token": "1729240000000-xxxx-xxxx",
    "function": {
      "api_name": "calc_order_discount",
      "body": "def execute() { ... }"
    }
  }
  ```
- **响应体**：
  ```json
  {
    "success": true,
    "forceSave": true,
    "logInfo": "扫描完成",
    "violations": [
      {
        "line": 15,
        "priority": 8,
        "message": "避免使用未经限制的大范围数据查询"
      }
    ]
  }
  ```
  > **优先级规则**：`priority >= 9` 属于严重阻塞错误（除非开启 `forceSave` 强行保存，否则禁止提交）。

### 3.5 语法编译检查 (Compile Check)
验证 Groovy 脚本能否通过后端编译器编译，并提前暴露出语法错误。
- **单函数编译**：`POST /FHH/EMDHFUNC/runtime/compileCheck`
- **批量编译**：`POST /FHH/EMDHFUNC/runtime/batchCompileCheck`
- **请求体**（需携带 Token 轮询）：
  ```json
  {
    "token": "1729240000000-xxxx-xxxx",
    "function": {
      "api_name": "calc_order_discount",
      "body": "def execute() { ... }"
    }
  }
  ```
- **响应**：`{ "success": true }` 或 `{ "success": false, "compileError": "startup failed: ... line 12 ..." }`。

### 3.6 保存与更新函数代码 (Update Body)
插件的提交流程是：**Analyze 扫描 -> CompileCheck 编译 -> UpdateBody 保存**。
- **单函数更新**：`POST /FHH/EMDHFUNC/biz/updateBody`
  - **请求体**：
    ```json
    {
      "token": "1729240000000-xxxx-xxxx",
      "function": {
        "api_name": "calc_order_discount",
        "body": "def execute() { ... }",
        "commit_log": "优化计算逻辑"
      }
    }
    ```
- **批量更新**：`POST /FHH/EMDHFUNC/biz/batchUpdateBody`
  - **请求体**：
    ```json
    {
      "token": "1729240000000-xxxx-xxxx",
      "commitLog": "批量发布脚本更新",
      "functionList": [
        {
          "api_name": "calc_order_discount",
          "body": "...",
          "commit_log": "批量发布"
        }
      ]
    }
    ```
- **全量元数据更新（包含入参、出参、名称等）**：`POST /FHH/EMDHFUNC/biz/update`

### 3.7 新建函数全生命周期
1. **AI 生成推荐 API 名称**：`POST /FHH/EMDHFUNC/biz/generateFuncApiName`
   - 请求：`{ "name": "计算客户信用分" }`
   - 返回推荐的 API 标识符，如 `calc_customer_credit_score`。
2. **获取模板初始代码**：`POST /FHH/EMDHFUNC/biz/funcTemplate`
   - 请求：
     ```json
     {
       "lang": 0,
       "nameSpace": "custom_ns",
       "namespace": "custom_ns",
       "type": "function",
       "funcApiName": "calc_customer_credit_score",
       "returnObject": "BigDecimal",
       "description": "计算客户信用分",
       "functionName": "计算客户信用分"
     }
     ```
   - 返回：`{ "body": "..." }`（包含规范头部与签名样板代码）。
3. **创建函数**：`POST /FHH/EMDHFUNC/biz/create`
   - 请求体（需经 compileCheck 后带 token 轮询）：
     ```json
     {
       "token": "1729240000000-xxxx-xxxx",
       "function": {
         "function_name": "计算客户信用分",
         "api_name": "calc_customer_credit_score",
         "name_space": "custom_ns",
         "type": "function",
         "return_type": "BigDecimal",
         "is_active": true,
         "status": "not_used",
         "remark": "计算客户信用分",
         "body": "def execute() { ... }",
         "parameters": []
       }
     }
     ```

### 3.8 在线调试与运行 (Debug Runtime)
插件中点击“运行&调试 APL”的真正执行接口。
- **接口路径**：`POST /FHH/EMDHFUNC/runtime/debug`
- **机制**：通过长轮询（携带 `token`），服务端执行代码后返回执行日志、返回值或异常堆栈。
- **请求体**：
  ```json
  {
    "token": "1729240000000-xxxx-xxxx",
    "api_name": "calc_order_discount",
    "binding_object_api_name": "SalesOrderObj",
    "data_source": "648f98a213e4b70001928374",
    "function": {
      "api_name": "calc_order_discount",
      "body": "def execute() { log.info('Context ID: ' + context.data._id); return 0.85; }"
    },
    "input_data": [
      {
        "name": "customerId",
        "type": "String",
        "value": "63f1234567890abcdef"
      }
    ]
  }
  ```
  > **说明**：
  > - `data_source`：绑定的对象记录 `_id`（例如某一笔真实的订单 ID）。在函数执行时，此记录的数据会自动注入到上下文环境 `context.data` 中。
  > - `input_data`：传入函数的自定义入参键值对。
- **响应体**：
  ```json
  {
    "success": true,
    "logInfo": "[INFO] Context ID: 648f98a213e4b70001928374\n执行用时: 32ms",
    "runResult": 0.85,
    "errorInfo": null
  }
  ```

### 3.9 命名空间与类型查询
- **接口路径**：`POST /FHH/EMDHFUNC/runtime/namespace`
- **请求体**：`{}`
- **响应体**：返回租户所有可选的 `namespaces` 及标准 `return_type` 列表。

### 3.10 权限校验接口
- **接口路径**：`POST /FHH/EMDHFUNC/runtime/checkPermission`
- **请求体**：
  ```json
  {
    "funcCodes": ["crmmanage/=/module-myfunction"]
  }
  ```

---

## 4. PWC 前端组件与插件开发接口 (UI PaaS)

PWC (PaaS Web Component) 是基于 React / Vue 开发的 CRM 自定义前端组件和扩展插件。

### 4.1 拉取组件/插件代码结构
- **接口路径**：`POST /FHH/EMDHCompBuild/VscodeExtension/downloadCode`
- **请求体**：
  ```json
  {
    "type": "Component", // 或 "Plugin"
    "apiName": "custom_account_card" // 为空则拉取全部组件
  }
  ```
- **响应体**：
  返回 `components` 数组，每项结构如下：
  ```json
  {
    "apiName": "custom_account_card",
    "mateXml": "<ComponentBundle><entryFileName>index.tsx</entryFileName><client>web</client></ComponentBundle>",
    "sourceFiles": [
      {
        "fileName": "index.tsx",
        "filePath": "components/custom_account_card/sourceFiles/index.tsx"
      },
      {
        "fileName": "model.ts",
        "filePath": "components/custom_account_card/sourceFiles/model.ts"
      }
    ],
    "images": [
      {
        "fileName": "logo.png",
        "filePath": "components/custom_account_card/images/logo.png"
      }
    ],
    "fileTree": [] // 小程序环境特有文件目录
  }
  ```

### 4.2 单文件下载 (Base64 解码)
- **接口路径**：`POST /FHH/EMDHCompBuild/VscodeExtension/downloadFile`
- **请求体**：
  ```json
  {
    "nPath": "components/custom_account_card/sourceFiles/index.tsx"
  }
  ```
- **响应体**：
  ```json
  {
    "base64String": "aW1wb3J0IFJlYWN0IGZyb20gJ3JlYWN0Jzsg..."
  }
  ```
- **本地解码**：将 `base64String` 进行 Base64 解码后还原为原始 UTF-8 文本或二进制静态资源。

### 4.3 单文件上传 (Base64 编码)
- **接口路径**：`POST /FHH/EMDHCompBuild/VscodeExtension/uploadFile`
- **请求体**：
  ```json
  {
    "fileName": "index.tsx",
    "base64String": "aW1wb3J0IFJlYWN0IGZyb20gJ3JlYWN0Jzsg..."
  }
  ```
- **响应体**：
  ```json
  {
    "fileName": "index.tsx",
    "nPath": "temp/20261018/abc123xyz_index.tsx" // 生成的云端临时资源存储路径
  }
  ```

### 4.4 源码提交与组件更新 (Push PWC)
插件将本地代码文件全部上传得到 `nPath` 后，调用更新接口组装整包：
- **更新组件**：`POST /FHH/EMDHCompBuild/Component/updateComponent`
- **更新插件**：`POST /FHH/EMDHCompBuild/Plugin/updatePlugin`
- **请求体结构**：
  ```json
  {
    "apiName": "custom_account_card",
    "entryFileName": "index.tsx",
    "sourceFiles": [
      {
        "fileName": "index.tsx",
        "filePath": "temp/20261018/abc123xyz_index.tsx",
        "fileSize": 1420
      }
    ],
    "images": [],
    "fileTree": []
  }
  ```

### 4.5 触发云端异步构建与结果查询 (Deploy PWC)
- **触发组件构建**：`POST /FHH/EMDHCompBuild/Component/AsynBuildComponent`
  - 请求：`{ "apiName": "custom_account_card" }`
  - 返回：`{ "buildId": "bld_20261018_98765" }`
- **触发插件构建**：`POST /FHH/EMDHCompBuild/Plugin/buildPlugin`
  - 请求：`{ "apiName": "custom_plugin_btn", "client": "web" }`
  - 返回：`{ "buildId": "bld_20261018_98766" }`
- **轮询构建结果**：`POST /FHH/EMDHCompBuild/{Component|Plugin}/getBuildResult`
  - 请求：`{ "buildId": "bld_20261018_98765" }`
  - 返回：
    ```json
    {
      "status": 1 // 1: 构建中，需要继续轮询；0 或其他: 构建成功或失败
    }
    ```

### 4.6 本地热重载与调试原理 (Dev Server)
- 插件依赖内置的 `beefly` CLI 工具，在本地启动 Webpack DevServer：
  ```javascript
  const server = await beefly.cli.dev({
    configureWebpack: {
      entry: {
        [apiName]: path.join(sourceFilesDir, entryFileName)
      }
    }
  });
  const port = server.options.port;
  ```
- 调试入口：打开浏览器访问当前 CRM 页面并添加参数：
  ```
  https://www.fxiaoke.com/XV/UI/Home?debug=1&port=<本地端口>#crm/index
  ```
- CRM 前端检测到 `debug=1` 后，会动态引入本地静态资源 `http://localhost:<端口>/<apiName>.js`，实现在生产/沙箱环境中对本地源码的热调试！

---

## 5. CRM 实体对象与字段元数据接口

插件的“下载对象描述”与“字段映射表”功能所调用的底层数据字典接口。

### 5.1 获取实体对象清单
- **接口路径**：`POST /FHH/EMDHFUNC/debugger/fx/findDescribeManageList`
- **请求体**：
  ```json
  {
    "isIncludeFieldDescribe": false,
    "isIncludeSystemObj": true,
    "isIncludeUnActived": true,
    "packageName": "CRM",
    "sourceInfo": "function",
    "serviceContext": {}
  }
  ```
- **响应体**：
  返回 `objectDescribeList` 数组，包含所有预置对象与自定义对象的概要：
  ```json
  [
    {
      "api_name": "AccountObj",
      "display_name": "客户",
      "package_name": "CRM"
    },
    {
      "api_name": "ContactObj",
      "display_name": "联系人",
      "package_name": "CRM"
    }
  ]
  ```

### 5.2 获取对象完整字段与布局定义
- **接口路径**：`POST /FHH/EMDHFUNC/debugger/fx/findDescribeByApiName`
- **请求体**：
  ```json
  {
    "describe_apiname": "AccountObj",
    "get_label_direct": true,
    "include_buttons": false,
    "include_layout": false,
    "include_related_list": false,
    "include_describe_extra": false,
    "layout_type": "detail",
    "include_fields_extra": false,
    "check_cross_filter": false,
    "serviceContext": {}
  }
  ```
- **响应体核心数据**：
  ```json
  {
    "objectDescribe": {
      "api_name": "AccountObj",
      "display_name": "客户",
      "description": "企业客户主档案",
      "fields": {
        "name": {
          "api_name": "name",
          "label": "客户名称",
          "type": "text",
          "is_required": true,
          "is_unique": false,
          "status": "released"
        },
        "industry": {
          "api_name": "industry",
          "label": "所属行业",
          "type": "select_one",
          "options": [
            { "label": "金融", "value": "finance" },
            { "label": "互联网", "value": "internet" }
          ]
        },
        "owner": {
          "api_name": "owner",
          "label": "负责人",
          "type": "employee",
          "target_api_name": "EmployeeObj"
        }
      }
    }
  }
  ```

### 5.3 实体记录查询列表 (Controller List)
- **接口路径**：`POST /FHH/EMDHNCRM/API/v1/object/{bindingObjectApiName}/controller/List`
- **功能**：在 APL 调试时，按关键词检索实际业务记录，作为数据源上下文。
- **请求体**：
  ```json
  {
    "object_describe_api_name": "AccountObj",
    "search_query_info": "{\"limit\":10,\"offset\":0,\"filters\":[{\"field_name\":\"name\",\"operator\":\"LIKE\",\"field_values\":[\"测试\"]}]}",
    "search_template_id": ""
  }
  ```
- **响应体**：
  返回 `dataList` 数组，每项包含记录的 `_id` 与 `name`。

---

## 6. 其他支撑服务与资源端点

### 6.1 离线开发文档包下载
插件内一键下载文档命令直接拉取自纷享销客官方静态站：
- **APL 完整开发文档**：`https://www.fxiaoke.com/mob/guide/apl/dist/apl.zip`
- **PWC UI PaaS 完整文档**：`https://www.fxiaoke.com/mob/guide/uipaas/dist/pwc.zip`

### 6.2 语法补全词典 CDN
- **APL Groovy 语法补全库**：  
  `https://a9.fspage.com/FSR/base/completion.json`
- **PWC 组件补全定义库**：  
  插件安装包内附带 `resources/snippets/pwc-completion.json`，定义了完整 `FxUI` 前端 API。

### 6.3 Copilot AI 助手接口
- **接口路径**：`POST /FHH/EMDHAIGC/agent/simpleInfo`
- **请求体**：`{ "apiName": "Copilot_APL" }`
- **功能**：获取 Copilot AI 助手的操作按钮与功能清单（如 AI 代码修复、逻辑优化等）。

---

## 7. 第三方调用实战与 SDK 代码示例

### 7.1 Node.js / TypeScript 客户端封装 (`ShareDevClient`)

```typescript
import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';

export interface ShareDevConfig {
  domain?: string;      // 例如 "https://www.fxiaoke.com"
  certificate: string;  // 开发者证书
}

export class ShareDevClient {
  private client: AxiosInstance;
  private domain: string;
  private certificate: string;

  constructor(config: ShareDevConfig) {
    this.domain = config.domain || 'https://www.fxiaoke.com';
    this.certificate = config.certificate;
    this.client = axios.create({
      baseURL: this.domain,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Accept-Language': 'zh-cn',
        'Authorization': this.certificate
      }
    });
  }

  /**
   * 通用网关请求方法 (自动处理 EM 转换、traceId 与 /FHH 前缀)
   */
  public async requestFHH<T = any>(url: string, data: any = {}): Promise<T> {
    // 1. 规范化路径：/EM\dH/ -> /EMDH/
    let normalizedUrl = url.replace(/EM\dH/, 'EMDH');
    if (!normalizedUrl.startsWith('/FHH')) {
      normalizedUrl = `/FHH${normalizedUrl}`;
    }

    // 2. 携带 traceId
    const traceId = `E-E.desktop-ide-${Date.now()}`;

    // 3. 发送 POST 请求
    const res = await this.client.post(normalizedUrl, data, {
      params: { traceId }
    });

    const body = res.data;
    if (body.Result && body.Result.StatusCode !== 0) {
      throw new Error(body.Result.FailureMessage || body.Error?.Message || 'Request Failed');
    }

    return body.Value !== undefined ? body.Value : body;
  }

  /**
   * 异步长轮询协议包装器
   */
  public async pollTask<T = any>(url: string, data: any = {}, maxRetries = 10, intervalMs = 600): Promise<T> {
    const token = `${Date.now()}-${uuidv4()}`;
    let currentPayload = { ...data, token };

    for (let i = 0; i < maxRetries; i++) {
      const res = await this.requestFHH<any>(url, currentPayload);
      if (res && res.token) {
        // 服务端返回依然包含 token，表示异步执行中，等待后继续重试
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      } else {
        return res;
      }
    }
    throw new Error(`Task polling timed out after ${maxRetries} attempts.`);
  }

  // ==================== APL 业务函数相关 ====================

  /** 获取所有 APL 函数清单 */
  public async getAPLList(pageSize = 3000, pageNumber = 1) {
    return this.requestFHH('/EMDHFUNC/biz/query', { pageSize, pageNumber });
  }

  /** 查询函数详情 */
  public async getAPLDetail(apiName: string, bindingObjectApiName?: string) {
    return this.requestFHH('/EMDHFUNC/biz/find', {
      api_name: apiName,
      binding_object_api_name: bindingObjectApiName || ''
    });
  }

  /** 编译检查 */
  public async compileCheckAPL(functionData: any) {
    return this.pollTask('/EMDHFUNC/runtime/compileCheck', { function: functionData });
  }

  /** 静态扫描分析 */
  public async analyzeAPL(functionData: any) {
    return this.pollTask('/EMDHFUNC/runtime/analyze', { function: functionData });
  }

  /** 保存/更新函数代码 */
  public async updateAPLBody(apiName: string, body: string, commitLog = 'Update from SDK') {
    return this.pollTask('/EMDHFUNC/biz/updateBody', {
      function: {
        api_name: apiName,
        body,
        commit_log: commitLog
      }
    });
  }

  /** 在线运行/调试 APL 函数 */
  public async debugAPL(params: {
    apiName: string;
    code: string;
    bindingObjectApiName?: string;
    dataSourceRecordId?: string;
    inputs?: Array<{ name: string; type: string; value: any }>;
  }) {
    return this.pollTask('/EMDHFUNC/runtime/debug', {
      api_name: params.apiName,
      binding_object_api_name: params.bindingObjectApiName || 'NONE',
      data_source: params.dataSourceRecordId || '',
      function: {
        api_name: params.apiName,
        body: params.code
      },
      input_data: params.inputs || []
    });
  }

  // ==================== 对象元数据相关 ====================

  /** 获取所有实体对象描述列表 */
  public async getObjectList() {
    return this.requestFHH('/EMDHFUNC/debugger/fx/findDescribeManageList', {
      isIncludeFieldDescribe: false,
      isIncludeSystemObj: true,
      isIncludeUnActived: true,
      packageName: 'CRM',
      sourceInfo: 'function',
      serviceContext: {}
    });
  }

  /** 获取对象详细字段定义 */
  public async getObjectDescribe(objectApiName: string) {
    return this.requestFHH('/EMDHFUNC/debugger/fx/findDescribeByApiName', {
      describe_apiname: objectApiName,
      get_label_direct: true,
      include_buttons: false,
      include_layout: false,
      include_related_list: false,
      include_describe_extra: false,
      layout_type: 'detail',
      include_fields_extra: false,
      check_cross_filter: false,
      serviceContext: {}
    });
  }
}
```

---

### 7.2 Python 客户端调用封装 (`sharecrm_client.py`)

```python
import time
import uuid
import re
import requests

class ShareDevClient:
    def __init__(self, certificate: str, domain: str = "https://www.fxiaoke.com"):
        self.domain = domain.rstrip("/")
        self.certificate = certificate
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": self.certificate,
            "Content-Type": "application/json; charset=utf-8",
            "Accept-Language": "zh-cn"
        })

    def request_fhh(self, path: str, json_data: dict = None) -> dict:
        """核心请求转发网关"""
        if json_data is None:
            json_data = {}

        # 1. 规范化路由
        if not path.startswith("/FHH"):
            path = "/FHH" + path
        # 替换内部微服务编号为 EMDH
        path = re.sub(r"EM\dH", "EMDH", path)

        url = f"{self.domain}{path}"
        params = {"traceId": f"E-E.desktop-ide-{int(time.time() * 1000)}"}

        resp = self.session.post(url, params=params, json=json_data, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        result = data.get("Result", {})
        if result.get("StatusCode") != 0:
            msg = result.get("FailureMessage") or data.get("Error", {}).get("Message") or "API Error"
            raise RuntimeError(f"ShareCRM Error ({result.get('StatusCode')}): {msg}")

        return data.get("Value") if "Value" in data else data

    def poll_task(self, path: str, json_data: dict, max_retries: int = 10, interval: float = 0.6) -> dict:
        """针对异步接口的长轮询调度"""
        token = f"{int(time.time() * 1000)}-{uuid.uuid4()}"
        payload = dict(json_data)
        payload["token"] = token

        for _ in range(max_retries):
            res = self.request_fhh(path, payload)
            if isinstance(res, dict) and res.get("token"):
                time.sleep(interval)
            else:
                return res
        raise TimeoutError("ShareDev API task polling timed out.")

    # 业务接口快捷方法
    def get_apl_functions(self):
        """拉取所有 APL 函数"""
        return self.request_fhh("/EMDHFUNC/biz/query", {"pageSize": 3000, "pageNumber": 1})

    def execute_apl_debug(self, api_name: str, groovy_code: str, record_id: str = "", binding_obj: str = "NONE", inputs: list = None):
        """在线调试运行 APL"""
        payload = {
            "api_name": api_name,
            "binding_object_api_name": binding_obj,
            "data_source": record_id,
            "function": {
                "api_name": api_name,
                "body": groovy_code
            },
            "input_data": inputs or []
        }
        return self.poll_task("/EMDHFUNC/runtime/debug", payload)

    def get_object_fields(self, object_api_name: str):
        """获取对象字段元数据"""
        return self.request_fhh("/EMDHFUNC/debugger/fx/findDescribeByApiName", {
            "describe_apiname": object_api_name,
            "get_label_direct": True,
            "layout_type": "detail",
            "serviceContext": {}
        })

# 使用示例：
if __name__ == "__main__":
    client = ShareDevClient(certificate="YOUR_DEVELOPER_CERTIFICATE_HERE")
    
    # 1. 查询所有函数
    # funcs = client.get_apl_functions()
    # print("APL 数量:", len(funcs.get("function", [])))

    # 2. 在线执行一段 Groovy 测试代码
    # res = client.execute_apl_debug(
    #     api_name="test_func",
    #     groovy_code="""
    #         def execute() {
    #             log.info("Hello from Python SDK!");
    #             return ["status": "ok", "timestamp": System.currentTimeMillis()];
    #         }
    #     """
    # )
    # print("执行结果:", res)
```

---

### 7.3 cURL 命令行快速验证

可以通过命令行直接测试你的开发者证书和域名连通性：

```bash
# 1. 验证开发者证书有效性 (拉取 APL 列表)
curl -X POST "https://www.fxiaoke.com/FHH/EMDHFUNC/biz/query?traceId=E-E.desktop-ide-1729240000000" \
  -H "Authorization: YOUR_DEVELOPER_CERTIFICATE" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{"pageSize": 10, "pageNumber": 1}'

# 2. 查询某个实体对象的字段元数据 (如 AccountObj)
curl -X POST "https://www.fxiaoke.com/FHH/EMDHFUNC/debugger/fx/findDescribeByApiName?traceId=E-E.desktop-ide-1729240000000" \
  -H "Authorization: YOUR_DEVELOPER_CERTIFICATE" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "describe_apiname": "AccountObj",
    "get_label_direct": true,
    "layout_type": "detail",
    "serviceContext": {}
  }'
```

---

## 8. 逆向总结与避坑要点

1. **统一凭证**：只需要一个 `sharedev.certificate`，以 `Authorization: <certificate>` 请求头发送，所有 PaaS 接口均可访问。
2. **统一网关路由转换**：插件内部代码中使用了历史或开发微服务编码（`/EM1HFUNC/`、`/EM2HCompBuild/`、`/EM9HCompBuild/` 等），在发包前全部被重写映射为 `/FHH/EMDH...`。外部调用时，直接使用 `/FHH/EMDH...` 即可。
3. **轮询机制不可省略**：对于调试 (`debug`)、编译 (`compileCheck`)、扫描 (`analyze`) 和保存 (`updateBody`)，必须实现带着 Token 的轮询逻辑，否则若服务端进入异步排队将拿不到真实执行结果。
4. **PWC 组件静态资源编码**：PWC 的文件上传/下载接口强制使用 Base64 字符串传递文件内容（非 `multipart/form-data`），在开发自动化同步脚本时需对二进制和文本文件做好 Base64 编解码。
5. **本地 DevServer 调试机制**：PWC 组件本地调试不需要启动整套 CRM，只需启动标准 Webpack 开发服务器（暴露对应组件名的打包 bundle），CRM 网页端带参数 `?debug=1&port=<本地端口>` 会自动热加载并渲染本地代码。
