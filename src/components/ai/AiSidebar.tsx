import React, { useState } from 'react';
import { AiChatSession, AiAgentPreset, WorkflowLicenseStatus, SessionState } from '../../../shared/types';
import { 
  SquarePen,
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
  BarChart3,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Compass,
  Plug,
  Settings,
  ShieldCheck,
  User,
  History,
  MoreHorizontal
} from 'lucide-react';

interface AiSidebarProps {
  sessions: AiChatSession[];
  activeSessionId: string | null;
  presets: AiAgentPreset[];
  selectedPresetId: string;
  crmSession?: SessionState;
  onSelectSession: (sessionId: string) => void;
  onNewChatDraft: () => void;
  onDeleteSession: (sessionId: string) => void;
  onUpdateSessionTitle: (sessionId: string, title: string) => void;
  onClearSessions: () => void;
  onSelectPreset: (presetId: string) => void;
  onOpenFlowManager?: () => void;
  onOpenPrintManager?: () => void;
  onOpenMetadata?: () => void;
  onOpenData?: () => void;
  onOpenSettings?: () => void;
  workflowLicenseStatus?: WorkflowLicenseStatus | null;
  streamingSessionIds?: string[];
}

export const AiSidebar: React.FC<AiSidebarProps> = ({
  sessions,
  activeSessionId,
  presets,
  selectedPresetId,
  crmSession,
  onSelectSession,
  onNewChatDraft,
  onDeleteSession,
  onUpdateSessionTitle,
  onClearSessions,
  onSelectPreset,
  onOpenFlowManager,
  onOpenPrintManager,
  onOpenMetadata,
  onOpenData,
  onOpenSettings,
  workflowLicenseStatus,
  streamingSessionIds = [],
}) => {
  const [keyword, setKeyword] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [isProjectExpanded, setIsProjectExpanded] = useState(true);
  const [presetDropdownOpen, setPresetDropdownOpen] = useState(false);

  const getPresetIcon = (iconName: string) => {
    switch (iconName) {
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
      case 'BarChart3':
        return BarChart3;
      case 'LayoutTemplate':
        return LayoutTemplate;
      default:
        return Sparkles;
    }
  };

  const handleStartRename = (session: AiChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(session.id);
    setEditingTitle(session.title);
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

  const currentPreset = presets.find((p) => p.id === selectedPresetId) || presets[0];
  const activeTenantName = crmSession?.tokenData?.userInfo?.tenantName || crmSession?.environment?.name || 'neoCRM-DEV';
  const activeUserName = crmSession?.tokenData?.userInfo?.name || '开发者';

  return (
    <div className="w-64 bg-slate-50/80 border-r border-slate-200/90 flex flex-col h-full select-none shrink-0 font-sans">
      {/* 1. 顶部 Header (Codex 样式品牌下拉与搜索) */}
      <div className="h-12 px-3 border-b border-slate-200/60 flex items-center justify-between shrink-0">
        <div className="relative">
          <button
            onClick={() => setPresetDropdownOpen(!presetDropdownOpen)}
            className="flex items-center space-x-1.5 px-2 py-1 rounded-lg hover:bg-slate-200/60 transition-colors text-slate-800 text-sm font-bold cursor-pointer"
          >
            <span>NeoCRM</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
          </button>

          {/* 角色与环境切换下拉菜单 */}
          {presetDropdownOpen && (
            <div className="absolute left-0 top-full mt-1 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                选择智能体角色
              </div>
              {presets.map((p) => {
                const Icon = getPresetIcon(p.iconName);
                const isSelected = p.id === selectedPresetId;
                const isLocked = (p.id === 'autoflow-architect' || p.id === 'approval-architect' || p.id === 'neobi-architect' || p.id === 'nex-architect') && !workflowLicenseStatus?.isAuthorized;

                return (
                  <button
                    key={p.id}
                    onClick={() => {
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
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 font-mono">锁</span>
                    ) : (
                      p.badge && <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500">{p.badge}</span>
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
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer"
        >
          <Search className="w-4 h-4" />
        </button>
      </div>

      {/* 2. 快捷搜索输入框 (展开态) */}
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

      {/* 3. Codex 快捷导航条目 (New Chat / 流程库 / 模板库 / 插件 / 探索) */}
      <div className="px-2 py-2 space-y-0.5 border-b border-slate-200/60">
        <button
          onClick={onNewChatDraft}
          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-800 hover:bg-slate-200/60 transition-colors flex items-center space-x-2.5 cursor-pointer group"
        >
          <SquarePen className="w-4 h-4 text-slate-600 group-hover:text-slate-900" />
          <span>New chat</span>
        </button>

        {onOpenFlowManager && (
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
        )}

        {onOpenPrintManager && (
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
        )}

        {onOpenMetadata && (
          <button
            onClick={onOpenMetadata}
            className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-200/60 hover:text-slate-900 transition-colors flex items-center space-x-2.5 cursor-pointer"
          >
            <Box className="w-4 h-4 text-indigo-500" />
            <span>对象与元数据</span>
          </button>
        )}

        {onOpenData && (
          <button
            onClick={onOpenData}
            className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-200/60 hover:text-slate-900 transition-colors flex items-center space-x-2.5 cursor-pointer"
          >
            <Database className="w-4 h-4 text-sky-600" />
            <span>数据中心 (XOQL)</span>
          </button>
        )}
      </div>

      {/* 4. Projects 租户与会话树形列表 (Codex 核心设计) */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {/* Projects 组标题 */}
        <div className="px-2 pt-1 pb-1 flex items-center justify-between text-[11px] font-semibold text-slate-400">
          <span>Projects</span>
          {validSessions.length > 0 && (
            <span className="font-mono text-[10px] text-slate-400">{validSessions.length}</span>
          )}
        </div>

        {/* 主项目文件夹 (当前租户或开发项目) */}
        <div className="space-y-0.5">
          <div
            onClick={() => setIsProjectExpanded(!isProjectExpanded)}
            className="px-2 py-1 rounded-lg hover:bg-slate-200/60 text-slate-700 text-xs font-semibold flex items-center justify-between cursor-pointer group"
          >
            <div className="flex items-center space-x-2 truncate">
              {isProjectExpanded ? (
                <FolderOpen className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              ) : (
                <Folder className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              )}
              <span className="truncate">{activeTenantName}</span>
            </div>
            <ChevronRight
              className={`w-3 h-3 text-slate-400 transition-transform ${isProjectExpanded ? 'rotate-90' : ''}`}
            />
          </div>

          {/* 文件夹展开下的子会话列表 (Codex Pill 样式) */}
          {isProjectExpanded && (
            <div className="pl-2 space-y-0.5">
              {filteredSessions.length === 0 ? (
                <div className="py-4 text-center text-[11px] text-slate-400">
                  {keyword ? '无匹配会话' : '点击 New chat 开始新对话'}
                </div>
              ) : (
                filteredSessions.map((session) => {
                  const isActive = activeSessionId === session.id;
                  const isEditing = editingId === session.id;

                  return (
                    <div
                      key={session.id}
                      onClick={() => onSelectSession(session.id)}
                      className={`group relative px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-all flex items-center justify-between ${
                        isActive
                          ? 'bg-slate-200/90 text-slate-900 font-semibold shadow-2xs'
                          : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
                      }`}
                    >
                      <div className="flex items-center space-x-2 min-w-0 flex-1">
                        {isEditing ? (
                          <form onSubmit={(e) => handleSaveRename(session.id, e)} className="flex items-center space-x-1 flex-1">
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
                          <>
                            <span className="truncate flex-1">{session.title}</span>
                            {streamingSessionIds.includes(session.id) && (
                              <span className="flex items-center space-x-1 shrink-0 px-1.5 py-0.2 rounded-full bg-sky-100 text-sky-700 text-[10px] font-medium border border-sky-200" title="该对话正在后台自主执行推进中">
                                <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                                <span>推进中</span>
                              </span>
                            )}
                          </>
                        )}
                      </div>

                      {/* 悬停快捷重命名与删除 */}
                      {!isEditing && (
                        <div className="hidden group-hover:flex items-center space-x-0.5 shrink-0 ml-1">
                          <button
                            onClick={(e) => handleStartRename(session, e)}
                            title="重命名"
                            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-white rounded"
                          >
                            <Edit3 className="w-2.5 h-2.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteSession(session.id);
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
      </div>

      {/* 5. 底部账号与设置栏 (Codex 底栏胶囊) */}
      <div className="p-2 border-t border-slate-200/70 bg-slate-100/60 flex items-center justify-between text-xs text-slate-600">
        <div className="flex items-center space-x-2 truncate">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span className="font-semibold text-slate-800 truncate text-[11px]">{activeUserName}</span>
          <span className="text-[10px] font-mono text-slate-400 truncate max-w-[80px]">
            {crmSession?.tokenData?.tenant_id ? String(crmSession.tokenData.tenant_id).slice(-4) : 'dev'}
          </span>
        </div>

        <div className="flex items-center space-x-1">
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              title="设置"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
