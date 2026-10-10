import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Search, 
  RefreshCw, 
  FileDown, 
  Plus, 
  Database, 
  ChevronRight,
  FileSpreadsheet,
  Link2
} from 'lucide-react';
import { EntityMetadata, FieldMetadata } from '../../shared/types';
import { ITEM_TYPE_MAP } from '../../shared/constants';
import { CreateEntityModal } from './CreateEntityModal';
import { CreateFieldModal } from './CreateFieldModal';
import { BatchFieldImportModal } from './BatchFieldImportModal';

interface MetadataManagerProps {
  onNavigateToData: (entityApiKey: string) => void;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const MetadataManager: React.FC<MetadataManagerProps> = ({
  onNavigateToData,
  showToast,
}) => {
  const [entities, setEntities] = useState<EntityMetadata[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<EntityMetadata | null>(null);

  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'standard' | 'custom'>('all');

  const [fields, setFields] = useState<FieldMetadata[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [fieldSearch, setFieldSearch] = useState('');

  const [isCreateEntityOpen, setIsCreateEntityOpen] = useState(false);
  const [isCreateFieldOpen, setIsCreateFieldOpen] = useState(false);
  const [isBatchFieldImportOpen, setIsBatchFieldImportOpen] = useState(false);

  const loadEntities = async () => {
    setLoadingEntities(true);
    try {
      const list = await window.neoApi.getEntities();
      setEntities(list);
      if (list.length > 0 && !selectedEntity) {
        setSelectedEntity(list[0]);
      }
    } catch (e: any) {
      showToast('error', `加载实体列表失败: ${e.message}`);
    } finally {
      setLoadingEntities(false);
    }
  };

  const loadFields = async (apiKey: string) => {
    setLoadingFields(true);
    try {
      const fieldList = await window.neoApi.getFields(apiKey);
      setFields(fieldList);
    } catch (e: any) {
      showToast('error', `加载字段列表失败: ${e.message}`);
      setFields([]);
    } finally {
      setLoadingFields(false);
    }
  };

  useEffect(() => {
    loadEntities();
  }, []);

  useEffect(() => {
    if (selectedEntity) {
      loadFields(selectedEntity.apiKey);
    }
  }, [selectedEntity?.apiKey]);

  const handleExportDictionary = async () => {
    try {
      const res = await window.neoApi.exportDictionary();
      if (res.success) {
        showToast('success', res.message);
      } else {
        showToast('error', res.message);
      }
    } catch (e: any) {
      showToast('error', `导出字典异常: ${e.message}`);
    }
  };

  const filteredEntities = entities.filter((e) => {
    const matchesKeyword =
      e.label.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      e.apiKey.toLowerCase().includes(searchKeyword.toLowerCase());
    if (filterType === 'standard') return matchesKeyword && e.isStandard;
    if (filterType === 'custom') return matchesKeyword && !e.isStandard;
    return matchesKeyword;
  });

  const filteredFields = fields.filter((f) => {
    return (
      f.label.toLowerCase().includes(fieldSearch.toLowerCase()) ||
      f.apiKey.toLowerCase().includes(fieldSearch.toLowerCase()) ||
      f.typeName.toLowerCase().includes(fieldSearch.toLowerCase())
    );
  });

  return (
    <div className="flex flex-col h-[calc(100vh-7.5rem)] bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
      {/* 顶部操作工具栏 */}
      <div className="h-13 px-5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <Box className="w-5 h-5 text-sky-600" />
            <h2 className="text-sm font-semibold text-slate-900">对象与元数据中心 (Metadata Studio)</h2>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            已同步 {entities.length} 个对象
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={loadEntities}
            disabled={loadingEntities}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg transition-colors border border-slate-200 shadow-2xs"
            title="重新从 API 拉取全量对象"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingEntities ? 'animate-spin text-sky-600' : ''}`} />
            <span>同步对象字典</span>
          </button>

          <button
            onClick={handleExportDictionary}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg transition-colors border border-slate-200 shadow-2xs"
            title="导出 AllxObjects.md 到当前工程目录"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>导出字典文档</span>
          </button>

          <button
            onClick={() => setIsCreateEntityOpen(true)}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium rounded-lg shadow-sm shadow-sky-600/20 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新建自定义对象</span>
          </button>
        </div>
      </div>

      {/* 两栏布局 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧对象导航栏 (宽度微调至 268px，节省空间给右侧表格) */}
        <div className="w-[268px] border-r border-slate-200 flex flex-col bg-slate-50/50 flex-shrink-0">
          <div className="p-3 border-b border-slate-200 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="搜索名称或 API Key..."
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex p-0.5 bg-slate-200/70 rounded-lg text-xs">
              <button
                onClick={() => setFilterType('all')}
                className={`flex-1 py-1 text-center rounded-md transition-colors ${
                  filterType === 'all' ? 'bg-white text-sky-700 font-semibold shadow-2xs' : 'text-slate-600'
                }`}
              >
                全部 ({entities.length})
              </button>
              <button
                onClick={() => setFilterType('standard')}
                className={`flex-1 py-1 text-center rounded-md transition-colors ${
                  filterType === 'standard' ? 'bg-white text-sky-700 font-semibold shadow-2xs' : 'text-slate-600'
                }`}
              >
                标准 ({entities.filter((e) => e.isStandard).length})
              </button>
              <button
                onClick={() => setFilterType('custom')}
                className={`flex-1 py-1 text-center rounded-md transition-colors ${
                  filterType === 'custom' ? 'bg-white text-sky-700 font-semibold shadow-2xs' : 'text-slate-600'
                }`}
              >
                自定义 ({entities.filter((e) => !e.isStandard).length})
              </button>
            </div>
          </div>

          {/* 实体列表项 */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredEntities.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">未找到匹配对象</div>
            ) : (
              filteredEntities.map((e) => {
                const isSelected = selectedEntity?.apiKey === e.apiKey;
                return (
                  <div
                    key={e.apiKey}
                    onClick={() => setSelectedEntity(e)}
                    className={`px-3 py-2.5 cursor-pointer transition-colors text-left select-none flex items-center justify-between ${
                      isSelected
                        ? 'bg-sky-50/80 border-l-2 border-sky-600 text-sky-900 font-medium'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="space-y-0.5 min-w-0 pr-1.5 flex-1">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-semibold text-xs truncate max-w-[150px]">{e.label}</span>
                        {e.isStandard ? (
                          <span className="text-[9px] px-1 rounded bg-slate-100 text-slate-500 font-mono">标准</span>
                        ) : (
                          <span className="text-[9px] px-1 rounded bg-amber-50 text-amber-700 border border-amber-200 font-mono">自定义</span>
                        )}
                      </div>
                      <p className="text-[11px] font-mono text-slate-400 truncate">{e.apiKey}</p>
                    </div>
                    <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 text-slate-400 ${isSelected ? 'text-sky-600' : ''}`} />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 右侧：字段明细与表格 */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white min-w-0">
          {selectedEntity ? (
            <>
              {/* 实体头部概览 */}
              <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/40 flex items-center justify-between flex-shrink-0 gap-3">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                    <h3 className="text-base font-bold text-slate-900">{selectedEntity.label}</h3>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-medium">
                      {selectedEntity.apiKey}
                    </span>
                    {selectedEntity.detail && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-medium">
                        明细对象
                      </span>
                    )}
                    {selectedEntity.enableScriptExecutor && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                        触发器
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate" title={selectedEntity.description}>
                    {selectedEntity.description || '暂无业务描述'}
                  </p>
                </div>

                {/* 快捷操作三按键 */}
                <div className="flex items-center space-x-2 flex-shrink-0">
                  <button
                    onClick={() => onNavigateToData(selectedEntity.apiKey)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-sky-700 border border-sky-300 text-xs rounded-lg transition-colors font-medium shadow-2xs"
                  >
                    <Database className="w-3.5 h-3.5 text-sky-600" />
                    <span>查看数据 (DML)</span>
                  </button>

                  <button
                    onClick={() => setIsBatchFieldImportOpen(true)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-medium rounded-lg transition-all shadow-2xs"
                    title="上传 Excel 文件批量创建字段"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Excel 批量创建</span>
                  </button>

                  <button
                    onClick={() => setIsCreateFieldOpen(true)}
                    className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium rounded-lg shadow-sm shadow-sky-600/20 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新增字段</span>
                  </button>
                </div>
              </div>

              {/* 字段检索与统计栏 */}
              <div className="px-5 py-2.5 border-b border-slate-200 bg-slate-50/20 flex items-center justify-between flex-shrink-0">
                <span className="text-xs font-semibold text-slate-700">
                  字段列表 ({fields.length} 个字段)
                </span>
                <div className="w-72 relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    value={fieldSearch}
                    onChange={(e) => setFieldSearch(e.target.value)}
                    placeholder="过滤字段名称、API Key、类型..."
                    className="w-full pl-8 pr-3 py-1 bg-white border border-slate-300 rounded-md text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 shadow-2xs"
                  />
                </div>
              </div>

              {/* 优化后的字段数据表格 (彻底根治中文字折行、撑满自适应) */}
              <div className="flex-1 overflow-auto">
                {loadingFields ? (
                  <div className="p-16 text-center text-xs text-slate-500 flex items-center justify-center space-x-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-sky-600" />
                    <span>正在拉取字段元数据...</span>
                  </div>
                ) : filteredFields.length === 0 ? (
                  <div className="p-16 text-center text-xs text-slate-400">暂无字段数据</div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50/95 sticky top-0 border-b border-slate-200 text-slate-600 font-semibold z-10 shadow-2xs">
                      <tr>
                        <th className="py-2.5 px-4 whitespace-nowrap min-w-[130px]">字段名称</th>
                        <th className="py-2.5 px-4 whitespace-nowrap min-w-[150px]">API Key</th>
                        <th className="py-2.5 px-4 whitespace-nowrap min-w-[110px]">字段类型</th>
                        <th className="py-2.5 px-4 whitespace-nowrap min-w-[65px] text-center">属性</th>
                        <th className="py-2.5 px-4 whitespace-nowrap min-w-[130px]">关联引用</th>
                        <th className="py-2.5 px-4 whitespace-nowrap min-w-[200px]">选项值预览</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredFields.map((f) => (
                        <tr key={f.apiKey} className="hover:bg-sky-50/30 transition-colors">
                          {/* 字段名称 */}
                          <td className="py-2.5 px-4 font-semibold text-slate-900 whitespace-nowrap">
                            {f.label}
                          </td>

                          {/* API Key */}
                          <td className="py-2.5 px-4 font-mono text-sky-700 select-all font-medium whitespace-nowrap">
                            {f.apiKey}
                          </td>

                          {/* 字段类型 (水平单行胶囊展示，绝不折行) */}
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[11px] border border-slate-200">
                              {ITEM_TYPE_MAP[f.itemType] || f.typeName}
                            </span>
                          </td>

                          {/* 属性 (居中单行) */}
                          <td className="py-2.5 px-4 text-center whitespace-nowrap">
                            {f.custom ? (
                              <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-medium">
                                自定义
                              </span>
                            ) : (
                              <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px]">
                                标准
                              </span>
                            )}
                          </td>

                          {/* 关联引用 */}
                          <td className="py-2.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                            {f.referObjectApiKey ? (
                              <span className="inline-flex items-center space-x-1 text-sky-700 bg-sky-50/60 px-1.5 py-0.5 rounded border border-sky-200/80">
                                <Link2 className="w-2.5 h-2.5 text-sky-600" />
                                <span>{f.referObjectApiKey}</span>
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>

                          {/* 选项值预览 */}
                          <td className="py-2.5 px-4 text-slate-600 text-[11px]">
                            {f.pickOption && f.pickOption.length > 0 ? (
                              <div className="flex items-center gap-1.5 flex-wrap" title={f.pickOption.map((o) => `${o.optionLabel}(${o.optionCode || o.optionApiKey})`).join(', ')}>
                                {f.pickOption.slice(0, 3).map((o, idx) => (
                                  <span
                                    key={idx}
                                    className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px] whitespace-nowrap"
                                  >
                                    {o.optionLabel} ({o.optionCode || o.optionApiKey})
                                  </span>
                                ))}
                                {f.pickOption.length > 3 && (
                                  <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1 py-0.5 rounded whitespace-nowrap">
                                    +{f.pickOption.length - 3}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <div className="p-16 text-center text-xs text-slate-400">请在左侧选择实体</div>
          )}
        </div>
      </div>

      {/* 弹窗组件 */}
      <CreateEntityModal
        isOpen={isCreateEntityOpen}
        onClose={() => setIsCreateEntityOpen(false)}
        onSubmit={async (payload) => {
          const res = await window.neoApi.createEntity(payload);
          if (res.success) {
            showToast('success', `实体 "${payload.label}" 创建成功！`);
            await loadEntities();
          }
          return res;
        }}
      />

      <CreateFieldModal
        isOpen={isCreateFieldOpen}
        entity={selectedEntity}
        onClose={() => setIsCreateFieldOpen(false)}
        onSubmit={async (entityApiKey, payload) => {
          const res = await window.neoApi.createField(entityApiKey, payload);
          if (res.success) {
            showToast('success', `字段 "${payload.label}" 创建成功！`);
            if (selectedEntity) {
              await loadFields(selectedEntity.apiKey);
            }
          }
          return res;
        }}
      />

      <BatchFieldImportModal
        isOpen={isBatchFieldImportOpen}
        entity={selectedEntity}
        existingFields={fields}
        onClose={() => setIsBatchFieldImportOpen(false)}
        onRefreshFields={async () => {
          if (selectedEntity) {
            await loadFields(selectedEntity.apiKey);
          }
        }}
        showToast={showToast}
      />
    </div>
  );
};
