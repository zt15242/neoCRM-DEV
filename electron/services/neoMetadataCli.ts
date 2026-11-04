import { runNeoCliCommand } from './neoApprovalCli';

type CliRun = (args: string[], cwd: string, signal?: AbortSignal) => Promise<string>;

export interface NeoCliEntity {
  apiKey: string;
  label: string;
  isStandard: boolean;
}

export class NeoMetadataCliReader {
  constructor(private run: CliRun = runNeoCliCommand) {}

  public async listObjects(root: string, options: { keyword?: string; customOnly?: boolean; signal?: AbortSignal } = {}) {
    const args = ['list', 'object'];
    if (options.customOnly) args.push('--custom');
    const command = `neo ${args.join(' ')}`;
    const output = await this.run(args, root, options.signal);
    const empty = output.trim() === '未查询到实体。';
    const total = Number(output.match(/^共 (\d+) 个实体：$/m)?.[1]);
    if (!empty && !Number.isInteger(total)) throw new Error('neo CLI 实体列表未返回有效总数');
    const entities: NeoCliEntity[] = [];
    let isStandard = true;
    for (const line of output.split(/\r?\n/)) {
      if (/^标准实体$/.test(line.trim())) { isStandard = true; continue; }
      if (/^自定义实体$/.test(line.trim())) { isStandard = false; continue; }
      const match = line.match(/^\s{2}(\S+)\s{2,}(.+?)\s*$/);
      if (match) entities.push({ apiKey: match[1], label: match[2], isStandard });
    }
    if (!empty && entities.length !== total) throw new Error(`neo CLI 实体列表不完整：声明 ${total} 个，解析到 ${entities.length} 个`);
    const keyword = options.keyword?.trim().toLocaleLowerCase();
    const filtered = entities.filter((entity) => !keyword || `${entity.apiKey} ${entity.label}`.toLocaleLowerCase().includes(keyword));
    return { command, entities: filtered, totalCount: filtered.length, tenantTotalCount: total || 0 };
  }

  public async describeObject(root: string, apiKey: string, signal?: AbortSignal) {
    if (!apiKey || /[\r\n]/.test(apiKey)) throw new Error('实体 API Key 无效');
    const args = ['describe', 'object', '--api-key', apiKey, '--md'];
    const command = `neo ${args.join(' ')}`;
    const markdown = await this.run(args, root, signal);
    const heading = markdown.match(/^# .*?\(([^()]+)\)$/m);
    const totalFields = Number(markdown.match(/^共 (\d+) 个字段$/m)?.[1]);
    if (heading?.[1] !== apiKey || !Number.isInteger(totalFields)) throw new Error('neo CLI 字段字典缺少有效实体标识或字段总数');
    const fields: Array<{ apiKey: string; label: string }> = [];
    const seen = new Set<string>();
    for (const line of markdown.split(/\r?\n/)) {
      const row = line.match(/^\|\s*(.*?)\s*\|\s*([^|]+?)\s*\|/);
      if (!row || /^(?:字段名称|---|:)/.test(row[1].trim())) continue;
      const fieldApiKey = row[2].trim();
      if (!fieldApiKey || seen.has(fieldApiKey)) continue;
      seen.add(fieldApiKey);
      fields.push({ apiKey: fieldApiKey, label: row[1].trim() });
    }
    if (fields.length !== totalFields) throw new Error(`neo CLI 字段字典不完整：声明 ${totalFields} 个，解析到 ${fields.length} 个`);
    return { command, apiKey, totalFields, fields, markdown };
  }
}
