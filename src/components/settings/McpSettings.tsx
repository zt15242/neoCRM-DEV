import React, { useState } from 'react';
import { McpAuthType, McpServerConfig } from '../../../shared/types';
import { 
  Plus, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  Wrench, 
  Terminal, 
  Globe, 
  ShieldCheck, 
  X,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  RefreshCw,
  Loader2,
  Code2,
  SlidersHorizontal,
  Key
} from 'lucide-react';

interface McpSettingsProps {
  mcpServers: McpServerConfig[];
  onSaveMcpServer: (server: McpServerConfig) => Promise<void>;
  onDeleteMcpServer: (id: string) => Promise<void>;
  onMcpServersChange?: (servers: McpServerConfig[]) => void;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

interface KeyValuePair {
  key: string;
  value: string;
}

export const McpSettings: React.FC<McpSettingsProps> = ({
  mcpServers,
  onSaveMcpServer,
  onDeleteMcpServer,
  onMcpServersChange,
  showToast,
}) => {
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServerConfig | null>(null);

  // 表单与 JSON 模式切换
  const [configMode, setConfigMode] = useState<'form' | 'json'>('form');
  const [jsonInput, setJsonInput] = useState('');

  // 基础表单状态
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'stdio' | 'sse'>('stdio');
  const [command, setCommand] = useState('npx');
  const [argsStr, setArgsStr] = useState('-y @modelcontextprotocol/server-filesystem /path/to/dir');
  const [url, setUrl] = useState('http://localhost:3001/sse');

  // 核心鉴权与安全凭证状态
  const [authType, setAuthType] = useState<McpAuthType>('none');
  const [bearerToken, setBearerToken] = useState('');
  const [basicUsername, setBasicUsername] = useState('');
  const [basicPassword, setBasicPassword] = useState('');
  const [customAuthHeaderKey, setCustomAuthHeaderKey] = useState('x-api-key');
  const [customAuthHeaderVal, setCustomAuthHeaderVal] = useState('');
  const [showSecret, setShowSecret] = useState(false);

  // 附加请求头与环境变量
  const [customHeaders, setCustomHeaders] = useState<KeyValuePair[]>([]);
  const [envVars, setEnvVars] = useState<KeyValuePair[]>([]);

  const handleOpenAdd = () => {
    setEditingServer(null);
    setConfigMode('form');
    setJsonInput('');
    setName('');
    setDescription('');
    setType('sse');
    setCommand('npx');
    setArgsStr('-y @modelcontextprotocol/server-memory');
    setUrl('http://localhost:3001/sse');
    setAuthType('none');
    setBearerToken('');
    setBasicUsername('');
    setBasicPassword('');
    setCustomAuthHeaderKey('x-api-key');
    setCustomAuthHeaderVal('');
    setShowSecret(false);
    setCustomHeaders([]);
    setEnvVars([]);
    setModalOpen(true);
  };

  const handleOpenEdit = (srv: McpServerConfig) => {
    if (srv.type === 'builtin' || srv.id === 'neocrm-paas-mcp') {
      showToast('info', '系统内置 MCP 服务受内核沙箱保护，不可编辑');
      return;
    }
    setEditingServer(srv);
    setConfigMode('form');
    setJsonInput('');
    setName(srv.name);
    setDescription(srv.description || '');
    setType(srv.type === 'sse' ? 'sse' : 'stdio');
    setCommand(srv.command || 'npx');
    setArgsStr((srv.args || []).join(' '));
    setUrl(srv.url || 'http://localhost:3001/sse');

    // 还原鉴权凭证
    setAuthType(srv.authType || (srv.bearerToken ? 'bearer' : srv.basicUsername ? 'basic' : 'none'));
    setBearerToken(srv.bearerToken || '');
    setBasicUsername(srv.basicUsername || '');
    setBasicPassword(srv.basicPassword || '');
    setShowSecret(false);

    // 还原请求头
    const headerEntries: KeyValuePair[] = [];
    let customHeaderFound = false;
    if (srv.headers) {
      for (const [k, v] of Object.entries(srv.headers)) {
        const lowerK = k.toLowerCase();
        if (lowerK === 'authorization' && srv.authType === 'bearer') {
          // 已经存在于 bearerToken 中，无需重复填入 Headers 列表
          continue;
        }
        if (srv.authType === 'custom' && !customHeaderFound) {
          setCustomAuthHeaderKey(k);
          setCustomAuthHeaderVal(v);
          customHeaderFound = true;
          continue;
        }
        headerEntries.push({ key: k, value: v });
      }
    }
    setCustomHeaders(headerEntries);

    // 还原环境变量
    const envEntries: KeyValuePair[] = [];
    if (srv.env) {
      for (const [k, v] of Object.entries(srv.env)) {
        envEntries.push({ key: k, value: v });
      }
    }
    setEnvVars(envEntries);

    setModalOpen(true);
  };

  const handleToggleEnabled = async (srv: McpServerConfig) => {
    await onSaveMcpServer({ ...srv, enabled: !srv.enabled });
    showToast('info', `${srv.name} 已${!srv.enabled ? '启用' : '停用'}`);
  };

  const handleSyncTools = async (srv: McpServerConfig) => {
    if (!window.neoApi?.aiSyncMcpTools) return;
    setSyncingId(srv.id);
    try {
      const res = await window.neoApi.aiSyncMcpTools(srv.id);
      if (!res.success) {
        showToast("error", `同步失败: ${res.error || "未能获取工具列表"}`);
        return;
      }
      if (res.server && onMcpServersChange) {
        onMcpServersChange(
          mcpServers.map((s) => (s.id === res.server!.id ? res.server! : s))
        );
      }
      const toolCount = res.tools?.length || 0;
      const toolNames = (res.tools || []).slice(0, 3).map((t) => t.name).join(", ");
      showToast(
        "success",
        `已成功同步 ${toolCount} 个工具${toolNames ? `: [${toolNames}]` : ""}`
      );
    } catch (e: any) {
      showToast("error", `同步异常: ${e.message}`);
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = async (srv: McpServerConfig) => {
    if (srv.type === 'builtin' || srv.id === 'neocrm-paas-mcp') {
      showToast('error', '系统内置 MCP 服务不可删除');
      return;
    }
    await onDeleteMcpServer(srv.id);
    showToast('success', `已移除 MCP 服务 [${srv.name}]`);
  };

  // 动态管理请求头
  const handleAddHeader = () => {
    setCustomHeaders((prev) => [...prev, { key: '', value: '' }]);
  };
  const handleUpdateHeader = (index: number, field: 'key' | 'value', val: string) => {
    setCustomHeaders((prev) => prev.map((item, idx) => (idx === index ? { ...item, [field]: val } : item)));
  };
  const handleRemoveHeader = (index: number) => {
    setCustomHeaders((prev) => prev.filter((_, idx) => idx !== index));
  };

  // 动态管理环境变量
  const handleAddEnv = () => {
    setEnvVars((prev) => [...prev, { key: '', value: '' }]);
  };
  const handleUpdateEnv = (index: number, field: 'key' | 'value', val: string) => {
    setEnvVars((prev) => prev.map((item, idx) => (idx === index ? { ...item, [field]: val } : item)));
  };
  const handleRemoveEnv = (index: number) => {
    setEnvVars((prev) => prev.filter((_, idx) => idx !== index));
  };

  // 从 JSON 快速解析并导入
  const handleApplyJson = () => {
    try {
      const parsed = JSON.parse(jsonInput.trim());
      let targetObj = parsed;
      if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
        const firstKey = Object.keys(parsed.mcpServers)[0];
        if (firstKey) {
          setName(firstKey);
          targetObj = parsed.mcpServers[firstKey];
        }
      }

      if (targetObj.command) {
        setType('stdio');
        setCommand(targetObj.command);
        if (Array.isArray(targetObj.args)) {
          setArgsStr(targetObj.args.join(' '));
        }
        if (targetObj.env && typeof targetObj.env === 'object') {
          const envs = Object.entries(targetObj.env).map(([k, v]) => ({ key: k, value: String(v) }));
          setEnvVars(envs);
        }
      } else if (targetObj.url) {
        setType('sse');
        setUrl(targetObj.url);
        if (targetObj.headers && typeof targetObj.headers === 'object') {
          const hds: KeyValuePair[] = [];
          for (const [k, v] of Object.entries(targetObj.headers)) {
            const valStr = String(v);
            if (k.toLowerCase() === 'authorization' && valStr.toLowerCase().startsWith('bearer ')) {
              setAuthType('bearer');
              setBearerToken(valStr.slice(7).trim());
            } else {
              hds.push({ key: k, value: valStr });
            }
          }
          setCustomHeaders(hds);
        }
      }
      setConfigMode('form');
      showToast('success', '已成功解析并导入 MCP 配置！');
    } catch (e: any) {
      showToast('error', `JSON 格式错误: ${e.message}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('error', '请输入 MCP 服务名称');
      return;
    }

    // 组装请求头字典与鉴权凭据
    const finalHeaders: Record<string, string> = {};
    if (type === 'sse') {
      if (authType === 'bearer' && bearerToken.trim()) {
        const cleanToken = bearerToken.trim().replace(/^Bearer\s+/i, '');
        finalHeaders['Authorization'] = `Bearer ${cleanToken}`;
      } else if (authType === 'basic' && basicUsername.trim()) {
        const cred = `${basicUsername.trim()}:${basicPassword || ''}`;
        finalHeaders['Authorization'] = `Basic ${btoa(unescape(encodeURIComponent(cred)))}`;
      } else if (authType === 'custom' && customAuthHeaderKey.trim() && customAuthHeaderVal.trim()) {
        finalHeaders[customAuthHeaderKey.trim()] = customAuthHeaderVal.trim();
      }

      for (const h of customHeaders) {
        if (h.key.trim()) {
          finalHeaders[h.key.trim()] = h.value.trim();
        }
      }
    }

    // 组装环境变量字典
    const finalEnv: Record<string, string> = {};
    if (type === 'stdio') {
      for (const ev of envVars) {
        if (ev.key.trim()) {
          finalEnv[ev.key.trim()] = ev.value.trim();
        }
      }
    }

    const payload: McpServerConfig = {
      id: editingServer?.id || `mcp_${Date.now()}`,
      name: name.trim(),
      description: description.trim() || (type === 'stdio' ? `Stdio 进程: ${command} ${argsStr}` : `SSE 端点: ${url}`),
      type,
      enabled: editingServer?.enabled ?? true,
      command: type === 'stdio' ? command.trim() : undefined,
      args: type === 'stdio' ? argsStr.trim().split(/\s+/).filter(Boolean) : undefined,
      env: type === 'stdio' && Object.keys(finalEnv).length > 0 ? finalEnv : undefined,
      url: type === 'sse' ? url.trim() : undefined,
      authType: type === 'sse' ? authType : undefined,
      bearerToken: type === 'sse' && authType === 'bearer' ? bearerToken.trim() : undefined,
      basicUsername: type === 'sse' && authType === 'basic' ? basicUsername.trim() : undefined,
      basicPassword: type === 'sse' && authType === 'basic' ? basicPassword : undefined,
      headers: type === 'sse' && Object.keys(finalHeaders).length > 0 ? finalHeaders : undefined,
      tools: editingServer?.tools || [
        {
          name: `${name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}_invoke`,
          description: `调用 ${name.trim()} MCP 扩展工具`,
        },
      ],
    };

    await onSaveMcpServer(payload);
    setModalOpen(false);
    showToast('success', `MCP 服务 [${payload.name}] 已保存`);
  };

  return (
    <div className="space-y-6 text-xs">
      <div className="pb-3 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-800">MCP 扩展服务 (Model Context Protocol)</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            管理标准 MCP 扩展服务。支持完整的安全鉴权（Bearer Token、Basic 认证、自定义 Headers 及 Stdio 环境变量）。
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-xs cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>添加 MCP 服务</span>
        </button>
      </div>

      {/* MCP 服务列表 */}
      <div className="space-y-3">
        {mcpServers.map((srv) => {
          const isBuiltin = srv.type === 'builtin' || srv.id === 'neocrm-paas-mcp';
          const headerCount = srv.headers ? Object.keys(srv.headers).length : 0;
          const envCount = srv.env ? Object.keys(srv.env).length : 0;

          return (
            <div
              key={srv.id}
              className={`p-4 rounded-2xl border transition-all ${
                srv.enabled
                  ? isBuiltin
                    ? 'border-sky-200 bg-sky-50/30'
                    : 'border-slate-200 bg-white'
                  : 'border-slate-200 bg-slate-50/60 opacity-65'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  <div
                    className={`p-2 rounded-xl mt-0.5 shrink-0 ${
                      isBuiltin
                        ? 'bg-sky-600 text-white'
                        : srv.type === 'stdio'
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {isBuiltin ? (
                      <Lock className="w-4 h-4" />
                    ) : srv.type === 'stdio' ? (
                      <Terminal className="w-4 h-4" />
                    ) : (
                      <Globe className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900">{srv.name}</h4>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium border flex items-center space-x-1 ${
                          isBuiltin
                            ? 'bg-sky-100 text-sky-800 border-sky-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {isBuiltin && <ShieldCheck className="w-2.5 h-2.5" />}
                        <span>{isBuiltin ? '内核沙箱保护 · 内置' : srv.type.toUpperCase()}</span>
                      </span>

                      {/* 鉴权与安全徽章 */}
                      {!isBuiltin && (srv.authType === 'bearer' || srv.bearerToken) && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center space-x-1 font-medium">
                          <KeyRound className="w-2.5 h-2.5" />
                          <span>Bearer Token 鉴权</span>
                        </span>
                      )}
                      {!isBuiltin && (srv.authType === 'basic' || srv.basicUsername) && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center space-x-1 font-medium">
                          <KeyRound className="w-2.5 h-2.5" />
                          <span>Basic 认证</span>
                        </span>
                      )}
                      {!isBuiltin && headerCount > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                          Headers ({headerCount})
                        </span>
                      )}
                      {!isBuiltin && envCount > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
                          环境变量 ({envCount})
                        </span>
                      )}

                      {srv.enabled ? (
                        <span className="text-[10px] text-emerald-600 flex items-center space-x-0.5 font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>已就绪</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">已停用</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {isBuiltin
                        ? '提供销售易租户事实感知、实体元数据检索与只读 SQL 诊断能力。该驱动已深度集成至桌面内核，受到底层安全沙箱隔离保护，禁止逆向与外部提取。'
                        : srv.description}
                    </p>

                    {/* 仅在非内置服务时展示自定义 Tools 清单 */}
                    {!isBuiltin && srv.tools && srv.tools.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {srv.tools.map((t) => (
                          <span
                            key={t.name}
                            title={t.description}
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[11px] font-mono text-slate-700 shadow-2xs"
                          >
                            <Wrench className="w-2.5 h-2.5 text-sky-500" />
                            <span>{t.name}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 右侧开关与编辑操作 */}
                <div className="flex items-center space-x-2 shrink-0 ml-3">
                  <label className="inline-flex items-center cursor-pointer" title={srv.enabled ? '点击停用' : '点击启用'}>
                    <input
                      type="checkbox"
                      checked={srv.enabled}
                      onChange={() => handleToggleEnabled(srv)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-600"></div>
                  </label>

                  {!isBuiltin && (
                    <>
                      <button
                        onClick={() => handleSyncTools(srv)}
                        disabled={syncingId === srv.id}
                        className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                        title="同步工具列表"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${syncingId === srv.id ? 'animate-spin text-sky-600' : ''}`} />
                      </button>
                      <button
                        onClick={() => handleOpenEdit(srv)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                        title="编辑配置"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(srv)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                        title="移除服务"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 新增 / 编辑 MCP 服务模态框 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 shrink-0">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-sky-600" />
                <h3 className="text-sm font-bold text-slate-800">
                  {editingServer ? '编辑自定义 MCP 服务' : '添加自定义 MCP 服务'}
                </h3>
              </div>

              {/* 表单与 JSON 模式切换 */}
              <div className="flex items-center space-x-2">
                <div className="flex bg-slate-200/80 p-0.5 rounded-lg text-[11px]">
                  <button
                    type="button"
                    onClick={() => setConfigMode('form')}
                    className={`px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer ${
                      configMode === 'form' ? 'bg-white text-slate-800 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <SlidersHorizontal className="w-3 h-3 inline mr-1" />
                    <span>表单</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfigMode('json')}
                    className={`px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer ${
                      configMode === 'json' ? 'bg-white text-slate-800 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Code2 className="w-3 h-3 inline mr-1" />
                    <span>JSON 导入</span>
                  </button>
                </div>

                <button onClick={() => setModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {configMode === 'json' ? (
              <div className="p-5 space-y-3 flex-1 flex flex-col">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">
                    粘贴标准 MCP 配置 (支持 Claude / Cursor / VSCode 格式)
                  </label>
                  <p className="text-[11px] text-slate-400 mb-2">
                    支持粘贴包含 command、args、env 或 url、headers (含 Authorization) 的 JSON 片段。
                  </p>
                  <textarea
                    rows={12}
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    placeholder={`{\n  "mcpServers": {\n    "my-server": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],\n      "env": { "API_KEY": "xxx" }\n    }\n  }\n}`}
                    className="w-full p-3 font-mono text-xs rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:border-sky-500 focus:bg-white resize-none"
                  />
                </div>
                <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setConfigMode('form')}
                    className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium cursor-pointer"
                  >
                    返回表单
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyJson}
                    className="px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-xs cursor-pointer"
                  >
                    解析并导入
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">
                    服务名称 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例如：企业内部知识库 MCP / 本地文件系统 MCP"
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-medium mb-1">传输类型 (Transport)</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as 'stdio' | 'sse')}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-sky-500"
                  >
                    <option value="sse">SSE (HTTP 远程服务端点 · 支持鉴权)</option>
                    <option value="stdio">Stdio (本地命令行进程 · 支持环境变量鉴权)</option>
                  </select>
                </div>

                {type === 'sse' ? (
                  <>
                    <div>
                      <label className="block text-slate-600 font-medium mb-1">SSE Endpoint URL <span className="text-rose-500">*</span></label>
                      <input
                        type="text"
                        required
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="http://localhost:3001/sse 或 https://..."
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-mono focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    {/* 远程 SSE 专属鉴权与安全凭证区块 */}
                    <div className="p-3.5 rounded-xl bg-slate-50/90 border border-slate-200/90 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-700 flex items-center space-x-1.5">
                          <KeyRound className="w-3.5 h-3.5 text-sky-600" />
                          <span>身份认证与鉴权方式 (Authentication)</span>
                        </span>
                      </div>

                      {/* 鉴权模式切换 Tabs */}
                      <div className="grid grid-cols-4 gap-1 bg-white p-1 rounded-lg border border-slate-200">
                        {[
                          { id: 'none', label: '无认证' },
                          { id: 'bearer', label: 'Bearer Token' },
                          { id: 'basic', label: '账号密码' },
                          { id: 'custom', label: '自定义 Header' },
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setAuthType(tab.id as McpAuthType)}
                            className={`py-1 px-1.5 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                              authType === tab.id
                                ? 'bg-sky-600 text-white shadow-2xs font-semibold'
                                : 'text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {/* Bearer Token 模式 */}
                      {authType === 'bearer' && (
                        <div className="space-y-1 animate-in fade-in duration-100">
                          <label className="block text-[11px] text-slate-600 font-medium">
                            API 令牌 Token (自动注入 <code className="text-sky-700 font-mono">Authorization: Bearer ...</code>)
                          </label>
                          <div className="relative">
                            <input
                              type={showSecret ? 'text' : 'password'}
                              value={bearerToken}
                              onChange={(e) => setBearerToken(e.target.value)}
                              placeholder="粘贴 API Key 或 JWT 访问令牌 (如 sk-xxxx / ghp_xxxx)"
                              className="w-full pl-3 pr-9 py-1.5 rounded-lg border border-slate-200 bg-white font-mono focus:outline-none focus:border-sky-500"
                            />
                            <button
                              type="button"
                              onClick={() => setShowSecret(!showSecret)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                            >
                              {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Basic Auth 账号密码模式 */}
                      {authType === 'basic' && (
                        <div className="grid grid-cols-2 gap-2.5 animate-in fade-in duration-100">
                          <div>
                            <label className="block text-[11px] text-slate-600 font-medium mb-1">用户名 (Username)</label>
                            <input
                              type="text"
                              value={basicUsername}
                              onChange={(e) => setBasicUsername(e.target.value)}
                              placeholder="Username"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-mono focus:outline-none focus:border-sky-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-600 font-medium mb-1">密码 (Password)</label>
                            <div className="relative">
                              <input
                                type={showSecret ? 'text' : 'password'}
                                value={basicPassword}
                                onChange={(e) => setBasicPassword(e.target.value)}
                                placeholder="Password"
                                className="w-full pl-2.5 pr-8 py-1.5 rounded-lg border border-slate-200 bg-white font-mono focus:outline-none focus:border-sky-500"
                              />
                              <button
                                type="button"
                                onClick={() => setShowSecret(!showSecret)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                              >
                                {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 自定义 Header 鉴权模式 */}
                      {authType === 'custom' && (
                        <div className="grid grid-cols-2 gap-2 animate-in fade-in duration-100">
                          <div>
                            <label className="block text-[11px] text-slate-600 font-medium mb-1">Header 鉴权字段名</label>
                            <input
                              type="text"
                              value={customAuthHeaderKey}
                              onChange={(e) => setCustomAuthHeaderKey(e.target.value)}
                              placeholder="如: x-api-key 或 token"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-mono focus:outline-none focus:border-sky-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-600 font-medium mb-1">Header 鉴权值</label>
                            <input
                              type="text"
                              value={customAuthHeaderVal}
                              onChange={(e) => setCustomAuthHeaderVal(e.target.value)}
                              placeholder="鉴权密钥值"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-mono focus:outline-none focus:border-sky-500"
                            />
                          </div>
                        </div>
                      )}

                      {/* 附加自定义请求头键值对列表 */}
                      <div className="space-y-2 pt-2 border-t border-slate-200/60">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-600 font-medium">
                            附加 HTTP 请求头 (Extra Headers)
                          </span>
                          <button
                            type="button"
                            onClick={handleAddHeader}
                            className="text-[11px] text-sky-600 hover:text-sky-700 font-semibold flex items-center space-x-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            <span>添加请求头</span>
                          </button>
                        </div>

                        {customHeaders.length > 0 ? (
                          <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                            {customHeaders.map((item, idx) => (
                              <div key={idx} className="flex items-center space-x-1.5">
                                <input
                                  type="text"
                                  value={item.key}
                                  onChange={(e) => handleUpdateHeader(idx, 'key', e.target.value)}
                                  placeholder="Header 名 (如 X-Tenant-Id)"
                                  className="w-2/5 px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-mono text-[11px] focus:outline-none focus:border-sky-500"
                                />
                                <input
                                  type="text"
                                  value={item.value}
                                  onChange={(e) => handleUpdateHeader(idx, 'value', e.target.value)}
                                  placeholder="Header 值"
                                  className="flex-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-mono text-[11px] focus:outline-none focus:border-sky-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveHeader(idx)}
                                  className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                                  title="移除"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-400 italic">
                            可选。点击「+ 添加请求头」附加 Cookie 或自定义参数。
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-slate-600 font-medium mb-1">启动命令 (Command)</label>
                      <input
                        type="text"
                        value={command}
                        onChange={(e) => setCommand(e.target.value)}
                        placeholder="npx / node / python3 / uvx"
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-mono focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 font-medium mb-1">命令参数 (Arguments)</label>
                      <input
                        type="text"
                        value={argsStr}
                        onChange={(e) => setArgsStr(e.target.value)}
                        placeholder="-y @modelcontextprotocol/server-memory"
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-mono focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    {/* Stdio 环境变量管理 (包含 API Key 凭据注入) */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[11px] text-slate-700 font-bold flex items-center space-x-1">
                            <Key className="w-3.5 h-3.5 text-indigo-600" />
                            <span>环境变量与 API 鉴权密钥 (Environment)</span>
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleAddEnv}
                          className="text-[11px] text-sky-600 hover:text-sky-700 font-semibold flex items-center space-x-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>添加环境变量</span>
                        </button>
                      </div>

                      {envVars.length > 0 ? (
                        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                          {envVars.map((item, idx) => (
                            <div key={idx} className="flex items-center space-x-1.5">
                              <input
                                type="text"
                                value={item.key}
                                onChange={(e) => handleUpdateEnv(idx, 'key', e.target.value)}
                                placeholder="变量名 (如 GITHUB_TOKEN)"
                                className="w-2/5 px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-mono text-[11px] focus:outline-none focus:border-sky-500"
                              />
                              <input
                                type="text"
                                value={item.value}
                                onChange={(e) => handleUpdateEnv(idx, 'value', e.target.value)}
                                placeholder="密钥或变量值"
                                className="flex-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-mono text-[11px] focus:outline-none focus:border-sky-500"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveEnv(idx)}
                                className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                                title="移除"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic">
                          可选。点击「+ 添加环境变量」为子进程注入 API Key 密钥或数据库连接串。
                        </p>
                      )}
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-slate-600 font-medium mb-1">功能描述 (可选)</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="简要说明该 MCP 提供的工具能力"
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-xs cursor-pointer"
                  >
                    保存服务
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
