import React, { useState } from 'react';
import { 
  Inbox, 
  Send, 
  FileEdit, 
  Star, 
  Trash2, 
  Users, 
  PenSquare, 
  RefreshCw, 
  ShieldCheck, 
  ChevronDown,
  Mail,
  UserCheck,
  Plus,
  Check,
  MoreVertical,
  AlertCircle
} from 'lucide-react';
import { EmailFolder, EmailAccount, EmailItem } from '../../../shared/mailTypes';

interface MailFolderNavProps {
  currentFolder: EmailFolder | 'personas';
  onSelectFolder: (folder: EmailFolder | 'personas') => void;
  accounts: EmailAccount[];
  activeAccountId: string; // 'all' 或具体 accountId
  onSelectAccount: (accountId: string) => void;
  emails: EmailItem[];
  onOpenCompose: () => void;
  onSyncEmails: () => void;
  onOpenAddAccountModal: () => void;
  onDeleteAccount?: (accountId: string) => void;
  isSyncing?: boolean;
}

export const MailFolderNav: React.FC<MailFolderNavProps> = ({
  currentFolder,
  onSelectFolder,
  accounts,
  activeAccountId,
  onSelectAccount,
  emails,
  onOpenCompose,
  onSyncEmails,
  onOpenAddAccountModal,
  onDeleteAccount,
  isSyncing = false,
}) => {
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);

  const activeAccount = accounts.find((a) => a.id === activeAccountId) || null;

  // 根据当前选中的账户过滤邮件
  const scopedEmails = activeAccountId === 'all'
    ? emails
    : emails.filter((e) => e.accountId === activeAccountId);

  // 统计各文件夹未读/总数
  const inboxUnread = scopedEmails.filter((e) => e.folder === 'inbox' && !e.isRead).length;
  const starredCount = scopedEmails.filter((e) => e.isStarred && e.folder !== 'trash').length;
  const draftsCount = scopedEmails.filter((e) => e.folder === 'drafts').length;
  const sentCount = scopedEmails.filter((e) => e.folder === 'sent').length;
  const trashCount = scopedEmails.filter((e) => e.folder === 'trash').length;
  const visibleAccounts = activeAccountId === 'all'
    ? accounts
    : accounts.filter((account) => account.id === activeAccountId);
  const remoteFolders = visibleAccounts.flatMap((account) =>
    (account.remoteFolders || []).map((folder) => ({
      ...folder,
      accountName: account.name || account.email,
      count: scopedEmails.filter((email) => email.folder === folder.key).length,
    }))
  );

  return (
    <div className="w-60 h-full flex flex-col bg-[#0f172a] text-slate-300 border-r border-slate-800 select-none shrink-0 font-sans">
      {/* 1. 顶部写信与收取快捷操作条 (Foxmail 标志性大按钮) */}
      <div className="p-3 border-b border-slate-800/80 space-y-2">
        <button
          type="button"
          onClick={onOpenCompose}
          className="w-full py-2 px-3 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center space-x-2 cursor-pointer active:scale-98"
        >
          <PenSquare className="w-4 h-4" />
          <span>写 邮 件</span>
        </button>

        <button
          type="button"
          onClick={onSyncEmails}
          disabled={isSyncing}
          className="w-full py-1.5 px-3 bg-slate-800/90 hover:bg-slate-700/80 text-slate-200 rounded-xl font-medium text-xs transition-colors flex items-center justify-center space-x-2 cursor-pointer border border-slate-700/60 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? '正在连接收信...' : '收取邮件'}</span>
        </button>
      </div>

      {/* 2. 当前选中邮箱账号名牌 & 多账号切换下拉 */}
      <div className="relative border-b border-slate-800/80">
        {accounts.length === 0 ? (
          <div
            onClick={onOpenAddAccountModal}
            className="p-3 flex items-center justify-between hover:bg-slate-800/60 transition-colors cursor-pointer text-xs"
          >
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 shrink-0">
                <Plus className="w-4 h-4" />
              </div>
              <div className="truncate min-w-0">
                <div className="font-semibold text-sky-400 truncate">+ 添加邮箱账号</div>
                <div className="text-[10px] text-slate-500 truncate">暂未登录任何邮箱</div>
              </div>
            </div>
          </div>
        ) : (
          <div
            onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)}
            className="p-3 flex items-center justify-between hover:bg-slate-800/60 transition-colors cursor-pointer"
          >
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300 font-bold shrink-0 text-xs">
                {activeAccountId === 'all' ? 'All' : (activeAccount?.name?.slice(0, 1) || '邮')}
              </div>
              <div className="truncate min-w-0">
                <div className="font-semibold text-slate-100 text-xs truncate flex items-center space-x-1">
                  <span>{activeAccountId === 'all' ? '所有账户合并视图' : (activeAccount?.name || activeAccount?.email)}</span>
                </div>
                <div className="text-[10px] text-slate-400 truncate font-mono">
                  {activeAccountId === 'all' ? `已接入 ${accounts.length} 个邮箱账号` : activeAccount?.email}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-1 shrink-0 text-slate-400">
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${isAccountMenuOpen ? 'rotate-180' : ''}`} />
            </div>
          </div>
        )}

        {/* 多账号切换与管理下拉菜单 */}
        {isAccountMenuOpen && (
          <div className="absolute top-full left-0 right-0 z-40 bg-[#090d16] border-b border-slate-700 shadow-xl p-2 space-y-1 animate-in fade-in duration-100 text-xs">
            <div className="px-2 py-1 text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>切换邮箱账户</span>
              <button
                type="button"
                onClick={() => {
                  setIsAccountMenuOpen(false);
                  onOpenAddAccountModal();
                }}
                className="text-sky-400 hover:text-sky-300 flex items-center space-x-0.5 cursor-pointer font-bold"
              >
                <Plus className="w-3 h-3" />
                <span>添加新账号</span>
              </button>
            </div>

            {/* 所有账户合并项 */}
            <button
              type="button"
              onClick={() => {
                onSelectAccount('all');
                setIsAccountMenuOpen(false);
              }}
              className={`w-full p-2 rounded-lg flex items-center justify-between text-left transition-colors cursor-pointer ${
                activeAccountId === 'all' ? 'bg-sky-500/20 text-sky-300 font-bold' : 'hover:bg-slate-800 text-slate-300'
              }`}
            >
              <div className="flex items-center space-x-2 truncate">
                <Mail className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="truncate">所有账户 (合并收件箱)</span>
              </div>
              {activeAccountId === 'all' && <Check className="w-3.5 h-3.5 text-sky-400" />}
            </button>

            {/* 各独立邮箱账号项 */}
            {accounts.map((acc) => {
              const isSelected = activeAccountId === acc.id;
              return (
                <div
                  key={acc.id}
                  className={`w-full p-2 rounded-lg flex items-center justify-between transition-colors group ${
                    isSelected ? 'bg-sky-500/20 text-sky-300 font-bold' : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectAccount(acc.id);
                      setIsAccountMenuOpen(false);
                    }}
                    className="flex-1 text-left min-w-0 truncate cursor-pointer"
                  >
                    <div className="truncate font-semibold text-xs text-slate-200">{acc.name}</div>
                    <div className="text-[10px] text-slate-400 truncate font-mono">{acc.email} ({acc.providerLabel || acc.provider})</div>
                  </button>

                  <div className="flex items-center space-x-1 shrink-0">
                    {isSelected && <Check className="w-3.5 h-3.5 text-sky-400" />}
                    {accounts.length > 1 && onDeleteAccount && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`确定要移除邮箱账号 [${acc.email}] 吗？`)) {
                            onDeleteAccount(acc.id);
                          }
                        }}
                        className="p-1 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        title="移除账号"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            <div className="pt-1 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsAccountMenuOpen(false);
                  onOpenAddAccountModal();
                }}
                className="w-full py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-center font-medium flex items-center justify-center space-x-1 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-sky-400" />
                <span>添加其他邮箱账户 (QQ/163/M365/Gmail/企业邮)</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. 经典 Foxmail 树状文件夹导航 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <div className="px-2 py-1 text-[10px] uppercase tracking-wider font-mono text-slate-400 font-bold flex items-center justify-between">
          <span>文件夹 (Folders)</span>
        </div>

        {/* 收件箱 */}
        <button
          type="button"
          onClick={() => onSelectFolder('inbox')}
          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
            currentFolder === 'inbox'
              ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/30'
              : 'hover:bg-slate-800 text-slate-300 hover:text-white'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <Inbox className="w-4 h-4 text-sky-400 shrink-0" />
            <span>收件箱</span>
          </div>
          {inboxUnread > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-sky-500 text-slate-950 font-mono">
              {inboxUnread}
            </span>
          )}
        </button>

        {/* 星标/重要关注 */}
        <button
          type="button"
          onClick={() => onSelectFolder('starred')}
          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
            currentFolder === 'starred'
              ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
              : 'hover:bg-slate-800 text-slate-300 hover:text-white'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <Star className="w-4 h-4 text-amber-400 shrink-0" />
            <span>星标关注</span>
          </div>
          {starredCount > 0 && (
            <span className="text-[10px] font-mono text-amber-400 font-bold">
              {starredCount}
            </span>
          )}
        </button>

        {/* 已发送 */}
        <button
          type="button"
          onClick={() => onSelectFolder('sent')}
          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
            currentFolder === 'sent'
              ? 'bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30'
              : 'hover:bg-slate-800 text-slate-300 hover:text-white'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <Send className="w-4 h-4 text-blue-400 shrink-0" />
            <span>已发送</span>
          </div>
          {sentCount > 0 && (
            <span className="text-[10px] font-mono text-slate-400">
              {sentCount}
            </span>
          )}
        </button>

        {/* 草稿箱 */}
        <button
          type="button"
          onClick={() => onSelectFolder('drafts')}
          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
            currentFolder === 'drafts'
              ? 'bg-slate-700/60 text-white font-bold border border-slate-600'
              : 'hover:bg-slate-800 text-slate-300 hover:text-white'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <FileEdit className="w-4 h-4 text-slate-400 shrink-0" />
            <span>草稿箱</span>
          </div>
          {draftsCount > 0 && (
            <span className="text-[10px] font-mono text-slate-400">
              {draftsCount}
            </span>
          )}
        </button>

        {/* 垃圾箱 */}
        <button
          type="button"
          onClick={() => onSelectFolder('trash')}
          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
            currentFolder === 'trash'
              ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30'
              : 'hover:bg-slate-800 text-slate-300 hover:text-white'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />
            <span>已删除</span>
          </div>
          {trashCount > 0 && (
            <span className="text-[10px] font-mono text-slate-400">
              {trashCount}
            </span>
          )}
        </button>

        {remoteFolders.length > 0 && (
          <>
            <div className="px-2 pt-3 pb-1 text-[10px] uppercase tracking-wider font-mono text-slate-400 font-bold">
              邮箱文件夹
            </div>
            {remoteFolders.map((folder) => (
              <button
                key={folder.key}
                type="button"
                onClick={() => onSelectFolder(folder.key)}
                title={`${folder.path} · ${folder.accountName}`}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
                  currentFolder === folder.key
                    ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30'
                    : 'hover:bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <Mail className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span className="truncate">
                    {activeAccountId === 'all' ? `${folder.name} · ${folder.accountName}` : folder.name}
                  </span>
                </div>
                {folder.count > 0 && <span className="text-[10px] font-mono text-slate-400">{folder.count}</span>}
              </button>
            ))}
          </>
        )}

        <div className="pt-3 pb-1 px-2 text-[10px] uppercase tracking-wider font-mono text-slate-400 font-bold">
          AI 智能增效 (Intelligence)
        </div>

        {/* 联系人全景画像库 */}
        <button
          type="button"
          onClick={() => onSelectFolder('personas')}
          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
            currentFolder === 'personas'
              ? 'bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30'
              : 'hover:bg-slate-800 text-slate-300 hover:text-white'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <UserCheck className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>联系人画像中心</span>
          </div>
          <span className="px-1.5 py-0.2 rounded text-[9px] bg-indigo-500/30 text-indigo-300 font-mono">
            360°
          </span>
        </button>
      </div>

      {/* 4. 底部快捷添加账号条目 */}
      <div className="p-2.5 border-t border-slate-800 bg-[#090d16] flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={onOpenAddAccountModal}
          className="w-full py-1.5 px-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg flex items-center justify-center space-x-1.5 transition-colors cursor-pointer text-[11px]"
        >
          <Plus className="w-3.5 h-3.5 text-sky-400" />
          <span>添加新邮箱账号</span>
        </button>
      </div>
    </div>
  );
};
