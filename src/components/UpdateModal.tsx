import React, { useState, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  Download, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  GitBranch, 
  ArrowUpCircle,
  FileBox
} from 'lucide-react';
import { UpdateInfo, DownloadProgress } from '../../shared/types';

interface UpdateModalProps {
  isOpen: boolean;
  updateInfo: UpdateInfo | null;
  onClose: () => void;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  isOpen,
  updateInfo,
  onClose,
  showToast,
}) => {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setDownloading(false);
      setProgress(null);
      setDownloadSuccess(false);
      setPulling(false);
      setErrorMsg('');
      return;
    }

    // 监听主进程推流的下载进度
    const cleanup = window.neoApi?.onDownloadProgress?.((p) => {
      setProgress(p);
    });

    return () => {
      cleanup?.();
    };
  }, [isOpen]);

  if (!isOpen || !updateInfo) return null;

  // 格式化字节数
  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // 开始下载安装包
  const handleDownload = async () => {
    if (!updateInfo.downloadUrl) {
      // 若无直接资源，跳转至 Release 页面
      window.neoApi.openExternal(updateInfo.releasePageUrl || 'https://github.com/zt15242/neoCRM-DEV/releases');
      return;
    }

    setDownloading(true);
    setErrorMsg('');
    try {
      const fileName = updateInfo.assetName || `NeoCRM_Desktop_v${updateInfo.latestVersion}.${navigator.userAgent.includes('Mac') ? 'dmg' : 'exe'}`;
      const res = await window.neoApi.downloadUpdate(updateInfo.downloadUrl, fileName);
      if (res.success) {
        setDownloadSuccess(true);
        showToast('success', '安装包下载完成！');
      } else {
        setErrorMsg(res.error || '下载失败');
      }
    } catch (e: any) {
      setErrorMsg(`下载异常: ${e.message}`);
    } finally {
      setDownloading(false);
    }
  };

  // 打开安装包
  const handleOpenInstaller = async () => {
    await window.neoApi.openInstaller();
    onClose();
  };

  // Git Pull 热更新
  const handleGitPull = async () => {
    setPulling(true);
    setErrorMsg('');
    try {
      const res = await window.neoApi.gitPullUpdate();
      if (res.success) {
        showToast('success', '代码已通过 Git 同步至最新版本！请重启或刷新应用生效。');
        onClose();
      } else {
        setErrorMsg(`Git 拉取失败: ${res.output}`);
      }
    } catch (e: any) {
      setErrorMsg(`更新异常: ${e.message}`);
    } finally {
      setPulling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* 头部 */}
        <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-sky-50 to-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-600 text-white flex items-center justify-center shadow-sm shadow-sky-600/30">
              <ArrowUpCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {updateInfo.hasUpdate ? '发现新版本发布' : '当前已是最新版本'}
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                当前: v{updateInfo.currentVersion} ➔ 最新: v{updateInfo.latestVersion}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 版本差异状态 */}
          {updateInfo.hasUpdate ? (
            <div className="p-3 bg-sky-50/70 border border-sky-200/80 rounded-xl space-y-1">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-sky-600" />
                <span className="text-xs font-bold text-sky-950">
                  {updateInfo.releaseName || `版本 v${updateInfo.latestVersion}`}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                发布时间: {updateInfo.publishedAt ? new Date(updateInfo.publishedAt).toLocaleString() : '最近推送'}
              </p>
            </div>
          ) : (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-3 text-xs text-emerald-800">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-emerald-950">已是最新版本 (v{updateInfo.currentVersion})</p>
                <p className="text-emerald-700 mt-0.5">本地代码与远端仓库保持完全一致，无需更新。</p>
              </div>
            </div>
          )}

          {/* 更新日志/说明 */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              更新内容与提交日志 (Changelog)
            </label>
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed max-h-36 overflow-y-auto">
              {updateInfo.releaseNotes || '性能提升、UI 优化以及稳定性增强'}
            </div>
          </div>

          {/* 下载进度条 */}
          {downloading && progress && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">正在下载安装包...</span>
                <span className="font-mono text-sky-600 font-bold">{progress.percent}%</span>
              </div>
              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 to-blue-600 transition-all duration-200"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>{formatBytes(progress.transferred)} / {formatBytes(progress.total)}</span>
                <span>{formatBytes(progress.bytesPerSecond)}/s</span>
              </div>
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => window.neoApi.openExternal(updateInfo.releasePageUrl || 'https://github.com/zt15242/neoCRM-DEV')}
              className="text-xs text-slate-500 hover:text-slate-800 flex items-center space-x-1 transition-colors"
            >
              <span>查看 GitHub 仓库</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-600 text-xs font-medium rounded-lg border border-slate-200 transition-colors"
            >
              关闭
            </button>

            {updateInfo.hasUpdate && (
              <>
                {/* 选项 1: Git 代码拉取同步 */}
                <button
                  type="button"
                  onClick={handleGitPull}
                  disabled={pulling}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 transition-colors flex items-center space-x-1.5"
                  title="使用 git pull origin main 直接同步最新代码"
                >
                  <GitBranch className={`w-3.5 h-3.5 ${pulling ? 'animate-spin text-sky-600' : ''}`} />
                  <span>{pulling ? '正在拉取...' : 'Git 同步代码'}</span>
                </button>

                {/* 选项 2: 下载安装包或打开 */}
                {downloadSuccess ? (
                  <button
                    type="button"
                    onClick={handleOpenInstaller}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg shadow-sm shadow-emerald-600/20 transition-all flex items-center space-x-1.5"
                  >
                    <FileBox className="w-3.5 h-3.5" />
                    <span>立即打开并安装</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={downloading}
                    className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium rounded-lg shadow-sm shadow-sky-600/20 transition-all flex items-center space-x-1.5 disabled:opacity-50"
                  >
                    <Download className={`w-3.5 h-3.5 ${downloading ? 'animate-spin' : ''}`} />
                    <span>{downloading ? '正在下载...' : '下载安装包更新'}</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
