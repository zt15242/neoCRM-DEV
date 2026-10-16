import { LogSettings } from './LogSettings';
import React, { useState, useEffect } from 'react';
import { 
  AiProviderConfig, 
  AiHarnessSettings,
  McpServerConfig,
  AiSkillItem
} from '../../../shared/types';
import { 
  BUILTIN_AI_PROVIDERS, 
  DEFAULT_AI_SETTINGS,
  BUILTIN_MCP_SERVERS,
  BUILTIN_AI_SKILLS
} from '../../../shared/constants';
import { ModelProviderSettings } from './ModelProviderSettings';
import { McpSettings } from './McpSettings';
import { SkillSettings } from './SkillSettings';
import { AgentHarnessSettings } from './AgentHarnessSettings';
import { GeneralSettings } from './GeneralSettings';
import { PluginManagerPage } from '../plugins/PluginManagerPage';
import { 
  Cpu, 
  Sparkles, 
  Sliders, 
  Settings as SettingsIcon,
  Plug,
  Lightbulb,
  X,
  FileText
} from 'lucide-react';

export type SettingsSubTab = 'models' | 'plugins' | 'skills' | 'agent' | 'general' | 'logs';

interface SettingsManagerProps {
  isOpen: boolean;
  initialTab?: SettingsSubTab;
  onClose: () => void;
  onCheckUpdate: () => void;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const SettingsManager: React.FC<SettingsManagerProps> = ({
  isOpen,
  initialTab = 'models',
  onClose,
  onCheckUpdate,
  showToast,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>(initialTab);
  const [providers, setProviders] = useState<AiProviderConfig[]>(BUILTIN_AI_PROVIDERS);
  const [settings, setSettings] = useState<AiHarnessSettings>(DEFAULT_AI_SETTINGS);
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>(BUILTIN_MCP_SERVERS);
  const [skills, setSkills] = useState<AiSkillItem[]>(BUILTIN_AI_SKILLS);
  const [loading, setLoading] = useState(true);

  // 当外部切换打开时，对齐初始 Tab
  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveSubTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      if (window.neoApi?.aiGetConfig) {
        const cfg = await window.neoApi.aiGetConfig();
        setProviders(cfg.providers);
        setSettings(cfg.settings);
        if (cfg.mcpServers) setMcpServers(cfg.mcpServers);
        if (cfg.skills) setSkills(cfg.skills);
      }
    } catch (e: any) {
      showToast('error', `加载配置失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveProvider = async (provider: AiProviderConfig) => {
    const list = await window.neoApi.aiSaveProvider(provider);
    setProviders(list);
  };

  const handleDeleteProvider = async (id: string) => {
    if (!window.confirm('确定要删除该模型供应商配置吗？')) return;
    const list = await window.neoApi.aiDeleteProvider(id);
    setProviders(list);
    showToast('info', '已删除供应商');
  };

  const handleSaveMcpServer = async (srv: McpServerConfig) => {
    const list = await window.neoApi.aiSaveMcpServer(srv);
    setMcpServers(list);
    if (srv.type !== "builtin" && srv.id !== "neocrm-paas-mcp" && srv.enabled && window.neoApi.aiSyncMcpTools) {
      window.neoApi
        .aiSyncMcpTools(srv.id)
        .then((res) => {
          if (res.success && res.server) {
            setMcpServers((prev) => prev.map((s) => (s.id === res.server!.id ? res.server! : s)));
            if (res.tools && res.tools.length > 0) {
              showToast("success", `已自动从 [${srv.name}] 探测到 ${res.tools.length} 个 MCP 工具`);
            }
          }
        })
        .catch(() => {});
    }
  };

  const handleDeleteMcpServer = async (id: string) => {
    if (!window.confirm('确定要删除该 MCP 插件扩展吗？')) return;
    const list = await window.neoApi.aiDeleteMcpServer(id);
    setMcpServers(list);
    showToast('info', '已删除插件扩展');
  };

  const handleSaveSkill = async (skill: AiSkillItem) => {
    const list = await window.neoApi.aiSaveSkill(skill);
    setSkills(list);
  };

  const handleDeleteSkill = async (id: string) => {
    if (!window.confirm('确定要删除该个人技能吗？')) return;
    const list = await window.neoApi.aiDeleteSkill(id);
    setSkills(list);
    showToast('info', '已删除个人技能');
  };

  const handleSaveSettings = async (patch: Partial<AiHarnessSettings>) => {
    const updated = await window.neoApi.aiSaveSettings(patch);
    setSettings(updated);
  };

  const handleClearAiSessions = async () => {
    await window.neoApi.aiClearSessions();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150 select-none">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden">
        {/* 顶部标题栏 */}
        <div className="px-6 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-slate-800 text-white shadow-xs">
              <SettingsIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">系统与 AI 设置 (Settings Studio)</h3>
              <p className="text-[11px] text-slate-400">配置模型 API 供应商、DeepSeek Harness 插件中心、技能库与系统偏好</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 主体两栏布局: 左侧设置导航菜单，右侧设置内容 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 左侧设置导航菜单 */}
          <div className="w-60 bg-slate-50/50 border-r border-slate-100 p-3 flex flex-col justify-between shrink-0">
            <div className="space-y-1">
              <button
                onClick={() => setActiveSubTab('models')}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2.5 transition-all cursor-pointer ${
                  activeSubTab === 'models'
                    ? 'bg-white text-sky-600 shadow-2xs border border-slate-200/80 font-bold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
                }`}
              >
                <Cpu className="w-4 h-4 shrink-0" />
                <span>模型与供应商 (Models)</span>
              </button>

              <button
                onClick={() => setActiveSubTab('plugins')}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                  activeSubTab === 'plugins'
                    ? 'bg-white text-purple-700 shadow-2xs border border-purple-200/80 font-bold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
                }`}
              >
                <div className="flex items-center space-x-2.5 truncate">
                  <Plug className="w-4 h-4 shrink-0 text-purple-600" />
                  <span className="truncate">插件与扩展中心</span>
                </div>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 font-mono font-semibold border border-purple-200 shrink-0">
                  DSH
                </span>
              </button>

              <button
                onClick={() => setActiveSubTab('skills')}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2.5 transition-all cursor-pointer ${
                  activeSubTab === 'skills'
                    ? 'bg-white text-sky-600 shadow-2xs border border-slate-200/80 font-bold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
                }`}
              >
                <Lightbulb className="w-4 h-4 shrink-0" />
                <span>Skill 技能库 (Skills)</span>
              </button>

              <button
                onClick={() => setActiveSubTab('agent')}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2.5 transition-all cursor-pointer ${
                  activeSubTab === 'agent'
                    ? 'bg-white text-sky-600 shadow-2xs border border-slate-200/80 font-bold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
                }`}
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>智能体与对话引擎</span>
              </button>

              <button
                onClick={() => setActiveSubTab('general')}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2.5 transition-all cursor-pointer ${
                  activeSubTab === 'general'
                    ? 'bg-white text-sky-600 shadow-2xs border border-slate-200/80 font-bold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
                }`}
              >
                <Sliders className="w-4 h-4 shrink-0" />
                <span>通用与工作台偏好</span>
              </button>
            </div>

            {/* 底部信息 */}
            <div className="pt-2 border-t border-slate-200/60 px-2 text-[10px] text-slate-400 font-mono">
              NeoCRM Desktop v1.4.0
            </div>
          </div>

          {/* 右侧设置内容详情面板 */}
          <div className="flex-1 overflow-y-auto bg-white flex flex-col">
            {activeSubTab === 'models' && (
              <div className="p-6 max-w-4xl">
                <ModelProviderSettings
                  providers={providers}
                  onSaveProvider={handleSaveProvider}
                  onDeleteProvider={handleDeleteProvider}
                  showToast={showToast}
                />
              </div>
            )}

            {activeSubTab === 'plugins' && (
              <PluginManagerPage
                mcpServers={mcpServers}
                skills={skills}
                onToggleMcpServer={async (id) => {
                  const target = mcpServers.find((m) => m.id === id);
                  if (!target) return;
                  const updated = { ...target, enabled: !target.enabled };
                  await handleSaveMcpServer(updated);
                }}
                onSaveMcpServer={handleSaveMcpServer}
                onDeleteMcpServer={handleDeleteMcpServer}
                hideHeader={true}
                showToast={showToast}
              />
            )}

            {activeSubTab === 'skills' && (
              <div className="p-6 max-w-4xl">
                <SkillSettings
                  skills={skills}
                  onSaveSkill={handleSaveSkill}
                  onDeleteSkill={handleDeleteSkill}
                  onSkillsChange={setSkills}
                  showToast={showToast}
                />
              </div>
            )}

            {activeSubTab === 'agent' && (
              <div className="p-6 max-w-4xl">
                <AgentHarnessSettings
                  settings={settings}
                  providers={providers}
                  onSaveSettings={handleSaveSettings}
                  showToast={showToast}
                />
              </div>
            )}

            {activeSubTab === 'general' && (
              <div className="p-6 max-w-4xl">
                <GeneralSettings
                  settings={settings}
                  onSaveSettings={handleSaveSettings}
                  onClearAiSessions={handleClearAiSessions}
                  onCheckUpdate={onCheckUpdate}
                  showToast={showToast}
                />
              </div>
            )}

            {activeSubTab === 'logs' && (
              <div className="p-6 max-w-5xl">
                <LogSettings showToast={showToast} />
              </div>
            )}
          </div>
        </div>

        {/* 底部关闭栏 */}
        <div className="px-6 py-2.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span className="text-[11px] text-slate-400 font-mono">
            配置变更将自动实时保存至桌面存储
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer text-xs transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
