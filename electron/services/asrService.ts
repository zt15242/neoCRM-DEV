import axios from 'axios';
import FormData from 'form-data';
import { JarvisAsrResult } from '../../shared/jarvisTypes';

export class AsrService {
  /**
   * 使用硅基流动 SenseVoiceSmall 将音频转写为文字
   */
  public async transcribeWithSiliconFlow(
    audioBuffer: Buffer,
    apiKey: string,
    mimeType: string = 'audio/webm'
  ): Promise<JarvisAsrResult> {
    if (!apiKey) {
      return {
        text: '',
        provider: 'siliconflow',
        error: '未配置硅基流动 (SiliconFlow) API Key，无法使用 SenseVoice 语音识别。',
      };
    }

    const startTime = Date.now();
    try {
      const ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('mp3') ? 'mp3' : 'webm';
      const form = new FormData();
      form.append('file', audioBuffer, {
        filename: `speech_input.${ext}`,
        contentType: mimeType,
      });
      form.append('model', 'FunAudioLLM/SenseVoiceSmall');
      form.append('response_format', 'json');

      const response = await axios.post(
        'https://api.siliconflow.cn/v1/audio/transcriptions',
        form,
        {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${apiKey.trim()}`,
          },
          timeout: 10000,
        }
      );

      const durationMs = Date.now() - startTime;
      const text = (response.data?.text || '').trim();

      return {
        text,
        durationMs,
        provider: 'siliconflow',
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const errorMsg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        err.message ||
        '语音识别服务请求失败';
      return {
        text: '',
        durationMs,
        provider: 'siliconflow',
        error: errorMsg,
      };
    }
  }
}

export const asrService = new AsrService();
