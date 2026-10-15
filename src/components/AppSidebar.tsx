import React, { useState, useEffect } from 'react';
import { 
  SquarePen, 
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
  Minus,
  Square,
  ShieldCheck,
  MoreHorizontal
} from 'lucide-react';
import { 
  AiChatSession, 
  AiAgentPreset, 
  WorkflowLicenseStatus, 
  SessionState, 
  NeoEnvironment,
  WorkspaceProject 
} from '../../shared/types';
import { Plus, ExternalLink, FolderPlus, Plug, Cloud, Flame } from 'lucide-react';
import { AI_AGENT_PRESETS } from '../../shared/constants';

export type AppNavTab = 'dashboard' | 'metadata' | 'data' | 'ai';

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
  projects?: WorkspaceProject[];
  activeProjectId?: string | null;
  onSelectProject?: (projectId: string) => void;
  onOpenCreateProject?: () => void;
  onEditProject?: (project: WorkspaceProject) => void;
  onDeleteProject?: (projectId: string) => void;
  onOpenFolderInExplorer?: (folderPath: string) => void;
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
  projects = [],
  activeProjectId,
  onSelectProject,
  onOpenCreateProject,
  onEditProject,
  onDeleteProject,
  onOpenFolderInExplorer,
}) => {
  const isMac = platform === 'darwin';
  const [keyword, setKeyword] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [expandedProjectIds, setExpandedProjectIds] = useState<string[]>([]);

  // 默认展开所有项目
  useEffect(() => {
    if (projects.length > 0 && expandedProjectIds.length === 0) {
      setExpandedProjectIds(projects.map((p) => p.id));
    }
  }, [projects.length]);

  const toggleProjectExpand = (id: string) => {
    setExpandedProjectIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };
  const [presetDropdownOpen, setPresetDropdownOpen] = useState(false);

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
  const activeTenantName = session.tokenData?.userInfo?.tenantName || session.environment?.name || 'neoCRM-DEV';
  const activeUserName = session.tokenData?.userInfo?.name || (session.isLoggedIn ? '已登录' : '未登录');

  return (
    <div className="w-64 bg-slate-50 border-r border-slate-200/90 flex flex-col h-screen select-none shrink-0 font-sans z-30">
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
                const isFlow = p.id === 'autoflow-architect' || p.id === 'approval-architect';

                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      if (isFlow && !workflowLicenseStatus?.isAuthorized) {
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
                    {isFlow ? (
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

        <button
          onClick={() => setSearchOpen(!searchOpen)}
          title="搜索会话"
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer window-no-drag"
        >
          <Search className="w-4 h-4" />
        </button>
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

      {/* 3. Codex 快捷导航条目 (全部功能移至此处) */}
      <div className="px-2 py-2 space-y-0.5 border-b border-slate-200/60">
        {/* New chat */}
        <button
          onClick={onNewChatDraft}
          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-2.5 cursor-pointer ${
            activeTab === 'ai' && !activeSessionId
              ? 'bg-slate-200 text-slate-900 font-bold'
              : 'text-slate-800 hover:bg-slate-200/60'
          }`}
        >
          <SquarePen className="w-4 h-4 text-slate-600" />
          <span>New chat</span>
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

      {/* 4. Projects 本地项目工作区文件夹列表 (完全对齐 Codex 多项目本地目录树) */}
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
            // 过滤属于当前项目的会话 (未分配项目时默认归入 default 项目)
            const projSessions = filteredSessions.filter((s) => s.projectId === proj.id || (!s.projectId && proj.isDefault));

            return (
              <div key={proj.id} className="space-y-0.5">
                <div
                  onClick={() => {
                    onSelectProject?.(proj.id);
                    toggleProjectExpand(proj.id);
                  }}
                  title={`本地路径: ${proj.localPath}`}
                  className={`group px-2 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${
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
                    {/* 移除项目 (默认项目不可删除) */}
                    {!proj.isDefault && onDeleteProject && (
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
                    <ChevronRight
                      className={`w-3 h-3 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                  </div>
                </div>

                {/* 项目展开下的子会话列表 (Codex Pill 样式) */}
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
                            <div className="flex items-center space-x-2 min-w-0 flex-1">
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
                                <span className="truncate">{sess.title}</span>
                              )}
                            </div>

                            {/* 悬停快捷重命名与删除 */}
                            {!isEditing && (
                              <div className="hidden group-hover:flex items-center space-x-0.5 shrink-0 ml-1">
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
            <span>v1.4.0</span>
            {hasUpdate && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />}
          </button>

          {/* 系统设置 (弹窗展示，含模型、插件扩展、技能库) */}
          <button
            onClick={onOpenSettings}
            title="系统与 AI 设置 (含模型供应商、插件扩展中心、技能库与系统偏好)"
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
    </div>
  );
};
