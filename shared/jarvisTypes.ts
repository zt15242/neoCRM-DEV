import { CrmProductType, CrmEnvType } from './types';

export type JarvisGender = 'male' | 'female' | 'other';

export interface JarvisUserProfile {
  name: string; // 姓名或尊称，如 "Tony", "浩哥", "Alex"
  gender: JarvisGender; // 性别
  customTitle?: string; // 自定义头衔，如 "老板", "首席架构师", "指挥官"
  salutation: string; // 默认称呼，如 "先生", "女士", "指挥官"
  voiceId: string; // TTS 音色 ID，如 "zh-CN-YunjianNeural"
  voiceRate: string; // 语速，如 "+0%"
  voicePitch: string; // 音调，如 "+0Hz"
  voiceVolume?: number; // 播报音量 0 - 100，默认 100
  isMuted?: boolean; // 是否一键静音，默认 false
  autoSpeak: boolean; // 是否自动语音播报
  petVisible: boolean; // 是否显示桌面悬浮桌宠
  petPosition: { x: number; y: number }; // 桌宠坐标
  initializedAt?: number;
}

export type JarvisState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'alert';

export interface FleetConnectorSummary {
  id: string;
  name: string;
  productType: CrmProductType;
  envType: CrmEnvType;
  neoBaseURL: string;
  tenantId?: string | number;
  tenantName?: string;
  userName?: string;
  userId?: string | number;
  isLoggedIn: boolean;
  isCurrentFocus: boolean;
  tokenExpiresAt?: number;
  isTokenExpired?: boolean;
  accountRecordId?: string;
}

export interface JarvisChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoningContent?: string;
  audioBase64?: string;
  audioFormat?: 'mp3' | 'wav';
  targetConnectorId?: string;
  toolCalls?: Array<{
    name: string;
    args?: any;
    summary?: string;
    status: 'running' | 'success' | 'error';
  }>;
  createdAt: number;
}

export interface JarvisFleetOverview {
  totalCount: number;
  onlineCount: number;
  currentFocusId?: string;
  connectors: FleetConnectorSummary[];
}

export interface JarvisVoiceOptions {
  voice?: string;
  rate?: string;
  pitch?: string;
}

export interface JarvisAsrResult {
  text: string;
  durationMs?: number;
  provider: string;
  needConfig?: boolean;
  error?: string;
}

export interface JarvisMemoryItem {
  id: string;
  category: 'preference' | 'project' | 'fact' | 'system';
  content: string;
  createdAt: number;
}

export interface JarvisSessionData {
  sessionId: string;
  title: string;
  messages: JarvisChatMessage[];
  memories: JarvisMemoryItem[];
  updatedAt: number;
}
