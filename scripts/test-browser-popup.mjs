import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const elements = new Map();
for (const id of ['token', 'feedback', 'status-title', 'status-description', 'pairing', 'intro', 'connect', 'disconnect', 'version']) {
  elements.set(id, { value: '', textContent: '', hidden: false, open: false, disabled: false, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, focus() { this.focused = true; } });
}
const connection = { dataset: {} };
let stored = {};
let state = 'disconnected';
const chrome = {
  storage: { local: { get: async () => ({ ...stored }), set: async data => { stored = { ...stored, ...data }; }, clear: async () => { stored = {}; } } },
  runtime: { getManifest: () => ({ version: '0.3.0' }), sendMessage: async message => { if (message.type === 'connect') state = 'waiting'; if (message.type === 'disconnect') state = 'disconnected'; return { state }; } },
};
const context = vm.createContext({ chrome, document: { getElementById: id => elements.get(id), querySelector: () => connection }, setInterval: () => 0 });
vm.runInContext(await readFile('browser-extension/popup.js', 'utf8'), context);
await new Promise(resolve => setImmediate(resolve));
assert.equal(elements.get('status-title').textContent, '未连接');
await elements.get('connect').listeners.click();
assert.match(elements.get('feedback').textContent, /不正确/);
elements.get('token').value = 'a'.repeat(64);
await elements.get('connect').listeners.click();
assert.equal(stored.port, 39877);
assert.equal(elements.get('status-title').textContent, '等待连接');
assert.equal(elements.get('disconnect').hidden, false);
state = 'connected';
await context.refresh();
assert.equal(elements.get('status-title').textContent, '已连接');
await elements.get('disconnect').listeners.click();
assert.equal(elements.get('status-title').textContent, '未连接');
assert.deepEqual(stored, {});
console.log('Browser popup: unpaired, validation, waiting, connected and disconnect states passed');
