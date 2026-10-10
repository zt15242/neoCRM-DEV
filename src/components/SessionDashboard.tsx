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
  Radio
} from 'lucide-react';
import { SessionState } from '../../shared/types';

interface SessionDashboardProps {
  session: SessionState;
  onRefresh: () => void;
  onLogout: () => void;
  onOpenDesigner: (type: 'web' | 'h5') => void;
  onTestApi: () => Promise<{ success: boolean; data?: any; error?: string }>;
}

export const SessionDashboard: React.FC<SessionDashboardProps> = ({
  session,
  onRefresh,
  onLogout,
  onOpenDesigner,
  onTestApi,
}) => {
  const { environment, tokenData } = session;
  const [copiedToken, setCopiedToken] = useState(false);
  const [timeLeftStr, setTimeLeftStr] = useState<string>('');
  const [isExpiringSoon, setIsExpiringSoon] = useState(false);
  const [apiTestResult, setApiTestResult] = useState<{ success: boolean; msg: string } | null>(null);
  const [isTestingApi, setIsTestingApi] = useState(false);

  // 计算 Token 剩余倒计时
  useEffect(() => {
    if (!tokenData?.expiresAt) return;

    const updateCountdown = () => {
      const now = Date.now();
      const diff = tokenData.expiresAt - now;

      if (diff <= 0) {
        setTimeLeftStr('已过期，请刷新令牌');
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
            </div>
            <button
              onClick={onRefresh}
              className="text-[11px] text-sky-600 hover:text-sky-700 font-medium flex items-center space-x-1 transition-colors"
              title="立即刷新凭据"
            >
              <RefreshCw className="w-3 h-3" />
              <span>手动续期</span>
            </button>
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
    </div>
  );
};
