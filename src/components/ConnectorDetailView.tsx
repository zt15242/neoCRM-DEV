import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Server, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  Cloud, 
  Layers, 
  Flame, 
  Plug, 
  Copy, 
  Check, 
  ExternalLink,
  ShieldCheck,
  Radio,
  Clock,
  KeyRound,
  Compass,
  AppWindow,
  Activity
} from 'lucide-react';
import { NeoEnvironment, SessionState, CrmProductType, AccountRecord } from '../../shared/types';
import { SessionDashboard } from './SessionDashboard';
import { LoginCard } from './LoginCard';

interface ConnectorDetailViewProps {
  environment: NeoEnvironment;
  session: SessionState;
  accountHistory?: AccountRecord[];
  onBack: () => void;
  onEdit: (env: NeoEnvironment) => void;
  onDelete: (envId: string) => void;
  onSwitchConnector?: (envId: string) => void;
  // LoginCard 回调
  isLoggingIn: boolean;
  loginStatusText: string;
  onLoginBrowser: () => void;
  onLoginEmbedded: () => void;
  onLoginPassword: (username: string, pass: string) => void;
  onCancelLogin: () => void;
  // SessionDashboard 回调
  onRefresh: () => void | Promise<void>;
  onLogout: () => void;
  onOpenDesigner: (type: 'web' | 'h5') => void;
  onTestApi: () => Promise<{ success: boolean; data?: any; error?: string }>;
  onRefreshSession?: () => void;
  showToast?: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const ConnectorDetailView: React.FC<ConnectorDetailViewProps> = ({
  environment,
  session,
  accountHistory = [],
  onBack,
  onEdit,
  onDelete,
  isLoggingIn,
  loginStatusText,
  onLoginBrowser,
  onLoginEmbedded,
  onLoginPassword,
  onCancelLogin,
  onRefresh,
  onLogout,
  onOpenDesigner,
  onTestApi,
  onRefreshSession,
  showToast,
}) => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [isPinging, setIsPinging] = useState(false);
  const [pingResult, setPingResult] = useState<{ success: boolean; timeMs?: number; msg?: string } | null>(null);

  // 判断当前全局会话是否连接了此环境
  const isCurrentlyActive = session.isLoggedIn && session.environment?.id === environment.id;

  // 获取产品类型图标与配色
  const getProductMeta = (productType?: CrmProductType) => {
    switch (productType) {
      case 'salesforce':
        return {
          label: 'Salesforce',
          icon: Cloud,
          badgeColor: 'bg-cyan-50 text-cyan-700 border-cyan-200',
          iconColor: 'bg-cyan-600 text-white',
          brandColor: 'text-cyan-600',
          subLabel: environment.neoBaseURL.includes('sfcrmproducts.cn') ? '阿里中国版' : '全球版',
        };
      case 'fxiaoke':
        return {
          label: '纷享销客',
          icon: Flame,
          badgeColor: 'bg-orange-50 text-orange-700 border-orange-200',
          iconColor: 'bg-orange-600 text-white',
          brandColor: 'text-orange-600',
          subLabel: environment.cloudDomain || 'open.fxiaoke.com',
        };
      case 'custom':
        return {
          label: '自定义 CRM',
          icon: Plug,
          badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
          iconColor: 'bg-purple-600 text-white',
          brandColor: 'text-purple-600',
          subLabel: 'REST 接口',
        };
      case 'neocrm':
      default:
        return {
          label: '销售易 NeoCRM',
          icon: Layers,
          badgeColor: 'bg-sky-50 text-sky-700 border-sky-200',
          iconColor: 'bg-sky-600 text-white',
          brandColor: 'text-sky-600',
          subLabel: 'PaaS 架构',
        };
    }
  };

  const pMeta = getProductMeta(environment.productType);
  const BrandIcon = pMeta.icon;

  const handleCopy = (text: string, type: 'url' | 'id') => {
    navigator.clipboard.writeText(text);
    if (type === 'url') {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handlePing = async () => {
    setIsPinging(true);
    setPingResult(null);
    try {
      const res = await window.neoApi.testConnectivity(environment.neoBaseURL);
      setPingResult({ success: res.success, timeMs: res.responseTimeMs, msg: res.message });
      if (res.success) {
        showToast?.('success', `网络链路正常，响应耗时: ${res.responseTimeMs}ms`);
      } else {
        showToast?.('error', `网络探测异常: ${res.message}`);
      }
    } catch (e: any) {
      setPingResult({ success: false, msg: e.message || '网络探测异常' });
      showToast?.('error', `探测失败: ${e.message}`);
    } finally {
      setIsPinging(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* 1. 顶部面包屑与快捷返回操作 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
        <div className="flex items-center space-x-2">
          <button
            onClick={onBack}
            className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors flex items-center space-x-1 cursor-pointer text-xs font-semibold shadow-2xs"
            title="返回连接器中心"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>返回连接器列表</span>
          </button>
          <span className="text-slate-300">/</span>
          <div className="flex items-center space-x-2 min-w-0">
            <h2 className="text-sm md:text-base font-bold text-slate-900 truncate">
              {environment.name}
            </h2>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium border ${pMeta.badgeColor}`}>
              {pMeta.label} · {pMeta.subLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => onEdit(environment)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            <Edit3 className="w-3.5 h-3.5 text-slate-500" />
            <span>编辑配置</span>
          </button>
          <button
            onClick={() => onDelete(environment.id)}
            className="px-3 py-1.5 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>删除</span>
          </button>
        </div>
      </div>

      {/* 2. 连接器核心身份卡片 */}
      <div className="p-4 md:p-5 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-800 rounded-2xl text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start space-x-4 min-w-0">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-md ${pMeta.iconColor}`}>
            <BrandIcon className="w-6 h-6" />
          </div>
          <div className="space-y-1 min-w-0">
            <div className="flex items-center space-x-2.5 flex-wrap">
              <h1 className="text-base md:text-lg font-bold tracking-tight text-white truncate">
                {environment.name}
              </h1>
              {isCurrentlyActive ? (
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 font-medium flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>当前已连接并生效中</span>
                </span>
              ) : (
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-700/60 text-slate-300 border border-slate-600 font-medium">
                  未连接
                </span>
              )}
            </div>
            <p className="text-xs text-slate-300 font-mono truncate">
              {environment.neoBaseURL}
            </p>
            {environment.description && (
              <p className="text-xs text-slate-400 leading-relaxed pt-0.5">
                {environment.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0 self-start md:self-auto">
          <button
            onClick={handlePing}
            disabled={isPinging}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-xl border border-slate-700 transition-colors flex items-center space-x-1.5 cursor-pointer"
            title="测试此连接器的网络延迟"
          >
            <Activity className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin text-sky-400' : 'text-slate-400'}`} />
            <span>{isPinging ? '探测中...' : pingResult?.timeMs ? `${pingResult.timeMs}ms` : '网络通信测速'}</span>
          </button>
        </div>
      </div>

      {/* 3. 核心会话与认证详情面板 (把原主界面底部的这部分完整收敛并放入详情页) */}
      <div className="space-y-4">
        {isCurrentlyActive && session.tokenData ? (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-800">当前活跃认证会话与运行时凭证</h3>
              </div>
              <span className="text-xs text-slate-400">已连通至本连接器</span>
            </div>

            <SessionDashboard
              session={session}
              onRefresh={onRefresh}
              onReLogin={onLoginEmbedded || onLoginBrowser}
              onLogout={onLogout}
              onOpenDesigner={onOpenDesigner}
              onTestApi={onTestApi}
              onRefreshSession={onRefreshSession}
              showToast={showToast}
            />
          </div>
        ) : (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <KeyRound className="w-4 h-4 text-sky-600" />
                <h3 className="text-sm font-bold text-slate-800">连接与身份认证授权</h3>
              </div>
              <span className="text-xs text-slate-500">发起认证并连接到此 CRM 实例</span>
            </div>

            <LoginCard
              environment={environment}
              isLoggingIn={isLoggingIn}
              loginStatusText={loginStatusText}
              onLoginBrowser={onLoginBrowser}
              onLoginEmbedded={onLoginEmbedded}
              onLoginPassword={onLoginPassword}
              onCancelLogin={onCancelLogin}
              onOpenConfigure={() => onEdit(environment)}
            />
          </div>
        )}
      </div>

      {/* 4. 连接器技术参数与端点配置清单 */}
      <div className="p-4 md:p-5 bg-white border border-slate-200/90 rounded-2xl space-y-3.5 shadow-2xs">
        <h3 className="text-xs font-bold text-slate-800 flex items-center space-x-2">
          <Server className="w-4 h-4 text-slate-500" />
          <span>连接器端点与授权参数配置</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
            <span className="text-slate-400 font-sans block text-[11px]">连接器内部标识 ID:</span>
            <div className="flex items-center justify-between text-slate-800 font-semibold">
              <span className="truncate">{environment.id}</span>
              <button
                onClick={() => handleCopy(environment.id, 'id')}
                className="p-1 hover:bg-white rounded text-slate-400 hover:text-slate-700 cursor-pointer"
                title="复制 ID"
              >
                {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
            <span className="text-slate-400 font-sans block text-[11px]">实例服务地址 (Base URL):</span>
            <div className="flex items-center justify-between text-slate-800 font-semibold">
              <span className="truncate">{environment.neoBaseURL}</span>
              <button
                onClick={() => handleCopy(environment.neoBaseURL, 'url')}
                className="p-1 hover:bg-white rounded text-slate-400 hover:text-slate-700 cursor-pointer"
                title="复制 URL"
              >
                {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
            <span className="text-slate-400 font-sans block text-[11px]">认证模式 (Auth Mode):</span>
            <span className="text-slate-800 font-semibold font-sans">
              {environment.authMode === 'client_credentials' ? '客户端凭证直连 (Client Credentials)' : '标准授权码模式 (Authorization Code)'}
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
            <span className="text-slate-400 font-sans block text-[11px]">回调地址 (Redirect URI):</span>
            <span className="text-slate-800 font-semibold truncate block">
              {environment.redirectUri || 'http://localhost:1028'}
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
            <span className="text-slate-400 font-sans block text-[11px]">应用标识 (Client ID / AppId):</span>
            <span className="text-slate-800 font-semibold truncate block">
              {environment.clientId || <span className="text-amber-600 font-sans">未配置</span>}
            </span>
          </div>

          {environment.tokenURL && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1 md:col-span-2">
              <span className="text-slate-400 font-sans block text-[11px]">令牌获取端点 (Token URL):</span>
              <span className="text-slate-700 truncate block">{environment.tokenURL}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
