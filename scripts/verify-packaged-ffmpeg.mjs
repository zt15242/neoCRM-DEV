import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { manifest, sha256 } from './prepare-ffmpeg.mjs';

const execFileAsync = promisify(execFile);

export async function verifyPackagedFfmpeg(resourcesDir, platform = process.platform, arch = process.arch) {
  const target = `${platform}-${arch}`;
  const spec = manifest.targets[target];
  assert.ok(spec, `未配置 ffmpeg 目标: ${target}`);
  const directory = path.join(resourcesDir, 'bin', 'ffmpeg');
  const binaryPath = path.join(directory, spec.binaryName);
  assert.equal(await sha256(binaryPath), spec.binarySha256, `安装包 ffmpeg 文件损坏或架构错误: ${target}`);
  assert.equal(await sha256(path.join(directory, 'ffmpeg.LICENSE')), spec.licenseSha256);
  assert.equal(await sha256(path.join(directory, 'ffmpeg.README')), spec.readmeSha256);
  if (platform === process.platform && arch === process.arch) {
    const { stdout } = await execFileAsync(binaryPath, ['-version'], { windowsHide: true, timeout: 15_000 });
    assert.match(stdout, /^ffmpeg version /);
    // Exercise the exact codec/segment format used by meeting transcription, offline.
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'NeoCRM 音频切片 '));
    try {
      await execFileAsync(binaryPath, [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000', '-t', '65',
        '-map', '0:a:0', '-vn', '-f', 'segment', '-segment_time', '30',
        '-reset_timestamps', '1', '-c:a', 'libmp3lame', '-b:a', '64k',
        path.join(temp, 'chunk_%03d.mp3'),
      ], { windowsHide: true, timeout: 30_000 });
      const chunks = (await fs.readdir(temp)).filter((name) => /^chunk_\d+\.mp3$/.test(name));
      assert.equal(chunks.length, 3, '65 秒音频应切为 3 段');
      for (const chunk of chunks) assert.ok((await fs.stat(path.join(temp, chunk))).size > 0);
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  }
  console.info(`[ffmpeg] 安装包校验通过: ${target}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv[2], '请指定应用的 resources 目录');
  await verifyPackagedFfmpeg(process.argv[2], process.argv[3], process.argv[4]);
}
