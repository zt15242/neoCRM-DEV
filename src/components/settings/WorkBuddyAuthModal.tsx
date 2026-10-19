import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  QrCode, 
  ExternalLink, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Cpu, 
  Globe, 
  ShieldCheck, 
  Smartphone,
  LogOut
} from 'lucide-react';

interface WorkBuddyAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const WorkBuddyAuthModal: React.FC<WorkBuddyAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  showToast,
}) => {
  const [realm, setRealm] = useState<'cn' | 'intl'>('cn');
  const [loading, setLoading] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [authUrl, setAuthUrl] = useState<string>('');
  const [state, setState] = useState<string>('');
  const [pollStatus, setPollStatus] = useState<string>('正在准备二维码...');
  const [currentAccount, setCurrentAccount] = useState<any>(null);
  const [loginSuccess, setLoginSuccess] = useState(false);

  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      checkStatusAndInit();
    } else {
      clearTimer();
      setLoginSuccess(false);
    }
    return () => clearTimer();
  }, [isOpen, realm]);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const checkStatusAndInit = async () => {
    try {
      if (window.neoApi?.workbuddyGetStatus) {
        const res = await window.neoApi.workbuddyGetStatus();
        if (res.loggedIn && res.account) {
          setCurrentAccount(res.account);
        } else {
          setCurrentAccount(null);
          await startNewLogin();
        }
      } else {
        await startNewLogin();
      }
    } catch {
      await startNewLogin();
    }
  };

  const startNewLogin = async () => {
    clearTimer();
    setLoading(true);
    setLoginSuccess(false);
    setPollStatus('正在向腾讯微伴网关申请二维码...');
    try {
      if (!window.neoApi?.workbuddyStartLogin) {
        throw new Error('当前客户端尚未注入 WorkBuddy 接口');
      }
      const res = await window.neoApi.workbuddyStartLogin(realm);
      setQrDataUrl(res.qrDataUrl);
      setAuthUrl(res.authUrl);
      setState(res.state);
      setPollStatus('请使用手机微信/客户端扫描二维码授权...');

      // 启动 1.5 秒轮询
      timerRef.current = setInterval(async () => {
        try {
          const pollRes = await window.neoApi.workbuddyPollLogin(res.state, realm);
          if (pollRes.status === 'ok' && pollRes.account) {
            clearTimer();
            setLoginSuccess(true);
            setCurrentAccount(pollRes.account);
            setPollStatus(`✅ 授权成功！欢迎，${pollRes.account.nickname || pollRes.account.uid}`);
            showToast('success', `WorkBuddy 授权成功！欢迎 ${pollRes.account.nickname || pollRes.account.uid}`);
            onSuccess();
            setTimeout(() => {
              onClose();
            }, 1200);
          } else if (pollRes.status === 'expired') {
            clearTimer();
            setPollStatus('二维码已过期，请点击刷新');
          } else if (pollRes.message) {
            setPollStatus(pollRes.message);
          }
        } catch (e: any) {
          console.warn('轮询异常:', e.message);
        }
      }, 1500);
    } catch (e: any) {
      setPollStatus(`获取二维码失败: ${e.message}`);
      showToast('error', `获取二维码异常: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (window.neoApi?.workbuddyLogout) {
        await window.neoApi.workbuddyLogout();
        setCurrentAccount(null);
        showToast('info', '已退出当前 WorkBuddy 账号');
        onSuccess();
        await startNewLogin();
      }
    } catch (e: any) {
      showToast('error', `退出失败: ${e.message}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
        {/* 标题栏 */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-600 to-sky-600 flex items-center justify-center text-white shadow-sm shadow-cyan-500/20">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">WorkBuddy / CodeBuddy 扫码登录</h3>
              <p className="text-[11px] text-slate-500">登录腾讯账号即可直接调度官方全量 AI 模型</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* 当前已登录账号信息 (若已登录) */}
          {currentAccount && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs font-bold text-emerald-900">{currentAccount.nickname || currentAccount.uid}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-medium">
                      {currentAccount.realm === 'cn' ? '国内版' : '国际版'}
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-700 mt-0.5">
                    账号 UID: {currentAccount.uid?.slice(0, 16)}...
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="px-2.5 py-1 text-xs rounded-lg border border-emerald-300 text-emerald-800 hover:bg-emerald-100 flex items-center space-x-1 font-medium transition-colors cursor-pointer"
              >
                <LogOut className="w-3 h-3" />
                <span>退出登录</span>
              </button>
            </div>
          )}

          {/* 区域切换 Tabs (国内版 vs 国际版) */}
          <div className="flex p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setRealm('cn');
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                realm === 'cn'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span>🇨🇳 国内版 (codebuddy.cn)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setRealm('intl');
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                realm === 'intl'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span>🌐 国际版 (workbuddy.ai)</span>
            </button>
          </div>

          {/* 二维码展示区 */}
          <div className="flex flex-col items-center justify-center p-4 bg-slate-50 border border-slate-200/80 rounded-2xl relative min-h-[280px]">
            {loading ? (
              <div className="flex flex-col items-center space-y-2 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-600" />
                <span className="text-xs">正在向腾讯安全通道申请授权码...</span>
              </div>
            ) : qrDataUrl ? (
              <div className="flex flex-col items-center space-y-3">
                <div className="relative p-2 bg-white rounded-xl shadow-xs border border-slate-200">
                  <img
                    src={qrDataUrl}
                    alt="WorkBuddy 扫码登录"
                    className="w-56 h-56 rounded-lg object-contain"
                  />
                  {loginSuccess && (
                    <div className="absolute inset-0 bg-white/90 backdrop-blur-2xs rounded-xl flex flex-col items-center justify-center text-emerald-600 animate-in fade-in">
                      <CheckCircle2 className="w-12 h-12" />
                      <span className="text-xs font-bold mt-2">授权成功！</span>
                    </div>
                  )}
                </div>

                {/* 状态与指导说明 */}
                <div className="text-center space-y-1">
                  <div className="flex items-center justify-center space-x-1.5 text-xs font-medium text-slate-700">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>{pollStatus}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {realm === 'cn'
                      ? '支持使用微信扫一扫或腾讯微伴客户端扫码'
                      : '支持使用手机扫描二维码或浏览器快捷授权'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-2 text-rose-500">
                <AlertCircle className="w-8 h-8" />
                <span className="text-xs">{pollStatus}</span>
              </div>
            )}
          </div>

          {/* 辅助操作栏 */}
          <div className="flex items-center justify-between text-xs pt-1">
            <button
              type="button"
              onClick={startNewLogin}
              disabled={loading}
              className="text-slate-600 hover:text-slate-900 font-medium flex items-center space-x-1 p-1 rounded transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>刷新二维码</span>
            </button>

            {authUrl && (
              <button
                type="button"
                onClick={() => window.neoApi.openExternal(authUrl)}
                className="text-cyan-700 hover:text-cyan-800 font-semibold flex items-center space-x-1 p-1 rounded transition-colors cursor-pointer"
              >
                <span>在默认浏览器打开登录页</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* 底部特性提示 */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-500 space-y-1">
            <div className="flex items-center space-x-1 text-slate-700 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>内置安全反向代理保障</span>
            </div>
            <p className="leading-relaxed">
              登录凭据仅在本地设备安全存储并用于与腾讯官方接口通信。系统已内置自动保活与静默续期机制，无需长期扫码。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
