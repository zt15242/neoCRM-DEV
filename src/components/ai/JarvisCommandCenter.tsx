import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ArrowLeft,
  Copy,
  Check, 
  Send, 
  Settings, 
  ShieldCheck, 
  Radio, 
  Volume2, 
  VolumeX, 
  Sparkles,
  Loader2,
  Zap,
  Server,
  Layers,
  Database,
  Terminal,
  Activity,
  Bot,
  RefreshCw,
  Sliders,
  Brain,
  Trash2,
  Download,
  Plus,
  X,
  History
} from 'lucide-react';
import { 
  JarvisUserProfile, 
  JarvisChatMessage, 
  JarvisFleetOverview, 
  JarvisState,
  FleetConnectorSummary,
  JarvisMemoryItem,
  JarvisSessionData
} from '../../../shared/jarvisTypes';
import { MarkdownRenderer } from './MarkdownRenderer';
import { JarvisReactor } from './JarvisReactor';
import { JarvisVolumeControl } from './JarvisVolumeControl';
import { JarvisMicButton } from './JarvisMicButton';
import { getJarvisAudioSettings, condenseTextForSpeech } from './jarvisAudioHelper';

interface JarvisCommandCenterProps {
  userProfile: JarvisUserProfile | null;
  onOpenSettings: () => void;
  onBackToDashboard: () => void;
}

export const JarvisCommandCenter: React.FC<JarvisCommandCenterProps> = ({
  userProfile,
  onOpenSettings,
  onBackToDashboard,
}) => {
  const [fleetOverview, setFleetOverview] = useState<JarvisFleetOverview | null>(null);
  const [messages, setMessages] = useState<JarvisChatMessage[]>([]);
  const [memories, setMemories] = useState<JarvisMemoryItem[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [jarvisState, setJarvisState] = useState<JarvisState>('idle');
  const [thinkingStatusText, setThinkingStatusText] = useState<string>('');
  const [selectedConnector, setSelectedConnector] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(userProfile?.autoSpeak ?? true);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);

  // 记忆与历史抽屉状态
  const [isMemoryDrawerOpen, setIsMemoryDrawerOpen] = useState(false);
  const [newMemoryInput, setNewMemoryInput] = useState('');
  const [newMemoryCategory, setNewMemoryCategory] = useState<'preference' | 'project' | 'fact'>('preference');
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  const handleCopyMessage = async (content: string, id: string) => {
    let ok = false;
    try {
      if (window.neoApi?.clipboardWriteText) {
        await window.neoApi.clipboardWriteText(content);
        ok = true;
      }
    } catch {}
    if (!ok && navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(content);
        ok = true;
      } catch {}
    }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = content;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        ok = true;
      } catch {}
    }
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const spokenMessageIdsRef = useRef<Set<string>>(new Set());

  const speakTextOnce = (msgId: string, text: string) => {
    if (!msgId || spokenMessageIdsRef.current.has(msgId)) return;
    spokenMessageIdsRef.current.add(msgId);
    speakText(text);
  };

  const commanderName = userProfile?.name || '指挥官';
  const salutation = userProfile?.salutation || (userProfile?.gender === 'female' ? '女士' : '先生');
  const fullCall = `${commanderName}${salutation}`;

  // 1. 加载全网舰队连接器数据
  const refreshFleet = async () => {
    try {
      if (window.neoApi?.jarvisGetFleetOverview) {
        const overview = await window.neoApi.jarvisGetFleetOverview();
        setFleetOverview(overview);
      }
    } catch (e) {
      console.warn('获取舰队信息异常:', e);
    }
  };

  // 2. 加载本地持久化历史对话与长期记忆库
  const loadSavedSession = useCallback(async () => {
    try {
      if (window.neoApi?.jarvisGetSessionData) {
        const sessionData = await window.neoApi.jarvisGetSessionData();
        if (sessionData) {
          if (Array.isArray(sessionData.messages) && sessionData.messages.length > 0) {
            setMessages(sessionData.messages);
          } else {
            // 初始化首条欢迎语
            const welcome: JarvisChatMessage = {
              id: 'init_welcome',
              role: 'assistant',
              content: `系统核心运转正常，随时为您效劳，${fullCall}。我已经接管并监控当前所有连接器租户。您可以随时向我过问任何一套系统的数据、元数据比对或日志。`,
              createdAt: Date.now(),
            };
            setMessages([welcome]);
            window.neoApi?.jarvisSaveMessage?.(welcome);
            if (autoSpeak) {
              speakText(welcome.content);
            }
          }
          if (Array.isArray(sessionData.memories)) {
            setMemories(sessionData.memories);
          }
        }
      }
    } catch (e) {
      console.warn('加载贾维斯历史会话失败:', e);
    }
  }, [fullCall, autoSpeak]);

  useEffect(() => {
    refreshFleet();
    loadSavedSession();
    const interval = setInterval(refreshFleet, 10000);
    return () => clearInterval(interval);
  }, [loadSavedSession]);

  // 3. 监听多窗口消息同步与全局思考状态
  useEffect(() => {
    const unsubMsg = window.neoApi?.onJarvisMessageAppended?.((newMsg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
      if (newMsg.role === 'assistant') {
        setJarvisState('idle');
        setThinkingStatusText('');
      }
    });

    const unsubClear = window.neoApi?.onJarvisMessagesCleared?.((welcome) => {
      setMessages(welcome ? [welcome] : []);
    });

    const unsubState = window.neoApi?.onJarvisStateChanged?.((st) => {
      setJarvisState(st as any);
      if (st === 'idle') {
        setThinkingStatusText('');
      }
    });

    const unsubToolProg = window.neoApi?.onJarvisToolProgress?.((prog) => {
      if (prog.status === 'executing') {
        setThinkingStatusText(`⚡ 正在自主执行底层工具: ${prog.name}${prog.description ? ` (${prog.description})` : ''}`);
      } else if (prog.status === 'completed') {
        setThinkingStatusText(`✓ 工具 ${prog.name} 执行完毕: ${prog.summary || '成功'}`);
      } else if (prog.status === 'error') {
        setThinkingStatusText(`⚠ 工具 ${prog.name} 执行受阻: ${prog.summary || '异常'}`);
      }
    });

    return () => {
      unsubMsg?.();
      unsubClear?.();
      unsubState?.();
      unsubToolProg?.();
    };
  }, [autoSpeak]);

  // 滚动至最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, jarvisState, thinkingStatusText]);

  // 4. 语音合成与精简播报 (管家专属简报，拒绝死板长篇大论)
  const speakText = async (text: string, forceFull: boolean = false) => {
    const audioSettings = getJarvisAudioSettings(userProfile);
    if (audioSettings.isMuted || audioSettings.volume === 0) {
      setJarvisState("idle");
      return;
    }

    // 智能精简：若非显式要求朗读全文，则提炼 1-2 句核心简报，不朗读繁杂的代码、列表符号与矩阵
    const textToSpeak = forceFull ? text : condenseTextForSpeech(text, userProfile?.salutation || "先生");
    if (!textToSpeak.trim()) {
      setJarvisState("idle");
      return;
    }

    setJarvisState("speaking");
    try {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }

      if (window.neoApi?.jarvisSynthesizeSpeech) {
        const res = await window.neoApi.jarvisSynthesizeSpeech(textToSpeak, {
          voice: userProfile?.voiceId || "zh-CN-YunjianNeural",
          rate: userProfile?.voiceRate || "+0%",
          pitch: userProfile?.voicePitch || "+0Hz",
        });

        if (res && res.audioBase64) {
          const audio = new Audio(`data:audio/mp3;base64,${res.audioBase64}`);
          audio.volume = Math.max(0, Math.min(1, audioSettings.volume / 100));
          currentAudioRef.current = audio;

          audio.onended = () => {
            setJarvisState("idle");
            currentAudioRef.current = null;
          };
          audio.onerror = () => {
            fallbackSpeech(textToSpeak);
          };
          await audio.play();
          return;
        }
      }
      fallbackSpeech(textToSpeak);
    } catch {
      fallbackSpeech(textToSpeak);
    }
  };

  const stopSpeaking = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setJarvisState("idle");
  };

  const fallbackSpeech = (text: string) => {
    if (!('speechSynthesis' in window)) {
      setJarvisState('idle');
      return;
    }
    const audioSettings = getJarvisAudioSettings(userProfile);
    if (audioSettings.isMuted || audioSettings.volume === 0) {
      setJarvisState('idle');
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    const voices = window.speechSynthesis.getVoices();
    const zhVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('CN'));
    if (zhVoice) utterance.voice = zhVoice;
    utterance.volume = Math.max(0, Math.min(1, audioSettings.volume / 100));
    utterance.onend = () => setJarvisState('idle');
    utterance.onerror = () => setJarvisState('idle');
    window.speechSynthesis.speak(utterance);
  };

  // 5. 消息发送与多轮记忆对话 (即时上屏与状态联动)
  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputPrompt).trim();
    if (!query) return;

    setInputPrompt('');
    setJarvisState('thinking');

    const userMsgId = `msg_u_${Date.now()}`;
    const userMsg: JarvisChatMessage = {
      id: userMsgId,
      role: 'user',
      content: query,
      targetConnectorId: selectedConnector || undefined,
      createdAt: Date.now(),
    };

    // 立即在当前页面展示用户发送的消息 (毫秒级上屏展示)
    setMessages((prev) => {
      if (prev.some((m) => m.id === userMsg.id)) return prev;
      return [...prev, userMsg];
    });

    try {
      // 携带多轮历史对话上下文与用户画像下达指令
      const cleanHistory = [...messages, userMsg].slice(-10).map((m) => ({ role: m.role, content: m.content }));
      if (window.neoApi?.jarvisChat) {
        const res = await window.neoApi.jarvisChat({
          message: query,
          messageId: userMsgId,
          history: cleanHistory,
          userProfile,
          targetConnectorId: selectedConnector || undefined,
        });

        if (res?.content) {
          const assistantMsgId = res.messageId || `msg_a_${Date.now()}`;
          const assistantMsg: JarvisChatMessage = {
            id: assistantMsgId,
            role: 'assistant',
            content: res.content,
            toolCalls: res.toolCalls,
            createdAt: Date.now(),
          };

          // 将管家的回答追加上屏并取消思考状态
          setMessages((prev) => {
            if (prev.some((m) => m.id === assistantMsg.id)) return prev;
            return [...prev, assistantMsg];
          });
          setJarvisState('idle');

          if (autoSpeak) {
            speakTextOnce(assistantMsgId, res.content);
          }
        } else {
          setJarvisState('idle');
        }
      } else {
        const fallbackMsg: JarvisChatMessage = {
          id: `msg_a_${Date.now()}`,
          role: 'assistant',
          content: `已接收指令，${salutation}。底层连接器处于就绪状态。`,
          createdAt: Date.now(),
        };
        setMessages((prev) => [...prev, fallbackMsg]);
        setJarvisState('idle');
        if (autoSpeak) {
          speakTextOnce(fallbackMsg.id, fallbackMsg.content);
        }
      }
    } catch (err: any) {
      console.error('发送指令失败:', err);
      setJarvisState('idle');
    }
  };

  // 清空对话记录 (开启全新会话)
  const handleClearHistory = async () => {
    if (!confirm('确定清空当前对话历史并开启新会话吗？(长期记忆库仍将保留)')) return;
    const welcome: JarvisChatMessage = {
      id: `init_${Date.now()}`,
      role: 'assistant',
      content: `会话已重置。随时听候差遣，${fullCall}。我已经加载您的专属长期记忆档案。`,
      createdAt: Date.now(),
    };
    if (window.neoApi?.jarvisClearMessages) {
      await window.neoApi.jarvisClearMessages(welcome);
    } else {
      setMessages([welcome]);
    }
  };

  // 添加长期记忆
  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newMemoryInput.trim();
    if (!clean) return;

    if (window.neoApi?.jarvisAddMemory) {
      const res = await window.neoApi.jarvisAddMemory(clean, newMemoryCategory);
      if (res && res.memories) {
        setMemories(res.memories);
      }
    }
    setNewMemoryInput('');
  };

  // 删除某条记忆
  const handleDeleteMemory = async (memoryId: string) => {
    if (window.neoApi?.jarvisDeleteMemory) {
      const res = await window.neoApi.jarvisDeleteMemory(memoryId);
      if (res && res.memories) {
        setMemories(res.memories);
      }
    }
  };

  // 导出对话记录为 Markdown
  const handleExportChatLog = () => {
    const text = messages
      .map((m) => `### [${m.role === 'user' ? fullCall : 'J.A.R.V.I.S.'}] (${new Date(m.createdAt).toLocaleTimeString()})\n\n${m.content}\n`)
      .join('\n---\n\n');
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `JARVIS_ChatLog_${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col bg-[#030712] text-cyan-50 font-sans relative overflow-hidden">
      {/* 顶部 HUD 导航条 */}
      <header className="h-14 border-b border-cyan-500/20 bg-[#060c1b]/90 px-6 flex items-center justify-between z-10 backdrop-blur-md">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBackToDashboard}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/50 hover:border-cyan-400 transition-all font-mono text-xs cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>返回控制台</span>
          </button>

          <div className="flex items-center space-x-2">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_10px_#00f2fe]" />
            <span className="font-bold tracking-widest text-sm text-cyan-300 uppercase font-mono">
              J.A.R.V.I.S. 全息指挥中心
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-mono">
              FLEET SOVEREIGN
            </span>
          </div>
        </div>

        {/* 状态指示与指挥官信息 */}
        <div className="flex items-center space-x-4 text-xs">
          <div className="flex items-center space-x-2 text-cyan-400/80 font-mono">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>全网舰队：{fleetOverview?.onlineCount || 0} / {fleetOverview?.totalCount || 0} 在线</span>
          </div>

          <div className="h-4 w-[1px] bg-cyan-500/20" />

          <div className="flex items-center space-x-2 text-cyan-200">
            <span className="text-cyan-400/60 font-mono">CHIEF:</span>
            <span className="font-semibold text-cyan-300 font-mono">{fullCall}</span>
          </div>

          {/* 记忆档案库控制按钮 */}
          <button
            onClick={() => setIsMemoryDrawerOpen(!isMemoryDrawerOpen)}
            title="查看贾维斯对话记录与长期记忆库"
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded border font-mono text-xs transition-all cursor-pointer ${
              isMemoryDrawerOpen
                ? 'border-cyan-400 bg-cyan-950 text-cyan-200 shadow-[0_0_12px_rgba(0,242,254,0.3)]'
                : 'border-cyan-500/40 text-cyan-300 hover:bg-cyan-950/60'
            }`}
          >
            <Brain className="w-3.5 h-3.5 text-cyan-400" />
            <span>记忆核心 ({messages.length} 轮 / {memories.length} 记忆)</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => window.neoApi?.jarvisToggleDesktopPet?.(true)}
              title="在操作系统桌面唤起独立悬浮方舟桌宠"
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded border border-cyan-500/40 text-cyan-300 hover:bg-cyan-950/60 font-mono text-xs transition-colors cursor-pointer"
            >
              <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>呼出桌面桌宠</span>
            </button>

            {/* 语音播报音量调节与一键静音 */}
            <JarvisVolumeControl currentAudio={currentAudioRef.current} />

            {/* 自动语音播报开关 */}
            <button
              onClick={() => setAutoSpeak(!autoSpeak)}
              title={autoSpeak ? '自动发音已开启 (点击关闭)' : '自动发音已关闭 (点击开启)'}
              className={`px-2 py-1 rounded border text-[11px] font-mono transition-colors cursor-pointer flex items-center space-x-1 ${
                autoSpeak
                  ? 'border-cyan-400 bg-cyan-950/60 text-cyan-300'
                  : 'border-slate-800 bg-slate-900/60 text-slate-500'
              }`}
            >
              <span>TTS自动播报:{autoSpeak ? '开' : '关'}</span>
            </button>

            {/* 指挥官档案与发音设置 */}
            <button
              onClick={onOpenSettings}
              title="设置指挥官档案与发音偏好"
              className="p-1.5 rounded border border-cyan-500/40 text-cyan-300 hover:bg-cyan-950/60 hover:text-cyan-200 transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* 主工作区 */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* 左侧：全系统连接器舰队感知面板 */}
        <aside className="w-80 border-r border-cyan-500/20 bg-[#040814]/80 flex flex-col shrink-0">
          <div className="p-4 border-b border-cyan-500/15 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Server className="w-4 h-4 text-cyan-400" />
              <span className="font-mono text-xs font-bold text-cyan-300 tracking-wider">
                全连接器总览 (FLEET)
              </span>
            </div>
            <button
              onClick={refreshFleet}
              title="刷新全系统连接器探活态势"
              className="p-1 text-cyan-400/60 hover:text-cyan-300 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {fleetOverview?.connectors.map((c) => {
              const isFocused = c.id === selectedConnector || (!selectedConnector && c.isCurrentFocus);
              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedConnector(c.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer relative overflow-hidden ${
                    isFocused
                      ? 'border-cyan-400/80 bg-cyan-950/50 shadow-[0_0_15px_rgba(0,242,254,0.2)] ring-1 ring-cyan-400/40'
                      : 'border-cyan-500/15 bg-slate-900/30 hover:border-cyan-500/40 hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center space-x-1.5 truncate">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          c.isLoggedIn ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                        }`}
                      />
                      <span className="text-xs font-semibold text-cyan-100 truncate">{c.name}</span>
                    </div>
                    {c.isCurrentFocus && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 font-mono">
                        FOCUS
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-cyan-400/60 font-mono">
                    <span className="uppercase">{c.productType} ｜ {c.envType}</span>
                    <span className={c.isLoggedIn ? 'text-emerald-400' : 'text-slate-500'}>
                      {c.isLoggedIn ? '已授权连通' : '未登录'}
                    </span>
                  </div>

                  {c.tenantId && (
                    <div className="mt-2 pt-1.5 border-t border-cyan-500/10 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <span>租户: {c.tenantId}</span>
                      <span className="truncate max-w-[100px]">用户: {c.userName || '未知'}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="p-3 border-t border-cyan-500/15 bg-[#030610] text-[10px] text-cyan-500/50 font-mono flex items-center space-x-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>生产环境熔断防御系统已启动</span>
          </div>
        </aside>

        {/* 中央与右侧：全息对话流与交互 */}
        <main className="flex-1 flex flex-col bg-radial from-cyan-950/20 via-[#030712] to-[#02040a] relative overflow-hidden">
          {/* 中央方舟反应堆全息徽标 */}
          <div className="p-4 border-b border-cyan-500/15 flex items-center justify-center shrink-0 bg-[#050a17]/50 backdrop-blur-xs">
            <div className="flex flex-col items-center">
              <JarvisReactor size="medium" state={jarvisState} />
              <div className="mt-2 text-[11px] font-mono tracking-widest uppercase flex items-center space-x-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    jarvisState === 'idle'
                      ? 'bg-cyan-400'
                      : jarvisState === 'thinking'
                      ? 'bg-fuchsia-400 animate-ping shadow-[0_0_12px_#c084fc]'
                      : 'bg-emerald-400 animate-ping'
                  }`}
                />
                <span
                  className={
                    jarvisState === 'thinking'
                      ? 'text-fuchsia-300 font-bold animate-pulse tracking-wider'
                      : 'text-cyan-400/80'
                  }
                >
                  {jarvisState === 'listening'
                    ? '正在倾听指挥官指令...'
                    : jarvisState === 'thinking'
                    ? (thinkingStatusText || 'J.A.R.V.I.S. 深度推理与工具调用中...')
                    : jarvisState === 'speaking'
                    ? '贾维斯正在全息语音汇报...'
                    : 'J.A.R.V.I.S. ONLINE (已连接长期记忆核心)'}
                </span>
              </div>
            </div>
          </div>

          {/* 对话消息展示区 */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((msg) => {
              const isAssistant = msg.role === 'assistant';
              const isCopied = copiedMsgId === msg.id;
              return (
                <div
                  key={msg.id}
                  className={`flex items-start space-x-3 ${isAssistant ? '' : 'flex-row-reverse space-x-reverse'}`}
                >
                  {isAssistant && (
                    <div className="shrink-0 mt-1 select-none">
                      <JarvisReactor size="mini" state="idle" />
                    </div>
                  )}

                  <div
                    className={`max-w-3xl rounded-2xl px-5 py-3.5 text-xs leading-relaxed transition-all select-text ${
                      isAssistant
                        ? 'border border-cyan-500/30 bg-[#071329]/80 text-cyan-100 shadow-[0_0_20px_rgba(0,242,254,0.15)] font-sans'
                        : 'border border-blue-500/30 bg-blue-950/60 text-blue-100'
                    }`}
                  >
                    {/* 消息头部栏 */}
                    <div className="flex items-center justify-between text-[10px] text-cyan-400/60 font-mono mb-2 pb-1.5 border-b border-cyan-500/15 select-none">
                      <span className="font-bold text-cyan-300">{isAssistant ? 'J.A.R.V.I.S.' : fullCall}</span>
                      <div className="flex items-center space-x-2.5">
                        <span>{new Date(msg.createdAt).toLocaleTimeString()}</span>
                        {!isAssistant && (
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(msg.content, msg.id)}
                            title="复制我的提问"
                            className="flex items-center space-x-1 text-blue-300/80 hover:text-white transition-colors cursor-pointer"
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-[10px] text-emerald-400 font-sans">已复制</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span className="text-[10px] font-sans">复制</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 正文：管家回答使用专属暗黑全息 MarkdownRenderer 渲染，提问保持文字排版 */}
                    {isAssistant ? (
                      <div className="select-text overflow-hidden">
                        {/* 物理工具真实执行回执与状态卡片 */}
                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <div className="mb-3 p-3 rounded-xl bg-cyan-950/70 border border-cyan-500/30 text-xs font-mono space-y-2 select-text">
                            <div className="flex items-center space-x-1.5 text-cyan-300 font-bold text-[11px]">
                              <Zap className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />
                              <span>Harness 自主物理工具已真实调用落地 ({msg.toolCalls.length} 项操作)</span>
                            </div>
                            <div className="space-y-1.5">
                              {msg.toolCalls.map((tc, idx) => (
                                <div key={idx} className="flex items-center justify-between text-[11px] text-cyan-200 bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-cyan-500/20">
                                  <div className="flex items-center space-x-2 truncate mr-2">
                                    <span className={tc.status === 'success' ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                                      {tc.status === 'success' ? '✓' : '✗'} {tc.name}
                                    </span>
                                    <span className="text-cyan-400/70 truncate">{tc.summary}</span>
                                  </div>
                                  <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-mono shrink-0 font-bold ${
                                    tc.status === 'success' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40' : 'bg-red-950/80 text-red-300 border border-red-500/40'
                                  }`}>
                                    {tc.status === 'success' ? 'EXECUTED' : 'FAILED'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <MarkdownRenderer content={msg.content} theme="dark" />
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap select-text text-blue-50 font-sans leading-relaxed">
                        {msg.content}
                      </div>
                    )}

                    {/* 管家消息底部控制栏：一键复制与语音朗读 */}
                    {isAssistant && (
                      <div className="mt-3 pt-2 border-t border-cyan-500/20 flex items-center justify-end space-x-3 select-none">
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(msg.content, msg.id)}
                          title="复制管家回复内容"
                          className="flex items-center space-x-1 text-[11px] text-cyan-400 hover:text-cyan-200 cursor-pointer transition-colors"
                        >
                          {isCopied ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400 font-sans">已复制</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span className="font-sans">复制</span>
                            </>
                          )}
                        </button>

                        {jarvisState === 'speaking' ? (
                          <button
                            type="button"
                            onClick={stopSpeaking}
                            title="停止当前语音播报"
                            className="flex items-center space-x-1 text-[11px] text-red-400 hover:text-red-300 cursor-pointer transition-colors px-2 py-0.5 rounded bg-red-950/60 border border-red-500/40 animate-pulse font-mono"
                          >
                            <VolumeX className="w-3.5 h-3.5" />
                            <span>停止播报</span>
                          </button>
                        ) : (
                          <div className="flex items-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() => speakText(msg.content, false)}
                              title="朗读精炼语音简报 (1-2句核心汇报，不读冗长代码和列表)"
                              className="flex items-center space-x-1 text-[11px] text-cyan-400 hover:text-cyan-200 cursor-pointer transition-colors font-mono"
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                              <span>语音简报</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => speakText(msg.content, true)}
                              title="通篇朗读完整正文"
                              className="text-[10px] text-cyan-400/50 hover:text-cyan-300 cursor-pointer font-mono transition-colors"
                            >
                              [全文]
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* 当处于深度思考与执行状态时，呈现全息高能思考动效卡片 */}
            {jarvisState === 'thinking' && (
              <div className="flex items-start space-x-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="shrink-0 mt-1 select-none">
                  <JarvisReactor size="mini" state="thinking" />
                </div>
                <div className="max-w-2xl rounded-2xl p-4 border border-violet-500/50 bg-[#0c081e]/90 text-violet-100 shadow-[0_0_30px_rgba(168,85,247,0.25)] backdrop-blur-md relative overflow-hidden">
                  {/* 全息流光扫描线 */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-violet-400/15 to-transparent -translate-x-full animate-[shimmer_2s_infinite] pointer-events-none" />

                  {/* 状态指示栏 */}
                  <div className="flex items-center justify-between border-b border-violet-500/20 pb-2 mb-2.5">
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-violet-400 animate-ping shadow-[0_0_10px_#a855f7]" />
                      <span className="font-mono font-bold text-xs text-violet-200 tracking-wider">
                        J.A.R.V.I.S. 深度推理与工具调度中
                      </span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-violet-950/80 border border-violet-500/30 text-violet-300 animate-pulse">
                      AUTONOMOUS AGENT ACTIVE
                    </span>
                  </div>

                  {/* 动态实时执行进度 */}
                  <div className="flex items-center space-x-2.5 text-xs text-violet-300 font-mono py-1">
                    <Loader2 className="w-4 h-4 animate-spin text-fuchsia-400 shrink-0" />
                    <span className="truncate">{thinkingStatusText || '正在分析跨系统上下文、调度物理工具链与推演执行方案...'}</span>
                  </div>

                  {/* 算力波动能量柱与科技动效 */}
                  <div className="mt-3 pt-2 border-t border-violet-500/15 flex items-center justify-between text-[10px] font-mono text-violet-400/60">
                    <div className="flex items-center space-x-1 h-3">
                      <span className="w-1 bg-violet-400 rounded-full animate-[pulse_0.6s_ease-in-out_infinite] h-full" />
                      <span className="w-1 bg-fuchsia-400 rounded-full animate-[pulse_0.9s_ease-in-out_infinite] h-3/4" />
                      <span className="w-1 bg-violet-300 rounded-full animate-[pulse_0.7s_ease-in-out_infinite] h-5/6" />
                      <span className="w-1 bg-purple-400 rounded-full animate-[pulse_1.1s_ease-in-out_infinite] h-2/3" />
                      <span className="w-1 bg-violet-400 rounded-full animate-[pulse_0.8s_ease-in-out_infinite] h-4/5" />
                      <span className="ml-2 text-violet-300/70">HARNESS QUANTUM ENGINE</span>
                    </div>
                    <span className="text-violet-400/80 animate-pulse">实时推理中</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* 快捷指令胶囊 */}
          <div className="px-6 py-2 border-t border-cyan-500/15 flex items-center space-x-2 overflow-x-auto shrink-0 bg-[#050a16]/90">
            <span className="text-[10px] text-cyan-400/60 font-mono shrink-0">快捷指令:</span>
            {[
              '汇报全系统连接器态势',
              '比对沙盒与生产环境的商机字段',
              '检查各租户 Token 授权有效期',
              '查询销售易生产环境中最新创建的 5 条客户',
            ].map((chip) => (
              <button
                key={chip}
                onClick={() => handleSendMessage(chip)}
                className="shrink-0 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-950/40 text-[11px] text-cyan-300 hover:border-cyan-400 hover:bg-cyan-900/60 transition-all font-mono cursor-pointer"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* 底部交互输入框与对讲麦克风 */}
          <footer className="p-4 border-t border-cyan-500/20 bg-[#060c1c]/95 flex items-center space-x-3 shrink-0">
            <JarvisMicButton
              className="p-3 rounded-xl border"
              variant="full"
              onTranscribed={(text) => {
                setInputPrompt(text);
                handleSendMessage(text);
              }}
              onStateChange={(st) => setJarvisState(st)}
            />

            <div className="flex-1 relative">
              <input
                type="text"
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder={`对总领管家下达指令 (例如: "对比沙盒和生产环境的客户字段")...`}
                className="w-full rounded-xl border border-cyan-500/30 bg-slate-900/80 px-4 py-3 text-sm text-cyan-100 placeholder-cyan-500/40 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 font-mono"
              />
            </div>

            <button
              onClick={() => handleSendMessage()}
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all flex items-center space-x-1.5 shadow-[0_0_15px_rgba(0,242,254,0.3)] cursor-pointer"
            >
              <span>执行</span>
              <Send className="w-4 h-4" />
            </button>
          </footer>
        </main>

        {/* 右侧：贾维斯长期记忆档案库抽屉 (Memory Core Drawer) */}
        {isMemoryDrawerOpen && (
          <aside className="w-88 border-l border-cyan-500/30 bg-[#050a18]/95 flex flex-col z-20 shadow-[-10px_0_30px_rgba(0,0,0,0.8)] backdrop-blur-md animate-in slide-in-from-right duration-200">
            {/* 抽屉头部 */}
            <div className="p-4 border-b border-cyan-500/20 flex items-center justify-between bg-cyan-950/40">
              <div className="flex items-center space-x-2">
                <Brain className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-bold text-cyan-200 tracking-wider">
                  贾维斯记忆档案库 (MEMORY CORE)
                </h3>
              </div>
              <button
                onClick={() => setIsMemoryDrawerOpen(false)}
                className="p-1 text-cyan-400/60 hover:text-cyan-200 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 会话操作区 */}
            <div className="p-3 border-b border-cyan-500/15 bg-slate-950/40 flex items-center justify-between text-xs">
              <span className="font-mono text-cyan-400/80 text-[11px]">
                历史对话：{messages.length} 轮消息
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleExportChatLog}
                  title="导出当前全部对话日志为 Markdown 文件"
                  className="px-2 py-1 rounded border border-cyan-500/30 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/60 text-[10px] font-mono flex items-center space-x-1 cursor-pointer"
                >
                  <Download className="w-3 h-3" />
                  <span>导出日志</span>
                </button>
                <button
                  type="button"
                  onClick={handleClearHistory}
                  title="重置当前会话"
                  className="px-2 py-1 rounded border border-red-500/30 bg-red-950/40 text-red-300 hover:bg-red-900/60 text-[10px] font-mono flex items-center space-x-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>清空会话</span>
                </button>
              </div>
            </div>

            {/* 长期记忆项列表 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-cyan-300 tracking-wider uppercase">
                  指挥官专属长期事实记忆 ({memories.length})
                </label>
              </div>

              {/* 手动添加记忆项表单 */}
              <form onSubmit={handleAddMemory} className="space-y-2 p-2.5 rounded-xl border border-cyan-500/25 bg-cyan-950/30">
                <div className="flex items-center space-x-1.5">
                  <select
                    value={newMemoryCategory}
                    onChange={(e: any) => setNewMemoryCategory(e.target.value)}
                    className="bg-slate-900 border border-cyan-500/30 text-[10px] text-cyan-200 rounded px-1.5 py-1 outline-none font-mono"
                  >
                    <option value="preference">偏好 (Preference)</option>
                    <option value="project">项目 (Project)</option>
                    <option value="fact">事实 (Fact)</option>
                  </select>
                  <input
                    type="text"
                    value={newMemoryInput}
                    onChange={(e) => setNewMemoryInput(e.target.value)}
                    placeholder="例如: 指挥官偏好沙盒测试..."
                    className="flex-1 bg-slate-900 border border-cyan-500/30 text-xs px-2 py-1 rounded text-cyan-100 placeholder-cyan-500/40 outline-none"
                  />
                  <button
                    type="submit"
                    title="添加记忆"
                    className="p-1.5 rounded bg-cyan-500 text-slate-950 hover:bg-cyan-400 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-[10px] text-cyan-400/50">
                  所记事项将在每一次对话中作为最高优先级背景知识长久生效。
                </p>
              </form>

              {/* 记忆卡片列表 */}
              <div className="space-y-2">
                {memories.map((m) => (
                  <div
                    key={m.id}
                    className="p-2.5 rounded-xl border border-cyan-500/20 bg-slate-900/60 hover:border-cyan-500/40 transition-all flex items-start justify-between space-x-2"
                  >
                    <div className="space-y-1 text-xs leading-relaxed">
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 uppercase">
                        {m.category}
                      </span>
                      <p className="text-cyan-100/90 text-xs font-sans mt-1">
                        {m.content}
                      </p>
                      <div className="text-[9px] text-cyan-400/40 font-mono">
                        {new Date(m.createdAt).toLocaleDateString()} 记录
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteMemory(m.id)}
                      title="删除此条记忆"
                      className="p-1 text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
