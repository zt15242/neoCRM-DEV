import React, { useState, useEffect } from 'react';
import { X, Sparkles, Wand2, Shield, AlertCircle, CheckCircle, Activity } from 'lucide-react';
import { NeoEnvironment, TestConnectionResult } from '../../shared/types';
import { DEFAULT_AUTH_CONFIG } from '../../shared/constants';

interface CustomEnvModalProps {
  isOpen: boolean;
  initialEnv?: NeoEnvironment | null;
  onClose: () => void;
  onSave: (env: Partial<NeoEnvironment> & { name: string; neoBaseURL: string }) => void;
}

export const CustomEnvModal: React.FC<CustomEnvModalProps> = ({
  isOpen,
  initialEnv,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [neoBaseURL, setNeoBaseURL] = useState('');
  const [loginURL, setLoginURL] = useState('');
  const [tokenURL, setTokenURL] = useState('');
  const [description, setDescription] = useState('');
  const [clientId, setClientId] = useState(DEFAULT_AUTH_CONFIG.clientId);
  const [clientSecret, setClientSecret] = useState(DEFAULT_AUTH_CONFIG.clientSecret);
  const [redirectUri, setRedirectUri] = useState(DEFAULT_AUTH_CONFIG.redirectUri);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (initialEnv) {
      setName(initialEnv.name || '');
      setNeoBaseURL(initialEnv.neoBaseURL || '');
      setLoginURL(initialEnv.loginURL || '');
      setTokenURL(initialEnv.tokenURL || '');
      setDescription(initialEnv.description || '');
      setClientId(initialEnv.clientId || DEFAULT_AUTH_CONFIG.clientId);
      setClientSecret(initialEnv.clientSecret || DEFAULT_AUTH_CONFIG.clientSecret);
      setRedirectUri(initialEnv.redirectUri || DEFAULT_AUTH_CONFIG.redirectUri);
    } else {
      setName('');
      setNeoBaseURL('https://');
      setLoginURL('');
      setTokenURL('');
      setDescription('');
      setClientId(DEFAULT_AUTH_CONFIG.clientId);
      setClientSecret(DEFAULT_AUTH_CONFIG.clientSecret);
      setRedirectUri(DEFAULT_AUTH_CONFIG.redirectUri);
    }
    setTestResult(null);
  }, [initialEnv, isOpen]);

  if (!isOpen) return null;

  // 根据 Base URL 智能推导 Login URL 和 Token URL
  const handleAutoDerive = (baseUrlInput?: string) => {
    const raw = (baseUrlInput !== undefined ? baseUrlInput : neoBaseURL).trim();
    if (!raw) return;

    try {
      const u = new URL(raw);
      const hostParts = u.hostname.split('.');
      let loginHost = u.hostname;
      if (hostParts[0].startsWith('crm')) {
        hostParts[0] = hostParts[0].replace('crm', 'login');
        loginHost = hostParts.join('.');
      }
      setLoginURL(`${u.protocol}//${loginHost}/auc/oauth2/auth`);
      setTokenURL(`${u.protocol}//${loginHost}/auc/oauth2/token`);
    } catch {
      setLoginURL(`${raw}/auc/oauth2/auth`);
      setTokenURL(`${raw}/auc/oauth2/token`);
    }
  };

  const handleTestConnect = async () => {
    if (!neoBaseURL || neoBaseURL === 'https://') return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await window.neoApi.testConnectivity(neoBaseURL);
      setTestResult(res);
    } catch (e: any) {
      setTestResult({ success: false, message: e.message || '网络连接失败' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !neoBaseURL.trim()) return;

    onSave({
      id: initialEnv?.id,
      name: name.trim(),
      neoBaseURL: neoBaseURL.trim(),
      loginURL: loginURL.trim(),
      tokenURL: tokenURL.trim(),
      description: description.trim(),
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      redirectUri: redirectUri.trim(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col max-h-[90vh]">
        {/* 头部 */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-sky-400" />
            <h3 className="text-base font-semibold text-slate-900">
              {initialEnv ? '编辑自定义环境' : '新增自定义环境'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 表单内容 */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              环境名称 <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如: 客户私有化专有云环境 / 演练环境"
              className="w-full px-3 py-2 bg-slate-100 border border-slate-700 rounded-lg text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-700">
                NeoCRM 实例地址 (Base URL) <span className="text-rose-400">*</span>
              </label>
              <button
                type="button"
                onClick={() => handleAutoDerive()}
                className="flex items-center space-x-1 text-[11px] text-sky-400 hover:text-sky-300 transition-colors"
              >
                <Wand2 className="w-3 h-3" />
                <span>智能推导 Auth/Token URL</span>
              </button>
            </div>
            <div className="flex space-x-2">
              <input
                type="text"
                required
                value={neoBaseURL}
                onChange={(e) => {
                  setNeoBaseURL(e.target.value);
                  if (!loginURL && !tokenURL) {
                    handleAutoDerive(e.target.value);
                  }
                }}
                placeholder="https://crm-custom.example.com"
                className="flex-1 px-3 py-2 bg-slate-100 border border-slate-700 rounded-lg text-sm text-slate-900 font-mono placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
              />
              <button
                type="button"
                onClick={handleTestConnect}
                disabled={isTesting}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs text-slate-700 flex items-center space-x-1.5 transition-colors disabled:opacity-50"
              >
                <Activity className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-sky-400' : ''}`} />
                <span>{isTesting ? '检测中' : '测速'}</span>
              </button>
            </div>
            {testResult && (
              <div
                className={`mt-2 p-2 rounded-lg text-xs flex items-center space-x-2 ${
                  testResult.success
                    ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/40'
                    : 'bg-rose-950/40 text-rose-300 border border-rose-800/40'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                认证授权地址 (Login URL)
              </label>
              <input
                type="text"
                value={loginURL}
                onChange={(e) => setLoginURL(e.target.value)}
                placeholder="https://.../auc/oauth2/auth"
                className="w-full px-3 py-2 bg-slate-100 border border-slate-700 rounded-lg text-xs text-slate-900 font-mono placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Token 换取地址 (Token URL)
              </label>
              <input
                type="text"
                value={tokenURL}
                onChange={(e) => setTokenURL(e.target.value)}
                placeholder="https://.../auc/oauth2/token"
                className="w-full px-3 py-2 bg-slate-100 border border-slate-700 rounded-lg text-xs text-slate-900 font-mono placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              环境备注说明 (可选)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例如: 客户专用测试环境，周五前需完成发布"
              className="w-full px-3 py-2 bg-slate-100 border border-slate-700 rounded-lg text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* 高级配置切换 */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-slate-500 hover:text-slate-200 flex items-center space-x-1.5 transition-colors"
            >
              <Shield className="w-3.5 h-3.5 text-sky-400" />
              <span>{showAdvanced ? '收起高级 OAuth2 凭据配置' : '展开高级 OAuth2 凭据配置 (客户端ID/密钥)'}</span>
            </button>
          </div>

          {showAdvanced && (
            <div className="p-3 bg-slate-50/60 rounded-xl border border-slate-200 space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  OAuth2 Client ID
                </label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-200 rounded text-xs font-mono text-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  OAuth2 Client Secret
                </label>
                <input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-200 rounded text-xs font-mono text-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  本地重定向回调地址 (Redirect URI)
                </label>
                <input
                  type="text"
                  value={redirectUri}
                  onChange={(e) => setRedirectUri(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-200 rounded text-xs font-mono text-slate-200"
                />
              </div>
            </div>
          )}

          {/* 底部按钮 */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-700 text-slate-700 text-xs font-medium rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium rounded-lg shadow-lg shadow-sky-600/30 transition-all"
            >
              保存环境
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
