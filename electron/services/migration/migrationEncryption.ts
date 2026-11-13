import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app, safeStorage } from 'electron';
import type { FieldMaskPattern } from '../../../shared/migrationTypes';

const ENVELOPE_PREFIX = 'mig-enc:v1:';
const KEK_FILE_NAME = 'neocrm_migration_kek.dat';

// Multi-fragment fallback key derivation if OS keychain is unavailable in headless/test hosts.
const _F1 = [0x61, 0x3b, 0x74, 0x19, 0x4c, 0x2f, 0x55, 0x08, 0x7e, 0x12, 0x39, 0x6a, 0x05, 0x44, 0x2b, 0x71];
const _F2 = [0x92, 0xc4, 0xa1, 0xd8, 0x87, 0xb3, 0xe9, 0xf0, 0x9c, 0xab, 0x82, 0xd5, 0xee, 0xc7, 0xa8, 0x9f];

function deriveHostFallbackSecret(purpose: string): Buffer {
  const argv = process.execArgv.join(' ').toLowerCase();
  if (
    process.env.NODE_ENV === 'production' &&
    (argv.includes('--inspect') || argv.includes('--remote-debugging-port'))
  ) {
    return crypto.randomBytes(32);
  }
  const seed = Buffer.alloc(32);
  for (let i = 0; i < 16; i++) {
    seed[i] = (_F1[i] ^ 0x3a) + ((i * 11) & 0xff);
    seed[i + 16] = (_F2[i] ^ 0x5c) ^ _F1[15 - i];
  }
  const derived = crypto.createHmac('sha512', seed).update(`NEOCRM_MIGRATION::${purpose}`).digest();
  seed.fill(0);
  return derived.subarray(0, 32);
}

export class MigrationEncryptionService {
  private cachedKek: Buffer | null = null;
  private cachedDeks = new Map<string, Buffer>();

  private getKekPath(): string {
    const userData = app?.getPath ? app.getPath('userData') : process.cwd();
    return path.join(userData, KEK_FILE_NAME);
  }

  /**
   * Encrypt sensitive credentials (e.g., MongoDB URI with username/password) using Electron safeStorage.
   */
  public encryptCredential(plaintext: string): string {
    if (!plaintext) return '';
    if (safeStorage?.isEncryptionAvailable?.()) {
      return `safe:v1:${safeStorage.encryptString(plaintext).toString('base64')}`;
    }
    const key = deriveHostFallbackSecret('cred-fallback');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    key.fill(0);
    return `local:v1:${Buffer.concat([iv, tag, enc]).toString('base64')}`;
  }

  public decryptCredential(ciphertext: string): string {
    if (!ciphertext) return '';
    if (ciphertext.startsWith('safe:v1:')) {
      if (!safeStorage?.isEncryptionAvailable?.()) {
        throw new Error('系统安全存储不可用，无法解密 MongoDB 凭据');
      }
      return safeStorage.decryptString(Buffer.from(ciphertext.slice('safe:v1:'.length), 'base64'));
    }
    if (ciphertext.startsWith('local:v1:')) {
      const raw = Buffer.from(ciphertext.slice('local:v1:'.length), 'base64');
      if (raw.length < 29) throw new Error('凭据密文不完整');
      const key = deriveHostFallbackSecret('cred-fallback');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      const dec = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
      key.fill(0);
      return dec;
    }
    return ciphertext;
  }

  /**
   * Mask MongoDB URI credentials for UI rendering & logs.
   */
  public maskMongoUri(uri: string): string {
    if (!uri) return '';
    return uri.replace(/(mongodb(?:\+srv)?:\/\/)([^:@/]+):([^@/]+)@/i, '$1$2:******@');
  }

  /**
   * Load or initialize the master Key Encryption Key (KEK) protected by safeStorage.
   */
  public getOrCreateKek(): Buffer {
    if (this.cachedKek) return this.cachedKek;
    const kekPath = this.getKekPath();
    if (fs.existsSync(kekPath)) {
      try {
        const stored = fs.readFileSync(kekPath, 'utf8').trim();
        const hex = this.decryptCredential(stored);
        const buf = Buffer.from(hex, 'hex');
        if (buf.length === 32) {
          this.cachedKek = buf;
          return buf;
        }
      } catch {
        // Fall through to re-generate if corrupted
      }
    }
    const fresh = crypto.randomBytes(32);
    const wrapped = this.encryptCredential(fresh.toString('hex'));
    fs.mkdirSync(path.dirname(kekPath), { recursive: true });
    fs.writeFileSync(kekPath, wrapped, { encoding: 'utf8', mode: 0o600 });
    this.cachedKek = fresh;
    return fresh;
  }

  /**
   * Derive or unwrap a 256-bit Data Encryption Key (DEK) for a given migration project/task.
   * Kept in memory for hardware-accelerated AES-NI field encryption across 100M+ rows.
   */
  public getOrCreateProjectDek(projectId: string, wrappedDek?: string): { dek: Buffer; wrappedDek: string } {
    const cached = this.cachedDeks.get(projectId);
    if (cached && wrappedDek) {
      return { dek: cached, wrappedDek };
    }
    const kek = this.getOrCreateKek();
    if (wrappedDek && wrappedDek.startsWith('dek:v1:')) {
      const raw = Buffer.from(wrappedDek.slice('dek:v1:'.length), 'base64');
      const decipher = crypto.createDecipheriv('aes-256-gcm', kek, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      const dek = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
      this.cachedDeks.set(projectId, dek);
      return { dek, wrappedDek };
    }
    const dek = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);
    const enc = Buffer.concat([cipher.update(dek), cipher.final()]);
    const newWrapped = 'dek:v1:' + Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
    this.cachedDeks.set(projectId, dek);
    return { dek, wrappedDek: newWrapped };
  }

  /**
   * High-speed AES-256-GCM envelope encryption for sensitive fields stored in MongoDB staging.
   */
  public encryptFieldValue(value: unknown, dek: Buffer): string {
    if (value === null || value === undefined) return '';
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (text.startsWith(ENVELOPE_PREFIX)) return text;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
    const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return ENVELOPE_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
  }

  public decryptFieldValue(payload: unknown, dek: Buffer): unknown {
    if (typeof payload !== 'string' || !payload.startsWith(ENVELOPE_PREFIX)) return payload;
    const raw = Buffer.from(payload.slice(ENVELOPE_PREFIX.length), 'base64');
    if (raw.length < 29) throw new Error('暂存字段密文损坏');
    const decipher = crypto.createDecipheriv('aes-256-gcm', dek, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    try {
      if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
        return JSON.parse(text);
      }
    } catch {
      // Return raw string
    }
    return text;
  }

  /**
   * Data masking algorithms for sandbox/training migrations and zero-plaintext audit logging.
   */
  public applyMask(value: unknown, pattern: FieldMaskPattern): string {
    if (value === null || value === undefined) return '';
    const str = String(value).trim();
    if (!str || pattern === 'none') return str;
    if (pattern === 'phone') {
      const digits = str.replace(/^\+86/, '').replace(/\s+/g, '');
      if (digits.length >= 7) {
        return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
      }
      return '***';
    }
    if (pattern === 'name') {
      if (str.length <= 1) return '*';
      if (str.length === 2) return `${str[0]}*`;
      return `${str[0]}${'*'.repeat(Math.min(4, str.length - 2))}${str[str.length - 1]}`;
    }
    if (pattern === 'idcard') {
      if (str.length >= 10) return `${str.slice(0, 4)}**********${str.slice(-4)}`;
      return '****';
    }
    if (pattern === 'email') {
      const idx = str.indexOf('@');
      if (idx <= 1) return `***${idx >= 0 ? str.slice(idx) : ''}`;
      return `${str.slice(0, 2)}***${str.slice(idx)}`;
    }
    if (pattern === 'hash') {
      return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
    }
    return str;
  }

  public maskLogText(text: string): string {
    if (!text) return '';
    return text
      .replace(/(mongodb(?:\+srv)?:\/\/)([^:@/\s]+):([^@/\s]+)@/gi, '$1$2:******@')
      .replace(/\b1[3-9]\d{9}\b/g, (m) => `${m.slice(0, 3)}****${m.slice(-4)}`)
      .replace(/\b\d{15,18}[0-9Xx]?\b/g, (m) => (m.length >= 15 ? `${m.slice(0, 4)}**********${m.slice(-4)}` : m));
  }

  public clearMemoryKeys(): void {
    this.cachedKek?.fill(0);
    this.cachedKek = null;
    for (const dek of this.cachedDeks.values()) dek.fill(0);
    this.cachedDeks.clear();
  }
}

export const migrationEncryption = new MigrationEncryptionService();
