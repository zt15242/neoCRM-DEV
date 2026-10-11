import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
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
import { CreateEntityPayload, CreateFieldPayload } from '../shared/types';

const currentDir = typeof __dirname !== 'undefined' 
  ? __dirname 
  : path.dirname(fileURLToPath(import.meta.url));

process.env.DIST = path.join(currentDir, '../dist');
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public');

let win: BrowserWindow | null = null;
const envService = new EnvService();
const sessionStore = new SessionStore();
const authService = new AuthService();
const apiService = new ApiService();
const metadataService = new MetadataService();
const dataService = new DataService();
const updateService = new UpdateService();
const imageService = new ImageService();
const aiService = new AiService(sessionStore, metadataService, dataService);
const fileService = new FileService();

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 840,
    minWidth: 1000,
    minHeight: 700,
    title: 'NeoCRM 开发者工作台',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#f8fafc',
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
ipcMain.handle('env:saveCustom', async (_, env) => envService.saveCustomEnvironment(env));
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
  if (!current.isLoggedIn || !current.environment || !current.tokenData?.refresh_token) {
    throw new Error('当前未登录或无 refresh_token 凭据');
  }
  const tokenData = await authService.refreshToken(current.environment, current.tokenData.refresh_token);
  return sessionStore.saveSession(current.environment, tokenData);
});

ipcMain.handle('auth:logout', async () => {
  authService.cancelActiveAuth();
  await authService.clearBrowserSession();
  return sessionStore.clearSession();
});

// 会话与历史
ipcMain.handle('session:getCurrent', async () => sessionStore.getCurrentSession());
ipcMain.handle('session:getHistory', async () => sessionStore.getAccountHistory());
ipcMain.handle('session:switchAccount', async (_, accountId: string) => sessionStore.switchAccount(accountId));
ipcMain.handle('session:deleteAccount', async (_, accountId: string) => sessionStore.deleteAccountRecord(accountId));

// CLI 凭据同步与调试工具
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
