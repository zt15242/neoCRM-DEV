import { createDecipheriv } from 'node:crypto';

// Bundled skill assets are independent of device licenses and decrypted only in the main process.
const assetKey = Buffer.from('5d5136d0c1f9405619d741b101cf17d2ca529bf6203ad5a2081cccf5cfdb557f', 'hex');
const decodedAssets = new Map<string, string>();

export function decryptBuiltinSkillAsset(payload: string): string {
  const cached = decodedAssets.get(payload);
  if (cached !== undefined) return cached;
  if (!payload.startsWith('neo-skill:v1:')) throw new Error('内置技能密文格式无效');
  const bytes = Buffer.from(payload.slice('neo-skill:v1:'.length), 'base64');
  if (bytes.length < 29) throw new Error('内置技能密文不完整');
  const decipher = createDecipheriv('aes-256-gcm', assetKey, bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  const text = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
  decodedAssets.set(payload, text);
  return text;
}
