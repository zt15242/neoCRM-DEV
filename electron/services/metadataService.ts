import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';
import { 
  NeoEnvironment, 
  TokenData, 
  EntityMetadata, 
  FieldMetadata, 
  CreateEntityPayload, 
  CreateFieldPayload 
} from '../../shared/types';

import { ITEM_TYPE_MAP } from '../../shared/constants';
export { ITEM_TYPE_MAP };

export class MetadataService {
  private getBaseUrl(env: NeoEnvironment, tokenData: TokenData): string {
    const raw = tokenData.instance_uri || env.neoBaseURL;
    return raw.endsWith('/') ? raw.slice(0, -1) : raw;
  }

  private getHeaders(tokenData: TokenData) {
    return {
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json',
      'xsy-inner-source': 'bff',
    };
  }

  /**
   * 拉取租户所有对象列表（标准实体 + 自定义实体）
   */
  public async fetchEntityList(env: NeoEnvironment, tokenData: TokenData): Promise<EntityMetadata[]> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const headers = this.getHeaders(tokenData);
    const allEntities: EntityMetadata[] = [];

    // 分别拉取标准实体与自定义实体
    for (const isCustom of [false, true]) {
      const url = `${baseUrl}/rest/metadata/v2.0/xobjects/filter?custom=${isCustom}&active=true`;
      try {
        const res = await axios.get(url, { headers, timeout: 15000 });
        const records = res.data?.data?.records || res.data?.records || [];
        for (const r of records) {
          allEntities.push({
            apiKey: r.apiKey || '',
            label: r.label || r.apiKey || '',
            description: r.description || '',
            isStandard: !isCustom,
            enableBusitype: !!r.enableBusitype,
            enableGroupMember: !!r.enableGroupMember,
            enableScriptExecutor: !!r.enableScriptExecutor,
            enableCheckrule: !!r.enableCheckrule,
            enableDuplicaterule: !!r.enableDuplicaterule,
            detail: !!r.detail,
            objectType: r.objectType || 0,
          });
        }
      } catch (err: any) {
        console.error(`拉取实体列表失败 (custom=${isCustom}):`, err.message);
      }
    }

    return allEntities.sort((a, b) => a.apiKey.localeCompare(b.apiKey));
  }

  /**
   * 拉取指定实体的所有字段与选项列表
   */
  public async fetchEntityFields(
    env: NeoEnvironment, 
    tokenData: TokenData, 
    entityApiKey: string
  ): Promise<FieldMetadata[]> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const headers = this.getHeaders(tokenData);
    const url = `${baseUrl}/rest/metadata/v2.0/xobjects/${entityApiKey}/items`;

    const res = await axios.get(url, { headers, timeout: 15000 });
    const records = res.data?.data?.records || res.data?.records || [];

    return records.map((f: any) => {
      const itemType = Number(f.itemType || 1);
      return {
        apiKey: f.apiKey || '',
        label: f.label || f.apiKey || '',
        itemType,
        typeName: ITEM_TYPE_MAP[itemType] || `类型(${itemType})`,
        custom: !!f.custom,
        maxLength: f.maxLength,
        decimal: f.decimal,
        referObjectApiKey: f.referObjectApiKey,
        pickOption: f.pickOption,
        description: f.description,
      };
    });
  }

  /**
   * 创建自定义实体
   */
  public async createEntity(
    env: NeoEnvironment, 
    tokenData: TokenData, 
    payload: CreateEntityPayload
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const headers = this.getHeaders(tokenData);
    const url = `${baseUrl}/rest/metadata/v3.1/xobjects/`;

    const body: Record<string, any> = {
      apiKey: payload.apiKey.trim(),
      label: payload.label.trim(),
      description: payload.description?.trim() || payload.label.trim(),
      nameItem: payload.autoNumberFormat
        ? { itemType: 9, dataFormat: payload.autoNumberFormat.trim() }
        : { itemType: 1, maxLength: 200 },
      enableScriptExecutor: !!payload.enableScriptExecutor,
      enableBusitype: !!payload.enableBusitype,
    };

    try {
      const res = await axios.post(url, body, { headers, timeout: 20000 });
      if (res.data?.code === 200 || res.data?.code === '200') {
        return { success: true, data: res.data?.data };
      }
      return { 
        success: false, 
        error: res.data?.msg || res.data?.message || JSON.stringify(res.data) 
      };
    } catch (e: any) {
      return {
        success: false,
        error: e.response?.data?.msg || e.response?.data?.message || e.message,
      };
    }
  }

  /**
   * 为指定实体创建字段
   */
  public async createField(
    env: NeoEnvironment,
    tokenData: TokenData,
    entityApiKey: string,
    payload: CreateFieldPayload
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const headers = this.getHeaders(tokenData);
    const url = `${baseUrl}/rest/metadata/v3.1/xobjects/${entityApiKey}/items`;

    const body: Record<string, any> = {
      apiKey: payload.apiKey.trim(),
      label: payload.label.trim(),
      itemType: Number(payload.itemType),
      description: payload.description || payload.label,
    };

    if ([1, 2, 40].includes(payload.itemType)) {
      body.maxLength = payload.maxLength || 200;
    }
    if ([6, 33].includes(payload.itemType)) {
      body.maxLength = payload.maxLength || 16;
      body.decimal = payload.decimal !== undefined ? payload.decimal : 2;
    }
    if ([3, 4].includes(payload.itemType)) {
      body.pickOption = payload.pickOption || [];
    }
    if (payload.itemType === 29) {
      body.maxLength = payload.maxLength || 1;
    }
    // 关联关系字段 (itemType = 10)
    if (payload.itemType === 10) {
      body.referObjectApiKey = payload.referObjectApiKey?.trim();
      body.cascadeDelete = payload.cascadeDelete !== undefined ? Number(payload.cascadeDelete) : 1; // 默认1=置空清理
      if (payload.linkLabel?.trim()) {
        body.linkLabel = payload.linkLabel.trim();
      }
    }

    try {
      const res = await axios.post(url, body, { headers, timeout: 20000 });
      if (res.data?.code === 200 || res.data?.code === '200') {
        return { success: true, data: res.data?.data };
      }
      return { 
        success: false, 
        error: res.data?.msg || res.data?.message || JSON.stringify(res.data) 
      };
    } catch (e: any) {
      return {
        success: false,
        error: e.response?.data?.msg || e.response?.data?.message || e.message,
      };
    }
  }

  /**
   * 将实体字典同步导出为 Markdown 本地文件 (AllxObjects.md)
   */
  public exportDictionary(
    targetDir: string,
    entities: EntityMetadata[],
    tenantName?: string,
    tenantId?: string | number,
    baseUrl?: string
  ): { success: boolean; filePath: string; message: string } {
    try {
      const xObjectsDir = path.join(targetDir, 'src/xObjects');
      if (!fs.existsSync(xObjectsDir)) {
        fs.mkdirSync(xObjectsDir, { recursive: true });
      }

      const standard = entities.filter((e) => e.isStandard);
      const custom = entities.filter((e) => !e.isStandard);

      const lines = [
        '# NeoCRM 实体字典 (AllxObjects)',
        '',
        `* 租户: ${tenantName || '未命名'} (${tenantId || ''})`,
        `* 实例地址: ${baseUrl || ''}`,
        `* 同步时间: ${new Date().toLocaleString()}`,
        `* 总计: ${entities.length} 个对象（${standard.length} 个标准对象 + ${custom.length} 个自定义对象）`,
        '',
        '## 实体列表',
        '',
        '| 实体名称 | API Key | 类型 | 描述 | 明细对象 | 业务类型 | 触发器 | 校验规则 |',
        '|----------|---------|------|------|----------|----------|--------|----------|',
      ];

      for (const e of entities) {
        const etype = e.isStandard ? '标准' : '自定义';
        const desc = e.description || '-';
        const detail = e.detail ? '✓' : '-';
        const busitype = e.enableBusitype ? '✓' : '-';
        const script = e.enableScriptExecutor ? '✓' : '-';
        const check = e.enableCheckrule ? '✓' : '-';
        lines.push(`| ${e.label} | ${e.apiKey} | ${etype} | ${desc} | ${detail} | ${busitype} | ${script} | ${check} |`);
      }

      const filePath = path.join(xObjectsDir, 'AllxObjects.md');
      fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');

      return {
        success: true,
        filePath,
        message: `成功导出实体字典至: ${filePath}`,
      };
    } catch (e: any) {
      return {
        success: false,
        filePath: '',
        message: `导出失败: ${e.message}`,
      };
    }
  }
}
