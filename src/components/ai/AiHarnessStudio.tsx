import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  AiChatSession, 
  AiSessionMode,
  AiChatMessage, 
  AiProviderConfig, 
  AiHarnessSettings, 
  AiContextEntityRef,
  AiFileAttachment,
  AiSkillItem,
  McpServerConfig,
  SessionState,
  SchemaPlanPayload,
  WorkflowDeployPlan,
  WorkflowLicenseStatus
} from '../../../shared/types';
import { AI_AGENT_PRESETS, BUILTIN_AI_PROVIDERS, DEFAULT_AI_SETTINGS, BUILTIN_AI_SKILLS } from '../../../shared/constants';
import { AiSidebar } from './AiSidebar';
import { AiMessageItem } from './AiMessageItem';
import { AiInputComposer } from './AiInputComposer';
import { ContextEntityModal } from './ContextEntityModal';
import { ConfirmCreateSchemaModal } from './ConfirmCreateSchemaModal';
import { ConfirmDeployWorkflowModal } from "./ConfirmDeployWorkflowModal";
import { ConfirmDeployApprovalModal } from "./ConfirmDeployApprovalModal";
import { FlowManagerModal } from "./FlowManagerModal";
import { WorkspaceProject } from "../../../shared/types";
import { PrintTemplateManagerModal } from "./PrintTemplateManagerModal";
import { CodexTerminalPanel } from "./CodexTerminalPanel";
import { ApprovalDeployPlan } from "../../../shared/types";
import { WorkflowLicenseModal } from './WorkflowLicenseModal';
import { 
  Sparkles, 
  Settings, 
  KeyRound, 
  CheckCircle2, 
  Download, 
  Trash2, 
  BrainCircuit, 
  Wrench,
  ChevronDown,
  Box,
  ExternalLink,
  ShieldCheck,
  Minimize2,
  Loader2,
  Lightbulb,
  Lock,
  Unlock,
  Layers,
  Printer,
  Workflow,
  PanelRight,
  MoreHorizontal,
  Folder,
  RotateCcw
} from 'lucide-react';

interface AiHarnessStudioProps {
  crmSession: SessionState;
  onNavigateToSettings: (tab?: string) => void;
  onNavigateToMetadata?: () => void;
  onNavigateToData?: () => void;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
  activeSessionId?: string | null;
  onSelectSession?: (id: string | null) => void;
  sessions?: AiChatSession[];
  onSessionsChange?: (sessions: AiChatSession[]) => void;
  selectedPresetId?: string;
  onSelectPreset?: (presetId: string) => void;
  workflowLicenseStatus?: WorkflowLicenseStatus | null;
  activeProject?: WorkspaceProject;
  onOpenFlowManager?: () => void;
  onOpenPrintManager?: () => void;
  onOpenLicenseModal?: () => void;
}

export const AiHarnessStudio: React.FC<AiHarnessStudioProps> = ({
  crmSession,
  onNavigateToSettings,
  onNavigateToMetadata,
  onNavigateToData,
  showToast,
  activeSessionId: propActiveSessionId,
  onSelectSession: propOnSelectSession,
  sessions: propSessions,
  onSessionsChange: propOnSessionsChange,
  selectedPresetId: propSelectedPresetId,
  onSelectPreset: propOnSelectPreset,
  workflowLicenseStatus: propWorkflowLicenseStatus,
  activeProject,
  onOpenFlowManager,
  onOpenPrintManager,
  onOpenLicenseModal,
}) => {
  const [isTerminalOpen, setIsTerminalOpen] = useState<boolean>(false);
  const [activePanelTab, setActivePanelTab] = useState<"files" | "changes" | "jobs" | "artifacts" | "terminal" | "tools">("files");

  // DSH 模式切换 (Standard / PTC / Minimal / Plan)
  const [currentSessionMode, setCurrentSessionMode] = useState<AiSessionMode>("standard");

  const handleToggleMode = async (newMode: AiSessionMode) => {
    setCurrentSessionMode(newMode);
    if (!activeSession) return;
    const updated: AiChatSession = {
      ...activeSession,
      mode: newMode,
      updatedAt: Date.now(),
    };
    const savedList = await window.neoApi.aiSaveSession(updated);
    setSessions(savedList.filter((s) => s.messages && s.messages.length > 0));
  };
  const [moreMenuOpen, setMoreMenuOpen] = useState<boolean>(false);
  const [pendingComposerAttachment, setPendingComposerAttachment] = useState<AiFileAttachment | null>(null);
  const [activeExecutedSql, setActiveExecutedSql] = useState<string | null>(null);
  const [providers, setProviders] = useState<AiProviderConfig[]>(BUILTIN_AI_PROVIDERS);
  const [settings, setSettings] = useState<AiHarnessSettings>(DEFAULT_AI_SETTINGS);
  const [skills, setSkills] = useState<AiSkillItem[]>(BUILTIN_AI_SKILLS);
  const [activeSkillIds, setActiveSkillIds] = useState<string[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
  const [activeMcpServerIds, setActiveMcpServerIds] = useState<string[]>([]);
  const [sessions, setSessionsState] = useState<AiChatSession[]>([]);
  const sessionsRef = useRef<AiChatSession[]>([]);
  sessionsRef.current = sessions;

  // 严格在挂载或外部非流式更新时同步 sessions
  useEffect(() => {
    if (propSessions && propSessions.length > 0 && !streamingRequestId) {
      setSessionsState(propSessions);
      sessionsRef.current = propSessions;
    }
  }, [propSessions]);

  const setSessions = (updater: AiChatSession[] | ((prev: AiChatSession[]) => AiChatSession[])) => {
    setSessionsState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      sessionsRef.current = next;
      propOnSessionsChange?.(next);
      return next;
    });
  };

  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(propActiveSessionId || null);

  useEffect(() => {
    if (propActiveSessionId !== undefined && propActiveSessionId !== activeSessionId) {
      setActiveSessionIdState(propActiveSessionId);
    }
  }, [propActiveSessionId]);

  const setActiveSessionId = (id: string | null) => {
    setActiveSessionIdState(id);
    propOnSelectSession?.(id);
  };

  const [selectedPresetId, setSelectedPresetIdState] = useState<string>(propSelectedPresetId || 'harness-agent');

  useEffect(() => {
    if (propSelectedPresetId !== undefined && propSelectedPresetId !== selectedPresetId) {
      setSelectedPresetIdState(propSelectedPresetId);
    }
  }, [propSelectedPresetId]);

  const setSelectedPresetId = (pid: string) => {
    setSelectedPresetIdState(pid);
    propOnSelectPreset?.(pid);
  };

  // 个人专属技能（系统内置技能受安全保护，仅由专属智能体角色驱动，禁止在其他对话随意挂载选择）
  const personalSkills = useMemo(
    () => skills.filter((s) => s.category === "personal" && s.enabled),
    [skills]
  );
  const personalSkillIds = useMemo(
    () => new Set(personalSkills.map((s) => s.id)),
    [personalSkills]
  );

  // 当前对话所选供应商与模型
  const [currentProviderId, setCurrentProviderId] = useState<string>('deepseek');
  const [currentModelId, setCurrentModelId] = useState<string>('deepseek-chat');
  const [enableTools, setEnableTools] = useState<boolean>(true);
  const [entityRefs, setEntityRefs] = useState<AiContextEntityRef[]>([]);
  const [isEntityModalOpen, setIsEntityModalOpen] = useState<boolean>(false);

  // 实体与字段数据建模创建确认模态框状态
  const [pendingSchemaPlan, setPendingSchemaPlan] = useState<SchemaPlanPayload | null>(null);
  const [pendingWorkflowPlan, setPendingWorkflowPlan] = useState<WorkflowDeployPlan | null>(null);
  const [pendingApprovalPlan, setPendingApprovalPlan] = useState<ApprovalDeployPlan | null>(null);
  const [isFlowManagerOpen, setIsFlowManagerOpen] = useState<boolean>(false);
  const [isPrintManagerOpen, setIsPrintManagerOpen] = useState<boolean>(false);

  // 流程引擎 (自动流程 & 审批流) 本地离线设备锁状态
  const [internalLicenseStatus, setInternalLicenseStatus] = useState<WorkflowLicenseStatus | null>(null);
  const workflowLicenseStatus = propWorkflowLicenseStatus !== undefined ? propWorkflowLicenseStatus : internalLicenseStatus;
  const setWorkflowLicenseStatus = (l: WorkflowLicenseStatus | null) => setInternalLicenseStatus(l);
  const [isLicenseModalOpen, setIsLicenseModalOpen] = useState<boolean>(false);
  const [pendingAfterUnlock, setPendingAfterUnlock] = useState<
    | { type: "preset"; presetId: string }
    | { type: "session"; sessionId: string }
    | { type: "skill"; skillId: string }
    | { type: "deploy"; plan: WorkflowDeployPlan }
    | { type: "deployApproval"; plan: ApprovalDeployPlan }
    | null
  >(null);

  const isFlowEnginePreset = (id?: string) =>
    id === "autoflow-architect" || id === "approval-architect" || id === "neobi-architect" || id === "nex-architect";

  // 上下文压缩状态
  const [isCompacting, setIsCompacting] = useState(false);
  const [showCompactionDetail, setShowCompactionDetail] = useState(false);

  // 快速配置 API Key 状态
  const [quickApiKey, setQuickApiKey] = useState<string>('');
  const [savingQuickKey, setSavingQuickKey] = useState<boolean>(false);

  // 流式生成状态
  const [streamingRequestId, setStreamingRequestId] = useState<string | null>(null);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const reasoningStartTimeRef = useRef<number | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // 判断供应商是否已配置完成
  const isProviderConfigured = (p?: AiProviderConfig | null) =>
    Boolean(
      p &&
        ((p.apiKey && p.apiKey.trim()) ||
          p.id === "ollama" ||
          p.id === "workbuddy" ||
          p.baseUrl?.includes("localhost") ||
          p.baseUrl?.includes("127.0.0.1")) &&
        Array.isArray(p.models) &&
        p.models.length > 0
    );

  // 初始化加载配置和会话
  const loadData = async () => {
    try {
      let configuredList: AiProviderConfig[] = [];
      let fallbackProvId = "deepseek";
      let fallbackModId = "deepseek-chat";
      let currentLoadedSkills: AiSkillItem[] = BUILTIN_AI_SKILLS;

      if (window.neoApi?.aiGetConfig) {
        const cfg = await window.neoApi.aiGetConfig();
        setProviders(cfg.providers);
        setSettings(cfg.settings);
        if (cfg.skills) {
          setSkills(cfg.skills);
          currentLoadedSkills = cfg.skills;
        }
        if (cfg.mcpServers) {
          setMcpServers(cfg.mcpServers);
          const enabledCustom = cfg.mcpServers
            .filter((m) => m.type !== "builtin" && m.id !== "neocrm-paas-mcp" && m.enabled)
            .map((m) => m.id);
          setActiveMcpServerIds(enabledCustom);
        }

        configuredList = cfg.providers.filter((p) => isProviderConfigured(p));
        const defaultProv = configuredList.find((p) => p.id === cfg.settings.defaultProviderId) || configuredList[0];
        if (defaultProv) {
          fallbackProvId = defaultProv.id;
          const hasDefaultMod = defaultProv.models.some((m) => m.id === cfg.settings.defaultModelId);
          fallbackModId = hasDefaultMod ? cfg.settings.defaultModelId : defaultProv.models[0].id;
        } else {
          fallbackProvId = cfg.settings.defaultProviderId || "deepseek";
          fallbackModId = cfg.settings.defaultModelId || "deepseek-chat";
        }

        setCurrentProviderId(fallbackProvId);
        setCurrentModelId(fallbackModId);
        setEnableTools(cfg.settings.enableCrmTools);
      }
      let licStatus: WorkflowLicenseStatus | null = null;
      if (window.neoApi?.workflowGetLicenseStatus) {
        licStatus = await window.neoApi.workflowGetLicenseStatus();
        setWorkflowLicenseStatus(licStatus);
      }
      if (window.neoApi?.aiGetSessions) {
        const list = await window.neoApi.aiGetSessions();
        const validList = list.filter((s) => s.messages && s.messages.length > 0);
        setSessions(validList);
        if (validList.length > 0 && !activeSessionId) {
          const first = validList[0];
          if (isFlowEnginePreset(first.presetId) && !licStatus?.isAuthorized) {
            setSelectedPresetId("harness-agent");
          } else {
            setActiveSessionId(first.id);
            setSelectedPresetId(first.presetId || "harness-agent");
            const sessProv = configuredList.find((p) => p.id === first.providerId);
            if (sessProv) {
              setCurrentProviderId(sessProv.id);
              const hasMod = sessProv.models.some((m) => m.id === first.modelId);
              setCurrentModelId(hasMod && first.modelId ? first.modelId : sessProv.models[0].id);
            }
            if (first.activeSkillIds) {
              const pSet = new Set(currentLoadedSkills.filter((s: AiSkillItem) => s.category === "personal" && s.enabled).map((s: AiSkillItem) => s.id));
              setActiveSkillIds(first.activeSkillIds.filter((sid) => pSet.has(sid)));
            }
          }
        }
      }
    } catch (e: any) {
      console.error("加载 AI 数据异常:", e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;

  useEffect(() => {
    if (activeSession?.mode) {
      setCurrentSessionMode(activeSession.mode);
    }
  }, [activeSessionId, activeSession?.mode]);

  // 关键修复：当切换会话时，将滚动位置重置到顶部 (scrollTop = 0)，保证用户从头完整阅读提问与回答！
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = 0;
    }
  }, [activeSessionId]);

  // 仅在发送新消息或流式输出新增量时，平滑跟随到底部
  useEffect(() => {
    if (streamingMessageId && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [streamingMessageId]);

  // 订阅流式事件
  useEffect(() => {
    if (!window.neoApi?.onAiStreamEvent) return;

    const unsubscribe = window.neoApi.onAiStreamEvent((event) => {
      const { sessionId, messageId, type, delta, toolCall, error, compactionSummary } = event;

      // 捕获后台自动压缩完成事件，实时更新会话中的 compactionSummary
      if (type === 'compaction_done' && compactionSummary) {
        setSessions((prevSessions) => {
          return prevSessions.map((sess) => {
            if (sess.id !== sessionId) return sess;
            return {
              ...sess,
              compactionSummary,
              updatedAt: Date.now(),
            };
          });
        });
        return;
      }

      setSessions((prevSessions) => {
        const updated = prevSessions.map((sess) => {
          if (sess.id !== sessionId) return sess;

          const msgs = sess.messages.map((msg) => {
            if (msg.id !== messageId) return msg;

            if (type === 'reasoning_delta' && delta) {
              if (!reasoningStartTimeRef.current) {
                reasoningStartTimeRef.current = Date.now();
              }
              return {
                ...msg,
                reasoningContent: (msg.reasoningContent || '') + delta,
              };
            }

            if (type === 'content_delta' && delta) {
              let duration = msg.reasoningDurationMs;
              if (reasoningStartTimeRef.current && !duration) {
                duration = Date.now() - reasoningStartTimeRef.current;
              }
              return {
                ...msg,
                content: (msg.content || '') + delta,
                reasoningDurationMs: duration,
              };
            }

            if (type === 'tool_start' && toolCall) {
              const existingTools = msg.toolCalls || [];
              return {
                ...msg,
                toolCalls: [...existingTools, toolCall],
              };
            }

            if (type === 'tool_update' && toolCall) {
              const existingTools = msg.toolCalls || [];
              return {
                ...msg,
                toolCalls: existingTools.map((t) => (t.id === toolCall.id ? toolCall : t)),
              };
            }

            if (type === 'error') {
              return {
                ...msg,
                error: error || '请求发生未知错误',
              };
            }

            return msg;
          });

          const newSess = {
            ...sess,
            messages: msgs,
            updatedAt: Date.now(),
          };

          if (type === 'done' || type === 'error') {
            window.neoApi.aiSaveSession(newSess).catch(() => {});
          }

          return newSess;
        });

        return updated;
      });

      if (type === 'done' || type === 'error') {
        setStreamingRequestId(null);
        setStreamingMessageId(null);
        reasoningStartTimeRef.current = null;
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // 新建对话草稿
  const handleNewChatDraft = () => {
    setActiveSessionId(null);
    const p = AI_AGENT_PRESETS.find((item) => item.id === selectedPresetId);
    if (p) {
      setEnableTools(p.enableCrmTools);
      if (p.recommendedModel && currentProviderId === 'deepseek') {
        setCurrentModelId(p.recommendedModel);
      }
    }
  };

  // 一键执行上下文压缩 (Context Compaction)
  const handleCompactSession = async () => {
    if (!activeSession || activeSession.messages.length <= 4 || isCompacting) return;
    setIsCompacting(true);
    try {
      if (window.neoApi?.aiCompactSession) {
        const compacted = await window.neoApi.aiCompactSession(activeSession.id);
        if (compacted) {
          setSessions((prev) => prev.map((s) => (s.id === compacted.id ? compacted : s)));
          showToast('success', `上下文压缩成功！已浓缩前 ${compacted.compactionSummary?.originalMessageCount} 轮对话，释放大量 Token。`);
        }
      }
    } catch (e: any) {
      showToast('error', `压缩失败: ${e.message}`);
    } finally {
      setIsCompacting(false);
    }
  };

  // 删除会话
  const handleDeleteSession = async (sessionId: string) => {
    const list = await window.neoApi.aiDeleteSession(sessionId);
    setSessions(list.filter((s) => s.messages && s.messages.length > 0));
    if (activeSessionId === sessionId) {
      setActiveSessionId(list[0]?.id || null);
    }
  };

  // 重命名会话
  const handleUpdateSessionTitle = async (sessionId: string, title: string) => {
    const target = sessions.find((s) => s.id === sessionId);
    if (!target) return;
    const updated = { ...target, title, updatedAt: Date.now() };
    const list = await window.neoApi.aiSaveSession(updated);
    setSessions(list.filter((s) => s.messages && s.messages.length > 0));
  };

  // 清空所有会话
  const handleClearSessions = async () => {
    await window.neoApi.aiClearSessions();
    setSessions([]);
    setActiveSessionId(null);
    showToast('info', '已清空所有历史对话');
  };

  // 快速保存当前供应商 API Key
  const handleSaveQuickApiKey = async () => {
    if (!quickApiKey.trim()) {
      showToast('error', `请输入有效的 API Key`);
      return;
    }
    setSavingQuickKey(true);
    try {
      const targetProvider = providers.find((p) => p.id === currentProviderId) || providers[0];
      const updatedProvider: AiProviderConfig = {
        ...targetProvider,
        apiKey: quickApiKey.trim(),
        enabled: true,
      };
      const newProviders = await window.neoApi.aiSaveProvider(updatedProvider);
      setProviders(newProviders);
      setQuickApiKey('');
      showToast('success', `${targetProvider.name} API Key 已保存并激活，现在可以直接开始对话！`);
    } catch (e: any) {
      showToast('error', `保存失败: ${e.message}`);
    } finally {
      setSavingQuickKey(false);
    }
  };

  // 发送消息
  const handleSendMessage = async (
    text: string,
    refs?: AiContextEntityRef[],
    attachments?: AiFileAttachment[],
    skillIds?: string[],
    mcpIds?: string[]
  ) => {
    let targetSession = sessionsRef.current.find((s) => s.id === activeSessionId) || activeSession;
    const preset = AI_AGENT_PRESETS.find((p) => p.id === selectedPresetId) || AI_AGENT_PRESETS[0];

    // 仅允许挂载已启用的个人专属技能，内置技能受安全保护禁止随意挂载
    const effectiveSkills = (skillIds || activeSkillIds).filter((sid) => personalSkillIds.has(sid));
    if (isFlowEnginePreset(preset.id)) {
      const latestLic = window.neoApi?.workflowGetLicenseStatus
        ? await window.neoApi.workflowGetLicenseStatus()
        : workflowLicenseStatus;
      if (latestLic) setWorkflowLicenseStatus(latestLic);
      if (!latestLic?.isAuthorized) {
        setIsLicenseModalOpen(true);
        const pId = preset.id as string;
        const featureName = pId === "neobi-architect" ? "BI分析部署大师" : pId === "nex-architect" ? "Nex页面扩展大师" : "流程引擎";
        showToast("info", `🔒 ${featureName}高级功能已上锁，请先输入绑定本机的加密密码完成设备激活`);
        return;
      }
    }

    const effectiveTitle = text.slice(0, 22) + (text.length > 22 ? '...' : '') || (attachments?.[0]?.name ? `分析 ${attachments[0].name}` : '新对话');

    if (!targetSession) {
      targetSession = {
        id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: effectiveTitle,
        projectId: activeProject?.id,
        presetId: preset.id,
        providerId: currentProvider?.id || currentProviderId,
        modelId: currentProvider?.models?.some((m) => m.id === currentModelId) ? currentModelId : (currentProvider?.models?.[0]?.id || currentModelId),
        messages: [],
        activeSkillIds: skillIds || activeSkillIds,
        mode: currentSessionMode,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    } else if (targetSession.messages.length === 0) {
      targetSession = {
        ...targetSession,
        title: effectiveTitle,
        activeSkillIds: skillIds || activeSkillIds,
        mode: targetSession.mode || currentSessionMode,
      };
    }

    const userMsg: AiChatMessage = {
      id: `msg_u_${Date.now()}`,
      role: 'user',
      content: text,
      entityRefs: refs && refs.length > 0 ? [...refs] : undefined,
      attachments: attachments && attachments.length > 0 ? [...attachments] : undefined,
      skillIds: skillIds && skillIds.length > 0 ? [...skillIds] : undefined,
      createdAt: Date.now(),
    };

    const assistantMsgId = `msg_a_${Date.now() + 1}`;
    const assistantMsg: AiChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      providerId: currentProviderId,
      modelId: currentModelId,
      createdAt: Date.now() + 1,
    };

    // 严格过滤掉由于网络中断或流式中止残留在历史中的空白 assistant 消息，保证前文绝对干净
    const cleanHistory = (targetSession.messages || []).filter(
      (m) => m.role === 'user' || (m.role === 'assistant' && ((m.content && m.content.trim()) || (m.toolCalls && m.toolCalls.length > 0)))
    );

    const updatedMessages = [...cleanHistory, userMsg, assistantMsg];
    const updatedSession: AiChatSession = {
      ...targetSession,
      providerId: currentProviderId,
      modelId: currentModelId,
      messages: updatedMessages,
      activeSkillIds: skillIds || activeSkillIds,
      mode: targetSession.mode || currentSessionMode,
      updatedAt: Date.now(),
    };

    const savedList = await window.neoApi.aiSaveSession(updatedSession);
    setSessions(savedList.filter((s) => s.messages && s.messages.length > 0));
    setActiveSessionId(updatedSession.id);

    const requestId = `req_${Date.now()}`;
    setStreamingRequestId(requestId);
    setStreamingMessageId(assistantMsgId);
    reasoningStartTimeRef.current = null;

    const effectiveMcpIds = mcpIds !== undefined ? mcpIds : activeMcpServerIds;
    await window.neoApi.aiStartChatStream({
      requestId,
      sessionId: updatedSession.id,
      messageId: assistantMsgId,
      providerId: currentProvider?.id || currentProviderId,
      modelId: currentProvider?.models?.some((m) => m.id === currentModelId) ? currentModelId : (currentProvider?.models?.[0]?.id || currentModelId),
      presetPrompt: preset.systemPrompt,
      messages: [...cleanHistory, userMsg],
      enableTools,
      activeSkillIds: skillIds || activeSkillIds,
      activeMcpServerIds: effectiveMcpIds,
      compactionSummary: targetSession.compactionSummary,
      projectPath: activeProject?.localPath,
      mode: updatedSession.mode || currentSessionMode || 'standard',
    });
  };

  // 停止生成
  const handleStopStream = async () => {
    if (streamingRequestId) {
      await window.neoApi.aiAbortChatStream(streamingRequestId);
      setStreamingRequestId(null);
      setStreamingMessageId(null);
    }
  };

  // 导出当前会话为 Markdown
  const handleExportMarkdown = () => {
    if (!activeSession || activeSession.messages.length === 0) return;
    const lines: string[] = [
      `# ${activeSession.title}`,
      `> 导出时间: ${new Date().toLocaleString()} | 模型: ${activeSession.modelId}`,
      '',
    ];
    if (activeSession.compactionSummary) {
      lines.push(`> 历史压缩摘要: ${activeSession.compactionSummary.summary}\n`);
    }
    for (const m of activeSession.messages) {
      if (m.role === 'user') {
        lines.push(`## 👤 用户\n\n${m.content}\n`);
      } else if (m.role === 'assistant') {
        lines.push(`## 🤖 AI 助手 (${m.modelId || ''})\n`);
        if (m.reasoningContent) {
          lines.push(`<details><summary>深度思考过程</summary>\n\n${m.reasoningContent}\n\n</details>\n`);
        }
        lines.push(`${m.content}\n`);
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeSession.title.replace(/[\\/:*?"<>|]/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('success', '已导出 Markdown 文件');
  };

  const configuredProviders = providers.filter((p) => isProviderConfigured(p));
  const currentProvider =
    configuredProviders.find((p) => p.id === currentProviderId) ||
    configuredProviders[0] ||
    providers.find((p) => p.id === currentProviderId) ||
    providers[0];
  const currentPreset = AI_AGENT_PRESETS.find((p) => p.id === selectedPresetId) || AI_AGENT_PRESETS[0];
  const isCurrentProviderConfigured = isProviderConfigured(currentProvider);

  const activeToolCalls = activeSession?.messages?.flatMap((m) => m.toolCalls || []) || [];

  return (
    <div className="bg-white overflow-hidden flex flex-1 h-full w-full min-h-0 min-w-0">


      {/* 中部主对话画布 (Codex 样式无缝极简画布) */}
      <div className="flex-1 flex flex-col bg-white min-w-0 min-h-0 h-full overflow-hidden">
        {/* 顶部 Codex 风格标题与分栏控制栏 */}
        <div className="h-11 px-4 bg-white border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2 min-w-0">
            <Folder className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <h2 className="text-xs font-semibold text-slate-800 truncate">
              {activeSession ? activeSession.title : currentPreset.name}
            </h2>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 font-mono shrink-0">
              {currentPreset.name.split(" (")[0]}
            </span>

            {/* 自动流程与审批流角色专属设备安全锁与剩余天数状态 (点击可查看或更换密码) */}
            {isFlowEnginePreset(currentPreset.id) && (
              <button
                type="button"
                onClick={() => onOpenLicenseModal ? onOpenLicenseModal() : setIsLicenseModalOpen(true)}
                className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold border flex items-center space-x-1 transition-all cursor-pointer shrink-0 ${
                  workflowLicenseStatus?.isAuthorized
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 shadow-2xs"
                    : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 shadow-2xs"
                }`}
                title="点击查看设备机器码、有效天数或更换授权密码"
              >
                {workflowLicenseStatus?.isAuthorized ? (
                  <>
                    <Unlock className="w-2.5 h-2.5 text-emerald-600 mr-0.5 shrink-0" />
                    <span>设备已绑定 · 剩余 {workflowLicenseStatus.remainingDays} 天</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-2.5 h-2.5 text-amber-600 mr-0.5 shrink-0" />
                    <span>已上锁 · 点击输入密码</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* 右侧动作控制区 (流程库、模板库、更多选项、分栏展开切换) */}
          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onOpenFlowManager ? onOpenFlowManager() : setIsFlowManagerOpen(true)}
              className="text-[11px] px-2 py-0.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center space-x-1 transition-all cursor-pointer font-medium"
              title="查看与管理租户现有工作流和审批流资产"
            >
              <Workflow className="w-3 h-3 text-teal-600" />
              <span>流程库</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenPrintManager ? onOpenPrintManager() : setIsPrintManagerOpen(true)}
              className="text-[11px] px-2 py-0.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 flex items-center space-x-1 transition-all cursor-pointer font-medium"
              title="查看与管理租户已配置的 Word/Excel 打印模板资产"
            >
              <Printer className="w-3 h-3 text-amber-600" />
              <span>模板库</span>
            </button>

            {/* 更多操作菜单 */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                title="更多操作"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>

              {moreMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                  {activeSession && activeSession.messages.length >= 4 && (
                    <button
                      onClick={() => {
                        setMoreMenuOpen(false);
                        handleCompactSession();
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-50 text-indigo-700 flex items-center space-x-2 cursor-pointer"
                    >
                      <Minimize2 className="w-3.5 h-3.5" />
                      <span>压缩历史记忆</span>
                    </button>
                  )}
                  {activeSession && activeSession.messages.length > 0 && (
                    <button
                      onClick={() => {
                        setMoreMenuOpen(false);
                        handleExportMarkdown();
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-50 text-slate-700 flex items-center space-x-2 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>导出为 Markdown</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setMoreMenuOpen(false);
                      onNavigateToSettings('models');
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-slate-50 text-slate-700 flex items-center space-x-2 cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>AI 模型服务设置</span>
                  </button>
                </div>
              )}
            </div>

            {/* Codex 风格右侧分栏终端切换按钮 */}
            <button
              type="button"
              onClick={() => setIsTerminalOpen(!isTerminalOpen)}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                isTerminalOpen
                  ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                  : "border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              }`}
              title={isTerminalOpen ? "收起右侧执行终端与调用日志" : "展开右侧执行终端与调用日志 (Codex Split View)"}
            >
              <PanelRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 中部消息流展示区 (严格受限于视口，具备独立滚轮滚动与自适应高度) */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 md:px-8 py-4 min-h-0">
          {/* 未配置 API Key 时的极速激活横幅 */}
          {!isCurrentProviderConfigured && (
            <div className="mb-6 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-sky-50 p-4 shadow-xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start space-x-3">
                  <div className="p-2 rounded-xl bg-amber-100 text-amber-700 shrink-0 mt-0.5">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs md:text-sm font-bold text-slate-800 flex items-center space-x-2">
                      <span>当前供应商 [{currentProvider?.name}] 尚未配置 API Key</span>
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      您可以直接在右侧粘贴您的 API Key 立即激活，或前往【系统设置】进行详细管理。
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <div className="flex items-center space-x-2">
                    <input
                      type="password"
                      value={quickApiKey}
                      onChange={(e) => setQuickApiKey(e.target.value)}
                      placeholder={currentProviderId === 'gemini' ? '粘贴 AIzaSy... 密钥' : '粘贴 API Key 快速激活'}
                      className="px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-sky-500 w-56 font-mono"
                    />
                    <button
                      onClick={handleSaveQuickApiKey}
                      disabled={savingQuickKey}
                      className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium shadow-xs cursor-pointer shrink-0"
                    >
                      {savingQuickKey ? '保存中...' : '立即激活'}
                    </button>
                  </div>
                  <button
                    onClick={() => onNavigateToSettings('models')}
                    className="px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-medium cursor-pointer"
                  >
                    前往设置
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 空会话欢迎引导页 */}
          {(!activeSession || activeSession.messages.length === 0) ? (
            <div className="max-w-3xl mx-auto py-8 space-y-6">
              <div className="text-center space-y-2.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-600 via-indigo-600 to-blue-500 text-white flex items-center justify-center mx-auto shadow-md shadow-sky-500/20">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">
                  {currentPreset.name}
                </h3>
                <p className="text-xs text-slate-500 max-w-lg mx-auto leading-relaxed">
                  {currentPreset.description}
                </p>

                {/* 当前租户连接状态提示 */}
                <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white border border-slate-200 text-[11px] text-slate-600 shadow-2xs">
                  <ShieldCheck className={`w-3.5 h-3.5 ${crmSession.isLoggedIn ? 'text-emerald-500' : 'text-amber-500'}`} />
                  <span>
                    {crmSession.isLoggedIn
                      ? `已连接租户: ${crmSession.tokenData?.userInfo?.tenantName || crmSession.environment?.name}`
                      : '未登录销售易租户（登录后 AI 可直接读取您的真实对象与执行 SQL）'}
                  </span>
                </div>
              </div>

              {/* 快捷指令卡片网格 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                {currentPreset.quickPrompts.map((prompt, index) => (
                  <button
                    key={index}
                    onClick={() => handleSendMessage(prompt, entityRefs)}
                    className="text-left p-3.5 rounded-2xl bg-white hover:bg-sky-50/60 border border-slate-200/90 hover:border-sky-300 transition-all shadow-2xs group cursor-pointer"
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-xs font-medium text-slate-700 group-hover:text-sky-800 leading-relaxed">
                        {prompt}
                      </span>
                      <Sparkles className="w-3.5 h-3.5 text-slate-300 group-hover:text-sky-500 shrink-0 ml-2 mt-0.5 transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-4">
              {/* 历史对话压缩记忆卡片 */}
              {activeSession.compactionSummary && (
                <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50/70 via-sky-50/40 to-white p-3.5 shadow-2xs text-xs">
                  <div
                    onClick={() => setShowCompactionDetail(!showCompactionDetail)}
                    className="flex items-center justify-between cursor-pointer text-indigo-900 font-semibold"
                  >
                    <div className="flex items-center space-x-2">
                      <Minimize2 className="w-3.5 h-3.5 text-indigo-600" />
                      <span>
                        🗜️ 历史上下文已智能压缩 (已浓缩前 {activeSession.compactionSummary.originalMessageCount} 轮对话)
                      </span>
                    </div>
                    <span className="text-[11px] text-indigo-500 font-normal">
                      {showCompactionDetail ? '收起摘要' : '查看压缩记忆'}
                    </span>
                  </div>
                  {showCompactionDetail && (
                    <div className="mt-2.5 pt-2.5 border-t border-indigo-100 text-slate-600 leading-relaxed whitespace-pre-wrap bg-white/70 p-2.5 rounded-xl border">
                      {activeSession.compactionSummary.summary}
                    </div>
                  )}
                </div>
              )}

              {/* 消息列表 */}
              {activeSession.messages.map((msg, idx) => (
                <AiMessageItem
                  key={msg.id}
                  message={msg}
                  isStreamingCurrent={streamingMessageId === msg.id}
                  isLastMessage={idx === activeSession.messages.length - 1}
                  projectPath={activeProject?.localPath}
                  onOpenCreateSchema={(plan) => setPendingSchemaPlan(plan)}
                  onOpenDeployWorkflow={async (plan) => {
                    const latestLic = window.neoApi?.workflowGetLicenseStatus
                      ? await window.neoApi.workflowGetLicenseStatus()
                      : workflowLicenseStatus;
                    if (latestLic) setWorkflowLicenseStatus(latestLic);
                    if (!latestLic?.isAuthorized) {
                      setPendingAfterUnlock({ type: "deploy", plan });
                      setIsLicenseModalOpen(true);
                      return;
                    }
                    setPendingWorkflowPlan(plan);
                  }}
                  onOpenDeployApproval={async (plan) => {
                    const latestLic = window.neoApi?.workflowGetLicenseStatus
                      ? await window.neoApi.workflowGetLicenseStatus()
                      : workflowLicenseStatus;
                    if (latestLic) setWorkflowLicenseStatus(latestLic);
                    if (!latestLic?.isAuthorized) {
                      setPendingAfterUnlock({ type: "deployApproval", plan });
                      setIsLicenseModalOpen(true);
                      return;
                    }
                    setPendingApprovalPlan(plan);
                  }}
                  onOpenArtifactsPanel={() => setIsTerminalOpen(true)}
                  onSendMessage={(txt) => handleSendMessage(txt)}
                  showToast={showToast}
                />
              ))}
              {/* end marker */}
            </div>
          )}
        </div>

        {/* 底部多功能输入框 */}
        <div className="p-3.5 bg-transparent shrink-0">
          <div className="max-w-3xl mx-auto">
            <AiInputComposer
              isStreaming={!!streamingRequestId}
              onSend={handleSendMessage}
              onStop={handleStopStream}
              entityRefs={entityRefs}
              onRemoveEntityRef={(apiKey) =>
                setEntityRefs((prev) => prev.filter((r) => r.apiKey !== apiKey))
              }
              onOpenEntityPicker={() => setIsEntityModalOpen(true)}
              enableTools={enableTools}
              onToggleTools={() => setEnableTools(!enableTools)}
              availableSkills={personalSkills}
              activeSkillIds={activeSkillIds.filter((sid) => personalSkillIds.has(sid))}
              onToggleSkill={(sid) => {
                if (!personalSkillIds.has(sid)) {
                  showToast("info", "系统内置技能受安全锁定保护，仅支持挂载个人专属技能");
                  return;
                }
                setActiveSkillIds((prev) =>
                  prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]
                );
              }}
              availableMcpServers={mcpServers.filter((m) => m.enabled)}
              activeMcpServerIds={activeMcpServerIds}
              onToggleMcpServer={(srvId) =>
                setActiveMcpServerIds((prev) =>
                  prev.includes(srvId) ? prev.filter((x) => x !== srvId) : [...prev, srvId]
                )
              }
              onOpenMcpSettings={() => onNavigateToSettings('plugins')}
              quickPrompts={currentPreset.quickPrompts}
              showToast={showToast}
              configuredProviders={configuredProviders}
              currentProviderId={currentProviderId}
              currentModelId={currentModelId}
              onSelectModel={(pId, mId) => {
                setCurrentProviderId(pId);
                setCurrentModelId(mId);
              }}
              currentPresetName={currentPreset.name}
              tenantName={crmSession?.tokenData?.userInfo?.tenantName || crmSession?.environment?.name || "沙盒环境"}
              productType={crmSession?.environment?.productType || "neocrm"}
              activeProject={activeProject}
              onClearSession={activeSession ? () => handleDeleteSession(activeSession.id) : undefined}
              onCompactSession={handleCompactSession}
              onSelectPreset={setSelectedPresetId}
              onOpenFlowManager={onOpenFlowManager}
              onOpenPrintManager={onOpenPrintManager}
              externalAttachmentToAdd={pendingComposerAttachment}
              workflowLicenseStatus={workflowLicenseStatus}
              onOpenLicenseModal={onOpenLicenseModal || (() => setIsLicenseModalOpen(true))}
              mode={activeSession?.mode || currentSessionMode}
              onToggleMode={handleToggleMode}
              onSwitchPanelTab={(tab) => {
                setIsTerminalOpen(true);
                setActivePanelTab(tab);
              }}
            />
          </div>
        </div>
      </div>

      {/* 右侧 Codex 风格项目文件树、上传/产物与交互终端分栏 */}
      <CodexTerminalPanel
        isOpen={isTerminalOpen}
        onClose={() => setIsTerminalOpen(false)}
        activePanelTab={activePanelTab}
        onTabChange={(tab) => setActivePanelTab(tab)}
        activeProject={activeProject}
        activeSessionAttachments={activeSession?.messages?.flatMap((m) => m.attachments || []) || []}
        toolCalls={activeToolCalls}
        activeExecutedSql={activeExecutedSql}
        onExecuteSql={(sql) => handleSendMessage(`请执行并分析以下 XOQL 查询结果：\n\`\`\`sql\n${sql}\n\`\`\``)}
        onAttachFileToComposer={async (file) => {
          try {
            if (window.neoApi?.fileParseLocalPath) {
              const parsed = await window.neoApi.fileParseLocalPath(file.fullPath);
              setPendingComposerAttachment(parsed);
              showToast("success", `已挂载文件 [${file.name}] 至对话输入框`);
            }
          } catch (e: any) {
            showToast("error", `读取文件失败: ${e.message}`);
          }
        }}
        showToast={showToast}
      />

      {/* 引用业务对象弹窗 */}
      <ContextEntityModal
        isOpen={isEntityModalOpen}
        isLoggedIn={crmSession.isLoggedIn}
        selectedRefs={entityRefs}
        onClose={() => setIsEntityModalOpen(false)}
        onConfirm={(refs) => setEntityRefs(refs)}
      />

      {/* 确认创建数据模型与字段弹窗 */}
      {pendingSchemaPlan && (
        <ConfirmCreateSchemaModal
          isOpen={!!pendingSchemaPlan}
          plan={pendingSchemaPlan}
          tenantName={crmSession.tokenData?.userInfo?.tenantName || crmSession.environment?.name}
          onClose={() => setPendingSchemaPlan(null)}
          onNavigateToMetadata={onNavigateToMetadata}
          showToast={showToast}
        />
      )}

      {/* 租户流程资产管理中心 (自动流程 & 新版审批流) */}
      <FlowManagerModal
        isOpen={isFlowManagerOpen}
        crmSession={crmSession}
        licenseStatus={workflowLicenseStatus}
        onClose={() => setIsFlowManagerOpen(false)}
        onSendToAiPrompt={(promptText) => handleSendMessage(promptText)}
        showToast={showToast}
      />

      {/* 租户打印模板资产管理中心 (免锁开放) */}
      <PrintTemplateManagerModal
        isOpen={isPrintManagerOpen}
        crmSession={crmSession}
        onClose={() => setIsPrintManagerOpen(false)}
        onSendToAiPrompt={(promptText) => handleSendMessage(promptText)}
        showToast={showToast}
      />

      {/* 自动流程配置方案核对与代码部署弹窗 */}
      {pendingWorkflowPlan && (
        <ConfirmDeployWorkflowModal
          plan={pendingWorkflowPlan}
          crmSession={crmSession}
          licenseStatus={workflowLicenseStatus}
          onOpenLicenseModal={() => setIsLicenseModalOpen(true)}
          onClose={() => setPendingWorkflowPlan(null)}
          onRefreshSession={loadData}
          onSendDiagnosticToAi={(msg) => {
            setPendingWorkflowPlan(null);
            handleSendMessage(msg);
          }}
          showToast={showToast}
        />
      )}

      {/* 新版审批流配置方案核对与代码部署弹窗 */}
      {pendingApprovalPlan && (
        <ConfirmDeployApprovalModal
          plan={pendingApprovalPlan}
          crmSession={crmSession}
          licenseStatus={workflowLicenseStatus}
          onOpenLicenseModal={() => setIsLicenseModalOpen(true)}
          onClose={() => setPendingApprovalPlan(null)}
          onRefreshSession={loadData}
          onSendDiagnosticToAi={(msg) => {
            setPendingApprovalPlan(null);
            handleSendMessage(msg);
          }}
          showToast={showToast}
        />
      )}

      {/* 自动流程功能本地离线设备安全锁弹窗 */}
      <WorkflowLicenseModal
        isOpen={isLicenseModalOpen}
        initialStatus={workflowLicenseStatus}
        onClose={() => {
          setIsLicenseModalOpen(false);
          setPendingAfterUnlock(null);
        }}
        onActivated={(newStatus) => {
          setWorkflowLicenseStatus(newStatus);
          setIsLicenseModalOpen(false);
          if (pendingAfterUnlock) {
            if (pendingAfterUnlock.type === "preset") {
              const p = AI_AGENT_PRESETS.find((item) => item.id === pendingAfterUnlock.presetId);
              if (p) {
                setSelectedPresetId(p.id);
                setEnableTools(p.enableCrmTools);
                if (p.recommendedModel && currentProviderId === "deepseek") {
                  setCurrentModelId(p.recommendedModel);
                }
                if (activeSession && activeSession.messages.length > 0) {
                  setActiveSessionId(null);
                }
              }
            } else if (pendingAfterUnlock.type === "session") {
              const target = sessions.find((s) => s.id === pendingAfterUnlock.sessionId);
              if (target) {
                setActiveSessionId(target.id);
                setSelectedPresetId(target.presetId || "harness-agent");
                if (target.providerId) setCurrentProviderId(target.providerId);
                if (target.modelId) setCurrentModelId(target.modelId);
                if (target.activeSkillIds) setActiveSkillIds(target.activeSkillIds);
              }
            } else if (pendingAfterUnlock.type === "skill") {
              setActiveSkillIds((prev) =>
                prev.includes(pendingAfterUnlock.skillId)
                  ? prev
                  : [...prev, pendingAfterUnlock.skillId]
              );
            } else if (pendingAfterUnlock.type === "deploy") {
              setPendingWorkflowPlan(pendingAfterUnlock.plan);
            } else if (pendingAfterUnlock.type === "deployApproval") {
              setPendingApprovalPlan(pendingAfterUnlock.plan);
            }
            setPendingAfterUnlock(null);
          }
        }}
        showToast={showToast}
      />
    </div>
  );
};
