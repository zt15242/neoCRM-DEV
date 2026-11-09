import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';
const temp = await mkdtemp(path.join(os.tmpdir(), 'neo-browser-session-'));
try {
  const outfile = path.join(temp, 'bridge.cjs');
  await build({ entryPoints: ['electron/services/browserBridge.ts'], outfile, platform: 'node', format: 'cjs', bundle: true, logLevel: 'silent' });
  const { BrowserBridge } = await import(pathToFileURL(outfile).href);
  const bridge = new BrowserBridge();
  let tabs = []; let opens = 0;
  bridge.status = () => ({ listening: true, connected: true, port: 1 });
  bridge.execute = async (action, args) => {
    if (action === 'tabs') return tabs;
    if (action === 'open') { opens++; const tab = { id: opens, url: args.url }; tabs.push(tab); return tab; }
    if (action === 'screenshot') return { mimeType: 'image/jpeg', imageData: '/9j/AA==' };
    return { ok: true };
  };
  const first = await bridge.executeForSession('a', 'open', { url: 'https://example.test/' });
  tabs[0].url = 'https://example.test/changed';
  const reused = await bridge.executeForSession('a', 'open', { url: 'https://example.test/' });
  assert.equal(first.id, reused.id);
  assert.equal(reused.reused, true);
  assert.equal(opens, 1);
  assert.equal((await bridge.previewSession('a')).imageUrl, 'data:image/jpeg;base64,/9j/AA==');
  assert.match((await bridge.previewSession('b')).message, /尚未操作/);
  await bridge.executeForSession('a', 'open', { url: 'https://example.test/', newTab: true });
  assert.equal(opens, 2);
  tabs = [];
  await bridge.executeForSession('a', 'open', { url: 'https://example.test/' });
  assert.equal(opens, 3);
  tabs = [];
  const [one, two] = await Promise.all([
    bridge.executeForSession('parallel', 'open', { url: 'https://parallel.test/' }),
    bridge.executeForSession('parallel', 'open', { url: 'https://parallel.test/' }),
  ]);
  assert.equal(one.id, two.id);
  assert.equal(opens, 4);
  bridge.execute = async () => { throw new Error("Either the '<all_urls>' or 'activeTab' permission is required."); };
  const permissionPreview = await bridge.previewSession('a');
  assert.match(permissionPreview.message, /截图权限不足.*重新加载.*在所有网站上/);
  assert.equal(permissionPreview.imageUrl, undefined);
  bridge.execute = async () => { throw new Error('截图期间标签页已切换，画面已丢弃'); };
  assert.match((await bridge.previewSession('a')).message, /画面已丢弃/);
  console.log('Browser sessions: reused tabs, explicit new tab, closed tabs and isolated previews passed');
} finally { await rm(temp, { recursive: true, force: true }); }
