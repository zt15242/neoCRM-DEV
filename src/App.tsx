import React, { useState, useEffect } from 'react';
import { Header, AppNavTab } from './components/Header';
import { EnvironmentSelector } from './components/EnvironmentSelector';
import { LoginCard } from './components/LoginCard';
import { SessionDashboard } from './components/SessionDashboard';
import { MetadataManager } from './components/MetadataManager';
import { DataManager } from './components/DataManager';
import { AiHarnessStudio } from './components/ai/AiHarnessStudio';
import { SettingsManager } from './components/settings/SettingsManager';
import { CustomEnvModal } from './components/CustomEnvModal';
import { AccountHistoryModal } from './components/AccountHistoryModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { UpdateModal } from './components/UpdateModal';
import { UpdateInfo } from '../shared/types';
import { NeoEnvironment, SessionState, AccountRecord } from '../shared/types';
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
  const [dataTargetEntity, setDataTargetEntity] = useState<string>('account');

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
      }
    } catch (e: any) {
      console.error('初始化数据加载异常:', e);
      showToast('error', `加载失败: ${e.message}`);
    }
  };

  useEffect(() => {
    loadInitialData();
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
    <div className="h-screen w-screen flex flex-col bg-slate-50 text-slate-900 overflow-hidden font-sans">
      {/* 顶部标题栏 & Tab 切换 */}
      <Header
        platform={platform}
        session={session}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenDocs={() => window.neoApi.openExternal('https://crm.xiaoshouyi.com')}
        hasUpdate={!!updateInfo?.hasUpdate}
        onCheckUpdate={() => handleCheckUpdate(true)}
      />

      {/* 主界面内容区 */}
      <main className="flex-1 overflow-y-auto p-3.5 md:p-4 max-w-[1680px] w-full mx-auto">
        {/* Tab 1: 控制台与登录环境 */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <section>
              <EnvironmentSelector
                environments={environments}
                selectedEnvId={selectedEnvId}
                onSelect={(envId) => {
                  if (!isLoggingIn) setSelectedEnvId(envId);
                }}
                onAddCustom={() => {
                  setEditingCustomEnv(null);
                  setIsCustomEnvOpen(true);
                }}
                onEditCustom={(env) => {
                  setEditingCustomEnv(env);
                  setIsCustomEnvOpen(true);
                }}
                onDeleteCustom={handleDeleteCustomEnv}
              />
            </section>

            <section>
              {session.isLoggedIn && session.tokenData ? (
                <SessionDashboard
                  session={session}
                  onRefresh={handleRefresh}
                  onLogout={handleLogout}
                  onOpenDesigner={(type) => window.neoApi.openDesigner(type)}
                  onTestApi={() => window.neoApi.testApiCall()}
                />
              ) : (
                <LoginCard
                  environment={currentSelectedEnv}
                  isLoggingIn={isLoggingIn}
                  loginStatusText={loginStatusText}
                  onLoginBrowser={handleLoginBrowser}
                  onLoginEmbedded={handleLoginEmbedded}
                  onLoginPassword={handleLoginPassword}
                  onCancelLogin={handleCancelLogin}
                />
              )}
            </section>
          </div>
        )}

        {/* Tab 2: 实体对象与字段元数据中心 */}
        {activeTab === 'metadata' && (
          session.isLoggedIn ? (
            <MetadataManager
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

        {/* Tab 4: AI 对话平台 (DeepSeek Harness 风格) */}
        {activeTab === 'ai' && (
          <AiHarnessStudio
            crmSession={session}
            onNavigateToSettings={() => setActiveTab('settings')}
            showToast={showToast}
          />
        )}

        {/* Tab 5: 系统与 AI 设置中心 */}
        {activeTab === 'settings' && (
          <SettingsManager
            onBackToAi={() => setActiveTab('ai')}
            onCheckUpdate={() => handleCheckUpdate(true)}
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
