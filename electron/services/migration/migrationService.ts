import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app, Notification } from 'electron';
import type {
  MigrationAuditRecord,
  MigrationFieldMapping,
  MigrationMongoConfig,
  MigrationMongoStatus,
  MigrationObjectConfig,
  MigrationPlan,
  MigrationProgressMetrics,
  MigrationReconciliationItem,
  MigrationReconciliationReport,
  MigrationRoutingRule,
  UnifiedCrmJob,
} from '../../../shared/migrationTypes';
import type { NeoEnvironment, TokenData } from '../../../shared/types';
import { SessionStore } from '../sessionStore';
import { DataService } from '../dataService';
import { MetadataService } from '../metadataService';
import { runMigrationSkillScript } from '../../security/migrationSkillPackage';
import { migrationEncryption } from './migrationEncryption';
import { mongoStagingService } from './mongoStagingService';
import { UnifiedAsyncJobService } from './unifiedAsyncJobService';

export interface MigrationLogItem {
  id: string;
  taskId: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'success';
  stage: 'topology' | 'database' | 'extract' | 'transform' | 'load' | 'patch' | 'reconcile' | 'scheduler' | 'security';
  entity?: string;
  message: string;
  durationMs?: number;
}

interface StoredMigrationPlan extends MigrationPlan {
  encryptedMongoUri?: string;
  wrappedDek?: string;
  lastScheduledRunAt?: number;
}

/**
 * Bounded LRU cache (L2) for hot parent ID mappings (default cap 500,000 entries).
 */
class LruIdCache {
  private map = new Map<string, string>();
  constructor(private maxEntries = 500_000) {}

  get(key: string): string | undefined {
    const val = this.map.get(key);
    if (val !== undefined) {
      this.map.delete(key);
      this.map.set(key, val);
    }
    return val;
  }

  set(key: string, value: string): void {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, value);
  }

  clear(): void {
    this.map.clear();
  }
}

function matchCronField(expr: string, value: number): boolean {
  const part = expr.trim();
  if (part === '*') return true;
  for (const token of part.split(',')) {
    if (token.includes('/')) {
      const [base, stepStr] = token.split('/');
      const step = Math.max(1, Number(stepStr) || 1);
      const start = base === '*' ? 0 : Number(base) || 0;
      if (value >= start && (value - start) % step === 0) return true;
    } else if (token.includes('-')) {
      const [a, b] = token.split('-').map(Number);
      if (Number.isFinite(a) && Number.isFinite(b) && value >= a && value <= b) return true;
    } else if (Number(token) === value) {
      return true;
    }
  }
  return false;
}

export function matchesCronExpression(cronExpr: string, date: Date): boolean {
  const fields = String(cronExpr || '').trim().split(/\s+/);
  if (fields.length !== 5) return false;
  return (
    matchCronField(fields[0], date.getMinutes()) &&
    matchCronField(fields[1], date.getHours()) &&
    matchCronField(fields[2], date.getDate()) &&
    matchCronField(fields[3], date.getMonth() + 1) &&
    matchCronField(fields[4], date.getDay())
  );
}

export class MigrationService {
  private asyncJobService: UnifiedAsyncJobService;
  private activeControllers = new Map<string, { paused: boolean; aborted: boolean }>();
  private progressState = new Map<string, MigrationProgressMetrics>();
  private progressListeners = new Set<(metrics: MigrationProgressMetrics) => void>();
  private logListeners = new Set<(log: MigrationLogItem) => void>();
  private schedulerTimer?: ReturnType<typeof setInterval>;
  private lastCronMinuteKey = '';

  constructor(
    private sessionStore: SessionStore,
    private dataService: DataService,
    private metadataService: MetadataService
  ) {
    this.asyncJobService = new UnifiedAsyncJobService(dataService);
  }

  private getPlansPath(): string {
    const userData = app?.getPath ? app.getPath('userData') : process.cwd();
    return path.join(userData, 'neocrm_migration_plans.json');
  }

  private getLogsPath(): string {
    const userData = app?.getPath ? app.getPath('userData') : process.cwd();
    return path.join(userData, 'neocrm_migration_logs.json');
  }

  private readStoredPlans(): StoredMigrationPlan[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.getPlansPath(), 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private writeStoredPlans(plans: StoredMigrationPlan[]): void {
    const filePath = this.getPlansPath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(plans, null, 2), 'utf8');
  }

  private toPublicPlan(plan: StoredMigrationPlan): MigrationPlan {
    const { encryptedMongoUri, wrappedDek: _dek, lastScheduledRunAt: _last, ...rest } = plan;
    let maskedUri = rest.mongoConfig?.uri || '';
    if (encryptedMongoUri) {
      try {
        maskedUri = migrationEncryption.maskMongoUri(migrationEncryption.decryptCredential(encryptedMongoUri));
      } catch {
        maskedUri = rest.mongoConfig?.uri || 'mongodb://******';
      }
    }
    return {
      ...rest,
      mongoConfig: {
        ...rest.mongoConfig,
        uri: maskedUri,
      },
    };
  }

  private resolveMongoConfig(plan: StoredMigrationPlan): MigrationMongoConfig {
    if (plan.encryptedMongoUri) {
      return {
        ...plan.mongoConfig,
        uri: migrationEncryption.decryptCredential(plan.encryptedMongoUri),
      };
    }
    return { ...plan.mongoConfig };
  }

  public listPlans(): MigrationPlan[] {
    return this.readStoredPlans().map((p) => this.toPublicPlan(p));
  }

  public getPlan(planId: string): MigrationPlan | null {
    const found = this.readStoredPlans().find((p) => p.id === planId);
    return found ? this.toPublicPlan(found) : null;
  }

  public savePlan(input: MigrationPlan): MigrationPlan {
    const existing = this.readStoredPlans();
    const prev = existing.find((p) => p.id === input.id);

    let encryptedMongoUri = prev?.encryptedMongoUri || '';
    const incomingUri = String(input.mongoConfig?.uri || '').trim();
    if (incomingUri && !incomingUri.includes(':******@')) {
      encryptedMongoUri = migrationEncryption.encryptCredential(incomingUri);
    } else if (!encryptedMongoUri && input.mongoConfig?.mode === 'local') {
      encryptedMongoUri = migrationEncryption.encryptCredential('mongodb://127.0.0.1:27017');
    }

    const { wrappedDek } = migrationEncryption.getOrCreateProjectDek(input.id, prev?.wrappedDek);

    const record: StoredMigrationPlan = {
      ...input,
      updatedAt: Date.now(),
      createdAt: prev?.createdAt || input.createdAt || Date.now(),
      encryptedMongoUri,
      wrappedDek,
      lastScheduledRunAt: prev?.lastScheduledRunAt,
      mongoConfig: {
        ...input.mongoConfig,
        uri: incomingUri.includes(':******@')
          ? incomingUri
          : migrationEncryption.maskMongoUri(incomingUri || 'mongodb://127.0.0.1:27017'),
      },
    };

    const next = [record, ...existing.filter((p) => p.id !== input.id)];
    this.writeStoredPlans(next);
    return this.toPublicPlan(record);
  }

  public deletePlan(planId: string): boolean {
    const existing = this.readStoredPlans();
    const filtered = existing.filter((p) => p.id !== planId);
    if (filtered.length === existing.length) return false;
    this.writeStoredPlans(filtered);
    return true;
  }

  // ==================== MongoDB Connectivity & Purge ====================

  public async testMongoConnection(config: MigrationMongoConfig, planId?: string): Promise<MigrationMongoStatus> {
    let resolvedConfig = { ...config };
    if (planId && (!config.uri || config.uri.includes(':******@'))) {
      const stored = this.readStoredPlans().find((p) => p.id === planId);
      if (stored?.encryptedMongoUri) {
        resolvedConfig.uri = migrationEncryption.decryptCredential(stored.encryptedMongoUri);
      }
    }
    return mongoStagingService.testConnection(resolvedConfig);
  }

  public async purgeStagingData(planId: string): Promise<{ droppedCollections: string[] }> {
    const stored = this.readStoredPlans().find((p) => p.id === planId);
    if (!stored) throw new Error('找不到指定的迁移计划');
    const mongoConfig = this.resolveMongoConfig(stored);
    const res = await mongoStagingService.purgeTaskData(mongoConfig, planId);
    this.appendLog({
      taskId: planId,
      level: 'warn',
      stage: 'security',
      message: `已执行中转库安全碎纸清理 · 彻底销毁 ${res.droppedCollections.length} 个暂存集合`,
    });
    return res;
  }

  // ==================== Protected Sandbox Algorithms ====================

  public async fetchConnectorObjectsAndFields(accountId: string): Promise<Array<{ entityApiKey: string; label: string; lookups: Array<{ field: string; targetEntity: string }> }>> {
    const { env, tokenData } = this.getAccountSession(accountId);
    const entities = await this.metadataService.fetchObjects(env, tokenData);
    return (entities || []).map((ent) => ({
      entityApiKey: ent.apiKey,
      label: ent.label || ent.apiKey,
      lookups: [],
    }));
  }

  public async inspectEntityDescribe(accountId: string, entityApiKey: string) {
    const { env, tokenData } = this.getAccountSession(accountId);
    return this.metadataService.fetchObjectDescribe(env, tokenData, entityApiKey);
  }

  public computeDagSequence(objectsMetadata: Array<{ entityApiKey: string; label?: string; wave?: number; lookups?: Array<{ field: string; targetEntity: string }> }>) {
    return runMigrationSkillScript<Array<{
      entityApiKey: string;
      label: string;
      wave: number;
      executionOrder: number;
      twoPassLookup: boolean;
      primaryLookupFields: string[];
    }>>('scripts/dag-planner.mjs', 'solveMigrationTopology', [objectsMetadata]);
  }

  public recommendFieldMappings(params: {
    sourceEntity: string;
    targetEntity: string;
    sourceFields: any[];
    targetFields: any[];
    topologyMode?: string;
    maskSensitive?: boolean;
  }) {
    return runMigrationSkillScript('scripts/mapping-recommender.mjs', 'recommendFieldMappings', [params]);
  }

  public previewTransformRules(mappings: MigrationFieldMapping[], sampleRecords: any[]) {
    return runMigrationSkillScript('scripts/data-scrubber.mjs', 'evaluateTransformPreview', [mappings, sampleRecords]);
  }

  public diagnoseErrors(failures: any[]) {
    return runMigrationSkillScript('scripts/error-diagnoser.mjs', 'diagnoseMigrationErrors', [failures]);
  }

  // ==================== Logging & Progress Subscriptions ====================

  public onProgress(listener: (metrics: MigrationProgressMetrics) => void): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  public onLog(listener: (log: MigrationLogItem) => void): () => void {
    this.logListeners.add(listener);
    return () => this.logListeners.delete(listener);
  }

  private emitProgress(metrics: MigrationProgressMetrics): void {
    this.progressState.set(metrics.taskId, metrics);
    for (const listener of this.progressListeners) {
      try { listener(metrics); } catch {}
    }
  }

  public getTaskProgress(planId: string): MigrationProgressMetrics | null {
    return this.progressState.get(planId) || null;
  }

  private appendLog(input: Omit<MigrationLogItem, 'id' | 'timestamp'>): MigrationLogItem {
    const item: MigrationLogItem = {
      id: `mlog_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      ...input,
      message: migrationEncryption.maskLogText(input.message),
    };
    try {
      const existing = this.listLogs(undefined, 1500);
      const next = [item, ...existing].slice(0, 1500);
      const filePath = this.getLogsPath();
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(next), 'utf8');
    } catch {}
    for (const listener of this.logListeners) {
      try { listener(item); } catch {}
    }
    return item;
  }

  public listLogs(taskId?: string, limit = 200): MigrationLogItem[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.getLogsPath(), 'utf8'));
      const list = Array.isArray(parsed) ? (parsed as MigrationLogItem[]) : [];
      const filtered = taskId ? list.filter((l) => l.taskId === taskId) : list;
      return filtered.slice(0, Math.max(1, Math.min(1000, limit)));
    } catch {
      return [];
    }
  }

  public clearLogs(taskId?: string): void {
    if (!taskId) {
      try { fs.writeFileSync(this.getLogsPath(), '[]', 'utf8'); } catch {}
      return;
    }
    const remaining = this.listLogs(undefined, 1500).filter((l) => l.taskId !== taskId);
    try { fs.writeFileSync(this.getLogsPath(), JSON.stringify(remaining), 'utf8'); } catch {}
  }

  // ==================== Account & Scheduler ====================

  private getAccountSession(accountId: string): { env: NeoEnvironment; tokenData: TokenData } {
    const resolved = this.sessionStore.resolveAccountId(accountId);
    const record = this.sessionStore.getAccountHistory().find((item) => item.id === resolved);
    const current = this.sessionStore.getCurrentSession();
    const tokenData = record?.tokenData || (current.activeAccountId === resolved ? current.tokenData : undefined);
    const env = record?.environment || (current.activeAccountId === resolved ? current.environment : undefined);
    if (!tokenData?.access_token || !env) {
      throw new Error(`连接器账号 [${accountId}] 会话未登录或已过期，请在连接器管理中重新授权`);
    }
    return { env, tokenData };
  }

  public startScheduler(): void {
    if (this.schedulerTimer) return;
    this.schedulerTimer = setInterval(() => {
      void this.tickScheduler();
    }, 30_000);
    this.schedulerTimer.unref?.();
  }

  public stopScheduler(): void {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = undefined;
    }
  }

  private async tickScheduler(): Promise<void> {
    const now = new Date();
    const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
    const plans = this.readStoredPlans();
    for (const plan of plans) {
      if (!plan.schedule?.enabled || plan.schedule.mode === 'manual') continue;
      if (this.activeControllers.has(plan.id)) continue;

      let shouldRun = false;
      if (plan.schedule.mode === 'interval') {
        const intervalMs = Math.max(5, Number(plan.schedule.intervalMinutes) || 60) * 60_000;
        const lastRun = plan.lastScheduledRunAt || 0;
        if (Date.now() - lastRun >= intervalMs) shouldRun = true;
      } else if (plan.schedule.mode === 'cron' && plan.schedule.cronExpr && this.lastCronMinuteKey !== minuteKey) {
        if (matchesCronExpression(plan.schedule.cronExpr, now)) shouldRun = true;
      }

      if (shouldRun) {
        plan.lastScheduledRunAt = Date.now();
        this.writeStoredPlans(plans);
        this.appendLog({
          taskId: plan.id,
          level: 'info',
          stage: 'scheduler',
          message: `定时增量调度触发迁移任务 [${plan.name}] (${plan.schedule.mode})`,
        });
        void this.startTask(plan.id, { incremental: true, trigger: 'scheduled' });
      }
    }
    this.lastCronMinuteKey = minuteKey;
  }

  // ==================== Streaming Migration Pipeline (Sharded + Two-Pass + L1/L2/L3) ====================

  public pauseTask(planId: string): void {
    const ctrl = this.activeControllers.get(planId);
    if (ctrl) ctrl.paused = true;
    const state = this.progressState.get(planId);
    if (state) {
      state.status = 'paused';
      this.emitProgress({ ...state });
    }
  }

  public resumeTask(planId: string): void {
    const ctrl = this.activeControllers.get(planId);
    if (ctrl) ctrl.paused = false;
    const state = this.progressState.get(planId);
    if (state && state.status === 'paused') {
      state.status = 'running';
      this.emitProgress({ ...state });
    }
  }

  public stopTask(planId: string): void {
    const ctrl = this.activeControllers.get(planId);
    if (ctrl) ctrl.aborted = true;
  }

  private async waitIfPaused(ctrl: { paused: boolean; aborted: boolean }): Promise<void> {
    while (ctrl.paused && !ctrl.aborted) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  private transformRecord(
    rawRecord: Record<string, any>,
    objCfg: MigrationObjectConfig,
    dek: Buffer,
    l1DimMaps: Map<string, Map<string, string>>,
    l2Lru: LruIdCache,
    l3LookupMap: Map<string, string>,
    skipDeferredLookups: boolean
  ): { payload: Record<string, any>; deferredFields: Record<string, any>; parentGroupKey: string } {
    const payload: Record<string, any> = {};
    const deferredFields: Record<string, any> = {};
    const deferredSet = new Set(objCfg.primaryLookupFields || []);
    let parentGroupKey = '';

    for (const rule of objCfg.fieldMappings) {
      let val = rawRecord[rule.sourceField];
      if (rule.isEncryptedInStage && typeof val === 'string' && val.startsWith('mig-enc:v1:')) {
        val = migrationEncryption.decryptFieldValue(val, dek);
      }

      if (rule.transformType === 'default' && (val === undefined || val === null || val === '')) {
        val = rule.defaultValue;
      } else if (rule.transformType === 'dict' && rule.dictMap) {
        const key = String(val ?? '');
        val = Object.hasOwn(rule.dictMap, key) ? rule.dictMap[key] : (rule.dictMap.__DEFAULT__ ?? val);
      } else if (rule.transformType === 'mask' && rule.maskPattern && rule.maskPattern !== 'none') {
        val = migrationEncryption.applyMask(val, rule.maskPattern);
      }

      if (val === undefined) continue;

      if (deferredSet.has(rule.sourceField) || deferredSet.has(rule.targetField)) {
        const refVal = String(val || '');
        if (refVal) {
          deferredFields[rule.targetField] = refVal;
          if (!parentGroupKey) parentGroupKey = refVal;
        }
        if (skipDeferredLookups) continue;
      }

      // Translate non-deferred lookups via L1 -> L2 -> L3
      if (rule.sourceField.toLowerCase().endsWith('id') && val && typeof val === 'string') {
        const l1Hit = l1DimMaps.get(rule.sourceField)?.get(val);
        const l2Hit = l2Lru.get(val);
        const l3Hit = l3LookupMap.get(val);
        if (l1Hit) val = l1Hit;
        else if (l2Hit) val = l2Hit;
        else if (l3Hit) val = l3Hit;
      }

      payload[rule.targetField] = val;
    }

    return { payload, deferredFields, parentGroupKey };
  }

  private resolveSplitTargetConnector(rawRecord: Record<string, any>, objCfg: MigrationObjectConfig): string {
    if (!objCfg.routingRules?.length) return objCfg.targetConnectorId;
    for (const rule of objCfg.routingRules) {
      const val = rawRecord[rule.conditionField];
      if (rule.operator === 'equals' && String(val ?? '') === String(rule.value ?? '')) return rule.targetConnectorId;
      if (rule.operator === 'not_equals' && String(val ?? '') !== String(rule.value ?? '')) return rule.targetConnectorId;
      if (rule.operator === 'contains' && String(val ?? '').includes(String(rule.value ?? ''))) return rule.targetConnectorId;
      if (rule.operator === 'in' && Array.isArray(rule.value) && rule.value.map(String).includes(String(val ?? ''))) return rule.targetConnectorId;
    }
    return objCfg.targetConnectorId;
  }

  public async startTask(
    planId: string,
    options: { incremental?: boolean; trigger?: 'manual' | 'scheduled'; onlyObjectIds?: string[] } = {}
  ): Promise<MigrationProgressMetrics> {
    if (this.activeControllers.has(planId)) {
      throw new Error('该迁移工程正在运行中，请勿重复启动');
    }
    const stored = this.readStoredPlans().find((p) => p.id === planId);
    if (!stored) throw new Error('未找到指定的迁移工程配置');

    const ctrl = { paused: false, aborted: false };
    this.activeControllers.set(planId, ctrl);

    const orderedObjects = [...stored.objects]
      .filter((o) => o.enabled && (!options.onlyObjectIds?.length || options.onlyObjectIds.includes(o.id)))
      .sort((a, b) => a.wave - b.wave || a.executionOrder - b.executionOrder);

    const startedAt = Date.now();
    const metrics: MigrationProgressMetrics = {
      taskId: planId,
      taskName: stored.name,
      status: 'running',
      startedAt,
      totalObjects: orderedObjects.length,
      completedObjects: 0,
      totalSourceRecords: 0,
      processedRecords: 0,
      loadedRecords: 0,
      patchedRecords: 0,
      failedRecords: 0,
      currentTps: 0,
      etaSeconds: 0,
      currentWave: orderedObjects[0]?.wave || 1,
      objectStats: Object.fromEntries(
        orderedObjects.map((o) => [
          o.id,
          {
            objectConfigId: o.id,
            sourceEntity: o.sourceEntity,
            targetEntity: o.targetEntity,
            wave: o.wave,
            stage: 'pending',
            totalSourceRecords: 0,
            extractedRecords: 0,
            transformedRecords: 0,
            loadedRecords: 0,
            patchedRecords: 0,
            failedRecords: 0,
            durationMs: 0,
          },
        ])
      ),
      activeJobs: [],
    };
    this.emitProgress(metrics);

    try {
      const mongoConfig = this.resolveMongoConfig(stored);
      const db = await mongoStagingService.getDb(mongoConfig);
      const { dek } = migrationEncryption.getOrCreateProjectDek(planId, stored.wrappedDek);

      await mongoStagingService.getMetricsCollection(db).updateOne(
        { _id: planId },
        { $set: { ...metrics, _id: planId } },
        { upsert: true }
      );

      this.appendLog({
        taskId: planId,
        level: 'info',
        stage: 'topology',
        message: `迁移引擎启动 · 模式=${stored.topology.mode} · 共 ${orderedObjects.length} 个对象 · 增量=${!!options.incremental}`,
      });

      const l1DimMaps = new Map<string, Map<string, string>>();
      const l2Lru = new LruIdCache(500_000);
      const phase2Queue: Array<{ objCfg: MigrationObjectConfig; targetColName: string }> = [];

      // ========== PASS 1: Wave & Topological Order Extraction -> Encrypt -> Transform -> Load ==========
      for (const objCfg of orderedObjects) {
        if (ctrl.aborted) break;
        await this.waitIfPaused(ctrl);

        const objStarted = Date.now();
        const objMetric = metrics.objectStats[objCfg.id];
        metrics.currentWave = objCfg.wave;
        objMetric.stage = 'extracting';
        this.emitProgress({ ...metrics });

        try {
          await mongoStagingService.ensureObjectIndexes(db, planId, objCfg.sourceEntity, objCfg.targetEntity);
          const { env: srcEnv, tokenData: srcToken } = this.getAccountSession(objCfg.sourceConnectorId);

          const watermarkRec = options.incremental
            ? await mongoStagingService.getWatermark(db, objCfg.sourceConnectorId, objCfg.sourceEntity)
            : null;

          let watermarkStart: string | null = null;
          if (watermarkRec?.lastHighWatermark) {
            const bufferMs = (stored.schedule?.clockSkewBufferSeconds || 300) * 1000;
            const t = new Date(watermarkRec.lastHighWatermark).getTime();
            if (Number.isFinite(t)) watermarkStart = new Date(t - bufferMs).toISOString();
          }

          const product = srcEnv.productType || 'neocrm';
          const keysetField = product === 'salesforce' ? 'Id' : product === 'fxiaoke' ? '_id' : 'id';
          const watermarkField = stored.schedule?.highWatermarkField || (product === 'salesforce' ? 'LastModifiedDate' : product === 'fxiaoke' ? 'update_time' : 'updatedAt');
          const sourceFields = Array.from(new Set(objCfg.fieldMappings.map((m) => m.sourceField).filter(Boolean)));
          const batchSize = Math.max(50, Math.min(2000, objCfg.batchSize || 1000));

          const shardCol = mongoStagingService.getShardsCollection(db, planId);
          const shardId = `${planId}::${objCfg.id}::0`;
          const savedShard = await shardCol.findOne({ _id: shardId });
          let lastKeysetId: string | null = savedShard?.status !== 'completed' ? (savedShard?.lastKeysetId || null) : null;
          let maxSeenWatermark = watermarkRec?.lastHighWatermark || '';
          let hasMore = true;

          while (hasMore && !ctrl.aborted) {
            await this.waitIfPaused(ctrl);
            const chunk = await this.asyncJobService.extractKeysetChunk({
              env: srcEnv,
              tokenData: srcToken,
              entity: objCfg.sourceEntity,
              fields: sourceFields,
              keysetField,
              lastKeysetId,
              watermarkField,
              watermarkStart,
              filterCondition: objCfg.filterCondition,
              batchSize,
            });

            if (chunk.records.length > 0) {
              // Envelope-encrypt sensitive fields before landing in MongoDB staging
              const sensitiveFields = new Set(
                objCfg.fieldMappings.filter((m) => m.isEncryptedInStage).map((m) => m.sourceField)
              );
              const rawDocs = chunk.records.map((rec) => {
                const sid = String(rec[keysetField] ?? '');
                const stagedPayload: Record<string, unknown> = { ...rec };
                for (const sf of sensitiveFields) {
                  if (stagedPayload[sf] !== undefined && stagedPayload[sf] !== null) {
                    stagedPayload[sf] = migrationEncryption.encryptFieldValue(stagedPayload[sf], dek);
                  }
                }
                const wmVal = rec[watermarkField] ? String(rec[watermarkField]) : undefined;
                if (wmVal && (!maxSeenWatermark || wmVal > maxSeenWatermark)) maxSeenWatermark = wmVal;
                const checksum = crypto.createHash('sha256').update(JSON.stringify(rec)).digest('hex');
                return {
                  sourceConnectorId: objCfg.sourceConnectorId,
                  sourceId: sid,
                  checksum,
                  payload: stagedPayload,
                  updatedAt: wmVal,
                };
              });

              await mongoStagingService.bulkUpsertRawRecords(db, planId, objCfg.sourceEntity, rawDocs);
              await mongoStagingService.incrementProgressMetrics(db, planId, objCfg.id, { extracted: rawDocs.length });

              objMetric.extractedRecords += rawDocs.length;
              metrics.processedRecords += rawDocs.length;
              metrics.totalSourceRecords = Math.max(metrics.totalSourceRecords, metrics.processedRecords);

              lastKeysetId = chunk.nextKeysetId;
              await shardCol.updateOne(
                { _id: shardId },
                {
                  $set: {
                    taskId: planId,
                    objectConfigId: objCfg.id,
                    sourceEntity: objCfg.sourceEntity,
                    shardIndex: 0,
                    lastKeysetId: lastKeysetId || undefined,
                    extractedCount: objMetric.extractedRecords,
                    status: chunk.hasMore ? 'running' : 'completed',
                    updatedAt: Date.now(),
                  },
                },
                { upsert: true }
              );

              const elapsedSec = Math.max(1, (Date.now() - startedAt) / 1000);
              metrics.currentTps = Math.round(metrics.processedRecords / elapsedSec);
              this.emitProgress({ ...metrics });
            }
            hasMore = chunk.hasMore;
          }

          // Stream from MongoDB raw_* -> Transform -> Load Phase 1 -> Save idmap_*
          objMetric.stage = 'loading';
          this.emitProgress({ ...metrics });

          const rawCol = mongoStagingService.getRawCollection(db, planId, objCfg.sourceEntity);
          const cursor = rawCol.find({ transformStatus: 'pending' }).batchSize(batchSize);
          let batchDocs: any[] = [];

          const flushBatch = async (docs: any[]) => {
            if (!docs.length || ctrl.aborted) return;

            // Collect L3 source foreign IDs for bulk $in lookup
            const lookupIds = new Set<string>();
            for (const doc of docs) {
              const p = doc.payload || {};
              for (const rule of objCfg.fieldMappings) {
                if (rule.sourceField.toLowerCase().endsWith('id') && p[rule.sourceField]) {
                  const rawId = String(p[rule.sourceField]);
                  if (!l2Lru.get(rawId)) lookupIds.add(rawId);
                }
              }
            }
            const l3Map = lookupIds.size
              ? await mongoStagingService.bulkLookupTargetIds(db, planId, objCfg.targetEntity, Array.from(lookupIds))
              : new Map<string, string>();
            for (const [k, v] of l3Map.entries()) l2Lru.set(k, v);

            // Group by resolved targetConnectorId (supports 1->N routing split)
            const groupedByTarget = new Map<string, Array<{ sourceId: string; parentGroupKey: string; payload: Record<string, any> }>>();
            for (const doc of docs) {
              const rawRec = doc.payload || {};
              const { payload, parentGroupKey } = this.transformRecord(
                rawRec,
                objCfg,
                dek,
                l1DimMaps,
                l2Lru,
                l3Map,
                objCfg.twoPassLookup
              );
              const tgtConnId = this.resolveSplitTargetConnector(rawRec, objCfg);
              if (!groupedByTarget.has(tgtConnId)) groupedByTarget.set(tgtConnId, []);
              groupedByTarget.get(tgtConnId)!.push({
                sourceId: String(doc.sourceId),
                parentGroupKey,
                payload,
              });
            }

            for (const [tgtConnId, targetBatch] of groupedByTarget.entries()) {
              const { env: tgtEnv, tokenData: tgtToken } = this.getAccountSession(tgtConnId);
              const writeRes = await this.asyncJobService.executeBulkLoad({
                env: tgtEnv,
                tokenData: tgtToken,
                entity: objCfg.targetEntity,
                operation: 'insert',
                records: targetBatch,
                concurrency: objCfg.concurrency || 4,
                onJobUpdate: (job) => {
                  metrics.activeJobs = [job, ...metrics.activeJobs.filter((j) => j.jobId !== job.jobId)].slice(0, 12);
                  this.emitProgress({ ...metrics });
                },
              });

              if (writeRes.successMap.length > 0) {
                await mongoStagingService.bulkUpsertIdMappings(
                  db,
                  planId,
                  objCfg.targetEntity,
                  writeRes.successMap.map((m) => ({
                    sourceConnectorId: objCfg.sourceConnectorId,
                    sourceEntity: objCfg.sourceEntity,
                    sourceId: m.sourceId,
                    targetConnectorId: tgtConnId,
                    targetId: m.targetId,
                  }))
                );
                for (const m of writeRes.successMap) {
                  l2Lru.set(m.sourceId, m.targetId);
                  if (objCfg.wave === 1) {
                    if (!l1DimMaps.has(objCfg.targetEntity)) l1DimMaps.set(objCfg.targetEntity, new Map());
                    l1DimMaps.get(objCfg.targetEntity)!.set(m.sourceId, m.targetId);
                  }
                }
              }

              if (writeRes.failures.length > 0) {
                const auditFailures: MigrationAuditRecord[] = writeRes.failures.map((f) => ({
                  id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                  taskId: planId,
                  sourceEntity: objCfg.sourceEntity,
                  sourceId: f.sourceId,
                  targetEntity: objCfg.targetEntity,
                  stage: 'load',
                  status: 'failed',
                  errorCode: f.errorCode,
                  errorMessage: migrationEncryption.maskLogText(f.errorMessage),
                  timestamp: Date.now(),
                  retryCount: 0,
                }));
                await mongoStagingService.recordAuditFailures(db, planId, auditFailures);
              }

              await mongoStagingService.incrementProgressMetrics(db, planId, objCfg.id, {
                loaded: writeRes.successMap.length,
                failed: writeRes.failures.length,
              });
              objMetric.loadedRecords += writeRes.successMap.length;
              objMetric.failedRecords += writeRes.failures.length;
              metrics.loadedRecords += writeRes.successMap.length;
              metrics.failedRecords += writeRes.failures.length;
            }

            await rawCol.updateMany(
              { _id: { $in: docs.map((d) => d._id) } },
              { $set: { transformStatus: 'done' } }
            );
            this.emitProgress({ ...metrics });
          };

          for await (const doc of cursor) {
            if (ctrl.aborted) break;
            batchDocs.push(doc);
            if (batchDocs.length >= batchSize) {
              await flushBatch(batchDocs);
              batchDocs = [];
            }
          }
          if (batchDocs.length > 0) await flushBatch(batchDocs);

          if (maxSeenWatermark) {
            await mongoStagingService.saveWatermark(db, {
              _id: `${objCfg.sourceConnectorId}::${objCfg.sourceEntity}`,
              sourceConnectorId: objCfg.sourceConnectorId,
              sourceEntity: objCfg.sourceEntity,
              watermarkField,
              lastHighWatermark: maxSeenWatermark,
              lastSyncCount: objMetric.loadedRecords,
              updatedAt: Date.now(),
            });
            metrics.lastWatermark = maxSeenWatermark;
          }

          if (objCfg.twoPassLookup && objCfg.primaryLookupFields?.length) {
            phase2Queue.push({ objCfg, targetColName: objCfg.targetEntity });
          }

          objMetric.stage = 'completed';
          objMetric.durationMs = Date.now() - objStarted;
          metrics.completedObjects++;
          this.appendLog({
            taskId: planId,
            level: 'success',
            stage: 'load',
            entity: objCfg.sourceEntity,
            message: `对象 ${objCfg.sourceEntity} -> ${objCfg.targetEntity} 第一阶段完成 · 抽取 ${objMetric.extractedRecords} · 写入 ${objMetric.loadedRecords} · 失败 ${objMetric.failedRecords}`,
            durationMs: objMetric.durationMs,
          });
        } catch (objErr: any) {
          objMetric.stage = 'failed';
          objMetric.lastError = migrationEncryption.maskLogText(objErr?.message || '对象迁移失败');
          objMetric.durationMs = Date.now() - objStarted;
          this.appendLog({
            taskId: planId,
            level: 'error',
            stage: 'load',
            entity: objCfg.sourceEntity,
            message: `对象 ${objCfg.sourceEntity} 迁移失败: ${objMetric.lastError}`,
            durationMs: objMetric.durationMs,
          });
        }
        this.emitProgress({ ...metrics });
      }

      // ========== PASS 2: Two-Pass Deferred Lookup Patching ==========
      for (const item of phase2Queue) {
        if (ctrl.aborted) break;
        const { objCfg } = item;
        const objMetric = metrics.objectStats[objCfg.id];
        objMetric.stage = 'patching';
        this.emitProgress({ ...metrics });

        try {
          const rawCol = mongoStagingService.getRawCollection(db, planId, objCfg.sourceEntity);
          const idMapCol = mongoStagingService.getIdMapCollection(db, planId, objCfg.targetEntity);
          const cursor = rawCol.find({}).batchSize(500);
          let patchBatch: any[] = [];

          const flushPatch = async (docs: any[]) => {
            if (!docs.length) return;
            const sourceIds = docs.map((d) => String(d.sourceId));
            const selfMap = await mongoStagingService.bulkLookupTargetIds(db, planId, objCfg.targetEntity, sourceIds);
            const refIds = new Set<string>();
            for (const doc of docs) {
              for (const f of objCfg.primaryLookupFields || []) {
                if (doc.payload?.[f]) refIds.add(String(doc.payload[f]));
              }
            }
            const refMap = refIds.size
              ? await mongoStagingService.bulkLookupTargetIds(db, planId, objCfg.targetEntity, Array.from(refIds))
              : new Map<string, string>();

            const updatePayloads: Array<{ sourceId: string; targetId: string; payload: Record<string, any> }> = [];
            for (const doc of docs) {
              const targetId = selfMap.get(String(doc.sourceId));
              if (!targetId) continue;
              const patchObj: Record<string, any> = {};
              for (const f of objCfg.primaryLookupFields || []) {
                const srcRef = doc.payload?.[f];
                if (!srcRef) continue;
                const mappedRef = l2Lru.get(String(srcRef)) || refMap.get(String(srcRef));
                if (mappedRef) patchObj[f] = mappedRef;
              }
              if (Object.keys(patchObj).length > 0) {
                updatePayloads.push({ sourceId: String(doc.sourceId), targetId, payload: patchObj });
              }
            }

            if (updatePayloads.length > 0) {
              const { env: tgtEnv, tokenData: tgtToken } = this.getAccountSession(objCfg.targetConnectorId);
              const patchRes = await this.asyncJobService.executeBulkLoad({
                env: tgtEnv,
                tokenData: tgtToken,
                entity: objCfg.targetEntity,
                operation: 'update',
                records: updatePayloads,
                concurrency: objCfg.concurrency || 4,
              });
              objMetric.patchedRecords += patchRes.successMap.length;
              metrics.patchedRecords += patchRes.successMap.length;
              await mongoStagingService.incrementProgressMetrics(db, planId, objCfg.id, { patched: patchRes.successMap.length });
            }
          };

          for await (const doc of cursor) {
            if (ctrl.aborted) break;
            patchBatch.push(doc);
            if (patchBatch.length >= 500) {
              await flushPatch(patchBatch);
              patchBatch = [];
            }
          }
          if (patchBatch.length > 0) await flushPatch(patchBatch);
          await idMapCol.estimatedDocumentCount().catch(() => 0);

          objMetric.stage = 'completed';
          this.appendLog({
            taskId: planId,
            level: 'success',
            stage: 'patch',
            entity: objCfg.targetEntity,
            message: `第二阶段外键补全完成 (${objCfg.targetEntity}) · 已回填关联 ${objMetric.patchedRecords} 条`,
          });
        } catch (patchErr: any) {
          this.appendLog({
            taskId: planId,
            level: 'error',
            stage: 'patch',
            entity: objCfg.targetEntity,
            message: `第二阶段外键装配异常 (${objCfg.targetEntity}): ${migrationEncryption.maskLogText(patchErr?.message || '')}`,
          });
        }
      }

      metrics.status = ctrl.aborted ? 'paused' : 'completed';
      metrics.completedAt = Date.now();
      this.emitProgress({ ...metrics });

      if (stored.schedule?.notifyOnComplete && Notification?.isSupported?.()) {
        new Notification({
          title: `数据迁移任务${metrics.status === 'completed' ? '已完成' : '已暂停'}`,
          body: `${stored.name} · 写入 ${metrics.loadedRecords} 条，失败 ${metrics.failedRecords} 条`,
        }).show();
      }
      return metrics;
    } catch (error: any) {
      metrics.status = 'failed';
      metrics.completedAt = Date.now();
      this.emitProgress({ ...metrics });
      const msg = migrationEncryption.maskLogText(error?.message || '迁移任务执行异常');
      this.appendLog({ taskId: planId, level: 'error', stage: 'database', message: msg });
      if (stored.schedule?.notifyOnFailure && Notification?.isSupported?.()) {
        new Notification({ title: '数据迁移任务异常', body: `${stored.name}: ${msg}` }).show();
      }
      throw error;
    } finally {
      this.activeControllers.delete(planId);
    }
  }

  public async listAuditFailures(planId: string, limit = 100): Promise<MigrationAuditRecord[]> {
    const stored = this.readStoredPlans().find((p) => p.id === planId);
    if (!stored) return [];
    const mongoConfig = this.resolveMongoConfig(stored);
    const db = await mongoStagingService.getDb(mongoConfig);
    return mongoStagingService.listAuditFailures(db, planId, limit);
  }

  public async reconcileAudit(planId: string): Promise<MigrationReconciliationReport> {
    const stored = this.readStoredPlans().find((p) => p.id === planId);
    if (!stored) throw new Error('未找到迁移工程');
    const mongoConfig = this.resolveMongoConfig(stored);
    const db = await mongoStagingService.getDb(mongoConfig);
    const items: MigrationReconciliationItem[] = [];

    for (const obj of stored.objects.filter((o) => o.enabled)) {
      const rawCount = await mongoStagingService.getRawCollection(db, planId, obj.sourceEntity).estimatedDocumentCount().catch(() => 0);
      const mappedCount = await mongoStagingService.getIdMapCollection(db, planId, obj.targetEntity).estimatedDocumentCount().catch(() => 0);
      const delta = rawCount - mappedCount;
      items.push({
        entity: `${obj.sourceEntity} → ${obj.targetEntity}`,
        sourceCount: rawCount,
        targetCount: mappedCount,
        deltaCount: delta,
        matchedCount: mappedCount,
        status: delta === 0 ? 'balanced' : 'discrepant',
      });
    }

    const hasDiscrepancy = items.some((i) => i.status === 'discrepant');
    const report: MigrationReconciliationReport = {
      id: `rec_${Date.now()}`,
      taskId: planId,
      generatedAt: Date.now(),
      items,
      overallStatus: hasDiscrepancy ? 'discrepant' : 'balanced',
      summary: hasDiscrepancy ? '部分对象源端与映射库数量存在差异，请排查失败日志。' : '全部已启用对象源端与目标端映射数量完全一致。',
    };
    this.appendLog({
      taskId: planId,
      level: hasDiscrepancy ? 'warn' : 'success',
      stage: 'reconcile',
      message: `对账核验完成: ${report.summary}`,
    });
    return report;
  }
}
