import React, { useState } from 'react';
import { Check, Copy, Play, Workflow } from 'lucide-react';
import { WorkflowDeployPlan } from '../../../shared/types';
import { extractWorkflowPlanFromText } from './workflowPlanHelper';
import { WorkflowPlanCard } from "./WorkflowPlanCard";
import { ApprovalPlanCard } from "./ApprovalPlanCard";
import { extractApprovalPlanFromText } from "./approvalPlanHelper";
import { ApprovalDeployPlan } from "../../../shared/types";

interface MarkdownRendererProps {
  content: string;
  onExecuteSql?: (sql: string) => void;
  onOpenDeployWorkflow?: (plan: WorkflowDeployPlan) => void;
  onOpenDeployApproval?: (plan: ApprovalDeployPlan) => void;
  suppressDeploymentCards?: boolean;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, onExecuteSql, onOpenDeployWorkflow, onOpenDeployApproval, suppressDeploymentCards }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!content) return null;

  // 将文本分割为代码块与普通文本块
  const parts: Array<{ type: 'text' | 'code'; content: string; lang?: string }> = [];
  const codeBlockRegex = /```([a-zA-Z0-9_:.-]*)[ \t]*\r?\n([\s\S]*?)(?:```|$)/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: content.slice(lastIndex, match.index),
      });
    }
    parts.push({
      type: 'code',
      lang: match[1] || 'plaintext',
      content: match[2],
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({
      type: 'text',
      content: content.slice(lastIndex),
    });
  }

  // 预处理: 若存在机密工作流方案代码块，清除前驱文本中的引导说明文字
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (
      p.type === "code" &&
      (p.lang?.toLowerCase().includes("workflow") ||
        (p.content.includes('"flow"') && p.content.includes('"nodes"')))
    ) {
      if (i > 0 && parts[i - 1].type === "text") {
        parts[i - 1].content = parts[i - 1].content
          .replace(/(?:\r?\n---\s*)?\r?\n#{1,6}\s*[^\n]*(?:结构化代码配置|代码配置交付|Workflow\s*Plan|Approval\s*Plan|部署契约)[\s\S]*$/i, "")
          .replace(/\r?\n[^\n]*(?:捕获以下\s*JSON|JSON\s*契约|json:workflow-plan|json:approval-plan|json:decision-request|以下\s*JSON)[^\n]*\s*$/i, "")
          .trimEnd();
      }
    }
  }

  return (
    <div className="space-y-3 text-slate-800 text-[13px] leading-relaxed break-words">
      {parts.map((part, index) => {
        if (part.type === 'code') {
          const codeId = `code_${index}`;
          const isCopied = copiedId === codeId;
          if (
            part.lang?.toLowerCase() === "json:decision-request" ||
            part.lang?.toLowerCase() === "decision-request"
          ) {
            return null;
          }

          if (
            part.lang?.toLowerCase() === 'json:schema-plan' ||
            part.lang?.toLowerCase() === 'schema-plan' ||
            (part.lang?.toLowerCase() === 'json' && part.content.includes('"entity"') && part.content.includes('"fields"'))
          ) {
            return (
              <div key={index} className="my-2 px-3.5 py-2 rounded-xl bg-indigo-50/70 border border-indigo-200/80 text-xs text-indigo-700 flex items-center justify-between">
                <span>📦 已生成结构化数据模型定义 (Schema Plan)，请点击下方卡片一键部署至租户</span>
                <span className="text-[10px] font-mono bg-white px-2 py-0.5 rounded border border-indigo-200">JSON Schema Ready</span>
              </div>
            );
          }

          const isApprovalPlan =
            part.lang?.toLowerCase() === "json:approval-plan" ||
            part.lang?.toLowerCase() === "approval-plan" ||
            ((part.content.includes('"flow"') || part.content.includes('"baseInfo"') || part.content.includes('"title"')) &&
              (part.content.includes('"nodes"') || part.content.includes('"tasks"')) &&
              (part.content.includes('approval') ||
                part.content.includes('approver') ||
                part.content.includes('"UserTask"') ||
                part.content.includes('"approverRules"') ||
                part.content.includes('"withdrawFlag"') ||
                part.content.includes('"startupOrder"')));

          if (isApprovalPlan) {
            if (suppressDeploymentCards) return null;
            const parsedApprovalPlan = extractApprovalPlanFromText('```json\n' + part.content + '\n```');
            if (parsedApprovalPlan && onOpenDeployApproval) {
              return (
                <div key={index} className="my-2">
                  <ApprovalPlanCard
                    plan={parsedApprovalPlan}
                    onOpenConfirm={() => onOpenDeployApproval(parsedApprovalPlan)}
                  />
                </div>
              );
            }
            return (
              <div
                key={index}
                className="my-3 p-3.5 rounded-2xl border border-indigo-200 bg-indigo-50/50 flex items-center space-x-2.5 text-xs text-indigo-800"
              >
                <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                <span className="font-medium">
                  正在生成审批流配置方案 (底层机密契约已受沙箱隔离保护)...
                </span>
              </div>
            );
          }

          const isWorkflowPlan =
            part.lang?.toLowerCase() === "json:workflow-plan" ||
            part.lang?.toLowerCase() === "workflow-plan" ||
            ((part.content.includes('"flow"') || part.content.includes('"baseInfo"') || part.content.includes('"title"')) &&
              (part.content.includes('"nodes"') || part.content.includes('"tasks"')));

          if (isWorkflowPlan) {
            if (suppressDeploymentCards) return null;
            const parsedWorkflowPlan = extractWorkflowPlanFromText('```json\n' + part.content + '\n```');
            if (parsedWorkflowPlan && onOpenDeployWorkflow) {
              return (
                <div key={index} className="my-2">
                  <WorkflowPlanCard
                    plan={parsedWorkflowPlan}
                    onOpenConfirm={() => onOpenDeployWorkflow(parsedWorkflowPlan)}
                  />
                </div>
              );
            }
            return (
              <div
                key={index}
                className="my-3 p-3.5 rounded-2xl border border-teal-200 bg-teal-50/50 flex items-center space-x-2.5 text-xs text-teal-800"
              >
                <span className="w-2 h-2 rounded-full bg-teal-600 animate-ping" />
                <span className="font-medium">
                  正在生成自动流程配置方案 (底层机密契约已受沙箱隔离保护)...
                </span>
              </div>
            );
          }

          const isSql =
            part.lang?.toLowerCase() === 'sql' ||
            (part.content.trim().toUpperCase().startsWith('SELECT') && !part.lang);

          return (
            <div
              key={index}
              className="my-2.5 rounded-xl overflow-hidden border border-slate-200 bg-slate-900 text-slate-100 shadow-xs"
            >
              <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-800/90 border-b border-slate-700/80 text-[11px] font-mono text-slate-400">
                <span className="uppercase font-semibold tracking-wider text-slate-300">
                  {part.lang || 'code'}
                </span>
                <div className="flex items-center space-x-2">

                  {isSql && onExecuteSql && (
                    <button
                      onClick={() => onExecuteSql(part.content.trim())}
                      title="直接在当前销售易租户中执行此 SQL 并查看结果"
                      className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-sky-600/90 hover:bg-sky-500 text-white font-sans text-[11px] font-medium transition-colors shadow-xs"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>执行此 SQL</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleCopy(part.content, codeId)}
                    className="flex items-center space-x-1 px-2 py-0.5 rounded-md hover:bg-slate-700 text-slate-300 transition-colors"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400 font-sans">已复制</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span className="font-sans">复制代码</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
              <pre className="p-3.5 overflow-x-auto text-[12px] font-mono leading-relaxed selection:bg-sky-700 selection:text-white">
                <code>{part.content}</code>
              </pre>
            </div>
          );
        }

        return <TextBlock key={index} text={part.content} />;
      })}
    </div>
  );
};

/**
 * 文本行及块级语法解析器
 */
const TextBlock: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let inTable = false;
  let tableRows: string[][] = [];

  const flushTable = () => {
    if (tableRows.length > 0) {
      const header = tableRows[0];
      // 精准过滤表格中包含的所有 :---, ---:, :---: 对齐分隔行
      const body = tableRows.slice(1).filter((r) => {
        const isSeparator = r.every((cell) => {
          const c = cell.trim();
          return /^:?-{2,}:?$/.test(c) || /^:?-+:?$/.test(c);
        });
        return !isSeparator;
      });

      // 提取各列的对齐方式
      const alignments: Array<'left' | 'center' | 'right'> = header.map((_, colIdx) => {
        const sepRow = tableRows.find((r) =>
          r.every((cell) => /^:?-{2,}:?$/.test(cell.trim()) || /^:?-+:?$/.test(cell.trim()))
        );
        if (sepRow && sepRow[colIdx]) {
          const sep = sepRow[colIdx].trim();
          if (sep.startsWith(':') && sep.endsWith(':')) return 'center';
          if (sep.endsWith(':')) return 'right';
        }
        return 'left';
      });

      elements.push(
        <div key={`table_${elements.length}`} className="my-3 overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-semibold">
              <tr>
                {header.map((cell, ci) => (
                  <th
                    key={ci}
                    className={`px-3.5 py-2.5 whitespace-nowrap text-${alignments[ci] || 'left'}`}
                  >
                    {parseInline(cell.trim())}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-slate-600">
              {body.map((row, ri) => (
                <tr key={ri} className="hover:bg-slate-50/70 transition-colors">
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className={`px-3.5 py-2 text-xs leading-relaxed text-${alignments[ci] || 'left'}`}
                    >
                      {parseInline(cell.trim())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
    }
    inTable = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // 1. 检测 Markdown 表格行 (| a | b |)
    if (line.startsWith('|') && line.endsWith('|')) {
      inTable = true;
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      flushTable();
    }

    // 2. 空行
    if (!line) {
      elements.push(<div key={`empty_${i}`} className="h-1.5" />);
      continue;
    }

    // 3. 水平分割线 (---, ***, ___)
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      elements.push(<hr key={i} className="my-3 border-t border-slate-200" />);
      continue;
    }

    // 4. 标题解析 (支持 1 ~ 6 级标题)
    // 规整: 避免模型生成 • ##、· ##、- ##、* ##，或连续多段 ### ## 标题混排
    let cleanHeadingLine = rawLine.trim().replace(/^[•·\-\*⁃]\s*(#{1,6}\s+)/, "$1");
    cleanHeadingLine = cleanHeadingLine.replace(/^(#{1,6})\s+#{1,6}\s+/, "$1 ");
    const headingMatch = cleanHeadingLine.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      let level = headingMatch[1].length;
      let titleText = headingMatch[2].trim().replace(/^#{1,6}\s*/, "");

      // 如果标题包含中文序号 (如 "五、"、"一、")，优先将其渲染为醒目的 H2 大标题
      if (/^[一二三四五六七八九十]+[、.]/.test(titleText) && level > 2) {
        level = 2;
      }

      if (level === 1) {
        elements.push(
          <h2 key={i} className="text-base font-bold text-slate-900 mt-4 mb-2 pb-1 border-b border-slate-100">
            {parseInline(titleText)}
          </h2>
        );
      } else if (level === 2) {
        elements.push(
          <h3 key={i} className="text-[15px] font-bold text-slate-900 mt-3.5 mb-1.5 pb-0.5 border-b border-slate-100">
            {parseInline(titleText)}
          </h3>
        );
      } else if (level === 3) {
        elements.push(
          <h4 key={i} className="text-sm font-semibold text-slate-900 mt-3 mb-1 flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />
            <span>{parseInline(titleText)}</span>
          </h4>
        );
      } else if (level === 4) {
        elements.push(
          <h5 key={i} className="text-[13px] font-semibold text-slate-800 mt-2.5 mb-1 flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
            <span>{parseInline(titleText)}</span>
          </h5>
        );
      } else {
        elements.push(
          <h6 key={i} className="text-xs font-semibold text-slate-700 mt-2 mb-1 flex items-center space-x-1">
            <span className="w-1 h-1 rounded-full bg-slate-400 shrink-0" />
            <span>{parseInline(titleText)}</span>
          </h6>
        );
      }
      continue;
    }

    // 5. 引用块 (> text)
    if (line.startsWith('>')) {
      const quoteText = line.replace(/^>\s?/, '');
      elements.push(
        <blockquote
          key={i}
          className="pl-3 py-1 my-1.5 border-l-3 border-sky-400 bg-sky-50/60 rounded-r-md text-slate-700 text-xs italic"
        >
          {parseInline(quoteText)}
        </blockquote>
      );
      continue;
    }

    // 6. 无序列表 (- text, * text, • text, · text, ⁃ text)
    if (rawLine.match(/^(\s*)([*\-•·⁃])\s+/)) {
      const match = rawLine.match(/^(\s*)([*\-•·⁃])\s+(.+)$/);
      if (match) {
        const indent = match[1].length;
        const itemText = match[3];
        elements.push(
          <div
            key={i}
            className="flex items-start space-x-2 py-0.5"
            style={{ paddingLeft: `${indent * 8 + 4}px` }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-2 shrink-0" />
            <div className="flex-1">{parseInline(itemText)}</div>
          </div>
        );
        continue;
      }
    }

    // 7. 有序列表 (1. text)
    if (rawLine.match(/^(\s*)(\d+)\.\s+/)) {
      const match = rawLine.match(/^(\s*)(\d+)\.\s+(.+)$/);
      if (match) {
        const indent = match[1].length;
        const num = match[2];
        const itemText = match[3];
        elements.push(
          <div
            key={i}
            className="flex items-start space-x-2 py-0.5"
            style={{ paddingLeft: `${indent * 8 + 4}px` }}
          >
            <span className="text-[11px] font-bold text-sky-600 bg-sky-50 px-1.5 rounded shrink-0 font-mono mt-0.5">
              {num}.
            </span>
            <div className="flex-1">{parseInline(itemText)}</div>
          </div>
        );
        continue;
      }
    }

    // 8. 普通段落
    elements.push(
      <p key={i} className="py-0.5">
        {parseInline(rawLine)}
      </p>
    );
  }

  if (inTable) {
    flushTable();
  }

  return <>{elements}</>;
};

/**
 * 行内元素解析 (支持粗体递归嵌套行内代码、斜体、超链接)
 */
function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIndex = 0;

  while (remaining.length > 0) {
    // 1. 换行标签 <br>, <br/>, <br />, &lt;br&gt;, &lt;br/&gt;
    const brMatch = remaining.match(/^([\s\S]*?)(?:<br\s*\/?>|&lt;br\s*\/?&gt;)([\s\S]*)$/i);
    // 2. 粗体 **...**
    const boldMatch = remaining.match(/^([\s\S]*?)\*\*(.+?)\*\*([\s\S]*)$/);
    // 3. 行内代码 `...`
    const codeMatch = remaining.match(/^([\s\S]*?)`([^`]+)`([\s\S]*)$/);
    // 4. 超链接 [text](url)
    const linkMatch = remaining.match(/^([\s\S]*?)\[([^\]]+)\]\(([^)]+)\)([\s\S]*)$/);

    let matchType: 'br' | 'bold' | 'code' | 'link' | null = null;
    let minPos = Infinity;
    let chosenMatch: RegExpMatchArray | null = null;

    if (brMatch && brMatch[1].length < minPos) {
      minPos = brMatch[1].length;
      matchType = 'br';
      chosenMatch = brMatch;
    }
    if (boldMatch && boldMatch[1].length < minPos) {
      minPos = boldMatch[1].length;
      matchType = 'bold';
      chosenMatch = boldMatch;
    }
    if (codeMatch && codeMatch[1].length < minPos) {
      minPos = codeMatch[1].length;
      matchType = 'code';
      chosenMatch = codeMatch;
    }
    if (linkMatch && linkMatch[1].length < minPos) {
      minPos = linkMatch[1].length;
      matchType = 'link';
      chosenMatch = linkMatch;
    }

    if (!chosenMatch || !matchType) {
      parts.push(remaining);
      break;
    }

    // 前置文本
    if (chosenMatch[1]) {
      parts.push(chosenMatch[1]);
    }

    if (matchType === 'br') {
      parts.push(<br key={`br_${keyIndex++}`} />);
      remaining = chosenMatch[2] || '';
    } else if (matchType === 'bold') {
      // 递归解析粗体内部的内容 (完美支持 **`accountName`** 嵌套代码胶囊)
      parts.push(
        <strong key={`b_${keyIndex++}`} className="font-semibold text-slate-900 mx-0.5">
          {parseInline(chosenMatch[2])}
        </strong>
      );
      remaining = chosenMatch[3] || '';
    } else if (matchType === 'code') {
      parts.push(
        <code
          key={`c_${keyIndex++}`}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-sky-50 text-sky-700 font-mono text-[12px] border border-sky-200/80 font-medium"
        >
          {chosenMatch[2]}
        </code>
      );
      remaining = chosenMatch[3] || '';
    } else if (matchType === 'link') {
      parts.push(
        <a
          key={`a_${keyIndex++}`}
          href={chosenMatch[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-600 hover:text-sky-700 underline mx-0.5 font-medium inline-flex items-center space-x-0.5"
        >
          <span>{chosenMatch[2]}</span>
        </a>
      );
      remaining = chosenMatch[4] || '';
    }
  }

  return parts;
}
