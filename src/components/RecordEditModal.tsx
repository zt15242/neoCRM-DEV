import React, { useState, useEffect } from 'react';
import { X, Save, Edit3, Code2, AlertCircle } from 'lucide-react';

interface RecordEditModalProps {
  isOpen: boolean;
  entityApiKey: string;
  initialData?: Record<string, any> | null;
  onClose: () => void;
  onSubmit: (data: Record<string, any>, recordId?: string | number) => Promise<{ success: boolean; error?: string }>;
}

export const RecordEditModal: React.FC<RecordEditModalProps> = ({
  isOpen,
  entityApiKey,
  initialData,
  onClose,
  onSubmit,
}) => {
  const isEditing = !!initialData?.id;
  const [jsonText, setJsonText] = useState('{}');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (initialData) {
      // 排除系统只读属性如 id, createdAt, updatedAt 等只在展示用
      const editable = { ...initialData };
      if (!isEditing) delete editable.id;
      setJsonText(JSON.stringify(editable, null, 2));
    } else {
      setJsonText(JSON.stringify({ name: '新测试记录' }, null, 2));
    }
    setErrorMsg('');
  }, [initialData, isOpen, isEditing]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    let parsedData: Record<string, any>;
    try {
      parsedData = JSON.parse(jsonText);
    } catch (err: any) {
      setErrorMsg(`JSON 格式错误: ${err.message}`);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onSubmit(parsedData, initialData?.id);
      if (res.success) {
        onClose();
      } else {
        setErrorMsg(res.error || '提交保存失败');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* 头部 */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center space-x-2">
            <Edit3 className="w-5 h-5 text-sky-400" />
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                {isEditing ? `编辑数据记录 (ID: ${initialData?.id})` : '新建数据记录'}
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                目标对象: <span className="text-sky-300 font-medium">{entityApiKey}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 表单内容 */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl text-xs text-rose-300 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-300 flex items-center space-x-1.5">
                <Code2 className="w-3.5 h-3.5 text-sky-400" />
                <span>字段值 JSON 载荷 (Payload)</span>
              </label>
              <span className="text-[10px] text-slate-500">键名区分大小写</span>
            </div>
            <textarea
              rows={12}
              required
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              className="w-full p-3 bg-slate-950 border border-slate-700 rounded-xl font-mono text-xs text-emerald-300 focus:outline-none focus:border-sky-500 leading-relaxed"
            />
          </div>

          <div className="text-[11px] text-slate-400 bg-slate-950/40 p-2.5 rounded-lg border border-slate-800">
            提示: 销售易 DML 要求选项列表字段必须传整数数值代码（如 1、2 等），日期建议传时间戳或标准格式。
          </div>

          {/* 底部按钮 */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium rounded-lg shadow-lg shadow-sky-600/30 transition-all flex items-center space-x-1.5 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSubmitting ? '正在保存...' : isEditing ? '确认更新' : '确认创建'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
