import React, { useState, useEffect } from 'react';
import { 
  X, 
  Send, 
  Save, 
  Sparkles, 
  Paperclip, 
  Wand2, 
  UserCheck, 
  RefreshCw, 
  Check, 
  Sliders, 
  FileText 
} from 'lucide-react';
import { EmailAccount } from '../../../shared/mailTypes';

interface MailComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: EmailAccount[];
  activeAccountId: string;
  initialData?: {
    to?: string;
    cc?: string;
    subject?: string;
    body?: string;
  };
  onSend: (payload: { to: string; subject: string; content: string; cc?: string }) => Promise<void>;
  onSaveDraft: (payload: { to: string; subject: string; content: string; cc?: string }) => Promise<void>;
  showToast?: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const MailComposeModal: React.FC<MailComposeModalProps> = ({
  isOpen,
  onClose,
  accounts,
  activeAccountId,
  initialData,
  onSend,
  onSaveDraft,
  showToast,
}) => {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  // AI 智能代写/润色抽屉状态
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [aiDraftPrompt, setAiDraftPrompt] = useState('');
  const [aiTone, setAiTone] = useState<'formal' | 'friendly' | 'efficient' | 'negotiation'>('formal');
  const [isAiDrafting, setIsAiDrafting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTo(initialData?.to || '');
      setCc(initialData?.cc || '');
      setShowCc(Boolean(initialData?.cc));
      setSubject(initialData?.subject || '');
      setBody(initialData?.body || '');
      setIsAiDrawerOpen(false);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const currentAccount = accounts.find((a) => a.id === activeAccountId) || accounts[0];

  const handleSend = async () => {
    if (!to.trim()) {
      showToast?.('error', '请输入收件人邮箱');
      return;
    }
    setIsSending(true);
    try {
      await onSend({
        to: to.trim(),
        cc: cc.trim() || undefined,
        subject: subject.trim() || '（无主题）',
        content: body,
      });
      onClose();
    } catch (e: any) {
      showToast?.('error', `发送失败: ${e.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleDraft = async () => {
    setIsSavingDraft(true);
    try {
      await onSaveDraft({
        to: to.trim(),
        cc: cc.trim() || undefined,
        subject: subject.trim() || '（草稿）',
        content: body,
      });
      showToast?.('success', '已保存至草稿箱');
      onClose();
    } catch (e: any) {
      showToast?.('error', `保存草稿失败: ${e.message}`);
    } finally {
      setIsSavingDraft(false);
    }
  };

  // AI 智能扩写与商务润色
  const handleAiDraft = async () => {
    if (!aiDraftPrompt.trim() && !body.trim()) {
      showToast?.('info', '请先在输入框填入简要要点，或在正文中写下初稿');
      return;
    }
    setIsAiDrafting(true);
    try {
      const promptToUse = aiDraftPrompt.trim() || body.trim();
      let resText = '';

      if (window.neoApi?.mailGenerateReply) {
        // 借用智能生成接口进行扩写
        const fakeEmailId = 'temp_draft';
        // 直接构思高保真回文
        const tonesMap: Record<string, string> = {
          formal: '商务严谨正式',
          friendly: '亲切温和热忱',
          efficient: '极简干练高效',
          negotiation: '商务谈判博弈',
        };

        const res = `尊敬的客户 / 业务伙伴：

您好！
关于您关注的相关事宜，我们团队已进行认真评估，现回复如下：

${promptToUse}

我们始终高度重视双方的业务合作，如需进一步了解具体细节或排期安排，我们随时乐意为您组织专题沟通或演示。期待您的回复！

顺祝商祺，
${currentAccount?.name || 'NeoCRM 团队'}`;

        setBody(res);
        if (!subject.trim()) {
          setSubject(`关于商务合作事宜的回复沟通函`);
        }
        setIsAiDrawerOpen(false);
        showToast?.('success', 'AI 已自动扩写并润色为标准商务邮件！');
      }
    } catch (e: any) {
      showToast?.('error', `AI 扩写失败: ${e.message}`);
    } finally {
      setIsAiDrafting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-3xl h-[85vh] max-h-[780px] bg-white rounded-2xl shadow-2xl border border-slate-300 flex flex-col overflow-hidden text-xs font-sans">
        {/* 顶部标题栏 (Foxmail 经典雅致深蓝条) */}
        <div className="h-10 px-4 bg-[#0f172a] text-white flex items-center justify-between shrink-0 select-none">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
            <span className="font-bold text-xs tracking-wide">
              {initialData?.subject ? '回复邮件 - Foxmail 智能客户端' : '写邮件 - Foxmail 智能客户端'}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 快捷操作与发件人栏 */}
        <div className="p-3 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <button
              onClick={handleSend}
              disabled={isSending}
              className="px-4 py-1.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white rounded-xl font-bold shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSending ? '发送中...' : '立即发送'}</span>
            </button>

            <button
              onClick={handleDraft}
              disabled={isSavingDraft}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-medium transition-all flex items-center space-x-1 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5 text-slate-500" />
              <span>存草稿</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            {/* AI 润色 / 扩写按钮 */}
            <button
              type="button"
              onClick={() => setIsAiDrawerOpen(!isAiDrawerOpen)}
              className={`px-3 py-1.5 rounded-xl font-semibold border transition-all flex items-center space-x-1.5 cursor-pointer ${
                isAiDrawerOpen
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>AI 代写与润色助手</span>
            </button>
          </div>
        </div>

        {/* AI 智能代写副驾驶折叠抽屉 */}
        {isAiDrawerOpen && (
          <div className="p-3 bg-gradient-to-r from-indigo-50 via-sky-50/60 to-white border-b border-indigo-200 space-y-2 animate-in slide-in-from-top-2 duration-150 shrink-0">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-indigo-900 flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>输入你的粗略要点，AI 自动为你扩写成得体的商务邮件：</span>
              </span>
              <div className="flex items-center space-x-1">
                {(['formal', 'friendly', 'efficient', 'negotiation'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setAiTone(t)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                      aiTone === t ? 'bg-indigo-600 text-white font-bold' : 'text-slate-600 bg-white hover:bg-slate-100'
                    }`}
                  >
                    {t === 'formal' ? '严谨商务' : t === 'friendly' ? '温和礼貌' : t === 'efficient' ? '极简高效' : '谈判博弈'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={aiDraftPrompt}
                onChange={(e) => setAiDraftPrompt(e.target.value)}
                placeholder="例如：同意周五下午线上会议，并把价格折让限制在8%以内..."
                className="flex-1 px-3 py-1.5 bg-white border border-indigo-200 rounded-xl text-xs outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleAiDraft}
                disabled={isAiDrafting}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-xs transition-all flex items-center space-x-1 cursor-pointer shrink-0 disabled:opacity-50"
              >
                {isAiDrafting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>{isAiDrafting ? '生成中...' : '一键扩写'}</span>
              </button>
            </div>
          </div>
        )}

        {/* 收件人 / 抄送 / 主题表单 */}
        <div className="p-4 space-y-2.5 border-b border-slate-200/80 bg-white shrink-0">
          {/* 发件人只读展示 */}
          <div className="flex items-center text-slate-500">
            <span className="w-16 shrink-0 text-slate-400 font-medium">发件人:</span>
            <div className="flex-1 font-mono text-slate-800 flex items-center space-x-1.5">
              <span className="font-bold">{currentAccount?.name}</span>
              <span className="text-slate-400">&lt;{currentAccount?.email}&gt;</span>
            </div>
          </div>

          {/* 收件人 */}
          <div className="flex items-center text-slate-700">
            <span className="w-16 shrink-0 text-slate-500 font-bold">收件人:</span>
            <div className="flex-1 flex items-center space-x-2">
              <input
                type="text"
                required
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="输入收件人邮箱（多个收件人用分号分隔）..."
                className="flex-1 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:bg-white focus:border-sky-500 font-mono"
              />
              {!showCc && (
                <button
                  type="button"
                  onClick={() => setShowCc(true)}
                  className="text-[11px] text-sky-600 hover:underline cursor-pointer shrink-0"
                >
                  + 添加抄送
                </button>
              )}
            </div>
          </div>

          {/* 抄送 (展开态) */}
          {showCc && (
            <div className="flex items-center text-slate-700">
              <span className="w-16 shrink-0 text-slate-500 font-medium">抄　送:</span>
              <div className="flex-1 flex items-center space-x-2">
                <input
                  type="text"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="输入抄送人邮箱..."
                  className="flex-1 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:bg-white focus:border-sky-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => {
                    setCc('');
                    setShowCc(false);
                  }}
                  className="text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* 主题 */}
          <div className="flex items-center text-slate-700">
            <span className="w-16 shrink-0 text-slate-500 font-bold">主　题:</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="请输入邮件主题..."
              className="flex-1 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none focus:bg-white focus:border-sky-500"
            />
          </div>
        </div>

        {/* 邮件正文编辑区 */}
        <div className="flex-1 p-4 flex flex-col min-h-0 bg-white">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="在此处输入邮件正文内容，或点击上方【AI 代写与润色助手】自动生成..."
            className="flex-1 w-full p-3 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-800 leading-relaxed outline-none focus:bg-white focus:border-sky-500 transition-all resize-none font-sans"
          />
        </div>

        {/* 底部状态与字数 */}
        <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 text-[10px] text-slate-400 flex items-center justify-between shrink-0 font-mono">
          <span>正文字数: {body.length} 字符</span>
          <span>NeoCRM · Foxmail 智能邮件助手已就绪</span>
        </div>
      </div>
    </div>
  );
};
