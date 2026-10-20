import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Maximize2, 
  Settings, 
  X, 
  ShieldCheck, 
  Radio, 
  Volume2, 
  Send 
} from 'lucide-react';
import { 
  JarvisUserProfile, 
  JarvisState, 
  JarvisFleetOverview 
} from '../../../shared/jarvisTypes';
import { JarvisReactor } from './JarvisReactor';
import { JarvisVolumeControl } from './JarvisVolumeControl';
import { getJarvisAudioSettings } from './jarvisAudioHelper';

interface JarvisDesktopPetProps {
  userProfile: JarvisUserProfile | null;
  onOpenCommandCenter: () => void;
  onOpenSettings: () => void;
  onSendMessage?: (text: string) => Promise<string | void>;
}

export const JarvisDesktopPet: React.FC<JarvisDesktopPetProps> = ({
  userProfile,
  onOpenCommandCenter,
  onOpenSettings,
  onSendMessage,
}) => {
  const [position, setPosition] = useState(
    userProfile?.petPosition || { x: window.innerWidth - 90, y: window.innerHeight - 100 }
  );
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [state, setState] = useState<JarvisState>('idle');
  const [quickInput, setQuickInput] = useState('');
  const [fleetOverview, setFleetOverview] = useState<JarvisFleetOverview | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [latestReply, setLatestReply] = useState<string>('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // 加载全连接器舰队状态
  useEffect(() => {
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
    fetchFleet();
    const interval = setInterval(fetchFleet, 10000);
    return () => clearInterval(interval);
  }, []);

  // 鼠标拖拽处理
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.pet-menu-content')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const newX = Math.max(10, Math.min(window.innerWidth - 70, e.clientX - dragStart.x));
      const newY = Math.max(10, Math.min(window.innerHeight - 70, e.clientY - dragStart.y));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  // 语音输入 ASR 控制
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          if (base64Audio && window.neoApi?.jarvisTranscribeAudio) {
            setState('thinking');
            const res = await window.neoApi.jarvisTranscribeAudio(base64Audio, 'audio/webm');
            if (res.text) {
              setQuickInput(res.text);
              handleSend(res.text);
            } else {
              setState('idle');
            }
          }
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      setIsRecording(true);
      setState('listening');
    } catch (err) {
      console.error('麦克风录入失败:', err);
      setIsRecording(false);
      setState('idle');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || quickInput).trim();
    if (!text) return;
    setQuickInput('');
    setState('thinking');

    try {
      let replyText = '';
      if (window.neoApi?.jarvisChat) {
        const res = await window.neoApi.jarvisChat({
          message: text,
          userProfile,
        });
        replyText = res.content;
      } else if (onSendMessage) {
        const reply = await onSendMessage(text);
        if (reply) replyText = reply;
      }

      if (replyText) {
        setLatestReply(replyText);
        speakReply(replyText);
      } else {
        setState('idle');
      }
    } catch {
      setState('idle');
    }
  };

  const speakReply = async (replyText: string) => {
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
        const res = await window.neoApi.jarvisSynthesizeSpeech(replyText, {
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

      // 降级使用 Web Speech API
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(replyText);
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

  if (!userProfile?.petVisible) return null;

  const salutation = userProfile?.salutation || (userProfile?.gender === 'female' ? '女士' : '先生');
  const commanderName = userProfile?.name || '指挥官';

  return (
    <div
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      className="fixed z-40 select-none transition-shadow"
      onMouseDown={handleMouseDown}
    >
      {/* 迷你反应堆悬浮球 */}
      <div className="relative group">
        <JarvisReactor
          size="mini"
          state={state}
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="hover:scale-110 active:scale-95 transition-transform"
        />

        {/* 悬停提示 */}
        {!isMenuOpen && (
          <div className="absolute right-full top-1/2 -translate-y-1/2 mr-2 hidden group-hover:flex items-center px-2 py-1 rounded bg-black/90 border border-cyan-500/40 text-[11px] text-cyan-300 font-mono whitespace-nowrap shadow-lg">
            J.A.R.V.I.S. (点击呼叫)
          </div>
        )}
      </div>

      {/* 展开的迷你 HUD 菜单 */}
      {isMenuOpen && (
        <div
          className="pet-menu-content absolute bottom-full right-0 mb-3 w-80 rounded-xl border border-cyan-500/40 bg-[#060b14]/95 p-4 text-cyan-50 shadow-[0_0_30px_rgba(0,242,254,0.3)] backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* 头部标题与控制按钮 */}
          <div className="flex items-center justify-between pb-2 border-b border-cyan-500/20">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-xs font-bold font-mono tracking-wider text-cyan-400">
                J.A.R.V.I.S. HUD
              </span>
            </div>
            <div className="flex items-center space-x-1.5">
              <JarvisVolumeControl currentAudio={currentAudioRef.current} />
              <button
                onClick={onOpenCommandCenter}
                title="展开全息全局大屏"
                className="p-1 rounded text-cyan-400/70 hover:text-cyan-200 hover:bg-cyan-950/60"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onOpenSettings}
                title="指挥官档案设置"
                className="p-1 rounded text-cyan-400/70 hover:text-cyan-200 hover:bg-cyan-950/60"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="p-1 rounded text-cyan-400/70 hover:text-cyan-200 hover:bg-cyan-950/60"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 管家问候与全舰队状态 */}
          <div className="my-2.5">
            <div className="text-xs text-cyan-200 font-medium">
              随时为您效劳，{commanderName}{salutation}。
            </div>
            <div className="text-[10px] text-cyan-400/70 font-mono mt-0.5 flex items-center space-x-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>
                全网舰队：{fleetOverview?.onlineCount || 0} / {fleetOverview?.totalCount || 0} 套连接器在线
              </span>
            </div>
          </div>

          {/* 最新回复展示 */}
          {latestReply && (
            <div className="mb-2.5 p-2 rounded bg-cyan-950/40 border border-cyan-500/20 text-xs text-cyan-100 max-h-24 overflow-y-auto font-sans leading-relaxed">
              {latestReply}
            </div>
          )}

          {/* 快捷语音与输入框 */}
          <div className="flex items-center space-x-2 pt-2 border-t border-cyan-500/20">
            <button
              type="button"
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              title="按住对讲 (硅基流动 SenseVoice 极速识别)"
              className={`p-2 rounded-lg border transition-all ${
                isRecording
                  ? 'border-emerald-400 bg-emerald-950 text-emerald-300 animate-pulse'
                  : 'border-cyan-500/30 bg-slate-900/60 text-cyan-400 hover:border-cyan-400 hover:bg-cyan-950/40'
              }`}
            >
              {isRecording ? <Radio className="w-4 h-4 text-emerald-400 animate-spin" /> : <Mic className="w-4 h-4" />}
            </button>

            <input
              type="text"
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="对管家下达指令..."
              className="flex-1 rounded-lg border border-cyan-500/30 bg-slate-900/80 px-2.5 py-1.5 text-xs text-cyan-100 placeholder-cyan-500/40 outline-none focus:border-cyan-400"
            />

            <button
              type="button"
              onClick={() => handleSend()}
              className="p-1.5 rounded-lg bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
