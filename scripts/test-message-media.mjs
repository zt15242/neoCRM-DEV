import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import JSZip from 'jszip';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-message-media-'));
const project = path.join(fixture, 'project');
const require = createRequire(import.meta.url);
const diagramBundle = JSON.parse(await fs.readFile(path.join(root, 'electron/security/diagramDesignSkill.json'), 'utf8'));
const diagramResources = JSON.parse(gunzipSync(Buffer.from(diagramBundle.content, 'base64')).toString('utf8'));
let server;
try {
  await fs.mkdir(project);
  const subject = path.join(fixture, 'subject.cjs');
  await build({ stdin: { resolveDir: root, loader: 'ts', contents: `
    export * from './electron/services/messagePreviewService';
    export * from './src/components/ai/messageMediaModel';
    export { DocumentService } from './electron/services/documentService';
  ` }, bundle: true, platform: 'node', format: 'cjs', outfile: subject,
    external: ['pdfjs-dist/*', 'word-extractor'], logLevel: 'silent' });
  const { parseXMind, readMessagePreview, findMarkdownLink, mediaKind, safeRemoteUrl, isLocalSource, diagramFileSource, diagramRecoverySources, DocumentService } = require(subject);
  assert.equal(findMarkdownLink('前 ![图片](<目录/图片 (1).png> "说明") 后').source, '目录/图片 (1).png');
  assert.equal(findMarkdownLink('[图](https://example.com/image(1).png?size=2)').source, 'https://example.com/image(1).png?size=2');
  assert.equal(findMarkdownLink('![尚未完成](https://example.com/image.png'), undefined);
  assert.equal(findMarkdownLink('[无关文本]然后 [正常](https://example.com)').label, '正常');
  assert.equal(mediaKind('https://example.com/IMAGE.PNG?token=1'), 'image');
  assert.equal(mediaKind('方案.xmind'), 'mindmap');
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'ftp://example.com/x', 'https://user:pass@example.com/a', 'file:///etc/passwd']) assert.equal(safeRemoteUrl(url), undefined);
  assert.equal(isLocalSource('//example.com/network'), false);
  assert.equal(diagramFileSource(' \n架构图 (1).svg\n'), '架构图 (1).svg');
  assert.equal(diagramFileSource('<file:///project/chart.html>'), 'file:///project/chart.html');
  for (const value of ['https://example.com/chart.svg', '//example.com/chart.svg', '<svg/>', 'a.svg\nb.html', 'image.png', 'javascript:chart.svg', 'bad\0.svg']) assert.equal(diagramFileSource(value), undefined, value);
  const diagramRead = { id: 'diagram-read', name: 'read', status: 'success', arguments: { file_path: '架构图 (1).svg' } };
  assert.deepEqual(diagramRecoverySources([
    { ...diagramRead, name: 'bash', arguments: { command: 'cat unrelated.svg' } },
    { ...diagramRead, arguments: { file_path: 'failed.svg' }, status: 'error' },
    { ...diagramRead, name: 'str_replace_editor', arguments: { command: 'view', path: 'diagram.html' } },
    diagramRead, diagramRead,
  ]), ['架构图 (1).svg', 'diagram.html']);
  assert.equal(diagramRecoverySources(Array.from({ length: 10 }, (_, i) => ({ ...diagramRead, arguments: { file_path: `chart-${i}.svg` } }))).length, 6);
  console.log('PASS inline destinations, titles, parentheses, streaming fragments and unsafe URL policies');

  const zipOf = async (name, content) => new JSZip().file(name, typeof content === 'string' ? content : JSON.stringify(content)).generateAsync({ type: 'nodebuffer' });
  const modern = await zipOf('content.json', [
    { title: '实施方案', rootTopic: { title: '客户上线', children: { attached: [
      { title: '需求梳理', children: { attached: [{ title: '对象与字段' }, { title: '权限与角色' }] } },
      { title: '开发验证', children: { attached: [{ title: '组件开发' }, { title: '回归验证' }] } },
      { title: '部署交付' },
    ], detached: [{ title: '浮动主题' }] } } },
    { title: '验收清单', rootTopic: { title: '确认上线', children: { attached: [{ title: '<img src=x onerror=alert(1)>' }] } } },
  ]);
  const legacy = await zipOf('content.xml', '<?xml version="1.0"?><xmap-content xmlns="urn:xmind:xmap:xmlns:content:2.0"><sheet><title>旧版画布</title><topic><title>项目计划</title><children><topics type="attached"><topic><title>业务调研</title></topic><topic><title><![CDATA[开发与验收]]></title></topic></topics></children></topic></sheet></xmap-content>');
  const modernPath = path.join(project, '实施方案 (1).xmind');
  const oldPath = path.join(project, 'legacy.xmind');
  await fs.writeFile(modernPath, modern); await fs.writeFile(oldPath, legacy);
  const modernMap = await parseXMind(modern), oldMap = await parseXMind(legacy);
  assert.equal(modernMap.sheets.length, 2); assert.equal(modernMap.sheets[0].root.children[3].title, '浮动主题');
  assert.equal(oldMap.sheets[0].title, '旧版画布'); assert.equal(oldMap.sheets[0].root.children[1].title, '开发与验收');
  await assert.rejects(() => parseXMind(Buffer.from('broken archive')));
  await assert.rejects(() => zipOf('content.json', {}).then(parseXMind), /工作表/);
  await assert.rejects(() => zipOf('missing.json', []).then(parseXMind), /缺少/);
  await assert.rejects(() => zipOf('content.xml', '<!DOCTYPE x [<!ENTITY y "boom">]><x>&y;</x>').then(parseXMind), /DTD/);
  await assert.rejects(() => zipOf('content.json', [{ rootTopic: { title: 'root', children: { attached: Array.from({ length: 1501 }, () => ({ title: 'child' })) } } }]).then(parseXMind), /1500/);
  let deep = { title: 'leaf' }; for (let i = 0; i < 34; i++) deep = { title: 'parent', children: { attached: [deep] } };
  await assert.rejects(() => zipOf('content.json', [{ rootTopic: deep }]).then(parseXMind), /32/);
  await assert.rejects(() => zipOf('content.json', ' '.repeat(4 * 1024 * 1024 + 1)).then(parseXMind), /4 MB/);
  const document = await new DocumentService().read({ file_path: modernPath, section: 'sheet-0' });
  assert.equal(document.format, 'xmind'); assert.match(document.content, /客户上线[\s\S]*对象与字段[\s\S]*浮动主题/);
  console.log('PASS modern/legacy XMind, multiple sheets, floating topics, document reading, corrupt/hostile/oversized archives');

  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="760" height="220" viewBox="0 0 760 220"><rect width="760" height="220" fill="#eef6fc"/><rect x="38" y="45" width="200" height="130" rx="12" fill="#fff" stroke="#b8d2e8"/><text x="68" y="100" font-size="22" fill="#163b58">客户管理</text><text x="68" y="135" font-size="16" fill="#486b85">需求 · 实施 · 交付</text><path d="M270 110h70m-12-12 12 12-12 12" stroke="#0284c7" fill="none" stroke-width="3"/><rect x="380" y="45" width="340" height="130" rx="12" fill="#fff" stroke="#b8d2e8"/><text x="410" y="100" font-size="22" fill="#163b58">当前项目</text><text x="410" y="135" font-size="16" fill="#486b85">图片与流程可直接查看</text></svg>';
  const imagePath = path.join(project, '预览图片 (1).svg'); await fs.writeFile(imagePath, svg);
  const fullDiagram = svg.replace('<rect', '<title>项目架构 &amp; 数据流</title><desc>完整图表的本地预览</desc><rect');
  const truncatedDiagram = fullDiagram.slice(0, fullDiagram.indexOf('<path') + 20);
  const htmlDiagram = '<!doctype html><html><head><style>text{fill:#123456}</style></head><body>' + fullDiagram + '<script>window.diagramExecuted=true</script></body></html>';
  await fs.writeFile(path.join(project, '架构图 (1).svg'), fullDiagram);
  await fs.writeFile(path.join(project, 'diagram.html'), htmlDiagram);
  await fs.writeFile(path.join(project, 'diagram.htm'), htmlDiagram);
  await fs.writeFile(path.join(project, 'wrong-title.svg'), fullDiagram.replace('项目架构 &amp; 数据流', '其他图表'));
  await fs.writeFile(path.join(project, 'wrong-size.svg'), fullDiagram.replace('0 0 760 220', '0 0 700 220'));
  await fs.writeFile(path.join(project, 'wrong-desc.svg'), fullDiagram.replace('完整图表的本地预览', '其他描述'));
  assert.deepEqual(await readMessagePreview('架构图 (1).svg', { projectPath: project, diagram: true }), { kind: 'diagram', name: '架构图 (1).svg', content: fullDiagram, format: 'svg' });
  for (const ext of ['html', 'htm']) {
    assert.equal((await readMessagePreview(`diagram.${ext}`, { projectPath: project, diagram: true })).format, 'html');
    await assert.rejects(() => readMessagePreview(`diagram.${ext}`, { projectPath: project }), /文件类型/);
  }
  assert.equal((await readMessagePreview('预览图片%20(1).svg', { projectPath: project })).kind, 'image');
  assert.equal((await readMessagePreview(pathToFileURL(imagePath).href, { projectPath: project })).kind, 'image');
  assert.equal((await readMessagePreview(modernPath, { projectPath: project })).kind, 'mindmap');
  const outside = path.join(fixture, 'outside.svg'); await fs.writeFile(outside, svg);
  await fs.symlink(outside, path.join(project, 'escape.svg'));
  await fs.symlink(fixture, path.join(project, 'outside-dir'));
  await assert.rejects(() => readMessagePreview('../outside.svg', { projectPath: project }), /不在当前项目/);
  await assert.rejects(() => readMessagePreview('escape.svg', { projectPath: project }), /不在当前项目/);
  await assert.rejects(() => readMessagePreview('outside-dir/outside.svg', { projectPath: project }), /不在当前项目/);
  await assert.rejects(() => readMessagePreview(outside, { projectPath: project }), /不在当前项目/);
  assert.equal((await readMessagePreview(outside, { allowedFiles: [outside] })).kind, 'image');
  await assert.rejects(() => readMessagePreview(imagePath, {}), /不在当前项目/);
  await assert.rejects(() => readMessagePreview('https://example.com/xmind', { projectPath: project }), /预览仅支持/);
  for (const source of ['../outside.svg', 'escape.svg', 'outside-dir/outside.svg', outside]) {
    await assert.rejects(() => readMessagePreview(source, { projectPath: project, diagram: true }), /不在当前项目/);
  }
  assert.equal((await readMessagePreview(outside, { allowedFiles: [outside], diagram: true })).kind, 'diagram');
  await assert.rejects(() => readMessagePreview('https://example.com/chart.svg', { projectPath: project, diagram: true }), /预览仅支持/);
  await fs.writeFile(path.join(project, 'oversized.svg'), ' '.repeat(1_000_001));
  await assert.rejects(() => readMessagePreview('oversized.svg', { projectPath: project, diagram: true }), /1 MB/);
  await assert.rejects(() => readMessagePreview(modernPath, { projectPath: project, diagram: true }), /文件类型/);
  await fs.writeFile(path.join(project, 'flow.mmd'), 'graph TD\nA-->B');
  assert.equal((await readMessagePreview('flow.mmd', { projectPath: project })).kind, 'mermaid');
  const large = path.join(project, 'large.png'); const handle = await fs.open(large, 'w'); await handle.truncate(20 * 1024 * 1024 + 1); await handle.close();
  await assert.rejects(() => readMessagePreview(large, { projectPath: project }), /20 MB/);
  console.log('PASS canonical file paths, encoded names, exact attachments, symlink/traversal boundaries and size limits');

  // Real Chromium renderer inside the same Electron runtime shipped by this app.
  server = http.createServer((req, res) => {
    if (req.url.startsWith('/image')) { res.writeHead(200, { 'content-type': 'image/svg+xml' }); res.end(svg); }
    else { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const initial = `# 回复中的图片与图表\n\n![当前项目](${base}/image.svg)\n\n\`\`\`mermaid\nflowchart LR\n A[需求梳理] --> B{确认方案}\n B -->|通过| C[开发验证]\n B -->|调整| A\n C --> D[部署交付]\n\`\`\`\n\n[实施方案](<${modernPath}>)\n\n[普通链接](https://example.com/help)\n`;
  const out = path.join(fixture, 'web');
  await fs.mkdir(out);
  await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React from 'react'; import { createRoot } from 'react-dom/client';
    import { MarkdownRenderer } from './src/components/ai/MarkdownRenderer';
    import { renderMermaidPreview } from './src/components/ai/mermaidPreview';
    import { prepareSvgDiagram, exportSvgDiagram } from './src/components/ai/svgDiagram';
    const root = createRoot(document.getElementById('root'));
    const desktop = Boolean(window.neoApi?.filePreviewMessage);
    window.neoApi ||= {filePreviewMessage: async request => request.source === ${JSON.stringify(imagePath)} ? ${JSON.stringify({ kind: 'image', name: '图片.svg', dataUrl: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') })} : ${JSON.stringify({ ...modernMap, name: '实施方案.xmind' })}};
    window.testSet = (content, isStreaming = false, toolCalls = []) => root.render(<MarkdownRenderer content={content} isStreaming={isStreaming} toolCalls={toolCalls} projectPath={${JSON.stringify(project)}} sessionId="test-session" />);
    window.testSvg = renderMermaidPreview;
    window.testDiagram = prepareSvgDiagram;
    window.testDiagramExport = async (source, format) => {
      const blob = await exportSvgDiagram(prepareSvgDiagram(source), format);
      return { type: blob.type, size: blob.size, bytes: Array.from(new Uint8Array(await blob.arrayBuffer()).slice(0, 8)) };
    };
    window.testSet(desktop ? ${JSON.stringify(initial)} : ${JSON.stringify(initial.replace(`${base}/image.svg`, imagePath))});
  ` }, bundle: true, splitting: true, platform: 'browser', format: 'esm', outdir: out, entryNames: 'renderer', logLevel: 'silent' });
  await fs.writeFile(path.join(out, 'index.html'), '<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="renderer.css"><style>*{box-sizing:border-box}body{margin:0;background:#f4f6f9;font:13px/1.7 system-ui,sans-serif;color:#1e293b}#root{max-width:860px;margin:30px auto;padding:24px;background:white;border:1px solid #e2e8f0;border-radius:12px}h2{font-size:20px}p{margin:12px 0}button,select{font:inherit;border:0;background:transparent}html[data-dark-mode="true"] body{background:#101827;color:#e2e8f0}html[data-dark-mode="true"] #root{background:#172033;border-color:#3b4b63}@media(max-width:480px){#root{margin:10px;padding:12px}}</style><div id="root"></div><script type="module" src="renderer.js"></script></html>');
  const preload = path.join(fixture, 'preload.cjs');
  await fs.writeFile(preload, `const {contextBridge, ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('neoApi',{filePreviewMessage:request=>ipcRenderer.invoke('test:preview',request),clipboardWriteText:text=>ipcRenderer.invoke('test:copy',text)});`);
  const host = path.join(fixture, 'host.cjs');
  await fs.writeFile(host, `
    const {app,BrowserWindow,ipcMain}=require('electron');const assert=require('node:assert/strict');const fs=require('node:fs');
    const {readMessagePreview}=require(${JSON.stringify(subject)});
    app.setPath('userData',${JSON.stringify(path.join(fixture, 'browser-data'))});
    const previewRequests=[];
    ipcMain.handle('test:preview',(_,request)=>{previewRequests.push(request);return readMessagePreview(request.source,{projectPath:${JSON.stringify(project)},diagram:request.diagram===true})});
    let copied='';ipcMain.handle('test:copy',(_,text)=>{copied=text});
    app.whenReady().then(async()=>{
      const win=new BrowserWindow({show:false,width:1050,height:1000,webPreferences:{preload:${JSON.stringify(preload)},backgroundThrottling:false}});
      const untrustedRequests=[];
      win.webContents.session.webRequest.onBeforeRequest({urls:['https://example.com/*','https://fonts.googleapis.com/*']},(details,callback)=>{untrustedRequests.push(details.url);callback({cancel:true})});
      const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message)});
      win.webContents.on('render-process-gone',(_,details)=>{console.error(details);app.exit(1)});
      const run=async code=>{try{return await win.webContents.executeJavaScript(code,true)}catch(error){console.error('Renderer evaluation failed:',code,errors);throw error}};
      const wait=async predicate=>{for(let i=0;i<300;i++){if(await run('Boolean('+predicate+')'))return;await new Promise(r=>setTimeout(r,30))}throw new Error('Timeout: '+predicate+'\\n'+await run('document.body.innerText')+'\\n'+errors.join('\\n'))};
      const set=async(content,streaming=false,toolCalls=[])=>{await run('window.testSet('+JSON.stringify(content)+','+streaming+','+JSON.stringify(toolCalls)+')');await new Promise(r=>setTimeout(r,70))};
      const click=selector=>run('document.querySelector('+JSON.stringify(selector)+').click()');
      try{
        await win.loadFile(${JSON.stringify(path.join(out, 'index.html'))});
        await wait('document.querySelectorAll(".message-media__diagram").length===1 && document.querySelector(".message-media__image")?.naturalWidth>0 && document.querySelector(".message-mindmap__tree")');
        assert.equal(await run('document.querySelector("a")?.textContent'),'普通链接');
        assert.equal(await run('document.querySelectorAll(".message-media__status--error").length'),0);
        await click('.message-media button[aria-label="放大预览"]');await wait('document.querySelector("dialog[open]")');
        await click('dialog[open] button[aria-label="放大"]');assert.match(await run('document.querySelector("dialog[open]").innerText'),/125%/);
        await run('document.querySelector("dialog[open]").close()');await wait('!document.querySelector("dialog[open]")');
        await click('button[title="复制图表源码"]');await wait('document.body.innerText.includes("已复制")');assert.match(copied,/flowchart LR/);
        await click('button[title="查看源码"]');await wait('document.querySelector(".message-media__source")');assert.match(await run('document.querySelector(".message-media__source").textContent'),/开发验证/);
        await click('button[title="查看图形"]');
        await run('document.querySelector(".message-mindmap__sheets select").value="sheet-1";document.querySelector(".message-mindmap__sheets select").dispatchEvent(new Event("change",{bubbles:true}))');
        await wait('document.querySelector(".message-mindmap__tree").textContent.includes("<img src=x onerror=alert(1)>")');
        assert.equal(await run('document.querySelectorAll(".message-mindmap__tree img").length'),0);
        console.log('PASS actual image/flowchart/XMind rendering, normal links, zoom dialog, source/copy, sheet switching and inert topic markup');

        await set('![缺失图片](${base}/missing.png)');await wait('document.body.innerText.includes("图片无法加载")');assert.equal(await run('document.querySelector("a")?.href'),'${base}/missing.png');
        await set('[普通链接](https://example.com) [危险链接](javascript:alert(1)) [文件](data:text/html,test)');
        assert.equal(await run('document.querySelectorAll("a").length'),1);
        await set('${base}/image.svg?size=1');await wait('document.querySelector(".message-media__image")?.naturalWidth>0 && !document.body.innerText.includes("正在加载图片")');
        await set('[图片链接](${base}/image.svg)');await wait('document.querySelector(".message-media__image")?.naturalWidth>0 && !document.body.innerText.includes("正在加载图片")');
        await set(${JSON.stringify("```mermaid\nflowchart LR\n A[")},true);await wait('document.body.innerText.includes("图表正在生成")');assert.equal(await run('document.querySelectorAll(".message-media__diagram").length'),0);
        await set(${JSON.stringify("```mermaid\nflowchart LR\n A[客户]-->B[成交]\n```")},true);await wait('document.querySelector(".message-media__diagram")?.naturalWidth>0');
        await set(${JSON.stringify("```mermaid\nnot a valid graph\n```")});await wait('document.body.innerText.includes("流程图暂时无法渲染")');
        await set(${JSON.stringify("```mermaid\nflowchart TD\n A-->B")});await wait('document.querySelector(".message-media__diagram")?.naturalWidth>0');
        await set(${JSON.stringify("```mindmap\n  root((实施计划))\n    需求\n    交付\n```")});await wait('document.querySelector(".message-media__diagram")?.naturalWidth>0');
        await set(${JSON.stringify("```mermaid\nsequenceDiagram\n participant A as 用户\n participant B as 系统\n A->>B: 查询数据\n B-->>A: 返回结果\n```")});await wait('document.querySelector(".message-media__diagram")?.naturalWidth>0');
        await set('[本地图片](<${imagePath}>)');await wait('document.querySelector(".message-media__image")?.naturalWidth>0');
        await set('[旧格式](<${oldPath}>)');await wait('document.body.innerText.includes("开发与验收")');
        await set('[图表文件](flow.mmd)');await wait('document.querySelector(".message-media__diagram")?.naturalWidth>0');
        console.log('PASS failed image fallback, protocol rejection, incomplete/completed streams, invalid diagrams, mindmaps, sequence diagrams, local image and legacy XMind');

        const output=await run(${JSON.stringify('window.testSvg(' + JSON.stringify('flowchart LR\n A["&lt;img src=x onerror=alert(1)&gt;"]-->B\n click B "javascript:alert(1)"') + ',false)')});
        assert(!/<(?:script|foreignObject|image|a)(?:\\s|>)/i.test(output));assert(!/href="(?:javascript|https?):/i.test(output));
        assert.equal(await run(${JSON.stringify('window.testSvg(' + JSON.stringify('%%{init: {"securityLevel":"loose"}}%%\n graph TD\n A-->B') + ',false).then(()=>false,()=>true)')}),true);
        console.log('PASS untrusted diagram sanitization and config override rejection');

        const diagramSource=${JSON.stringify(svg)};
        await set('\`\`\`svg\\n'+diagramSource+'\\n\`\`\`');await wait('document.querySelector(".message-media__diagram")?.naturalWidth>0');
        assert.match(await run('document.body.innerText'),/Diagram Design/);
        await click('button[title="复制图表源码"]');await wait('document.body.innerText.includes("已复制")');assert.equal(copied,diagramSource+'\\n');
        await click('button[title="查看源码"]');await wait('document.querySelector(".message-media__source")');assert.match(await run('document.querySelector(".message-media__source").textContent'),/当前项目/);
        await click('button[title="查看图形"]');
        await click('button[aria-label="放大预览"]');await wait('document.querySelector("dialog[open]")');
        await click('dialog[open] button[aria-label="放大"]');assert.match(await run('document.querySelector("dialog[open]").innerText'),/125%/);
        await run('document.querySelector("dialog[open]").close()');await wait('!document.querySelector("dialog[open]")');
        const download=async format=>{
          const saved=${JSON.stringify(path.join(fixture, 'downloaded-diagram.'))}+format;
          const completed=new Promise((resolve,reject)=>win.webContents.session.once('will-download',(_,item)=>{
            item.setSavePath(saved);item.once('done',(_,state)=>state==='completed'?resolve():reject(new Error('Download '+state)));
          }));
          await click('button[title="导出 '+format.toUpperCase()+'"]');await completed;
          assert(fs.statSync(saved).size>20);return fs.readFileSync(saved);
        };
        assert.match((await download('svg')).toString(),/<svg/);
        assert.deepEqual([...((await download('png')).subarray(0,8))],[137,80,78,71,13,10,26,10]);
        const png=await run('window.testDiagramExport('+JSON.stringify(diagramSource)+',"png")');
        assert.equal(png.type,'image/png');assert.deepEqual(png.bytes,[137,80,78,71,13,10,26,10]);
        assert.match((await run('window.testDiagramExport('+JSON.stringify(diagramSource)+',"svg")')).type,/image\\/svg/);
        await set('\`\`\`svg\\n<svg');await wait('document.body.innerText.includes("图表暂时无法显示")');
        await set('\`\`\`svg\\n<svg',true);await wait('document.body.innerText.includes("图表正在生成")');
        const fullDiagram=${JSON.stringify(fullDiagram)};
        const truncatedDiagram=${JSON.stringify(truncatedDiagram)};
        const diagramRead=${JSON.stringify(diagramRead)};
        await set('\`\`\`diagram\\n架构图 (1).svg\\n\`\`\`');
        await wait('document.querySelector(".message-media__diagram")?.naturalWidth===760');
        assert.match(await run('document.body.innerText'),/图表文件：架构图/);
        await click('button[title="复制图表源码"]');await wait('document.body.innerText.includes("已复制")');assert.equal(copied,fullDiagram);
        assert.match((await download('svg')).toString(),/项目架构/);
        assert.deepEqual([...((await download('png')).subarray(0,8))],[137,80,78,71,13,10,26,10]);
        await set('\`\`\`diagram\\ndiagram.html\\n\`\`\`');
        await wait('document.querySelector(".message-media__diagram")?.naturalWidth===760');
        assert.equal(await run('Boolean(window.diagramExecuted)'),false);
        await set('\`\`\`diagram\\n架构图 (1).svg');
        await wait('document.body.innerText.includes("图表文件：架构图")');
        let requests=previewRequests.length;
        await set('\`\`\`diagram\\n架构图 (1).svg',true);
        await wait('document.body.innerText.includes("图表正在生成")');assert.equal(previewRequests.length,requests);
        await set('\`\`\`svg\\n'+truncatedDiagram+'\\n\`\`\`',true,[diagramRead]);
        await wait('document.body.innerText.includes("图表暂时无法显示")');assert.equal(previewRequests.length,requests);
        await set('\`\`\`svg\\n'+truncatedDiagram,true,[diagramRead]);
        await wait('document.body.innerText.includes("图表正在生成")');assert.equal(previewRequests.length,requests);
        await set('\`\`\`svg\\n'+truncatedDiagram,false,[diagramRead]);
        await wait('document.querySelector(".message-media__diagram")?.naturalWidth===760 && document.body.innerText.includes("读取完整图表")');
        assert.equal(await run('document.querySelector(".message-media__diagram").alt'),'项目架构 & 数据流');
        assert(!await run('document.body.innerText.includes("图表暂时无法显示")'));
        await click('button[title="复制图表源码"]');assert.equal(copied,fullDiagram);
        await click('button[title="查看源码"]');await wait('document.querySelector(".message-media__source")');
        assert.equal(await run('document.querySelector(".message-media__source").textContent'),fullDiagram);
        await click('button[title="查看图形"]');
        if(${JSON.stringify(process.env.NEO_MEDIA_PREVIEW_DIR || '')}){
          fs.mkdirSync(${JSON.stringify(process.env.NEO_MEDIA_PREVIEW_DIR || '')},{recursive:true});
          fs.writeFileSync(${JSON.stringify(path.join(process.env.NEO_MEDIA_PREVIEW_DIR || '', 'diagram-recovered.png'))},(await win.webContents.capturePage()).toPNG());
        }
        for(const call of [
          {...diagramRead,name:'write'},
          {...diagramRead,name:'edit'},
          {...diagramRead,name:'str_replace_editor',arguments:{command:'view',path:'diagram.html'}},
        ]){
          await set('\`\`\`svg\\n'+truncatedDiagram,false,[call]);
          await wait('document.querySelector(".message-media__diagram")?.naturalWidth===760 && document.body.innerText.includes("读取完整图表")');
        }
        for(const file_path of ['wrong-title.svg','wrong-size.svg','wrong-desc.svg','missing.svg','escape.svg']){
          await set('\`\`\`svg\\n'+truncatedDiagram,false,[{...diagramRead,arguments:{file_path}}]);
          await wait('document.body.innerText.includes("图表暂时无法显示")');
          assert.equal(await run('document.querySelectorAll(".message-media__diagram").length'),0,file_path);
          assert.match(await run('document.body.innerText'),/源码输出不完整/);
        }
        for(const calls of [[],[{...diagramRead,status:'error'}],[{...diagramRead,status:'running'}]]){
          requests=previewRequests.length;
          await set('\`\`\`svg\\n'+truncatedDiagram,false,calls);
          await wait('document.body.innerText.includes("源码输出不完整")');
          assert.equal(previewRequests.length,requests);assert.equal(await run('document.querySelectorAll(".message-media__diagram").length'),0);
        }
        await set('\`\`\`diagram\\nmissing.svg\\n\`\`\`');await wait('document.body.innerText.includes("图表暂时无法显示")');
        requests=previewRequests.length;await click('.message-media__fallback button');await wait('document.body.innerText.includes("图表暂时无法显示")');assert.equal(previewRequests.length,requests+1);
        requests=previewRequests.length;
        await set('\`\`\`diagram\\nhttps://example.com/chart.svg\\n\`\`\`');
        await wait('document.body.innerText.includes("图表暂时无法显示")');assert.equal(previewRequests.length,requests);
        await set('\`\`\`diagram\\n'+fullDiagram+'\\n\`\`\`');await wait('document.querySelector(".message-media__diagram")?.naturalWidth===760');
        await set('\`\`\`html:diagram\\n<html><body>'+truncatedDiagram+'\\n\`\`\`');
        await wait('document.body.innerText.includes("源码输出不完整")');assert.equal(await run('document.querySelectorAll(".message-media__diagram").length'),0);
        await set('\`\`\`html:diagram\\n<html><body>'+truncatedDiagram,false,[diagramRead]);
        await wait('document.querySelector(".message-media__diagram")?.naturalWidth===760 && document.body.innerText.includes("读取完整图表")');
        console.log('PASS local SVG/HTML references, complete-file copy/download, stopped-stream recovery, tool provenance, title/size/description matching, missing-file retry and no guessed/remote file reads');
        await set('\`\`\`html:diagram\\n<!doctype html><html><head><style>text{fill:#123456}</style></head><body>'+diagramSource+'<script>window.diagramExecuted=true</script></body></html>\\n\`\`\`');
        await wait('document.querySelector(".message-media__diagram")?.naturalWidth>0');
        assert.equal(await run('Boolean(window.diagramExecuted)'),false);
        const hostile='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" onload="alert(1)"><script>alert(1)</script><foreignObject><div>bad</div></foreignObject><image href="https://example.com/tracker"/><style>@import url(https://example.com/font);rect{fill:red}</style><rect width="200" height="100" style="fill:url(https://example.com/paint)"/><a href="javascript:alert(1)"><text>safe</text></a><animate attributeName="href" to="https://example.com"/></svg>';
        const cleaned=await run('window.testDiagram('+JSON.stringify(hostile)+').svg');
        assert(!/<(?:script|foreignObject|image|a|animate)(?:\\s|>)/i.test(cleaned));
        assert(!/https:\\/\\/example|javascript:|onload|@import/i.test(cleaned));
        const styled='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><defs><marker id="arrow" viewBox="0 0 10 10"><path d="M0 0L10 5L0 10z"/></marker><symbol id="icon"><rect width="10" height="10"/></symbol></defs><style>:root{--ink:#123456}.edge{stroke:var(--ink);marker-end:url(#arrow)}</style><path class="edge" d="M0 10H100"/><use href="#icon"/><use href="https://example.com/evil.svg#icon"/></svg>';
        const preserved=await run('window.testDiagram('+JSON.stringify(styled)+').svg');
        assert.match(preserved,/marker/);assert.match(preserved,/url\\(["']?#arrow["']?\\)/);assert.match(preserved,/--ink/);
        assert.match(preserved,/<use[^>]*href="#icon"/);assert(!/https:\\/\\/example.com/.test(preserved));
        const upstreamExamples=${JSON.stringify(Object.entries(diagramResources).filter(([name]) => /^assets\/example-.*\.html$/.test(name)))};
        for(const [name,source] of upstreamExamples){
          const prepared=await run('(()=>{try{return window.testDiagram('+JSON.stringify(source)+',true)}catch(error){return {error:error.message}}})()');
          assert.equal(prepared.error,undefined,name+': '+prepared.error);
          assert(prepared.width>0&&prepared.height>0,name);assert.match(prepared.svg,/<title[ >]/,name);
          assert(!/@import|fonts.googleapis.com|<script/i.test(prepared.svg),name);
        }
        const upstream=${JSON.stringify(diagramResources['assets/example-architecture.html'])};
        await set('\`\`\`html:diagram\\n'+upstream+'\\n\`\`\`');await wait('document.querySelector(".message-media__diagram")?.naturalWidth===1000');
        const themed=await run('window.testDiagram('+JSON.stringify(upstream)+',true).svg');
        assert.match(themed,/--color-paper/);assert.match(themed,/Content site in production/);
        assert.equal(await run('document.querySelector(".message-media__diagram").alt'),'Content site in production');
        for(const invalid of ['<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100"/>','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 -10 100"/>']){
          assert(await run('(()=>{try{window.testDiagram('+JSON.stringify(invalid)+');return false}catch{return true}})()'));
        }
        assert.deepEqual(untrustedRequests,[]);
        console.log('PASS Diagram Design SVG/HTML rendering, incomplete streams, actual SVG/PNG downloads, copy/source/fullscreen, unsafe markup removal and local markers/styles');
        console.log('PASS '+upstreamExamples.length+' bundled upstream examples preserve valid SVG, accessibility titles and static-only output');

        await set(${JSON.stringify(initial)}+'\\n\`\`\`svg\\n'+diagramSource+'\\n\`\`\`');await wait('document.querySelectorAll(".message-media__diagram").length===2 && document.querySelector(".message-mindmap__tree") && !document.body.innerText.includes("正在加载图片")');
        const outputDir=${JSON.stringify(process.env.NEO_MEDIA_PREVIEW_DIR || '')};
        if(outputDir){fs.mkdirSync(outputDir,{recursive:true});
          for(const width of [1050,390]){win.setContentSize(width,1000);await new Promise(r=>setTimeout(r,150));
            assert(await run('document.documentElement.scrollWidth<=innerWidth+1'));
            fs.writeFileSync(outputDir+'/media-'+width+'.png',(await win.webContents.capturePage()).toPNG());}
          await run('document.documentElement.dataset.darkMode="true"');await wait('document.querySelector(".message-media__diagram")?.naturalWidth>0');
          fs.writeFileSync(outputDir+'/media-dark.png',(await win.webContents.capturePage()).toPNG());
          await set('\`\`\`svg\\n'+diagramSource+'\\n\`\`\`');await wait('document.querySelector(".message-media__diagram")?.naturalWidth>0');
          for(const width of [1050,390]){win.setContentSize(width,700);await new Promise(r=>setTimeout(r,150));assert(await run('document.documentElement.scrollWidth<=innerWidth+1'));fs.writeFileSync(outputDir+'/diagram-'+width+'.png',(await win.webContents.capturePage()).toPNG());}
          await set('\`\`\`html:diagram\\n'+upstream+'\\n\`\`\`');await wait('document.querySelector(".message-media__diagram")?.naturalWidth===1000');
          win.setContentSize(1200,800);await new Promise(r=>setTimeout(r,150));fs.writeFileSync(outputDir+'/diagram-upstream.png',(await win.webContents.capturePage()).toPNG());
        }
        console.log('PASS narrow viewport layout and dark theme redraw');app.exit(0);
      }catch(error){console.error(error);app.exit(1)}
    });
  `);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  // Catch generated host syntax errors before Electron could show an error dialog.
  const { spawnSync } = await import('node:child_process');
  const syntax = spawnSync(process.execPath, ['--check', host], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
  const child = spawn(require('electron'), [host], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', data => { logs += data; process.stdout.write(data); });
  child.stderr.on('data', data => { logs += data; });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 90000);
  const code = await new Promise(resolve => child.on('exit', resolve)); clearTimeout(timeout);
  assert.equal(code, 0, logs);
  if (process.env.NEO_MEDIA_PREVIEW_DIR) {
    await fs.cp(out, path.join(process.env.NEO_MEDIA_PREVIEW_DIR, 'web'), { recursive: true });
    console.log('Visual evidence: ' + process.env.NEO_MEDIA_PREVIEW_DIR);
  }
} finally {
  server?.close();
  await fs.rm(fixture, { recursive: true, force: true });
}
