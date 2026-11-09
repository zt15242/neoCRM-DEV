import fs from 'node:fs';

export interface VisionImage { mimeType: string; data: string }

// Bound the complete inline image payload to keep requests and memory predictable.
export class VisionImageLoader {
  private cache = new Map<string, VisionImage>();
  private total = 0;
  get hasImages(): boolean { return this.cache.size > 0; }
  load(filePath: string): VisionImage {
    const cached = this.cache.get(filePath);
    if (cached) return cached;
    if (this.cache.size >= 4) throw new Error('一次请求最多识别 4 张图片，请减少图片后重试。');
    let fd: number | undefined;
    try {
      fd = fs.openSync(filePath, 'r');
      const stat = fs.fstatSync(fd);
      if (!stat.isFile()) throw new Error('图片路径不是普通文件');
      if (stat.size > 8 * 1024 * 1024 || this.total + stat.size > 12 * 1024 * 1024) {
        throw new Error('图片超过识别大小限制（单张 8 MB，合计 12 MB），请压缩图片后重试');
      }
      const bytes = Buffer.alloc(stat.size);
      let count = 0;
      while (count < bytes.length) {
        const n = fs.readSync(fd, bytes, count, bytes.length - count, count);
        if (!n) throw new Error('图片读取不完整，请重新添加');
        count += n;
      }
      const mimeType = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
        : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? 'image/jpeg'
        : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' ? 'image/webp'
        : /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString()) ? 'image/gif' : '';
      if (!mimeType) throw new Error('图片格式暂不支持，请转换为 PNG、JPEG、WebP 或 GIF');
      const image = { mimeType, data: bytes.toString('base64') };
      this.total += bytes.length;
      this.cache.set(filePath, image);
      return image;
    } catch (error: any) {
      throw new Error(`无法读取图片 ${filePath}：${error.message || '未知错误'}`);
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
  }
}
export const openAiImagePart = (image: VisionImage) => ({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } });
export const geminiImagePart = (image: VisionImage) => ({ inlineData: { mimeType: image.mimeType, data: image.data } });
