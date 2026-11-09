import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-context-settings-'));
const require = createRequire(import.meta.url);
try {
  await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { ModelContextSettings } from './src/components/settings/ModelContextSettings';
    window.saved = []; window.toasts = [];
    function Harness() {
      const [providers, setProviders] = useState([
        {id: 'empty', name: 'No models', models: []},
        {id: 'a', name: 'Provider A', apiKey: 'fixture-only', enabled: true, baseUrl: 'https://a.example.test',
          models: [{id: 'a1', name: 'Small', contextWindow: 32768, maxOutputTokens: 4096, tools: true},
            {id: 'a2', name: 'Large', contextWindow: 1048576, maxOutputTokens: 16384, reasoning: true}]},
        {id: 'b', name: 'Provider B', enabled: false, models: [{id: 'b1', name: 'Unknown'}]},
        {id: 'deepseek', name: 'DeepSeek', baseUrl:'https://api.deepseek.com', models:[{id:'deepseek-flash',name:'Flash'}]},
        {id:'workbuddy',name:'WorkBuddy',baseUrl:'http://127.0.0.1:8788/v1',models:[{id:'DeepSeek-V4.1-Flash',name:'Flash'}]},
      ]);
      return <ModelContextSettings providers={providers} showToast={(type, text) => window.toasts.push({type, text})}
        onSave={async provider => { window.saved.push(provider); setProviders(items => items.map(item => item.id === provider.id ? provider : item)); }} />;
    }
    createRoot(document.getElementById('root')).render(<Harness />);
  ` }, bundle: true, platform: 'browser', format: 'iife', outfile: path.join(fixture, 'renderer.js'), logLevel: 'silent' });
  const styles = (await fs.readdir(path.join(root, 'dist/assets'))).filter(name => name.endsWith('.css'));
  await fs.writeFile(path.join(fixture, 'index.html'), `<!doctype html><html lang="zh"><head><meta name="viewport" content="width=device-width,initial-scale=1">${styles.map(name => `<link rel="stylesheet" href="${path.join(root, 'dist/assets', name)}">`).join('')}</head><body><div id="root"></div><script src="renderer.js"></script></body></html>`);
  const host = path.join(fixture, 'host.cjs');
  await fs.writeFile(host, `
    const { app, BrowserWindow } = require('electron');
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    app.setPath('userData', ${JSON.stringify(path.join(fixture, 'browser-data'))});
    app.whenReady().then(async () => {
      const win = new BrowserWindow({show: false, webPreferences: {backgroundThrottling: false}});
      const run = code => win.webContents.executeJavaScript(code);
      const wait = async predicate => {
        for (let i = 0; i < 150; i++) { if (await run(predicate)) return; await new Promise(resolve => setTimeout(resolve, 20)); }
        throw new Error('Timed out: ' + predicate);
      };
      const change = async (label, value, input = false) => {
        await run('(() => { const element = document.querySelector(' + JSON.stringify('[aria-label="' + label + '"]') + '); Object.getOwnPropertyDescriptor(' + (input ? 'HTMLInputElement' : 'HTMLSelectElement') + '.prototype, "value").set.call(element, ' + JSON.stringify(value) + '); element.dispatchEvent(new Event(' + JSON.stringify(input ? 'input' : 'change') + ', {bubbles: true})); })()');
        await new Promise(resolve => setTimeout(resolve, 30));
      };
      const value = label => run('document.querySelector(' + JSON.stringify('[aria-label="' + label + '"]') + ').value');
      const save = () => run('Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("保存容量")).click()');
      try {
        await win.loadFile(${JSON.stringify(path.join(fixture, 'index.html'))});
        await wait('document.querySelector("input")?.value === "32768"');
        assert.equal(await value('上下文容量供应商'), 'a');
        await change('上下文容量模型', 'a2');
        assert.equal(await value('模型上下文容量'), '1048576');
        await change('模型上下文容量', '200000', true);
        await change('模型最大输出', '8192', true);
        await save(); await wait('window.saved.length === 1');
        const saved = await run('window.saved[0]');
        assert.equal(saved.id, 'a'); assert.equal(saved.apiKey, 'fixture-only');
        assert.equal(saved.models[0].contextWindow, 32768);
        assert.equal(saved.models[1].contextWindow, 200000);
        assert.equal(saved.models[1].maxOutputTokens, 8192);
        assert.equal(saved.models[1].reasoning, true);
        console.log('PASS capacity settings: empty providers skipped; selected model saved; sibling models and provider credentials/options preserved');

        for (const [capacity, output] of [['1000', '512'], ['200000.5', '1024'], ['200000', '-1'], ['200000', '200000']]) {
          await change('模型上下文容量', capacity, true); await change('模型最大输出', output, true);
          const before = await run('window.toasts.length'); await save();
          await wait('window.toasts.length > ' + before);
          assert.equal(await run('window.toasts.at(-1).type'), 'error');
          assert.equal(await run('window.saved.length'), 1);
        }
        await change('模型上下文容量', '1000000', true); await change('模型最大输出', '1000000', true);
        await save(); await wait('document.querySelector("#context-output-error")?.textContent.includes("最大输出必须小于")');
        if (process.env.NEO_CONTEXT_SCREENSHOT) { await new Promise(resolve => setTimeout(resolve, 100)); fs.writeFileSync(process.env.NEO_CONTEXT_SCREENSHOT, (await win.webContents.capturePage()).toPNG()); }
        assert.equal(await run('document.querySelector("[aria-label=模型最大输出]").getAttribute("aria-invalid")'),'true');
        assert.equal(await run('window.saved.length'),1);
        await change('模型最大输出','',true);
        assert.equal(await run('Boolean(document.querySelector("#context-output-error"))'),false);
        await save(); await wait('window.saved.length === 2');
        assert.equal(await run('window.saved[1].models[1].contextWindow'),1000000);
        assert.equal(await run('window.saved[1].models[1].maxOutputTokens'),undefined);
        await change('上下文容量供应商', 'b');
        assert.equal(await value('上下文容量模型'), 'b1');
        assert.equal(await value('模型上下文容量'), '');
        await change('模型上下文容量', '65536', true); await save();
        await wait('window.saved.length === 3');
        assert.equal(await run('window.saved[2].models[0].contextWindow'), 65536);
        assert.equal(await run('window.saved[2].enabled'), false);
        await change('模型上下文容量', '', true); await change('模型最大输出', '', true); await save();
        await wait('window.saved.length === 4');
        assert.equal(await run('window.saved[3].models[0].contextWindow'), undefined);
        assert.equal(await run('window.saved[3].models[0].maxOutputTokens'), undefined);
        console.log('PASS validation and unknown capacity: invalid limits rejected, provider switching isolated, blank limits remain unknown');
        await change('上下文容量供应商','deepseek');
        assert.equal(await value('输入参考价格'),'0.3');
        assert.equal(await value('输出参考价格'),'1.2');
        assert.equal(await value('价格币种'),'USD');
        await save(); await wait('window.saved.length === 5');
        assert.equal(await run('window.saved[4].models[0].inputPricePerMillion'),undefined, 'default is not frozen into user config');
        await change('输入参考价格','0.5',true); await change('输出参考价格','2',true);
        await change('价格币种','CNY'); await save(); await wait('window.saved.length === 6');
        assert.equal(await run('window.saved[5].models[0].inputPricePerMillion'),0.5);
        assert.equal(await run('window.saved[5].models[0].priceCurrency'),'CNY');
        await run('Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("恢复自动价格")).click()');
        await save(); await wait('window.saved.length === 7');
        assert.equal(await run('window.saved[6].models[0].inputPricePerMillion'),undefined);
        assert.equal(await run('window.saved[6].models[0].priceSource'),undefined);
        console.log('PASS model reference prices, manual currency overrides and restore automatic price');
        await change('上下文容量供应商','workbuddy');
        assert.equal(await value('输入参考价格'),'0.3');
        assert(await run('document.body.innerText.includes("模型公开 API 参考价（按模型匹配）")'));
        assert(await run('document.body.innerText.includes("WorkBuddy 按套餐和积分计费")'));
        await run('Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("填入参考价")).click()');
        assert.equal(await value('输入参考价格'),'0.3');
        assert.equal(await value('输出参考价格'),'1.2');
        await save(); await wait('window.saved.length === 8');
        assert.equal(await run('window.saved[7].models[0].priceSource'),'user');
        console.log('PASS gateway matches model reference price and labels it as an estimate');
        win.destroy(); app.exit(0);
      } catch (error) { console.error(error); win.destroy(); app.exit(1); }
    }).catch(error => { console.error(error); app.exit(1); });
  `);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((resolve, reject) => {
    const child = spawn(require('electron'), [host, '--no-sandbox'], {env, stdio: ['ignore', 'pipe', 'pipe']});
    const timer = setTimeout(() => { child.kill(); reject(new Error('Model capacity settings test timed out')); }, 20000);
    child.stdout.on('data', data => process.stdout.write(data));
    child.stderr.on('data', data => process.stderr.write(data));
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Settings test exited with ' + code)); });
  });
} finally { await fs.rm(fixture, {recursive: true, force: true}); }
