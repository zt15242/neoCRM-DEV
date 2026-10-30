const MIB = 1024 * 1024;

const AUDIO_MIME_TYPES: Record<string, string> = {
  aac: 'audio/aac',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  mpga: 'audio/mpeg',
  mpeg: 'audio/mpeg',
  mov: 'video/quicktime',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  webm: 'audio/webm',
};

const OPENAI_AUDIO_EXTENSIONS = new Set(['flac', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'wav', 'webm']);
const OPENAI_MAX_AUDIO_BYTES = 25 * MIB;

export function getAudioMimeType(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  return AUDIO_MIME_TYPES[extension] || 'application/octet-stream';
}

export function isOfficialOpenAiEndpoint(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === 'api.openai.com';
  } catch {
    return false;
  }
}

export function validateOpenAiAudioFile(fileName: string, fileSize: number, baseUrl: string): string | null {
  if (!isOfficialOpenAiEndpoint(baseUrl)) return null;

  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  if (!OPENAI_AUDIO_EXTENSIONS.has(extension)) {
    return `OpenAI 转写接口不支持 .${extension || '未知'} 格式。请先转换为 flac、mp3、mp4、mpeg、mpga、m4a、ogg、wav 或 webm。`;
  }
  if (fileSize > OPENAI_MAX_AUDIO_BYTES) {
    return `音频文件为 ${(fileSize / MIB).toFixed(1)} MB，超过 OpenAI 转写接口 25 MB 上限。请压缩或拆分音频后重试。`;
  }
  return null;
}

export function getTranscriptionTimeoutMs(fileSize: number): number {
  const fiveMiBBlocks = Math.max(0, Math.ceil(fileSize / (5 * MIB)) - 1);
  return Math.min(10 * 60_000, 300_000 + fiveMiBBlocks * 45_000);
}

export function getTranscriptionEndpoint(baseUrl: string): string {
  const cleanBaseUrl = baseUrl.trim().replace(/\/+$/, '');
  if (/\/audio\/transcriptions$/i.test(cleanBaseUrl)) return cleanBaseUrl;
  if (/\/v1$/i.test(cleanBaseUrl)) return `${cleanBaseUrl}/audio/transcriptions`;
  return `${cleanBaseUrl}/v1/audio/transcriptions`;
}

export function extractTranscriptionText(payload: unknown): string {
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return '';
    try {
      return extractTranscriptionText(JSON.parse(trimmed));
    } catch {
      return trimmed;
    }
  }
  if (!payload || typeof payload !== 'object') return '';

  const data = payload as Record<string, unknown>;
  for (const value of [data.text, data.transcription, (data.result as any)?.text, (data.data as any)?.text]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function shouldRetryWithoutVerboseJson(error: any): boolean {
  const status = Number(error?.response?.status);
  if (status !== 400 && status !== 422) return false;

  const body = error?.response?.data;
  const detail = typeof body === 'string'
    ? body
    : JSON.stringify(body || error?.message || '');
  return /verbose_json|response[_ ]format/i.test(detail);
}

export function getTranscriptionErrorMessage(error: any, timeoutMs: number): string {
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return `转写接口请求超时（${Math.round(timeoutMs / 1000)} 秒）。请检查文件时长、网络和转写服务状态后重试。`;
  }

  const response = error?.response;
  const body = response?.data;
  const detail = typeof body === 'string'
    ? body
    : body?.error?.message || body?.message || body?.msg || error?.message;
  const safeDetail = String(detail || '未知接口错误').replace(/\s+/g, ' ').slice(0, 500);
  return response?.status
    ? `转写接口返回 HTTP ${response.status}：${safeDetail}`
    : `转写接口请求失败：${safeDetail}`;
}
