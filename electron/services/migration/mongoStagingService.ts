import { MongoClient, Db, Collection, AnyBulkWriteOperation } from 'mongodb';
import type {
  MigrationAuditRecord,
  MigrationMongoConfig,
  MigrationMongoStatus,
  MigrationProgressMetrics,
} from '../../../shared/migrationTypes';
import { migrationEncryption } from './migrationEncryption';

export interface MigrationShardCheckpoint {
  _id: string; // `${taskId}::${objectConfigId}::${shardIndex}`
  taskId: string;
  objectConfigId: string;
  sourceEntity: string;
  shardIndex: number;
  rangeStart?: string;
  rangeEnd?: string;
  lastKeysetId?: string;
  extractedCount: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  updatedAt: number;
  error?: string;
}

export interface MigrationWatermarkRecord {
  _id: string; // `${sourceConnectorId}::${sourceEntity}`
  sourceConnectorId: string;
  sourceEntity: string;
  watermarkField: string;
  lastHighWatermark: string;
  lastSyncCount: number;
  updatedAt: number;
}

const sanitizeCollectionPart = (value: string) =>
  value.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').slice(0, 36);

export class MongoStagingService {
  private clients = new Map<string, { client: MongoClient; db: Db; uriHash: string }>();

  private buildConnectionKey(config: MigrationMongoConfig, decryptedUri: string): string {
    return `${config.mode}::${config.database}::${config.useTls ? 'tls' : 'plain'}::${decryptedUri}`;
  }

  public async getDb(config: MigrationMongoConfig): Promise<Db> {
    const decryptedUri = migrationEncryption.decryptCredential(config.uri) ||
      (config.mode === 'local' ? 'mongodb://127.0.0.1:27017' : '');
    if (!decryptedUri) {
      throw new Error('请先配置有效的 MongoDB 连接地址');
    }
    const dbName = (config.database || 'neocrm_migration').trim();
    const key = this.buildConnectionKey(config, decryptedUri);
    const existing = this.clients.get(key);
    if (existing) return existing.db;

    const client = new MongoClient(decryptedUri, {
      maxPoolSize: Math.max(5, Math.min(100, Number(config.maxPoolSize) || 20)),
      minPoolSize: 2,
      serverSelectionTimeoutMS: config.serverSelectionTimeoutMs || 8000,
      connectTimeoutMS: 8000,
      tls: config.mode === 'remote' ? config.useTls : false,
      retryWrites: true,
    });
    await client.connect();
    const db = client.db(dbName);
    this.clients.set(key, { client, db, uriHash: key });
    return db;
  }

  public async closeAll(): Promise<void> {
    for (const entry of this.clients.values()) {
      try {
        await entry.client.close();
      } catch {
        // Ignore close errors on shutdown
      }
    }
    this.clients.clear();
  }

  public async testConnection(config: MigrationMongoConfig): Promise<MigrationMongoStatus> {
    const started = Date.now();
    const dbName = (config.database || 'neocrm_migration').trim();
    try {
      const db = await this.getDb(config);
      await db.admin().ping();
      const stats = await db.stats().catch(() => null);
      const collections = await db.listCollections().toArray();
      return {
        connected: true,
        latencyMs: Date.now() - started,
        database: dbName,
        collectionsCount: collections.length,
        totalDataSizeBytes: Number(stats?.dataSize || 0),
      };
    } catch (error: any) {
      return {
        connected: false,
        database: dbName,
        error: migrationEncryption.maskLogText(error?.message || 'MongoDB 连接失败'),
      };
    }
  }

  // ==================== Dynamic Per-Object Collections (100M+ Scale) ====================

  private shortId(taskId: string): string {
    return sanitizeCollectionPart(taskId).slice(0, 14) || 'default';
  }

  public getRawCollection(db: Db, taskId: string, entity: string): Collection {
    return db.collection(`raw_${this.shortId(taskId)}_${sanitizeCollectionPart(entity)}`);
  }

  public getTransformedCollection(db: Db, taskId: string, entity: string): Collection {
    return db.collection(`trans_${this.shortId(taskId)}_${sanitizeCollectionPart(entity)}`);
  }

  public getIdMapCollection(db: Db, taskId: string, entity: string): Collection {
    return db.collection(`idmap_${this.shortId(taskId)}_${sanitizeCollectionPart(entity)}`);
  }

  public getShardsCollection(db: Db, taskId: string): Collection<MigrationShardCheckpoint> {
    return db.collection<MigrationShardCheckpoint>(`shards_${this.shortId(taskId)}`);
  }

  public getWatermarksCollection(db: Db): Collection<MigrationWatermarkRecord> {
    return db.collection<MigrationWatermarkRecord>('migration_watermarks');
  }

  public getMetricsCollection(db: Db): Collection<MigrationProgressMetrics & { _id: string }> {
    return db.collection('migration_progress_metrics');
  }

  public getAuditCollection(db: Db, taskId: string): Collection<MigrationAuditRecord> {
    return db.collection<MigrationAuditRecord>(`audit_failures_${this.shortId(taskId)}`);
  }

  /**
   * Ensure optimal B-Tree indexes exist for each per-object staging collection.
   */
  public async ensureObjectIndexes(db: Db, taskId: string, sourceEntity: string, targetEntity: string): Promise<void> {
    const rawCol = this.getRawCollection(db, taskId, sourceEntity);
    const transCol = this.getTransformedCollection(db, taskId, targetEntity);
    const idMapCol = this.getIdMapCollection(db, taskId, targetEntity);

    await Promise.all([
      rawCol.createIndex({ sourceConnectorId: 1, sourceId: 1 }, { unique: true, background: true }),
      rawCol.createIndex({ transformStatus: 1 }, { background: true }),
      transCol.createIndex({ status: 1, parentGroupKey: 1 }, { background: true }),
      transCol.createIndex({ sourceConnectorId: 1, sourceId: 1 }, { unique: true, background: true }),
      idMapCol.createIndex({ sourceConnectorId: 1, sourceId: 1 }, { unique: true, background: true }),
      idMapCol.createIndex({ targetId: 1 }, { background: true }),
    ]);
  }

  /**
   * High-throughput unordered bulkWrite into MongoDB.
   */
  public async bulkUpsertRawRecords(
    db: Db,
    taskId: string,
    entity: string,
    records: Array<{
      sourceConnectorId: string;
      sourceId: string;
      checksum: string;
      payload: Record<string, unknown>;
      updatedAt?: string;
    }>
  ): Promise<{ upserted: number; modified: number }> {
    if (!records.length) return { upserted: 0, modified: 0 };
    const col = this.getRawCollection(db, taskId, entity);
    const ops: AnyBulkWriteOperation[] = records.map((rec) => ({
      updateOne: {
        filter: { sourceConnectorId: rec.sourceConnectorId, sourceId: rec.sourceId },
        update: {
          $set: {
            checksum: rec.checksum,
            payload: rec.payload,
            sourceUpdatedAt: rec.updatedAt || null,
            transformStatus: 'pending',
            extractedAt: Date.now(),
          },
        },
        upsert: true,
      },
    }));
    const res = await col.bulkWrite(ops, { ordered: false });
    return { upserted: res.upsertedCount, modified: res.modifiedCount };
  }

  public async bulkUpsertIdMappings(
    db: Db,
    taskId: string,
    targetEntity: string,
    mappings: Array<{
      sourceConnectorId: string;
      sourceEntity: string;
      sourceId: string;
      targetConnectorId: string;
      targetId: string;
    }>
  ): Promise<void> {
    if (!mappings.length) return;
    const col = this.getIdMapCollection(db, taskId, targetEntity);
    const ops: AnyBulkWriteOperation[] = mappings.map((m) => ({
      updateOne: {
        filter: { sourceConnectorId: m.sourceConnectorId, sourceId: m.sourceId },
        update: {
          $set: {
            sourceEntity: m.sourceEntity,
            targetConnectorId: m.targetConnectorId,
            targetEntity,
            targetId: m.targetId,
            migratedAt: Date.now(),
          },
        },
        upsert: true,
      },
    }));
    await col.bulkWrite(ops, { ordered: false });
  }

  /**
   * L3 Batch $in Foreign Key Resolution (eliminates N+1 query overhead at 100M scale).
   */
  public async bulkLookupTargetIds(
    db: Db,
    taskId: string,
    targetEntity: string,
    sourceIds: string[]
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (!sourceIds.length) return result;
    const col = this.getIdMapCollection(db, taskId, targetEntity);
    const docs = await col
      .find({ sourceId: { $in: sourceIds } }, { projection: { sourceId: 1, targetId: 1 } })
      .toArray();
    for (const doc of docs) {
      if (doc.sourceId && doc.targetId) {
        result.set(String(doc.sourceId), String(doc.targetId));
      }
    }
    return result;
  }

  /**
   * Atomic $inc progress tracking (O(1) dashboard queries instead of full-table countDocuments).
   */
  public async incrementProgressMetrics(
    db: Db,
    taskId: string,
    objectConfigId: string,
    deltas: {
      extracted?: number;
      transformed?: number;
      loaded?: number;
      patched?: number;
      failed?: number;
    }
  ): Promise<void> {
    const col = this.getMetricsCollection(db);
    const incDoc: Record<string, number> = {};
    if (deltas.extracted) {
      incDoc.processedRecords = deltas.extracted;
      incDoc[`objectStats.${objectConfigId}.extractedRecords`] = deltas.extracted;
    }
    if (deltas.transformed) {
      incDoc[`objectStats.${objectConfigId}.transformedRecords`] = deltas.transformed;
    }
    if (deltas.loaded) {
      incDoc.loadedRecords = deltas.loaded;
      incDoc[`objectStats.${objectConfigId}.loadedRecords`] = deltas.loaded;
    }
    if (deltas.patched) {
      incDoc.patchedRecords = deltas.patched;
      incDoc[`objectStats.${objectConfigId}.patchedRecords`] = deltas.patched;
    }
    if (deltas.failed) {
      incDoc.failedRecords = deltas.failed;
      incDoc[`objectStats.${objectConfigId}.failedRecords`] = deltas.failed;
    }
    if (Object.keys(incDoc).length === 0) return;
    await col.updateOne({ _id: taskId }, { $inc: incDoc });
  }

  public async getWatermark(
    db: Db,
    sourceConnectorId: string,
    sourceEntity: string
  ): Promise<MigrationWatermarkRecord | null> {
    return this.getWatermarksCollection(db).findOne({ _id: `${sourceConnectorId}::${sourceEntity}` });
  }

  public async saveWatermark(db: Db, record: MigrationWatermarkRecord): Promise<void> {
    await this.getWatermarksCollection(db).updateOne(
      { _id: record._id },
      { $set: record },
      { upsert: true }
    );
  }

  public async recordAuditFailures(
    db: Db,
    taskId: string,
    failures: MigrationAuditRecord[]
  ): Promise<void> {
    if (!failures.length) return;
    const col = this.getAuditCollection(db, taskId);
    await col.insertMany(failures, { ordered: false }).catch(() => {});
  }

  public async listAuditFailures(
    db: Db,
    taskId: string,
    limit = 100
  ): Promise<MigrationAuditRecord[]> {
    return this.getAuditCollection(db, taskId)
      .find({})
      .sort({ timestamp: -1 })
      .limit(Math.max(1, Math.min(500, limit)))
      .toArray();
  }

  /**
   * Securely drop all staging collections for a project/task after cutover acceptance.
   */
  public async purgeTaskData(config: MigrationMongoConfig, taskId: string): Promise<{ droppedCollections: string[] }> {
    const db = await this.getDb(config);
    const prefix = `_${this.shortId(taskId)}`;
    const all = await db.listCollections().toArray();
    const droppedCollections: string[] = [];
    for (const col of all) {
      if (
        col.name.startsWith(`raw${prefix}_`) ||
        col.name.startsWith(`trans${prefix}_`) ||
        col.name.startsWith(`idmap${prefix}_`) ||
        col.name === `shards${prefix}` ||
        col.name === `audit_failures${prefix}`
      ) {
        await db.dropCollection(col.name).catch(() => {});
        droppedCollections.push(col.name);
      }
    }
    await this.getMetricsCollection(db).deleteOne({ _id: taskId }).catch(() => {});
    return { droppedCollections };
  }
}

export const mongoStagingService = new MongoStagingService();
