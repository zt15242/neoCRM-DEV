import { useRestrictedFeatures } from '../../security/RestrictedFeatures';
import React, { useState, useEffect, useCallback } from 'react';
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
  BUILTIN_AI_SKILLS,
  CURRENT_APP_VERSION
} from '../../../shared/constants';
import { ModelProviderSettings } from './ModelProviderSettings';
import { McpSettings } from './McpSettings';
import { SkillSettings } from './SkillSettings';
import { AgentHarnessSettings } from './AgentHarnessSettings';
import { GeneralSettings } from './GeneralSettings';
import { FeishuWorkspaceSettings } from './FeishuWorkspaceSettings';
import { LogSettings } from './LogSettings';
import { ThemeSettingsCard } from './ThemeSettingsCard';
import { PluginManagerPage } from '../plugins/PluginManagerPage';
import { 
  Cpu, 
  Sparkles, 
  Sliders, 
  Settings as SettingsIcon,
  Plug,
  Lightbulb,
  X,
  FileText,
  MessageSquare,
  Palette,
  Search,
  RefreshCw,
  FolderOpen
} from 'lucide-react';

export type SettingsSubTab = 'models' | 'plugins' | 'skills' | 'agent' | 'general' | 'logs' | 'feishu' | 'appearance';

interface SettingsManagerProps {
  isOpen: boolean;
  initialTab?: SettingsSubTab;
  onClose: () => void;
  onCheckUpdate: () => void;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

interface NavItem {
  id: SettingsSubTab;
  name: string;
  sub: string;
  icon: any;
  badge?: string;
  category: 'personal' | 'integrations' | 'system';
}

const SETTINGS_NAV_ITEMS: NavItem[] = [
  // 1. 个人与偏好
  {
    id: 'general',
    name: '通用偏好',
    sub: '启动页面、SQL条数限制与缓存维护',
    icon: Sliders,
    category: 'personal',
  },
  {
    id: 'appearance',
    name: '界面与换肤',
    sub: 'Codex黑白主题、物理毛玻璃与地面漫反射',
    icon: Palette,
    badge: 'UI',
    category: 'personal',
  },
  // 2. AI 与扩展集成
  {
    id: 'models',
    name: '模型与供应商',
    sub: 'OpenAI、DeepSeek、Anthropic、Gemini等接口',
    icon: Cpu,
    category: 'integrations',
  },
  {
    id: 'plugins',
    name: '插件与扩展中心',
    sub: 'DSH MCP 协议工具与生态插件看护',
    icon: Plug,
    badge: 'DSH',
    category: 'integrations',
  },
  {
    id: 'skills',
    name: 'Skill 技能库',
    sub: '个人专属业务技能包与提示词资产',
    icon: Lightbulb,
    category: 'integrations',
  },
  {
    id: 'agent',
    name: '智能体引擎',
    sub: '上下文轮数、系统提示词与自动化配置',
    icon: Sparkles,
    category: 'integrations',
  },
  {
    id: 'feishu',
    name: '飞书群机器人',
    sub: '定时执行组件看板并自动推送群聊',
    icon: MessageSquare,
    badge: 'BOT',
    category: 'integrations',
  },
  // 3. 系统与诊断
  {
    id: 'logs',
    name: '软件运行日志',
    sub: '本地控制台诊断日志排查与导出',
    icon: FileText,
    category: 'system',
  },
];

export const SettingsManager: React.FC<SettingsManagerProps> = ({
  isOpen,
  initialTab = 'models',
  onClose,
  onCheckUpdate,
  showToast,
}) => {
  const { visible: privateFeaturesVisible } = useRestrictedFeatures();
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [providers, setProviders] = useState<AiProviderConfig[]>(BUILTIN_AI_PROVIDERS);
  const [settings, setSettings] = useState<AiHarnessSettings>(DEFAULT_AI_SETTINGS);
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>(BUILTIN_MCP_SERVERS);
  const [skills, setSkills] = useState<AiSkillItem[]>(BUILTIN_AI_SKILLS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [appVersion, setAppVersion] = useState<string>(CURRENT_APP_VERSION);

  useEffect(() => {
    if (window.neoApi?.getAppVersion) {
      window.neoApi.getAppVersion().then((v) => {
        if (v) setAppVersion(`v${v.replace(/^v/, '')}`);
      }).catch(() => {});
    }
  }, []);

  // 支持键盘 Esc 退出设置弹窗
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // 当外部切换打开时，对齐初始 Tab
  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveSubTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) {
      setLoading(true);
      return;
    }
    let active = true;
    setLoading(true);
    setLoadError('');
    const loadConfig = async () => {
      try {
        const cfg = await window.neoApi.aiGetConfig();
        if (!active) return;
        setProviders(cfg.providers);
        setSettings(cfg.settings);
        if (cfg.mcpServers) setMcpServers(cfg.mcpServers);
        if (cfg.skills) setSkills(cfg.skills);
      } catch (e: any) {
        if (active) setLoadError(`加载配置失败：${e.message || '请重试'}`);
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadConfig();
    return () => { active = false; };
  }, [isOpen, privateFeaturesVisible, loadAttempt]);

  const handleSaveProvider = useCallback(async (provider: AiProviderConfig) => {
    const list = await window.neoApi.aiSaveProvider(provider);
    setProviders(list);
  }, []);

  if (!isOpen) return null;

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

  // 搜索过滤导航项
  const q = searchQuery.trim().toLowerCase();
  const filteredNavItems = SETTINGS_NAV_ITEMS.filter((item) => {
    if (!q) return true;
    return item.name.toLowerCase().includes(q) || item.sub.toLowerCase().includes(q);
  });

  const personalItems = filteredNavItems.filter((i) => i.category === 'personal');
  const integrationItems = filteredNavItems.filter((i) => i.category === 'integrations');
  const systemItems = filteredNavItems.filter((i) => i.category === 'system');
  const configTab = ['general', 'models', 'plugins', 'skills', 'agent'].includes(activeSubTab);
  const configReady = !loading && !loadError;

  return (
    <div className="window-no-drag fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150 select-none">
      {/* 全屏双岛工作台容器 */}
      <div className="bg-white/95 rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden relative">
        {/* 顶部标题栏 (含快速动作与关闭键) */}
        <div className="px-5 py-3 border-b border-slate-200/70 flex items-center justify-between bg-slate-50/90 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-slate-900 text-white shadow-xs">
              <SettingsIcon className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-slate-900">设置中心 (Settings Studio)</h3>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-mono font-semibold">
                  {appVersion}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                AI 模型供应商、DSH 插件扩展中心、技能库、主题换肤与桌面运行环境
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onCheckUpdate}
              className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 flex items-center space-x-1.5 transition-colors cursor-pointer"
              title="检查最新软件更新"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>检查更新</span>
            </button>
            <button
              onClick={onClose}
              title="关闭设置 (Esc)"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 主体两栏布局: 左侧模块导航列表，右侧设置内容 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 左侧模块导航列 (带即时搜索框) */}
          <div className="w-64 bg-slate-50/70 border-r border-slate-200/80 p-3 flex flex-col justify-between shrink-0 overflow-y-auto">
            <div className="space-y-3">
              {/* 搜索框 */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索设置项..."
                  className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-sky-500 transition-colors shadow-2xs"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* 组 1: 个人与外观 */}
              {personalItems.length > 0 && (
                <div className="space-y-1">
                  <div className="px-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    个人与外观偏好
                  </div>
                  {personalItems.map((item) => {
                    const Icon = item.icon;
                    const isSelected = activeSubTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveSubTab(item.id)}
                        className={`w-full text-left px-2.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-white text-sky-700 shadow-2xs border border-slate-200/90 font-bold'
                            : 'text-slate-700 hover:bg-slate-200/60 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-sky-600' : 'text-slate-500'}`} />
                          <span className="truncate">{item.name}</span>
                        </div>
                        {item.badge && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-sky-50 text-sky-700 font-mono shrink-0">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 组 2: AI 与扩展集成 */}
              {integrationItems.length > 0 && (
                <div className="space-y-1">
                  <div className="px-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    AI 与扩展集成
                  </div>
                  {integrationItems.map((item) => {
                    const Icon = item.icon;
                    const isSelected = activeSubTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveSubTab(item.id)}
                        className={`w-full text-left px-2.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-white text-sky-700 shadow-2xs border border-slate-200/90 font-bold'
                            : 'text-slate-700 hover:bg-slate-200/60 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-sky-600' : 'text-slate-500'}`} />
                          <span className="truncate">{item.name}</span>
                        </div>
                        {item.badge && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 font-mono shrink-0">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 组 3: 系统与诊断 */}
              {systemItems.length > 0 && (
                <div className="space-y-1">
                  <div className="px-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    系统与诊断
                  </div>
                  {systemItems.map((item) => {
                    const Icon = item.icon;
                    const isSelected = activeSubTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveSubTab(item.id)}
                        className={`w-full text-left px-2.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-white text-sky-700 shadow-2xs border border-slate-200/90 font-bold'
                            : 'text-slate-700 hover:bg-slate-200/60 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-sky-600' : 'text-slate-500'}`} />
                          <span className="truncate">{item.name}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 底部信息 */}
            <div className="pt-2 border-t border-slate-200/60 px-2 text-[10px] text-slate-400 font-mono">
              NeoCRM Desktop {appVersion}
            </div>
          </div>

          {/* 右侧设置内容详情面板 */}
          <div className="flex-1 overflow-y-auto bg-white flex flex-col">
            {configTab && !configReady && (
              <div className="p-6 text-sm text-slate-600" role={loadError ? 'alert' : 'status'}>
                {loadError || '正在加载已保存的配置…'}
                {loadError && <button type="button" onClick={() => setLoadAttempt(value => value + 1)} className="ml-3 rounded border border-slate-300 px-3 py-1.5 hover:bg-slate-50">重新加载</button>}
              </div>
            )}
            {configReady && activeSubTab === 'general' && (
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

            {activeSubTab === 'appearance' && (
              <div className="p-6 max-w-4xl">
                <ThemeSettingsCard showToast={showToast} />
              </div>
            )}

            {configReady && activeSubTab === 'models' && (
              <div className="p-6 max-w-4xl">
                <ModelProviderSettings
                  providers={providers}
                  onSaveProvider={handleSaveProvider}
                  onDeleteProvider={handleDeleteProvider}
                  showToast={showToast}
                />
              </div>
            )}

            {configReady && activeSubTab === 'plugins' && (
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

            {configReady && activeSubTab === 'skills' && (
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

            {configReady && activeSubTab === 'agent' && (
              <div className="p-6 max-w-4xl">
                <AgentHarnessSettings
                  settings={settings}
                  providers={providers}
                  onSaveSettings={handleSaveSettings}
                  showToast={showToast}
                />
              </div>
            )}

            {activeSubTab === 'feishu' && (
              <div className="p-6">
                <FeishuWorkspaceSettings showToast={showToast} />
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
        <div className="px-6 py-2.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span className="text-[11px] text-slate-400 font-mono">
            编辑后点击对应的保存按钮生效；外观设置即时生效。按 Esc 关闭
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer text-xs transition-colors shadow-2xs"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
