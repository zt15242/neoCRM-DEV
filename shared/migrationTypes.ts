import type { CrmProductType } from './types';

export type MigrationTopologyMode = 'n_to_1' | '1_to_n' | '1_to_1';

export interface MigrationConnectorRef {
  accountId: string;
  connectorId: string;
  connectorName: string;
  productType: CrmProductType;
  tenantName?: string;
  role?: 'source' | 'target';
  tag?: string;
}

export interface MigrationTopologyConfig {
  mode: MigrationTopologyMode;
  name: string;
  description?: string;
  sources: MigrationConnectorRef[];
  targets: MigrationConnectorRef[];
}

export interface MigrationMongoConfig {
  mode: 'local' | 'remote';
  uri: string; // Stored securely; masked in UI
  database: string;
  useTls: boolean;
  maxPoolSize: number;
  serverSelectionTimeoutMs?: number;
}

export interface MigrationMongoStatus {
  connected: boolean;
  latencyMs?: number;
  database: string;
  collectionsCount?: number;
  totalDataSizeBytes?: number;
  error?: string;
}

export type FieldTransformType = 'direct' | 'dict' | 'script' | 'mask' | 'default';
export type FieldMaskPattern = 'none' | 'phone' | 'name' | 'idcard' | 'email' | 'hash';

export interface MigrationFieldMapping {
  id: string;
  sourceField: string;
  targetField: string;
  transformType: FieldTransformType;
  dictMap?: Record<string, string>;
  defaultValue?: any;
  maskPattern?: FieldMaskPattern;
  scriptSnippet?: string;
  isEncryptedInStage?: boolean; // Envelope encryption in MongoDB
  required?: boolean;
}

export interface MigrationRoutingRule {
  id: string;
  conditionField: string;
  operator: 'equals' | 'not_equals' | 'in' | 'contains' | 'greater_than' | 'less_than';
  value: any;
  targetConnectorId: string;
}

export interface MigrationObjectConfig {
  id: string;
  sourceEntity: string;
  targetEntity: string;
  sourceConnectorId: string;
  targetConnectorId: string;
  wave: number; // 1: Dims, 2: Master, 3: Transactions, 4: History/Logs
  executionOrder: number;
  enabled: boolean;
  twoPassLookup: boolean; // Skeleton insert first, then patch foreign keys
  primaryLookupFields?: string[]; // Lookup fields to defer to Phase 2
  filterCondition?: string; // Query condition (e.g. status != 'DELETED')
  dedupKeys?: string[]; // Keys for N->1 merge deduplication (e.g. ['taxNumber', 'cleanName'])
  routingRules?: MigrationRoutingRule[]; // Rules for 1->N split
  fieldMappings: MigrationFieldMapping[];
  batchSize?: number;
  concurrency?: number;
}

export interface MigrationScheduleConfig {
  mode: 'manual' | 'interval' | 'cron';
  intervalMinutes?: number;
  cronExpr?: string;
  highWatermarkField: string;
  clockSkewBufferSeconds: number; // Default 300s
  enabled: boolean;
  autoResumeOnAppStart?: boolean;
  notifyOnComplete?: boolean;
  notifyOnFailure?: boolean;
}

export type UnifiedJobStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'aborted';

export interface UnifiedCrmJob {
  jobId: string;
  platform: CrmProductType;
  entity: string;
  operation: 'insert' | 'update' | 'upsert' | 'delete';
  status: UnifiedJobStatus;
  totalRecords: number;
  processedRecords: number;
  failedRecords: number;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  downloadUrl?: string;
}

export interface MigrationObjectMetric {
  objectConfigId: string;
  sourceEntity: string;
  targetEntity: string;
  wave: number;
  stage: 'pending' | 'extracting' | 'transforming' | 'loading' | 'patching' | 'completed' | 'failed';
  totalSourceRecords: number;
  extractedRecords: number;
  transformedRecords: number;
  loadedRecords: number;
  patchedRecords: number;
  failedRecords: number;
  durationMs: number;
  lastError?: string;
  errorCategory?: string;
}

export interface MigrationProgressMetrics {
  taskId: string;
  taskName: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  startedAt?: number;
  completedAt?: number;
  totalObjects: number;
  completedObjects: number;
  totalSourceRecords: number;
  processedRecords: number;
  loadedRecords: number;
  patchedRecords: number;
  failedRecords: number;
  currentTps: number;
  etaSeconds: number;
  currentWave: number;
  objectStats: Record<string, MigrationObjectMetric>;
  activeJobs: UnifiedCrmJob[];
  lastWatermark?: string;
}

export interface MigrationAuditRecord {
  id: string;
  taskId: string;
  sourceEntity: string;
  sourceId: string;
  targetEntity: string;
  targetId?: string;
  stage: 'extract' | 'transform' | 'load' | 'patch';
  status: 'success' | 'failed' | 'skipped';
  errorCode?: string;
  errorMessage?: string;
  sourcePayloadMasked?: Record<string, unknown>;
  timestamp: number;
  retryCount: number;
}

export interface MigrationReconciliationItem {
  entity: string;
  sourceCount: number;
  targetCount: number;
  deltaCount: number;
  matchedCount: number;
  sourceSum?: number;
  targetSum?: number;
  deltaSum?: number;
  sumField?: string;
  status: 'balanced' | 'discrepant' | 'unverified';
}

export interface MigrationReconciliationReport {
  id: string;
  taskId: string;
  generatedAt: number;
  items: MigrationReconciliationItem[];
  overallStatus: 'balanced' | 'discrepant';
  summary: string;
}

export interface MigrationPlan {
  id: string;
  name: string;
  description?: string;
  topology: MigrationTopologyConfig;
  mongoConfig: MigrationMongoConfig;
  schedule: MigrationScheduleConfig;
  objects: MigrationObjectConfig[];
  createdAt: number;
  updatedAt: number;
}
