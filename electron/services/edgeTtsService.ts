import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { JarvisVoiceOptions } from '../../shared/jarvisTypes';

export class EdgeTtsService {
  private tts: MsEdgeTTS | null = null;
  private currentVoice: string = 'zh-CN-YunjianNeural';

  public static SUPPORTED_VOICES = [
    {
      id: 'zh-CN-YunjianNeural',
      name: '云健 (沉稳磁性 / 现代科技管家)',
      lang: 'zh-CN',
      gender: 'Male',
      recommended: true,
    },
    {
      id: 'zh-CN-YunyangNeural',
      name: '云扬 (专业冷静 / 新闻播音)',
      lang: 'zh-CN',
      gender: 'Male',
      recommended: false,
    },
    {
      id: 'en-GB-RyanNeural',
      name: 'Ryan (纯正英伦管家音 / 钢铁侠电影原汁原味)',
      lang: 'en-GB',
      gender: 'Male',
      recommended: false,
    },
    {
      id: 'zh-CN-XiaoxiaoNeural',
      name: '晓晓 (柔和细腻 / 女性副官)',
      lang: 'zh-CN',
      gender: 'Female',
      recommended: false,
    },
  ];

  private async ensureTts(voiceId: string = 'zh-CN-YunjianNeural') {
    if (!this.tts || this.currentVoice !== voiceId) {
      this.tts = new MsEdgeTTS();
      await this.tts.setMetadata(voiceId, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      this.currentVoice = voiceId;
    }
    return this.tts;
  }

  /**
   * 将大模型输出清洗为适合语音朗读的文本
   * 移除代码块、Markdown 复杂格式、标签等
   */
  public cleanTextForSpeech(text: string): string {
    if (!text) return '';
    return text
      // 移除 Markdown 代码块 ```...```
      .replace(/```[\s\S]*?```/g, '已为您在屏幕生成对应代码与配置。')
      // 移除行内代码 `...`
      .replace(/`([^`]+)`/g, '$1')
      // 移除 Markdown 链接 [text](url) -> text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // 移除图片 ![alt](url)
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      // 移除标题符 #, ##, ###
      .replace(/^#{1,6}\s+/gm, '')
      // 移除多余星号粗体 **text** -> text
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      // 移除情绪标签如 [whisper], [sigh], [pause]
      .replace(/\[(?:whisper|sigh|pause|think)\]/gi, '')
      // 压缩多余空白
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 将文本合成为 MP3 Buffer
   */
  public async synthesize(text: string, options?: JarvisVoiceOptions): Promise<Buffer> {
    const cleaned = this.cleanTextForSpeech(text);
    if (!cleaned) {
      return Buffer.alloc(0);
    }

    const voice = options?.voice || this.currentVoice || 'zh-CN-YunjianNeural';
    const tts = await this.ensureTts(voice);

    return new Promise<Buffer>((resolve, reject) => {
      try {
        const { audioStream } = tts.toStream(cleaned);
        const chunks: Buffer[] = [];
        const timer = setTimeout(() => {
          reject(new Error('Edge-TTS synthesis timeout (15s)'));
        }, 15000);

        audioStream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        audioStream.on('end', () => {
          clearTimeout(timer);
          resolve(Buffer.concat(chunks));
        });

        audioStream.on('error', (err: any) => {
          clearTimeout(timer);
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * 返回 Base64 编码的 MP3，方便前端直接以 Data URL 播放
   */
  public async synthesizeBase64(
    text: string,
    options?: JarvisVoiceOptions
  ): Promise<{ audioBase64: string; format: 'mp3'; byteLength: number }> {
    const buffer = await this.synthesize(text, options);
    return {
      audioBase64: buffer.toString('base64'),
      format: 'mp3',
      byteLength: buffer.length,
    };
  }
}

export const edgeTtsService = new EdgeTtsService();
