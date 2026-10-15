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
  ChevronDown,
  Layers,
  Code2,
  Database,
  FolderTree,
  Paperclip,
  Folder,
  FolderOpen,
  FileCode,
  FileSpreadsheet,
  FileText,
  File,
  ExternalLink,
  Eye,
  RefreshCw,
  Play,
  Search,
  Download,
  Image,
  Sparkles
} from "lucide-react";
import { 
  AiToolCallRecord, 
  WorkspaceProject, 
  ProjectDirNode, 
  WorkspaceArtifactItem, 
  AiFileAttachment 
} from "../../../shared/types";

interface CodexTerminalPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeProject?: WorkspaceProject;
  activeSessionAttachments?: AiFileAttachment[];
  toolCalls?: AiToolCallRecord[];
  activeExecutedSql?: string | null;
  onExecuteSql?: (sql: string) => void;
  onAttachFileToComposer?: (file: { name: string; fullPath: string }) => void;
  showToast?: (type: 'success' | 'error' | 'info', text: string) => void;
}

interface CommandHistoryItem {
  id: string;
  command: string;
  timestamp: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export const CodexTerminalPanel: React.FC<CodexTerminalPanelProps> = ({
  isOpen,
  onClose,
  activeProject,
  activeSessionAttachments = [],
  toolCalls = [],
  activeExecutedSql,
  onExecuteSql,
  onAttachFileToComposer,
  showToast,
}) => {
  // 4 个主要 Tab: "files" (项目树), "artifacts" (上传/产物), "terminal" (交互终端), "tools" (调用轨迹)
  const [activeTab, setActiveTab] = useState<"files" | "artifacts" | "terminal" | "tools">("files");
  const [isMaximized, setIsMaximized] = useState(false);
  const [copied, setCopied] = useState(false);

  // ================= 1. 树状项目文件 (File Tree) 状态 =================
  const [dirTree, setDirTree] = useState<ProjectDirNode[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [treeSearch, setTreeSearch] = useState("");

  // ================= 2. 上传与生成产物 (Artifacts) 状态 =================
  const [artifacts, setArtifacts] = useState<WorkspaceArtifactItem[]>([]);
  const [loadingArtifacts, setLoadingArtifacts] = useState(false);

  // ================= 3. 交互式终端 (Terminal) 状态 =================
  const [commandInput, setCommandInput] = useState("");
  const [terminalHistory, setTerminalHistory] = useState<CommandHistoryItem[]>([]);
  const [isExecutingCmd, setIsExecutingCmd] = useState(false);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const terminalBottomRef = useRef<HTMLDivElement>(null);
  const terminalInputRef = useRef<HTMLInputElement>(null);

  // ================= 4. 文件内容实时预览 Modal =================
  const [previewFile, setPreviewFile] = useState<{ name: string; fullPath: string; content?: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const projectPath = activeProject?.localPath || "";
  const projectName = activeProject?.name || "neoCRM-DEV";

  // 加载项目目录树
  const loadDirTree = async () => {
    if (!window.neoApi?.projectGetDirTree) return;
    setLoadingTree(true);
    try {
      const tree = await window.neoApi.projectGetDirTree(projectPath, 4);
      if (Array.isArray(tree)) {
        setDirTree(tree);
        // 默认展开首层目录
        const defaultExpanded = new Set<string>();
        tree.forEach((node) => {
          if (node.type === "directory") {
            defaultExpanded.add(node.path);
          }
        });
        setExpandedFolders(defaultExpanded);
      }
    } catch (e: any) {
      showToast?.("error", `读取目录树失败: ${e.message}`);
    } finally {
      setLoadingTree(false);
    }
  };

  // 加载最近产物
  const loadRecentArtifacts = async () => {
    if (!window.neoApi?.projectGetRecentArtifacts) return;
    setLoadingArtifacts(true);
    try {
      const list = await window.neoApi.projectGetRecentArtifacts(projectPath, 40);
      if (Array.isArray(list)) {
        setArtifacts(list);
      }
    } catch (e: any) {
      showToast?.("error", `读取产物失败: ${e.message}`);
    } finally {
      setLoadingArtifacts(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDirTree();
      loadRecentArtifacts();
    }
  }, [isOpen, projectPath, toolCalls.length, activeSessionAttachments.length]);

  // 终端命令历史随更新滚动
  useEffect(() => {
    if (activeTab === "terminal") {
      terminalBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [terminalHistory.length, activeTab]);

  if (!isOpen) return null;

  // 展开 / 折叠文件夹
  const toggleFolder = (folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  };

  // 获取文件专属图标
  const getFileIcon = (fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "ts":
      case "tsx":
      case "js":
      case "jsx":
        return <FileCode className="w-4 h-4 text-sky-500 shrink-0" />;
      case "json":
        return <FileCode className="w-4 h-4 text-emerald-500 shrink-0" />;
      case "docx":
      case "doc":
        return <FileText className="w-4 h-4 text-blue-600 shrink-0" />;
      case "xlsx":
      case "xls":
      case "csv":
        return <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />;
      case "md":
        return <FileText className="w-4 h-4 text-slate-600 shrink-0" />;
      case "py":
        return <FileCode className="w-4 h-4 text-amber-500 shrink-0" />;
      case "png":
      case "jpg":
      case "jpeg":
      case "webp":
      case "gif":
        return <Image className="w-4 h-4 text-purple-500 shrink-0" />;
      default:
        return <File className="w-4 h-4 text-slate-400 shrink-0" />;
    }
  };

  // 在系统访达/资源管理器中定位
  const handleRevealInFinder = async (fullPath: string) => {
    try {
      if (window.neoApi?.shellShowItemInFolder) {
        await window.neoApi.shellShowItemInFolder(fullPath);
      }
    } catch (e: any) {
      showToast?.("error", `定位文件失败: ${e.message}`);
    }
  };

  // 使用系统默认应用打开文件
  const handleOpenFile = async (fullPath: string) => {
    try {
      if (window.neoApi?.shellOpenPath) {
        await window.neoApi.shellOpenPath(fullPath);
      }
    } catch (e: any) {
      showToast?.("error", `打开文件失败: ${e.message}`);
    }
  };

  // 预览文件内容
  const handlePreviewFile = async (name: string, fullPath: string) => {
    setPreviewFile({ name, fullPath });
    setLoadingPreview(true);
    try {
      if (window.neoApi?.fileParseLocalPath) {
        const parsed = await window.neoApi.fileParseLocalPath(fullPath);
        setPreviewFile({ name, fullPath, content: parsed.parsedContent || "（空文件）" });
      }
    } catch (e: any) {
      setPreviewFile({ name, fullPath, content: `读取失败: ${e.message}` });
    } finally {
      setLoadingPreview(false);
    }
  };

  // 复制文本至剪贴板
  const handleCopyText = async (text: string) => {
    let ok = false;
    try {
      if (window.neoApi?.clipboardWriteText) {
        await window.neoApi.clipboardWriteText(text);
        ok = true;
      }
    } catch {}
    if (!ok && navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch {}
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast?.("success", "已复制到剪贴板");
  };

  // 终端执行 Shell 命令
  const handleExecuteTerminal = async (cmdText?: string) => {
    const rawCmd = (cmdText !== undefined ? cmdText : commandInput).trim();
    if (!rawCmd || isExecutingCmd) return;

    if (rawCmd === "clear") {
      setTerminalHistory([]);
      setCommandInput("");
      return;
    }

    setIsExecutingCmd(true);
    const now = new Date().toLocaleTimeString();
    try {
      let res = { stdout: "", stderr: "", exitCode: 0 };
      if (window.neoApi?.terminalExecute) {
        res = await window.neoApi.terminalExecute({
          command: rawCmd,
          workdir: projectPath,
          timeoutMs: 60000,
        });
      }

      const item: CommandHistoryItem = {
        id: `cmd_${Date.now()}`,
        command: rawCmd,
        timestamp: now,
        stdout: res.stdout,
        stderr: res.stderr,
        exitCode: res.exitCode,
      };

      setTerminalHistory((prev) => [...prev, item]);
      setCommandInput("");
      setHistoryIndex(-1);
      // 若命令可能生成新文件，自动刷新目录树与产物
      if (rawCmd.includes("generate") || rawCmd.includes("build") || rawCmd.includes("touch") || rawCmd.includes("python")) {
        setTimeout(() => {
          loadDirTree();
          loadRecentArtifacts();
        }, 1000);
      }
    } catch (e: any) {
      setTerminalHistory((prev) => [
        ...prev,
        {
          id: `cmd_${Date.now()}`,
          command: rawCmd,
          timestamp: now,
          stdout: "",
          stderr: e.message || "执行命令异常",
          exitCode: 1,
        },
      ]);
    } finally {
      setIsExecutingCmd(false);
      setTimeout(() => terminalInputRef.current?.focus(), 50);
    }
  };

  // 终端上下方向键召回命令历史
  const handleTerminalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleExecuteTerminal();
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (terminalHistory.length === 0) return;
      const nextIdx = historyIndex === -1 ? terminalHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIdx);
      setCommandInput(terminalHistory[nextIdx].command);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (terminalHistory.length === 0 || historyIndex === -1) return;
      const nextIdx = historyIndex + 1;
      if (nextIdx >= terminalHistory.length) {
        setHistoryIndex(-1);
        setCommandInput("");
      } else {
        setHistoryIndex(nextIdx);
        setCommandInput(terminalHistory[nextIdx].command);
      }
      return;
    }
  };

  // 递归渲染目录树节点
  const renderTreeNode = (node: ProjectDirNode, depth = 0) => {
    if (treeSearch.trim()) {
      const q = treeSearch.toLowerCase();
      const matchSelf = node.name.toLowerCase().includes(q) || node.relativePath.toLowerCase().includes(q);
      const matchChildren = node.children && node.children.some((c) => c.name.toLowerCase().includes(q) || c.relativePath.toLowerCase().includes(q));
      if (!matchSelf && !matchChildren) return null;
    }

    const isFolder = node.type === "directory";
    const isExpanded = expandedFolders.has(node.path);

    return (
      <div key={node.path} className="space-y-0.5 select-none">
        <div
          onClick={() => {
            if (isFolder) {
              toggleFolder(node.path);
            } else {
              handlePreviewFile(node.name, node.path);
            }
          }}
          className={`group flex items-center justify-between py-1 px-2 rounded-lg text-xs hover:bg-slate-100/90 transition-colors cursor-pointer ${
            isFolder ? "text-slate-800 font-medium" : "text-slate-600"
          }`}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          <div className="flex items-center space-x-1.5 min-w-0 pr-1">
            {isFolder ? (
              <>
                <ChevronRight className={`w-3 h-3 text-slate-400 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                {isExpanded ? (
                  <FolderOpen className="w-4 h-4 text-amber-600 shrink-0" />
                ) : (
                  <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                )}
              </>
            ) : (
              getFileIcon(node.name)
            )}
            <span className="truncate">{node.name}</span>
          </div>

          {/* 悬停快捷操作 */}
          <div className="hidden group-hover:flex items-center space-x-1 shrink-0">
            {!isFolder && (
              <>
                {onAttachFileToComposer && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAttachFileToComposer({ name: node.name, fullPath: node.path });
                      showToast?.("success", `已将 ${node.name} 引用至对话`);
                    }}
                    title="在对话中引用 (@)"
                    className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-800"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenFile(node.path);
                  }}
                  title="用系统默认应用打开"
                  className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-800"
                >
                  <Eye className="w-3 h-3" />
                </button>
              </>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRevealInFinder(node.path);
              }}
              title="在系统访达/资源管理器中显示"
              className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-800"
            >
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* 子节点递归 */}
        {isFolder && isExpanded && node.children && (
          <div>
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={`border-l border-slate-200/90 bg-white flex flex-col transition-all duration-200 shrink-0 select-text ${
        isMaximized ? "w-full md:w-[680px]" : "w-80 md:w-96 lg:w-[440px]"
      }`}
    >
      {/* 顶部标签栏 */}
      <div className="h-10 border-b border-slate-200/80 bg-slate-50/80 px-2 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-1 min-w-0">
          <button
            onClick={() => setActiveTab("files")}
            className={`px-2 py-1 text-xs rounded-md flex items-center space-x-1.5 transition-colors cursor-pointer ${
              activeTab === "files"
                ? "bg-white text-slate-900 font-bold shadow-2xs border border-slate-200"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <FolderTree className="w-3.5 h-3.5 text-amber-600" />
            <span>项目文件</span>
          </button>

          <button
            onClick={() => setActiveTab("artifacts")}
            className={`px-2 py-1 text-xs rounded-md flex items-center space-x-1.5 transition-colors cursor-pointer ${
              activeTab === "artifacts"
                ? "bg-white text-slate-900 font-bold shadow-2xs border border-slate-200"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Paperclip className="w-3.5 h-3.5 text-sky-600" />
            <span>上传/产物 ({activeSessionAttachments.length + artifacts.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("terminal")}
            className={`px-2 py-1 text-xs rounded-md font-mono flex items-center space-x-1.5 transition-colors cursor-pointer ${
              activeTab === "terminal"
                ? "bg-white text-slate-900 font-bold shadow-2xs border border-slate-200"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-emerald-600" />
            <span>终端</span>
          </button>

          <button
            onClick={() => setActiveTab("tools")}
            className={`px-2 py-1 text-xs rounded-md flex items-center space-x-1.5 transition-colors cursor-pointer ${
              activeTab === "tools"
                ? "bg-white text-slate-900 font-bold shadow-2xs border border-slate-200"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Code2 className="w-3.5 h-3.5 text-purple-600" />
            <span>工具 ({toolCalls.length})</span>
          </button>
        </div>

        {/* 窗口操作按钮 */}
        <div className="flex items-center space-x-0.5">
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            title={isMaximized ? "还原宽度" : "最大化侧栏"}
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            title="关闭分栏"
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 主体内容展示区 */}
      <div className="flex-1 overflow-hidden flex flex-col bg-white">
        {/* ================= TAB 1: 树状项目文件 (File Tree) ================= */}
        {activeTab === "files" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* 搜索与工具条 */}
            <div className="p-2 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/50">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  value={treeSearch}
                  onChange={(e) => setTreeSearch(e.target.value)}
                  placeholder="过滤项目文件..."
                  className="w-full pl-7 pr-3 py-1 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-amber-400"
                />
              </div>
              <button
                onClick={loadDirTree}
                disabled={loadingTree}
                title="重新扫描目录树"
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-500 cursor-pointer shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingTree ? "animate-spin text-amber-600" : ""}`} />
              </button>
            </div>

            {/* 项目目录树视图 */}
            <div className="flex-1 overflow-y-auto p-2">
              <div className="text-[10px] text-slate-400 font-mono px-2 py-1 truncate" title={projectPath}>
                📁 {projectName} ({projectPath})
              </div>
              {loadingTree ? (
                <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center space-y-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
                  <span>正在扫描项目文件树...</span>
                </div>
              ) : dirTree.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">目录为空或无法访问</div>
              ) : (
                <div className="space-y-0.5">
                  {dirTree.map((node) => renderTreeNode(node, 0))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 2: 上传的文件与产物 (Artifacts) ================= */}
        {activeTab === "artifacts" && (
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {/* 本轮会话上传的文件 */}
            {activeSessionAttachments.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span className="flex items-center space-x-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-sky-600" />
                    <span>本轮会话上传的文件 ({activeSessionAttachments.length})</span>
                  </span>
                </div>

                <div className="space-y-1.5">
                  {activeSessionAttachments.map((att) => (
                    <div
                      key={att.id}
                      className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-50 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center space-x-2 truncate">
                        {getFileIcon(att.name)}
                        <div className="truncate">
                          <p className="text-xs font-semibold text-slate-800 truncate">{att.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{(att.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>

                      {att.parsedContent && (
                        <button
                          onClick={() => setPreviewFile({ name: att.name, fullPath: att.name, content: att.parsedContent })}
                          className="px-2 py-1 text-[11px] font-medium text-sky-600 hover:bg-sky-50 rounded-lg shrink-0 cursor-pointer"
                        >
                          查看
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 本地项目生成文件与产物 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>工作区最新产物与文档 ({artifacts.length})</span>
                </span>
                <button
                  onClick={loadRecentArtifacts}
                  disabled={loadingArtifacts}
                  className="text-slate-400 hover:text-slate-700 p-1"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingArtifacts ? "animate-spin" : ""}`} />
                </button>
              </div>

              {artifacts.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">暂无生成的产物文件</div>
              ) : (
                <div className="space-y-1.5">
                  {artifacts.map((art) => (
                    <div
                      key={art.fullPath}
                      className="p-2.5 rounded-xl border border-slate-200 hover:border-amber-300 bg-white shadow-2xs flex items-center justify-between gap-2 transition-all group"
                    >
                      <div className="flex items-center space-x-2 truncate min-w-0 pr-1">
                        {getFileIcon(art.name)}
                        <div className="truncate">
                          <p className="text-xs font-semibold text-slate-800 truncate">{art.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono truncate">
                            {art.relativePath} · {(art.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        {/* 打开文件 */}
                        <button
                          onClick={() => handleOpenFile(art.fullPath)}
                          title="在系统应用中打开"
                          className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {/* 在访达中定位 */}
                        <button
                          onClick={() => handleRevealInFinder(art.fullPath)}
                          title="在系统访达/资源管理器中显示"
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                        {/* 挂载到对话 */}
                        {onAttachFileToComposer && (
                          <button
                            onClick={() => {
                              onAttachFileToComposer({ name: art.name, fullPath: art.fullPath });
                              showToast?.("success", `已将 ${art.name} 添加至对话附件`);
                            }}
                            title="引用至当前输入框"
                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 3: 可交互真实 Shell 终端 (Terminal) ================= */}
        {activeTab === "terminal" && (
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-950 text-slate-200 font-mono text-xs">
            {/* 终端顶部状态与快捷按键 */}
            <div className="p-2 border-b border-slate-800 bg-slate-900/90 flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
              <div className="flex items-center space-x-1.5 truncate">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="text-slate-300 truncate">{projectName}</span>
              </div>

              {/* 常用预设快捷指令 */}
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => handleExecuteTerminal("git status")}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  git status
                </button>
                <button
                  onClick={() => handleExecuteTerminal("ls -la")}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  ls
                </button>
                <button
                  onClick={() => handleExecuteTerminal("pwd")}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  pwd
                </button>
                <button
                  onClick={() => setTerminalHistory([])}
                  title="清屏"
                  className="p-1 text-slate-500 hover:text-slate-300 rounded cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* 终端输出滚屏 */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 leading-relaxed select-text">
              <div className="text-slate-500 text-[10px] pb-1 border-b border-slate-900">
                # NeoCRM Terminal (Shell: bash/zsh) · Directory: {projectPath}
              </div>

              {terminalHistory.map((h) => (
                <div key={h.id} className="space-y-1">
                  <div className="flex items-center space-x-2 text-emerald-400">
                    <span className="text-slate-500 select-none">➜</span>
                    <span className="text-sky-300 select-none">~/workspace</span>
                    <span className="text-amber-300">$</span>
                    <span className="font-bold text-white">{h.command}</span>
                    <span className="text-[10px] text-slate-600 select-none ml-auto">
                      exit: {h.exitCode}
                    </span>
                  </div>

                  {h.stdout && (
                    <pre className="text-slate-300 text-[11px] whitespace-pre-wrap pl-4 font-mono">
                      {h.stdout}
                    </pre>
                  )}
                  {h.stderr && (
                    <pre className="text-rose-400 text-[11px] whitespace-pre-wrap pl-4 font-mono">
                      {h.stderr}
                    </pre>
                  )}
                </div>
              ))}
              <div ref={terminalBottomRef} />
            </div>

            {/* 终端底部交互命令行输入 */}
            <div className="p-2.5 border-t border-slate-800 bg-slate-900 flex items-center space-x-2">
              <span className="text-emerald-400 font-bold text-xs select-none">➜ $</span>
              <input
                ref={terminalInputRef}
                type="text"
                value={commandInput}
                disabled={isExecutingCmd}
                onChange={(e) => setCommandInput(e.target.value)}
                onKeyDown={handleTerminalKeyDown}
                placeholder={isExecutingCmd ? "正在执行命令中..." : "输入 Shell 指令 (如 git status, ls -la, python3)..."}
                className="flex-1 bg-transparent border-none text-white focus:outline-none text-xs font-mono placeholder-slate-600"
              />
              <button
                onClick={() => handleExecuteTerminal()}
                disabled={!commandInput.trim() || isExecutingCmd}
                className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-mono flex items-center space-x-1 cursor-pointer"
              >
                <Play className="w-3 h-3 fill-current" />
              </button>
            </div>
          </div>
        )}

        {/* ================= TAB 4: 工具调用与 SQL ================= */}
        {activeTab === "tools" && (
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <div className="text-xs font-bold text-slate-700 flex items-center justify-between pb-1 border-b border-slate-100">
              <span>调用轨迹明细 ({toolCalls.length})</span>
            </div>

            {toolCalls.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">本轮对话中尚未调用工具</div>
            ) : (
              toolCalls.map((tc, idx) => (
                <div key={tc.id || idx} className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-purple-700 flex items-center space-x-1">
                      <span>#{idx + 1}</span>
                      <span>{tc.name}</span>
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                        tc.status === "success"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : tc.status === "error"
                          ? "bg-rose-50 text-rose-700 border border-rose-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}
                    >
                      {tc.status}
                    </span>
                  </div>

                  {tc.arguments && Object.keys(tc.arguments).length > 0 && (
                    <div className="text-[11px] text-slate-500 font-mono">
                      <span>参数: </span>
                      <code>{JSON.stringify(tc.arguments)}</code>
                    </div>
                  )}

                  {tc.resultSummary && (
                    <div className="text-[11px] text-emerald-600 font-medium">
                      <span>结果: </span>
                      <span>{tc.resultSummary}</span>
                    </div>
                  )}
                </div>
              ))
            )}

            {activeExecutedSql && (
              <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/50 space-y-2 mt-2">
                <div className="text-xs font-bold text-amber-900">最近执行的 XOQL 查询</div>
                <pre className="text-xs font-mono text-slate-800 bg-white p-2 rounded-lg border border-amber-200 whitespace-pre-wrap">
                  {activeExecutedSql}
                </pre>
                {onExecuteSql && (
                  <button
                    onClick={() => onExecuteSql(activeExecutedSql)}
                    className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs cursor-pointer font-sans"
                  >
                    在租户数据库中重新执行
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 文件预览 Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center space-x-2 truncate min-w-0 pr-2">
                {getFileIcon(previewFile.name)}
                <span className="font-bold text-xs text-slate-800 truncate">{previewFile.name}</span>
              </div>

              <div className="flex items-center space-x-1.5 shrink-0">
                <button
                  onClick={() => handleCopyText(previewFile.content || "")}
                  title="复制内容"
                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleOpenFile(previewFile.fullPath)}
                  title="在系统应用中打开"
                  className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setPreviewFile(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-slate-50/40 text-xs font-mono leading-relaxed select-text">
              {loadingPreview ? (
                <div className="py-12 text-center text-slate-400">正在解析文件内容...</div>
              ) : (
                <pre className="whitespace-pre-wrap break-words text-slate-800">
                  {previewFile.content}
                </pre>
              )}
            </div>

            <div className="px-5 py-2.5 border-t border-slate-100 bg-white flex justify-end">
              <button
                onClick={() => setPreviewFile(null)}
                className="px-4 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
