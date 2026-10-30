### 版本更新说明 (v1.8.26)

#### 修复与改进

1. 修复 Salesforce CRM 登录成功后，使用 refresh token 注册 Salesforce CLI 时 alias 被误判为意外参数的问题。
2. 保持授权 URL 通过标准输入传递，避免将敏感凭据写入普通临时文件。
