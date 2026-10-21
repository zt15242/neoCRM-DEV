import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Mic, 
  Radio, 
  Loader2, 
  Sparkles, 
  Volume2, 
  AlertCircle, 
  XCircle, 
  Headphones,
  ChevronDown,
  Square
} from 'lucide-react';
import { JarvisAsrConfigModal } from './JarvisAsrConfigModal';

interface JarvisMicButtonProps {
  onTranscribed: (text: string) => void;
  onStateChange?: (state: 'idle' | 'listening' | 'thinking') => void;
  className?: string;
  variant?: 'compact' | 'full';
  showToast?: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const JarvisMicButton: React.FC<JarvisMicButtonProps> = ({
  onTranscribed,
  onStateChange,
  className = '',
  variant = 'full',
  showToast,
}) => {
  // 核心录音与对讲模式：
  // 'idle': 空闲
  // 'holding': 正在长按录音中 (松手即自动发送)
  // 'locked': 正在点击锁定对讲中 (说完后再次点击即发送)
  // 'transcribing': 正在调用 ASR 语音识别
  const [recordMode, setRecordMode] = useState<'idle' | 'holding' | 'locked' | 'transcribing'>('idle');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [hudMessage, setHudMessage] = useState<{ text: string; type: 'info' | 'error' | 'success' } | null>(null);

  // 设备状态
  const [currentDeviceLabel, setCurrentDeviceLabel] = useState<string>('系统默认麦克风');
  const [deviceList, setDeviceList] = useState<MediaDeviceInfo[]>([]);
  const [isDeviceMenuOpen, setIsDeviceMenuOpen] = useState(false);

  // 实时声波频谱状态 (5 根随说话音量高低真实跳动的声学能量柱)
  const [waveBars, setWaveBars] = useState<number[]>([15, 20, 25, 20, 15]);

  // 引用追踪 (避免异步闭包失效)
  const recordModeRef = useRef<'idle' | 'holding' | 'locked' | 'transcribing'>('idle');
  const pressDownTimeRef = useRef<number>(0);
  const recordStartTimeRef = useRef<number>(0);
  const isAcquiringStreamRef = useRef<boolean>(false);
  const pendingStopRef = useRef<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<any>(null);
  const hudTimerRef = useRef<any>(null);

  // Web Audio API 实时声波分析器
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // 保持 ref 同步
  useEffect(() => {
    recordModeRef.current = recordMode;
  }, [recordMode]);

  const notify = useCallback(
    (type: 'info' | 'error' | 'success', text: string) => {
      showToast?.(type, text);
      setHudMessage({ type, text });
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
      hudTimerRef.current = setTimeout(() => {
        setHudMessage(null);
      }, 4000);
    },
    [showToast]
  );

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopAudioAnalyser = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setWaveBars([15, 20, 25, 20, 15]);
  };

  const startAudioAnalyser = (stream: MediaStream) => {
    stopAudioAnalyser();
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateSpectrum = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        const b1 = Math.min(100, Math.max(12, (dataArray[1] / 255) * 100));
        const b2 = Math.min(100, Math.max(16, (dataArray[3] / 255) * 100));
        const b3 = Math.min(100, Math.max(22, (dataArray[5] / 255) * 100));
        const b4 = Math.min(100, Math.max(16, (dataArray[7] / 255) * 100));
        const b5 = Math.min(100, Math.max(12, (dataArray[9] / 255) * 100));

        setWaveBars([b1, b2, b3, b4, b5]);
        animFrameRef.current = requestAnimationFrame(updateSpectrum);
      };

      animFrameRef.current = requestAnimationFrame(updateSpectrum);
    } catch (e: any) {
      console.warn('[Jarvis Mic] 启动频谱分析器提示:', e.message);
    }
  };

  // 刷新当前可用的输入设备
  const refreshDevices = useCallback(async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const inputs = devs.filter((d) => d.kind === 'audioinput');
        setDeviceList(inputs);

        const savedId = localStorage.getItem('jarvis_mic_device_id');
        let matched = inputs.find((d) => d.deviceId && d.deviceId === savedId);

        if (!matched && inputs.length > 0) {
          const usbHeadset = inputs.find(
            (d) =>
              d.label &&
              (d.label.toLowerCase().includes('xiberia') ||
                d.label.toLowerCase().includes('usb') ||
                d.label.toLowerCase().includes('headset') ||
                d.label.toLowerCase().includes('k03s'))
          );
          if (usbHeadset && usbHeadset.deviceId) {
            matched = usbHeadset;
            localStorage.setItem('jarvis_mic_device_id', matched.deviceId);
          }
        }

        if (matched && matched.label) {
          setCurrentDeviceLabel(matched.label);
        } else {
          setCurrentDeviceLabel('系统默认麦克风');
        }
      }
    } catch (e: any) {
      console.warn('[Jarvis Mic] 枚举设备异常:', e.message);
    }
  }, []);

  // 安全获取音频流（使用 ideal，绝不抛 OverconstrainedError）
  const acquireAudioStream = useCallback(async (): Promise<MediaStream> => {
    const savedDevId = localStorage.getItem('jarvis_mic_device_id');

    // 优先尝试指定设备（采用 ideal 而不是 exact，设备拔掉或 ID 变动时自动回退）
    if (savedDevId) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { ideal: savedDevId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (err) {
        console.warn('[Jarvis Mic] 指定设备流获取失败，回退默认设备:', err);
      }
    }

    // 默认设备获取
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  }, []);

  useEffect(() => {
    refreshDevices();
    return () => {
      clearTimer();
      stopAudioAnalyser();
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [refreshDevices]);

  // 停止录音并执行 ASR
  const stopRecordingAndTranscribe = useCallback(() => {
    clearTimer();
    stopAudioAnalyser();

    if (isAcquiringStreamRef.current) {
      pendingStopRef.current = true;
      return;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      setRecordMode('idle');
      onStateChange?.('idle');
      return;
    }

    try {
      if (recorder.state === 'recording') {
        try {
          recorder.requestData();
        } catch {}
      }
      recorder.stop();
    } catch (err: any) {
      console.warn('[Jarvis Mic] 停止录音异常:', err.message);
      setRecordMode('idle');
      onStateChange?.('idle');
    }
  }, [onStateChange]);

  // 启动录音
  const startRecording = useCallback(async () => {
    if (recordModeRef.current === 'transcribing') return;

    audioChunksRef.current = [];
    isAcquiringStreamRef.current = true;
    pendingStopRef.current = false;

    try {
      const stream = await acquireAudioStream();
      streamRef.current = stream;

      // 更新标签显示
      const track = stream.getAudioTracks()[0];
      if (track && track.label) {
        setCurrentDeviceLabel(track.label);
      }

      startAudioAnalyser(stream);

      let mimeType = 'audio/webm';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        }
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stopAudioAnalyser();
        setRecordMode('transcribing');
        onStateChange?.('thinking');

        await new Promise((r) => setTimeout(r, 80));

        // 收集完毕后关闭音轨释放麦克风硬件
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        const pressDuration = Date.now() - pressDownTimeRef.current;
        const totalSize = audioChunksRef.current.reduce((acc, c) => acc + c.size, 0);

        // 如果用户按住时间极短 (<250ms) 且没有有效声音
        if (pressDuration < 250 || totalSize < 20) {
          setRecordMode('idle');
          onStateChange?.('idle');
          notify('info', '按住说话时间过短，请长按清晰说话');
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const reader = new FileReader();

        reader.onloadend = async () => {
          const rawBase64 = reader.result as string;
          const base64Audio = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64;

          if (!base64Audio || !window.neoApi?.jarvisTranscribeAudio) {
            setRecordMode('idle');
            onStateChange?.('idle');
            notify('error', '语音模块通信接口未就绪');
            return;
          }

          try {
            notify('info', '正在高速识别普通话中...');
            const res = await window.neoApi.jarvisTranscribeAudio(base64Audio, mimeType);

            if (res.needConfig) {
              setIsConfigModalOpen(true);
              notify('info', '请先配置语音识别 API Key');
              setRecordMode('idle');
              onStateChange?.('idle');
              return;
            }

            if (res.error) {
              notify('error', `语音识别异常: ${res.error}`);
              setRecordMode('idle');
              onStateChange?.('idle');
              return;
            }

            const recognizedText = (res.text || '').trim();
            if (recognizedText) {
              notify('success', `已识别: "${recognizedText.slice(0, 16)}..."`);
              setRecordMode('idle');
              // 关键：识别成功并下达指令后，由 chat 异步调度接管生命周期 (保持 thinking 思考特效，绝不在此时切回 idle)
              onTranscribed(recognizedText);
              return;
            } else {
              notify('info', '未能捕捉到清晰声音，请靠近麦克风重试');
            }
          } catch (err: any) {
            notify('error', `转写服务请求异常: ${err.message}`);
          }
          setRecordMode('idle');
          onStateChange?.('idle');
        };

        reader.readAsDataURL(audioBlob);
      };

      recorder.start(100);
      recordStartTimeRef.current = Date.now();
      isAcquiringStreamRef.current = false;
      setElapsedSec(0);
      onStateChange?.('listening');

      clearTimer();
      timerRef.current = setInterval(() => {
        setElapsedSec((prev) => prev + 1);
      }, 1000);

      // 如果在获取流期间用户已经松开了按键
      if (pendingStopRef.current) {
        pendingStopRef.current = false;
        setTimeout(() => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            try {
              mediaRecorderRef.current.requestData();
            } catch {}
            mediaRecorderRef.current.stop();
          }
        }, 150);
      }
    } catch (err: any) {
      isAcquiringStreamRef.current = false;
      pendingStopRef.current = false;
      console.error('[Jarvis Mic] 麦克风录音异常:', err);
      stopAudioAnalyser();
      setRecordMode('idle');
      onStateChange?.('idle');
      notify('error', `无法启用麦克风: ${err.message || '请在系统设置中允许权限'}`);
    }
  }, [acquireAudioStream, onStateChange, onTranscribed, notify]);

  // 全局鼠标松开兜底监听 (按住说话：松开鼠标立即停止录音并发送)
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (recordModeRef.current === 'holding') {
        stopRecordingAndTranscribe();
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [stopRecordingAndTranscribe]);

  // 鼠标按下：立即开始按住录音
  const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return; // 仅左键响应
    e.preventDefault();

    if (recordModeRef.current === 'idle') {
      pressDownTimeRef.current = Date.now();
      setRecordMode('holding');
      startRecording();
    }
  };

  const handleSwitchDevice = (deviceId: string) => {
    if (deviceId) {
      localStorage.setItem('jarvis_mic_device_id', deviceId);
    } else {
      localStorage.removeItem('jarvis_mic_device_id');
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    refreshDevices();
    setIsDeviceMenuOpen(false);
  };

  const formatSec = (sec: number) => {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  const isRecording = recordMode === 'holding' || recordMode === 'locked';

  return (
    <div className="relative inline-flex items-center space-x-1.5">
      {/* 科技感 HUD 消息悬浮气泡 */}
      {hudMessage && (
        <div
          className={`absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap shadow-[0_0_20px_rgba(0,0,0,0.8)] border backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 flex items-center space-x-1.5 pointer-events-none ${
            hudMessage.type === 'error'
              ? 'border-red-500/60 bg-red-950/90 text-red-200 shadow-red-500/30'
              : hudMessage.type === 'success'
              ? 'border-emerald-500/60 bg-emerald-950/90 text-emerald-200 shadow-emerald-500/30'
              : 'border-cyan-500/60 bg-[#061024]/95 text-cyan-200 shadow-cyan-500/30'
          }`}
        >
          {hudMessage.type === 'error' ? (
            <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          ) : hudMessage.type === 'success' ? (
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <Volume2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          )}
          <span>{hudMessage.text}</span>
        </div>
      )}

      {/* 对讲主按钮 */}
      <button
        type="button"
        onMouseDown={handleMouseDown}
        disabled={recordMode === 'transcribing'}
        title={
          isRecording
            ? recordMode === 'holding'
              ? '正在录音...松开鼠标即可发送 (也可轻点转为点击对讲)'
              : '正在对讲倾听中...再次点击此按钮即可发送语音'
            : recordMode === 'transcribing'
            ? '正在高速识别语音中...'
            : '按住说话或点击对讲 (右键点击开启硬件自测与设备选择)'
        }
        onContextMenu={(e) => {
          e.preventDefault();
          setIsConfigModalOpen(true);
        }}
        className={`transition-all select-none cursor-pointer flex items-center justify-center space-x-2 relative overflow-hidden ${className} ${
          isRecording
            ? 'border-emerald-400 bg-emerald-950/95 text-emerald-200 shadow-[0_0_25px_rgba(16,185,129,0.6)] ring-2 ring-emerald-400/60'
            : recordMode === 'transcribing'
            ? 'border-indigo-400 bg-indigo-950/80 text-indigo-300'
            : 'border-cyan-500/40 bg-slate-900/70 text-cyan-300 hover:border-cyan-400 hover:bg-cyan-950/50 hover:shadow-[0_0_15px_rgba(0,242,254,0.25)]'
        }`}
      >
        {/* 录音中的真实动态声波跳动频谱条 */}
        {isRecording ? (
          <div className="flex items-center space-x-0.5 h-4 px-0.5">
            {waveBars.map((h, i) => (
              <span
                key={i}
                style={{ height: `${Math.max(4, (h / 100) * 16)}px` }}
                className="w-1 bg-emerald-400 rounded-full transition-all duration-75"
              />
            ))}
          </div>
        ) : recordMode === 'transcribing' ? (
          <Loader2 className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
        ) : (
          <Mic className="w-4 h-4 shrink-0 transition-transform active:scale-125" />
        )}

        {variant === 'full' && (
          <span className="text-xs font-mono font-bold truncate">
            {recordMode === 'transcribing'
              ? '识别中...'
              : recordMode === 'holding'
              ? `松开发送 ${formatSec(elapsedSec)}`
              : '按住说话'}
          </span>
        )}
      </button>

      {/* 当前音频输入设备胶囊标签 */}
      {variant === 'full' && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsDeviceMenuOpen(!isDeviceMenuOpen)}
            title={`当前输入设备: ${currentDeviceLabel} (点击切换麦克风)`}
            className="flex items-center space-x-1 px-2 py-1.5 rounded-lg border border-cyan-500/20 bg-slate-900/60 text-[11px] text-cyan-300/80 hover:text-cyan-200 hover:border-cyan-400/40 font-mono transition-colors cursor-pointer max-w-[160px] truncate"
          >
            <Headphones className="w-3 h-3 text-cyan-400 shrink-0" />
            <span className="truncate">{currentDeviceLabel.replace(/\s*\(.*\)/, '')}</span>
            <ChevronDown className="w-2.5 h-2.5 shrink-0 opacity-60" />
          </button>

          {/* 设备切换微型下拉 */}
          {isDeviceMenuOpen && (
            <div className="absolute bottom-full mb-1.5 left-0 w-56 rounded-xl border border-cyan-500/40 bg-[#060c1c]/95 p-1.5 shadow-[0_0_25px_rgba(0,0,0,0.8)] backdrop-blur-md z-50 animate-in fade-in zoom-in-95 duration-100 text-xs">
              <div className="px-2 py-1 text-[10px] text-cyan-400/60 font-mono border-b border-cyan-500/15 flex items-center justify-between">
                <span>选择输入麦克风</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsDeviceMenuOpen(false);
                    setIsConfigModalOpen(true);
                  }}
                  className="text-cyan-300 hover:underline"
                >
                  硬件自检
                </button>
              </div>

              <div className="py-1 space-y-0.5 max-h-48 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => handleSwitchDevice('')}
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-cyan-950/60 text-[11px] text-emerald-300 font-sans truncate flex items-center space-x-1.5 cursor-pointer"
                >
                  <Headphones className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span className="truncate">跟随系统默认麦克风 (推荐)</span>
                </button>
                {deviceList.map((dev) => (
                  <button
                    key={dev.deviceId}
                    type="button"
                    onClick={() => handleSwitchDevice(dev.deviceId)}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-cyan-950/60 text-[11px] text-cyan-100 font-sans truncate flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Headphones className="w-3 h-3 text-cyan-400 shrink-0" />
                    <span className="truncate">{dev.label || '音频输入设备'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 麦克风硬件自测与 ASR 配置模态框 */}
      <JarvisAsrConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        onSuccess={() => {
          notify('success', '麦克风与语音识别已就绪，请按住说话');
        }}
        showToast={showToast}
      />
    </div>
  );
};
