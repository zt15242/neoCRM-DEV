import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const executable = createRequire(import.meta.url)('electron');
for (const file of ['scripts/test-session-repository.mjs', 'scripts/test-agent-sessions.mjs']) {
  const status = await new Promise((resolve, reject) => {
    const child = spawn(executable, [file], { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    child.on('error', reject);
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
  if (status !== 0) process.exit(status);
}
