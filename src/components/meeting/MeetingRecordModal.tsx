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
  onFinishRecording: (title: string, audioBuffer: ArrayBuffer, fileName: string) => Promise<void>;
  showToast?: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const MeetingRecordModal: React.FC<MeetingRecordModalProps> = ({
  onClose,
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
  const [isProcessing, setIsProcessing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // 格式化时间 00:00:00
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // 启动麦克风录制
  const startRecording = async () => {
    try {
      setMicError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 建立音频可视化波形
      setupAudioVisualizer(stream);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start(1000);
      setIsRecording(true);
      setIsPaused(false);

      // 启动计时器
      timerRef.current = setInterval(() => {
        setDurationSec((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('[MeetingRecordModal] 麦克风访问失败:', err);
      setMicError('无法访问麦克风设备，请检查系统隐私权限是否允许本应用使用麦克风。');
      showToast?.('error', '无法开启麦克风录音');
    }
  };

  // 设置实时音频频率波形
  const setupAudioVisualizer = (stream: MediaStream) => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
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

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        setDurationSec((prev) => prev + 1);
      }, 1000);
    }
  };

  const stopAndFinish = async () => {
    if (!mediaRecorderRef.current) return;
    setIsProcessing(true);

    if (timerRef.current) clearInterval(timerRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

    mediaRecorderRef.current.onstop = async () => {
      try {
        const mime = mediaRecorderRef.current?.mimeType || 'audio/webm';
        const ext = mime.includes('mp4') ? 'm4a' : 'webm';
        const blob = new Blob(audioChunksRef.current, { type: mime });
        const arrayBuffer = await blob.arrayBuffer();

        // 释放麦克风流
        streamRef.current?.getTracks().forEach((t) => t.stop());

        const fileName = `rec_${Date.now()}.${ext}`;
        await onFinishRecording(meetingTitle.trim() || '现场录音会议', arrayBuffer, fileName);
      } catch (err: any) {
        showToast?.('error', `录音处理失败: ${err.message}`);
        setIsProcessing(false);
      }
    };

    mediaRecorderRef.current.stop();
  };

  // 组件卸载时释放媒体流
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
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
                {isRecording ? '正在实时录制会议...' : '现场麦克风会议录音'}
              </h3>
              <p className="text-xs text-slate-400">
                录制完成后将自动注入专业术语提示，并由已配置的转写服务识别音频。
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
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
                  <span>麦克风拾音中...</span>
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
