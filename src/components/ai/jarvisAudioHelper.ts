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

/**
 * 智能提炼管家专属精炼语音简报 (Iron Man J.A.R.V.I.S. 风格)
 * 拒绝死板通篇朗读 Markdown、列表符号、长篇代码或表格，只保留 1~2 句核心结论与关键提问
 */
export function condenseTextForSpeech(raw: string, userTitle: string = '先生'): string {
  if (!raw) return "";

  // 1. 若大模型显式提供了 <speech> 标签，优先检查并安全过滤
  const speechMatch = raw.match(/<speech>([\s\S]*?)<\/speech>/i);
  if (speechMatch && speechMatch[1].trim()) {
    let sp = speechMatch[1].trim().replace(/[*_#`~\[\]]/g, "");
    // 拦截虚假成功声明
    if (sp.includes("已成功部署") && (raw.includes("[Pipeline") || raw.includes("POST /rest"))) {
      return `报告${userTitle}，基建项目比对与建模方案已呈现在主屏，请您在屏幕核对。`;
    }
    return sp;
  }

  // 2. 检测如果整条消息属于纯流水线日志/命令行，直接播报客观简报
  if (raw.includes("[Pipeline Init]") || (raw.includes("POST /rest") && raw.includes("[200 OK]"))) {
    return `报告${userTitle}，自动化配置方案已呈现在主屏上，请您查阅。`;
  }

  // 3. 剥离长代码块、数据表格、伪造日志行、引用块、长链接、标题与列表标记
  let clean = raw
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\[Pipeline[\s\S]*?\]/gi, "")
    .replace(/\[\d{2}:\d{2}:\d{2}[^\]]*\][^\n]*/g, "")
    .replace(/POST\s+\/[^\n]*/gi, "")
    .replace(/GET\s+\/[^\n]*/gi, "")
    .replace(/PATCH\s+\/[^\n]*/gi, "")
    .replace(/PUT\s+\/[^\n]*/gi, "")
    .replace(/├──[^\n]*/g, "")
    .replace(/└──[^\n]*/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\|[^\n]+\|/g, "")
    .replace(/^>\s?[^\n]+/gm, "")
    .replace(/^#{1,6}\s+[^\n]+/gm, "")
    .replace(/[-*•·⁃]\s+/g, "")
    .replace(/\d+\.\s+/g, "")
    .replace(/[*_#`~\[\]()]/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // 若清理后的文本本身就很简练 (<= 65 个字)，直接播报
  if (clean.length <= 65) {
    return clean;
  }

  // 按句号、感叹号、问号切分为独立完整句子
  const rawSentences = clean.match(/[^。！？!?\n]+[。！？!?]?/g) || [clean];
  const sentences = rawSentences.map((s) => s.trim()).filter((s) => s.length > 3);

  if (sentences.length <= 1) {
    return clean.slice(0, 50) + "...详细内容已呈现在主屏上。";
  }

  // 头部：提取前 1~2 句（问候与主干状态）
  let head = sentences[0];
  if (head.length < 25 && sentences.length > 2) {
    head += " " + sentences[1];
  }

  // 尾部：查找末尾是否包含提问、确认、指令
  let tail = "";
  const last = sentences[sentences.length - 1];
  if (
    last &&
    (last.includes("？") ||
      last.includes("?") ||
      last.includes("请问") ||
      last.includes("是否") ||
      last.includes("确认") ||
      last.includes("告知") ||
      last.includes("请选择"))
  ) {
    tail = last;
  }

  if (tail && head !== tail) {
    return `${head} 详细方案与比对矩阵已呈现在主屏。${tail}`;
  }

  return `${head} 详细报告与方案已呈现在主屏上，随时听候调遣。`;
}
