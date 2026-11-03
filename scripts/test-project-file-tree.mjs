import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = await fs.mkdtemp(path.join(process.platform === 'darwin' ? '/tmp' : os.tmpdir(), 'neo-project-tree-'));
const workspace = path.join(fixture, '项目');
const source = path.join(workspace, 'neocrm-src');
const objects = path.join(source, 'objects');
const large = path.join(source, 'large-folder');
const pad = (number, width = 3) => String(number).padStart(width, '0');
const screenshotIndex = process.argv.indexOf('--screenshot');
const screenshotPath = screenshotIndex >= 0 ? process.argv[screenshotIndex + 1] : undefined;
const write = async (file) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, '{}'); };
const flatten = (nodes) => nodes.flatMap((node) => [node, ...flatten(node.children || [])]);

try {
  await fs.mkdir(objects, { recursive: true });
  await fs.mkdir(large);
  for (let index = 0; index < 300; index++) {
    const entity = path.join(objects, `entity-${pad(index)}`);
    await Promise.all(Array.from({ length: 28 }, (_, field) => write(path.join(entity, 'fields', `field-${pad(field)}.json`))));
    await write(path.join(entity, 'nex', 'v2.0', 'form.web.nex.js'));
  }
  for (let index = 0; index < 2200; index += 100) {
    await Promise.all(Array.from({ length: 100 }, (_, offset) => write(path.join(large, `large-${pad(index + offset, 4)}.txt`))));
  }
  const needle = path.join(source, 'deep', ...Array.from({ length: 14 }, (_, index) => `level-${index}`), 'deep-needle.ts');
  await write(needle);
  await write(path.join(workspace, 'neo-project.json'));
  await write(path.join(workspace, 'node_modules', 'ignored-needle.ts'));
  await write(path.join(workspace, '.hidden', 'ignored-needle.ts'));
  await fs.mkdir(path.join(source, 'empty'));
  const outside = path.join(fixture, 'outside');
  await write(path.join(outside, 'outside-secret.ts'));
  await fs.symlink(outside, path.join(source, 'external-link'), 'dir');

  const subjectPath = path.join(fixture, 'subject.cjs');
  await build({
    stdin: { contents: `
      export { ProjectService } from './electron/services/projectService';
      export { ProjectDirectoryReader } from './electron/services/projectDirectoryReader';
      export { flattenProjectTree, projectTreeWindow } from './src/components/ai/projectFileTreeModel';
    `, resolveDir: root, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', outfile: subjectPath, logLevel: 'silent',
    plugins: [{ name: 'test-electron', setup(builder) {
      builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'test-electron' }));
      builder.onLoad({ filter: /.*/, namespace: 'test-electron' }, () => ({ contents: `export const app = { getPath: () => ${JSON.stringify(fixture)} }; export const shell = {};` }));
    } }],
  });
  const require = createRequire(import.meta.url);
  const { ProjectService, ProjectDirectoryReader, flattenProjectTree, projectTreeWindow } = require(subjectPath);
  const service = new ProjectService();
  const reader = new ProjectDirectoryReader();
  const initial = await service.readDirectory({ folderPath: workspace });
  assert.deepEqual(initial.nodes.map((node) => node.name), ['neocrm-src', 'neo-project.json']);
  assert.equal(initial.nodes[0].children, undefined);
  const entities = await service.readDirectory({ folderPath: workspace, directoryPath: objects });
  assert.equal(entities.nodes.length, 300);
  assert.equal(entities.nodes.at(-1).name, 'entity-299');
  assert.equal((await reader.read({ folderPath: workspace, directoryPath: large })).nodes.length, 2200);
  const full = await service.getDirTree(workspace, 25);
  assert(flatten(full).length > 12000);
  assert(flatten(full).some((node) => node.path === needle));
  assert(full.some((node) => node.name === 'neo-project.json'));
  console.log('PASS >12,000 nodes: lazy listings and legacy tree retain every sibling, deep file, and root manifest');

  const search = await reader.read({ folderPath: workspace, query: 'deep-needle' });
  assert.equal(flatten(search.nodes).at(-1).path, needle);
  const allFields = await reader.read({ folderPath: workspace, query: 'field-027' });
  assert.equal(flatten(allFields.nodes).filter((node) => node.type === 'file').length, 300);
  assert.equal((await reader.read({ folderPath: workspace, query: 'ignored-needle' })).nodes.length, 0);
  assert.equal((await reader.read({ folderPath: workspace, query: 'outside-secret' })).nodes.length, 0);
  console.log('PASS deep search: finds all 300 matches and ancestors beyond ten levels; skips ignored folders and symlinks');

  const updateRoot = path.join(fixture, 'refresh');
  await fs.mkdir(updateRoot);
  await reader.read({ folderPath: updateRoot });
  await write(path.join(updateRoot, 'new-file.txt'));
  assert.equal((await reader.read({ folderPath: updateRoot, force: true })).nodes[0].name, 'new-file.txt');
  await assert.rejects(() => service.readDirectory({ folderPath: path.join(fixture, 'missing') }));
  await assert.rejects(() => reader.read({ folderPath: workspace, directoryPath: outside }));
  await assert.rejects(() => reader.read({ folderPath: workspace, directoryPath: path.join(source, 'external-link') }));
  console.log('PASS refresh and errors: bypasses cache; missing directories never fall back to another workspace');

  const originalReaddir = fs.readdir;
  const broken = path.join(source, 'blocked');
  await fs.mkdir(broken);
  try {
    fs.readdir = async (directory, ...args) => {
      if (directory === broken) throw new Error('fixture permission denied');
      return originalReaddir(directory, ...args);
    };
    const partial = await reader.read({ folderPath: workspace, query: 'deep-needle', force: true });
    assert.equal(partial.errors.length, 1);
    assert.equal(partial.errors[0].path, broken);
    assert(flatten(partial.nodes).some((node) => node.path === needle));
  } finally { fs.readdir = originalReaddir; }
  console.log('PASS unreadable subdirectories: explicit partial-result errors preserve other search matches');

  const flatSearch = flattenProjectTree(search.nodes, new Map(), new Set(), new Map(), new Set());
  assert(flatSearch.some((row) => row.node?.path === needle));
  const closedSearch = flattenProjectTree(search.nodes, new Map(), new Set(), new Map(), new Set([source]));
  assert.equal(closedSearch.length, 1);
  const windowed = projectTreeWindow(100000, 99990 * 28, 600);
  assert(windowed.end - windowed.start < 50);
  assert.equal(windowed.end, 100000);
  assert.equal(windowed.totalHeight, 2800000);
  console.log('PASS rendering model: deep matches expand, explicit collapse works, and large lists render a bounded window');

  if (process.argv.includes('--ui')) {
    const cssFiles = (await fs.readdir(path.join(root, 'dist/assets'))).filter((file) => file.endsWith('.css'));
    assert(cssFiles.length, 'Build the app first to supply the real Tailwind stylesheet');
    const cssPath = path.join(root, 'dist/assets', cssFiles[0]);
    await build({
      stdin: { contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { ProjectFileTree } from './src/components/ai/ProjectFileTree';
        const { ProjectDirectoryReader } = window.require(${JSON.stringify(subjectPath)});
        const reader = new ProjectDirectoryReader();
        window.testReads = [];
        window.testPreview = null;
        window.neoApi = { projectReadDirectory: async (params) => {
          window.testReads.push(params);
          if (params.query === 'obsolete') await new Promise((resolve) => setTimeout(resolve, 1000));
          return reader.read(params);
        } };
        const root = createRoot(document.getElementById('root'));
        window.renderTree = (projectPath = ${JSON.stringify(workspace)}, refreshVersion = '0') => root.render(
          <ProjectFileTree projectPath={projectPath} projectName="测试项目" refreshVersion={refreshVersion}
            isPullingCode={false} onPullProjectCode={() => {}} onOpenFile={() => {}} onRevealFile={() => {}}
            onPreviewFile={(name, path) => { window.testPreview = { name, path }; }} />
        );
        window.renderTree();
      `, resolveDir: root, loader: 'tsx' },
      bundle: true, platform: 'browser', format: 'iife', outfile: path.join(fixture, 'renderer.js'),
      define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
    });
    await fs.writeFile(path.join(fixture, 'index.html'), `<!doctype html><html><head><link rel="stylesheet" href="${cssPath}"><style>html,body{height:100%;margin:0}#root{height:600px;width:600px;display:flex;flex-direction:column}</style></head><body><div id="root"></div><script src="./renderer.js"></script></body></html>`);
    const host = path.join(fixture, 'ui-test.cjs');
    await fs.writeFile(host, `
      const { app, BrowserWindow } = require('electron');
      const assert = require('node:assert/strict');
      const fs = require('node:fs/promises');
      const path = require('node:path');
      const fixture = ${JSON.stringify(fixture)};
      const workspace = ${JSON.stringify(workspace)};
      const source = ${JSON.stringify(source)};
      const objects = ${JSON.stringify(objects)};
      const large = ${JSON.stringify(large)};
      const needle = ${JSON.stringify(needle)};
      app.setPath('userData', path.join(fixture, 'electron-test-data'));
      app.whenReady().then(async () => {
        const win = new BrowserWindow({ show: false, width: 640, height: 660, webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false } });
        const run = (code) => win.webContents.executeJavaScript(code);
        const wait = async (code) => {
          for (let attempt = 0; attempt < 500; attempt++) {
            if (await run(code)) return;
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          throw new Error('Timed out: ' + code + '\\n' + await run('document.body.innerText.slice(0, 4000)'));
        };
        const selector = (file) => '[data-path=' + JSON.stringify(file) + ']';
        const click = (file) => run('document.querySelector(' + JSON.stringify(selector(file)) + ').click()');
        const present = (file) => 'Boolean(document.querySelector(' + JSON.stringify(selector(file)) + '))';
        const bottom = () => run("document.querySelector('[role=tree]').scrollTop = document.querySelector('[role=tree]').scrollHeight");
        const top = () => run("document.querySelector('[role=tree]').scrollTop = 0");
        const search = (value) => run("(() => { const input = document.querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, " + JSON.stringify(value) + "); input.dispatchEvent(new Event('input', { bubbles: true })); })()");
        try {
          await win.loadFile(path.join(fixture, 'index.html'));
          await wait(present(objects));
          assert.equal(await run('window.testReads.length'), 2);
          await click(objects);
          await wait('window.testReads.some((read) => read.directoryPath === ' + JSON.stringify(objects) + ')');
          await wait("document.body.innerText.includes('300')");
          await bottom();
          const lastEntity = path.join(objects, 'entity-299');
          await wait(present(lastEntity));
          await click(lastEntity);
          const lastFields = path.join(lastEntity, 'fields');
          await wait(present(lastFields));
          await click(lastFields);
          await wait('window.testReads.some((read) => read.directoryPath === ' + JSON.stringify(lastFields) + ')');
          await wait("document.body.innerText.includes('(28)')");
          await bottom();
          const lastField = path.join(lastFields, 'field-027.json');
          await wait(present(lastField));
          await click(lastField);
          assert.equal((await run('window.testPreview')).path, lastField);
          console.log('PASS UI: opens the final entity and field beyond the old 1,500-node cutoff');

          await top(); await wait(present(large)); await click(objects); await click(large);
          await wait("document.body.innerText.includes('2,200')");
          await bottom();
          const lastLarge = path.join(large, 'large-2199.txt');
          await wait(present(lastLarge)); await click(lastLarge);
          assert.equal((await run('window.testPreview')).path, lastLarge);
          assert(await run("document.querySelectorAll('[role=treeitem]').length < 60"));
          const scrollBefore = await run("document.querySelector('[role=tree]').scrollTop");
          const freshFile = path.join(large, 'large-2200.txt');
          await fs.writeFile(freshFile, '{}');
          await run("document.querySelector('button[title=\\"刷新目录，保留展开位置\\"]').click()");
          await wait(present(freshFile));
          assert(Math.abs(await run("document.querySelector('[role=tree]').scrollTop") - scrollBefore) < 30);
          ${screenshotPath ? `await win.webContents.capturePage().then((image) => fs.writeFile(${JSON.stringify(screenshotPath)}, image.toPNG()));` : ''}
          console.log('PASS UI: 2,200-file directory stays virtualized; refresh finds new files and preserves scroll and expansion');

          await search('deep-needle'); await wait(present(needle));
          await click(needle); assert.equal((await run('window.testPreview')).path, needle);
          await search('obsolete'); await wait("window.testReads.some((read) => read.query === 'obsolete')");
          await search('deep-needle'); await wait(present(needle));
          await new Promise((resolve) => setTimeout(resolve, 1100));
          assert(await run(present(needle)));
          await search('field-027');
          await wait("document.querySelector('[role=tree]').getAttribute('aria-busy') === 'false'");
          await bottom(); await wait(present(lastField));
          console.log('PASS UI: full-depth search expands ancestors, reaches the last match, and ignores stale search responses');

          const missing = path.join(fixture, 'missing-workspace');
          await run('window.renderTree(' + JSON.stringify(missing) + ')');
          await wait("Boolean(document.querySelector('[role=alert]'))");
          assert.equal(await run("document.querySelectorAll('[role=treeitem]').length"), 0);
          const nextWorkspace = path.join(fixture, 'workspace-b');
          await fs.mkdir(nextWorkspace);
          const nextFile = path.join(nextWorkspace, 'workspace-b.txt');
          await fs.writeFile(nextFile, '{}');
          await run('window.renderTree(' + JSON.stringify(nextWorkspace) + ')');
          await wait(present(nextFile));
          assert.equal(await run("document.querySelectorAll('[role=alert]').length"), 0);
          console.log('PASS UI: workspace changes clear old rows and recover from missing-directory errors');

          const generated = path.join(nextWorkspace, 'generated.txt');
          await fs.writeFile(generated, '{}');
          await run('window.fastRead = window.neoApi.projectReadDirectory; window.neoApi.projectReadDirectory = async (params) => { if (params.force) await new Promise((resolve) => setTimeout(resolve, 1000)); return window.fastRead(params); }; undefined');
          await run('window.activityVersion = 0; window.activityTimer = setInterval(() => window.renderTree(' + JSON.stringify(nextWorkspace) + ', String(++window.activityVersion)), 50)');
          await wait(present(generated));
          await run('clearInterval(window.activityTimer); window.neoApi.projectReadDirectory = window.fastRead; undefined');
          console.log('PASS UI: continuous tool activity refreshes new files without indefinitely postponing loading');

          await run('window.originalRead = window.neoApi.projectReadDirectory; window.neoApi.projectReadDirectory = async (params) => { if (params.folderPath === ' + JSON.stringify(workspace) + ') await new Promise((resolve) => setTimeout(resolve, 500)); return window.originalRead(params); }; window.renderTree(' + JSON.stringify(workspace) + ')');
          await new Promise((resolve) => setTimeout(resolve, 100));
          await run('window.renderTree(' + JSON.stringify(nextWorkspace) + ')');
          await wait(present(nextFile));
          await new Promise((resolve) => setTimeout(resolve, 700));
          assert(await run(present(nextFile)));
          assert.equal(await run('Array.from(document.querySelectorAll("[data-path]")).filter((node) => node.dataset.path.startsWith(' + JSON.stringify(workspace) + ')).length'), 0);
          console.log('PASS UI: a previous workspace response cannot overwrite the current workspace');
          win.destroy(); app.exit(0);
        } catch (error) { console.error(error); win.destroy(); app.exit(1); }
      }).catch((error) => { console.error(error); app.exit(1); });
    `);
    const electronPath = require('electron');
    const environment = { ...process.env };
    delete environment.ELECTRON_RUN_AS_NODE;
    await new Promise((resolve, reject) => {
      const child = spawn(electronPath, [host, '--no-sandbox'], { env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
      const timeout = setTimeout(() => { child.kill(); reject(new Error('Electron UI test timed out')); }, 60000);
      child.stdout.on('data', (data) => process.stdout.write(data));
      child.stderr.on('data', (data) => process.stderr.write(data));
      child.on('error', (error) => { clearTimeout(timeout); reject(error); });
      child.on('exit', (code) => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error('Electron UI tests exited with ' + code)); });
    });
  }
} finally {
  await fs.rm(fixture, { recursive: true, force: true });
}
