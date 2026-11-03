import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-widget-fullscreen-'));
const require = createRequire(import.meta.url);
try {
  const permissions = path.join(fixture, 'permissions.cjs');
  await build({ entryPoints: [path.join(root, 'electron/security/appPermissions.ts')], bundle: true,
    platform: 'node', format: 'cjs', outfile: permissions, logLevel: 'silent' });
  const { configureAppPermissions } = require(permissions);
  let check, request;
  const contents = { session: {
    setPermissionCheckHandler: (handler) => { check = handler; },
    setPermissionRequestHandler: (handler) => { request = handler; },
  } };
  for (const appUrl of ['file:///fixture/dist/index.html', 'http://localhost:5173/']) {
    configureAppPermissions(contents, appUrl);
    const cases = [
      [contents, 'fullscreen', {isMainFrame: true, requestingUrl: appUrl}, true],
      [contents, 'fullscreen', {isMainFrame: true, requestingUrl: appUrl + '#workspace'}, true],
      [contents, 'fullscreen', {isMainFrame: false, requestingUrl: appUrl}, false],
      [contents, 'fullscreen', {isMainFrame: true, requestingUrl: 'https://untrusted.example/'}, false],
      [contents, 'fullscreen', {isMainFrame: true, requestingUrl: 'file:///another/index.html'}, false],
      [{}, 'fullscreen', {isMainFrame: true, requestingUrl: appUrl}, false],
      [null, 'fullscreen', {isMainFrame: true, requestingUrl: appUrl}, false],
      [contents, 'fullscreen', {isMainFrame: true}, false],
      [contents, 'automatic-fullscreen', {isMainFrame: true, requestingUrl: appUrl}, false],
      [contents, 'notifications', {isMainFrame: true, requestingUrl: appUrl}, false],
      [contents, 'media', {isMainFrame: true, requestingUrl: appUrl}, true],
      [contents, 'display-capture', {isMainFrame: true, requestingUrl: appUrl}, true],
    ];
    for (const [sender, permission, details, expected] of cases) {
      assert.equal(check(sender, permission, '', details), expected);
      let decision;
      request(sender, permission, (allowed) => { decision = allowed; }, details);
      assert.equal(decision, expected);
    }
  }
  console.log('PASS production/development permissions: app document fullscreen allowed; subframes, other windows, other documents and automatic fullscreen denied; media permissions preserved');

  const content = '<!doctype html><main>ER Diagram</main><script>const state=7;addEventListener("message",event=>{if(event.data==="fixture-state")parent.postMessage({type:"fixture-state",state},"*")});parent.postMessage({type:"fixture-ready"},"*")</script>';
  await build({ stdin: {resolveDir: root, loader: 'tsx', contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { WorkspacePageView } from './src/components/workspace/WorkspacePageView';
    window.toasts = []; window.frameEvents = []; window.previewCount = 0;
    addEventListener('message', event => { if (event.data?.type?.startsWith('fixture-')) window.frameEvents.push(event.data); });
    const page = {id: 'page', name: 'Fullscreen fixture', createdAt: 1, updatedAt: 1, widgets: [
      {id: 'diagram', type: 'custom-html', title: 'ER Diagram', height: 480, columnSpan: 4, relativePath: 'diagram.html'},
      {id: 'notes', type: 'text', title: 'Notes', height: 320, columnSpan: 2, text: 'Another widget'},
    ]};
    window.neoApi = {workspaceListPages: async () => [page], workspaceGetDataSources: async () => ({crmAccounts: [], mailAccounts: []}),
      workspacePreviewWidget: async (_page, widgetId) => { window.previewCount++; return {widgetId, success: true, content: ${JSON.stringify(content)}, executionId: 'fixture', updatedAt: 1}; },
      workspaceAppendComponentExecutionLog: async () => {}, workspaceListComponentExecutionLogs: async () => [],
      feishuGetSettings: async () => ({configured: false, bots: []}), workspaceListComponentFiles: async () => ({rootPath: '/fixture', files: []})};
    createRoot(document.getElementById('root')).render(<WorkspacePageView showToast={(type, text) => window.toasts.push({type, text})}/>);
  ` }, bundle: true, platform: 'browser', format: 'iife', outfile: path.join(fixture, 'renderer.js'), logLevel: 'silent' });
  const html = path.join(fixture, 'index.html');
  await fs.writeFile(html, '<!doctype html><div id="root"></div><script src="renderer.js"></script>');
  const host = path.join(fixture, 'host.cjs');
  await fs.writeFile(host, `
    const {app, BrowserWindow} = require('electron');
    const assert = require('node:assert/strict');
    const {configureAppPermissions} = require(${JSON.stringify(permissions)});
    app.setPath('userData', ${JSON.stringify(path.join(fixture, 'browser-data'))});
    app.whenReady().then(async () => {
      const win = new BrowserWindow({show: false, webPreferences: {backgroundThrottling: false, disableHtmlFullscreenWindowResize: true}});
      win.webContents.on('render-process-gone', (_event, details) => { console.error(details); app.exit(1); });
      const run = code => win.webContents.executeJavaScript(code, true);
      const wait = async predicate => {
        for (let i = 0; i < 150; i++) { if (await run(predicate)) return; await new Promise(resolve => setTimeout(resolve, 20)); }
        throw new Error('Timed out: ' + predicate);
      };
      const click = selector => run('document.querySelector(' + JSON.stringify(selector) + ').click()');
      const loadPage = async () => {
        await win.loadFile(${JSON.stringify(html)});
        await wait('document.body.textContent.includes("Fullscreen fixture")');
        await run('Array.from(document.querySelectorAll("button")).find(button => button.textContent.includes("Fullscreen fixture")).click()');
        await wait('window.frameEvents.some(event => event.type === "fixture-ready")');
      };
      try {
        let deniedFullscreen = false;
        win.webContents.session.setPermissionCheckHandler((_sender, permission) => ['media', 'display-capture'].includes(permission));
        win.webContents.session.setPermissionRequestHandler((_sender, permission, callback) => {
          if (permission === 'fullscreen') deniedFullscreen = true;
          callback(['media', 'display-capture'].includes(permission));
        });
        await loadPage();
        await click('[data-workspace-widget-id="diagram"] button[title="全屏展示组件"]');
        assert(deniedFullscreen);
        assert.equal(await run('Boolean(document.fullscreenElement)'), false);
        console.log('PASS reproduction: real widget click fails under the previous recording-only permission policy');

        configureAppPermissions(win.webContents, ${JSON.stringify(pathToFileURL(html).href)});
        await loadPage();
        await run('window.originalFrame = document.querySelector("iframe"); void 0');
        await click('[data-workspace-widget-id="diagram"] button[title="全屏展示组件"]');
        await wait('document.fullscreenElement?.dataset.workspaceWidgetId === "diagram" && Boolean(document.querySelector("button[aria-label=退出组件全屏]"))');
        assert(await run('window.originalFrame === document.querySelector("iframe")'));
        await click('[data-workspace-widget-id="diagram"] button[title="组件设置：数据源、订阅与飞书"]');
        await wait('document.fullscreenElement.querySelector(".fixed")?.textContent.includes("组件设置")');
        await click('[data-workspace-widget-id="diagram"] .fixed button[title="关闭"]');
        await click('[data-workspace-widget-id="diagram"] button[title="查看组件执行日志"]');
        await wait('Boolean(document.fullscreenElement.querySelector(".fixed"))');
        await click('[data-workspace-widget-id="diagram"] .fixed button[title="关闭"]');
        await click('button[aria-label="退出组件全屏"]');
        await wait('!document.fullscreenElement && !document.querySelector("button[aria-label=退出组件全屏]")');
        assert.equal(await run('document.querySelector("iframe").style.height'), '480px');
        assert(await run('window.originalFrame === document.querySelector("iframe")'));
        await run('window.originalFrame.contentWindow.postMessage("fixture-state", "*")');
        await wait('window.frameEvents.some(event => event.type === "fixture-state" && event.state === 7)');
        assert.equal(await run('window.previewCount'), 1);
        assert.equal(await run('window.frameEvents.filter(event => event.type === "fixture-ready").length'), 1);
        console.log('PASS actual app permissions: click enters/exits fullscreen; settings/logs accessible; iframe state retained without reload');

        await click('[data-workspace-widget-id="notes"] button[title="全屏展示组件"]');
        await wait('document.fullscreenElement?.dataset.workspaceWidgetId === "notes"');
        win.webContents.sendInputEvent({type: 'keyDown', keyCode: 'Escape'});
        win.webContents.sendInputEvent({type: 'keyUp', keyCode: 'Escape'});
        await wait('!document.fullscreenElement && !document.querySelector("button[aria-label=退出组件全屏]")');
        assert.equal(await run('window.toasts.filter(item => item.type === "error").length'), 0);
        console.log('PASS Escape: a second widget independently enters fullscreen and Esc restores its normal layout');
        win.destroy(); app.exit(0);
      } catch (error) { console.error(error); win.destroy(); app.exit(1); }
    }).catch(error => { console.error(error); app.exit(1); });
  `);
  const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((resolve, reject) => {
    const child = spawn(require('electron'), [host, '--no-sandbox'], {env, stdio: ['ignore', 'pipe', 'pipe']});
    const timer = setTimeout(() => { child.kill(); reject(new Error('Widget fullscreen test timed out')); }, 25000);
    child.stdout.on('data', data => process.stdout.write(data));
    child.stderr.on('data', data => process.stderr.write(data));
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Widget fullscreen test exited with ' + code)); });
  });
} finally { await fs.rm(fixture, {recursive: true, force: true}); }
