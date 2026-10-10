import axios from 'axios';
import { NeoEnvironment, TokenData } from '../types';

export class ApiService {
  /**
   * 测试调用当前 NeoCRM 实例的 API，验证 Token 有效性
   */
  public async testApiCall(env: NeoEnvironment, tokenData: TokenData): Promise<{ success: boolean; data?: any; error?: string }> {
    const baseUrl = tokenData.instance_uri || env.neoBaseURL;
    const cleanUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const testUrl = `${cleanUrl}/rest/auc/v2.0/userInfo`;

    try {
      const res = await axios.get(testUrl, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'xsy-inner-source': 'bff',
          'Content-Type': 'application/json',
        },
        timeout: 8000,
      });

      return {
        success: true,
        data: res.data,
      };
    } catch (e: any) {
      return {
        success: false,
        error: e.response ? `HTTP ${e.response.status}: ${JSON.stringify(e.response.data)}` : e.message,
      };
    }
  }

  /**
   * 生成设计器 Web 端链接
   */
  public getDesignerWebUrl(env: NeoEnvironment, tokenData: TokenData): string {
    const baseUrl = tokenData.instance_uri || env.neoBaseURL;
    const cleanUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return `${cleanUrl}/bff/spa/neo.ui.designer.web/index#/neoPage/layoutEdit/customPage/emptyPage/default?debug=true`;
  }

  /**
   * 生成设计器 H5 端链接
   */
  public getDesignerH5Url(env: NeoEnvironment, tokenData: TokenData): string {
    const baseUrl = tokenData.instance_uri || env.neoBaseURL;
    const cleanUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return `${cleanUrl}/bff/spa/neo.ui.designer.h5/index#/neoPage/layoutEdit/customPage/emptyPage/default?debug=true`;
  }
}
