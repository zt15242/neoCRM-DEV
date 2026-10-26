import React, { useState, useMemo, useDeferredValue, useEffect, useRef } from 'react';
import { 
  Search, 
  Star, 
  Paperclip, 
  Sparkles, 
  Clock, 
  AlertCircle, 
  Filter, 
  CheckCheck, 
  Trash2,
  BrainCircuit,
  Tag
} from 'lucide-react';
import { EmailItem, EmailFolder } from '../../../shared/mailTypes';

interface MailListPaneProps {
  emails: EmailItem[];
  currentFolder: EmailFolder | 'personas';
  selectedEmailId: string | null;
  onSelectEmail: (emailId: string | null, options?: { markAsRead?: boolean }) => void;
  onToggleStar: (emailId: string) => void;
  onDeleteEmail: (emailId: string) => void;
}

export const MailListPane: React.FC<MailListPaneProps> = ({
  emails,
  currentFolder,
  selectedEmailId,
  onSelectEmail,
  onToggleStar,
  onDeleteEmail,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'unread' | 'starred' | 'urgent' | 'analyzed'>('all');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const lastAutoSelectionRef = useRef<string | null | undefined>(undefined);

  // 根据当前文件夹与搜索条件过滤邮件
  const filteredEmails = useMemo(() => {
    let list = emails;

    // 文件夹过滤
    if (currentFolder === 'starred') {
      list = list.filter((e) => e.isStarred && e.folder !== 'trash');
    } else if (currentFolder !== 'personas') {
      list = list.filter((e) => e.folder === currentFolder);
    }

    // 快捷类别过滤
    if (filterType === 'unread') {
      list = list.filter((e) => !e.isRead);
    } else if (filterType === 'starred') {
      list = list.filter((e) => e.isStarred);
    } else if (filterType === 'urgent') {
      list = list.filter((e) => e.analysis?.urgencyLevel === 'high' || e.tags?.includes('紧急') || e.tags?.includes('高优先级'));
    } else if (filterType === 'analyzed') {
      list = list.filter((e) => Boolean(e.analysis));
    }

    // 搜索词过滤
    if (deferredSearchQuery.trim()) {
      const q = deferredSearchQuery.trim().toLocaleLowerCase();
      list = list.filter((email) => {
        const contacts = [
          ...(Array.isArray(email.to) ? email.to : []),
          ...(Array.isArray(email.cc) ? email.cc : []),
          ...(Array.isArray(email.bcc) ? email.bcc : []),
        ];
        const htmlText = typeof email.bodyHtml === 'string'
          ? email.bodyHtml
              .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
              .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
              .replace(/<[^>]+>/g, ' ')
          : '';
        const searchableText = [
          email.subject,
          email.from?.name,
          email.from?.email,
          ...contacts.flatMap((contact) => [contact?.name, contact?.email]),
          email.snippet,
          email.bodyText,
          htmlText,
          ...(Array.isArray(email.tags) ? email.tags : []),
        ]
          .filter((value): value is string => typeof value === 'string')
          .join(' ')
          .toLocaleLowerCase();

        return searchableText.includes(q);
      });
    }

    // 保持时间倒序
    return [...list].sort((a, b) => (b.date || 0) - (a.date || 0));
  }, [emails, currentFolder, filterType, deferredSearchQuery]);

  useEffect(() => {
    if (filteredEmails.some((email) => email.id === selectedEmailId)) {
      lastAutoSelectionRef.current = undefined;
      return;
    }

    const nextEmailId = filteredEmails[0]?.id ?? null;
    if (lastAutoSelectionRef.current === nextEmailId) return;
    lastAutoSelectionRef.current = nextEmailId;
    onSelectEmail(nextEmailId, { markAsRead: false });
  }, [filteredEmails, selectedEmailId, onSelectEmail]);

  const folderTitles: Record<string, string> = {
    inbox: '收件箱',
    starred: '星标重点关注',
    sent: '已发送邮件',
    drafts: '草稿箱',
    trash: '已删除邮件',
    personas: '联系人画像中心',
  };

  const formatEmailDate = (timestamp: number) => {
    const d = new Date(timestamp);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };

  return (
    <div className="w-80 md:w-96 h-full flex flex-col bg-slate-50/50 border-r border-slate-200 shrink-0 font-sans select-none overflow-hidden text-xs">
      {/* 1. 顶部标题栏与搜索框 */}
      <div className="p-3 border-b border-slate-200 bg-white space-y-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <h3 className="font-bold text-slate-800 text-sm">
              {folderTitles[currentFolder] || '邮件列表'}
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">({filteredEmails.length})</span>
          </div>

          {/* 筛选切换胶囊 (支持显式全部 / 未读 / 紧急 / 已分析) */}
          <div className="flex items-center space-x-1 text-[11px]">
            <button
              type="button"
              aria-pressed={filterType === 'all'}
              onClick={() => setFilterType('all')}
              className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                filterType === 'all' ? 'bg-slate-200 text-slate-900 font-bold' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              全部
            </button>
            <button
              type="button"
              aria-pressed={filterType === 'unread'}
              onClick={() => setFilterType(filterType === 'unread' ? 'all' : 'unread')}
              className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                filterType === 'unread' ? 'bg-sky-100 text-sky-800 font-bold' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              未读
            </button>
            <button
              type="button"
              aria-pressed={filterType === 'urgent'}
              onClick={() => setFilterType(filterType === 'urgent' ? 'all' : 'urgent')}
              className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                filterType === 'urgent' ? 'bg-rose-100 text-rose-800 font-bold' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              紧急
            </button>
            <button
              type="button"
              aria-pressed={filterType === 'analyzed'}
              onClick={() => setFilterType(filterType === 'analyzed' ? 'all' : 'analyzed')}
              className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                filterType === 'analyzed' ? 'bg-indigo-100 text-indigo-800 font-bold' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              已分析
            </button>
          </div>
        </div>

        {/* 搜索框 */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索发件人、收件人、主题、摘要、已下载正文或标签..."
            aria-label="搜索邮件"
            className="w-full pl-8 pr-3 py-1.5 bg-slate-100 border border-transparent rounded-xl text-xs text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:border-sky-400 focus:ring-1 focus:ring-sky-400 transition-all"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* 2. 邮件列表展示区 */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
        {filteredEmails.length === 0 ? (
          <div className="py-20 text-center text-slate-400 space-y-2">
            <Search className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs">未找到匹配的邮件</p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-sky-600 hover:underline text-[11px]"
              >
                清除搜索条件
              </button>
            )}
          </div>
        ) : (
          filteredEmails.map((email) => {
            const isSelected = email.id === selectedEmailId;
            const hasAnalysis = Boolean(email.analysis);
            const isUrgent = email.analysis?.urgencyLevel === 'high' || email.tags?.includes('紧急');

            return (
              <div
                key={email.id}
                onClick={() => onSelectEmail(email.id)}
                className={`p-3 transition-all cursor-pointer relative group ${
                  isSelected
                    ? 'bg-sky-50/80 border-l-3 border-sky-500'
                    : !email.isRead
                    ? 'bg-white font-medium hover:bg-slate-100/70 border-l-3 border-transparent'
                    : 'bg-slate-50/40 hover:bg-slate-100/60 border-l-3 border-transparent text-slate-600'
                }`}
              >
                {/* 顶部行：发件人、星标、时间 */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-1.5 truncate pr-2">
                    {/* 未读状态蓝点 */}
                    {!email.isRead && email.folder !== 'sent' && (
                      <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0 shadow-2xs" />
                    )}
                    <span className={`truncate text-xs ${!email.isRead ? 'font-bold text-slate-900' : 'text-slate-700'}`}>
                      {email.folder === 'sent' || currentFolder === 'sent'
                        ? `收件人: ${(email.to && email.to.length > 0 ? email.to.map((t) => t.name || t.email).join(', ') : '收件人')}`
                        : email.folder === 'drafts' || currentFolder === 'drafts'
                        ? `草稿至: ${(email.to && email.to.length > 0 ? email.to.map((t) => t.name || t.email).join(', ') : '未指定收件人')}`
                        : email.from.name}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleStar(email.id);
                      }}
                      className={`p-0.5 rounded transition-transform active:scale-125 cursor-pointer ${
                        email.isStarred ? 'text-amber-400' : 'text-slate-300 hover:text-slate-400 opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <Star className={`w-3.5 h-3.5 ${email.isStarred ? 'fill-amber-400' : ''}`} />
                    </button>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {formatEmailDate(email.date)}
                    </span>
                  </div>
                </div>

                {/* 主题 */}
                <div className={`text-xs truncate mb-1 ${!email.isRead ? 'font-bold text-slate-900' : 'text-slate-700 font-medium'}`}>
                  {email.subject}
                </div>

                {/* 摘要正文缩略 */}
                <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed mb-2">
                  {email.snippet}
                </p>

                {/* 底部徽章与 AI 分析状态标签 */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center space-x-1 truncate max-w-[220px]">
                    {isUrgent && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-100 text-rose-700 font-bold font-mono">
                        紧急
                      </span>
                    )}

                    {hasAnalysis ? (
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center space-x-1 truncate">
                        <Sparkles className="w-2.5 h-2.5 text-indigo-500 shrink-0" />
                        <span className="truncate">{email.analysis?.intent || '已AI深度分析'}</span>
                      </span>
                    ) : (
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                        email.folder === 'sent'
                          ? 'bg-blue-100 text-blue-700 border border-blue-200'
                          : email.folder === 'drafts'
                          ? 'bg-slate-200 text-slate-700'
                          : 'bg-slate-200/70 text-slate-600'
                      }`}>
                        {email.folder === 'sent' ? '已发送' : email.folder === 'drafts' ? '草稿' : (email.tags?.[0] || '收件箱')}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-1 text-slate-400 shrink-0">
                    {email.attachments && email.attachments.length > 0 && (
                      <Paperclip className="w-3 h-3 text-slate-400" />
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteEmail(email.id);
                      }}
                      className="p-1 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      title="移至废件箱"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
