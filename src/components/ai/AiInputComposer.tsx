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
  Check,
  ChevronDown,
  ShieldCheck,
  Printer,
  Workflow,
  FileCheck,
  Terminal,
  Globe,
  ListTodo,
  Target,
  Database,
  Trash2,
  Minimize2,
  HelpCircle,
  FolderOpen,
  Code2
} from 'lucide-react';
import { 
  AiContextEntityRef, 
  AiFileAttachment, 
  AiSkillItem, 
  McpServerConfig, 
  AiProviderConfig,
  WorkspaceProject,
  EntityMetadata
} from '../../../shared/types';

interface SlashCommandItem {
  id: string;
  name: string;
  command: string;
  description: string;
  icon: any;
  iconColor: string;
  badge?: string;
  action: (composer: ComposerContext) => void;
}

interface ComposerContext {
  setText: React.Dispatch<React.SetStateAction<string>>;
  focusTextarea: () => void;
  onSend: (text: string) => void;
  showToast?: (type: 'success' | 'error' | 'info', text: string) => void;
  onClearSession?: () => void;
  onCompactSession?: () => void;
  onSelectPreset?: (presetId: string) => void;
  onOpenFlowManager?: () => void;
  onOpenPrintManager?: () => void;
}

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
  // Codex / DSH 风格模型选择与工作区项目状态
  configuredProviders?: AiProviderConfig[];
  currentProviderId?: string;
  currentModelId?: string;
  onSelectModel?: (providerId: string, modelId: string) => void;
  currentPresetName?: string;
  tenantName?: string;
  activeProject?: WorkspaceProject;
  onClearSession?: () => void;
  onCompactSession?: () => void;
  onSelectPreset?: (presetId: string) => void;
  onOpenFlowManager?: () => void;
  onOpenPrintManager?: () => void;
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
  placeholder = 'Ask anything, type / for commands, @ for files and entities...',
  quickPrompts = [],
  showToast,
  configuredProviders = [],
  currentProviderId,
  currentModelId,
  onSelectModel,
  currentPresetName,
  tenantName = '沙盒环境',
  activeProject,
  onClearSession,
  onCompactSession,
  onSelectPreset,
  onOpenFlowManager,
  onOpenPrintManager,
}) => {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<AiFileAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ================= 触发弹窗状态 (Trigger Menus for / and @) =================
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [mentionMenuOpen, setMentionMenuOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // 实体字典缓存
  const [cachedEntities, setCachedEntities] = useState<EntityMetadata[]>([]);
  // 工作区文件列表缓存
  const [matchedFiles, setMatchedFiles] = useState<Array<{ name: string; relativePath: string; fullPath: string; ext: string; size: number }>>([]);

  const focusTextarea = () => {
    textareaRef.current?.focus();
  };

  const composerContext: ComposerContext = {
    setText,
    focusTextarea,
    onSend: (msg: string) => onSend(msg, entityRefs, attachments, activeSkillIds, activeMcpServerIds),
    showToast,
    onClearSession,
    onCompactSession,
    onSelectPreset,
    onOpenFlowManager,
    onOpenPrintManager,
  };

  // 1. 初始化预热加载实体字典
  useEffect(() => {
    if (window.neoApi?.getEntities) {
      window.neoApi.getEntities().then((list) => {
        if (Array.isArray(list)) setCachedEntities(list);
      }).catch(() => {});
    }
  }, []);

  // 2. 动态搜索项目文件 (当输入 @ 时)
  useEffect(() => {
    if (mentionMenuOpen) {
      if (window.neoApi?.projectListFiles) {
        window.neoApi.projectListFiles({
          folderPath: activeProject?.localPath,
          query: mentionQuery,
          maxFiles: 30,
        }).then((res) => {
          if (Array.isArray(res)) setMatchedFiles(res);
        }).catch(() => {});
      }
    }
  }, [mentionMenuOpen, mentionQuery, activeProject?.localPath]);

  // 3. 高度自适应
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [text]);

  // ================= 4. 快捷指令清单 (Slash Commands) =================
  const ALL_SLASH_COMMANDS: SlashCommandItem[] = [
    {
      id: 'flow',
      command: '/flow',
      name: '自动流程架构设计与部署',
      description: '为当前对象设计状态跃迁、字段回写、循环与分支并一键代码级部署',
      icon: Workflow,
      iconColor: 'text-teal-600 bg-teal-50 border-teal-200',
      badge: '自动流程',
      action: (ctx) => {
        ctx.onSelectPreset?.('autoflow-architect');
        ctx.setText('请为【服务工单】(case) 设计一套创建或更新时自动分流派单的自动流程方案，包含网关分支判定与字段回写动作');
        ctx.focusTextarea();
      },
    },
    {
      id: 'approval',
      command: '/approval',
      name: '审批流架构与策略规划',
      description: '为业务对象规划多级审批人矩阵、编辑字段控制、加签/转办限制并输出部署方案',
      icon: FileCheck,
      iconColor: 'text-indigo-600 bg-indigo-50 border-indigo-200',
      badge: '审批流',
      action: (ctx) => {
        ctx.onSelectPreset?.('approval-architect');
        ctx.setText('请为【合同】(contract) 规划基于合同金额与折扣率分流的多级审批流方案，包含直属上级逐级审批与财务会签');
        ctx.focusTextarea();
      },
    },
    {
      id: 'print',
      command: '/print',
      name: '打印模板设计与占位符规范',
      description: '规划 Word / Excel 打印模板标记、物理表格明细循环与系统时间函数',
      icon: Printer,
      iconColor: 'text-amber-600 bg-amber-50 border-amber-200',
      badge: '打印模板',
      action: (ctx) => {
        ctx.onSelectPreset?.('print-template-architect');
        ctx.setText('请为【合同】(contract) 设计一套包含主信息、明细列表与签章的 Word 打印模板规范，输出主表占位符与物理表格明细循环语法');
        ctx.focusTextarea();
      },
    },
    {
      id: 'schema',
      command: '/schema',
      name: '数据建模与字段规划',
      description: '规范规划销售易标准与自定义实体、字段类型(itemType)、关联关系与自动建表',
      icon: Box,
      iconColor: 'text-sky-600 bg-sky-50 border-sky-200',
      badge: '数据建模',
      action: (ctx) => {
        ctx.setText('我需要设计一套业务对象，请规划其主键、核心业务字段(含精确 itemType 代码)、关联查找关系与 Schema Plan');
        ctx.focusTextarea();
      },
    },
    {
      id: 'sql',
      command: '/sql',
      name: '编写与执行 XOQL 数据库查询',
      description: '编写安全的销售易只读 SQL 查询，支持点号穿透关联与聚合分析',
      icon: Database,
      iconColor: 'text-emerald-600 bg-emerald-50 border-emerald-200',
      badge: 'XOQL 查询',
      action: (ctx) => {
        ctx.setText('请根据当前租户元数据编写一条 XOQL 查询语句，检索前 10 条业务记录并使用 execute_sql_query 工具执行返回结果');
        ctx.focusTextarea();
      },
    },
    {
      id: 'bash',
      command: '/bash',
      name: '在本地工作区终端执行命令',
      description: '调用原生 bash 工具在当前项目根目录执行 Shell 指令并捕获输出',
      icon: Terminal,
      iconColor: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      badge: '工作区终端',
      action: (ctx) => {
        ctx.setText('请在当前工作区终端执行命令：git status 并汇报工作树状态');
        ctx.focusTextarea();
      },
    },
    {
      id: 'web',
      command: '/web',
      name: '联网搜索与网页内容抓取',
      description: '调用 web_search 检索互联网最新权威信息，并通过 web_fetch 抓取网页',
      icon: Globe,
      iconColor: 'text-sky-600 bg-sky-50 border-sky-200',
      badge: '联网搜索',
      action: (ctx) => {
        ctx.setText('请使用 web_search 工具联网检索关于：');
        ctx.focusTextarea();
      },
    },
    {
      id: 'todo',
      command: '/todo',
      name: '规划与维护任务待办清单',
      description: '使用 todo_write 梳理多步骤任务的 pending、in_progress 与 completed 状态',
      icon: ListTodo,
      iconColor: 'text-orange-600 bg-orange-50 border-orange-200',
      badge: '任务管理',
      action: (ctx) => {
        ctx.setText('请使用 todo_write 工具梳理本次开发任务的待办清单并开始推进第一项');
        ctx.focusTextarea();
      },
    },
    {
      id: 'goal',
      command: '/goal',
      name: '设定工程任务目标与验收指标',
      description: '使用 create_goal 为会话设定具体可验收的完成标准与 Token 预算',
      icon: Target,
      iconColor: 'text-purple-600 bg-purple-50 border-purple-200',
      badge: '工程目标',
      action: (ctx) => {
        ctx.setText('请使用 create_goal 工具为本次任务设定明确的核心目标与验收标准');
        ctx.focusTextarea();
      },
    },
    {
      id: 'compact',
      command: '/compact',
      name: '智能压缩当前会话历史记忆',
      description: '浓缩提炼前序长对话为结构化记忆，释放大量 Token 上下文',
      icon: Minimize2,
      iconColor: 'text-indigo-600 bg-indigo-50 border-indigo-200',
      badge: '记忆压缩',
      action: (ctx) => {
        if (ctx.onCompactSession) {
          ctx.onCompactSession();
        } else {
          ctx.showToast?.('info', '当前会话轮数较少，无需压缩');
        }
        ctx.setText('');
      },
    },
    {
      id: 'clear',
      command: '/clear',
      name: '清空当前对话所有消息记录',
      description: '重置并清空当前会话的消息流，重新开始全新讨论',
      icon: Trash2,
      iconColor: 'text-rose-600 bg-rose-50 border-rose-200',
      badge: '会话清空',
      action: (ctx) => {
        ctx.onClearSession?.();
        ctx.setText('');
      },
    },
    {
      id: 'help',
      command: '/help',
      name: '查看常用命令与操作指引',
      description: '列出所有可用的快捷指令、工具驱动与智能体预设角色用法',
      icon: HelpCircle,
      iconColor: 'text-slate-600 bg-slate-100 border-slate-200',
      badge: '帮助文档',
      action: (ctx) => {
        ctx.setText('请详细介绍当前 NeoCRM 开发者工作台支持的所有快捷指令(/)、工具能力与最佳操作姿势');
        ctx.focusTextarea();
      },
    },
  ];

  // 过滤后的指令列表
  const filteredCommands = ALL_SLASH_COMMANDS.filter((c) => {
    if (!slashQuery.trim()) return true;
    const q = slashQuery.toLowerCase();
    return c.command.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
  });

  // 过滤后的实体列表
  const filteredEntities = cachedEntities.filter((e) => {
    if (!mentionQuery.trim()) return true;
    const q = mentionQuery.toLowerCase();
    return e.label.toLowerCase().includes(q) || e.apiKey.toLowerCase().includes(q);
  }).slice(0, 15);

  // 5. 监听输入内容中的 @ 与 /
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const caret = e.target.selectionStart || val.length;
    setText(val);

    const textBeforeCaret = val.slice(0, caret);

    // 检测 / (开头或者空格/换行后的 /)
    const slashMatch = textBeforeCaret.match(/(?:^|\s)\/([a-zA-Z0-9_-]*)$/);
    if (slashMatch) {
      setSlashMenuOpen(true);
      setSlashQuery(slashMatch[1]);
      setMentionMenuOpen(false);
      setSelectedIndex(0);
      return;
    } else {
      setSlashMenuOpen(false);
    }

    // 检测 @ (开头或者空格/换行后的 @)
    const atMatch = textBeforeCaret.match(/(?:^|\s)@([^\s@]*)$/);
    if (atMatch) {
      setMentionMenuOpen(true);
      setMentionQuery(atMatch[1]);
      setSlashMenuOpen(false);
      setSelectedIndex(0);
      return;
    } else {
      setMentionMenuOpen(false);
    }
  };

  // 6. 快捷键劫持 (支持上下键切换选项，Enter 或 Tab 确认)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashMenuOpen && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = filteredCommands[selectedIndex];
        if (selected) {
          executeSlashCommand(selected);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashMenuOpen(false);
        return;
      }
    }

    const totalMentions = matchedFiles.length + filteredEntities.length;
    if (mentionMenuOpen && totalMentions > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % totalMentions);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + totalMentions) % totalMentions);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (selectedIndex < matchedFiles.length) {
          handleSelectFileMention(matchedFiles[selectedIndex]);
        } else {
          const entityIdx = selectedIndex - matchedFiles.length;
          handleSelectEntityMention(filteredEntities[entityIdx]);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionMenuOpen(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // 执行选中的 Slash 命令
  const executeSlashCommand = (cmd: SlashCommandItem) => {
    setSlashMenuOpen(false);
    cmd.action(composerContext);
  };

  // 选中文件 Mention: 自动将文件解析挂载为附件上下文，并清除 @ 字符
  const handleSelectFileMention = async (file: { name: string; relativePath: string; fullPath: string; ext: string; size: number }) => {
    setMentionMenuOpen(false);
    // 从输入框中移除 @query 文本
    const caret = textareaRef.current?.selectionStart || text.length;
    const textBefore = text.slice(0, caret).replace(/(?:^|\s)@[^\s@]*$/, '');
    const textAfter = text.slice(caret);
    setText(`${textBefore} ${textAfter}`.trimStart());

    try {
      if (window.neoApi?.fileParseLocalPath) {
        const parsed = await window.neoApi.fileParseLocalPath(file.fullPath);
        setAttachments((prev) => [...prev, parsed]);
        showToast?.('success', `已自动挂载文件上下文: ${file.name}`);
      }
    } catch (e: any) {
      showToast?.('error', `读取文件失败: ${e.message}`);
    }
    focusTextarea();
  };

  // 选中业务实体 Mention: 挂载到顶部实体标签，并清除 @ 字符
  const handleSelectEntityMention = (entity: EntityMetadata) => {
    setMentionMenuOpen(false);
    const caret = textareaRef.current?.selectionStart || text.length;
    const textBefore = text.slice(0, caret).replace(/(?:^|\s)@[^\s@]*$/, '');
    const textAfter = text.slice(caret);
    setText(`${textBefore} ${textAfter}`.trimStart());

    if (!entityRefs.some((r) => r.apiKey === entity.apiKey)) {
      entityRefs.push({
        apiKey: entity.apiKey,
        label: entity.label,
        isStandard: entity.isStandard,
      });
      showToast?.('success', `已挂载业务对象: @${entity.label}`);
    }
    focusTextarea();
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
    setSlashMenuOpen(false);
    setMentionMenuOpen(false);
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

  // 当前所选模型的展示名称
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
      {/* ================= 浮层 A: 快捷指令自动匹配菜单 (/ Slash Commands) ================= */}
      {slashMenuOpen && filteredCommands.length > 0 && (
        <div className="absolute left-0 bottom-full mb-2 w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50 text-xs animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3.5 py-2 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
            <div className="flex items-center space-x-1.5 font-bold text-slate-800">
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              <span>快捷调用指令 (Slash Commands)</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">按 ↑↓ 切换 · Enter / Tab 确认</span>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100/80 p-1">
            {filteredCommands.map((cmd, idx) => {
              const Icon = cmd.icon;
              const isSelected = selectedIndex === idx;

              return (
                <div
                  key={cmd.id}
                  onClick={() => executeSlashCommand(cmd)}
                  className={`px-3 py-2 rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected ? 'bg-purple-50/80 text-purple-950 font-medium' : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                    <div className={`p-1.5 rounded-lg border shrink-0 ${cmd.iconColor}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-slate-900">{cmd.command}</span>
                        <span className="text-slate-800 font-semibold">{cmd.name}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">{cmd.description}</p>
                    </div>
                  </div>

                  {cmd.badge && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-mono shrink-0">
                      {cmd.badge}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= 浮层 B: 文件与实体智能发现菜单 (@ Mentions & Files) ================= */}
      {mentionMenuOpen && (matchedFiles.length > 0 || filteredEntities.length > 0) && (
        <div className="absolute left-0 bottom-full mb-2 w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50 text-xs animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3.5 py-2 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
            <div className="flex items-center space-x-1.5 font-bold text-slate-800">
              <FolderOpen className="w-3.5 h-3.5 text-amber-600" />
              <span>工作区文件与业务对象 (@ Mentions)</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              找到 {matchedFiles.length} 文件 / {filteredEntities.length} 对象
            </span>
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100/80 p-1">
            {/* 1. 工作区文件候选 */}
            {matchedFiles.length > 0 && (
              <div className="py-1">
                <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1">
                  <Code2 className="w-3 h-3 text-slate-400" />
                  <span>本地项目工作区文件</span>
                </div>
                {matchedFiles.map((file, idx) => {
                  const Icon = getFileIcon(file.name);
                  const isSelected = selectedIndex === idx;

                  return (
                    <div
                      key={file.fullPath}
                      onClick={() => handleSelectFileMention(file)}
                      className={`px-2.5 py-1.5 rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected ? 'bg-amber-50/80 text-amber-950 font-medium' : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center space-x-2 min-w-0 pr-2">
                        <Icon className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span className="font-semibold text-slate-900 truncate">{file.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono truncate">{file.relativePath}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono shrink-0">
                        {(file.size / 1024).toFixed(1)}KB
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 2. 销售易实体对象候选 */}
            {filteredEntities.length > 0 && (
              <div className="py-1">
                <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1">
                  <Box className="w-3 h-3 text-sky-500" />
                  <span>销售易业务对象 (@Entity)</span>
                </div>
                {filteredEntities.map((ent, idx) => {
                  const itemIndex = matchedFiles.length + idx;
                  const isSelected = selectedIndex === itemIndex;

                  return (
                    <div
                      key={ent.apiKey}
                      onClick={() => handleSelectEntityMention(ent)}
                      className={`px-2.5 py-1.5 rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected ? 'bg-sky-50/80 text-sky-950 font-medium' : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center space-x-2 min-w-0 pr-2">
                        <Box className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        <span className="font-semibold text-slate-900 truncate">{ent.label}</span>
                        <span className="text-[10px] text-slate-400 font-mono truncate">({ent.apiKey})</span>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 font-mono shrink-0">
                        {ent.isStandard ? '标准' : '自定义'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

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
                  className="hover:text-rose-500 ml-1 cursor-pointer"
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
                className="hover:text-rose-500 ml-1 cursor-pointer"
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
        onChange={handleInputChange}
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
              title="添加附件、引用对象或快捷指令"
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
                  <span>上传 Excel / 本地文件分析</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlusMenuOpen(false);
                    setText((prev) => prev + '@');
                    setMentionMenuOpen(true);
                    focusTextarea();
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center space-x-2 cursor-pointer"
                >
                  <FolderOpen className="w-4 h-4 text-amber-600" />
                  <span>查找项目文件或对象 (@)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlusMenuOpen(false);
                    setText((prev) => prev + '/');
                    setSlashMenuOpen(true);
                    focusTextarea();
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center space-x-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <span>调用快捷指令 (/)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlusMenuOpen(false);
                    onOpenEntityPicker();
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center space-x-2 cursor-pointer border-t border-slate-100"
                >
                  <Box className="w-4 h-4 text-sky-600" />
                  <span>浏览业务对象完整字典</span>
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

          {/* Full access / 沙盒权限胶囊 */}
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
