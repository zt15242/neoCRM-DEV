import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function getNeoCliEnvironment(): NodeJS.ProcessEnv {
  // GUI apps can inherit a shorter PATH than the terminal used to install neo.
  const userBins = process.platform === 'win32'
    ? [path.join(process.env.APPDATA || os.homedir(), 'npm')]
    : [path.join(os.homedir(), '.local', 'bin'), path.join(os.homedir(), '.npm-global', 'bin'), '/opt/homebrew/bin', '/usr/local/bin'];
  const bins = [...userBins.filter((directory) => fs.existsSync(directory)), ...(process.env.PATH || '').split(path.delimiter)];
  return { ...process.env, PATH: [...new Set(bins.filter(Boolean))].join(path.delimiter), NEO_TELEMETRY: 'false' };
}
