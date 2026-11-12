import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';

export function getBundledNeoCliRoot(): string {
  return app?.isPackaged ? path.join(process.resourcesPath, 'neo-cli')
    : path.join(app?.getAppPath?.() || process.cwd(), 'resources', 'neo-cli', `${process.platform}-${process.arch}`);
}

export function getNeoCliEnvironment(): NodeJS.ProcessEnv {
  // GUI apps can inherit a shorter PATH than the terminal used to install neo.
  const userBins = process.platform === 'win32'
    ? [path.join(process.env.APPDATA || os.homedir(), 'npm')]
    : [path.join(os.homedir(), '.local', 'bin'), path.join(os.homedir(), '.npm-global', 'bin'), '/opt/homebrew/bin', '/usr/local/bin'];
  const bundled = path.join(getBundledNeoCliRoot(), 'node_modules', '.bin');
  const bins = [...(fs.existsSync(bundled) ? [bundled] : []), ...userBins.filter((directory) => fs.existsSync(directory)), ...(process.env.PATH || '').split(path.delimiter)];
  return { ...process.env, PATH: [...new Set(bins.filter(Boolean))].join(path.delimiter), NEO_TELEMETRY: 'false' };
}
