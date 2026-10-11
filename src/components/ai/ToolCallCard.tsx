import React, { useState } from 'react';
import { AiToolCallRecord } from '../../../shared/types';
import { 
  Wrench, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  ChevronDown, 
  ChevronRight,
  Database,
  Box,
  FileCode,
  ShieldCheck
} from 'lucide-react';

interface ToolCallCardProps {
  toolCall: AiToolCallRecord;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({ toolCall }) => {
  const [expanded, setExpanded] = useState(false);

  const getToolMeta = (name: string) => {
    switch (name) {
      case 'get_tenant_info':
        return {
          title: '读取租户环境信息',
          icon: ShieldCheck,
          badge: '租户上下文',
          color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
        };
      case 'list_entities':
        return {
          title: '检索实体对象字典',
          icon: Box,
          badge: '元数据字典',
          color: 'text-sky-600 bg-sky-50 border-sky-200',
        };
      case 'get_entity_fields':
        return {
          title: `读取实体字段定义 (${toolCall.arguments?.entityApiKey || ''})`,
          icon: FileCode,
          badge: '字段结构',
          color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
        };
      case 'execute_sql_query':
        return {
          title: '执行销售易只读 SQL',
          icon: Database,
          badge: '数据查询',
          color: 'text-amber-600 bg-amber-50 border-amber-200',
        };
      default:
        return {
          title: `调用本地工具: ${name}`,
          icon: Wrench,
          badge: 'Agent 工具',
          color: 'text-slate-600 bg-slate-50 border-slate-200',
        };
    }
  };

  const meta = getToolMeta(toolCall.name);
  const Icon = meta.icon;

  return (
    <div className="my-2 rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
      <div 
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between px-3 py-2 text-xs cursor-pointer hover:bg-slate-50/80 transition-colors"
      >
        <div className="flex items-center space-x-2">
          <div className={`p-1 rounded-md border ${meta.color}`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-medium text-slate-800">{meta.title}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 font-mono">
                {meta.badge}
              </span>
            </div>
            {toolCall.resultSummary && (
              <p className="text-[11px] text-slate-500 truncate max-w-md mt-0.5">
                {toolCall.resultSummary}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {toolCall.status === 'running' && (
            <div className="flex items-center space-x-1 text-sky-600 font-medium text-[11px]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>执行中...</span>
            </div>
          )}
          {toolCall.status === 'success' && (
            <div className="flex items-center space-x-1 text-emerald-600 font-medium text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>完成{toolCall.durationMs ? ` (${toolCall.durationMs}ms)` : ''}</span>
            </div>
          )}
          {toolCall.status === 'error' && (
            <div className="flex items-center space-x-1 text-rose-600 font-medium text-[11px]">
              <XCircle className="w-3.5 h-3.5" />
              <span>失败</span>
            </div>
          )}
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
        </div>
      </div>

      {expanded && (
        <div className="p-3 bg-slate-50 border-t border-slate-100 space-y-2 text-[11px] font-mono">
          <div>
            <div className="text-slate-400 mb-1 font-semibold uppercase text-[10px]">入参 (Parameters)</div>
            <pre className="p-2 rounded bg-slate-900 text-slate-200 overflow-x-auto max-h-40">
              {JSON.stringify(toolCall.arguments, null, 2)}
            </pre>
          </div>
          {toolCall.resultData && (
            <div>
              <div className="text-slate-400 mb-1 font-semibold uppercase text-[10px]">返回数据摘要 (Result)</div>
              <pre className="p-2 rounded bg-slate-900 text-slate-200 overflow-x-auto max-h-48">
                {JSON.stringify(toolCall.resultData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
