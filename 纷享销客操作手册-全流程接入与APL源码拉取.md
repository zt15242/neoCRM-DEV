# 纷享销客 (ShareCRM) 全流程接入与 APL 源码拉取操作手册

本手册详细介绍如何在当前桌面开发工作台中配置纷享销客（ShareCRM）连接器、打通 PaaS 开发者网关协议，并一键拉取租户全量业务对象元数据与 APL (Groovy) 业务函数源码至本地项目。

---

## 一、 前置准备与鉴权材料

在配置前，请准备好纷享销客开放平台与 PaaS 开发者中心的授权凭证：

| 参数名称 | 参数说明 | 获取路径 |
| :--- | :--- | :--- |
| **所在云域名 (`cloudDomain`)** | 租户部署云网关，通常为 `open.fxiaoke.com` | 管理后台开放平台域名 |
| **自建应用 `appId`** | 格式如 `FSAID_1324340` | 纷享销客管理中心 -> 开放平台 -> 自建应用详情 |
| **自建应用 `appSecret`** | 32位应用密钥字符串 | 开放平台自建应用配置 |
| **永久授权码 (`permanentCode`)** | 企业永久授权凭证 | 自建应用发布/授权后生成 |
| **开发者证书 (`devCertificate`)** | **【核心凭据】** 用于 APL 源码拉取与调试 | 业务开发平台 (PaaS) -> Web IDE / 开发者设置 |
| **企业代码 `ea` (可选)** | 企业账号代号（如 `佳能-ICB`） | 企业管理员信息 |

---

## 二、 第一步：配置纷享销客环境连接器

1. 打开软件左侧导航，点击 **「控制台 & 会话」** 进入连接器管理中心；
2. 找到纷享销客连接器，点击右上角 **「编辑」** 图标（或点击新建连接器，选择 **纷享销客 (FXIAOKE API)**）；
3. 在弹出的配置窗口中依次录入参数：
   - **授权认证模式**：选择 `客户端凭证模式 (免用户登录·后台直连)`；
   - **自建应用参数**：填入 `appId`、`appSecret`、`permanentCode`；
   - **开发者证书**：在 **「开发者证书 devCertificate」** 输入框中粘贴 PaaS 开发者证书；
   - 点击右下角 **「保存修改」**。

![纷享销客连接器配置界面](/var/folders/y8/1nscgpy16gn1pzqf1_xnc4yw0000gn/T/codex-clipboard-919374da-4795-4c01-80de-296b3e8ec366.png)

> 💡 **提示**：系统已实现动态联动，保存修改后当前会话会立即同步最新凭据，无需退出客户端即可生效。

---

## 三、 第二步：激活本地项目工作区

1. 在左侧 **`Projects`** 列表中，找到或新建目标本地项目目录（例如 `佳能中国`）；
2. **双击**项目名称（如 `佳能中国`），使其右侧亮起 **「当前」** 徽标，完成工作区激活；
3. 激活后，所有拉取的代码、元数据、脚本以及 Git 版本仓库都将严格锚定在该目录下。

![项目工作区激活与主工作台](/var/folders/y8/1nscgpy16gn1pzqf1_xnc4yw0000gn/T/codex-clipboard-57b54e70-0cd4-4bdd-8c66-6bb5b8e830cb.png)

---

## 四、 第三步：一键触发工程与 APL 代码拉取

1. 在底部输入框中切换至 **「⚡️ 标准模式」** 或 **「全能 CRM 架构师」**；
2. 直接向智能体发送自然语言指令：
   > **“帮我拉取当前环境的工程代码和 APL 函数”**
3. 智能体将自动调度内置工具链 `pull_crm_project_code`：
   - 自动向 OpenAPI v2 接口获取 150+ 个业务对象列表与核心字段 Describe 字典；
   - 自动通过微服务网关 `POST /FHH/EMDHFUNC/biz/query` 提取租户全量 APL 函数的 Groovy 源代码；
   - 自动在当前工作区初始化 Git 仓库并执行首次基线快照。

![智能体执行代码拉取过程](/var/folders/y8/1nscgpy16gn1pzqf1_xnc4yw0000gn/T/codex-clipboard-f657f507-c721-4bc7-a5a2-19950bacfaeb.png)

---

## 五、 第四步：本地工程资产对账与目录结构

拉取完成后，右侧 **项目文件树** 与产物列表将实时刷新，标准工程目录组织如下：

![右侧项目文件树结构](/var/folders/y8/1nscgpy16gn1pzqf1_xnc4yw0000gn/T/codex-clipboard-510672ff-1b58-42a9-9a25-f3cac150f70e.png)

### 核心目录解析：

```text
/Users/xiiaowu/Downloads/佳能中国/
├── metadata/
│   ├── object_manifest.json          # 租户 156 个业务对象清单元数据清单 (85个标准 + 71个自定义)
│   └── objects/                      # 核心业务对象字段详情字典 (Describe)
│       ├── AccountObj.json           # 客户对象全部字段与类型定义
│       ├── ContactObj.json           # 联系人对象
│       ├── ContractObj.json          # 合同对象
│       ├── SalesOrderObj.json        # 销售订单对象
│       ├── NewOpportunityObj.json    # 商机/项目对象
│       └── ...
├── src/
│   └── apl/                          # 【PaaS APL 服务端代码仓库】
│       ├── apl_manifest.json         # APL 全量函数索引清单
│       ├── AccountObj/               # 客户对象相关 APL (触发器、按钮、计划任务)
│       │   ├── Btn_KYtDE__c.groovy
│       │   ├── PlnTask_JDkZt__c.groovy
│       │   └── Proc_6pi7h__c.groovy
│       ├── SalesOrderObj/            # 销售订单相关 APL
│       │   └── Proc_GT82A__c.groovy
│       └── NONE/                     # 全局通用工具函数
│           ├── APLUtils__c.groovy
│           └── CommonUtils__c.groovy
├── scripts/
│   ├── pull_metadata.js              # 增量拉取/刷新租户最新对象元数据的 Node.js 脚本
│   └── query_data.js                 # 本地数据查询与抽样 CLI 工具
├── package.json                      # 工程依赖与 npm scripts
└── README.md                         # 租户资产统计与快捷开发指南
```

> 📄 **源码特性**：每个 `.groovy` 源码文件开头均自动注入该函数的规范注释，包含函数中文名、API Name、绑定对象、返回值类型、版本与描述说明。

---

## 六、 常见问题排查 (FAQ)

### Q1：为什么提示“拉取成功”，但 `src/apl/` 目录为空？
- **排查原因**：连接器未配置 `devCertificate`（开发者证书）。
- **解决方式**：OpenAPI v2 的 `corpAccessToken` 仅支持拉取数据与对象字典；APL 源码拉取走的是 PaaS 开发者专用网关，必须在连接器弹窗中填写有效的 `devCertificate`。

### Q2：提示【安全沙箱拦截】越界访问被拒绝？
- **排查原因**：当前对话会话绑定的项目路径与实际文件所在目录不一致。
- **解决方式**：双击左侧项目列表中的目标工程（如 `佳能中国`），确保顶部与侧边栏高亮为该项目后，再发起拉取。

### Q3：如何离线测试拉取到的数据与脚本？
- 在当前工作区根目录下，可在软件内置终端直接执行：
  ```bash
  # 抽样查询 5 条客户真实数据验证接口连通性
  node scripts/query_data.js AccountObj 5

  # 查看本地 Git 追踪的所有 APL 与元数据文件
  git status
  ```
