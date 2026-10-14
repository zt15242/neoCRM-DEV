import React, { useState } from 'react';
import {
  Plug,
  Plus,
  RefreshCw,
  Search,
  ExternalLink,
  Trash2,
  Settings,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  ArrowLeft,
  Package,
  Layers,
  Terminal,
  Globe,
  FileCode,
  FileText,
  Sliders,
  Sparkles,
  X,
  Check,
  ChevronRight,
  Download
} from 'lucide-react';
import { McpServerConfig, AiSkillItem } from '../../../shared/types';

interface PluginManagerPageProps {
  mcpServers: McpServerConfig[];
  skills: AiSkillItem[];
  onToggleMcpServer: (id: string) => void;
  onSaveMcpServer: (server: McpServerConfig) => void;
  onDeleteMcpServer: (id: string) => void;
  onBackToAi: () => void;
  showToast?: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const PluginManagerPage: React.FC<PluginManagerPageProps> = ({
  mcpServers,
  skills,
  onToggleMcpServer,
  onSaveMcpServer,
  onDeleteMcpServer,
  onBackToAi,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'installed' | 'market' | 'skills'>('installed');
  const [searchQuery, setSearchQuery] = useState('');
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);

  // 安装弹窗状态
  const [installType, setInstallType] = useState<'npm' | 'git' | 'local'>('npm');
  const [installInput, setInstallInput] = useState('');
  const [installName, setInstallName] = useState('');
  const [isInstalling, setIsInstalling] = useState(false);

  // 官方内置插件清单 (对齐 DeepSeek Harness / Codex 原生能力)
  const builtinPlugins = [
    {
      id: 'dsh-tool-web',
      name: 'Web 联网搜索与抓取插件 (@deepseek-ai/dsh-tool-web)',
      version: 'v0.1.0',
      description: '为 AI 提供原生互联网实时多词条检索 (web_search) 与网页清洗抓取 (web_fetch) 能力。',
      tags: ['官方内置', '网络搜索', '实时数据'],
      icon: Globe,
      color: 'text-sky-600 bg-sky-50 border-sky-200',
      tools: ['web_search', 'web_fetch'],
      status: 'active',
    },
    {
      id: 'dsh-tool-bash',
      name: '工作区终端命令行执行驱动 (@deepseek-ai/dsh-tool-bash)',
      version: 'v0.1.0',
      description: '支持 AI 在当前项目物理工作区安全执行 Bash 脚本与系统命令 (bash)，实时捕获标准输出与错误流。',
      tags: ['官方内置', '命令行', '终端'],
      icon: Terminal,
      color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      tools: ['bash'],
      status: 'active',
    },
    {
      id: 'dsh-tool-fs',
      name: '文件系统原子读写驱动 (@deepseek-ai/dsh-tool-fs)',
      version: 'v0.1.0',
      description: '提供精准行号文件读取 (read)、完全写入覆写 (write)、字面量替换 (edit) 以及图片检查 (read_image)。',
      tags: ['官方内置', '文件系统', '源码'],
      icon: FileText,
      color: 'text-blue-600 bg-blue-50 border-blue-200',
      tools: ['read', 'write', 'edit', 'read_image'],
      status: 'active',
    },
    {
      id: 'dsh-tool-str-replace-editor',
      name: '行级代码高精编辑器 (@deepseek-ai/dsh-tool-str-replace-editor)',
      version: 'v0.1.0',
      description: 'DeepSeek Harness 核心编辑器：提供 view、create、str_replace、insert 4 大模式的高保真代码编辑。',
      tags: ['官方内置', '编辑器', '代码修改'],
      icon: FileCode,
      color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
      tools: ['str_replace_editor'],
      status: 'active',
    },
    {
      id: 'dsh-tool-fs-search',
      name: '文件检索与全文搜索扩展 (@deepseek-ai/dsh-tool-fs-search)',
      version: 'v0.1.0',
      description: '集成 Glob 路径模式匹配 (glob) 与基于正则表达式的高速全文内容检索 (grep)。',
      tags: ['官方内置', '搜索', 'Ripgrep'],
      icon: Search,
      color: 'text-cyan-600 bg-cyan-50 border-cyan-200',
      tools: ['glob', 'grep'],
      status: 'active',
    },
    {
      id: 'dsh-tool-todo',
      name: '任务待办清单状态跟踪器 (@deepseek-ai/dsh-tool-todo)',
      version: 'v0.1.0',
      description: '在复杂工程开发中持久化维护任务清单 (todo_write)，实时对账待办、进行中与已完成状态。',
      tags: ['官方内置', '任务管理', '对账'],
      icon: Layers,
      color: 'text-amber-600 bg-amber-50 border-amber-200',
      tools: ['todo_write'],
      status: 'active',
    },
    {
      id: 'dsh-tool-goal',
      name: '目标规划与预算调度器 (@deepseek-ai/dsh-tool-goal)',
      version: 'v0.1.0',
      description: '为复杂多轮任务设定具体目标 (create_goal) 与 Token 预算指标，控制完成状态 (update_goal)。',
      tags: ['官方内置', '目标导向', '预算'],
      icon: Sparkles,
      color: 'text-purple-600 bg-purple-50 border-purple-200',
      tools: ['get_goal', 'create_goal', 'update_goal'],
      status: 'active',
    },
    {
      id: 'neocrm-paas-mcp',
      name: '销售易 PaaS 元数据与数据中心直连服务 (内置)',
      version: 'v1.4.0',
      description: '打通当前连接租户的元数据对象探测、字段类型分析、只读 SQL 查询以及流程资产管理中心。',
      tags: ['销售易云端', '元数据', 'XOQL'],
      icon: Layers,
      color: 'text-teal-600 bg-teal-50 border-teal-200',
      tools: ['get_tenant_info', 'list_entities', 'get_entity_fields', 'execute_sql_query', 'list_flows', 'get_flow_detail'],
      status: 'active',
    },
  ];

  // 插件市场精选插件目录
  const marketPlugins = [
    {
      id: 'dsh-plugin-git',
      name: 'Git 智能代码版本管理插件',
      spec: '@deepseek-ai/dsh-plugin-git',
      author: 'DeepSeek Official',
      description: '自动分析代码变更差异 (diff)、智能生成符合语义标准的 Commit 描述、管理分支与提交历史。',
      tags: ['版本控制', 'Git', '开发效率'],
      installed: false,
    },
    {
      id: 'dsh-plugin-office',
      name: 'Office 文档与报表多维解析插件',
      spec: '@deepseek-ai/dsh-desktop-office',
      author: 'DataElement / DSH',
      description: '深度支持 Word (.docx)、Excel (.xlsx)、PDF 与 PPTX 文档结构解析、数据提取与排版生成。',
      tags: ['文档处理', 'Office', '报表'],
      installed: false,
    },
    {
      id: 'dsh-plugin-database',
      name: '多源异构数据库连接器 (MySQL / PostgreSQL / Redis)',
      spec: '@modelcontextprotocol/server-postgres',
      author: 'MCP Community',
      description: '安全直连企业外部关系型数据库与缓存，执行表结构探索、Schema 映射与只读分析查询。',
      tags: ['数据库', 'SQL', '数据集成'],
      installed: false,
    },
    {
      id: 'dsh-plugin-api',
      name: 'API 接口调试与 Webhook 监听插件',
      spec: '@modelcontextprotocol/server-fetch',
      author: 'MCP Community',
      description: '向任意第三方 REST/GraphQL 接口发送模拟请求，调试响应头、Payload 与响应延迟。',
      tags: ['API 调试', '网络工具', 'Webhook'],
      installed: false,
    },
  ];

  // 筛选插件
  const filteredBuiltin = builtinPlugins.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.tools.some((t) => t.includes(q));
  });

  const customMcpList = mcpServers.filter((m) => m.id !== 'neocrm-paas-mcp');
  const filteredCustom = customMcpList.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return m.name.toLowerCase().includes(q) || (m.description || '').toLowerCase().includes(q);
  });

  // 处理安装提交
  const handleInstallSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!installInput.trim()) {
      showToast?.('error', '请输入包名、仓库地址或本地路径');
      return;
    }

    setIsInstalling(true);
    try {
      const serverName = installName.trim() || installInput.split(/[\/\\]/).pop()?.replace(/[^a-zA-Z0-9_-]/g, '') || '新插件';
      const newMcp: McpServerConfig = {
        id: `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: serverName,
        description: `从 ${installType.toUpperCase()} 安装: ${installInput.trim()}`,
        type: installType === 'local' ? 'stdio' : 'stdio',
        command: installType === 'npm' ? 'npx' : 'node',
        args: [installInput.trim()],
        enabled: true,
      };

      onSaveMcpServer(newMcp);
      showToast?.('success', `插件 [${serverName}] 已成功添加并注册到 Harness 扩展通道！`);
      setIsInstallModalOpen(false);
      setInstallInput('');
      setInstallName('');
    } catch (e: any) {
      showToast?.('error', `安装失败: ${e.message}`);
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full w-full bg-slate-50/50 overflow-hidden font-sans select-none">
      {/* 1. 顶部 Header (Codex / DSH 标准导航与操作栏) */}
      <div className="h-14 px-6 border-b border-slate-200/80 bg-white flex items-center justify-between shrink-0 shadow-2xs">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBackToAi}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors flex items-center space-x-1 text-xs cursor-pointer"
            title="返回 AI 对话工作台"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">返回对话</span>
          </button>
          <div className="h-5 w-px bg-slate-200" />
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-xl bg-purple-500 text-white shadow-xs">
              <Plug className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-tight">
                DeepSeek Harness 插件与扩展中心 (Plugins)
              </h2>
              <p className="text-[11px] text-slate-400">
                管理官方内置工具驱动、MCP 外部服务与系统专业技能
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsInstallModalOpen(true)}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>添加新插件</span>
          </button>
        </div>
      </div>

      {/* 2. 中部标签页与搜索条 */}
      <div className="px-6 py-3 border-b border-slate-200/60 bg-white flex items-center justify-between gap-4 shrink-0">
        <div className="flex p-0.5 bg-slate-100 rounded-xl border border-slate-200/80 text-xs">
          <button
            onClick={() => setActiveTab('installed')}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
              activeTab === 'installed'
                ? 'bg-white text-purple-700 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            已安装插件 ({builtinPlugins.length + customMcpList.length})
          </button>

          <button
            onClick={() => setActiveTab('market')}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
              activeTab === 'market'
                ? 'bg-white text-purple-700 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            插件市场 / 发现 ({marketPlugins.length})
          </button>

          <button
            onClick={() => setActiveTab('skills')}
            className={`px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
              activeTab === 'skills'
                ? 'bg-white text-purple-700 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            专业技能库 ({skills.length})
          </button>
        </div>

        <div className="relative w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索插件名称、描述或工具..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-400 focus:bg-white"
          />
        </div>
      </div>

      {/* 3. 插件内容展示滚动区 */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Tab 1: 已安装插件列表 */}
          {activeTab === 'installed' && (
            <div className="space-y-6">
              {/* 官方核心驱动分组 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                    <Package className="w-4 h-4 text-purple-600" />
                    <span>DeepSeek Harness 官方核心工具驱动 ({filteredBuiltin.length})</span>
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono">内核常驻运行</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {filteredBuiltin.map((plugin) => {
                    const Icon = plugin.icon;
                    return (
                      <div
                        key={plugin.id}
                        className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-purple-300 transition-all shadow-2xs space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start space-x-3">
                            <div className={`p-2 rounded-xl border shrink-0 ${plugin.color}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <h4 className="text-xs font-bold text-slate-900 leading-snug">
                                  {plugin.name}
                                </h4>
                              </div>
                              <div className="flex items-center space-x-1.5 mt-0.5">
                                <span className="text-[10px] font-mono text-slate-400">{plugin.version}</span>
                                {plugin.tags.map((t, idx) => (
                                  <span
                                    key={idx}
                                    className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-mono"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>

                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium shrink-0 flex items-center space-x-1">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>运行中</span>
                          </span>
                        </div>

                        <p className="text-xs text-slate-500 leading-relaxed">
                          {plugin.description}
                        </p>

                        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] text-slate-400">公开工具:</span>
                          {plugin.tools.map((tname) => (
                            <code
                              key={tname}
                              className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-mono border border-slate-200"
                            >
                              {tname}
                            </code>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 用户自定义扩展 MCP 分组 */}
              {customMcpList.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                      <Plug className="w-4 h-4 text-indigo-600" />
                      <span>已添加的自定义扩展服务 / MCP ({filteredCustom.length})</span>
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {filteredCustom.map((mcp) => (
                      <div
                        key={mcp.id}
                        className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 transition-all shadow-2xs space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start space-x-3">
                            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
                              <Plug className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-slate-900 leading-snug">
                                {mcp.name}
                              </h4>
                              <span className="text-[10px] font-mono text-slate-400">
                                {mcp.type.toUpperCase()} · {mcp.command || mcp.url || 'STDIO'}
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => onToggleMcpServer(mcp.id)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border cursor-pointer ${
                              mcp.enabled
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-500 border-slate-200'
                            }`}
                          >
                            {mcp.enabled ? '已启用' : '已停用'}
                          </button>
                        </div>

                        <p className="text-xs text-slate-500">
                          {mcp.description || '自定义外部 MCP 协议服务驱动'}
                        </p>

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-[10px] text-slate-400 font-mono">
                            提供 {mcp.tools?.length || 0} 个函数工具
                          </span>
                          <button
                            onClick={() => onDeleteMcpServer(mcp.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                            title="移除此扩展服务"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: 插件市场 / 发现 */}
          {activeTab === 'market' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-50 via-indigo-50 to-white border border-purple-200 text-xs text-purple-900 leading-relaxed">
                <p className="font-bold text-sm text-purple-950">官方与社区精选扩展插件市场</p>
                <p className="mt-1 text-slate-600">
                  一键安装经 DeepSeek Harness / Codex 生态验证的第三方工程驱动，赋能代码审查、数据库直连、文档解析与智能调度。
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {marketPlugins.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-purple-300 transition-all shadow-2xs space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">{item.name}</h4>
                        <div className="flex items-center space-x-1.5 mt-1">
                          <span className="text-[10px] text-slate-400 font-mono">{item.author}</span>
                          {item.tags.map((t, idx) => (
                            <span
                              key={idx}
                              className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-mono"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          onSaveMcpServer({
                            id: `market_${item.id}`,
                            name: item.name,
                            description: item.description,
                            type: 'stdio',
                            command: 'npx',
                            args: [item.spec],
                            enabled: true,
                          });
                          showToast?.('success', `已添加插件 [${item.name}] 至扩展列表！`);
                        }}
                        className="px-3 py-1 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-semibold border border-purple-200 flex items-center space-x-1 cursor-pointer transition-colors"
                      >
                        <Download className="w-3 h-3 text-purple-600" />
                        <span>安装</span>
                      </button>
                    </div>

                    <p className="text-xs text-slate-500 leading-relaxed">{item.description}</p>
                    <div className="text-[10px] font-mono text-slate-400 truncate">
                      <code>{item.spec}</code>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 3: 专业技能库 */}
          {activeTab === 'skills' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {skills.map((skill) => (
                  <div
                    key={skill.id}
                    className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 transition-all shadow-2xs space-y-2.5"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <Sparkles className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">{skill.name}</h4>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {skill.category === 'builtin' ? '系统规范技能 (受沙箱保护)' : '个人自定义技能'}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                          skill.enabled
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                      >
                        {skill.enabled ? '已激活' : '已停用'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">{skill.description}</p>

                    {skill.triggerKeywords && skill.triggerKeywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {skill.triggerKeywords.map((kw, i) => (
                          <span
                            key={i}
                            className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 font-mono"
                          >
                            #{kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 安装新插件模态框 (完全对齐 DeepSeek Harness / DSH Desktop 弹窗规范) */}
      {isInstallModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-purple-600 text-white shadow-xs">
                  <Plug className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">安装第三方插件 (Install Plugin)</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">支持 NPM 包、GitHub 仓库地址或本机物理目录</p>
                </div>
              </div>
              <button
                onClick={() => setIsInstallModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleInstallSubmit} className="p-5 space-y-4 text-xs">
              {/* 安装通道切换 */}
              <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setInstallType('npm');
                    setInstallInput('dsh-plugin-whale-pet');
                  }}
                  className={`flex-1 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                    installType === 'npm' ? 'bg-white text-purple-700 font-bold shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  NPM 包名
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInstallType('git');
                    setInstallInput('https://github.com/author/dsh-plugin');
                  }}
                  className={`flex-1 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                    installType === 'git' ? 'bg-white text-purple-700 font-bold shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Git 仓库地址
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInstallType('local');
                    setInstallInput('/Users/username/my-plugin');
                  }}
                  className={`flex-1 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                    installType === 'local' ? 'bg-white text-purple-700 font-bold shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  本地文件夹路径
                </button>
              </div>

              {/* 包名 / 路径输入 */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700">
                  {installType === 'npm' ? 'NPM 插件包名' : installType === 'git' ? 'Git 仓库地址' : '本地目录完整路径'} *
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    required
                    value={installInput}
                    onChange={(e) => setInstallInput(e.target.value)}
                    placeholder={
                      installType === 'npm'
                        ? '如 dsh-plugin-whale-pet 或 @modelcontextprotocol/server-postgres'
                        : installType === 'git'
                        ? '如 https://github.com/author/dsh-plugin.git'
                        : '/Users/username/Desktop/my-plugin'
                    }
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs font-mono focus:outline-none focus:border-purple-500"
                  />
                  {installType === 'local' && window.neoApi?.selectFolder && (
                    <button
                      type="button"
                      onClick={async () => {
                        const sel = await window.neoApi.selectFolder();
                        if (sel) setInstallInput(sel);
                      }}
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium shrink-0 flex items-center space-x-1 cursor-pointer"
                    >
                      <FolderOpen className="w-4 h-4 text-amber-600" />
                      <span>浏览...</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 插件自定义显示名称 */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700">显示名称 (可选)</label>
                <input
                  type="text"
                  value={installName}
                  onChange={(e) => setInstallName(e.target.value)}
                  placeholder="留空则自动根据包名或路径生成"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsInstallModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isInstalling}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold flex items-center space-x-1.5 shadow-xs cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{isInstalling ? '安装中...' : '确认添加'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
