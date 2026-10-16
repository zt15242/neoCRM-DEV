import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  User, 
  Clock, 
  RefreshCw, 
  Copy, 
  Check, 
  ExternalLink, 
  LogOut, 
  ShieldCheck, 
  Code2, 
  CheckCircle2, 
  AlertTriangle,
  Activity,
  Radio,
  Globe,
  KeyRound,
  Edit3,
  X
} from 'lucide-react';
import { SessionState } from '../../shared/types';

interface SessionDashboardProps {
  session: SessionState;
  onRefresh: () => void | Promise<void>;
  onReLogin?: () => void;
  onLogout: () => void;
  onOpenDesigner: (type: 'web' | 'h5') => void;
  onTestApi: () => Promise<{ success: boolean; data?: any; error?: string }>;
  onRefreshSession?: () => void;
  showToast?: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const SessionDashboard: React.FC<SessionDashboardProps> = ({
  session,
  onRefresh,
  onReLogin,
  onLogout,
  onOpenDesigner,
  onTestApi,
  onRefreshSession,
  showToast,
}) => {
  const { environment, tokenData } = session;
  const [copiedCookie, setCopiedCookie] = useState(false);
  const [cookieModalOpen, setCookieModalOpen] = useState(false);
  const [manualCookieInput, setManualCookieInput] = useState(tokenData?.cookieString || "");
  const [isCapturingCookie, setIsCapturingCookie] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [timeLeftStr, setTimeLeftStr] = useState<string>('');
  const [isExpiringSoon, setIsExpiringSoon] = useState(false);
  const [apiTestResult, setApiTestResult] = useState<{ success: boolean; msg: string } | null>(null);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tokenExpiredCloud, setTokenExpiredCloud] = useState(false);

  // 计算 Token 剩余倒计时 (纯客户端展示，彻底移除前端循环调用 onRefresh 产生的弹窗死循环)
  useEffect(() => {
    if (!tokenData?.expiresAt) return;

    const updateCountdown = () => {
      const now = Date.now();
      const diff = tokenData.expiresAt - now;

      if (diff <= 0) {
        setTimeLeftStr('已过期，请重新登录');
        setIsExpiringSoon(true);
        return;
      }

      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      setTimeLeftStr(`${hours}小时 ${minutes}分 ${seconds}秒`);
      setIsExpiringSoon(diff < 15 * 60 * 1000);
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [tokenData?.expiresAt]);

  const handleManualRefresh = async () => {
    if (isRefreshing || !onRefresh) return;
    setIsRefreshing(true);
    setTokenExpiredCloud(false);
    try {
      const res = onRefresh();
      if (res instanceof Promise) {
        await res;
      }
    } catch (e: any) {
      if (e.message?.includes('invalid_grant') || e.message?.includes('expired access/refresh token')) {
        setTokenExpiredCloud(true);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCopyCookie = () => {
    if (tokenData?.cookieString) {
      navigator.clipboard.writeText(tokenData.cookieString);
      setCopiedCookie(true);
      setTimeout(() => setCopiedCookie(false), 2000);
    }
  };

  const handleCaptureCookie = async () => {
    if (!window.neoApi?.captureWebCookie) return;
    setIsCapturingCookie(true);
    try {
      await window.neoApi.captureWebCookie();
      onRefreshSession?.();
      showToast?.("success", "已成功捕获后台 Web 会话 Cookie！");
    } catch (e: any) {
      showToast?.("error", `捕获 Cookie 失败: ${e.message}`);
    } finally {
      setIsCapturingCookie(false);
    }
  };

  const handleSaveCookie = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.neoApi?.updateSessionCookie) return;
    try {
      await window.neoApi.updateSessionCookie(manualCookieInput.trim());
      onRefreshSession?.();
      setCookieModalOpen(false);
      showToast?.("success", "Web 会话 Cookie 已更新保存！");
    } catch (e: any) {
      showToast?.("error", `保存 Cookie 失败: ${e.message}`);
    }
  };

  const handleCopyToken = () => {
    if (tokenData?.access_token) {
      navigator.clipboard.writeText(tokenData.access_token);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  const handleTestApiCall = async () => {
    setIsTestingApi(true);
    setApiTestResult(null);
    try {
      const res = await onTestApi();
      if (res.success) {
        setApiTestResult({ success: true, msg: 'API 通信正常 (租户身份与实例校验通过)' });
      } else {
        setApiTestResult({ success: false, msg: `API 请求异常: ${res.error}` });
      }
    } finally {
      setIsTestingApi(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 状态总览卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* 租户信息 */}
        <div className="p-4 bg-white border border-slate-200/90 rounded-xl space-y-1.5 shadow-2xs">
          <div className="flex items-center space-x-2 text-slate-500 text-xs">
            <Building2 className="w-4 h-4 text-sky-600" />
            <span className="font-medium">当前租户</span>
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 truncate">
              {tokenData?.userInfo?.tenantName || '未命名租户'}
            </h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              Tenant ID: <span className="text-sky-600 font-medium">{tokenData?.tenant_id || '未返回'}</span>
            </p>
          </div>
        </div>

        {/* 登录用户信息 */}
        <div className="p-4 bg-white border border-slate-200/90 rounded-xl space-y-1.5 shadow-2xs">
          <div className="flex items-center space-x-2 text-slate-500 text-xs">
            <User className="w-4 h-4 text-emerald-600" />
            <span className="font-medium">认证用户</span>
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 truncate">
              {tokenData?.userInfo?.name || '未知用户'}
            </h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5 truncate">
              User ID: {tokenData?.userInfo?.userId || 'N/A'}
            </p>
          </div>
        </div>

        {/* Token 有效期 */}
        <div className="p-4 bg-white border border-slate-200/90 rounded-xl space-y-1.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-1.5 text-slate-500">
              <Clock className="w-4 h-4 text-amber-600" />
              <span className="font-medium">访问令牌有效性</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-600 font-medium border border-emerald-200/60 flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>自动续期</span>
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="text-[11px] text-sky-600 hover:text-sky-700 disabled:opacity-50 font-medium flex items-center space-x-1 transition-colors cursor-pointer"
                title="使用 Refresh Token 静默续期换取新令牌"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? '续期中...' : '手动续期'}</span>
              </button>
              {onReLogin && (
                <button
                  onClick={onReLogin}
                  className={`text-[11px] font-medium flex items-center space-x-1 transition-colors cursor-pointer border-l border-slate-200 pl-2 ${
                    tokenExpiredCloud
                      ? 'text-rose-600 hover:text-rose-700 font-bold animate-pulse'
                      : 'text-amber-600 hover:text-amber-700'
                  }`}
                  title="当刷新令牌失效时，点击重新唤起认证窗口换取全新令牌"
                >
                  <KeyRound className="w-3 h-3" />
                  <span>重新登录</span>
                </button>
              )}
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span
                className={`text-base font-bold font-mono ${
                  isExpiringSoon ? 'text-amber-600 animate-pulse' : 'text-emerald-600'
                }`}
              >
                {timeLeftStr || '计算中...'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              环境: {environment?.name} ({tokenData?.instance_uri})
            </p>
          </div>
        </div>
      </div>

      {/* Access Token 详细卡片 */}
      <div className="p-4 bg-white border border-slate-200/90 rounded-xl space-y-3 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-sky-600" />
            <span className="text-xs font-semibold text-slate-800">OAuth2 Access Token</span>
          </div>
          <div>
            <button
              onClick={handleCopyToken}
              className="flex items-center space-x-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-lg transition-colors border border-slate-200 font-medium"
            >
              {copiedToken ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-600">已复制</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>复制令牌</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 font-mono text-xs text-slate-700 break-all select-all max-h-24 overflow-y-auto">
          {tokenData?.access_token}
        </div>
      </div>

      {/* Web 管理员会话 Cookie 卡片 */}
      <div className="p-4 bg-white border border-slate-200/90 rounded-xl space-y-3 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Globe className="w-4 h-4 text-teal-600" />
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-800">Web 管理员会话 Cookie (Admin Session)</span>
              {tokenData?.cookieString ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>已捕获 ({tokenData.cookies?.length || 1} 项)</span>
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium flex items-center space-x-1">
                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                  <span>未捕获 (内部自动流程接口推荐)</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {tokenData?.cookieString && (
              <button
                onClick={handleCopyCookie}
                className="flex items-center space-x-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-lg transition-colors border border-slate-200 font-medium cursor-pointer"
              >
                {copiedCookie ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-600">已复制</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>复制 Cookie</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={handleCaptureCookie}
              disabled={isCapturingCookie}
              className="flex items-center space-x-1 px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs rounded-lg transition-colors border border-teal-200 font-medium cursor-pointer"
              title="自动开启后台独立窗口捕获当前会话 Cookies"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCapturingCookie ? "animate-spin" : ""}`} />
              <span>捕获/刷新 Cookie</span>
            </button>

            <button
              onClick={() => {
                setManualCookieInput(tokenData?.cookieString || "");
                setCookieModalOpen(true);
              }}
              className="flex items-center space-x-1 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs rounded-lg transition-colors border border-slate-200 font-medium cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>配置</span>
            </button>
          </div>
        </div>

        {tokenData?.cookieString ? (
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 font-mono text-xs text-slate-700 break-all select-all max-h-24 overflow-y-auto">
            {tokenData.cookieString}
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-amber-50/60 border border-amber-200 text-xs text-amber-800 leading-relaxed flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              当前租户使用 OAuth2 令牌登录。若需使用<strong>自动流程代码级配置与后台管理接口 (/admin/creekflow/*.action)</strong>，建议点击右上角【捕获/刷新 Cookie】自动提取，或点击【配置】直接粘贴浏览器 DevTools Cookie。
            </div>
          </div>
        )}
      </div>

      {/* 快捷工具中心 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 工具 1: 页面设计器快捷入口 */}
        <div className="p-4 bg-white border border-slate-200/90 rounded-xl space-y-3 shadow-2xs">
          <div className="flex items-center space-x-2">
            <Code2 className="w-4 h-4 text-emerald-600" />
            <h4 className="text-sm font-semibold text-slate-900">NeoCRM 设计器与在线开发</h4>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            便捷打开当前实例的 UI 页面设计器与调试环境，快速进入设计与配置画布。
          </p>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => onOpenDesigner('web')}
              className="flex items-center space-x-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>打开 Web 端页面设计器</span>
            </button>
            <button
              onClick={() => onOpenDesigner('h5')}
              className="flex items-center space-x-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>打开 H5 端设计器</span>
            </button>
          </div>
        </div>

        {/* 工具 2: 实例连通性与通信校验 */}
        <div className="p-4 bg-white border border-slate-200/90 rounded-xl space-y-3 shadow-2xs">
          <div className="flex items-center space-x-2">
            <Radio className="w-4 h-4 text-sky-600" />
            <h4 className="text-sm font-semibold text-slate-900">实例连接状态与通信测试</h4>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            向当前 NeoCRM 实例发起轻量级服务验证，检查 API 鉴权与网络链路健康度。
          </p>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={handleTestApiCall}
              disabled={isTestingApi}
              className="flex items-center space-x-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 transition-all disabled:opacity-50"
            >
              <Activity className={`w-3.5 h-3.5 ${isTestingApi ? 'animate-spin text-sky-600' : ''}`} />
              <span>即时测试 API 通信状态</span>
            </button>
          </div>

          {apiTestResult && (
            <div
              className={`p-2.5 rounded-lg text-xs flex items-center space-x-2 ${
                apiTestResult.success
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {apiTestResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              )}
              <span>{apiTestResult.msg}</span>
            </div>
          )}
        </div>
      </div>

      {/* 底部登出与操作 */}
      <div className="pt-2 flex justify-end">
        <button
          onClick={onLogout}
          className="flex items-center space-x-1.5 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-medium rounded-lg transition-all"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>退出登录并清理凭证</span>
        </button>
      </div>
      {/* 手动配置 Cookie 模态框 */}
      {cookieModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-md shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <KeyRound className="w-4 h-4 text-teal-600" />
                <h4 className="font-bold text-sm text-slate-800">配置 Web 会话 Cookie</h4>
              </div>
              <button onClick={() => setCookieModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCookie} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  浏览器 Cookie 字符串 (包含 JSESSIONID 等)
                </label>
                <textarea
                  rows={4}
                  value={manualCookieInput}
                  onChange={(e) => setManualCookieInput(e.target.value)}
                  placeholder="可从 Chrome 开发者工具 Application > Cookies 或 Network 请求头中直接复制粘入：JSESSIONID=xxxx; rkhd=xxxx..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 font-mono text-[11px] focus:outline-none focus:border-teal-500 leading-relaxed"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCookieModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold cursor-pointer"
                >
                  保存 Cookie
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
