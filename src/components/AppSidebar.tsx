import React, { useState, useEffect } from 'react';
import { CURRENT_APP_VERSION } from '../../shared/constants';
import { 
  SquarePen,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutTemplate, 
  Search, 
  Trash2, 
  Edit3, 
  Sparkles, 
  Database, 
  Box, 
  Code2, 
  Check, 
  X, 
  Lock, 
  Unlock, 
  Workflow, 
  FileCheck, 
  Layers, 
  Printer,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  LayoutDashboard,
  Settings,
  History,
  HelpCircle,
  FileText,
  Star,
  Cloud,
  Flame,
  Mic,
  Mail,
  Plus,
  ExternalLink
} from 'lucide-react';
import { 
  AiChatSession, 
  AiAgentPreset, 
  WorkflowLicenseStatus, 
  SessionState, 
  NeoEnvironment,
  WorkspaceProject 
} from '../../shared/types';
import { AI_AGENT_PRESETS } from '../../shared/constants';

export type AppNavTab = 'dashboard' | 'metadata' | 'data' | 'ai' | 'mail' | 'workspace' | 'meeting';

interface AppSidebarProps {
  platform: string;
  activeTab: AppNavTab;
  onSelectTab: (tab: AppNavTab) => void;
  session: SessionState;
  onOpenHistory: () => void;
  onOpenDocs: () => void;
  hasUpdate?: boolean;
  onCheckUpdate: () => void;
  onOpenFlowManager: () => void;
  onOpenPrintManager: () => void;
  sessions: AiChatSession[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewChatDraft: () => void;
  onDeleteSession: (sessionId: string) => void;
  onUpdateSessionTitle: (sessionId: string, title: string) => void;
  onClearSessions: () => void;
  selectedPresetId: string;
  onSelectPreset: (presetId: string) => void;
  workflowLicenseStatus?: WorkflowLicenseStatus | null;
  onOpenLicenseModal?: () => void;
  onOpenSettings?: () => void;
  onOpenLogs?: () => void;
  projects?: WorkspaceProject[];
  activeProjectId?: string | null;
  onSelectProject?: (projectId: string) => void;
  onOpenCreateProject?: () => void;
  onEditProject?: (project: WorkspaceProject) => void;
  onDeleteProject?: (projectId: string) => void;
  onOpenFolderInExplorer?: (folderPath: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

/** 格式化相对时间 (对齐 DSH Codex UI: 刚刚, 5分钟, 2小时, 2天, 1个月) */
function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return '';
  const now = Date.now();
  const diffMs = Math.max(0, now - timestamp);
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟`;
  if (diffHour < 24) return `${diffHour}小时`;
  if (diffDay < 30) return `${diffDay}天`;
  return `${Math.floor(diffDay / 30)}个月`;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  platform,
  activeTab,
  onSelectTab,
  session,
  onOpenHistory,
  onOpenDocs,
  hasUpdate = false,
  onCheckUpdate,
  onOpenFlowManager,
  onOpenPrintManager,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChatDraft,
  onDeleteSession,
  onUpdateSessionTitle,
  onClearSessions,
  selectedPresetId,
  onSelectPreset,
  workflowLicenseStatus,
  onOpenLicenseModal,
  onOpenSettings,
  onOpenLogs,
  projects = [],
  activeProjectId,
  onSelectProject,
  onOpenCreateProject,
  onEditProject,
  onDeleteProject,
  onOpenFolderInExplorer,
  collapsed = false,
  onToggleCollapse,
}) => {
  const [appVersion, setAppVersion] = useState<string>(CURRENT_APP_VERSION);

  useEffect(() => {
    if (window.neoApi?.getAppVersion) {
      window.neoApi.getAppVersion().then((v) => {
        if (v) setAppVersion(`v${v.replace(/^v/, '')}`);
      }).catch(() => {});
    }
  }, []);

  const isMac = platform === 'darwin';
  const [keyword, setKeyword] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [expandedProjectIds, setExpandedProjectIds] = useState<string[]>([]);
  const [presetDropdownOpen, setPresetDropdownOpen] = useState(false);

  const toggleProjectExpand = (id: string) => {
    setExpandedProjectIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const getPresetIcon = (iconName: string) => {
    switch (iconName) {
      case 'Cloud':
        return Cloud;
      case 'Flame':
        return Flame;
      case 'Printer':
        return Printer;
      case 'Workflow':
        return Workflow;
      case 'FileCheck':
        return FileCheck;
      case 'Database':
        return Database;
      case 'Box':
        return Box;
      case 'Code2':
        return Code2;
      case 'LayoutTemplate':
        return LayoutTemplate;
      default:
        return Sparkles;
    }
  };

  const handleStartRename = (sess: AiChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(sess.id);
    setEditingTitle(sess.title);
  };

  const handleSaveRename = (sessionId: string, e: React.MouseEvent | React.FormEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (editingTitle.trim()) {
      onUpdateSessionTitle(sessionId, editingTitle.trim());
    }
    setEditingId(null);
  };

  const validSessions = sessions.filter((s) => s.messages && s.messages.length > 0);
  const filteredSessions = validSessions.filter((s) => {
    if (!keyword.trim()) return true;
    return s.title.toLowerCase().includes(keyword.toLowerCase());
  });

  const currentPreset = AI_AGENT_PRESETS.find((p) => p.id === selectedPresetId) || AI_AGENT_PRESETS[0];
  const activeTenantName = session.tokenData?.userInfo?.tenantName || session.environment?.name || 'NeoCRM-DEV';
  const activeUserName = session.tokenData?.userInfo?.name || (session.isLoggedIn ? '已连接' : '未登录');

  // =========================================================================
  // 1. 折叠收起态: 100% 对齐 DSH 官方 56px (w-14) 原生导轨
  // =========================================================================
  if (collapsed) {
    return (
      <aside
        className="w-14 transition-all duration-200 ease-in-out bg-slate-50/90 border-r border-slate-200/90 flex flex-col h-screen select-none shrink-0 font-sans z-30 overflow-hidden relative items-center py-2 justify-between"
        title="按 Cmd+B / Ctrl+B 展开侧边栏"
      >
        {/* 顶部: Mac红绿灯避让、展开按钮与高对比度新建对话按钮 */}
        <div className={`w-full flex flex-col items-center space-y-2 shrink-0 ${isMac ? 'pt-8' : 'pt-1'}`}>
          {/* 展开侧栏切换按钮 */}
          <button
            onClick={onToggleCollapse}
            title={isMac ? '展开侧边栏 (⌘B)' : '展开侧边栏 (Ctrl+B)'}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 transition-colors cursor-pointer"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>

          {/* 高对比度新建对话按钮 */}
          <button
            onClick={onNewChatDraft}
            title={isMac ? '新建会话 (⌥⌘N)' : '新建会话 (Ctrl+Alt+N)'}
            className="w-9 h-9 rounded-xl bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center shadow-xs cursor-pointer active:scale-95 transition-all"
          >
            <SquarePen className="w-4 h-4" />
          </button>
        </div>

        {/* 中间: 垂直功能图标导轨 (带 Active 状态左侧指示条与悬停 Tooltip) */}
        <div className="w-full flex-1 flex flex-col items-center py-3 space-y-1.5 overflow-y-auto">
          {/* AI 对话 */}
          <button
            onClick={() => onSelectTab('ai')}
            title="AI 智能体助手"
            className={`w-9 h-9 rounded-xl flex items-center justify-center relative transition-colors cursor-pointer ${
              activeTab === 'ai'
                ? 'bg-slate-200 text-slate-900 font-bold shadow-2xs'
                : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
            }`}
          >
            {activeTab === 'ai' && (
              <span className="absolute left-0 top-2 bottom-2 w-1 bg-sky-600 rounded-r-full" />
            )}
            <Sparkles className="w-4 h-4 text-sky-600" />
          </button>

          {/* 会议助手 */}
          <button
            onClick={() => onSelectTab('meeting')}
            title="会议助手 (妙计级转写与深度总结)"
            className={`w-9 h-9 rounded-xl flex items-center justify-center relative transition-colors cursor-pointer ${
              activeTab === 'meeting'
                ? 'bg-slate-200 text-slate-900 font-bold shadow-2xs'
                : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
            }`}
          >
            {activeTab === 'meeting' && (
              <span className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-600 rounded-r-full" />
            )}
            <Mic className="w-4 h-4 text-indigo-600" />
          </button>

          {/* 智能邮件 */}
          <button
            onClick={() => onSelectTab('mail')}
            title="智能邮件中心 (Foxmail 风格 AI 画像)"
            className={`w-9 h-9 rounded-xl flex items-center justify-center relative transition-colors cursor-pointer ${
              activeTab === 'mail'
                ? 'bg-slate-200 text-slate-900 font-bold shadow-2xs'
                : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
            }`}
          >
            {activeTab === 'mail' && (
              <span className="absolute left-0 top-2 bottom-2 w-1 bg-sky-600 rounded-r-full" />
            )}
            <Mail className="w-4 h-4 text-sky-600" />
          </button>

          {/* 自定义工作台 */}
          <button
            onClick={() => onSelectTab('workspace')}
            title="自定义工作台与看板"
            className={`w-9 h-9 rounded-xl flex items-center justify-center relative transition-colors cursor-pointer ${
              activeTab === 'workspace'
                ? 'bg-slate-200 text-slate-900 font-bold shadow-2xs'
                : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
            }`}
          >
            {activeTab === 'workspace' && (
              <span className="absolute left-0 top-2 bottom-2 w-1 bg-emerald-600 rounded-r-full" />
            )}
            <LayoutTemplate className="w-4 h-4 text-emerald-600" />
          </button>

          {/* 连接器控制台 */}
          <button
            onClick={() => onSelectTab('dashboard')}
            title="CRM 连接器中心与登录状态"
            className={`w-9 h-9 rounded-xl flex items-center justify-center relative transition-colors cursor-pointer ${
              activeTab === 'dashboard'
                ? 'bg-slate-200 text-slate-900 font-bold shadow-2xs'
                : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
            }`}
          >
            {activeTab === 'dashboard' && (
              <span className="absolute left-0 top-2 bottom-2 w-1 bg-sky-600 rounded-r-full" />
            )}
            <LayoutDashboard className="w-4 h-4 text-sky-600" />
          </button>

          {/* 流程资产库 */}
          <button
            onClick={onOpenFlowManager}
            title="流程资产库 (自动流程 & 审批流)"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <Workflow className="w-4 h-4 text-teal-600" />
          </button>

          {/* 打印模板库 */}
          <button
            onClick={onOpenPrintManager}
            title="Word/Excel 打印模板库"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4 text-amber-600" />
          </button>

          {/* 对象与字段 */}
          <button
            onClick={() => onSelectTab('metadata')}
            title="对象与字段元数据管理"
            className={`w-9 h-9 rounded-xl flex items-center justify-center relative transition-colors cursor-pointer ${
              activeTab === 'metadata'
                ? 'bg-slate-200 text-slate-900 font-bold shadow-2xs'
                : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
            }`}
          >
            {activeTab === 'metadata' && (
              <span className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-500 rounded-r-full" />
            )}
            <Box className="w-4 h-4 text-indigo-500" />
          </button>

          {/* 数据中心 */}
          <button
            onClick={() => onSelectTab('data')}
            title="数据中心 (XOQL / SOQL / DML)"
            className={`w-9 h-9 rounded-xl flex items-center justify-center relative transition-colors cursor-pointer ${
              activeTab === 'data'
                ? 'bg-slate-200 text-slate-900 font-bold shadow-2xs'
                : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
            }`}
          >
            {activeTab === 'data' && (
              <span className="absolute left-0 top-2 bottom-2 w-1 bg-sky-600 rounded-r-full" />
            )}
            <Database className="w-4 h-4 text-sky-600" />
          </button>
        </div>

        {/* 底部: 设置、系统日志与连接状态小点 */}
        <div className="w-full flex flex-col items-center space-y-2 shrink-0 pb-1">
          {onOpenLogs && (
            <button
              onClick={onOpenLogs}
              title="查看软件运行日志"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              <FileText className="w-4 h-4" />
            </button>
          )}

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              title="系统与 AI 设置"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}

          {/* 用户与租户连接状态小点 */}
          <div
            title={`连接租户: ${activeTenantName} (${session.isLoggedIn ? '已登录' : '未登录'})`}
            className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 text-xs font-bold relative cursor-pointer"
            onClick={onOpenHistory}
          >
            {activeUserName.slice(0, 1)}
            <span
              className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${
                session.isLoggedIn ? 'bg-emerald-500' : 'bg-amber-400'
              }`}
            />
          </div>
        </div>
      </aside>
    );
  }

  // =========================================================================
  // 2. 展开态: 260px 沉浸式模块化侧栏 (含项目树与会话历史、星标、时间标签)
  // =========================================================================
  return (
    <aside className="w-64 opacity-100 translate-x-0 transition-all duration-200 ease-in-out bg-slate-50/95 border-r border-slate-200/90 flex flex-col h-screen select-none shrink-0 font-sans z-30 overflow-hidden relative">
      {/* 1. 顶部 Header (Codex 样式红绿灯安全边距、品牌下拉与搜索) */}
      <div className={`border-b border-slate-200/60 flex items-center justify-between shrink-0 px-3 ${
        isMac ? 'pt-8 pb-2.5 window-drag' : 'py-2.5'
      }`}>
        <div className="relative window-no-drag">
          <button
            onClick={() => setPresetDropdownOpen(!presetDropdownOpen)}
            className="flex items-center space-x-1.5 px-2 py-1 rounded-lg hover:bg-slate-200/60 transition-colors text-slate-800 text-sm font-bold cursor-pointer"
            title="点击切换 AI 智能体预设角色"
          >
            {session.environment?.productType === 'salesforce' ? (
              <span className="flex items-center space-x-1 text-cyan-700">
                <Cloud className="w-4 h-4 text-cyan-600" />
                <span>Salesforce</span>
              </span>
            ) : session.environment?.productType === 'fxiaoke' ? (
              <span className="flex items-center space-x-1 text-orange-700">
                <Flame className="w-4 h-4 text-orange-600" />
                <span>纷享销客</span>
              </span>
            ) : (
              <span className="flex items-center space-x-1 text-sky-800">
                <span>NeoCRM</span>
              </span>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {/* 角色与预设切换菜单 */}
          {presetDropdownOpen && (
            <div className="absolute left-0 top-full mt-1 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                选择智能体角色
              </div>
              {AI_AGENT_PRESETS.map((p: any) => {
                const Icon = getPresetIcon(p.iconName);
                const isSelected = p.id === selectedPresetId;
                const isLocked = p.id === 'autoflow-architect' || p.id === 'approval-architect' || p.id === 'neobi-architect' || p.id === 'nex-architect';

                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      if (isLocked && !workflowLicenseStatus?.isAuthorized) {
                        onOpenLicenseModal?.();
                        setPresetDropdownOpen(false);
                        return;
                      }
                      onSelectPreset(p.id);
                      setPresetDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between cursor-pointer ${
                      isSelected ? 'bg-sky-50 text-sky-700 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{p.name.split(' (')[0]}</span>
                    </div>
                    {isLocked ? (
                      workflowLicenseStatus?.isAuthorized ? (
                        <span
                          onClick={(e) => {
                            if (onOpenLicenseModal) {
                              e.stopPropagation();
                              onOpenLicenseModal();
                              setPresetDropdownOpen(false);
                            }
                          }}
                          className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono shrink-0 flex items-center space-x-0.5 hover:bg-emerald-100 transition-colors"
                          title="设备已绑定，点击查看有效天数或更换密码"
                        >
                          <Unlock className="w-2.5 h-2.5 text-emerald-600 mr-0.5" />
                          <span>剩{workflowLicenseStatus.remainingDays}天</span>
                        </span>
                      ) : (
                        <span
                          onClick={(e) => {
                            if (onOpenLicenseModal) {
                              e.stopPropagation();
                              onOpenLicenseModal();
                              setPresetDropdownOpen(false);
                            }
                          }}
                          className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-mono shrink-0 flex items-center space-x-0.5 hover:bg-amber-100 transition-colors"
                          title="已上锁，点击输入设备绑定密码激活"
                        >
                          <Lock className="w-2.5 h-2.5 text-amber-600 mr-0.5" />
                          <span>已上锁</span>
                        </span>
                      )
                    ) : (
                      p.badge && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 font-mono shrink-0">
                          {p.badge}
                        </span>
                      )
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center space-x-0.5 window-no-drag">
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            title="搜索会话"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <Search className="w-4 h-4" />
          </button>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              title={isMac ? '折叠侧边栏 (⌘B)' : '折叠侧边栏 (Ctrl+B)'}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2. 搜索条 (展开态) */}
      {searchOpen && (
        <div className="p-2 border-b border-slate-200/60 bg-white animate-in slide-in-from-top-1">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              autoFocus
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索所有对话..."
              className="w-full pl-8 pr-7 py-1 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-sky-400"
            />
            {keyword && (
              <button onClick={() => setKeyword('')} className="absolute right-2 top-2 text-slate-400 hover:text-slate-600">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. Codex 快捷导航条目 */}
      <div className="px-2 py-2 space-y-0.5 border-b border-slate-200/60">
        {/* New chat */}
        <button
          onClick={onNewChatDraft}
          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-between cursor-pointer ${
            activeTab === 'ai' && !activeSessionId
              ? 'bg-slate-200 text-slate-900 font-bold'
              : 'text-slate-800 hover:bg-slate-200/60'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <SquarePen className="w-4 h-4 text-slate-600" />
            <span>New chat</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            {isMac ? '⌥⌘N' : 'Ctrl+Alt+N'}
          </span>
        </button>

        {/* 会议助手 (类似飞书妙计) */}
        <button
          onClick={() => onSelectTab('meeting')}
          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${
            activeTab === 'meeting'
              ? 'bg-slate-200 text-slate-900 font-bold'
              : 'text-slate-700 hover:bg-slate-200/60 hover:text-slate-900'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <Mic className="w-4 h-4 text-indigo-600" />
            <span>会议助手 (妙计)</span>
          </div>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold">
            AI转写
          </span>
        </button>

        {/* Foxmail 智能邮件与人物画像 */}
        <button
          onClick={() => onSelectTab('mail')}
          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${
            activeTab === 'mail'
              ? 'bg-slate-200 text-slate-900 font-bold'
              : 'text-slate-700 hover:bg-slate-200/60 hover:text-slate-900'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <Mail className="w-4 h-4 text-sky-600" />
            <span>智能邮件 (Foxmail)</span>
          </div>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-sky-50 text-sky-700 border border-sky-200 font-bold">
            AI画像
          </span>
        </button>

        {/* 自定义工作台 */}
        <button
          onClick={() => onSelectTab('workspace')}
          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center space-x-2.5 cursor-pointer ${
            activeTab === 'workspace' ? 'bg-slate-200 text-slate-900 font-bold' : 'text-slate-700 hover:bg-slate-200/60 hover:text-slate-900'
          }`}
        >
          <LayoutTemplate className="w-4 h-4 text-emerald-600" />
          <span>自定义工作台</span>
        </button>

        {/* 控制台 & 会话 */}
        <button
          onClick={() => onSelectTab('dashboard')}
          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${
            activeTab === 'dashboard'
              ? 'bg-slate-200 text-slate-900 font-bold'
              : 'text-slate-700 hover:bg-slate-200/60 hover:text-slate-900'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <LayoutDashboard className="w-4 h-4 text-sky-600" />
            <span>控制台 & 会话</span>
          </div>
          {session.isLoggedIn && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </button>

        {/* 流程资产库 */}
        <button
          onClick={onOpenFlowManager}
          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-200/60 hover:text-slate-900 transition-colors flex items-center justify-between cursor-pointer"
        >
          <div className="flex items-center space-x-2.5">
            <Workflow className="w-4 h-4 text-teal-600" />
            <span>流程资产库</span>
          </div>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-teal-50 text-teal-700 border border-teal-200">
            Flows
          </span>
        </button>

        {/* 打印模板库 */}
        <button
          onClick={onOpenPrintManager}
          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-200/60 hover:text-slate-900 transition-colors flex items-center justify-between cursor-pointer"
        >
          <div className="flex items-center space-x-2.5">
            <Printer className="w-4 h-4 text-amber-600" />
            <span>打印模板库</span>
          </div>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200">
            Print
          </span>
        </button>

        {/* 对象与字段元数据 */}
        <button
          onClick={() => onSelectTab('metadata')}
          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center space-x-2.5 cursor-pointer ${
            activeTab === 'metadata'
              ? 'bg-slate-200 text-slate-900 font-bold'
              : 'text-slate-700 hover:bg-slate-200/60 hover:text-slate-900'
          }`}
        >
          <Box className="w-4 h-4 text-indigo-500" />
          <span>对象与字段管理</span>
        </button>

        {/* 数据中心 (XOQL) */}
        <button
          onClick={() => onSelectTab('data')}
          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center space-x-2.5 cursor-pointer ${
            activeTab === 'data'
              ? 'bg-slate-200 text-slate-900 font-bold'
              : 'text-slate-700 hover:bg-slate-200/60 hover:text-slate-900'
          }`}
        >
          <Database className="w-4 h-4 text-sky-600" />
          <span>数据中心 (DML/SQL)</span>
        </button>
      </div>

      {/* 4. Projects 本地项目工作区文件夹列表 (对齐 Codex 多项目目录树与会话历史) */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        <div className="px-2 pt-1 pb-1 flex items-center justify-between text-[11px] font-semibold text-slate-400">
          <div className="flex items-center space-x-1">
            <span>Projects</span>
            <span className="font-mono text-[10px] text-slate-400">({projects.length})</span>
          </div>
          {onOpenCreateProject && (
            <button
              onClick={onOpenCreateProject}
              title="添加 / 关联本地项目文件夹"
              className="p-1 rounded-md hover:bg-slate-200/70 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 渲染所有关联的本地项目文件夹 */}
        {projects.length === 0 ? (
          <div className="py-6 text-center text-[11px] text-slate-400">
            暂无项目，点击右上角「+」关联本地文件夹
          </div>
        ) : (
          projects.map((proj) => {
            const isExpanded = expandedProjectIds.includes(proj.id);
            const isCurrentActive = activeProjectId === proj.id;
            const projSessions = filteredSessions.filter((s) => s.projectId === proj.id || (!s.projectId && (proj.isDefault || proj === projects[0])));

            return (
              <div key={proj.id} className="space-y-0.5">
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleProjectExpand(proj.id);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onSelectProject?.(proj.id);
                  }}
                  title={`本地路径: ${proj.localPath}\n• 单击: 展开/收起目录\n• 双击: 切换为当前工作区项目`}
                  className={`group px-2 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors select-none ${
                    isCurrentActive
                      ? 'bg-amber-50/80 text-amber-900 border border-amber-200/70 shadow-2xs'
                      : 'hover:bg-slate-200/60 text-slate-700'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate min-w-0 pr-1">
                    {isExpanded ? (
                      <FolderOpen className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    ) : (
                      <Folder className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    )}
                    <span className="truncate">{proj.name}</span>
                    {isCurrentActive && (
                      <span className="text-[9px] font-normal px-1 rounded bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                        当前
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-0.5 shrink-0">
                    {/* 在系统访达/资源管理器中打开 */}
                    {onOpenFolderInExplorer && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenFolderInExplorer(proj.localPath);
                        }}
                        title={`在访达/资源管理器中打开: ${proj.localPath}`}
                        className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    )}
                    {/* 编辑项目 */}
                    {onEditProject && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditProject(proj);
                        }}
                        title="编辑项目信息"
                        className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Edit3 className="w-2.5 h-2.5" />
                      </button>
                    )}
                    {/* 移除项目 */}
                    {onDeleteProject && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteProject(proj.id);
                        }}
                        title="从工作台移除项目"
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    )}
                    {/* 展开/收起箭头 */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleProjectExpand(proj.id);
                      }}
                      title={isExpanded ? '收起目录' : '展开目录'}
                      className="p-0.5 rounded hover:bg-slate-300/40 cursor-pointer"
                    >
                      <ChevronRight
                        className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      />
                    </div>
                  </div>
                </div>

                {/* 项目展开下的子会话列表 (Codex 样式，含星标和相对时间戳) */}
                {isExpanded && (
                  <div className="pl-3 space-y-0.5">
                    {projSessions.length === 0 ? (
                      <div className="py-2 pl-3 text-[10px] text-slate-400 italic">
                        暂无会话，点击 New chat 在此项目下提问
                      </div>
                    ) : (
                      projSessions.map((sess) => {
                        const isActive = activeTab === 'ai' && activeSessionId === sess.id;
                        const isEditing = editingId === sess.id;
                        const relTime = formatRelativeTime(sess.updatedAt || sess.createdAt);

                        return (
                          <div
                            key={sess.id}
                            onClick={() => onSelectSession(sess.id)}
                            className={`group relative px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-all flex items-center justify-between ${
                              isActive
                                ? 'bg-slate-200/90 text-slate-900 font-semibold shadow-2xs'
                                : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
                            }`}
                          >
                            <div className="flex items-center space-x-1.5 min-w-0 flex-1">
                              {isActive ? (
                                <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                              ) : (
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-slate-400 shrink-0" />
                              )}
                              {isEditing ? (
                                <form onSubmit={(e) => handleSaveRename(sess.id, e)} className="flex items-center space-x-1 flex-1">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={editingTitle}
                                    onChange={(e) => setEditingTitle(e.target.value)}
                                    className="w-full px-1.5 py-0.5 text-xs rounded border border-sky-400 focus:outline-none bg-white font-normal"
                                  />
                                  <button type="submit" className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded">
                                    <Check className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingId(null);
                                    }}
                                    className="p-0.5 text-slate-400 hover:bg-slate-100 rounded"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </form>
                              ) : (
                                <span className="truncate flex-1">{sess.title}</span>
                              )}
                            </div>

                            {/* 相对时间标签与悬停操作 */}
                            {!isEditing && (
                              <div className="flex items-center space-x-1 shrink-0 ml-1">
                                {relTime && (
                                  <span className="text-[10px] text-slate-400 font-mono group-hover:hidden">
                                    {relTime}
                                  </span>
                                )}
                                <div className="hidden group-hover:flex items-center space-x-0.5">
                                  <button
                                    onClick={(e) => handleStartRename(sess, e)}
                                    title="重命名"
                                    className="p-1 text-slate-400 hover:text-slate-700 hover:bg-white rounded"
                                  >
                                    <Edit3 className="w-2.5 h-2.5" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeleteSession(sess.id);
                                    }}
                                    title="删除"
                                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                                  >
                                    <Trash2 className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 5. 底部账号与系统设置栏 (Codex 底栏胶囊) */}
      <div className="p-2 border-t border-slate-200/70 bg-slate-100/60 flex items-center justify-between text-xs text-slate-600">
        <div className="flex items-center space-x-2 truncate min-w-0">
          <div className={`w-2 h-2 rounded-full shrink-0 ${session.isLoggedIn ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
          <span className="font-semibold text-slate-800 truncate text-[11px]">{activeUserName}</span>
          <span className="text-[10px] font-mono text-slate-400 truncate max-w-[70px]">
            {session.tokenData?.tenant_id ? String(session.tokenData.tenant_id).slice(-4) : 'dev'}
          </span>
        </div>

        <div className="flex items-center space-x-0.5 shrink-0">
          {/* 账号历史 */}
          <button
            onClick={onOpenHistory}
            title="账号历史与快速切换"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <History className="w-3.5 h-3.5" />
          </button>

          {/* 版本检查 */}
          <button
            onClick={onCheckUpdate}
            title="检查软件更新"
            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white hover:bg-slate-200/80 text-slate-600 border border-slate-200/80 transition-colors flex items-center space-x-0.5 cursor-pointer"
          >
            <span>{appVersion}</span>
            {hasUpdate && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />}
          </button>

          {/* 软件运行日志 */}
          <button
            onClick={onOpenLogs}
            title="软件运行日志 (诊断排查、导出与系统输出)"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>

          {/* 系统设置 */}
          <button
            onClick={onOpenSettings}
            title="系统与 AI 设置"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          {/* 帮助文档 */}
          <button
            onClick={onOpenDocs}
            title="销售易 PaaS 文档"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
};
