import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

// Electron's real ASAR loader and its embedded SQLite, not an extracted copy or host Node's SQLite.
if (!process.versions.electron) {
  const status = await new Promise((resolve, reject) => {
    const child = spawn(createRequire(import.meta.url)('electron'), [fileURLToPath(import.meta.url), ...process.argv.slice(2)],
      { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    child.on('error', reject); child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
  process.exit(status);
}
const artifact = path.resolve(process.argv[2] || 'dist-electron');
const directory = artifact.endsWith('.asar') ? path.join(artifact, 'dist-electron') : artifact;
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-built-sqlite-'));
let repository;
try {
  const { SessionRepository } = await import(pathToFileURL(path.join(directory, 'agent-session-repository.js')).href);
  repository = new SessionRepository(temporary);
  assert.equal((await repository.initialize()).schemaVersion, 1);
  const session = { id: 'built-store', title: '中文路径', presetId: 'harness-agent', providerId: 'fixture', modelId: 'fixture',
    createdAt: 1, updatedAt: 2, messages: Array.from({ length: 120 }, (_, index) => ({ id: `m-${index}`,
      role: index % 2 ? 'assistant' : 'user', content: index === 1 ? 'large-resource'.repeat(10000) : `消息 ${index}`, createdAt: index })) };
  await repository.save(session);
  const list = await repository.list();
  assert.equal(list.sessions[0].messagesLoaded, false);
  assert.equal(list.sessions[0].messages.length, 0);
  assert.equal((await repository.messages(session.id, undefined, 25)).nextBefore, 95);
  await repository.close();
  repository = new SessionRepository(temporary);
  assert.deepEqual((await repository.get(session.id)).messages, session.messages);
  console.log(`PASS built SQLite worker: actual ${artifact.endsWith('.asar') ? 'ASAR' : 'dist'} loader, resources and restart (${process.platform}, Electron ${process.versions.electron})`);
} finally {
  await repository?.close();
  await fs.rm(temporary, { recursive: true, force: true });
}
