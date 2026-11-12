import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const platform = process.argv[2] || process.platform;
const arch = process.argv[3] || process.arch;
if (!['darwin', 'win32', 'linux'].includes(platform) || !['arm64', 'x64'].includes(arch)) throw new Error('Unsupported NeoCRM CLI target');
const directory = path.join(root, 'resources', 'neo-cli', `${platform}-${arch}`);
const archive = path.join(root, 'resources', 'neo-cli', 'neocrm-cli-1.1.2.tgz');
const manifest = path.join(directory, 'node_modules', 'neocrm-cli', 'package.json');
let installed = false;
try { installed = JSON.parse(fs.readFileSync(manifest, 'utf8')).version === '1.1.2' && fs.existsSync(path.join(directory, 'node_modules', '@esbuild', `${platform}-${arch}`, 'package.json')); } catch {}
if (!installed) {
  const npmCli = process.env.npm_execpath;
  const executable = npmCli ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = ['install', '--prefix', directory, '--no-save', '--no-package-lock', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', `--os=${platform}`, `--cpu=${arch}`, archive];
  if (process.platform === 'win32' && !npmCli) throw new Error('npm_execpath is required to prepare NeoCRM CLI on Windows');
  execFileSync(executable, npmCli ? [npmCli, ...args] : args, { stdio: 'inherit' });
}
if (!fs.existsSync(path.join(directory, 'node_modules', '@esbuild', `${platform}-${arch}`, 'package.json'))) throw new Error(`NeoCRM CLI missing @esbuild/${platform}-${arch}`);
console.info(`NeoCRM CLI 1.1.2 is ready for ${platform}-${arch}`);
