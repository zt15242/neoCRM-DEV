import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-settings-ui-'));
const benchmark = process.argv.includes('--benchmark');
const screenshots = process.argv.includes('--screenshots') ? path.join(os.tmpdir(), 'neocrm-settings-qa') : null;
try {
  await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { flushSync } from 'react-dom';
    import { SettingsManager } from './src/components/settings/SettingsManager';
    import { CustomProviderModal } from './src/components/settings/CustomProviderModal';
    import { DEFAULT_AI_SETTINGS, BUILTIN_AI_PROVIDERS } from './shared/constants';
    import { applyThemeToDom, DEFAULT_THEME_CONFIG } from './src/utils/themeManager';
    window.errors = []; window.toasts = []; window.saves = []; window.testRequests = []; window.wbRefreshes = 0;
    window.addEventListener('error', event => window.errors.push(event.message));
    window.addEventListener('unhandledrejection', event => window.errors.push(String(event.reason)));
    const models = Array.from({length: 2000}, (_, i) => ({id:'model-'+i,name:'Model '+i,tools:true}));
    const custom = {id:'custom',type:'custom',name:'模型网关',baseUrl:'https://example.test/v1',apiKey:'fixture-key',enabled:true,models};
    const config = {providers:[custom,...structuredClone(BUILTIN_AI_PROVIDERS)], settings:{...DEFAULT_AI_SETTINGS,defaultSqlLimit:640,customSystemPrompt:'已保存的提示词'},skills:[],mcpServers:[]};
    window.resolveLoads = [];
    window.neoApi = {
      getAppVersion: async () => '1.8.42',
      loggerGetLogFiles: async () => [{dateStr:'2026-11-07',fileName:'app-2026-11-07.log',sizeFormatted:'5 KB',isToday:true}],
      loggerGetLogs: async options => { const logs=[{id:'1',timestamp:'2026-11-07 10:20:30.000',level:'ERROR',module:'App',message:'加载失败',details:'Error: fixture failure\\n    at fixture()',raw:'fixture raw'}]; const filtered=logs.filter(l => (!options.level || options.level==='ALL' || l.level===options.level) && (!options.keyword || (l.message+l.details).includes(options.keyword))); return {logs:filtered,total:1,filteredCount:filtered.length,logFilePath:'fixture.log'}; },
      aiGetConfig: () => new Promise((resolve, reject) => window.resolveLoads.push({resolve:()=>resolve(structuredClone(config)),reject})),
      workbuddyGetStatus: async () => ({loggedIn:false,models:[]}),
      workbuddyRefreshStatus: async () => { window.wbRefreshes++; return {loggedIn:false,models:[]}; },
      aiSaveSettings: patch => new Promise((resolve, reject) => { window.saves.push(patch); window.finishSave = () => resolve({...config.settings,...patch}); window.failSave = () => reject(new Error('磁盘不可写')); }),
      aiSaveProvider: provider => new Promise((resolve, reject) => { window.saves.push(provider); window.finishSave=()=>resolve([provider,...config.providers.filter(p=>p.id!==provider.id)]); window.failSave=()=>reject(new Error('磁盘不可写')); }),
      aiTestProvider: async provider => { window.testRequests.push(provider); return {success:true,message:'连接成功'}; },
    };
    window.theme = palette => applyThemeToDom({...DEFAULT_THEME_CONFIG,palette,glassEnabled:false,groundGlow:false});
    window.theme('codex-light');
    const toast = (type,text) => window.toasts.push({type,text});
    const app = createRoot(document.getElementById('root'));
    window.mode = kind => flushSync(() => app.render(kind==='catalog'
      ? <CustomProviderModal isOpen initialProvider={custom} onClose={()=>{}} showToast={toast} onSave={async provider=>{window.saves.push(provider); if(window.rejectCatalog) throw new Error('磁盘不可写');}} />
      : <Harness />));
    function Harness() {
      const [open,setOpen] = useState(true);
      window.openSettings = () => setOpen(true);
      return <SettingsManager isOpen={open} initialTab="general" onClose={()=>setOpen(false)} onCheckUpdate={()=>{}} showToast={toast} />;
    }
    window.typeName = () => {
      const input = document.querySelector('input[placeholder="例如：本地 Ollama、OneAPI 中转站"]') || document.querySelector('input[type=text]');
      const times=[];
      for(let i=0;i<20;i++) { const start=performance.now(); flushSync(()=>{
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'网关 '+i);
        input.dispatchEvent(new Event('input',{bubbles:true}));
      }); times.push(performance.now()-start); }
      return {max:Math.max(...times),mean:times.reduce((a,b)=>a+b)/times.length,nodes:document.querySelectorAll('*').length};
    };
    window.mode(${JSON.stringify(benchmark ? 'catalog' : 'settings')});
  ` }, bundle: true, platform: 'browser', format: 'iife', outfile: path.join(fixture, 'renderer.js'), define: { __APP_VERSION__: '"1.8.42"', 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent' });
  const css = (await fs.readdir(path.join(root, 'dist/assets'))).filter(file => file.endsWith('.css'));
  await fs.writeFile(path.join(fixture, 'index.html'), `<!doctype html><html><head>${css.map(file=>`<link rel="stylesheet" href="${path.join(root,'dist/assets',file)}">`).join('')}<style>body{margin:0}</style></head><body><div id="root"></div><script src="renderer.js"></script></body></html>`);
  await fs.writeFile(path.join(fixture, 'host.cjs'), `
    const {app,BrowserWindow} = require('electron');
    const assert = require('node:assert/strict');
    const fs = require('node:fs/promises');
    const path = require('node:path');
    app.setPath('userData',${JSON.stringify(path.join(fixture,'user-data'))});
    app.whenReady().then(async()=>{
      const win = new BrowserWindow({show:false,width:1440,height:900,webPreferences:{backgroundThrottling:false}});
      win.webContents.on('console-message', event => { if(event.level==='error') console.error('RENDERER',event.message); });
      const run = async code => { try { return await win.webContents.executeJavaScript(code); } catch(error) { throw new Error(code+'\\n'+error.message); } };
      const wait = async code => { for(let i=0;i<300;i++) { if(await run(code))return; await new Promise(r=>setTimeout(r,20)); } throw new Error('Timeout: '+code); };
      const clickText = text => run('Array.from(document.querySelectorAll("button")).find(b=>b.textContent.includes('+JSON.stringify(text)+')).click()');
      const change = (selector,value) => run('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el,'+JSON.stringify(value)+');el.dispatchEvent(new Event("input",{bubbles:true}));})()');
      const capture = async name => { const dir=${JSON.stringify(screenshots)};if(dir){await new Promise(r=>setTimeout(r,250));await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,name+'.png'),(await win.webContents.capturePage()).toPNG());}};
      try {
        await win.loadFile(${JSON.stringify(path.join(fixture,'index.html'))});
        if(${benchmark}) { await wait('Boolean(document.querySelector("input"))'); console.log('CATALOG BENCHMARK',await run('window.typeName()')); }
        else {
          await wait('window.resolveLoads.length===1');
          assert.equal(await run('getComputedStyle(document.querySelector(".window-no-drag")).webkitAppRegion'),'no-drag');
          await run('document.querySelector("button[title^=关闭设置]").click()');
          await wait('!document.querySelector("button[title^=关闭设置]")');
          await run('window.openSettings()'); await wait('window.resolveLoads.length===2');
          assert.equal(await run('document.querySelectorAll("input[type=number]").length'),0,'must not edit default values before saved config loads');
          await clickText('界面与换肤'); await wait('document.body.innerText.includes("主题配色 (Theme Palette)")');
          await clickText('通用偏好');
          await run('window.resolveLoads[1].resolve()');
          await wait('document.querySelector("input[type=number]")?.value==="640"');
          await change('input[type=number]','720'); await clickText('保存通用设置');
          await wait('window.saves.length===1');
          assert(await run('Array.from(document.querySelectorAll("button")).some(b=>b.disabled&&b.textContent.includes("保存中"))'));
          await clickText('界面与换肤'); await run('window.finishSave()');
          await clickText('通用偏好'); await wait('document.querySelector("input[type=number]")?.value==="720"');
          await change('input[type=number]','800'); await clickText('保存通用设置');
          await run('window.failSave()'); await wait('window.toasts.at(-1)?.type==="error"');
          assert.equal(await run('document.querySelector("input[type=number]").value'),'800','failed saves must preserve draft');
          await capture('settings-light');
          await run('window.theme("codex-dark")'); await new Promise(r=>setTimeout(r,300)); await capture('settings-dark');
          await run('window.theme("codex-light")');
          console.log('PASS delayed config, independent navigation, save feedback, saved values and failure draft');
          await clickText('软件运行日志'); await wait('document.body.innerText.includes("加载失败")');
          await clickText('查看详情'); assert(await run('document.querySelector(".log-settings__details").textContent.includes("fixture failure")'));
          await capture('logs-light');
          await run('window.theme("codex-dark")'); await capture('logs-dark'); await run('window.theme("codex-light")');
          win.setSize(1000,700); await new Promise(r=>setTimeout(r,150));
          assert(await run('(()=>{const page=document.querySelector(".log-settings");return page.scrollWidth<=page.clientWidth+1})()'),'log settings must not overflow');
          await capture('logs-narrow'); win.setSize(1440,900);
          await change('input[aria-label="搜索日志"]','fixture failure'); await wait('document.body.innerText.includes("加载失败")');
          await change('input[aria-label="搜索日志"]','no-such-entry'); await wait('document.body.innerText.includes("暂无符合条件的日志")');
          await clickText('模型与供应商'); await wait('document.body.innerText.includes("模型上下文容量")');
          await capture('models-light');
          assert(await run('(()=>{const cards=[...document.querySelectorAll(".model-settings__provider")];return cards.length>1 && cards.every(el=>Math.abs(el.getBoundingClientRect().width-cards[0].getBoundingClientRect().width)<2)})()'),'provider panels must align');
          await run('window.theme("codex-dark")');await new Promise(r=>setTimeout(r,120));await capture('models-dark');
          await run('window.theme("codex-light")');win.setSize(1000,700);await new Promise(r=>setTimeout(r,120));
          assert(await run('(()=>{const page=document.querySelector(".model-settings");return page.scrollWidth<=page.clientWidth+1})()'),'model settings must not overflow at smaller window sizes');
          await capture('models-narrow');win.setSize(1440,900);
          assert.equal(await run('window.wbRefreshes'),0,'opening settings must not refresh remote WorkBuddy account');
          await run('(()=>{const el=document.querySelector("select[aria-label=上下文容量供应商]");Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(el,"gemini");el.dispatchEvent(new Event("change",{bubbles:true}));})()');
          await wait('document.querySelector("select[aria-label=上下文容量供应商]").value==="gemini"');
          await change('input[aria-label=模型上下文容量]','123456');
          await change('input[aria-label=模型最大输出]','8192');
          await clickText('保存容量'); await wait('window.saves.length===3'); await run('window.finishSave()');
          await wait('Array.from(document.querySelectorAll("button")).some(b=>b.textContent==="保存容量"&&!b.disabled)');
          await run('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="保存").click()');
          await wait('window.saves.length===4');
          assert.equal(await run('window.saves.at(-1).models[0].contextWindow'),123456,'provider save must retain capacity edited in another panel');
          await run('window.failSave()');
          await wait('Array.from(document.querySelectorAll("button")).some(b=>b.textContent==="保存"&&!b.disabled)');
          await clickText('关闭'); await run('window.openSettings()'); await wait('window.resolveLoads.length===3');
          await clickText('关闭'); await run('window.openSettings()'); await wait('window.resolveLoads.length===4');
          await run('window.resolveLoads[3].resolve()'); await wait('document.querySelector("input[type=number]")?.value==="640"');
          await change('input[type=number]','960'); await run('window.resolveLoads[2].resolve()');
          await new Promise(r=>setTimeout(r,50));
          assert.equal(await run('document.querySelector("input[type=number]").value'),'960','stale load must not reset current draft');
          await clickText('关闭'); await run('window.openSettings()'); await wait('window.resolveLoads.length===5');
          await run('window.resolveLoads[4].reject(new Error("配置暂不可读"))');
          await wait('Boolean(document.querySelector("[role=alert]"))');
          assert.equal(await run('document.querySelectorAll("input[type=number]").length'),0);
          await clickText('重新加载'); await wait('window.resolveLoads.length===6');
          await run('window.resolveLoads[5].resolve()'); await wait('document.querySelector("input[type=number]")?.value==="640"');
          await run('window.mode("catalog")'); await wait('Boolean(document.querySelector("form"))');
          const metrics=await run('window.typeName()');console.log('CATALOG BENCHMARK',metrics);
          assert(metrics.nodes<1800,'catalog must not mount thousands of offscreen model rows');
          await change('input[aria-label="搜索模型"]','model-1999');
          await wait('Boolean(document.querySelector("[data-model-id=model-1999]"))');
          await run('window.rejectCatalog=true'); await clickText('保存修改');
          await wait('window.toasts.at(-1)?.type==="error"');
          assert(await run('Boolean(document.querySelector("form"))'));
          await run('window.rejectCatalog=false'); await clickText('保存修改');
          await wait('window.saves.length===6');
          assert.equal(await run('window.saves.at(-1).models.length'),2000,'search and pagination must preserve entire catalog');
          await capture('settings-catalog');
          assert.deepEqual(await run('window.errors'),[]);
          console.log('PASS 2,000-model editing, full catalog retention, search and recoverable save failure');
          await run('window.mode("settings")');await wait('window.resolveLoads.length===7');await run('window.resolveLoads[6].resolve()');
          await clickText('模型与供应商');
          const deep='[data-provider-id=deepseek]';
          await wait('Boolean(document.querySelector('+JSON.stringify(deep)+'))');
          await run('document.querySelector('+JSON.stringify(deep)+').scrollIntoView({block:"start"})');
          assert.equal(await run('document.querySelector('+JSON.stringify(deep)+'+" [role=button]").getAttribute("aria-expanded")'),'false');
          await capture('providers-uniform');
          await run('window.theme("codex-dark")');await capture('providers-uniform-dark');
          await run('window.theme("codex-light")');win.setSize(1000,700);await new Promise(r=>setTimeout(r,120));
          await run('document.querySelector('+JSON.stringify(deep)+').scrollIntoView({block:"start"})');await capture('providers-uniform-narrow');
          assert(await run('(()=>{const el=document.querySelector(".model-settings");return el.scrollWidth<=el.clientWidth+1})()'));
          win.setSize(1440,900);await new Promise(r=>setTimeout(r,100));
          await run('(()=>{const head=document.querySelector('+JSON.stringify(deep)+'+" [role=button]");head.focus();head.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));})()');
          await wait('document.querySelector('+JSON.stringify(deep)+'+" [role=button]").getAttribute("aria-expanded")==="true"');
          await change(deep+' input[type=password]','fixture-deepseek-key');
          await run('Array.from(document.querySelectorAll('+JSON.stringify(deep+' button')+')).find(b=>b.textContent.includes("测试连接")).click()');
          await wait('window.testRequests.length===1');assert.equal(await run('window.testRequests[0].id'),'deepseek');
          await run('Array.from(document.querySelectorAll('+JSON.stringify(deep+' button')+')).find(b=>b.textContent==="保存").click()');
          await wait('window.saves.length===7');assert.equal(await run('window.saves[6].apiKey'),'fixture-deepseek-key');
          assert.equal(await run('window.saves[6].models.length'),2);await run('window.finishSave()');
          await wait('document.querySelector('+JSON.stringify(deep)+'+" [role=button]").getAttribute("aria-expanded")==="true"');
          await capture('providers-deepseek-expanded');
          console.log('PASS DeepSeek uses the common expandable provider, supports keyboard, connection test and save');
        }
        win.destroy(); app.exit(0);
      }catch(error){console.error(error);win.destroy();app.exit(1);}
    });
  `);
  const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((resolve,reject)=>{
    const child=spawn(createRequire(import.meta.url)('electron'),[path.join(fixture,'host.cjs'),'--no-sandbox'],{env,stdio:['ignore','pipe','pipe']});
    const timer=setTimeout(()=>{child.kill();reject(new Error('Settings UI test timed out'));},40000);
    child.stdout.on('data',data=>process.stdout.write(data));child.stderr.on('data',data=>process.stderr.write(data));
    child.on('error',error=>{clearTimeout(timer);reject(error);});child.on('exit',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('Settings UI exited '+code));});
  });
} finally { await fs.rm(fixture,{recursive:true,force:true}); }
