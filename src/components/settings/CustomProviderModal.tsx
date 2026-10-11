import React, { useState } from 'react';
import { AiProviderConfig, AiModelItem, AiProtocol } from '../../../shared/types';
import { 
  Cpu, 
  X, 
  Plus, 
  Trash2, 
  Search, 
  Check, 
  Loader2, 
  AlertCircle,
  CheckCircle2,
  BrainCircuit
} from 'lucide-react';

interface CustomProviderModalProps {
  isOpen: boolean;
  initialProvider?: AiProviderConfig | null;
  onClose: () => void;
  onSave: (provider: AiProviderConfig) => Promise<void>;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const CustomProviderModal: React.FC<CustomProviderModalProps> = ({
  isOpen,
  initialProvider,
  onClose,
  onSave,
  showToast,
}) => {
  const [providerId, setProviderId] = useState(initialProvider?.id || '');
  const [name, setName] = useState(initialProvider?.name || '');
  const [protocol, setProtocol] = useState<AiProtocol>(initialProvider?.protocol || 'openai-completions');
  const [baseUrl, setBaseUrl] = useState(initialProvider?.baseUrl || 'http://127.0.0.1:11434/v1');
  const [apiKey, setApiKey] = useState(initialProvider?.apiKey || '');
  const [models, setModels] = useState<AiModelItem[]>(
    initialProvider?.models || [
      { id: 'llama3:latest', name: 'Llama 3', reasoning: false, tools: true },
    ]
  );

  // 手动添加模型字段
  const [newModelId, setNewModelId] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [newModelReasoning, setNewModelReasoning] = useState(false);

  // 探测状态
  const [fetchingModels, setFetchingModels] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!isOpen) return null;

  const handleTest = async () => {
    if (!baseUrl.trim()) {
      showToast('error', '请输入 Base URL');
      return;
    }
    setTestingConnection(true);
    setTestResult(null);
    try {
      const tempConfig: AiProviderConfig = {
        id: providerId || 'custom_test',
        name: name || '自定义测试',
        type: 'custom',
        protocol,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        enabled: true,
        models,
      };
      const res = await window.neoApi.aiTestProvider(tempConfig);
      setTestResult(res);
    } catch (e: any) {
      setTestResult({ success: false, message: e.message || '测试失败' });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleFetchModels = async () => {
    if (!baseUrl.trim()) {
      showToast('error', '请先输入 Base URL');
      return;
    }
    setFetchingModels(true);
    try {
      const tempConfig: AiProviderConfig = {
        id: providerId || 'custom_test',
        name: name || '自定义探测',
        type: 'custom',
        protocol,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        enabled: true,
        models: [],
      };
      const res = await window.neoApi.aiFetchModels(tempConfig);
      if (res.success && res.models.length > 0) {
        setModels(res.models);
        showToast('success', `成功探测到 ${res.models.length} 个可用模型！`);
      } else {
        showToast('error', res.error || '未能在该接口探测到可用模型，请手动输入添加');
      }
    } catch (e: any) {
      showToast('error', `探测失败: ${e.message}`);
    } finally {
      setFetchingModels(false);
    }
  };

  const handleAddModel = () => {
    if (!newModelId.trim()) return;
    const exists = models.some((m) => m.id === newModelId.trim());
    if (exists) {
      showToast('info', '模型 ID 已存在');
      return;
    }
    setModels([
      ...models,
      {
        id: newModelId.trim(),
        name: newModelName.trim() || newModelId.trim(),
        reasoning: newModelReasoning,
        tools: !newModelReasoning,
        contextWindow: 65536,
        maxOutputTokens: 8192,
      },
    ]);
    setNewModelId('');
    setNewModelName('');
    setNewModelReasoning(false);
  };

  const handleRemoveModel = (id: string) => {
    setModels(models.filter((m) => m.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('error', '请输入供应商名称');
      return;
    }
    if (!baseUrl.trim()) {
      showToast('error', '请输入 Base URL 地址');
      return;
    }
    if (models.length === 0) {
      showToast('error', '请至少添加一个模型 ID');
      return;
    }

    const finalId = providerId.trim() || `custom_${Date.now()}`;
    const payload: AiProviderConfig = {
      id: finalId,
      name: name.trim(),
      type: 'custom',
      protocol,
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      enabled: true,
      models,
    };

    await onSave(payload);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-sky-100 text-sky-600">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">
                {initialProvider ? '编辑模型供应商' : '添加自定义模型 API (Custom Model API)'}
              </h3>
              <p className="text-[11px] text-slate-500">支持接入本地 Ollama、公司大模型中转站或任意 OpenAI 兼容网关</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 font-medium mb-1">
                供应商名称 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：公司内网私有模型 / Ollama"
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">
                API 协议 (Protocol)
              </label>
              <select
                value={protocol}
                onChange={(e) => setProtocol(e.target.value as AiProtocol)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 focus:outline-none focus:border-sky-500 bg-white"
              >
                <option value="openai-completions">OpenAI Chat Completions (/chat/completions)</option>
                <option value="openai-responses">OpenAI Responses (/responses)</option>
                <option value="anthropic-messages">Anthropic Messages (/messages)</option>
                <option value="google-gemini">Google Gemini Native API (/v1beta/models)</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-600 font-medium">
                Base URL 基础地址 <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleTest}
                disabled={testingConnection}
                className="text-sky-600 hover:text-sky-700 font-medium flex items-center space-x-1"
              >
                {testingConnection ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                <span>测试连通性</span>
              </button>
            </div>
            <input
              type="text"
              required
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="例如：http://127.0.0.1:11434/v1 或 https://api.yourgateway.com/v1"
              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 focus:outline-none focus:border-sky-500 font-mono text-[11px]"
            />
          </div>

          <div>
            <label className="block text-slate-600 font-medium mb-1">
              API Key (密钥，本地模型或免密网关可留空)
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 focus:outline-none focus:border-sky-500 font-mono text-[11px]"
            />
          </div>

          {/* 连通性测试结果条 */}
          {testResult && (
            <div
              className={`p-2.5 rounded-xl border flex items-center space-x-2 text-xs ${
                testResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span className="truncate">{testResult.message}</span>
            </div>
          )}

          {/* 模型管理 */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <label className="text-slate-700 font-semibold flex items-center space-x-1">
                <span>模型列表 (Model Catalog)</span>
                <span className="text-[10px] text-slate-400 font-normal font-mono">({models.length})</span>
              </label>
              <button
                type="button"
                onClick={handleFetchModels}
                disabled={fetchingModels}
                className="px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-medium flex items-center space-x-1"
              >
                {fetchingModels ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                <span>探测可用模型 (/models)</span>
              </button>
            </div>

            {/* 模型列表 */}
            <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 bg-slate-50/50">
              {models.length === 0 ? (
                <div className="py-6 text-center text-slate-400">暂无模型，请在下方手动添加或点击探测</div>
              ) : (
                models.map((m) => (
                  <div key={m.id} className="flex items-center justify-between px-3 py-1.5 bg-white">
                    <div className="flex items-center space-x-2 truncate">
                      <span className="font-mono text-slate-800 text-[11px] truncate">{m.id}</span>
                      {m.name !== m.id && <span className="text-slate-400 text-[10px]">({m.name})</span>}
                      {m.reasoning && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center space-x-0.5">
                          <BrainCircuit className="w-2.5 h-2.5" />
                          <span>思考推理</span>
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveModel(m.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* 手动添加单条模型输入行 */}
            <div className="flex items-center space-x-2 mt-2 pt-1">
              <input
                type="text"
                value={newModelId}
                onChange={(e) => setNewModelId(e.target.value)}
                placeholder="模型 ID (如 qwen2.5:14b)"
                className="flex-1 px-2.5 py-1 text-xs rounded-lg border border-slate-200 font-mono"
              />
              <input
                type="text"
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
                placeholder="展示别名 (选填)"
                className="w-28 px-2.5 py-1 text-xs rounded-lg border border-slate-200"
              />
              <label className="flex items-center space-x-1 text-[11px] text-slate-600 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={newModelReasoning}
                  onChange={(e) => setNewModelReasoning(e.target.checked)}
                  className="rounded text-indigo-600"
                />
                <span>R1推理</span>
              </label>
              <button
                type="button"
                onClick={handleAddModel}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium shrink-0"
              >
                添加
              </button>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-medium shadow-xs"
            >
              保存供应商配置
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
