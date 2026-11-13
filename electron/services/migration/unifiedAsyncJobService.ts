import axios from 'axios';
import { randomUUID } from 'node:crypto';
import type { NeoEnvironment, TokenData } from '../../../shared/types';
import type { UnifiedCrmJob } from '../../../shared/migrationTypes';
import { DataService } from '../dataService';

export interface BatchWriteResult {
  job: UnifiedCrmJob;
  successMap: Array<{ sourceId: string; targetId: string }>;
  failures: Array<{ sourceId: string; errorCode?: string; errorMessage: string }>;
}

export interface KeysetExtractChunk {
  records: Array<Record<string, any>>;
  nextKeysetId: string | null;
  hasMore: boolean;
}

const escapeCsvCell = (val: unknown): string => {
  if (val === null || val === undefined) return '';
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const toCsvPayload = (fields: string[], rows: Array<Record<string, any>>): string => {
  const header = fields.join(',');
  const lines = rows.map((row) => fields.map((f) => escapeCsvCell(row[f])).join(','));
  return `${header}\n${lines.join('\n')}`;
};

export class UnifiedAsyncJobService {
  constructor(private dataService: DataService) {}

  private getBaseUrl(env: NeoEnvironment, tokenData: TokenData): string {
    const raw = tokenData.instance_uri || env.neoBaseURL || '';
    return raw.endsWith('/') ? raw.slice(0, -1) : raw;
  }

  /**
   * Keyset-paginated streaming extraction (O(1) deep paging, never hits OFFSET limits).
   */
  public async extractKeysetChunk(params: {
    env: NeoEnvironment;
    tokenData: TokenData;
    entity: string;
    fields: string[];
    keysetField: string;
    lastKeysetId?: string | null;
    watermarkField?: string;
    watermarkStart?: string | null;
    watermarkEnd?: string | null;
    filterCondition?: string;
    batchSize: number;
  }): Promise<KeysetExtractChunk> {
    const {
      env,
      tokenData,
      entity,
      fields,
      keysetField,
      lastKeysetId,
      watermarkField,
      watermarkStart,
      watermarkEnd,
      filterCondition,
      batchSize,
    } = params;
    const product = env.productType || 'neocrm';
    const limit = product === 'fxiaoke' ? Math.min(50, batchSize) : Math.min(2000, Math.max(50, batchSize));
    const selectFields = Array.from(new Set([keysetField, ...(watermarkField ? [watermarkField] : []), ...fields]));

    const clauses: string[] = [];
    if (filterCondition?.trim()) clauses.push(`(${filterCondition.trim()})`);
    if (watermarkField && watermarkStart) {
      const safeStart = String(watermarkStart).replace(/'/g, '');
      if (product === 'salesforce') clauses.push(`${watermarkField} >= ${safeStart}`);
      else clauses.push(`${watermarkField} >= '${safeStart}'`);
    }
    if (watermarkField && watermarkEnd) {
      const safeEnd = String(watermarkEnd).replace(/'/g, '');
      if (product === 'salesforce') clauses.push(`${watermarkField} < ${safeEnd}`);
      else clauses.push(`${watermarkField} < '${safeEnd}'`);
    }
    if (lastKeysetId) {
      const safeKey = String(lastKeysetId).replace(/'/g, '');
      clauses.push(`${keysetField} > '${safeKey}'`);
    }

    const whereSql = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const sql = `SELECT ${selectFields.join(', ')} FROM ${entity}${whereSql} ORDER BY ${keysetField} ASC LIMIT ${limit}`;

    const res = await this.dataService.executeQuery(env, tokenData, sql);
    if (!res.success || !res.data) {
      throw new Error(res.error || `抽取对象 ${entity} 分片失败`);
    }
    const records = Array.isArray(res.data.records) ? res.data.records : [];
    const lastRecord = records[records.length - 1];
    const nextKey = lastRecord ? String(lastRecord[keysetField] ?? '') : null;

    return {
      records,
      nextKeysetId: nextKey || null,
      hasMore: records.length >= limit && !!nextKey && nextKey !== lastKeysetId,
    };
  }

  /**
   * Unified batch/async write entry point across Salesforce, NeoCRM, and Fxiaoke.
   * Sorts records by parentGroupKey before chunking to minimize row-lock contention.
   */
  public async executeBulkLoad(params: {
    env: NeoEnvironment;
    tokenData: TokenData;
    entity: string;
    operation: 'insert' | 'update';
    records: Array<{ sourceId: string; targetId?: string; parentGroupKey?: string; payload: Record<string, any> }>;
    useNativeBulkApi?: boolean;
    concurrency?: number;
    onJobUpdate?: (job: UnifiedCrmJob) => void;
  }): Promise<BatchWriteResult> {
    const product = params.env.productType || 'neocrm';
    const sorted = [...params.records].sort((a, b) =>
      String(a.parentGroupKey || '').localeCompare(String(b.parentGroupKey || ''))
    );

    if (product === 'salesforce' && params.useNativeBulkApi !== false && sorted.length >= 20) {
      try {
        return await this.runSalesforceBulk2Ingest(params.env, params.tokenData, params.entity, params.operation, sorted, params.onJobUpdate);
      } catch (err: any) {
        // Fallback to concurrent REST batch if Bulk 2.0 is disabled or fails pre-flight
        if (!String(err?.message || '').includes('安全生产红线')) {
          return await this.runConcurrentDmlWorker(params.env, params.tokenData, params.entity, params.operation, sorted, params.concurrency || 4, params.onJobUpdate);
        }
        throw err;
      }
    }

    if (product === 'neocrm' && params.useNativeBulkApi !== false && sorted.length >= 20) {
      try {
        return await this.runNeoCrmBulkIngest(params.env, params.tokenData, params.entity, params.operation, sorted, params.onJobUpdate);
      } catch {
        // Fallback smoothly to concurrent batched DML when tenant Bulk 2.0 endpoint isn't enabled
      }
    }

    if (product === 'fxiaoke' && params.useNativeBulkApi !== false && sorted.length >= 50) {
      try {
        return await this.runFxiaokeAsyncImportOrBatch(params.env, params.tokenData, params.entity, params.operation, sorted, params.concurrency || 5, params.onJobUpdate);
      } catch {
        // Fallback smoothly to virtual concurrent worker
      }
    }

    return await this.runConcurrentDmlWorker(
      params.env,
      params.tokenData,
      params.entity,
      params.operation,
      sorted,
      params.concurrency || 5,
      params.onJobUpdate
    );
  }

  /**
   * 1. Salesforce Bulk API 2.0 Ingest (/services/data/v59.0/jobs/ingest)
   */
  private async runSalesforceBulk2Ingest(
    env: NeoEnvironment,
    tokenData: TokenData,
    entity: string,
    operation: 'insert' | 'update',
    records: Array<{ sourceId: string; targetId?: string; payload: Record<string, any> }>,
    onJobUpdate?: (job: UnifiedCrmJob) => void
  ): Promise<BatchWriteResult> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const headers = {
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json',
    };

    const createRes = await axios.post(
      `${baseUrl}/services/data/v59.0/jobs/ingest`,
      { object: entity, operation, lineEnding: 'LF', contentType: 'CSV' },
      { headers, timeout: 20000 }
    );
    const sfJobId = createRes.data?.id;
    if (!sfJobId) throw new Error('未能创建 Salesforce Bulk API 2.0 作业');

    const jobState: UnifiedCrmJob = {
      jobId: sfJobId,
      platform: 'salesforce',
      entity,
      operation,
      status: 'in_progress',
      totalRecords: records.length,
      processedRecords: 0,
      failedRecords: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    onJobUpdate?.({ ...jobState });

    const fieldSet = new Set<string>();
    if (operation === 'update') fieldSet.add('Id');
    for (const r of records) {
      for (const k of Object.keys(r.payload)) fieldSet.add(k);
    }
    const fields = Array.from(fieldSet);
    const csvRows = records.map((r) => ({
      ...(operation === 'update' && r.targetId ? { Id: r.targetId } : {}),
      ...r.payload,
    }));
    const csvBody = toCsvPayload(fields, csvRows);

    await axios.put(`${baseUrl}/services/data/v59.0/jobs/ingest/${sfJobId}/batches`, csvBody, {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, 'Content-Type': 'text/csv' },
      timeout: 60000,
    });

    await axios.patch(
      `${baseUrl}/services/data/v59.0/jobs/ingest/${sfJobId}`,
      { state: 'UploadComplete' },
      { headers, timeout: 20000 }
    );

    // Poll until JobComplete / Failed / Aborted
    let finalData: any = null;
    for (let attempt = 0; attempt < 180; attempt++) {
      await new Promise((r) => setTimeout(r, 1500));
      const statusRes = await axios.get(`${baseUrl}/services/data/v59.0/jobs/ingest/${sfJobId}`, { headers, timeout: 15000 });
      finalData = statusRes.data;
      jobState.processedRecords = Number(finalData?.numberRecordsProcessed || 0);
      jobState.failedRecords = Number(finalData?.numberRecordsFailed || 0);
      jobState.updatedAt = Date.now();
      if (finalData?.state === 'JobComplete' || finalData?.state === 'Failed' || finalData?.state === 'Aborted') {
        break;
      }
      onJobUpdate?.({ ...jobState });
    }

    jobState.status = finalData?.state === 'JobComplete' ? 'completed' : 'failed';
    jobState.completedAt = Date.now();
    onJobUpdate?.({ ...jobState });

    const successMap: Array<{ sourceId: string; targetId: string }> = [];
    const failures: Array<{ sourceId: string; errorCode?: string; errorMessage: string }> = [];

    const okCsv = await axios.get(`${baseUrl}/services/data/v59.0/jobs/ingest/${sfJobId}/successfulResults`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      timeout: 30000,
    }).then((r) => String(r.data || '')).catch(() => '');

    const okLines = okCsv.split(/\r?\n/).filter(Boolean).slice(1);
    okLines.forEach((line, idx) => {
      const sfId = line.split(',')[0]?.replace(/^"|"$/g, '');
      const src = records[idx]?.sourceId;
      if (src && sfId) successMap.push({ sourceId: src, targetId: sfId });
    });

    if (jobState.failedRecords > 0) {
      const failCsv = await axios.get(`${baseUrl}/services/data/v59.0/jobs/ingest/${sfJobId}/failedResults`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
        timeout: 30000,
      }).then((r) => String(r.data || '')).catch(() => '');
      const failLines = failCsv.split(/\r?\n/).filter(Boolean).slice(1);
      failLines.forEach((line, idx) => {
        const cols = line.split(',');
        failures.push({
          sourceId: records[idx]?.sourceId || `row-${idx}`,
          errorCode: 'SF_BULK_ERROR',
          errorMessage: cols[1]?.replace(/^"|"$/g, '') || line,
        });
      });
    }

    return { job: jobState, successMap, failures };
  }

  /**
   * 2. NeoCRM (销售易) Bulk API 2.0 Ingest (/rest/bulk/v2.0/jobs/ingest)
   */
  private async runNeoCrmBulkIngest(
    env: NeoEnvironment,
    tokenData: TokenData,
    entity: string,
    operation: 'insert' | 'update',
    records: Array<{ sourceId: string; targetId?: string; payload: Record<string, any> }>,
    onJobUpdate?: (job: UnifiedCrmJob) => void
  ): Promise<BatchWriteResult> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const headers = {
      Authorization: `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json',
      'xsy-execoption': '-1025',
      'xsy-criteria': '10',
    };

    const createRes = await axios.post(
      `${baseUrl}/rest/bulk/v2.0/jobs/ingest`,
      { object: entity, operation },
      { headers, timeout: 20000 }
    );
    const jobId = createRes.data?.data?.id || createRes.data?.id;
    if (!jobId) throw new Error('NeoCRM Bulk API 不可用');

    const jobState: UnifiedCrmJob = {
      jobId: String(jobId),
      platform: 'neocrm',
      entity,
      operation,
      status: 'in_progress',
      totalRecords: records.length,
      processedRecords: 0,
      failedRecords: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    onJobUpdate?.({ ...jobState });

    const dataRows = records.map((r) => ({
      ...(operation === 'update' && r.targetId ? { id: r.targetId } : {}),
      ...r.payload,
    }));

    await axios.put(
      `${baseUrl}/rest/bulk/v2.0/jobs/ingest/${jobId}/batches`,
      { records: dataRows },
      { headers, timeout: 60000 }
    );

    await axios.patch(
      `${baseUrl}/rest/bulk/v2.0/jobs/ingest/${jobId}`,
      { state: 'UploadComplete' },
      { headers, timeout: 20000 }
    );

    let finalState: any = null;
    for (let attempt = 0; attempt < 120; attempt++) {
      await new Promise((r) => setTimeout(r, 1500));
      const statusRes = await axios.get(`${baseUrl}/rest/bulk/v2.0/jobs/ingest/${jobId}`, { headers, timeout: 15000 });
      finalState = statusRes.data?.data || statusRes.data;
      jobState.processedRecords = Number(finalState?.numberRecordsProcessed || 0);
      jobState.failedRecords = Number(finalState?.numberRecordsFailed || 0);
      jobState.updatedAt = Date.now();
      if (['JobComplete', 'Completed', 'Failed', 'Aborted'].includes(finalState?.state)) break;
      onJobUpdate?.({ ...jobState });
    }

    jobState.status = ['JobComplete', 'Completed'].includes(finalState?.state) ? 'completed' : 'failed';
    jobState.completedAt = Date.now();
    onJobUpdate?.({ ...jobState });

    const results = Array.isArray(finalState?.results) ? finalState.results : [];
    const successMap: Array<{ sourceId: string; targetId: string }> = [];
    const failures: Array<{ sourceId: string; errorCode?: string; errorMessage: string }> = [];
    records.forEach((rec, idx) => {
      const item = results[idx];
      if (item?.id) successMap.push({ sourceId: rec.sourceId, targetId: String(item.id) });
      else if (item?.error) failures.push({ sourceId: rec.sourceId, errorCode: 'NEOCRM_BULK', errorMessage: String(item.error) });
    });

    return { job: jobState, successMap, failures };
  }

  /**
   * 3. Fxiaoke (纷享销客) Batch Create/Update + Virtual Concurrent Async Worker
   */
  private async runFxiaokeAsyncImportOrBatch(
    env: NeoEnvironment,
    tokenData: TokenData,
    entity: string,
    operation: 'insert' | 'update',
    records: Array<{ sourceId: string; targetId?: string; payload: Record<string, any> }>,
    concurrency: number,
    onJobUpdate?: (job: UnifiedCrmJob) => void
  ): Promise<BatchWriteResult> {
    const baseUrl = this.getBaseUrl(env, tokenData);
    const token = tokenData.access_token;
    const corpId = String(tokenData.userInfo?.userId || tokenData.tenant_id || '');
    const jobState: UnifiedCrmJob = {
      jobId: `fxk-async-${randomUUID().slice(0, 8)}`,
      platform: 'fxiaoke',
      entity,
      operation,
      status: 'in_progress',
      totalRecords: records.length,
      processedRecords: 0,
      failedRecords: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    onJobUpdate?.({ ...jobState });

    const successMap: Array<{ sourceId: string; targetId: string }> = [];
    const failures: Array<{ sourceId: string; errorCode?: string; errorMessage: string }> = [];

    // Slice into 50-record micro-batches (Fxiaoke OpenAPI v2 batch limit)
    const chunks: typeof records[] = [];
    for (let i = 0; i < records.length; i += 50) {
      chunks.push(records.slice(i, i + 50));
    }

    const endpoint = operation === 'insert' ? '/cgi/crm/v2/data/batchCreate' : '/cgi/crm/v2/data/batchUpdate';
    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, chunks.length) }, async () => {
      while (cursor < chunks.length) {
        const chunk = chunks[cursor++];
        if (!chunk) break;
        try {
          const objectList = chunk.map((r) => ({
            dataObjectApiName: entity,
            ...(operation === 'update' && r.targetId ? { dataId: r.targetId } : {}),
            data: r.payload,
          }));
          const res = await axios.post(
            `${baseUrl}${endpoint}?thirdTraceId=${randomUUID()}`,
            { corpAccessToken: token, corpId, data: { object_data_list: objectList } },
            { headers: { 'Content-Type': 'application/json' }, timeout: 25000 }
          );
          if (res.data?.errorCode !== 0 && res.data?.errorCode !== '0') {
            throw new Error(res.data?.errorMessage || '纷享批量写入失败');
          }
          const createdIds: string[] = res.data?.data?.dataIdList || [];
          chunk.forEach((rec, i) => {
            const tid = createdIds[i] || rec.targetId;
            if (tid) successMap.push({ sourceId: rec.sourceId, targetId: String(tid) });
          });
          jobState.processedRecords += chunk.length;
        } catch {
          // Per-record fallback for partial failures inside the 50-record batch
          for (const rec of chunk) {
            try {
              const single = operation === 'insert'
                ? await this.dataService.createRecord(env, tokenData, entity, rec.payload)
                : await this.dataService.updateRecord(env, tokenData, entity, rec.targetId || '', rec.payload);
              if (single.success) {
                const tid = single.data?.id || single.data?.dataId || rec.targetId;
                if (tid) successMap.push({ sourceId: rec.sourceId, targetId: String(tid) });
              } else {
                failures.push({ sourceId: rec.sourceId, errorCode: 'FXK_RECORD_ERR', errorMessage: single.error || '写入失败' });
                jobState.failedRecords++;
              }
            } catch (recErr: any) {
              failures.push({ sourceId: rec.sourceId, errorCode: 'FXK_RECORD_EXC', errorMessage: recErr?.message || '异常' });
              jobState.failedRecords++;
            }
            jobState.processedRecords++;
          }
        }
        jobState.updatedAt = Date.now();
        onJobUpdate?.({ ...jobState });
      }
    });

    await Promise.all(workers);
    jobState.status = jobState.failedRecords === records.length && records.length > 0 ? 'failed' : 'completed';
    jobState.completedAt = Date.now();
    onJobUpdate?.({ ...jobState });

    return { job: jobState, successMap, failures };
  }

  /**
   * 4. Universal Virtual Concurrent DML Worker (adaptive rate-limit backoff)
   */
  private async runConcurrentDmlWorker(
    env: NeoEnvironment,
    tokenData: TokenData,
    entity: string,
    operation: 'insert' | 'update',
    records: Array<{ sourceId: string; targetId?: string; payload: Record<string, any> }>,
    concurrency: number,
    onJobUpdate?: (job: UnifiedCrmJob) => void
  ): Promise<BatchWriteResult> {
    const jobState: UnifiedCrmJob = {
      jobId: `vjob-${randomUUID().slice(0, 8)}`,
      platform: env.productType || 'neocrm',
      entity,
      operation,
      status: 'in_progress',
      totalRecords: records.length,
      processedRecords: 0,
      failedRecords: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    onJobUpdate?.({ ...jobState });

    const successMap: Array<{ sourceId: string; targetId: string }> = [];
    const failures: Array<{ sourceId: string; errorCode?: string; errorMessage: string }> = [];
    let index = 0;

    const workerCount = Math.max(1, Math.min(concurrency, records.length || 1));
    const workers = Array.from({ length: workerCount }, async () => {
      while (index < records.length) {
        const rec = records[index++];
        if (!rec) break;
        let attempts = 0;
        let done = false;
        while (!done && attempts < 3) {
          attempts++;
          try {
            const res = operation === 'insert'
              ? await this.dataService.createRecord(env, tokenData, entity, rec.payload)
              : await this.dataService.updateRecord(env, tokenData, entity, rec.targetId || '', rec.payload);
            if (res.success) {
              const targetId = res.data?.id || res.data?.dataId || res.data?.data?.id || rec.targetId;
              if (targetId) successMap.push({ sourceId: rec.sourceId, targetId: String(targetId) });
              done = true;
            } else {
              const errMsg = String(res.error || '写入失败');
              if (/429|UNABLE_TO_LOCK_ROW|rate limit|timeout/i.test(errMsg) && attempts < 3) {
                await new Promise((r) => setTimeout(r, 500 * attempts));
                continue;
              }
              failures.push({ sourceId: rec.sourceId, errorCode: 'DML_REJECTED', errorMessage: errMsg });
              jobState.failedRecords++;
              done = true;
            }
          } catch (err: any) {
            const msg = String(err?.message || '未知异常');
            if (/429|UNABLE_TO_LOCK_ROW|rate limit|timeout/i.test(msg) && attempts < 3) {
              await new Promise((r) => setTimeout(r, 500 * attempts));
              continue;
            }
            failures.push({ sourceId: rec.sourceId, errorCode: 'DML_EXCEPTION', errorMessage: msg });
            jobState.failedRecords++;
            done = true;
          }
        }
        jobState.processedRecords++;
        if (jobState.processedRecords % 20 === 0 || jobState.processedRecords === records.length) {
          jobState.updatedAt = Date.now();
          onJobUpdate?.({ ...jobState });
        }
      }
    });

    await Promise.all(workers);
    jobState.status = jobState.failedRecords === records.length && records.length > 0 ? 'failed' : 'completed';
    jobState.completedAt = Date.now();
    onJobUpdate?.({ ...jobState });

    return { job: jobState, successMap, failures };
  }
}
