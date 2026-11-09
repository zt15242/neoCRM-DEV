import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
const temp = await mkdtemp(path.join(os.tmpdir(), 'neo-frames-'));
try {
  const outfile = path.join(temp, 'frames.cjs');
  await build({ entryPoints: ['electron/services/browserFrames.ts'], outfile, platform: 'node', format: 'cjs', bundle: true, logLevel: 'silent' });
  const { BrowserFrameController } = await import(pathToFileURL(outfile).href);
  const controller = new BrowserFrameController();
  let invalid = false;
  const calls = [];
  const cdp = async (method, params = {}) => {
    calls.push({ method, params });
    if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'main', url: 'https://fixture/' }, childFrames: [{ frame: { id: 'child', url: 'https://other/frame' } }] } };
    if (method === 'Page.createIsolatedWorld') return { executionContextId: 42 };
    if (method === 'Runtime.evaluate') {
      if (invalid) throw new Error('context destroyed');
      if (params.expression.includes('const stamp = ')) {
        const stamp = /const stamp = "([^"]+)"/.exec(params.expression)[1];
        return { result: { value: { text: 'fixture', items: [{ token: `${stamp}-0`, type: 'password', label: '密码' }, { token: `${stamp}-1`, type: '', label: '提交' }, { token: `${stamp}-2`, type: 'file', label: '上传' }] } } };
      }
      return { result: { value: { clicked: true } } };
    }
    throw new Error(`unexpected ${method}`);
  };
  assert.equal((await controller.list(cdp))[1].parentId, 'main');
  await assert.rejects(controller.snapshot(1, 'unknown', cdp), /框架不存在/);
  const snap = await controller.snapshot(1, 'child', cdp);
  await assert.rejects(controller.action(1, 'type', snap.elements[0].ref, 'bad', undefined, cdp), /密码/);
  await assert.rejects(controller.action(1, 'click', snap.elements[2].ref, '', undefined, cdp), /upload/);
  assert.deepEqual(await controller.action(1, 'click', snap.elements[1].ref, '', undefined, cdp), { clicked: true });
  invalid = true;
  await assert.rejects(controller.action(1, 'click', snap.elements[1].ref, '', undefined, cdp), /变化|无法访问/);
  controller.clear(1);
  await assert.rejects(controller.action(1, 'click', snap.elements[1].ref, '', undefined, cdp), /失效/);
  assert.equal(calls.find(call => call.method === 'Page.createIsolatedWorld').params.grantUniveralAccess, false);
  console.log('Browser frames: enumeration, invalid contexts, password and file controls passed');
} finally { await rm(temp, { recursive: true, force: true }); }
