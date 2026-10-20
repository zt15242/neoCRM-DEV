import crypto from 'node:crypto';
import http from 'node:http';
import url from 'node:url';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, spawn, ChildProcess } from 'node:child_process';
import axios from 'axios';
import { BrowserWindow, shell, session } from 'electron';
import { NeoEnvironment, TokenData, UserInfo } from '../types';
import { resolveSalesforceAlias } from './salesforceService';

export class AuthService {
  private activeServer: http.Server | null = null;
  private embeddedAuthWindow: BrowserWindow | null = null;
  private activeCliProcess: ChildProcess | null = null;

  /**
   * 检查指定端口是否已被占用
   */
  private async isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', (err: any) => {
        resolve(err.code === 'EADDRINUSE');
      });
      server.once('listening', () => {
        server.close(() => resolve(false));
      });
      // 明确绑定 127.0.0.1，避开 Windows 平台禁用 IPv6 时的 EADDRNOTAVAIL 报错及防火墙弹窗
      server.listen(port, '127.0.0.1');
    });
  }

  /**
   * 寻找可用端口（如果指定端口被占用，则从 1029 开始向上探测）
   */
  private async getAvailablePort(defaultPort = 1028): Promise<number> {
    let port = defaultPort;
    while (await this.isPortInUse(port)) {
      port++;
      if (port > defaultPort + 50) {
        throw new Error(`找不到可用的回调端口 (已尝试 ${defaultPort} - ${port})`);
      }
    }
    return port;
  }

  /**
   * 生成回调成功 HTML 页面
   */
  private getAuthSuccessHtml(tenantDesc: string, instanceUri: string, env?: NeoEnvironment): string {
    const isSf = env?.productType === 'salesforce';
    const isFx = env?.productType === 'fxiaoke';
    const platformTitle = isSf ? 'Salesforce 组织认证成功' : isFx ? '纷享销客授权成功' : '销售易统一认证成功';
    const descText = isSf
      ? `您已成功登录 Salesforce 组织【${tenantDesc}】，凭据已安全回传至桌面客户端。您可以关闭此浏览器标签页。`
      : isFx
      ? `您已成功登录纷享销客企业【${tenantDesc}】，凭据已安全回传至桌面客户端。您可以关闭此浏览器标签页。`
      : `您已成功登录销售易租户【${tenantDesc}】，凭据已安全回传至 NeoCRM 桌面客户端。您可以关闭此浏览器标签页。`;

    const tenantLabel = isSf ? '组织标识 (Org ID):' : isFx ? '企业账号 (ea):' : '当前租户:';
    const brandColor = isSf ? '#0284c7' : isFx ? '#ea580c' : '#0284c7';
    const brandBg = isSf ? '#e0f2fe' : isFx ? '#ffedd5' : '#e0f2fe';

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${platformTitle}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      color: #1e293b;
    }
    .card {
      background: #ffffff;
      border-radius: 18px;
      padding: 40px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08);
      max-width: 480px;
      width: 90%;
      text-align: center;
      border: 1px solid #e2e8f0;
    }
    .icon {
      width: 64px;
      height: 64px;
      background: ${brandBg};
      color: ${brandColor};
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      margin-bottom: 20px;
    }
    h2 {
      margin: 0 0 10px 0;
      font-size: 22px;
      color: #0f172a;
    }
    p {
      color: #64748b;
      font-size: 14px;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .info-box {
      background: #f1f5f9;
      border-radius: 10px;
      padding: 14px;
      text-align: left;
      font-size: 13px;
      margin-bottom: 24px;
    }
    .info-row {
      display: flex;
      margin-bottom: 8px;
    }
    .info-row:last-child { margin-bottom: 0; }
    .label { color: #64748b; width: 130px; flex-shrink: 0; }
    .val { color: #0f172a; font-weight: 600; word-break: break-all; font-family: monospace; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h2>${platformTitle}</h2>
    <p>${descText}</p>
    <div class="info-box">
      <div class="info-row"><span class="label">${tenantLabel}</span><span class="val">${tenantDesc}</span></div>
      <div class="info-row"><span class="label">服务实例:</span><span class="val">${instanceUri}</span></div>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * 生成回调错误 HTML 页面
   */
  private getAuthErrorHtml(errorMsg: string): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>NeoCRM 客户端授权失败</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #fef2f2;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      color: #991b1b;
    }
    .card {
      background: #fff;
      border-radius: 16px;
      padding: 40px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08);
      max-width: 480px;
      text-align: center;
      border: 1px solid #fecaca;
    }
    h2 { margin-top: 0; }
    p { color: #7f1d1d; }
  </style>
</head>
<body>
  <div class="card">
    <h2>授权失败</h2>
    <p>${errorMsg}</p>
    <p style="font-size: 13px; color: #6b7280;">请返回桌面客户端重试。</p>
  </div>
</body>
</html>`;
  }

  /**
   * 模式1：通过系统默认浏览器进行 OAuth2 授权
   */

  /**
   * 纷享销客 OpenAPI v2 客户端凭证模式直连 (适用于自建应用无人工参与后台授权)
   * 参考: https://developer.fxiaoke.com/openapi_v2/start/auth/app-info.html
   */
  /**
   * Salesforce OAuth 2.0 客户端凭证模式直连 (Client Credentials Flow)
   * 适用于 Connected App / 外部客户端应用服务端直通，全面支持阿里中国版 (*.sfcrmproducts.cn) 与全球版 (*.salesforce.com)
   */
  public async loginWithSalesforceClientCredentials(env: NeoEnvironment): Promise<TokenData> {
    const rawBaseUrl = (env.neoBaseURL || 'https://login.salesforce.com').trim().replace(/\/+$/, '');
    const tokenUrl = env.tokenURL || `${rawBaseUrl}/services/oauth2/token`;

    if (!env.clientId || !env.clientSecret) {
      throw new Error('Salesforce 客户端凭证模式需要配置 Client ID (Consumer Key) 与 Client Secret (Consumer Secret)');
    }

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', env.clientId.trim());
    params.append('client_secret', env.clientSecret.trim());

    try {
      const res = await axios.post(tokenUrl, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      });

      const data = res.data;
      if (!data || !data.access_token) {
        throw new Error(`Salesforce 认证未返回有效 access_token: ${JSON.stringify(data)}`);
      }

      const instanceUrl = data.instance_url || rawBaseUrl;
      const orgId = data.id ? data.id.split('/')[4] : 'salesforce_org';

      let userInfo: UserInfo = {
        userId: orgId,
        name: `Salesforce 客户端应用 (${orgId})`,
        tenant_id: orgId,
        tenantName: `Salesforce 组织 (${orgId})`,
      };

      if (data.id) {
        try {
          const idRes = await axios.get(data.id, {
            headers: { Authorization: `Bearer ${data.access_token}` },
            timeout: 10000,
          });
          if (idRes.data) {
            userInfo = {
              userId: idRes.data.user_id || orgId,
              name: idRes.data.username || idRes.data.display_name || 'Salesforce 用户',
              tenant_id: idRes.data.organization_id || orgId,
              tenantName: `Salesforce (${idRes.data.organization_id || orgId})`,
              email: idRes.data.email,
            };
          }
        } catch {}
      }

      const expiresIn = 7200;
      return {
        access_token: data.access_token,
        expires_in: expiresIn,
        instance_uri: instanceUrl,
        tenant_id: userInfo.tenant_id || orgId,
        userInfo,
        savedAt: Date.now(),
        expiresAt: Date.now() + expiresIn * 1000,
      };
    } catch (err: any) {
      const respErr = err.response?.data?.error_description || err.response?.data?.error || err.message;
      if (respErr && respErr.includes('request not supported on this domain')) {
        throw new Error(`Salesforce 登录失败: ${respErr}。提示: Salesforce 客户端凭证模式 (Client Credentials) 要求使用您组织的专属“我的域” (My Domain，例如 https://<MyDomain>.my.sfcrmproducts.cn 或沙盒 https://<MyDomain>--<Sandbox>.sandbox.my.sfcrmproducts.cn)，请在连接器设置中将实例地址修改为您企业的 My Domain 域名后重试。`);
      }
      throw new Error(`Salesforce 客户端凭证授权失败: ${respErr}`);
    }
  }

  public async loginWithFxiaoKeClientCredentials(env: NeoEnvironment): Promise<TokenData> {
    const cloudDomain = env.cloudDomain?.trim() || (env.neoBaseURL ? new URL(env.neoBaseURL).host : 'open.fxiaoke.com');
    // 强制纠偏：纷享销客 OpenAPI v2 唯一合法令牌端点是 /oauth2.0/token (必须包含 .0)
    // 彻底防止历史旧配置误存了 /cgi/... 或 /auc/... 或 /oauth2/token 导致 404 错误
    let tokenUrl = env.tokenURL?.trim();
    if (!tokenUrl || tokenUrl.includes('/cgi/') || tokenUrl.includes('/auc/') || tokenUrl.endsWith('/oauth2/token') || !tokenUrl.includes('/oauth2.0/token')) {
      tokenUrl = `https://${cloudDomain}/oauth2.0/token`;
    }
    const thirdTraceId = `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (!env.clientId || !env.clientSecret) {
      throw new Error('纷享销客自建应用需要提供 appId 与 appSecret');
    }
    if (!env.permanentCode) {
      throw new Error('纷享销客客户端凭证模式需要提供企业永久授权码 (permanentCode)');
    }

    const payload = {
      appId: env.clientId.trim(),
      permanentCode: env.permanentCode.trim(),
      appSecret: env.clientSecret.trim(),
      grantType: 'app_secret',
    };

    const res = await axios.post(`${tokenUrl}?thirdTraceId=${thirdTraceId}`, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });

    const data = res.data;
    if (data.errorCode !== 0 && data.errorCode !== '0') {
      throw new Error(`纷享销客授权失败 (${data.errorCode}): ${data.errorMessage || JSON.stringify(data)}`);
    }

    const expiresIn = Number(data.expiresIn || 7200);
    const tenantId = String(data.ea || data.openUserId || 'fxiaoke_tenant');
    const userInfo: UserInfo = {
      userId: data.openUserId || data.appId,
      name: `纷享应用 (${data.ea || data.appId})`,
      tenant_id: tenantId,
      tenantName: `纷享销客企业 (${data.ea || '自建应用'})`,
      ea: data.ea,
    };

    return {
      access_token: data.accessToken,
      expires_in: expiresIn,
      instance_uri: `https://${cloudDomain}`,
      tenant_id: tenantId,
      userInfo,
      savedAt: Date.now(),
      expiresAt: Date.now() + expiresIn * 1000,
    };
  }

  /**
   * 解析本地 Salesforce CLI (sf v2) 的当前有效 Org 别名
   */
  public getSalesforceAlias(env?: NeoEnvironment, tokenData?: TokenData): string {
    return resolveSalesforceAlias(env, tokenData);
  }

  /**
   * 采用 Salesforce CLI (sf v2) 官方标准进行网页授权登录 (全面对齐 salesforce-cli skill 规范)
   */
  public async loginWithSalesforceCli(env: NeoEnvironment): Promise<TokenData> {
    this.cancelActiveAuth();
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'sf.cmd' : 'sf';

    let instanceUrl = env.neoBaseURL?.trim() || (env.envType === 'sandbox' ? 'https://test.sfcrmproducts.cn' : 'https://login.sfcrmproducts.cn');
    if (instanceUrl.endsWith('/')) {
      instanceUrl = instanceUrl.slice(0, -1);
    }

    const alias = this.getSalesforceAlias(env);
    const args = ['org', 'login', 'web', '--instance-url', instanceUrl, '--alias', alias, '--set-default'];
    if (env.clientId) {
      args.push('--client-id', env.clientId);
    }

    console.log(`[Salesforce CLI Auth] 正在启动官方 sf 命令行授权: ${cmd} ${args.join(' ')}`);

    await new Promise<void>((resolve, reject) => {
      const child = spawn(cmd, args, {
        shell: true,
        env: { ...process.env, CI: 'false', SF_USE_PROGRESS_BAR: 'false' },
      });
      this.activeCliProcess = child;

      let stderrOutput = '';
      let stdoutOutput = '';

      child.stdout?.on('data', (d) => {
        const text = d.toString();
        stdoutOutput += text;
        // Windows 专项优化：当探测到 Salesforce CLI 输出的授权登录 URL 时，强制通过 Electron shell.openExternal 打开默认系统浏览器
        const urlMatch = text.match(/https:\/\/[^\s"'<>]+/);
        if (urlMatch && urlMatch[0].includes('/services/oauth2/authorize')) {
          console.log('[Salesforce CLI Auth] 捕获到授权 URL，强制唤起系统默认浏览器:', urlMatch[0]);
          shell.openExternal(urlMatch[0]).catch(() => {});
        }
      });

      child.stderr?.on('data', (d) => {
        stderrOutput += d.toString();
      });

      child.on('close', (code) => {
        this.activeCliProcess = null;
        if (code === 0) {
          console.log('[Salesforce CLI Auth] sf org login web 授权成功！');
          resolve();
        } else {
          reject(new Error(`Salesforce CLI 授权未完成 (退出码 ${code}): ${stderrOutput || stdoutOutput || '用户取消了登录'}`));
        }
      });

      child.on('error', (err) => {
        this.activeCliProcess = null;
        reject(new Error(`无法启动 Salesforce CLI (sf): ${err.message}。请确保已安装 @salesforce/cli`));
      });
    });

    return this.getSalesforceTokenFromCli(env, alias);
  }

  /**
   * 从 Salesforce CLI (sf) 中提取当前 Org 的最新有效 Access Token 与实例元数据
   */
  /**
   * 极速无开销提取本地已认证的 Salesforce 凭据（0ms 响应，杜绝进程阻塞）
   */
  private getAuthFromDiskByAlias(alias: string, env?: NeoEnvironment): any | null {
    try {
      const sfdxDir = path.join(os.homedir(), '.sfdx');
      if (!fs.existsSync(sfdxDir)) return null;

      let targetUsername = alias;
      const aliasJsonPath = path.join(sfdxDir, 'alias.json');
      if (fs.existsSync(aliasJsonPath)) {
        try {
          const aliasData = JSON.parse(fs.readFileSync(aliasJsonPath, 'utf-8'));
          const orgs = aliasData.orgs || {};
          if (orgs[alias]) targetUsername = orgs[alias];
        } catch {}
      }

      const candidatePath = path.join(sfdxDir, `${targetUsername}.json`);
      if (fs.existsSync(candidatePath)) {
        const data = JSON.parse(fs.readFileSync(candidatePath, 'utf-8'));
        if (data.accessToken) return data;
      }

      // 若别名未直接命中，仅匹配与当前环境实例 URL (MyDomain) 一致的文件，绝不越界匹配其他环境
      const instanceUrl = env?.neoBaseURL;
      if (instanceUrl) {
        try {
          const host = new URL(instanceUrl).host.toLowerCase();
          const files = fs.readdirSync(sfdxDir).filter(
            (f) => f.endsWith('.json') && f !== 'alias.json' && f !== 'sfdx-config.json' && f !== 'key.json'
          );
          for (const f of files) {
            try {
              const d = JSON.parse(fs.readFileSync(path.join(sfdxDir, f), 'utf-8'));
              if (d.accessToken && d.instanceUrl && d.instanceUrl.toLowerCase().includes(host)) {
                return d;
              }
            } catch {}
          }
        } catch {}
      }
    } catch {}
    return null;
  }

  /**
   * 从 Salesforce CLI (sf) 中提取当前 Org 的最新有效 Access Token 与实例元数据
   */
  public getSalesforceTokenFromCli(env: NeoEnvironment, targetAlias?: string): TokenData {
    const alias = targetAlias || this.getSalesforceAlias(env);

    // 1. 优先尝试直接从磁盘提取（0ms 瞬间完成，绝不阻塞主进程引起假死）
    const diskData = this.getAuthFromDiskByAlias(alias, env);
    if (diskData && diskData.accessToken) {
      const orgId = diskData.orgId || 'salesforce_org';
      const username = diskData.username || 'Salesforce 用户';
      const instanceUri = diskData.instanceUrl || env.neoBaseURL;
      if (!env.clientId && diskData.clientId) env.clientId = diskData.clientId;
      if (!env.clientSecret && diskData.clientSecret) env.clientSecret = diskData.clientSecret;

      console.log(`[Salesforce] 极速命中本地磁盘凭证: ${username} (OrgId: ${orgId})`);
      return {
        access_token: diskData.accessToken,
        refresh_token: diskData.refreshToken || undefined,
        expires_in: 7200,
        instance_uri: instanceUri,
        tenant_id: orgId,
        userInfo: {
          userId: orgId,
          name: username,
          tenant_id: orgId,
          tenantName: `Salesforce 组织 (${orgId})`,
        },
        savedAt: Date.now(),
        expiresAt: Date.now() + 7200 * 1000,
      };
    }

    // 2. 磁盘未找到时，安全回退至 CLI 命令读取
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'sf.cmd' : 'sf';

    try {
      let stdout = '';
      try {
        stdout = execSync(
          `"${cmd}" org display --target-org "${alias}" --json`,
          {
            encoding: 'utf-8',
            timeout: 12000,
            shell: true,
            env: { ...process.env, SF_TEMP_SHOW_SECRETS: 'true' },
            windowsHide: true,
          }
        );
      } catch {
        stdout = execSync(
          `"${cmd}" org display --json`,
          {
            encoding: 'utf-8',
            timeout: 12000,
            shell: true,
            env: { ...process.env, SF_TEMP_SHOW_SECRETS: 'true' },
            windowsHide: true,
          }
        );
      }

      const jsonStart = stdout.indexOf('{');
      const jsonEnd = stdout.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error('未能从 Salesforce CLI 解析返回的 JSON 数据');
      }

      const parsed = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1));
      const res = parsed.result;
      if (!res || !res.accessToken) {
        throw new Error(parsed.message || res?.connectedStatus || 'Salesforce CLI 未返回有效 accessToken');
      }

      const instanceUri = res.instanceUrl || env.neoBaseURL;
      const orgId = res.id || 'salesforce_org';
      const username = res.username || 'Salesforce 用户';

      let refreshToken = '';
      try {
        const userJsonPath = path.join(os.homedir(), '.sfdx', `${username}.json`);
        if (fs.existsSync(userJsonPath)) {
          const authFile = JSON.parse(fs.readFileSync(userJsonPath, 'utf-8'));
          refreshToken = authFile.refreshToken || '';
          if (!env.clientId && authFile.clientId) env.clientId = authFile.clientId;
          if (!env.clientSecret && authFile.clientSecret) env.clientSecret = authFile.clientSecret;
        }
      } catch {}

      const tokenData: TokenData = {
        access_token: res.accessToken,
        refresh_token: refreshToken || undefined,
        expires_in: 7200,
        instance_uri: instanceUri,
        tenant_id: orgId,
        userInfo: {
          userId: orgId,
          name: username,
          tenant_id: orgId,
          tenantName: `Salesforce 组织 (${orgId})`,
        },
        savedAt: Date.now(),
        expiresAt: Date.now() + 7200 * 1000,
      };

      return tokenData;
    } catch (e: any) {
      throw new Error(`从 Salesforce CLI 读取凭据失败: ${e.message}`);
    }
  }

  /**
   * 遵循 salesforce-cli skill 规范对 Salesforce 实施无感/交互式令牌续期
   */
  public async refreshSalesforceTokenViaCli(
    env: NeoEnvironment,
    currentTokenData?: TokenData,
    isInteractive = false
  ): Promise<TokenData> {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'sf.cmd' : 'sf';
    const alias = this.getSalesforceAlias(env);

    // 1. 优先尝试从 sf CLI 执行 org display（触发 CLI 自带的云端 token 刷新）
    try {
      let stdout = '';
      try {
        stdout = execSync(
          `"${cmd}" org display --target-org "${alias}" --json`,
          {
            encoding: 'utf-8',
            timeout: 15000,
            shell: true,
            env: { ...process.env, SF_TEMP_SHOW_SECRETS: 'true' },
            windowsHide: true,
          }
        );
      } catch {
        stdout = execSync(
          `"${cmd}" org display --json`,
          {
            encoding: 'utf-8',
            timeout: 15000,
            shell: true,
            env: { ...process.env, SF_TEMP_SHOW_SECRETS: 'true' },
            windowsHide: true,
          }
        );
      }

      const jsonStart = stdout.indexOf('{');
      const jsonEnd = stdout.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const parsed = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1));
        const res = parsed.result;
        if (res && res.accessToken && (!res.connectedStatus || res.connectedStatus === 'Connected')) {
          console.log(`[Salesforce] 从本地 CLI (${alias}) 成功获取有效凭据`);

          let refreshToken = currentTokenData?.refresh_token || '';
          const username = res.username || currentTokenData?.userInfo?.name;
          if (username) {
            try {
              const uPath = path.join(os.homedir(), '.sfdx', `${username}.json`);
              if (fs.existsSync(uPath)) {
                const uData = JSON.parse(fs.readFileSync(uPath, 'utf-8'));
                if (uData.refreshToken) refreshToken = uData.refreshToken;
                if (!env.clientId && uData.clientId) env.clientId = uData.clientId;
              }
            } catch {}
          }

          return {
            access_token: res.accessToken,
            refresh_token: refreshToken || undefined,
            expires_in: 7200,
            instance_uri: res.instanceUrl || env.neoBaseURL,
            tenant_id: res.id || currentTokenData?.tenant_id || 'salesforce_org',
            userInfo: {
              userId: res.id || currentTokenData?.userInfo?.userId || 'salesforce_org',
              name: res.username || currentTokenData?.userInfo?.name || 'Salesforce 用户',
              tenant_id: res.id || currentTokenData?.tenant_id || 'salesforce_org',
              tenantName: `Salesforce 组织 (${res.id || 'salesforce_org'})`,
            },
            savedAt: Date.now(),
            expiresAt: Date.now() + 7200 * 1000,
          };
        }
      }
    } catch (e: any) {
      console.warn(`[Salesforce] sf org display 刷新提示:`, e.message);
    }

    // 2. 若 CLI display 未能刷新，尝试直接从本地磁盘 ~/.sfdx/*.json 中提取是否有刚刷新的 token
    try {
      const username = currentTokenData?.userInfo?.name;
      if (username) {
        const uPath = path.join(os.homedir(), '.sfdx', `${username}.json`);
        if (fs.existsSync(uPath)) {
          const uData = JSON.parse(fs.readFileSync(uPath, 'utf-8'));
          if (uData.accessToken && uData.accessToken !== currentTokenData?.access_token) {
            console.log(`[Salesforce] 从磁盘 auth 缓存直接提取到新 Access Token`);
            return {
              access_token: uData.accessToken,
              refresh_token: uData.refreshToken || currentTokenData?.refresh_token,
              expires_in: 7200,
              instance_uri: uData.instanceUrl || env.neoBaseURL,
              tenant_id: uData.orgId || currentTokenData?.tenant_id || 'salesforce_org',
              userInfo: currentTokenData?.userInfo || {
                userId: uData.orgId,
                name: uData.username,
                tenant_id: uData.orgId,
                tenantName: `Salesforce 组织 (${uData.orgId})`,
              },
              savedAt: Date.now(),
              expiresAt: Date.now() + 7200 * 1000,
            };
          }
        }
      }
    } catch {}

    // 3. 如果属于用户主动触发的交互式操作（点击重新登录/手动续期），唤起 sf 官方网页认证
    if (isInteractive) {
      console.log('[Salesforce] 正在遵循 salesforce-cli skill 规范启动 sf org login web 重新认证...');
      return await this.loginWithSalesforceCli(env);
    }

    // 4. 后台静默模式抛出明确错误提示
    throw new Error('Salesforce CLI 授权会话已失效，请在连接器详情中点击「重新登录」重新授权');
  }

  public async loginWithBrowser(env: NeoEnvironment): Promise<TokenData> {
    if (env.productType === 'fxiaoke' && (env.authMode === 'client_credentials' || env.permanentCode)) {
      return this.loginWithFxiaoKeClientCredentials(env);
    }
    if (env.productType === 'salesforce' && env.authMode === 'client_credentials') {
      return this.loginWithSalesforceClientCredentials(env);
    }

    const configuredRedirectUri = (env.redirectUri || '').trim();
    this.cancelActiveAuth();

    let targetPort = 1028;
    let redirectUri = 'http://localhost:1028';
    let port = 1028;

    if (env.redirectUri && env.redirectUri.trim()) {
      const trimmed = env.redirectUri.trim();
      try {
        const u = new URL(trimmed);
        if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
          targetPort = parseInt(u.port, 10) || 1028;
          port = await this.getAvailablePort(targetPort);
          const hasSlash = trimmed.replace(/[?#].*$/, '').endsWith('/');
          const pathPart = u.pathname === '/' ? (hasSlash ? '/' : '') : u.pathname;
          redirectUri = `${u.protocol}//${u.hostname}:${port}${pathPart}${u.search}`;
        } else {
          redirectUri = trimmed;
          port = await this.getAvailablePort(targetPort);
        }
      } catch {
        redirectUri = trimmed;
        port = await this.getAvailablePort(targetPort);
      }
    } else {
      port = await this.getAvailablePort(targetPort);
      redirectUri = `http://localhost:${port}`;
    }
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const authUrl = this.buildAuthUrl(env, redirectUri, codeChallenge);

    return new Promise<TokenData>((resolve, reject) => {
      let isSettled = false;

      const server = http.createServer(async (req, res) => {
        const requestUrl = new URL(req.url || "", `http://localhost:${port}`);

        // 忽略 favicon 等非回调请求
        if (requestUrl.pathname === "/favicon.ico") {
          res.writeHead(204);
          return res.end();
        }

        if (isSettled) {
          res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
          return res.end("OK");
        }

        const code = requestUrl.searchParams.get("code");
        const error = requestUrl.searchParams.get("error");
        const error_description = requestUrl.searchParams.get("error_description");

        if (error) {
          isSettled = true;
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(this.getAuthErrorHtml(String(error_description || error)));
          server.close();
          this.activeServer = null;
          if (error === 'redirect_uri_mismatch') {
            return reject(new Error(`Salesforce 回调地址不匹配 (redirect_uri_mismatch)：当前请求回调地址为【${redirectUri}】，与 Salesforce Connected App 中配置的【回调 URL】不一致！请在连接器设置中修改回调地址。`));
          }
          return reject(new Error(`授权返回错误: ${error_description || error}`));
        }

        if (code) {
          isSettled = true;
          try {
            // 仅在此处换取一次 Token (OAuth2 Code 只能单次消费)
            const tokenData = await this.fetchTokenByCode(env, String(code), redirectUri, codeVerifier);
            const tenantDesc = tokenData.userInfo?.tenantName
              ? `${tokenData.userInfo.tenantName} (${tokenData.tenant_id})`
              : `${tokenData.tenant_id || "未返回"}`;
            const instanceUri = tokenData.instance_uri || env.neoBaseURL;

            res.writeHead(200, {
              "Content-Type": "text/html; charset=utf-8",
              "Connection": "close",
            });
            res.end(this.getAuthSuccessHtml(tenantDesc, instanceUri, env), () => {
              // 关键修复：必须等待 HTML 响应在 Windows TCP 栈中完全 flush 完毕后再关闭监听，防止浏览器报 ERR_CONNECTION_RESET
              setTimeout(() => {
                try {
                  (server as any).closeAllConnections?.();
                  server.close();
                } catch {}
                this.activeServer = null;
              }, 1200);
            });
            return resolve(tokenData);
          } catch (fetchErr: any) {
            res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
            res.end(this.getAuthErrorHtml(`换取 Token 失败: ${fetchErr.message}`));
            server.close();
            this.activeServer = null;
            return reject(fetchErr);
          }
        }

        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      });

      server.on("error", (err) => {
        if (!isSettled) {
          this.activeServer = null;
          reject(new Error(`回调服务启动失败: ${err.message}`));
        }
      });

      const startBrowser = () => {
        this.activeServer = server;
        shell.openExternal(authUrl).catch((openErr) => {
          if (process.platform === 'win32') {
            try {
              const { exec } = require('node:child_process');
              exec(`start "" "${authUrl}"`);
              return;
            } catch {}
          }
          try { server.close(); } catch {}
          this.activeServer = null;
          reject(new Error(`无法唤起默认浏览器: ${openErr.message}`));
        });
      };

      // Windows 优先绑定 0.0.0.0 (支持 localhost 与 127.0.0.1 双向访问)，若受限则降级绑定 127.0.0.1
      try {
        server.listen(port, '0.0.0.0', startBrowser);
      } catch {
        server.listen(port, '127.0.0.1', startBrowser);
      }

      // 5分钟超时
      setTimeout(() => {
        if (!isSettled) {
          server.close();
          this.activeServer = null;
          reject(new Error("授权超时（5分钟未完成登录操作）"));
        }
      }, 300000);
    });
  }

  /**
   * 模式2：通过应用内嵌弹窗进行 OAuth2 授权
   */
  public async loginWithEmbeddedWindow(env: NeoEnvironment, parentWindow?: BrowserWindow): Promise<TokenData> {
    if (env.productType === 'fxiaoke' && (env.authMode === 'client_credentials' || env.permanentCode)) {
      return this.loginWithFxiaoKeClientCredentials(env);
    }
    if (env.productType === 'salesforce' && env.authMode === 'client_credentials') {
      return this.loginWithSalesforceClientCredentials(env);
    }
    this.cancelActiveAuth();

    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const rawRedirect = (env.redirectUri || (env.productType === 'salesforce' ? 'http://localhost:1028' : 'http://localhost:1028')).trim();
    let redirectUri = rawRedirect;
    try {
      const u = new URL(rawRedirect);
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
        const hasSlash = rawRedirect.replace(/[?#].*$/, '').endsWith('/');
        const pathPart = u.pathname === '/' ? (hasSlash ? '/' : '') : u.pathname;
        redirectUri = `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}${pathPart}${u.search}`;
      }
    } catch {}
    const authUrl = this.buildAuthUrl(env, redirectUri, codeChallenge);

    return new Promise<TokenData>((resolve, reject) => {
      let isSettled = false;

      const authPartition = "neocrm_auth_session";
      const authSession = session.fromPartition(authPartition);
      // 弹窗前清空此独立会话的所有历史 Cookies，避免自动用旧账号静默登录
      authSession.clearStorageData({
        storages: ["cookies", "sessionstorage", "localstorage"]
      }).catch(() => {});

      const authWin = new BrowserWindow({
        width: 880,
        height: 760,
        parent: process.platform === 'darwin' ? undefined : parentWindow,
        modal: false,
        title: `${env.productType === "salesforce" ? "Salesforce" : env.productType === "fxiaoke" ? "纷享销客" : "销售易"} 登录认证 - ${env.name}`,
        autoHideMenuBar: true,
        backgroundColor: '#ffffff',
        closable: true,
        minimizable: false,
        resizable: true,
        center: true,
        show: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          partition: authPartition,
        },
      });

      this.embeddedAuthWindow = authWin;

      const injectCloseButton = () => {
        if (authWin.isDestroyed()) return;
        authWin.webContents.insertCSS(`
          #__neocrm_close_floating_btn__ {
            position: fixed !important;
            top: 14px !important;
            right: 18px !important;
            z-index: 2147483647 !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 6px !important;
            background: rgba(15, 23, 42, 0.85) !important;
            color: #ffffff !important;
            border: 1px solid rgba(255, 255, 255, 0.3) !important;
            border-radius: 9999px !important;
            padding: 7px 15px !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif !important;
            font-size: 12px !important;
            font-weight: 600 !important;
            line-height: 1 !important;
            cursor: pointer !important;
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25) !important;
            backdrop-filter: blur(8px) !important;
            -webkit-backdrop-filter: blur(8px) !important;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
            user-select: none !important;
          }
          #__neocrm_close_floating_btn__:hover {
            background: #e11d48 !important;
            border-color: rgba(255, 255, 255, 0.6) !important;
            box-shadow: 0 6px 20px rgba(225, 29, 72, 0.4) !important;
            transform: translateY(-1px) !important;
          }
          #__neocrm_close_floating_btn__:active {
            transform: translateY(1px) !important;
          }
        `).catch(() => {});

        authWin.webContents.executeJavaScript(`
          (function() {
            if (document.getElementById('__neocrm_close_floating_btn__')) return;
            var btn = document.createElement('div');
            btn.id = '__neocrm_close_floating_btn__';
            btn.title = '关闭此登录窗口 (快捷键: Esc)';
            btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg><span>关闭窗口</span>';
            btn.onclick = function(e) {
              e.preventDefault();
              e.stopPropagation();
              console.log('__NEOCRM_CLOSE_WINDOW__');
            };
            if (document.body) {
              document.body.appendChild(btn);
            } else {
              document.addEventListener('DOMContentLoaded', function() {
                if (document.body && !document.getElementById('__neocrm_close_floating_btn__')) {
                  document.body.appendChild(btn);
                }
              });
            }
          })();
        `).catch(() => {});
      };

      authWin.webContents.on('dom-ready', injectCloseButton);
      authWin.webContents.on('did-finish-load', injectCloseButton);
      authWin.webContents.on('did-navigate', injectCloseButton);
      authWin.webContents.on('did-navigate-in-page', injectCloseButton);

      authWin.webContents.on('console-message', (_, __, message) => {
        if (message === '__NEOCRM_CLOSE_WINDOW__') {
          if (!isSettled) {
            isSettled = true;
            setTimeout(() => {
              try { if (!authWin.isDestroyed()) authWin.close(); } catch {}
              this.embeddedAuthWindow = null;
            }, 50);
            reject(new Error("用户取消了登录"));
          }
        }
      });

      authWin.webContents.on('before-input-event', (_, input) => {
        if (input.key === 'Escape' && input.type === 'keyDown') {
          if (!isSettled) {
            isSettled = true;
            setTimeout(() => {
              try { if (!authWin.isDestroyed()) authWin.close(); } catch {}
              this.embeddedAuthWindow = null;
            }, 50);
            reject(new Error("用户取消了登录"));
          }
        }
      });

      const checkUrl = async (targetUrl: string) => {
        if (isSettled) return;
        try {
          const u = new URL(targetUrl);
          const isMatch = targetUrl.startsWith(redirectUri) || u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.pathname.includes('/services/oauth2/success') || (u.searchParams.has('code') && (targetUrl.includes('salesforce') || targetUrl.includes('sfcrmproducts')));
          if (isMatch) {
            const code = u.searchParams.get("code");
            const error = u.searchParams.get("error");

            if (error) {
              isSettled = true;
              setTimeout(() => {
                try { if (!authWin.isDestroyed()) authWin.close(); } catch {}
                this.embeddedAuthWindow = null;
              }, 100);
              return reject(new Error(`授权被拒绝或出错: ${error}`));
            }

            if (code) {
              isSettled = true;
              let capturedCookies: any[] = [];
              let cookieString = "";
              try {
                const rawCookies = await authSession.cookies.get({});
                capturedCookies = rawCookies.map((c) => ({
                  name: c.name,
                  value: c.value,
                  domain: c.domain,
                  path: c.path,
                  secure: c.secure,
                  httpOnly: c.httpOnly,
                }));
                cookieString = rawCookies.map((c) => `${c.name}=${c.value}`).join("; ");
              } catch (cookieErr) {
                console.warn("提取内嵌浏览器 Cookies 异常:", cookieErr);
              }

              // 关键修复：延迟在下一个事件循环关闭窗口，防止 Windows 下 Chromium 网络回调期发生窗口对象被销毁异常
              setTimeout(() => {
                try { if (!authWin.isDestroyed()) authWin.close(); } catch {}
                this.embeddedAuthWindow = null;
              }, 150);

              try {
                const token = await this.fetchTokenByCode(env, code, redirectUri, codeVerifier);
                if (cookieString) {
                  token.cookieString = cookieString;
                  token.cookies = capturedCookies;
                  token.cookieSavedAt = Date.now();
                }
                resolve(token);
              } catch (e) {
                reject(e);
              }
            }
          }
        } catch {}
      };

      authWin.webContents.on("will-navigate", (_, navUrl) => {
        checkUrl(navUrl);
      });

      authWin.webContents.on("will-redirect", (_, redirectUrl) => {
        checkUrl(redirectUrl);
      });

      authWin.webContents.session.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, callback) => {
        if (details.url.startsWith('neocrm-action://close') || details.url.includes('__neocrm_cancel__')) {
          callback({ cancel: true });
          if (!isSettled) {
            isSettled = true;
            setTimeout(() => {
              try { if (!authWin.isDestroyed()) authWin.close(); } catch {}
              this.embeddedAuthWindow = null;
            }, 50);
            reject(new Error("用户取消了登录"));
          }
          return;
        }

        let isRedirectMatched = false;
        try {
          const u = new URL(details.url);
          if (
            details.url.startsWith(redirectUri) ||
            u.hostname === 'localhost' ||
            u.hostname === '127.0.0.1' ||
            u.pathname.includes('/services/oauth2/success') ||
            (u.searchParams.has('code') && (details.url.includes('salesforce') || details.url.includes('sfcrmproducts')))
          ) {
            isRedirectMatched = true;
          }
        } catch {}

        checkUrl(details.url);

        if (isRedirectMatched) {
          // 关键修复：取消对 localhost 的真实网络连接，防止 Windows 下未监听端口展示 ERR_CONNECTION_REFUSED 错误页
          callback({ cancel: true });
        } else {
          callback({});
        }
      });

      authWin.on("closed", () => {
        this.embeddedAuthWindow = null;
        if (!isSettled) {
          reject(new Error("用户取消了登录"));
        }
      });

      authWin.loadURL(authUrl).catch((err) => {
        if (!isSettled) {
          authWin.close();
          this.embeddedAuthWindow = null;
          reject(new Error(`无法加载授权页面: ${err.message}`));
        }
      });
    });
  }

  /**
   * 模式3：账号密码直接登录 (Password 授权模式)
   */
  public async loginWithPassword(
    env: NeoEnvironment,
    username: string,
    password: string
  ): Promise<TokenData> {
    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('client_id', env.clientId || '04c8b45c4dbe36426a660bf70d3fe3e7');
    params.append('client_secret', env.clientSecret || '370817d1336a3737f95c671eea39a23b');
    params.append('username', username.trim());
    params.append('password', password);

    const tokenRes = await axios.post(env.tokenURL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    });

    const data = tokenRes.data;
    if (!data || !data.access_token) {
      throw new Error(`密码模式获取 Token 失败: ${JSON.stringify(data)}`);
    }

    const effectiveBaseUrl = this.resolveEffectiveBaseUrl(env, data.instance_uri);
    const userInfo = await this.fetchUserInfo(effectiveBaseUrl, data.access_token);

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in || 7200,
      instance_uri: data.instance_uri || env.neoBaseURL,
      tenant_id: data.tenant_id || userInfo?.tenant_id,
      userInfo,
      savedAt: Date.now(),
      expiresAt: Date.now() + (data.expires_in || 7200) * 1000,
    };
  }

  /**
   * 统一自动/手动续期方法，全面支持多平台（纷享销客客户端凭据直连、Salesforce、销售易 NeoCRM）
   */
  public async renewToken(env: NeoEnvironment, currentTokenData?: TokenData): Promise<TokenData> {
    // 1. 纷享销客：客户端凭证模式直接重新获取 7200s 有效 Token
    if (env.productType === 'fxiaoke' || env.authMode === 'client_credentials' || env.permanentCode) {
      if (env.clientId && env.clientSecret && env.permanentCode) {
        return await this.loginWithFxiaoKeClientCredentials(env);
      }
      if (currentTokenData?.refresh_token) {
        return await this.refreshToken(env, currentTokenData.refresh_token);
      }
      throw new Error('纷享销客自动续期需要配置完整的 appId、appSecret 及 permanentCode 凭据');
    }

    // 2. Salesforce 续期 (支持 OAuth2 refresh_token 换新与本地 sf CLI 双向同步)
    if (env.productType === 'salesforce') {
      if (env.authMode === 'client_credentials' || (env.clientId && env.clientSecret && !currentTokenData?.refresh_token)) {
        return await this.loginWithSalesforceClientCredentials(env);
      }
      // 优先尝试使用 refresh_token 走云端 OAuth 续期
      if (currentTokenData?.refresh_token) {
        try {
          return await this.refreshToken(env, currentTokenData.refresh_token);
        } catch (rErr: any) {
          console.warn('[Salesforce] OAuth2 refresh_token 换新失败，自动回退至本地 sf CLI 刷新:', rErr.message);
        }
      }
      // 若无 refresh_token 或云端 OAuth 换新异常，自动回退走本地 sf CLI 静默换新
      try {
        return await this.refreshSalesforceTokenViaCli(env, currentTokenData, false);
      } catch (cliErr: any) {
        throw new Error(`Salesforce 自动续期未成功: ${cliErr.message}，请在连接器详情中重新登录`);
      }
    }

    // 3. 销售易 NeoCRM 续期
    if (currentTokenData?.refresh_token) {
      return await this.refreshToken(env, currentTokenData.refresh_token);
    }

    throw new Error('当前环境无可用续期凭据，请重新连接环境');
  }

  /**
   * 刷新 Access Token
   */
  public async refreshToken(env: NeoEnvironment, refreshTokenStr: string): Promise<TokenData> {
    if (env.productType === 'fxiaoke') {
      // 纷享销客客户端凭据模式下无 refresh_token 概念，续期即通过 appId + permanentCode 获取新 token
      if (env.clientId && env.clientSecret && env.permanentCode) {
        return await this.loginWithFxiaoKeClientCredentials(env);
      }
    }

    // ================= Salesforce 专属 OAuth2 令牌续期实现 =================
    if (env.productType === 'salesforce') {
      const tokenUrl = env.tokenURL || (env.neoBaseURL ? `${env.neoBaseURL.replace(/\/+$/, '')}/services/oauth2/token` : 'https://login.salesforce.com/services/oauth2/token');
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('client_id', env.clientId || '');
      if (env.clientSecret) {
        params.append('client_secret', env.clientSecret);
      }
      params.append('refresh_token', refreshTokenStr.trim());

      let res: any;
      try {
        res = await axios.post(tokenUrl, params.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 15000,
        });
      } catch (err: any) {
        const respData = err.response?.data;
        const errMsg = respData?.error_description || respData?.error || err.message;
        if (errMsg && (errMsg.includes('expired access/refresh token') || errMsg.includes('invalid_grant'))) {
          throw new Error('Salesforce 云端 Refresh Token 已失效 (invalid_grant)，请点击「重新登录」重新授权');
        }
        throw new Error(`Salesforce 令牌续期失败: ${errMsg}`);
      }

      const data = res.data;
      if (!data || !data.access_token) {
        throw new Error(`Salesforce 刷新未返回有效 access_token: ${JSON.stringify(data)}`);
      }

      const instanceUrl = data.instance_url || env.neoBaseURL;
      const rawOrgId = data.access_token ? data.access_token.split('!')[0] : 'salesforce_org';
      let userInfo: UserInfo = {
        userId: rawOrgId,
        name: 'Salesforce 用户',
        tenant_id: rawOrgId,
        tenantName: `Salesforce 组织 (${rawOrgId})`,
      };

      try {
        const userinfoEndpoint = `${instanceUrl.replace(/\/+$/, '')}/services/oauth2/userinfo`;
        const uRes = await axios.get(userinfoEndpoint, {
          headers: { Authorization: `Bearer ${data.access_token}` },
          timeout: 10000,
        });
        if (uRes.data) {
          const uData = uRes.data;
          const orgId = uData.organization_id || rawOrgId;
          const uname = uData.preferred_username || uData.name || 'Salesforce 用户';
          let orgName = `Salesforce (${orgId})`;
          if (uData.preferred_username && uData.preferred_username.includes('@')) {
            const domainPart = uData.preferred_username.split('@')[1];
            const companyName = domainPart.split('.')[0].toUpperCase();
            orgName = `${companyName} (${orgId})`;
          }
          userInfo = {
            userId: uData.user_id || rawOrgId,
            name: `${uData.name || '用户'} (${uname})`,
            tenant_id: orgId,
            tenantName: orgName,
            email: uData.email,
          };
        }
      } catch (err: any) {
        console.warn('获取 Salesforce userinfo 异常:', err.message);
      }

      const expiresIn = Number(data.expires_in || 7200);
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token || refreshTokenStr,
        expires_in: expiresIn,
        instance_uri: instanceUrl,
        tenant_id: userInfo.tenant_id,
        userInfo,
        savedAt: Date.now(),
        expiresAt: Date.now() + expiresIn * 1000,
      };
    }

    // ================= 销售易专属 OAuth2 令牌续期实现 =================
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('client_id', env.clientId || '04c8b45c4dbe36426a660bf70d3fe3e7');
    params.append('client_secret', env.clientSecret || '370817d1336a3737f95c671eea39a23b');
    params.append('refresh_token', refreshTokenStr);

    let res: any;
    try {
      res = await axios.post(env.tokenURL, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      });
    } catch (err: any) {
      const respData = err.response?.data;
      const errMsg = respData?.error_description || respData?.error || respData?.msg || err.message;
      throw new Error(`销售易令牌续期失败: ${errMsg}`);
    }

    const data = res.data;
    if (!data || !data.access_token) {
      throw new Error(`刷新 Token 失败: ${JSON.stringify(data)}`);
    }

    const effectiveBaseUrl = this.resolveEffectiveBaseUrl(env, data.instance_uri);
    const userInfo = await this.fetchUserInfo(effectiveBaseUrl, data.access_token);

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshTokenStr,
      expires_in: data.expires_in || 7200,
      instance_uri: data.instance_uri || env.neoBaseURL,
      tenant_id: data.tenant_id || userInfo?.tenant_id,
      userInfo,
      savedAt: Date.now(),
      expiresAt: Date.now() + (data.expires_in || 7200) * 1000,
    };
  }

  /**
   * 取消当前正在等待的登录请求
   */
  /**
   * 清理内嵌浏览器中残留的所有 Cookies 与缓存
   */
  public async clearBrowserSession() {
    try {
      await session.defaultSession.clearStorageData({
        storages: ["cookies", "localstorage", "sessionstorage", "cachestorage"],
      });
      await session.defaultSession.clearCache();
    } catch (e) {
      console.warn("清理浏览器 Session 异常:", e);
    }
  }

  public cancelActiveAuth() {
    if (this.activeServer) {
      try {
        (this.activeServer as any).closeAllConnections?.();
        this.activeServer.close();
      } catch {}
      this.activeServer = null;
    }
    if (this.embeddedAuthWindow && !this.embeddedAuthWindow.isDestroyed()) {
      try {
        this.embeddedAuthWindow.close();
      } catch {}
      this.embeddedAuthWindow = null;
    }
  }

  /**
   * 组装授权 URL
   */
  private buildAuthUrl(env: NeoEnvironment, redirectUri: string, codeChallenge?: string): string {
    if (env.productType === 'salesforce') {
      const searchParams = new URLSearchParams({
        response_type: 'code',
        client_id: env.clientId || '',
        redirect_uri: redirectUri,
      });
      // 关键修复：显式请求 'refresh_token api'，既不会触发 'full' 越权拦截，又能保证返回永久有效的 refresh_token 供后台静默自动续期
      const sfScope = env.scope && env.scope.trim() && env.scope !== 'all' && env.scope !== 'full refresh_token api'
        ? env.scope.trim()
        : 'refresh_token api';
      searchParams.append('scope', sfScope);

      if (codeChallenge) {
        searchParams.append('code_challenge', codeChallenge);
        searchParams.append('code_challenge_method', 'S256');
      }
      return `${env.loginURL}?${searchParams.toString()}`;
    }
    const searchParams = new URLSearchParams({
      response_type: 'code',
      client_id: env.clientId || '04c8b45c4dbe36426a660bf70d3fe3e7',
      redirect_uri: redirectUri,
      scope: env.scope || 'all',
      oauthType: env.oauthType || 'standard',
      access_type: env.accessType || 'offline',
    });
    if (codeChallenge) {
      searchParams.append('code_challenge', codeChallenge);
      searchParams.append('code_challenge_method', 'S256');
    }
    return `${env.loginURL}?${searchParams.toString()}`;
  }

  /**
   * 通过授权码向 tokenURL 换取 Token 并获取用户信息
   */
  private async fetchTokenByCode(env: NeoEnvironment, code: string, redirectUri: string, codeVerifier?: string): Promise<TokenData> {
    if (env.productType === 'fxiaoke') {
      const cloudDomain = env.cloudDomain?.trim() || (env.neoBaseURL ? new URL(env.neoBaseURL).host : 'open.fxiaoke.com');
      let tokenUrl = env.tokenURL?.trim();
      if (!tokenUrl || tokenUrl.includes('/cgi/') || tokenUrl.includes('/auc/') || tokenUrl.endsWith('/oauth2/token') || !tokenUrl.includes('/oauth2.0/token')) {
        tokenUrl = `https://${cloudDomain}/oauth2.0/token`;
      }
      const thirdTraceId = `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const payload = {
        grantType: 'authorization_code',
        appId: env.clientId,
        appSecret: env.clientSecret,
        code: code.trim(),
      };
      const res = await axios.post(`${tokenUrl}?thirdTraceId=${thirdTraceId}`, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });
      const data = res.data;
      if (data.errorCode !== 0 && data.errorCode !== '0') {
        throw new Error(`纷享销客换取令牌失败 (${data.errorCode}): ${data.errorMessage || JSON.stringify(data)}`);
      }
      const expiresIn = Number(data.expiresIn || 7200);
      return {
        access_token: data.accessToken,
        refresh_token: data.refreshToken,
        expires_in: expiresIn,
        instance_uri: `https://${cloudDomain}`,
        tenant_id: data.ea || data.openUserId,
        userInfo: {
          userId: data.openUserId,
          name: `纷享用户 (${data.openUserId})`,
          tenant_id: data.ea || data.openUserId,
          tenantName: `纷享销客企业 (${data.ea || ''})`,
          ea: data.ea,
        },
        savedAt: Date.now(),
        expiresAt: Date.now() + expiresIn * 1000,
      };
    }
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('client_id', env.clientId || '04c8b45c4dbe36426a660bf70d3fe3e7');
    params.append('client_secret', env.clientSecret || '370817d1336a3737f95c671eea39a23b');
    params.append('code', code);
    params.append('redirect_uri', redirectUri);
    if (codeVerifier) {
      params.append('code_verifier', codeVerifier);
    }

    const res = await axios.post(env.tokenURL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    });

    const data = res.data;
    if (!data || !data.access_token) {
      throw new Error(`响应中未包含 access_token: ${JSON.stringify(data)}`);
    }

    if (env.productType === 'salesforce') {
      const instanceUrl = data.instance_url || env.neoBaseURL;
      const rawOrgId = data.access_token ? data.access_token.split('!')[0] : 'salesforce_org';
      let userInfo: UserInfo = {
        userId: rawOrgId,
        name: 'Salesforce 用户',
        tenant_id: rawOrgId,
        tenantName: `Salesforce 组织 (${rawOrgId})`,
      };

      try {
        const userinfoEndpoint = `${instanceUrl.replace(/\/+$/, '')}/services/oauth2/userinfo`;
        const uRes = await axios.get(userinfoEndpoint, {
          headers: { Authorization: `Bearer ${data.access_token}` },
          timeout: 10000,
        });
        if (uRes.data) {
          const uData = uRes.data;
          const orgId = uData.organization_id || rawOrgId;
          const uname = uData.preferred_username || uData.name || 'Salesforce 用户';
          let orgName = `Salesforce (${orgId})`;
          if (uData.preferred_username && uData.preferred_username.includes('@')) {
            const domainPart = uData.preferred_username.split('@')[1];
            const companyName = domainPart.split('.')[0].toUpperCase();
            orgName = `${companyName} (${orgId})`;
          }
          userInfo = {
            userId: uData.user_id || rawOrgId,
            name: `${uData.name || '用户'} (${uname})`,
            tenant_id: orgId,
            tenantName: orgName,
            email: uData.email,
          };
        }
      } catch (err: any) {
        console.warn('获取 Salesforce userinfo 异常:', err.message);
      }

      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in || 7200,
        instance_uri: instanceUrl,
        tenant_id: userInfo.tenant_id,
        userInfo,
        savedAt: Date.now(),
        expiresAt: Date.now() + (data.expires_in || 7200) * 1000,
      };
    }

    const effectiveBaseUrl = this.resolveEffectiveBaseUrl(env, data.instance_uri);
    const userInfo = await this.fetchUserInfo(effectiveBaseUrl, data.access_token);

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in || 7200,
      instance_uri: data.instance_uri || env.neoBaseURL,
      tenant_id: data.tenant_id || userInfo?.tenant_id,
      userInfo,
      savedAt: Date.now(),
      expiresAt: Date.now() + (data.expires_in || 7200) * 1000,
    };
  }

  /**
   * 获取销售易用户信息 (UserInfo)
   */
  public async fetchUserInfo(baseUrl: string, accessToken: string): Promise<UserInfo> {
    let cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const userInfoApi = `${cleanBaseUrl}/rest/auc/v2.0/userInfo`;

    try {
      const res = await axios.get(userInfoApi, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'xsy-inner-source': 'bff',
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      if (res.data?.code && res.data.code !== '200' && res.data.code !== 200) {
        console.warn('获取用户信息异常响应:', res.data);
      }
      return res.data?.result || res.data?.data || {};
    } catch (e: any) {
      console.warn('获取用户信息失败(非致命):', e.message);
      return {};
    }
  }

  /**
   * 根据返回的 instance_uri 解析实际的根地址
   */
  /**
   * 独立唤起内嵌窗口访问实例后台以捕获/刷新 Web 管理员会话 Cookie (如 JSESSIONID)
   */
  public async captureWebSessionCookie(
    env: NeoEnvironment,
    tokenData: TokenData,
    parentWindow?: BrowserWindow
  ): Promise<{ cookieString: string; cookies: any[] }> {
    const authPartition = "neocrm_auth_session";
    const authSession = session.fromPartition(authPartition);
    const effectiveBaseUrl = this.resolveEffectiveBaseUrl(env, tokenData.instance_uri);
    let effectiveHost = "";
    try {
      effectiveHost = new URL(effectiveBaseUrl).hostname;
    } catch {}

    const targetUrl = `${effectiveBaseUrl}/admin/creekflow/autoflow-list.action`;

    return new Promise((resolve, reject) => {
      let isSettled = false;
      const win = new BrowserWindow({
        width: 980,
        height: 740,
        parent: process.platform === 'darwin' ? undefined : parentWindow,
        modal: false,
        title: `登录并捕获 Web 后台管理会话 Cookie - ${env.name}`,
        autoHideMenuBar: true,
        closable: true,
        minimizable: false,
        resizable: true,
        center: true,
        show: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          partition: authPartition,
        },
      });

      win.webContents.on('before-input-event', (_, input) => {
        if (input.key === 'Escape' && input.type === 'keyDown') {
          if (!isSettled) {
            isSettled = true;
            try { if (!win.isDestroyed()) win.close(); } catch {}
            reject(new Error("用户取消了 Cookie 捕获"));
          }
        }
      });

      win.webContents.on('console-message', (_, __, message) => {
        if (message === '__NEOCRM_CLOSE_COOKIE_WINDOW__') {
          if (!isSettled) {
            isSettled = true;
            try { if (!win.isDestroyed()) win.close(); } catch {}
            reject(new Error("用户取消了 Cookie 捕获"));
          }
        }
      });

      const finishCapture = async () => {
        if (isSettled) return;
        isSettled = true;
        try {
          const rawCookies = await authSession.cookies.get({});
          const cookies = rawCookies.map((c) => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path,
            secure: c.secure,
            httpOnly: c.httpOnly,
          }));
          const cookieMap = new Map<string, string>();
          for (const c of rawCookies) {
            if (c.path && c.path !== "/") continue;
            cookieMap.set(c.name, c.value);
          }
          const cookieString = Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
          if (!win.isDestroyed()) win.close();
          resolve({ cookieString, cookies });
        } catch (err: any) {
          if (!win.isDestroyed()) win.close();
          reject(new Error(`读取 Cookies 失败: ${err.message}`));
        }
      };

      const checkAndInjectStatus = async () => {
        if (isSettled || win.isDestroyed()) return;
        const curUrl = win.webContents.getURL();

        // 判断是否仍在登录页或 SSO 跳转途中
        const isLoginFlow =
          curUrl.includes("login-sandbox") ||
          curUrl.includes("login.xiaoshouyi") ||
          curUrl.includes("/login.action") ||
          curUrl.includes("/oauth2/auth") ||
          curUrl.includes("/neologin/");

        // 注入顶部状态引导条，允许用户随时点击完成捕获
        win.webContents
          .executeJavaScript(`
            (function() {
              if (document.getElementById("__neocrm_cookie_banner")) return;
              var bar = document.createElement("div");
              bar.id = "__neocrm_cookie_banner";
              bar.style.cssText = "position:fixed;top:0;left:0;right:0;height:38px;background:linear-gradient(90deg,#0d9488,#059669);color:#fff;z-index:2147483647;display:flex;align-items:center;justify-content:space-between;padding:0 16px;font-size:12px;font-family:sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.15);";
              bar.innerHTML = "<span>🔐 <b>NeoCRM 后台会话捕获模式</b>：请在下方完成账号登录，进入系统后台后将自动提取管理员 Cookie 并关闭窗口。</span><div style=\"display:flex;align-items:center;gap:8px;\"><button onclick=\"window.close()\" style=\"background:#fff;color:#0f766e;border:none;padding:5px 12px;border-radius:6px;font-weight:bold;cursor:pointer;font-size:12px;\">我已登录，立即提取并关闭</button><button onclick=\"console.log('__NEOCRM_CLOSE_COOKIE_WINDOW__');try{window.close();}catch(e){}\" style=\"background:rgba(255,255,255,0.2);color:#fff;border:1px solid rgba(255,255,255,0.4);padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px;\">✕ 关闭窗口 (Esc)</button></div>";
              document.body.appendChild(bar);
            })();
          `)
          .catch(() => {});

        if (!isLoginFlow && (effectiveHost ? curUrl.includes(effectiveHost) : curUrl.includes("/admin/"))) {
          try {
            const rawCookies = await authSession.cookies.get({});
            const hasAdminPassport = rawCookies.some(
              (c) =>
                (c.name === "x-ienterprise-passport" ||
                  c.name === "AUC_SESSION" ||
                  c.name === "JSESSIONID") &&
                c.value &&
                c.value.length > 5
            );
            if (hasAdminPassport) {
              setTimeout(finishCapture, 800);
            }
          } catch {}
        }
      };

      win.webContents.on("did-finish-load", checkAndInjectStatus);
      win.webContents.on("did-navigate", checkAndInjectStatus);

      win.on("closed", async () => {
        if (!isSettled) {
          isSettled = true;
          try {
            const rawCookies = await authSession.cookies.get({});
            const cookies = rawCookies.map((c) => ({
              name: c.name,
              value: c.value,
              domain: c.domain,
              path: c.path,
            }));
            const cookieMap = new Map<string, string>();
          for (const c of rawCookies) {
            if (c.path && c.path !== "/") continue;
            cookieMap.set(c.name, c.value);
          }
          const cookieString = Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
            resolve({ cookieString, cookies });
          } catch {
            reject(new Error("用户关闭了捕获窗口"));
          }
        }
      });

      win.loadURL(targetUrl).catch((err) => {
        if (!isSettled) {
          if (!win.isDestroyed()) win.close();
          reject(new Error(`无法打开后台页面: ${err.message}`));
        }
      });
    });
  }

  private resolveEffectiveBaseUrl(env: NeoEnvironment, instanceUri?: string): string {
    if (instanceUri && typeof instanceUri === 'string' && instanceUri.trim()) {
      try {
        return new URL(instanceUri.trim()).origin;
      } catch {
        return instanceUri.trim();
      }
    }
    return env.neoBaseURL;
  }
}
