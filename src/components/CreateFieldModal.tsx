import React, { useState } from 'react';
import { X, Plus, Trash2, Tag, AlertCircle, Link2 } from 'lucide-react';
import { CreateFieldPayload, EntityMetadata } from '../../shared/types';
import { EntitySearchSelect } from './data/EntitySearchSelect';

interface CreateFieldModalProps {
  isOpen: boolean;
  entity: EntityMetadata | null;
  entities?: EntityMetadata[];
  onClose: () => void;
  onSubmit: (entityApiKey: string, payload: CreateFieldPayload) => Promise<{ success: boolean; error?: string }>;
}

const FIELD_TYPES = [
  { key: '1', type: 1, name: '单行文本 (Text)' },
  { key: '2', type: 2, name: '多行文本 (TextArea)' },
  { key: '10', type: 10, name: '关联关系 (Reference)' },
  { key: '3', type: 3, name: '单选列表 (Picklist)' },
  { key: '4', type: 4, name: '多选列表 (Multi-Picklist)' },
  { key: '5', type: 5, name: '整数 (Integer)' },
  { key: '6_currency', type: 6, isCurrency: true, name: '货币 (Currency)' },
  { key: '6_decimal', type: 6, isCurrency: false, name: '实数/浮点 (Decimal / Float)' },
  { key: '7', type: 7, name: '日期 (Date)' },
  { key: '21', type: 21, name: '日期时间 (DateTime)' },
  { key: '29', type: 29, name: '图片 (Image)' },
  { key: '39', type: 39, name: '文件 (File)' },
  { key: '22', type: 22, name: '电话号码 (Phone)' },
  { key: '23', type: 23, name: '电子邮箱 (Email)' },
  { key: '24', type: 24, name: '网站链接 (URL)' },
  { key: '31', type: 31, name: '布尔值 (Boolean)' },
  { key: '33', type: 33, name: '百分比 (Percent)' },
  { key: '40', type: 40, name: '富文本 (RichText)' },
];

export const CreateFieldModal: React.FC<CreateFieldModalProps> = ({
  isOpen,
  entity,
  entities = [],
  onClose,
  onSubmit,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [label, setLabel] = useState('');
  const [selectedTypeKey, setSelectedTypeKey] = useState<string>('1');
  const [itemType, setItemType] = useState<number>(1);
  const [isCurrency, setIsCurrency] = useState<boolean>(true);
  const [maxLength, setMaxLength] = useState<number>(200);
  const [decimal, setDecimal] = useState<number>(2);
  const [description, setDescription] = useState('');
  
  // 关联关系字段 (itemType=10) 专有属性
  const [referObjectApiKey, setReferObjectApiKey] = useState<string>('account');
  const [cascadeDelete, setCascadeDelete] = useState<number>(1); // 0=级联删除, 1=置空, 2=不允许删除
  const [linkLabel, setLinkLabel] = useState<string>('');

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

    if (itemType === 10 && !referObjectApiKey) {
      setErrorMsg('关联关系字段必须选择目标关联对象');
      return;
    }

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
        if (itemType === 6) {
          payload.currency = isCurrency;
        }
      }
      if ([3, 4].includes(itemType)) {
        payload.pickOption = pickOptions;
      }
      if (itemType === 29) {
        payload.maxLength = maxLength || 9;
      }
      if (itemType === 10) {
        payload.referObjectApiKey = referObjectApiKey.trim();
        payload.cascadeDelete = Number(cascadeDelete);
        payload.linkLabel = linkLabel.trim() || label.trim();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* 头部 */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-2">
            <Tag className="w-5 h-5 text-emerald-600" />
            <div>
              <h3 className="text-base font-semibold text-slate-900">新增自定义字段</h3>
              <p className="text-[11px] text-slate-500">
                所属对象: <span className="text-sky-700 font-mono font-medium">{entity.label} ({entity.apiKey})</span>
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

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                字段 API Key <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                  placeholder="例如: relatedCustomer, mentor"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 font-mono placeholder-slate-400 focus:outline-none focus:border-sky-500"
                />
                <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">+ __c</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                字段显示名称 (Label) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="例如: 关联客户、指导人"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              字段类型 (Item Type) <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedTypeKey}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedTypeKey(val);
                const found = FIELD_TYPES.find((t) => t.key === val);
                if (found) {
                  setItemType(found.type);
                  setIsCurrency(Boolean(found.isCurrency));
                }
              }}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-sky-500 font-medium"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* 关联关系字段 (itemType=10) 专属配置 */}
          {itemType === 10 && (
            <div className="p-3.5 bg-sky-50/70 border border-sky-200 rounded-xl space-y-3">
              <div className="flex items-center space-x-1.5 text-xs text-sky-900 font-semibold">
                <Link2 className="w-4 h-4 text-sky-600" />
                <span>关联关系 (Reference) 专属属性</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  关联目标实体 (referObjectApiKey) <span className="text-rose-500">*</span>
                </label>
                <EntitySearchSelect
                  entities={entities}
                  value={referObjectApiKey}
                  onChange={(newKey) => setReferObjectApiKey(newKey)}
                  labelPrefix="关联至:"
                  className="w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    级联删除规则 (cascadeDelete)
                  </label>
                  <select
                    value={cascadeDelete}
                    onChange={(e) => setCascadeDelete(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-sky-500"
                  >
                    <option value={1}>1: 清理置空 (推荐，主数据删除时字段置空)</option>
                    <option value={2}>2: 不允许删除 (存在关联记录时禁止删除主数据)</option>
                    <option value={0}>0: 级联删除 (主数据删除时同步删除本记录)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    相关列表名称 (linkLabel)
                  </label>
                  <input
                    type="text"
                    value={linkLabel}
                    onChange={(e) => setLinkLabel(e.target.value)}
                    placeholder="目标实体详情页相关列表中显示名"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 文本类长度设置 */}
          {[1, 2, 40].includes(itemType) && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">最大文本长度 (maxLength)</label>
              <input
                type="number"
                value={maxLength}
                onChange={(e) => setMaxLength(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800"
              />
            </div>
          )}

          {/* 图片/文件最大数量 */}
          {[29, 39].includes(itemType) && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">最大文件数量 (1-9)</label>
              <input
                type="number"
                min={1}
                max={9}
                value={maxLength || 9}
                onChange={(e) => setMaxLength(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800"
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
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">小数保留位数 (decimal)</label>
                <input
                  type="number"
                  value={decimal}
                  onChange={(e) => setDecimal(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800"
                />
              </div>
            </div>
          )}

          {/* 单选/多选动态选项配置 */}
          {[3, 4].includes(itemType) && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700">下拉选项定义</span>
                <button
                  type="button"
                  onClick={handleAddOption}
                  className="flex items-center space-x-1 text-[11px] text-sky-600 hover:text-sky-700 font-medium transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>添加选项</span>
                </button>
              </div>

              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {pickOptions.map((opt, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <span className="text-[11px] font-mono text-slate-400 w-8">#{opt.optionCode}</span>
                    <input
                      type="text"
                      required
                      value={opt.optionLabel}
                      onChange={(e) => handleUpdateOption(idx, e.target.value)}
                      placeholder="选项标签文字"
                      className="flex-1 px-2.5 py-1 bg-white border border-slate-300 rounded text-xs text-slate-800"
                    />
                    {pickOptions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(idx)}
                        className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition-colors"
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
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400"
            />
          </div>

          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg shadow-sm shadow-emerald-600/30 transition-all flex items-center space-x-1.5 disabled:opacity-50"
            >
              <span>{isSubmitting ? '正在创建...' : '创建字段'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
