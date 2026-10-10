import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Edit3, 
  Save, 
  Code2, 
  RefreshCw, 
  AlertCircle,
  FileText,
  Lock
} from 'lucide-react';
import { EntityMetadata, FieldMetadata } from '../../../shared/types';
import { ReferenceLookupInput } from './ReferenceLookupInput';
import { ImageFieldComponent, isImageField } from './ImageFieldComponent';
import { BatchDataImportModal } from './BatchDataImportModal';
import { FileSpreadsheet } from 'lucide-react';

interface DataEditorProps {
  entities: EntityMetadata[];
  initialEntityApiKey: string;
  initialRecordId?: string | number;
  initialRecordData?: Record<string, any> | null;
  onNavigateToView: (entityApiKey: string, recordId: string | number) => void;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const DataEditor: React.FC<DataEditorProps> = ({
  entities,
  initialEntityApiKey,
  initialRecordId,
  initialRecordData,
  onNavigateToView,
  showToast,
}) => {
  const [mode, setMode] = useState<'create' | 'update'>(initialRecordId ? 'update' : 'create');
  const [selectedEntityApiKey, setSelectedEntityApiKey] = useState(initialEntityApiKey || 'account');
  const [targetRecordId, setTargetRecordId] = useState<string>(initialRecordId ? String(initialRecordId) : '');
  const [fields, setFields] = useState<FieldMetadata[]>([]);
  const [formData, setFormData] = useState<Record<string, any>>({});
  
  // 关联字段名称缓存映射: { [fieldName]: "选中的真实名称" }
  const [lookupNames, setLookupNames] = useState<Record<string, string>>({});

  // 模式切换: 表单视图 vs JSON 代码视图
  const [viewMode, setViewMode] = useState<'form' | 'json'>('form');
  const [isBatchImportOpen, setIsBatchImportOpen] = useState(false);
  const [jsonCode, setJsonCode] = useState('{}');

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  /**
   * 判断字段是否为不可更新/创建的只读字段 (自动编号、计算字段、统计字段等)
   */
  const getReadOnlyReason = (f: FieldMetadata): string | null => {
    // 自动编号: 9, 13
    if (f.itemType === 9 || f.itemType === 13) return '自动编号';
    // 计算字段: 20
    if (f.itemType === 20) return '计算类型';
    // 统计字段: 27
    if (f.itemType === 27) return '汇总统计';
    // 自动计算: 28
    if (f.itemType === 28) return '系统计算';
    // 系统只读字段
    if (['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'deleteFlag', 'version'].includes(f.apiKey)) {
      return '系统属性';
    }
    return null;
  };

  // 自动批量解析当前数据中所有关联字段的名称
  const autoResolveAllLookupNames = async (data: Record<string, any>, fieldList: FieldMetadata[]) => {
    const targetMap: Record<string, { fieldApiKey: string; id: string | number }[]> = {};

    fieldList.forEach((f) => {
      if (f.referObjectApiKey && data[f.apiKey]) {
        const refId = data[f.apiKey];
        if (!targetMap[f.referObjectApiKey]) targetMap[f.referObjectApiKey] = [];
        targetMap[f.referObjectApiKey].push({ fieldApiKey: f.apiKey, id: refId });
      }
    });

    const resolved: Record<string, string> = {};
    for (const [refEntity, items] of Object.entries(targetMap)) {
      try {
        const ids = items.map((i) => i.id);
        const nameMap = await window.neoApi.getBatchNames(refEntity, ids);
        items.forEach((item) => {
          if (nameMap[String(item.id)]) {
            resolved[item.fieldApiKey] = nameMap[String(item.id)];
          }
        });
      } catch {}
    }

    if (Object.keys(resolved).length > 0) {
      setLookupNames((prev) => ({ ...prev, ...resolved }));
    }
  };

  // 加载字段
  const loadFields = async (apiKey: string) => {
    setLoading(true);
    try {
      const list = await window.neoApi.getFields(apiKey);
      setFields(list);
      return list;
    } catch {
      setFields([]);
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFields(selectedEntityApiKey);
  }, [selectedEntityApiKey]);

  useEffect(() => {
    if (initialRecordData) {
      setMode('update');
      setTargetRecordId(String(initialRecordData.id || ''));
      setFormData(initialRecordData);
      setJsonCode(JSON.stringify(initialRecordData, null, 2));

      loadFields(selectedEntityApiKey).then((fList) => {
        if (fList.length > 0) {
          autoResolveAllLookupNames(initialRecordData, fList);
        }
      });
    }
  }, [initialRecordData]);

  // 从服务端加载要更新的记录数据
  const handleLoadRecordForUpdate = async () => {
    if (!targetRecordId.trim()) {
      showToast('info', '请输入要更新的数据 ID');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await window.neoApi.getRecordDetail(selectedEntityApiKey, targetRecordId.trim());
      if (res.success && res.data) {
        setFormData(res.data);
        setJsonCode(JSON.stringify(res.data, null, 2));
        showToast('success', `成功加载数据记录`);
        autoResolveAllLookupNames(res.data, fields);
      } else {
        setErrorMsg(res.error || '未找到该记录');
      }
    } catch (e: any) {
      setErrorMsg(`加载失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 修改表单值
  const handleFieldChange = (key: string, val: any) => {
    const updated = { ...formData, [key]: val };
    setFormData(updated);
    setJsonCode(JSON.stringify(updated, null, 2));
  };

  // 关联字段选择变动
  const handleLookupChange = (fieldKey: string, newId: string | number | null, newName?: string) => {
    handleFieldChange(fieldKey, newId);
    if (newName) {
      setLookupNames((prev) => ({ ...prev, [fieldKey]: newName }));
    } else {
      setLookupNames((prev) => {
        const copy = { ...prev };
        delete copy[fieldKey];
        return copy;
      });
    }
  };

  // 提交保存
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');

    let payload: Record<string, any>;
    if (viewMode === 'json') {
      try {
        payload = JSON.parse(jsonCode);
      } catch (err: any) {
        setErrorMsg(`JSON 格式错误: ${err.message}`);
        setSubmitting(false);
        return;
      }
    } else {
      payload = { ...formData };
    }

    // 精确清洗提交载荷：剔除系统衍生辅助字段(如 _compound, -label, -icon)与只读计算字段
    const cleanPayload: Record<string, any> = {};
    const validFieldMap = new Map(fields.map((f) => [f.apiKey, f]));

    Object.entries(payload).forEach(([key, val]) => {
      // 过滤接口返回的展示用衍生字段
      if (key.includes("-") || key.endsWith("_compound") || key.endsWith("_data")) return;
      if (["id", "createdAt", "updatedAt", "createdBy", "updatedBy", "deleteFlag", "deleteFlg", "tenantId", "groupId", "innerGroupId", "version"].includes(key)) return;

      const f = validFieldMap.get(key);
      if (f && getReadOnlyReason(f)) return;

      if (f || key.endsWith("__c") || isImageField({ apiKey: key }, val)) {
        cleanPayload[key] = val;
      }
    });

    payload = cleanPayload;

    try {
      if (mode === 'create') {
        const res = await window.neoApi.createRecord(selectedEntityApiKey, payload);
        if (res.success) {
          const newId = res.data?.id;
          showToast('success', `数据创建成功！`);
          if (newId) {
            onNavigateToView(selectedEntityApiKey, newId);
          }
        } else {
          setErrorMsg(res.error || '创建失败');
        }
      } else {
        if (!targetRecordId.trim()) {
          setErrorMsg('更新模式必须提供记录 ID');
          setSubmitting(false);
          return;
        }
        const res = await window.neoApi.updateRecord(selectedEntityApiKey, targetRecordId.trim(), payload);
        if (res.success) {
          showToast('success', `数据更新成功！`);
          onNavigateToView(selectedEntityApiKey, targetRecordId.trim());
        } else {
          setErrorMsg(res.error || '更新失败');
        }
      }
    } catch (e: any) {
      setErrorMsg(`提交异常: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const currentEntityObj = entities.find((e) => e.apiKey === selectedEntityApiKey);

  return (
    <div className="space-y-4">
      {/* 头部控制栏 (浅色风格) */}
      <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {/* 模式选择 Tab */}
            <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs">
              <button
                onClick={() => setMode('create')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  mode === 'create'
                    ? 'bg-white text-sky-600 font-semibold shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新建数据 (Insert)</span>
              </button>
              <button
                onClick={() => setMode('update')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  mode === 'update'
                    ? 'bg-white text-sky-600 font-semibold shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>更新数据 (Update)</span>
              </button>
            </div>

            {/* 对象选择 */}
            <div className="flex items-center space-x-1.5 text-xs bg-slate-50 px-3 py-1 rounded-xl border border-slate-200">
              <span className="text-slate-500">操作对象:</span>
              <select
                value={selectedEntityApiKey}
                onChange={(e) => {
                  setSelectedEntityApiKey(e.target.value);
                  setFormData({});
                  setLookupNames({});
                }}
                className="bg-transparent text-sky-700 font-mono font-medium focus:outline-none cursor-pointer"
              >
                {entities.map((e) => (
                  <option key={e.apiKey} value={e.apiKey}>
                    {e.label} ({e.apiKey})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 视图切换 */}
          <div className="flex items-center space-x-2 text-xs">
            <button
              type="button"
              onClick={() => setIsBatchImportOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-medium rounded-lg transition-all shadow-2xs"
              title="上传 Excel 表格批量新增或更新业务数据"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Excel 批量导入数据</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'form' ? 'json' : 'form')}
              className="flex items-center space-x-1 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg transition-colors border border-slate-200"
            >
              {viewMode === 'form' ? (
                <Code2 className="w-3.5 h-3.5 text-sky-600" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-emerald-600" />
              )}
              <span>{viewMode === 'form' ? '切换为 JSON 视图' : '切换为表单视图'}</span>
            </button>
          </div>
        </div>

        {/* 若为更新模式，提供 ID 加载栏 */}
        {mode === 'update' && (
          <div className="flex items-center space-x-2 pt-2 border-t border-slate-100">
            <span className="text-xs text-slate-700 font-medium">目标记录 ID:</span>
            <input
              type="text"
              value={targetRecordId}
              onChange={(e) => setTargetRecordId(e.target.value.trim())}
              placeholder="输入要更新的数据 ID，例如 4172298..."
              className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500"
            />
            <button
              onClick={handleLoadRecordForUpdate}
              disabled={loading}
              className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-sky-700 text-xs font-medium rounded-lg transition-colors border border-slate-200 flex items-center space-x-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>加载数据</span>
            </button>
          </div>
        )}
      </div>

      {/* 错误提示 */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 编辑表单内容 (浅色商务风格) */}
      <form onSubmit={handleSubmit} className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-5">
        {viewMode === 'json' ? (
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              字段 JSON 载荷 (直接编辑)
            </label>
            <textarea
              rows={16}
              value={jsonCode}
              onChange={(e) => {
                setJsonCode(e.target.value);
                try {
                  setFormData(JSON.parse(e.target.value));
                } catch {}
              }}
              className="w-full p-4 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs text-slate-800 leading-relaxed focus:outline-none focus:border-sky-500"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {fields.map((f) => {
              const val = formData[f.apiKey] ?? '';
              const isRefer = !!f.referObjectApiKey;
              const lookupName = lookupNames[f.apiKey];
              const readOnlyReason = getReadOnlyReason(f);
              const isReadOnly = !!readOnlyReason;

              return (
                <div key={f.apiKey} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-700 truncate flex items-center space-x-1" title={f.label}>
                      <span>{f.label}</span>
                      {isReadOnly && <Lock className="w-3 h-3 text-slate-400" />}
                    </label>
                    <div className="flex items-center space-x-1">
                      {isReadOnly && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 font-medium">
                          只读 ({readOnlyReason})
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-slate-400">{f.apiKey}</span>
                    </div>
                  </div>

                  
                  {/* 图片字段：专用 ImageFieldComponent 缩略图与上传组件 */}
                  {isImageField(f, val) ? (
                    <ImageFieldComponent
                      fieldApiKey={f.apiKey}
                      fieldLabel={f.label}
                      value={val}
                      disabled={isReadOnly}
                      onChange={(newVal) => handleFieldChange(f.apiKey, newVal)}
                    />
                  ) : isRefer ? (
                    <ReferenceLookupInput
                      fieldApiKey={f.apiKey}
                      fieldLabel={f.label}
                      referObjectApiKey={f.referObjectApiKey!}
                      value={val}
                      initialDisplayName={lookupName}
                      disabled={isReadOnly}
                      onChange={(newId, newName) => handleLookupChange(f.apiKey, newId, newName)}
                    />
                  ) : [3, 4].includes(f.itemType) && f.pickOption?.length ? (
                    // 下拉单选/多选
                    <select
                      value={val}
                      disabled={isReadOnly}
                      onChange={(e) => handleFieldChange(f.apiKey, Number(e.target.value))}
                      className={`w-full px-2.5 py-2 border rounded-xl text-xs transition-colors ${
                        isReadOnly
                          ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                          : 'bg-white border-slate-300 text-slate-800 focus:outline-none focus:border-sky-500'
                      }`}
                    >
                      <option value="">-- 请选择 --</option>
                      {f.pickOption.map((opt, oIdx) => (
                        <option key={oIdx} value={opt.optionCode ?? opt.optionApiKey}>
                          {opt.optionLabel} ({opt.optionCode ?? opt.optionApiKey})
                        </option>
                      ))}
                    </select>
                  ) : f.itemType === 31 ? (
                    // 布尔开关
                    <label className={`flex items-center space-x-2 pt-2 ${isReadOnly ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        checked={!!val}
                        disabled={isReadOnly}
                        onChange={(e) => handleFieldChange(f.apiKey, e.target.checked)}
                        className="rounded border-slate-300 text-sky-600 focus:ring-0"
                      />
                      <span className="text-xs text-slate-700">{val ? '是 (true)' : '否 (false)'}</span>
                    </label>
                  ) : (
                    // 普通文本/数字/计算/自动编号
                    <input
                      type={f.itemType === 5 ? 'number' : 'text'}
                      value={val}
                      disabled={isReadOnly}
                      onChange={(e) => handleFieldChange(f.apiKey, e.target.value)}
                      placeholder={isReadOnly ? `由系统${readOnlyReason}自动生成` : f.typeName}
                      className={`w-full px-3 py-2 border rounded-xl text-xs transition-colors ${
                        isReadOnly
                          ? 'bg-slate-100 border-slate-200 text-slate-400 placeholder-slate-400 cursor-not-allowed'
                          : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 提交栏 */}
        <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white text-xs font-medium rounded-xl shadow-md shadow-sky-600/20 transition-all flex items-center space-x-1.5 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{submitting ? '正在提交...' : mode === 'create' ? '立即创建记录 (Insert)' : '立即更新记录 (Update)'}</span>
          </button>
        </div>
      </form>
      {/* Excel 批量数据导入弹窗 */}
      <BatchDataImportModal
        isOpen={isBatchImportOpen}
        entityApiKey={selectedEntityApiKey}
        entityLabel={currentEntityObj?.label || selectedEntityApiKey}
        fields={fields}
        onClose={() => setIsBatchImportOpen(false)}
        showToast={showToast}
      />
    </div>
  );
};
