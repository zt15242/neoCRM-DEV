import React, { useState, useEffect, useRef } from 'react';
import { 
  AiChatSession, 
  AiChatMessage, 
  AiProviderConfig, 
  AiHarnessSettings, 
  AiContextEntityRef,
  AiFileAttachment,
  AiSkillItem,
  McpServerConfig,
  SessionState,
  SchemaPlanPayload
} from '../../../shared/types';
import { AI_AGENT_PRESETS, BUILTIN_AI_PROVIDERS, DEFAULT_AI_SETTINGS, BUILTIN_AI_SKILLS } from '../../../shared/constants';
import { AiSidebar } from './AiSidebar';
import { AiMessageItem } from './AiMessageItem';
import { AiInputComposer } from './AiInputComposer';
import { ContextEntityModal } from './ContextEntityModal';
import { ConfirmCreateSchemaModal } from './ConfirmCreateSchemaModal';
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
  Lightbulb
} from 'lucide-react';

interface AiHarnessStudioProps {
  crmSession: SessionState;
  onNavigateToSettings: () => void;
  onNavigateToMetadata?: () => void;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const AiHarnessStudio: React.FC<AiHarnessStudioProps> = ({
  crmSession,
  onNavigateToSettings,
  onNavigateToMetadata,
  showToast,
}) => {
  const [providers, setProviders] = useState<AiProviderConfig[]>(BUILTIN_AI_PROVIDERS);
  const [settings, setSettings] = useState<AiHarnessSettings>(DEFAULT_AI_SETTINGS);
  const [skills, setSkills] = useState<AiSkillItem[]>(BUILTIN_AI_SKILLS);
  const [activeSkillIds, setActiveSkillIds] = useState<string[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
  const [activeMcpServerIds, setActiveMcpServerIds] = useState<string[]>([]);
  const [sessions, setSessions] = useState<AiChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('harness-agent');

  // 当前对话所选供应商与模型
  const [currentProviderId, setCurrentProviderId] = useState<string>('deepseek');
  const [currentModelId, setCurrentModelId] = useState<string>('deepseek-chat');
  const [enableTools, setEnableTools] = useState<boolean>(true);
  const [entityRefs, setEntityRefs] = useState<AiContextEntityRef[]>([]);
  const [isEntityModalOpen, setIsEntityModalOpen] = useState<boolean>(false);

  // 实体与字段数据建模创建确认模态框状态
  const [pendingSchemaPlan, setPendingSchemaPlan] = useState<SchemaPlanPayload | null>(null);

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 初始化加载配置和会话
  const loadData = async () => {
    try {
      if (window.neoApi?.aiGetConfig) {
        const cfg = await window.neoApi.aiGetConfig();
        setProviders(cfg.providers);
        setSettings(cfg.settings);
        if (cfg.skills) setSkills(cfg.skills);
        if (cfg.mcpServers) {
          setMcpServers(cfg.mcpServers);
          const enabledCustom = cfg.mcpServers
            .filter((m) => m.type !== "builtin" && m.id !== "neocrm-paas-mcp" && m.enabled)
            .map((m) => m.id);
          setActiveMcpServerIds(enabledCustom);
        }
        setCurrentProviderId(cfg.settings.defaultProviderId || 'deepseek');
        setCurrentModelId(cfg.settings.defaultModelId || 'deepseek-chat');
        setEnableTools(cfg.settings.enableCrmTools);
      }
      if (window.neoApi?.aiGetSessions) {
        const list = await window.neoApi.aiGetSessions();
        const validList = list.filter((s) => s.messages && s.messages.length > 0);
        setSessions(validList);
        if (validList.length > 0 && !activeSessionId) {
          setActiveSessionId(validList[0].id);
          setSelectedPresetId(validList[0].presetId || 'harness-agent');
          if (validList[0].providerId) setCurrentProviderId(validList[0].providerId);
          if (validList[0].modelId) setCurrentModelId(validList[0].modelId);
          if (validList[0].activeSkillIds) setActiveSkillIds(validList[0].activeSkillIds);
        }
      }
    } catch (e: any) {
      console.error('加载 AI 数据异常:', e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;

  useEffect(() => {
    scrollToBottom();
  }, [activeSession?.messages?.length, streamingMessageId]);

  // 订阅流式事件
  useEffect(() => {
    if (!window.neoApi?.onAiStreamEvent) return;

    const unsubscribe = window.neoApi.onAiStreamEvent((event) => {
      const { sessionId, messageId, type, delta, toolCall, error } = event;

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
    let targetSession = activeSession;
    const preset = AI_AGENT_PRESETS.find((p) => p.id === selectedPresetId) || AI_AGENT_PRESETS[0];

    const effectiveTitle = text.slice(0, 22) + (text.length > 22 ? '...' : '') || (attachments?.[0]?.name ? `分析 ${attachments[0].name}` : '新对话');

    if (!targetSession) {
      targetSession = {
        id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: effectiveTitle,
        presetId: preset.id,
        providerId: currentProviderId,
        modelId: currentModelId,
        messages: [],
        activeSkillIds: skillIds || activeSkillIds,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    } else if (targetSession.messages.length === 0) {
      targetSession = {
        ...targetSession,
        title: effectiveTitle,
        activeSkillIds: skillIds || activeSkillIds,
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

    const updatedMessages = [...targetSession.messages, userMsg, assistantMsg];
    const updatedSession: AiChatSession = {
      ...targetSession,
      providerId: currentProviderId,
      modelId: currentModelId,
      messages: updatedMessages,
      activeSkillIds: skillIds || activeSkillIds,
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
      providerId: currentProviderId,
      modelId: currentModelId,
      presetPrompt: preset.systemPrompt,
      messages: [...targetSession.messages, userMsg],
      enableTools,
      activeSkillIds: skillIds || activeSkillIds,
      activeMcpServerIds: effectiveMcpIds,
      compactionSummary: targetSession.compactionSummary,
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

  const currentProvider = providers.find((p) => p.id === currentProviderId) || providers[0];
  const currentPreset = AI_AGENT_PRESETS.find((p) => p.id === selectedPresetId) || AI_AGENT_PRESETS[0];
  const isCurrentProviderConfigured =
    !!currentProvider?.apiKey ||
    currentProvider?.baseUrl?.includes('localhost') ||
    currentProvider?.baseUrl?.includes('127.0.0.1');

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex h-[calc(100vh-88px)] min-h-[600px]">
      {/* 左侧边栏：会话与预设角色 */}
      <AiSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        presets={AI_AGENT_PRESETS}
        selectedPresetId={selectedPresetId}
        onSelectSession={(id) => {
          setActiveSessionId(id);
          const target = sessions.find((s) => s.id === id);
          if (target) {
            setSelectedPresetId(target.presetId || 'harness-agent');
            if (target.providerId) setCurrentProviderId(target.providerId);
            if (target.modelId) setCurrentModelId(target.modelId);
            if (target.activeSkillIds) setActiveSkillIds(target.activeSkillIds);
          }
        }}
        onNewChatDraft={handleNewChatDraft}
        onDeleteSession={handleDeleteSession}
        onUpdateSessionTitle={handleUpdateSessionTitle}
        onClearSessions={handleClearSessions}
        onSelectPreset={(presetId) => {
          const p = AI_AGENT_PRESETS.find((item) => item.id === presetId);
          if (p && !p.disabled) {
            setSelectedPresetId(presetId);
            setEnableTools(p.enableCrmTools);
            if (p.recommendedModel && currentProviderId === 'deepseek') {
              setCurrentModelId(p.recommendedModel);
            }
            if (activeSession && activeSession.messages.length > 0) {
              setActiveSessionId(null);
            }
          }
        }}
      />

      {/* 右侧主对话画布 */}
      <div className="flex-1 flex flex-col bg-slate-50/50 min-w-0">
        {/* 顶部对话控制栏 */}
        <div className="h-14 px-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="p-2 rounded-xl bg-sky-50 text-sky-600 border border-sky-100">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-slate-800 truncate">
                  {activeSession ? activeSession.title : currentPreset.name}
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-medium shrink-0">
                  {currentPreset.badge || 'AI Harness'}
                </span>
                {activeSession && activeSession.messages.length > 0 && (
                  <span className="text-[10px] text-slate-400 font-mono">
                    {activeSession.messages.length} 轮消息
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                {currentPreset.description}
              </p>
            </div>
          </div>

          {/* 模型切换器 & 压缩 & 工具状态 */}
          <div className="flex items-center space-x-2 shrink-0">
            {/* 上下文压缩按钮 */}
            {activeSession && activeSession.messages.length >= 4 && (
              <button
                onClick={handleCompactSession}
                disabled={isCompacting}
                title="压缩提炼前序历史对话为结构化记忆，节省 Token 并提升模型专注度"
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100/70 text-indigo-700 text-xs font-medium transition-colors cursor-pointer"
              >
                {isCompacting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                ) : (
                  <Minimize2 className="w-3.5 h-3.5 text-indigo-600" />
                )}
                <span>{isCompacting ? '压缩中...' : '压缩上下文'}</span>
              </button>
            )}

            {/* 供应商与模型选择器 */}
            <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <select
                value={`${currentProviderId}::${currentModelId}`}
                onChange={(e) => {
                  const [pId, mId] = e.target.value.split('::');
                  setCurrentProviderId(pId);
                  setCurrentModelId(mId);
                }}
                className="text-xs font-medium text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200/80 shadow-2xs focus:outline-none cursor-pointer"
              >
                {providers.map((p) => (
                  <optgroup key={p.id} label={`${p.name} ${p.apiKey ? '✓' : '(未配Key)'}`}>
                    {p.models.map((m) => (
                      <option key={`${p.id}::${m.id}`} value={`${p.id}::${m.id}`}>
                        {p.name.split(' ')[0]} · {m.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              <button
                onClick={onNavigateToSettings}
                title="配置模型 API Key 与供应商"
                className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 导出按钮 */}
            {activeSession && activeSession.messages.length > 0 && (
              <button
                onClick={handleExportMarkdown}
                title="导出对话为 Markdown"
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 中部消息流展示区 */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
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
                    onClick={onNavigateToSettings}
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
              {activeSession.messages.map((msg) => (
                <AiMessageItem
                  key={msg.id}
                  message={msg}
                  isStreamingCurrent={streamingMessageId === msg.id}
                  onOpenCreateSchema={(plan) => setPendingSchemaPlan(plan)}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* 底部多功能输入框 */}
        <div className="p-3.5 bg-slate-50/90 border-t border-slate-200/80">
          <div className="max-w-4xl mx-auto">
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
              availableSkills={skills.filter((s) => s.enabled)}
              activeSkillIds={activeSkillIds}
              onToggleSkill={(sid) =>
                setActiveSkillIds((prev) =>
                  prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]
                )
              }
              availableMcpServers={mcpServers.filter((m) => m.enabled)}
              activeMcpServerIds={activeMcpServerIds}
              onToggleMcpServer={(srvId) =>
                setActiveMcpServerIds((prev) =>
                  prev.includes(srvId) ? prev.filter((x) => x !== srvId) : [...prev, srvId]
                )
              }
              onOpenMcpSettings={onNavigateToSettings}
              quickPrompts={currentPreset.quickPrompts}
              showToast={showToast}
            />
          </div>
        </div>
      </div>

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
    </div>
  );
};
