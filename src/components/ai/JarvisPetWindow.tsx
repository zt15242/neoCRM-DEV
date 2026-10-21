import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  Radio, 
  Maximize2, 
  Minus, 
  X, 
  Send, 
  ShieldCheck, 
  Volume2, 
  VolumeX,
  Sparkles,
  Loader2,
  Brain,
  Copy,
  Check
} from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { JarvisReactor } from './JarvisReactor';
import { JarvisVolumeControl } from './JarvisVolumeControl';
import { JarvisMicButton } from './JarvisMicButton';
import { getJarvisAudioSettings, condenseTextForSpeech } from './jarvisAudioHelper';
import { 
  JarvisUserProfile, 
  JarvisState, 
  JarvisFleetOverview,
  JarvisChatMessage
} from '../../../shared/jarvisTypes';

export const JarvisPetWindow: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [state, setState] = useState<JarvisState>('idle');
  const [petThinkingText, setPetThinkingText] = useState<string>('');
  const [userProfile, setUserProfile] = useState<JarvisUserProfile | null>(null);
  const [fleetOverview, setFleetOverview] = useState<JarvisFleetOverview | null>(null);
  const [inputPrompt, setInputPrompt] = useState('');
  const [latestReply, setLatestReply] = useState('随时为您效劳，指挥官。');
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [recentMessages, setRecentMessages] = useState<JarvisChatMessage[]>([]);
  const [copiedReply, setCopiedReply] = useState(false);

  const handleCopyReply = async () => {
    let ok = false;
    try {
      if (window.neoApi?.clipboardWriteText) {
        await window.neoApi.clipboardWriteText(latestReply);
        ok = true;
      }
    } catch {}
    if (!ok && navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(latestReply);
        ok = true;
      } catch {}
    }
    setCopiedReply(true);
    setTimeout(() => setCopiedReply(false), 2000);
  };

  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const spokenMessageIdsRef = useRef<Set<string>>(new Set());

  const speakTextOnce = (msgId: string, text: string) => {
    if (!msgId || spokenMessageIdsRef.current.has(msgId)) return;
    spokenMessageIdsRef.current.add(msgId);
    speakText(text);
  };

  // 1. 初始化读取配置、全网舰队与持久化历史记忆
  useEffect(() => {
    try {
      const saved = localStorage.getItem('jarvis_user_profile');
      if (saved) {
        setUserProfile(JSON.parse(saved));
      }
    } catch {}

    const fetchFleet = async () => {
      try {
        if (window.neoApi?.jarvisGetFleetOverview) {
          const overview = await window.neoApi.jarvisGetFleetOverview();
          setFleetOverview(overview);
        }
      } catch (e) {
        console.warn('获取舰队信息异常:', e);
      }
    };

    const loadHistory = async () => {
      try {
        if (window.neoApi?.jarvisGetSessionData) {
          const data = await window.neoApi.jarvisGetSessionData();
          if (data && Array.isArray(data.messages) && data.messages.length > 0) {
            setRecentMessages(data.messages);
            const lastAssistant = [...data.messages].reverse().find((m) => m.role === 'assistant');
            if (lastAssistant) {
              setLatestReply(lastAssistant.content);
            }
          }
        }
      } catch (e) {
        console.warn('桌宠加载历史会话失败:', e);
      }
    };

    fetchFleet();
    loadHistory();
    const timer = setInterval(fetchFleet, 8000);
    return () => clearInterval(timer);
  }, []);

  // 2. 监听多窗口消息同步 (全息大屏与桌宠双向实时联动)
  useEffect(() => {
    const unsubMsg = window.neoApi?.onJarvisMessageAppended?.((newMsg) => {
      setRecentMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
      if (newMsg.role === 'assistant') {
        setLatestReply(newMsg.content);
        setState('idle');
      }
    });

    const unsubClear = window.neoApi?.onJarvisMessagesCleared?.((welcome) => {
      setRecentMessages(welcome ? [welcome] : []);
      if (welcome) setLatestReply(welcome.content);
    });

    const unsubState = window.neoApi?.onJarvisStateChanged?.((st) => {
      setState(st as any);
      if (st === 'idle') setPetThinkingText('');
    });

    const unsubTool = window.neoApi?.onJarvisToolProgress?.((prog) => {
      if (prog.status === 'executing') {
        setPetThinkingText(`⚡ ${prog.name}...`);
      } else if (prog.status === 'completed') {
        setPetThinkingText(`✓ ${prog.name}`);
      }
    });

    return () => {
      unsubMsg?.();
      unsubClear?.();
      unsubState?.();
      unsubTool?.();
    };
  }, [autoSpeak]);

  const commanderName = userProfile?.name || '指挥官';
  const salutation = userProfile?.salutation || (userProfile?.gender === 'female' ? '女士' : '先生');
  const fullCall = `${commanderName}${salutation}`;

  // 展开 / 收起窗口 Bounds
  const handleToggleExpand = async (nextExpanded: boolean) => {
    setIsExpanded(nextExpanded);
    if (window.neoApi?.jarvisSetPetWindowExpanded) {
      await window.neoApi.jarvisSetPetWindowExpanded(nextExpanded);
    }
  };

  // 语音播报
  const speakText = async (text: string) => {
    const audioSettings = getJarvisAudioSettings(userProfile);
    if (audioSettings.isMuted || audioSettings.volume === 0) {
      setState('idle');
      return;
    }

    setState('speaking');
    try {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }

      if (window.neoApi?.jarvisSynthesizeSpeech) {
        const res = await window.neoApi.jarvisSynthesizeSpeech(text, {
          voice: userProfile?.voiceId || 'zh-CN-YunjianNeural',
        });
        if (res?.audioBase64) {
          const audio = new Audio(`data:audio/mp3;base64,${res.audioBase64}`);
          audio.volume = Math.max(0, Math.min(1, audioSettings.volume / 100));
          audio.muted = audioSettings.isMuted;
          currentAudioRef.current = audio;
          audio.onended = () => setState('idle');
          audio.onerror = () => setState('idle');
          if (!audioSettings.isMuted && audioSettings.volume > 0) {
            await audio.play();
          } else {
            setState('idle');
          }
          return;
        }
      }

      // 降级 Web Speech API
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.volume = audioSettings.isMuted ? 0 : Math.max(0, Math.min(1, audioSettings.volume / 100));
        utterance.onend = () => setState('idle');
        utterance.onerror = () => setState('idle');
        if (!audioSettings.isMuted && audioSettings.volume > 0) {
          window.speechSynthesis.speak(utterance);
        } else {
          setState('idle');
        }
      } else {
        setState('idle');
      }
    } catch {
      setState('idle');
    }
  };

  // 发送指令 (即刻上屏，与全息大屏双向实时同步)
  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || inputPrompt).trim();
    if (!query) return;

    setInputPrompt('');
    setState('thinking');

    const userMsgId = `msg_u_${Date.now()}`;
    const userMsg: JarvisChatMessage = {
      id: userMsgId,
      role: 'user',
      content: query,
      createdAt: Date.now(),
    };

    setRecentMessages((prev) => {
      if (prev.some((m) => m.id === userMsg.id)) return prev;
      return [...prev, userMsg];
    });

    try {
      const cleanHistory = [...recentMessages, userMsg].slice(-8).map((m) => ({ role: m.role, content: m.content }));
      if (window.neoApi?.jarvisChat) {
        const res = await window.neoApi.jarvisChat({
          message: query,
          messageId: userMsgId,
          history: cleanHistory,
          userProfile,
        });
        if (res?.content) {
          const assistantMsgId = res.messageId || `msg_a_${Date.now()}`;
          const assistantMsg: JarvisChatMessage = {
            id: assistantMsgId,
            role: 'assistant',
            content: res.content,
            createdAt: Date.now(),
          };
          setRecentMessages((prev) => {
            if (prev.some((m) => m.id === assistantMsg.id)) return prev;
            return [...prev, assistantMsg];
          });
          setLatestReply(res.content);
          setState('idle');
          if (autoSpeak) {
            speakTextOnce(assistantMsgId, res.content);
          }
        } else {
          setState('idle');
        }
      } else {
        setState('idle');
      }
    } catch (e: any) {
      console.warn('桌宠发送异常:', e.message);
      setState('idle');
    }
  };

  // 唤起主程序全息指挥中心
  const handleOpenMainApp = async () => {
    if (window.neoApi?.jarvisOpenMainWindow) {
      await window.neoApi.jarvisOpenMainWindow();
    }
  };

  const handleClosePet = async () => {
    if (window.neoApi?.jarvisToggleDesktopPet) {
      await window.neoApi.jarvisToggleDesktopPet(false);
    }
  };

  return (
    <div className="w-full h-full relative select-none font-sans overflow-hidden">
      {isExpanded ? (
        /* 1. 展开态：紧凑科技感透明 HUD 浮层 */
        <div className="w-full h-full rounded-2xl border border-cyan-500/50 bg-[#060e1d]/95 p-3.5 text-cyan-50 shadow-[0_0_35px_rgba(0,242,254,0.35)] backdrop-blur-xl flex flex-col justify-between animate-in zoom-in-95 duration-150">
          {/* 可拖拽顶栏 */}
          <div
            className="flex items-center justify-between pb-2 border-b border-cyan-500/20 cursor-move"
            style={{ WebkitAppRegion: 'drag' } as any}
          >
            <div className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#00f2fe]" />
              <span className="text-[11px] font-bold font-mono tracking-wider text-cyan-300">
                J.A.R.V.I.S. 桌面态势 HUD
              </span>
            </div>

            <div className="flex items-center space-x-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
              <JarvisVolumeControl currentAudio={currentAudioRef.current} />
              <button
                onClick={() => setAutoSpeak(!autoSpeak)}
                title={autoSpeak ? '自动发音已开启' : '自动发音已关闭'}
                className="p-1 rounded text-cyan-400/70 hover:text-cyan-200 hover:bg-cyan-950/60 transition-colors text-[10px] font-mono cursor-pointer"
              >
                {autoSpeak ? 'TTS:开' : 'TTS:关'}
              </button>
              <button
                onClick={handleOpenMainApp}
                title="打开主程序全息指挥中心"
                className="p-1 rounded text-cyan-400/70 hover:text-cyan-200 hover:bg-cyan-950/60 transition-colors cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleToggleExpand(false)}
                title="收起到桌面小球"
                className="p-1 rounded text-cyan-400/70 hover:text-cyan-200 hover:bg-cyan-950/60 transition-colors cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleClosePet}
                title="关闭桌宠"
                className="p-1 rounded text-cyan-400/70 hover:text-red-400 hover:bg-red-950/40 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 状态与问候 */}
          <div className="my-1.5" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-cyan-200 truncate max-w-[200px]">
                随时为您效劳，{fullCall}。
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-400">
                {fleetOverview?.onlineCount || 0} / {fleetOverview?.totalCount || 0} 在线
              </span>
            </div>

            {/* 贾维斯最新回复气泡 (支持上下滚动与暗黑全息 Markdown 渲染) */}
            <div className="mt-2 p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/25 text-xs text-cyan-100 max-h-36 overflow-y-auto font-sans leading-relaxed select-text relative group">
              <div className="flex items-center justify-between mb-1 pb-1 border-b border-cyan-500/15 text-[10px] text-cyan-400/60 font-mono select-none">
                <span>管家回复</span>
                <button
                  type="button"
                  onClick={handleCopyReply}
                  title="复制回复内容"
                  className="flex items-center space-x-1 text-cyan-400 hover:text-cyan-200 transition-colors cursor-pointer"
                >
                  {copiedReply ? (
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
              </div>
              {state === 'thinking' && (
                <div className="mb-2 p-2 rounded-xl border border-violet-500/50 bg-[#0c081e]/90 text-violet-200 text-xs font-mono shadow-[0_0_15px_rgba(168,85,247,0.3)] flex items-center space-x-2 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-violet-400 animate-ping shrink-0" />
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-fuchsia-400 shrink-0" />
                  <span className="truncate">{petThinkingText || 'J.A.R.V.I.S. 深度推理与执行中...'}</span>
                </div>
              )}
              <div className="select-text">
                <MarkdownRenderer content={latestReply} theme="dark" />
              </div>
            </div>
          </div>

          {/* 底部输入与语音对讲 */}
          <div className="pt-2 border-t border-cyan-500/20 flex items-center space-x-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <JarvisMicButton
              className="p-2.5 rounded-xl border"
              variant="compact"
              onTranscribed={(text) => {
                setInputPrompt(text);
                handleSend(text);
              }}
              onStateChange={(st) => setState(st)}
            />

            <input
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="对管家下达指令..."
              className="flex-1 rounded-xl border border-cyan-500/30 bg-slate-900/80 px-3 py-2 text-xs text-cyan-100 placeholder-cyan-500/40 outline-none focus:border-cyan-400 font-mono"
            />

            <button
              onClick={() => handleSend()}
              className="p-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        /* 2. 收起态：可在操作系统桌面任意拖动的方舟反应堆小球 */
        <div
          className="w-[84px] h-[84px] flex items-center justify-center cursor-move select-none group relative"
          style={{ WebkitAppRegion: 'drag' } as any}
          onDoubleClick={handleOpenMainApp}
          title="J.A.R.V.I.S. 桌面悬浮桌宠 (可拖拽移动 / 单击呼出HUD / 双击全屏指挥中心)"
        >
          <div style={{ WebkitAppRegion: 'no-drag' } as any}>
            <JarvisReactor
              size="mini"
              state={state}
              onClick={() => handleToggleExpand(true)}
              className="group-hover:scale-110 active:scale-95 transition-transform cursor-pointer"
            />
          </div>
        </div>
      )}
    </div>
  );
};
