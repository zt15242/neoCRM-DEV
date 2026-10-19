import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AiToolCallRecord } from '../../../shared/types';
import { ToolCallCard } from './ToolCallCard';
import { Wrench, ChevronDown, ChevronRight, Loader2, CheckCircle2 } from 'lucide-react';

interface ToolCallsGroupProps {
  toolCalls: AiToolCallRecord[];
  isStreaming?: boolean;
  hasContent?: boolean;
}

function getToolCategoryLabel(name: string): string {
  switch (name) {
    case 'bash': return '终端命令';
    case 'read': return '文件读取';
    case 'write': return '文件写入';
    case 'edit':
    case 'str_replace_editor': return '代码编辑';
    case 'glob':
    case 'grep': return '代码检索';
    case 'todo_write': return '任务清单';
    case 'get_goal':
    case 'create_goal':
    case 'update_goal': return '工程目标';
    case 'web_search':
    case 'web_fetch': return '联网检索';
    case 'execute_sql_query': return 'SQL查询';
    case 'get_entity_fields':
    case 'list_entities': return '实体字典';
    case 'get_tenant_info': return '租户感知';
    case 'generate_print_template':
    case 'list_print_objects':
    case 'list_print_templates':
    case 'get_print_template_fields': return '打印模板';
    case 'list_flows':
    case 'get_flow_detail':
    case 'inspect_autoflow':
    case 'list_autoflows': return '流程资产';
    case 'get_approval_resources': return '审批资源';
    case 'generate_nex_extension':
    case 'deploy_nex_extension':
    case 'list_nex_extensions': return 'Nex扩展';
    default: return name.slice(0, 10);
  }
}

export const ToolCallsGroup: React.FC<ToolCallsGroupProps> = ({
  toolCalls,
  isStreaming = false,
  hasContent = false,
}) => {
  if (!toolCalls || toolCalls.length === 0) return null;

  const isRunning = Boolean(toolCalls.some((t) => t.status === 'running'));
  const runningTool = toolCalls.find((t) => t.status === 'running');

  // 用户是否手动点击切换过
  const userInteractedRef = useRef(false);

  // 默认折叠策略：
  // 只要工具调用已完成或 AI 开始输出正文内容，默认自动隐藏折叠，彻底解决“太占地方”的问题；
  // 仅在正在运行中且尚未吐出正文时临时展开，便于实时感知进度。
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (toolCalls.length >= 2 && (hasContent || !isStreaming)) {
      return false;
    }
    return true;
  });

  // 当任务自然完成或正文开始吐字时，若用户没有手动点开，自动平滑收起
  useEffect(() => {
    if (!userInteractedRef.current) {
      if (toolCalls.length >= 2 && (hasContent || !isStreaming)) {
        setExpanded(false);
      }
    }
  }, [hasContent, isStreaming, toolCalls.length]);

  // 统计工具类型与数量分布
  const toolCategoryBadges = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tc of toolCalls) {
      const cat = getToolCategoryLabel(tc.name);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return Object.entries(counts).map(([cat, count]) => `${cat} ×${count}`);
  }, [toolCalls]);

  // 计算总耗时
  const totalDurationMs = useMemo(() => {
    return toolCalls.reduce((acc, t) => acc + (t.durationMs || 0), 0);
  }, [toolCalls]);

  const toggleExpand = () => {
    userInteractedRef.current = true;
    setExpanded((prev) => !prev);
  };

  return (
    <div className="my-2 rounded-xl border border-slate-200/90 bg-slate-50/60 overflow-hidden transition-all shadow-2xs">
      <button
        type="button"
        onClick={toggleExpand}
        className="w-full flex items-center justify-between px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100/70 transition-colors cursor-pointer select-none"
      >
        <div className="flex items-center space-x-2 truncate min-w-0 pr-2">
          <div
            className={`p-1 rounded-md shrink-0 ${
              isRunning ? 'bg-sky-600 text-white animate-pulse' : 'bg-slate-200 text-slate-700'
            }`}
          >
            {isRunning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Wrench className="w-3.5 h-3.5" />
            )}
          </div>

          <span className="font-semibold text-slate-800 shrink-0">
            {isRunning
              ? `正在执行工具 (${runningTool ? getToolCategoryLabel(runningTool.name) : '推进中'})...`
              : `已调用 ${toolCalls.length} 项工具`}
          </span>

          {/* 紧凑分类徽章 (折叠态下直观可见调用了哪些工具) */}
          {!expanded && toolCategoryBadges.length > 0 && (
            <div className="hidden sm:flex items-center space-x-1 truncate overflow-hidden">
              {toolCategoryBadges.slice(0, 4).map((badge, idx) => (
                <span
                  key={idx}
                  className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white border border-slate-200 text-slate-600 shrink-0"
                >
                  {badge}
                </span>
              ))}
              {toolCategoryBadges.length > 4 && (
                <span className="text-[10px] text-slate-400">+{toolCategoryBadges.length - 4}</span>
              )}
            </div>
          )}

          {/* 总耗时 */}
          {totalDurationMs > 0 && (
            <span className="text-[11px] text-slate-400 font-mono shrink-0">
              ({totalDurationMs > 1000 ? `${(totalDurationMs / 1000).toFixed(1)}s` : `${totalDurationMs}ms`})
            </span>
          )}
        </div>

        <div className="flex items-center space-x-1.5 text-slate-500 shrink-0">
          <span className="text-[11px] font-medium">{expanded ? '收起工具' : '展开详情'}</span>
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </div>
      </button>

      {/* 展开时展示具体每一项工具卡片 */}
      {expanded && (
        <div className="p-2 space-y-1.5 border-t border-slate-200/70 bg-white/60 animate-in fade-in duration-100">
          {toolCalls.map((tc) => (
            <ToolCallCard key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}
    </div>
  );
};
