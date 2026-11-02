import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Mic,
  Square,
  Pause,
  Play,
  Sparkles,
  Volume2,
  AlertCircle,
  Clock,
  Layers,
} from 'lucide-react';

interface MeetingRecordModalProps {
  onClose: () => void;
  onRecordingStarted?: (title: string) => Promise<string>;
  onLiveChunk?: (meetingId: string, audioBuffer: ArrayBuffer, fileName: string, startTimeSec: number) => Promise<void>;
  onFinishRecording: (title: string, audioBuffer: ArrayBuffer, fileName: string, meetingId?: string, durationSec?: number) => Promise<void>;
  showToast?: (type: 'success' | 'error' | 'info', text: string) => void;
}

const LIVE_CHUNK_SECONDS = 25;

export const MeetingRecordModal: React.FC<MeetingRecordModalProps> = ({
  onClose,
  onRecordingStarted,
  onLiveChunk,
  onFinishRecording,
  showToast,
}) => {
  const [meetingTitle, setMeetingTitle] = useState(() => {
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
    return `现场研讨会 (${dateStr} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')})`;
  });

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [systemAudioNotice, setSystemAudioNotice] = useState<string | null>(null);
  const [includeSystemAudio, setIncludeSystemAudio] = useState(true);
  const [systemAudioActive, setSystemAudioActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunkRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const systemStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<any>(null);
  const chunkTimerRef = useRef<any>(null);
  const elapsedSecondsRef = useRef(0);
  const chunkPendingRef = useRef<Set<Promise<void>>>(new Set());
  const chunkProcessChainRef = useRef<Promise<void>>(Promise.resolve());
  const chunkStopPromiseRef = useRef<Promise<void> | null>(null);
  const recordingActiveRef = useRef(false);
  const pausedRef = useRef(false);
  const stoppingRef = useRef(false);
  const meetingIdRef = useRef<string | undefined>(undefined);
  const mimeTypeRef = useRef('audio/webm');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // 格式化时间 00:00:00
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getMimeType = () => {
    if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
    return '';
  };

  const releaseAudioResources = () => {
    const streams = [streamRef.current, micStreamRef.current, systemStreamRef.current];
    const seen = new Set<MediaStream>();
    streams.forEach((stream) => {
      if (!stream || seen.has(stream)) return;
      seen.add(stream);
      stream.getTracks().forEach((track) => track.stop());
    });
    streamRef.current = null;
    micStreamRef.current = null;
    systemStreamRef.current = null;
    setSystemAudioActive(false);

    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== 'closed') {
      void audioContext.close().catch(() => undefined);
    }
  };

  const queueLiveChunk = (blob: Blob, startTimeSec: number, mimeType: string) => {
    const meetingId = meetingIdRef.current;
    if (!onLiveChunk || !meetingId || blob.size === 0) return;
    const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';
    // 片段必须串行处理。后端会基于当前会议记录追加逐字稿，
    // 并发请求可能都读取同一个旧快照，后返回的结果会覆盖先返回的片段。
    const task = chunkProcessChainRef.current
      .catch(() => undefined)
      .then(async () => {
        await onLiveChunk(
          meetingId,
          await blob.arrayBuffer(),
          `live_${Date.now()}.${ext}`,
          startTimeSec,
        );
      })
      .catch((err: any) => {
        console.warn('[MeetingRecordModal] 实时片段处理失败:', err);
        showToast?.('error', `实时片段处理失败: ${err?.message || '转写服务异常'}`);
      });
    chunkProcessChainRef.current = task;
    chunkPendingRef.current.add(task);
    void task.finally(() => chunkPendingRef.current.delete(task));
  };

  const startLiveChunkRecorder = () => {
    const stream = streamRef.current;
    if (!stream || stoppingRef.current || pausedRef.current || !recordingActiveRef.current) return;

    if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
    const mimeType = mimeTypeRef.current;
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    const startTimeSec = elapsedSecondsRef.current;
    let resolveStopped: (() => void) | undefined;
    const stopPromise = new Promise<void>((resolve) => {
      resolveStopped = resolve;
    });
    chunkStopPromiseRef.current = stopPromise;
    chunkRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
      const shouldContinue = recordingActiveRef.current && !stoppingRef.current && !pausedRef.current;
      queueLiveChunk(blob, startTimeSec, recorder.mimeType || mimeType || 'audio/webm');
      resolveStopped?.();
      if (shouldContinue) {
        startLiveChunkRecorder();
      } else if (chunkRecorderRef.current === recorder) {
        chunkRecorderRef.current = null;
      }
    };
    recorder.start(1000);
    chunkTimerRef.current = setTimeout(() => {
      if (chunkRecorderRef.current === recorder && recorder.state === 'recording') recorder.stop();
    }, LIVE_CHUNK_SECONDS * 1000);
  };

  const stopLiveChunkRecorder = (waitForProcessing = false): Promise<void> => {
    if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
    const recorder = chunkRecorderRef.current;
    const stopPromise = chunkStopPromiseRef.current || Promise.resolve();
    if (!recorder) {
      return waitForProcessing ? chunkProcessChainRef.current : Promise.resolve();
    }
    if (!waitForProcessing) {
      if (recorder.state !== 'inactive') recorder.stop();
      return Promise.resolve();
    }
    if (recorder.state !== 'inactive') recorder.stop();
    // 等待 stop 事件把最后一个 Blob 放入队列，再等待所有片段按顺序转写。
    return stopPromise.then(() => chunkProcessChainRef.current);
  };

  // 启动麦克风 + 设备输出声音录制
  const startRecording = async () => {
    try {
      setMicError(null);
      setSystemAudioNotice(null);
      setSystemAudioActive(false);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      let systemAudioStream: MediaStream | null = null;
      if (includeSystemAudio) {
        try {
          if (!navigator.mediaDevices.getDisplayMedia) {
            throw new Error('当前系统不支持设备声音采集');
          }

          // Chromium 通常要求同时申请 video；最终只把 audio tracks 接入混音流，
          // 不会把屏幕画面写入录音文件。
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
          });
          const audioTracks = displayStream.getAudioTracks();
          displayStream.getVideoTracks().forEach((track) => track.stop());
          if (audioTracks.length === 0) {
            displayStream.getTracks().forEach((track) => track.stop());
            throw new Error('没有获取到设备输出音轨，请检查系统录音/屏幕录制权限');
          }

          systemAudioStream = new MediaStream(audioTracks);
          systemStreamRef.current = systemAudioStream;
          setSystemAudioActive(true);
          systemAudioStream.getAudioTracks().forEach((track) => {
            track.onended = () => {
              setSystemAudioActive(false);
              setSystemAudioNotice('设备输出声音采集已结束，当前录音将继续保留麦克风声音。');
            };
          });
        } catch (error: any) {
          // 不能因为用户拒绝系统音频就丢掉麦克风录音，明确提示当前已降级。
          console.warn('[MeetingRecordModal] 设备输出声音访问失败:', error);
          setSystemAudioNotice(
            error?.name === 'NotAllowedError'
              ? '未授权设备输出声音，当前将仅录制麦克风。可在系统隐私设置中允许屏幕录制/系统音频。'
              : `设备输出声音不可用，当前将仅录制麦克风：${error?.message || '未知原因'}`,
          );
        }
      }

      // 通过 AudioContext 把麦克风和系统输出混合成单一音轨，
      // 录音、波形和实时片段转写全部使用同一条混合流。
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      await audioContext.resume().catch(() => undefined);
      const destination = audioContext.createMediaStreamDestination();
      audioContext.createMediaStreamSource(stream).connect(destination);
      if (systemAudioStream) {
        audioContext.createMediaStreamSource(systemAudioStream).connect(destination);
      }
      const recordingStream = destination.stream;
      streamRef.current = recordingStream;

      // 建立实时音频可视化波形
      setupAudioVisualizer(recordingStream, audioContext);

      const mimeType = getMimeType();
      mimeTypeRef.current = mimeType || 'audio/webm';

      meetingIdRef.current = await onRecordingStarted?.(meetingTitle.trim() || '现场录音会议');

      const recorder = new MediaRecorder(recordingStream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recordingActiveRef.current = true;
      pausedRef.current = false;
      stoppingRef.current = false;
      elapsedSecondsRef.current = 0;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start(1000);
      startLiveChunkRecorder();
      setIsRecording(true);
      setIsPaused(false);

      // 启动计时器
      timerRef.current = setInterval(() => {
        setDurationSec((prev) => {
          elapsedSecondsRef.current = prev + 1;
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      console.error('[MeetingRecordModal] 麦克风访问失败:', err);
      setMicError('无法访问麦克风设备，请检查系统隐私权限是否允许本应用使用麦克风。');
      showToast?.('error', '无法开启麦克风录音');
      releaseAudioResources();
    }
  };

  // 设置实时音频频率波形
  const setupAudioVisualizer = (stream: MediaStream, audioContext: AudioContext) => {
    try {
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const renderFrame = () => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        analyser.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 1.5;
        let barHeight: number;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          barHeight = (dataArray[i] / 255) * canvas.height * 0.85;

          const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
          gradient.addColorStop(0, '#3b82f6');
          gradient.addColorStop(1, '#06b6d4');

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.roundRect(x, canvas.height - barHeight, barWidth - 2, barHeight, 3);
          ctx.fill();

          x += barWidth + 2;
        }

        animationFrameRef.current = requestAnimationFrame(renderFrame);
      };

      renderFrame();
    } catch (err) {
      console.warn('[MeetingRecordModal] 可视化波形建立跳过:', err);
    }
  };

  const pauseRecording = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      pausedRef.current = true;
      await stopLiveChunkRecorder(true);
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const resumeRecording = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      // 暂停时的最后片段必须先完成 stop，再创建下一段，避免两个片段录音器重叠。
      await stopLiveChunkRecorder(true);
      mediaRecorderRef.current.resume();
      pausedRef.current = false;
      startLiveChunkRecorder();
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        setDurationSec((prev) => {
          elapsedSecondsRef.current = prev + 1;
          return prev + 1;
        });
      }, 1000);
    }
  };

  const stopAndFinish = async () => {
    if (!mediaRecorderRef.current) return;
    setIsProcessing(true);
    stoppingRef.current = true;
    recordingActiveRef.current = false;

    if (timerRef.current) clearInterval(timerRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

    const recorder = mediaRecorderRef.current;
    const chunkStopPromise = stopLiveChunkRecorder(true);
    recorder.onstop = async () => {
      try {
        await chunkStopPromise;
        const mime = recorder.mimeType || mimeTypeRef.current || 'audio/webm';
        const ext = mime.includes('mp4') ? 'm4a' : 'webm';
        const blob = new Blob(audioChunksRef.current, { type: mime });
        const arrayBuffer = await blob.arrayBuffer();

        // 释放麦克风、设备输出和混音上下文
        releaseAudioResources();

        const fileName = `rec_${Date.now()}.${ext}`;
        await onFinishRecording(meetingTitle.trim() || '现场录音会议', arrayBuffer, fileName, meetingIdRef.current, elapsedSecondsRef.current);
      } catch (err: any) {
        showToast?.('error', `录音处理失败: ${err.message}`);
        setIsProcessing(false);
      }
    };

    recorder.stop();
  };

  // 组件卸载时释放媒体流
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      releaseAudioResources();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-6 animate-in fade-in zoom-in-95 duration-150">
        {/* 标题 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className={`p-2 rounded-2xl ${isRecording && !isPaused ? 'bg-rose-50 text-rose-600 animate-pulse' : 'bg-blue-50 text-blue-600'}`}>
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {isRecording ? '正在实时录制会议...' : '现场会议录音'}
              </h3>
              <p className="text-xs text-slate-400">
                可同时采集麦克风和设备播放声音，录制完成后由已配置的转写服务识别音频。
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing || isRecording}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 错误提示 */}
        {micError && (
          <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs flex items-start space-x-2 border border-rose-200">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{micError}</span>
          </div>
        )}

        {systemAudioNotice && (
          <div className="p-3 rounded-xl bg-amber-50 text-amber-800 text-xs flex items-start space-x-2 border border-amber-200">
            <Volume2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{systemAudioNotice}</span>
          </div>
        )}

        {/* 设备声音采集开关：系统声音需要额外的屏幕录制/系统音频权限 */}
        <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/80 cursor-pointer">
          <div className="flex items-start gap-2.5">
            <Volume2 className="w-4 h-4 mt-0.5 text-blue-600" />
            <div>
              <div className="text-xs font-semibold text-slate-800">同时录制设备播放声音</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {systemAudioActive ? '正在采集麦克风 + 设备声音' : '录制网页、会议软件或系统播放的声音'}
              </div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={includeSystemAudio}
            onChange={(event) => setIncludeSystemAudio(event.target.checked)}
            disabled={isRecording || isProcessing}
            className="w-4 h-4 accent-blue-600 cursor-pointer disabled:cursor-not-allowed"
          />
        </label>

        {/* 会议标题设置 */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">会议主题 / 标题</label>
          <input
            type="text"
            value={meetingTitle}
            onChange={(e) => setMeetingTitle(e.target.value)}
            disabled={isRecording}
            className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-70 text-slate-800 font-medium"
          />
        </div>

        {/* 实时音频波形与计时器 */}
        <div className="bg-slate-900 rounded-2xl p-6 text-white flex flex-col items-center justify-center space-y-4 shadow-inner relative overflow-hidden">
          {/* 实时波形 Canvas */}
          <canvas
            ref={canvasRef}
            width={340}
            height={70}
            className="w-full h-16 opacity-90"
          />

          {/* 计时器 */}
          <div className="flex items-center space-x-2 font-mono text-3xl font-extrabold tracking-wider text-cyan-400">
            <Clock className="w-5 h-5 text-cyan-500/70" />
            <span>{formatTime(durationSec)}</span>
          </div>

          <div className="flex items-center space-x-2 text-[11px] text-slate-400">
            {isRecording ? (
              isPaused ? (
                <span className="text-amber-400">已暂停录制</span>
              ) : (
                <span className="flex items-center space-x-1.5 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>{systemAudioActive ? '麦克风 + 设备声音拾音中...' : '麦克风拾音中...'}</span>
                </span>
              )
            ) : (
              <span>准备就绪，点击下方按钮开始录制</span>
            )}
          </div>
        </div>

        {/* 控制按钮组 */}
        <div className="flex items-center justify-center space-x-4 pt-2">
          {!isRecording ? (
            <button
              onClick={startRecording}
              className="px-6 py-2.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm shadow-lg shadow-rose-500/30 flex items-center space-x-2 transition-transform active:scale-95 cursor-pointer"
            >
              <Mic className="w-4 h-4 fill-current" />
              <span>开始录制</span>
            </button>
          ) : (
            <>
              {isPaused ? (
                <button
                  onClick={resumeRecording}
                  disabled={isProcessing}
                  className="px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center space-x-1.5 shadow-md cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>继续录制</span>
                </button>
              ) : (
                <button
                  onClick={pauseRecording}
                  disabled={isProcessing}
                  className="px-4 py-2 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium flex items-center space-x-1.5 shadow-md cursor-pointer disabled:opacity-50"
                >
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>暂停</span>
                </button>
              )}

              <button
                onClick={stopAndFinish}
                disabled={isProcessing}
                className="px-5 py-2 rounded-full bg-slate-900 hover:bg-black text-white text-xs font-semibold flex items-center space-x-1.5 shadow-lg shadow-slate-900/20 cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? (
                  <span className="flex items-center space-x-1">
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>正在导入转写...</span>
                  </span>
                ) : (
                  <>
                    <Square className="w-3.5 h-3.5 fill-current text-rose-400" />
                    <span>结束并转写</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
