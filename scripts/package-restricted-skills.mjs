// Maintainer-only input: normalized skill folders kept outside the source tree.
// Only authenticated ciphertext is written to the application sources.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCipheriv, randomBytes } from 'node:crypto';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folders = process.argv.slice(2);
if (folders.length !== 2) throw new Error('Provide the permissions and mobile skill folders');
const keySource = await fs.readFile(path.join(root, 'electron/security/protectedSkillAssets.ts'), 'utf8');
const keyHex = keySource.match(/Buffer\.from\('([a-f0-9]{64})', 'hex'\)/)?.[1];
if (!keyHex) throw new Error('Bundled asset encryption key unavailable');
const assets = {};
for (const [index, folder] of folders.entries()) {
  const id = ['manage-neocrm-permissions', 'configure-neocrm-mobile'][index];
  const instruction = await fs.readFile(path.join(folder, 'SKILL.md'), 'utf8');
  if (!instruction.includes(`name: ${id}\n`)) throw new Error(`Skill name mismatch: ${id}`);
  const resources = {}, scripts = {};
  async function collect(directory) {
    for (const entry of (await fs.readdir(path.join(folder, directory), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = `${directory}/${entry.name}`;
      if (entry.isDirectory()) { await collect(relative); continue; }
      if (!entry.isFile() || !/\.(?:md|json|mjs)$/.test(entry.name)) throw new Error(`Unsupported resource: ${relative}`);
      const source = await fs.readFile(path.join(folder, relative), 'utf8');
      resources[relative] = source;
      if (directory === 'scripts' && entry.name.endsWith('.mjs')) {
        const result = await build({ entryPoints: [path.join(folder, relative)], bundle: true, write: false,
          format: 'cjs', platform: 'neutral', logLevel: 'silent' });
        scripts[relative] = {
          code: result.outputFiles[0].text,
          exports: [...source.matchAll(/export\s+function\s+(\w+)/g)].map(match => match[1]),
        };
      }
    }
  }
  await collect('references');
  await collect('scripts');
  const plaintext = Buffer.from(JSON.stringify({ version: 1, instruction, resources, scripts }));
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  assets[id] = 'neo-skill:v1:' + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  console.log(`Packaged ${id}: ${Object.keys(resources).length} resources, ${Object.keys(scripts).length} offline modules`);
}
await fs.writeFile(path.join(root, 'electron/security/restrictedSkillPackages.json'), JSON.stringify(assets, null, 2) + '\n');
