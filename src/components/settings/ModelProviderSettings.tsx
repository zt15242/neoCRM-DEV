import React, { useState } from 'react';
import { AiProviderConfig, AiModelItem } from '../../../shared/types';
import { CustomProviderModal } from './CustomProviderModal';
import { ModelContextSettings } from './ModelContextSettings';
import { WorkBuddyAuthModal } from './WorkBuddyAuthModal';
import { 
  Bot, 
  KeyRound, 
  Plus, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Trash2, 
  Edit3, 
  Eye, 
  EyeOff, 
  Sparkles, 
  BrainCircuit, 
  Globe, 
  Cpu, 
  ChevronDown, 
  ChevronRight,
  Search,
  QrCode,
  Smartphone,
  RefreshCw,
  Coins
} from 'lucide-react';

function preserveConfiguredModelLimits(models: AiModelItem[], configured: AiModelItem[] = []): AiModelItem[] {
  const configuredById = new Map(configured.map(item => [item.id, item]));
  return models.map((model) => {
    const previous = configuredById.get(model.id);
    return { ...model, contextWindow: model.contextWindow ?? previous?.contextWindow,
      maxOutputTokens: model.maxOutputTokens ?? previous?.maxOutputTokens };
  });
}

interface ModelProviderSettingsProps {
  providers: AiProviderConfig[];
  onSaveProvider: (provider: AiProviderConfig) => Promise<void>;
  onDeleteProvider: (id: string) => Promise<void>;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const ModelProviderSettings: React.FC<ModelProviderSettingsProps> = ({
  providers,
  onSaveProvider,
  onDeleteProvider,
  showToast,
}) => {
  // 编辑/新增自定义 Provider 模态框
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AiProviderConfig | null>(null);

  // 展开的内置供应商 ID
  const [expandedThirdPartyId, setExpandedThirdPartyId] = useState<string | null>('gemini');
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  // 密码显示状态表
  const [showKeysMap, setShowKeysMap] = useState<Record<string, boolean>>({});
  // WorkBuddy 扫码模态框与账号状态
  const [wbAuthModalOpen, setWbAuthModalOpen] = useState(false);
  const [wbAccount, setWbAccount] = useState<any>(null);
  const [wbStatus, setWbStatus] = useState<any>(null);

  const fetchWbStatus = async (refresh = false) => {
    try {
      const api = refresh ? window.neoApi?.workbuddyRefreshStatus : window.neoApi?.workbuddyGetStatus;
      if (api) {
        const res = await api();
        setWbStatus(res);
        if (res.loggedIn && res.account) {
          setWbAccount(res.account);
        } else {
          setWbAccount(null);
        }
        if (refresh && Array.isArray(res.models) && res.models.length > 0) {
          const currentProvider = providers.find((provider) => provider.id === 'workbuddy');
          res.models = preserveConfiguredModelLimits(res.models, currentProvider?.models);
        }
        return res;
      }
    } catch {}
    return null;
  };

  React.useEffect(() => {
    void fetchWbStatus();
  }, []);


  const handleSaveThirdParty = async (provider: AiProviderConfig, key: string, url: string, customModels?: AiModelItem[]) => {
    const updated = {
      ...provider,
      apiKey: key.trim(),
      baseUrl: url.trim(),
      models: customModels || provider.models,
      enabled: true,
    };
    await onSaveProvider(updated);
    showToast('success', `${provider.name} 配置已保存`);
  };

  const handleTestProvider = async (provider: AiProviderConfig, key: string, url: string) => {
    setTestingId(provider.id);
    try {
      const temp = { ...provider, apiKey: key.trim(), baseUrl: url.trim() };
      const res = await window.neoApi.aiTestProvider(temp);
      setTestResults((prev) => ({ ...prev, [provider.id]: res }));
    } catch (e: any) {
      setTestResults((prev) => ({
        ...prev,
        [provider.id]: { success: false, message: e.message || '测试失败' },
      }));
    } finally {
      setTestingId(null);
    }
  };

  const builtinProviders = providers.filter((p) => p.type === 'official-deepseek' || p.type === 'builtin-thirdparty');
  const customProviders = providers.filter((p) => p.type === 'custom');

  return (
    <div className="model-settings space-y-6">
      {/* 顶部操作区 */}
      <div className="model-settings__header flex items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <h3 className="text-base font-bold text-slate-800">模型供应商 (Models & Providers)</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            配置 DeepSeek、Google Gemini、OpenAI 或自定义 API 网关。密钥本地保存，支持随时热切。
          </p>
        </div>
        <button
          onClick={() => {
            setEditingProvider(null);
            setModalOpen(true);
          }}
          className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>添加自定义模型 API</span>
        </button>
      </div>

      <ModelContextSettings providers={providers} onSave={onSaveProvider} showToast={showToast} />

      {/* 3. 自定义模型 API 列表 */}
      {customProviders.length > 0 && (
        <div className="space-y-3 pt-2">
          <h4 className="text-sm font-semibold text-slate-800">
            自定义供应商
          </h4>

          <div className="space-y-2">
            {customProviders.map((cp) => (
              <div
                key={cp.id}
                className="model-settings__custom p-4 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-3"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-slate-100 text-slate-600">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-xs text-slate-800">{cp.name}</span>
                      <span className="text-[10px] font-mono text-slate-400">({cp.id})</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500">
                        {cp.protocol}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 mt-0.5 truncate max-w-md">
                      {cp.baseUrl} • {cp.models.length} 个模型
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => {
                      setEditingProvider(cp);
                      setModalOpen(true);
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                    title="编辑"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDeleteProvider(cp.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                    title="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* 2. 预置第三方供应商列表 */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-slate-800">
          内置供应商
        </h4>

        <div className="grid grid-cols-1 gap-2">
          {builtinProviders.map((provider) => {
            const isExpanded = expandedThirdPartyId === provider.id;
            const hasKey = !!provider.apiKey;
            const isTesting = testingId === provider.id;
            const testRes = testResults[provider.id];
            const isKeyVisible = showKeysMap[provider.id] || false;

            return (
              <ThirdPartyProviderCard
                key={provider.id}
                provider={provider}
                isExpanded={isExpanded}
                hasKey={hasKey}
                isTesting={isTesting}
                testRes={testRes}
                isKeyVisible={isKeyVisible}
                onToggleExpand={() =>
                  setExpandedThirdPartyId(isExpanded ? null : provider.id)
                }
                onToggleKeyVisible={() =>
                  setShowKeysMap((prev) => ({ ...prev, [provider.id]: !isKeyVisible }))
                }
                onSave={handleSaveThirdParty}
                onTest={handleTestProvider}
                showToast={showToast}
                wbAccount={provider.id === 'workbuddy' ? wbAccount : undefined}
                wbStatus={provider.id === 'workbuddy' ? wbStatus : undefined}
                onRefreshWbStatus={() => fetchWbStatus(true)}
                onOpenWbAuth={() => setWbAuthModalOpen(true)}
              />
            );
          })}
        </div>
      </div>

      {/* WorkBuddy 扫码登录模态框 */}
      <WorkBuddyAuthModal
        isOpen={wbAuthModalOpen}
        onClose={() => setWbAuthModalOpen(false)}
        onSuccess={async () => {
          const status = await fetchWbStatus(true);
          const provider = providers.find(item => item.id === 'workbuddy');
          if (provider && status?.models?.length) {
            try { await onSaveProvider({ ...provider, models: status.models }); }
            catch (error: any) { showToast('error', `模型目录保存失败：${error.message}`); }
          }
        }}
        showToast={showToast}
      />

      {/* 自定义 Provider 模态框 */}
      <CustomProviderModal
        isOpen={modalOpen}
        initialProvider={editingProvider}
        onClose={() => {
          setModalOpen(false);
          setEditingProvider(null);
        }}
        onSave={async (p) => {
          await onSaveProvider(p);
          showToast('success', `供应商 [${p.name}] 保存成功`);
        }}
        showToast={showToast}
      />
    </div>
  );
};

/**
 * 单个第三方供应商折叠卡片组件
 */
const ThirdPartyProviderCard: React.FC<{
  provider: AiProviderConfig;
  isExpanded: boolean;
  hasKey: boolean;
  isTesting: boolean;
  testRes?: { success: boolean; message: string };
  isKeyVisible: boolean;
  onToggleExpand: () => void;
  onToggleKeyVisible: () => void;
  onSave: (provider: AiProviderConfig, key: string, url: string, customModels?: AiModelItem[]) => Promise<void>;
  onTest: (provider: AiProviderConfig, key: string, url: string) => Promise<void>;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
  wbAccount?: any;
  wbStatus?: any;
  onRefreshWbStatus?: () => Promise<any>;
  onOpenWbAuth?: () => void;
}> = ({
  provider,
  isExpanded,
  hasKey,
  isTesting,
  testRes,
  isKeyVisible,
  onToggleExpand,
  onToggleKeyVisible,
  onSave,
  onTest,
  showToast,
  wbAccount,
  wbStatus,
  onRefreshWbStatus,
  onOpenWbAuth,
}) => {
  const [localKey, setLocalKey] = useState(provider.apiKey || '');
  const [localUrl, setLocalUrl] = useState(provider.baseUrl || '');
  const [localModels, setLocalModels] = useState<AiModelItem[]>(provider.models || []);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [modelsDirty, setModelsDirty] = useState(false);

  React.useEffect(() => {
    if (!modelsDirty) setLocalModels(provider.models || []);
  }, [provider.models, modelsDirty]);

  const isGemini = provider.id === 'gemini';
  const isWorkBuddy = provider.id === 'workbuddy';

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(provider, localKey, localUrl, modelsDirty ? localModels : provider.models);
      setModelsDirty(false);
    } catch (error: any) {
      showToast('error', `保存失败：${error.message}`);
    } finally { setSaving(false); }
  };

  const handleFetchModels = async () => {
    if (!localKey.trim() && !localUrl.includes('localhost') && !localUrl.includes('127.0.0.1') && !isWorkBuddy) {
      showToast('error', `请先输入 ${provider.name} 的 API Key`);
      return;
    }
    setFetching(true);
    try {
      if (isWorkBuddy && onRefreshWbStatus) {
        const refreshStartedAt = Date.now();
        const status = await onRefreshWbStatus();
        const refreshedModels = status?.models?.length && !status.modelsSyncError && status.modelsSyncedAt >= refreshStartedAt
          ? status.models
          : null;
        if (refreshedModels) {
          setLocalModels(refreshedModels);
          await onSave(provider, localKey, localUrl, refreshedModels);
          const remaining = status.quota?.remainingPoints;
          showToast(
            'success',
            `已同步 ${refreshedModels.length} 个最新模型${remaining !== undefined ? `，剩余积分 ${remaining} ${status.quota?.unit || '积分'}` : status.quotaSyncError ? '，积分查询失败' : ''}`
          );
        } else {
          const quotaSummary = status?.quotaSyncedAt >= refreshStartedAt && status?.quota?.remainingPoints !== undefined
            ? `积分已更新为 ${status.quota.remainingPoints} ${status.quota.unit || '积分'}；`
            : '';
          showToast('error', `${quotaSummary}${status?.modelsSyncError || '上游未返回可用模型'}`);
        }
        return;
      }
      const temp: AiProviderConfig = {
        ...provider,
        apiKey: localKey.trim(),
        baseUrl: localUrl.trim(),
      };
      const res = await window.neoApi.aiFetchModels(temp);
      if (res.success && res.models.length > 0) {
        setLocalModels(res.models);
        if (isWorkBuddy) {
          await onSave(provider, localKey, localUrl, res.models);
          showToast('success', `成功从 ${provider.name} 同步并保存了 ${res.models.length} 个模型！`);
        } else {
          setModelsDirty(true);
          showToast('success', `成功从 ${provider.name} 探测到 ${res.models.length} 个模型！请点击保存生效。`);
        }
      } else {
        showToast('error', res.error || '未能探测到可用模型');
      }
    } catch (e: any) {
      showToast('error', `探测异常: ${e.message}`);
    } finally {
      setFetching(false);
    }
  };

  return (
    <div
      data-provider-id={provider.id}
      className="model-settings__provider rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs transition-all"
    >
      <div
        onClick={onToggleExpand}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? '收起' : '展开'} ${provider.name} 配置`}
        onKeyDown={event => {
          if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            onToggleExpand();
          }
        }}
        className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-50/80 transition-colors"
      >
        <div className="flex items-center space-x-2.5 truncate">
          <div
            className={`p-1.5 rounded-lg shrink-0 ${
              isGemini ? 'bg-indigo-100 text-indigo-600' : isWorkBuddy ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {isGemini ? <Sparkles className="w-4 h-4" /> : isWorkBuddy ? <Cpu className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
          </div>
          <div className="truncate">
            <div className="flex items-center space-x-1.5">
              <span className="font-semibold text-xs text-slate-800">{provider.name}</span>
              {isGemini && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">
                  支持 2.5 Pro/Flash
                </span>
              )}
              {isWorkBuddy && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-50 text-cyan-700 border border-cyan-200 font-medium">
                  腾讯双区域网关 · 默认8788
                </span>
              )}
              {isWorkBuddy ? (
                wbAccount ? (
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                    已登录: {wbAccount.nickname || wbAccount.uid?.slice(0, 8)}
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                    未登录 · 需扫码
                  </span>
                )
              ) : hasKey && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  已配置
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 truncate mt-0.5">
              {provider.description}
            </p>
          </div>
        </div>


        <div className="flex items-center space-x-2 shrink-0 ml-2">
          {isWorkBuddy && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenWbAuth?.();
              }}
              className="px-2 py-0.5 text-[10px] font-semibold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white flex items-center space-x-1 shadow-2xs transition-all cursor-pointer"
            >
              <QrCode className="w-3 h-3" />
              <span>{wbAccount ? '切换账号' : '扫码登录'}</span>
            </button>
          )}
          {!isWorkBuddy && provider.website && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.neoApi.openExternal(provider.website!);
              }}
              title="前往官网获取密钥"
              className="p-1 text-slate-400 hover:text-sky-600 rounded"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </div>

      {/* 展开的表单区域 */}
      {isExpanded && (
        <div className="p-3.5 bg-slate-50/60 border-t border-slate-100 space-y-3 text-xs">
          {!isWorkBuddy && (
            <>
              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  {isGemini ? 'Gemini API Key (AIzaSy...)' : 'API Key 访问密钥'}
                </label>
                <div className="relative">
                  <input
                    type={isKeyVisible ? 'text' : 'password'}
                    value={localKey}
                    onChange={(e) => setLocalKey(e.target.value)}
                    placeholder={isGemini ? '粘贴 AIzaSy... 格式密钥' : '请输入 API 密钥...'}
                    className="w-full pl-2.5 pr-8 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:border-sky-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={onToggleKeyVisible}
                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                  >
                    {isKeyVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  Base URL 接口地址
                </label>
                <input
                  type="text"
                  value={localUrl}
                  onChange={(e) => setLocalUrl(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:border-sky-500 font-mono text-[11px]"
                />
              </div>
            </>
          )}



          {isWorkBuddy && (
            <div className="bg-gradient-to-r from-cyan-50/90 to-sky-50/90 border border-cyan-200/90 rounded-xl p-3 text-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-lg bg-cyan-600 flex items-center justify-center text-white shrink-0 shadow-2xs">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <span className="font-bold text-slate-800">腾讯 WorkBuddy / CodeBuddy 原生反代</span>
                      {wbAccount ? (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-semibold">
                          已授权 ({wbAccount.realm === 'cn' ? '国内版' : '国际版'})
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-semibold">
                          未登录
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {wbAccount
                        ? `当前用户: ${wbAccount.nickname || wbAccount.uid} · 自动保活与静默续期已生效`
                        : '点击右侧按钮即可使用微信或手机扫码快速登录，无需配置 Python 环境！'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onOpenWbAuth}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white flex items-center space-x-1.5 shadow-2xs transition-all cursor-pointer shrink-0"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>{wbAccount ? '重新扫码 / 换号' : '扫码登录'}</span>
                </button>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-cyan-200/50 text-[11px] text-cyan-800">
                <span>内置本地代理监听: <strong>http://127.0.0.1:8788/v1</strong> (支持外部应用接入)</span>
                <button
                  type="button"
                  onClick={() => {
                    const dashUrl = localUrl.replace(/\/v1\/?$/, '') || 'http://127.0.0.1:8788';
                    window.neoApi.openExternal(dashUrl);
                  }}
                  className="hover:underline font-semibold cursor-pointer"
                >
                  检查网关状态
                </button>
              </div>

              {wbStatus && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="rounded-lg border border-cyan-200 bg-white/80 px-2.5 py-2">
                    <div className="flex items-center gap-1 text-[10px] text-slate-500">
                      <Coins className="w-3 h-3 text-amber-500" />
                      <span>剩余积分</span>
                    </div>
                    <div className="mt-0.5 text-sm font-bold text-slate-800">
                      {wbStatus.quota?.remainingPoints !== undefined
                        ? `${wbStatus.quota.remainingPoints} ${wbStatus.quota.unit || '积分'}`
                        : '未获取'}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {wbStatus.quotaSyncError
                        ? `同步失败：${wbStatus.quotaSyncError}`
                        : wbStatus.quotaSyncedAt
                        ? `更新于 ${new Date(wbStatus.quotaSyncedAt).toLocaleTimeString()}`
                        : '尚未同步'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-cyan-200 bg-white/80 px-2.5 py-2">
                    <div className="flex items-center gap-1 text-[10px] text-slate-500">
                      <Cpu className="w-3 h-3 text-cyan-600" />
                      <span>实时模型</span>
                    </div>
                    <div className="mt-0.5 text-sm font-bold text-slate-800">{wbStatus.models?.length || 0} 个</div>
                    <div className="text-[10px] text-slate-400">
                      {wbStatus.modelsSyncError
                        ? `同步失败：${wbStatus.modelsSyncError}`
                        : wbStatus.modelsSyncedAt
                        ? `更新于 ${new Date(wbStatus.modelsSyncedAt).toLocaleTimeString()}`
                        : '尚未同步'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}


          {/* 预置/探测模型标签展示 */}
          <div className="flex flex-wrap gap-1 pt-0.5">
            {localModels.slice(0, 6).map((m) => (
              <span
                key={m.id}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600"
              >
                {m.id}
              </span>
            ))}
            {localModels.length > 6 && (
              <span className="text-[10px] px-1.5 py-0.5 text-slate-400">
                +{localModels.length - 6} 个模型
              </span>
            )}
          </div>

          {/* 探测或测试结果 */}
          {testRes && (
            <div
              className={`p-2 rounded-lg border text-xs flex items-center space-x-1.5 ${
                testRes.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {testRes.success ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              )}
              <span className="truncate">{testRes.message}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleFetchModels}
              disabled={fetching}
              className="text-[11px] text-sky-600 hover:text-sky-700 font-medium flex items-center space-x-1"
            >
              {fetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
              <span>{isWorkBuddy ? '刷新积分与最新模型' : '探测可用模型'}</span>
            </button>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => onTest(provider, localKey, localUrl)}
                disabled={isTesting}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-medium"
              >
                {isTesting ? '测试中...' : '测试连接'}
              </button>
              {!isWorkBuddy && (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium cursor-pointer"
                >
                  {saving ? '保存中...' : '保存'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
