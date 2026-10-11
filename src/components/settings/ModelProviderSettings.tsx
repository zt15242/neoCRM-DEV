import React, { useState } from 'react';
import { AiProviderConfig, AiModelItem } from '../../../shared/types';
import { CustomProviderModal } from './CustomProviderModal';
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
  ShieldCheck
} from 'lucide-react';

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

  // DeepSeek 官方配置表单本地状态
  const deepseek = providers.find((p) => p.id === 'deepseek') || providers[0];
  const [dsKey, setDsKey] = useState(deepseek?.apiKey || '');
  const [dsBaseUrl, setDsBaseUrl] = useState(deepseek?.baseUrl || 'https://api.deepseek.com');
  const [showDsKey, setShowDsKey] = useState(false);
  const [savingDs, setSavingDs] = useState(false);
  const [testingDs, setTestingDs] = useState(false);
  const [dsTestResult, setDsTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // 展开的第三方供应商 ID
  const [expandedThirdPartyId, setExpandedThirdPartyId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});

  // 密码显示状态表
  const [showKeysMap, setShowKeysMap] = useState<Record<string, boolean>>({});

  const handleSaveDeepSeek = async () => {
    setSavingDs(true);
    try {
      const updated: AiProviderConfig = {
        ...deepseek,
        apiKey: dsKey.trim(),
        baseUrl: dsBaseUrl.trim(),
        enabled: true,
      };
      await onSaveProvider(updated);
      showToast('success', 'DeepSeek 官方配置已成功保存');
    } catch (e: any) {
      showToast('error', `保存失败: ${e.message}`);
    } finally {
      setSavingDs(false);
    }
  };

  const handleTestDeepSeek = async () => {
    setTestingDs(true);
    setDsTestResult(null);
    try {
      const temp: AiProviderConfig = {
        ...deepseek,
        apiKey: dsKey.trim(),
        baseUrl: dsBaseUrl.trim(),
      };
      const res = await window.neoApi.aiTestProvider(temp);
      setDsTestResult(res);
    } catch (e: any) {
      setDsTestResult({ success: false, message: e.message || '连接失败' });
    } finally {
      setTestingDs(false);
    }
  };

  const handleToggleProviderEnabled = async (provider: AiProviderConfig, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = { ...provider, enabled: !provider.enabled };
    await onSaveProvider(updated);
  };

  const handleSaveThirdParty = async (provider: AiProviderConfig, key: string, url: string) => {
    try {
      const updated = {
        ...provider,
        apiKey: key.trim(),
        baseUrl: url.trim(),
        enabled: true,
      };
      await onSaveProvider(updated);
      showToast('success', `${provider.name} 配置已保存`);
    } catch (e: any) {
      showToast('error', `保存失败: ${e.message}`);
    }
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

  const builtinThirdParty = providers.filter((p) => p.type === 'builtin-thirdparty');
  const customProviders = providers.filter((p) => p.type === 'custom');

  return (
    <div className="space-y-6">
      {/* 顶部操作区 */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div>
          <h3 className="text-base font-bold text-slate-800">模型供应商 (Models & Providers)</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            配置 DeepSeek 官方、第三方云端模型或自定义 API 网关。模型密钥本地加密保存，支持随时热切。
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

      {/* 1. DeepSeek 官方卡片 (推荐) */}
      <div className="rounded-2xl border-2 border-sky-300 bg-gradient-to-br from-sky-50/60 via-white to-blue-50/40 p-5 shadow-xs relative overflow-hidden">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-blue-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h4 className="text-sm font-bold text-slate-900">DeepSeek 官方平台</h4>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-semibold border border-sky-200">
                  官方直连 • 推荐
                </span>
                {deepseek?.apiKey ? (
                  <span className="text-[10px] text-emerald-600 flex items-center space-x-0.5">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>已激活</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-amber-600 flex items-center space-x-0.5">
                    <AlertCircle className="w-3 h-3" />
                    <span>待配置 API Key</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                包含 <strong>DeepSeek-V3</strong> (通用对话与工具调用) 与 <strong>DeepSeek-R1</strong> (深度思考推理)，开箱即用支持流式思维链展示。
              </p>
            </div>
          </div>

          <button
            onClick={() => window.neoApi.openExternal('https://platform.deepseek.com/')}
            className="text-xs text-sky-600 hover:text-sky-700 flex items-center space-x-1 font-medium"
          >
            <span>获取 API Key</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>

        {/* DeepSeek 表单 */}
        <div className="mt-4 pt-4 border-t border-sky-100 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-slate-700 font-medium mb-1">
              DeepSeek API Key <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showDsKey ? 'text' : 'password'}
                value={dsKey}
                onChange={(e) => setDsKey(e.target.value)}
                placeholder="sk-..."
                className="w-full pl-3 pr-9 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-sky-500 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowDsKey(!showDsKey)}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                {showDsKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-slate-700 font-medium mb-1">
              Base URL 接口地址
            </label>
            <input
              type="text"
              value={dsBaseUrl}
              onChange={(e) => setDsBaseUrl(e.target.value)}
              placeholder="https://api.deepseek.com"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-sky-500 font-mono"
            />
          </div>
        </div>

        {/* 测速结果 */}
        {dsTestResult && (
          <div
            className={`mt-3 p-2.5 rounded-xl border flex items-center space-x-2 text-xs ${
              dsTestResult.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {dsTestResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{dsTestResult.message}</span>
          </div>
        )}

        {/* DeepSeek 操作按钮 */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-[11px] text-slate-500">
            <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200">deepseek-chat</span>
            <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200">deepseek-reasoner</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleTestDeepSeek}
              disabled={testingDs}
              className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center space-x-1"
            >
              {testingDs ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              <span>测试连接</span>
            </button>
            <button
              onClick={handleSaveDeepSeek}
              disabled={savingDs}
              className="px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-xs"
            >
              {savingDs ? '保存中...' : '保存 DeepSeek 配置'}
            </button>
          </div>
        </div>
      </div>

      {/* 2. 预置第三方供应商列表 */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          内置主流供应商目录 (Built-in Providers)
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {builtinThirdParty.map((provider) => {
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
              />
            );
          })}
        </div>
      </div>

      {/* 3. 自定义模型 API 列表 */}
      {customProviders.length > 0 && (
        <div className="space-y-3 pt-2">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            已添加的自定义模型 API (Custom APIs)
          </h4>

          <div className="space-y-2">
            {customProviders.map((cp) => (
              <div
                key={cp.id}
                className="p-4 rounded-xl border border-slate-200 bg-white flex items-center justify-between"
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
  onSave: (provider: AiProviderConfig, key: string, url: string) => Promise<void>;
  onTest: (provider: AiProviderConfig, key: string, url: string) => Promise<void>;
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
}) => {
  const [localKey, setLocalKey] = useState(provider.apiKey || '');
  const [localUrl, setLocalUrl] = useState(provider.baseUrl || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(provider, localKey, localUrl);
    setSaving(false);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs transition-all">
      <div
        onClick={onToggleExpand}
        className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-50/80 transition-colors"
      >
        <div className="flex items-center space-x-2.5 truncate">
          <div className="p-1.5 rounded-lg bg-slate-100 text-slate-600 shrink-0">
            <Globe className="w-4 h-4" />
          </div>
          <div className="truncate">
            <div className="flex items-center space-x-1.5">
              <span className="font-semibold text-xs text-slate-800">{provider.name}</span>
              {hasKey && (
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
          {provider.website && (
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
          <div>
            <label className="block text-slate-600 font-medium mb-1">
              API Key 访问密钥
            </label>
            <div className="relative">
              <input
                type={isKeyVisible ? 'text' : 'password'}
                value={localKey}
                onChange={(e) => setLocalKey(e.target.value)}
                placeholder="请输入 API 密钥..."
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
            <div className="text-[10px] text-slate-400 font-mono">
              包含 {provider.models.length} 个预设模型
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => onTest(provider, localKey, localUrl)}
                disabled={isTesting}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-medium"
              >
                {isTesting ? '测试中...' : '测试连接'}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
