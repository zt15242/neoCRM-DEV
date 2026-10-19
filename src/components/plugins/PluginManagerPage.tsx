import React, { useState } from 'react';
import { 
  Puzzle, 
  Search, 
  Plus, 
  ExternalLink, 
  Check, 
  Trash2, 
  RefreshCw, 
  Terminal, 
  FolderOpen, 
  Download, 
  Globe, 
  FileCode, 
  Layers, 
  Sparkles, 
  Cpu, 
  ChevronRight, 
  ChevronDown,
  Package,
  ShieldCheck,
  Zap,
  Info,
  CheckCircle2,
  SlidersHorizontal,
  X
} from 'lucide-react';
import { McpServerConfig } from '../../../shared/types';
import { DSH_SESSION_PLUGINS, DSH_GLOBAL_PLUGINS, DshPluginItem } from '../../data/dshPluginsRegistry';

import { AiSkillItem } from '../../../shared/types';

interface PluginManagerPageProps {
  customMcpList?: McpServerConfig[];
  mcpServers?: McpServerConfig[];
  skills?: AiSkillItem[];
  onToggleMcpServer: (id: string) => Promise<void>;
  onSaveMcpServer: (server: McpServerConfig) => Promise<void>;
  onDeleteMcpServer: (id: string) => Promise<void>;
  hideHeader?: boolean;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const PluginManagerPage: React.FC<PluginManagerPageProps> = ({
  customMcpList = [],
  mcpServers = [],
  skills = [],
  onToggleMcpServer,
  onSaveMcpServer,
  onDeleteMcpServer,
  hideHeader = false,
  showToast,
}) => {
  const effectiveCustomMcp: McpServerConfig[] = (customMcpList && customMcpList.length > 0 ? customMcpList : mcpServers).filter(m => m.type !== 'builtin' && m.id !== 'neocrm-paas-mcp');
  const [searchQuery, setSearchQuery] = useState('');
  const [presetMode, setPresetMode] = useState<'standard' | 'expert' | 'minimal'>('standard');

  // 默认展开会话插件与全局插件
  const [sessionExpanded, setSessionExpanded] = useState(true);
  const [globalExpanded, setGlobalExpanded] = useState(true);
  const [customExpanded, setCustomExpanded] = useState(true);

  // 安装弹窗状态
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [installType, setInstallType] = useState<'npm' | 'mcp' | 'git'>('mcp');
  const [installName, setInstallName] = useState('');
  const [installUrl, setInstallUrl] = useState('');
  const [installAuthType, setInstallAuthType] = useState<'none' | 'bearer' | 'apiKey'>('none');
  const [installToken, setInstallToken] = useState('');
  const [installApiKeyHeader, setInstallApiKeyHeader] = useState('x-api-key');
  const [isInstalling, setIsInstalling] = useState(false);

  // 过滤插件
  const filterPlugin = (p: DshPluginItem) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
  };

  const filteredSessionPlugins = DSH_SESSION_PLUGINS.filter(filterPlugin);
  const filteredGlobalPlugins = DSH_GLOBAL_PLUGINS.filter(filterPlugin);

  // 打开配置文件
  const handleOpenConfigFile = async () => {
    try {
      if (typeof window !== 'undefined' && window.neoApi) {
        showToast('info', '正在打开配置文件所在目录...');
        await window.neoApi.loggerOpenLogDir?.();
      } else {
        showToast('info', '配置保存在应用数据目录 neocrm_ai_config.json');
      }
    } catch {
      showToast('info', '配置保存在应用数据目录');
    }
  };

  // 导出诊断信息
  const handleExportDiagnostics = async () => {
    try {
      if (window.neoApi?.loggerExportLog) {
        const res = await window.neoApi.loggerExportLog();
        if (res.success) {
          showToast('success', res.message || '诊断信息与运行日志已成功导出');
        } else {
          showToast('info', res.message || '已取消导出');
        }
      }
    } catch (e: any) {
      showToast('error', `导出诊断信息异常: ${e.message}`);
    }
  };

  // 新增外部自定义 MCP / DSH 插件 (支持安全鉴权)
  const handleCreateCustomMcp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!installName.trim()) return;

    setIsInstalling(true);
    try {
      const headers: Record<string, string> = {};
      if (installAuthType === 'bearer' && installToken.trim()) {
        const clean = installToken.trim().replace(/^Bearer\s+/i, '');
        headers['Authorization'] = `Bearer ${clean}`;
      } else if (installAuthType === 'apiKey' && installToken.trim()) {
        headers[installApiKeyHeader.trim() || 'x-api-key'] = installToken.trim();
      }

      const newMcp: McpServerConfig = {
        id: `mcp_${Date.now()}`,
        name: installName.trim(),
        description: '用户自定义添加的 MCP 插件服务',
        type: 'sse',
        url: installUrl.trim() || 'http://localhost:3000/sse',
        authType: installAuthType === 'bearer' ? 'bearer' : installAuthType === 'apiKey' ? 'custom' : 'none',
        bearerToken: installAuthType === 'bearer' ? installToken.trim() : undefined,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        enabled: true,
        tools: [],
      };
      await onSaveMcpServer(newMcp);
      showToast('success', `插件 [${newMcp.name}] 添加成功！`);
      setIsInstallModalOpen(false);
      setInstallName('');
      setInstallUrl('');
      setInstallAuthType('none');
      setInstallToken('');
    } catch (err: any) {
      showToast('error', `添加插件失败: ${err.message}`);
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full w-full bg-white select-text overflow-hidden">
      {/* 1. 顶部 Header (1:1 对齐 DeepSeek Harness 官方设计) */}
      <div className="px-6 py-4 border-b border-slate-200/80 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight">内置插件</h2>
          <p className="text-xs text-slate-500 mt-0.5">查看内置部署的插件列表</p>
        </div>

        {/* 顶部操作按键组 (对齐 DSH Desktop 官方按钮) */}
        <div className="flex items-center space-x-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={handleOpenConfigFile}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors cursor-pointer shadow-2xs"
            title="查看或打开系统配置文件目录"
          >
            打开配置文件
          </button>

          <button
            type="button"
            onClick={handleExportDiagnostics}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors cursor-pointer shadow-2xs"
            title="导出当前诊断报告与运行日志"
          >
            导出诊断信息
          </button>

          <button
            type="button"
            onClick={() => showToast('info', '当前工作台已集成内置交互式终端')}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors cursor-pointer shadow-2xs"
            title="打开当前项目工作区终端"
          >
            打开 DSH 终端
          </button>

          <button
            type="button"
            onClick={() => setIsInstallModalOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center space-x-1 shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>添加插件</span>
          </button>
        </div>
      </div>

      {/* 2. 搜索插件框 */}
      <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50 shrink-0">
        <div className="relative max-w-2xl">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索插件..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-500 shadow-2xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 3. 插件分类折叠展示区 (1:1 对齐官方图 1 的折叠组) */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {/* ================= 分组 1: 会话插件 (29个) ================= */}
        <div className="border border-slate-200/90 rounded-2xl bg-white overflow-hidden shadow-2xs">
          {/* 折叠标题行 */}
          <div
            onClick={() => setSessionExpanded(!sessionExpanded)}
            className="p-4 bg-slate-50/70 hover:bg-slate-100/70 transition-colors flex items-center justify-between cursor-pointer select-none border-b border-slate-100"
          >
            <div className="flex items-center space-x-3 min-w-0">
              <ChevronRight
                className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                  sessionExpanded ? 'rotate-90' : ''
                }`}
              />
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-bold text-slate-900">会话插件</h3>
                  <span className="text-[10px] px-2 py-0.2 rounded-full bg-purple-50 text-purple-700 border border-purple-200 font-mono font-medium">
                    {filteredSessionPlugins.length} 个
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">由 Agent 预设按会话组成 · {DSH_SESSION_PLUGINS.length} 个</p>
              </div>
            </div>

            {/* 右侧模式下拉 (对齐图 1: 标准模式 默认) */}
            <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
              <select
                value={presetMode}
                onChange={(e) => setPresetMode(e.target.value as any)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-700 font-medium focus:outline-none focus:border-purple-400 shadow-2xs cursor-pointer"
              >
                <option value="standard">标准模式 (默认)</option>
                <option value="expert">专家全功能模式</option>
                <option value="minimal">极简纯净模式</option>
              </select>
            </div>
          </div>

          {/* 会话插件展开内容 */}
          {sessionExpanded && (
            <div className="p-4 bg-white grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredSessionPlugins.map((plugin) => (
                <div
                  key={plugin.id}
                  className="p-3.5 rounded-xl border border-slate-200/90 bg-slate-50/40 hover:bg-white hover:border-purple-300 hover:shadow-xs transition-all flex flex-col justify-between space-y-2"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-purple-900 truncate" title={plugin.name}>
                        {plugin.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">{plugin.version}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2" title={plugin.description}>
                      {plugin.description || 'DeepSeek Harness 智能体会话级核心驱动'}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                    <span className="text-slate-400 font-mono">会话插件</span>
                    <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>运行中</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ================= 分组 2: 全局插件 (194个) ================= */}
        <div className="border border-slate-200/90 rounded-2xl bg-white overflow-hidden shadow-2xs">
          {/* 折叠标题行 */}
          <div
            onClick={() => setGlobalExpanded(!globalExpanded)}
            className="p-4 bg-slate-50/70 hover:bg-slate-100/70 transition-colors flex items-center justify-between cursor-pointer select-none border-b border-slate-100"
          >
            <div className="flex items-center space-x-3 min-w-0">
              <ChevronRight
                className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                  globalExpanded ? 'rotate-90' : ''
                }`}
              />
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-bold text-slate-900">全局插件</h3>
                  <span className="text-[10px] px-2 py-0.2 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-mono font-medium">
                    {filteredGlobalPlugins.length} 个
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">系统与所有会话共用 · {DSH_GLOBAL_PLUGINS.length} 个</p>
              </div>
            </div>

            <div className="text-xs text-slate-400 font-medium">
              <span>系统级常驻服务</span>
            </div>
          </div>

          {/* 全局插件展开内容 */}
          {globalExpanded && (
            <div className="p-4 bg-white grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredGlobalPlugins.map((plugin) => (
                <div
                  key={plugin.id}
                  className="p-3.5 rounded-xl border border-slate-200/90 bg-slate-50/40 hover:bg-white hover:border-sky-300 hover:shadow-xs transition-all flex flex-col justify-between space-y-2"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-slate-800 truncate" title={plugin.name}>
                        {plugin.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">{plugin.version}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2" title={plugin.description}>
                      {plugin.description || 'DeepSeek Harness 系统级微内核基础组件'}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                    <span className="text-slate-400 font-mono">全局共用</span>
                    <span className="px-1.5 py-0.2 rounded bg-sky-50 text-sky-700 border border-sky-200 font-medium flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                      <span>已就绪</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ================= 分组 3: 外部扩展与自定义 MCP 插件 (如有) ================= */}
        {effectiveCustomMcp.length > 0 && (
          <div className="border border-slate-200/90 rounded-2xl bg-white overflow-hidden shadow-2xs">
            <div
              onClick={() => setCustomExpanded(!customExpanded)}
              className="p-4 bg-slate-50/70 hover:bg-slate-100/70 transition-colors flex items-center justify-between cursor-pointer select-none border-b border-slate-100"
            >
              <div className="flex items-center space-x-3 min-w-0">
                <ChevronRight
                  className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                    customExpanded ? 'rotate-90' : ''
                  }`}
                />
                <div className="min-w-0">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-bold text-slate-900">外部 MCP 扩展插件</h3>
                    <span className="text-[10px] px-2 py-0.2 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono font-medium">
                      {effectiveCustomMcp.length} 个
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">用户自定义挂载的第三方外部工具服务</p>
                </div>
              </div>
            </div>

            {customExpanded && (
              <div className="p-4 bg-white grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {effectiveCustomMcp.map((srv: McpServerConfig) => (
                  <div
                    key={srv.id}
                    className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 transition-all shadow-2xs space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                          MCP
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">{srv.name}</h4>
                          <span className="text-[10px] font-mono text-slate-400">{srv.type.toUpperCase()}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => onDeleteMcpServer(srv.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <p className="text-xs text-slate-500">{srv.description || srv.url || '外部工具服务'}</p>

                    <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                      <span className="text-[11px] text-slate-400">工具数量: {srv.tools?.length || 0}</span>
                      <button
                        onClick={() => onToggleMcpServer(srv.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                          srv.enabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {srv.enabled ? '运行中' : '已停用'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. 添加新插件 Modal */}
      {isInstallModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden space-y-4 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Plus className="w-5 h-5 text-purple-600" />
                <h3 className="text-base font-bold text-slate-900">添加外部 MCP 插件</h3>
              </div>
              <button
                onClick={() => setIsInstallModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomMcp} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">插件服务名称 *</label>
                <input
                  type="text"
                  required
                  value={installName}
                  onChange={(e) => setInstallName(e.target.value)}
                  placeholder="如: Github MCP / Sqlite 工具"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-purple-500 focus:bg-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">MCP 端点地址 (SSE URL) *</label>
                <input
                  type="text"
                  required
                  value={installUrl}
                  onChange={(e) => setInstallUrl(e.target.value)}
                  placeholder="http://localhost:3000/sse 或 https://..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-purple-500 focus:bg-white"
                />
              </div>

              {/* 鉴权方式配置 */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2.5">
                <label className="text-xs font-bold text-slate-700 block">身份认证与鉴权方式</label>
                <div className="grid grid-cols-3 gap-1.5 bg-white p-1 rounded-xl border border-slate-200 text-xs">
                  {[
                    { id: 'none', label: '无认证' },
                    { id: 'bearer', label: 'Bearer Token' },
                    { id: 'apiKey', label: 'API Key Header' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setInstallAuthType(tab.id as any)}
                      className={`py-1.5 px-2 rounded-lg font-medium transition-all cursor-pointer ${
                        installAuthType === tab.id
                          ? 'bg-purple-600 text-white shadow-2xs font-semibold'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {installAuthType === 'bearer' && (
                  <div className="space-y-1 pt-1">
                    <label className="text-[11px] text-slate-600 font-medium block">
                      Bearer Token (自动注入 Authorization: Bearer ...)
                    </label>
                    <input
                      type="password"
                      value={installToken}
                      onChange={(e) => setInstallToken(e.target.value)}
                      placeholder="粘贴访问密钥/令牌 (如 ghp_xxx / sk-xxx)"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                )}

                {installAuthType === 'apiKey' && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="text-[11px] text-slate-600 font-medium block mb-1">Header 字段名</label>
                      <input
                        type="text"
                        value={installApiKeyHeader}
                        onChange={(e) => setInstallApiKeyHeader(e.target.value)}
                        placeholder="x-api-key"
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-600 font-medium block mb-1">API Key 密钥值</label>
                      <input
                        type="password"
                        value={installToken}
                        onChange={(e) => setInstallToken(e.target.value)}
                        placeholder="Key 密钥值"
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsInstallModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isInstalling}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-xs"
                >
                  {isInstalling ? '正在连接...' : '确认添加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
