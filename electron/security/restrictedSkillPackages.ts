import { Script, createContext } from 'node:vm';
import assets from './restrictedSkillPackages.json';
import { decryptBuiltinSkillAsset } from './protectedSkillAssets';
import { restrictedFeatureService } from './restrictedFeatureService';
import { normalizeBuiltinSkillId, RESTRICTED_PACKAGE_SKILL_IDS } from '../../shared/restrictedFeatures';

interface SkillPackage {
  version: number;
  instruction: string;
  resources: Record<string, string>;
  scripts: Record<string, { code: string; exports: string[] }>;
}

export interface PackagedSkillInput {
  resource?: string;
  offset?: number;
  limit?: number;
  script?: string;
  exportName?: string;
  args?: unknown[];
}

const cache = new Map<string, SkillPackage>();
restrictedFeatureService.onChange(status => { if (!status.visible) cache.clear(); });

export function isRestrictedSkillPackage(id: string): boolean {
  return RESTRICTED_PACKAGE_SKILL_IDS.some(name => name === normalizeBuiltinSkillId(id));
}

function getPackage(id: string): SkillPackage | null {
  if (!isRestrictedSkillPackage(id) || !restrictedFeatureService.canUseSkill(id)) return null;
  const name = normalizeBuiltinSkillId(id);
  let result = cache.get(name);
  if (!result) {
    result = JSON.parse(decryptBuiltinSkillAsset(assets[name as keyof typeof assets], false)) as SkillPackage;
    if (result.version !== 1) throw new Error('内置技能包版本无效');
    cache.set(name, result);
  }
  return result;
}

export function getRestrictedPackageInstruction(id: string): string | null {
  return getPackage(id)?.instruction || null;
}

export function getRestrictedSkillDiscovery(skills: { id: string; description: string; enabled: boolean }[]): string {
  if (!restrictedFeatureService.getStatus().visible) return '';
  return skills.filter(skill => skill.enabled && isRestrictedSkillPackage(skill.id))
    .map(skill => `- ${normalizeBuiltinSkillId(skill.id)}: ${skill.description}`).join('\n');
}

/** Resources stay in main-process memory; every access, including cached data, rechecks disclosure. */
export function readRestrictedSkillPackage(id: string, input: PackagedSkillInput = {}): Record<string, unknown> | null {
  const pkg = getPackage(id);
  if (!pkg) return null;
  if (input.resource !== undefined && input.script !== undefined) throw new Error('resource 和 script 不能同时指定');
  if (input.script !== undefined) {
    const script = Object.hasOwn(pkg.scripts, input.script) ? pkg.scripts[input.script] : undefined;
    if (!script || !input.exportName || !script.exports.includes(input.exportName)) throw new Error('未找到指定的内置脚本或导出函数');
    const args = input.args ?? [];
    if (!Array.isArray(args)) throw new Error('脚本 args 必须为参数数组');
    const serializedArgs = JSON.stringify(args);
    if (serializedArgs.length > 2_000_000) throw new Error('脚本参数过大');
    // Reviewed, bundled request builders only. No filesystem, network, require or host credentials.
    // Parse arguments inside the context so plain-object checks use that context's prototypes.
    const context = createContext({ URLSearchParams, URL, structuredClone, serializedArgs }, { codeGeneration: { strings: false, wasm: false } });
    const code = `const module = { exports: {} }; const exports = module.exports;\n${script.code}\n` +
      `const result = module.exports[${JSON.stringify(input.exportName)}](...JSON.parse(serializedArgs));\n` +
      `if (result && typeof result.then === 'function') throw new Error('仅支持同步离线构造和校验函数');\nJSON.stringify(result);`;
    const serialized = new Script(code, { filename: input.script }).runInContext(context, { timeout: 1000 });
    if (serialized !== undefined && serialized.length > 2_000_000) throw new Error('脚本结果过大');
    if (!restrictedFeatureService.canUseSkill(id)) throw new Error('当前功能已上锁');
    return { name: normalizeBuiltinSkillId(id), script: input.script, exportName: input.exportName,
      result: serialized === undefined ? null : JSON.parse(serialized), offline: true };
  }
  if (input.resource !== undefined) {
    if (!Object.hasOwn(pkg.resources, input.resource)) throw new Error('未找到指定的技能资源');
    const offset = input.offset ?? 1, limit = input.limit ?? 160;
    if (!Number.isInteger(offset) || offset < 1 || !Number.isInteger(limit) || limit < 1 || limit > 400) {
      throw new Error('资源 offset 从 1 开始，limit 须为 1–400 的整数');
    }
    const lines = pkg.resources[input.resource].split(/\r?\n/);
    // Large one-line JSON is bounded too; never silently truncate a contract.
    const selected: string[] = [];
    let chars = 0;
    for (const line of lines.slice(offset - 1, offset - 1 + limit)) {
      if (chars + line.length > 60_000) break;
      selected.push(line); chars += line.length + 1;
    }
    if (!selected.length && offset <= lines.length) throw new Error('该行超过读取上限，请使用对应 Markdown 合同');
    return { name: normalizeBuiltinSkillId(id), resource: input.resource, offset, totalLines: lines.length,
      content: selected.join('\n'), nextOffset: offset - 1 + selected.length < lines.length ? offset + selected.length : null,
      ...(pkg.scripts[input.resource] ? { exports: pkg.scripts[input.resource].exports } : {}) };
  }
  return { name: normalizeBuiltinSkillId(id), instruction: pkg.instruction,
    resources: Object.entries(pkg.resources).map(([resource, content]) => ({ resource, lines: content.split(/\r?\n/).length })) };
}
