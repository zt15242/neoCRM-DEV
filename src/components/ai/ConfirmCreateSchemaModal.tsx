import React, { useState } from 'react';
import { SchemaPlanPayload, PlannedFieldItem } from '../../../shared/types';
import { ITEM_TYPE_MAP } from '../../../shared/constants';
import { 
  Box, 
  Check, 
  X, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Plus, 
  Trash2, 
  ArrowRight,
  ShieldCheck,
  Layers,
  Sparkles
} from 'lucide-react';

interface ConfirmCreateSchemaModalProps {
  isOpen: boolean;
  plan: SchemaPlanPayload;
  tenantName?: string;
  onClose: () => void;
  onNavigateToMetadata?: () => void;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const ConfirmCreateSchemaModal: React.FC<ConfirmCreateSchemaModalProps> = ({
  isOpen,
  plan,
  tenantName = '当前租户',
  onClose,
  onNavigateToMetadata,
  showToast,
}) => {
  // 对象基础属性（允许用户二次修改确认）
  const [entityLabel, setEntityLabel] = useState(plan.entity?.label || '');
  const [entityApiKey, setEntityApiKey] = useState(plan.entity?.apiKey || '');
  const [autoNumberFormat, setAutoNumberFormat] = useState(plan.entity?.autoNumberFormat || '');
  const [enableScript, setEnableScript] = useState(plan.entity?.enableScriptExecutor ?? true);
  const [enableBusiType, setEnableBusiType] = useState(plan.entity?.enableBusitype ?? false);

  // 待创建字段列表（支持勾选/取消勾选）
  const [fields, setFields] = useState<Array<PlannedFieldItem & { selected: boolean; status?: 'pending' | 'creating' | 'success' | 'failed'; error?: string }>>(
    (plan.fields || []).map((f) => ({
      ...f,
      selected: true,
      status: 'pending',
    }))
  );

  // 执行状态
  const [isExecuting, setIsExecuting] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [finalSummary, setFinalSummary] = useState<{ successCount: number; failCount: number }>({ successCount: 0, failCount: 0 });

  if (!isOpen) return null;

  const toggleFieldSelect = (index: number) => {
    if (isExecuting) return;
    setFields((prev) => {
      const copy = [...prev];
      copy[index].selected = !copy[index].selected;
      return copy;
    });
  };

  const handleStartCreation = async () => {
    if (!entityLabel.trim() || !entityApiKey.trim()) {
      showToast('error', '对象名称与 API Key 不能为空');
      return;
    }

    const selectedFields = fields.filter((f) => f.selected);
    if (selectedFields.length === 0) {
      showToast('error', '请至少勾选一个要创建的字段');
      return;
    }

    setIsExecuting(true);
    setProgressPercent(5);
    setProgressText(`正在创建业务对象 [${entityLabel}] (${entityApiKey})...`);

    let entityCreated = false;
    try {
      // 步骤 1: 创建实体对象
      const entityRes = await window.neoApi.createEntity({
        apiKey: entityApiKey.trim(),
        label: entityLabel.trim(),
        description: plan.entity?.description || `由 AI 模型设计器自动生成`,
        autoNumberFormat: autoNumberFormat.trim() || undefined,
        enableScriptExecutor: enableScript,
        enableBusitype: enableBusiType,
      });

      if (!entityRes.success && !String(entityRes.error || '').includes('已存在')) {
        throw new Error(entityRes.error || '创建实体对象失败');
      }
      entityCreated = true;
    } catch (err: any) {
      // 若实体已存在则允许继续创建字段
      const msg = err.message || '';
      if (msg.includes('已存在') || msg.includes('exist')) {
        entityCreated = true;
      } else {
        setIsExecuting(false);
        showToast('error', `创建对象失败: ${msg}`);
        return;
      }
    }

    // 步骤 2: 循环创建各个勾选的字段
    let successCount = 0;
    let failCount = 0;
    const total = selectedFields.length;

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      if (!field.selected) continue;

      // 更新字段状态为 creating
      setFields((prev) => {
        const copy = [...prev];
        copy[i].status = 'creating';
        return copy;
      });

      const currentIdx = successCount + failCount + 1;
      setProgressText(`正在创建字段 [${currentIdx}/${total}]: ${field.label} (${field.apiKey})...`);
      setProgressPercent(Math.round(10 + (currentIdx / total) * 85));

      try {
        const res = await window.neoApi.createField(entityApiKey.trim(), {
          apiKey: field.apiKey.trim(),
          label: field.label.trim(),
          itemType: field.itemType,
          maxLength: field.maxLength,
          decimal: field.decimal,
          referObjectApiKey: field.referObjectApiKey,
          pickOption: field.pickOption,
          description: field.description,
          linkLabel: `${entityLabel}列表`,
        });

        if (res.success) {
          successCount++;
          setFields((prev) => {
            const copy = [...prev];
            copy[i].status = 'success';
            return copy;
          });
        } else {
          failCount++;
          setFields((prev) => {
            const copy = [...prev];
            copy[i].status = 'failed';
            copy[i].error = res.error || '创建失败';
            return copy;
          });
        }
      } catch (fErr: any) {
        failCount++;
        setFields((prev) => {
          const copy = [...prev];
          copy[i].status = 'failed';
          copy[i].error = fErr.message || '网络异常';
          return copy;
        });
      }

      // 轻微休眠 120ms 避免过快请求限制
      await new Promise((r) => setTimeout(r, 120));
    }

    setProgressPercent(100);
    setProgressText(`创建执行完成！成功: ${successCount} 个，失败: ${failCount} 个`);
    setIsExecuting(false);
    setIsCompleted(true);
    setFinalSummary({ successCount, failCount });
    showToast('success', `对象 [${entityLabel}] 及字段已完成创建！`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-sky-50/80 via-white to-indigo-50/50">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-sky-600 text-white shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                确认在销售易租户中创建业务对象与字段
              </h3>
              <p className="text-[11px] text-slate-500">
                目标租户: <strong className="text-sky-700 font-semibold">{tenantName}</strong> • AI 建模方案自动部署
              </p>
            </div>
          </div>
          {!isExecuting && (
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
          {/* 完成庆祝卡片 */}
          {isCompleted ? (
            <div className="py-6 px-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  业务对象与字段已成功在当前租户创建！
                </h4>
                <p className="text-xs text-slate-600 mt-1">
                  对象 <strong>{entityLabel} ({entityApiKey})</strong> 创建完成，共成功创建{' '}
                  <strong className="text-emerald-600">{finalSummary.successCount}</strong> 个字段
                  {finalSummary.failCount > 0 ? `，失败 ${finalSummary.failCount} 个` : ''}。
                </p>
              </div>
              <div className="pt-2 flex items-center justify-center space-x-3">
                {onNavigateToMetadata && (
                  <button
                    onClick={() => {
                      onClose();
                      onNavigateToMetadata();
                    }}
                    className="px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-xs"
                  >
                    前往【对象与字段管理】查看
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="px-4 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium"
                >
                  留在当前对话
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* 1. 对象基础配置 */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex items-center space-x-2 text-slate-800 font-bold text-xs">
                  <Box className="w-4 h-4 text-sky-600" />
                  <span>业务对象基础定义 (Object Entity)</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">
                      对象中文名称 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      disabled={isExecuting}
                      value={entityLabel}
                      onChange={(e) => setEntityLabel(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">
                      API Key (推荐 __c 后缀) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      disabled={isExecuting}
                      value={entityApiKey}
                      onChange={(e) => setEntityApiKey(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-sky-500 font-mono text-[11px]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">
                      自动编号规则 (选填)
                    </label>
                    <input
                      type="text"
                      disabled={isExecuting}
                      value={autoNumberFormat}
                      onChange={(e) => setAutoNumberFormat(e.target.value)}
                      placeholder="例: RO-{YYYY}{MM}{DD}-{0000}"
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-sky-500 font-mono text-[11px]"
                    />
                  </div>
                  <div className="flex items-center space-x-4 pt-5">
                    <label className="flex items-center space-x-1.5 cursor-pointer text-slate-700">
                      <input
                        type="checkbox"
                        disabled={isExecuting}
                        checked={enableScript}
                        onChange={(e) => setEnableScript(e.target.checked)}
                        className="rounded text-sky-600"
                      />
                      <span>脚本执行器</span>
                    </label>
                    <label className="flex items-center space-x-1.5 cursor-pointer text-slate-700">
                      <input
                        type="checkbox"
                        disabled={isExecuting}
                        checked={enableBusiType}
                        onChange={(e) => setEnableBusiType(e.target.checked)}
                        className="rounded text-sky-600"
                      />
                      <span>多业务类型</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* 2. 字段清单列表 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-slate-800 font-bold text-xs">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    <span>规划字段清单 (共 {fields.length} 个)</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    已勾选 <strong className="text-sky-600">{fields.filter((f) => f.selected).length}</strong> 个
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
                  {fields.map((field, idx) => {
                    const typeLabel = field.typeName || ITEM_TYPE_MAP[field.itemType] || `类型 ${field.itemType}`;
                    return (
                      <div
                        key={idx}
                        onClick={() => toggleFieldSelect(idx)}
                        className={`px-3 py-2 flex items-center justify-between cursor-pointer transition-colors ${
                          field.selected ? 'bg-sky-50/40' : 'opacity-60 bg-slate-50/50'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 truncate">
                          <input
                            type="checkbox"
                            disabled={isExecuting}
                            checked={field.selected}
                            onChange={() => toggleFieldSelect(idx)}
                            className="rounded text-sky-600"
                          />
                          <div className="truncate">
                            <div className="font-semibold text-slate-800 flex items-center space-x-2">
                              <span>{field.label}</span>
                              <span className="font-mono text-[11px] text-slate-400 font-normal">({field.apiKey})</span>
                              {field.referObjectApiKey && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-600 border border-indigo-200">
                                  关联: {field.referObjectApiKey}
                                </span>
                              )}
                            </div>
                            {field.pickOption && field.pickOption.length > 0 && (
                              <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                选项: {field.pickOption.map((o) => o.optionLabel).join('、')}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                            {typeLabel}
                          </span>

                          {field.status === 'creating' && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
                          )}
                          {field.status === 'success' && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          )}
                          {field.status === 'failed' && (
                            <span className="text-[10px] text-rose-600" title={field.error}>
                              创建失败
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 实时进度条 */}
              {isExecuting && (
                <div className="p-3 rounded-xl border border-sky-200 bg-sky-50/60 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-medium text-sky-900">
                    <span className="flex items-center space-x-1.5">
                      <Loader2 className="w-3 h-3 animate-spin text-sky-600" />
                      <span>{progressText}</span>
                    </span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-sky-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sky-600 transition-all duration-200 rounded-full"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!isCompleted && (
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              预计创建 1 个实体及 {fields.filter((f) => f.selected).length} 个字段
            </span>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                disabled={isExecuting}
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 font-medium text-xs"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isExecuting}
                onClick={handleStartCreation}
                className="px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs shadow-xs flex items-center space-x-1.5 cursor-pointer"
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>正在创建...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>确认在销售易租户中创建</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
