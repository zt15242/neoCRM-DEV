import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import axios from 'axios';

export const projectDir = fileURLToPath(new URL('../', import.meta.url));
export const manifest = JSON.parse(await fs.readFile(new URL('./ffmpeg-manifest.json', import.meta.url), 'utf8'));

export async function sha256(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function matches(filePath, expected) {
  try { return (await sha256(filePath)) === expected; } catch { return false; }
}

async function download(assetName, destination, expected) {
  const url = `${manifest.baseUrl}/${manifest.release}/${assetName}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const apiUrl = `https://api.github.com/repos/eugeneware/ffmpeg-static/releases/assets/${manifest.assets[assetName]}`;
      const response = await axios.get(attempt === 0 ? url : apiUrl, {
        responseType: 'stream', timeout: attempt === 0 ? 30_000 : 180_000, maxRedirects: 5,
        headers: { 'User-Agent': 'NeoCRM-ffmpeg-build', Accept: 'application/octet-stream' },
      });
      await pipeline(response.data, createWriteStream(destination));
      if (!await matches(destination, expected)) throw new Error(`SHA-256 校验失败: ${assetName}`);
      return;
    } catch (error) {
      await fs.rm(destination, { force: true });
      if (attempt === 2) throw error;
      console.warn(`[ffmpeg] 下载 ${assetName} 暂时失败，将重试官方备用地址`);
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
}

export async function prepareFfmpeg({ projectDir: root = projectDir, platform = process.platform, arch = process.arch } = {}) {
  const target = `${platform}-${arch}`;
  const spec = manifest.targets[target];
  if (!spec) throw new Error(`未配置 ffmpeg 构建产物: ${target}`);
  const directory = path.join(root, 'resources', 'ffmpeg', target);
  await fs.mkdir(directory, { recursive: true });
  // Stage each download separately. An interrupted build cannot leave a valid-looking binary.
  const staging = await fs.mkdtemp(path.join(directory, '.download-'));
  try {
    const binaryPath = path.join(directory, spec.binaryName);
    if (!await matches(binaryPath, spec.binarySha256)) {
      console.info(`[ffmpeg] 下载 ${manifest.release} ${target}`);
      const archive = path.join(staging, 'binary.gz');
      await download(`ffmpeg-${target}.gz`, archive, spec.archiveSha256);
      const extracted = path.join(staging, spec.binaryName);
      await pipeline(createReadStream(archive), createGunzip(), createWriteStream(extracted));
      if (!await matches(extracted, spec.binarySha256)) throw new Error(`ffmpeg 可执行文件校验失败: ${target}`);
      await fs.chmod(extracted, 0o755);
      await fs.rm(binaryPath, { force: true });
      await fs.rename(extracted, binaryPath);
    }
    if (platform !== 'win32') await fs.chmod(binaryPath, 0o755);
    for (const [suffix, hash] of [['LICENSE', spec.licenseSha256], ['README', spec.readmeSha256]]) {
      const destination = path.join(directory, `ffmpeg.${suffix}`);
      if (await matches(destination, hash)) continue;
      const temporary = path.join(staging, suffix);
      await download(`${target}.${suffix}`, temporary, hash);
      await fs.rm(destination, { force: true });
      await fs.rename(temporary, destination);
    }
    await fs.writeFile(path.join(directory, 'SOURCE.json'), `${JSON.stringify({
      release: manifest.release, target,
      source: `${manifest.baseUrl}/${manifest.release}`,
      binarySha256: spec.binarySha256,
    }, null, 2)}\n`);
    console.info(`[ffmpeg] 已准备并校验 ${target}`);
    return binaryPath;
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareFfmpeg({ platform: process.argv[2] || process.platform, arch: process.argv[3] || process.arch });
}
