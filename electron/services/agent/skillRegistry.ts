import type { AiSkillItem } from '../../../shared/types';
import { BUILTIN_AI_SKILLS } from '../../../shared/constants';
import { requiresRoleLicense } from '../../../shared/licensePolicy';
import { isDiagramDesignSkill, readDiagramDesignSkill } from '../../security/diagramDesignSkill';
import { DOCUMENT_SKILL_ID, getDocumentReadingSkill } from '../../security/documentTools';
import { isPageCodeSkill, readPageCodeSkill } from '../../security/pageCodeSkill';
import { getProtectedSkillInstruction, isProtectedBuiltinSkill } from '../../security/protectedHarness';
import { readRestrictedSkillPackage } from '../../security/restrictedSkillPackages';
import { restrictedFeatureService } from '../../security/restrictedFeatureService';

export interface SkillLoadInput {
  name: string;
  resource?: string;
  offset?: number;
  limit?: number;
  script?: string;
  exportName?: string;
  args?: unknown[];
}

export interface SkillLoadResult {
  id: string;
  name: string;
  description: string;
  category: AiSkillItem['category'];
  data: Record<string, unknown>;
  summary: string;
}

const alias = (value: string) => value.trim().replace(/^skill-/, '');
const xml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);

export interface SkillContextMessage { role: string; name?: string; content?: unknown }

/** Inspect retained content, not a permanent "loaded" flag: pruning must allow reloading. */
export function skillResultForContext(loaded: SkillLoadResult, messages: SkillContextMessage[]): SkillLoadResult {
  const instruction = loaded.data.instruction;
  if (typeof instruction !== 'string' || !instruction.trim()) return loaded;
  const present = messages.some(message => {
    if (typeof message.content !== 'string') return false;
    if (message.role === 'system') return message.content.includes(instruction);
    if (message.role !== 'tool' || message.name !== 'skill') return false;
    try {
      const data = JSON.parse(message.content);
      return data?.name === loaded.data.name && data.instruction === instruction;
    } catch { return false; }
  });
  if (!present) return loaded;
  const { instruction: _instruction, ...data } = loaded.data;
  return { ...loaded, data: { ...data, instructionAlreadyLoaded: true,
    message: '该版本技能正文仍在当前上下文中，请遵循已加载规范；可继续按需读取资源。' }, summary: `技能 ${loaded.name} 已在当前上下文中，已省略重复正文` };
}

export function appendSkillInstruction(parts: string[], loaded: SkillLoadResult, heading: string) {
  const instruction = loaded.data.instruction;
  if (typeof instruction !== 'string' || !instruction.trim()) throw new Error(`技能 ${loaded.name} 无法加载，请检查技能设置。`);
  const resources = Array.isArray(loaded.data.resources) ? loaded.data.resources
    .map((resource: { resource?: unknown }) => resource.resource).filter((name: unknown) => typeof name === 'string') : [];
  if (!parts.some(part => part.includes(instruction))) parts.push(`${heading}\n${instruction}`);
  const discovery = resources.length ? `技能 ${loaded.id} 可通过 skill 工具按需读取的资源：${resources.join('、')}` : '';
  if (discovery && !parts.includes(discovery)) parts.push(discovery);
}

export class AgentSkillRegistry {
  private merged(configured: AiSkillItem[]) {
    const overrides = new Map(configured.map(skill => [skill.id, skill]));
    const result: AiSkillItem[] = BUILTIN_AI_SKILLS.map(skill => ({ ...skill,
      enabled: overrides.get(skill.id)?.enabled ?? skill.enabled, category: 'builtin' as const }));
    for (const skill of configured) if (skill.category === 'personal' && !isProtectedBuiltinSkill(skill.id)) result.push(skill);
    return result;
  }

  public list(configured: AiSkillItem[], options: { authorized?: boolean } = {}) {
    return this.merged(configured).filter(skill => skill.enabled && restrictedFeatureService.canUseSkill(skill.id)
      && (!requiresRoleLicense(alias(skill.id)) || options.authorized));
  }

  public renderCatalog(configured: AiSkillItem[], options: { authorized?: boolean } = {}): string {
    const entries = this.list(configured, options).map(skill =>
      `  <skill>\n    <id>${xml(alias(skill.id))}</id>\n    <name>${xml(skill.name)}</name>\n    <description>${xml(skill.description)}</description>\n  </skill>`);
    return [
      'Skills provide specialized instructions and workflows. Load a skill only when the task matches its description.',
      '<available_skills>', ...entries, '</available_skills>',
      'Use skill({ name: "<id>" }) to load its instructions. A skill explicitly referenced by the user is already loaded for that turn.',
    ].join('\n');
  }

  public resolve(configured: AiSkillItem[], value: string): AiSkillItem | undefined {
    const key = alias(value);
    const found = this.merged(configured).find(skill => skill.id === value || skill.name === value || alias(skill.id) === key);
    if (found) return found;
    const id = value.startsWith('skill-') ? value : `skill-${value}`;
    if (getProtectedSkillInstruction(id)) return {
      id, name: key, description: `${key} 专业执行规范`, category: 'builtin',
      enabled: configured.find(skill => alias(skill.id) === alias(id))?.enabled !== false,
    };
  }

  public load(configured: AiSkillItem[], input: SkillLoadInput, options: { authorized?: boolean } = {}): SkillLoadResult {
    if (typeof input?.name !== 'string' || !input.name.trim()) throw new Error('缺少技能名称');
    const selected = this.resolve(configured, input.name);
    if (!selected || !selected.enabled) throw new Error(`未找到名为 "${input.name}" 的技能规范，或该技能已停用`);
    if (!restrictedFeatureService.canUseSkill(selected.id)) throw new Error(`未找到名为 "${input.name}" 的技能规范`);
    if (requiresRoleLicense(alias(selected.id)) && !options.authorized) {
      throw new Error(`技能 ${selected.name} 需要先完成设备授权。`);
    }
    const resolved = selected.id;
    let data: Record<string, unknown> | null = null;
    let summary = '';
    if (isPageCodeSkill(resolved)) {
      data = readPageCodeSkill(resolved, input);
      summary = input.resource ? '已读取页面代码管理参考资料' : '已加载页面代码管理技能';
    } else if (isDiagramDesignSkill(resolved)) {
      data = readDiagramDesignSkill(resolved, input);
      summary = input.resource ? '已读取 Diagram Design 图表参考资料' : '已加载 Diagram Design 图表设计技能及资源目录';
    } else {
      data = readRestrictedSkillPackage(resolved, input);
      if (data) summary = input.script ? '已完成内置技能离线构造或校验'
        : input.resource ? '已按需读取内置技能参考资料' : `已加载内置技能 [${alias(resolved)}] 及资源目录`;
    }
    if (!data && (input.resource !== undefined || input.script !== undefined)) throw new Error('该技能没有可读取的配套资源');
    if (!data) {
      const instruction = resolved === DOCUMENT_SKILL_ID ? getDocumentReadingSkill(resolved)
        : selected.category === 'personal' ? selected.systemInstruction : getProtectedSkillInstruction(resolved);
      if (!instruction?.trim()) throw new Error(`技能 ${selected.name} 没有可加载的内容，请先在技能设置中完善。`);
      data = { name: alias(resolved), description: selected.description, instruction };
      summary = `成功按需加载技能 [${alias(resolved)}] 的专业执行规范`;
    }
    return { id: resolved, name: selected.name, description: selected.description, category: selected.category, data, summary };
  }

  public isEnabled(configured: AiSkillItem[], id: string): boolean {
    return this.resolve(configured, id)?.enabled === true;
  }
}

export const agentSkillRegistry = new AgentSkillRegistry();
