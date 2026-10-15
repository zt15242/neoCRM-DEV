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

  /**
   * 纷享销客 OpenAPI v2 客户端凭证模式直连 (适用于自建应用无人工参与后台授权)
   * 参考: https://developer.fxiaoke.com/openapi_v2/start/auth/app-info.html
   */
  public async loginWithFxiaoKeClientCredentials(env: NeoEnvironment): Promise<TokenData> {
    const cloudDomain = env.cloudDomain?.trim() || (env.neoBaseURL ? new URL(env.neoBaseURL).host : 'open.fxiaoke.com');
    const tokenUrl = env.tokenURL || `https://${cloudDomain}/oauth2.0/token`;
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

  public async loginWithBrowser(env: NeoEnvironment): Promise<TokenData> {
    if (env.productType === 'fxiaoke' && (env.authMode === 'client_credentials' || env.permanentCode)) {
      return this.loginWithFxiaoKeClientCredentials(env);
    }
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
    if (env.productType === 'fxiaoke' && (env.authMode === 'client_credentials' || env.permanentCode)) {
      return this.loginWithFxiaoKeClientCredentials(env);
    }
    this.cancelActiveAuth();

    const redirectUri = env.redirectUri || "http://localhost:1028";
    const authUrl = this.buildAuthUrl(env, redirectUri);

    return new Promise<TokenData>((resolve, reject) => {
      let isSettled = false;

      const authPartition = "neocrm_auth_session";
      const authSession = session.fromPartition(authPartition);
      // 弹窗前清空此独立会话的所有历史 Cookies，避免自动用旧账号静默登录
      authSession.clearStorageData({
        storages: ["cookies", "sessionstorage", "localstorage"]
      }).catch(() => {});

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
          partition: authPartition,
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

              authWin.close();
              this.embeddedAuthWindow = null;
              try {
                const token = await this.fetchTokenByCode(env, code, redirectUri);
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
    if (env.productType === 'fxiaoke') {
      const cloudDomain = env.cloudDomain?.trim() || (env.neoBaseURL ? new URL(env.neoBaseURL).host : 'open.fxiaoke.com');
      const tokenUrl = env.tokenURL || `https://${cloudDomain}/oauth2.0/token`;
      const thirdTraceId = `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const payload = {
        grantType: 'refresh_token',
        appId: env.clientId,
        appSecret: env.clientSecret,
        refreshToken: refreshTokenStr.trim(),
      };
      const res = await axios.post(`${tokenUrl}?thirdTraceId=${thirdTraceId}`, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });
      const data = res.data;
      if (data.errorCode !== 0 && data.errorCode !== '0') {
        throw new Error(`纷享销客刷新令牌失败: ${data.errorMessage || JSON.stringify(data)}`);
      }
      const expiresIn = Number(data.expiresIn || 7200);
      return {
        access_token: data.accessToken,
        refresh_token: data.refreshToken || refreshTokenStr,
        expires_in: expiresIn,
        instance_uri: `https://${cloudDomain}`,
        tenant_id: data.ea || data.openUserId,
        savedAt: Date.now(),
        expiresAt: Date.now() + expiresIn * 1000,
      };
    }
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
    if (env.productType === 'fxiaoke') {
      const cloudDomain = env.cloudDomain?.trim() || (env.neoBaseURL ? new URL(env.neoBaseURL).host : 'open.fxiaoke.com');
      const tokenUrl = env.tokenURL || `https://${cloudDomain}/oauth2.0/token`;
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
        parent: parentWindow,
        modal: true,
        title: `登录并捕获 Web 后台管理会话 Cookie - ${env.name}`,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          partition: authPartition,
        },
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
              bar.innerHTML = "<span>🔐 <b>NeoCRM 后台会话捕获模式</b>：请在下方完成账号登录，进入系统后台后将自动提取管理员 Cookie 并关闭窗口。</span><button onclick=\"window.close()\" style=\"background:#fff;color:#0f766e;border:none;padding:4px 12px;border-radius:6px;font-weight:bold;cursor:pointer;font-size:12px;\">我已登录，立即提取并关闭</button>";
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
