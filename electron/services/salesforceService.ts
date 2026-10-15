import axios from 'axios';
import { NeoEnvironment, TokenData, EntityMetadata, FieldMetadata, QueryResultData } from '../../shared/types';

export class SalesforceService {
  private getBaseUrl(env: NeoEnvironment, tokenData: TokenData): string {
    const raw = tokenData.instance_uri || env.neoBaseURL || 'https://login.salesforce.com';
    return raw.endsWith('/') ? raw.slice(0, -1) : raw;
  }

  private getHeaders(tokenData: TokenData) {
    return {
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * 1. 拉取 Salesforce 所有 SObject 列表 (GET /services/data/v59.0/sobjects/)
   */
  public async fetchObjectList(env: NeoEnvironment, tokenData: TokenData): Promise<EntityMetadata[]> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const headers = this.getHeaders(tokenData);
    const url = `${baseUrl}/services/data/v59.0/sobjects/`;

    const res = await axios.get(url, { headers, timeout: 15000 });
    const sobjects = res.data?.sobjects || [];

    return sobjects
      .filter((s: any) => s.queryable && !s.deprecatedAndHidden)
      .map((s: any) => ({
        apiKey: s.name,
        label: s.label || s.name,
        description: `Salesforce 【${s.label}】(${s.custom ? '自定义对象' : '标准对象'})`,
        isStandard: !s.custom,
        enableBusitype: true,
        enableGroupMember: false,
        enableScriptExecutor: false,
        enableCheckrule: true,
        enableDuplicaterule: true,
        detail: s.customSetting || false,
        objectType: s.custom ? 2 : 1,
      }));
  }

  /**
   * 2. 探测 Salesforce 指定 SObject 的 Describe 元数据 (GET /services/data/v59.0/sobjects/{sObjectName}/describe)
   */
  public async describeObject(
    env: NeoEnvironment,
    tokenData: TokenData,
    sObjectName: string
  ): Promise<FieldMetadata[]> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const headers = this.getHeaders(tokenData);
    const url = `${baseUrl}/services/data/v59.0/sobjects/${encodeURIComponent(sObjectName)}/describe`;

    const res = await axios.get(url, { headers, timeout: 15000 });
    const fields = res.data?.fields || [];

    return fields.map((f: any) => {
      const typeStr = String(f.type || 'string').toLowerCase();
      let itemType = 1;
      if (typeStr === 'picklist') itemType = 3;
      else if (typeStr === 'multipicklist') itemType = 4;
      else if (typeStr === 'int' || typeStr === 'integer') itemType = 5;
      else if (typeStr === 'currency' || typeStr === 'double' || typeStr === 'percent') itemType = 6;
      else if (typeStr === 'date') itemType = 7;
      else if (typeStr === 'datetime') itemType = 8;
      else if (typeStr === 'reference') itemType = 10;
      else if (typeStr === 'boolean') itemType = 31;

      return {
        apiKey: f.name,
        label: f.label || f.name,
        itemType,
        typeName: f.type || 'string',
        currency: typeStr === 'currency',
        custom: Boolean(f.custom),
        maxLength: f.length,
        decimal: f.scale,
        referObjectApiKey: Array.isArray(f.referenceTo) && f.referenceTo.length > 0 ? f.referenceTo[0] : undefined,
        pickOption: Array.isArray(f.picklistValues)
          ? f.picklistValues.map((opt: any) => ({
              optionCode: opt.value,
              optionLabel: opt.label || opt.value,
            }))
          : undefined,
        description: f.inlineHelpText || (f.nillable ? '' : '必填字段'),
      };
    });
  }

  /**
   * 3. 执行 Salesforce SOQL 查询 (GET /services/data/v59.0/query/?q={soql})
   */
  public async executeQuery(
    env: NeoEnvironment,
    tokenData: TokenData,
    soql: string
  ): Promise<QueryResultData> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const headers = this.getHeaders(tokenData);
    const url = `${baseUrl}/services/data/v59.0/query/?q=${encodeURIComponent(soql)}`;

    const res = await axios.get(url, { headers, timeout: 20000 });
    const records = res.data?.records || [];
    const totalSize = Number(res.data?.totalSize || records.length);
    const fields = records.length > 0 ? Object.keys(records[0]).filter((k) => k !== 'attributes') : ['Id', 'Name'];

    return {
      records,
      totalSize,
      fields,
    };
  }
}
