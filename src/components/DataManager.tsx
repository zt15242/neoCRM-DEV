import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Search, 
  Edit3, 
  FileDown,
  Terminal
} from 'lucide-react';
import { EntityMetadata } from '../../shared/types';
import { DataViewer } from './data/DataViewer';
import { DataEditor } from './data/DataEditor';
import { DataExporter } from './data/DataExporter';
import { SqlQueryExplorer } from './data/SqlQueryExplorer';

export type DataSubTab = 'viewer' | 'editor' | 'sql' | 'exporter';

interface DataManagerProps {
  initialEntityApiKey?: string;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const DataManager: React.FC<DataManagerProps> = ({
  initialEntityApiKey,
  showToast,
}) => {
  const [subTab, setSubTab] = useState<DataSubTab>('viewer');
  const [entities, setEntities] = useState<EntityMetadata[]>([]);
  const [activeEntityApiKey, setActiveEntityApiKey] = useState<string>(initialEntityApiKey || 'account');

  const [editRecordId, setEditRecordId] = useState<string | number | undefined>();
  const [editRecordData, setEditRecordData] = useState<Record<string, any> | null>(null);
  const [viewRecordId, setViewRecordId] = useState<string | number | undefined>();

  useEffect(() => {
    window.neoApi?.getEntities?.().then((list) => {
      setEntities(list);
      if (initialEntityApiKey) {
        setActiveEntityApiKey(initialEntityApiKey);
      } else if (list.length > 0) {
        const def = list.find((e) => e.apiKey === 'account') || list[0];
        setActiveEntityApiKey(def.apiKey);
      }
    }).catch(() => {});
  }, [initialEntityApiKey]);

  const handleNavigateToEdit = (entityKey: string, recordId: string | number, recordData: Record<string, any>) => {
    setActiveEntityApiKey(entityKey);
    setEditRecordId(recordId);
    setEditRecordData(recordData);
    setSubTab('editor');
  };

  const handleNavigateToView = (entityKey: string, recordId: string | number) => {
    setActiveEntityApiKey(entityKey);
    setViewRecordId(recordId);
    setSubTab('viewer');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8.5rem)] bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {/* 顶部子导航栏 (白色风格) */}
      <div className="h-14 px-5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <Database className="w-5 h-5 text-sky-600" />
            <h2 className="text-sm font-semibold text-slate-900">数据中心与全功能工作台</h2>
          </div>
          <span className="text-[11px] text-slate-500 hidden lg:inline">
            精准钻取 • 关联穿透 • Lookup 录入 • SQL 检索 • 批量导出
          </span>
        </div>

        {/* 4 大核心功能子模块切换 */}
        <div className="flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs">
          <button
            onClick={() => setSubTab('viewer')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all ${
              subTab === 'viewer'
                ? 'bg-white text-sky-600 font-semibold shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>数据精准查询与关联穿透</span>
          </button>

          <button
            onClick={() => {
              setEditRecordId(undefined);
              setEditRecordData(null);
              setSubTab('editor');
            }}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all ${
              subTab === 'editor'
                ? 'bg-white text-sky-600 font-semibold shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>数据插入 / 更新 (Lookup)</span>
          </button>

          <button
            onClick={() => setSubTab('sql')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all ${
              subTab === 'sql'
                ? 'bg-white text-sky-600 font-semibold shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>SQL 查询</span>
          </button>

          <button
            onClick={() => setSubTab('exporter')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all ${
              subTab === 'exporter'
                ? 'bg-white text-sky-600 font-semibold shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>数据批量导出</span>
          </button>
        </div>
      </div>

      {/* 主体视窗区域 */}
      <div className="flex-1 overflow-y-auto p-5 bg-slate-50/40">
        {subTab === 'viewer' && (
          <DataViewer
            entities={entities}
            defaultEntityApiKey={activeEntityApiKey}
            initialRecordId={viewRecordId}
            onNavigateToEdit={handleNavigateToEdit}
            showToast={showToast}
          />
        )}

        {subTab === 'editor' && (
          <DataEditor
            entities={entities}
            initialEntityApiKey={activeEntityApiKey}
            initialRecordId={editRecordId}
            initialRecordData={editRecordData}
            onNavigateToView={handleNavigateToView}
            showToast={showToast}
          />
        )}

        {subTab === 'sql' && (
          <SqlQueryExplorer
            entities={entities}
            defaultEntityApiKey={activeEntityApiKey}
            onNavigateToView={handleNavigateToView}
            onNavigateToEdit={handleNavigateToEdit}
            showToast={showToast}
          />
        )}

        {subTab === 'exporter' && (
          <DataExporter
            entities={entities}
            defaultEntityApiKey={activeEntityApiKey}
            showToast={showToast}
          />
        )}
      </div>
    </div>
  );
};
