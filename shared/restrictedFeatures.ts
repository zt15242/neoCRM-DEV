export interface RestrictedFeatureStatus {
  visible: boolean;
  expiresAt?: number;
}

export type AccessCommand = 'unlock' | 'lock' | 'status' | 'invalid';

export const RESTRICTED_PACKAGE_SKILL_IDS = ['manage-neocrm-permissions', 'configure-neocrm-mobile'] as const;

export function normalizeBuiltinSkillId(id: string): string {
  return id.replace(/^(?:preset-|skill-)/, '');
}

export function isRestrictedRole(id?: string): boolean {
  return id === 'neobi-architect' || id === 'autoflow-architect';
}

export function isRestrictedSkill(id?: string): boolean {
  if (!id) return false;
  const normalized = normalizeBuiltinSkillId(id);
  return isRestrictedRole(normalized) || RESTRICTED_PACKAGE_SKILL_IDS.some(skill => skill === normalized);
}

// Deliberately absent from slash completion, help, settings and model prompts.
// Consume malformed invocations too, so an inline key never reaches a shell or model.
export function parseAccessCommand(input: string): AccessCommand | null {
  const value = input.trim();
  if (!/^\/?neo-access(?:\s|$)/.test(value)) return null;
  const match = value.match(/^\/?neo-access[ \t]+(unlock|lock|status)$/);
  return match ? match[1] as AccessCommand : 'invalid';
}
