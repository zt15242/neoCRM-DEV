import axios from 'axios';
import FormData from 'form-data';
import { NeoEnvironment, TokenData } from '../../shared/types';

export class ImageService {
  // 内存缓存: fileId -> Base64 Data URL (避免重复拉取消耗带宽)
  private dataUrlCache = new Map<string, string>();

  private getBaseUrl(env: NeoEnvironment, tokenData: TokenData): string {
    const raw = tokenData.instance_uri || env.neoBaseURL;
    return raw.endsWith('/') ? raw.slice(0, -1) : raw;
  }

  /**
   * 拉取指定图片文件并返回 Base64 Data URL
   */
  public async fetchImageDataUrl(
    env: NeoEnvironment,
    tokenData: TokenData,
    fileId: string | number
  ): Promise<{ success: boolean; dataUrl?: string; error?: string }> {
    const idStr = String(fileId).trim();
    if (!idStr) return { success: false, error: '缺少图片 ID' };

    if (this.dataUrlCache.has(idStr)) {
      return { success: true, dataUrl: this.dataUrlCache.get(idStr)! };
    }

    const baseUrl = this.getBaseUrl(env, tokenData);
    const url = `${baseUrl}/rest/file/v2.0/image/${idStr}`;

    try {
      const res = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'xsy-inner-source': 'bff',
        },
        responseType: 'arraybuffer',
        timeout: 20000,
      });

      const buffer = Buffer.from(res.data);
      let mimeType = res.headers['content-type'] || 'image/jpeg';
      if (mimeType.includes('octet-stream')) {
        // 尝试根据魔数推导 mimeType
        if (buffer[0] === 0x89 && buffer[1] === 0x50) mimeType = 'image/png';
        else if (buffer[0] === 0x47 && buffer[1] === 0x49) mimeType = 'image/gif';
        else if (buffer[0] === 0x52 && buffer[1] === 0x49) mimeType = 'image/webp';
        else mimeType = 'image/jpeg';
      }

      const base64 = buffer.toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64}`;

      this.dataUrlCache.set(idStr, dataUrl);
      return { success: true, dataUrl };
    } catch (e: any) {
      return {
        success: false,
        error: e.response?.data ? String(e.response.data) : e.message,
      };
    }
  }

  /**
   * 上传图片文件到销售易 /rest/file/v2.0/image
   */
  public async uploadImage(
    env: NeoEnvironment,
    tokenData: TokenData,
    base64Data: string,
    fileName: string,
    mimeType = 'image/jpeg'
  ): Promise<{ success: boolean; fileId?: number | string; fileName?: string; error?: string }> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const url = `${baseUrl}/rest/file/v2.0/image`;

    try {
      const buffer = Buffer.from(base64Data, 'base64');
      const form = new FormData();
      form.append('files', buffer, { filename: fileName || 'upload_image.jpg', contentType: mimeType });

      const res = await axios.post(url, form, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'xsy-inner-source': 'bff',
          ...form.getHeaders(),
        },
        timeout: 30000,
      });

      const data = res.data;
      if (data?.code === 200 || data?.code === '200') {
        const item = data?.result?.[0]?.data || data?.data?.[0] || data?.data;
        const fileId = item?.fileId || item?.id;
        if (fileId) {
          // 预存缓存
          this.dataUrlCache.set(String(fileId), `data:${mimeType};base64,${base64Data}`);
          return {
            success: true,
            fileId,
            fileName: fileName || 'upload_image.jpg',
          };
        }
      }

      return {
        success: false,
        error: data?.msg || data?.message || JSON.stringify(data),
      };
    } catch (e: any) {
      return {
        success: false,
        error: e.response?.data?.msg || e.response?.data?.message || e.message,
      };
    }
  }
}
