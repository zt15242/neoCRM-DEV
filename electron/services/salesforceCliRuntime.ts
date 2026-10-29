import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

export function getSalesforceCliCommand(): string {
  return process.platform === 'win32' ? 'sf.cmd' : 'sf';
}

export function getSalesforceCliEnvironment(): NodeJS.ProcessEnv {
  const home = os.homedir();
  const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const candidates = process.platform === 'win32'
    ? [
        path.join(appData, 'npm'),
        path.join(localAppData, 'sf', 'client', 'bin'),
        path.join(home, 'scoop', 'apps', 'nodejs', 'current', 'bin'),
        process.env['ProgramFiles'] ? path.join(process.env['ProgramFiles'], 'Salesforce CLI', 'bin') : '',
        process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'Salesforce CLI', 'bin') : '',
      ]
    : [
        '/opt/homebrew/bin',
        '/usr/local/bin',
        path.join(home, '.local', 'bin'),
        path.join(home, '.local', 'share', 'sf', 'client', 'bin'),
        path.join(home, '.npm-global', 'bin'),
        path.join(home, '.volta', 'bin'),
        path.join(home, '.asdf', 'shims'),
        path.join(home, '.local', 'share', 'mise', 'shims'),
      ];
  if (process.platform !== 'win32') {
    const nvmVersions = path.join(home, '.nvm', 'versions', 'node');
    try {
      for (const version of fs.readdirSync(nvmVersions)) {
        candidates.push(path.join(nvmVersions, version, 'bin'));
      }
    } catch {}
  }
  const existingPath = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const PATH = [...new Set([...candidates.filter(Boolean), ...existingPath])].join(path.delimiter);
  return { ...process.env, PATH };
}
