import type { MigrationPlan } from '../../../shared/migrationTypes';

export function extractMigrationPlanFromText(text: string): MigrationPlan | null {
  if (!text) return null;

  // 1. Match code blocks: ```json:migration-plan ... ``` or ```migration-plan ... ```
  const blockRegex = /```(?:json:migration-plan|migration-plan)[ \t]*\r?\n([\s\S]*?)(?:```|$)/i;
  const match = text.match(blockRegex);
  if (match && match[1]) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed && (parsed.topology || parsed.objects || parsed.mongoConfig)) {
        return normalizeMigrationPlan(parsed);
      }
    } catch {
      // Fall through
    }
  }

  // 2. Fallback: match generic json code blocks containing migration indicators
  const genericRegex = /```(?:json)?[ \t]*\r?\n([\s\S]*?)(?:```|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = genericRegex.exec(text)) !== null) {
    const candidate = m[1].trim();
    if (
      candidate.includes('"topology"') &&
      candidate.includes('"objects"') &&
      (candidate.includes('"sourceEntity"') || candidate.includes('"twoPassLookup"'))
    ) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && parsed.topology) {
          return normalizeMigrationPlan(parsed);
        }
      } catch {
        // Continue scanning
      }
    }
  }

  return null;
}

function normalizeMigrationPlan(data: any): MigrationPlan {
  const now = Date.now();
  return {
    id: data.id || `mig_${now}_${Math.random().toString(36).slice(2, 7)}`,
    name: String(data.name || 'AI 推导的数据迁移方案').trim(),
    description: data.description || '由 AI 数据割接架构师基于多连接器环境推导生成的执行方案',
    topology: {
      mode: data.topology?.mode || 'n_to_1',
      name: data.topology?.name || data.name || '数据迁移拓扑',
      sources: Array.isArray(data.topology?.sources) ? data.topology.sources : [],
      targets: Array.isArray(data.topology?.targets) ? data.topology.targets : [],
    },
    mongoConfig: {
      mode: data.mongoConfig?.mode || 'local',
      uri: data.mongoConfig?.uri || 'mongodb://127.0.0.1:27017',
      database: data.mongoConfig?.database || 'neocrm_migration',
      useTls: !!data.mongoConfig?.useTls,
      maxPoolSize: Number(data.mongoConfig?.maxPoolSize) || 20,
    },
    schedule: {
      mode: data.schedule?.mode || 'manual',
      intervalMinutes: Number(data.schedule?.intervalMinutes) || 60,
      cronExpr: data.schedule?.cronExpr || '0 2 * * *',
      highWatermarkField: data.schedule?.highWatermarkField || 'updatedAt',
      clockSkewBufferSeconds: Number(data.schedule?.clockSkewBufferSeconds) || 300,
      enabled: !!data.schedule?.enabled,
      notifyOnComplete: data.schedule?.notifyOnComplete !== false,
      notifyOnFailure: data.schedule?.notifyOnFailure !== false,
    },
    objects: Array.isArray(data.objects)
      ? data.objects.map((o: any, idx: number) => ({
          id: o.id || `obj_${o.sourceEntity || idx}_${idx}`,
          sourceEntity: String(o.sourceEntity || 'account'),
          targetEntity: String(o.targetEntity || o.sourceEntity || 'account'),
          sourceConnectorId: String(o.sourceConnectorId || ''),
          targetConnectorId: String(o.targetConnectorId || ''),
          wave: Number(o.wave) || 2,
          executionOrder: Number(o.executionOrder) || idx + 1,
          enabled: o.enabled !== false,
          twoPassLookup: !!o.twoPassLookup,
          primaryLookupFields: Array.isArray(o.primaryLookupFields) ? o.primaryLookupFields : [],
          filterCondition: o.filterCondition || undefined,
          dedupKeys: Array.isArray(o.dedupKeys) ? o.dedupKeys : [],
          routingRules: Array.isArray(o.routingRules) ? o.routingRules : [],
          fieldMappings: Array.isArray(o.fieldMappings) ? o.fieldMappings : [],
          batchSize: Number(o.batchSize) || 1000,
          concurrency: Number(o.concurrency) || 4,
        }))
      : [],
    createdAt: data.createdAt || now,
    updatedAt: now,
  };
}
