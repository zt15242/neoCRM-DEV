import crypto from 'crypto';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { WorkflowLicenseStatus, WorkflowLicenseActivateResult } from '../../shared/types';

/**
 * ============================================================================
 * NeoCRM 自动流程 (Automatic Flow) 本地离线设备绑定锁与防逆向安全引擎 (V2)
 * ----------------------------------------------------------------------------
 * 核心特性:
 * 1. 纯本地离线生成与解密，无需向客户索要机器码，无任何线上管控请求；
 * 2. 输入后程序自动解密并计算剩余有效天数；
 * 3. 一码一机 + 强制绑定设备:
 *    - 首次输入密码时，自动采集本机主板硬件 UUID + 系统刷机分区卷 UUID 进行强绑定；
 *    - 密码一经输入激活即标记为“已消耗绑定 (Consumed)”，禁止二次重复输入激活；
 *    - 内置首次设备绑定时效锁与硬件环境核验，设备刷机/重装系统或更换设备后再输入旧密码均无法使用，必须生成新密码；
 * 4. 防逆向与防暴力破解:
 *    - 多分片动态密钥重组 + scrypt 内存硬化 (N=16384) + AES-256-GCM 认证加密 + HMAC-SHA256 签名；
 *    - 连续输错阶梯式冷却锁定 + 三路加密镜像防删 + 单调递增时钟防回拨。
 * ============================================================================
 */

// 分片混淆常量（避免在二进制/源码中出现连续明文主密钥字符串，防止 strings 静态逆向提取）
const _S1 = [0x2a, 0x1b, 0x33, 0x1d, 0x05, 0x27, 0x19, 0x37, 0x17, 0x3b, 0x2d, 0x0f, 0x3c, 0x1f, 0x39, 0x0d];
const _S2 = [0x4c, 0x7e, 0x52, 0x68, 0x44, 0x75, 0x5c, 0x62, 0x41, 0x77, 0x59, 0x6e, 0x48, 0x71, 0x55, 0x6b];
const _S3 = [0x91, 0xa4, 0x87, 0xb2, 0x9c, 0xaf, 0x83, 0xbd, 0x95, 0xa8, 0x8e, 0xb6, 0x99, 0xa1, 0x8b, 0xba];
const _S4 = [0xd3, 0xe6, 0xc5, 0xf0, 0xde, 0xed, 0xc1, 0xff, 0xd7, 0xea, 0xcc, 0xf4, 0xdb, 0xe3, 0xc9, 0xf8];
const _P_BYTES = [0x22, 0x33, 0x3b, 0x35, 0x2d, 0x2f, 0x31, 0x3f, 0x30, 0x33];

function _getSecretPrefix(): string {
  return _P_BYTES.map((b) => String.fromCharCode(b ^ 0x5a)).join('');
}

const FIRST_DEVICE_BIND_WINDOW_MS = 6 * 60 * 60 * 1000;

/**
 * 运行时动态派生主密钥，用完即刻擦除临时 Buffer
 */
function deriveMasterSecret(purpose: string): Buffer {
  const argv = process.execArgv.join(' ').toLowerCase();
  if (
    process.env.NODE_ENV === 'production' &&
    (argv.includes('--inspect') || argv.includes('--remote-debugging-port'))
  ) {
    return crypto.randomBytes(32);
  }

  const raw = Buffer.alloc(64);
  for (let i = 0; i < 16; i++) {
    raw[i] = (_S1[i] ^ 0x5a) + ((i * 7) & 0xff);
    raw[i + 16] = (_S2[i] ^ 0x3c) ^ _S1[15 - i];
    raw[i + 32] = (_S3[i] ^ 0xa5) + _S2[i];
    raw[i + 48] = (_S4[i] ^ 0x69) ^ _S3[15 - i];
  }
  const digest = crypto
    .createHmac('sha512', raw)
    .update(`${_getSecretPrefix().toUpperCase()}::NEOCRM_AUTOFLOW_LOCK_V2::${purpose}`)
    .digest();
  raw.fill(0);
  return digest.subarray(0, 32);
}

interface SecurityVaultData {
  activeLicenseCode?: string;
  boundDeviceHash?: string;
  boundRandomId?: string;
  activatedAt?: number;
  failedAttempts: number;
  lockUntil: number;
  lastAttemptAt: number;
  maxSeenTimestamp: number;
  consumedRandomIds: string[];
}

export class LicenseService {
  private cachedDeviceHash: string | null = null;
  private cachedMachineDisplayId: string | null = null;
  private vaultPaths: string[];

  constructor() {
    const home = os.homedir();
    const tmp = os.tmpdir();
    const dir1 = path.join(home, '.neocrm');
    const dir2 = path.join(home, '.config', '.neocrm_core');
    const dir3 = path.join(tmp, '.xwkj_sys_cache');

    for (const d of [dir1, dir2, dir3]) {
      if (!fs.existsSync(d)) {
        try {
          fs.mkdirSync(d, { recursive: true });
        } catch {}
      }
    }

    this.vaultPaths = [
      path.join(dir1, 'workflow_security_vault_v2.dat'),
      path.join(dir2, '.wf_sec_anchor_v2.dat'),
      path.join(dir3, '.xwkj_hw_lock.dat'),
    ];
  }

  public getDeviceFingerprintHash(): string {
    if (this.cachedDeviceHash) {
      return this.cachedDeviceHash;
    }

    const platform = process.platform;
    const arch = os.arch();
    const cpuModel = os.cpus()?.[0]?.model?.trim() || 'generic-cpu';

    let hwUuid = '';
    let serialNum = '';
    let volumeOrOsInstallId = '';

    try {
      if (platform === 'darwin') {
        const ioregOut = execSync('ioreg -rd1 -c IOPlatformExpertDevice', {
          encoding: 'utf8',
          timeout: 3000,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        const uuidMatch = ioregOut.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
        const serialMatch = ioregOut.match(/"IOPlatformSerialNumber"\s*=\s*"([^"]+)"/);
        hwUuid = uuidMatch?.[1]?.trim() || '';
        serialNum = serialMatch?.[1]?.trim() || '';

        const diskOut = execSync('diskutil info /', {
          encoding: 'utf8',
          timeout: 3000,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        const volUuidMatch =
          diskOut.match(/Volume UUID:\s*([0-9A-Fa-f-]+)/) ||
          diskOut.match(/Disk \/ Partition UUID:\s*([0-9A-Fa-f-]+)/);
        volumeOrOsInstallId = volUuidMatch?.[1]?.trim() || '';
      } else if (platform === 'win32') {
        try {
          const regGuidOut = execSync(
            'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
            { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }
          );
          const guidMatch = regGuidOut.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i);
          hwUuid = guidMatch?.[1]?.trim() || '';
        } catch {}

        let installDate = '';
        try {
          const regInstallOut = execSync(
            'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion" /v InstallDate',
            { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }
          );
          const installMatch = regInstallOut.match(/InstallDate\s+REG_DWORD\s+([^\r\n]+)/i);
          installDate = installMatch?.[1]?.trim() || '';
        } catch {}

        try {
          const psOut = execSync(
            'powershell -NoProfile -Command "(Get-CimInstance -Class Win32_ComputerSystemProduct).UUID"',
            { encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] }
          );
          serialNum = psOut.trim();
        } catch {
          try {
            const wmicOut = execSync('wmic csproduct get UUID', {
              encoding: 'utf8',
              timeout: 3000,
              stdio: ['ignore', 'pipe', 'ignore'],
            });
            serialNum = wmicOut.replace(/UUID/i, '').trim();
          } catch {}
        }

        let volSerial = '';
        try {
          const volOut = execSync('cmd /c vol C:', {
            encoding: 'utf8',
            timeout: 2000,
            stdio: ['ignore', 'pipe', 'ignore'],
          });
          const m = volOut.match(/([0-9A-F]{4}-[0-9A-F]{4})/i);
          volSerial = m?.[1]?.trim() || '';
        } catch {}

        volumeOrOsInstallId = `${installDate}::${volSerial}`;
      } else {
        if (fs.existsSync('/etc/machine-id')) {
          hwUuid = fs.readFileSync('/etc/machine-id', 'utf8').trim();
        } else if (fs.existsSync('/var/lib/dbus/machine-id')) {
          hwUuid = fs.readFileSync('/var/lib/dbus/machine-id', 'utf8').trim();
        }
        serialNum = os.hostname();
      }
    } catch {}

    if (!hwUuid && !serialNum) {
      hwUuid = `${os.hostname()}-${os.totalmem()}`;
    }

    const rawCombined = [
      platform,
      arch,
      cpuModel,
      hwUuid.toUpperCase(),
      serialNum.toUpperCase(),
      volumeOrOsInstallId.toUpperCase(),
    ].join('|');

    const fpSecret = deriveMasterSecret('DEVICE_FINGERPRINT_HASH_V2');
    const fullHash = crypto
      .createHmac('sha256', fpSecret)
      .update(rawCombined)
      .digest('hex')
      .toUpperCase();
    fpSecret.fill(0);

    this.cachedDeviceHash = fullHash;
    this.cachedMachineDisplayId = `XW-${fullHash.slice(0, 4)}-${fullHash.slice(4, 8)}-${fullHash.slice(8, 12)}-${fullHash.slice(12, 16)}`;
    return fullHash;
  }

  public getMachineCode(): string {
    if (!this.cachedMachineDisplayId) {
      this.getDeviceFingerprintHash();
    }
    return this.cachedMachineDisplayId || 'XW-0000-0000-0000-0000';
  }

  private decryptAndParsePassword(inputPassword: string): {
    valid: boolean;
    reason?: 'invalid_format' | 'tampered' | 'expired' | 'clock_tampered';
    message: string;
    payload?: {
      credential: string;
      issuedAt: number;
      expiresAt: number;
      days: number;
      randomId: string;
      expireDateStr: string;
      remainingDays: number;
    };
  } {
    const trimmed = String(inputPassword || '').trim();
    if (!trimmed) {
      return { valid: false, reason: 'invalid_format', message: '密码不能为空' };
    }

    const rawBase64 = trimmed.startsWith('XWLOCK-')
      ? trimmed.slice('XWLOCK-'.length).trim()
      : trimmed;

    let packet: Buffer;
    try {
      packet = Buffer.from(rawBase64, 'base64url');
    } catch {
      return { valid: false, reason: 'invalid_format', message: '密码格式错误，无法解析加密数据包' };
    }

    if (packet.length < 59 || packet[0] !== 0x02) {
      return { valid: false, reason: 'invalid_format', message: '无效的加密密码格式或版本不匹配' };
    }

    const versionByte = packet.subarray(0, 1);
    const keySalt = packet.subarray(1, 5);
    const iv = packet.subarray(5, 17);
    const authTag = packet.subarray(17, 33);
    const outerMac = packet.subarray(33, 39);
    const ciphertext = packet.subarray(39);

    const masterKey = deriveMasterSecret('OFFLINE_LICENSE_MASTER_V2');

    const expectedOuterMac = crypto
      .createHmac('sha256', masterKey)
      .update(Buffer.concat([versionByte, keySalt, iv, authTag, ciphertext]))
      .digest()
      .subarray(0, 6);

    if (!crypto.timingSafeEqual(outerMac, expectedOuterMac)) {
      masterKey.fill(0);
      return {
        valid: false,
        reason: 'tampered',
        message: '密码校验失败：密文签名无效或已被篡改',
      };
    }

    let decryptedStr = '';
    try {
      const aesKey = crypto.scryptSync(
        masterKey,
        Buffer.concat([Buffer.from('XWKJ_SALT_V2::', 'utf8'), keySalt]),
        32,
        { N: 16384, r: 8, p: 1 }
      );
      const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
      decipher.setAAD(Buffer.concat([versionByte, keySalt]));
      decipher.setAuthTag(authTag);
      const decBuf = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      aesKey.fill(0);
      decryptedStr = decBuf.toString('utf8');
    } catch {
      masterKey.fill(0);
      return {
        valid: false,
        reason: 'tampered',
        message: '密码解密失败：密文损坏或认证标签不匹配',
      };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(decryptedStr);
    } catch {
      masterKey.fill(0);
      return { valid: false, reason: 'invalid_format', message: '密码内部结构异常' };
    }

    const cred = String(parsed?.c || '');
    const prefix = _getSecretPrefix();
    if (!cred.startsWith(`${prefix}-`)) {
      masterKey.fill(0);
      return { valid: false, reason: 'invalid_format', message: '密码内部安全格式校验未通过' };
    }
    const restPart = cred.slice(prefix.length + 1);
    const credMatch = restPart.match(/^(\d{4}-\d{2}-\d{2})-([A-Z0-9]{6,16})$/);
    if (!credMatch) {
      masterKey.fill(0);
      return { valid: false, reason: 'invalid_format', message: '密码内部安全格式校验未通过' };
    }

    const expireDateStr = credMatch[1];
    const randomId = credMatch[2];
    const issuedAt = Number(parsed.iat || 0);
    const expiresAt = Number(parsed.exp || 0);
    const days = Number(parsed.d || 30);

    const expectedSig = crypto
      .createHmac('sha256', masterKey)
      .update(`TOKEN_SIG::${cred}::${issuedAt}::${expiresAt}::${days}`)
      .digest('hex')
      .slice(0, 16);
    masterKey.fill(0);

    if (parsed.s !== expectedSig || parsed.r !== randomId) {
      return { valid: false, reason: 'tampered', message: '密码内部完整性签名校验未通过' };
    }

    const now = Date.now();

    if (now < issuedAt - 5 * 60 * 1000) {
      return {
        valid: false,
        reason: 'clock_tampered',
        message: '检测到当前系统时间早于密码生成时间，疑似系统时间被人为回拨，请校准系统时间',
      };
    }

    if (now >= expiresAt) {
      return {
        valid: false,
        reason: 'expired',
        message: `该密码已于 ${expireDateStr} 到期失效，请重新生成新的密码`,
        payload: {
          credential: cred,
          issuedAt,
          expiresAt,
          days,
          randomId,
          expireDateStr,
          remainingDays: 0,
        },
      };
    }

    const remainingDays = Math.max(1, Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24)));

    return {
      valid: true,
      message: `密码解密成功，有效天数剩余 ${remainingDays} 天`,
      payload: {
        credential: cred,
        issuedAt,
        expiresAt,
        days,
        randomId,
        expireDateStr,
        remainingDays,
      },
    };
  }

  private loadVault(): SecurityVaultData {
    const defaultVault: SecurityVaultData = {
      failedAttempts: 0,
      lockUntil: 0,
      lastAttemptAt: 0,
      maxSeenTimestamp: Date.now(),
      consumedRandomIds: [],
    };

    const readOne = (filePath: string): SecurityVaultData | null => {
      try {
        if (!fs.existsSync(filePath)) return null;
        const buf = fs.readFileSync(filePath);
        if (buf.length < 29) return null;
        const iv = buf.subarray(0, 12);
        const tag = buf.subarray(12, 28);
        const enc = buf.subarray(28);

        const vaultKey = deriveMasterSecret('LOCAL_VAULT_STORAGE_KEY_V2');
        const decipher = crypto.createDecipheriv('aes-256-gcm', vaultKey, iv);
        decipher.setAuthTag(tag);
        const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
        vaultKey.fill(0);
        return JSON.parse(dec.toString('utf8'));
      } catch {
        return null;
      }
    };

    const list = this.vaultPaths.map(readOne).filter(Boolean) as SecurityVaultData[];
    if (list.length === 0) {
      return defaultVault;
    }

    const latestActive = [...list].sort((a, b) => (b.activatedAt || 0) - (a.activatedAt || 0))[0];
    const allConsumed = new Set<string>();
    let maxFailed = 0;
    let maxLockUntil = 0;
    let maxLastAttempt = 0;
    let maxClock = Date.now();

    for (const item of list) {
      if (item.failedAttempts > maxFailed) maxFailed = item.failedAttempts;
      if (item.lockUntil > maxLockUntil) maxLockUntil = item.lockUntil;
      if (item.lastAttemptAt > maxLastAttempt) maxLastAttempt = item.lastAttemptAt;
      if (item.maxSeenTimestamp > maxClock) maxClock = item.maxSeenTimestamp;
      for (const rid of item.consumedRandomIds || []) {
        allConsumed.add(rid);
      }
    }

    return {
      activeLicenseCode: latestActive?.activeLicenseCode,
      boundDeviceHash: latestActive?.boundDeviceHash,
      boundRandomId: latestActive?.boundRandomId,
      activatedAt: latestActive?.activatedAt,
      failedAttempts: maxFailed,
      lockUntil: maxLockUntil,
      lastAttemptAt: maxLastAttempt,
      maxSeenTimestamp: maxClock,
      consumedRandomIds: Array.from(allConsumed),
    };
  }

  private saveVault(data: SecurityVaultData): void {
    try {
      const vaultKey = deriveMasterSecret('LOCAL_VAULT_STORAGE_KEY_V2');
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', vaultKey, iv);
      const plainBuf = Buffer.from(JSON.stringify(data), 'utf8');
      const enc = Buffer.concat([cipher.update(plainBuf), cipher.final()]);
      const tag = cipher.getAuthTag();
      vaultKey.fill(0);

      const finalBuf = Buffer.concat([iv, tag, enc]);
      for (const p of this.vaultPaths) {
        try {
          fs.writeFileSync(p, finalBuf, { mode: 0o600 });
        } catch {}
      }
    } catch {}
  }

  public getLicenseStatus(): WorkflowLicenseStatus {
    const currentDeviceHash = this.getDeviceFingerprintHash();
    const machineCode = this.getMachineCode();
    const vault = this.loadVault();
    const now = Date.now();

    const isLockedOut = vault.lockUntil > now;
    const lockRemainingSeconds = isLockedOut ? Math.ceil((vault.lockUntil - now) / 1000) : 0;

    if (now < vault.maxSeenTimestamp - 5 * 60 * 1000) {
      return {
        machineCode,
        isAuthorized: false,
        status: 'clock_tampered',
        remainingDays: 0,
        isLockedOut,
        lockRemainingSeconds,
        failedAttempts: vault.failedAttempts,
        message: '检测到系统时间被异常回拨，自动流程安全锁已冻结，请恢复标准系统时间',
      };
    }

    if (now > vault.maxSeenTimestamp + 60 * 1000) {
      vault.maxSeenTimestamp = now;
      this.saveVault(vault);
    }

    if (!vault.activeLicenseCode || !vault.boundDeviceHash) {
      return {
        machineCode,
        isAuthorized: false,
        status: 'unactivated',
        remainingDays: 0,
        isLockedOut,
        lockRemainingSeconds,
        failedAttempts: vault.failedAttempts,
        message: '自动流程功能已上锁，请输入加密授权密码（输入后将自动解密计算天数并绑定当前设备）',
      };
    }

    if (vault.boundDeviceHash !== currentDeviceHash) {
      if (vault.boundRandomId && !vault.consumedRandomIds.includes(vault.boundRandomId)) {
        vault.consumedRandomIds.push(vault.boundRandomId);
      }
      vault.activeLicenseCode = undefined;
      vault.boundDeviceHash = undefined;
      this.saveVault(vault);

      return {
        machineCode,
        isAuthorized: false,
        status: 'device_mismatch',
        remainingDays: 0,
        isLockedOut,
        lockRemainingSeconds,
        failedAttempts: vault.failedAttempts,
        message: '检测到当前设备已更换或系统已刷机重装，原绑定密码已自动失效，请生成新的密码！',
      };
    }

    const parsed = this.decryptAndParsePassword(vault.activeLicenseCode);
    if (!parsed.valid || !parsed.payload) {
      if (parsed.reason === 'expired' && parsed.payload?.randomId) {
        if (!vault.consumedRandomIds.includes(parsed.payload.randomId)) {
          vault.consumedRandomIds.push(parsed.payload.randomId);
          this.saveVault(vault);
        }
      }
      return {
        machineCode,
        isAuthorized: false,
        status:
          parsed.reason === 'expired'
            ? 'expired'
            : parsed.reason === 'clock_tampered'
            ? 'clock_tampered'
            : 'device_mismatch',
        remainingDays: 0,
        issuedAt: parsed.payload?.issuedAt,
        expiresAt: parsed.payload?.expiresAt,
        expireDateStr: parsed.payload?.expireDateStr,
        isLockedOut,
        lockRemainingSeconds,
        failedAttempts: vault.failedAttempts,
        message: parsed.message,
      };
    }

    const rId = parsed.payload.randomId;
    const maskedId = rId.length >= 6 ? `${rId.slice(0, 2)}****${rId.slice(-2)}` : '****';

    return {
      machineCode,
      isAuthorized: true,
      status: 'active',
      remainingDays: parsed.payload.remainingDays,
      totalDays: parsed.payload.days,
      issuedAt: parsed.payload.issuedAt,
      expiresAt: parsed.payload.expiresAt,
      expireDateStr: parsed.payload.expireDateStr,
      credentialSummary: `SN-${maskedId}`,
      isLockedOut,
      lockRemainingSeconds,
      failedAttempts: 0,
      message: `已绑定当前设备，剩余有效天数 ${parsed.payload.remainingDays} 天（有效期至 ${parsed.payload.expireDateStr}）`,
    };
  }

  public activateLicense(inputPassword: string): WorkflowLicenseActivateResult {
    const currentDeviceHash = this.getDeviceFingerprintHash();
    const vault = this.loadVault();
    const now = Date.now();

    if (vault.lockUntil > now) {
      const remSec = Math.ceil((vault.lockUntil - now) / 1000);
      return {
        success: false,
        message: `防暴力破解安全保护：连续错误次数过多，请等待 ${remSec} 秒后再试`,
        status: this.getLicenseStatus(),
      };
    }

    if (now - vault.lastAttemptAt < 800) {
      return {
        success: false,
        message: '验证请求过于频繁，请稍候再试',
        status: this.getLicenseStatus(),
      };
    }
    vault.lastAttemptAt = now;

    if (now < vault.maxSeenTimestamp - 5 * 60 * 1000) {
      this.saveVault(vault);
      return {
        success: false,
        message: '检测到系统时钟被人为回拨，拒绝解密，请恢复标准系统时间',
        status: this.getLicenseStatus(),
      };
    }
    vault.maxSeenTimestamp = Math.max(vault.maxSeenTimestamp, now);

    const recordFailure = (reasonMsg: string): WorkflowLicenseActivateResult => {
      vault.failedAttempts = (vault.failedAttempts || 0) + 1;
      let lockDurationSec = 0;
      if (vault.failedAttempts >= 10) {
        lockDurationSec = 24 * 3600;
      } else if (vault.failedAttempts >= 8) {
        lockDurationSec = 30 * 60;
      } else if (vault.failedAttempts >= 5) {
        lockDurationSec = 5 * 60;
      } else if (vault.failedAttempts >= 3) {
        lockDurationSec = 60;
      }
      if (lockDurationSec > 0) {
        vault.lockUntil = now + lockDurationSec * 1000;
      }
      this.saveVault(vault);

      const lockTip =
        lockDurationSec > 0
          ? `（已连续失败 ${vault.failedAttempts} 次，系统安全锁定 ${lockDurationSec} 秒）`
          : `（还剩 ${Math.max(1, 3 - vault.failedAttempts)} 次尝试机会后将触发冷却锁定）`;

      return {
        success: false,
        message: `${reasonMsg} ${lockTip}`,
        status: this.getLicenseStatus(),
      };
    };

    const decrypted = this.decryptAndParsePassword(inputPassword);
    if (!decrypted.valid || !decrypted.payload) {
      return recordFailure(decrypted.message);
    }

    const { randomId, issuedAt, remainingDays, expireDateStr } = decrypted.payload;

    if (vault.consumedRandomIds.includes(randomId)) {
      return recordFailure(
        '该密码已被激活使用过（一码仅限绑定激活一次），设备刷机、重置或更换后输入原密码均无法使用，请生成新的密码！'
      );
    }

    if (now - issuedAt > FIRST_DEVICE_BIND_WINDOW_MS) {
      return recordFailure(
        '该密码已超过首次设备绑定时效（已绑定原设备），更换设备或系统刷机后再输入旧密码无法使用，必须生成新的密码！'
      );
    }

    vault.activeLicenseCode = inputPassword.trim();
    vault.boundDeviceHash = currentDeviceHash;
    vault.boundRandomId = randomId;
    vault.activatedAt = now;
    vault.failedAttempts = 0;
    vault.lockUntil = 0;
    vault.maxSeenTimestamp = Math.max(vault.maxSeenTimestamp, now);
    if (!vault.consumedRandomIds.includes(randomId)) {
      vault.consumedRandomIds.push(randomId);
    }
    this.saveVault(vault);

    const updatedStatus = this.getLicenseStatus();
    return {
      success: true,
      message: `密码解密成功！已强制绑定当前设备，自动计算有效天数剩余 ${remainingDays} 天（有效期至 ${expireDateStr}）`,
      status: updatedStatus,
    };
  }

  public assertAuthorized(): void {
    const status = this.getLicenseStatus();
    if (!status.isAuthorized) {
      throw new Error(
        status.message || '自动流程功能已上锁，请先输入加密授权密码完成本机激活'
      );
    }
  }
}

export const licenseService = new LicenseService();
