import { contextBridge, ipcRenderer } from 'electron';
import { CreateEntityPayload, CreateFieldPayload } from '../shared/types';

export const neoApi = {
  // 环境
  getEnvironments: () => ipcRenderer.invoke('env:getAll'),
  getEnvTemplates: () => ipcRenderer.invoke('env:getTemplates'),
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
  onSessionUpdated: (callback: (session: any) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('session:updated', handler);
    return () => ipcRenderer.removeListener('session:updated', handler);
  },
  pullProjectCode: (options: { targetDir: string; pullType?: 'all' | 'backend' | 'frontend' | 'metadata'; entityNames?: string[] }) =>
    ipcRenderer.invoke('code:pullProjectCode', options),
  logout: () => ipcRenderer.invoke('auth:logout'),
  captureWebCookie: () => ipcRenderer.invoke('auth:captureWebCookie'),
  updateSessionCookie: (cookieString: string) => ipcRenderer.invoke('auth:updateCookie', cookieString),

  // 会话与历史
  getCurrentSession: () => ipcRenderer.invoke('session:getCurrent'),
  getAccountHistory: () => ipcRenderer.invoke('session:getHistory'),
  switchAccount: (accountId: string) => ipcRenderer.invoke('session:switchAccount', accountId),
  deleteAccountRecord: (accountId: string) => ipcRenderer.invoke('session:deleteAccount', accountId),

  // 凭证同步与通用
  syncToNeoCli: (targetDirPath?: string) => ipcRenderer.invoke('cli:sync', targetDirPath),
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  // 本地项目工作区 (Projects)
  projectGetProjects: () => ipcRenderer.invoke('project:getProjects'),
  projectSaveProject: (payload: any) => ipcRenderer.invoke('project:saveProject', payload),
  projectDeleteProject: (projectId: string) => ipcRenderer.invoke('project:deleteProject', projectId),
  projectOpenFolder: (folderPath: string) => ipcRenderer.invoke('project:openFolder', folderPath),
  projectListFiles: (params?: { folderPath?: string; query?: string; maxFiles?: number }) => ipcRenderer.invoke('project:listFiles', params),
  fileParseLocalPath: (filePath: string) => ipcRenderer.invoke('file:parseLocalPath', filePath),
  clipboardWriteText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
  shellOpenPath: (targetPath: string) => ipcRenderer.invoke('shell:openPath', targetPath),
  shellShowItemInFolder: (targetPath: string) => ipcRenderer.invoke('shell:showItemInFolder', targetPath),
  projectGetDirTree: (folderPath?: string, maxDepth?: number) => ipcRenderer.invoke('project:getDirTree', folderPath, maxDepth),
  projectGetRecentArtifacts: (folderPath?: string, limit?: number) => ipcRenderer.invoke('project:getRecentArtifacts', folderPath, limit),
  projectGetWorkspaceChanges: (folderPath?: string) => ipcRenderer.invoke('project:getWorkspaceChanges', folderPath),
  projectGetFileDiff: (filePath: string, folderPath?: string) => ipcRenderer.invoke('project:getFileDiff', filePath, folderPath),
  projectDiscardFileChanges: (filePath: string, folderPath?: string) => ipcRenderer.invoke('project:discardFileChanges', filePath, folderPath),
  jobsList: () => ipcRenderer.invoke('jobs:list'),
  jobsGetOutput: (params: { job_id: string; wait?: boolean; timeout_ms?: number }) => ipcRenderer.invoke('jobs:getOutput', params),
  jobsKill: (params: { job_id: string; reason?: string }) => ipcRenderer.invoke('jobs:kill', params),
  terminalExecute: (params: { command: string; workdir?: string; timeoutMs?: number }) => ipcRenderer.invoke('terminal:execute', params),
  testApiCall: () => ipcRenderer.invoke('api:testCall'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  openDesigner: (type: 'web' | 'h5') => ipcRenderer.invoke('app:openDesigner', type),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),

  // 图片操作
  fetchImageDataUrl: (fileId: string | number) => ipcRenderer.invoke('image:fetchDataUrl', fileId),
  uploadImage: (base64Data: string, fileName: string, mimeType?: string) => ipcRenderer.invoke('image:upload', base64Data, fileName, mimeType),
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
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
  executeScrollQuery: (sql: string, batchCount?: number, maxLimit?: number) => ipcRenderer.invoke('data:scrollQuery', sql, batchCount, maxLimit),
  onScrollProgress: (callback: (progress: any) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('data:scrollProgress', handler);
    return () => ipcRenderer.removeListener('data:scrollProgress', handler);
  },
  executeQuery: (sql: string) => ipcRenderer.invoke('data:query', sql),
  createRecord: (entityApiKey: string, data: Record<string, any>) => ipcRenderer.invoke('data:createRecord', entityApiKey, data),
  updateRecord: (entityApiKey: string, id: string | number, data: Record<string, any>) => ipcRenderer.invoke('data:updateRecord', entityApiKey, id, data),
  deleteRecord: (entityApiKey: string, id: string | number) => ipcRenderer.invoke('data:deleteRecord', entityApiKey, id),
// AI 对话平台与模型设置 (参考 DeepSeek Harness)
  aiGetConfig: () => ipcRenderer.invoke('ai:getConfig'),
  aiSaveSettings: (settings: any) => ipcRenderer.invoke('ai:saveSettings', settings),
  aiSaveProvider: (provider: any) => ipcRenderer.invoke('ai:saveProvider', provider),
  aiDeleteProvider: (id: string) => ipcRenderer.invoke('ai:deleteProvider', id),
  aiTestProvider: (provider: any) => ipcRenderer.invoke('ai:testProvider', provider),
  aiFetchModels: (provider: any) => ipcRenderer.invoke('ai:fetchModels', provider),
  aiGetSessions: () => ipcRenderer.invoke('ai:getSessions'),
  aiSaveSession: (session: any) => ipcRenderer.invoke('ai:saveSession', session),
  aiDeleteSession: (sessionId: string) => ipcRenderer.invoke('ai:deleteSession', sessionId),
  aiClearSessions: () => ipcRenderer.invoke('ai:clearSessions'),
  aiStartChatStream: (params: any) => ipcRenderer.invoke('ai:startChatStream', params),
  aiAbortChatStream: (requestId: string) => ipcRenderer.invoke('ai:abortChatStream', requestId),
  aiSelectAndParseFile: () => ipcRenderer.invoke('file:selectAndParse'),
  aiParseFileBuffer: (fileName: string, buffer: ArrayBuffer) => ipcRenderer.invoke('file:parseBuffer', fileName, buffer),
  aiSaveMcpServer: (server: any) => ipcRenderer.invoke('ai:saveMcpServer', server),
  aiDeleteMcpServer: (id: string) => ipcRenderer.invoke('ai:deleteMcpServer', id),
  aiSyncMcpTools: (serverId: string) => ipcRenderer.invoke('ai:syncMcpTools', serverId),
  aiSaveSkill: (skill: any) => ipcRenderer.invoke('ai:saveSkill', skill),
  aiDeleteSkill: (id: string) => ipcRenderer.invoke('ai:deleteSkill', id),
  aiCompactSession: (sessionId: string) => ipcRenderer.invoke("ai:compactSession", sessionId),
  aiImportSkillZip: () => ipcRenderer.invoke("ai:importSkillZip"),
  aiImportSkillZipBuffer: (fileName: string, buffer: ArrayBuffer) => ipcRenderer.invoke("ai:importSkillZipBuffer", fileName, buffer),
  aiExportSkillZip: (skillIds?: string[]) => ipcRenderer.invoke("ai:exportSkillZip", skillIds),
  // 自动流程 (Automatic Flow) & 设备安全锁
  workflowGetLicenseStatus: () => ipcRenderer.invoke("license:getStatus"),
  workflowActivateLicense: (password: string) => ipcRenderer.invoke("license:activate", password),
  workflowDeployPlan: (plan: any, options?: { autoEnable?: boolean }) => ipcRenderer.invoke("workflow:deployPlan", plan, options),
  workflowDeployApprovalPlan: (plan: any, options?: { autoEnable?: boolean }) => ipcRenderer.invoke("workflow:deployApprovalPlan", plan, options),
  workflowGetApprovalResources: (entityApiKey?: string) => ipcRenderer.invoke("workflow:getApprovalResources", entityApiKey),
  workflowListTenantFlows: (params?: any) => ipcRenderer.invoke("workflow:listTenantFlows", params),
  workflowCopyFlow: (params: any) => ipcRenderer.invoke("workflow:copyFlow", params),
  workflowDeleteFlow: (procdefId: string | number, procType?: number) => ipcRenderer.invoke("workflow:deleteFlow", procdefId, procType),
  workflowListFlows: (params?: any) => ipcRenderer.invoke("workflow:listFlows", params),
  workflowGetFlowDetail: (procdefId: string | number, procType?: number) => ipcRenderer.invoke("workflow:getFlowDetail", procdefId, procType),
  workflowToggleStatus: (procdefId: string | number, enable: boolean, procType?: number) => ipcRenderer.invoke("workflow:toggleStatus", procdefId, enable, procType),
  workflowReviseVersion: (procdefId: string | number, procType?: number) => ipcRenderer.invoke("workflow:reviseVersion", procdefId, procType),
  workflowTriggerInstance: (payload: any) => ipcRenderer.invoke("workflow:triggerInstance", payload),
  // 销售易 Nex 2.0 页面扩展 (Nex 2.0)
  nexListExtensions: (projectDir?: string) => ipcRenderer.invoke("nex:listExtensions", projectDir),
  nexGetExtensionDetail: (params: any) => ipcRenderer.invoke("nex:getExtensionDetail", params),
  nexGenerateExtension: (options: any) => ipcRenderer.invoke("nex:generateExtension", options),
  nexDeployExtension: (options: any) => ipcRenderer.invoke("nex:deployExtension", options),
  // 打印模板 (Print Template)
  printListObjects: () => ipcRenderer.invoke("print:listObjects"),
  printListTemplates: (params?: any) => ipcRenderer.invoke("print:listTemplates", params),
  printGetFields: (params: any) => ipcRenderer.invoke("print:getFields", params),
  printGenerateTemplate: (params: any) => ipcRenderer.invoke("print:generateTemplate", params),
  printDownloadSample: (params: any) => ipcRenderer.invoke("print:downloadSample", params),
  printToggleStatus: (templatePrintId: string | number, enable: boolean) => ipcRenderer.invoke("print:toggleStatus", { templatePrintId, enable }),
  printDeleteTemplate: (templatePrintId: string | number) => ipcRenderer.invoke("print:deleteTemplate", { templatePrintId }),
  printRenderDocument: (params: any) => ipcRenderer.invoke("print:renderDocument", params),
  // WorkBuddy 反代与扫码登录
  workbuddyGetStatus: () => ipcRenderer.invoke("workbuddy:getStatus"),
  workbuddyStartLogin: (realm?: "intl" | "cn") => ipcRenderer.invoke("workbuddy:startLogin", realm),
  workbuddyPollLogin: (state: string, realm?: "intl" | "cn") => ipcRenderer.invoke("workbuddy:pollLogin", state, realm),
  workbuddyLogout: () => ipcRenderer.invoke("workbuddy:logout"),
  // 软件运行日志管理 (Logger)
  loggerGetLogs: (options?: any) => ipcRenderer.invoke('logger:getLogs', options),
  loggerGetLogFiles: () => ipcRenderer.invoke('logger:getLogFiles'),
  loggerOpenLogDir: () => ipcRenderer.invoke('logger:openLogDir'),
  loggerClearLogs: () => ipcRenderer.invoke('logger:clearLogs'),
  loggerExportLog: (date?: string) => ipcRenderer.invoke('logger:exportLog', date),
  loggerLog: (level: string, module: string, message: string, details?: any) =>
    ipcRenderer.invoke('logger:log', level, module, message, details),

  
  // Foxmail 风格智能邮件管理与人物画像 (Mail & Persona Copilot)
  mailGetAccounts: () => ipcRenderer.invoke('mail:getAccounts'),
  mailTestAndSaveAccount: (payload: any) => ipcRenderer.invoke('mail:testAndSaveAccount', payload),
  mailDeleteAccount: (accountId: string) => ipcRenderer.invoke('mail:deleteAccount', accountId),
  mailSetDefaultAccount: (accountId: string) => ipcRenderer.invoke('mail:setDefaultAccount', accountId),
  mailSyncEmailsForAccount: (accountId: string) => ipcRenderer.invoke('mail:syncEmailsForAccount', accountId),
  mailFetchEmailBody: (accountId: string, emailId: string) => ipcRenderer.invoke('mail:fetchEmailBody', accountId, emailId),
  mailSaveAccounts: (accounts: any[]) => ipcRenderer.invoke('mail:saveAccounts', accounts),
  mailGetEmails: () => ipcRenderer.invoke('mail:getEmails'),
  mailMarkAsRead: (emailId: string, isRead?: boolean) => ipcRenderer.invoke('mail:markAsRead', emailId, isRead),
  mailToggleStar: (emailId: string) => ipcRenderer.invoke('mail:toggleStar', emailId),
  mailDeleteEmail: (emailId: string) => ipcRenderer.invoke('mail:deleteEmail', emailId),
  mailSendEmail: (payload: any) => ipcRenderer.invoke('mail:sendEmail', payload),
  mailSaveDraft: (payload: any) => ipcRenderer.invoke('mail:saveDraft', payload),
  mailSyncEmails: () => ipcRenderer.invoke('mail:syncEmails'),
  mailAnalyzeEmail: (emailId: string) => ipcRenderer.invoke('mail:analyzeEmail', emailId),
  mailGenerateReply: (options: any) => ipcRenderer.invoke('mail:generateReply', options),
  mailGetPersonas: () => ipcRenderer.invoke('mail:getPersonas'),
  mailAnalyzePersonaByEmail: (email: string, hints?: string) => ipcRenderer.invoke('mail:analyzePersonaByEmail', email, hints),
  mailSavePersonaNotes: (email: string, notes: string) => ipcRenderer.invoke('mail:savePersonaNotes', email, notes),

  onAiStreamEvent: (callback: (event: any) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('ai:streamEvent', handler);
    return () => ipcRenderer.removeListener('ai:streamEvent', handler);
  },
};

contextBridge.exposeInMainWorld('neoApi', neoApi);
