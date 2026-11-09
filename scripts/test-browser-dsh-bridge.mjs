import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { WebSocket } from 'ws';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = await mkdtemp(path.join(os.tmpdir(), 'neo-dsh-bridge-'));
let bridge, socket;
try {
  const outfile = path.join(dir, 'bridge.cjs');
  await build({ entryPoints: ['electron/services/browserBridge.ts'], outfile, platform: 'node', format: 'cjs', bundle: true, logLevel: 'silent' });
  const { BrowserBridge } = await import(pathToFileURL(outfile).href);
  bridge = new BrowserBridge();
  const { port, token } = await bridge.start();
  const origin = 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const connect = (auth, source) => new Promise(resolve => {
    const client = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${auth}`, { origin: source });
    client.once('open', () => resolve(client)); client.once('error', () => resolve(null));
  });
  assert.equal(await connect('wrong', origin), null);
  assert.equal(await connect(token, 'https://attacker.test'), null);
  socket = await connect(token, origin);
  assert.ok(socket);
  socket.on('message', payload => {
    const message = JSON.parse(payload.toString());
    if (message.type !== 'command') return;
    let result;
    if (message.command === 'tabs.list') result = { tabs: [{ id: 3, url: 'https://example.test/' }, { id: 4, url: 'chrome://settings' }] };
    else if (message.command === 'snapshot') result = { title: 'fixture', url: 'https://example.test/', items: [{ ref: 'e1', name: 'Password', type: 'password', value: 'secret' }, { ref: 'e2', name: 'Save', tag: 'button' }] };
    else if (message.command === 'content') result = { content: 'fixture' };
    else if (message.command === 'screenshot') result = { base64: '/9j/AA==' };
    else if (message.command === 'cdp' && message.params.method === 'Runtime.evaluate') result = { result: { value: [{ index: 0, label: '上传文件' }] } };
    else if (message.command === 'cdp' && message.params.method === 'DOM.getDocument') result = { root: { nodeId: 10 } };
    else if (message.command === 'cdp' && message.params.method === 'DOM.querySelector') result = { nodeId: 11 };
    else result = { command: message.command, params: message.params };
    socket.send(JSON.stringify({ type: 'result', id: message.id, ok: true, result }));
  });
  assert.equal((await bridge.execute('tabs', {})).length, 1);
  const first = await bridge.execute('snapshot', { tabId: 3 });
  assert.ok(!JSON.stringify(first).includes('secret'));
  await assert.rejects(bridge.execute('type', { tabId: 3, ref: first.elements[0].ref, text: 'x' }), /密码/);
  const click = await bridge.execute('click', { tabId: 3, ref: first.elements[1].ref });
  assert.equal(click.params.selector, '[data-dsh-ref="e2"]');
  assert.equal((await bridge.execute('screenshot', { tabId: 3 })).mimeType, 'image/jpeg');
  const fileRef = first.elements.find(item => item.type === 'file').ref;
  const staged = await bridge.stageUpload(Buffer.from('fixture'), 'test.txt');
  assert.deepEqual(await bridge.execute('upload', { tabId: 3, ref: fileRef, stagedFile: staged }), { selected: true, fileName: 'test.txt' });
  await assert.rejects(bridge.execute('upload', { tabId: 3, ref: fileRef, stagedFile: '/tmp/outside.txt' }), /无效/);
  await bridge.execute('snapshot', { tabId: 3 });
  await assert.rejects(bridge.execute('click', { tabId: 3, ref: first.elements[1].ref }), /失效/);
  await assert.rejects(bridge.execute('snapshot', { tabId: 4 }), /不可操作/);
  console.log('DSH protocol: authentication, origin, redaction, refs, screenshot and restricted tabs passed');
} finally { socket?.terminate(); bridge?.stop(); await rm(dir, { recursive: true, force: true }); }
