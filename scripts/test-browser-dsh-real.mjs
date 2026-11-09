import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
const tmp = await mkdtemp(path.join(os.tmpdir(), 'neo-dsh-real-'));
const outfile = path.join(tmp, 'bridge.cjs');
await build({ entryPoints: ['electron/services/browserBridge.ts'], outfile, platform: 'node', format: 'cjs', bundle: true, logLevel: 'silent' });
const { BrowserBridge } = await import(pathToFileURL(outfile).href);
const bridge = new BrowserBridge();
const pairing = await bridge.start();
const pairFile = '/tmp/neocrm-dsh-test-pair.json';
await writeFile(pairFile, JSON.stringify(pairing), { mode: 0o600 });
let uploaded;
const server = http.createServer((req, res) => {
  if (req.method === 'POST') { const chunks = []; req.on('data', chunk => chunks.push(chunk)); req.on('end', () => { uploaded = Buffer.concat(chunks).toString(); res.end('ok'); }); return; }
  if (req.url === '/frame' || req.url === '/cross-frame') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<title>测试内嵌页</title><h2>等待框架操作</h2><input placeholder="框架输入"><input type="password" placeholder="框架密码"><input type="file" aria-label="框架上传" onchange="fetch(\'/\',{method:\'POST\',body:this.files[0]})"><button onclick="document.querySelector(\'h2\').textContent=document.querySelector(\'input\').value">框架提交</button><button onclick="location.reload()">刷新框架</button>'); return; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(`<title>NeoCRM 浏览器控制测试</title><h1>等待操作</h1><input placeholder="测试内容"><input type="password" placeholder="密码"><input type="file" aria-label="测试上传" onchange="document.querySelector('#file-result').textContent=this.files[0].name;fetch('/',{method:'POST',body:this.files[0]})"><span id="file-result"></span><button onclick="document.querySelector('h1').textContent=document.querySelector('input').value">测试提交</button><iframe title="测试内嵌页" src="/frame"></iframe><iframe title="跨域内嵌页" src="http://localhost:${server.address().port}/cross-frame"></iframe>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
console.log('等待浏览器扩展配对；测试仅操作本机临时页面');
try {
  for (let i = 0; i < 180 && !bridge.status().connected; i++) await new Promise(resolve => setTimeout(resolve, 1000));
  assert.ok(bridge.status().connected, '扩展配对超时');
  console.log('扩展已连接，开始验证真实页面');
  const opened = await bridge.execute('open', { url: `http://127.0.0.1:${server.address().port}/` });
  const snap = await bridge.execute('snapshot', { tabId: opened.id });
  const input = snap.elements.find(x => x.label === '测试内容');
  const password = snap.elements.find(x => x.label === '密码');
  const button = snap.elements.find(x => x.label === '测试提交');
  const fileInput = snap.elements.find(x => x.label === '测试上传' && x.type === 'file');
  assert.ok(input && button && password && fileInput, '测试控件不完整');
  await assert.rejects(bridge.execute('type', { tabId: opened.id, ref: password.ref, text: 'not-a-secret' }), /密码/);
  await bridge.execute('type', { tabId: opened.id, ref: input.ref, text: '浏览器操作成功' });
  await bridge.execute('click', { tabId: opened.id, ref: button.ref });
  const stagedFile = await bridge.stageUpload(Buffer.from('测试文件'), 'neo-upload-test.txt');
  await bridge.execute('upload', { tabId: opened.id, ref: fileInput.ref, stagedFile });
  for (let i = 0; i < 50 && uploaded === undefined; i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(uploaded, '测试文件', '测试服务器未收到文件内容');
  const final = await bridge.execute('snapshot', { tabId: opened.id });
  assert.match(final.text, /浏览器操作成功/);
  assert.match(final.text, /neo-upload-test\.txt/);
  const screenshot = await bridge.execute('screenshot', { tabId: opened.id });
  assert.equal(screenshot.mimeType, 'image/jpeg');
  assert.ok(screenshot.imageData.startsWith('/9j/'));
  await assert.rejects(bridge.execute('click', { tabId: opened.id, ref: button.ref }), /失效/);
  const frames = await bridge.execute('frames', { tabId: opened.id });
  const frame = frames.find(item => item.url.endsWith('/frame'));
  assert.ok(frame, '未发现框架');
  const frameSnap = await bridge.execute('snapshot', { tabId: opened.id, frameId: frame.id });
  const frameInput = frameSnap.elements.find(item => item.label === '框架输入');
  const framePassword = frameSnap.elements.find(item => item.label === '框架密码');
  const frameButton = frameSnap.elements.find(item => item.label === '框架提交');
  const frameFile = frameSnap.elements.find(item => item.label === '框架上传');
  assert.ok(frameInput && framePassword && frameButton && frameFile, '未发现框架控件');
  await assert.rejects(bridge.execute('type', { tabId: opened.id, ref: framePassword.ref, text: 'test' }), /密码/);
  await bridge.execute('type', { tabId: opened.id, ref: frameInput.ref, text: '框架操作成功' });
  await bridge.execute('click', { tabId: opened.id, ref: frameButton.ref });
  uploaded = undefined;
  await bridge.execute('upload', { tabId: opened.id, ref: frameFile.ref, stagedFile });
  for (let i = 0; i < 50 && uploaded === undefined; i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(uploaded, '测试文件', '框架测试服务未收到文件');
  const updatedFrame = await bridge.execute('snapshot', { tabId: opened.id, frameId: frame.id });
  assert.match(updatedFrame.text, /框架操作成功/);
  await assert.rejects(bridge.execute('click', { tabId: opened.id, ref: frameButton.ref }), /失效/);
  const reload = updatedFrame.elements.find(item => item.label === '刷新框架');
  const oldInput = updatedFrame.elements.find(item => item.label === '框架输入');
  await bridge.execute('click', { tabId: opened.id, ref: reload.ref });
  await new Promise(resolve => setTimeout(resolve, 500));
  await assert.rejects(bridge.execute('type', { tabId: opened.id, ref: oldInput.ref, text: '旧引用' }), /变化|失效|框架/);
  const crossFrame = (await bridge.execute('frames', { tabId: opened.id })).find(item => item.url.includes('/cross-frame'));
  if (crossFrame) {
    try {
      const crossSnap = await bridge.execute('snapshot', { tabId: opened.id, frameId: crossFrame.id });
      assert.ok(crossSnap.elements.some(item => item.label === '框架输入'));
      console.log('PASS 不同来源框架可读取');
    } catch (error) {
      assert.match(error.message, /框架|访问/);
      console.log(`跨来源框架按限制拒绝：${error.message}`);
    }
  } else console.log('跨来源框架未在当前调试目标中出现');
  console.log('PASS 真实 Chrome：页面和框架读取、输入、点击、文件选择、截图与引用限制');
} finally { bridge.stop(); server.closeAllConnections(); server.close(); await rm(pairFile, { force: true }); await rm(tmp, { recursive: true, force: true }); }
