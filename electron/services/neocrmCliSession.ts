import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULT_AUTH_CONFIG } from '../../shared/constants';
import { NeoEnvironment, SessionState, TokenData } from '../../shared/types';

interface CliProject {
  root: string;
  projectId: string;
}

export interface NeoCliAuth {
  env: 'production' | 'sandbox' | 'custom';
  instanceUrl: string;
  tokenUrl: string;
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt: number;
  tenantId?: string | number;
  userInfo?: {
    id?: string | number;
    name?: string;
    email?: string;
    tenantId?: string | number;
    tenantName?: string;
  };
  savedAt: number;
}

function readProject(root: string): CliProject | null {
  const manifestPath = path.join(root, 'neo-project.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return typeof manifest.projectId === 'string' && /^[A-Za-z0-9_-]+$/.test(manifest.projectId)
      ? { root, projectId: manifest.projectId }
      : null;
  } catch {
    return null;
  }
}

export function ensureNeoCliProject(rootPath: string, preferredProjectId?: string): CliProject {
  const root = path.resolve(rootPath);
  if (root === path.parse(root).root) throw new Error('不能将文件系统根目录注册为 neocrm-cli 项目');
  if (!fs.statSync(root).isDirectory()) throw new Error(`不是有效的项目目录: ${root}`);
  const manifestPath = path.join(root, 'neo-project.json');
  let existing: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) existing = parsed;
  } catch {}

  const projectId = typeof existing.projectId === 'string' && /^[A-Za-z0-9_-]+$/.test(existing.projectId)
    ? existing.projectId
    : preferredProjectId && /^[A-Za-z0-9_-]+$/.test(preferredProjectId) ? preferredProjectId : randomUUID();
  const manifest = {
    name: path.basename(root),
    projectId,
    sourceDir: 'neocrm-src',
    cli: 'neocrm-cli',
    cliVersion: '1.0.8',
  };
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  let current = '';
  try { current = fs.readFileSync(manifestPath, 'utf8'); } catch {}
  if (current !== serialized) {
    const temporaryPath = `${manifestPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporaryPath, serialized, { encoding: 'utf8', mode: 0o644, flag: 'wx' });
      fs.renameSync(temporaryPath, manifestPath);
    } finally {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    }
  }
  fs.mkdirSync(path.join(root, manifest.sourceDir), { recursive: true });
  const project = readProject(root);
  if (!project) throw new Error(`无法读取 CLI 项目清单: ${manifestPath}`);
  return project;
}

function authFile(projectId: string): string {
  return path.join(os.homedir(), '.neocrm-cli', 'auth', `${projectId}.json`);
}

export function getNeoCliAuthLocation(rootPath: string): { directory: string; file: string } | null {
  const project = readProject(path.resolve(rootPath));
  if (!project) return null;
  const file = authFile(project.projectId);
  return { directory: path.dirname(file), file };
}

export function readNeoCliAuth(rootPath: string): NeoCliAuth | null {
  const project = readProject(path.resolve(rootPath));
  if (!project) return null;
  try {
    const file = authFile(project.projectId);
    if (!fs.existsSync(file)) return null;
    const auth = JSON.parse(fs.readFileSync(file, 'utf8'));
    return auth && typeof auth.accessToken === 'string' && auth.accessToken &&
      typeof auth.instanceUrl === 'string' && typeof auth.tokenUrl === 'string' &&
      typeof auth.expiresAt === 'number' ? auth as NeoCliAuth : null;
  } catch {
    return null;
  }
}

export function deleteNeoCliAuth(rootPath: string): boolean {
  const project = readProject(path.resolve(rootPath));
  if (!project) return false;
  const file = authFile(project.projectId);
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}

export function writeNeoCliAuth(rootPath: string, auth: NeoCliAuth): string {
  const project = ensureNeoCliProject(rootPath);
  const directory = path.dirname(authFile(project.projectId));
  const file = authFile(project.projectId);
  const temporaryFile = `${file}.${process.pid}.${randomUUID()}.tmp`;
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(path.dirname(directory), 0o700);
  fs.chmodSync(directory, 0o700);
  try {
    fs.writeFileSync(temporaryFile, JSON.stringify(auth, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.renameSync(temporaryFile, file);
    fs.chmodSync(file, 0o600);
  } catch (error) {
    try { if (fs.existsSync(temporaryFile)) fs.unlinkSync(temporaryFile); } catch {}
    throw error;
  }
  return file;
}

function toCliAuth(env: NeoEnvironment, tokenData: TokenData): NeoCliAuth {
  const now = Date.now();
  const instanceUrl = tokenData.instance_uri || env.neoBaseURL;
  const tokenUrl = env.tokenURL;
  if (!instanceUrl || !tokenUrl || !tokenData.access_token || !tokenData.refresh_token) {
    throw new Error('缺少实例地址、访问令牌或可续期 refresh token，无法共享登录');
  }
  if ((env.clientId && env.clientId !== DEFAULT_AUTH_CONFIG.clientId) ||
      (env.clientSecret && env.clientSecret !== DEFAULT_AUTH_CONFIG.clientSecret)) {
    throw new Error('当前连接器使用自定义 OAuth 应用，无法与 neocrm-cli 内置应用共享登录');
  }
  return {
    env: env.envType === 'production' || env.envType === 'sandbox' ? env.envType : 'custom',
    instanceUrl: new URL(instanceUrl).origin,
    tokenUrl,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    tokenType: 'Bearer',
    expiresAt: tokenData.expiresAt || now + (tokenData.expires_in || 7200) * 1000,
    tenantId: tokenData.tenant_id,
    userInfo: tokenData.userInfo ? {
      id: tokenData.userInfo.userId,
      name: tokenData.userInfo.name,
      email: tokenData.userInfo.email,
      tenantId: tokenData.userInfo.tenant_id || tokenData.userInfo.tenantId,
      tenantName: tokenData.userInfo.tenantName,
    } : undefined,
    savedAt: now,
  };
}

export function syncSessionToNeoCli(rootPath: string, env: NeoEnvironment, tokenData: TokenData): string {
  return writeNeoCliAuth(rootPath, toCliAuth(env, tokenData));
}

export function toDesktopSession(auth: NeoCliAuth): SessionState {
  const environment: NeoEnvironment = {
    id: auth.env,
    name: auth.userInfo?.tenantName || `销售易 - ${auth.env}`,
    productType: 'neocrm',
    envType: auth.env,
    isPreset: auth.env !== 'custom',
    neoBaseURL: auth.instanceUrl,
    loginURL: auth.tokenUrl.replace(/\/token(?:\?.*)?$/, '/auth'),
    tokenURL: auth.tokenUrl,
    ...DEFAULT_AUTH_CONFIG,
  };
  const now = Date.now();
  const tokenData: TokenData = {
    access_token: auth.accessToken,
    refresh_token: auth.refreshToken,
    expires_in: Math.max(0, Math.floor((auth.expiresAt - now) / 1000)),
    instance_uri: auth.instanceUrl,
    tenant_id: auth.tenantId,
    userInfo: auth.userInfo ? {
      userId: auth.userInfo.id,
      name: auth.userInfo.name,
      email: auth.userInfo.email,
      tenant_id: auth.userInfo.tenantId,
      tenantName: auth.userInfo.tenantName,
    } : undefined,
    savedAt: auth.savedAt,
    expiresAt: auth.expiresAt,
  };
  return {
    isLoggedIn: true,
    environment,
    tokenData,
    activeAccountId: `${environment.id}_${auth.tenantId || 'unknown'}_${auth.userInfo?.id || 'u'}`,
  };
}
