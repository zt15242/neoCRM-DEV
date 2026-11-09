import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
const temp = await mkdtemp(path.join(os.tmpdir(), 'neo-cross-frame-'));
const outfile = path.join(temp, 'bridge.cjs');
await build({ entryPoints: ['electron/services/browserBridge.ts'], outfile, platform: 'node', format: 'cjs', bundle: true, logLevel: 'silent' });
const { BrowserBridge } = await import(pathToFileURL(outfile).href);
const bridge = new BrowserBridge();
bridge.configurePersistence(path.join(temp, 'pairing.json'));
const pairing = await bridge.start();
const pairFile = '/tmp/neocrm-own-test-pair.json';
await writeFile(pairFile, JSON.stringify(pairing), { mode: 0o600 });
let uploaded;
const server = http.createServer((req, res) => {
  if (req.method === 'POST') { const chunks = []; req.on('data', chunk => chunks.push(chunk)); req.on('end', () => { uploaded = Buffer.concat(chunks).toString(); res.end('ok'); }); return; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.url === '/frame') { res.end('<title>跨来源框架测试</title><h1>等待操作</h1><input placeholder="框架输入"><input type="password" placeholder="框架密码"><input type="file" aria-label="框架上传" onchange="fetch(\'/\',{method:\'POST\',body:this.files[0]})"><button onclick="document.querySelector(\'h1\').textContent=document.querySelector(\'input\').value">框架提交</button><button onclick="location.reload()">刷新框架</button>'); return; }
  res.end(`<title>NeoCRM 跨来源测试</title><iframe title="跨来源" src="http://localhost:${server.address().port}/frame"></iframe>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
console.log('等待 NeoCRM 浏览器助手配对');
try {
  for (let i = 0; i < 180 && !bridge.status().connected; i++) await new Promise(resolve => setTimeout(resolve, 1000));
  assert.ok(bridge.status().connected, '扩展配对超时');
  const opened = await bridge.execute('open', { url: `http://127.0.0.1:${server.address().port}/` });
  let frame;
  for (let i = 0; i < 30 && !frame; i++) { await new Promise(resolve => setTimeout(resolve, 500)); frame = (await bridge.execute('frames', { tabId: opened.id })).find(item => item.url.includes('/frame')); }
  assert.ok(frame, '未发现跨来源框架');
  const screenshot = await bridge.execute('screenshot', { tabId: opened.id });
  assert.equal(screenshot.mimeType, 'image/jpeg');
  const imageBytes = Buffer.from(screenshot.imageData, 'base64');
  assert.ok(imageBytes.length > 100);
  assert.equal(imageBytes.readUInt16BE(0), 0xffd8, '截图应为有效 JPEG');
  const snap = await bridge.execute('snapshot', { tabId: opened.id, frameId: frame.id });
  const input = snap.elements.find(item => item.label === '框架输入');
  const password = snap.elements.find(item => item.label === '框架密码');
  const button = snap.elements.find(item => item.label === '框架提交');
  const reload = snap.elements.find(item => item.label === '刷新框架');
  const upload = snap.elements.find(item => item.label === '框架上传');
  assert.ok(input && password && button && reload && upload);
  await assert.rejects(bridge.execute('type', { tabId: opened.id, ref: password.ref, text: 'test' }), /密码/);
  await bridge.execute('type', { tabId: opened.id, ref: input.ref, text: '跨来源操作成功' });
  await bridge.execute('click', { tabId: opened.id, ref: button.ref });
  const stagedFile = await bridge.stageUpload(Buffer.from('跨域上传内容'), 'neo-upload-test.txt');
  await bridge.execute('upload', { tabId: opened.id, ref: upload.ref, stagedFile });
  for (let i = 0; i < 50 && uploaded === undefined; i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(uploaded, '跨域上传内容');
  const updated = await bridge.execute('snapshot', { tabId: opened.id, frameId: frame.id });
  assert.match(updated.text, /跨来源操作成功/);
  await assert.rejects(bridge.execute('click', { tabId: opened.id, ref: button.ref }), /失效|变化/);
  const oldInput = updated.elements.find(item => item.label === '框架输入');
  const reloadButton = updated.elements.find(item => item.label === '刷新框架');
  await bridge.execute('click', { tabId: opened.id, ref: reloadButton.ref });
  await new Promise(resolve => setTimeout(resolve, 800));
  await assert.rejects(bridge.execute('type', { tabId: opened.id, ref: oldInput.ref, text: '旧引用' }), /失效|变化/);
  console.log('PASS 真实 Chrome：JPEG 截图、跨来源框架枚举/读取/输入/点击、文件上传、密码限制与导航失效');
} finally { bridge.stop(); server.closeAllConnections(); server.close(); await rm(pairFile, { force: true }); await rm(temp, { recursive: true, force: true }); }
