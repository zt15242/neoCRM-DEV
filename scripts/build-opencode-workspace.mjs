import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const upstream = path.join(root, 'vendor', 'opencode');
const packageFile = path.join(upstream, 'packages', 'app', 'package.json');
const patchFile = path.join(root, 'scripts', 'opencode-workspace.patch');
const output = path.join(root, 'public', 'opencode-ui');
const bun = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'bun.cmd' : 'bun');

if (!fs.existsSync(path.join(upstream, '.git'))) {
  throw new Error('OpenCode 子模块尚未初始化；请运行 git submodule update --init vendor/opencode');
}
if (!fs.existsSync(bun)) throw new Error('缺少项目锁定的 Bun 构建工具，请先运行 npm install');

const appPackage = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
if (!appPackage.exports?.['./embedded']) {
  execFileSync('git', ['apply', '--recount', '--check', patchFile], { cwd: upstream, stdio: 'inherit' });
  execFileSync('git', ['apply', '--recount', patchFile], { cwd: upstream, stdio: 'inherit' });
}

execFileSync(bun, ['install', '--frozen-lockfile'], { cwd: upstream, stdio: 'inherit' });
execFileSync(bun, ['run', '--cwd', 'packages/app', 'build'], {
  cwd: upstream,
  stdio: 'inherit',
  env: { ...process.env, VITE_OPENCODE_WORKSPACE: '1' },
});

fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(path.join(upstream, 'packages', 'app', 'dist'), output, { recursive: true });
console.info(`OpenCode workspace copied to ${path.relative(root, output)}`);
