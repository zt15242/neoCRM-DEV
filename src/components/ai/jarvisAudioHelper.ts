import { JarvisUserProfile } from '../../../shared/jarvisTypes';

export interface JarvisAudioSettings {
  volume: number; // 0 - 100
  isMuted: boolean;
}

export const JARVIS_AUDIO_STORAGE_KEY = 'jarvis_audio_settings';

export function getJarvisAudioSettings(profile?: JarvisUserProfile | null): JarvisAudioSettings {
  try {
    const raw = localStorage.getItem(JARVIS_AUDIO_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(100, parsed.volume)) : (profile?.voiceVolume ?? 100),
        isMuted: typeof parsed.isMuted === 'boolean' ? parsed.isMuted : (profile?.isMuted ?? false),
      };
    }
  } catch {}
  return {
    volume: typeof profile?.voiceVolume === 'number' ? profile.voiceVolume : 100,
    isMuted: typeof profile?.isMuted === 'boolean' ? profile.isMuted : false,
  };
}

export function saveJarvisAudioSettings(settings: JarvisAudioSettings) {
  try {
    localStorage.setItem(JARVIS_AUDIO_STORAGE_KEY, JSON.stringify(settings));
    const profileRaw = localStorage.getItem('jarvis_user_profile');
    if (profileRaw) {
      const p = JSON.parse(profileRaw);
      p.voiceVolume = settings.volume;
      p.isMuted = settings.isMuted;
      localStorage.setItem('jarvis_user_profile', JSON.stringify(p));
    }
    window.dispatchEvent(new CustomEvent('jarvis:audio_settings_changed', { detail: settings }));
  } catch {}
}

/**
 * 播放声音并自动绑定音量与静音控制
 */
export async function playJarvisAudio(
  audioSrc: string,
  options: {
    volume?: number;
    isMuted?: boolean;
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (err?: any) => void;
  } = {}
): Promise<HTMLAudioElement | null> {
  const currentSettings = getJarvisAudioSettings();
  const effectiveVolume = options.volume !== undefined ? options.volume : currentSettings.volume;
  const effectiveMuted = options.isMuted !== undefined ? options.isMuted : currentSettings.isMuted;

  const audio = new Audio(audioSrc);
  audio.volume = Math.max(0, Math.min(1, effectiveVolume / 100));
  audio.muted = effectiveMuted;

  audio.onended = () => {
    options.onEnd?.();
  };
  audio.onerror = (e) => {
    options.onError?.(e);
  };

  try {
    options.onStart?.();
    if (!effectiveMuted && effectiveVolume > 0) {
      await audio.play();
    } else {
      setTimeout(() => {
        options.onEnd?.();
      }, 400);
    }
    return audio;
  } catch (err) {
    options.onError?.(err);
    return null;
  }
}
