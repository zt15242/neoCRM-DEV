import React, { useState } from 'react';
import { McpServerConfig, McpToolItem } from '../../../shared/types';
import { 
  Plug, 
  Plus, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  Wrench, 
  Terminal, 
  Globe, 
  ShieldCheck, 
  X,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

interface McpSettingsProps {
  mcpServers: McpServerConfig[];
  onSaveMcpServer: (server: McpServerConfig) => Promise<void>;
  onDeleteMcpServer: (id: string) => Promise<void>;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const McpSettings: React.FC<McpSettingsProps> = ({
  mcpServers,
  onSaveMcpServer,
  onDeleteMcpServer,
  showToast,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServerConfig | null>(null);

  // 表单状态
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'stdio' | 'sse'>('stdio');
  const [command, setCommand] = useState('npx');
  const [argsStr, setArgsStr] = useState('-y @modelcontextprotocol/server-filesystem /path/to/dir');
  const [url, setUrl] = useState('http://localhost:3001/sse');

  const handleOpenAdd = () => {
    setEditingServer(null);
    setName('');
    setDescription('');
    setType('stdio');
    setCommand('npx');
    setArgsStr('-y @modelcontextprotocol/server-memory');
    setUrl('http://localhost:3001/sse');
    setModalOpen(true);
  };

  const handleOpenEdit = (srv: McpServerConfig) => {
    setEditingServer(srv);
    setName(srv.name);
    setDescription(srv.description || '');
    setType(srv.type === 'sse' ? 'sse' : 'stdio');
    setCommand(srv.command || 'npx');
    setArgsStr((srv.args || []).join(' '));
    setUrl(srv.url || '');
    setModalOpen(true);
  };

  const handleToggleEnabled = async (srv: McpServerConfig) => {
    await onSaveMcpServer({ ...srv, enabled: !srv.enabled });
    showToast('info', `${srv.name} 已${!srv.enabled ? '启用' : '停用'}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('error', '请输入 MCP 服务名称');
      return;
    }

    const payload: McpServerConfig = {
      id: editingServer?.id || `mcp_${Date.now()}`,
      name: name.trim(),
      description: description.trim() || (type === 'stdio' ? `Stdio 进程: ${command} ${argsStr}` : `SSE 端点: ${url}`),
      type,
      enabled: editingServer?.enabled ?? true,
      command: type === 'stdio' ? command.trim() : undefined,
      args: type === 'stdio' ? argsStr.trim().split(/\s+/).filter(Boolean) : undefined,
      url: type === 'sse' ? url.trim() : undefined,
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
            管理标准 MCP 协议服务与工具扩展，支持内置销售易 PaaS 引擎、本地 Stdio 进程及远程 SSE 服务。
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
          const isBuiltin = srv.type === 'builtin';
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
                    className={`p-2 rounded-xl mt-0.5 ${
                      isBuiltin
                        ? 'bg-sky-600 text-white'
                        : srv.type === 'stdio'
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {isBuiltin ? (
                      <ShieldCheck className="w-4 h-4" />
                    ) : srv.type === 'stdio' ? (
                      <Terminal className="w-4 h-4" />
                    ) : (
                      <Globe className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="text-sm font-bold text-slate-900">{srv.name}</h4>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium border ${
                          isBuiltin
                            ? 'bg-sky-100 text-sky-800 border-sky-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {isBuiltin ? '系统内置' : srv.type.toUpperCase()}
                      </span>
                      {srv.enabled ? (
                        <span className="text-[10px] text-emerald-600 flex items-center space-x-0.5 font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>已就绪</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">已停用</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{srv.description}</p>

                    {/* 暴露的 Tools 清单 */}
                    {srv.tools && srv.tools.length > 0 && (
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
                <div className="flex items-center space-x-2 shrink-0">
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={srv.enabled}
                      onChange={() => handleToggleEnabled(srv)}
                      className="w-4 h-4 rounded text-sky-600"
                    />
                  </label>
                  {!isBuiltin && (
                    <>
                      <button
                        onClick={() => handleOpenEdit(srv)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                        title="编辑"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteMcpServer(srv.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                        title="删除"
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

      {/* 新增/编辑 MCP 模态框 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center space-x-2">
                <Plug className="w-4 h-4 text-sky-600" />
                <h3 className="text-sm font-bold text-slate-800">
                  {editingServer ? '编辑 MCP 服务' : '添加自定义 MCP 服务'}
                </h3>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  服务名称 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：本地文件系统 MCP / 企业知识库 MCP"
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
                  <option value="stdio">Stdio (本地命令行标准输入输出)</option>
                  <option value="sse">SSE (HTTP Server-Sent Events 远程端点)</option>
                </select>
              </div>

              {type === 'stdio' ? (
                <>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">启动命令 (Command)</label>
                    <input
                      type="text"
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      placeholder="npx / node / python3"
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">命令参数 (Arguments)</label>
                    <input
                      type="text"
                      value={argsStr}
                      onChange={(e) => setArgsStr(e.target.value)}
                      placeholder="-y @modelcontextprotocol/server-xxx"
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-mono"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-slate-600 font-medium mb-1">SSE Endpoint URL</label>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="http://localhost:3001/sse"
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-slate-600 font-medium mb-1">功能描述 (选填)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="简要说明该 MCP 服务提供的能力..."
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-1.5 rounded-xl border border-slate-200 text-slate-600"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold"
                >
                  保存配置
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
