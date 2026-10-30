import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  FastForward,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { MeetingSegment, MeetingSpeaker } from '../../../shared/meetingTypes';

interface MeetingAudioPlayerProps {
  audioSrc?: string;
  duration: number; // 总时长 (秒)
  segments?: MeetingSegment[];
  speakers?: MeetingSpeaker[];
  currentTime: number;
  onSeek: (time: number) => void;
  onTimeUpdate?: (time: number) => void;
  onEnded?: () => void;
}

export const MeetingAudioPlayer: React.FC<MeetingAudioPlayerProps> = ({
  audioSrc,
  duration,
  segments = [],
  speakers = [],
  currentTime,
  onSeek,
  onTimeUpdate,
  onEnded,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [volume, setVolume] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverSpeaker, setHoverSpeaker] = useState<string | null>(null);

  // 格式化时间 00:00 或 00:00:00
  const formatTime = (seconds: number) => {
    const s = Math.floor(seconds || 0);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    const h = Math.floor(m / 60);
    const minRem = m % 60;
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${minRem.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  // 切换播放/暂停
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        console.warn('[MeetingAudioPlayer] 播放失败:', err);
      });
    }
  };

  // 快退/快进 5秒
  const skipTime = (offset: number) => {
    if (!audioRef.current) return;
    const nextTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + offset));
    audioRef.current.currentTime = nextTime;
    onSeek(nextTime);
  };

  // 倍速切换
  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  // 音量切换
  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    setIsMuted(newVol === 0);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
      audioRef.current.muted = newVol === 0;
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.muted = false;
      setIsMuted(false);
    } else {
      audioRef.current.muted = true;
      setIsMuted(true);
    }
  };

  // 响应外部 onSeek 触发的时间跳转
  useEffect(() => {
    if (audioRef.current && Math.abs(audioRef.current.currentTime - currentTime) > 0.6) {
      audioRef.current.currentTime = currentTime;
    }
  }, [currentTime]);

  // 进度条点击跳转
  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = percent * duration;
    if (audioRef.current) {
      audioRef.current.currentTime = targetTime;
    }
    onSeek(targetTime);
  };

  // 鼠标在进度条上悬浮探测对应时间和说话人
  const handleProgressBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = percent * duration;
    setHoverTime(time);

    // 查找该时间点的发言人
    const targetSeg = segments.find((s) => time >= s.startTime && time <= s.endTime);
    setHoverSpeaker(targetSeg ? targetSeg.speakerName : null);
  };

  const handleProgressBarMouseLeave = () => {
    setHoverTime(null);
    setHoverSpeaker(null);
  };

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  // 键盘快捷键监听 (空格播放/暂停，左右键步进)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 若当前焦点在输入框内则不捕获
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        skipTime(-5);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        skipTime(5);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, duration]);

  return (
    <div className="bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-5 py-3 shadow-lg select-none">
      {/* 隐藏的真实音频控件 */}
      <audio
        ref={audioRef}
        src={audioSrc}
        onTimeUpdate={() => {
          if (audioRef.current) {
            onTimeUpdate?.(audioRef.current.currentTime);
          }
        }}
        onEnded={() => {
          setIsPlaying(false);
          onEnded?.();
        }}
      />

      {/* 1. 飞书妙计同款发言人色块时间轴 (Speaker-segmented scrubber) */}
      <div className="relative mb-2.5">
        <div
          ref={progressBarRef}
          onClick={handleProgressBarClick}
          onMouseMove={handleProgressBarMouseMove}
          onMouseLeave={handleProgressBarMouseLeave}
          className="relative h-2.5 w-full bg-slate-100 rounded-full cursor-pointer overflow-hidden group hover:h-3.5 transition-all duration-150"
        >
          {/* 发言人色块分布层 (Feishu Minutes signature) */}
          {duration > 0 && segments.length > 0 && (
            <div className="absolute inset-0 flex pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity">
              {segments.map((seg) => {
                const left = (seg.startTime / duration) * 100;
                const width = Math.max(0.4, ((seg.endTime - seg.startTime) / duration) * 100);
                const speaker = speakers.find((sp) => sp.id === seg.speakerId || sp.name === seg.speakerName);
                const color = speaker?.avatarColor || '#3b82f6';
                return (
                  <div
                    key={seg.id}
                    className="absolute top-0 bottom-0"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      backgroundColor: color,
                    }}
                  />
                );
              })}
            </div>
          )}

          {/* 已播放进度蒙层 */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-blue-600/40 pointer-events-none"
            style={{ width: `${progressPercent}%` }}
          />

          {/* 播放游标指示针 */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-blue-600 shadow-md pointer-events-none rounded-full"
            style={{ left: `${progressPercent}%`, transform: 'translateX(-50%)' }}
          />
        </div>

        {/* 悬停时间与发言人气泡 */}
        {hoverTime !== null && (
          <div
            className="absolute bottom-5 -translate-x-1/2 pointer-events-none bg-slate-900/95 text-white text-[11px] px-2 py-0.5 rounded shadow-lg flex items-center space-x-1.5 whitespace-nowrap z-20"
            style={{ left: `${(hoverTime / (duration || 1)) * 100}%` }}
          >
            <span className="font-mono text-cyan-300">{formatTime(hoverTime)}</span>
            {hoverSpeaker && (
              <>
                <span className="text-slate-400">·</span>
                <span className="text-slate-200 font-medium">{hoverSpeaker}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* 2. 控制按钮栏 */}
      <div className="flex items-center justify-between">
        {/* 左侧：播放/快退/快进/时间 */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => skipTime(-5)}
            title="快退 5 秒 (←)"
            className="p-1.5 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={togglePlay}
            title={isPlaying ? '暂停 (空格)' : '播放 (空格)'}
            className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-md shadow-blue-500/20 transition-transform active:scale-95 cursor-pointer"
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </button>

          <button
            onClick={() => skipTime(5)}
            title="快进 5 秒 (→)"
            className="p-1.5 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          {/* 时间戳指示 */}
          <div className="text-xs font-mono text-slate-600 ml-2">
            <span className="text-slate-900 font-bold">{formatTime(currentTime)}</span>
            <span className="text-slate-400 mx-1">/</span>
            <span className="text-slate-500">{formatTime(duration)}</span>
          </div>
        </div>

        {/* 中间：发言人图例快速辨别 */}
        <div className="hidden lg:flex items-center space-x-3 text-xs text-slate-600">
          <span className="text-slate-400 text-[11px]">发言人色块:</span>
          {speakers.slice(0, 4).map((sp) => (
            <div key={sp.id} className="flex items-center space-x-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: sp.avatarColor }}
              />
              <span className="text-slate-700 font-medium truncate max-w-[100px]">{sp.name}</span>
            </div>
          ))}
          {speakers.length > 4 && (
            <span className="text-slate-400 text-[10px]">+{speakers.length - 4}人</span>
          )}
        </div>

        {/* 右侧：倍速与音量 */}
        <div className="flex items-center space-x-4">
          {/* 倍速切换器 */}
          <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200/60">
            {[0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
              <button
                key={rate}
                onClick={() => handleRateChange(rate)}
                className={`px-1.5 py-0.5 text-[11px] font-mono rounded font-medium transition-colors cursor-pointer ${
                  playbackRate === rate
                    ? 'bg-white text-blue-600 shadow-sm font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>

          {/* 音量控制 */}
          <div className="flex items-center space-x-1.5 text-slate-500">
            <button
              onClick={toggleMute}
              className="p-1 rounded hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
            >
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-rose-500" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-16 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
