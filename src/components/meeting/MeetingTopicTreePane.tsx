import React, { useState } from 'react';
import {
  GitMerge,
  ChevronRight,
  ChevronDown,
  Layers,
  Target,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  Clock,
  Sparkles,
  Maximize2,
  Minimize2,
  Play,
  Table as TableIcon,
  Network,
  Share2,
} from 'lucide-react';
import { TopicTreeNode } from '../../../shared/meetingTypes';

interface MeetingTopicTreePaneProps {
  tree?: TopicTreeNode;
  onSeekTime?: (timeSeconds: number) => void;
  onTriggerSummarize: () => void;
  isSummarizing?: boolean;
}

export const MeetingTopicTreePane: React.FC<MeetingTopicTreePaneProps> = ({
  tree,
  onSeekTime,
  onTriggerSummarize,
  isSummarizing = false,
}) => {
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'mindmap' | 'table'>('mindmap');

  if (!tree) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-inner">
          <GitMerge className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-slate-800">尚未构建议题层级树与思维导图</h4>
          <p className="text-xs text-slate-400 max-w-xs">
            大模型将会议议程从「目标 → 痛点 → 方案对决 → 决议 → 待办」自动解构为层级决策树。
          </p>
        </div>
        <button
          onClick={onTriggerSummarize}
          disabled={isSummarizing}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center space-x-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" />
          <span>{isSummarizing ? '思维导图构建中...' : '生成议题层级树'}</span>
        </button>
      </div>
    );
  }

  const toggleCollapse = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCollapsedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => setCollapsedNodeIds(new Set());

  const parseTimeFromRange = (range?: string): number => {
    if (!range) return 0;
    const match = range.match(/(\d+):(\d+)/);
    if (match) {
      return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    }
    return 0;
  };

  // 节点语义类型胶囊
  const getNodeTypeBadge = (type: string) => {
    switch (type) {
      case 'goal':
        return { label: '🎯 会议目标', bg: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
      case 'topic':
        return { label: '📌 核心议题', bg: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'problem':
        return { label: '⚠️ 痛点症结', bg: 'bg-rose-100 text-rose-800 border-rose-200' };
      case 'solution':
        return { label: '💡 方案博弈', bg: 'bg-amber-100 text-amber-800 border-amber-200' };
      case 'decision':
        return { label: '✅ 敲定决议', bg: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
      case 'action':
        return { label: '📋 落实待办', bg: 'bg-purple-100 text-purple-800 border-purple-200' };
      default:
        return { label: '议程节点', bg: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  };

  // 递归思维导图节点渲染
  const renderMindMapNode = (node: TopicTreeNode, depth = 0) => {
    const isCollapsed = collapsedNodeIds.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const badge = getNodeTypeBadge(node.type);

    return (
      <div key={node.id} className="relative pl-6 my-2">
        {/* 树枝连线 */}
        {depth > 0 && (
          <div className="absolute left-0 top-4 w-5 h-px bg-slate-300" />
        )}
        {depth > 0 && (
          <div className="absolute left-0 top-0 bottom-0 w-px bg-slate-200" />
        )}

        <div
          onClick={() => {
            if (node.timeRange) {
              onSeekTime?.(parseTimeFromRange(node.timeRange));
            }
          }}
          className={`group p-3 rounded-2xl border transition-all cursor-pointer inline-block max-w-xl ${
            depth === 0
              ? 'bg-gradient-to-r from-indigo-50 via-blue-50 to-white border-indigo-200 shadow-sm'
              : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-2xs'
          }`}
        >
          <div className="flex items-center space-x-2">
            {hasChildren && (
              <button
                onClick={(e) => toggleCollapse(node.id, e)}
                className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}

            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${badge.bg}`}>
              {badge.label}
            </span>

            <span className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
              {node.title}
            </span>

            {node.timeRange && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 border border-slate-200 flex items-center space-x-1">
                <Play className="w-2 h-2 fill-current text-blue-500" />
                <span>{node.timeRange}</span>
              </span>
            )}

            {node.speaker && (
              <span className="text-[10px] text-slate-400">@{node.speaker}</span>
            )}
          </div>

          {node.description && (
            <p className="text-[11px] text-slate-600 pl-6 pt-1.5 leading-relaxed font-normal">
              {node.description}
            </p>
          )}
        </div>

        {/* 子节点展开 */}
        {!isCollapsed && hasChildren && (
          <div className="space-y-1">
            {node.children!.map((child) => renderMindMapNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // 递归扁平化获取树表行
  const flattenTree = (node: TopicTreeNode, depth = 0, rows: Array<{ node: TopicTreeNode; depth: number }> = []) => {
    rows.push({ node, depth });
    if (!collapsedNodeIds.has(node.id) && node.children) {
      node.children.forEach((c) => flattenTree(c, depth + 1, rows));
    }
    return rows;
  };

  const tableRows = flattenTree(tree);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center space-x-2">
          <GitMerge className="w-4 h-4 text-indigo-600" />
          <span className="text-xs font-bold text-slate-800">议题层级决策树 & 思维导图</span>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs">
            <button
              onClick={() => setViewMode('mindmap')}
              className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center space-x-1 cursor-pointer ${
                viewMode === 'mindmap' ? 'bg-white text-indigo-600 shadow-xs font-bold' : 'text-slate-600'
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>思维导图</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center space-x-1 cursor-pointer ${
                viewMode === 'table' ? 'bg-white text-indigo-600 shadow-xs font-bold' : 'text-slate-600'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>层级树表</span>
            </button>
          </div>

          <button
            onClick={expandAll}
            className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
          >
            展开全部
          </button>
        </div>
      </div>

      {/* 视图展现 */}
      {viewMode === 'mindmap' ? (
        <div className="bg-slate-50/70 p-5 rounded-2xl border border-slate-200/80 overflow-x-auto shadow-inner">
          {renderMindMapNode(tree, 0)}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                <th className="py-2.5 px-4 w-72">议题层级 / 节点主题</th>
                <th className="py-2.5 px-4 w-28">类型</th>
                <th className="py-2.5 px-4">论证要点与决策裁决</th>
                <th className="py-2.5 px-4 w-24">提议/负责人</th>
                <th className="py-2.5 px-4 w-24 text-right">时间戳</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tableRows.map(({ node, depth }) => {
                const badge = getNodeTypeBadge(node.type);
                const hasChildren = node.children && node.children.length > 0;
                const isCollapsed = collapsedNodeIds.has(node.id);
                return (
                  <tr
                    key={node.id}
                    onClick={() => {
                      if (node.timeRange) {
                        onSeekTime?.(parseTimeFromRange(node.timeRange));
                      }
                    }}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-4">
                      <div
                        className="flex items-center space-x-1.5"
                        style={{ paddingLeft: `${depth * 18}px` }}
                      >
                        {hasChildren ? (
                          <button
                            onClick={(e) => toggleCollapse(node.id, e)}
                            className="p-0.5 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
                          >
                            {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        ) : (
                          <span className="w-3 inline-block" />
                        )}
                        <span className="font-semibold text-slate-900">{node.title}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${badge.bg}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 leading-relaxed">
                      {node.description || '-'}
                    </td>
                    <td className="py-2.5 px-4 text-slate-500">
                      {node.speaker || '-'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-[11px] text-blue-600">
                      {node.timeRange || '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
