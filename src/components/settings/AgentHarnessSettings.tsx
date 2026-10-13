import React, { useState } from 'react';
import { AiHarnessSettings, AiProviderConfig } from '../../../shared/types';
import { 
  Sparkles, 
  Wrench, 
  Database, 
  ShieldCheck, 
  Sliders, 
  MessageSquare,
  Check
} from 'lucide-react';

interface AgentHarnessSettingsProps {
  settings: AiHarnessSettings;
  providers: AiProviderConfig[];
  onSaveSettings: (newSettings: Partial<AiHarnessSettings>) => Promise<void>;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const AgentHarnessSettings: React.FC<AgentHarnessSettingsProps> = ({
  settings,
  providers,
  onSaveSettings,
  showToast,
}) => {
  const [form, setForm] = useState<AiHarnessSettings>(settings);
  const [saving, setSaving] = useState(false);

  const configuredProviders = providers.filter(
    (p) =>
      Boolean(
        (p.apiKey && p.apiKey.trim()) ||
          p.id === "ollama" ||
          p.baseUrl?.includes("localhost") ||
          p.baseUrl?.includes("127.0.0.1")
      ) &&
      Array.isArray(p.models) &&
      p.models.length > 0
  );
  const displayProviders = configuredProviders.length > 0 ? configuredProviders : providers;
  const selectedProvider =
    displayProviders.find((p) => p.id === form.defaultProviderId) || displayProviders[0];

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveSettings(form);
      showToast('success', '智能体与对话引擎偏好已保存');
    } catch (e: any) {
      showToast('error', `保存失败: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 text-xs">
      {/* 标题说明 */}
      <div className="pb-3 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-800">智能体与对话引擎 (Agent Harness & Loop)</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            配置新会话默认模型、销售易本地工具权限、模型生成参数与全局系统提示词。
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-xs flex items-center space-x-1.5"
        >
          <Check className="w-3.5 h-3.5" />
          <span>{saving ? '保存中...' : '保存修改'}</span>
        </button>
      </div>

      {/* 1. 默认模型路由 */}
      <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-4">
        <div className="flex items-center space-x-2 text-slate-800 font-bold text-sm">
          <Sparkles className="w-4 h-4 text-sky-600" />
          <span>默认模型路由 (Default Model Route)</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-slate-600 font-medium mb-1">
              新建对话默认供应商
            </label>
            <select
              value={form.defaultProviderId}
              onChange={(e) => {
                const pid = e.target.value;
                const p = providers.find((item) => item.id === pid);
                setForm({
                  ...form,
                  defaultProviderId: pid,
                  defaultModelId: p?.models?.[0]?.id || '',
                });
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:border-sky-500"
            >
              {displayProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.apiKey ? '(已配置Key)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-600 font-medium mb-1">
              新建对话默认模型
            </label>
            <select
              value={form.defaultModelId}
              onChange={(e) => setForm({ ...form, defaultModelId: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:border-sky-500"
            >
              {selectedProvider?.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.id})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 2. 销售易本地工具挂载开关 */}
      <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3">
        <div className="flex items-center space-x-2 text-slate-800 font-bold text-sm">
          <Wrench className="w-4 h-4 text-emerald-600" />
          <span>销售易本地工具与环境感知 (NeoCRM Harness Tools)</span>
        </div>

        <div className="divide-y divide-slate-100">
          <label className="py-3 flex items-center justify-between cursor-pointer">
            <div>
              <div className="font-semibold text-slate-800">允许 AI 自动调用实体与字段字典工具</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                开启后，AI 可主动调用 list_entities 与 get_entity_fields 查阅当前租户真实元数据
              </div>
            </div>
            <input
              type="checkbox"
              checked={form.enableCrmTools}
              onChange={(e) => setForm({ ...form, enableCrmTools: e.target.checked })}
              className="w-4 h-4 rounded text-sky-600"
            />
          </label>

          <label className="py-3 flex items-center justify-between cursor-pointer">
            <div>
              <div className="font-semibold text-slate-800">允许 AI 在对话中辅助执行只读 SQL 查询</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                开启后，AI 可调用 execute_sql_query 执行安全的 SELECT 语句进行数据抽样与验证
              </div>
            </div>
            <input
              type="checkbox"
              checked={form.enableSqlTool}
              onChange={(e) => setForm({ ...form, enableSqlTool: e.target.checked })}
              className="w-4 h-4 rounded text-sky-600"
            />
          </label>

          <label className="py-3 flex items-center justify-between cursor-pointer">
            <div>
              <div className="font-semibold text-slate-800">自动注入当前登录租户事实上下文</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                将当前连接的租户名称、环境名称及实例域名注入系统提示词，让回答切合当前环境
              </div>
            </div>
            <input
              type="checkbox"
              checked={form.injectTenantContext}
              onChange={(e) => setForm({ ...form, injectTenantContext: e.target.checked })}
              className="w-4 h-4 rounded text-sky-600"
            />
          </label>
        </div>
      </div>

      {/* 3. 模型采样与上下文参数 */}
      <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-4">
        <div className="flex items-center space-x-2 text-slate-800 font-bold text-sm">
          <Sliders className="w-4 h-4 text-indigo-600" />
          <span>采样参数与上下文控制</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-600 font-medium">温度 (Temperature)</label>
              <span className="font-mono text-sky-600 font-semibold">{form.temperature}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.1"
              value={form.temperature}
              onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) })}
              className="w-full accent-sky-600"
            />
            <p className="text-[10px] text-slate-400 mt-1">代码与 SQL 建议 0.1~0.3，通用对话建议 0.7</p>
          </div>

          <div>
            <label className="block text-slate-600 font-medium mb-1">
              单次最大输出 Tokens
            </label>
            <input
              type="number"
              min={512}
              max={32768}
              step={512}
              value={form.maxTokens}
              onChange={(e) => setForm({ ...form, maxTokens: Number(e.target.value) || 4096 })}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-mono"
            />
          </div>

          <div>
            <label className="block text-slate-600 font-medium mb-1">
              携带历史消息轮数上限
            </label>
            <input
              type="number"
              min={2}
              max={100}
              value={form.contextLimit}
              onChange={(e) => setForm({ ...form, contextLimit: Number(e.target.value) || 20 })}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-mono"
            />
          </div>
        </div>
      </div>

      {/* 4. 自定义追加系统提示词 */}
      <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2">
        <div className="flex items-center space-x-2 text-slate-800 font-bold text-sm">
          <MessageSquare className="w-4 h-4 text-sky-600" />
          <span>全局自定义追加提示词 (Custom System Prompt)</span>
        </div>
        <p className="text-[11px] text-slate-400">
          此内容将自动附加在所有对话的系统指令末尾（例如可填写公司内部命名规范、业务术语表或代码风格要求）。
        </p>
        <textarea
          rows={4}
          value={form.customSystemPrompt}
          onChange={(e) => setForm({ ...form, customSystemPrompt: e.target.value })}
          placeholder="例如：编写自定义字段 API Key 时统一使用 customItem__c 格式；生成的 SQL 默认包含 createdAt 倒序..."
          className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-sky-500 text-xs leading-relaxed"
        />
      </div>
    </div>
  );
};
