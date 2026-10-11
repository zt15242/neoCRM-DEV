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
  Check
} from 'lucide-react';
import { AiContextEntityRef, AiFileAttachment, AiSkillItem } from '../../../shared/types';

interface AiInputComposerProps {
  isStreaming: boolean;
  onSend: (text: string, entityRefs?: AiContextEntityRef[], attachments?: AiFileAttachment[], skillIds?: string[]) => void;
  onStop: () => void;
  entityRefs: AiContextEntityRef[];
  onRemoveEntityRef: (apiKey: string) => void;
  onOpenEntityPicker: () => void;
  enableTools: boolean;
  onToggleTools: () => void;
  availableSkills?: AiSkillItem[];
  activeSkillIds?: string[];
  onToggleSkill?: (skillId: string) => void;
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
  placeholder = '输入消息，向 AI 助手提问，支持拖入 Excel/文件进行深度分析...',
  quickPrompts = [],
  showToast,
}) => {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<AiFileAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [skillPopoverOpen, setSkillPopoverOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    onSend(trimmed, entityRefs, attachments, activeSkillIds);
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

  const getFileIcon = (mime: string, name: string) => {
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
      return FileSpreadsheet;
    }
    if (name.endsWith('.json') || name.endsWith('.js') || name.endsWith('.ts') || name.endsWith('.sql')) {
      return FileCode;
    }
    return FileText;
  };

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
              className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-sky-50 hover:text-sky-700 text-slate-600 shrink-0 transition-colors border border-transparent hover:border-sky-200 cursor-pointer"
            >
              {qp}
            </button>
          ))}
        </div>
      )}

      {/* 挂载的上下文胶囊：实体对象、已上传文件、已激活技能 */}
      {(entityRefs.length > 0 || attachments.length > 0 || activeSkillIds.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
          {/* 上传的文件胶囊 */}
          {attachments.map((att) => {
            const Icon = getFileIcon(att.mimeType, att.name);
            return (
              <span
                key={att.id}
                title={att.summaryText || att.name}
                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-medium shadow-2xs"
              >
                <Icon className="w-3.5 h-3.5 text-emerald-600" />
                <span className="truncate max-w-[160px]">{att.name}</span>
                <span className="text-[10px] text-emerald-500 font-mono">
                  ({(att.size / 1024).toFixed(0)}KB)
                </span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                  className="hover:text-rose-600 rounded-full p-0.5 cursor-pointer ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}

          {/* 挂载的实体元数据 */}
          {entityRefs.map((ref) => (
            <span
              key={ref.apiKey}
              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl bg-sky-50 text-sky-700 border border-sky-200 text-[11px] font-medium"
            >
              <Box className="w-3.5 h-3.5 text-sky-500" />
              <span>@{ref.label} ({ref.apiKey})</span>
              <button
                type="button"
                onClick={() => onRemoveEntityRef(ref.apiKey)}
                className="hover:text-rose-600 rounded-full p-0.5 cursor-pointer"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}

          {/* 挂载的技能胶囊 */}
          {activeSkillIds.map((sid) => {
            const skill = availableSkills.find((s) => s.id === sid);
            if (!skill) return null;
            return (
              <span
                key={sid}
                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-medium"
              >
                <Lightbulb className="w-3.5 h-3.5 text-indigo-500" />
                <span>💡 {skill.name}</span>
                {onToggleSkill && (
                  <button
                    type="button"
                    onClick={() => onToggleSkill(sid)}
                    className="hover:text-rose-600 rounded-full p-0.5 cursor-pointer"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* 文本输入区域 */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isStreaming}
          className="w-full resize-none text-xs md:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none max-h-44 overflow-y-auto leading-relaxed bg-transparent"
        />
      </div>

      {/* 底部工具操作条 */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
          {/* 文件上传按钮 */}
          <button
            type="button"
            onClick={handleSelectFile}
            disabled={isUploading}
            title="选择或拖拽本地 Excel / CSV / 代码 / 文本文件让 AI 深度解析"
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 transition-colors cursor-pointer"
          >
            {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" /> : <Paperclip className="w-3.5 h-3.5 text-emerald-600" />}
            <span>上传文件/表格</span>
          </button>

          {/* 挂载对象元数据按钮 */}
          <button
            type="button"
            onClick={onOpenEntityPicker}
            title="选择租户对象将其字段元数据挂载到本次对话"
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
                onClick={() => setSkillPopoverOpen(!skillPopoverOpen)}
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
                    <button onClick={() => setSkillPopoverOpen(false)} className="text-slate-400 hover:text-slate-600">
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
