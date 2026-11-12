import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'neocrm-workspace-mutation-')));
const output = await build({
  stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
    export { ProjectEditorService } from './electron/services/projectEditorService';
    export { DshToolService } from './electron/services/dshToolService';
    export { workspaceMutationService } from './electron/services/workspaceMutationService';
  ` },
  bundle: true, platform: 'node', format: 'cjs', write: false, external: ['esbuild'],
  plugins: [{ name: 'electron-host', setup(builder) {
    builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const app={getPath:()=>process.cwd()}; export const dialog={}, shell={}, BrowserWindow=class {};' }));
  } }],
});
const subject = { exports: {} };
new Function('require', 'module', 'exports', output.outputFiles[0].text)(require, subject, subject.exports);
const { ProjectEditorService, DshToolService, workspaceMutationService } = subject.exports;

try {
  const file = path.join(root, 'source.txt');
  await fs.writeFile(file, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('alpha\r\nbeta\r\n')]));
  const editor = new ProjectEditorService(() => [root]);
  const tools = new DshToolService();
  const opened = await editor.read(root, file);
  assert.equal(opened.content, '\uFEFFalpha\r\nbeta\r\n');
  assert.equal(opened.lineEnding, '\r\n');

  const edited = await tools.editFile({ file_path: 'source.txt', old_string: 'beta', new_string: 'gamma' }, root);
  assert.equal(edited.replacedOccurrences, 1);
  await assert.rejects(editor.save(root, file, 'stale draft', opened.revision), /已被 AI 或外部程序修改/);
  const afterAgent = await editor.read(root, file);
  assert.equal(afterAgent.content, '\uFEFFalpha\r\ngamma\r\n');
  const saved = await editor.save(root, file, 'alpha\r\ndelta\r\n', afterAgent.revision);
  assert.equal(saved.lineEnding, '\r\n');
  const bytes = await fs.readFile(file);
  assert.equal(bytes.subarray(0, 3).toString('hex'), 'efbbbf', 'UTF-8 BOM is preserved');

  await fs.writeFile(file, 'same same');
  await assert.rejects(tools.editFile({ file_path: 'source.txt', old_string: 'same', new_string: 'next' }, root), /出现 2 次/);
  const all = await tools.editFile({ file_path: 'source.txt', old_string: 'same', new_string: 'next', replace_all: true }, root);
  assert.equal(all.replacedOccurrences, 2);
  assert.equal(await fs.readFile(file, 'utf8'), 'next next');

  const concurrent = path.join(root, 'concurrent.txt');
  await fs.writeFile(concurrent, 'base');
  const revision = (await workspaceMutationService.read(concurrent)).revision;
  const results = await Promise.allSettled([
    workspaceMutationService.write(concurrent, 'first', { expectedRevision: revision }),
    workspaceMutationService.write(concurrent, 'second', { expectedRevision: revision }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.ok(['first', 'second'].includes(await fs.readFile(concurrent, 'utf8')));

  await DshToolService.runInSession('agent-vs-gui', async () => {
    await assert.rejects(tools.writeFile({ file_path: file, content: 'unread overwrite' }, root), /先.*读取/);
    await tools.readFile({ file_path: file }, root);
    const draft = await editor.read(root, file);
    await editor.save(root, file, 'user updated', draft.revision);
    await assert.rejects(tools.writeFile({ file_path: file, content: 'stale overwrite' }, root), /修改.*重新读取/);
    await assert.rejects(tools.strReplaceEditor({ command: 'insert', path: file, insert_line: 0, new_str: 'stale insert' }, root), /修改.*重新读取/);
    assert.equal(await fs.readFile(file, 'utf8'), 'user updated');
    await tools.strReplaceEditor({ command: 'view', path: file }, root);
    await tools.editFile({ file_path: file, old_string: 'user updated', new_string: 'merged $&' }, root);
    await tools.writeFile({ file_path: file, content: 'second edit' }, root);
    assert.equal(await fs.readFile(file, 'utf8'), 'second edit');
  });
  await DshToolService.runInSession('agent-vs-gui', async () => {
    await assert.rejects(tools.editFile({ file_path: file, old_string: 'second edit', new_string: 'unread next run' }, root), /先.*读取/);
  });

  const link = path.join(root, 'alias.txt');
  await fs.symlink(concurrent, link);
  let releaseReaders;
  const bothRead = new Promise(resolve => { releaseReaders = resolve; });
  let readers = 0;
  const agents = await Promise.allSettled([concurrent, link].map((target, index) =>
    DshToolService.runInSession(`parallel-${index}`, async () => {
      await tools.readFile({ file_path: target }, root);
      if (++readers === 2) releaseReaders();
      await bothRead;
      return tools.writeFile({ file_path: target, content: `agent ${index}` }, root);
    })));
  assert.equal(agents.filter(result => result.status === 'fulfilled').length, 1, 'Separate agent runs sharing a symlink target cannot overwrite a stale read');
  assert.equal(agents.filter(result => result.status === 'rejected').length, 1);
  assert.equal((await fs.lstat(link)).isSymbolicLink(), true, 'Writes preserve the symlink and update its target');

  const crlf = path.join(root, 'crlf.txt');
  await fs.writeFile(crlf, '\uFEFFone\r\ntwo\r\nthree');
  await DshToolService.runInSession('crlf', async () => {
    await tools.readFile({ file_path: crlf }, root);
    await tools.editFile({ file_path: crlf, old_string: 'one\ntwo', new_string: 'ONE\nTWO $&' }, root);
    await tools.strReplaceEditor({ command: 'insert', path: crlf, insert_line: 2, new_str: 'extra\nline' }, root);
  });
  assert.equal(await fs.readFile(crlf, 'utf8'), '\uFEFFONE\r\nTWO $&\r\nextra\r\nline\r\nthree');

  const outside = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'neo-outside-')));
  try {
    await fs.symlink(outside, path.join(root, 'outside'));
    await assert.rejects(tools.writeFile({ file_path: 'outside/new.txt', content: 'escape' }, root), /软链接越界/);
    await assert.rejects(workspaceMutationService.write(path.join(outside, 'new.txt'), 'escape', { projectRoot: root }), /超出当前项目/);
    assert.deepEqual(await fs.readdir(outside), []);
  } finally { await fs.rm(outside, { recursive: true, force: true }); }

  await assert.rejects(workspaceMutationService.mutate(file, async () => {
    await fs.writeFile(file, 'external edit during transform');
    return 'stale transformed content';
  }, { projectRoot: root }), /保存期间文件发生变更/);
  assert.equal(await fs.readFile(file, 'utf8'), 'external edit during transform');

  const created = await tools.writeFile({ file_path: 'nested/new.txt', content: 'created' }, root);
  assert.equal(await fs.readFile(created.path, 'utf8'), 'created');
  assert.ok(created.revision);
  await tools.strReplaceEditor({ command: 'insert', path: 'nested/new.txt', insert_line: 1, new_str: 'inserted' }, root);
  assert.equal(await fs.readFile(created.path, 'utf8'), 'created\ninserted');
  await fs.writeFile(path.join(root, 'binary.bin'), Buffer.from([0, 1, 2]));
  await assert.rejects(workspaceMutationService.read(path.join(root, 'binary.bin')), /二进制/);
  assert.equal((await fs.readdir(root)).some(name => name.endsWith('.tmp')), false, 'No temporary replacement is left behind');
  console.log('PASS workspace mutations: per-run read revisions, GUI/agent conflicts, concurrent aliases, reread/merge, CRLF/BOM, unique edits and sandbox');
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
