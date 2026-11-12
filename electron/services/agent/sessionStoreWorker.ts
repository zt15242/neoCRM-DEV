import { parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { AiChatMessage, AiChatSession } from '../../../shared/types';
import type { SessionStoreInfo, SessionStoreRequest } from './sessionRepositoryTypes';

const directory: string = workerData.directory;
const databasePath = path.join(directory, 'neocrm_ai_sessions.sqlite');
const legacyPath = path.join(directory, 'neocrm_ai_sessions.json');
const resourceDirectory = path.join(directory, 'ai-session-resources');
const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
let db: DatabaseSync;
let info: SessionStoreInfo;
const lockPath = `${databasePath}.lock`;
const lockToken = `${process.pid}-${process.ppid}-${randomUUID()}`;
let lock: number | undefined;
function acquireLock() {
  try { lock = fs.openSync(lockPath, 'wx', 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const previous = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (!Number.isSafeInteger(previous.pid) || previous.pid <= 0) throw new Error('历史数据库锁文件无效，请保留数据并检查其他应用实例');
    try { process.kill(previous.pid, 0); }
    catch (failure) {
      if ((failure as NodeJS.ErrnoException).code !== 'ESRCH') throw failure;
      fs.unlinkSync(lockPath);
      lock = fs.openSync(lockPath, 'wx', 0o600);
    }
    if (lock === undefined) {
      if (previous.parentPid !== process.ppid || typeof previous.token !== 'string' || !previous.token.startsWith(`${previous.pid}-${previous.parentPid}-`)) {
        throw new Error('历史数据库锁的进程身份不匹配，未自动删除；请确认其他实例已退出后处理锁文件');
      }
      throw new Error('历史数据库已由另一个应用实例打开，请关闭该实例后重试');
    }
  }
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, parentPid: process.ppid, token: lockToken }));
}
function releaseLock() {
  if (lock === undefined) return;
  try { fs.closeSync(lock); } finally { lock = undefined; }
  try { if (JSON.parse(fs.readFileSync(lockPath, 'utf8')).token === lockToken) fs.unlinkSync(lockPath); } catch { /* preserve foreign locks */ }
}

function configure(database: DatabaseSync) {
  database.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA trusted_schema=OFF;');
}
function schema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE sessions(id TEXT PRIMARY KEY, metadata TEXT NOT NULL, updated_at REAL NOT NULL, created_at REAL NOT NULL,
      owner TEXT, run_status TEXT, message_count INTEGER NOT NULL, ordinal INTEGER NOT NULL UNIQUE);
    CREATE INDEX session_order ON sessions(updated_at DESC, id);
    CREATE INDEX session_owner ON sessions(owner);
    CREATE TABLE messages(session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, position INTEGER NOT NULL,
      message_id TEXT NOT NULL, digest TEXT NOT NULL, payload TEXT, resource TEXT,
      PRIMARY KEY(session_id,position), UNIQUE(session_id,message_id));
    CREATE TABLE tombstones(id TEXT PRIMARY KEY);
    CREATE INDEX message_resource ON messages(resource) WHERE resource IS NOT NULL;
    CREATE TABLE store_info(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    PRAGMA user_version=1;
  `);
}
function transaction<T>(run: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const result = run(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
function validate(session: AiChatSession) {
  if (!session || typeof session.id !== 'string' || !session.id || typeof session.title !== 'string'
    || !Array.isArray(session.messages) || !Number.isFinite(session.createdAt) || !Number.isFinite(session.updatedAt)) throw new Error('会话数据格式无效，原始历史未被覆盖');
  const ids = new Set<string>();
  for (const message of session.messages) {
    if (!message || typeof message.id !== 'string' || !message.id || ids.has(message.id)
      || !['user', 'assistant', 'system', 'tool'].includes(message.role) || typeof message.content !== 'string') throw new Error(`会话 ${session.id} 存在无效或重复消息，原始历史未被覆盖`);
    ids.add(message.id);
  }
}
function metadata(session: AiChatSession) {
  const { messages: _messages, messagesLoaded: _loaded, messageCount: _count, ...rest } = session;
  return rest;
}
function resource(payload: string, digest: string) {
  fs.mkdirSync(resourceDirectory, { recursive: true, mode: 0o700 });
  const filename = path.join(resourceDirectory, `${digest}.json`);
  try { fs.writeFileSync(filename, payload, { flag: 'wx', mode: 0o600, flush: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || hash(fs.readFileSync(filename)) !== digest) throw error;
  }
  return digest;
}
function readMessage(row: any): AiChatMessage {
  if (row.resource && !/^[a-f0-9]{64}$/.test(row.resource)) throw new Error('会话资源引用无效');
  const payload = row.resource ? fs.readFileSync(path.join(resourceDirectory, `${row.resource}.json`), 'utf8') : row.payload;
  if (hash(payload) !== row.digest) throw new Error('会话消息校验失败，请从历史备份恢复；未返回空历史');
  return JSON.parse(payload);
}
function get(id: string, before?: number, limit?: number) {
  const row = db.prepare('SELECT metadata,message_count FROM sessions WHERE id=?').get(id) as any;
  if (!row) return null;
  const total = row.message_count as number;
  const end = before === undefined ? total : Math.min(total, bounded(before, 0, Number.MAX_SAFE_INTEGER));
  const offset = limit === undefined ? 0 : Math.max(0, end - bounded(limit, 1, 200));
  const rows = db.prepare('SELECT payload,resource,digest FROM messages WHERE session_id=? AND position>=? AND position<? ORDER BY position').all(id, offset, end);
  const session: AiChatSession = { ...JSON.parse(row.metadata), messages: rows.map(readMessage), messagesLoaded: offset === 0 && end === total, messageCount: total };
  if (session.messages.length !== end - offset) throw new Error('会话消息数量不一致，请检查历史数据库');
  return { session, offset, nextBefore: offset > 0 ? offset : null, total };
}
function save(session: AiChatSession, options: { fromAgent?: boolean; active?: boolean } = {}) {
  if (typeof session?.id !== 'string' || !session.id) throw new Error('缺少有效会话 ID');
  if (db.prepare('SELECT id FROM tombstones WHERE id=?').get(session.id)) throw new Error('会话已删除，已拒绝迟到的保存请求');
  const stored = db.prepare('SELECT metadata,message_count,ordinal FROM sessions WHERE id=?').get(session.id) as any;
  const previous = stored ? JSON.parse(stored.metadata) as AiChatSession : undefined;
  if (!stored && session.agentRun && !db.prepare('SELECT id FROM sessions WHERE id=?').get(session.agentRun.createdBySessionId)) throw new Error('主会话已删除，代理未创建');
  let keepMessages = session.messagesLoaded === false || (!options.fromAgent && !!previous?.agentRun);
  if (session.messagesLoaded === false && !stored) throw new Error('会话摘要不能作为完整会话保存');
  const input = session.messagesLoaded === false ? { ...previous!, title: session.title, pinned: session.pinned, updatedAt: session.updatedAt, messages: [] } : session;
  const next = { ...input, ...(!options.fromAgent && previous?.agentRun ? { agentRun: previous.agentRun } : {}),
    ...(keepMessages && previous ? { compactionSummary: previous.compactionSummary } : {}) };
  if (previous?.agentRun && !options.fromAgent && !options.active && session.messagesLoaded !== false) {
    const current = get(session.id)!.session.messages;
    const known = new Set(current.map(message => message.id));
    const appended = session.messages.filter(message => !known.has(message.id));
    if (appended.length) { next.messages = [...current, ...appended]; keepMessages = false; }
  }
  if (previous?.compactionSummary && previous.compactionSummary.originalMessageCount > (next.compactionSummary?.originalMessageCount ?? 0)) next.compactionSummary = previous.compactionSummary;
  validate({ ...next, messages: keepMessages ? [] : next.messages });
  if (!keepMessages) validate(next);
  const ordinal = stored?.ordinal ?? (db.prepare('SELECT COALESCE(MAX(ordinal),0)+1 AS value FROM sessions').get() as any).value;
  db.prepare(`INSERT INTO sessions(id,metadata,updated_at,created_at,owner,run_status,message_count,ordinal) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata,updated_at=excluded.updated_at,created_at=excluded.created_at,
    owner=excluded.owner,run_status=excluded.run_status,message_count=excluded.message_count`).run(
    next.id, JSON.stringify(metadata(next)), next.updatedAt, next.createdAt, next.agentRun?.createdBySessionId ?? null,
    next.agentRun?.status ?? null, keepMessages ? stored.message_count : next.messages.length, ordinal);
  if (!keepMessages) {
    const existing = db.prepare('SELECT position,digest,message_id FROM messages WHERE session_id=? ORDER BY position').all(session.id) as any[];
    const put = db.prepare('INSERT INTO messages(session_id,position,message_id,digest,payload,resource) VALUES(?,?,?,?,?,?)');
    // Delete only changed positions first, allowing reorder/deletion without unique-ID collisions.
    const changed = next.messages.map((message, position) => {
      const payload = JSON.stringify(message), digest = hash(payload);
      return { message, position, payload, digest, same: existing[position]?.digest === digest && existing[position]?.message_id === message.id };
    });
    const remove = db.prepare('DELETE FROM messages WHERE session_id=? AND position=?');
    for (const item of changed) if (!item.same) remove.run(next.id, item.position);
    db.prepare('DELETE FROM messages WHERE session_id=? AND position>=?').run(next.id, next.messages.length);
    for (const item of changed) if (!item.same) {
      const external = Buffer.byteLength(item.payload) > 64 * 1024 ? resource(item.payload, item.digest) : null;
      put.run(next.id, item.position, item.message.id, item.digest, external ? null : item.payload, external);
    }
  }
  return session.messagesLoaded === false ? { ...metadata(next), messages: [], messagesLoaded: false, messageCount: stored.message_count } : get(next.id)!.session;
}
function bounded(value: number, min: number, max: number) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`分页参数必须为 ${min}–${max} 的整数`);
  return value;
}

/** Parse one top-level array entry at a time; no complete legacy history in memory. */
async function* legacySessions(filename: string): AsyncGenerator<AiChatSession> {
  let started = false, ended = false, expectingValue = true, afterComma = false;
  let entry = '', depth = 0, quoted = false, escaped = false;
  for await (const chunk of fs.createReadStream(filename, { encoding: 'utf8', highWaterMark: 64 * 1024 })) {
    for (const character of chunk) {
      if (!started) { if (/\s|\uFEFF/.test(character)) continue; if (character !== '[') throw new Error('旧会话历史必须是 JSON 数组'); started = true; continue; }
      if (ended) { if (!/\s/.test(character)) throw new Error('旧会话历史数组后存在无效内容'); continue; }
      if (!entry) {
        if (/\s/.test(character)) continue;
        if (character === ']') { if (afterComma) throw new Error('旧会话历史含无效尾随逗号'); ended = true; continue; }
        if (!expectingValue) { if (character !== ',') throw new Error('旧会话历史缺少分隔符'); expectingValue = true; afterComma = true; continue; }
        if (character !== '{') throw new Error('旧会话记录格式无效');
        entry = character; depth = 1; afterComma = false; continue;
      }
      entry += character;
      if (quoted) { if (escaped) escaped = false; else if (character === '\\') escaped = true; else if (character === '"') quoted = false; }
      else if (character === '"') quoted = true;
      else if (character === '{' || character === '[') depth++;
      else if (character === '}' || character === ']') depth--;
      if (!depth) { const session = JSON.parse(entry); entry = ''; expectingValue = false; yield session; }
    }
  }
  if (!started || !ended || entry) throw new Error('旧会话历史不完整，已保留原文件，请修复或恢复备份');
}
async function fileHash(filename: string) {
  const digest = createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) digest.update(chunk);
  return digest.digest('hex');
}
async function initializeDatabase() {
  if (db) return info;
  await fsp.mkdir(directory, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(databasePath)) {
    const temp = `${databasePath}.${randomUUID()}.migrating`;
    info = { schemaVersion: 1, migratedSessions: 0, migratedMessages: 0 };
    try {
      if (fs.existsSync(legacyPath)) {
        const digest = await fileHash(legacyPath);
        const backup = `${legacyPath}.backup-${digest}`;
        try { await fsp.copyFile(legacyPath, backup, fs.constants.COPYFILE_EXCL); await fsp.chmod(backup, 0o600); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
        if (await fileHash(backup) !== digest) throw new Error('旧会话备份校验失败，迁移已停止');
        info.backupPath = backup;
      }
      db = new DatabaseSync(temp); configure(db); schema(db);
      db.exec('BEGIN IMMEDIATE');
      try {
        if (info.backupPath) for await (const session of legacySessions(info.backupPath)) {
          validate(session);
          if (db.prepare('SELECT id FROM sessions WHERE id=?').get(session.id)) throw new Error(`旧历史存在重复会话 ID：${session.id}`);
          const saved = save(session);
          if (JSON.stringify({ ...metadata(session), messages: session.messages }) !== JSON.stringify({ ...metadata(saved), messages: saved.messages })) throw new Error(`会话 ${session.id} 迁移校验不一致`);
          info.migratedSessions++; info.migratedMessages += session.messages.length;
        }
        if (info.backupPath && await fileHash(legacyPath) !== await fileHash(info.backupPath)) throw new Error('迁移期间旧历史发生变化，请关闭其他版本后重试');
        db.prepare('INSERT INTO store_info(key,value) VALUES(?,?)').run('migration', JSON.stringify(info));
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      const check = db.prepare('PRAGMA quick_check').get() as any;
      if (check.quick_check !== 'ok') throw new Error('迁移数据库校验失败');
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close();
      await fsp.chmod(temp, 0o600);
      if (fs.existsSync(databasePath)) throw new Error('历史数据库已由其他进程创建，请重启应用');
      await fsp.rename(temp, databasePath);
    } catch (error) {
      try { db?.close(); } catch { /* already closed */ }
      db = undefined as unknown as DatabaseSync;
      throw error;
    } finally {
      for (const suffix of ['', '-wal', '-shm']) await fsp.rm(temp + suffix, { force: true }).catch(() => {});
    }
  }
  db = new DatabaseSync(databasePath); configure(db);
  try {
    if ((db.prepare('PRAGMA user_version').get() as any).user_version !== 1) throw new Error('历史数据库版本不受支持，未自动降级或覆盖');
    info = JSON.parse((db.prepare('SELECT value FROM store_info WHERE key=?').get('migration') as any).value);
    transaction(() => {
      const interrupted = db.prepare("SELECT id FROM sessions WHERE run_status IN ('running','queued')").all() as { id: string }[];
      for (const row of interrupted) {
        const session = get(row.id)!.session;
        session.agentRun = { ...session.agentRun!, status: 'interrupted', finishedAt: Date.now(), error: '应用已重启，任务中断；可发送消息继续' };
        for (const message of session.messages) message.toolCalls = message.toolCalls?.map(tool => tool.status === 'running' ? { ...tool, status: 'error', resultSummary: '应用已重启，执行中断' } : tool);
        save(session, { fromAgent: true });
      }
    });
    return info;
  } catch (error) { db.close(); db = undefined as unknown as DatabaseSync; throw error; }
}
async function initialize() {
  if (db) return info;
  await fsp.mkdir(directory, { recursive: true, mode: 0o700 });
  acquireLock();
  try {
    const prefix = `${path.basename(databasePath)}.`;
    for (const name of await fsp.readdir(directory)) {
      if (name.startsWith(prefix) && /^[a-f0-9-]{36}\.migrating(?:-wal|-shm)?$/.test(name.slice(prefix.length))) await fsp.rm(path.join(directory, name), { force: true });
    }
    return await initializeDatabase();
  }
  catch (error) { releaseLock(); throw error; }
}
function collectUnusedResources() {
  if (!fs.existsSync(resourceDirectory)) return;
  const referenced = db.prepare('SELECT 1 FROM messages WHERE resource=? LIMIT 1');
  for (const filename of fs.readdirSync(resourceDirectory)) {
    const match = filename.match(/^([a-f0-9]{64})\.json$/);
    if (match && !referenced.get(match[1])) {
      try { fs.rmSync(path.join(resourceDirectory, filename), { force: true }); }
      catch { console.warn('[History] 未引用的资源暂时无法清理，将在之后重试'); }
    }
  }
}
function tryCollectUnusedResources() {
  try { collectUnusedResources(); }
  catch { console.warn('[History] 会话已保存，资源清理将稍后重试'); }
}
let savesSinceCollection = 0;
async function dispatch(request: SessionStoreRequest) {
  if (request.operation === 'initialize') return initialize();
  if (request.operation === 'close') { db?.close(); releaseLock(); return; }
  if (!db) throw new Error('会话存储未初始化');
  switch (request.operation) {
    case 'list': {
      const offset = bounded(request.offset ?? 0, 0, Number.MAX_SAFE_INTEGER), limit = bounded(request.limit ?? 100, 1, 200);
      const where = request.owner === undefined ? 'WHERE message_count>0' : 'WHERE message_count>0 AND owner=?';
      const args = request.owner === undefined ? [] : [request.owner];
      const total = (db.prepare(`SELECT COUNT(*) AS count FROM sessions ${where}`).get(...args) as any).count as number;
      const rows = db.prepare(`SELECT metadata,message_count FROM sessions ${where} ORDER BY updated_at DESC,id LIMIT ? OFFSET ?`).all(...args, limit, offset) as any[];
      return { sessions: rows.map(row => ({ ...JSON.parse(row.metadata), messages: [], messagesLoaded: false, messageCount: row.message_count })), total, nextOffset: offset + rows.length < total ? offset + rows.length : null };
    }
    case 'get': return get(request.id, request.before, request.limit);
    case 'save': {
      const saved = transaction(() => save(request.session, request));
      if (++savesSinceCollection >= 100) { savesSinceCollection = 0; tryCollectUnusedResources(); }
      return saved;
    }
    case 'delete': return transaction(() => {
      db.prepare('INSERT OR IGNORE INTO tombstones SELECT id FROM sessions WHERE id=? OR owner=?').run(request.id, request.id);
      db.prepare('INSERT OR IGNORE INTO tombstones VALUES(?)').run(request.id);
      db.prepare('DELETE FROM sessions WHERE id=? OR owner=?').run(request.id, request.id);
    });
    case 'clear': {
      transaction(() => { db.exec('INSERT OR IGNORE INTO tombstones SELECT id FROM sessions; DELETE FROM sessions;'); });
      tryCollectUnusedResources();
      return;
    }
  }
}

// Serializes asynchronous initialization and writes; failure rejects that request and preserves the source.
let queue: Promise<unknown> = Promise.resolve();
parentPort!.on('message', (request: SessionStoreRequest & { requestId: number }) => {
  queue = queue.catch(() => {}).then(async () => {
    try { parentPort!.postMessage({ requestId: request.requestId, value: await dispatch(request) }); }
    catch (error) { parentPort!.postMessage({ requestId: request.requestId, error: (error as Error).message || '会话存储失败' }); }
  });
});
