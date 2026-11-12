import path from 'node:path';
import { build } from 'esbuild';
export async function buildSessionWorker(directory) {
  const outfile = path.join(directory, 'agent-session-store.js');
  await build({ entryPoints: ['electron/services/agent/sessionStoreWorker.ts'], bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'silent' });
  return outfile;
}
