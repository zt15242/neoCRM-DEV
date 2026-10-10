import { app, BrowserWindow, shell } from 'electron';
import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import semver from 'semver';
import { UpdateInfo, DownloadProgress } from '../../shared/types';

export const GITHUB_OWNER = 'zt15242';
export const GITHUB_REPO = 'neoCRM-DEV';

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
   * 检查是否有新版本 (同时支持 GitHub Releases 与 Git 远端分支版本检测)
   */
  public async checkForUpdates(): Promise<UpdateInfo> {
    const currentVersion = this.getCurrentVersion();
    const cleanCurrent = semver.clean(currentVersion) || '1.0.0';

    // 1. 尝试检测 GitHub Releases Latest
    try {
      const releaseUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
      const res = await axios.get(releaseUrl, {
        headers: { 'User-Agent': 'NeoCRM-Desktop-Updater' },
        timeout: 8000,
      });

      if (res.data && res.data.tag_name) {
        const latestVer = semver.clean(res.data.tag_name) || res.data.tag_name.replace(/^v/, '');
        const hasUpdate = semver.valid(latestVer) && semver.valid(cleanCurrent)
          ? semver.gt(latestVer, cleanCurrent)
          : latestVer !== cleanCurrent;

        // 匹配当前系统的安装包资源
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
      // 若尚未创建 Release，继续检测 Git 主分支的 package.json 和最新 Commit
    }

    // 2. 检测 GitHub main 分支推送的最新 package.json 与 Commit
    try {
      const rawPkgUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/package.json?t=${Date.now()}`;
      const commitApiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits/main`;

      const [pkgRes, commitRes] = await Promise.allSettled([
        axios.get(rawPkgUrl, { timeout: 8000 }),
        axios.get(commitApiUrl, { headers: { 'User-Agent': 'NeoCRM-Desktop-Updater' }, timeout: 8000 }),
      ]);

      let remoteVersion = cleanCurrent;
      if (pkgRes.status === 'fulfilled' && pkgRes.value.data?.version) {
        remoteVersion = semver.clean(pkgRes.value.data.version) || pkgRes.value.data.version;
      }

      let commitMsg = '包含最新代码提交与功能优化';
      let commitDate = new Date().toISOString();
      let commitSha = '';
      if (commitRes.status === 'fulfilled' && commitRes.value.data) {
        const cData = commitRes.value.data;
        commitSha = String(cData.sha || '').substring(0, 7);
        commitMsg = cData.commit?.message || commitMsg;
        commitDate = cData.commit?.committer?.date || commitDate;
      }

      const hasUpdate = semver.valid(remoteVersion) && semver.valid(cleanCurrent)
        ? semver.gt(remoteVersion, cleanCurrent)
        : remoteVersion !== cleanCurrent;

      return {
        hasUpdate,
        currentVersion: cleanCurrent,
        latestVersion: remoteVersion,
        releaseName: `v${remoteVersion} ${commitSha ? `(${commitSha})` : ''}`,
        releaseNotes: commitMsg,
        publishedAt: commitDate,
        releasePageUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`,
      };
    } catch (err: any) {
      throw new Error(`无法连接至 GitHub 更新服务器: ${err.message}`);
    }
  }

  /**
   * 根据当前操作系统与 CPU 架构匹配对应的安装包
   */
  private findMatchingAsset(assets: any[]): any | null {
    if (!assets || !assets.length) return null;
    const platform = process.platform;
    const arch = process.arch; // 'arm64' | 'x64'

    if (platform === 'darwin') {
      // 优先匹配对应架构的 dmg
      const dmg = assets.find(
        (a) => a.name.endsWith('.dmg') && a.name.toLowerCase().includes(arch)
      ) || assets.find((a) => a.name.endsWith('.dmg'));
      if (dmg) return dmg;
    } else if (platform === 'win32') {
      const exe = assets.find((a) => a.name.endsWith('.exe'));
      if (exe) return exe;
    }

    return assets[0];
  }

  /**
   * 下载更新安装包并推送实时进度到渲染进程
   */
  public async downloadUpdate(
    downloadUrl: string,
    fileName: string,
    win?: BrowserWindow | null
  ): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      const tempDir = app.getPath('temp');
      const targetPath = path.join(tempDir, fileName || `NeoCRM_Update_${Date.now()}.dmg`);

      const writer = fs.createWriteStream(targetPath);
      const response = await axios({
        url: downloadUrl,
        method: 'GET',
        responseType: 'stream',
        timeout: 60000,
      });

      const totalLength = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedLength = 0;
      const startTime = Date.now();

      response.data.on('data', (chunk: Buffer) => {
        downloadedLength += chunk.length;
        if (win && !win.isDestroyed() && totalLength > 0) {
          const elapsedSec = Math.max(1, (Date.now() - startTime) / 1000);
          const progress: DownloadProgress = {
            percent: Math.round((downloadedLength / totalLength) * 100),
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
        writer.on('close', () => {
          if (!error) resolve();
        });
      });

      this.downloadedFilePath = targetPath;
      return { success: true, filePath: targetPath };
    } catch (e: any) {
      return { success: false, error: `下载更新包失败: ${e.message}` };
    }
  }

  /**
   * 通过 Git Pull 直接拉取远端最新代码更新 (针对开发环境或 Git 工作区模式)
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
