import React, { useState } from 'react';
import { 
  Reply, 
  ReplyAll, 
  Forward, 
  Trash2, 
  Star, 
  Sparkles, 
  BrainCircuit, 
  UserCheck, 
  Download, 
  Paperclip, 
  Send, 
  FileText, 
  Building, 
  User, 
  Calendar,
  Wand2,
  CheckCircle2,
  Printer,
  Loader2
} from 'lucide-react';
import { EmailItem } from '../../../shared/mailTypes';

interface MailDetailPaneProps {
  email: EmailItem | null;
  currentUserEmail?: string;
  onOpenReplyCompose: (initialData?: { to?: string; cc?: string; subject?: string; body?: string }) => void;
  onToggleStar: (emailId: string) => void;
  onDeleteEmail: (emailId: string) => void;
  onTriggerAiAnalysis: () => void;
  onOpenPersonaDrawer: (emailAddress: string) => void;
  showToast?: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const MailDetailPane: React.FC<MailDetailPaneProps> = ({
  email,
  currentUserEmail,
  onOpenReplyCompose,
  onToggleStar,
  onDeleteEmail,
  onTriggerAiAnalysis,
  onOpenPersonaDrawer,
  showToast,
}) => {
  // 计算单人回复数据
  const getSingleReplyData = () => {
    if (!email) return { to: '', subject: '', body: '' };
    const quoteHeader = `\n\n------------------ 原始邮件 ------------------\n发件人: "${email.from.name}" <${email.from.email}>\n发送时间: ${new Date(email.date).toLocaleString()}\n收件人: ${(email.to || []).map((t) => t.email).join('; ')}\n主题: ${email.subject}\n\n${email.bodyText || ''}`;
    return {
      to: email.from.email,
      subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
      body: quoteHeader,
    };
  };

  // 严格根据标准计算全部回复 (Reply All) 的收件人与全部抄送人
  const getReplyAllData = () => {
    if (!email) return { to: '', cc: '', subject: '', body: '' };

    const myEmail = (currentUserEmail || '').toLowerCase();
    const senderEmail = email.from.email.toLowerCase();

    // 1. 收件人：原发件人
    const toEmail = email.from.email;

    // 2. 抄送人：原邮件的 to 列表中除了自己和发件人以外的所有人，加原邮件的 cc 列表中除了自己和发件人以外的所有人
    const candidateEmails = new Set<string>();

    (email.to || []).forEach((t) => {
      const em = (t.email || '').trim().toLowerCase();
      if (em && em !== myEmail && em !== senderEmail) {
        candidateEmails.add(t.email.trim());
      }
    });

    (email.cc || []).forEach((c) => {
      const em = (c.email || '').trim().toLowerCase();
      if (em && em !== myEmail && em !== senderEmail) {
        candidateEmails.add(c.email.trim());
      }
    });

    const ccString = Array.from(candidateEmails).join('; ');

    const quoteHeader = `\n\n------------------ 原始邮件 ------------------\n发件人: "${email.from.name}" <${email.from.email}>\n发送时间: ${new Date(email.date).toLocaleString()}\n收件人: ${(email.to || []).map((t) => t.email).join('; ')}${email.cc && email.cc.length > 0 ? `\n抄送: ${email.cc.map((c) => c.email).join('; ')}` : ''}\n主题: ${email.subject}\n\n${email.bodyText || ''}`;

    return {
      to: toEmail,
      cc: ccString,
      subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
      body: quoteHeader,
    };
  };

  // 转发数据
  const getForwardData = () => {
    if (!email) return { to: '', subject: '', body: '' };
    const forwardHeader = `\n\n---------- 转发邮件信息 ----------\n发件人: "${email.from.name}" <${email.from.email}>\n发送时间: ${new Date(email.date).toLocaleString()}\n主题: ${email.subject}\n收件人: ${(email.to || []).map((t) => t.email).join('; ')}\n\n${email.bodyText || ''}`;
    return {
      to: '',
      subject: email.subject.startsWith('Fwd:') ? email.subject : `Fwd: ${email.subject}`,
      body: forwardHeader,
    };
  };
  const [quickReplyText, setQuickReplyText] = useState('');
  const [sendingQuickReply, setSendingQuickReply] = useState(false);

  if (!email) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center p-8 text-center text-slate-400 bg-white">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300 mb-3">
          <FileText className="w-8 h-8" />
        </div>
        <h4 className="font-bold text-slate-700 text-sm">未选择任何邮件</h4>
        <p className="text-xs text-slate-400 mt-1">从左侧列表选择一封邮件即可查阅正文与发起 AI 需求分析</p>
      </div>
    );
  }

  const handleQuickSend = async () => {
    if (!quickReplyText.trim() || sendingQuickReply) return;
    setSendingQuickReply(true);
    try {
      if (window.neoApi?.mailSendEmail) {
        await window.neoApi.mailSendEmail({
          to: email.from.email,
          subject: `Re: ${email.subject}`,
          content: quickReplyText.trim(),
        });
        setQuickReplyText('');
        showToast?.('success', '回复邮件已成功发出并归档至【已发送】！');
      }
    } catch (e: any) {
      showToast?.('error', `发送失败: ${e.message}`);
    } finally {
      setSendingQuickReply(false);
    }
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-white overflow-hidden font-sans text-xs">
      {/* 1. 顶部经典 Foxmail 邮件操作工具栏 */}
      <div className="h-11 px-4 border-b border-slate-200 bg-slate-50/90 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center space-x-1.5">
          {/* 回复 */}
          <button
            type="button"
            onClick={() => onOpenReplyCompose(getSingleReplyData())}
            className="px-2.5 py-1 rounded-lg hover:bg-slate-200/80 text-slate-700 font-medium flex items-center space-x-1 cursor-pointer transition-colors"
            title="回复发件人"
          >
            <Reply className="w-3.5 h-3.5 text-sky-600" />
            <span>回复</span>
          </button>

          {/* 全部回复 (带全量抄送人与干系人) */}
          <button
            type="button"
            onClick={() => onOpenReplyCompose(getReplyAllData())}
            className="px-2.5 py-1 rounded-lg hover:bg-blue-100/60 text-blue-700 font-medium flex items-center space-x-1 cursor-pointer transition-colors border border-blue-200/80 bg-blue-50/50"
            title="回复发件人并抄送邮件所有其他收件人与抄送人"
          >
            <ReplyAll className="w-3.5 h-3.5 text-blue-600" />
            <span className="font-semibold">全部回复</span>
          </button>

          {/* 转发 */}
          <button
            type="button"
            onClick={() => onOpenReplyCompose(getForwardData())}
            className="px-2.5 py-1 rounded-lg hover:bg-slate-200/80 text-slate-700 font-medium flex items-center space-x-1 cursor-pointer transition-colors"
            title="转发这封邮件"
          >
            <Forward className="w-3.5 h-3.5 text-slate-600" />
            <span>转发</span>
          </button>

          <span className="text-slate-300">|</span>

          {/* 删除 */}
          <button
            type="button"
            onClick={() => onDeleteEmail(email.id)}
            className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-600 hover:text-rose-600 cursor-pointer transition-colors"
            title="删除此邮件"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* 星标 */}
          <button
            type="button"
            onClick={() => onToggleStar(email.id)}
            className={`p-1.5 rounded-lg hover:bg-amber-50 cursor-pointer transition-colors ${
              email.isStarred ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'
            }`}
            title="标记星标"
          >
            <Star className={`w-3.5 h-3.5 ${email.isStarred ? 'fill-amber-400' : ''}`} />
          </button>
        </div>

        {/* 右侧 AI 捷径动作 */}
        <div className="flex items-center space-x-2">
          {/* 一键查看发件人画像 */}
          <button
            type="button"
            onClick={() => onOpenPersonaDrawer(email.from.email)}
            className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold flex items-center space-x-1.5 cursor-pointer transition-all active:scale-95 shadow-2xs"
          >
            <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
            <span>发件人画像档案</span>
          </button>

          {/* 触发 AI 需求深度透视 */}
          <button
            type="button"
            onClick={onTriggerAiAnalysis}
            className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-600 text-white font-semibold flex items-center space-x-1.5 cursor-pointer hover:brightness-110 active:scale-95 transition-all shadow-xs"
          >
            <BrainCircuit className="w-3.5 h-3.5" />
            <span>AI 深度需求分析</span>
          </button>
        </div>
      </div>

      {/* 2. 邮件详情主体滚动区 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* 邮件主题大标题 */}
        <div className="space-y-1.5">
          <div className="flex items-start justify-between">
            <h1 className="text-base md:text-lg font-bold text-slate-900 leading-snug select-text">
              {email.subject}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold font-mono border ${
              email.folder === 'sent'
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : email.folder === 'drafts'
                ? 'bg-slate-100 text-slate-700 border-slate-300'
                : email.folder === 'trash'
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : 'bg-sky-50 text-sky-700 border-sky-200'
            }`}>
              {email.folder === 'sent' ? '📤 已发送邮件' : email.folder === 'drafts' ? '📝 草稿箱' : email.folder === 'trash' ? '🗑️ 已删除' : '📥 收件箱'}
            </span>

            {email.tags && email.tags.filter(t => t !== '收件箱' && t !== '已发送').map((t, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* 发件人详情信息卡 (Foxmail 标志性 Sender Header) */}
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 flex items-start justify-between">
          <div className="flex items-start space-x-3 min-w-0">
            {/* 头像 */}
            {email.from.avatar ? (
              <img
                src={email.from.avatar}
                alt={email.from.name}
                className="w-10 h-10 rounded-xl object-cover shrink-0 border border-slate-200"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
                {email.from.name.slice(0, 1)}
              </div>
            )}

            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-900 text-xs truncate">
                  {email.folder === 'sent' ? `我 (${email.from.name || '发件人'})` : email.from.name}
                </span>
                {email.from.title && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-100 text-sky-800 font-medium">
                    {email.from.title}
                  </span>
                )}
                {email.folder === 'sent' && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 font-semibold font-mono">
                    已发出的邮件
                  </span>
                )}
              </div>

              <div className="text-[11px] text-slate-500 font-mono flex items-center space-x-2 truncate">
                <span>发件邮箱: {email.from.email}</span>
                {email.from.company && <span>· {email.from.company}</span>}
              </div>

              <div className={`text-[11px] ${email.folder === 'sent' ? 'text-slate-800 font-semibold' : 'text-slate-500'}`}>
                收件人: {email.to && email.to.length > 0 ? email.to.map((t) => `${t.name} <${t.email}>`).join('; ') : '未指定收件人'}
                {email.cc && email.cc.length > 0 && (
                  <span className="ml-2 font-normal text-slate-400">抄送: {email.cc.map((c) => c.name).join('; ')}</span>
                )}
              </div>
            </div>
          </div>

          <div className="text-right shrink-0 pl-3">
            <span className="text-[11px] text-slate-400 font-mono">
              {new Date(email.date).toLocaleString([], {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>

        {/* 附件展示栏 (若有) */}
        {email.attachments && email.attachments.length > 0 && (
          <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-2">
            <div className="flex items-center space-x-1.5 text-slate-700 font-bold text-xs">
              <Paperclip className="w-3.5 h-3.5 text-slate-500" />
              <span>附件清单 ({email.attachments.length})</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {email.attachments.map((att) => (
                <div
                  key={att.id}
                  className="p-2 rounded-lg border border-slate-200 hover:border-sky-300 hover:bg-sky-50/40 transition-all flex items-center justify-between text-xs"
                >
                  <div className="flex items-center space-x-2 truncate">
                    <FileText className="w-4 h-4 text-sky-600 shrink-0" />
                    <div className="truncate">
                      <div className="font-semibold text-slate-800 truncate">{att.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {(att.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => showToast?.('info', `已模拟调取附件 [${att.name}]`)}
                    className="p-1 rounded text-slate-400 hover:text-sky-600 cursor-pointer"
                    title="下载/查阅附件"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 正文呈现区 (支持 HTML / 纯文本规范渲染) */}
        <div className="pt-2 text-slate-800 leading-relaxed select-text font-sans text-xs">
          {email.bodyHtml ? (
            <div
              className="prose prose-sm max-w-none text-slate-800"
              dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
            />
          ) : email.bodyText ? (
            <div className="whitespace-pre-wrap leading-relaxed space-y-2">
              {email.bodyText}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 space-y-2 bg-slate-50/70 rounded-2xl border border-slate-200">
              <Loader2 className="w-5 h-5 text-sky-500 animate-spin mx-auto" />
              <p className="text-xs font-semibold text-slate-700">正在从邮箱服务器获取该邮件完整正文...</p>
              <p className="text-[10px] text-slate-400 font-mono">历史邮件正文按需毫秒级加载与本地缓存</p>
            </div>
          )}
        </div>
      </div>

      {/* 3. 底部快捷即时回复区 (Foxmail 标志性一键快速回复) */}
      <div className="p-3 border-t border-slate-200 bg-slate-50/80 space-y-2 shrink-0">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>快速回复发件人：<b>{email.from.name}</b></span>
          <button
            type="button"
            onClick={() => {
              const base = getSingleReplyData();
              if (quickReplyText.trim()) {
                base.body = quickReplyText.trim() + base.body;
              }
              onOpenReplyCompose(base);
            }}
            className="text-sky-600 hover:underline flex items-center space-x-1 cursor-pointer font-medium"
          >
            <Wand2 className="w-3 h-3" />
            <span>切换至全功能写信窗口 (含 AI 智能扩写)</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={quickReplyText}
            onChange={(e) => setQuickReplyText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleQuickSend()}
            placeholder={`直接回复给 ${email.from.email}，按回车快速发出...`}
            className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
          />
          <button
            type="button"
            onClick={handleQuickSend}
            disabled={!quickReplyText.trim() || sendingQuickReply}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl shadow-xs transition-all flex items-center space-x-1 cursor-pointer disabled:opacity-50 active:scale-95 shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>发送</span>
          </button>
        </div>
      </div>
    </div>
  );
};
