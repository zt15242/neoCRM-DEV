import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-role-access-ui-'));
try {
  await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { flushSync } from 'react-dom';
    import { AppSidebar } from './src/components/AppSidebar';
    import { AiSidebar } from './src/components/ai/AiSidebar';
    import { AiInputComposer } from './src/components/ai/AiInputComposer';
    import { ConfirmDeployApprovalModal } from './src/components/ai/ConfirmDeployApprovalModal';
    import { ToolCallCard } from './src/components/ai/ToolCallCard';
    import { AI_AGENT_PRESETS } from './shared/constants';
    const root = createRoot(document.getElementById('root'));
    const noop = () => {};
    let renderId = 0;
    window.neoApi = {};
    window.testShow = (kind, id, status) => {
      window.testSelected = ''; window.testLicenseOpens = 0;
      const preset = AI_AGENT_PRESETS.find(p => p.id === id);
      const common = { sessions: [], activeSessionId: null, selectedPresetId: id,
        onSelectPreset: (value) => { window.testSelected = value; },
        onOpenLicenseModal: () => { window.testLicenseOpens++; },
        workflowLicenseStatus: status, session: { isLoggedIn: false },
        presets: AI_AGENT_PRESETS, onSelectSession: noop, onNewChatDraft: noop,
        onDeleteSession: noop, onUpdateSessionTitle: noop, onClearSessions: noop };
      const node = kind === 'app' ? <AppSidebar {...common} platform="darwin" activeTab="ai" />
        : kind === 'sidebar' ? <AiSidebar {...common} />
        : kind === 'composer' ? <AiInputComposer {...common} currentPresetId={id} currentPresetName={preset.name}
            isCrmLoggedIn={false} isStreaming={false} onSend={noop} onStop={noop} entityRefs={[]} onRemoveEntityRef={noop}
            onOpenEntityPicker={noop} enableTools={true} onToggleTools={noop} />
        : kind === 'tool' ? <ToolCallCard toolCall={{ id: 'fixture', name: 'list_flows', arguments: { procType: 2 }, status: 'success',
            resultData: { source: id === 'pending' ? undefined : id, fallbackReason: id === 'legacy' ? 'fixture API unavailable' : undefined } }} />
        : <ConfirmDeployApprovalModal plan={{ flow: { processName: 'fixture', entityApiKey: 'account' }, nodes: [], edges: [] }}
            crmSession={{ isLoggedIn: false }} onClose={noop} onRefreshSession={noop} showToast={noop} />;
      flushSync(() => root.render(<React.Fragment key={++renderId}>{node}</React.Fragment>));
    };
    window.testReady = true;
  ` }, bundle: true, platform: 'browser', format: 'iife', outfile: path.join(fixture, 'renderer.js'), logLevel: 'silent' });
  await fs.writeFile(path.join(fixture, 'index.html'), '<!doctype html><html><body><div id="root"></div><script src="./renderer.js"></script></body></html>');
  const host = path.join(fixture, 'host.cjs');
  await fs.writeFile(host, `
    const { app, BrowserWindow } = require('electron');
    const assert = require('node:assert/strict');
    app.setPath('userData', ${JSON.stringify(path.join(fixture, 'user-data'))});
    app.whenReady().then(async () => {
      const win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
      const run = code => win.webContents.executeJavaScript(code);
      const clickRole = name => run('Array.from(document.querySelectorAll("button")).find(b => b.innerText.includes(' + JSON.stringify(name) + ')).click()');
      try {
        await win.loadFile(${JSON.stringify(path.join(fixture, 'index.html'))});
        for (let i = 0; i < 100 && !await run('Boolean(window.testReady)'); i++) await new Promise(r => setTimeout(r, 20));
        for (const kind of ['app', 'sidebar']) {
          for (const status of [null, { isAuthorized: false, remainingDays: 0 }, { isAuthorized: true, remainingDays: 10 }]) {
            for (const [id, name] of [['nex-architect', 'Nex页面扩展大师'], ['approval-architect', '审批流架构与部署专家']]) {
              await run('window.testShow(' + JSON.stringify(kind) + ',' + JSON.stringify(id) + ',' + JSON.stringify(status) + ')');
              await clickRole('NeoCRM');
              await new Promise(r => setTimeout(r, 30));
              const rows = await run('Array.from(document.querySelectorAll("button")).map(b => b.innerText)');
              const row = rows.find(text => text.includes(name));
              assert(row, kind + ': missing ' + name);
              assert(!/锁|剩.*天|设备已绑定/.test(row), row);
              assert(!rows.some(text => text.includes('BI分析部署大师')));
              assert(!rows.some(text => text.includes('自动流程架构与部署专家')));
              await clickRole(name);
              assert.equal(await run('window.testSelected'), id);
              assert.equal(await run('window.testLicenseOpens'), 0);
            }
          }
        }
        console.log('PASS UI menus: NEX/approval show normal badges and select without activation under all license states');
        for (const id of ['nex-architect', 'approval-architect', 'autoflow-architect', 'neobi-architect']) {
          await run('window.testShow("composer",' + JSON.stringify(id) + ',{isAuthorized:false})');
          const text = await run('document.body.innerText');
          assert.equal(text.includes('已上锁'), false, id);
          assert(!/剩.*天/.test(text));
        }
        await run('window.testShow("approval","approval-architect",null)');
        const text = await run('document.body.innerText');
        assert(!/未激活授权|已激活|剩.*天/.test(text), text);
        console.log('PASS UI composer/deployment: no license badge for NEX or approvals; hidden roles do not leak license badges');
        for (const [source, badge] of [['cli', 'neo CLI'], ['legacy', '兼容回退'], ['pending', 'CLI 优先']]) {
          await run('window.testShow("tool",' + JSON.stringify(source) + ',null)');
          assert((await run('document.body.innerText')).includes(badge), source);
        }
        console.log('PASS UI approval tool cards: distinguish CLI success, CLI pending and legacy fallback');
        win.destroy(); app.exit(0);
      } catch (error) { console.error(error); win.destroy(); app.exit(1); }
    }).catch(error => { console.error(error); app.exit(1); });
  `);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((resolve, reject) => {
    const child = spawn(createRequire(import.meta.url)('electron'), [host, '--no-sandbox'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Role access UI test timed out')); }, 30000);
    child.stdout.on('data', data => process.stdout.write(data));
    child.stderr.on('data', data => process.stderr.write(data));
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('exit', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error('Role access UI test exited with ' + code)); });
  });
} finally {
  await fs.rm(fixture, { recursive: true, force: true });
}
