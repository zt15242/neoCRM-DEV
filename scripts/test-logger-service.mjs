import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'neocrm-logger-'));
try {
  const output = path.join(fixture, 'logger.cjs');
  await build({ entryPoints: ['electron/services/loggerService.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: output, plugins: [{ name: 'electron-fixture', setup(build) {
    build.onResolve({filter: /^electron$/}, () => ({path: 'electron', namespace:'fixture'}));
    build.onLoad({filter: /.*/, namespace:'fixture'}, () => ({contents: `export const app = {getPath: () => ${JSON.stringify(fixture)}}; export const shell = {}; export const dialog = {};`, loader:'js'}));
  }}], logLevel:'silent' });
  const { LoggerService } = createRequire(import.meta.url)(output);
  const logger = new LoggerService();
  const date = '2026-11-07';
  await fs.writeFile(path.join(fixture, 'logs', `app-${date}.log`), [
    '[2026-11-07 10:00:00.000] [ERROR] [App] 加载失败 | Details: Error: failure',
    '    at first()', '    at second()',
    '[2026-11-07 10:01:00.000] [INFO] [Auth] 登录成功',
    '[2026-11-07 10:02:00.000] [WARN] [AI] 注意', ''
  ].join('\n'));
  let result = logger.getLogs({date});
  assert.equal(result.total, 3); assert.deepEqual(result.logs.map(l => l.level), ['WARN','INFO','ERROR']);
  assert.equal(result.logs[2].details, 'Error: failure\n    at first()\n    at second()');
  assert(result.logs[2].raw.endsWith('    at first()\n    at second()'));
  result = logger.getLogs({date, level:'ERROR', keyword:'second()'});
  assert.equal(result.filteredCount, 1); assert.equal(result.logs[0].message, '加载失败');
  result = logger.getLogs({date, limit:1});
  assert.equal(result.filteredCount, 3); assert.equal(result.logs.length, 1);
  logger.writeLog('ERROR', 'Fixture', 'multiple errors', [new Error('detail fixture'), 'context']);
  const today = logger.getLogs({keyword:'detail fixture'});
  assert(today.logs.some(l => l.details?.includes('detail fixture')), 'Error inside array retains message');
  console.log('PASS grouped multiline entries, severity, search, count, limit and error details');
} finally { await fs.rm(fixture, { recursive:true, force:true }); }
