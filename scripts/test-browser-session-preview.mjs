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
  let tabs = []; let opens = 0; let snapshotVersion = 0;
  const calls = [];
  bridge.status = () => ({ listening: true, connected: true, port: 1 });
  bridge.execute = async (action, args) => {
    calls.push({ action, args });
    if (action === 'tabs') return tabs;
    if (action === 'open') { opens++; const tab = { id: opens, url: args.url }; tabs.push(tab); return tab; }
    if (action === 'screenshot') return { mimeType: 'image/jpeg', imageData: '/9j/AA==' };
    if (action === 'snapshot') return { frameId: args.frameId || '0', elements: [{ ref: `frame/${args.frameId || '0'}/document-${args.tabId}/element-${++snapshotVersion}` }] };
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
  const snap = await bridge.executeForSession('a', 'snapshot', { tabId: 3 });
  assert.equal(snap.tabId, 3);
  await bridge.executeForSession('a', 'click', { ref: snap.elements[0].ref });
  assert.equal(calls.at(-1).args.tabId, 3, 'missing tabId must resolve from the same session snapshot');
  await assert.rejects(bridge.executeForSession('b', 'click', { ref: snap.elements[0].ref }), /tabId/);
  await assert.rejects(bridge.executeForSession('a', 'click', { tabId: 4, ref: snap.elements[0].ref }), /不匹配/);
  await assert.rejects(bridge.executeForSession('a', 'click', { ref: 'made-up-ref' }), /tabId/);
  await assert.rejects(bridge.executeForSession('a', 'snapshot', {}), /tabId/);
  await assert.rejects(bridge.executeForSession('a', 'snapshot', { tabId: null }), /tabId/);
  const child = await bridge.executeForSession('a', 'snapshot', { tabId: 3, frameId: '5' });
  const fresh = await bridge.executeForSession('a', 'snapshot', { tabId: 3 });
  await assert.rejects(bridge.executeForSession('a', 'click', { ref: snap.elements[0].ref }), /tabId/);
  await bridge.executeForSession('a', 'type', { ref: child.elements[0].ref, text: 'fixture' });
  assert.equal(calls.at(-1).args.tabId, 3, 'refreshing main frame must preserve child-frame ownership');
  await bridge.executeForSession('a', 'click', { ref: fresh.elements[0].ref });
  assert.equal(calls.at(-1).args.tabId, 3);
  bridge.execute = async () => { throw new Error("Either the '<all_urls>' or 'activeTab' permission is required."); };
  const permissionPreview = await bridge.previewSession('a');
  assert.match(permissionPreview.message, /截图权限不足.*重新加载.*在所有网站上/);
  assert.equal(permissionPreview.imageUrl, undefined);
  bridge.execute = async () => { throw new Error('截图期间标签页已切换，画面已丢弃'); };
  assert.match((await bridge.previewSession('a')).message, /画面已丢弃/);
  bridge.stop();
  await assert.rejects(bridge.executeForSession('a', 'click', { ref: fresh.elements[0].ref }), /tabId/);
  console.log('Browser sessions: reused tabs, ref-bound tab IDs, cross-session isolation, stale refs and previews passed');
} finally { await rm(temp, { recursive: true, force: true }); }
