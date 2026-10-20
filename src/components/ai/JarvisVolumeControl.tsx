import React, { useState, useEffect, useRef } from 'react';
import { Volume2, Volume1, VolumeX } from 'lucide-react';
import { getJarvisAudioSettings, saveJarvisAudioSettings, JarvisAudioSettings } from './jarvisAudioHelper';

interface JarvisVolumeControlProps {
  currentAudio?: HTMLAudioElement | null;
  className?: string;
  showSliderAlways?: boolean;
}

export const JarvisVolumeControl: React.FC<JarvisVolumeControlProps> = ({
  currentAudio,
  className = '',
  showSliderAlways = false,
}) => {
  const [settings, setSettings] = useState<JarvisAudioSettings>(getJarvisAudioSettings());
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleUpdate = (e: any) => {
      if (e.detail) {
        setSettings(e.detail);
      }
    };
    window.addEventListener('jarvis:audio_settings_changed', handleUpdate);
    return () => window.removeEventListener('jarvis:audio_settings_changed', handleUpdate);
  }, []);

  const handleToggleMute = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const nextMuted = !settings.isMuted;
    const next = { ...settings, isMuted: nextMuted };
    setSettings(next);
    saveJarvisAudioSettings(next);
    if (currentAudio) {
      currentAudio.muted = nextMuted;
    }
  };

  const handleVolumeChange = (newVal: number) => {
    const next = {
      ...settings,
      volume: newVal,
      isMuted: newVal === 0 ? true : (settings.isMuted && newVal > 0 ? false : settings.isMuted),
    };
    setSettings(next);
    saveJarvisAudioSettings(next);
    if (currentAudio) {
      currentAudio.volume = Math.max(0, Math.min(1, newVal / 100));
      currentAudio.muted = next.isMuted;
    }
  };

  const isMuted = settings.isMuted || settings.volume === 0;

  const renderIcon = () => {
    if (isMuted) return <VolumeX className="w-4 h-4 text-rose-400" />;
    if (settings.volume < 40) return <Volume1 className="w-4 h-4 text-cyan-400" />;
    return <Volume2 className="w-4 h-4 text-cyan-400" />;
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (showSliderAlways) {
    return (
      <div className={`flex items-center space-x-2 text-xs text-cyan-300 ${className}`}>
        <button
          type="button"
          onClick={handleToggleMute}
          title={isMuted ? '点击恢复声音' : '点击静音'}
          className="p-1 rounded hover:bg-cyan-950/60 text-cyan-400 transition-colors cursor-pointer"
        >
          {renderIcon()}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={isMuted ? 0 : settings.volume}
          onChange={(e) => handleVolumeChange(Number(e.target.value))}
          className="w-24 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
        />
        <span className="font-mono text-[11px] w-9 text-right text-cyan-400">
          {isMuted ? '静音' : `${settings.volume}%`}
        </span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title={isMuted ? '已静音 (点击调节音量或取消静音)' : `当前音量: ${settings.volume}% (点击调节)`}
        className={`p-1.5 rounded border transition-colors flex items-center space-x-1 cursor-pointer ${
          isMuted
            ? 'border-rose-500/40 bg-rose-950/40 text-rose-300'
            : 'border-cyan-500/40 bg-cyan-950/60 text-cyan-300 hover:border-cyan-400'
        }`}
      >
        {renderIcon()}
        <span className="text-[10px] font-mono pr-0.5">
          {isMuted ? '静音' : `${settings.volume}%`}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-52 p-3 rounded-xl border border-cyan-500/40 bg-[#060b14]/95 shadow-[0_0_20px_rgba(0,242,254,0.3)] backdrop-blur-md z-50 text-cyan-100 text-xs animate-in fade-in zoom-in-95 duration-100 space-y-2.5">
          <div className="flex items-center justify-between text-[11px] text-cyan-400/80 font-mono">
            <span>J.A.R.V.I.S. 音量控制</span>
            <span className="font-bold text-cyan-300">
              {isMuted ? '已静音' : `${settings.volume}%`}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleToggleMute}
              className={`p-1.5 rounded border transition-colors cursor-pointer ${
                isMuted
                  ? 'border-rose-500/50 bg-rose-950/60 text-rose-300'
                  : 'border-cyan-500/40 bg-cyan-950/60 text-cyan-300 hover:border-cyan-400'
              }`}
              title={isMuted ? '取消静音' : '一键静音'}
            >
              {renderIcon()}
            </button>

            <input
              type="range"
              min={0}
              max={100}
              value={isMuted ? 0 : settings.volume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-cyan-500/20 text-[10px] text-cyan-400/60 font-mono">
            <button
              type="button"
              onClick={() => handleVolumeChange(100)}
              className="hover:text-cyan-300 underline cursor-pointer"
            >
              最大音量
            </button>
            <button
              type="button"
              onClick={() => handleVolumeChange(50)}
              className="hover:text-cyan-300 underline cursor-pointer"
            >
              50%
            </button>
            <button
              type="button"
              onClick={handleToggleMute}
              className="hover:text-cyan-300 underline cursor-pointer"
            >
              {isMuted ? '取消静音' : '快速静音'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
