import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
// The administrator-only generator is deliberately absent from published sources.
const generatorPath = new URL('./generate-license.mjs', import.meta.url);
const generateLicensePassword = fsSync.existsSync(generatorPath)
  ? (await import(generatorPath.href)).generateLicensePassword : null;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-hidden-access-'));
const originalNow = Date.now;
try {
  await fs.mkdir(path.join(fixture, 'tmp'));
  const subjectFile = path.join(fixture, 'subject.cjs');
  await build({ stdin: { resolveDir: root, loader: 'ts', contents: `
    export * from './shared/restrictedFeatures';
    export { licenseService } from './electron/security/licenseService';
    export { RestrictedFeatureService, restrictedFeatureService } from './electron/security/restrictedFeatureService';
    export { getProtectedSkillInstruction, isProtectedBuiltinSkill } from './electron/security/protectedHarness';
    export { AiService } from './electron/services/aiService';
  ` }, bundle: true, platform: 'node', format: 'cjs', outfile: subjectFile, external: ['esbuild'], logLevel: 'silent',
    plugins: [{ name: 'isolated-access-host', setup(builder) {
      builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'fixture' }));
      builder.onLoad({ filter: /^electron$/, namespace: 'fixture' }, () => ({ contents: `
        export const app = { getPath: () => ${JSON.stringify(fixture)} };
        export const dialog = {}, shell = {}, BrowserWindow = class {};
      ` }));
      builder.onResolve({ filter: /^os$/ }, () => ({ path: 'os', namespace: 'fixture' }));
      builder.onLoad({ filter: /^os$/, namespace: 'fixture' }, () => ({ contents: `
        import original from 'node:os';
        export default { ...original, homedir: () => ${JSON.stringify(fixture)}, tmpdir: () => ${JSON.stringify(path.join(fixture, 'tmp'))} };
      ` }));
    } }],
  });
  const subject = createRequire(import.meta.url)(subjectFile);
  const { parseAccessCommand, licenseService, restrictedFeatureService: access, RestrictedFeatureService,
    getProtectedSkillInstruction: readSkill, isProtectedBuiltinSkill } = subject;
  for (const [input, expected] of [['/neo-access unlock', 'unlock'], ['neo-access lock','lock'],
    [' neo-access status ', 'status'], ['/neo-access unlock inline-key', 'invalid'],
    ['neo-access unlock\nwhoami','invalid'], ['/neo-access','invalid'], ['echo neo-access unlock',null],
    ['请解释 neo-access unlock',null], ['/flow',null]]) assert.equal(parseAccessCommand(input),expected,input);
  console.log('PASS command boundary: exact local commands; inline keys/multiline commands consumed; ordinary text unaffected');

  let now = originalNow(); Date.now = () => now;
  licenseService.getDeviceFingerprintHash = () => 'fixture-device';
  licenseService.getMachineCode = () => 'fixture-machine';
  const aliases = ['neobi-architect','preset-neobi-architect','skill-neobi-architect',
    'autoflow-architect','preset-autoflow-architect','skill-autoflow-architect',
    ...['manage-neocrm-permissions', 'configure-neocrm-mobile'].flatMap(id => [id, `skill-${id}`, `preset-${id}`])];
  assert.deepEqual(access.getStatus(), { visible:false });
  for (const alias of aliases) { assert(isProtectedBuiltinSkill(alias)); assert.equal(readSkill(alias),null); }
  assert(readSkill('preset-nex-architect')?.length > 100);
  assert(readSkill('preset-approval-architect')?.length > 100);
  const fixtureLicense = {
    getLicenseStatus: () => ({ isAuthorized: true }),
    activateLicense: (input) => ({ success: input === 'fixture-key', message: 'fixture', status: { isAuthorized: input === 'fixture-key' } }),
  };
  const probe = new RestrictedFeatureService(fixtureLicense);
  assert.equal(probe.getStatus().visible, false);
  assert.equal(probe.unlock('wrong').success, false);
  assert.equal(probe.unlock('fixture-key').success, true);
  probe.lock(); assert.equal(probe.getStatus().visible, false);
  assert.equal(new RestrictedFeatureService(fixtureLicense).getStatus().visible, false);
  assert(probe.unlock('fixture-key').success);
  fixtureLicense.getLicenseStatus = () => ({ isAuthorized: false });
  assert.equal(probe.getStatus().visible, false);
  console.log('PASS access policy: explicit verification required despite active license; invalid key, lock, restart and revoked authorization stay hidden');

  if (generateLicensePassword) {
  const generated = generateLicensePassword(1);
  const key = typeof generated === 'string' ? generated : generated.password || generated.encryptedPassword;
  assert.equal(typeof key,'string');
  assert(licenseService.activateLicense(key).success);
  const expiry = licenseService.getLicenseStatus().expiresAt;
  assert.equal(access.getStatus().visible,false,'pre-existing license must not disclose roles');
  now += 1000;
  assert.equal(access.unlock('wrong-key').success,false);
  assert.equal(access.getStatus().visible,false);
  now += 1000;
  assert(access.unlock(key).success,'a valid key already bound to this device can be reused');
  assert.equal(access.getStatus().expiresAt,expiry,'reentry must not extend license');
  for (const alias of aliases) assert(readSkill(alias)?.length > 100,alias);
  const events=[]; const unsubscribe=access.onChange(state => events.push(state));
  assert.equal(new RestrictedFeatureService(licenseService).getStatus().visible,false,'restart hides despite persisted device license');
  access.lock();
  for (const alias of aliases) assert.equal(readSkill(alias),null,'cached instruction remains gated');
  now += 1000;
  assert(access.unlock(key).success);
  assert.equal(licenseService.getLicenseStatus().expiresAt,expiry);
  assert(!JSON.stringify([events,access.getStatus()]).includes(key));
  const protectedAsset=await fs.readFile(path.join(root,'electron/security/restrictedSkillAssets.json'),'utf8');
  for (const value of Object.values(JSON.parse(protectedAsset))) assert.match(value,/^neo-skill:v1:/);
  const vault=await fs.readFile(path.join(fixture,'.neocrm/workflow_security_vault_v2.dat'));
  assert(!vault.includes(Buffer.from(key)),'no plaintext key in disk vault');
  licenseService.getDeviceFingerprintHash=()=> 'other-device'; now+=1000;
  assert.equal(access.getStatus().visible,false,'device change closes disclosure');
  assert.equal(access.unlock(key).success,false,'consumed key must not bind another device');
  licenseService.getDeviceFingerprintHash=()=> 'fixture-device'; now+=1000;
  assert.equal(access.unlock(key).success,false,'device mismatch permanently invalidates consumed activation');
  now+=1000;
  const renewed=generateLicensePassword(1);
  const renewedKey=typeof renewed==='string'?renewed:renewed.password||renewed.encryptedPassword;
  assert(access.unlock(renewedKey).success);
  now=access.getStatus().expiresAt+1000;
  assert.equal(access.getStatus().visible,false,'expiration closes disclosure');
  assert.equal(access.unlock(renewedKey).success,false,'expired key does not disclose roles');
  unsubscribe();
  console.log('PASS real license: existing activation stays hidden, wrong key rejected, valid same-device reentry, no renewal, device/expiry checks, encrypted assets, restart/lock close access');
  } else {
    console.log('SKIP administrator-only key issuance integration (generator excluded from published sources)');
  }

  let prepared=0;
  const ai=new subject.AiService({ prepareNeoCliForConversation(){ prepared++;throw new Error('must not prepare'); } }, {}, {});
  const stream=(presetPrompt,activeSkillIds,storedPreset)=>{
    const events=[];
    ai.getSessions=()=>storedPreset ? [{id:'history',presetId:storedPreset,messages:[{role:'user',content:'old'}]}] : [];
    return ai.startChatStream({requestId:'fixture',sessionId:'history',messageId:'reply',providerId:'none',modelId:'none',
      messages:[],presetPrompt,activeSkillIds},event=>events.push(event)).then(()=>events);
  };
  for (const id of ['neobi-architect','autoflow-architect']) {
    assert((await stream(`[PROTECTED_PRESET::${id}]`)).some(event=>event.type==='error'));
    assert((await stream(undefined,undefined,id)).some(event=>event.type==='error'));
    assert((await stream(undefined,[`skill-${id}`])).some(event=>event.type==='error'));
    await assert.rejects(ai.executeCrmTool('skill',{name:`preset-${id}`}),/未找到/);
  }
  assert.equal(prepared,0);
  console.log('PASS backend: hidden role prompts, stale sessions and skill aliases rejected before project/auth/model work');
  Date.now=originalNow;

  // Real renderer interactions in a separate Electron profile, with fake local IPC only.
  await build({ stdin:{resolveDir:root,loader:'tsx',contents:`
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { flushSync } from 'react-dom';
    import { AppSidebar } from './src/components/AppSidebar';
    import { AiSidebar } from './src/components/ai/AiSidebar';
    import { AiInputComposer } from './src/components/ai/AiInputComposer';
    import { CodexTerminalPanel } from './src/components/ai/CodexTerminalPanel';
    import { SkillSettings } from './src/components/settings/SkillSettings';
    import { RestrictedFeaturesProvider, consumeAccessCommand } from './src/security/RestrictedFeatures';
    import { AI_AGENT_PRESETS, BUILTIN_AI_SKILLS } from './shared/constants';
    const root=createRoot(document.getElementById('root')), noop=()=>{};
    let status={visible:false}, prompt=()=>{}, changed=()=>{}, renderId=0;
    window.sent=[];window.shell=[];window.keys=[];
    window.neoApi={
      restrictedAccessStatus:async()=>status,
      onRestrictedAccessChanged:cb=>{changed=cb;return()=>{changed=()=>{}}},
      onRestrictedAccessPrompt:cb=>{prompt=cb;return()=>{prompt=()=>{}}},
      restrictedAccessCommand:async action=>{if(action==='unlock'||action==='invalid')prompt();if(action==='lock'){status={visible:false};changed(status)}},
      restrictedAccessUnlock:async key=>{window.keys.push(key);const success=key==='fixture-valid';if(success){status={visible:true};changed(status)}return{success,message:success?'验证通过':'验证未通过',status}},
      terminalExecute:async params=>{window.shell.push(params);return{stdout:'fixture-output',stderr:'',exitCode:0}},
    };
    window.command=consumeAccessCommand;
    window.testRender=(kind,visible=false)=>{
      status={visible};
      const common={sessions:[{id:'hidden-history',title:'PRIVATE_HISTORY',presetId:'neobi-architect',messages:[{role:'user',content:'old'}]}],
        activeSessionId:null,selectedPresetId:'harness-agent',presets:AI_AGENT_PRESETS,onSelectPreset:noop,onSelectSession:noop,
        projects:[{id:'fixture-project',name:'FIXTURE_PROJECT',localPath:'/fixture',isDefault:true}],activeProjectId:'fixture-project',onSelectProject:noop,
        onNewChatDraft:noop,onDeleteSession:noop,onUpdateSessionTitle:noop,onClearSessions:noop,session:{isLoggedIn:false},
        workflowLicenseStatus:{isAuthorized:true,remainingDays:10}};
      const node=kind==='app'?<AppSidebar {...common} activeTab='ai' platform='darwin'/>:
        kind==='sidebar'?<AiSidebar {...common}/>:
        kind==='skills'?<SkillSettings skills={BUILTIN_AI_SKILLS} onSaveSkill={noop} onDeleteSkill={noop} showToast={noop}/>:
        kind==='terminal'?<CodexTerminalPanel isOpen={true} activePanelTab='terminal' onClose={noop}/>:
        <AiInputComposer isCrmLoggedIn={false} isStreaming={false} onSend={(...args)=>window.sent.push(args)} onStop={noop}
          entityRefs={[]} onRemoveEntityRef={noop} onOpenEntityPicker={noop} enableTools={true} onToggleTools={noop}/>;
      flushSync(()=>root.render(<RestrictedFeaturesProvider key={++renderId}>{node}</RestrictedFeaturesProvider>));
    };
    window.testReady=true;
  `},bundle:true,platform:'browser',format:'iife',outfile:path.join(fixture,'renderer.js'),logLevel:'silent'});
  await fs.writeFile(path.join(fixture,'index.html'),'<!doctype html><html><body><div id="root"></div><script src="./renderer.js"></script></body></html>');
  const host=path.join(fixture,'host.cjs');
  await fs.writeFile(host,`
    const {app,BrowserWindow}=require('electron');
    const assert=require('node:assert/strict');
    app.setPath('userData',${JSON.stringify(path.join(fixture,'electron-profile'))});
    app.whenReady().then(async()=>{
      const win=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}});
      const run=code=>win.webContents.executeJavaScript(code), pause=()=>new Promise(resolve=>setTimeout(resolve,50));
      const click=label=>run('Array.from(document.querySelectorAll("button")).find(b=>b.innerText.includes('+JSON.stringify(label)+')).click()');
      const fill=async(selector,value)=>{await run('(()=>{const node=document.querySelector('+JSON.stringify(selector)+');const proto=node.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value").set.call(node,'+JSON.stringify(value)+');node.dispatchEvent(new Event("input",{bubbles:true}));})()');await pause()};
      const enter=selector=>run('document.querySelector('+JSON.stringify(selector)+').dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))');
      const text=()=>run('document.body.innerText');
      try{
        await win.loadFile(${JSON.stringify(path.join(fixture,'index.html'))});await pause();
        for(const kind of ['app','sidebar']){
          await run('window.testRender('+JSON.stringify(kind)+',false)');await pause();
          if(kind==='app'){await run('Array.from(document.querySelectorAll("[title]")).find(node=>node.title.startsWith("本地路径: /fixture")).click()');await pause()}
          await click('NeoCRM');await pause();
          let body=await text();assert(!body.includes('BI分析部署大师'));assert(!body.includes('自动流程架构与部署专家'));assert(!body.includes('PRIVATE_HISTORY'));
          assert(body.includes('Nex页面扩展大师'));assert(body.includes('审批流架构与部署专家'));
          await run('window.command("/neo-access unlock")');await pause();
          assert.equal(await run('document.querySelector("input[aria-label=密钥]").type'),'password');
          await click('取消');await pause();assert(!(await text()).includes('BI分析部署大师'));
          await run('window.command("/neo-access unlock")');await pause();await fill('input[type=password]','wrong');
          await run('document.querySelector("form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))');await pause();
          assert((await text()).includes('验证未通过'));assert(!(await text()).includes('BI分析部署大师'));
          await fill('input[type=password]','fixture-valid');await run('document.querySelector("form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))');await pause();
          body=await text();assert(body.includes('BI分析部署大师'));assert(body.includes('自动流程架构与部署专家'));assert(body.includes('PRIVATE_HISTORY'));
          await run('window.command("neo-access lock")');await pause();assert(!(await text()).includes('BI分析部署大师'));assert(!(await text()).includes('PRIVATE_HISTORY'));
        }
        for(const visible of [false,true]){
          await run('window.testRender("skills",'+visible+')');await pause();const body=await text();
          assert.equal(body.includes('BI 分析部署规范'),visible);assert.equal(body.includes('自动流程架构与部署规范'),visible);
          assert.equal(body.includes('销售易用户及权限管理'),visible);assert.equal(body.includes('销售易移动端配置'),visible);
        }
        console.log('PASS renderer: both menus/history/skills hidden despite active license; cancel/wrong key stay hidden; valid masked verification reveals; lock hides immediately');
        await run('window.testRender("composer",false)');await pause();await fill('textarea','/');await pause();
        assert(!(await text()).includes('自动流程设计'));assert(!(await text()).includes('neo-access'));
        await fill('textarea','/neo-access unlock');await enter('textarea');await pause();
        assert(await run('Boolean(document.querySelector("input[type=password]"))'));
        assert.equal(await run('window.sent.length'),0);assert.equal(await run('document.querySelector("textarea").value'),'');
        await click('取消');await fill('textarea','普通消息');await enter('textarea');await pause();assert.equal(await run('window.sent.length'),1);
        await run('window.testRender("composer",true)');await pause();await fill('textarea','/');await pause();assert((await text()).includes('自动流程设计'));
        await run('window.testRender("terminal",false)');await pause();const selector='input[placeholder^="输入 Shell"]';
        await fill(selector,'neo-access unlock inline-secret');await enter(selector);await pause();
        assert(await run('Boolean(document.querySelector("input[type=password]"))'));assert.equal(await run('window.shell.length'),0);
        assert(!(await text()).includes('inline-secret'));await click('取消');await fill(selector,'echo fixture');await enter(selector);await pause();assert.equal(await run('window.shell.length'),1);
        assert(!(await text()).includes('inline-secret'));assert.equal(await run('window.sent.flat().some(x=>String(x).includes("fixture-valid"))'),false);
        console.log('PASS renderer commands: hidden from completion/help, no chat/model submission, no terminal history/shell/key echo, ordinary chat/shell unchanged');
        win.destroy();app.exit(0);
      }catch(error){console.error(error);win.destroy();app.exit(1)}
    }).catch(error=>{console.error(error);app.exit(1)});
  `);
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((resolve,reject)=>{
    const child=spawn(createRequire(import.meta.url)('electron'),[host,'--no-sandbox'],{env,stdio:['ignore','pipe','pipe']});
    const timeout=setTimeout(()=>{child.kill();reject(new Error('Hidden-access UI test timed out'))},45000);
    child.stdout.on('data',data=>process.stdout.write(data));child.stderr.on('data',data=>process.stderr.write(data));
    child.on('error',error=>{clearTimeout(timeout);reject(error)});
    child.on('exit',code=>{clearTimeout(timeout);code===0?resolve():reject(new Error('Hidden-access UI test exited with '+code))});
  });
} finally {
  Date.now=originalNow;
  await fs.rm(fixture,{recursive:true,force:true});
}
