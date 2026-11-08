import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';

const root = process.cwd();
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-connector-dialog-'));
const screenshots = process.argv.includes('--screenshots') ? path.join(os.tmpdir(), 'neocrm-connector-qa') : null;
try {
  await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React, {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {CustomEnvModal} from './src/components/CustomEnvModal';
    import {applyThemeToDom, DEFAULT_THEME_CONFIG} from './src/utils/themeManager';
    window.neoApi = {testConnectivity: async () => ({success:true})};
    window.saved = [];
    window.theme = palette => applyThemeToDom({...DEFAULT_THEME_CONFIG,palette,glassEnabled:false,groundGlow:false});
    window.theme('codex-light');
    function Harness() { const [open,setOpen] = useState(true); return <><button onClick={()=>setOpen(true)}>打开连接器</button><CustomEnvModal isOpen={open} onClose={()=>setOpen(false)} onSave={env=>window.saved.push(env)} /></>; }
    createRoot(document.getElementById('root')).render(<Harness />);
  ` }, bundle: true, platform: 'browser', format: 'iife', outfile: path.join(fixture, 'renderer.js'), define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent' });
  const css = (await fs.readdir(path.join(root, 'dist/assets'))).filter(file => file.endsWith('.css'));
  await fs.writeFile(path.join(fixture, 'index.html'), `<!doctype html><html lang="zh"><head><meta name="viewport" content="width=device-width,initial-scale=1">${css.map(file => `<link rel="stylesheet" href="${path.join(root,'dist/assets',file)}">`).join('')}</head><body><div id="root"></div><script src="renderer.js"></script></body></html>`);
  await fs.writeFile(path.join(fixture, 'host.cjs'), `
    const {app,BrowserWindow}=require('electron'); const assert=require('node:assert/strict'); const fs=require('node:fs/promises'); const path=require('node:path');
    app.setPath('userData',${JSON.stringify(path.join(fixture,'user-data'))});
    app.whenReady().then(async()=>{
      const win=new BrowserWindow({show:false,width:1100,height:900,webPreferences:{backgroundThrottling:false}});
      const run=code=>win.webContents.executeJavaScript(code);
      const wait=async code=>{for(let i=0;i<200;i++){if(await run(code))return;await new Promise(r=>setTimeout(r,25));}throw Error('timeout '+code)};
      const click=selector=>run('document.querySelector('+JSON.stringify(selector)+').click()');
      const capture=async name=>{const dir=${JSON.stringify(screenshots)};if(dir){await new Promise(r=>setTimeout(r,200));await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,name+'.png'),(await win.webContents.capturePage()).toPNG());}};
      const geometry=()=>run('(()=>{const d=document.querySelector(".connector-dialog").getBoundingClientRect(), f=document.querySelector(".connector-dialog__form"), b=document.querySelector(".connector-dialog__footer").getBoundingClientRect();return {width:d.width,height:d.height,top:d.top,bottom:d.bottom,footerTop:b.top,footerBottom:b.bottom,scrollHeight:f.scrollHeight,clientHeight:f.clientHeight,scrollTop:f.scrollTop,region:getComputedStyle(document.querySelector(".connector-dialog").parentElement).webkitAppRegion}})()');
      try {
        await win.loadFile(${JSON.stringify(path.join(fixture,'index.html'))}); await wait('Boolean(document.querySelector(".connector-dialog"))');
        for (const [width,height] of [[1100,900],[620,700]]) {
          win.setSize(width,height); await new Promise(r=>setTimeout(r,100)); let size;
          for (const type of ['销售易','Salesforce','纷享销客','自定义 CRM']) {
            await run('Array.from(document.querySelectorAll("button[aria-pressed]")).find(b=>b.textContent.includes('+JSON.stringify(type)+')).click()');
            await wait('Array.from(document.querySelectorAll("button[aria-pressed]")).some(b=>b.textContent.includes('+JSON.stringify(type)+') && b.getAttribute("aria-pressed")==="true")');
            const result=await geometry();
            if (!size) size=result; else {assert.equal(result.width,size.width);assert.equal(result.height,size.height);}
            assert(result.footerBottom<=height-8 && result.footerTop>=result.top && result.bottom<=height,JSON.stringify(result));
            assert.equal(result.region,'no-drag');
            if(type==='Salesforce') {assert(result.scrollHeight>result.clientHeight); await capture('salesforce-'+width);await run('document.querySelector(".connector-dialog__form").scrollTop=99999');await new Promise(r=>setTimeout(r,50));const scrolled=await geometry();assert(scrolled.scrollTop>0);assert.equal(scrolled.footerTop,result.footerTop);}
            if(type==='销售易') await capture('neocrm-'+width);
          }
        }
        await run('window.theme("codex-dark")');await capture('dark');
        await run('Array.from(document.querySelectorAll("button[aria-pressed]")).find(b=>b.textContent.includes("销售易")).click()');
        await click('.connector-dialog__footer button[type=submit]'); await wait('window.saved.length===1');
        assert.equal(await run('window.saved[0].productType'),'neocrm');await wait('!document.querySelector(".connector-dialog")');
        await click('#root > button');await wait('Boolean(document.querySelector(".connector-dialog"))');await click('.connector-dialog button[aria-label="关闭"]');await wait('!document.querySelector(".connector-dialog")');
        console.log('PASS consistent connector dialog sizes, scrollable content, fixed actions, small window, submit and close');win.destroy();app.exit(0);
      }catch(e){console.error(e);app.exit(1)}
    });
  `);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((resolve,reject)=>{const child=spawn(createRequire(import.meta.url)('electron'),[path.join(fixture,'host.cjs')],{env,stdio:'inherit'});const timeout=setTimeout(()=>{child.kill();reject(Error('test timed out'))},30000);child.on('exit',code=>{clearTimeout(timeout);code===0?resolve():reject(Error('test exited '+code))});child.on('error',reject)});
} finally { await fs.rm(fixture,{recursive:true,force:true}); }
