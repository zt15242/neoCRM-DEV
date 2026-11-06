// Rebuild from a reviewed upstream checkout. Never fetch or execute upstream code at build time.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const checkout = process.argv[2];
if (!checkout) throw new Error('Usage: node scripts/package-diagram-design.mjs <upstream-checkout> [commit]');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const commit = process.argv[3] || execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Expected a full upstream commit SHA');
const files = {};
async function walk(directory, prefix = '') {
  for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    if (entry.isSymbolicLink()) throw new Error('Symlinks are not allowed in the bundled skill');
    const name = prefix + entry.name;
    if (entry.isDirectory()) await walk(path.join(directory, entry.name), name + '/');
    else if (/\.(md|html|py)$/.test(name)) files[name] = await fs.readFile(path.join(directory, entry.name), 'utf8');
  }
}
await walk(path.join(checkout, 'skills/diagram-design'));
files.LICENSE = await fs.readFile(path.join(checkout, 'LICENSE'), 'utf8');
const plugin = JSON.parse(await fs.readFile(path.join(checkout, '.codex-plugin/plugin.json'), 'utf8'));
const raw = JSON.stringify(files);
const bundle = { version: plugin.version, source: 'https://github.com/cathrynlavery/diagram-design', commit,
  license: 'MIT', resourceCount: Object.keys(files).length, sha256: createHash('sha256').update(raw).digest('hex'),
  content: gzipSync(raw, { level: 9 }).toString('base64') };
await fs.writeFile(path.join(root, 'electron/security/diagramDesignSkill.json'), JSON.stringify(bundle, null, 2) + '\n');
await fs.mkdir(path.join(root, 'docs/third-party'), { recursive: true });
await fs.writeFile(path.join(root, 'docs/third-party/diagram-design.LICENSE'), files.LICENSE);
console.log(`Packaged diagram-design ${plugin.version}: ${bundle.resourceCount} resources, ${bundle.content.length} encoded bytes`);
