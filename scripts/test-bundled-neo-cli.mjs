import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import path from 'node:path';

const root = process.cwd();
const bundle = await build({ stdin: { resolveDir: root, loader: 'ts', contents: `
  export { getNeoCliEnvironment } from './electron/services/neoCliRuntime';
  export { runNeoCliCommand } from './electron/services/neoApprovalCli';
  export { DshToolService } from './electron/services/dshToolService';
` }, bundle: true, platform: 'node', format: 'cjs', write: false, packages: 'external',
plugins: [{ name: 'electron-fixture', setup(builder) {
  builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export const app = { isPackaged: false, getAppPath: () => ${JSON.stringify(root)} }; export const shell = {}, dialog = {};` }));
} }] });
const module = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { getNeoCliEnvironment, runNeoCliCommand, DshToolService } = module.exports;
const env = getNeoCliEnvironment();
assert.equal(env.PATH.split(path.delimiter)[0], path.join(root, 'resources', 'neo-cli', `${process.platform}-${process.arch}`, 'node_modules', '.bin'));
assert.equal((await runNeoCliCommand(['--version'], root)).trim(), '1.1.2');
const help = await runNeoCliCommand(['query', '--help'], root);
assert.match(help, /--sql/);
const result = await new DshToolService().executeBash({ command: 'neo --version' }, root);
assert.equal(result.exitCode, 0);
assert.equal(result.stdout.trim(), '1.1.2');
console.log('PASS bundled NeoCRM CLI: host reader and agent shell use 1.1.2');
