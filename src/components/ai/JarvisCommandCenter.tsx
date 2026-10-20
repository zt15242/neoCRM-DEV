import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, 
  ShieldAlert, 
  ShieldCheck, 
  Radio, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Send, 
  Settings, 
  RefreshCw, 
  Layers, 
  Terminal, 
  Sparkles, 
  Database, 
  ChevronRight, 
  Activity, 
  Server,
  Code2
} from 'lucide-react';
import { 
  JarvisUserProfile, 
  JarvisState, 
  JarvisFleetOverview, 
  FleetConnectorSummary,
  JarvisChatMessage 
} from '../../../shared/jarvisTypes';
import { JarvisReactor } from './JarvisReactor';
import { JarvisVolumeControl } from './JarvisVolumeControl';
import { getJarvisAudioSettings } from './jarvisAudioHelper';

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
  const [inputPrompt, setInputPrompt] = useState('');
  const [jarvisState, setJarvisState] = useState<JarvisState>('idle');
  const [selectedConnector, setSelectedConnector] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(userProfile?.autoSpeak ?? true);
  const [isRecording, setIsRecording] = useState(false);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const commanderName = userProfile?.name || '指挥官';
  const salutation = userProfile?.salutation || (userProfile?.gender === 'female' ? '女士' : '先生');
  const fullCall = `${commanderName}${salutation}`;

  // 1. 加载全舰队连接器数据
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

  useEffect(() => {
    refreshFleet();
    const interval = setInterval(refreshFleet, 10000);
    return () => clearInterval(interval);
  }, []);

  // 2. 初始问候语
  useEffect(() => {
    if (messages.length === 0) {
      const welcome: JarvisChatMessage = {
        id: 'init_welcome',
        role: 'assistant',
        content: `系统核心运转正常，随时为您效劳，${fullCall}。我已经接管并监控当前所有连接器租户。您可以随时向我过问任何一套系统的数据、元数据比对或日志。`,
        createdAt: Date.now(),
      };
      setMessages([welcome]);
      if (autoSpeak) {
        speakText(welcome.content);
      }
    }
  }, [fullCall]);

  // 滚动至底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 3. 语音合成与播报 (Edge-TTS，带音量与静音保护)
  const speakText = async (text: string) => {
    const audioSettings = getJarvisAudioSettings(userProfile);
    if (audioSettings.isMuted || audioSettings.volume === 0) {
      setJarvisState('idle');
      return;
    }

    setJarvisState('speaking');
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
          const audioUrl = `data:audio/mp3;base64,${res.audioBase64}`;
          setCurrentAudioUrl(audioUrl);
          const audio = new Audio(audioUrl);
          audio.volume = Math.max(0, Math.min(1, audioSettings.volume / 100));
          audio.muted = audioSettings.isMuted;
          currentAudioRef.current = audio;
          audio.onended = () => setJarvisState('idle');
          audio.onerror = () => setJarvisState('idle');
          if (!audioSettings.isMuted && audioSettings.volume > 0) {
            await audio.play();
          } else {
            setJarvisState('idle');
          }
          return;
        }
      }

      // 降级使用 Web Speech API
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.volume = audioSettings.isMuted ? 0 : Math.max(0, Math.min(1, audioSettings.volume / 100));
        utterance.onend = () => setJarvisState('idle');
        utterance.onerror = () => setJarvisState('idle');
        if (!audioSettings.isMuted && audioSettings.volume > 0) {
          window.speechSynthesis.speak(utterance);
        } else {
          setJarvisState('idle');
        }
      } else {
        setJarvisState('idle');
      }
    } catch {
      setJarvisState('idle');
    }
  };

  // 4. 语音识别 (SiliconFlow SenseVoice)
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          if (base64Audio && window.neoApi?.jarvisTranscribeAudio) {
            setJarvisState('thinking');
            const res = await window.neoApi.jarvisTranscribeAudio(base64Audio, 'audio/webm');
            if (res.text) {
              setInputPrompt(res.text);
              handleSendMessage(res.text);
            } else {
              setJarvisState('idle');
            }
          }
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      setIsRecording(true);
      setJarvisState('listening');
    } catch (err) {
      console.error('麦克风录音异常:', err);
      setIsRecording(false);
      setJarvisState('idle');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // 5. 消息发送与管家处理
  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputPrompt).trim();
    if (!query) return;

    setInputPrompt('');
    const userMsg: JarvisChatMessage = {
      id: `msg_u_${Date.now()}`,
      role: 'user',
      content: query,
      targetConnectorId: selectedConnector || undefined,
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setJarvisState('thinking');

    try {
      let replyText = '';
      if (window.neoApi?.jarvisChat) {
        const res = await window.neoApi.jarvisChat({
          message: query,
          history: messages.slice(-8).map((m) => ({ role: m.role, content: m.content })),
          userProfile,
        });
        replyText = res.content;
      } else {
        replyText = `已接收指令，${salutation}。底层连接器处于就绪状态。`;
      }

      const assistantMsg: JarvisChatMessage = {
        id: `msg_a_${Date.now()}`,
        role: 'assistant',
        content: replyText,
        createdAt: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMsg]);

      if (autoSpeak) {
        speakText(replyText);
      } else {
        setJarvisState('idle');
      }
    } catch (err: any) {
      setJarvisState('idle');
    }
  };

  return (
    <div className="flex-1 h-full w-full min-h-0 flex flex-col bg-[#050a14] text-cyan-50 font-sans select-none overflow-hidden relative">
      {/* 1. 顶部科技 HUD 导航栏 */}
      <header className="h-14 border-b border-cyan-500/20 bg-[#060e1d]/90 px-6 flex items-center justify-between backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBackToDashboard}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded border border-cyan-500/30 text-cyan-400 hover:bg-cyan-950/40 text-xs font-mono transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5 rotate-180" />
            <span>返回控制台</span>
          </button>

          <div className="flex items-center space-x-2.5">
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
        <div className="flex items-center space-x-5 text-xs">
          <div className="flex items-center space-x-2 text-cyan-400/80 font-mono">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>全网舰队：{fleetOverview?.onlineCount || 0} / {fleetOverview?.totalCount || 0} 在线</span>
          </div>

          <div className="h-4 w-[1px] bg-cyan-500/20" />

          <div className="flex items-center space-x-2 text-cyan-200">
            <span className="text-cyan-400/60 font-mono">CHIEF:</span>
            <span className="font-semibold text-cyan-300 font-mono">{fullCall}</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => window.neoApi?.jarvisToggleDesktopPet?.(true)}
              title="在操作系统桌面唤起独立悬浮方舟桌宠"
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded border border-cyan-500/40 text-cyan-300 hover:bg-cyan-950/60 font-mono text-xs transition-colors"
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
              <span>{autoSpeak ? 'TTS自动播报:开' : 'TTS自动播报:关'}</span>
            </button>

            <button
              onClick={onOpenSettings}
              title="配置指挥官档案与发音"
              className="p-1.5 rounded border border-cyan-500/30 text-cyan-400 hover:bg-cyan-950/60 transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* 2. 主屏双栏布局 */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* 左侧：全连接器舰队雷达矩阵 (Fleet Matrix) */}
        <aside className="w-80 border-r border-cyan-500/20 bg-[#060b17]/80 flex flex-col shrink-0">
          <div className="p-4 border-b border-cyan-500/20 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-cyan-300 font-mono">
              <Server className="w-4 h-4 text-cyan-400" />
              <span>全连接器总览 (FLEET)</span>
            </div>
            <button
              onClick={refreshFleet}
              title="刷新舰队状态"
              className="text-cyan-400/60 hover:text-cyan-300 p-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 连接器列表 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {fleetOverview?.connectors.map((c) => {
              const isSelected = selectedConnector === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedConnector(isSelected ? null : c.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer relative overflow-hidden ${
                    isSelected
                      ? 'border-cyan-400 bg-cyan-950/40 shadow-[0_0_15px_rgba(0,242,254,0.15)]'
                      : 'border-slate-800/80 bg-slate-900/30 hover:border-cyan-500/40'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            c.isLoggedIn ? 'bg-emerald-400 shadow-[0_0_6px_#10b981]' : 'bg-slate-600'
                          }`}
                        />
                        <span className="text-xs font-semibold text-cyan-100">{c.name}</span>
                      </div>
                      <div className="text-[10px] text-cyan-400/60 font-mono mt-1">
                        {c.productType.toUpperCase()} | {c.envType}
                      </div>
                    </div>

                    {c.isCurrentFocus && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">
                        FOCUS
                      </span>
                    )}
                  </div>

                  {c.tenantId && (
                    <div className="mt-2 text-[10px] text-slate-400 font-mono flex items-center justify-between border-t border-slate-800/60 pt-1.5">
                      <span>租户: {c.tenantId}</span>
                      <span>{c.userName ? `用户: ${c.userName}` : ''}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 底部保护状态 */}
          <div className="p-3 border-t border-cyan-500/20 bg-cyan-950/20 text-[11px] text-cyan-300/80 flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>生产环境熔断防御系统已启动</span>
          </div>
        </aside>

        {/* 右侧：中央反应堆、全息对话流与操作台 */}
        <main className="flex-1 flex flex-col min-h-0 bg-radial from-[#08152e]/40 to-[#040812]">
          {/* 中央全息方舟反应堆 (HUD Center Core) */}
          <div className="h-44 border-b border-cyan-500/20 bg-[#060e1f]/40 flex items-center justify-center relative shrink-0">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,242,254,0.1),transparent_70%)]" />
            <div className="flex flex-col items-center z-10">
              <JarvisReactor
                size="large"
                state={jarvisState}
                className="drop-shadow-[0_0_35px_rgba(0,242,254,0.3)]"
              />
              <div className="mt-2 text-[11px] font-mono tracking-widest text-cyan-400/80 uppercase">
                {jarvisState === 'listening'
                  ? '● 正在倾听指挥官指令...'
                  : jarvisState === 'thinking'
                  ? '● 贾维斯正在全网舰队推理中...'
                  : jarvisState === 'speaking'
                  ? '● 贾维斯正在全息语音汇报...'
                  : jarvisState === 'alert'
                  ? '● 生产环境安全预警'
                  : '● J.A.R.V.I.S. ONLINE'}
              </div>
            </div>
          </div>

          {/* 对话消息展示区 */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((msg) => {
              const isAssistant = msg.role === 'assistant';
              return (
                <div
                  key={msg.id}
                  className={`flex items-start space-x-3 ${isAssistant ? '' : 'flex-row-reverse space-x-reverse'}`}
                >
                  {isAssistant && (
                    <div className="shrink-0 mt-1">
                      <JarvisReactor size="mini" state="idle" />
                    </div>
                  )}

                  <div
                    className={`max-w-2xl rounded-2xl px-5 py-3.5 text-xs leading-relaxed transition-all ${
                      isAssistant
                        ? 'border border-cyan-500/30 bg-[#071329]/90 text-cyan-100 shadow-[0_0_20px_rgba(0,242,254,0.1)]'
                        : 'border border-emerald-500/30 bg-[#04201a]/90 text-emerald-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1 text-[10px] text-cyan-400/60 font-mono">
                      <span>{isAssistant ? 'J.A.R.V.I.S.' : fullCall}</span>
                      <span>{new Date(msg.createdAt).toLocaleTimeString()}</span>
                    </div>

                    <div className="whitespace-pre-wrap font-sans text-sm">{msg.content}</div>

                    {isAssistant && (
                      <div className="mt-2.5 pt-2 border-t border-cyan-500/20 flex items-center justify-end space-x-2">
                        <button
                          onClick={() => speakText(msg.content)}
                          title="重新发音朗读"
                          className="flex items-center space-x-1 text-[11px] text-cyan-400 hover:text-cyan-200"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>朗读</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* 快捷指令胶囊 (Quick Prompt Chips) */}
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
                className="shrink-0 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-950/40 text-[11px] text-cyan-300 hover:border-cyan-400 hover:bg-cyan-900/60 transition-all font-mono"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* 底部交互输入框与对讲麦克风 */}
          <footer className="p-4 border-t border-cyan-500/20 bg-[#060c1c]/95 flex items-center space-x-3 shrink-0">
            <button
              type="button"
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              title="按住对讲 (硅基流动 SenseVoice 极速识别)"
              className={`p-3 rounded-xl border transition-all flex items-center space-x-2 ${
                isRecording
                  ? 'border-emerald-400 bg-emerald-950 text-emerald-300 animate-pulse shadow-[0_0_20px_#10b981]'
                  : 'border-cyan-500/40 bg-slate-900/70 text-cyan-300 hover:border-cyan-400 hover:bg-cyan-950/50'
              }`}
            >
              {isRecording ? <Radio className="w-5 h-5 animate-spin text-emerald-400" /> : <Mic className="w-5 h-5" />}
              <span className="text-xs font-mono font-bold">{isRecording ? '倾听中...' : '按住说话'}</span>
            </button>

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
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all flex items-center space-x-1.5 shadow-[0_0_15px_rgba(0,242,254,0.3)]"
            >
              <span>执行</span>
              <Send className="w-4 h-4" />
            </button>
          </footer>
        </main>
      </div>
    </div>
  );
};
