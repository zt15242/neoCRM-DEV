import React, { useState, useRef, useEffect } from 'react';
import { 
  ArrowUp,
  Square, 
  Box, 
  Wrench, 
  Sparkles, 
  Plus,
  X,
  Paperclip,
  FileSpreadsheet,
  FileText,
  FileCode,
  Loader2,
  Check,
  Plug,
  Settings,
  ChevronDown,
  Shield,
  ShieldCheck,
  Printer,
  Workflow,
  FileCheck
} from 'lucide-react';
import { AiContextEntityRef, AiFileAttachment, AiSkillItem, McpServerConfig, AiProviderConfig } from '../../../shared/types';

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
  // Codex 风格模型选择与身份状态
  configuredProviders?: AiProviderConfig[];
  currentProviderId?: string;
  currentModelId?: string;
  onSelectModel?: (providerId: string, modelId: string) => void;
  currentPresetName?: string;
  tenantName?: string;
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
  placeholder = 'Ask anything or paste Excel/code...',
  quickPrompts = [],
  showToast,
  configuredProviders = [],
  currentProviderId,
  currentModelId,
  onSelectModel,
  currentPresetName,
  tenantName = '沙盒环境',
}) => {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<AiFileAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
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

  const handleSelectFile = async () => {
    setPlusMenuOpen(false);
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

  // 获取当前所选模型的展示名称
  let currentModelDisplay = 'deepseek-chat';
  if (configuredProviders.length > 0) {
    const curP = configuredProviders.find((p) => p.id === currentProviderId) || configuredProviders[0];
    const curM = curP.models.find((m) => m.id === currentModelId) || curP.models[0];
    if (curM) {
      currentModelDisplay = curM.id.includes('/') ? curM.id.split('/').pop()! : curM.id;
    }
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:border-slate-300 transition-all p-3 space-y-2 relative"
    >
      {/* 附件与引用实体胶囊 */}
      {(attachments.length > 0 || entityRefs.length > 0) && (
        <div className="flex flex-wrap gap-1.5 pb-1">
          {attachments.map((att) => {
            const Icon = getFileIcon(att.name);
            return (
              <span
                key={att.id}
                className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-mono border border-slate-200"
              >
                <Icon className="w-3.5 h-3.5 text-slate-500" />
                <span className="truncate max-w-[140px]">{att.name}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                  className="hover:text-rose-500 ml-1"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}

          {entityRefs.map((ref) => (
            <span
              key={ref.apiKey}
              className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 text-xs font-mono border border-sky-200"
            >
              <Box className="w-3.5 h-3.5 text-sky-500" />
              <span>@{ref.label}</span>
              <button
                type="button"
                onClick={() => onRemoveEntityRef(ref.apiKey)}
                className="hover:text-rose-500 ml-1"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* 主输入文本域 */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        className="w-full resize-none border-none focus:outline-none text-[13px] md:text-sm text-slate-800 placeholder-slate-400 bg-transparent leading-relaxed max-h-44"
      />

      {/* 底部操作工具栏 (Codex 经典布局: 左侧 + 与权限药丸，右侧模型与黑圆箭头发送键) */}
      <div className="flex items-center justify-between pt-1">
        {/* 左侧控制区 */}
        <div className="flex items-center space-x-2">
          {/* 圆形加号菜单 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setPlusMenuOpen(!plusMenuOpen)}
              className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
              title="添加附件、引用对象或技能"
            >
              <Plus className="w-4 h-4" />
            </button>

            {plusMenuOpen && (
              <div className="absolute left-0 bottom-full mb-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 text-xs text-slate-700 animate-in fade-in zoom-in-95 duration-100">
                <button
                  type="button"
                  onClick={handleSelectFile}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center space-x-2 cursor-pointer"
                >
                  <Paperclip className="w-4 h-4 text-emerald-600" />
                  <span>上传 Excel / 文件分析</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlusMenuOpen(false);
                    onOpenEntityPicker();
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center space-x-2 cursor-pointer"
                >
                  <Box className="w-4 h-4 text-sky-600" />
                  <span>引用实体对象 (@对象)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlusMenuOpen(false);
                    onToggleTools();
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center justify-between cursor-pointer border-t border-slate-100"
                >
                  <div className="flex items-center space-x-2">
                    <Wrench className="w-4 h-4 text-amber-600" />
                    <span>CRM 本地工具</span>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${enableTools ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                    {enableTools ? '已开启' : '关闭'}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Full access / 沙盒权限胶囊 (Codex 标志性特征) */}
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-100/90 text-slate-700 text-xs font-medium border border-slate-200/80">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span className="truncate max-w-[120px]">{tenantName}</span>
          </div>

          {/* 角色标识徽标 */}
          {currentPresetName && (
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-mono">
              {currentPresetName.split(' (')[0]}
            </span>
          )}
        </div>

        {/* 右侧控制区: 模型选择器 + Codex 经典圆黑向上发送箭头 */}
        <div className="flex items-center space-x-2">
          {/* 模型下拉选择器 */}
          {configuredProviders.length > 0 && onSelectModel && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                className="flex items-center space-x-1 px-2.5 py-1 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <span className="truncate max-w-[130px] font-mono">{currentModelDisplay}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {modelDropdownOpen && (
                <div className="absolute right-0 bottom-full mb-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 text-xs max-h-64 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                  {configuredProviders.map((prov) => (
                    <div key={prov.id} className="py-1">
                      <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {prov.name}
                      </div>
                      {prov.models.map((mod) => {
                        const isCur = prov.id === currentProviderId && mod.id === currentModelId;
                        return (
                          <button
                            key={mod.id}
                            type="button"
                            onClick={() => {
                              onSelectModel(prov.id, mod.id);
                              setModelDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-1.5 flex items-center justify-between cursor-pointer ${
                              isCur ? 'bg-sky-50 text-sky-700 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <span className="truncate">{mod.name}</span>
                            {isCur && <Check className="w-3.5 h-3.5 text-sky-600 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Codex 风格纯黑圆形发送按钮 (带向上箭头) */}
          {isStreaming ? (
            <button
              onClick={onStop}
              className="w-8 h-8 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center transition-all shadow-xs cursor-pointer"
              title="停止生成"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!text.trim() && attachments.length === 0}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                text.trim() || attachments.length > 0
                  ? 'bg-slate-900 hover:bg-slate-800 text-white shadow-xs hover:scale-105'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
              title="发送 (Enter)"
            >
              <ArrowUp className="w-4 h-4 stroke-[2.5]" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
