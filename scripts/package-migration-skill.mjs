// Maintainer-only packager for crm-data-migration encrypted skill asset.
// Only authenticated AES-256-GCM ciphertext is written to electron/security/migrationSkillPackage.json.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillFolder = process.argv[2];
if (!skillFolder) {
  throw new Error('Usage: node scripts/package-migration-skill.mjs <path-to-crm-data-migration-skill-folder>');
}

// Must match deriveMigrationAssetKey() in electron/security/migrationSkillPackage.ts
const _M1 = [0x3d, 0x42, 0x19, 0x71, 0x55, 0x0e, 0x6a, 0x2c, 0x48, 0x73, 0x11, 0x64, 0x37, 0x05, 0x5b, 0x29];
const _M2 = [0x88, 0xb1, 0xd4, 0x9e, 0xc3, 0xe7, 0xa5, 0xf2, 0x8b, 0xd9, 0xc0, 0x94, 0xeb, 0xa2, 0xf6, 0x8d];
const _M3 = [0x1c, 0x6f, 0x33, 0x4a, 0x28, 0x7d, 0x04, 0x51, 0x62, 0x1f, 0x3b, 0x46, 0x79, 0x2e, 0x09, 0x58];

function deriveKey() {
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

const instruction = await fs.readFile(path.join(skillFolder, 'SKILL.md'), 'utf8');
if (!instruction.includes('name: crm-data-migration')) {
  throw new Error('SKILL.md must declare name: crm-data-migration');
}

const resources = {};
const scripts = {};

async function collectRefs(dirRel) {
  const abs = path.join(skillFolder, dirRel);
  const entries = (await fs.readdir(abs, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const rel = `${dirRel}/${entry.name}`;
    if (entry.isDirectory()) {
      await collectRefs(rel);
      continue;
    }
    if (!entry.isFile() || !/\.(?:md|json)$/.test(entry.name)) continue;
    resources[rel] = await fs.readFile(path.join(skillFolder, rel), 'utf8');
  }
}

async function collectScripts(dirRel) {
  const abs = path.join(skillFolder, dirRel);
  const entries = (await fs.readdir(abs, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const rel = `${dirRel}/${entry.name}`;
    if (entry.isDirectory()) {
      await collectScripts(rel);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.mjs')) continue;
    const source = await fs.readFile(path.join(skillFolder, rel), 'utf8');
    const result = await build({
      entryPoints: [path.join(skillFolder, rel)],
      bundle: true,
      minify: true,
      write: false,
      format: 'cjs',
      platform: 'neutral',
      logLevel: 'silent',
    });
    scripts[rel] = {
      code: result.outputFiles[0].text,
      exports: [...source.matchAll(/export\s+function\s+(\w+)/g)].map((m) => m[1]),
    };
  }
}

await collectRefs('references');
await collectScripts('scripts');

const plaintext = Buffer.from(JSON.stringify({ version: 1, instruction, resources, scripts }));
const key = deriveKey();
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
const payload = 'neo-mig:v1:' + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
key.fill(0);

await fs.writeFile(
  path.join(root, 'electron/security/migrationSkillPackage.json'),
  JSON.stringify({ version: 1, payload }, null, 2) + '\n'
);

console.log(`Packaged crm-data-migration: ${Object.keys(resources).length} references, ${Object.keys(scripts).length} encrypted VM modules`);
