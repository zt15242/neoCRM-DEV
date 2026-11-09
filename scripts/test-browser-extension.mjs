import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';

const dir = await mkdtemp(path.join(os.tmpdir(), 'neo-browser-extension-'));
let bridge;
let disconnectWorker = () => {};
try {
  const manifest = JSON.parse(await readFile('browser-extension/manifest.json', 'utf8'));
  assert.ok(manifest.host_permissions.includes('<all_urls>'), '自动截图需要持续的网站访问权限');
  const outfile = path.join(dir, 'bridge.cjs');
  await build({ entryPoints: ['electron/services/browserBridge.ts'], outfile, platform: 'node', format: 'cjs', bundle: true, logLevel: 'silent' });
  const { BrowserBridge } = await import(pathToFileURL(outfile).href);
  bridge = new BrowserBridge();
  const pairing = await bridge.start();
  let savedPairing = pairing;
  let documentId = 'abc-123';
  let injectedTarget;
  let hasScreenshotPermission = true;
  let targetTab = { id: 7, title: 'fixture', url: 'https://example.test/', active: true, windowId: 1 };
  let activeTab = targetTab;
  let captureError;
  let onCapture = () => {};
  let captures = 0;
  let captureData = 'data:image/jpeg;base64,/9j/AA==';
  const listeners = {};
  const chrome = {
    storage: { local: { get: async () => savedPairing } },
    runtime: { onMessage: { addListener: fn => { listeners.message = fn; } }, onStartup: { addListener: () => {} } },
    alarms: { create: () => {}, onAlarm: { addListener: () => {} } },
    permissions: { contains: async request => { assert.deepEqual(Array.from(request.origins), ['<all_urls>']); return hasScreenshotPermission; } },
    tabs: {
      query: async options => {
        if (options.active) { assert.equal(options.windowId, 1); return activeTab ? [activeTab] : []; }
        return [targetTab, { id: 8, url: 'chrome://settings' }, { id: 9, url: 'https://private.test', incognito: true }];
      },
      get: async () => targetTab,
      captureVisibleTab: async (windowId, options) => {
        assert.equal(windowId, 1);
        assert.equal(options.format, 'jpeg');
        captures++;
        if (captureError) throw captureError;
        onCapture();
        return captureData;
      },
    },
    webNavigation: { getAllFrames: async () => [{ frameId: 5, parentFrameId: 0, documentId, url: 'https://other.test/frame' }] },
    scripting: { executeScript: async request => { injectedTarget = request.target; if (request.args[0] === 'upload') { assert.equal(request.args[1].fileData, Buffer.from('fixture').toString('base64')); return [{ result: { selected: true } }]; } return [{ result: request.args[0] === 'snapshot' ? { elements: [{ ref: 'fixture:0', label: 'button' }] } : { clicked: true } }]; } },
  };
  const context = vm.createContext({ chrome, fetch, setTimeout, clearTimeout, URL, console, btoa: value => Buffer.from(value, 'binary').toString('base64') });
  vm.runInContext(await readFile('browser-extension/background.js', 'utf8'), context);
  disconnectWorker = () => { savedPairing = {}; listeners.message({ type: 'disconnect' }); };
  for (let i = 0; i < 50 && !bridge.status().connected; i++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(bridge.status().connected);
  const tabs = await bridge.execute('tabs', {});
  assert.deepEqual(tabs, [{ id: 7, title: 'fixture', url: 'https://example.test/', active: true }]);
  assert.deepEqual(await bridge.execute('screenshot', { tabId: 7 }), { mimeType: 'image/jpeg', imageData: '/9j/AA==' });
  assert.equal(captures, 1);
  hasScreenshotPermission = false;
  await assert.rejects(bridge.execute('screenshot', { tabId: 7 }), /截图权限尚未授予.*重新加载/);
  assert.equal(captures, 1, '未授权时不能调用截图');
  hasScreenshotPermission = true;
  targetTab = { ...targetTab, active: false };
  await assert.rejects(bridge.execute('screenshot', { tabId: 7 }), /激活该标签页/);
  targetTab = { ...targetTab, active: true };
  for (const changed of [undefined, { ...targetTab, id: 8 }, { ...targetTab, incognito: true }, { ...targetTab, url: 'chrome://settings' }, { ...targetTab, url: 'https://elsewhere.test/' }, { ...targetTab, pendingUrl: 'https://elsewhere.test/' }]) {
    activeTab = changed;
    await assert.rejects(bridge.execute('screenshot', { tabId: 7 }), /已切换或正在跳转/);
  }
  assert.equal(captures, 1, '目标发生变化时不能截图');
  activeTab = targetTab;
  onCapture = () => { activeTab = { ...targetTab, id: 8 }; };
  await assert.rejects(bridge.execute('screenshot', { tabId: 7 }), /画面已丢弃/);
  onCapture = () => {};
  activeTab = targetTab;
  captureError = new Error("Either the '<all_urls>' or 'activeTab' permission is required.");
  await assert.rejects(bridge.execute('screenshot', { tabId: 7 }), /截图权限不足.*重新加载/);
  captureError = new Error('capture failed');
  await assert.rejects(bridge.execute('screenshot', { tabId: 7 }), /capture failed/);
  captureError = undefined;
  captureData = 'data:image/png;base64,invalid';
  await assert.rejects(bridge.execute('screenshot', { tabId: 7 }), /截图无效/);
  assert.equal((await bridge.execute('frames', { tabId: 7 }))[0].id, '5');
  const snapshot = await bridge.execute('snapshot', { tabId: 7, frameId: '5' });
  assert.equal(snapshot.elements[0].ref, 'frame/5/abc-123/fixture:0');
  await bridge.execute('click', { tabId: 7, ref: snapshot.elements[0].ref });
  assert.deepEqual(Array.from(injectedTarget.documentIds), ['abc-123']);
  const staged = await bridge.stageUpload(Buffer.from('fixture'), 'fixture.txt');
  assert.equal((await bridge.execute('upload', { tabId: 7, ref: snapshot.elements[0].ref, stagedFile: staged })).selected, true);
  documentId = 'def-456';
  await assert.rejects(bridge.execute('click', { tabId: 7, ref: snapshot.elements[0].ref }), /框架已变化/);
  await assert.rejects(bridge.execute('arbitrary_script', {}), /标签页 ID|不支持/);
  console.log('Extension worker: HTTP transport, screenshot permissions, target switching, frames and upload passed (mock Chrome APIs)');
} finally { disconnectWorker(); bridge?.stop(); await rm(dir, { recursive: true, force: true }); }
