import React, { useState, useEffect, useRef } from "react";
import { 
  Terminal, 
  X, 
  Maximize2, 
  Minimize2, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  ChevronRight,
  Layers,
  Code2,
  Database,
  Printer,
  Workflow
} from "lucide-react";
import { AiToolCallRecord } from "../../../shared/types";

export interface LogEntry {
  id: string;
  timestamp: string;
  type: "info" | "success" | "warn" | "error" | "tool" | "sql";
  title: string;
  details?: any;
}

interface CodexTerminalPanelProps {
  isOpen: boolean;
  onClose: () => void;
  toolCalls?: AiToolCallRecord[];
  projectName?: string;
  activeExecutedSql?: string | null;
  onExecuteSql?: (sql: string) => void;
}

export const CodexTerminalPanel: React.FC<CodexTerminalPanelProps> = ({
  isOpen,
  onClose,
  toolCalls = [],
  projectName = "neoCRM-DEV",
  activeExecutedSql,
  onExecuteSql,
}) => {
  const [activeTab, setActiveTab] = useState<"terminal" | "toolcalls" | "sql">("terminal");
  const [isMaximized, setIsMaximized] = useState(false);
  const [copied, setCopied] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 初始化与监听系统/工具日志
  useEffect(() => {
    const now = new Date().toLocaleTimeString();
    const initLogs: LogEntry[] = [
      {
        id: "sys_1",
        timestamp: now,
        type: "info",
        title: `[vite] (client) hmr update /src/components/ai/AiHarnessStudio.tsx`,
      },
      {
        id: "sys_2",
        timestamp: now,
        type: "success",
        title: `[session] connected to tenant sandbox (origin: https://crm-sandbox.xiaoshouyi.com)`,
      },
      {
        id: "sys_3",
        timestamp: now,
        type: "info",
        title: `[harness] CRM tools and memory subsystem initialized ready`,
      },
    ];
    setLogs(initLogs);
  }, []);

  // 当外部传入新 toolCalls 时追加日志
  useEffect(() => {
    if (toolCalls && toolCalls.length > 0) {
      const now = new Date().toLocaleTimeString();
      const last = toolCalls[toolCalls.length - 1];
      const entry: LogEntry = {
        id: `${last.id}_${Date.now()}`,
        timestamp: now,
        type: last.status === "error" ? "error" : "tool",
        title: `[tool-call] ${last.name} (${last.status})`,
        details: { arguments: last.arguments, resultSummary: last.resultSummary, error: last.error },
      };
      setLogs((prev) => [...prev, entry]);
    }
  }, [toolCalls.length]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length, activeTab]);

  if (!isOpen) return null;

  const handleCopy = () => {
    const text = logs.map((l) => `${l.timestamp} ${l.title} ${l.details ? JSON.stringify(l.details) : ""}`).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    setLogs([]);
  };

  return (
    <div
      className={`border-l border-slate-200 bg-white flex flex-col transition-all duration-200 shrink-0 select-text ${
        isMaximized ? "w-full md:w-[680px]" : "w-80 md:w-96 lg:w-[420px]"
      }`}
    >
      {/* 顶部标签页栏 (参考 Codex 终端栏) */}
      <div className="h-10 border-b border-slate-200 bg-slate-50/70 px-2 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-1 min-w-0">
          <button
            onClick={() => setActiveTab("terminal")}
            className={`px-2.5 py-1 text-xs rounded-md font-mono flex items-center space-x-1.5 transition-colors cursor-pointer ${
              activeTab === "terminal"
                ? "bg-white text-slate-800 font-semibold shadow-2xs border border-slate-200"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-slate-600" />
            <span className="truncate">{projectName}</span>
          </button>

          <button
            onClick={() => setActiveTab("toolcalls")}
            className={`px-2.5 py-1 text-xs rounded-md font-mono flex items-center space-x-1.5 transition-colors cursor-pointer ${
              activeTab === "toolcalls"
                ? "bg-white text-slate-800 font-semibold shadow-2xs border border-slate-200"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
            }`}
          >
            <Code2 className="w-3.5 h-3.5 text-purple-600" />
            <span>调用 ({toolCalls.length})</span>
          </button>

          {activeExecutedSql && (
            <button
              onClick={() => setActiveTab("sql")}
              className={`px-2.5 py-1 text-xs rounded-md font-mono flex items-center space-x-1.5 transition-colors cursor-pointer ${
                activeTab === "sql"
                  ? "bg-white text-slate-800 font-semibold shadow-2xs border border-slate-200"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
              }`}
            >
              <Database className="w-3.5 h-3.5 text-amber-600" />
              <span>SQL</span>
            </button>
          )}

          <button
            onClick={() => {
              setLogs((prev) => [
                ...prev,
                {
                  id: `ping_${Date.now()}`,
                  timestamp: new Date().toLocaleTimeString(),
                  type: "info",
                  title: `[dev-ping] workspace terminal live check OK`,
                },
              ]);
            }}
            title="添加新会话/探测"
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 窗口操作按钮 */}
        <div className="flex items-center space-x-1">
          <button
            onClick={handleCopy}
            title="复制终端日志"
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleClear}
            title="清屏"
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            title={isMaximized ? "还原宽度" : "放大面板"}
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            title="关闭右侧面板"
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 终端内容区域 */}
      <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed bg-slate-950 text-slate-200">
        {activeTab === "terminal" && (
          <div className="space-y-1.5">
            <div className="text-slate-500 pb-1 border-b border-slate-800 flex items-center justify-between text-[10px]">
              <span>TERMINAL / DEV LOGS STREAM</span>
              <span className="text-emerald-400">● LIVE</span>
            </div>

            {logs.map((log) => (
              <div key={log.id} className="space-y-0.5">
                <div className="flex items-start space-x-2">
                  <span className="text-slate-500 select-none shrink-0">{log.timestamp}</span>
                  <span
                    className={`font-semibold shrink-0 ${
                      log.type === "error"
                        ? "text-rose-400"
                        : log.type === "success"
                        ? "text-emerald-400"
                        : log.type === "tool"
                        ? "text-purple-400"
                        : "text-sky-300"
                    }`}
                  >
                    {log.title}
                  </span>
                </div>
                {log.details && (
                  <pre className="pl-16 text-slate-400 text-[10px] overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(log.details, null, 2)}
                  </pre>
                )}
              </div>
            ))}
            <div ref={scrollRef} />
          </div>
        )}

        {activeTab === "toolcalls" && (
          <div className="space-y-3">
            <div className="text-slate-500 pb-1 border-b border-slate-800 flex items-center justify-between text-[10px]">
              <span>ACTIVE TOOL CALL INSPECTOR ({toolCalls.length})</span>
            </div>

            {toolCalls.length === 0 ? (
              <div className="py-8 text-center text-slate-600">本轮对话中尚未调用工具</div>
            ) : (
              toolCalls.map((tc, idx) => (
                <div key={tc.id || idx} className="p-2 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-purple-300 flex items-center space-x-1">
                      <span>#{idx + 1}</span>
                      <span>{tc.name}</span>
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                        tc.status === "success"
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                          : tc.status === "error"
                          ? "bg-rose-950 text-rose-400 border border-rose-800"
                          : "bg-amber-950 text-amber-400 border border-amber-800"
                      }`}
                    >
                      {tc.status}
                    </span>
                  </div>

                  {tc.arguments && Object.keys(tc.arguments).length > 0 && (
                    <div className="text-[10px] text-slate-400">
                      <span className="text-slate-500">参数: </span>
                      <code>{JSON.stringify(tc.arguments)}</code>
                    </div>
                  )}

                  {tc.resultSummary && (
                    <div className="text-[10px] text-emerald-400">
                      <span className="text-slate-500">结果: </span>
                      <span>{tc.resultSummary}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "sql" && activeExecutedSql && (
          <div className="space-y-2">
            <div className="text-slate-500 pb-1 border-b border-slate-800 text-[10px]">
              LAST EXECUTED XOQL QUERY
            </div>
            <pre className="p-2.5 rounded-lg bg-slate-900 text-amber-300 text-xs overflow-x-auto whitespace-pre-wrap">
              {activeExecutedSql}
            </pre>
            {onExecuteSql && (
              <button
                onClick={() => onExecuteSql(activeExecutedSql)}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs cursor-pointer font-sans"
              >
                在租户数据库中重新执行
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
