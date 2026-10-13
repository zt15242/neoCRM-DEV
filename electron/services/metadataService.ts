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
            objectId: r.objectId || r.id,
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
      const isCurrency = itemType === 6 ? Boolean(f.currency) : undefined;
      const typeName = itemType === 6
        ? (f.currency ? '货币' : '实数')
        : (ITEM_TYPE_MAP[itemType] || `类型(${itemType})`);

      return {
        apiKey: f.apiKey || '',
        label: f.label || f.apiKey || '',
        itemType,
        typeName,
        currency: isCurrency,
        custom: !!f.custom,
        maxLength: f.maxLength,
        decimal: f.decimal,
        referObjectApiKey: (f.referObjectApiKey === "entityBelongType" || f.apiKey === "entityType") ? `entityBelongType:${entityApiKey}` : f.referObjectApiKey,
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
  ): Promise<{ success: boolean; data?: any; createdApiKey?: string; error?: string }> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const headers = this.getHeaders(tokenData);
    const url = `${baseUrl}/rest/metadata/v3.1/xobjects/`;

    // 关键：销售易平台创建自定义实体时，接口会自动在末尾拼接 __c！
    // 传入给销售易接口的 apiKey 必须剥离末尾已有的 __c，避免被双重拼接成 __c__c
    const cleanApiKey = payload.apiKey.trim().replace(/__c$/i, '');
    const realExpectedApiKey = `${cleanApiKey}__c`;

    const body: Record<string, any> = {
      apiKey: cleanApiKey,
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
        const createdKey = res.data?.data?.apiKey || realExpectedApiKey;
        return { success: true, data: res.data?.data, createdApiKey: createdKey };
      }
      const errMsg = res.data?.msg || res.data?.message || JSON.stringify(res.data);
      if (errMsg.includes('已存在') || errMsg.includes('REPEAT') || errMsg.includes('exist')) {
        return { success: true, createdApiKey: realExpectedApiKey, data: res.data?.data };
      }
      return { success: false, error: errMsg };
    } catch (e: any) {
      const errMsg = e.response?.data?.msg || e.response?.data?.message || e.message;
      if (errMsg.includes('已存在') || errMsg.includes('REPEAT') || errMsg.includes('exist')) {
        return { success: true, createdApiKey: realExpectedApiKey };
      }
      return { success: false, error: errMsg };
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

    // 关键：销售易平台创建自定义字段时，接口同样会自动在字段 apiKey 后面拼接 __c！
    // 传入给销售易接口的字段 apiKey 必须剥离已有的 __c，避免字段被双重拼接
    const cleanFieldApiKey = payload.apiKey.trim().replace(/__c$/i, '');

    const body: Record<string, any> = {
      apiKey: cleanFieldApiKey,
      label: payload.label.trim(),
      itemType: Number(payload.itemType),
      description: payload.description || payload.label,
    };

    if ([1, 2, 40].includes(payload.itemType)) {
      body.maxLength = payload.itemType === 2
        ? Math.min(Number(payload.maxLength) || 1000, 2000)
        : Math.min(Number(payload.maxLength) || 200, 500);
    }
    if ([6, 33].includes(payload.itemType)) {
      body.maxLength = Math.min(Number(payload.maxLength) || 16, 18);
      body.decimal = payload.decimal !== undefined ? Number(payload.decimal) : 2;
      if (payload.itemType === 6) {
        // 关键修复：当未指定 currency 或显式为 true 时，默认传入 currency: true 注册为真正货币字段
        // 仅当显式指定 currency: false 时才注册为普通实数/浮点字段
        body.currency = payload.currency !== false;
      }
    }
    if ([3, 4].includes(payload.itemType)) {
      if (Array.isArray(payload.pickOption) && payload.pickOption.length > 0) {
        body.pickOption = payload.pickOption.map((opt: any, idx: number) => {
          if (typeof opt === 'string') {
            return { optionLabel: opt, optionCode: idx + 1 };
          }
          return {
            optionLabel: String(opt.optionLabel || opt.label || opt.name || `选项${idx + 1}`),
            optionCode: opt.optionCode !== undefined ? Number(opt.optionCode) : idx + 1,
          };
        });
      } else {
        body.pickOption = [
          { optionLabel: '选项一', optionCode: 1 },
          { optionLabel: '选项二', optionCode: 2 },
        ];
      }
    }
    if (payload.itemType === 29) {
      body.maxLength = payload.maxLength || 1;
    }
    if (payload.itemType === 10) {
      body.referObjectApiKey = payload.referObjectApiKey?.trim() || 'account';
      body.cascadeDelete = payload.cascadeDelete !== undefined ? Number(payload.cascadeDelete) : 1;
      body.linkLabel = payload.linkLabel?.trim() || `${payload.label.trim()}列表`;
    }

    // 智能定位实体 API Key（支持自动兼容 __c 或历史误创的 __c__c）
    const targetEntitiesToTry = [entityApiKey.trim()];
    if (!entityApiKey.endsWith('__c')) {
      targetEntitiesToTry.push(`${entityApiKey.trim()}__c`);
    } else {
      targetEntitiesToTry.push(`${entityApiKey.trim()}__c`); // 兼容可能误创为 __c__c 的历史对象
      targetEntitiesToTry.push(entityApiKey.trim().replace(/__c$/, ''));
    }

    let lastError = '创建字段失败';

    for (const tryKey of targetEntitiesToTry) {
      const tryUrl = `${baseUrl}/rest/metadata/v3.1/xobjects/${tryKey}/items`;
      try {
        const res = await axios.post(tryUrl, body, { headers, timeout: 20000 });
        if (res.data?.code === 200 || res.data?.code === '200') {
          return { success: true, data: res.data?.data };
        }
        const errMsg = res.data?.msg || res.data?.message || JSON.stringify(res.data);
        if (errMsg.includes('已存在') || errMsg.includes('REPEAT')) {
          return { success: true, data: res.data?.data }; // 字段已存在视为成功
        }
        lastError = errMsg;
      } catch (e: any) {
        const errMsg = e.response?.data?.msg || e.response?.data?.message || e.message;
        if (errMsg.includes('已存在') || errMsg.includes('REPEAT')) {
          return { success: true };
        }
        lastError = errMsg;
      }
    }

    return { success: false, error: lastError };
  }

  /**
   * 将实体字典同步导出为 Markdown 本地文件 (AllxObjects.md)
   */
  public exportDictionary(
    targetPathOrDir: string,
    entities: EntityMetadata[],
    tenantName?: string,
    tenantId?: string | number,
    baseUrl?: string
  ): { success: boolean; filePath: string; message: string } {
    try {
      let finalFilePath = targetPathOrDir;

      // 如果传入的是目录路径，则在该目录下生成 AllxObjects.md
      if (!targetPathOrDir.toLowerCase().endsWith('.md')) {
        const isCliProject = fs.existsSync(path.join(targetPathOrDir, 'src'));
        const dir = isCliProject ? path.join(targetPathOrDir, 'src/xObjects') : targetPathOrDir;
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        finalFilePath = path.join(dir, 'AllxObjects.md');
      } else {
        // 如果传入的是具体的文件路径，确保父目录存在
        const parentDir = path.dirname(finalFilePath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
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
        const desc = (e.description || '-').replace(/\|/g, '/');
        const detail = e.detail ? '✓' : '-';
        const busitype = e.enableBusitype ? '✓' : '-';
        const script = e.enableScriptExecutor ? '✓' : '-';
        const check = e.enableCheckrule ? '✓' : '-';
        lines.push(`| ${e.label} | ${e.apiKey} | ${etype} | ${desc} | ${detail} | ${busitype} | ${script} | ${check} |`);
      }

      fs.writeFileSync(finalFilePath, lines.join('\n'), 'utf-8');

      return {
        success: true,
        filePath: finalFilePath,
        message: `成功导出实体字典至: ${finalFilePath}`,
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
