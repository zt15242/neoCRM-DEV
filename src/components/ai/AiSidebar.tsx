import React, { useState } from 'react';
import { AiChatSession, AiAgentPreset, WorkflowLicenseStatus } from '../../../shared/types';
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit3, 
  Sparkles, 
  Database, 
  Box, 
  Code2, 
  BrainCircuit, 
  MessageSquare,
  Check,
  X,
  Lock,
  Unlock,
  Workflow,
  FileCheck,
  Layers
} from 'lucide-react';

interface AiSidebarProps {
  sessions: AiChatSession[];
  activeSessionId: string | null;
  presets: AiAgentPreset[];
  selectedPresetId: string;
  onSelectSession: (sessionId: string) => void;
  onNewChatDraft: () => void;
  onDeleteSession: (sessionId: string) => void;
  onUpdateSessionTitle: (sessionId: string, title: string) => void;
  onClearSessions: () => void;
  onSelectPreset: (presetId: string) => void;
  onOpenFlowManager?: () => void;
  workflowLicenseStatus?: WorkflowLicenseStatus | null;
}

export const AiSidebar: React.FC<AiSidebarProps> = ({
  sessions,
  activeSessionId,
  presets,
  selectedPresetId,
  onSelectSession,
  onNewChatDraft,
  onDeleteSession,
  onUpdateSessionTitle,
  onClearSessions,
  onSelectPreset,
  onOpenFlowManager,
  workflowLicenseStatus,
}) => {
  const [keyword, setKeyword] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const getPresetIcon = (iconName: string) => {
    switch (iconName) {
      case 'Workflow':
        return Workflow;
      case 'FileCheck':
        return FileCheck;
      case 'Sparkles':
        return Sparkles;
      case 'Database':
        return Database;
      case 'Box':
        return Box;
      case 'Code2':
        return Code2;
      case 'BrainCircuit':
        return BrainCircuit;
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

  // 关键：仅展示有实际消息内容的有效会话，彻底避免空会话堆积
  const validSessions = sessions.filter((s) => s.messages && s.messages.length > 0);

  const filteredSessions = validSessions.filter((s) => {
    if (!keyword.trim()) return true;
    return s.title.toLowerCase().includes(keyword.toLowerCase());
  });

  return (
    <div className="w-72 bg-white border-r border-slate-200 flex flex-col h-full select-none shrink-0">
      {/* 顶部操作区 */}
      <div className="p-3 border-b border-slate-100 space-y-2">
        <div className="flex items-center space-x-1.5">
          <button
            onClick={onNewChatDraft}
            className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>新建 AI 对话</span>
          </button>
          {onOpenFlowManager && (
            <button
              onClick={onOpenFlowManager}
              title="查看与管理租户现有工作流和审批流"
              className="py-2 px-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-center space-x-1 transition-all cursor-pointer shadow-2xs shrink-0"
            >
              <Layers className="w-3.5 h-3.5 text-teal-600" />
              <span>流程库</span>
            </button>
          )}
        </div>

        {/* 会话过滤搜索 */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索历史会话..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50/60 focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>

      {/* 智能体预设角色切换 */}
      <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/40">
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 px-1">
          智能体预设角色 (Harness Presets)
        </div>
        <div className="space-y-1">
          {presets.map((preset) => {
            const Icon = getPresetIcon(preset.iconName);
            const isSelected = selectedPresetId === preset.id && !preset.disabled;
            const isDisabled = Boolean(preset.disabled);

            if (isDisabled) {
              return (
                <div
                  key={preset.id}
                  title={preset.disabledReason || '该功能暂未开放'}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between opacity-50 cursor-not-allowed bg-slate-100/40 text-slate-400 border border-transparent select-none"
                >
                  <div className="flex items-center space-x-2 truncate">
                    <Icon className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    <span className="truncate line-through text-slate-400">{preset.name.split(' (')[0]}</span>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-500 font-mono shrink-0">
                    暂未开放
                  </span>
                </div>
              );
            }

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectPreset(preset.id)}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-sky-50 text-sky-700 border border-sky-200 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
                }`}
              >
                <div className="flex items-center space-x-2 truncate">
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-sky-600' : 'text-slate-500'}`} />
                  <span className="truncate">{preset.name.split(' (')[0]}</span>
                </div>
                {(preset.id === "autoflow-architect" || preset.id === "approval-architect") ? (
                  workflowLicenseStatus?.isAuthorized ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono shrink-0 flex items-center space-x-0.5">
                      <Unlock className="w-2.5 h-2.5 mr-0.5" />
                      <span>剩{workflowLicenseStatus.remainingDays}天</span>
                    </span>
                  ) : (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-mono shrink-0 flex items-center space-x-0.5">
                      <Lock className="w-2.5 h-2.5 mr-0.5" />
                      <span>已上锁</span>
                    </span>
                  )
                ) : (
                  preset.badge && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-200/80 text-slate-600 font-mono shrink-0">
                      {preset.badge}
                    </span>
                  )
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 历史会话列表 */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 px-2">
          对话记录 ({validSessions.length})
        </div>

        {filteredSessions.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            {keyword ? '未搜到相关会话' : '暂无对话记录，在下方输入消息开始'}
          </div>
        ) : (
          filteredSessions.map((session) => {
            const isActive = activeSessionId === session.id;
            const isEditing = editingId === session.id;

            return (
              <div
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                className={`group relative rounded-xl px-2.5 py-2 text-xs cursor-pointer transition-all flex items-center justify-between ${
                  isActive
                    ? 'bg-sky-50/80 text-sky-900 font-medium border border-sky-200/80 shadow-2xs'
                    : 'text-slate-700 hover:bg-slate-50 border border-transparent'
                }`}
              >
                <div className="flex items-center space-x-2 min-w-0 flex-1">
                  <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-sky-600' : 'text-slate-400'}`} />
                  {isEditing ? (
                    <form onSubmit={(e) => handleSaveRename(session.id, e)} className="flex items-center space-x-1 flex-1">
                      <input
                        type="text"
                        autoFocus
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        className="w-full px-1.5 py-0.5 text-xs rounded border border-sky-400 focus:outline-none bg-white"
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
                    <span className="truncate">{session.title}</span>
                  )}
                </div>

                {/* 悬停操作按钮 */}
                {!isEditing && (
                  <div className="hidden group-hover:flex items-center space-x-1 shrink-0 ml-1">
                    <button
                      onClick={(e) => handleStartRename(session, e)}
                      title="重命名会话"
                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-white rounded transition-colors"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(session.id);
                      }}
                      title="删除会话"
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 底部清理操作 */}
      {validSessions.length > 0 && (
        <div className="p-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 px-3">
          <span>共 {validSessions.length} 个对话</span>
          <button
            onClick={onClearSessions}
            className="hover:text-rose-600 transition-colors flex items-center space-x-1 text-[11px] cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
            <span>清空所有</span>
          </button>
        </div>
      )}
    </div>
  );
};
