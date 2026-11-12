import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-editor-'));
try {
  const root = path.join(fixture, 'project');
  await fs.mkdir(root);
  const bundle = path.join(fixture, 'editor.cjs');
  await build({ entryPoints: ['electron/services/projectEditorService.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'silent' });
  const { ProjectEditorService } = createRequire(import.meta.url)(bundle);
  const editor = new ProjectEditorService(() => [root]);
  const file = path.join(root, 'source.ts');
  const original = '\ufeff// 中文\r\nexport const value = 1;\r\n';
  await fs.writeFile(file, original, { mode: 0o755 });
  const initial = await editor.read(root, file);
  assert.equal(initial.content, original);
  assert.equal(initial.lineEnding, '\r\n');
  const changed = original.replace('= 1', '= 2');
  const saved = await editor.save(root, file, changed, initial.revision);
  assert.equal(await fs.readFile(file, 'utf8'), changed);
  const savedStat = await fs.stat(file);
  assert.equal(savedStat.isFile(), true);
  if (process.platform !== 'win32') assert.equal(savedStat.mode & 0o777, 0o755);
  assert.notEqual(saved.revision, initial.revision);
  console.log('PASS UTF-8/BOM/CRLF roundtrip and executable mode');
  await fs.writeFile(file, '// external edit');
  await assert.rejects(() => editor.save(root, file, '// draft', saved.revision), /修改/);
  assert.equal(await fs.readFile(file, 'utf8'), '// external edit');
  const before = await editor.read(root, file);
  const concurrent = await Promise.allSettled([
    editor.save(root, file, '// one', before.revision), editor.save(root, file, '// two', before.revision),
  ]);
  assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(concurrent.filter(result => result.status === 'rejected').length, 1);
  assert.ok(['// one', '// two'].includes(await fs.readFile(file, 'utf8')));
  console.log('PASS external conflict and serialized stale concurrent saves');
  const outside = path.join(fixture, 'outside.txt');
  await fs.writeFile(outside, 'private');
  await fs.symlink(outside, path.join(root, 'external-link'));
  for (const target of [outside, path.join(root, '..', 'outside.txt'), path.join(root, 'external-link')]) {
    await assert.rejects(() => editor.read(root, target), /项目内/);
    await assert.rejects(() => editor.save(root, target, 'overwrite', before.revision), /项目内/);
  }
  await assert.rejects(() => editor.read(fixture, outside), /关联/);
  assert.equal(await fs.readFile(outside, 'utf8'), 'private');
  console.log('PASS project registration, traversal and external symlink boundaries');
  for (const [name, content, message] of [
    ['large.txt', Buffer.alloc(2 * 1024 * 1024 + 1, 65), /2 MB/],
    ['binary.dat', Buffer.from([1, 0, 3]), /二进制/],
    ['legacy.txt', Buffer.from([0xff, 0xfe]), /UTF-8/],
  ]) {
    const target = path.join(root, name); await fs.writeFile(target, content);
    await assert.rejects(() => editor.read(root, target), message);
    assert.deepEqual(await fs.readFile(target), content);
  }
  assert((await fs.readdir(root)).every(name => !name.endsWith('.tmp')));
  console.log('PASS oversized/binary/invalid UTF-8 reads reject without altering files or leaving temp files');
} finally { await fs.rm(fixture, { recursive: true, force: true }); }
