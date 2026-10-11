import React, { useState } from 'react';
import { Check, Copy, Play, Database } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  onExecuteSql?: (sql: string) => void;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, onExecuteSql }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!content) return null;

  // 将文本分割为代码块与普通文本块
  const parts: Array<{ type: 'text' | 'code'; content: string; lang?: string }> = [];
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
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

  return (
    <div className="space-y-3 text-slate-800 text-[13px] leading-relaxed break-words">
      {parts.map((part, index) => {
        if (part.type === 'code') {
          const codeId = `code_${index}`;
          const isCopied = copiedId === codeId;
          const isSql = part.lang?.toLowerCase() === 'sql' || (part.content.trim().toUpperCase().startsWith('SELECT') && !part.lang);

          return (
            <div key={index} className="my-2 rounded-xl overflow-hidden border border-slate-200 bg-slate-900 text-slate-100 shadow-xs">
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
 * 文本行及行内样式解析器
 */
const TextBlock: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let inTable = false;
  let tableRows: string[][] = [];

  const flushTable = () => {
    if (tableRows.length > 0) {
      const header = tableRows[0];
      const body = tableRows.slice(1).filter((r) => !r.every((cell) => cell.trim().match(/^-+$/)));
      elements.push(
        <div key={`table_${elements.length}`} className="my-2.5 overflow-x-auto rounded-lg border border-slate-200 shadow-xs">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-semibold">
              <tr>
                {header.map((cell, ci) => (
                  <th key={ci} className="px-3 py-2 whitespace-nowrap">
                    {parseInline(cell.trim())}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-slate-600">
              {body.map((row, ri) => (
                <tr key={ri} className="hover:bg-slate-50/80 transition-colors">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-xs">
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
    const line = lines[i];

    // 检测 Markdown 表格行 (| a | b |)
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      inTable = true;
      const cells = line
        .trim()
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      flushTable();
    }

    if (!line.trim()) {
      elements.push(<div key={`empty_${i}`} className="h-1.5" />);
      continue;
    }

    // 标题解析
    if (line.startsWith('### ')) {
      elements.push(
        <h4 key={i} className="text-sm font-semibold text-slate-900 mt-2.5 mb-1 flex items-center space-x-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
          <span>{parseInline(line.slice(4))}</span>
        </h4>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h3 key={i} className="text-[15px] font-bold text-slate-900 mt-3 mb-1.5 pb-1 border-b border-slate-100">
          {parseInline(line.slice(3))}
        </h3>
      );
    } else if (line.startsWith('# ')) {
      elements.push(
        <h2 key={i} className="text-base font-bold text-slate-900 mt-3.5 mb-2">
          {parseInline(line.slice(2))}
        </h2>
      );
    } else if (line.startsWith('> ')) {
      // 引用块
      elements.push(
        <blockquote key={i} className="pl-3 py-1 my-1.5 border-l-3 border-sky-400 bg-sky-50/60 rounded-r-md text-slate-700 text-xs italic">
          {parseInline(line.slice(2))}
        </blockquote>
      );
    } else if (line.match(/^(\*|-)\s+/)) {
      // 无序列表
      const itemText = line.replace(/^(\*|-)\s+/, '');
      elements.push(
        <div key={i} className="flex items-start space-x-2 pl-1.5 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-2 shrink-0" />
          <div className="flex-1">{parseInline(itemText)}</div>
        </div>
      );
    } else if (line.match(/^\d+\.\s+/)) {
      // 有序列表
      const numMatch = line.match(/^(\d+)\.\s+/);
      const num = numMatch ? numMatch[1] : '1';
      const itemText = line.replace(/^\d+\.\s+/, '');
      elements.push(
        <div key={i} className="flex items-start space-x-2 pl-1.5 py-0.5">
          <span className="text-[11px] font-bold text-sky-600 bg-sky-50 px-1.5 rounded shrink-0 font-mono mt-0.5">
            {num}.
          </span>
          <div className="flex-1">{parseInline(itemText)}</div>
        </div>
      );
    } else {
      // 普通段落
      elements.push(
        <p key={i} className="py-0.5">
          {parseInline(line)}
        </p>
      );
    }
  }

  if (inTable) {
    flushTable();
  }

  return <>{elements}</>;
};

/**
 * 行内元素解析 (粗体, 斜体, 行内代码, 超链接)
 */
function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIndex = 0;

  // 正则匹配: **bold**, `code`, [link](url)
  while (remaining.length > 0) {
    // 粗体 **...**
    const boldMatch = remaining.match(/^([\s\S]*?)\*\*(.+?)\*\*([\s\S]*)$/);
    // 行内代码 `...`
    const codeMatch = remaining.match(/^([\s\S]*?)`([^`]+)`([\s\S]*)$/);

    let matchType: 'bold' | 'code' | null = null;
    let chosenMatch: RegExpMatchArray | null = null;

    if (boldMatch && codeMatch) {
      if (boldMatch[1].length <= codeMatch[1].length) {
        matchType = 'bold';
        chosenMatch = boldMatch;
      } else {
        matchType = 'code';
        chosenMatch = codeMatch;
      }
    } else if (boldMatch) {
      matchType = 'bold';
      chosenMatch = boldMatch;
    } else if (codeMatch) {
      matchType = 'code';
      chosenMatch = codeMatch;
    }

    if (!chosenMatch || !matchType) {
      parts.push(remaining);
      break;
    }

    // 前置文本
    if (chosenMatch[1]) {
      parts.push(chosenMatch[1]);
    }

    if (matchType === 'bold') {
      parts.push(
        <strong key={`b_${keyIndex++}`} className="font-semibold text-slate-900">
          {chosenMatch[2]}
        </strong>
      );
    } else if (matchType === 'code') {
      parts.push(
        <code
          key={`c_${keyIndex++}`}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-slate-100 text-sky-700 font-mono text-[12px] border border-slate-200"
        >
          {chosenMatch[2]}
        </code>
      );
    }

    remaining = chosenMatch[3] || '';
  }

  return parts;
}
