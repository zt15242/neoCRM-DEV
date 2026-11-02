import fs from 'node:fs';
import path from 'node:path';

/** Resolve outside app.asar: child processes cannot execute an archived binary. */
export function resolveFfmpegBinary(options: {
  isPackaged: boolean;
  resourcesPath: string;
  appPath: string;
  platform?: NodeJS.Platform;
  arch?: string;
  overridePath?: string;
}): string {
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const override = options.overridePath?.trim();
  if (override) {
    if (!fs.existsSync(override) || !fs.statSync(override).isFile()) {
      throw new Error('NEOCRM_FFMPEG_PATH 指定的 ffmpeg 文件不存在，请检查配置。');
    }
    return override;
  }
  const binaryName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const bundledPath = options.isPackaged
    ? path.join(options.resourcesPath, 'bin', 'ffmpeg', binaryName)
    : path.join(options.appPath, 'resources', 'ffmpeg', `${platform}-${arch}`, binaryName);
  if (fs.existsSync(bundledPath) && fs.statSync(bundledPath).isFile()) return bundledPath;
  if (options.isPackaged) {
    throw new Error('安装包内的音频处理工具缺失，请重新安装应用。');
  }
  // Developers may use their own ffmpeg or run npm run prepare:ffmpeg.
  return binaryName;
}
