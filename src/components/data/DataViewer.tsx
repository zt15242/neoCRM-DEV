import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Link2, 
  ExternalLink, 
  RefreshCw, 
  Copy, 
  Check, 
  AlertCircle, 
  Edit3, 
  Sparkles
} from 'lucide-react';
import { EntityMetadata, FieldMetadata } from '../../../shared/types';
import { RecordDetailDrawer } from './RecordDetailDrawer';
import { ImageFieldComponent, isImageField } from './ImageFieldComponent';
import { EntitySearchSelect } from './EntitySearchSelect';

interface DataViewerProps {
  entities: EntityMetadata[];
  defaultEntityApiKey: string;
  initialRecordId?: string | number;
  onNavigateToEdit: (entityApiKey: string, recordId: string | number, recordData: Record<string, any>) => void;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const DataViewer: React.FC<DataViewerProps> = ({
  entities,
  defaultEntityApiKey,
  initialRecordId,
  onNavigateToEdit,
  showToast,
}) => {
  const [selectedEntityApiKey, setSelectedEntityApiKey] = useState(defaultEntityApiKey || 'account');
  const [queryInput, setQueryInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [recordData, setRecordData] = useState<Record<string, any> | null>(null);
  const [fields, setFields] = useState<FieldMetadata[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [fieldFilterKeyword, setFieldFilterKeyword] = useState<string>("");

  const [relatedNames, setRelatedNames] = useState<Record<string, string>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerEntity, setDrawerEntity] = useState('');
  const [drawerId, setDrawerId] = useState<string | number>('');
  const [candidateList, setCandidateList] = useState<Record<string, any>[]>([]);

  useEffect(() => {
    if (initialRecordId) {
      setQueryInput(String(initialRecordId));
      executeQueryById(defaultEntityApiKey || selectedEntityApiKey, initialRecordId);
    }
  }, [initialRecordId]);

  const parseInput = (raw: string) => {
    const text = raw.trim();
    if (!text) return null;

    const urlMatch = text.match(/(?:xobjects|detail|entity|module)\/([a-zA-Z0-9_]+)\/(\d+)/i);
    if (urlMatch) {
      return { entity: urlMatch[1], id: urlMatch[2], isId: true };
    }

    const paramIdMatch = text.match(/[?&]id=(\d+)/i);
    if (paramIdMatch) {
      return { entity: selectedEntityApiKey, id: paramIdMatch[1], isId: true };
    }

    // 支持三套系统的 ID 识别：销售易纯数字 ID (13位时间戳ID)、Salesforce 15/18 位复合 ID、纷享销客 24 位 Hex ID
    if (/^\d{8,20}$/.test(text) || /^[a-zA-Z0-9]{15}$/.test(text) || /^[a-zA-Z0-9]{18}$/.test(text) || /^[a-f0-9]{24}$/i.test(text)) {
      return { entity: selectedEntityApiKey, id: text, isId: true };
    }

    return { entity: selectedEntityApiKey, name: text, isId: false };
  };

  const executeQueryById = async (entityKey: string, id: string | number) => {
    setLoading(true);
    setErrorMsg('');
    setCandidateList([]);
    try {
      const fieldList = await window.neoApi.getFields(entityKey);
      setFields(fieldList);

      const res = await window.neoApi.getRecordDetail(entityKey, id);
      if (res.success && res.data) {
        setRecordData(res.data);
        resolveRelatedNames(res.data, fieldList);
      } else {
        setErrorMsg(res.error || `未检索到 ID 为 ${id} 的数据记录`);
        setRecordData(null);
      }
    } catch (e: any) {
      setErrorMsg(`查询异常: ${e.message}`);
      setRecordData(null);
    } finally {
      setLoading(false);
    }
  };

  const executeSearchByName = async (entityKey: string, name: string) => {
    setLoading(true);
    setErrorMsg('');
    setRecordData(null);
    try {
      const res = await window.neoApi.searchRecords(entityKey, name, 200);
      if (res.success && res.records.length > 0) {
        if (res.records.length === 1) {
          await executeQueryById(entityKey, res.records[0].id);
        } else {
          setCandidateList(res.records);
        }
      } else {
        setErrorMsg(`在 ${entityKey} 中未找到名称包含 "${name}" 的记录`);
      }
    } catch (e: any) {
      setErrorMsg(`检索异常: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleQuery = async () => {
    const parsed = parseInput(queryInput);
    if (!parsed) {
      showToast('info', '请输入有效的数据 ID、名称或销售易页面 URL');
      return;
    }

    if (parsed.entity && parsed.entity !== selectedEntityApiKey) {
      setSelectedEntityApiKey(parsed.entity);
    }

    if (parsed.isId && parsed.id) {
      await executeQueryById(parsed.entity || selectedEntityApiKey, parsed.id);
    } else if (parsed.name) {
      await executeSearchByName(parsed.entity || selectedEntityApiKey, parsed.name);
    }
  };

  const resolveRelatedNames = async (data: Record<string, any>, fieldList: FieldMetadata[]) => {
    const targetMap: Record<string, (string | number)[]> = {};

    fieldList.forEach((f) => {
      if ((f.referObjectApiKey || f.apiKey === 'entityType') && data[f.apiKey]) {
        const refId = data[f.apiKey];
        const refKey =
          f.referObjectApiKey === 'entityBelongType' || f.apiKey === 'entityType'
            ? `entityBelongType:${selectedEntityApiKey}`
            : f.referObjectApiKey!;
        if (!targetMap[refKey]) targetMap[refKey] = [];
        targetMap[refKey].push(refId);
      }
    });

    const newNames: Record<string, string> = {};
    for (const [refEntity, ids] of Object.entries(targetMap)) {
      try {
        const map = await window.neoApi.getBatchNames(refEntity, ids);
        Object.assign(newNames, map);
      } catch {}
    }

    if (Object.keys(newNames).length > 0) {
      setRelatedNames((prev) => ({ ...prev, ...newNames }));
    }
  };

  const handleCopy = (val: any, key: string) => {
    navigator.clipboard.writeText(typeof val === 'object' ? JSON.stringify(val) : String(val ?? ''));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  return (
    <div className="space-y-4">
      {/* 搜索控制区 (浅色卡片) */}
      <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Search className="w-4 h-4 text-sky-600" />
            <h3 className="text-sm font-semibold text-slate-900">单条数据精准钻取与多维查询</h3>
          </div>
          <EntitySearchSelect
            entities={entities}
            value={selectedEntityApiKey}
            onChange={(newKey) => setSelectedEntityApiKey(newKey)}
            labelPrefix="所属对象:"
          />
        </div>

        {/* 智能输入框 */}
        <div className="flex space-x-2">
          <div className="relative flex-1">
            <Link2 className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
              placeholder="输入数据 ID (如 4172298...)、数据 Name、或直接粘贴销售易 CRM 页面 URL 链接..."
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 font-mono"
            />
          </div>
          <button
            onClick={handleQuery}
            disabled={loading}
            className="px-6 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white text-xs font-medium rounded-xl shadow-md shadow-sky-600/20 transition-all flex items-center space-x-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? '查询中' : '精确查询'}</span>
          </button>
        </div>

        <p className="text-[11px] text-slate-500 flex items-center space-x-1">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>支持从 URL 中自动提取对象与 ID，关联关系字段自动转为名称并支持一键侧边抽屉穿透。</span>
        </p>
      </div>

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 多候选记录列表 */}
      {candidateList.length > 0 && (
        <div className="p-4 bg-white border border-slate-200/90 rounded-2xl space-y-2 shadow-xs">
          <span className="text-xs font-semibold text-slate-800">
            匹配到多条候选记录，请选择要查看的数据：
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
            {candidateList.map((c) => {
              const name = c.name || c.accountName || c.title || c.label || `记录 #${c.id}`;
              return (
                <div
                  key={c.id}
                  onClick={() => executeQueryById(selectedEntityApiKey, c.id)}
                  className="p-3 bg-slate-50 hover:bg-sky-50 border border-slate-200 hover:border-sky-300 rounded-xl cursor-pointer transition-all space-y-1"
                >
                  <p className="text-xs font-semibold text-slate-900 truncate">{name}</p>
                  <p className="text-[11px] font-mono text-slate-500 truncate">ID: {c.id}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 查询结果详情大卡片 (浅色) */}
      {recordData && (
        <div className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="space-y-0.5">
              <div className="flex items-center space-x-2">
                <span className="text-base font-bold text-slate-900">
                  {recordData.name || recordData.accountName || recordData.title || `记录 #${recordData.id}`}
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-medium">
                  {selectedEntityApiKey}
                </span>
                <span className="text-xs font-mono text-slate-500">ID: {recordData.id}</span>
              </div>
              <p className="text-[11px] text-slate-500">
                创建时间: {recordData.createdAt ? new Date(Number(recordData.createdAt)).toLocaleString() : 'N/A'}
              </p>
            </div>

            <div className="flex items-center space-x-2.5">
              <div className="relative w-60">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  value={fieldFilterKeyword}
                  onChange={(e) => setFieldFilterKeyword(e.target.value)}
                  placeholder="搜索字段名、API Key 或值..."
                  className="w-full pl-8 pr-3 py-1 text-xs rounded-lg border border-slate-200 bg-slate-50/70 text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-sky-500"
                />
              </div>
              <button
                onClick={() => onNavigateToEdit(selectedEntityApiKey, recordData.id, recordData)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium rounded-lg shadow-sm shadow-sky-600/20 transition-all shrink-0 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>以此记录进入编辑更新</span>
              </button>
            </div>
          </div>

          {/* 字段明细网格 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(recordData)
              .filter(([key, value]) => {
                const kw = fieldFilterKeyword.trim().toLowerCase();
                if (!kw) return true;
                const meta = fields.find((f) => f.apiKey === key);
                const label = (meta?.label || key).toLowerCase();
                const valStr = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "");
                return label.includes(kw) || key.toLowerCase().includes(kw) || valStr.toLowerCase().includes(kw);
              })
              .map(([key, value]) => {
              const meta = fields.find((f) => f.apiKey === key);
              const label = meta?.label || key;
              const isRefer = !!meta?.referObjectApiKey;
              const valStr = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
              const resolvedName = isRefer && value ? relatedNames[String(value)] : null;

              return (
                <div
                  key={key}
                  className="p-3 bg-slate-50/70 rounded-xl border border-slate-200/80 hover:border-slate-300 transition-colors space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 truncate" title={label}>
                      {label}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">{key}</span>
                  </div>

                  {/* 图片字段：展示真实缩略图与大图预览 */}
                  {isImageField({ itemType: meta?.itemType, apiKey: key }, value) ? (
                    <ImageFieldComponent
                      fieldApiKey={key}
                      fieldLabel={label}
                      value={value}
                      disabled={true}
                    />
                  ) : isRefer && value ? (
                    <div className="flex items-center justify-between bg-sky-50 border border-sky-200 rounded-lg p-2">
                      <div className="min-w-0 pr-1">
                        <span className="text-xs font-semibold text-slate-900 block truncate">
                          {resolvedName || `关联对象 #${value}`}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">ID: {value}</span>
                      </div>
                      {!meta?.referObjectApiKey?.startsWith('entityBelongType') && key !== 'entityType' && (
                        <button
                          onClick={() => {
                            setDrawerEntity(meta!.referObjectApiKey!);
                            setDrawerId(value);
                            setDrawerOpen(true);
                          }}
                          className="px-2 py-1 bg-white hover:bg-sky-600 text-sky-700 hover:text-white rounded text-[10px] font-medium border border-sky-200 flex items-center space-x-1 flex-shrink-0 transition-colors shadow-2xs cursor-pointer"
                          title="穿透查看该关联对象的数据详情"
                        >
                          <span>钻取</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-slate-800 truncate select-all">
                        {valStr || <span className="text-slate-400">null</span>}
                      </span>
                      <button
                        onClick={() => handleCopy(value, key)}
                        className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                        title="复制"
                      >
                        {copiedKey === key ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 关联对象数据穿透抽屉 */}
      <RecordDetailDrawer
        isOpen={drawerOpen}
        entityApiKey={drawerEntity}
        recordId={drawerId}
        onClose={() => setDrawerOpen(false)}
        onDrillDown={(nextEntity, nextId) => {
          setDrawerEntity(nextEntity);
          setDrawerId(nextId);
        }}
      />
    </div>
  );
};
