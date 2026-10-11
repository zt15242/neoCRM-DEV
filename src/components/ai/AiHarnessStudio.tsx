import React, { useState, useEffect, useRef } from 'react';
import { 
  AiChatSession, 
  AiChatMessage, 
  AiProviderConfig, 
  AiHarnessSettings, 
  AiContextEntityRef,
  SessionState
} from '../../../shared/types';
import { AI_AGENT_PRESETS, BUILTIN_AI_PROVIDERS, DEFAULT_AI_SETTINGS } from '../../../shared/constants';
import { AiSidebar } from './AiSidebar';
import { AiMessageItem } from './AiMessageItem';
import { AiInputComposer } from './AiInputComposer';
import { ContextEntityModal } from './ContextEntityModal';
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
  ShieldCheck
} from 'lucide-react';

interface AiHarnessStudioProps {
  crmSession: SessionState;
  onNavigateToSettings: () => void;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const AiHarnessStudio: React.FC<AiHarnessStudioProps> = ({
  crmSession,
  onNavigateToSettings,
  showToast,
}) => {
  const [providers, setProviders] = useState<AiProviderConfig[]>(BUILTIN_AI_PROVIDERS);
  const [settings, setSettings] = useState<AiHarnessSettings>(DEFAULT_AI_SETTINGS);
  const [sessions, setSessions] = useState<AiChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('harness-agent');

  // 当前对话所选供应商与模型
  const [currentProviderId, setCurrentProviderId] = useState<string>('deepseek');
  const [currentModelId, setCurrentModelId] = useState<string>('deepseek-chat');
  const [enableTools, setEnableTools] = useState<boolean>(true);
  const [entityRefs, setEntityRefs] = useState<AiContextEntityRef[]>([]);
  const [isEntityModalOpen, setIsEntityModalOpen] = useState<boolean>(false);

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
        setCurrentProviderId(cfg.settings.defaultProviderId || 'deepseek');
        setCurrentModelId(cfg.settings.defaultModelId || 'deepseek-chat');
        setEnableTools(cfg.settings.enableCrmTools);
      }
      if (window.neoApi?.aiGetSessions) {
        const list = await window.neoApi.aiGetSessions();
        setSessions(list);
        if (list.length > 0 && !activeSessionId) {
          setActiveSessionId(list[0].id);
          setSelectedPresetId(list[0].presetId || 'harness-agent');
          if (list[0].providerId) setCurrentProviderId(list[0].providerId);
          if (list[0].modelId) setCurrentModelId(list[0].modelId);
        }
      }
    } catch (e: any) {
      console.error('加载 AI 数据异常:', e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 自动滚动到底部
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

          // 当流式结束或出错时，持久化会话到磁盘
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

  // 创建新会话
  const handleCreateSession = async (presetId = selectedPresetId) => {
    const preset = AI_AGENT_PRESETS.find((p) => p.id === presetId) || AI_AGENT_PRESETS[0];
    const newSession: AiChatSession = {
      id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: `${preset.name.split(' (')[0]} 对话`,
      presetId: preset.id,
      providerId: currentProviderId,
      modelId: preset.recommendedModel && currentProviderId === 'deepseek' ? preset.recommendedModel : currentModelId,
      messages: [],
      entityRefs: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const list = await window.neoApi.aiSaveSession(newSession);
    setSessions(list);
    setActiveSessionId(newSession.id);
    setSelectedPresetId(preset.id);
    setEnableTools(preset.enableCrmTools);
    if (newSession.modelId) setCurrentModelId(newSession.modelId);
  };

  // 删除会话
  const handleDeleteSession = async (sessionId: string) => {
    const list = await window.neoApi.aiDeleteSession(sessionId);
    setSessions(list);
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
    setSessions(list);
  };

  // 清空所有会话
  const handleClearSessions = async () => {
    await window.neoApi.aiClearSessions();
    setSessions([]);
    setActiveSessionId(null);
    showToast('info', '已清空所有历史对话');
  };

  // 快速保存当前供应商 API Key (支持 DeepSeek / Gemini / OpenAI 等)
  const handleSaveQuickApiKey = async () => {
    if (!quickApiKey.trim()) {
      showToast('error', `请输入有效的 ${currentProvider?.name || ''} API Key`);
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
  const handleSendMessage = async (text: string, refs?: AiContextEntityRef[]) => {
    let targetSession = activeSession;
    const preset = AI_AGENT_PRESETS.find((p) => p.id === selectedPresetId) || AI_AGENT_PRESETS[0];

    // 若当前没有活跃会话，自动新建一个
    if (!targetSession) {
      targetSession = {
        id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: text.slice(0, 22) + (text.length > 22 ? '...' : ''),
        presetId: preset.id,
        providerId: currentProviderId,
        modelId: currentModelId,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    } else if (targetSession.messages.length === 0) {
      // 第一条消息自动更新会话标题
      targetSession = {
        ...targetSession,
        title: text.slice(0, 22) + (text.length > 22 ? '...' : ''),
      };
    }

    const userMsg: AiChatMessage = {
      id: `msg_u_${Date.now()}`,
      role: 'user',
      content: text,
      entityRefs: refs && refs.length > 0 ? [...refs] : undefined,
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
      updatedAt: Date.now(),
    };

    // 先更新本地状态与磁盘
    const savedList = await window.neoApi.aiSaveSession(updatedSession);
    setSessions(savedList);
    setActiveSessionId(updatedSession.id);

    const requestId = `req_${Date.now()}`;
    setStreamingRequestId(requestId);
    setStreamingMessageId(assistantMsgId);
    reasoningStartTimeRef.current = null;

    // 调用主进程流式接口
    await window.neoApi.aiStartChatStream({
      requestId,
      sessionId: updatedSession.id,
      messageId: assistantMsgId,
      providerId: currentProviderId,
      modelId: currentModelId,
      presetPrompt: preset.systemPrompt,
      messages: [...targetSession.messages, userMsg],
      enableTools,
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
          }
        }}
        onCreateSession={handleCreateSession}
        onDeleteSession={handleDeleteSession}
        onUpdateSessionTitle={handleUpdateSessionTitle}
        onClearSessions={handleClearSessions}
        onSelectPreset={(presetId) => {
          setSelectedPresetId(presetId);
          const p = AI_AGENT_PRESETS.find((item) => item.id === presetId);
          if (p) {
            setEnableTools(p.enableCrmTools);
            if (p.recommendedModel && currentProviderId === 'deepseek') {
              setCurrentModelId(p.recommendedModel);
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
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                {currentPreset.description}
              </p>
            </div>
          </div>

          {/* 模型切换器 & 工具状态 */}
          <div className="flex items-center space-x-2 shrink-0">
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
                className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-white rounded-lg transition-colors"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 导出按钮 */}
            {activeSession && activeSession.messages.length > 0 && (
              <button
                onClick={handleExportMarkdown}
                title="导出对话为 Markdown"
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
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
                      您可以直接在下方粘贴您的 DeepSeek API Key 立即激活，或前往【系统设置】配置 OpenAI / 硅基流动 / 自定义网关。
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
                    className="px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-medium"
                  >
                    前往模型设置
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
                    className="text-left p-3.5 rounded-2xl bg-white hover:bg-sky-50/60 border border-slate-200/90 hover:border-sky-300 transition-all shadow-2xs group"
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
            <div className="max-w-4xl mx-auto">
              {activeSession.messages.map((msg) => (
                <AiMessageItem
                  key={msg.id}
                  message={msg}
                  isStreamingCurrent={streamingMessageId === msg.id}
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
              quickPrompts={currentPreset.quickPrompts}
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
    </div>
  );
};
