import http from 'node:http';
import url from 'node:url';
import net from 'node:net';
import axios from 'axios';
import { BrowserWindow, shell, session } from 'electron';
import { NeoEnvironment, TokenData, UserInfo } from '../types';

export class AuthService {
  private activeServer: http.Server | null = null;
  private embeddedAuthWindow: BrowserWindow | null = null;

  /**
   * 检查指定端口是否已被占用
   */
  private async isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          resolve(true);
        } else {
          resolve(false);
        }
      });
      server.once('listening', () => {
        server.once('close', () => resolve(false));
        server.close();
      });
      server.listen(port);
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
  private getAuthSuccessHtml(tenantDesc: string, instanceUri: string): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>NeoCRM 客户端授权成功</title>
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
      border-radius: 16px;
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
      background: #e0f2fe;
      color: #0284c7;
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
      border-radius: 8px;
      padding: 14px;
      text-align: left;
      font-size: 13px;
      margin-bottom: 24px;
    }
    .info-row {
      display: flex;
      margin-bottom: 6px;
    }
    .info-row:last-child { margin-bottom: 0; }
    .label { color: #64748b; width: 80px; flex-shrink: 0; }
    .val { color: #0f172a; font-weight: 500; word-break: break-all; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h2>授权成功</h2>
    <p>您已成功登录销售易统一认证中心，凭据已安全回传至 NeoCRM 桌面客户端。您可以关闭此浏览器标签页。</p>
    <div class="info-box">
      <div class="info-row"><span class="label">当前租户:</span><span class="val">${tenantDesc}</span></div>
      <div class="info-row"><span class="label">实例地址:</span><span class="val">${instanceUri}</span></div>
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
  public async loginWithBrowser(env: NeoEnvironment): Promise<TokenData> {
    this.cancelActiveAuth();

    let targetPort = 1028;
    try {
      if (env.redirectUri) {
        const u = new URL(env.redirectUri);
        targetPort = parseInt(u.port, 10) || 1028;
      }
    } catch {}

    const port = await this.getAvailablePort(targetPort);
    const redirectUri = `http://localhost:${port}`;
    const authUrl = this.buildAuthUrl(env, redirectUri);

    return new Promise<TokenData>((resolve, reject) => {
      let isSettled = false;

      const server = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url || "", true);

        // 忽略 favicon 等非回调请求
        if (parsedUrl.pathname === "/favicon.ico") {
          res.writeHead(204);
          return res.end();
        }

        if (isSettled) {
          res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
          return res.end("OK");
        }

        const { code, error, error_description } = parsedUrl.query;

        if (error) {
          isSettled = true;
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(this.getAuthErrorHtml(String(error_description || error)));
          server.close();
          this.activeServer = null;
          return reject(new Error(`销售易授权返回错误: ${error_description || error}`));
        }

        if (code) {
          isSettled = true;
          try {
            // 仅在此处换取一次 Token (OAuth2 Code 只能单次消费)
            const tokenData = await this.fetchTokenByCode(env, String(code), redirectUri);
            const tenantDesc = tokenData.userInfo?.tenantName
              ? `${tokenData.userInfo.tenantName} (${tokenData.tenant_id})`
              : `${tokenData.tenant_id || "未返回"}`;
            const instanceUri = tokenData.instance_uri || env.neoBaseURL;

            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(this.getAuthSuccessHtml(tenantDesc, instanceUri));
            server.close();
            this.activeServer = null;
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

      server.listen(port, () => {
        this.activeServer = server;
        shell.openExternal(authUrl).catch((openErr) => {
          server.close();
          this.activeServer = null;
          reject(new Error(`无法唤起默认浏览器: ${openErr.message}`));
        });
      });

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
    this.cancelActiveAuth();

    const redirectUri = env.redirectUri || "http://localhost:1028";
    const authUrl = this.buildAuthUrl(env, redirectUri);

    return new Promise<TokenData>((resolve, reject) => {
      let isSettled = false;

      // 使用每次全新的独立内存分区 (不带 persist: 前缀)，确保不残留上次账号的 SSO Cookie
      const cleanPartition = `neocrm_auth_${Date.now()}`;

      const authWin = new BrowserWindow({
        width: 820,
        height: 740,
        parent: parentWindow,
        modal: true,
        title: `销售易登录 - ${env.name}`,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          partition: cleanPartition,
        },
      });

      this.embeddedAuthWindow = authWin;

      const checkUrl = async (targetUrl: string) => {
        if (isSettled) return;
        try {
          const u = new URL(targetUrl);
          if (targetUrl.startsWith(redirectUri) || u.hostname === "localhost" || u.hostname === "127.0.0.1") {
            const code = u.searchParams.get("code");
            const error = u.searchParams.get("error");

            if (error) {
              isSettled = true;
              authWin.close();
              this.embeddedAuthWindow = null;
              return reject(new Error(`授权被拒绝或出错: ${error}`));
            }

            if (code) {
              isSettled = true;
              authWin.close();
              this.embeddedAuthWindow = null;
              try {
                const token = await this.fetchTokenByCode(env, code, redirectUri);
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
        checkUrl(details.url);
        callback({});
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
   * 刷新 Access Token
   */
  public async refreshToken(env: NeoEnvironment, refreshTokenStr: string): Promise<TokenData> {
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('client_id', env.clientId || '04c8b45c4dbe36426a660bf70d3fe3e7');
    params.append('client_secret', env.clientSecret || '370817d1336a3737f95c671eea39a23b');
    params.append('refresh_token', refreshTokenStr);

    const res = await axios.post(env.tokenURL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    });

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
  private buildAuthUrl(env: NeoEnvironment, redirectUri: string): string {
    const searchParams = new URLSearchParams({
      response_type: 'code',
      client_id: env.clientId || '04c8b45c4dbe36426a660bf70d3fe3e7',
      redirect_uri: redirectUri,
      scope: env.scope || 'all',
      oauthType: env.oauthType || 'standard',
      access_type: env.accessType || 'offline',
    });
    return `${env.loginURL}?${searchParams.toString()}`;
  }

  /**
   * 通过授权码向 tokenURL 换取 Token 并获取用户信息
   */
  private async fetchTokenByCode(env: NeoEnvironment, code: string, redirectUri: string): Promise<TokenData> {
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('client_id', env.clientId || '04c8b45c4dbe36426a660bf70d3fe3e7');
    params.append('client_secret', env.clientSecret || '370817d1336a3737f95c671eea39a23b');
    params.append('code', code);
    params.append('redirect_uri', redirectUri);

    const res = await axios.post(env.tokenURL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    });

    const data = res.data;
    if (!data || !data.access_token) {
      throw new Error(`响应中未包含 access_token: ${JSON.stringify(data)}`);
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
