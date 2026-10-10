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
  RotateCcw,
  Sparkles,
  Info,
  PlusCircle,
  Edit2
} from 'lucide-react';
import { FieldMetadata } from '../../../shared/types';
import { ExcelDataRow, parseDataExcelFile, generateDataTemplateExcel } from '../../utils/excelDataHelper';

interface BatchDataImportModalProps {
  isOpen: boolean;
  entityApiKey: string;
  entityLabel: string;
  fields: FieldMetadata[];
  onClose: () => void;
  onSuccessFinished?: () => void;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const BatchDataImportModal: React.FC<BatchDataImportModalProps> = ({
  isOpen,
  entityApiKey,
  entityLabel,
  fields,
  onClose,
  onSuccessFinished,
  showToast,
}) => {
  const [step, setStep] = useState<'upload' | 'preview' | 'executing' | 'finished'>('upload');
  const [fileName, setFileName] = useState<string>('');
  const [rows, setRows] = useState<ExcelDataRow[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 进度统计
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const isCancelledRef = useRef<boolean>(false);

  const totalSelected = rows.filter((r) => r.selected).length;
  const successCount = rows.filter((r) => r.status === 'success').length;
  const failCount = rows.filter((r) => r.status === 'failed').length;
  const createSelected = rows.filter((r) => r.selected && r._action === 'create').length;
  const updateSelected = rows.filter((r) => r.selected && r._action === 'update').length;

  if (!isOpen) return null;

  const processFile = async (file: File) => {
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const res = parseDataExcelFile(buffer, fields);
      if (res.error) {
        showToast('error', res.error);
        return;
      }
      if (res.rows.length === 0) {
        showToast('info', 'Excel 表格中未识别到有效业务数据');
        return;
      }
      setRows(res.rows);
      setStep('preview');
      showToast('success', `成功解析 ${res.totalCount} 条数据 (新增: ${res.createCount}, 更新: ${res.updateCount})`);
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

  const handleToggleSelect = (rowId: string) => {
    setRows(rows.map((r) => (r._rowId === rowId ? { ...r, selected: !r.selected } : r)));
  };

  const handleSelectAll = (select: boolean) => {
    setRows(rows.map((r) => ({ ...r, selected: select })));
  };

  // 执行批量导入 (新增 / 更新)
  const handleStartBatchImport = async (retryFailedOnly = false) => {
    setStep('executing');
    isCancelledRef.current = false;

    const targetRows = rows.filter((r) => (retryFailedOnly ? r.status === 'failed' : r.selected));

    for (let i = 0; i < targetRows.length; i++) {
      if (isCancelledRef.current) break;

      const currentRow = targetRows[i];
      setCurrentIndex(i + 1);

      try {
        let res: { success: boolean; data?: any; error?: string };

        if (currentRow._action === 'update' && currentRow.id) {
          // 调用更新接口 (请求头带 xsy-execoption: -1025; xsy-criteria: 10)
          res = await window.neoApi.updateRecord(entityApiKey, currentRow.id, currentRow.data);
        } else {
          // 调用新建接口 (请求头带 xsy-execoption: -1025; xsy-criteria: 10)
          res = await window.neoApi.createRecord(entityApiKey, currentRow.data);
        }

        setRows((prev) =>
          prev.map((r) => {
            if (r._rowId !== currentRow._rowId) return r;
            if (res.success) {
              return { ...r, status: 'success', errorMessage: '' };
            } else {
              return { ...r, status: 'failed', errorMessage: res.error || '操作失败' };
            }
          })
        );
      } catch (err: any) {
        setRows((prev) =>
          prev.map((r) =>
            r._rowId === currentRow._rowId ? { ...r, status: 'failed', errorMessage: err.message } : r
          )
        );
      }

      // 平滑防限流间隔 (200ms)
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    setStep('finished');
  };

  const handleFinish = () => {
    onClose();
    onSuccessFinished?.();
    showToast('success', `批量数据导入执行完毕 (成功: ${successCount}, 失败: ${failCount})`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* 头部 */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            <div>
              <h3 className="text-base font-semibold text-slate-900">Excel 批量数据导入中心</h3>
              <p className="text-[11px] text-slate-500 font-mono">
                目标对象: <span className="text-sky-700 font-medium">{entityLabel} ({entityApiKey})</span>
                <span className="ml-2 text-slate-400">• 请求头已自动附带: xsy-execoption:-1025; xsy-criteria:10</span>
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

        {/* 步骤条 */}
        <div className="px-6 py-2.5 bg-slate-50/50 border-b border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-6">
            <span className={`flex items-center space-x-1.5 ${step === 'upload' ? 'text-sky-600 font-semibold' : 'text-slate-500'}`}>
              <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px]">1</span>
              <span>上传文件 / 下载模板</span>
            </span>
            <span className={`flex items-center space-x-1.5 ${step === 'preview' ? 'text-sky-600 font-semibold' : 'text-slate-500'}`}>
              <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px]">2</span>
              <span>数据预检与核对</span>
            </span>
            <span className={`flex items-center space-x-1.5 ${step === 'executing' || step === 'finished' ? 'text-sky-600 font-semibold' : 'text-slate-500'}`}>
              <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px]">3</span>
              <span>执行导入与报告</span>
            </span>
          </div>

          <button
            onClick={() => generateDataTemplateExcel(entityApiKey, entityLabel, fields)}
            className="flex items-center space-x-1.5 px-3 py-1 bg-white hover:bg-emerald-50 text-emerald-700 text-xs rounded-lg transition-colors border border-emerald-300 font-medium shadow-2xs"
            title="生成包含当前对象所有字段与示例的 Excel 导入模板"
          >
            <Download className="w-3.5 h-3.5" />
            <span>下载当前对象 Excel 数据模板</span>
          </button>
        </div>

        {/* 主体内容 */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* 步骤 1: 上传 */}
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
                    ? 'border-sky-500 bg-sky-50/50'
                    : 'border-slate-300 hover:border-slate-400 bg-slate-50/30'
                }`}
              >
                <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                  <Upload className="w-7 h-7" />
                </div>
                <h4 className="text-sm font-semibold text-slate-800">
                  点击选择文件，或直接拖拽 Excel 数据文件至此处
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  支持 .xlsx、.xls 或 .csv。表头支持中文名称或字段 API 标识，系统自动进行字段匹配映射。
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* 导入模式说明 */}
              <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2 text-xs">
                <div className="flex items-center space-x-1.5 text-slate-800 font-semibold">
                  <Info className="w-4 h-4 text-sky-600" />
                  <span>智能识别规则说明</span>
                </div>
                <ul className="text-slate-600 space-y-1.5 list-disc pl-5 leading-relaxed">
                  <li>
                    <strong className="text-slate-800">新建模式 (Insert)</strong>：若该行没有填写 ID（留空），则自动识别为新增数据记录。
                  </li>
                  <li>
                    <strong className="text-slate-800">更新模式 (Update)</strong>：若第一列或 `id` 列填入了已有记录的真实 ID，系统会自动按该 ID 执行字段增量更新。
                  </li>
                  <li>
                    <strong className="text-slate-800">单选/多选字段</strong>：单元格内既可以直接填选项文本（如“普通客户”），也可以填选项数字代码（如“1”），系统自动转换。
                  </li>
                  <li>
                    <strong className="text-slate-800">请求协议保障</strong>：每条数据提交时底层均严格附加 <code className="text-sky-700 font-mono">xsy-execoption: -1025</code> 与 <code className="text-sky-700 font-mono">xsy-criteria: 10</code> 请求头。
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* 步骤 2: 预检预览 */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-xs">
                  <span className="text-slate-500">已解析 {rows.length} 条数据：</span>
                  <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-medium">
                    待新建: {rows.filter((r) => r._action === 'create').length}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-medium">
                    待更新: {rows.filter((r) => r._action === 'update').length}
                  </span>
                </div>

                <div className="flex items-center space-x-2 text-xs">
                  <button
                    onClick={() => handleSelectAll(true)}
                    className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-md border border-slate-200 transition-colors"
                  >
                    全选
                  </button>
                  <button
                    onClick={() => handleSelectAll(false)}
                    className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-md border border-slate-200 transition-colors"
                  >
                    取消全选
                  </button>
                  <button
                    onClick={() => setStep('upload')}
                    className="px-2.5 py-1 bg-white hover:bg-slate-100 text-sky-700 rounded-md border border-slate-200 transition-colors"
                  >
                    重新上传
                  </button>
                </div>
              </div>

              {/* 预览表格 */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[50vh] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-slate-600 font-semibold z-10">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">选择</th>
                      <th className="py-2.5 px-3 w-20">操作类型</th>
                      <th className="py-2.5 px-3 w-36">目标 ID</th>
                      <th className="py-2.5 px-3">数据载荷预览</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => (
                      <tr key={row._rowId} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={() => handleToggleSelect(row._rowId)}
                            className="rounded border-slate-300 text-sky-600 focus:ring-0"
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          {row._action === 'create' ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-medium">
                              <PlusCircle className="w-3 h-3 text-sky-600" />
                              <span>新建</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-medium">
                              <Edit2 className="w-3 h-3 text-purple-600" />
                              <span>更新</span>
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">
                          {row.id ? String(row.id) : <span className="text-slate-400 italic">自动生成</span>}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 truncate max-w-md font-mono text-[11px]" title={JSON.stringify(row.data)}>
                          {row.displayPreview}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 步骤 3: 执行进度与报告 */}
          {(step === 'executing' || step === 'finished') && (
            <div className="space-y-6 py-4">
              <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col items-center justify-center space-y-4 text-center">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full border-4 border-slate-200 border-t-sky-600 animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center font-bold text-sm font-mono text-sky-700">
                    {step === 'finished'
                      ? '100%'
                      : `${Math.round((currentIndex / (totalSelected || 1)) * 100)}%`}
                  </div>
                </div>

                <div>
                  <h4 className="text-base font-semibold text-slate-900">
                    {step === 'finished' ? '批量数据导入任务执行完毕' : '正在调用销售易 API 写入数据...'}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 font-mono">
                    已处理 {currentIndex} / 共 {totalSelected} 条记录
                  </p>
                </div>

                <div className="flex items-center space-x-3 text-xs pt-2">
                  <div className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center space-x-1.5 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>成功: {successCount}</span>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 flex items-center space-x-1.5 font-medium">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    <span>失败: {failCount}</span>
                  </div>
                </div>
              </div>

              {/* 明细结果列表 */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                <div className="p-3 bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-700">
                  执行明细流水
                </div>
                <div className="divide-y divide-slate-100 text-xs">
                  {rows
                    .filter((r) => r.selected)
                    .map((r) => (
                      <div key={r._rowId} className="p-2.5 flex items-center justify-between px-4">
                        <div className="flex items-center space-x-2 truncate max-w-md">
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-medium ${r._action === 'create' ? 'bg-sky-50 text-sky-700' : 'bg-purple-50 text-purple-700'}`}>
                            {r._action === 'create' ? '新建' : '更新'}
                          </span>
                          <span className="font-mono text-slate-600 text-[11px] truncate">{r.displayPreview}</span>
                        </div>
                        <div>
                          {r.status === 'success' && (
                            <span className="text-emerald-600 flex items-center space-x-1 font-medium">
                              <Check className="w-3.5 h-3.5" />
                              <span>成功</span>
                            </span>
                          )}
                          {r.status === 'failed' && (
                            <span className="text-rose-600 flex items-center space-x-1 font-medium" title={r.errorMessage}>
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
          <div className="text-xs text-slate-500">
            {step === 'preview' && (
              <span>已选 <strong className="text-sky-700">{totalSelected}</strong> 条 (新建: {createSelected}, 更新: {updateSelected})</span>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {step === 'upload' && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 transition-colors"
              >
                取消
              </button>
            )}

            {step === 'preview' && (
              <>
                <button
                  type="button"
                  onClick={() => setStep('upload')}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 transition-colors"
                >
                  上一步
                </button>
                <button
                  type="button"
                  disabled={totalSelected === 0}
                  onClick={() => handleStartBatchImport(false)}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg shadow-sm shadow-emerald-600/30 transition-all flex items-center space-x-1.5 disabled:opacity-40"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>开始批量执行导入 ({totalSelected}条)</span>
                </button>
              </>
            )}

            {step === 'finished' && (
              <>
                {failCount > 0 && (
                  <button
                    type="button"
                    onClick={() => handleStartBatchImport(true)}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center space-x-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>仅重试失败记录 ({failCount}条)</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleFinish}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium rounded-lg shadow-sm shadow-sky-600/30 transition-all"
                >
                  完成并关闭
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
