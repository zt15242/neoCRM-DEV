import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

/** Export one conversation at a time; publish only a complete, synced snapshot and never overwrite an existing file. */
export async function exportHistory(repository, output) {
  const destination = path.resolve(output), temporary = `${destination}.${randomUUID()}.tmp`;
  let handle;
  let sessions = 0, messages = 0;
  const digest = createHash('sha256');
  try {
    handle = await fs.open(temporary, 'wx', 0o600);
    const write = async text => { digest.update(text); await handle.writeFile(text); };
    await write('[');
    let offset = 0;
    do {
      const page = await repository.list(offset, 100);
      for (const summary of page.sessions) {
        const session = await repository.get(summary.id);
        if (!session) throw new Error('导出期间会话发生变化，未发布不完整文件');
        const { messagesLoaded: _loaded, messageCount: _count, ...record } = session;
        await write(`${sessions ? ',' : ''}\n${JSON.stringify(record)}`);
        sessions++; messages += record.messages.length;
      }
      offset = page.nextOffset;
    } while (offset !== null);
    await write('\n]\n');
    await handle.sync(); await handle.close(); handle = undefined;
    await fs.link(temporary, destination);
    return { sessions, messages, sha256: digest.digest('hex') };
  } finally { await handle?.close(); await fs.rm(temporary, { force: true }); }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  if (!process.versions.electron) {
    const status = await new Promise((resolve, reject) => {
      const child = spawn(createRequire(import.meta.url)('electron'), [fileURLToPath(import.meta.url), ...process.argv.slice(2)],
        { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
      child.on('error', reject); child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    });
    process.exit(status);
  }
  const args = process.argv.slice(2);
  const parameter = flag => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
  const data = parameter('--data-dir'), output = parameter('--output');
  if (!data || !output) throw new Error('用法：node scripts/export-ai-history.mjs --data-dir <应用数据目录> --output <新的 JSON 文件>。请先退出 NeoCRM。');
  await fs.access(path.join(path.resolve(data), 'neocrm_ai_sessions.sqlite'));
  const { SessionRepository } = await import(pathToFileURL(path.resolve('dist-electron/agent-session-repository.js')).href);
  const repository = new SessionRepository(path.resolve(data));
  try { await repository.initialize(); console.log(JSON.stringify(await exportHistory(repository, output))); }
  finally { await repository.close(); }
}
