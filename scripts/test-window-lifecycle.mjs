import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-window-lifecycle-'));
const require = createRequire(import.meta.url);

try {
  const bundle = path.join(fixture, 'lifecycle.cjs');
  await build({ entryPoints: [path.join(root, 'electron/services/windowLifecycle.ts')],
    bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'silent' });
  const { configureWindowLifecycle } = require(bundle);

  function setup(platform) {
    const app = new EventEmitter();
    let created = 0;
    let cleanup = 0;
    let quitCount = 0;
    let current;
    class Window extends EventEmitter {
      destroyed = false;
      visible = true;
      minimized = false;
      focused = false;
      // Represents an ongoing conversation owned by the existing renderer.
      conversation = { id: 'ongoing-conversation', chunks: ['first'] };
      isDestroyed() { return this.destroyed; }
      isMinimized() { return this.minimized; }
      hide() { this.visible = false; }
      minimize() { this.minimized = true; }
      restore() { this.minimized = false; }
      show() { this.visible = true; }
      focus() { this.focused = true; }
      close() {
        const event = { prevented: false, preventDefault() { this.prevented = true; } };
        this.emit('close', event);
        if (!event.prevented) {
          this.destroyed = true;
          this.emit('closed');
          app.emit('window-all-closed');
        }
      }
    }
    app.quit = () => {
      assert(++quitCount < 3, 'Quit must not recursively cancel itself');
      app.emit('before-quit');
      if (current && !current.isDestroyed()) current.close();
      app.emit('will-quit');
    };
    const lifecycle = configureWindowLifecycle({ app, platform, getWindow: () => current,
      createWindow: () => { created++; current = new Window(); lifecycle.registerWindow(current); },
      onQuit: () => { cleanup++; } });
    lifecycle.showWindow();
    return { app, lifecycle, get window() { return current; }, get created() { return created; },
      get cleanup() { return cleanup; }, get quitCount() { return quitCount; } };
  }

  for (const platform of ['darwin', 'win32', 'linux']) {
    const test = setup(platform);
    const original = test.window;
    original.close();
    assert.equal(original.isDestroyed(), false);
    assert.equal(test.quitCount, 0);
    assert.equal(test.cleanup, 0);
    if (platform === 'darwin') assert.equal(original.visible, false);
    else assert.equal(original.isMinimized(), true);
    original.conversation.chunks.push('background response');
    test.app.emit('activate');
    assert.equal(test.window, original);
    assert.equal(test.created, 1);
    assert.equal(original.visible, true);
    assert.equal(original.isMinimized(), false);
    assert.equal(original.focused, true);
    assert.deepEqual(original.conversation.chunks, ['first', 'background response']);
    test.app.quit();
    assert.equal(original.isDestroyed(), true);
    assert.equal(test.quitCount, 1);
    assert.equal(test.cleanup, 1);
    test.app.emit('activate');
    assert.equal(test.created, 1);
    console.log(`PASS ${platform}: close preserves conversation; activation reuses window; explicit quit exits once`);
  }

  for (const platform of ['win32', 'linux']) {
    const test = setup(platform);
    test.window.close();
    test.window.close();
    assert.equal(test.window.isDestroyed(), true);
    assert.equal(test.quitCount, 1);
    assert.equal(test.cleanup, 1);
    console.log(`PASS ${platform}: close from the taskbar after minimizing exits the app`);
  }

  const shutdown = setup('win32');
  shutdown.window.emit('query-session-end');
  shutdown.window.emit('session-end');
  shutdown.window.close();
  assert.equal(shutdown.window.isDestroyed(), true);
  assert.equal(shutdown.cleanup, 1);
  assert.equal(shutdown.quitCount, 0);
  const recreate = setup('darwin');
  recreate.window.destroyed = true;
  recreate.app.emit('activate');
  assert.equal(recreate.created, 2);
  console.log('PASS shutdown permits closing and runs cleanup once; a destroyed window can be recreated');

  if (process.argv.includes('--native')) {
    const host = path.join(fixture, 'host.cjs');
    await fs.writeFile(host, `
      const { app, BrowserWindow } = require('electron');
      const assert = require('node:assert/strict');
      const { configureWindowLifecycle } = require(${JSON.stringify(bundle)});
      app.setPath('userData', ${JSON.stringify(path.join(fixture, 'user-data'))});
      let win, created = 0, cleanup = 0;
      const lifecycle = configureWindowLifecycle({ app, platform: process.platform,
        getWindow: () => win, createWindow: () => { created++; throw new Error('Unexpected recreation'); },
        onQuit: () => { cleanup++; } });
      app.whenReady().then(async () => {
        try {
          win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
          lifecycle.registerWindow(win);
          await win.loadURL('data:text/html,<title>NeoCRM lifecycle test</title><script>window.conversation={id:123,chunks:1}</script>');
          win.showInactive();
          win.close();
          assert.equal(win.isDestroyed(), false);
          if (process.platform === 'darwin') assert.equal(win.isVisible(), false);
          assert.equal(cleanup, 0);
          await win.webContents.executeJavaScript('window.conversation.chunks++');
          app.emit('activate');
          assert.equal(win.isVisible(), true);
          assert.equal(created, 0);
          assert.deepEqual(await win.webContents.executeJavaScript('window.conversation'), { id:123, chunks:2 });
          console.log('PASS native Electron: closing preserves the renderer; activation restores the same conversation');
          app.once('will-quit', () => {
            assert.equal(cleanup, 1);
            assert.equal(win.isDestroyed(), true);
            console.log('PASS native Electron: explicit app.quit closes the retained window and exits');
          });
          app.quit();
        } catch (error) { console.error(error); app.exit(1); }
      }).catch(error => { console.error(error); app.exit(1); });
    `);
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    await new Promise((resolve, reject) => {
      const child = spawn(require('electron'), [host], { env, stdio: ['ignore', 'pipe', 'pipe'] });
      const timeout = setTimeout(() => { child.kill(); reject(new Error('Native lifecycle test timed out')); }, 25000);
      child.stdout.on('data', data => process.stdout.write(data));
      child.stderr.on('data', data => process.stderr.write(data));
      child.on('error', error => { clearTimeout(timeout); reject(error); });
      child.on('exit', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`Native lifecycle test exited with ${code}`)); });
    });
  }
} finally {
  await fs.rm(fixture, { recursive: true, force: true });
}
