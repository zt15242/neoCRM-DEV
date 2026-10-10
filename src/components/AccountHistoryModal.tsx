import React from 'react';
import { X, History, Building2, User, Globe, ArrowRight, Trash2, CheckCircle } from 'lucide-react';
import { AccountRecord } from '../../shared/types';

interface AccountHistoryModalProps {
  isOpen: boolean;
  activeAccountId?: string;
  history: AccountRecord[];
  onClose: () => void;
  onSwitch: (accountId: string) => void;
  onDelete: (accountId: string) => void;
}

export const AccountHistoryModal: React.FC<AccountHistoryModalProps> = ({
  isOpen,
  activeAccountId,
  history,
  onClose,
  onSwitch,
  onDelete,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* 头部 */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-2">
            <History className="w-5 h-5 text-sky-400" />
            <h3 className="text-base font-semibold text-slate-900">历史账号与多租户切换</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 列表 */}
        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          {history.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              暂无历史登录记录。登录成功后将自动保存在此，便于一键无感切换。
            </div>
          ) : (
            history.map((record) => {
              const isActive = record.id === activeAccountId;

              return (
                <div
                  key={record.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isActive
                      ? 'bg-sky-950/30 border-sky-500/80 ring-1 ring-sky-500/40'
                      : 'bg-slate-100/40 border-slate-700/60 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <Building2 className="w-4 h-4 text-sky-400" />
                        <span className="font-semibold text-sm text-slate-900">
                          {record.tenantName || '未命名租户'}
                        </span>
                        {isActive && (
                          <span className="flex items-center space-x-1 text-[10px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 font-medium">
                            <CheckCircle className="w-3 h-3 text-sky-400" />
                            <span>当前使用中</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-4 text-xs text-slate-500">
                        <div className="flex items-center space-x-1">
                          <User className="w-3.5 h-3.5 text-slate-500" />
                          <span>{record.userName || '未知用户'}</span>
                        </div>
                        <div className="flex items-center space-x-1 font-mono">
                          <Globe className="w-3.5 h-3.5 text-slate-500" />
                          <span>{record.environmentName}</span>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-500 font-mono">
                        租户ID: {record.tenantId || 'N/A'} • 登录于 {new Date(record.lastLoginAt).toLocaleDateString()} {new Date(record.lastLoginAt).toLocaleTimeString()}
                      </p>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      {!isActive && (
                        <button
                          onClick={() => {
                            onSwitch(record.id);
                            onClose();
                          }}
                          className="flex items-center space-x-1 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium rounded-lg transition-colors"
                        >
                          <span>切换</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={() => onDelete(record.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/50 rounded-lg transition-colors"
                        title="删除记录"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 底部 */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-100 hover:bg-slate-700 text-slate-700 text-xs rounded-lg transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
