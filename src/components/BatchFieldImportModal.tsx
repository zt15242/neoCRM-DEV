import React, { useState, useRef } from 'react';
import { 
  X, 
  Upload, 
  FileSpreadsheet, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Play, 
  RefreshCw, 
  Check, 
  Pause,
  RotateCcw,
  Sparkles,
  Info
} from 'lucide-react';
import { EntityMetadata, FieldMetadata, ExcelFieldRow } from '../../shared/types';
import { parseExcelFile, generateTemplateExcel } from '../utils/excelFieldHelper';

interface BatchFieldImportModalProps {
  isOpen: boolean;
  entity: EntityMetadata | null;
  existingFields: FieldMetadata[];
  onClose: () => void;
  onRefreshFields: () => Promise<void>;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const BatchFieldImportModal: React.FC<BatchFieldImportModalProps> = ({
  isOpen,
  entity,
  existingFields,
  onClose,
  onRefreshFields,
  showToast,
}) => {
  const [step, setStep] = useState<'upload' | 'preview' | 'executing' | 'finished'>('upload');
  const [fileName, setFileName] = useState<string>('');
  const [rows, setRows] = useState<ExcelFieldRow[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 执行状态
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const isCancelledRef = useRef<boolean>(false);

  // 统计计数
  const totalSelected = rows.filter((r) => r.selected).length;
  const successCount = rows.filter((r) => r.status === 'success').length;
  const skipCount = rows.filter((r) => r.status === 'skipped').length;
  const failCount = rows.filter((r) => r.status === 'failed').length;

  if (!isOpen || !entity) return null;

  // 处理文件读取
  const processFile = async (file: File) => {
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const res = parseExcelFile(buffer, existingFields);
      if (res.error) {
        showToast('error', res.error);
        return;
      }
      if (res.rows.length === 0) {
        showToast('info', 'Excel 文件中未解析到有效字段数据');
        return;
      }
      setRows(res.rows);
      setStep('preview');
      showToast('success', `成功解析 ${res.rows.length} 个字段定义`);
    } catch (e: any) {
      showToast('error', `读取文件失败: ${e.message}`);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  // 勾选切换
  const handleToggleSelect = (id: string) => {
    setRows(rows.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)));
  };

  const handleSelectAll = (select: boolean) => {
    setRows(rows.map((r) => ({ ...r, selected: select })));
  };

  const handleSelectOnlyValid = () => {
    setRows(rows.map((r) => ({ ...r, selected: r.status === 'valid' })));
  };

  // 表格中编辑字段名或 API Key
  const handleUpdateRowField = (id: string, field: 'label' | 'apiKey', value: string) => {
    setRows(
      rows.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        if (!updated.label || !updated.apiKey) {
          updated.status = 'invalid';
          updated.errorMessage = '字段名与 API Key 为必填项';
        } else {
          updated.status = 'valid';
          updated.errorMessage = '';
        }
        return updated;
      })
    );
  };

  // 开始执行批量创建
  const handleStartBatchCreate = async (retryFailedOnly = false) => {
    setStep('executing');
    isCancelledRef.current = false;
    setIsPaused(false);

    const targetRows = rows.filter((r) => (retryFailedOnly ? r.status === 'failed' : r.selected));

    for (let i = 0; i < targetRows.length; i++) {
      if (isCancelledRef.current) break;

      const currentRow = targetRows[i];
      setCurrentIndex(i + 1);

      // 如果当前字段已经被标记为已存在，直接转为跳过
      if (currentRow.status === 'exists') {
        setRows((prev) =>
          prev.map((r) => (r.id === currentRow.id ? { ...r, status: 'skipped' } : r))
        );
        continue;
      }

      try {
        const payload = {
          apiKey: currentRow.apiKey,
          label: currentRow.label,
          itemType: currentRow.itemType,
          currency: currentRow.currency,
          maxLength: currentRow.maxLength,
          decimal: currentRow.decimal,
          pickOption: currentRow.pickOption,
          referObjectApiKey: currentRow.referObjectApiKey,
          cascadeDelete: currentRow.cascadeDelete !== undefined ? currentRow.cascadeDelete : 1,
          linkLabel: currentRow.linkLabel || currentRow.label,
          description: currentRow.description,
        };

        const res = await window.neoApi.createField(entity.apiKey, payload);

        setRows((prev) =>
          prev.map((r) => {
            if (r.id !== currentRow.id) return r;
            if (res.success) {
              return { ...r, status: 'success', errorMessage: '' };
            } else if (res.error?.includes('REPEAT') || res.error?.includes('已存在')) {
              return { ...r, status: 'skipped', errorMessage: '字段已存在' };
            } else {
              return { ...r, status: 'failed', errorMessage: res.error || '创建失败' };
            }
          })
        );
      } catch (err: any) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === currentRow.id ? { ...r, status: 'failed', errorMessage: err.message } : r
          )
        );
      }

      // 适当限流防并发熔断 (250ms)
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    setStep('finished');
    await onRefreshFields();
  };

  const handleFinish = async () => {
    await onRefreshFields();
    onClose();
    showToast('success', `批量创建处理完成 (成功: ${successCount}, 跳过: ${skipCount}, 失败: ${failCount})`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* 头部 */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-base font-semibold text-slate-900">Excel 批量字段导入与创建</h3>
              <p className="text-[11px] text-slate-400">
                目标对象: <span className="text-sky-300 font-mono font-medium">{entity.label} ({entity.apiKey})</span>
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

        {/* 步骤条 */}
        <div className="px-6 py-2.5 bg-slate-50/50 border-b border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-6">
            <span className={`flex items-center space-x-1.5 ${step === 'upload' ? 'text-sky-400 font-semibold' : 'text-slate-400'}`}>
              <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px]">1</span>
              <span>上传文件 / 下载模板</span>
            </span>
            <span className={`flex items-center space-x-1.5 ${step === 'preview' ? 'text-sky-400 font-semibold' : 'text-slate-400'}`}>
              <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px]">2</span>
              <span>数据预检与调整</span>
            </span>
            <span className={`flex items-center space-x-1.5 ${step === 'executing' || step === 'finished' ? 'text-sky-400 font-semibold' : 'text-slate-400'}`}>
              <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px]">3</span>
              <span>批量创建与报告</span>
            </span>
          </div>

          <button
            onClick={() => generateTemplateExcel(entity.apiKey)}
            className="flex items-center space-x-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs rounded-lg transition-colors border border-emerald-500/20"
            title="下载包含标准示例的 Excel 格式模板"
          >
            <Download className="w-3.5 h-3.5" />
            <span>下载标准 Excel 模板</span>
          </button>
        </div>

        {/* 主体内容 */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* 步骤 1: 上传文件 */}
          {step === 'upload' && (
            <div className="space-y-5">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-sky-500 bg-sky-950/20'
                    : 'border-slate-700 hover:border-slate-600 bg-slate-50/50'
                }`}
              >
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-3">
                  <Upload className="w-7 h-7" />
                </div>
                <h4 className="text-sm font-semibold text-slate-900">
                  点击选择文件，或直接拖拽 Excel 文件至此处
                </h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  支持 .xlsx、.xls 或 .csv 格式。系统将自动对齐表头并映射字段类型与下拉选项。
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* 字段规范说明卡片 */}
              <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2 text-xs">
                <div className="flex items-center space-x-1.5 text-slate-200 font-medium">
                  <Info className="w-4 h-4 text-sky-400" />
                  <span>Excel 表头识别规则 (中英文自动映射)</span>
                </div>
                <ul className="text-slate-400 space-y-1 list-disc pl-5 leading-relaxed">
                  <li><strong className="text-slate-300">字段名称</strong>：支持表头如“字段名称”、“名称”、“label”、“name”</li>
                  <li><strong className="text-slate-300">API 标识</strong>：支持表头如“API标识”、“apiKey”、“字段标识”，仅需填主标识（无需加 __c）</li>
                  <li><strong className="text-slate-300">字段类型</strong>：支持“单行文本”、“多行文本”、“单选列表”、“多选列表”、“整数”、“金额”、“日期”、“日期时间”、“电话”、“邮箱”、“网址”、“布尔值”等</li>
                  <li><strong className="text-slate-300">下拉选项</strong>：针对单选/多选，支持格式“选项A:1, 选项B:2”或逗号分隔“启用, 停用”自动生成数字代码</li>
                </ul>
              </div>
            </div>
          )}

          {/* 步骤 2: 数据预览与预检 */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* 统计指标与快捷筛选 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-xs">
                  <span className="text-slate-400">已解析 {rows.length} 个字段：</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    可导入: {rows.filter((r) => r.status === 'valid').length}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    已存在: {rows.filter((r) => r.status === 'exists').length}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    格式错误: {rows.filter((r) => r.status === 'invalid').length}
                  </span>
                </div>

                <div className="flex items-center space-x-2 text-xs">
                  <button
                    onClick={() => handleSelectOnlyValid()}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-colors"
                  >
                    仅选有效项
                  </button>
                  <button
                    onClick={() => handleSelectAll(true)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-colors"
                  >
                    全选
                  </button>
                  <button
                    onClick={() => handleSelectAll(false)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-colors"
                  >
                    取消全选
                  </button>
                  <button
                    onClick={() => setStep('upload')}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-sky-400 rounded-md transition-colors"
                  >
                    重新上传
                  </button>
                </div>
              </div>

              {/* 预览表格 */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[50vh] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50/80 sticky top-0 border-b border-slate-200 text-slate-400 font-medium z-10">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">选择</th>
                      <th className="py-2.5 px-3">状态</th>
                      <th className="py-2.5 px-3">字段名称</th>
                      <th className="py-2.5 px-3">API Key</th>
                      <th className="py-2.5 px-3">类型</th>
                      <th className="py-2.5 px-3">参数说明</th>
                      <th className="py-2.5 px-3">校验结果</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {rows.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={() => handleToggleSelect(row.id)}
                            className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0"
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          {row.status === 'valid' && (
                            <span className="flex items-center space-x-1 text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>待创建</span>
                            </span>
                          )}
                          {row.status === 'exists' && (
                            <span className="flex items-center space-x-1 text-amber-400 font-medium">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>已存在</span>
                            </span>
                          )}
                          {row.status === 'invalid' && (
                            <span className="flex items-center space-x-1 text-rose-400 font-medium">
                              <AlertCircle className="w-3.5 h-3.5" />
                              <span>格式错误</span>
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="text"
                            value={row.label}
                            onChange={(e) => handleUpdateRowField(row.id, 'label', e.target.value)}
                            className="bg-transparent text-slate-900 font-medium hover:bg-slate-800 px-1.5 py-0.5 rounded focus:bg-slate-800 focus:outline-none w-full"
                          />
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          <input
                            type="text"
                            value={row.apiKey}
                            onChange={(e) => handleUpdateRowField(row.id, 'apiKey', e.target.value)}
                            className="bg-transparent text-sky-300 hover:bg-slate-800 px-1.5 py-0.5 rounded focus:bg-slate-800 focus:outline-none w-full font-mono"
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px]">
                            {row.typeName}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 truncate max-w-xs text-[11px]">
                          {[3, 4].includes(row.itemType) ? (
                            <span>
                              选项: {row.pickOption?.map((o) => `${o.optionLabel}(${o.optionCode})`).join(', ')}
                            </span>
                          ) : (
                            <span>长度: {row.maxLength || 200}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                          {row.errorMessage ? (
                            <span className="text-rose-400">{row.errorMessage}</span>
                          ) : (
                            <span className="text-emerald-400">校验通过</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 步骤 3: 批量执行中与执行结果 */}
          {(step === 'executing' || step === 'finished') && (
            <div className="space-y-6 py-4">
              {/* 进度卡片 */}
              <div className="p-6 bg-slate-50/60 border border-slate-200 rounded-2xl flex flex-col items-center justify-center space-y-4 text-center">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full border-4 border-slate-200 border-t-sky-500 animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center font-bold text-sm font-mono text-sky-400">
                    {step === 'finished'
                      ? '100%'
                      : `${Math.round((currentIndex / (totalSelected || 1)) * 100)}%`}
                  </div>
                </div>

                <div>
                  <h4 className="text-base font-semibold text-slate-900">
                    {step === 'finished' ? '批量创建任务执行完毕' : '正在调用销售易 API 创建字段...'}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 font-mono">
                    已处理 {currentIndex} / 共 {totalSelected} 个待创建字段
                  </p>
                </div>

                {/* 成果统计徽章 */}
                <div className="flex items-center space-x-3 text-xs pt-2">
                  <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center space-x-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>成功创建: {successCount}</span>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center space-x-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    <span>已存在跳过: {skipCount}</span>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center space-x-1.5">
                    <AlertCircle className="w-4 h-4" />
                    <span>失败: {failCount}</span>
                  </div>
                </div>
              </div>

              {/* 明细状态列表 */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                <div className="p-3 bg-slate-50/80 border-b border-slate-200 text-xs font-medium text-slate-300">
                  执行记录明细
                </div>
                <div className="divide-y divide-slate-800/40 text-xs">
                  {rows
                    .filter((r) => r.selected)
                    .map((r) => (
                      <div key={r.id} className="p-2.5 flex items-center justify-between px-4">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-slate-200">{r.label}</span>
                          <span className="font-mono text-slate-400 text-[11px]">({r.apiKey}__c)</span>
                        </div>
                        <div>
                          {r.status === 'success' && (
                            <span className="text-emerald-400 flex items-center space-x-1">
                              <Check className="w-3.5 h-3.5" />
                              <span>创建成功</span>
                            </span>
                          )}
                          {r.status === 'skipped' && (
                            <span className="text-amber-400 flex items-center space-x-1">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>跳过 (已存在)</span>
                            </span>
                          )}
                          {r.status === 'failed' && (
                            <span className="text-rose-400 flex items-center space-x-1" title={r.errorMessage}>
                              <AlertCircle className="w-3.5 h-3.5" />
                              <span>失败: {r.errorMessage}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮栏 */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {step === 'preview' && (
              <span>已勾选 <strong className="text-sky-300">{totalSelected}</strong> 个字段准备创建</span>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {step === 'upload' && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors"
              >
                取消
              </button>
            )}

            {step === 'preview' && (
              <>
                <button
                  type="button"
                  onClick={() => setStep('upload')}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors"
                >
                  上一步
                </button>
                <button
                  type="button"
                  disabled={totalSelected === 0}
                  onClick={() => handleStartBatchCreate(false)}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg shadow-lg shadow-emerald-600/30 transition-all flex items-center space-x-1.5 disabled:opacity-40"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>开始批量创建 ({totalSelected}个)</span>
                </button>
              </>
            )}

            {step === 'finished' && (
              <>
                {failCount > 0 && (
                  <button
                    type="button"
                    onClick={() => handleStartBatchCreate(true)}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center space-x-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>仅重试失败项 ({failCount}个)</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleFinish}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium rounded-lg shadow-lg shadow-sky-600/30 transition-all"
                >
                  完成并刷新列表
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
