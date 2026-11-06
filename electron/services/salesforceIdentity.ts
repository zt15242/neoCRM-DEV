import type { TokenData, UserInfo } from '../types';

// Keep the case-sensitive portion so IDs returned in either length compare equally.
export function normalizeSalesforceId(value: unknown): string {
  const id = String(value ?? '').trim();
  return /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/.test(id) ? id.slice(0, 15) : id;
}

export function getSalesforceUsername(info?: UserInfo): string | undefined {
  if (info?.username?.trim()) return info.username.trim();
  // Older OAuth sessions stored only “display name (username)”. Email isn't a login identity.
  const name = info?.name?.trim() || '';
  return name.match(/\(([^\s()]+@[^\s()]+)\)$/)?.[1] ||
    (/^[^\s()]+@[^\s()]+$/.test(name) ? name : undefined);
}

export function getSalesforceUserId(info?: UserInfo): string | undefined {
  const id = String(info?.userId ?? '').trim();
  return /^005[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?$/.test(id) ? id : undefined;
}

type AccountIdentity = Pick<TokenData, 'tenant_id' | 'userInfo'>;

export function isSameSalesforceAccount(left: AccountIdentity, right: AccountIdentity): boolean {
  const org = normalizeSalesforceId(left.tenant_id ?? left.userInfo?.tenant_id);
  const otherOrg = normalizeSalesforceId(right.tenant_id ?? right.userInfo?.tenant_id);
  if (!org || org === 'salesforce_org' || org !== otherOrg) return false;
  const userId = getSalesforceUserId(left.userInfo);
  const otherId = getSalesforceUserId(right.userInfo);
  if (userId && otherId) return normalizeSalesforceId(userId) === normalizeSalesforceId(otherId);
  const username = getSalesforceUsername(left.userInfo);
  const otherUsername = getSalesforceUsername(right.userInfo);
  return !!(username && otherUsername && username.toLowerCase() === otherUsername.toLowerCase());
}

export function mergeSalesforceUserInfo(primary: UserInfo = {}, fallback: UserInfo = {}): UserInfo {
  const name = primary.name;
  const fallbackName = fallback.name;
  const genericName = !name || name === 'Salesforce 用户' || name.startsWith('Salesforce 客户端应用 (');
  const richerName = fallbackName && getSalesforceUsername(primary) === name &&
    fallbackName !== getSalesforceUsername(fallback);
  const genericTenant = !primary.tenantName || /^Salesforce(?: 组织)? \(/.test(primary.tenantName);
  return {
    ...fallback,
    ...primary,
    userId: getSalesforceUserId(primary) || getSalesforceUserId(fallback),
    username: getSalesforceUsername(primary) || getSalesforceUsername(fallback),
    name: (genericName || richerName ? fallbackName : name) || name,
    tenantName: genericTenant ? fallback.tenantName || primary.tenantName : primary.tenantName,
  };
}

/** CLI org display's id is an org ID; only userId/identity URLs identify a user. */
export function salesforceUserInfoFromAuth(data: Record<string, any>, current?: UserInfo): UserInfo {
  let identityOrg: string | undefined;
  let identityUser: string | undefined;
  try {
    const parts = new URL(data.id).pathname.split('/').filter(Boolean);
    if (parts[0] === 'id') [identityOrg, identityUser] = parts.slice(1);
  } catch {}
  const orgId = data.orgId || data.organization_id || identityOrg ||
    (/^00D/.test(data.id || '') ? data.id : undefined) || 'salesforce_org';
  const username = data.username || data.preferred_username;
  const info: UserInfo = {
    userId: data.userId || data.user_id || identityUser,
    username,
    name: data.display_name || data.name || username || 'Salesforce 用户',
    tenant_id: orgId,
    tenantName: `Salesforce 组织 (${orgId})`,
    ...(data.email ? { email: data.email } : {}),
  };
  info.userId = getSalesforceUserId(info);
  if (current && isSameSalesforceAccount({ tenant_id: orgId, userInfo: info },
    { tenant_id: current.tenant_id, userInfo: current })) {
    return mergeSalesforceUserInfo(info, current);
  }
  return info;
}
