/** Roles with device authorization; built-in skill protection is independent. */
export function requiresRoleLicense(presetId?: string): boolean {
  return presetId === 'autoflow-architect' || presetId === 'neobi-architect';
}

/** Only explicit approval flows bypass device authorization. */
export function requiresFlowLicense(procType?: unknown): boolean {
  return procType !== 2;
}
