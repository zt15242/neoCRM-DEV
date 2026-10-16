import React, { useState, useEffect } from 'react';
import { AppSidebar, AppNavTab } from './components/AppSidebar';
import { EnvironmentSelector } from './components/EnvironmentSelector';
import { LoginCard } from './components/LoginCard';
import { SessionDashboard } from './components/SessionDashboard';
import { ConnectorDetailView } from './components/ConnectorDetailView';
import { MetadataManager } from './components/MetadataManager';
import { DataManager } from './components/DataManager';
import { AiHarnessStudio } from './components/ai/AiHarnessStudio';
import { SettingsManager, SettingsSubTab } from './components/settings/SettingsManager';
import { CustomEnvModal } from './components/CustomEnvModal';
import { AccountHistoryModal } from './components/AccountHistoryModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { UpdateModal } from './components/UpdateModal';
import { FlowManagerModal } from './components/ai/FlowManagerModal';
import { PrintTemplateManagerModal } from './components/ai/PrintTemplateManagerModal';
import { CreateProjectModal } from './components/ai/CreateProjectModal';
import { WorkflowLicenseModal } from './components/ai/WorkflowLicenseModal';
import { UpdateInfo, NeoEnvironment, SessionState, AccountRecord, AiChatSession, WorkflowLicenseStatus, WorkspaceProject, McpServerConfig, AiSkillItem } from '../shared/types';
import { BUILTIN_MCP_SERVERS, BUILTIN_AI_SKILLS } from '../shared/constants';
import { ShieldAlert, LogIn } from 'lucide-react';

export const App: React.FC = () => {
  const [platform, setPlatform] = useState<string>('darwin');
  const [environments, setEnvironments] = useState<NeoEnvironment[]>([]);
  const [selectedEnvId, setSelectedEnvId] = useState<string>('production');
  const [session, setSession] = useState<SessionState>({ isLoggedIn: false });
  const [accountHistory, setAccountHistory] = useState<AccountRecord[]>([]);

  // 自动更新状态
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  const handleCheckUpdate = async (manual = false) => {
    try {
      if (window.neoApi?.checkForUpdates) {
        const info = await window.neoApi.checkForUpdates();
        setUpdateInfo(info);
        if (info.hasUpdate) {
          setIsUpdateModalOpen(true);
        } else if (manual) {
          setIsUpdateModalOpen(true);
        }
      }
    } catch (e: any) {
      if (manual) {
        showToast('error', e.message || '检查更新失败');
      }
    }
  };

  // 页面导航 Tab
  const [activeTab, setActiveTab] = useState<AppNavTab>('dashboard');
  const [activeDetailEnvId, setActiveDetailEnvId] = useState<string | null>(null);
  const [dataTargetEntity, setDataTargetEntity] = useState<string>('account');

  // Codex 风格全局会话与智能体状态
  const [sessions, setSessions] = useState<AiChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('harness-agent');
  const [workflowLicenseStatus, setWorkflowLicenseStatus] = useState<WorkflowLicenseStatus | null>(null);
  const [isLicenseModalOpen, setIsLicenseModalOpen] = useState(false);
  const [isFlowManagerOpen, setIsFlowManagerOpen] = useState(false);
  const [isPrintManagerOpen, setIsPrintManagerOpen] = useState(false);

  // 系统与 AI 设置弹窗状态 (整体以弹窗展示)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsSubTab>('models');

  const handleOpenSettings = (tab: SettingsSubTab = 'models') => {
    setSettingsInitialTab(tab);
    setIsSettingsOpen(true);
  };

  // 本地工程工作区项目列表与活动项目
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<WorkspaceProject | null>(null);

  // 插件与扩展服务状态 (DeepSeek Harness Plugin Ecosystem)
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>(BUILTIN_MCP_SERVERS);
  const [skills, setSkills] = useState<AiSkillItem[]>(BUILTIN_AI_SKILLS);

  // 模态框
  const [isCustomEnvOpen, setIsCustomEnvOpen] = useState(false);
  const [editingCustomEnv, setEditingCustomEnv] = useState<NeoEnvironment | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // 登录加载
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginStatusText, setLoginStatusText] = useState('');

  // Toast
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    const id = `${Date.now()}_${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // 初始化加载
  const loadInitialData = async () => {
    try {
      if (window.neoApi) {
        const plat = await window.neoApi.getPlatform();
        setPlatform(plat);

        const envs = await window.neoApi.getEnvironments();
        setEnvironments(envs);

        const curSession = await window.neoApi.getCurrentSession();
        setSession(curSession);
        if (curSession.environment?.id) {
          setSelectedEnvId(curSession.environment.id);
        }

        const history = await window.neoApi.getAccountHistory();
        setAccountHistory(history);
        handleCheckUpdate(false);

        if (window.neoApi?.aiGetSessions) {
          const sList = await window.neoApi.aiGetSessions();
          if (Array.isArray(sList)) {
            setSessions(sList.filter((s) => s.messages && s.messages.length > 0));
          }
        }

        if (window.neoApi?.workflowGetLicenseStatus) {
          const lic = await window.neoApi.workflowGetLicenseStatus();
          setWorkflowLicenseStatus(lic);
        }

        if (window.neoApi?.projectGetProjects) {
          const pList = await window.neoApi.projectGetProjects();
          if (Array.isArray(pList) && pList.length > 0) {
            setProjects(pList);
            if (!activeProjectId) {
              setActiveProjectId(pList[0].id);
            }
          }
        }

        if (window.neoApi?.aiGetConfig) {
          const cfg = await window.neoApi.aiGetConfig();
          if (cfg.mcpServers) setMcpServers(cfg.mcpServers);
          if (cfg.skills) setSkills(cfg.skills);
        }
      }
    } catch (e: any) {
      console.error('初始化数据加载异常:', e);
      showToast('error', `加载失败: ${e.message}`);
    }
  };

  useEffect(() => {
    loadInitialData();
    if (window.neoApi?.onSessionUpdated) {
      const unsub = window.neoApi.onSessionUpdated((updatedSession) => {
        setSession(updatedSession);
      });
      return unsub;
    }
  }, []);

  const currentSelectedEnv =
    environments.find((e) => e.id === selectedEnvId) || environments[0] || {
      id: 'production',
      name: '线上生产环境',
      isPreset: true,
      neoBaseURL: 'https://crm.xiaoshouyi.com',
      loginURL: 'https://login.xiaoshouyi.com/auc/oauth2/auth',
      tokenURL: 'https://login.xiaoshouyi.com/auc/oauth2/token',
    };

  // 自定义环境保存
  const handleSelectConnector = async (envId: string) => {
    if (isLoggingIn) return;
    setSelectedEnvId(envId);

    // 智能联动：如果在历史账号中已有该连接器的活跃登录凭据，自动唤醒并切换为该会话！
    const matchedAccount = accountHistory.find((a) => a.environmentId === envId);
    if (matchedAccount && window.neoApi?.switchAccount) {
      try {
        const switched = await window.neoApi.switchAccount(matchedAccount.id);
        if (switched && switched.isLoggedIn) {
          setSession(switched);
          showToast('success', `已自动切换至连接器 [${switched.environment?.name || envId}] 认证会话`);
          return;
        }
      } catch {}
    }
  };

  const handleSaveCustomEnv = async (envData: Partial<NeoEnvironment> & { name: string; neoBaseURL: string }) => {
    try {
      const saved = await window.neoApi.saveCustomEnvironment(envData);
      showToast('success', `环境 "${saved.name}" 保存成功`);
      const envs = await window.neoApi.getEnvironments();
      setEnvironments(envs);
      setSelectedEnvId(saved.id);
    } catch (e: any) {
      showToast('error', `保存自定义环境失败: ${e.message}`);
    }
  };

  const handleDeleteCustomEnv = async (envId: string) => {
    try {
      const ok = await window.neoApi.deleteCustomEnvironment(envId);
      if (ok) {
        showToast('info', '已删除自定义环境');
        const envs = await window.neoApi.getEnvironments();
        setEnvironments(envs);
        if (selectedEnvId === envId) {
          setSelectedEnvId(envs[0]?.id || 'production');
        }
      }
    } catch (e: any) {
      showToast('error', `删除失败: ${e.message}`);
    }
  };

  // 登录操作
  const handleLoginBrowser = async () => {
    setIsLoggingIn(true);
    setLoginStatusText('正在启动本地回调服务，并呼起系统默认浏览器...');
    try {
      const newSession = await window.neoApi.loginWithBrowser(selectedEnvId);
      setSession(newSession);
      showToast('success', '浏览器授权登录成功！');
      const history = await window.neoApi.getAccountHistory();
      setAccountHistory(history);
    } catch (e: any) {
      showToast('error', e.message || '浏览器登录失败');
    } finally {
      setIsLoggingIn(false);
      setLoginStatusText('');
    }
  };

  const handleLoginEmbedded = async () => {
    setIsLoggingIn(true);
    setLoginStatusText('正在呼起应用内嵌安全登录窗口...');
    try {
      const newSession = await window.neoApi.loginWithEmbeddedWindow(selectedEnvId);
      setSession(newSession);
      showToast('success', '登录授权成功！');
      const history = await window.neoApi.getAccountHistory();
      setAccountHistory(history);
    } catch (e: any) {
      if (e.message !== '用户取消了登录') {
        showToast('error', e.message || '登录失败');
      }
    } finally {
      setIsLoggingIn(false);
      setLoginStatusText('');
    }
  };

  const handleLoginPassword = async (username: string, pass: string) => {
    setIsLoggingIn(true);
    setLoginStatusText('正在发起密码模式直接认证...');
    try {
      const newSession = await window.neoApi.loginWithPassword(selectedEnvId, username, pass);
      setSession(newSession);
      showToast('success', '账号密码直登成功！');
      const history = await window.neoApi.getAccountHistory();
      setAccountHistory(history);
    } catch (e: any) {
      showToast('error', e.message || '密码直登失败');
    } finally {
      setIsLoggingIn(false);
      setLoginStatusText('');
    }
  };

  const handleCancelLogin = async () => {
    await window.neoApi.cancelLogin();
    setIsLoggingIn(false);
    setLoginStatusText('');
    showToast('info', '已取消当前登录');
  };

  const handleRefresh = async () => {
    try {
      const newSession = await window.neoApi.refreshToken();
      setSession(newSession);
      showToast('success', 'Token 访问令牌已刷新续期');
      const history = await window.neoApi.getAccountHistory();
      setAccountHistory(history);
    } catch (e: any) {
      showToast('error', `续期失败: ${e.message}`);
    }
  };

  const handleLogout = async () => {
    try {
      const newSession = await window.neoApi.logout();
      setSession(newSession);
      setActiveTab('dashboard');
      showToast('info', '已登出当前租户会话');
    } catch (e: any) {
      showToast('error', `登出异常: ${e.message}`);
    }
  };

  const handleSwitchAccount = async (accountId: string) => {
    try {
      const newSession = await window.neoApi.switchAccount(accountId);
      if (newSession) {
        setSession(newSession);
        if (newSession.environment?.id) {
          setSelectedEnvId(newSession.environment.id);
        }
        showToast('success', '已成功切换账号');
      }
    } catch (e: any) {
      showToast('error', `切换失败: ${e.message}`);
    }
  };

  const handleDeleteHistoryRecord = async (accountId: string) => {
    try {
      await window.neoApi.deleteAccountRecord(accountId);
      const history = await window.neoApi.getAccountHistory();
      setAccountHistory(history);
      showToast('info', '已删除历史账号');
    } catch (e: any) {
      showToast('error', `删除失败: ${e.message}`);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (window.neoApi?.aiDeleteSession) {
      await window.neoApi.aiDeleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
      }
    }
  };

  const handleUpdateSessionTitle = async (sessionId: string, title: string) => {
    if (window.neoApi?.aiSaveSession) {
      const target = sessions.find((s) => s.id === sessionId);
      if (target) {
        const updated = { ...target, title, updatedAt: Date.now() };
        await window.neoApi.aiSaveSession(updated);
        setSessions((prev) => prev.map((s) => (s.id === sessionId ? updated : s)));
      }
    }
  };

  const handleClearSessions = async () => {
    if (window.neoApi?.aiClearSessions) {
      await window.neoApi.aiClearSessions();
      setSessions([]);
      setActiveSessionId(null);
    }
  };

  // 项目工作区管理
  const handleSaveProject = async (payload: { id?: string; name: string; localPath: string; description?: string }) => {
    try {
      if (window.neoApi?.projectSaveProject) {
        const saved = await window.neoApi.projectSaveProject(payload);
        const pList = await window.neoApi.projectGetProjects();
        setProjects(pList);
        setActiveProjectId(saved.id);
        showToast('success', `本地项目工作区 [${saved.name}] 保存成功`);
      }
    } catch (e: any) {
      showToast('error', `保存项目失败: ${e.message}`);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      if (window.neoApi?.projectDeleteProject) {
        await window.neoApi.projectDeleteProject(projectId);
        const pList = await window.neoApi.projectGetProjects();
        setProjects(pList);
        if (activeProjectId === projectId && pList.length > 0) {
          setActiveProjectId(pList[0].id);
        }
        showToast('info', '已移除项目工作区');
      }
    } catch (e: any) {
      showToast('error', `移除项目失败: ${e.message}`);
    }
  };

  // 插件与扩展服务操作
  const handleToggleMcpServer = async (id: string) => {
    const target = mcpServers.find((m) => m.id === id);
    if (!target) return;
    const updated = { ...target, enabled: !target.enabled };
    try {
      if (window.neoApi?.aiSaveMcpServer) {
        const list = await window.neoApi.aiSaveMcpServer(updated);
        setMcpServers(list);
        showToast('success', `插件 [${target.name}] 已${updated.enabled ? '启用' : '停用'}`);
      }
    } catch (e: any) {
      showToast('error', `更新插件失败: ${e.message}`);
    }
  };

  const handleSaveMcpServer = async (server: McpServerConfig) => {
    try {
      if (window.neoApi?.aiSaveMcpServer) {
        const list = await window.neoApi.aiSaveMcpServer(server);
        setMcpServers(list);
      }
    } catch (e: any) {
      showToast('error', `保存插件失败: ${e.message}`);
    }
  };

  const handleDeleteMcpServer = async (id: string) => {
    try {
      if (window.neoApi?.aiDeleteMcpServer) {
        const list = await window.neoApi.aiDeleteMcpServer(id);
        setMcpServers(list);
        showToast('info', '已移除插件服务');
      }
    } catch (e: any) {
      showToast('error', `移除插件失败: ${e.message}`);
    }
  };

  const handleOpenFolderInExplorer = async (folderPath: string) => {
    try {
      if (window.neoApi?.projectOpenFolder) {
        await window.neoApi.projectOpenFolder(folderPath);
      }
    } catch (e: any) {
      showToast('error', `打开目录失败: ${e.message}`);
    }
  };

  // 导航处理
  const handleTabChange = (tab: AppNavTab) => {
    if ((tab === 'metadata' || tab === 'data') && !session.isLoggedIn) {
      showToast('info', '请先选择环境并完成登录授权，以访问实体与业务数据');
      setActiveTab('dashboard');
      return;
    }
    setActiveTab(tab);
  };

  // 从元数据管理器跳转到数据中心
  const handleNavigateToData = (apiKey: string) => {
    setDataTargetEntity(apiKey);
    setActiveTab('data');
  };

  return (
    <div className="h-screen w-screen flex flex-row bg-white text-slate-900 overflow-hidden font-sans">
      {/* 全局 Codex 经典左侧项目树与功能导航栏 (彻底替代原顶部横条) */}
      <AppSidebar
        platform={platform}
        activeTab={activeTab}
        onSelectTab={handleTabChange}
        session={session}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenDocs={() => window.neoApi.openExternal('https://crm.xiaoshouyi.com')}
        hasUpdate={!!updateInfo?.hasUpdate}
        onCheckUpdate={() => handleCheckUpdate(true)}
        onOpenFlowManager={() => setIsFlowManagerOpen(true)}
        onOpenPrintManager={() => setIsPrintManagerOpen(true)}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={(id) => {
          setActiveSessionId(id);
          setActiveTab('ai');
        }}
        onNewChatDraft={() => {
          setActiveSessionId(null);
          setActiveTab('ai');
        }}
        onDeleteSession={handleDeleteSession}
        onUpdateSessionTitle={handleUpdateSessionTitle}
        onClearSessions={handleClearSessions}
        selectedPresetId={selectedPresetId}
        onSelectPreset={(pId) => {
          setSelectedPresetId(pId);
          setActiveTab('ai');
        }}
        workflowLicenseStatus={workflowLicenseStatus}
        onOpenLicenseModal={() => setIsLicenseModalOpen(true)}
        onOpenSettings={() => handleOpenSettings('models')}
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={setActiveProjectId}
        onOpenCreateProject={() => {
          setEditingProject(null);
          setIsCreateProjectOpen(true);
        }}
        onEditProject={(p) => {
          setEditingProject(p);
          setIsCreateProjectOpen(true);
        }}
        onDeleteProject={handleDeleteProject}
        onOpenFolderInExplorer={handleOpenFolderInExplorer}
      />

      {/* 右侧无缝主工作区 */}
      <main className="flex-1 h-full min-h-0 overflow-hidden flex flex-col min-w-0 bg-white relative">
        {/* Tab 1: CRM 连接器中心 与 连接器详情页 */}
        {activeTab === 'dashboard' && (
          <div className="flex-1 h-full overflow-y-auto p-4 md:p-6 max-w-[1400px] w-full mx-auto space-y-6">
            {activeDetailEnvId ? (
              // 连接器详情页 (将原主界面底部的 SessionDashboard / LoginCard 完整收敛并放入详情页)
              <ConnectorDetailView
                environment={environments.find((e) => e.id === activeDetailEnvId) || currentSelectedEnv}
                session={session}
                accountHistory={accountHistory}
                onBack={() => setActiveDetailEnvId(null)}
                onEdit={(env) => {
                  setEditingCustomEnv(env);
                  setIsCustomEnvOpen(true);
                }}
                onDelete={(envId) => {
                  handleDeleteCustomEnv(envId);
                  setActiveDetailEnvId(null);
                }}
                onSwitchConnector={handleSelectConnector}
                isLoggingIn={isLoggingIn}
                loginStatusText={loginStatusText}
                onLoginBrowser={handleLoginBrowser}
                onLoginEmbedded={handleLoginEmbedded}
                onLoginPassword={handleLoginPassword}
                onCancelLogin={handleCancelLogin}
                onRefresh={handleRefresh}
                onLogout={handleLogout}
                onOpenDesigner={(type) => window.neoApi.openDesigner(type)}
                onTestApi={() => window.neoApi.testApiCall()}
                onRefreshSession={loadInitialData}
                showToast={showToast}
              />
            ) : (
              // 连接器中心概览列表 (彻底去除内置死板预置列表的霸屏占位，点击卡片直接进入详情页)
              <EnvironmentSelector
                environments={environments}
                selectedEnvId={selectedEnvId}
                activeSessionEnvId={session.environment?.id}
                isLoggedIn={session.isLoggedIn}
                onSelect={(envId) => {
                  handleSelectConnector(envId);
                  setActiveDetailEnvId(envId);
                }}
                onOpenDetail={(envId) => {
                  handleSelectConnector(envId);
                  setActiveDetailEnvId(envId);
                }}
                onAddCustom={(template) => {
                  setEditingCustomEnv(template ? (template as any) : null);
                  setIsCustomEnvOpen(true);
                }}
                onEditCustom={(env) => {
                  setEditingCustomEnv(env);
                  setIsCustomEnvOpen(true);
                }}
                onDeleteCustom={handleDeleteCustomEnv}
              />
            )}
          </div>
        )}

        {/* Tab 2: 实体对象与字段元数据中心 */}
        {activeTab === 'metadata' && (
          session.isLoggedIn ? (
            <MetadataManager
              session={session}
              onNavigateToData={handleNavigateToData}
              showToast={showToast}
            />
          ) : (
            <div className="py-20 text-center space-y-3">
              <ShieldAlert className="w-10 h-10 text-amber-400 mx-auto" />
              <h3 className="text-base font-semibold text-slate-800">请先登录租户</h3>
              <p className="text-xs text-slate-400">元数据管理需要当前租户有效的访问令牌 (Token)</p>
              <button
                onClick={() => setActiveTab('dashboard')}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs rounded-lg inline-flex items-center space-x-1.5"
              >
                <LogIn className="w-4 h-4" />
                <span>返回控制台登录</span>
              </button>
            </div>
          )
        )}

        {/* Tab 3: 数据中心与 SQL 探索器 */}
        {activeTab === 'data' && (
          session.isLoggedIn ? (
            <DataManager
              session={session}
              initialEntityApiKey={dataTargetEntity}
              showToast={showToast}
            />
          ) : (
            <div className="py-20 text-center space-y-3">
              <ShieldAlert className="w-10 h-10 text-amber-400 mx-auto" />
              <h3 className="text-base font-semibold text-slate-800">请先登录租户</h3>
              <p className="text-xs text-slate-400">数据查询与 DML 需要当前租户有效的访问令牌 (Token)</p>
              <button
                onClick={() => setActiveTab('dashboard')}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs rounded-lg inline-flex items-center space-x-1.5"
              >
                <LogIn className="w-4 h-4" />
                <span>返回控制台登录</span>
              </button>
            </div>
          )
        )}

        {/* Tab 4: AI 对话平台 (Codex 极简三栏全能工作台) */}
        {activeTab === 'ai' && (
          <AiHarnessStudio
            crmSession={session}
            activeSessionId={activeSessionId}
            onSelectSession={setActiveSessionId}
            sessions={sessions}
            onSessionsChange={setSessions}
            selectedPresetId={selectedPresetId}
            onSelectPreset={setSelectedPresetId}
            workflowLicenseStatus={workflowLicenseStatus}
            onOpenLicenseModal={() => setIsLicenseModalOpen(true)}
            activeProject={projects.find((p) => p.id === activeProjectId) || projects[0]}
            onOpenFlowManager={() => setIsFlowManagerOpen(true)}
            onOpenPrintManager={() => setIsPrintManagerOpen(true)}
            onNavigateToSettings={(tab) => handleOpenSettings((tab as SettingsSubTab) || 'models')}
            onNavigateToMetadata={() => setActiveTab('metadata')}
            onNavigateToData={() => setActiveTab('data')}
            showToast={showToast}
          />
        )}


      </main>

      {/* 自定义环境创建/编辑弹窗 */}
      <CustomEnvModal
        isOpen={isCustomEnvOpen}
        initialEnv={editingCustomEnv}
        onClose={() => {
          setIsCustomEnvOpen(false);
          setEditingCustomEnv(null);
        }}
        onSave={handleSaveCustomEnv}
      />

      {/* 历史账号弹窗 */}
      <AccountHistoryModal
        isOpen={isHistoryOpen}
        activeAccountId={session.activeAccountId}
        history={accountHistory}
        onClose={() => setIsHistoryOpen(false)}
        onSwitch={handleSwitchAccount}
        onDelete={handleDeleteHistoryRecord}
      />

      {/* 租户流程资产管理中心 (自动流程 & 新版审批流) */}
      <FlowManagerModal
        isOpen={isFlowManagerOpen}
        crmSession={session}
        licenseStatus={workflowLicenseStatus}
        onClose={() => setIsFlowManagerOpen(false)}
        onSendToAiPrompt={() => {
          setIsFlowManagerOpen(false);
          setActiveTab('ai');
        }}
        showToast={showToast}
      />

      {/* 租户打印模板资产管理中心 (免锁开放) */}
      <PrintTemplateManagerModal
        isOpen={isPrintManagerOpen}
        crmSession={session}
        onClose={() => setIsPrintManagerOpen(false)}
        onSendToAiPrompt={() => {
          setIsPrintManagerOpen(false);
          setActiveTab('ai');
        }}
        showToast={showToast}
      />

      {/* 创建 / 编辑本地项目工作区弹窗 */}
      <CreateProjectModal
        isOpen={isCreateProjectOpen}
        editingProject={editingProject}
        onClose={() => setIsCreateProjectOpen(false)}
        onSave={handleSaveProject}
        showToast={showToast}
      />

      {/* 自动流程与审批流设备授权安全锁弹窗 (全局可打开查看或激活) */}
      <WorkflowLicenseModal
        isOpen={isLicenseModalOpen}
        initialStatus={workflowLicenseStatus}
        onClose={() => setIsLicenseModalOpen(false)}
        onActivated={(newStatus) => {
          setWorkflowLicenseStatus(newStatus);
          setIsLicenseModalOpen(false);
          showToast('success', `设备安全锁激活成功！剩余有效天数: ${newStatus.remainingDays} 天`);
        }}
        showToast={showToast}
      />

      {/* 系统与 AI 设置中心弹窗 (含模型供应商、DeepSeek Harness 插件中心、技能库与偏好) */}
      <SettingsManager
        isOpen={isSettingsOpen}
        initialTab={settingsInitialTab}
        onClose={() => setIsSettingsOpen(false)}
        onCheckUpdate={() => handleCheckUpdate(true)}
        showToast={showToast}
      />

      {/* 全局 Toast 通知 */}
      <UpdateModal
        isOpen={isUpdateModalOpen}
        updateInfo={updateInfo}
        onClose={() => setIsUpdateModalOpen(false)}
        showToast={showToast}
      />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};
