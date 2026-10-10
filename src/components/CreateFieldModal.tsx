import React, { useState } from 'react';
import { X, Plus, Trash2, Tag, AlertCircle } from 'lucide-react';
import { CreateFieldPayload, EntityMetadata } from '../../shared/types';

interface CreateFieldModalProps {
  isOpen: boolean;
  entity: EntityMetadata | null;
  onClose: () => void;
  onSubmit: (entityApiKey: string, payload: CreateFieldPayload) => Promise<{ success: boolean; error?: string }>;
}

const FIELD_TYPES = [
  { type: 1, name: '单行文本 (Text)' },
  { type: 2, name: '多行文本 (TextArea)' },
  { type: 3, name: '单选列表 (Picklist)' },
  { type: 4, name: '多选列表 (Multi-Picklist)' },
  { type: 5, name: '整数 (Integer)' },
  { type: 6, name: '金额 (Currency)' },
  { type: 7, name: '日期 (Date)' },
  { type: 21, name: '日期时间 (DateTime)' },
  { type: 22, name: '电话号码 (Phone)' },
  { type: 23, name: '电子邮箱 (Email)' },
  { type: 24, name: '网站链接 (URL)' },
  { type: 31, name: '布尔值 (Boolean)' },
  { type: 33, name: '百分比 (Percent)' },
  { type: 40, name: '富文本 (RichText)' },
];

export const CreateFieldModal: React.FC<CreateFieldModalProps> = ({
  isOpen,
  entity,
  onClose,
  onSubmit,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [label, setLabel] = useState('');
  const [itemType, setItemType] = useState<number>(1);
  const [maxLength, setMaxLength] = useState<number>(200);
  const [decimal, setDecimal] = useState<number>(2);
  const [description, setDescription] = useState('');
  const [pickOptions, setPickOptions] = useState<{ optionLabel: string; optionCode: number }[]>([
    { optionLabel: '选项一', optionCode: 1 },
    { optionLabel: '选项二', optionCode: 2 },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen || !entity) return null;

  const handleAddOption = () => {
    const nextCode = pickOptions.length > 0 ? Math.max(...pickOptions.map((o) => o.optionCode)) + 1 : 1;
    setPickOptions([...pickOptions, { optionLabel: `选项${nextCode}`, optionCode: nextCode }]);
  };

  const handleRemoveOption = (index: number) => {
    setPickOptions(pickOptions.filter((_, i) => i !== index));
  };

  const handleUpdateOption = (index: number, label: string) => {
    const next = [...pickOptions];
    next[index].optionLabel = label;
    setPickOptions(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim() || !label.trim()) return;

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const payload: CreateFieldPayload = {
        apiKey: apiKey.trim(),
        label: label.trim(),
        itemType,
        description: description.trim(),
      };

      if ([1, 2, 40].includes(itemType)) {
        payload.maxLength = maxLength;
      }
      if ([6, 33].includes(itemType)) {
        payload.maxLength = maxLength || 16;
        payload.decimal = decimal;
      }
      if ([3, 4].includes(itemType)) {
        payload.pickOption = pickOptions;
      }

      const res = await onSubmit(entity.apiKey, payload);
      if (res.success) {
        onClose();
        setApiKey('');
        setLabel('');
        setDescription('');
      } else {
        setErrorMsg(res.error || '创建字段失败');
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
            <Tag className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-base font-semibold text-slate-900">新增自定义字段</h3>
              <p className="text-[11px] text-slate-500">
                所属对象: <span className="text-sky-300 font-mono font-medium">{entity.label} ({entity.apiKey})</span>
              </p>
            </div>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                字段 API Key <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                  placeholder="例如: status, vipLevel"
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-700 rounded-lg text-sm text-slate-900 font-mono placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
                <span className="absolute right-3 top-2 text-xs text-slate-500 font-mono">+ __c</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                字段显示名称 (Label) <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="例如: 客户状态、VIP等级"
                className="w-full px-3 py-2 bg-slate-100 border border-slate-700 rounded-lg text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              字段类型 (Item Type) <span className="text-rose-400">*</span>
            </label>
            <select
              value={itemType}
              onChange={(e) => setItemType(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-100 border border-slate-700 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-sky-500"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* 文本类长度设置 */}
          {[1, 2, 40].includes(itemType) && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">最大文本长度 (maxLength)</label>
              <input
                type="number"
                value={maxLength}
                onChange={(e) => setMaxLength(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-100 border border-slate-700 rounded-lg text-xs text-slate-900"
              />
            </div>
          )}

          {/* 金额/小数类精度设置 */}
          {[6, 33].includes(itemType) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">整数位数</label>
                <input
                  type="number"
                  value={maxLength}
                  onChange={(e) => setMaxLength(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-700 rounded-lg text-xs text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">小数保留位数 (decimal)</label>
                <input
                  type="number"
                  value={decimal}
                  onChange={(e) => setDecimal(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-700 rounded-lg text-xs text-slate-900"
                />
              </div>
            </div>
          )}

          {/* 单选/多选动态选项配置 */}
          {[3, 4].includes(itemType) && (
            <div className="p-3 bg-slate-50/60 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700">下拉选项定义</span>
                <button
                  type="button"
                  onClick={handleAddOption}
                  className="flex items-center space-x-1 text-[11px] text-sky-400 hover:text-sky-300 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>添加选项</span>
                </button>
              </div>

              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {pickOptions.map((opt, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <span className="text-[11px] font-mono text-slate-500 w-8">#{opt.optionCode}</span>
                    <input
                      type="text"
                      required
                      value={opt.optionLabel}
                      onChange={(e) => handleUpdateOption(idx, e.target.value)}
                      placeholder="选项标签文字"
                      className="flex-1 px-2.5 py-1 bg-white border border-slate-200 rounded text-xs text-slate-200"
                    />
                    {pickOptions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(idx)}
                        className="p-1 hover:bg-rose-950 text-slate-500 hover:text-rose-400 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">字段描述 (可选)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="业务字段定义说明"
              className="w-full px-3 py-2 bg-slate-100 border border-slate-700 rounded-lg text-xs text-slate-900 placeholder-slate-500"
            />
          </div>

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
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg shadow-lg shadow-emerald-600/30 transition-all flex items-center space-x-1.5 disabled:opacity-50"
            >
              <span>{isSubmitting ? '正在创建...' : '创建字段'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
