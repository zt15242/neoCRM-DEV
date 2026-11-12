import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const artifact = path.resolve(process.argv[2] || 'dist-electron');
let preload;
try {
  if (artifact.endsWith('.asar')) {
    const asar = require('@electron/asar');
    const relative = 'dist-electron/preload.js';
    assert(asar.listPackage(artifact).some(name => name.replace(/^[/\\]/, '').replace(/\\/g, '/') === relative), 'Packaged preload.js is missing');
    preload = path.join(artifact, relative);
  } else preload = path.join(artifact, 'preload.js');
  if (!artifact.endsWith('.asar')) await fs.access(preload);
  const host = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'neo-preload-host-')), 'host.cjs');
  await fs.writeFile(host, `
    const { app, BrowserWindow } = require('electron');
    app.whenReady().then(async () => {
      const win = new BrowserWindow({ show: false, webPreferences: { preload: ${JSON.stringify(preload)}, contextIsolation: true, nodeIntegration: false, sandbox: false } });
      await win.loadURL('data:text/html,<html><body>bridge</body></html>');
      const result = await win.webContents.executeJavaScript('({hasApi:typeof window.neoApi==="object",hasConfig:typeof window.neoApi?.aiGetConfig==="function",hasSessions:typeof window.neoApi?.aiGetSessions==="function"})');
      console.log(JSON.stringify(result));
      win.destroy(); app.exit(result.hasApi && result.hasConfig && result.hasSessions ? 0 : 2);
    }).catch(error => { console.error(error); app.exit(1); });
  `);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const output = await new Promise((resolve, reject) => {
    const child = spawn(require('electron'), [host, '--no-sandbox'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', value => stdout += value); child.stderr.on('data', value => stderr += value);
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve(stdout) : reject(new Error(stderr || stdout || `preload smoke exited ${code}`)));
  });
  assert.match(output, /"hasApi":true/);
  console.log(`PASS preload bridge: neoApi, aiGetConfig and aiGetSessions (${artifact.endsWith('.asar') ? 'ASAR' : 'dist'})`);
} finally { /* BrowserWindow and the app own no persistent test state. */ }
