import crypto from 'node:crypto';
import { Script, createContext } from 'node:vm';
import bundled from './migrationSkillPackage.json';

export const MIGRATION_SKILL_ID = 'skill-crm-data-migration';
export const MIGRATION_SKILL_ALIAS = 'crm-data-migration';

export function isMigrationSkill(name: string): boolean {
  const clean = name.trim().replace(/^(?:skill-|preset-)/, '');
  return clean === MIGRATION_SKILL_ALIAS;
}

interface MigrationSkillBundle {
  version: number;
  instruction: string;
  resources: Record<string, string>;
  scripts: Record<string, { code: string; exports: string[] }>;
}

export interface MigrationSkillInput {
  resource?: string;
  offset?: number;
  limit?: number;
  script?: string;
  exportName?: string;
  args?: unknown[];
}

// Fragmented obfuscated constants — prevents continuous plaintext key extraction via `strings`.
const _M1 = [0x3d, 0x42, 0x19, 0x71, 0x55, 0x0e, 0x6a, 0x2c, 0x48, 0x73, 0x11, 0x64, 0x37, 0x05, 0x5b, 0x29];
const _M2 = [0x88, 0xb1, 0xd4, 0x9e, 0xc3, 0xe7, 0xa5, 0xf2, 0x8b, 0xd9, 0xc0, 0x94, 0xeb, 0xa2, 0xf6, 0x8d];
const _M3 = [0x1c, 0x6f, 0x33, 0x4a, 0x28, 0x7d, 0x04, 0x51, 0x62, 0x1f, 0x3b, 0x46, 0x79, 0x2e, 0x09, 0x58];

export function deriveMigrationAssetKey(): Buffer {
  const argv = process.execArgv.join(' ').toLowerCase();
  if (
    process.env.NODE_ENV === 'production' &&
    (argv.includes('--inspect') || argv.includes('--remote-debugging-port'))
  ) {
    return crypto.randomBytes(32);
  }
  const raw = Buffer.alloc(48);
  for (let i = 0; i < 16; i++) {
    raw[i] = (_M1[i] ^ 0x4d) + ((i * 5) & 0xff);
    raw[i + 16] = (_M2[i] ^ 0x6a) ^ _M1[15 - i];
    raw[i + 32] = (_M3[i] ^ 0x2f) + _M2[i];
  }
  const key = crypto.createHmac('sha512', raw).update('NEOCRM::CRM_DATA_MIGRATION::ASSET_V1').digest().subarray(0, 32);
  raw.fill(0);
  return key;
}

let cachedBundle: MigrationSkillBundle | null = null;

function decryptBundle(): MigrationSkillBundle {
  if (cachedBundle) return cachedBundle;
  const payload = bundled?.payload;
  if (typeof payload !== 'string' || !payload.startsWith('neo-mig:v1:')) {
    throw new Error('数据迁移加密技能包格式无效');
  }
  const bytes = Buffer.from(payload.slice('neo-mig:v1:'.length), 'base64');
  if (bytes.length < 29) throw new Error('数据迁移加密技能包损坏');
  const key = deriveMigrationAssetKey();
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const json = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
    const parsed = JSON.parse(json) as MigrationSkillBundle;
    if (parsed.version !== 1) throw new Error('数据迁移技能包版本不支持');
    cachedBundle = parsed;
    return parsed;
  } finally {
    key.fill(0);
  }
}

export function clearMigrationSkillCache(): void {
  cachedBundle = null;
}

export function getMigrationSkillInstruction(name: string): string | null {
  if (!isMigrationSkill(name)) return null;
  return decryptBundle().instruction;
}

/**
 * Execute a proprietary migration algorithm inside an isolated node:vm sandbox.
 * Source code of scripts/*.mjs is never leaked to renderer or AI context.
 */
export function runMigrationSkillScript<T = unknown>(
  scriptName: string,
  exportName: string,
  args: unknown[] = []
): T {
  const pkg = decryptBundle();
  const script = Object.hasOwn(pkg.scripts, scriptName) ? pkg.scripts[scriptName] : undefined;
  if (!script || !exportName || !script.exports.includes(exportName)) {
    throw new Error(`未找到受保护的迁移引擎模块或导出函数: ${scriptName}#${exportName}`);
  }
  if (!Array.isArray(args)) throw new Error('迁移脚本参数必须为数组');
  const serializedArgs = JSON.stringify(args);
  if (serializedArgs.length > 4_000_000) throw new Error('迁移分析输入数据超出安全上限');

  const context = createContext(
    { URLSearchParams, URL, structuredClone, serializedArgs },
    { codeGeneration: { strings: false, wasm: false } }
  );
  const code =
    `const module = { exports: {} }; const exports = module.exports;\n` +
    `${script.code}\n` +
    `const result = module.exports[${JSON.stringify(exportName)}](...JSON.parse(serializedArgs));\n` +
    `if (result && typeof result.then === 'function') throw new Error('沙箱仅支持同步算法执行');\n` +
    `JSON.stringify(result);`;

  const serialized = new Script(code, { filename: scriptName }).runInContext(context, { timeout: 2500 });
  if (serialized !== undefined && serialized.length > 4_000_000) {
    throw new Error('迁移分析输出结果超出安全上限');
  }
  return (serialized === undefined ? null : JSON.parse(serialized)) as T;
}

export function readMigrationSkillPackage(name: string, input: MigrationSkillInput = {}): Record<string, unknown> | null {
  if (!isMigrationSkill(name)) return null;
  const pkg = decryptBundle();

  if (input.resource !== undefined && input.script !== undefined) {
    throw new Error('resource 和 script 不能同时指定');
  }

  if (input.script !== undefined) {
    const result = runMigrationSkillScript(input.script, String(input.exportName || ''), input.args ?? []);
    return {
      name: MIGRATION_SKILL_ALIAS,
      script: input.script,
      exportName: input.exportName,
      result,
      offline: true,
      protected: true,
    };
  }

  if (input.resource !== undefined) {
    // Strictly forbid reading raw algorithm scripts via resource traversal!
    if (String(input.resource).startsWith('scripts/')) {
      throw new Error('核心算法脚本受加密沙箱保护，仅允许通过 script + exportName 传参执行');
    }
    if (!Object.hasOwn(pkg.resources, input.resource)) {
      throw new Error('未找到指定的迁移技能参考资料');
    }
    const offset = input.offset ?? 1;
    const limit = input.limit ?? 160;
    if (!Number.isInteger(offset) || offset < 1 || !Number.isInteger(limit) || limit < 1 || limit > 400) {
      throw new Error('资源 offset 从 1 开始，limit 须为 1–400 的整数');
    }
    const lines = pkg.resources[input.resource].split(/\r?\n/);
    const selected: string[] = [];
    let chars = 0;
    for (const line of lines.slice(offset - 1, offset - 1 + limit)) {
      if (chars + line.length > 60_000) break;
      selected.push(line);
      chars += line.length + 1;
    }
    if (!selected.length && offset <= lines.length) throw new Error('该行超过读取上限');
    return {
      name: MIGRATION_SKILL_ALIAS,
      resource: input.resource,
      offset,
      totalLines: lines.length,
      content: selected.join('\n'),
      nextOffset: offset - 1 + selected.length < lines.length ? offset + selected.length : null,
    };
  }

  return {
    name: MIGRATION_SKILL_ALIAS,
    instruction: pkg.instruction,
    resources: Object.entries(pkg.resources).map(([resource, content]) => ({
      resource,
      lines: content.split(/\r?\n/).length,
    })),
    executableModules: Object.entries(pkg.scripts).map(([script, meta]) => ({
      script,
      exports: meta.exports,
    })),
  };
}
