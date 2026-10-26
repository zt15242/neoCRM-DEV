import React, { useState } from 'react';
import { 
  X, 
  Check, 
  ChevronRight, 
  AlertCircle, 
  Loader2, 
  ShieldCheck, 
  HelpCircle, 
  Sliders, 
  ArrowLeft,
  Mail,
  Lock,
  User,
  Server
} from 'lucide-react';
import { 
  EmailProviderType, 
  EMAIL_PROVIDER_PRESETS, 
  EmailProviderPreset,
  CreateEmailAccountPayload
} from '../../../shared/mailTypes';

interface MailAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountCreated: () => void;
  showToast?: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const MailAccountModal: React.FC<MailAccountModalProps> = ({
  isOpen,
  onClose,
  onAccountCreated,
  showToast,
}) => {
  // 步骤 1: 选择服务商 (对应用户截图的 8 大服务商列表)
  // 步骤 2: 填写邮箱账号与密码/授权码，并支持高级服务器配置
  const [selectedProvider, setSelectedProvider] = useState<EmailProviderPreset | null>(null);

  // 表单状态
  const [emailInput, setEmailInput] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 高级服务器配置
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState(993);
  const [imapSsl, setImapSsl] = useState(true);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(465);
  const [smtpSsl, setSmtpSsl] = useState(true);

  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // 选择某个服务商
  const handleSelectProvider = (preset: EmailProviderPreset) => {
    setSelectedProvider(preset);
    setErrorMessage(null);
    setEmailInput('');
    setAuthPassword('');
    setNameInput('');
    setImapHost(preset.defaultImapHost);
    setImapPort(preset.defaultImapPort);
    setImapSsl(preset.defaultImapSsl);
    setSmtpHost(preset.defaultSmtpHost);
    setSmtpPort(preset.defaultSmtpPort);
    setSmtpSsl(preset.defaultSmtpSsl);
    setShowAdvanced(preset.id === 'custom' || preset.id === 'exchange');
  };

  // 提交并连接测试
  const handleSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProvider) return;

    const cleanEmail = emailInput.trim();
    const cleanPassword = authPassword.trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMessage('请输入正确的邮箱地址（例如: user@example.com）');
      return;
    }
    if (!cleanPassword) {
      setErrorMessage('请输入登录密码或客户端授权码');
      return;
    }

    setIsVerifying(true);
    setErrorMessage(null);

    const payload: CreateEmailAccountPayload = {
      provider: selectedProvider.id,
      email: cleanEmail,
      authPassword: cleanPassword,
      name: nameInput.trim() || cleanEmail.split('@')[0],
      authUsername: cleanEmail,
      imapHost: imapHost.trim() || selectedProvider.defaultImapHost,
      imapPort: Number(imapPort) || 993,
      imapSsl,
      smtpHost: smtpHost.trim() || selectedProvider.defaultSmtpHost,
      smtpPort: Number(smtpPort) || 465,
      smtpSsl,
    };

    try {
      if (window.neoApi?.mailTestAndSaveAccount) {
        const res = await window.neoApi.mailTestAndSaveAccount(payload);
        if (res.success) {
          showToast?.('success', `🎉 账号 [${cleanEmail}] 连接登录成功！正在同步邮件...`);
          onAccountCreated();
          onClose();
        } else {
          setErrorMessage(res.error || '邮箱验证失败，请检查账号与密码');
        }
      } else {
        setErrorMessage('邮箱接口未就绪');
      }
    } catch (err: any) {
      setErrorMessage(err.message || '网络连接超时或服务器拒绝访问');
    } finally {
      setIsVerifying(false);
    }
  };

  // 渲染 8 大品牌专属 Logo 图标
  const renderProviderIcon = (id: EmailProviderType) => {
    switch (id) {
      case 'tencent_exmail':
        return (
          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-blue-600 fill-current">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" />
            </svg>
          </div>
        );
      case 'qq':
        return (
          <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5">
              <path fill="#0288D1" d="M12 2a9 9 0 0 0-9 9c0 3.8 2.4 7 5.7 8.3L8 22l3.4-1.2A9 9 0 1 0 12 2z" />
              <circle cx="9" cy="11" r="1.5" fill="#FFF" />
              <circle cx="15" cy="11" r="1.5" fill="#FFF" />
            </svg>
          </div>
        );
      case 'exchange':
        return (
          <div className="w-9 h-9 rounded-xl bg-blue-900 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-xs">
            E
          </div>
        );
      case 'm365_intl':
        return (
          <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 p-2 gap-0.5 shrink-0">
            <div className="bg-[#f25022] rounded-xs" />
            <div className="bg-[#7fba00] rounded-xs" />
            <div className="bg-[#00a4ef] rounded-xs" />
            <div className="bg-[#ffb900] rounded-xs" />
          </div>
        );
      case 'm365_cn':
        return (
          <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 p-2 gap-0.5 shrink-0 relative">
            <div className="bg-[#f25022] rounded-xs" />
            <div className="bg-[#7fba00] rounded-xs" />
            <div className="bg-[#00a4ef] rounded-xs" />
            <div className="bg-[#ffb900] rounded-xs" />
          </div>
        );
      case 'gmail':
        return (
          <div className="w-9 h-9 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center shrink-0">
            <span className="font-bold text-base text-red-600 font-sans tracking-tight">M</span>
          </div>
        );
      case '163':
        return (
          <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center text-white font-bold text-xs shrink-0 font-mono shadow-xs">
            163
          </div>
        );
      default:
        return (
          <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0">
            <Mail className="w-5 h-5 text-slate-500" />
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-300 flex flex-col overflow-hidden text-xs font-sans">
        {/* 顶部标题栏 (Foxmail 标志性经典蓝黑) */}
        <div className="h-11 px-4 bg-[#0f172a] text-white flex items-center justify-between shrink-0 select-none">
          <div className="flex items-center space-x-2">
            {selectedProvider && (
              <button
                type="button"
                onClick={() => {
                  setSelectedProvider(null);
                  setErrorMessage(null);
                }}
                className="p-1 -ml-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer mr-1"
                title="返回选择其他服务商"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <Mail className="w-4 h-4 text-sky-400" />
            <span className="font-bold text-sm tracking-wide">
              {selectedProvider ? `添加 ${selectedProvider.name} 账户` : '选择邮箱类型 - Foxmail 客户端'}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 步骤 1: 呈现用户截图中的 8 大经典服务商列表 */}
        {!selectedProvider ? (
          <div className="flex-1 p-5 overflow-y-auto space-y-4">
            <div className="text-center space-y-1">
              <h3 className="font-bold text-slate-800 text-sm">选择你的邮件服务提供商</h3>
              <p className="text-[11px] text-slate-500">
                支持添加多个独立邮箱账户，随时无缝切换收发信与人物画像分析
              </p>
            </div>

            {/* 8 大服务商网格/列表 (完全对齐用户提供的图片) */}
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl bg-white shadow-2xs overflow-hidden">
              {EMAIL_PROVIDER_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectProvider(preset)}
                  className="w-full p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer text-left group"
                >
                  <div className="flex items-center space-x-3.5 min-w-0">
                    {renderProviderIcon(preset.id)}
                    <div>
                      <div className="font-bold text-xs text-slate-800 group-hover:text-sky-600 transition-colors flex items-center space-x-2">
                        <span>{preset.name}</span>
                        <span className="text-[10px] font-normal font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-500">
                          {preset.badge}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[320px]">
                        {preset.helpTip}
                      </div>
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-sky-500 transition-colors shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* 步骤 2: 填写邮箱与密码并真实连接测试 */
          <form onSubmit={handleSubmitLogin} className="flex-1 p-5 overflow-y-auto space-y-4">
            {/* 当前服务商标牌 */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {renderProviderIcon(selectedProvider.id)}
                <div>
                  <div className="font-bold text-slate-900 text-xs">{selectedProvider.name}</div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    接收: {imapHost || selectedProvider.defaultImapHost}:{imapPort} (SSL)
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedProvider(null)}
                className="text-[11px] text-sky-600 hover:underline cursor-pointer font-medium"
              >
                更改类型
              </button>
            </div>

            {/* 错误提示 */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">{errorMessage}</div>
              </div>
            )}

            {/* 表单字段 */}
            <div className="space-y-3">
              {/* 邮箱地址 */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 flex items-center space-x-1">
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  <span>完整的电子邮箱地址</span>
                </label>
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder={selectedProvider.placeholderEmail}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs outline-none focus:bg-white focus:border-sky-500 font-mono"
                />
              </div>

              {/* 密码 / 授权码 */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-700 flex items-center space-x-1">
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    <span>{selectedProvider.authCodeLabel}</span>
                  </label>
                </div>
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="请输入您的邮箱密码或客户端专用授权码..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs outline-none focus:bg-white focus:border-sky-500 font-mono"
                />
                <p className="text-[10px] text-amber-700 bg-amber-50/70 p-2 rounded-lg border border-amber-200/60 leading-relaxed mt-1">
                  💡 {selectedProvider.helpTip}
                </p>
              </div>

              {/* 发件人姓名 (显示名称) */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 flex items-center space-x-1">
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  <span>发件人姓名 / 称谓 (选填)</span>
                </label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="如: 张经理 / 技术架构部"
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs outline-none focus:bg-white focus:border-sky-500"
                />
              </div>

              {/* 高级服务器设置折叠 */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-[11px] text-slate-500 hover:text-sky-600 font-medium flex items-center space-x-1 cursor-pointer"
                >
                  <Sliders className="w-3 h-3" />
                  <span>{showAdvanced ? '收起高级服务器设置' : '高级服务器设置 (IMAP / SMTP 端口与SSL)'}</span>
                </button>

                {showAdvanced && (
                  <div className="mt-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2.5 animate-in fade-in text-xs">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2 space-y-1">
                        <label className="text-[10px] text-slate-500 font-mono">IMAP 接收服务器</label>
                        <input
                          type="text"
                          value={imapHost}
                          onChange={(e) => setImapHost(e.target.value)}
                          className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 font-mono">端口</label>
                        <input
                          type="number"
                          value={imapPort}
                          onChange={(e) => setImapPort(Number(e.target.value))}
                          className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2 space-y-1">
                        <label className="text-[10px] text-slate-500 font-mono">SMTP 发送服务器</label>
                        <input
                          type="text"
                          value={smtpHost}
                          onChange={(e) => setSmtpHost(e.target.value)}
                          className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 font-mono">端口</label>
                        <input
                          type="number"
                          value={smtpPort}
                          onChange={(e) => setSmtpPort(Number(e.target.value))}
                          className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 底部操作按键 */}
            <div className="pt-2 flex items-center justify-end space-x-2.5 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 font-medium cursor-pointer transition-colors"
              >
                取消
              </button>

              <button
                type="submit"
                disabled={isVerifying}
                className="px-5 py-2 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white rounded-xl font-bold shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>正在连接真实服务器验证...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>验证并添加账户</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
