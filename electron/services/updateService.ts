import { app, BrowserWindow, shell } from 'electron';
import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import semver from 'semver';
import { UpdateInfo, DownloadProgress } from '../../shared/types';

export const GITHUB_OWNER = 'zt15242';
export const GITHUB_REPO = 'neoCRM-DEV';

/**
 * 国内高速下载加速镜像列表 (按稳定性与速度优先级排列，最后为空代表直连兜底)
 */
const DOWNLOAD_MIRRORS = [
  'https://ghfast.top/',
  'https://gh-proxy.com/',
  'https://gh.llkk.cc/',
  '',
];

export class UpdateService {
  private downloadedFilePath: string | null = null;

  /**
   * 获取当前本地版本号
   */
  public getCurrentVersion(): string {
    try {
      const pkgPath = path.resolve(process.cwd(), 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.version) return pkg.version;
      }
    } catch {}
    return app?.getVersion ? app.getVersion() : '1.0.0';
  }

  /**
   * 检查是否有新版本 (带国内多节点容错与加速)
   */
  public async checkForUpdates(): Promise<UpdateInfo> {
    const currentVersion = this.getCurrentVersion();
    const cleanCurrent = semver.clean(currentVersion) || '1.0.0';

    // 1. 尝试检测 Releases Latest (支持直连及加速源)
    const releaseApiUrls = [
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      `https://ghfast.top/https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
    ];

    for (const apiUrl of releaseApiUrls) {
      try {
        const res = await axios.get(apiUrl, {
          headers: { 'User-Agent': 'NeoCRM-Desktop-Updater' },
          timeout: 6000,
        });

        if (res.data && res.data.tag_name) {
          const latestVer = semver.clean(res.data.tag_name) || res.data.tag_name.replace(/^v/, '');
          const hasUpdate =
            semver.valid(latestVer) && semver.valid(cleanCurrent)
              ? semver.gt(latestVer, cleanCurrent)
              : latestVer !== cleanCurrent;

          const assets: any[] = res.data.assets || [];
          const matchedAsset = this.findMatchingAsset(assets);

          return {
            hasUpdate,
            currentVersion: cleanCurrent,
            latestVersion: latestVer,
            releaseName: res.data.name || `v${latestVer}`,
            releaseNotes: res.data.body || '性能优化与功能更新',
            publishedAt: res.data.published_at,
            downloadUrl: matchedAsset?.browser_download_url,
            assetName: matchedAsset?.name,
            size: matchedAsset?.size,
            releasePageUrl: res.data.html_url || `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`,
          };
        }
      } catch {
        // 当前节点超时，继续尝试下一个加速节点
      }
    }

    // 2. 降级检测 main 分支推送的最新 package.json (通过国内加速镜像拉取)
    const rawPkgUrls = [
      `https://ghfast.top/https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/package.json?t=${Date.now()}`,
      `https://gh-proxy.com/https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/package.json?t=${Date.now()}`,
      `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/package.json?t=${Date.now()}`,
    ];

    let remoteVersion = cleanCurrent;
    for (const url of rawPkgUrls) {
      try {
        const pkgRes = await axios.get(url, { timeout: 5000 });
        if (pkgRes.data?.version) {
          remoteVersion = semver.clean(pkgRes.data.version) || pkgRes.data.version;
          break;
        }
      } catch {}
    }

    const hasUpdate =
      semver.valid(remoteVersion) && semver.valid(cleanCurrent)
        ? semver.gt(remoteVersion, cleanCurrent)
        : remoteVersion !== cleanCurrent;

    return {
      hasUpdate,
      currentVersion: cleanCurrent,
      latestVersion: remoteVersion,
      releaseName: `v${remoteVersion}`,
      releaseNotes: '包含最新功能优化与问题修复',
      publishedAt: new Date().toISOString(),
      releasePageUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`,
    };
  }

  /**
   * 根据当前操作系统与 CPU 架构匹配对应的安装包
   */
  private findMatchingAsset(assets: any[]): any | null {
    if (!assets || !assets.length) return null;
    const platform = process.platform;
    const arch = process.arch; // 'arm64' | 'x64'

    if (platform === 'darwin') {
      const dmg =
        assets.find((a) => a.name.endsWith('.dmg') && a.name.toLowerCase().includes(arch)) ||
        assets.find((a) => a.name.endsWith('.dmg'));
      if (dmg) return dmg;
    } else if (platform === 'win32') {
      const exe =
        assets.find((a) => a.name.toLowerCase().includes('setup') && a.name.endsWith('.exe')) ||
        assets.find((a) => a.name.endsWith('.exe'));
      if (exe) return exe;
    }

    return assets[0];
  }

  /**
   * 下载更新安装包 (内置国内多节点高速镜像自动轮询加速，彻底解决 ETIMEDOUT)
   */
  public async downloadUpdate(
    downloadUrl: string,
    fileName: string,
    win?: BrowserWindow | null
  ): Promise<{ success: boolean; filePath?: string; error?: string }> {
    const tempDir = app.getPath('temp');
    const targetPath = path.join(tempDir, fileName || `NeoCRM_Update_${Date.now()}.dmg`);

    let lastError = '网络连接超时';

    // 依次尝试国内加速镜像节点与直连节点
    for (const mirrorPrefix of DOWNLOAD_MIRRORS) {
      const candidateUrl =
        mirrorPrefix && downloadUrl.startsWith('https://github.com')
          ? `${mirrorPrefix}${downloadUrl}`
          : downloadUrl;

      try {
        console.log(`[Updater] 正在尝试通过节点下载: ${candidateUrl}`);
        await this.downloadFromSingleUrl(candidateUrl, targetPath, win);
        this.downloadedFilePath = targetPath;
        return { success: true, filePath: targetPath };
      } catch (err: any) {
        lastError = err.message || '节点连接失败';
        console.warn(`[Updater] 节点下载失败 (${candidateUrl}): ${lastError}，正在自动切换备用节点...`);
        // 清理未完成的半截临时文件
        try {
          if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
        } catch {}
      }
    }

    return {
      success: false,
      error: `所有下载节点均连接失败 (${lastError})，请稍后重试`,
    };
  }

  /**
   * 单节点流式下载执行器
   */
  private async downloadFromSingleUrl(
    url: string,
    targetPath: string,
    win?: BrowserWindow | null
  ): Promise<void> {
    const writer = fs.createWriteStream(targetPath);
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      timeout: 20000, // 20秒连接与响应超时，超时快速切换下一镜像
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) NeoCRM-Desktop-Updater',
      },
    });

    const totalLength = parseInt(response.headers['content-length'] || '0', 10);
    let downloadedLength = 0;
    const startTime = Date.now();

    response.data.on('data', (chunk: Buffer) => {
      downloadedLength += chunk.length;
      if (win && !win.isDestroyed() && totalLength > 0) {
        const elapsedSec = Math.max(0.5, (Date.now() - startTime) / 1000);
        const progress: DownloadProgress = {
          percent: Math.min(100, Math.round((downloadedLength / totalLength) * 100)),
          transferred: downloadedLength,
          total: totalLength,
          bytesPerSecond: Math.round(downloadedLength / elapsedSec),
        };
        win.webContents.send('updater:downloadProgress', progress);
      }
    });

    await new Promise<void>((resolve, reject) => {
      response.data.pipe(writer);
      let error: Error | null = null;
      writer.on('error', (err) => {
        error = err;
        writer.close();
        reject(err);
      });
      response.data.on('error', (err: Error) => {
        error = err;
        writer.close();
        reject(err);
      });
      writer.on('close', () => {
        if (!error) resolve();
      });
    });
  }

  /**
   * 通过 Git Pull 直接拉取远端最新代码更新
   */
  public async gitPullUpdate(): Promise<{ success: boolean; output: string }> {
    return new Promise((resolve) => {
      exec('git pull origin main', { cwd: process.cwd() }, (error, stdout, stderr) => {
        if (error) {
          resolve({
            success: false,
            output: stderr || error.message,
          });
        } else {
          resolve({
            success: true,
            output: stdout || '代码已更新至最新版本',
          });
        }
      });
    });
  }

  /**
   * 打开已下载的安装包进行安装
   */
  public async openDownloadedInstaller(): Promise<boolean> {
    if (this.downloadedFilePath && fs.existsSync(this.downloadedFilePath)) {
      await shell.openPath(this.downloadedFilePath);
      return true;
    }
    return false;
  }
}
