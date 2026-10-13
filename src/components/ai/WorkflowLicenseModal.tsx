import React, { useState, useEffect } from 'react';
import { WorkflowLicenseStatus } from '../../../shared/types';
import {
  Lock,
  Unlock,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Cpu,
  X,
  Loader2,
  Sparkles,
} from 'lucide-react';

interface WorkflowLicenseModalProps {
  isOpen: boolean;
  initialStatus: WorkflowLicenseStatus | null;
  onClose: () => void;
  onActivated: (status: WorkflowLicenseStatus) => void;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const WorkflowLicenseModal: React.FC<WorkflowLicenseModalProps> = ({
  isOpen,
  initialStatus,
  onClose,
  onActivated,
  showToast,
}) => {
  const [status, setStatus] = useState<WorkflowLicenseStatus | null>(initialStatus);
  const [passwordInput, setPasswordInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lockCountdown, setLockCountdown] = useState<number>(0);

  const refreshStatus = async () => {
    if (!window.neoApi?.workflowGetLicenseStatus) return;
    try {
      const latest = await window.neoApi.workflowGetLicenseStatus();
      setStatus(latest);
      setLockCountdown(latest.lockRemainingSeconds || 0);
    } catch (e: any) {
      console.error('获取设备授权状态失败:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setPasswordInput('');
      refreshStatus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialStatus) {
      setStatus(initialStatus);
      setLockCountdown(initialStatus.lockRemainingSeconds || 0);
    }
  }, [initialStatus]);

  // 防暴力破解锁定秒数倒计时
  useEffect(() => {
    if (lockCountdown <= 0) return;
    const timer = setInterval(() => {
      setLockCountdown((prev) => {
        if (prev <= 1) {
          refreshStatus();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockCountdown]);

  if (!isOpen) return null;

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim() || isSubmitting || lockCountdown > 0) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await window.neoApi.workflowActivateLicense(passwordInput.trim());
      setStatus(res.status);
      setLockCountdown(res.status.lockRemainingSeconds || 0);

      if (res.success) {
        setPasswordInput('');
        showToast('success', res.message);
        onActivated(res.status);
      } else {
        setErrorMsg(res.message);
      }
    } catch (err: any) {
      setErrorMsg(err.message || '密码解密校验异常');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isAuthorized = Boolean(status?.isAuthorized);
  const totalDays = status?.totalDays || 30;
  const remainingDays = status?.remainingDays || 0;
  const progressPercent = Math.min(100, Math.max(5, Math.round((remainingDays / totalDays) * 100)));

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* 顶部标题栏 */}
        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-teal-50/40 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div
              className={`p-2.5 rounded-xl shadow-xs ${
                isAuthorized
                  ? 'bg-gradient-to-tr from-emerald-600 to-teal-500 text-white'
                  : 'bg-gradient-to-tr from-amber-500 to-orange-500 text-white'
              }`}
            >
              {isAuthorized ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-slate-900">
                  自动流程 (Automatic Flow) 安全密码锁
                </h3>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                    isAuthorized
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  {isAuthorized ? `已解锁 · 剩余 ${remainingDays} 天` : '已上锁 · 需验证密码'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                纯本地离线解密计算天数 · 首次输入自动强制绑定当前设备
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 主体内容 */}
        <div className="p-6 space-y-5">
          {/* 1. 当前设备授权状态卡片 */}
          {isAuthorized ? (
            <div className="p-4 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-teal-50/30 to-white space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-950">
                    密码已解密并强制绑定本机硬件环境
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-700 bg-white px-2.5 py-0.5 rounded-lg border border-emerald-200 shadow-2xs">
                  剩余 {remainingDays} 天
                </span>
              </div>

              {/* 剩余天数进度条 */}
              <div className="w-full h-2 bg-emerald-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-slate-600">
                <div className="bg-white/80 px-3 py-1.5 rounded-xl border border-emerald-100">
                  <span className="text-slate-400 block text-[10px]">绑定授权凭证</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {status?.credentialSummary || 'SN-****'}
                  </span>
                </div>
                <div className="bg-white/80 px-3 py-1.5 rounded-xl border border-emerald-100">
                  <span className="text-slate-400 block text-[10px]">到期失效日</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {status?.expireDateStr || '-'} ({totalDays}天有效期)
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl border border-amber-200 bg-amber-50/60 flex items-start space-x-3">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 space-y-1 leading-relaxed">
                <div className="font-semibold">
                  {status?.status === 'expired'
                    ? '当前授权密码已到期失效，请更换新密码'
                    : status?.status === 'device_mismatch'
                    ? '检测到设备环境变更或系统刷机，原密码已失效'
                    : status?.status === 'clock_tampered'
                    ? '安全警报：检测到系统时间被异常回拨'
                    : '该功能已上锁，使用时需输入加密密码'}
                </div>
                <p className="text-[11px] text-amber-700/90">
                  {status?.message ||
                    '密码输入后程序将在本地自动解密计算有效天数，并强制绑定当前设备。一码一机，设备刷机或更换设备后原密码无法再次使用，必须重新生成新密码。'}
                </p>
              </div>
            </div>
          )}

          {/* 2. 当前设备硬件指纹锁状态 */}
          <div className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2 text-slate-600">
              <Cpu className="w-3.5 h-3.5 text-slate-400" />
              <span>当前设备硬件与系统卷指纹标识:</span>
              <span className="font-mono font-bold text-slate-800">{status?.machineCode || '-'}</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-200/70 text-slate-600 font-medium">
              一码一机 · 刷机/换机必失效
            </span>
          </div>

          {/* 3. 加密密码输入表单 */}
          <form onSubmit={handleActivate} className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold text-slate-700 flex items-center space-x-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-teal-600" />
                  <span>{isAuthorized ? '输入新密码（更换 / 续期）' : '输入离线加密密码'}</span>
                </label>
                
              </div>

              <textarea
                rows={3}
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                disabled={lockCountdown > 0 || isSubmitting}
                placeholder="请粘贴本地生成的加密密码 (XWLOCK- 开头)，输入后自动解密计算天数并绑定本机..."
                className="w-full p-3 rounded-xl border border-slate-200 bg-white font-mono text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 transition-all resize-none disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>

            {/* 防暴力破解锁定提示 */}
            {lockCountdown > 0 && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between text-xs text-rose-700">
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-rose-600 animate-pulse shrink-0" />
                  <span>
                    已触发防暴力破解冷却保护（连续错误 {status?.failedAttempts || 3} 次）
                  </span>
                </div>
                <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-rose-200">
                  {lockCountdown}s 后重试
                </span>
              </div>
            )}

            {/* 错误消息提示 */}
            {errorMsg && lockCountdown <= 0 && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start space-x-2">
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMsg}</span>
              </div>
            )}

            {/* 底部按钮栏 */}
            <div className="pt-2 flex items-center justify-between border-t border-slate-100">
              <div className="text-[11px] text-slate-400 flex items-center space-x-1">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                <span>纯本地离线解密 · 防逆向与防暴力破解保护已启用</span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium transition-colors cursor-pointer"
                >
                  {isAuthorized ? '完成' : '取消'}
                </button>
                <button
                  type="submit"
                  disabled={!passwordInput.trim() || lockCountdown > 0 || isSubmitting}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>正在解密计算天数...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{isAuthorized ? '解密并更新密码' : '解密验证并绑定本机'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
