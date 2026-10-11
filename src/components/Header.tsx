import React from 'react';
import { 
  History, 
  HelpCircle, 
  Minus, 
  Square, 
  X,
  Database,
  Box,
  LayoutDashboard,
  Sparkles,
  Settings
} from 'lucide-react';
import { SessionState } from '../../shared/types';

export type AppNavTab = 'dashboard' | 'metadata' | 'data' | 'ai' | 'settings';

interface HeaderProps {
  platform: string;
  session: SessionState;
  activeTab: AppNavTab;
  onTabChange: (tab: AppNavTab) => void;
  onOpenHistory: () => void;
  onOpenDocs: () => void;
  hasUpdate?: boolean;
  onCheckUpdate: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  platform, 
  session, 
  activeTab, 
  onTabChange, 
  onOpenHistory, 
  onOpenDocs, 
  hasUpdate = false, 
  onCheckUpdate 
}) => {
  const isMac = platform === 'darwin';

  const handleDoubleClick = () => {
    window.neoApi?.maximizeWindow?.();
  };

  return (
    <header 
      onDoubleClick={handleDoubleClick}
      className={`h-14 border-b border-slate-200 bg-white/95 backdrop-blur flex items-center justify-between px-4 z-20 select-none window-drag shadow-xs ${
        isMac ? 'pl-20' : ''
      }`}
    >
      {/* 品牌与标题 */}
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-600 to-blue-500 flex items-center justify-center shadow-md shadow-sky-500/20 text-white font-bold text-sm tracking-wider window-no-drag">
          NEO
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-800 text-sm tracking-wide">NeoCRM 开发者工作台</span>
            <button
              onClick={onCheckUpdate}
              title="点击检查最新版本"
              className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 window-no-drag font-medium transition-colors flex items-center space-x-1"
            >
              <span>v1.3.1</span>
              {hasUpdate ? (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              ) : null}
            </button>
          </div>
          <p className="text-[11px] text-slate-500">元数据管理 • 业务数据中心 • AI Harness</p>
        </div>
      </div>

      {/* 中部导航切换 Tab */}
      <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200 window-no-drag">
        <button
          onClick={() => onTabChange('dashboard')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'dashboard'
              ? 'bg-white text-sky-600 shadow-sm border border-slate-200/80 font-semibold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          <span>控制台 & 会话</span>
        </button>

        <button
          onClick={() => onTabChange('metadata')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'metadata'
              ? 'bg-white text-sky-600 shadow-sm border border-slate-200/80 font-semibold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Box className="w-3.5 h-3.5" />
          <span>对象与字段管理</span>
        </button>

        <button
          onClick={() => onTabChange('data')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'data'
              ? 'bg-white text-sky-600 shadow-sm border border-slate-200/80 font-semibold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>数据中心 (DML)</span>
        </button>

        <button
          onClick={() => onTabChange('ai')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'ai'
              ? 'bg-white text-sky-600 shadow-sm border border-slate-200/80 font-semibold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-sky-600" />
          <span>AI 对话平台</span>
        </button>

        <button
          onClick={() => onTabChange('settings')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'settings'
              ? 'bg-white text-sky-600 shadow-sm border border-slate-200/80 font-semibold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>系统设置</span>
        </button>
      </div>

      {/* 右侧操作区 */}
      <div className="flex items-center space-x-2 window-no-drag">
        {/* 登录状态胶囊 */}
        {session.isLoggedIn ? (
          <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="max-w-[130px] truncate">
              {session.tokenData?.userInfo?.tenantName || session.environment?.name}
            </span>
          </div>
        ) : (
          <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            <span>未授权</span>
          </div>
        )}

        {/* 历史账号弹窗入口 */}
        <button
          onClick={onOpenHistory}
          title="历史登录与多账号切换"
          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors flex items-center space-x-1 text-xs"
        >
          <History className="w-4 h-4" />
          <span className="hidden sm:inline">账号历史</span>
        </button>

        {/* 帮助文档 */}
        <button
          onClick={onOpenDocs}
          title="查看销售易 PaaS 开发文档"
          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <HelpCircle className="w-4 h-4" />
        </button>

        {/* Windows 窗口控制按键 */}
        {!isMac && (
          <div className="flex items-center pl-2 ml-1 border-l border-slate-200 space-x-1">
            <button
              onClick={() => window.neoApi.minimizeWindow()}
              title="最小化"
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => window.neoApi.maximizeWindow()}
              title="最大化 / 还原"
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors"
            >
              <Square className="w-3 h-3" />
            </button>
            <button
              onClick={() => window.neoApi.closeWindow()}
              title="关闭"
              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
