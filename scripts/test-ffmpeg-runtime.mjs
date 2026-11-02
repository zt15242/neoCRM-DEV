import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { resolveFfmpegBinary } from '../electron/services/ffmpegRuntime.ts';
import { prepareFfmpeg, projectDir } from './prepare-ffmpeg.mjs';
import { verifyPackagedFfmpeg } from './verify-packaged-ffmpeg.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'NeoCRM 安装包 音频测试 '));
const require = createRequire(import.meta.url);
try {
  const resourcesPath = path.join(root, 'resources');
  const appPath = path.join(resourcesPath, 'app.asar');
  const options = { isPackaged: true, resourcesPath, appPath, platform: 'win32', arch: 'x64' };
  assert.throws(() => resolveFfmpegBinary(options), /安装包内/);
  const bundled = path.join(resourcesPath, 'bin', 'ffmpeg', 'ffmpeg.exe');
  await fs.mkdir(path.dirname(bundled), { recursive: true });
  await fs.writeFile(bundled, 'test');
  assert.equal(resolveFfmpegBinary(options), bundled, '使用安装目录下的 exe，不依赖 PATH 或当前目录');
  assert.throws(() => resolveFfmpegBinary({ ...options, overridePath: path.join(root, 'missing.exe') }), /NEOCRM_FFMPEG_PATH/);
  const overridePath = path.join(root, 'custom ffmpeg.exe');
  await fs.writeFile(overridePath, 'test');
  assert.equal(resolveFfmpegBinary({ ...options, overridePath }), overridePath);
  assert.equal(resolveFfmpegBinary({ ...options, isPackaged: false }), 'ffmpeg.exe');
  const devBinary = path.join(appPath, 'resources', 'ffmpeg', 'win32-x64', 'ffmpeg.exe');
  await fs.mkdir(path.dirname(devBinary), { recursive: true });
  await fs.writeFile(devBinary, 'test');
  assert.equal(resolveFfmpegBinary({ ...options, isPackaged: false }), devBinary);

  // Copy a real platform binary to an installation path containing spaces and Chinese characters.
  const binary = await prepareFfmpeg();
  const installedResources = path.join(root, '真实安装目录');
  const { load } = require('js-yaml');
  const { getFileMatchers, copyFiles } = require('app-builder-lib/out/fileMatcher.js');
  const config = load(await fs.readFile(path.join(projectDir, 'electron-builder.yml'), 'utf8'));
  const matchers = getFileMatchers(config, 'extraResources', installedResources, {
    defaultSrc: projectDir,
    globalOutDir: root,
    customBuildOptions: process.platform === 'darwin' ? config.mac : config.win,
    macroExpander: (value) => value.replaceAll('${arch}', process.arch),
  });
  await copyFiles(matchers, null, false);
  assert.deepEqual((await fs.readdir(path.join(installedResources, 'bin', 'ffmpeg'))).sort(), [
    'SOURCE.json', path.basename(binary), 'ffmpeg.LICENSE', 'ffmpeg.README',
  ].sort(), '打包资源应包含工具和说明，不包含中断下载留下的临时目录');
  assert.equal(resolveFfmpegBinary({
    isPackaged: true, resourcesPath: installedResources, appPath,
  }), path.join(installedResources, 'bin', 'ffmpeg', path.basename(binary)));
  await verifyPackagedFfmpeg(installedResources);
  await fs.writeFile(path.join(installedResources, 'bin', 'ffmpeg', path.basename(binary)), 'corrupted');
  await assert.rejects(verifyPackagedFfmpeg(installedResources), /损坏或架构错误/);
  console.info('内置 ffmpeg 路径、完整性和真实音频切片测试通过');
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
