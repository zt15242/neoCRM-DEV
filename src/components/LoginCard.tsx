import React, { useState } from 'react';
import { 
  KeyRound, 
  Compass, 
  AppWindow, 
  ArrowRight,
  ShieldCheck,
  X
} from 'lucide-react';
import { NeoEnvironment } from '../../shared/types';
import { Cloud, Layers, Flame, Plug } from 'lucide-react';

interface LoginCardProps {
  environment: NeoEnvironment;
  isLoggingIn: boolean;
  loginStatusText: string;
  onLoginBrowser: () => void;
  onLoginEmbedded: () => void;
  onLoginPassword: (username: string, pass: string) => void;
  onCancelLogin: () => void;
}

export const LoginCard: React.FC<LoginCardProps> = ({
  environment,
  isLoggingIn,
  loginStatusText,
  onLoginBrowser,
  onLoginEmbedded,
  onLoginPassword,
  onCancelLogin,
}) => {
  const [activeTab, setActiveTab] = useState<'embedded' | 'browser' | 'password'>('embedded');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    onLoginPassword(username.trim(), password);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {/* 头部环境信息 */}
      <div className="p-5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-600"></span>
            <h3 className="font-semibold text-slate-900 text-base">{environment.name}</h3>
            <span className="text-xs px-2 py-0.5 rounded bg-sky-50 text-sky-600 border border-sky-200 font-mono">
              {environment.id}
            </span>
            {environment.productType === 'salesforce' && (
              <span className="text-xs px-2 py-0.5 rounded bg-cyan-50 text-cyan-700 border border-cyan-200 font-mono flex items-center space-x-1">
                <Cloud className="w-3 h-3 text-cyan-600" />
                <span>Salesforce</span>
              </span>
            )}
            {environment.productType === 'fxiaoke' && (
              <span className="text-xs px-2 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200 font-mono flex items-center space-x-1">
                <Flame className="w-3 h-3 text-orange-600" />
                <span>纷享销客</span>
              </span>
            )}
            {(environment.productType === 'neocrm' || !environment.productType) && (
              <span className="text-xs px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-mono flex items-center space-x-1">
                <Layers className="w-3 h-3 text-sky-600" />
                <span>销售易 NeoCRM</span>
              </span>
            )}
            {environment.productType === 'custom' && (
              <span className="text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-mono flex items-center space-x-1">
                <Plug className="w-3 h-3 text-purple-600" />
                <span>自定义 CRM</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 font-mono">{environment.neoBaseURL}</p>
        </div>

        {/* 模式切换 Tab */}
        <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab('embedded')}
            disabled={isLoggingIn}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'embedded'
                ? 'bg-white text-sky-600 shadow-xs border border-slate-200/80 font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <AppWindow className="w-3.5 h-3.5" />
            <span>内嵌窗口登录 (推荐)</span>
          </button>
          <button
            onClick={() => setActiveTab('browser')}
            disabled={isLoggingIn}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'browser'
                ? 'bg-white text-sky-600 shadow-xs border border-slate-200/80 font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>外部浏览器授权</span>
          </button>
          <button
            onClick={() => setActiveTab('password')}
            disabled={isLoggingIn}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'password'
                ? 'bg-white text-sky-600 shadow-xs border border-slate-200/80 font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>密码直登</span>
          </button>
        </div>
      </div>

      {/* 登录主体 */}
      <div className="p-6">
        {isLoggingIn ? (
          <div className="py-8 flex flex-col items-center justify-center space-y-4 text-center">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-sky-100 border-t-sky-600 animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <ShieldCheck className="w-7 h-7 text-sky-600" />
              </div>
            </div>
            <div>
              <h4 className="text-base font-semibold text-slate-900">正在进行 OAuth2 认证授权...</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                {loginStatusText || '请在打开的认证页面中完成登录，授权成功后将自动返回。'}
              </p>
            </div>
            <button
              onClick={onCancelLogin}
              className="flex items-center space-x-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>取消授权</span>
            </button>
          </div>
        ) : (
          <div>
            {activeTab === 'embedded' && (
              <div className="space-y-5">
                <div className="flex items-start space-x-3 p-4 bg-sky-50/70 border border-sky-200/80 rounded-xl">
                  <AppWindow className="w-5 h-5 text-sky-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-semibold text-sky-900">免跳出客户端 原生体验</p>
                    <p className="text-slate-600 leading-relaxed">
                      客户端将调起独立的销售易统一认证授权窗口，支持手机号/密码/企微/钉钉扫码登录。完成认证后窗口自动关闭并写入会话。
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center text-xs py-2">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="text-sky-600 font-bold block mb-1">步骤 1</span>
                    <span className="text-slate-700 font-medium">调起模态认证窗口</span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="text-sky-600 font-bold block mb-1">步骤 2</span>
                    <span className="text-slate-700 font-medium">销售易官方统一认证</span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="text-sky-600 font-bold block mb-1">步骤 3</span>
                    <span className="text-slate-700 font-medium">截获 Code 换取 Token</span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={onLoginEmbedded}
                    className="w-full py-3 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-medium text-sm rounded-xl shadow-md shadow-sky-600/20 flex items-center justify-center space-x-2 transition-all transform active:scale-[0.99]"
                  >
                    <AppWindow className="w-4 h-4" />
                    <span>立即开始授权登录</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'browser' && (
              <div className="space-y-5">
                <div className="flex items-start space-x-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <Compass className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-semibold text-slate-900">外部浏览器标准授权模式</p>
                    <p className="text-slate-600 leading-relaxed">
                      客户端将在本地启动安全回调端口监听，并在系统默认浏览器中打开销售易统一认证页面。完成登录后自动回传并提取访问令牌。
                    </p>
                  </div>
                </div>

                <div className="text-xs text-slate-600 space-y-2 font-mono bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="flex justify-between">
                    <span>授权地址:</span>
                    <span className="text-slate-800 truncate max-w-xs">{environment.loginURL}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>本地回调:</span>
                    <span className="text-slate-800">{environment.redirectUri || 'http://localhost:1028'}</span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={onLoginBrowser}
                    className="w-full py-3 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-medium text-sm rounded-xl shadow-md shadow-sky-600/20 flex items-center justify-center space-x-2 transition-all transform active:scale-[0.99]"
                  >
                    <Compass className="w-4 h-4" />
                    <span>唤起系统浏览器登录</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'password' && (
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="flex items-start space-x-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
                  <KeyRound className="w-4 h-4 text-sky-600 flex-shrink-0 mt-0.5" />
                  <span>
                    使用 OAuth2 资源所有者密码凭证模式 (grant_type=password) 直接向该环境获取 Token。
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    销售易账号 (手机号/邮箱/用户名)
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="请输入销售易账号"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    账号密码
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="请输入密码"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm rounded-xl shadow-md shadow-sky-600/20 flex items-center justify-center space-x-2 transition-all transform active:scale-[0.99]"
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>直接登录</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
