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
  // 纷享销客专属状态
  const [authMode, setAuthMode] = useState<'client_credentials' | 'authorization_code'>('client_credentials');
  const [permanentCode, setPermanentCode] = useState('');
  const [cloudDomain, setCloudDomain] = useState('open.fxiaoke.com');
  const [sfRegion, setSfRegion] = useState<'alicloud' | 'global' | 'custom'>('alicloud');
  const [ea, setEa] = useState('');
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
      setAuthMode(initialEnv.authMode || 'client_credentials');
      setPermanentCode(initialEnv.permanentCode || '');
      setCloudDomain(initialEnv.cloudDomain || 'open.fxiaoke.com');
      setEa(initialEnv.ea || '');
      if (initialEnv.productType === 'salesforce') {
        const u = initialEnv.neoBaseURL || '';
        if (u.includes('sfcrmproducts.cn')) {
          setSfRegion('alicloud');
        } else if (u.includes('login.salesforce.com') || u.includes('test.salesforce.com')) {
          setSfRegion('global');
        } else {
          setSfRegion('custom');
        }
      }
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
      setAuthMode('client_credentials');
      setPermanentCode('');
      setCloudDomain('open.fxiaoke.com');
      setEa('');
    }
    setTestResult(null);
  }, [initialEnv, isOpen]);

  if (!isOpen) return null;

  // 切换 CRM 产品类型时的智能模板预填
  const handleProductTypeChange = (pType: CrmProductType) => {
    setProductType(pType);
    if (!initialEnv) {
      if (pType === 'salesforce') {
        setName('Salesforce 阿里中国 - 沙盒测试环境');
        setEnvType('sandbox');
        setSfRegion('alicloud');
        setNeoBaseURL('https://test.sfcrmproducts.cn');
        setLoginURL('https://test.sfcrmproducts.cn/services/oauth2/authorize');
        setTokenURL('https://test.sfcrmproducts.cn/services/oauth2/token');
        setAuthMode('client_credentials');
        setScope('');
        setDescription('Salesforce on Alibaba Cloud 阿里云中国版沙盒测试组织');
      } else if (pType === 'fxiaoke') {
        setName('纷享销客 - 开放平台连接器');
        setEnvType('production');
        setCloudDomain('open.fxiaoke.com');
        setNeoBaseURL('https://open.fxiaoke.com');
        setLoginURL('https://open.fxiaoke.com/oauth2.0/authorize');
        setTokenURL('https://open.fxiaoke.com/oauth2.0/token');
        setAuthMode('client_credentials');
        setScope('all');
        setDescription('纷享销客 OpenAPI v2 自建应用连接器 (客户端凭据模式)');
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

  // Salesforce 区域与部署形态切换 (阿里中国版 vs 全球版)
  const handleSfRegionChange = (region: 'alicloud' | 'global' | 'custom', targetEnvType = envType) => {
    setSfRegion(region);
    const isProd = targetEnvType === 'production';
    if (region === 'alicloud') {
      const host = isProd ? 'login.sfcrmproducts.cn' : 'test.sfcrmproducts.cn';
      setNeoBaseURL(`https://${host}`);
      setLoginURL(`https://${host}/services/oauth2/authorize`);
      setTokenURL(`https://${host}/services/oauth2/token`);
    } else if (region === 'global') {
      const host = isProd ? 'login.salesforce.com' : 'test.salesforce.com';
      setNeoBaseURL(`https://${host}`);
      setLoginURL(`https://${host}/services/oauth2/authorize`);
      setTokenURL(`https://${host}/services/oauth2/token`);
    }
  };

  // 纷享销客云环境切换
  const handleCloudDomainChange = (domain: string) => {
    setCloudDomain(domain);
    const base = `https://${domain}`;
    setNeoBaseURL(base);
    setLoginURL(`${base}/oauth2.0/authorize`);
    setTokenURL(`${base}/oauth2.0/token`);
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
      const domain = cloudDomain || 'open.fxiaoke.com';
      setLoginURL(`https://${domain}/oauth2.0/authorize`);
      setTokenURL(`https://${domain}/oauth2.0/token`);
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
      authMode,
      permanentCode: permanentCode.trim(),
      cloudDomain: cloudDomain.trim(),
      ea: ea.trim(),
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
                {initialEnv?.isPreset 
                  ? `配置预置连接器凭据: ${initialEnv.name}` 
                  : (initialEnv ? '编辑 CRM 环境连接器' : '新建 CRM 环境连接器 (New Connector)')}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {productType === 'fxiaoke'
                  ? '配置纷享销客自建应用 appId、appSecret 与企业永久授权码 (permanentCode)'
                  : '支持连接销售易、Salesforce、纷享销客等多品牌 CRM 实例与演练沙盒'}
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

          {/* Salesforce 专属配置面板 (支持阿里中国版与全球版) */}
          {productType === 'salesforce' && (
            <div className="p-3.5 bg-cyan-50/60 rounded-2xl border border-cyan-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-cyan-950 flex items-center space-x-1.5 text-xs">
                  <Cloud className="w-4 h-4 text-cyan-600" />
                  <span>Salesforce 地域部署与授权规范</span>
                </span>
                <span className="text-[11px] text-cyan-700 font-medium">
                  全面支持阿里中国版 & 全球版
                </span>
              </div>

              {/* 地域部署版本选择 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-cyan-900">
                    地域部署形态 (Cloud Region) *
                  </label>
                  <select
                    value={sfRegion}
                    onChange={(e) => handleSfRegionChange(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 bg-white border border-cyan-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    <option value="alicloud">🇨🇳 阿里中国版 (*.sfcrmproducts.cn)</option>
                    <option value="global">🌐 全球版 / 国际版 (*.salesforce.com)</option>
                    <option value="custom">🏢 专属“我的域” (My Domain / 自定义)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-cyan-900">
                    授权认证模式 *
                  </label>
                  <select
                    value={authMode}
                    onChange={(e) => setAuthMode(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 bg-white border border-cyan-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    <option value="client_credentials">客户端凭证模式 (Connected App 直连 · 推荐)</option>
                    <option value="authorization_code">授权码模式 (Web 浏览器 / 内嵌窗口登录)</option>
                  </select>
                </div>
              </div>

              {/* Client ID & Secret */}
              <div className="space-y-2 pt-1 border-t border-cyan-200/60">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-cyan-900">
                      Client ID (Consumer Key) *
                    </label>
                    <input
                      type="text"
                      required
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      placeholder="Connected App Consumer Key"
                      className="w-full px-2.5 py-1.5 bg-white border border-cyan-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-cyan-900">
                      Client Secret (Consumer Secret) *
                    </label>
                    <input
                      type="password"
                      required
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      placeholder="Consumer Secret"
                      className="w-full px-2.5 py-1.5 bg-white border border-cyan-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              </div>

              {/* 回调地址配置 (授权码模式必须匹配 Connected App) */}
              {authMode === 'authorization_code' && (
                <div className="space-y-2 pt-1 border-t border-cyan-200/60">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-semibold text-cyan-900">
                      回调地址 (Redirect URI / Callback URL) *
                    </label>
                    <span className="text-[10px] text-cyan-700 font-sans">
                      需与 Salesforce Connected App 严格一致
                    </span>
                  </div>
                  <input
                    type="text"
                    required
                    value={redirectUri}
                    onChange={(e) => setRedirectUri(e.target.value)}
                    placeholder="如 http://localhost:1028"
                    className="w-full px-2.5 py-1.5 bg-white border border-cyan-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-cyan-500"
                  />
                  {/* 常用预选地址 */}
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {[
                      'http://localhost:1028',
                      'http://localhost:1028/',
                      'http://localhost:1717/OauthRedirect',
                      'https://test.salesforce.com/services/oauth2/success',
                      'https://login.salesforce.com/services/oauth2/success',
                    ].map((uri) => (
                      <button
                        key={uri}
                        type="button"
                        onClick={() => setRedirectUri(uri)}
                        className={`text-[10px] px-2 py-0.5 rounded-lg border font-mono transition-colors cursor-pointer ${
                          redirectUri === uri
                            ? 'bg-cyan-600 text-white border-cyan-600 font-bold'
                            : 'bg-white text-cyan-800 border-cyan-200 hover:bg-cyan-100/60'
                        }`}
                      >
                        {uri}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-amber-800 leading-relaxed bg-amber-50/90 p-2 rounded-xl border border-amber-200 font-sans">
                    ⚠️ <strong>关键报错排查：</strong>若登录报错 <code className="font-mono bg-white px-1 rounded text-rose-600 font-bold">redirect_uri_mismatch</code>，代表此处的地址与您在 Salesforce 设置【已连接的应用 (Connected App)】中的【回调 URL】不匹配。请点击上方常用地址或手动输入您在 Salesforce 中配置的 Callback URL。
                  </p>
                </div>
              )}

              <div className="text-[10px] text-cyan-900 leading-relaxed bg-white/70 p-2 rounded-xl border border-cyan-200/60">
                💡 <strong>架构支持说明：</strong>阿里中国版部署于阿里云本土环境，域名为 <code className="bg-cyan-100/60 px-1 rounded font-mono">*.sfcrmproducts.cn</code>；全球版域名为 <code className="bg-cyan-100/60 px-1 rounded font-mono">*.salesforce.com</code>。若使用客户端凭据模式直连，推荐将实例地址配置为您组织的 My Domain 专属域。
              </div>
            </div>
          )}

          {/* 纷享销客专属配置面板 */}
          {productType === 'fxiaoke' && (
            <div className="p-3.5 bg-orange-50/60 rounded-2xl border border-orange-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-orange-950 flex items-center space-x-1.5">
                  <Flame className="w-4 h-4 text-orange-600" />
                  <span>纷享销客 OpenAPI v2 授权规范</span>
                </span>
                <a
                  href="https://developer.fxiaoke.com/openapi_v2/start/auth/app-info.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-orange-700 hover:text-orange-900 underline flex items-center space-x-0.5"
                >
                  <span>官方文档</span>
                </a>
              </div>

              {/* 所在云域名 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-orange-900">
                    所在云域名 (Cloud Domain) *
                  </label>
                  <select
                    value={cloudDomain}
                    onChange={(e) => handleCloudDomainChange(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-orange-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-orange-500 cursor-pointer"
                  >
                    <option value="open.fxiaoke.com">纷享云 (默认) - open.fxiaoke.com</option>
                    <option value="open-hwcloud.fxiaoke.com">华为云 - open-hwcloud.fxiaoke.com</option>
                    <option value="open-ale.fxiaoke.com">阿里云 - open-ale.fxiaoke.com</option>
                    <option value="open-ksc.sharecrm.com">香港华为云 - open-ksc.sharecrm.com</option>
                    <option value="open-hws.fxiaoke.com">法兰克福云 - open-hws.fxiaoke.com</option>
                    <option value="open-na.sharecrm.com">北美云 - open-na.sharecrm.com</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-orange-900">
                    授权认证模式 *
                  </label>
                  <select
                    value={authMode}
                    onChange={(e) => setAuthMode(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 bg-white border border-orange-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-orange-500 cursor-pointer"
                  >
                    <option value="client_credentials">客户端凭证模式 (免用户登录 · 后台直通)</option>
                    <option value="authorization_code">授权码模式 (Web 浏览器登录获取 Code)</option>
                  </select>
                </div>
              </div>

              {/* appId & appSecret & permanentCode */}
              <div className="space-y-2 pt-1 border-t border-orange-200/60">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-orange-900">
                      自建应用 appId *
                    </label>
                    <input
                      type="text"
                      required
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      placeholder="如 FSAID_xxxxx"
                      className="w-full px-2.5 py-1.5 bg-white border border-orange-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-orange-900">
                      自建应用 appSecret *
                    </label>
                    <input
                      type="password"
                      required
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      placeholder="自建应用密钥"
                      className="w-full px-2.5 py-1.5 bg-white border border-orange-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                {authMode === 'client_credentials' && (
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-orange-900 flex items-center justify-between">
                      <span>企业永久授权码 (permanentCode) *</span>
                      <span className="text-[10px] text-orange-700 font-normal">自建应用发布后管理后台生成</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={permanentCode}
                      onChange={(e) => setPermanentCode(e.target.value)}
                      placeholder="3F9xxxxxCA5"
                      className="w-full px-2.5 py-1.5 bg-white border border-orange-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-orange-900">
                    企业账号代码 ea (可选)
                  </label>
                  <input
                    type="text"
                    value={ea}
                    onChange={(e) => setEa(e.target.value)}
                    placeholder="企业账号如 fxxxx1"
                    className="w-full px-2.5 py-1.5 bg-white border border-orange-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="text-[10px] text-orange-800 leading-relaxed bg-white/70 p-2 rounded-xl border border-orange-200/60">
                💡 <strong>时效性说明：</strong>Token 有效期为 7200 秒（2小时），支持无用户交互在后台直接获取访问凭证；接口频次每分钟不超过 10 次。
              </div>
            </div>
          )}

          {/* 3. 实例服务地址 (仅非纷享销客显示) */}
          {productType !== 'fxiaoke' && (
          <>
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
          </>
          )}

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
              {initialEnv?.isPreset ? '保存凭据配置' : (initialEnv ? '保存修改' : '确认创建连接器')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
