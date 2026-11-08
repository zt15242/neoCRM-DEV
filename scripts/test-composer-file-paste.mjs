import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-composer-paste-'));
try {
  const bundle = path.join(temporary, 'helpers.cjs');
  await build({ stdin: { resolveDir: root, contents: `
    export * from './electron/services/clipboardFiles';
    export * from './src/utils/composerAttachments';
  ` }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'silent' });
  const { decodeClipboardFilePaths, getClipboardFilePaths, importComposerFiles } = createRequire(import.meta.url)(bundle);
  const uri = 'copy\n# comment\nfile:///tmp/%E5%AE%A2%E6%88%B7%20report.xlsx\nhttps://example.com/test.pdf\nfile:///tmp/other.docx\n';
  assert.deepEqual(await decodeClipboardFilePaths('text/uri-list', Buffer.from(uri)), ['/tmp/客户 report.xlsx', '/tmp/other.docx']);
  const xml = '<?xml version="1.0"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><array><string>/tmp/客户 &amp; 金额.xlsx</string><string>/tmp/other.pdf</string></array></plist>';
  assert.deepEqual(await decodeClipboardFilePaths('NSFilenamesPboardType', Buffer.from(xml)), ['/tmp/客户 & 金额.xlsx', '/tmp/other.pdf']);
  if (process.platform === 'darwin') {
    const binary = spawnSync('/usr/bin/plutil', ['-convert', 'binary1', '-o', '-', '--', '-'], { input: xml });
    assert.equal(binary.status, 0, binary.stderr.toString());
    assert.deepEqual(await decodeClipboardFilePaths('NSFilenamesPboardType', binary.stdout), ['/tmp/客户 & 金额.xlsx', '/tmp/other.pdf']);
  }
  const drop = Buffer.concat([Buffer.alloc(20), Buffer.from('C:\\客户\\a.xlsx\0D:\\docs\\b.pdf\0\0', 'utf16le')]);
  drop.writeUInt32LE(20); drop.writeUInt32LE(1, 16);
  assert.deepEqual(await decodeClipboardFilePaths('CF_HDROP', drop), ['C:\\客户\\a.xlsx', 'D:\\docs\\b.pdf']);
  assert.deepEqual(await decodeClipboardFilePaths('CF_HDROP', Buffer.from('bad')), []);
  assert.deepEqual(await decodeClipboardFilePaths('public.file-url', Buffer.from('file://remote-host/private.txt')), []);
  let reads = 0;
  const entries = [
    { types: ['text/plain'], getType() { throw new Error('Ordinary text must not be interpreted as file paths'); } },
    ...[0, 1].map(() => ({ types: ['electron application/osclipboard;format="public.file-url"'],
      getType: async () => { reads++; return new Blob(['file:///tmp/copied.pdf']); } })),
  ];
  assert.deepEqual(await getClipboardFilePaths(entries), ['/tmp/copied.pdf']); assert.equal(reads, 2);
  console.log('PASS native file lists: Finder XML/binary plist, Windows file drops, Linux URIs, Unicode and path deduplication');

  const imported = [], errors = [];
  let buffers = 0;
  await importComposerFiles([
    { name: 'huge.bin', size: 50 * 1024 * 1024 + 1 },
    { name: 'missing.docx', size: 4, physical: '/tmp/missing.docx' },
    ...[0, 1].map(() => ({ name: 'linked.xlsx', size: 4, physical: '/tmp/linked.xlsx' })),
    new File([new Uint8Array([137, 80, 78, 71, 0])], '', { type: 'image/png' }),
  ], {
    fileGetPath: file => file.physical || '',
    fileParseLocalPath: async filename => { if (filename.includes('missing')) throw new Error('not found'); return { fullPath: filename }; },
    aiParseFileBuffer: async (name, bytes) => { buffers++; assert.equal(bytes.byteLength, 5); return { name }; },
  }, file => imported.push(file), (name, error) => errors.push([name, error.message]));
  assert.equal(errors.length, 2); assert.equal(imported.length, 2); assert.equal(buffers, 1);
  assert.equal(imported[1].name, '粘贴图片.png');
  console.log('PASS file ingestion: physical paths, screenshot buffers, early size bounds and individual failures');

  await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { flushSync } from 'react-dom';
    import { AiInputComposer } from './src/components/ai/AiInputComposer';
    window.results = { sent: [], toasts: [], nativePaths: [], pending: null };
    const attachment = (name, fullPath) => ({ id: fullPath, name, fullPath, size: 4, mimeType: 'application/octet-stream', parsedContent: 'fixture', summaryText: 'fixture' });
    window.neoApi = {
      fileGetPath: file => file.physical || '',
      fileParseLocalPath: async fullPath => attachment(fullPath.split('/').pop(), fullPath),
      clipboardReadFilePaths: async () => window.results.nativePaths,
      projectListFiles: async () => [],
      aiParseFileBuffer: async (name, buffer) => {
        if (name === 'slow.txt') await new Promise(resolve => { window.results.pending = resolve; });
        if (name === 'broken.docx') throw new Error('文件损坏');
        return attachment(name, '/attachments/' + name);
      },
    };
    flushSync(() => createRoot(document.getElementById('root')).render(<AiInputComposer
      isCrmLoggedIn={false} crmSessionKey="paste-test" isStreaming={false}
      onSend={(...args) => window.results.sent.push(args)} onStop={() => {}}
      entityRefs={[]} onRemoveEntityRef={() => {}} onOpenEntityPicker={() => {}}
      enableTools={true} onToggleTools={() => {}}
      mentionSkills={[
        {id:'skill-diagram-design',name:'Diagram Design 图表设计',description:'绘制图表',category:'builtin',enabled:true},
        {id:'personal-check',name:'个人检查',description:'核查',category:'personal',enabled:true},
        {id:'disabled-skill',name:'已停用技能',description:'停用',category:'builtin',enabled:false},
      ]}
      showToast={(type, message) => window.results.toasts.push([type, message])}
    />));
    window.ready = true;
  ` }, bundle: true, platform: 'browser', format: 'iife', outfile: path.join(temporary, 'ui.js'), logLevel: 'silent' });
  fs.writeFileSync(path.join(temporary, 'index.html'), '<!doctype html><html><body><div id="root"></div><script src="ui.js"></script></body></html>');
  const runner = path.join(temporary, 'electron.cjs');
  fs.writeFileSync(runner, `
    const { app, BrowserWindow } = require('electron');
    const assert = require('node:assert/strict');
    app.setName('Neo paste tests');
    if (process.platform === 'darwin') app.setActivationPolicy('accessory');
    app.whenReady().then(async () => {
      const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
      await win.loadFile(${JSON.stringify(path.join(temporary, 'index.html'))});
      const result = await win.webContents.executeJavaScript('(' + (async () => {
        const check = (condition, message) => { if (!condition) throw new Error(message); };
        const wait = async predicate => { for (let i = 0; i < 600; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 5)); } throw new Error('UI wait timed out'); };
        await wait(() => window.ready);
        const input = document.querySelector('textarea');
        const paste = data => { const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }); input.dispatchEvent(event); return event.defaultPrevented; };
        const data = new DataTransfer();
        data.items.add(new File(['hello'], 'first.txt'));
        data.items.add(new File(['bad'], 'broken.docx'));
        data.items.add(new File([new Uint8Array([137,80,78,71])], 'capture.png', { type: 'image/png' }));
        check(paste(data), 'Files must be intercepted');
        await wait(() => document.body.textContent.includes('capture.png'));
        check(document.body.textContent.includes('first.txt'), 'First attachment missing');
        check(window.results.toasts.some(item => item[1].includes('broken.docx')), 'Partial errors must be reported');
        check(!document.body.textContent.includes('broken.docx'), 'Failed attachment must not be added');
        const plain = new DataTransfer(); plain.setData('text/plain', '/tmp/ordinary text');
        check(!paste(plain), 'Normal text must retain default paste behavior');
        const html = new DataTransfer(); html.setData('text/plain', 'copied cells'); html.setData('text/html', '<table><tr><td>copied cells</td></tr></table>');
        check(!paste(html), 'Copied cells must remain text');
        window.results.nativePaths = ['/tmp/finder.xlsx', '/tmp/finder.pdf'];
        const native = new DataTransfer(); native.setData('text/uri-list', 'file:///tmp/finder.xlsx');
        check(paste(native), 'Native file list should be intercepted');
        await wait(() => document.body.textContent.includes('finder.pdf'));
        check(!input.value, 'Pasted filenames must not leak into message text');
        const slow = new DataTransfer(); slow.items.add(new File(['slow'], 'slow.txt'));
        paste(slow); await wait(() => window.results.pending);
        const send = () => document.querySelector('button[title="发送 (Enter)"]');
        check(!send(), 'Sending must be suspended while a file is loading');
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        check(window.results.sent.length === 0, 'Enter must not send incomplete attachments');
        window.results.pending();
        await wait(() => document.body.textContent.includes('slow.txt') && send());
        send().click(); await wait(() => window.results.sent.length === 1);
        check(window.results.sent[0][2].length === 5, 'Expected five successful attachments in send payload');
        await wait(() => !document.body.textContent.includes('first.txt'));
        const type = value => {Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));};
        type('@diagram'); await wait(() => document.querySelector('[data-testid=skill-mention-option]'));
        check(document.body.textContent.includes('Diagram Design'), 'Skill search result missing');
        input.dispatchEvent(new KeyboardEvent('keydown', {key:'Tab',bubbles:true,cancelable:true}));
        await wait(() => document.querySelector('[data-testid=skill-mention-chip]'));
        type('请绘制架构图'); await wait(() => send() && !send().disabled); send().click();
        await wait(() => window.results.sent.length === 2);
        check(window.results.sent[1][5].join(',') === 'skill-diagram-design', 'Selected skill must be included in this request');
        await wait(() => !document.querySelector('[data-testid=skill-mention-chip]'));
        type('@个人'); await wait(() => document.querySelector('[data-testid=skill-mention-option]'));
        document.querySelector('[data-testid=skill-mention-option]').click();await wait(() => document.querySelector('[data-testid=skill-mention-chip]'));
        document.querySelector('[aria-label="移除技能 个人检查"]').click();await wait(() => !document.querySelector('[data-testid=skill-mention-chip]'));
        type('继续');await wait(() => send() && !send().disabled);send().click();await wait(() => window.results.sent.length === 3);
        check(window.results.sent[2][5].length === 0, 'Removed skills must not leak to later messages');
        type('@已停用');await new Promise(resolve => setTimeout(resolve,30));check(!document.querySelector('[data-testid=skill-mention-option]'), 'Disabled skills must not be selectable');
        return true;
      }).toString() + ')()');
      assert.equal(result, true);
      console.log('PASS real Electron composer: multi-file paste, screenshots, Finder fallback, normal text, partial errors and send blocking');
      win.destroy(); app.exit(0);
    }).catch(error => { console.error(error); app.exit(1); });
  `);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(createRequire(import.meta.url)('electron'), [runner], { env, encoding: 'utf8', timeout: 45000 });
  if (result.stdout) process.stdout.write(result.stdout);
  assert.equal(result.status, 0, result.stderr || result.error?.message);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
