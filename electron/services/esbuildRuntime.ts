import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export function configurePackagedEsbuildBinary(): string | undefined {
  if (!app.isPackaged) return undefined;

  const platformPackage = `${process.platform}-${process.arch}`;
  const binaryPath = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    '@esbuild',
    platformPackage,
    process.platform === 'win32' ? 'esbuild.exe' : 'bin/esbuild',
  );

  if (!fs.existsSync(binaryPath)) {
    console.error(`[esbuild] Packaged binary is missing from the unpacked app resources (${platformPackage})`);
    return undefined;
  }

  process.env.ESBUILD_BINARY_PATH = binaryPath;
  console.info('[esbuild] Configured packaged runtime to use the unpacked platform binary');
  return binaryPath;
}
