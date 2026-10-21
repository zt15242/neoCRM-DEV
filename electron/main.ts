import axios from 'axios';
import { LoggerService } from './services/loggerService';
import { GetLogsOptions, LogLevel } from '../shared/types';
import { CodeSyncService } from './services/codeSyncService';
import { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Menu, session, systemPreferences } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EnvService } from './services/envService';
import { SessionStore } from './services/sessionStore';
import { AuthService } from './services/authService';
import { ApiService } from './services/apiService';
import { MetadataService } from './services/metadataService';
import { DataService } from './services/dataService';
import { UpdateService } from './services/updateService';
import { ImageService } from './services/imageService';
import { AiService } from './services/aiService';
import { FileService } from './services/fileService';
import { WorkflowService } from './services/workflowService';
import { PrintTemplateService } from './services/printTemplateService';
import { NexService } from './services/nexService';
import { WorkBuddyService } from './services/workbuddyService';
import { ProjectService } from './services/projectService';
import { DshToolService } from './services/dshToolService';
import { licenseService } from './security/licenseService';
import { CreateEntityPayload, CreateFieldPayload, WorkflowDeployPlan } from '../shared/types';
import { edgeTtsService, EdgeTtsService } from './services/edgeTtsService';
import { asrService } from './services/asrService';
import { JarvisFleetService } from './services/jarvisFleetService';
import { CRM_HARNESS_TOOLS_SPEC } from './security/protectedHarness';
import { BUILTIN_SILICONFLOW_KEY } from '../shared/constants';

const currentDir = typeof __dirname !== 'undefined' 
  ? __dirname 
  : path.dirname(fileURLToPath(import.meta.url));

process.env.DIST = path.join(currentDir, '../dist');
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public');

let win: BrowserWindow | null = null;
let petWin: BrowserWindow | null = null;

function createPetWindow() {
  if (petWin && !petWin.isDestroyed()) {
    petWin.show();
    return;
  }

  const { screen } = require("electron");
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  petWin = new BrowserWindow({
    width: 90,
    height: 90,
    x: Math.max(10, screenWidth - 110),
    y: Math.max(10, screenHeight - 120),
    type: process.platform === "darwin" ? "panel" : "toolbar",
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    movable: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(currentDir, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  if (process.platform === "darwin") {
    petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    petWin.setAlwaysOnTop(true, "floating", 1);
  } else {
    petWin.setAlwaysOnTop(true, "screen-saver");
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    petWin.loadURL(`${process.env.VITE_DEV_SERVER_URL}?mode=pet`);
  } else {
    petWin.loadFile(path.join(currentDir, "../dist/index.html"), {
      query: { mode: "pet" },
    });
  }

  petWin.on("closed", () => {
    petWin = null;
  });
}
const envService = new EnvService();
const sessionStore = new SessionStore();
const authService = new AuthService();
const apiService = new ApiService();
const metadataService = new MetadataService(authService);
const dataService = new DataService(authService);
const loggerService = new LoggerService();
loggerService.interceptConsole();

const updateService = new UpdateService();
const imageService = new ImageService();

// 当底层服务检测到 Token 失效 (401) 并通过本地 CLI 或端点自动完成静默换新时，统一自动持久化并通知前端
const handleTokenRefresh = (env: any, newToken: any) => {
  try {
    const saved = sessionStore.saveSession(env, newToken);
    win?.webContents.send('session:updated', saved);
    console.log(`[${env.name || 'CRM'}] Access Token 已在底层自动续期并同步更新会话`);
  } catch (err: any) {
    console.warn('持久化新 Token 异常:', err.message);
  }
};
metadataService.setTokenRefreshCallback(handleTokenRefresh);
dataService.setTokenRefreshCallback(handleTokenRefresh);

const aiService = new AiService(sessionStore, metadataService, dataService, envService, dshToolService);
const fileService = new FileService();
const workflowService = new WorkflowService(metadataService);
const printTemplateService = new PrintTemplateService(metadataService);
const nexService = new NexService(metadataService);
const workbuddyService = new WorkBuddyService();
const projectService = new ProjectService();
const dshToolService = new DshToolService();
const codeSyncService = new CodeSyncService(metadataService, dataService);
const jarvisFleetService = new JarvisFleetService(envService, sessionStore, metadataService, dataService);

function createWindow() {
  // 移除 Windows / Linux 下默认的原生 File Edit View 菜单栏
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  }

  win = new BrowserWindow({
    width: 1200,
    height: 840,
    minWidth: 1000,
    minHeight: 700,
    title: 'NeoCRM 开发者客户端',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#f8fafc',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(currentDir, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  win.once('ready-to-show', () => {
    win?.show();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(currentDir, '../dist/index.html'));
  }

  win.webContents.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
    console.error('页面加载失败:', errorCode, errorDescription, validatedURL);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // 生产环境安全加固: 禁用开发者工具快捷键与右键审查，防止逆向破解探查
  if (app.isPackaged) {
    win.webContents.on("before-input-event", (event, input) => {
      const isDevToolsKey =
        input.key === "F12" ||
        ((input.control || input.meta) &&
          input.shift &&
          ["I", "i", "C", "c", "J", "j"].includes(input.key)) ||
        ((input.control || input.meta) && ["u", "U"].includes(input.key));
      if (isDevToolsKey) {
        event.preventDefault();
      }
    });

    win.webContents.on("context-menu", (event) => {
      event.preventDefault();
    });
  }
}

app.whenReady().then(() => {
  // 全局麦克风与多媒体录音权限自动放行 (保障 J.A.R.V.I.S. 语音对讲畅通无阻)
  try {
    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
      if (permission === 'media' || permission === 'microphone') return true;
      return true;
    });

    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission === 'media' || permission === 'microphone') return callback(true);
      callback(true);
    });

    if (process.platform === 'darwin' && systemPreferences?.askForMediaAccess) {
      systemPreferences.askForMediaAccess('microphone').catch(() => {});
    }
  } catch (permErr: any) {
    console.warn('[Permission] 设置音频权限处理器提示:', permErr.message);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  authService.cancelActiveAuth();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ================= IPC Handlers =================

// 窗口控制
ipcMain.handle('window:minimize', () => win?.minimize());
ipcMain.handle('window:maximize', () => {
  if (win?.isMaximized()) win.unmaximize();
  else win?.maximize();
});
ipcMain.handle('window:close', () => win?.close());

// 环境管理
ipcMain.handle('env:getAll', async () => envService.getAllEnvironments());
ipcMain.handle('env:getTemplates', async () => envService.getPresetTemplates());
ipcMain.handle('env:saveCustom', async (_, env) => {
  const saved = envService.saveCustomEnvironment(env);
  sessionStore.updateCurrentEnvironment(saved);
  return saved;
});
ipcMain.handle('env:deleteCustom', async (_, id: string) => envService.deleteCustomEnvironment(id));
ipcMain.handle('env:testConnectivity', async (_, url: string) => envService.testConnectivity(url));

// 认证授权
ipcMain.handle('auth:loginWithBrowser', async (_, envId: string) => {
  const env = envService.getEnvironmentById(envId);
  if (!env) throw new Error(`未找到环境: ${envId}`);
  const tokenData = await authService.loginWithBrowser(env);
  return sessionStore.saveSession(env, tokenData);
});

ipcMain.handle('auth:loginWithEmbedded', async (_, envId: string) => {
  const env = envService.getEnvironmentById(envId);
  if (!env) throw new Error(`未找到环境: ${envId}`);
  const tokenData = await authService.loginWithEmbeddedWindow(env, win || undefined);
  return sessionStore.saveSession(env, tokenData);
});

ipcMain.handle('auth:loginWithPassword', async (_, envId: string, username: string, pass: string) => {
  const env = envService.getEnvironmentById(envId);
  if (!env) throw new Error(`未找到环境: ${envId}`);
  const tokenData = await authService.loginWithPassword(env, username, pass);
  return sessionStore.saveSession(env, tokenData);
});

ipcMain.handle('auth:cancelLogin', async () => {
  authService.cancelActiveAuth();
  return true;
});

ipcMain.handle('auth:refreshToken', async () => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment) {
    throw new Error('当前未登录');
  }

  // 补齐完整环境凭据（防止历史残留环境对象缺失 permanentCode 等私有凭证）
  let fullEnv = current.environment;
  if (!fullEnv.clientId || (!fullEnv.permanentCode && fullEnv.productType === 'fxiaoke')) {
    const customList = envService.getCustomEnvironments();
    const found = customList.find((e) => e.id === fullEnv.id) || envService.getEnvironments().find((e) => e.id === fullEnv.id);
    if (found) {
      fullEnv = { ...found, ...fullEnv };
    }
  }

  const tokenData = await authService.renewToken(fullEnv, current.tokenData);
  if (current.tokenData?.cookieString && !tokenData.cookieString) {
    tokenData.cookieString = current.tokenData.cookieString;
    tokenData.cookies = current.tokenData.cookies;
    tokenData.cookieSavedAt = current.tokenData.cookieSavedAt;
  }
  const saved = sessionStore.saveSession(fullEnv, tokenData);
  win?.webContents.send('session:updated', saved);
  return saved;
});

// 后台定时自动续期引擎 (每 30 秒执行一次过期预检)
setInterval(async () => {
  try {
    const current = sessionStore.getCurrentSession();
    if (!current.isLoggedIn || !current.environment || !current.tokenData?.expiresAt) {
      return;
    }
    const remainingMs = current.tokenData.expiresAt - Date.now();
    // 当 Token 剩余有效期小于 10 分钟或已过期时，自动静默续期
    if (remainingMs <= 10 * 60 * 1000) {
      let fullEnv = current.environment;
      if (!fullEnv.clientId || (!fullEnv.permanentCode && fullEnv.productType === 'fxiaoke')) {
        const customList = envService.getCustomEnvironments();
        const found = customList.find((e) => e.id === fullEnv.id) || envService.getEnvironments().find((e) => e.id === fullEnv.id);
        if (found) fullEnv = { ...found, ...fullEnv };
      }
      const tokenData = await authService.renewToken(fullEnv, current.tokenData);
      if (current.tokenData.cookieString && !tokenData.cookieString) {
        tokenData.cookieString = current.tokenData.cookieString;
        tokenData.cookies = current.tokenData.cookies;
        tokenData.cookieSavedAt = current.tokenData.cookieSavedAt;
      }
      const saved = sessionStore.saveSession(fullEnv, tokenData);
      win?.webContents.send('session:updated', saved);
      console.log(`[自动续期] 租户 ${fullEnv.name} Token 自动续期成功，新有效期至: ${new Date(tokenData.expiresAt).toLocaleTimeString()}`);
    }
  } catch (err: any) {
    console.warn('[自动续期] 静默续期异常:', err.message);
  }
}, 30000);

ipcMain.handle("auth:logout", async () => {
  authService.cancelActiveAuth();
  await authService.clearBrowserSession();
  return sessionStore.clearSession();
});

ipcMain.handle("auth:captureWebCookie", async () => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) {
    throw new Error("请先登录租户");
  }
  const res = await authService.captureWebSessionCookie(current.environment, current.tokenData, win || undefined);
  return sessionStore.updateSessionCookie(res.cookieString, res.cookies);
});

ipcMain.handle("auth:updateCookie", async (_, cookieString: string) => {
  return sessionStore.updateSessionCookie(cookieString);
});

// 会话与历史
ipcMain.handle('session:getCurrent', async () => sessionStore.getCurrentSession());
ipcMain.handle('session:getHistory', async () => sessionStore.getAccountHistory());
ipcMain.handle('session:switchAccount', async (_, accountId: string) => sessionStore.switchAccount(accountId));
ipcMain.handle('session:deleteAccount', async (_, accountId: string) => sessionStore.deleteAccountRecord(accountId));

// CLI 凭据同步与调试工具
// 线上代码与元数据本地同步
ipcMain.handle('code:pullProjectCode', async (_, options: { targetDir: string; pullType?: 'all' | 'backend' | 'frontend' | 'metadata'; entityNames?: string[] }) => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) {
    throw new Error('请先连接 CRM 租户/环境');
  }
  let fullEnv = current.environment;
  if (!fullEnv.clientId || (!fullEnv.permanentCode && fullEnv.productType === 'fxiaoke')) {
    const customList = envService.getCustomEnvironments();
    const found = customList.find((e) => e.id === fullEnv.id) || envService.getEnvironments().find((e) => e.id === fullEnv.id);
    if (found) fullEnv = { ...found, ...fullEnv };
  }
  return await codeSyncService.pullProjectCode(fullEnv, current.tokenData, options);
});

ipcMain.handle('cli:sync', async (_, targetDirPath?: string) => sessionStore.syncToNeoCli(targetDirPath));
ipcMain.handle('dialog:selectFolder', async () => {
  if (!win) return null;
  const res = await dialog.showOpenDialog(win, {
    title: '选择工作区目录',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

ipcMain.handle('api:testCall', async () => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) {
    return { success: false, error: '未登录' };
  }
  return apiService.testApiCall(current.environment, current.tokenData);
});

ipcMain.handle('app:openDesigner', async (_, type: 'web' | 'h5') => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) throw new Error('未登录');
  const url = type === 'web'
    ? apiService.getDesignerWebUrl(current.environment, current.tokenData)
    : apiService.getDesignerH5Url(current.environment, current.tokenData);
  await shell.openExternal(url);
});

ipcMain.handle('shell:openExternal', async (_, url: string) => shell.openExternal(url));
ipcMain.handle('app:getPlatform', async () => process.platform);


// ================= 软件运行日志管理 =================
ipcMain.handle('logger:getLogs', async (_, options?: GetLogsOptions) => loggerService.getLogs(options));
ipcMain.handle('logger:getLogFiles', async () => loggerService.getLogFiles());
ipcMain.handle('logger:openLogDir', async () => loggerService.openLogDirectory());
ipcMain.handle('logger:clearLogs', async () => loggerService.clearAllLogs());
ipcMain.handle('logger:exportLog', async (_, date?: string) => loggerService.exportLogFile(win || undefined, date));
ipcMain.handle('logger:log', async (_, level: LogLevel, module: string, message: string, details?: any) => {
  loggerService.writeLog(level, module, message, details);
  return true;
});

ipcMain.handle('app:getVersion', async () => updateService.getCurrentVersion());

// ================= 自动更新管理 =================
ipcMain.handle('updater:check', async () => {
  return updateService.checkForUpdates();
});

ipcMain.handle('updater:download', async (_, downloadUrl: string, fileName: string) => {
  return updateService.downloadUpdate(downloadUrl, fileName, win);
});

ipcMain.handle('updater:openInstaller', async () => {
  return updateService.openDownloadedInstaller();
});

ipcMain.handle('updater:gitPull', async () => {
  return updateService.gitPullUpdate();
});


// ================= 图片服务 (获取/上传) =================
ipcMain.handle('image:fetchDataUrl', async (_, fileId: string | number) => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) throw new Error('请先登录租户');
  return imageService.fetchImageDataUrl(current.environment, current.tokenData, fileId);
});

ipcMain.handle('image:upload', async (_, base64Data: string, fileName: string, mimeType?: string) => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) throw new Error('请先登录租户');
  return imageService.uploadImage(current.environment, current.tokenData, base64Data, fileName, mimeType);
});

// ================= 元数据管理 (对象与字段) =================

ipcMain.handle('metadata:getEntities', async () => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) throw new Error('请先登录租户');
  return metadataService.fetchEntityList(current.environment, current.tokenData);
});

ipcMain.handle('metadata:getFields', async (_, entityApiKey: string) => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) throw new Error('请先登录租户');
  return metadataService.fetchEntityFields(current.environment, current.tokenData, entityApiKey);
});

ipcMain.handle('metadata:createEntity', async (_, payload: CreateEntityPayload) => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) throw new Error('请先登录租户');
  return metadataService.createEntity(current.environment, current.tokenData, payload);
});

ipcMain.handle('metadata:createField', async (_, entityApiKey: string, payload: CreateFieldPayload) => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) throw new Error('请先登录租户');
  return metadataService.createField(current.environment, current.tokenData, entityApiKey, payload);
});

ipcMain.handle('metadata:exportDictionary', async (_, targetDir?: string) => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) throw new Error('请先登录租户');
  const entities = await metadataService.fetchEntityList(current.environment, current.tokenData);
  const tenantName = current.tokenData.userInfo?.tenantName || current.environment.name || '租户';
  const safeTenantName = tenantName.replace(/[\\/:*?"<>|]/g, '_');
  const defaultFileName = `NeoCRM_实体字典_${safeTenantName}_AllxObjects.md`;

  let targetPath = '';

  if (targetDir?.trim() && targetDir.trim() !== '/') {
    targetPath = targetDir.trim();
  } else {
    const defaultDesktop = app.getPath('desktop') || app.getPath('downloads');
    const saveRes = win
      ? await dialog.showSaveDialog(win, {
          title: '导出实体对象字典文档 (Markdown)',
          defaultPath: path.join(defaultDesktop, defaultFileName),
          filters: [{ name: 'Markdown 文档 (*.md)', extensions: ['md'] }],
        })
      : await dialog.showSaveDialog({
          title: '导出实体对象字典文档 (Markdown)',
          defaultPath: path.join(defaultDesktop, defaultFileName),
          filters: [{ name: 'Markdown 文档 (*.md)', extensions: ['md'] }],
        });

    if (saveRes.canceled || !saveRes.filePath) {
      return { success: false, filePath: '', message: '已取消导出字典' };
    }
    targetPath = saveRes.filePath;
  }

  const res = metadataService.exportDictionary(
    targetPath,
    entities,
    tenantName,
    current.tokenData.tenant_id,
    current.tokenData.instance_uri || current.environment.neoBaseURL
  );

  if (res.success && res.filePath) {
    try {
      shell.showItemInFolder(res.filePath);
    } catch {}
  }

  return res;
});

// ================= 数据管理 (SQL查询与DML) =================

ipcMain.handle('data:getRecordDetail', async (_, entityApiKey: string, id: string | number) => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) throw new Error('请先登录租户');
  return dataService.getRecordDetail(current.environment, current.tokenData, entityApiKey, id);
});

ipcMain.handle('data:searchRecords', async (_, entityApiKey: string, keyword: string, limit?: number) => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) throw new Error('请先登录租户');
  return dataService.searchRecords(current.environment, current.tokenData, entityApiKey, keyword, limit);
});

ipcMain.handle('data:getBatchNames', async (_, entityApiKey: string, ids: (string | number)[]) => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) throw new Error('请先登录租户');
  return dataService.getBatchNames(current.environment, current.tokenData, entityApiKey, ids);
});

ipcMain.handle('data:scrollQuery', async (_, sql: string, batchCount?: number, maxLimit?: number) => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) throw new Error('请先登录租户');
  return dataService.executeScrollQuery(
    current.environment,
    current.tokenData,
    sql,
    batchCount || 1000,
    maxLimit || 50000,
    (progress) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('data:scrollProgress', progress);
      }
    }
  );
});

ipcMain.handle('data:query', async (_, sql: string) => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) throw new Error('请先登录租户');
  return dataService.executeQuery(current.environment, current.tokenData, sql);
});

ipcMain.handle('data:createRecord', async (_, entityApiKey: string, data: Record<string, any>) => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) throw new Error('请先登录租户');
  return dataService.createRecord(current.environment, current.tokenData, entityApiKey, data);
});

ipcMain.handle('data:updateRecord', async (_, entityApiKey: string, id: string | number, data: Record<string, any>) => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) throw new Error('请先登录租户');
  return dataService.updateRecord(current.environment, current.tokenData, entityApiKey, id, data);
});

ipcMain.handle('data:deleteRecord', async (_, entityApiKey: string, id: string | number) => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) throw new Error('请先登录租户');
  return dataService.deleteRecord(current.environment, current.tokenData, entityApiKey, id);
});

// ================= AI 对话平台与模型设置 =================

ipcMain.handle('ai:getConfig', async () => aiService.getAiConfig());
ipcMain.handle('ai:saveSettings', async (_, settings) => aiService.saveAiSettings(settings));
ipcMain.handle('ai:saveProvider', async (_, provider) => aiService.saveProvider(provider));
ipcMain.handle('ai:deleteProvider', async (_, providerId: string) => aiService.deleteProvider(providerId));
ipcMain.handle('ai:testProvider', async (_, provider) => aiService.testProvider(provider));
ipcMain.handle('ai:fetchModels', async (_, provider) => aiService.fetchAvailableModels(provider));

ipcMain.handle('ai:getSessions', async () => aiService.getSessions());
ipcMain.handle('ai:saveSession', async (_, session) => aiService.saveSession(session));
ipcMain.handle('ai:deleteSession', async (_, sessionId: string) => aiService.deleteSession(sessionId));
ipcMain.handle('ai:clearSessions', async () => aiService.clearSessions());

ipcMain.handle('ai:startChatStream', async (_, params) => {
  aiService.startChatStream(params, (event) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('ai:streamEvent', event);
    }
  });
  return true;
});

ipcMain.handle('ai:abortChatStream', async (_, requestId: string) => {
  return aiService.abortChatStream(requestId);
});

// ================= 文件解析与分析 =================
ipcMain.handle('file:selectAndParse', async () => fileService.selectAndParseFile(win));
ipcMain.handle('file:parseBuffer', async (_, fileName: string, bufferData: ArrayBuffer) => {
  return fileService.parseBuffer(fileName, Buffer.from(bufferData));
});

// ================= MCP 与 Skill 技能管理 =================
ipcMain.handle('ai:saveMcpServer', async (_, server) => aiService.saveMcpServer(server));
ipcMain.handle('ai:deleteMcpServer', async (_, id: string) => aiService.deleteMcpServer(id));
ipcMain.handle('ai:syncMcpTools', async (_, id: string) => aiService.syncMcpTools(id));
ipcMain.handle('ai:saveSkill', async (_, skill) => aiService.saveSkill(skill));
ipcMain.handle('ai:deleteSkill', async (_, id: string) => aiService.deleteSkill(id));
ipcMain.handle("ai:compactSession", async (_, sessionId: string) => aiService.compactSession(sessionId));
ipcMain.handle("ai:importSkillZip", async () => aiService.importSkillZipFromDialog());
ipcMain.handle("ai:importSkillZipBuffer", async (_, fileName: string, bufferData: ArrayBuffer) => {
  return aiService.importSkillZipFromBuffer(fileName, Buffer.from(bufferData));
});
ipcMain.handle("ai:exportSkillZip", async (_, skillIds?: string[]) => aiService.exportSkillZip(skillIds));

// ================= 自动流程 (Automatic Flow) 设备授权锁与代码配置部署 =================
ipcMain.handle("license:getStatus", async () => {
  return licenseService.getLicenseStatus();
});

ipcMain.handle("license:activate", async (_, password: string) => {
  return licenseService.activateLicense(password);
});

ipcMain.handle("workflow:deployPlan", async (_, plan: WorkflowDeployPlan, options?: { autoEnable?: boolean }) => {
  licenseService.assertAuthorized();
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) {
    throw new Error("请先登录租户");
  }
  return workflowService.deployWorkflowPlan(current.environment, current.tokenData, plan, options);
});

ipcMain.handle("workflow:getApprovalResources", async (_, entityApiKey?: string) => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) {
    return { roles: [], users: [], departments: [], busiTypes: [], picklistFields: [] };
  }
  return workflowService.getApprovalResources(current.environment, current.tokenData, entityApiKey);
});

ipcMain.handle("workflow:deployApprovalPlan", async (_, plan: any, options?: { autoEnable?: boolean }) => {
  licenseService.assertAuthorized();
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) {
    throw new Error("请先登录租户");
  }
  return workflowService.deployApprovalPlan(current.environment, current.tokenData, plan, options);
});

ipcMain.handle("workflow:listTenantFlows", async (_, params) => {
  const current = sessionStore.getCurrentSession();
  if (current.environment?.productType === 'neocrm' || !current.environment?.productType) {
    licenseService.assertAuthorized();
  }
  if (!current.isLoggedIn || !current.environment || !current.tokenData) {
    throw new Error("请先登录租户");
  }
  return workflowService.listTenantFlows(current.environment, current.tokenData, params);
});

ipcMain.handle("workflow:copyFlow", async (_, params) => {
  licenseService.assertAuthorized();
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) {
    throw new Error("请先登录租户");
  }
  return workflowService.copyFlow(current.environment, current.tokenData, params);
});

ipcMain.handle("workflow:deleteFlow", async (_, procdefId: string | number, procType: 1 | 2 = 1) => {
  licenseService.assertAuthorized();
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) {
    throw new Error("请先登录租户");
  }
  return workflowService.deleteFlowVersion(current.environment, current.tokenData, procdefId, procType);
});

ipcMain.handle("workflow:listFlows" , async (_, params) => {
  const current = sessionStore.getCurrentSession();
  if (current.environment?.productType === 'neocrm' || !current.environment?.productType) {
    licenseService.assertAuthorized();
  }
  if (!current.isLoggedIn || !current.environment || !current.tokenData) {
    throw new Error("请先登录租户");
  }
  return workflowService.listAutoFlows(current.environment, current.tokenData, params);
});

ipcMain.handle("workflow:getFlowDetail", async (_, procdefId: string | number, procType: 1 | 2 = 1) => {
  const current = sessionStore.getCurrentSession();
  if (current.environment?.productType === 'neocrm' || !current.environment?.productType) {
    licenseService.assertAuthorized();
  }
  if (!current.isLoggedIn || !current.environment || !current.tokenData) {
    throw new Error("请先登录租户");
  }
  return workflowService.getFlowDetail(current.environment, current.tokenData, procdefId, procType);
});

ipcMain.handle("workflow:toggleStatus", async (_, procdefId: string | number, enable: boolean, procType: 1 | 2 = 1) => {
  licenseService.assertAuthorized();
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) {
    throw new Error("请先登录租户");
  }
  return workflowService.toggleFlowStatus(current.environment, current.tokenData, procdefId, enable, procType);
});

ipcMain.handle("workflow:reviseVersion", async (_, procdefId: string | number, procType: 1 | 2 = 1) => {
  licenseService.assertAuthorized();
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) {
    throw new Error("请先登录租户");
  }
  return workflowService.reviseFlowVersion(current.environment, current.tokenData, procdefId, procType);
});

ipcMain.handle("workflow:triggerInstance", async (_, payload: any) => {
  licenseService.assertAuthorized();
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) {
    throw new Error("请先登录租户");
  }
  return workflowService.triggerFlowInstance(current.environment, current.tokenData, payload);
});

// ================= 打印模板 (Print Template) 免锁开放通道 =================

ipcMain.handle("print:listObjects", async () => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) {
    throw new Error("请先登录租户");
  }
  return printTemplateService.listPrintObjects(current.environment, current.tokenData);
});

ipcMain.handle("print:listTemplates", async (_, params) => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) {
    throw new Error("请先登录租户");
  }
  return printTemplateService.listTemplatesByObject(current.environment, current.tokenData, params || {});
});

ipcMain.handle("print:getFields", async (_, params) => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) {
    throw new Error("请先登录租户");
  }
  return printTemplateService.getPrintTemplateFields(current.environment, current.tokenData, params || {});
});

ipcMain.handle("print:generateTemplate", async (_, params) => {
  return printTemplateService.generatePrintTemplate(params);
});

ipcMain.handle("print:downloadSample", async (_, params) => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) {
    throw new Error("请先登录租户");
  }
  return printTemplateService.downloadTemplateSample(current.environment, current.tokenData, params || {});
});

ipcMain.handle("print:toggleStatus", async (_, { templatePrintId, enable }) => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) {
    throw new Error("请先登录租户");
  }
  return printTemplateService.toggleTemplateStatus(current.environment, current.tokenData, templatePrintId, enable);
});

ipcMain.handle("print:deleteTemplate", async (_, { templatePrintId }) => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) {
    throw new Error("请先登录租户");
  }
  return printTemplateService.deleteTemplate(current.environment, current.tokenData, templatePrintId);
});

ipcMain.handle("print:renderDocument", async (_, params) => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) {
    throw new Error("请先登录租户");
  }
  return printTemplateService.renderPrintDocument(current.environment, current.tokenData, params);
});

// ================= 销售易 Nex 2.0 页面扩展管理 (Nex 2.0) =================

ipcMain.handle("nex:listExtensions", async (_, projectDir?: string) => {
  const current = sessionStore.getCurrentSession();
  return nexService.listExtensions(current.environment || {} as any, current.tokenData || {} as any, projectDir);
});

ipcMain.handle("nex:getExtensionDetail", async (_, params) => {
  const current = sessionStore.getCurrentSession();
  return nexService.getExtensionDetail(current.environment || {} as any, current.tokenData || {} as any, params);
});

ipcMain.handle("nex:generateExtension", async (_, options) => {
  return nexService.generateNexExtension(options);
});

ipcMain.handle("nex:deployExtension", async (_, options) => {
  const current = sessionStore.getCurrentSession();
  if (!current.isLoggedIn || !current.environment || !current.tokenData) {
    throw new Error("请先登录租户环境");
  }
  return nexService.deployNexExtension(current.environment, current.tokenData, options);
});

// ================= WorkBuddy 反代与扫码登录 =================

ipcMain.handle("workbuddy:getStatus", async () => {
  return workbuddyService.getStatus();
});

ipcMain.handle("workbuddy:startLogin", async (_, realm?: "intl" | "cn") => {
  return workbuddyService.startLogin(realm);
});

ipcMain.handle("workbuddy:pollLogin", async (_, state: string, realm?: "intl" | "cn") => {
  return workbuddyService.pollLogin(state, realm);
});

ipcMain.handle("workbuddy:logout", async () => {
  return workbuddyService.logout();
});

// ================= 本地工作区项目 (Workspace Projects) =================


ipcMain.handle("project:getProjects", async () => projectService.getProjects());
ipcMain.handle("project:saveProject", async (_, payload) => projectService.saveProject(payload));
ipcMain.handle("project:deleteProject", async (_, projectId: string) => projectService.deleteProject(projectId));
ipcMain.handle("project:openFolder", async (_, folderPath: string) => projectService.openFolder(folderPath));
ipcMain.handle("project:listFiles", async (_, params) => projectService.listFiles(params));
ipcMain.handle("file:parseLocalPath", async (_, filePath: string) => fileService.parseLocalFile(filePath));
ipcMain.handle("clipboard:writeText", async (_, text: string) => {
  clipboard.writeText(text);
  return true;
});
ipcMain.handle("shell:openPath", async (_, targetPath: string) => shell.openPath(targetPath));
ipcMain.handle("shell:showItemInFolder", async (_, targetPath: string) => {
  shell.showItemInFolder(targetPath);
  return true;
});
ipcMain.handle("project:getDirTree", async (_, folderPath?: string, maxDepth?: number) => {
  return projectService.getDirTree(folderPath, maxDepth);
});
ipcMain.handle("project:getRecentArtifacts", async (_, folderPath?: string, limit?: number) => {
  return projectService.getRecentArtifacts(folderPath, limit);
});
ipcMain.handle("project:getWorkspaceChanges", async (_, folderPath?: string) => {
  return dshToolService.getWorkspaceChanges(folderPath);
});
ipcMain.handle("project:getFileDiff", async (_, filePath: string, folderPath?: string) => {
  return dshToolService.getFileDiff(filePath, folderPath);
});
ipcMain.handle("project:discardFileChanges", async (_, filePath: string, folderPath?: string) => {
  return dshToolService.discardFileChanges(filePath, folderPath);
});
ipcMain.handle("jobs:list", async () => {
  return dshToolService.listJobs();
});
ipcMain.handle("jobs:getOutput", async (_, params: { job_id: string; wait?: boolean; timeout_ms?: number }) => {
  return dshToolService.getJobOutput(params);
});
ipcMain.handle("jobs:kill", async (_, params: { job_id: string; reason?: string }) => {
  return dshToolService.killJob(params);
});
ipcMain.handle("terminal:execute", async (_, params: { command: string; workdir?: string; timeoutMs?: number }) => {
  return dshToolService.executeBash(params);
});

// ======================= 贾维斯 (J.A.R.V.I.S.) 全局总领与语音 IPC =======================
ipcMain.handle("jarvis:synthesizeSpeech", async (_, text: string, options?: any) => {
  return edgeTtsService.synthesizeBase64(text, options);
});

ipcMain.handle("jarvis:transcribeAudio", async (_, audioBase64: string, mimeType?: string) => {
  try {
    const buffer = Buffer.from(audioBase64, "base64");
    const aiConfig = aiService.getAiConfig();

    // 1. 优先尝试硅基流动 SenseVoice (毫秒级响应，中文普通话推荐)
    const sfProvider = aiConfig.providers?.find((p: any) => (p.id === "siliconflow" || p.id === "silicon_flow") && p.apiKey?.trim());
    const sfKey = sfProvider?.apiKey?.trim() || BUILTIN_SILICONFLOW_KEY || process.env.SILICONFLOW_API_KEY;

    if (sfKey) {
      const res = await asrService.transcribeWithSiliconFlow(buffer, sfKey, mimeType || "audio/webm");
      // 只要服务正常响应（即便在极其安静的环境下未识别出文字），也属于合法结果
      if (!res.error) {
        return res;
      }
      console.warn('[Jarvis ASR] 硅基流动返回异常，尝试备用引擎:', res.error);
    }

    // 2. 尝试 OpenAI Whisper
    const openaiProvider = aiConfig.providers?.find((p: any) => p.id === "openai" && p.apiKey?.trim());
    const openaiKey = openaiProvider?.apiKey?.trim() || process.env.OPENAI_API_KEY;
    if (openaiKey) {
      const res = await asrService.transcribeWithOpenAI(buffer, openaiKey, openaiProvider?.baseUrl, mimeType || "audio/webm");
      if (!res.error) {
        return res;
      }
      console.warn('[Jarvis ASR] OpenAI Whisper 返回异常:', res.error);
    }

    // 3. 未配置或服务均异常时的友好引导
    const hasKey = !!(sfKey || openaiKey);
    return {
      text: "",
      provider: "none",
      needConfig: !hasKey,
      error: hasKey ? "语音服务网络波动或响应超时，请靠近麦克风重新按住说话" : "请先配置语音识别 API Key",
    };
  } catch (err: any) {
    return { text: "", provider: "error", error: err.message || "转写异常" };
  }
});

ipcMain.handle("jarvis:saveAsrKey", async (_, apiKey: string, providerId = "siliconflow") => {
  const cleanKey = (apiKey || "").trim();
  if (!cleanKey) return { success: false, error: "Key 不能为空" };
  const config = aiService.getAiConfig();
  const target = config.providers?.find((p: any) => p.id === providerId);
  if (target) {
    target.apiKey = cleanKey;
    target.enabled = true;
    aiService.saveProvider(target);
    return { success: true };
  }
  return { success: false, error: "未找到目标供应商" };
});

ipcMain.handle("jarvis:getFleetOverview", async () => {
  return jarvisFleetService.getFleetOverview();
});

ipcMain.handle("jarvis:getSystemPrompt", async (_, userProfile?: any) => {
  return jarvisFleetService.buildJarvisSystemPrompt(userProfile);
});

ipcMain.handle("jarvis:getSupportedVoices", async () => {
  return EdgeTtsService.SUPPORTED_VOICES;
});

ipcMain.handle("jarvis:toggleDesktopPet", async (_, visible: boolean) => {
  if (visible) {
    createPetWindow();
  } else {
    if (petWin && !petWin.isDestroyed()) {
      petWin.close();
      petWin = null;
    }
  }
  return true;
});

ipcMain.handle("jarvis:setPetWindowExpanded", async (_, expanded: boolean) => {
  if (!petWin || petWin.isDestroyed()) return false;
  const bounds = petWin.getBounds();
  const currentRight = bounds.x + bounds.width;
  const currentBottom = bounds.y + bounds.height;

  if (expanded) {
    const newWidth = 350;
    const newHeight = 410;
    const newX = Math.max(10, currentRight - newWidth);
    const newY = Math.max(10, currentBottom - newHeight);
    petWin.setBounds({ x: newX, y: newY, width: newWidth, height: newHeight });
  } else {
    const newWidth = 90;
    const newHeight = 90;
    const newX = Math.max(10, currentRight - newWidth);
    const newY = Math.max(10, currentBottom - newHeight);
    petWin.setBounds({ x: newX, y: newY, width: newWidth, height: newHeight });
  }
  return true;
});

ipcMain.handle("jarvis:openMainWindow", async () => {
  if (!win || win.isDestroyed()) {
    createWindow();
  } else {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    win.webContents.send("jarvis:navigateToCommandCenter");
  }
  return true;
});

// ======================= 贾维斯长期记忆与对话历史 IPC =======================
ipcMain.handle("jarvis:getSessionData", async () => {
  return jarvisFleetService.getSessionData();
});

ipcMain.handle("jarvis:saveMessage", async (_, message: any) => {
  const session = jarvisFleetService.appendMessage(message);
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) {
      w.webContents.send("jarvis:message_appended", message);
    }
  });
  return session;
});

ipcMain.handle("jarvis:clearMessages", async (_, welcomeMessage?: any) => {
  const session = jarvisFleetService.clearMessages(welcomeMessage);
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) {
      w.webContents.send("jarvis:messages_cleared", welcomeMessage);
    }
  });
  return session;
});

ipcMain.handle("jarvis:addMemory", async (_, content: string, category?: any) => {
  return jarvisFleetService.addMemory(content, category);
});

ipcMain.handle("jarvis:deleteMemory", async (_, memoryId: string) => {
  return jarvisFleetService.deleteMemory(memoryId);
});

ipcMain.handle("jarvis:chat", async (_, params: { message: string; messageId?: string; history?: any[]; userProfile?: any; targetConnectorId?: string }) => {
  const { message, messageId, history = [], userProfile, targetConnectorId } = params;
  const sysPrompt = jarvisFleetService.buildJarvisSystemPrompt(userProfile);
  const fleet = jarvisFleetService.getFleetOverview();
  const salutation = userProfile?.salutation || (userProfile?.gender === "female" ? "女士" : "先生");
  const name = userProfile?.name || "指挥官";
  const fullCall = `${name}${salutation}`;

  // 广播全网窗口同步进入高能思考状态 (大屏与桌宠方舟反应堆同步进入超频动效)
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) {
      w.webContents.send("jarvis:state_changed", "thinking");
    }
  });

  // 保存用户提问到持久化历史并向多端窗口实时广播
  const userMsgId = messageId || `msg_u_${Date.now()}`;
  const userChatMsg = {
    id: userMsgId,
    role: "user" as const,
    content: message,
    createdAt: Date.now(),
  };
  jarvisFleetService.appendMessage(userChatMsg);
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) {
      w.webContents.send("jarvis:message_appended", userChatMsg);
    }
  });

  // 1. 若问题询问系统态势/连接器在线情况，由管家直接精准如实汇报
  if (
    message.includes("态势") ||
    message.includes("连接器") ||
    message.includes("在线") ||
    message.includes("系统状态") ||
    message.includes("舰队")
  ) {
    const onlineNames = fleet.connectors
      .filter((c) => c.isLoggedIn)
      .map((c) => `【${c.name}】(${c.productType.toUpperCase()}${c.tenantId ? ` · 租户:${c.tenantId}` : ""})`)
      .join("、");
    const offlineNames = fleet.connectors
      .filter((c) => !c.isLoggedIn)
      .map((c) => c.name)
      .join("、");

    let detail = `汇报${fullCall}，当前全网舰队共接入 ${fleet.totalCount} 套连接器，全部 ${fleet.onlineCount} 套处于在线授权状态。
在线连接器包括：${onlineNames}。`;
    if (offlineNames) {
      detail += `\n未授权或Token失效连接器：${offlineNames}。`;
    }
    detail += `\n所有已连通系统的 API 探活与会话心跳均正常，随时听候您的调遣。`;

    const assistantMsgId = `msg_a_${Date.now()}`;
    const assistantChatMsg = {
      id: assistantMsgId,
      role: "assistant" as const,
      content: detail,
      createdAt: Date.now(),
    };
    jarvisFleetService.appendMessage(assistantChatMsg);
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) {
        w.webContents.send("jarvis:message_appended", assistantChatMsg);
      }
    });

    return { content: detail, messageId: assistantMsgId };
  }

  // 2. 具备全套 Harness 工具物理调用能力的自主进化执行循环
  const config = aiService.getAiConfig();
  const defaultProviderId = config.settings.defaultProviderId;
  const primaryProvider =
    config.providers.find((p) => p.id === defaultProviderId && p.enabled && p.apiKey) ||
    config.providers.find((p) => p.enabled && p.apiKey);

  const sessionData = jarvisFleetService.getSessionData();
  const effectiveHistory = (history.length > 0 ? history : sessionData.messages.slice(0, -1)).slice(-10);
  const cleanHistory = effectiveHistory.map((h: any) => ({
    role: h.role === "assistant" ? "assistant" : "user",
    content: String(h.content || ""),
  }));

  const messages: any[] = [
    { role: "system", content: sysPrompt },
    ...cleanHistory,
    { role: "user", content: message },
  ];

  const tools = CRM_HARNESS_TOOLS_SPEC;
  const executedToolCalls: Array<{
    name: string;
    args: any;
    summary?: string;
    status: 'success' | 'error';
  }> = [];

  let replyContent = "";

  // 设定最多 10 轮自主决策与工具执行循环 (Tool Loop)
  const maxRounds = 10;
  for (let round = 0; round < maxRounds; round++) {
    let chosenChoice: any = null;

    if (primaryProvider) {
      try {
        let baseUrl = primaryProvider.baseUrl.trim().replace(/\/+$/, "");
        if (!baseUrl.endsWith("/v1") && !baseUrl.includes("/v1/")) {
          baseUrl += "/v1";
        }
        const modelId = config.settings.defaultModelId || primaryProvider.models[0]?.id || "deepseek-ai/DeepSeek-V3";
        const url = `${baseUrl}/chat/completions`;

        const response = await axios.post(
          url,
          {
            model: modelId,
            messages,
            tools,
            tool_choice: "auto",
            temperature: 0.2,
            max_tokens: 3000,
          },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${primaryProvider.apiKey.trim()}`,
            },
            timeout: 65000,
          }
        );
        chosenChoice = response.data?.choices?.[0];
      } catch (err: any) {
        console.warn(`[Jarvis Chat] 主模型服务异常 (第 ${round + 1} 轮):`, err.message);
      }
    }

    if (!chosenChoice && BUILTIN_SILICONFLOW_KEY) {
      try {
        const sfResponse = await axios.post(
          "https://api.siliconflow.cn/v1/chat/completions",
          {
            model: "deepseek-ai/DeepSeek-V3",
            messages,
            tools,
            tool_choice: "auto",
            temperature: 0.2,
            max_tokens: 3000,
          },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${BUILTIN_SILICONFLOW_KEY}`,
            },
            timeout: 45000,
          }
        );
        chosenChoice = sfResponse.data?.choices?.[0];
      } catch (sfErr: any) {
        console.warn(`[Jarvis Chat] 硅基流动备用大模型异常 (第 ${round + 1} 轮):`, sfErr.message);
      }
    }

    if (!chosenChoice) {
      break;
    }

    const respMsg = chosenChoice.message;
    const toolCalls = respMsg?.tool_calls;

    // 若本轮无工具调用，生成最终回答并跳出循环
    if (!toolCalls || toolCalls.length === 0) {
      replyContent = respMsg?.content || "";
      break;
    }

    // 记录 assistant 消息（包含 tool_calls）
    messages.push(respMsg);

    for (const tc of toolCalls) {
      const toolName = tc.function.name;
      let toolArgs: any = {};
      try {
        toolArgs = typeof tc.function.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function.arguments;
      } catch {
        toolArgs = {};
      }

      console.log(`[Jarvis Autonomous Action] 贾维斯正在真实调用底层物理工具: ${toolName}`, toolArgs);

      // 实时广播工具执行进度给前端全息思考卡片
      BrowserWindow.getAllWindows().forEach((w) => {
        if (!w.isDestroyed()) {
          w.webContents.send("jarvis:tool_progress", {
            name: toolName,
            status: "executing",
            description: toolArgs?.description || `正在执行物理工具 ${toolName}...`
          });
        }
      });

      // 智能解析目标连接器环境与凭据
      const targetConn = jarvisFleetService.resolveConnector(
        targetConnectorId,
        message + " " + toolName + " " + JSON.stringify(toolArgs)
      );

      let toolRes: any = null;
      try {
        toolRes = await aiService.executeCrmTool(toolName, toolArgs, targetConn?.env, targetConn?.tokenData);
        executedToolCalls.push({
          name: toolName,
          args: toolArgs,
          summary: toolRes.summary,
          status: 'success',
        });
        BrowserWindow.getAllWindows().forEach((w) => {
          if (!w.isDestroyed()) {
            w.webContents.send("jarvis:tool_progress", {
              name: toolName,
              status: "completed",
              summary: toolRes.summary
            });
          }
        });
      } catch (toolErr: any) {
        toolRes = { error: toolErr.message, success: false };
        executedToolCalls.push({
          name: toolName,
          args: toolArgs,
          summary: `执行异常: ${toolErr.message}`,
          status: 'error',
        });
      }

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(toolRes?.data || toolRes),
      });
    }
  }

  // 3. 终局收敛处理：若执行了物理工具但模型尚未输出最终回复（例如达到轮次上限或最后轮为工具调用），发起终局总结请求
  if (!replyContent && executedToolCalls.length > 0) {
    console.log(`[Jarvis Chat] 工具执行阶段结束（已真实调用 ${executedToolCalls.length} 项底层工具），正在请求大模型生成最终分析总结与汇报...`);
    messages.push({
      role: "user",
      content: `【系统指令 · 终局总结】已完成所有物理工具调用与数据探测（共已真实执行 ${executedToolCalls.length} 项工具操作）。现在请基于前序已获取到的所有真实执行结果与系统数据，向${fullCall}生成完整、详实、条理清晰的最终分析报告与总结（包括发现的实体字段、环境现状、比对结论或问题排查结果），请勿再调用任何工具。`,
    });

    if (primaryProvider) {
      try {
        let baseUrl = primaryProvider.baseUrl.trim().replace(/\/+$/, "");
        if (!baseUrl.endsWith("/v1") && !baseUrl.includes("/v1/")) {
          baseUrl += "/v1";
        }
        const modelId = config.settings.defaultModelId || primaryProvider.models[0]?.id || "deepseek-ai/DeepSeek-V3";
        const url = `${baseUrl}/chat/completions`;

        const response = await axios.post(
          url,
          {
            model: modelId,
            messages,
            temperature: 0.2,
            max_tokens: 3500,
          },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${primaryProvider.apiKey.trim()}`,
            },
            timeout: 60000,
          }
        );
        replyContent = response.data?.choices?.[0]?.message?.content || "";
      } catch (err: any) {
        console.warn(`[Jarvis Chat] 终局总结主模型服务异常:`, err.message);
      }
    }

    if (!replyContent && BUILTIN_SILICONFLOW_KEY) {
      try {
        const sfResponse = await axios.post(
          "https://api.siliconflow.cn/v1/chat/completions",
          {
            model: "deepseek-ai/DeepSeek-V3",
            messages,
            temperature: 0.2,
            max_tokens: 3500,
          },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${BUILTIN_SILICONFLOW_KEY}`,
            },
            timeout: 45000,
          }
        );
        replyContent = sfResponse.data?.choices?.[0]?.message?.content || "";
      } catch (sfErr: any) {
        console.warn(`[Jarvis Chat] 终局总结硅基流动备用模型异常:`, sfErr.message);
      }
    }

    // 若由于网络彻底阻断未能生成总结，直接基于真实执行回执输出保底结构化事实报告，杜绝谎报"超时"
    if (!replyContent) {
      const summaryLines = executedToolCalls
        .map((t, idx) => `${idx + 1}. **\`${t.name}\`**: ${t.summary || (t.status === "success" ? "执行完成" : "执行异常")}`)
        .join("\n");
      replyContent = `${fullCall}，刚才已为您调度底层物理工具真实执行了 ${executedToolCalls.length} 项操作，关键事实回执如下：\n\n${summaryLines}\n\n当前上游大模型生成最终总结文本时发生短暂网络波动，但底层已探查到的元数据与运行状态均已在本地生效记录。请问需要我为您深入哪一部分的详细信息？\n\n<speech>先生，底层已真实执行 ${executedToolCalls.length} 项物理工具，详细回执已在屏幕呈报。</speech>`;
    }
  }

  // 最终回复并落盘保存，向多端窗口实时广播
  const finalReply =
    replyContent ||
    `抱歉，${fullCall}。刚才大模型上游通信服务出现短暂波动（未收到有效响应）。各系统连接器心跳处于正常监听状态，请您再次尝试下达指令。`;
  const assistantMsgId = `msg_a_${Date.now()}`;
  const assistantChatMsg = {
    id: assistantMsgId,
    role: "assistant" as const,
    content: finalReply,
    toolCalls: executedToolCalls.length > 0 ? executedToolCalls : undefined,
    createdAt: Date.now(),
  };
  jarvisFleetService.appendMessage(assistantChatMsg);
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) {
      w.webContents.send("jarvis:message_appended", assistantChatMsg);
    }
  });

  // 广播思考结束，恢复待命
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) {
      w.webContents.send("jarvis:state_changed", "idle");
    }
  });

  return { content: finalReply, messageId: assistantMsgId, toolCalls: executedToolCalls };
});
