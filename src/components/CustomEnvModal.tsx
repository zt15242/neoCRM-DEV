import React, { useState, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  Wand2, 
  Shield, 
  AlertCircle, 
  CheckCircle, 
  Activity,
  Cloud,
  Layers,
  Flame,
  Plug,
  Server
} from 'lucide-react';
import { NeoEnvironment, TestConnectionResult, CrmProductType, CrmEnvType } from '../../shared/types';
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
  const [productType, setProductType] = useState<CrmProductType>('neocrm');
  const [envType, setEnvType] = useState<CrmEnvType>('sandbox');
  const [name, setName] = useState('');
  const [neoBaseURL, setNeoBaseURL] = useState('');
  const [loginURL, setLoginURL] = useState('');
  const [tokenURL, setTokenURL] = useState('');
  const [description, setDescription] = useState('');
  const [clientId, setClientId] = useState(DEFAULT_AUTH_CONFIG.clientId);
  const [clientSecret, setClientSecret] = useState(DEFAULT_AUTH_CONFIG.clientSecret);
  const [redirectUri, setRedirectUri] = useState(DEFAULT_AUTH_CONFIG.redirectUri);
  const [scope, setScope] = useState('all');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (initialEnv) {
      setProductType(initialEnv.productType || 'neocrm');
      setEnvType(initialEnv.envType || 'sandbox');
      setName(initialEnv.name || '');
      setNeoBaseURL(initialEnv.neoBaseURL || '');
      setLoginURL(initialEnv.loginURL || '');
      setTokenURL(initialEnv.tokenURL || '');
      setDescription(initialEnv.description || '');
      setClientId(initialEnv.clientId || DEFAULT_AUTH_CONFIG.clientId);
      setClientSecret(initialEnv.clientSecret || DEFAULT_AUTH_CONFIG.clientSecret);
      setRedirectUri(initialEnv.redirectUri || DEFAULT_AUTH_CONFIG.redirectUri);
      setScope(initialEnv.scope || 'all');
    } else {
      setProductType('neocrm');
      setEnvType('sandbox');
      setName('');
      setNeoBaseURL('https://crm-sandbox.xiaoshouyi.com');
      setLoginURL('https://login-sandbox.xiaoshouyi.com/auc/oauth2/auth');
      setTokenURL('https://login-sandbox.xiaoshouyi.com/auc/oauth2/token');
      setDescription('');
      setClientId(DEFAULT_AUTH_CONFIG.clientId);
      setClientSecret(DEFAULT_AUTH_CONFIG.clientSecret);
      setRedirectUri(DEFAULT_AUTH_CONFIG.redirectUri);
      setScope('all');
    }
    setTestResult(null);
  }, [initialEnv, isOpen]);

  if (!isOpen) return null;

  // 切换 CRM 产品类型时的智能模板预填
  const handleProductTypeChange = (pType: CrmProductType) => {
    setProductType(pType);
    if (!initialEnv) {
      if (pType === 'salesforce') {
        setName('Salesforce - 沙盒测试环境');
        setEnvType('sandbox');
        setNeoBaseURL('https://test.salesforce.com');
        setLoginURL('https://test.salesforce.com/services/oauth2/authorize');
        setTokenURL('https://test.salesforce.com/services/oauth2/token');
        setScope('full refresh_token api');
        setDescription('Salesforce 沙盒测试组织连接器');
      } else if (pType === 'fxiaoke') {
        setName('纷享销客 - 开放平台连接器');
        setEnvType('production');
        setNeoBaseURL('https://open.fxiaoke.com');
        setLoginURL('https://open.fxiaoke.com/oauth2/authorize');
        setTokenURL('https://open.fxiaoke.com/cgi/corpAccessToken/get/V2');
        setScope('all');
        setDescription('纷享销客开放平台自建应用连接器');
      } else if (pType === 'neocrm') {
        setName('销售易 - 专属沙盒环境');
        setEnvType('sandbox');
        setNeoBaseURL('https://crm-sandbox.xiaoshouyi.com');
        setLoginURL('https://login-sandbox.xiaoshouyi.com/auc/oauth2/auth');
        setTokenURL('https://login-sandbox.xiaoshouyi.com/auc/oauth2/token');
        setScope('all');
        setDescription('销售易业务沙盒演练连接器');
      } else {
        setName('自定义 CRM 连接器');
        setEnvType('custom');
        setNeoBaseURL('https://api.yourcrm.com');
        setLoginURL('');
        setTokenURL('');
        setScope('api');
        setDescription('自定义 CRM 系统 REST 接口连接器');
      }
    }
  };

  // 根据 Base URL 智能推导 Login URL 和 Token URL
  const handleAutoDerive = (baseUrlInput?: string) => {
    const raw = (baseUrlInput !== undefined ? baseUrlInput : neoBaseURL).trim();
    if (!raw) return;

    if (productType === 'salesforce') {
      try {
        const u = new URL(raw);
        setLoginURL(`${u.protocol}//${u.host}/services/oauth2/authorize`);
        setTokenURL(`${u.protocol}//${u.host}/services/oauth2/token`);
      } catch {
        setLoginURL(`${raw}/services/oauth2/authorize`);
        setTokenURL(`${raw}/services/oauth2/token`);
      }
      return;
    }

    if (productType === 'fxiaoke') {
      setLoginURL('https://open.fxiaoke.com/oauth2/authorize');
      setTokenURL('https://open.fxiaoke.com/cgi/corpAccessToken/get/V2');
      return;
    }

    // 销售易推导
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
      productType,
      envType,
      neoBaseURL: neoBaseURL.trim(),
      loginURL: loginURL.trim(),
      tokenURL: tokenURL.trim(),
      description: description.trim(),
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      redirectUri: redirectUri.trim(),
      scope: scope.trim(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs select-none animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* 头部 */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow-xs">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                {initialEnv ? '编辑 CRM 环境连接器' : '新建 CRM 环境连接器 (New Connector)'}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                支持连接销售易、Salesforce、纷享销客等多品牌 CRM 实例与演练沙盒
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 表单内容 */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* 1. 选择 CRM 产品类型 */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              CRM 产品类别 *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => handleProductTypeChange('neocrm')}
                className={`p-2.5 rounded-xl border text-left flex flex-col space-y-1 transition-all cursor-pointer ${
                  productType === 'neocrm'
                    ? 'bg-sky-50 border-sky-400 text-sky-900 shadow-2xs font-bold ring-1 ring-sky-400'
                    : 'hover:bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                <div className="flex items-center space-x-1.5">
                  <Layers className="w-4 h-4 text-sky-600" />
                  <span>销售易</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono font-normal">NeoCRM PaaS</span>
              </button>

              <button
                type="button"
                onClick={() => handleProductTypeChange('salesforce')}
                className={`p-2.5 rounded-xl border text-left flex flex-col space-y-1 transition-all cursor-pointer ${
                  productType === 'salesforce'
                    ? 'bg-cyan-50 border-cyan-400 text-cyan-900 shadow-2xs font-bold ring-1 ring-cyan-400'
                    : 'hover:bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                <div className="flex items-center space-x-1.5">
                  <Cloud className="w-4 h-4 text-cyan-600" />
                  <span>Salesforce</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono font-normal">Force.com</span>
              </button>

              <button
                type="button"
                onClick={() => handleProductTypeChange('fxiaoke')}
                className={`p-2.5 rounded-xl border text-left flex flex-col space-y-1 transition-all cursor-pointer ${
                  productType === 'fxiaoke'
                    ? 'bg-orange-50 border-orange-400 text-orange-900 shadow-2xs font-bold ring-1 ring-orange-400'
                    : 'hover:bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                <div className="flex items-center space-x-1.5">
                  <Flame className="w-4 h-4 text-orange-600" />
                  <span>纷享销客</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono font-normal">FXIAOKE API</span>
              </button>

              <button
                type="button"
                onClick={() => handleProductTypeChange('custom')}
                className={`p-2.5 rounded-xl border text-left flex flex-col space-y-1 transition-all cursor-pointer ${
                  productType === 'custom'
                    ? 'bg-purple-50 border-purple-400 text-purple-900 shadow-2xs font-bold ring-1 ring-purple-400'
                    : 'hover:bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                <div className="flex items-center space-x-1.5">
                  <Plug className="w-4 h-4 text-purple-600" />
                  <span>自定义 CRM</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono font-normal">RESTful API</span>
              </button>
            </div>
          </div>

          {/* 2. 连接器名称与环境类型 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">
                连接器名称 *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如: 销售易-PAV沙盒演练、Salesforce-生产"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">
                环境类型
              </label>
              <select
                value={envType}
                onChange={(e) => setEnvType(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-sky-500 focus:bg-white cursor-pointer"
              >
                <option value="production">生产正式环境 (Production)</option>
                <option value="sandbox">专属演练沙盒 (Sandbox)</option>
                <option value="test">开发联调测试 (UAT / CD)</option>
                <option value="custom">定制私有集群 (Custom)</option>
              </select>
            </div>
          </div>

          {/* 3. 实例服务地址 (Base URL) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">
                实例服务地址 (Base URL) *
              </label>
              <button
                type="button"
                onClick={() => handleAutoDerive()}
                className="text-[11px] text-sky-600 hover:text-sky-700 flex items-center space-x-1 cursor-pointer font-medium"
              >
                <Wand2 className="w-3 h-3" />
                <span>自动推导登录端点</span>
              </button>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="url"
                required
                value={neoBaseURL}
                onChange={(e) => {
                  setNeoBaseURL(e.target.value);
                  handleAutoDerive(e.target.value);
                }}
                placeholder="https://crm-sandbox.xiaoshouyi.com"
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white"
              />
              <button
                type="button"
                onClick={handleTestConnect}
                disabled={isTesting}
                className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-xl flex items-center space-x-1 shrink-0 cursor-pointer shadow-2xs"
              >
                <Activity className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-sky-600' : 'text-slate-500'}`} />
                <span>{isTesting ? '探测中...' : '测试连通'}</span>
              </button>
            </div>

            {testResult && (
              <div
                className={`p-2.5 rounded-xl border text-xs flex items-center space-x-2 mt-1.5 ${
                  testResult.success
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>

          {/* 4. 授权登录与 Token 换取地址 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">
                OAuth2 授权登录地址
              </label>
              <input
                type="url"
                value={loginURL}
                onChange={(e) => setLoginURL(e.target.value)}
                placeholder="https://.../auc/oauth2/auth"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">
                Token 换取地址
              </label>
              <input
                type="url"
                value={tokenURL}
                onChange={(e) => setTokenURL(e.target.value)}
                placeholder="https://.../auc/oauth2/token"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white"
              />
            </div>
          </div>

          {/* 5. 备注 */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-slate-700">
              连接器描述说明 (可选)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例如: 客户专用演练沙盒、生产备份组织"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:bg-white"
            />
          </div>

          {/* 6. 高级 OAuth2 凭据配置 */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-slate-500 hover:text-slate-800 flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5 text-sky-600" />
              <span>{showAdvanced ? '收起高级 OAuth2 凭据配置' : '展开高级 OAuth2 凭据配置 (Client ID / Secret / Redirect URI)'}</span>
            </button>
          </div>

          {showAdvanced && (
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 animate-in fade-in">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-600">
                  Client ID (应用标识)
                </label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-600">
                  Client Secret (应用密钥)
                </label>
                <input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-slate-600">
                    回调地址 (Redirect URI)
                  </label>
                  <input
                    type="text"
                    value={redirectUri}
                    onChange={(e) => setRedirectUri(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-slate-600">
                    权限范围 (Scope)
                  </label>
                  <input
                    type="text"
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 底部按钮 */}
          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold rounded-xl cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl shadow-xs cursor-pointer"
            >
              {initialEnv ? '保存修改' : '确认创建连接器'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
