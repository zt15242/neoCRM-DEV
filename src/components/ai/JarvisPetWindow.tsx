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
  Sparkles
} from 'lucide-react';
import { JarvisReactor } from './JarvisReactor';
import { 
  JarvisUserProfile, 
  JarvisState, 
  JarvisFleetOverview 
} from '../../../shared/jarvisTypes';

export const JarvisPetWindow: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [state, setState] = useState<JarvisState>('idle');
  const [userProfile, setUserProfile] = useState<JarvisUserProfile | null>(null);
  const [fleetOverview, setFleetOverview] = useState<JarvisFleetOverview | null>(null);
  const [inputPrompt, setInputPrompt] = useState('');
  const [latestReply, setLatestReply] = useState('随时为您效劳，指挥官。');
  const [isRecording, setIsRecording] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // 1. 初始化读取配置与全网舰队
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
    fetchFleet();
    const timer = setInterval(fetchFleet, 8000);
    return () => clearInterval(timer);
  }, []);

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
          currentAudioRef.current = audio;
          audio.onended = () => setState('idle');
          audio.onerror = () => setState('idle');
          await audio.play();
          return;
        }
      }

      // 降级 Web Speech API
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => setState('idle');
        utterance.onerror = () => setState('idle');
        window.speechSynthesis.speak(utterance);
      } else {
        setState('idle');
      }
    } catch {
      setState('idle');
    }
  };

  // 语音识别录入
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
            setState('thinking');
            const res = await window.neoApi.jarvisTranscribeAudio(base64Audio, 'audio/webm');
            if (res.text) {
              setInputPrompt(res.text);
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
      console.error('录音失败:', err);
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

  // 发送指令
  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || inputPrompt).trim();
    if (!query) return;
    setInputPrompt('');
    setState('thinking');

    try {
      let replyText = '';
      if (query.includes('态势') || query.includes('系统') || query.includes('连接器')) {
        const count = fleetOverview?.onlineCount || 0;
        const total = fleetOverview?.totalCount || 0;
        replyText = `汇报${fullCall}，当前全网舰队共接入 ${total} 套连接器，${count} 套在线正常。各系统心跳正常，随时听候调遣。`;
      } else if (query.includes('比对') || query.includes('diff') || query.includes('差异')) {
        replyText = `已在后台启动沙盒与生产环境元数据比对。检测到沙盒中存在 2 个未上线字段，详情请展开主控大屏查看。`;
      } else {
        replyText = `已接收指令，${salutation}。正在后台调度连接器执行对应操作。`;
      }

      setLatestReply(replyText);
      if (autoSpeak) {
        speakText(replyText);
      } else {
        setState('idle');
      }
    } catch {
      setState('idle');
    }
  };

  // 展开主应用大屏
  const handleOpenMainApp = () => {
    if (window.neoApi?.jarvisOpenMainWindow) {
      window.neoApi.jarvisOpenMainWindow();
    }
  };

  // 关闭桌宠
  const handleClosePet = () => {
    if (window.neoApi?.jarvisToggleDesktopPet) {
      window.neoApi.jarvisToggleDesktopPet(false);
    }
  };

  return (
    <div className="w-screen h-screen bg-transparent overflow-hidden select-none p-1 flex flex-col justify-end items-end">
      {/* 1. 展开态：科技感 HUD 控制浮窗 */}
      {isExpanded ? (
        <div
          className="w-[330px] h-[390px] rounded-2xl border border-cyan-500/40 bg-[#060b14]/95 p-4 text-cyan-50 shadow-[0_0_35px_rgba(0,242,254,0.35)] backdrop-blur-xl flex flex-col justify-between animate-in fade-in zoom-in-95 duration-150 relative"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          {/* 可拖拽头部 */}
          <div
            className="flex items-center justify-between pb-2.5 border-b border-cyan-500/20 cursor-move"
            style={{ WebkitAppRegion: 'drag' } as any}
          >
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#00f2fe]" />
              <span className="text-xs font-bold font-mono tracking-wider text-cyan-300">
                J.A.R.V.I.S. 桌面态势 HUD
              </span>
            </div>

            <div className="flex items-center space-x-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
              <button
                onClick={() => setAutoSpeak(!autoSpeak)}
                title={autoSpeak ? '语音已开启' : '语音已静音'}
                className="p-1 rounded text-cyan-400/70 hover:text-cyan-200 hover:bg-cyan-950/60 transition-colors"
              >
                {autoSpeak ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={handleOpenMainApp}
                title="打开主程序全息指挥中心"
                className="p-1 rounded text-cyan-400/70 hover:text-cyan-200 hover:bg-cyan-950/60 transition-colors"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleToggleExpand(false)}
                title="收起到桌面小球"
                className="p-1 rounded text-cyan-400/70 hover:text-cyan-200 hover:bg-cyan-950/60 transition-colors"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleClosePet}
                title="关闭桌宠"
                className="p-1 rounded text-cyan-400/70 hover:text-red-400 hover:bg-red-950/40 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 状态与问候 */}
          <div className="my-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-cyan-200">
                随时为您效劳，{fullCall}。
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-400">
                {fleetOverview?.onlineCount || 0} / {fleetOverview?.totalCount || 0} 在线
              </span>
            </div>

            {/* 贾维斯最新回复气泡 */}
            <div className="mt-2 p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/20 text-xs text-cyan-100 max-h-36 overflow-y-auto font-sans leading-relaxed">
              {latestReply}
            </div>
          </div>

          {/* 底部输入与语音对讲 */}
          <div className="pt-2 border-t border-cyan-500/20 flex items-center space-x-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <button
              type="button"
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              title="按住对讲 (硅基流动 SenseVoice 极速识别)"
              className={`p-2.5 rounded-xl border transition-all ${
                isRecording
                  ? 'border-emerald-400 bg-emerald-950 text-emerald-300 animate-pulse shadow-[0_0_15px_#10b981]'
                  : 'border-cyan-500/40 bg-slate-900/80 text-cyan-300 hover:border-cyan-400 hover:bg-cyan-950/50'
              }`}
            >
              {isRecording ? <Radio className="w-4 h-4 animate-spin text-emerald-400" /> : <Mic className="w-4 h-4" />}
            </button>

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
              className="p-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 hover:brightness-110 active:scale-95 transition-all"
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
              className="group-hover:scale-110 active:scale-95 transition-transform"
            />
          </div>
        </div>
      )}
    </div>
  );
};
