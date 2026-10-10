import { contextBridge, ipcRenderer } from 'electron';
import { CreateEntityPayload, CreateFieldPayload } from '../shared/types';

export const neoApi = {
  // 环境
  getEnvironments: () => ipcRenderer.invoke('env:getAll'),
  saveCustomEnvironment: (env: any) => ipcRenderer.invoke('env:saveCustom', env),
  deleteCustomEnvironment: (id: string) => ipcRenderer.invoke('env:deleteCustom', id),
  testConnectivity: (url: string) => ipcRenderer.invoke('env:testConnectivity', url),

  // 认证
  loginWithBrowser: (envId: string) => ipcRenderer.invoke('auth:loginWithBrowser', envId),
  loginWithEmbeddedWindow: (envId: string) => ipcRenderer.invoke('auth:loginWithEmbedded', envId),
  loginWithPassword: (envId: string, username: string, password: string) =>
    ipcRenderer.invoke('auth:loginWithPassword', envId, username, password),
  cancelLogin: () => ipcRenderer.invoke('auth:cancelLogin'),
  refreshToken: () => ipcRenderer.invoke('auth:refreshToken'),
  logout: () => ipcRenderer.invoke('auth:logout'),

  // 会话与历史
  getCurrentSession: () => ipcRenderer.invoke('session:getCurrent'),
  getAccountHistory: () => ipcRenderer.invoke('session:getHistory'),
  switchAccount: (accountId: string) => ipcRenderer.invoke('session:switchAccount', accountId),
  deleteAccountRecord: (accountId: string) => ipcRenderer.invoke('session:deleteAccount', accountId),

  // 凭证同步与通用
  syncToNeoCli: (targetDirPath?: string) => ipcRenderer.invoke('cli:sync', targetDirPath),
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  testApiCall: () => ipcRenderer.invoke('api:testCall'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  openDesigner: (type: 'web' | 'h5') => ipcRenderer.invoke('app:openDesigner', type),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),

  // 自动更新
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: (downloadUrl: string, fileName: string) => ipcRenderer.invoke('updater:download', downloadUrl, fileName),
  openInstaller: () => ipcRenderer.invoke('updater:openInstaller'),
  gitPullUpdate: () => ipcRenderer.invoke('updater:gitPull'),
  onDownloadProgress: (callback: (progress: any) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('updater:downloadProgress', handler);
    return () => ipcRenderer.removeListener('updater:downloadProgress', handler);
  },
  // 窗口控制
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),

  // 元数据 (对象与字段)
  getEntities: () => ipcRenderer.invoke('metadata:getEntities'),
  getFields: (entityApiKey: string) => ipcRenderer.invoke('metadata:getFields', entityApiKey),
  createEntity: (payload: CreateEntityPayload) => ipcRenderer.invoke('metadata:createEntity', payload),
  createField: (entityApiKey: string, payload: CreateFieldPayload) => ipcRenderer.invoke('metadata:createField', entityApiKey, payload),
  exportDictionary: (targetDir?: string) => ipcRenderer.invoke('metadata:exportDictionary', targetDir),

  // 数据管理 (SQL查询与DML)
  getRecordDetail: (entityApiKey: string, id: string | number) => ipcRenderer.invoke('data:getRecordDetail', entityApiKey, id),
  searchRecords: (entityApiKey: string, keyword: string, limit?: number) => ipcRenderer.invoke('data:searchRecords', entityApiKey, keyword, limit),
  getBatchNames: (entityApiKey: string, ids: (string | number)[]) => ipcRenderer.invoke('data:getBatchNames', entityApiKey, ids),
  executeQuery: (sql: string) => ipcRenderer.invoke('data:query', sql),
  createRecord: (entityApiKey: string, data: Record<string, any>) => ipcRenderer.invoke('data:createRecord', entityApiKey, data),
  updateRecord: (entityApiKey: string, id: string | number, data: Record<string, any>) => ipcRenderer.invoke('data:updateRecord', entityApiKey, id, data),
  deleteRecord: (entityApiKey: string, id: string | number) => ipcRenderer.invoke('data:deleteRecord', entityApiKey, id),
};

contextBridge.exposeInMainWorld('neoApi', neoApi);
