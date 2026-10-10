import React, { useState } from 'react';
import { X, Box, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { CreateEntityPayload } from '../../shared/types';

interface CreateEntityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateEntityPayload) => Promise<{ success: boolean; error?: string }>;
}

export const CreateEntityModal: React.FC<CreateEntityModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [useAutoNumber, setUseAutoNumber] = useState(false);
  const [autoNumberFormat, setAutoNumberFormat] = useState('DEV{YYYY}{MM}{DD}{000}');
  const [enableScript, setEnableScript] = useState(true);
  const [enableBusitype, setEnableBusitype] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim() || !label.trim()) return;

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const res = await onSubmit({
        apiKey: apiKey.trim(),
        label: label.trim(),
        description: description.trim(),
        autoNumberFormat: useAutoNumber ? autoNumberFormat.trim() : undefined,
        enableScriptExecutor: enableScript,
        enableBusitype,
      });
      if (res.success) {
        onClose();
        setApiKey('');
        setLabel('');
        setDescription('');
      } else {
        setErrorMsg(res.error || '创建实体失败');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* 头部 */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-2">
            <Box className="w-5 h-5 text-sky-400" />
            <h3 className="text-base font-semibold text-slate-900">创建自定义业务实体 (Object)</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl text-xs text-rose-300 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              实体 API Key <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                placeholder="例如: customerCard, equipOrder"
                className="w-full px-3 py-2 bg-slate-100 border border-slate-700 rounded-lg text-sm text-slate-900 font-mono placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
              <span className="absolute right-3 top-2 text-xs text-slate-500 font-mono">
                + __c
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">系统创建后会自动附加 __c 后缀，建议以小写字母驼峰命名。</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              实体显示名称 (Label) <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="例如: 客户档案卡、设备工单"
              className="w-full px-3 py-2 bg-slate-100 border border-slate-700 rounded-lg text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              实体描述 (可选)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="说明此实体的业务场景与用途"
              className="w-full px-3 py-2 bg-slate-100 border border-slate-700 rounded-lg text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* 主字段类型配置 */}
          <div className="p-3 bg-slate-50/60 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700">主字段编号规则</span>
              <label className="flex items-center space-x-1.5 cursor-pointer text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={useAutoNumber}
                  onChange={(e) => setUseAutoNumber(e.target.checked)}
                  className="rounded bg-slate-100 border-slate-700 text-sky-500 focus:ring-0"
                />
                <span>启用自动编号 (AutoNumber)</span>
              </label>
            </div>

            {useAutoNumber ? (
              <div>
                <input
                  type="text"
                  value={autoNumberFormat}
                  onChange={(e) => setAutoNumberFormat(e.target.value)}
                  placeholder="例如: AC{YYYY}{MM}{DD}{000}"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs font-mono text-slate-200 mt-1"
                />
                <span className="text-[10px] text-slate-500">
                  支持占位符: {'{YYYY}'} 年份、{'{MM}'} 月份、{'{DD}'} 日期、{'{000}'} 自增流水号
                </span>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500">主字段默认为文本类型 (最大长度 200 字符)</p>
            )}
          </div>

          {/* 扩展功能开关 */}
          <div className="space-y-2 pt-1">
            <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={enableScript}
                onChange={(e) => setEnableScript(e.target.checked)}
                className="rounded bg-slate-100 border-slate-700 text-sky-500 focus:ring-0"
              />
              <span>启用服务端脚本触发器 (Trigger)</span>
            </label>
            <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={enableBusitype}
                onChange={(e) => setEnableBusitype(e.target.checked)}
                className="rounded bg-slate-100 border-slate-700 text-sky-500 focus:ring-0"
              />
              <span>启用多业务类型 (Busitype)</span>
            </label>
          </div>

          {/* 底部按钮 */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-700 text-slate-700 text-xs font-medium rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium rounded-lg shadow-lg shadow-sky-600/30 transition-all flex items-center space-x-1.5 disabled:opacity-50"
            >
              <span>{isSubmitting ? '正在创建...' : '创建实体'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
