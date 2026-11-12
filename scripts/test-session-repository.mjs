import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';
import { buildSessionWorker } from './fixtures/build-session-worker.mjs';
import { exportHistory } from './export-ai-history.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-history-tests-'));
const worker = await buildSessionWorker(root);
const bundle = path.join(root, 'repository.cjs');
await build({ entryPoints: ['electron/services/agent/sessionRepository.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'silent' });
const { SessionRepository } = createRequire(import.meta.url)(bundle);
const open = new Set();
const repository = directory => { const result = new SessionRepository(directory, worker); open.add(result); return result; };
const close = async subject => { await subject.close(); open.delete(subject); };
const session = (id, count = 1) => ({ id, title: id, presetId: 'harness-agent', providerId: 'fixture', modelId: 'fixture',
  projectId: '项目', createdAt: 1, updatedAt: 2,
  messages: Array.from({ length: count }, (_, i) => ({ id: `${id}-${i}`, role: i % 2 ? 'assistant' : 'user', content: `消息 ${i} { "brackets": [ 1, 2 ] } \\`, createdAt: i })) });
try {
  const directory = path.join(root, '中文历史'); await fs.mkdir(directory);
  const legacy = path.join(directory, 'neocrm_ai_sessions.json');
  const records = [session('long', 1200), ...Array.from({ length: 205 }, (_, i) => session(`session-${i}`))];
  records[0].messages[30].toolCalls = [{ id: 'tool', name: 'execute_open_api', arguments: { method: 'GET' }, status: 'success', resultData: { values: '大型工具结果'.repeat(20000) } }];
  records[0].compactionSummary = { originalMessageCount: 24, summary: '保留检查点', compactedAt: 3 };
  await fs.writeFile(legacy, JSON.stringify(records));
  const bytes = await fs.readFile(legacy), digest = createHash('sha256').update(bytes).digest('hex');
  const subject = repository(directory);
  let mainTicks = 0;
  const timer = setInterval(() => mainTicks++, 1);
  const migrated = await subject.initialize();
  clearInterval(timer);
  assert(mainTicks > 0, 'Migration leaves the main event loop available');
  assert.equal(migrated.migratedSessions, 206);
  assert.equal(migrated.migratedMessages, 1405);
  assert.deepEqual(await fs.readFile(migrated.backupPath), bytes);
  assert.deepEqual(await fs.readFile(legacy), bytes);
  assert(migrated.backupPath.endsWith(digest));
  assert.equal((await subject.list(0, 80)).sessions.length, 80);
  const all = await subject.summaries();
  assert.equal(all.length, 206);
  assert(all.every(item => item.messages.length === 0 && item.messagesLoaded === false && item.messageCount > 0));
  assert(!JSON.stringify(all).includes('大型工具结果'));
  const full = await subject.get('long');
  assert.deepEqual(full.messages, records[0].messages);
  assert.deepEqual(full.compactionSummary, records[0].compactionSummary);
  let before, loaded = [];
  do {
    const page = await subject.messages('long', before, 137);
    loaded = [...page.session.messages, ...loaded];
    before = page.nextBefore;
  } while (before !== null);
  assert.deepEqual(loaded, records[0].messages);
  const partial = await subject.messages('long', undefined, 20);
  await subject.save({ ...partial.session, title: '分页只读回写不得截断历史' });
  assert.equal((await subject.get('long')).messages.length, 1200);
  await assert.rejects(subject.messages('long', undefined, 0), /分页参数/);
  await assert.rejects(subject.list(-1, 10), /分页参数/);
  assert.equal(await subject.get('missing'), null);
  assert.equal((await fs.readdir(path.join(directory, 'ai-session-resources'))).length, 1);
  const blob = path.join(directory, 'ai-session-resources', (await fs.readdir(path.join(directory, 'ai-session-resources')))[0]);
  const blobBytes = await fs.readFile(blob);
  await fs.writeFile(blob, 'corrupt resource');
  await assert.rejects(subject.get('long'), /消息校验失败/);
  assert.equal((await subject.summaries()).length, 206, 'A corrupt resource does not replace the database with empty history');
  await fs.writeFile(blob, blobBytes);

  const inspector = new DatabaseSync(path.join(directory, 'neocrm_ai_sessions.sqlite'));
  const unchanged = inspector.prepare('SELECT rowid,digest FROM messages WHERE session_id=? AND position=5').get('long');
  full.messages[1199].content = '只修改最后一条';
  await subject.save(full);
  assert.deepEqual(inspector.prepare('SELECT rowid,digest FROM messages WHERE session_id=? AND position=5').get('long'), unchanged, 'Unchanged messages retain their rows');
  assert.equal(inspector.prepare('SELECT COUNT(*) AS n FROM messages').get().n, 1405);
  inspector.close();
  const summary = (await subject.summaries()).find(item => item.id === 'long');
  await subject.save({ ...summary, title: '仅重命名' });
  assert.equal((await subject.get('long')).messages.length, 1200);
  assert.equal((await subject.get('long')).title, '仅重命名');
  await Promise.all(Array.from({ length: 10 }, (_, i) => subject.save(session(`parallel-${i}`))));
  assert.equal((await subject.summaries()).length, 216);
  await close(subject);
  const reopened = repository(directory);
  assert.equal((await reopened.initialize()).migratedSessions, 206, 'Migration is idempotent');
  assert.equal((await reopened.get('long')).messages.at(-1).content, '只修改最后一条');
  const exported = path.join(root, 'rollback-snapshot.json');
  const exportInfo = await exportHistory(reopened, exported);
  assert.equal(exportInfo.sessions, 216);
  const restoredRecords = JSON.parse(await fs.readFile(exported, 'utf8'));
  assert.equal(restoredRecords.find(record => record.id === 'long').messages.at(-1).content, '只修改最后一条');
  assert.equal(restoredRecords.some(record => 'messagesLoaded' in record || 'messageCount' in record), false);
  await assert.rejects(exportHistory(reopened, exported), /EEXIST/);
  assert.equal(JSON.parse(await fs.readFile(exported, 'utf8')).length, 216);
  assert.deepEqual(await fs.readFile(legacy), bytes, 'SQLite writes never rewrite the migration source');
  const competing = repository(directory);
  await assert.rejects(competing.initialize(), /另一个应用实例/);
  await close(competing);
  console.log('PASS migration: 206 sessions/1,405 messages, exact backup, checkpoint/tool roundtrip, paged reads, large resource, incremental rows, concurrent saves and exclusive open');

  const orphanDirectory = path.join(root, 'orphan-agent-migration'); await fs.mkdir(orphanDirectory);
  const migrationParent = session('migration-parent');
  const ownedChild = { ...session('owned-child', 2), agentRun: { kind: 'subagent', createdBySessionId: migrationParent.id,
    parentSessionId: migrationParent.id, status: 'completed', requestId: 'owned-run', messageId: 'owned-answer' } };
  const orphanedChild = { ...session('orphaned-child', 3), agentRun: { kind: 'subagent', createdBySessionId: 'deleted-parent',
    parentSessionId: 'deleted-parent', status: 'completed', requestId: 'orphan-run', messageId: 'orphan-answer' } };
  await fs.writeFile(path.join(orphanDirectory, 'neocrm_ai_sessions.json'), JSON.stringify([ownedChild, orphanedChild, migrationParent]));
  const orphanMigration = repository(orphanDirectory);
  assert.equal((await orphanMigration.initialize()).migratedSessions, 3);
  assert.equal((await orphanMigration.get(ownedChild.id)).agentRun.createdBySessionId, migrationParent.id,
    'migration preserves agent ownership when the parent appears later in the legacy file');
  const recoveredOrphan = await orphanMigration.get(orphanedChild.id);
  assert.equal(recoveredOrphan.agentRun, undefined, 'a deleted parent detaches the child from live agent ownership');
  assert.deepEqual(recoveredOrphan.messages, orphanedChild.messages, 'orphan detachment retains all conversation history');
  await close(orphanMigration);
  console.log('PASS migration recovers orphan agent history and preserves children whose parent appears later');

  const parent = session('parent');
  const child = { ...session('child', 2), agentRun: { kind: 'subagent', createdBySessionId: parent.id, status: 'running', requestId: 'r', messageId: 'child-1' } };
  child.messages[1].toolCalls = [{ id: 'in-flight', name: 'write', arguments: {}, status: 'running' }];
  await reopened.save(parent); await reopened.save(child, { fromAgent: true });
  await reopened.save({ ...child, messages: [], agentRun: { ...child.agentRun, status: 'completed' } }, { active: true });
  assert.equal((await reopened.get('child')).messages.length, 2);
  assert.equal((await reopened.get('child')).agentRun.status, 'running');
  await reopened.save({ ...child, messages: child.messages.map(message => ({...message, content: '完成的真实结果'})), agentRun: {...child.agentRun, status:'completed'} }, {fromAgent:true});
  await reopened.save({ ...child, messages: [...child.messages, {id:'child-followup',role:'user',content:'继续',createdAt:3}] });
  assert.equal((await reopened.get('child')).messages[1].content, '完成的真实结果', 'A stale renderer cannot replace a completed managed answer');
  assert.equal((await reopened.get('child')).messages.at(-1).id, 'child-followup');
  await reopened.save(child, {fromAgent:true});
  await close(reopened);
  const restart = repository(directory); await restart.initialize();
  assert.equal((await restart.get('child')).agentRun.status, 'interrupted');
  assert.equal((await restart.get('child')).messages[1].toolCalls[0].status, 'error');
  await restart.delete('parent');
  assert.equal(await restart.get('child'), null);
  await assert.rejects(restart.save(child, { fromAgent: true }), /已删除/);
  await assert.rejects(restart.save({ ...child, id: 'late-new-child' }, { fromAgent: true }), /主会话已删除/);
  assert(await restart.get('long'));
  await restart.clear();
  assert.deepEqual(await restart.summaries(), []);
  assert.deepEqual(await fs.readdir(path.join(directory, 'ai-session-resources')), []);
  await assert.rejects(restart.save(full), /已删除/);
  await restart.save(session('new-after-clear'));
  assert.equal((await restart.summaries()).length, 1);
  await close(restart);
  console.log('PASS lifecycle: active-agent state protected, interrupted tools recovered, owned deletion/tombstones, clear and fresh-session saves');

  for (const [label, input] of [
    ['invalid-json', '[{"id":'], ['invalid-record', '[null]'], ['trailing-comma', `[${JSON.stringify(session('tail-comma'))},]`],
    ['duplicate-session', JSON.stringify([session('duplicate'), session('duplicate')])],
    ['duplicate-message', JSON.stringify([{ ...session('bad'), messages: [session('bad').messages[0], session('bad').messages[0]] }])],
  ]) {
    const broken = path.join(root, label); await fs.mkdir(broken);
    const file = path.join(broken, 'neocrm_ai_sessions.json'); await fs.writeFile(file, input);
    const fail = repository(broken);
    await assert.rejects(fail.initialize());
    await assert.rejects(fail.save(session('must-not-overwrite')));
    assert.equal(await fs.readFile(file, 'utf8'), input);
    assert.equal((await fs.readdir(broken)).includes('neocrm_ai_sessions.sqlite'), false);
    await close(fail);
    await fs.writeFile(file, JSON.stringify([session('repaired')]));
    const repaired = repository(broken); await repaired.initialize();
    assert.equal((await repaired.get('repaired')).messages.length, 1);
    await close(repaired);
  }
  const corrupt = path.join(root, 'corrupt-db'); await fs.mkdir(corrupt);
  await fs.writeFile(path.join(corrupt, 'neocrm_ai_sessions.sqlite'), 'not a database');
  const invalidDb = repository(corrupt); await assert.rejects(invalidDb.initialize());
  assert.equal(await fs.readFile(path.join(corrupt, 'neocrm_ai_sessions.sqlite'), 'utf8'), 'not a database');
  await close(invalidDb);
  const forgedLock = path.join(root, 'forged-lock'); await fs.mkdir(forgedLock);
  const forgedFile = path.join(forgedLock, 'neocrm_ai_sessions.sqlite.lock');
  await fs.writeFile(forgedFile, JSON.stringify({pid:process.pid,parentPid:0,token:'foreign'}));
  const forged = repository(forgedLock); await assert.rejects(forged.initialize(), /身份不匹配/);
  assert.equal(JSON.parse(await fs.readFile(forgedFile, 'utf8')).token, 'foreign');
  await close(forged);
  console.log('PASS failure safety: corrupt JSON/database and duplicate IDs never become empty history; failed migrations can retry after repair');

  const interruptedDirectory = path.join(root, 'interrupted-migration'); await fs.mkdir(interruptedDirectory);
  const deadPid = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
    child.on('error', reject); child.on('exit', () => resolve(child.pid));
  });
  const interruptedDb = path.join(interruptedDirectory, 'neocrm_ai_sessions.sqlite');
  await fs.writeFile(`${interruptedDb}.lock`, JSON.stringify({pid:deadPid,token:randomUUID()}));
  await fs.writeFile(`${interruptedDb}.${randomUUID()}.migrating`, 'unfinished temporary database');
  await fs.writeFile(path.join(interruptedDirectory, 'neocrm_ai_sessions.json'), JSON.stringify([session('resume-migration', 9)]));
  const resumed = repository(interruptedDirectory); await resumed.initialize();
  assert.equal((await resumed.get('resume-migration')).messages.length, 9);
  assert(!(await fs.readdir(interruptedDirectory)).some(name => name.endsWith('.migrating')));
  await close(resumed);
  console.log('PASS interrupted migration recovery: dead-process lock and partial temporary database are discarded before verified reimport');
} finally {
  await Promise.allSettled([...open].map(subject => subject.close()));
  await fs.rm(root, { recursive: true, force: true });
}
