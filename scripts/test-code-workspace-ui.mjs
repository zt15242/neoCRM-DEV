import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
const root = process.cwd();
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-code-workspace-ui-'));
const screenshotDir = process.argv.includes('--screenshots') ? path.join(os.tmpdir(), 'neocrm-workspace-qa') : null;
try {
  const project = path.join(fixture, 'workspace');
  await fs.mkdir(project);
  await fs.writeFile(path.join(project, 'app.ts'), '// 项目入口\r\nexport const greeting = "Hello NeoCRM";\r\n');
  await fs.writeFile(path.join(project, 'config.json'), '{\n  "name": "crm-project",\n  "version": "1.8.42"\n}\n');
  await fs.writeFile(path.join(project, 'large.txt'), Buffer.alloc(2 * 1024 * 1024 + 1, 65));
  const deepSegments = ['neocrm-src', 'codepackages', 'other-account-trigger', 'src', 'other', 'account', 'trigger'];
  const deepDirectory = path.join(project, ...deepSegments);
  await fs.mkdir(deepDirectory, { recursive: true });
  for (const name of ['TriggerContextDemo01.java', 'TriggerContextDemo02.java', 'TriggerContextDemo01WithAReallyLongBusinessDescriptionAndActionTracking.java']) {
    await fs.writeFile(path.join(deepDirectory, name), 'package other.account.trigger;\n\npublic class '+name.replace('.java','')+' {\n    // 触发器示例\n}\n');
  }
  const subject = path.join(fixture, 'subject.cjs');
  await build({ stdin: { resolveDir: root, contents: `export { ProjectEditorService } from './electron/services/projectEditorService'; export { ProjectDirectoryReader } from './electron/services/projectDirectoryReader';`, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', outfile: subject, logLevel: 'silent' });
  await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { EditorView } from '@codemirror/view';
    import { undo } from '@codemirror/commands';
    import { App } from './src/App';
    import { RestrictedFeaturesProvider } from './src/security/RestrictedFeatures';
    import { DEFAULT_AI_SETTINGS, BUILTIN_AI_PROVIDERS } from './shared/constants';
    import { applyThemeToDom, DEFAULT_THEME_CONFIG } from './src/utils/themeManager';
    const { ProjectEditorService, ProjectDirectoryReader } = window.require(${JSON.stringify(subject)});
    const editor = new ProjectEditorService(() => [${JSON.stringify(project)}]);
    const reader = new ProjectDirectoryReader();
    const noop = () => () => {};
    window.unexpectedErrors = [];
    window.fileParseCalls = 0;
    window.addEventListener('error', event => window.unexpectedErrors.push(event.message));
    window.addEventListener('unhandledrejection', event => window.unexpectedErrors.push(String(event.reason)));
    window.nextConfirm = false;
    window.confirm = () => window.nextConfirm;
    window.neoApi = {
      getPlatform: async () => 'darwin', getAppVersion: async () => '1.8.42',
      getEnvironments: async () => [], getCurrentSession: async () => ({ isLoggedIn: false }), getAccountHistory: async () => [],
      checkForUpdates: async () => ({ hasUpdate: false }),
      aiGetSessions: async () => [], workflowGetLicenseStatus: async () => ({ isAuthorized: false }),
      aiGetConfig: async () => ({ settings: { ...DEFAULT_AI_SETTINGS, defaultStartupTab: 'ai' }, providers: BUILTIN_AI_PROVIDERS.map(provider => ({ ...provider, apiKey: 'fixture' })), skills: [
        {id:'skill-diagram-design',name:'Diagram Design 图表设计',description:'绘制图表',enabled:true,category:'builtin'},
        {id:'personal-check',name:'个人检查',description:'核查',enabled:true,category:'personal'},
        {id:'disabled-skill',name:'停用技能',description:'停用',enabled:false,category:'builtin'},
        {id:'skill-autoflow-architect',name:'隐藏技能',description:'受保护',enabled:true,category:'builtin'},
      ], mcpServers: [] }),
      aiSaveSession: async session => { window.savedFixture = session; return [session]; },
      aiStartChatStream: async request => { window.startedFixture = request; },
      projectGetProjects: async () => [{ id:'project', name:'CRM 本地项目', localPath:${JSON.stringify(project)}, createdAt:1, updatedAt:1 }],
      projectReadDirectory: params => reader.read(params), editorRead: (root, file) => editor.read(root, file),
      editorSave: (root, file, text, revision) => editor.save(root, file, text, revision),
      fileParseLocalPath: async fullPath => { window.fileParseCalls++; return { id:'fixture:'+fullPath, name:fullPath.split(/[\\/]/).pop(), size:1, mimeType:'text/plain', parsedContent:'fixture file content', fullPath, contentKind:'text' }; },
      projectGetRecentArtifacts: async () => [], projectListFiles: async () => [], jobsList: async () => ({ jobs: [] }),
      onSessionUpdated: noop, onAiStreamEvent: noop, onAgentSessionUpdated: noop, onNeoCliProjectOpened: noop,
      onRestrictedAccessChanged: noop, onRestrictedAccessPrompt: noop, restrictedAccessStatus: async () => ({visible:false}),
      mailGetAccounts: async () => [], mailGetEmails: async () => [],
      meetingGetMeetings: async () => [], meetingGetGlossary: async () => [], onMeetingTranscriptionTaskUpdated: noop,
    };
    window.editorView = () => EditorView.findFromDOM(document.querySelector('.cm-editor'));
    window.setEditorText = text => { const editor = window.editorView(); editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:text}}); };
    window.undoEditor = () => undo(window.editorView());
    window.setTheme = palette => applyThemeToDom({ ...DEFAULT_THEME_CONFIG, palette, glassEnabled:false, groundGlow:false });
    window.setTheme('codex-light');
    createRoot(document.getElementById('root')).render(<RestrictedFeaturesProvider><App /></RestrictedFeaturesProvider>);
  ` }, bundle: true, platform: 'browser', format: 'iife', outfile: path.join(fixture, 'renderer.js'), define: { __APP_VERSION__: '"1.8.42"', 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent' });
  const css = (await fs.readdir(path.join(root, 'dist/assets'))).filter(file => file.endsWith('.css'));
  await fs.writeFile(path.join(fixture, 'index.html'), `<!doctype html><html><head>${css.map(file => `<link rel="stylesheet" href="${path.join(root, 'dist/assets', file)}">`).join('')}<style>body{margin:0}</style></head><body><div id="root"></div><script src="renderer.js"></script></body></html>`);
  const host = path.join(fixture, 'host.cjs');
  await fs.writeFile(host, `
    const { app, BrowserWindow } = require('electron');
    const assert = require('node:assert/strict');
    const fs = require('node:fs/promises');
    const path = require('node:path');
    const project = ${JSON.stringify(project)};
    const deepSegments = ${JSON.stringify(deepSegments)};
    const screenshots = ${JSON.stringify(screenshotDir)};
    app.setPath('userData', ${JSON.stringify(path.join(fixture, 'user-data'))});
    app.whenReady().then(async () => {
      const win = new BrowserWindow({ show:false, width:1440, height:900, webPreferences:{nodeIntegration:true, contextIsolation:false, backgroundThrottling:false} });
      const run = code => win.webContents.executeJavaScript(code);
      const call = (name, ...args) => run('window.'+name+'('+args.map(arg=>JSON.stringify(arg)).join(',')+')');
      win.webContents.on('console-message', event=>{ if(event.level==='error') console.error('RENDERER',event.message); });
      const wait = async code => { for (let attempt=0; attempt<400; attempt++) { if(await run(code)) return; await new Promise(resolve=>setTimeout(resolve,25)); } throw new Error('Timeout: '+code+'\\n'+await run('document.body.innerText.slice(0,2500)')); };
      const click = selector => run('document.querySelector('+JSON.stringify(selector)+').click()');
      const select = name => click('[data-path='+JSON.stringify(path.join(project,name))+']');
      const rail = label => click('.app-activity-rail button[aria-label='+JSON.stringify(label)+']');
      const save = () => click('.code-toolbar button[title="保存 (⌘S / Ctrl+S)"]');
      const capture = async name => { if(screenshots) { await new Promise(resolve=>setTimeout(resolve,200)); await fs.mkdir(screenshots,{recursive:true}); await fs.writeFile(path.join(screenshots,name+'.png'),(await win.webContents.capturePage()).toPNG()); } };
      try {
        await win.loadFile(${JSON.stringify(path.join(fixture, 'index.html'))});
        await wait('Boolean(document.querySelector("[data-path]"))');
        await wait('Boolean(document.querySelector(".composer-input"))');
        assert.deepEqual(await run('Array.from(document.querySelectorAll(".workspace-panel-tab-scroll > button")).map(button=>button.innerText.trim())'),['代码','变更','终端','工具 (0)']);
        await run('(()=>{const input=document.querySelector(".composer-input");input.focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set.call(input,"/jobs");input.dispatchEvent(new Event("input",{bubbles:true}));input.setSelectionRange(5,5)})()');
        await wait('Array.from(document.querySelectorAll(".ai-composer span")).some(el=>el.textContent==="/jobs")');
        await run('Array.from(document.querySelectorAll(".ai-composer span")).find(el=>el.textContent==="/jobs").click()');
        await wait('document.body.innerText.includes("后台异步长任务")');
        await click('.workspace-panel-tab-scroll > button');
        await click('button[title="取消此工具"]');
        for (const width of [1440, 1000, 700]) {
          win.setSize(width, 900); await new Promise(resolve=>setTimeout(resolve,150));
          await run('document.querySelector(".composer-input").focus()');
          const composer = await run('(() => { const box=document.querySelector(".ai-composer"), input=box.querySelector("textarea"), toolbar=box.querySelector(".composer-toolbar"), left=box.querySelector(".composer-controls").getBoundingClientRect(), right=box.querySelector(".composer-tools-right").getBoundingClientRect(); const b=box.getBoundingClientRect(), t=toolbar.getBoundingClientRect(); return {inputOutline:getComputedStyle(input).outlineStyle, inputHeight:input.getBoundingClientRect().height, border:getComputedStyle(box).borderTopColor, within:t.left>=b.left-1 && t.right<=b.right+1 && right.right<=b.right && (left.right<=right.left+1 || right.top>=left.bottom), sameRow:Math.abs(left.top-right.top)<8, width:b.width, overflow:box.scrollWidth>box.clientWidth+1}; })()');
          assert.equal(composer.inputOutline,'none',JSON.stringify(composer));
          assert(composer.inputHeight>=52 && composer.within && !composer.overflow,JSON.stringify({width,...composer}));
          if (composer.width > 400) assert(composer.sameRow,JSON.stringify({width,...composer}));
          assert(await run('(() => { const mode=document.querySelector("button[title^=点击切换运行模式]").getBoundingClientRect(); const model=document.querySelector(".composer-model > button").getBoundingClientRect(); return mode.right<=model.left+1 || model.top>=mode.bottom; })()'),'model must not overlap the mode selector');
          await capture('composer-focused-'+width);
        }
        win.setSize(1440,900);
        assert.equal(await run('document.body.innerText.includes("全能 CRM 架构师")'),true);
        assert.equal(await run('Array.from(document.querySelectorAll("[title]")).filter(el => el.title.includes("切换 AI 智能体预设角色")).length'),0);
        await select('app.ts'); await wait('Boolean(document.querySelector(".cm-editor"))');
        assert.equal(await run('document.querySelectorAll(".app-activity-rail").length'),1);
        assert.equal(await run('document.querySelectorAll(".app-sidebar__navigation button").length'),1);
        await call('setEditorText', '// 中文草稿\\nexport const result = 42;\\n');
        await wait('Boolean(document.querySelector(".code-dirty"))');
        await select('config.json'); await wait('document.querySelector(".code-tab.is-active").innerText.includes("config.json")');
        await click('.code-tab button[title="app.ts"]');
        assert((await run('window.editorView().state.doc.toString()')).includes('result = 42'));
        await run('window.undoEditor()');
        await wait('window.editorView().state.doc.toString().includes("Hello NeoCRM")');
        console.log('PASS UI multi-file drafts and undo survive switching tabs');
        await call('setEditorText', '// 保存测试\\nexport const result = 42;\\n');
        await run('(() => { const editor=window.editorView(); editor.focus(); editor.contentDOM.dispatchEvent(new KeyboardEvent("keydown",{key:"s",code:"KeyS",metaKey:true,bubbles:true,cancelable:true})); })()');
        await wait('!document.querySelector(".code-dirty")');
        assert.equal(await fs.readFile(path.join(project,'app.ts'),'utf8'),'// 保存测试\\r\\nexport const result = 42;\\r\\n');
        await run('window.setEditorText("// keep my draft")');
        await fs.writeFile(path.join(project,'app.ts'),'// changed by AI');
        await save(); await wait('Boolean(document.querySelector(".workbench-error"))');
        assert.equal(await fs.readFile(path.join(project,'app.ts'),'utf8'),'// changed by AI');
        assert.equal(await run('window.editorView().state.doc.toString()'),'// keep my draft');
        await click('button[aria-label="关闭 app.ts"]');
        assert.equal(await run('document.querySelectorAll(".code-tab").length'),2);
        await click('button[aria-label="重新读取磁盘文件"]');
        assert.equal(await run('window.editorView().state.doc.toString()'),'// keep my draft');
        await run('window.nextConfirm=true'); await click('button[aria-label="重新读取磁盘文件"]');
        await wait('window.editorView().state.doc.toString()==="// changed by AI"');
        await select('large.txt'); await wait('document.querySelector(".workbench-error")?.innerText.includes("2 MB")');
        assert.equal(await run('window.editorView().state.doc.toString()'),'// changed by AI');
        console.log('PASS UI CRLF save, conflict preservation, discard confirmation and large-file fallback');
        await click('.code-tab button[title="app.ts"]');
        await run('window.setEditorText("// persisted draft across apps")');
        await wait('Boolean(document.querySelector(".code-dirty"))');
        assert.equal(await run('window.dispatchEvent(new Event("beforeunload",{cancelable:true}))'),false);
        await run('window.nextConfirm=false');
        await click('button[title="关闭分栏"]');
        await wait('document.querySelector(".workspace-panel").classList.contains("is-hidden")');
        await click('button[title="打开代码与终端"]');
        assert.equal(await run('window.editorView().state.doc.toString()'),'// persisted draft across apps');
        await wait('document.querySelector(".workspace-panel").getBoundingClientRect().width > 0');
        await call('setEditorText', '// 客户查询 · 本地草稿\\nexport interface Customer {\\n  id: string;\\n  name: string;\\n}\\n\\nexport async function listCustomers(client: NeoClient) {\\n  const result = await client.query({\\n    entity: \"account\",\\n    fields: [\"id\", \"name\"],\\n    limit: 100,\\n  });\\n  return result.records as Customer[];\\n}\\n');
        await wait('window.editorView().state.doc.toString().includes("listCustomers") && !document.querySelector(".workbench-error") && Boolean(document.querySelector(".code-dirty"))');
        await capture('workspace-light-1440');
        await rail('会议助手 · 纪要与行动项'); await wait('Boolean(document.querySelector("input[placeholder^=搜索会议]"))');
        await run('(() => { const input=document.querySelector("input[placeholder^=搜索会议]"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,"研发周会"); input.dispatchEvent(new Event("input",{bubbles:true})); })()');
        await capture('meetings-light-1440');
        assert.equal(await run('document.querySelector(".suite-sidebar-slot")?.getBoundingClientRect().width || 0'),0);
        await rail('邮件'); await wait('document.body.innerText.includes("收件箱")');
        await capture('mail-light-1440');
        await rail('会议助手 · 纪要与行动项');
        assert.equal(await run('document.querySelector("input[placeholder^=搜索会议]").value'),'研发周会');
        await rail('代码工作区'); assert((await run('window.editorView().state.doc.toString()')).includes('listCustomers'));
        console.log('PASS UI independent meeting/mail navigation retains meeting state and editor drafts');
        for(const theme of ['codex-light','codex-dark','catppuccin-mocha','catppuccin-latte']) {
          await run('window.setTheme('+JSON.stringify(theme)+')');
          await new Promise(resolve=>setTimeout(resolve,250));
          for(const width of [1440,1200,1000]) {
            win.setSize(width,840); await new Promise(resolve=>setTimeout(resolve,100));
            const sizes=await run('(() => { const editor=document.querySelector(".code-editor-host").getBoundingClientRect(); const chat=document.querySelector(".ai-chat-column").getBoundingClientRect(); return {width:innerWidth, editor:editor.width, right:editor.right, bottom:editor.bottom, height:innerHeight, chat:chat.width, overflow:document.documentElement.scrollWidth>innerWidth}; })()');
            assert(sizes.editor>250,JSON.stringify({theme,width,...sizes}));
            assert(sizes.right<=sizes.width+1,JSON.stringify(sizes));
            assert(sizes.bottom<=sizes.height+1,JSON.stringify(sizes));
            assert(!sizes.overflow,JSON.stringify(sizes));
          }
          await capture('workspace-'+theme+'-1000');
        }
        await run('window.setTheme("codex-dark")');win.setSize(1440,900); await new Promise(resolve=>setTimeout(resolve,300));
        await capture('workspace-dark-1440');
        await run('(() => { const handle=document.querySelector(".workspace-resize"); handle.focus(); handle.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowLeft",bubbles:true})); })()');
        await wait('document.querySelector(".workspace-resize").getAttribute("aria-valuenow")==="61"');
        await run('window.setTheme("codex-light")');
        let directory=project;
        for(const segment of deepSegments) {
          directory=path.join(directory,segment);
          const selector='[data-path='+JSON.stringify(directory)+']';
          await wait('Boolean(document.querySelector('+JSON.stringify(selector)+'))');
          if(await run('document.querySelector('+JSON.stringify(selector)+').getAttribute("aria-expanded")!=="true"')) await click(selector);
        }
        const folderSelector='[data-path='+JSON.stringify(directory)+']';
        await click(folderSelector+' button[aria-label='+JSON.stringify('引用文件夹 trigger')+']');
        await wait('Boolean(document.querySelector("[data-testid=directory-attachment]"))');
        assert((await run('document.querySelector("[data-testid=directory-attachment]").innerText')).includes('trigger'));
        assert.equal(await run('window.fileParseCalls'),0);
        await click('[data-testid="directory-attachment"] button');
        const deepFile=path.join(directory,'TriggerContextDemo01.java');
        const deepSelector='[data-path='+JSON.stringify(deepFile)+']';
        await wait('Boolean(document.querySelector('+JSON.stringify(deepSelector)+'))');
        await click(deepSelector+' button[aria-label='+JSON.stringify('引用文件 TriggerContextDemo01.java')+']');
        await wait('Boolean(document.querySelector("[data-testid=file-attachment]"))');
        assert.equal(await run('window.fileParseCalls'),1);
        assert((await run('document.querySelector("[data-testid=file-attachment]").innerText')).includes('TriggerContextDemo01.java'));
        await click(deepSelector); await wait('document.querySelector(".code-tab.is-active").innerText.includes("TriggerContextDemo01.java")');
        const nameSelector=deepSelector+' .project-tree-name';
        const label=await run('(()=>{const el=document.querySelector('+JSON.stringify(nameSelector)+');return {text:el.textContent,width:el.getBoundingClientRect().width,scrollWidth:el.scrollWidth,ellipsis:getComputedStyle(el).textOverflow};})()');
        assert.equal(label.text,'TriggerContextDemo01.java'); assert(label.width>=label.scrollWidth-1); assert.notEqual(label.ellipsis,'ellipsis');
        assert.equal(await run('document.querySelector('+JSON.stringify(deepSelector)+').getAttribute("aria-selected")'),'true');
        assert.equal(await run('Math.round(document.querySelector(".code-explorer").getBoundingClientRect().width)'),300);
        await capture('workspace-deep-files-light-1440');
        const handleSelector='.code-explorer-resize';
        await run('(()=>{const handle=document.querySelector(".code-explorer-resize");handle.focus();handle.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));})()');
        await wait('document.querySelector(".code-explorer-resize").getAttribute("aria-valuenow")==="320"');
        assert.equal(await run('localStorage.getItem("neocrm.workspace.explorer-width")'),'320');
        const handleBounds=await run('(()=>{const r=document.querySelector(".code-explorer-resize").getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()');
        win.webContents.sendInputEvent({type:'mouseMove',...handleBounds});
        await new Promise(resolve=>setTimeout(resolve,50));
        win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...handleBounds});
        await new Promise(resolve=>setTimeout(resolve,50));
        win.webContents.sendInputEvent({type:'mouseMove',x:handleBounds.x+40,y:handleBounds.y});
        await new Promise(resolve=>setTimeout(resolve,50));
        win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:handleBounds.x+40,y:handleBounds.y});
        await wait('Number(localStorage.getItem("neocrm.workspace.explorer-width"))>=355');
        await run('document.querySelector(".code-explorer-resize").dispatchEvent(new MouseEvent("dblclick",{bubbles:true}))');
        await wait('document.querySelector(".code-explorer-resize").getAttribute("aria-valuenow")==="300"');
        const longFile=path.join(directory,'TriggerContextDemo01WithAReallyLongBusinessDescriptionAndActionTracking.java');
        const longSelector='[data-path='+JSON.stringify(longFile)+'] .project-tree-name';
        await run('document.querySelector(".project-tree-scroll").scrollLeft=10000');
        await wait('document.querySelector(".project-tree-scroll").scrollLeft>0');
        const scroll=await run('(()=>{const el=document.querySelector(".project-tree-scroll"),name=document.querySelector('+JSON.stringify(longSelector)+');return {viewport:el.getBoundingClientRect().right,right:name.getBoundingClientRect().right,width:el.clientWidth,scrollWidth:el.scrollWidth};})()');
        assert(scroll.scrollWidth>scroll.width);assert(scroll.right<=scroll.viewport+1,JSON.stringify(scroll));
        await run('document.querySelector(".project-tree-scroll").scrollLeft=0');
        for(const theme of ['codex-light','codex-dark']) {
          await call('setTheme',theme);
          for(const width of [1440,1200,1000]) {
            win.setSize(width,900);await new Promise(resolve=>setTimeout(resolve,150));
            const layout=await run('(()=>{const tree=document.querySelector(".code-explorer").getBoundingClientRect(),editor=document.querySelector(".code-editor-host").getBoundingClientRect();return{tree:tree.width,editor:editor.width,overflow:document.documentElement.scrollWidth>innerWidth};})()');
            assert(layout.tree>=200&&layout.editor>=259&&!layout.overflow,JSON.stringify({theme,width,...layout}));
          }
        }
        win.setSize(1440,900); await capture('workspace-deep-files-dark-1440');
        await run('window.setTheme("codex-light")');
        await run('(()=>{const input=document.querySelector(".composer-input");input.focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set.call(input,"@diagram");input.dispatchEvent(new Event("input",{bubbles:true}));input.setSelectionRange(8,8)})()');
        await wait('Boolean(document.querySelector("[data-testid=skill-mention-option]"))');
        assert.equal(await run('document.querySelectorAll("[data-testid=skill-mention-option]").length'),1);
        await capture('skill-mention-search');
        await click('[data-testid=skill-mention-option]'); await wait('Boolean(document.querySelector("[data-testid=skill-mention-chip]"))');
        await capture('skill-mention-selected');
        await run('(()=>{const input=document.querySelector(".composer-input");Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set.call(input,"请绘制流程图");input.dispatchEvent(new Event("input",{bubbles:true}))})()');
        await click('button[aria-label="发送消息"]'); await wait('Boolean(window.startedFixture)');
        assert.deepEqual(await run('window.startedFixture.messages.at(-1).skillIds'),['skill-diagram-design']);
        assert.deepEqual(await run('window.startedFixture.activeSkillIds'),[]);
        await wait('document.querySelector(".ai-chat-column")?.innerText.includes("Diagram Design 图表设计")');
        assert(!await run('Boolean(document.querySelector("[data-testid=skill-mention-chip]"))'));
        console.log('PASS skill mention search, one-message delivery and visible sent reference');
        console.log('PASS UI deep filenames, horizontal scrolling, selected file, pointer/keyboard resizing, saved width and readable editor at 1000/1200/1440px');
        assert.deepEqual(await run('window.unexpectedErrors'),[]);
        console.log('PASS UI four themes at 1000/1200/1440px, keyboard resizing and no unhandled renderer errors');
        win.destroy();app.exit(0);
      } catch(error) { console.error(error); console.error(await run('window.unexpectedErrors')); await capture('failure'); win.destroy();app.exit(1); }
    }).catch(error=>{console.error(error);app.exit(1)});
  `);
  const require = createRequire(import.meta.url);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((resolve,reject) => {
    const child=spawn(require('electron'),[host,'--no-sandbox'],{env,stdio:['ignore','pipe','pipe']});
    const timeout=setTimeout(()=>{child.kill();reject(new Error('Workspace UI test timed out'));},60000);
    child.stdout.on('data',data=>process.stdout.write(data));child.stderr.on('data',data=>process.stderr.write(data));
    child.on('error',error=>{clearTimeout(timeout);reject(error)});
    child.on('exit',code=>{clearTimeout(timeout);code===0?resolve():reject(new Error('UI test exited '+code))});
  });
} finally { await fs.rm(fixture,{recursive:true,force:true}); }
