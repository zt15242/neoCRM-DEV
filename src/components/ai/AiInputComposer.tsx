import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Square, 
  Box, 
  Wrench, 
  Sparkles, 
  CornerDownLeft,
  X,
  Paperclip,
  Lightbulb,
  FileSpreadsheet,
  FileText,
  FileCode,
  Loader2,
  Check,
  Plug,
  ExternalLink,
  Settings
} from 'lucide-react';
import { AiContextEntityRef, AiFileAttachment, AiSkillItem, McpServerConfig } from '../../../shared/types';

interface AiInputComposerProps {
  isStreaming: boolean;
  onSend: (
    text: string, 
    entityRefs?: AiContextEntityRef[], 
    attachments?: AiFileAttachment[], 
    skillIds?: string[],
    mcpServerIds?: string[]
  ) => void;
  onStop: () => void;
  entityRefs: AiContextEntityRef[];
  onRemoveEntityRef: (apiKey: string) => void;
  onOpenEntityPicker: () => void;
  enableTools: boolean;
  onToggleTools: () => void;
  availableSkills?: AiSkillItem[];
  activeSkillIds?: string[];
  onToggleSkill?: (skillId: string) => void;
  availableMcpServers?: McpServerConfig[];
  activeMcpServerIds?: string[];
  onToggleMcpServer?: (serverId: string) => void;
  onOpenMcpSettings?: () => void;
  placeholder?: string;
  quickPrompts?: string[];
  showToast?: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const AiInputComposer: React.FC<AiInputComposerProps> = ({
  isStreaming,
  onSend,
  onStop,
  entityRefs,
  onRemoveEntityRef,
  onOpenEntityPicker,
  enableTools,
  onToggleTools,
  availableSkills = [],
  activeSkillIds = [],
  onToggleSkill,
  availableMcpServers = [],
  activeMcpServerIds = [],
  onToggleMcpServer,
  onOpenMcpSettings,
  placeholder = '输入消息，向 AI 助手提问，支持拖入 Excel/文件进行深度分析...',
  quickPrompts = [],
  showToast,
}) => {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<AiFileAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [skillPopoverOpen, setSkillPopoverOpen] = useState(false);
  const [mcpPopoverOpen, setMcpPopoverOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [text]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    if (isStreaming) {
      onStop();
      return;
    }
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    onSend(trimmed, entityRefs, attachments, activeSkillIds, activeMcpServerIds);
    setText('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  // 选择并上传本地文件
  const handleSelectFile = async () => {
    if (isUploading) return;
    setIsUploading(true);
    try {
      if (window.neoApi?.aiSelectAndParseFile) {
        const file = await window.neoApi.aiSelectAndParseFile();
        if (file) {
          setAttachments((prev) => [...prev, file]);
          showToast?.('success', `已加载文件: ${file.name}`);
        }
      }
    } catch (e: any) {
      showToast?.('error', `文件读取失败: ${e.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  // 支持拖拽文件进入输入框
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const arrayBuffer = await f.arrayBuffer();
        if (window.neoApi?.aiParseFileBuffer) {
          const parsed = await window.neoApi.aiParseFileBuffer(f.name, arrayBuffer);
          setAttachments((prev) => [...prev, parsed]);
          showToast?.('success', `已上传并解析: ${f.name}`);
        }
      }
    } catch (err: any) {
      showToast?.('error', `拖入解析失败: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const getFileIcon = (name: string) => {
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
      return FileSpreadsheet;
    }
    if (name.endsWith('.json') || name.endsWith('.js') || name.endsWith('.ts') || name.endsWith('.sql')) {
      return FileCode;
    }
    return FileText;
  };

  const activeMcpCount = activeMcpServerIds.length;

  return (
    <div
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 space-y-2.5 relative"
    >
      {/* 快捷推荐胶囊 */}
      {quickPrompts.length > 0 && !isStreaming && attachments.length === 0 && (
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
          <span className="text-slate-400 shrink-0 flex items-center space-x-1">
            <Sparkles className="w-3 h-3 text-sky-500" />
            <span>推荐提问:</span>
          </span>
          {quickPrompts.slice(0, 4).map((qp, idx) => (
            <button
              key={idx}
              onClick={() => {
                setText(qp);
                textareaRef.current?.focus();
              }}
              className="px-2.5 py-1 rounded-full bg-slate-50 hover:bg-sky-50 hover:text-sky-600 text-slate-600 border border-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {qp}
            </button>
          ))}
        </div>
      )}

      {/* 已挂载实体胶囊与文件附件 */}
      {(entityRefs.length > 0 || attachments.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 pb-1">
          {entityRefs.map((ref) => (
            <div
              key={ref.apiKey}
              className="inline-flex items-center space-x-1.5 pl-2 pr-1.5 py-0.5 rounded-lg bg-sky-50 text-sky-800 border border-sky-200 text-xs font-medium"
            >
              <Box className="w-3 h-3 text-sky-600" />
              <span>{ref.label} ({ref.apiKey})</span>
              <button
                type="button"
                onClick={() => onRemoveEntityRef(ref.apiKey)}
                className="hover:text-rose-600 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}

          {attachments.map((file) => {
            const Icon = getFileIcon(file.name);
            return (
              <div
                key={file.id}
                className="inline-flex items-center space-x-1.5 pl-2 pr-1.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-medium"
              >
                <Icon className="w-3.5 h-3.5 text-emerald-600" />
                <span className="max-w-[140px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== file.id))}
                  className="hover:text-rose-600 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 多行输入框 */}
      <textarea
        ref={textareaRef}
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full bg-transparent resize-none text-xs text-slate-800 placeholder-slate-400 focus:outline-none leading-relaxed min-h-[50px]"
      />

      {/* 底部控制与操作栏 */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
        <div className="flex items-center space-x-2">
          {/* 上传文件按钮 */}
          <button
            type="button"
            onClick={handleSelectFile}
            disabled={isUploading}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 transition-colors cursor-pointer"
            title="选择并上传 Excel、JSON、SQL 或文档文件进行深度分析"
          >
            {isUploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
            ) : (
              <Paperclip className="w-3.5 h-3.5 text-emerald-600" />
            )}
            <span>上传文件/表格</span>
          </button>

          {/* 引用对象字典按钮 */}
          <button
            type="button"
            onClick={onOpenEntityPicker}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:text-sky-700 hover:bg-sky-50 border border-slate-200 hover:border-sky-200 transition-colors cursor-pointer"
          >
            <Box className="w-3.5 h-3.5 text-sky-600" />
            <span>@ 引用对象</span>
          </button>

          {/* 挂载 Skill 技能按钮 */}
          {availableSkills.length > 0 && onToggleSkill && (
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setSkillPopoverOpen(!skillPopoverOpen);
                  setMcpPopoverOpen(false);
                }}
                title="选择要挂载的专业技能 (分系统内置与个人技能)"
                className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 transition-colors cursor-pointer"
              >
                <Lightbulb className="w-3.5 h-3.5 text-indigo-600" />
                <span>技能 ({activeSkillIds.length})</span>
              </button>

              {/* 技能选择浮层 */}
              {skillPopoverOpen && (
                <div className="absolute left-0 bottom-full mb-2 w-72 bg-white rounded-2xl border border-slate-200 shadow-xl p-3 z-30 space-y-2 text-xs">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 font-semibold text-slate-800">
                    <span className="flex items-center space-x-1.5">
                      <Lightbulb className="w-4 h-4 text-indigo-600" />
                      <span>挂载专业技能 (Skills)</span>
                    </span>
                    <button onClick={() => setSkillPopoverOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-1 divide-y divide-slate-50">
                    {availableSkills.map((sk) => {
                      const isActive = activeSkillIds.includes(sk.id);
                      return (
                        <div
                          key={sk.id}
                          onClick={() => onToggleSkill(sk.id)}
                          className={`p-2 rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                            isActive ? 'bg-indigo-50/80 text-indigo-900 font-medium' : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="truncate mr-2">
                            <div className="flex items-center space-x-1.5 truncate">
                              <span className="truncate">{sk.name}</span>
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 font-mono shrink-0">
                                {sk.category === 'builtin' ? '内置' : '个人'}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 truncate mt-0.5">{sk.description}</p>
                          </div>
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                              isActive ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isActive && <Check className="w-3 h-3" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 挂载 MCP 扩展服务按钮 */}
          {availableMcpServers.length > 0 && onToggleMcpServer && (
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setMcpPopoverOpen(!mcpPopoverOpen);
                  setSkillPopoverOpen(false);
                }}
                title="选择要在对话中激活的 MCP 扩展服务 (如远程知识库、文件系统等)"
                className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                  activeMcpCount > 0
                    ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                    : 'text-slate-600 hover:text-purple-700 hover:bg-purple-50 border-slate-200 hover:border-purple-200'
                }`}
              >
                <Plug className="w-3.5 h-3.5 text-purple-600" />
                <span>MCP 扩展 ({activeMcpCount})</span>
              </button>

              {/* MCP 服务选择浮层 */}
              {mcpPopoverOpen && (
                <div className="absolute left-0 bottom-full mb-2 w-80 bg-white rounded-2xl border border-slate-200 shadow-xl p-3 z-30 space-y-2 text-xs">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 font-semibold text-slate-800">
                    <span className="flex items-center space-x-1.5">
                      <Plug className="w-4 h-4 text-purple-600" />
                      <span>挂载 MCP 扩展服务</span>
                    </span>
                    <button onClick={() => setMcpPopoverOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    勾选后 AI 将自动感知该服务并优先调用其知识库或扩展工具
                  </p>

                  <div className="max-h-56 overflow-y-auto space-y-1 divide-y divide-slate-50">
                    {availableMcpServers.map((srv) => {
                      const isActive = activeMcpServerIds.includes(srv.id);
                      const isBuiltin = srv.type === 'builtin' || srv.id === 'neocrm-paas-mcp';
                      const toolCount = srv.tools?.length || 0;

                      return (
                        <div
                          key={srv.id}
                          onClick={() => onToggleMcpServer(srv.id)}
                          className={`p-2 rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                            isActive ? 'bg-purple-50/80 text-purple-900 font-medium' : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="truncate mr-2">
                            <div className="flex items-center space-x-1.5 truncate">
                              <span className="truncate">{srv.name}</span>
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 font-mono shrink-0">
                                {isBuiltin ? '内置' : srv.type.toUpperCase()}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 truncate mt-0.5">
                              {isBuiltin ? 'PaaS 内核实体与只读 SQL 驱动' : srv.description || srv.url || '自定义扩展服务'}
                            </p>
                            {!isBuiltin && toolCount > 0 && (
                              <div className="text-[10px] text-purple-600 mt-0.5 flex items-center space-x-1">
                                <span>包含 {toolCount} 个可用工具</span>
                              </div>
                            )}
                          </div>
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                              isActive ? 'bg-purple-600 border-purple-600 text-white' : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isActive && <Check className="w-3 h-3" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {onOpenMcpSettings && (
                    <div className="pt-1.5 border-t border-slate-100 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setMcpPopoverOpen(false);
                          onOpenMcpSettings();
                        }}
                        className="text-[11px] text-sky-600 hover:text-sky-700 font-semibold flex items-center space-x-1 cursor-pointer"
                      >
                        <Settings className="w-3 h-3" />
                        <span>前往系统设置配置 MCP</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 本地工具切换开关 */}
          <button
            type="button"
            onClick={onToggleTools}
            title={enableTools ? '已启用销售易本地元数据与 SQL 工具' : '已关闭本地工具'}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
              enableTools
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                : 'bg-slate-50 text-slate-400 border-slate-200 hover:text-slate-600'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>本地工具: {enableTools ? '开启' : '关闭'}</span>
          </button>
        </div>

        {/* 发送 / 停止生成按钮 */}
        <div>
          {isStreaming ? (
            <button
              onClick={onStop}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium shadow-xs transition-colors cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>停止生成</span>
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!text.trim() && attachments.length === 0}
              className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-xl text-xs font-medium transition-all shadow-xs ${
                text.trim() || attachments.length > 0
                  ? 'bg-sky-600 hover:bg-sky-500 text-white cursor-pointer shadow-sky-600/20'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
              }`}
            >
              <span>发送</span>
              <CornerDownLeft className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
