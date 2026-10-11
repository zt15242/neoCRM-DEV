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
import { 
  Cpu, 
  Sparkles, 
  Sliders, 
  Settings as SettingsIcon,
  ArrowLeft,
  Plug,
  Lightbulb
} from 'lucide-react';

export type SettingsSubTab = 'models' | 'mcp' | 'skills' | 'agent' | 'general';

interface SettingsManagerProps {
  onBackToAi?: () => void;
  onCheckUpdate: () => void;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const SettingsManager: React.FC<SettingsManagerProps> = ({
  onBackToAi,
  onCheckUpdate,
  showToast,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>('models');
  const [providers, setProviders] = useState<AiProviderConfig[]>(BUILTIN_AI_PROVIDERS);
  const [settings, setSettings] = useState<AiHarnessSettings>(DEFAULT_AI_SETTINGS);
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>(BUILTIN_MCP_SERVERS);
  const [skills, setSkills] = useState<AiSkillItem[]>(BUILTIN_AI_SKILLS);
  const [loading, setLoading] = useState(true);

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
    loadConfig();
  }, []);

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
  };

  const handleDeleteMcpServer = async (id: string) => {
    if (!window.confirm('确定要删除该 MCP 服务吗？')) return;
    const list = await window.neoApi.aiDeleteMcpServer(id);
    setMcpServers(list);
    showToast('info', '已删除 MCP 服务');
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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex h-[calc(100vh-88px)] min-h-[600px]">
      {/* 左侧设置导航菜单 */}
      <div className="w-64 bg-slate-50/50 border-r border-slate-200 p-4 flex flex-col justify-between shrink-0 select-none">
        <div className="space-y-4">
          <div className="flex items-center space-x-2.5 px-2">
            <div className="p-2 rounded-xl bg-sky-600 text-white shadow-xs">
              <SettingsIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">系统与 AI 设置</h2>
              <p className="text-[11px] text-slate-400">Settings Studio</p>
            </div>
          </div>

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
              onClick={() => setActiveSubTab('mcp')}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2.5 transition-all cursor-pointer ${
                activeSubTab === 'mcp'
                  ? 'bg-white text-sky-600 shadow-2xs border border-slate-200/80 font-bold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
              }`}
            >
              <Plug className="w-4 h-4 shrink-0" />
              <span>MCP 扩展服务 (MCP)</span>
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
        </div>

        {onBackToAi && (
          <button
            onClick={onBackToAi}
            className="w-full py-2 px-3 rounded-xl border border-slate-200 hover:bg-white text-slate-600 text-xs font-medium flex items-center justify-center space-x-1.5 transition-colors shadow-2xs cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>返回 AI 对话工作台</span>
          </button>
        )}
      </div>

      {/* 右侧设置内容详情面板 */}
      <div className="flex-1 overflow-y-auto p-6 max-w-4xl">
        {activeSubTab === 'models' && (
          <ModelProviderSettings
            providers={providers}
            onSaveProvider={handleSaveProvider}
            onDeleteProvider={handleDeleteProvider}
            showToast={showToast}
          />
        )}

        {activeSubTab === 'mcp' && (
          <McpSettings
            mcpServers={mcpServers}
            onSaveMcpServer={handleSaveMcpServer}
            onDeleteMcpServer={handleDeleteMcpServer}
            showToast={showToast}
          />
        )}

        {activeSubTab === 'skills' && (
          <SkillSettings
            skills={skills}
            onSaveSkill={handleSaveSkill}
            onDeleteSkill={handleDeleteSkill}
            onSkillsChange={setSkills}
            showToast={showToast}
          />
        )}

        {activeSubTab === 'agent' && (
          <AgentHarnessSettings
            settings={settings}
            providers={providers}
            onSaveSettings={handleSaveSettings}
            showToast={showToast}
          />
        )}

        {activeSubTab === 'general' && (
          <GeneralSettings
            settings={settings}
            onSaveSettings={handleSaveSettings}
            onClearAiSessions={handleClearAiSessions}
            onCheckUpdate={onCheckUpdate}
            showToast={showToast}
          />
        )}
      </div>
    </div>
  );
};
