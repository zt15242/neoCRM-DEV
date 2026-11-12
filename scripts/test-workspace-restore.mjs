import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';

const root = process.cwd();
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-restore-'));
const require = createRequire(import.meta.url);
try {
  const subject = path.join(fixture, 'selection.cjs');
  await build({ entryPoints: [path.join(root, 'src/utils/workspaceSelection.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: subject, logLevel: 'silent' });
  const { resolveWorkspaceSelection: resolve, readWorkspaceSelection } = require(subject);
  const projects = [{id:'p1',name:'项目一',localPath:'/tmp/p1'}, {id:'p2',name:'项目二',localPath:'/tmp/p2'}];
  const sessions = [{id:'s1',projectId:'p1',presetId:'harness-agent',messages:[{id:'m1',role:'user',content:'第一项',createdAt:1}]}, {id:'s2',projectId:'p2',presetId:'harness-agent',messages:[{id:'m2',role:'user',content:'第二项',createdAt:1}]}];
  assert.deepEqual(resolve({projectId:'p2',sessionId:'s2'}, projects, sessions, () => true), {projectId:'p2',sessionId:'s2'});
  assert.deepEqual(resolve({projectId:'p2',sessionId:null}, projects, sessions, () => true), {projectId:'p2',sessionId:null});
  assert.deepEqual(resolve({projectId:'p2',sessionId:'s1'}, projects, sessions, () => true), {projectId:'p2',sessionId:null});
  assert.deepEqual(resolve({projectId:'missing',sessionId:'s2'}, projects, sessions, () => true), {projectId:'p1',sessionId:'s1'});
  assert.deepEqual(resolve({projectId:'p2',sessionId:'s2'}, projects, sessions, () => false), {projectId:'p2',sessionId:null});
  assert.equal(readWorkspaceSelection({getItem:()=>'{broken'}), null);
  await build({ stdin: { resolveDir:root, loader:'tsx', contents:`
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {App} from './src/App'; import {RestrictedFeaturesProvider} from './src/security/RestrictedFeatures';
    import {DEFAULT_AI_SETTINGS, BUILTIN_AI_PROVIDERS} from './shared/constants';
    const noop=()=>()=>{}; const projects=${JSON.stringify(projects)}, sessions=${JSON.stringify(sessions)};
    window.neoApi={getPlatform:async()=> 'darwin',getAppVersion:async()=> '1.8.42',getEnvironments:async()=>[],getCurrentSession:async()=>({isLoggedIn:false}),getAccountHistory:async()=>[],checkForUpdates:async()=>({hasUpdate:false}),
      aiGetSessions:async()=>sessions.map(s=>({...s,messageCount:s.messages.length,messages:[],messagesLoaded:false})),aiGetSession:async id=>({...sessions.find(s=>s.id===id),messagesLoaded:true}),projectGetProjects:async()=>projects,workflowGetLicenseStatus:async()=>({isAuthorized:false}),
      aiGetConfig:async()=>({settings:{...DEFAULT_AI_SETTINGS,defaultStartupTab:'ai'},providers:BUILTIN_AI_PROVIDERS.map(p=>({...p,apiKey:'fixture'})),skills:[],mcpServers:[]}),
      projectReadDirectory:async()=>({entries:[]}),projectListFiles:async()=>[],projectGetRecentArtifacts:async()=>[],jobsList:async()=>({jobs:[]}),
      onSessionUpdated:noop,onAiStreamEvent:noop,onAgentSessionUpdated:noop,onNeoCliProjectOpened:noop,onRestrictedAccessChanged:noop,onRestrictedAccessPrompt:noop,restrictedAccessStatus:async()=>({visible:false})};
    createRoot(document.getElementById('root')).render(<RestrictedFeaturesProvider><App/></RestrictedFeaturesProvider>);
  `},bundle:true,platform:'browser',format:'iife',outfile:path.join(fixture,'renderer.js'),define:{__APP_VERSION__:'"1.8.42"','process.env.NODE_ENV':'"production"'},logLevel:'silent' });
  const css=(await fs.readdir(path.join(root,'dist/assets'))).filter(f=>f.endsWith('.css'));
  await fs.writeFile(path.join(fixture,'index.html'),`<!doctype html><html><head>${css.map(f=>`<link rel="stylesheet" href="${path.join(root,'dist/assets',f)}">`).join('')}</head><body><div id="root"></div><script src="renderer.js"></script></body></html>`);
  await fs.writeFile(path.join(fixture,'host.cjs'),`
    const {app,BrowserWindow}=require('electron');const assert=require('node:assert/strict');
    app.setPath('userData',${JSON.stringify(path.join(fixture,'data'))});
    app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:1200,height:840,webPreferences:{backgroundThrottling:false}});
      const run=code=>win.webContents.executeJavaScript(code); const key='neocrm.workspace.selection.v1';
      const wait=async code=>{for(let n=0;n<250;n++){if(await run(code))return;await new Promise(r=>setTimeout(r,25))}throw Error('timeout: '+code)};
      try {await win.loadFile(${JSON.stringify(path.join(fixture,'index.html'))});
        await run('localStorage.setItem('+JSON.stringify(key)+',JSON.stringify({projectId:"p2",sessionId:"s2"}))'); await win.webContents.reload();
        await wait('document.querySelector("iframe")?.src.includes("/session/s2")');
        assert.deepEqual(await run('JSON.parse(localStorage.getItem('+JSON.stringify(key)+'))'),{projectId:'p2',sessionId:'s2'});
        await run('document.querySelector("[title^=本地路径][title*=p1]").dispatchEvent(new MouseEvent("dblclick",{bubbles:true}))');
        await wait('JSON.parse(localStorage.getItem('+JSON.stringify(key)+')).projectId==="p1" && JSON.parse(localStorage.getItem('+JSON.stringify(key)+')).sessionId==="s1"');
        await win.webContents.reload();
        await wait('document.querySelector("iframe")?.src.includes("/session/s1")');
        await run('document.querySelector(".app-sidebar__navigation button").click()');
        await wait('JSON.parse(localStorage.getItem('+JSON.stringify(key)+')).sessionId===null');
        await win.webContents.reload(); await wait('JSON.parse(localStorage.getItem('+JSON.stringify(key)+')).sessionId===null && document.querySelector("iframe")?.src.includes("/session/")');
        console.log('PASS reload restores project and conversation, preserves a new-chat draft, and checks invalid or inaccessible selections');
        win.destroy();app.exit(0);
      }catch(e){console.error(e);app.exit(1)}
    });
  `);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((resolve,reject)=>{const child=spawn(require('electron'),[path.join(fixture,'host.cjs')],{env,stdio:'inherit'});const timeout=setTimeout(()=>{child.kill();reject(Error('test timed out'))},30000);child.on('exit',code=>{clearTimeout(timeout);code===0?resolve():reject(Error('test exited '+code))});child.on('error',reject)});
} finally { await fs.rm(fixture,{recursive:true,force:true}); }
