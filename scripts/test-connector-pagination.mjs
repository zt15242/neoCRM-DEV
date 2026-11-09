import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
const root=process.cwd(), dir=await fs.mkdtemp(path.join(os.tmpdir(),'neo-connector-pages-'));
try {
  await build({stdin:{resolveDir:root,loader:'tsx',contents:`
    import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
    import {EnvironmentSelector} from './src/components/EnvironmentSelector';
    import {applyThemeToDom,DEFAULT_THEME_CONFIG} from './src/utils/themeManager';
    window.theme=palette=>applyThemeToDom({...DEFAULT_THEME_CONFIG,palette,glassEnabled:false,groundGlow:false});window.theme('codex-light');
    window.neoApi={testConnectivity:async()=>({success:true,responseTimeMs:1})};window.opened=[];
    function Harness(){const [items,setItems]=useState(Array.from({length:13},(_,i)=>({id:String(i+1),name:'连接器 '+(i+1),neoBaseURL:'https://example.test',productType:i<7?'neocrm':'salesforce',envType:'sandbox'})));return <div style={{padding:'20px'}}><EnvironmentSelector environments={items} selectedEnvId="1" onSelect={()=>{}} onOpenDetail={id=>window.opened.push(id)} onAddCustom={()=>{}} onEditCustom={()=>{}} onDeleteCustom={id=>setItems(old=>old.filter(item=>item.id!==id))}/></div>};createRoot(document.getElementById('root')).render(<Harness/>);
  `},bundle:true,platform:'browser',format:'iife',outfile:path.join(dir,'renderer.js'),define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
  const css=(await fs.readdir(path.join(root,'dist/assets'))).filter(x=>x.endsWith('.css'));
  await fs.writeFile(path.join(dir,'index.html'),`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">${css.map(f=>`<link rel="stylesheet" href="${path.join(root,'dist/assets',f)}">`).join('')}<div id="root"></div><script src="renderer.js"></script>`);
  await fs.writeFile(path.join(dir,'host.cjs'),`
    const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs');
    app.setPath('userData',${JSON.stringify(path.join(dir,'user'))});app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:1200,height:900});const run=c=>win.webContents.executeJavaScript(c);const wait=async c=>{for(let i=0;i<150;i++){if(await run(c))return;await new Promise(r=>setTimeout(r,20))}throw Error(c)};try{
      await win.loadFile(${JSON.stringify(path.join(dir,'index.html'))});await wait('document.querySelectorAll(".connector-hub__card").length===6');
      assert(await run('document.querySelector(".connector-pagination").innerText.includes("第 1 / 3 页")'));
      await run('document.querySelector("[aria-label=下一页]").click()');await wait('document.querySelector(".connector-pagination").innerText.includes("第 2 / 3 页")');
      assert(await run('document.querySelector(".connector-hub__card").innerText.includes("连接器 7")'));
      await run('document.querySelector("[aria-label=下一页]").click()');await wait('document.querySelectorAll(".connector-hub__card").length===1');
      await run('document.querySelector("[title=移除自定义连接器]").click()');await wait('document.querySelector(".connector-pagination").innerText.includes("第 2 / 2 页")');
      await run('Array.from(document.querySelectorAll(".connector-hub__filters button")).find(b=>b.innerText.includes("销售易")).click()');await wait('document.querySelector(".connector-pagination").innerText.includes("第 1 / 2 页")');
      await run('document.querySelector("[aria-label=下一页]").click()');await wait('document.querySelectorAll(".connector-hub__card").length===1');
      await run('document.querySelector(".connector-hub__card").click()');assert.equal(await run('window.opened[0]'),'7');
      await run('Array.from(document.querySelectorAll(".connector-hub__filters button")).find(b=>b.innerText.includes("自定义 CRM")).click()');await wait('document.body.innerText.includes("此分类暂无连接器")');
      await run('Array.from(document.querySelectorAll(".connector-hub__filters button"))[0].click()');await wait('document.querySelectorAll(".connector-hub__card").length===6');
      for(const [width,height,theme] of [[1200,900,'codex-light'],[750,700,'codex-dark']]){win.setSize(width,height);await run('window.theme('+JSON.stringify(theme)+')');await new Promise(r=>setTimeout(r,150));assert(await run('document.querySelector(".connector-hub").scrollWidth<=document.querySelector(".connector-hub").clientWidth+1'));if(${JSON.stringify(process.argv.includes('--screenshots'))})fs.writeFileSync('/tmp/neocrm-connector-pages-'+width+'.png',(await win.webContents.capturePage()).toPNG());}
      console.log('PASS connector pagination, category reset, deletion clamp, card actions and responsive themes');app.exit(0);
    }catch(e){console.error(e);app.exit(1)}});
  `);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((resolve,reject)=>{const child=spawn(createRequire(import.meta.url)('electron'),[path.join(dir,'host.cjs')],{env,stdio:'inherit'});const t=setTimeout(()=>{child.kill();reject(Error('timeout'))},30000);child.on('exit',c=>{clearTimeout(t);c===0?resolve():reject(Error('test exited '+c))});child.on('error',reject)});
} finally {await fs.rm(dir,{recursive:true,force:true})}
