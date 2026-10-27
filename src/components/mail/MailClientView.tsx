import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  PanelRightClose, 
  PanelRightOpen, 
  UserCheck, 
  Plus, 
  RefreshCw, 
  HelpCircle,
  Inbox,
  Clock,
  Layers,
  ChevronDown,
  DownloadCloud,
  CheckCircle2
} from 'lucide-react';
import { 
  EmailItem, 
  EmailAccount, 
  EmailFolder, 
  GenerateReplyOptions 
} from '../../../shared/mailTypes';
import { MailFolderNav } from './MailFolderNav';
import { MailListPane } from './MailListPane';
import { MailDetailPane } from './MailDetailPane';
import { MailAiCopilot } from './MailAiCopilot';
import { MailComposeModal } from './MailComposeModal';
import { PersonaDirectoryModal } from './PersonaDirectoryModal';
import { MailAccountModal } from './MailAccountModal';

interface MailClientViewProps {
  showToast?: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const MailClientView: React.FC<MailClientViewProps> = ({ showToast }) => {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string>('all');
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [currentFolder, setCurrentFolder] = useState<EmailFolder | 'personas'>('inbox');

  // AI 副驾驶展开状态 (默认在大屏模式下展开)
  const [isCopilotOpen, setIsCopilotOpen] = useState(true);

  // 弹窗状态
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeInitialData, setComposeInitialData] = useState<{
    to?: string;
    cc?: string;
    subject?: string;
    body?: string;
  }>({});

  const [isPersonaModalOpen, setIsPersonaModalOpen] = useState(false);
  const [personaModalTargetEmail, setPersonaModalTargetEmail] = useState<string>('');

  // 真实邮箱添加账号弹窗 (对应 8 大服务商)
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);

  // 同步与自动获取状态
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgressText, setSyncProgressText] = useState<string>('');
  const [autoSyncInterval, setAutoSyncInterval] = useState<number>(120); // 默认每 120 秒 (2分钟) 自动收取
  const [isAutoSyncMenuOpen, setIsAutoSyncMenuOpen] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number>(Date.now());

  // 当前正文拉取中 ID
  const [loadingBodyEmailId, setLoadingBodyEmailId] = useState<string | null>(null);

  // 1. 初始化加载账号与本地缓存邮件
  const loadData = async () => {
    try {
      if (window.neoApi?.mailGetAccounts) {
        const accs = await window.neoApi.mailGetAccounts();
        setAccounts(accs);
        if (accs.length > 0) {
          if (activeAccountId !== 'all' && !accs.some((a) => a.id === activeAccountId)) {
            setActiveAccountId('all');
          }
        }
      }
      if (window.neoApi?.mailGetEmails) {
        const mailList = await window.neoApi.mailGetEmails();
        setEmails(mailList);
        if (mailList.length > 0 && !selectedEmailId) {
          const firstInbox = mailList.find((m) => m.folder === 'inbox') || mailList[0];
          setSelectedEmailId(firstInbox.id);
        }
      }
    } catch (e: any) {
      showToast?.('error', `加载邮件数据异常: ${e.message}`);
    }
  };

  useEffect(() => {
    loadData().then(() => {
      // 启动时自动静默收取一次最新邮件
      setTimeout(() => {
        handleSyncEmails({ mode: 'recent', silent: true });
      }, 1000);
    });
  }, []);

  // 2. 自动获取机制 (Auto Sync Scheduler)
  useEffect(() => {
    if (autoSyncInterval <= 0) return;
    const timer = setInterval(() => {
      console.log(`[Auto Sync] 触发自动邮件检查 (间隔: ${autoSyncInterval}s)...`);
      handleSyncEmails({ mode: 'recent', silent: true });
    }, autoSyncInterval * 1000);

    return () => clearInterval(timer);
  }, [autoSyncInterval, activeAccountId, accounts]);

  // 切换文件夹时，自动同步选中该文件夹下的第一封邮件
  const handleSelectFolder = (folder: EmailFolder | 'personas') => {
    if (folder === 'personas') {
      handleOpenPersonaModal();
      return;
    }
    setCurrentFolder(folder);

    // 智能选取目标文件夹下的第一封邮件
    const currentScopedEmails = activeAccountId === 'all'
      ? emails
      : emails.filter((e) => e.accountId === activeAccountId);
    
    const targetFolderEmails = currentScopedEmails.filter((e) =>
      folder === 'starred' ? e.isStarred && e.folder !== 'trash' : e.folder === folder
    ).sort((a, b) => (b.date || 0) - (a.date || 0));

    void handleSelectEmail(targetFolderEmails[0]?.id || null, { markAsRead: false });
  };

  // 当前选中的邮件
  const selectedEmail = emails.find((e) => e.id === selectedEmailId) || null;
  const currentFolderLabel = accounts
    .flatMap((account) => account.remoteFolders || [])
    .find((folder) => folder.key === currentFolder)?.name;

  // 3. 选中某封邮件 (自动标为已读，且若无正文则毫秒级按需拉取正文)
  const handleSelectEmail = async (emailId: string | null, options: { markAsRead?: boolean } = {}) => {
    setSelectedEmailId(emailId);
    if (!emailId) return;
    const target = emails.find((e) => e.id === emailId);
    if (!target) return;

    // 标为已读
    if (options.markAsRead !== false && !target.isRead && window.neoApi?.mailMarkAsRead) {
      try {
        await window.neoApi.mailMarkAsRead(emailId, true);
        setEmails((prev) =>
          prev.map((m) => (m.id === emailId ? { ...m, isRead: true } : m))
        );
      } catch {}
    }

    // 若本地仅有信头而正文尚未下载，按需从真实 IMAP 200ms 极速抓取正文
    if (!target.bodyText && window.neoApi?.mailFetchEmailBody) {
      setLoadingBodyEmailId(emailId);
      try {
        const fullItem = await window.neoApi.mailFetchEmailBody(target.accountId, emailId);
        if (fullItem && fullItem.bodyText) {
          setEmails((prev) =>
            prev.map((m) => (m.id === emailId ? { ...m, ...fullItem } : m))
          );
        }
      } catch (err: any) {
        console.warn('按需抓取邮件正文提示:', err.message);
      } finally {
        setLoadingBodyEmailId(null);
      }
    }
  };

  // 标星/取消标星
  const handleToggleStar = async (emailId: string) => {
    if (!window.neoApi?.mailToggleStar) return;
    try {
      const updated = await window.neoApi.mailToggleStar(emailId);
      if (updated) {
        setEmails((prev) =>
          prev.map((m) => (m.id === emailId ? { ...m, isStarred: updated.isStarred } : m))
        );
      }
    } catch {}
  };

  // 删除邮件
  const handleDeleteEmail = async (emailId: string) => {
    if (!window.neoApi?.mailDeleteEmail) return;
    try {
      await window.neoApi.mailDeleteEmail(emailId);
      setEmails((prev) => {
        const next = prev.map((m) => {
          if (m.id === emailId) {
            return m.folder !== 'trash' ? { ...m, folder: 'trash' as const } : null;
          }
          return m;
        }).filter(Boolean) as EmailItem[];
        return next;
      });
      showToast?.('info', '邮件已移至已删除文件夹');
      if (selectedEmailId === emailId) {
        setSelectedEmailId(null);
      }
    } catch {}
  };

  // 4. 真实收取邮件 (UID 增量同步，支持手动全量归档)
  const handleSyncEmails = async (options: { mode?: 'recent' | 'all'; silent?: boolean } = {}) => {
    if (isSyncing) return;
    if (accounts.length === 0) {
      if (!options.silent) {
        showToast?.('info', '请先添加邮箱账户以开始真实收信');
        setIsAddAccountModalOpen(true);
      }
      return;
    }

    setIsSyncing(true);
    setSyncProgressText(options.mode === 'all' ? '正在连接同步全量历史邮件...' : '正在自动检测最新邮件...');

    try {
      let totalNew = 0;
      let totalCount = 0;
      let latestEmailList = emails;

      // 确定要同步的账号列表
      const targetAccounts = activeAccountId === 'all'
        ? accounts.filter((a) => a.authPassword)
        : accounts.filter((a) => a.id === activeAccountId && a.authPassword);

      for (const acc of targetAccounts) {
        if (window.neoApi?.mailSyncEmailsForAccount) {
          try {
            const res = await window.neoApi.mailSyncEmailsForAccount(acc.id, {
              mode: options.mode || 'all',
              maxBodyFetch: options.mode === 'all' ? 80 : 30,
            });
            if (res && res.emails) {
              totalNew += res.newCount;
              totalCount = Math.max(totalCount, res.totalCount);
              latestEmailList = res.emails;
            }
          } catch (accErr: any) {
            console.warn(`[Sync] 账号 ${acc.email} 同步提示:`, accErr.message);
          }
        }
      }

      setEmails(latestEmailList);
      setLastSyncTime(Date.now());

      if (!options.silent) {
        showToast?.('success', `同步完成！本地已归档 ${latestEmailList.length} 封邮件 (本次新收 ${totalNew} 封)`);
      } else if (totalNew > 0) {
        showToast?.('info', `📬 自动获取到 ${totalNew} 封新邮件`);
      }

      if (totalNew > 0 && latestEmailList.length > 0 && !selectedEmailId) {
        setSelectedEmailId(latestEmailList[0].id);
      }
    } catch (e: any) {
      if (!options.silent) {
        showToast?.('error', `收取邮件失败: ${e.message}`);
      }
    } finally {
      setIsSyncing(false);
      setSyncProgressText('');
    }
  };

  // 打开写信弹窗
  const handleOpenCompose = (init?: { to?: string; cc?: string; subject?: string; body?: string }) => {
    setComposeInitialData(init || {});
    setIsComposeOpen(true);
  };

  // 发送邮件 (真实 SMTP 推送)
  const handleSendEmail = async (payload: { to: string; subject: string; content: string; cc?: string }) => {
    if (!window.neoApi?.mailSendEmail) return;
    const targetAccountId = activeAccountId !== 'all' ? activeAccountId : (accounts[0]?.id || '');
    const sent = await window.neoApi.mailSendEmail({
      ...payload,
      accountId: targetAccountId,
    });
    setEmails((prev) => [sent, ...prev]);
    showToast?.('success', '邮件已成功发送并已保存至发件箱！');
  };

  // 保存草稿
  const handleSaveDraft = async (payload: { to: string; subject: string; content: string; cc?: string }) => {
    if (!window.neoApi?.mailSaveDraft) return;
    const targetAccountId = activeAccountId !== 'all' ? activeAccountId : (accounts[0]?.id || '');
    const draft = await window.neoApi.mailSaveDraft({
      ...payload,
      accountId: targetAccountId,
    });
    setEmails((prev) => {
      const idx = prev.findIndex((m) => m.id === draft.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = draft;
        return next;
      }
      return [draft, ...prev];
    });
  };

  // 删除账号
  const handleDeleteAccount = async (accId: string) => {
    if (!window.neoApi?.mailDeleteAccount) return;
    try {
      await window.neoApi.mailDeleteAccount(accId);
      showToast?.('info', '账号已成功移除');
      loadData();
    } catch (e: any) {
      showToast?.('error', `移除失败: ${e.message}`);
    }
  };

  // 触发 AI 分析当前邮件
  const handleTriggerAnalysis = () => {
    setIsCopilotOpen(true);
  };

  // 打开指定邮箱人物画像弹窗
  const handleOpenPersonaModal = (emailAddr?: string) => {
    setPersonaModalTargetEmail(emailAddr || selectedEmail?.from.email || '');
    setIsPersonaModalOpen(true);
  };

  return (
    <div className="h-full w-full flex flex-col bg-white overflow-hidden font-sans select-none">
      {/* 1. 顶部全功能快捷栏 (Foxmail 标志性顶栏) */}
      <div className="h-10 px-4 bg-slate-900 border-b border-slate-800 text-slate-200 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse shadow-[0_0_8px_#38bdf8]" />
            <span className="font-bold text-xs tracking-wider text-white uppercase font-mono">
              Foxmail 企业级智能邮件客户端 · AI 人物画像
            </span>
          </div>

          <span className="text-slate-600">|</span>

          {/* 自动获取状态与频率设置下拉 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsAutoSyncMenuOpen(!isAutoSyncMenuOpen)}
              className="px-2 py-0.8 rounded-lg bg-slate-800 hover:bg-slate-700/80 text-sky-300 border border-slate-700 text-xs font-mono flex items-center space-x-1.5 transition-colors cursor-pointer"
              title="配置后台自动收取邮件频率"
            >
              <Clock className="w-3 h-3 text-sky-400" />
              <span>
                {autoSyncInterval > 0 ? `自动获取: 每${autoSyncInterval / 60}分钟` : '自动获取: 已暂停'}
              </span>
              <ChevronDown className="w-2.5 h-2.5 opacity-60" />
            </button>

            {isAutoSyncMenuOpen && (
              <div className="absolute left-0 top-full mt-1 w-44 bg-[#090d16] border border-slate-700 rounded-xl shadow-2xl p-1 z-50 text-xs space-y-0.5 animate-in fade-in duration-100">
                <div className="px-2 py-1 text-[10px] text-slate-400 font-mono">设置自动收取周期:</div>
                {[
                  { sec: 60, label: '每 1 分钟自动获取' },
                  { sec: 120, label: '每 2 分钟自动获取 (推荐)' },
                  { sec: 300, label: '每 5 分钟自动获取' },
                  { sec: 0, label: '仅手动收取 (暂停自动)' },
                ].map((opt) => (
                  <button
                    key={opt.sec}
                    type="button"
                    onClick={() => {
                      setAutoSyncInterval(opt.sec);
                      setIsAutoSyncMenuOpen(false);
                      showToast?.('info', `已调整为 ${opt.label}`);
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center justify-between cursor-pointer ${
                      autoSyncInterval === opt.sec
                        ? 'bg-sky-500/20 text-sky-300 font-bold'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {autoSyncInterval === opt.sec && <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 全量拉取收件箱全部邮件大按钮 */}
          <button
            type="button"
            onClick={() => handleSyncEmails({ mode: 'all' })}
            disabled={isSyncing || accounts.length === 0}
            className="px-2.5 py-0.8 rounded-lg bg-sky-600/30 hover:bg-sky-600/50 text-sky-200 border border-sky-500/40 text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
            title="通过 IMAP 全量扫描收件箱所有邮件信头并对齐入库"
          >
            <DownloadCloud className={`w-3.5 h-3.5 text-sky-300 ${isSyncing ? 'animate-bounce' : ''}`} />
            <span>{isSyncing ? '正在同步全量邮件...' : '同步收件箱全部所有邮件'}</span>
          </button>

          {/* 快捷添加真实邮箱 */}
          <button
            type="button"
            onClick={() => setIsAddAccountModalOpen(true)}
            className="px-2 py-0.8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer active:scale-95"
            title="添加 QQ/163/企业邮/M365/Gmail 真实邮箱账号"
          >
            <Plus className="w-3.5 h-3.5 text-sky-400" />
            <span>添加邮箱账号</span>
          </button>

          {/* 快捷入口: 全景人物画像中心 */}
          <button
            type="button"
            onClick={() => handleOpenPersonaModal()}
            className="px-2.5 py-0.8 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer active:scale-95"
          >
            <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span>联系人人物画像库</span>
          </button>
        </div>

        {/* 右侧副驾驶切换开关 */}
        <div className="flex items-center space-x-2">
          {syncProgressText && (
            <span className="text-[11px] text-sky-400 font-mono animate-pulse mr-2">
              {syncProgressText}
            </span>
          )}

          <button
            type="button"
            onClick={() => setIsCopilotOpen(!isCopilotOpen)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center space-x-1.5 cursor-pointer ${
              isCopilotOpen
                ? 'bg-sky-500/20 text-sky-300 border border-sky-400/30 font-semibold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="折叠/展开 AI 邮件智能副驾驶"
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            <span>AI 智能副驾驶</span>
            {isCopilotOpen ? <PanelRightClose className="w-3.5 h-3.5 ml-0.5" /> : <PanelRightOpen className="w-3.5 h-3.5 ml-0.5" />}
          </button>
        </div>
      </div>

      {/* 2. 核心三栏/四栏布局 */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* 栏 1: 左侧文件夹树 (Foxmail 风格，多账号管理) */}
        <MailFolderNav
          currentFolder={currentFolder}
          onSelectFolder={handleSelectFolder}
          accounts={accounts}
          activeAccountId={activeAccountId}
          onSelectAccount={(accId) => {
            setActiveAccountId(accId);
            const availableRemoteFolders = accId === 'all'
              ? accounts.flatMap((account) => account.remoteFolders || []).map((folder) => folder.key)
              : accounts.find((account) => account.id === accId)?.remoteFolders?.map((folder) => folder.key) || [];
            const nextFolder = currentFolder.startsWith('imap:') && !availableRemoteFolders.some((key) => key === currentFolder)
              ? 'inbox'
              : currentFolder;
            if (nextFolder !== currentFolder) setCurrentFolder(nextFolder);
            const targetMails = (accId === 'all' ? emails : emails.filter((e) => e.accountId === accId))
              .filter((e) => nextFolder === 'starred' ? e.isStarred && e.folder !== 'trash' : e.folder === nextFolder)
              .sort((a, b) => (b.date || 0) - (a.date || 0));
            void handleSelectEmail(targetMails[0]?.id || null, { markAsRead: false });
          }}
          emails={emails}
          onOpenCompose={() => handleOpenCompose()}
          onSyncEmails={() => handleSyncEmails({ mode: 'recent' })}
          onOpenAddAccountModal={() => setIsAddAccountModalOpen(true)}
          onDeleteAccount={handleDeleteAccount}
          isSyncing={isSyncing}
        />

        {accounts.length === 0 ? (
          /* 当没有任何账号时，居中展示纯净引导卡片 */
          <div className="flex-1 h-full flex flex-col items-center justify-center p-8 bg-slate-50/50 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center shadow-xs">
              <Inbox className="w-8 h-8" />
            </div>
            <div className="space-y-1.5 max-w-md">
              <h3 className="font-bold text-slate-800 text-base">欢迎使用 Foxmail 智能邮件客户端</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                当前尚未登录任何邮箱账号。系统支持通过真实 IMAP / SMTP 协议直接接入您的真实工作邮箱。
              </p>
              <p className="text-[11px] text-slate-400 font-mono">
                支持服务商：腾讯企业邮 · QQ邮箱 · Exchange · M365 (国际/国内版) · Gmail · 163邮箱 · 其它自建邮
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsAddAccountModalOpen(true)}
              className="px-5 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold rounded-xl shadow-md transition-all flex items-center space-x-2 cursor-pointer active:scale-95 text-xs"
            >
              <Plus className="w-4 h-4" />
              <span>添加我的第一个真实邮箱账户</span>
            </button>
          </div>
        ) : (
          <>
            {/* 栏 2: 中间邮件列表 */}
            <MailListPane
              emails={activeAccountId === 'all' ? emails : emails.filter((e) => e.accountId === activeAccountId)}
              currentFolder={currentFolder}
              currentFolderLabel={currentFolderLabel}
              selectedEmailId={selectedEmailId}
              onSelectEmail={handleSelectEmail}
              onToggleStar={handleToggleStar}
              onDeleteEmail={handleDeleteEmail}
            />

            {/* 栏 3: 右侧邮件正文查看器 */}
            <div className="flex-1 h-full min-w-0 flex flex-col overflow-hidden">
              <MailDetailPane
                email={selectedEmail}
                currentUserEmail={accounts.find((a) => a.id === (selectedEmail?.accountId || activeAccountId))?.email || accounts[0]?.email}
                onOpenReplyCompose={(init) => handleOpenCompose(init)}
                onToggleStar={handleToggleStar}
                onDeleteEmail={handleDeleteEmail}
                onTriggerAiAnalysis={handleTriggerAnalysis}
                onOpenPersonaDrawer={(em) => handleOpenPersonaModal(em)}
                showToast={showToast}
              />
            </div>

            {/* 栏 4: 右侧展开的 AI 智能副驾驶协同栏 (需求分析 / 智能回复 / 人物画像) */}
            {isCopilotOpen && (
              <div className="w-80 md:w-96 h-full shrink-0 animate-in slide-in-from-right-4 duration-200">
                <MailAiCopilot
                  email={selectedEmail}
                  onOpenReplyCompose={(replyData) => handleOpenCompose(replyData)}
                  showToast={showToast}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* 真实邮箱登录与服务商添加弹窗 (8 大服务商) */}
      <MailAccountModal
        isOpen={isAddAccountModalOpen}
        onClose={() => setIsAddAccountModalOpen(false)}
        onAccountCreated={() => {
          loadData();
        }}
        showToast={showToast}
      />

      {/* 写信独立弹窗 */}
      <MailComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        accounts={accounts}
        activeAccountId={activeAccountId !== 'all' ? activeAccountId : (accounts[0]?.id || '')}
        initialData={composeInitialData}
        onSend={handleSendEmail}
        onSaveDraft={handleSaveDraft}
        showToast={showToast}
      />

      {/* 全景联系人人物画像中心弹窗 (支持输入任意指定邮箱分析) */}
      <PersonaDirectoryModal
        isOpen={isPersonaModalOpen}
        onClose={() => setIsPersonaModalOpen(false)}
        initialTargetEmail={personaModalTargetEmail}
        onComposeTo={(toEmail) => handleOpenCompose({ to: toEmail })}
        showToast={showToast}
      />
    </div>
  );
};
