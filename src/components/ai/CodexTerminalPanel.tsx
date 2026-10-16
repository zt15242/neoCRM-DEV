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
  Sparkles,
  GitBranch,
  GitCommit,
  FileDiff,
  Undo2,
  Activity,
  StopCircle
} from "lucide-react";
import { 
  AiToolCallRecord, 
  WorkspaceProject, 
  ProjectDirNode, 
  WorkspaceArtifactItem, 
  AiFileAttachment,
  WorkspaceGitChangesSummary,
  WorkspaceGitChangeItem
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
  activePanelTab?: "files" | "changes" | "jobs" | "artifacts" | "terminal" | "tools";
  onTabChange?: (tab: "files" | "changes" | "jobs" | "artifacts" | "terminal" | "tools") => void;
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
  activePanelTab,
  onTabChange,
}) => {
  // 6 个主要 Tab: "files" (项目树), "changes" (Git变更), "jobs" (后台长任务), "artifacts" (上传/产物), "terminal" (交互终端), "tools" (调用轨迹)
  const [internalTab, setInternalTab] = useState<"files" | "changes" | "jobs" | "artifacts" | "terminal" | "tools">("files");
  const activeTab = activePanelTab || internalTab;
  const setActiveTab = (t: "files" | "changes" | "jobs" | "artifacts" | "terminal" | "tools") => {
    setInternalTab(t);
    onTabChange?.(t);
  };

  // ================= 后台异步长任务 (Jobs) 状态 =================
  const [jobsList, setJobsList] = useState<Array<{ id: string; command: string; status: string; durationMs: number; exitCode?: number; hasUnread: boolean }>>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJobLogs, setActiveJobLogs] = useState<string>('');

  const loadJobs = async () => {
    if (!window.neoApi?.jobsList) return;
    setLoadingJobs(true);
    try {
      const res = await window.neoApi.jobsList();
      setJobsList(res.jobs || []);
    } catch (e) {
      console.warn("读取后台长任务异常:", e);
    } finally {
      setLoadingJobs(false);
    }
  };

  const handleViewJobLogs = async (jobId: string) => {
    if (!window.neoApi?.jobsGetOutput) return;
    setActiveJobId(jobId);
    try {
      const res = await window.neoApi.jobsGetOutput({ job_id: jobId, wait: false });
      setActiveJobLogs(res.output || "(暂无输出)");
    } catch (e: any) {
      setActiveJobLogs(`读取任务输出异常: ${e.message}`);
    }
  };

  const handleKillJob = async (jobId: string) => {
    if (!window.neoApi?.jobsKill) return;
    try {
      await window.neoApi.jobsKill({ job_id: jobId, reason: "用户手动终止" });
      showToast?.("success", `已终止后台任务 [${jobId}]`);
      await loadJobs();
    } catch (e: any) {
      showToast?.("error", `终止任务失败: ${e.message}`);
    }
  };
  const [changesSummary, setChangesSummary] = useState<WorkspaceGitChangesSummary | null>(null);
  const [loadingChanges, setLoadingChanges] = useState(false);
  const [activeDiffFile, setActiveDiffFile] = useState<string | null>(null);
  const [activeDiffContent, setActiveDiffContent] = useState<string>('');
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [copied, setCopied] = useState(false);

  // ================= 1. 树状项目文件 (File Tree) 状态 =================
  const [dirTree, setDirTree] = useState<ProjectDirNode[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [treeSearch, setTreeSearch] = useState("");
  const [folderLimits, setFolderLimits] = useState<Record<string, number>>({});

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

  const [isPullingCode, setIsPullingCode] = useState(false);

  const handlePullProjectCode = async () => {
    if (!projectPath || isPullingCode) return;
    setIsPullingCode(true);
    try {
      if (window.neoApi?.pullProjectCode) {
        const res = await window.neoApi.pullProjectCode({ targetDir: projectPath, pullType: 'all' });
        showToast?.('success', res.summary || '代码与元数据拉取成功！');
        await loadDirTree();
      }
    } catch (e: any) {
      showToast?.('error', `拉取失败: ${e.message}`);
    } finally {
      setIsPullingCode(false);
    }
  };


  // 加载工作区代码变更 (Git Status & Diff)
  const loadWorkspaceChanges = async () => {
    if (!window.neoApi?.projectGetWorkspaceChanges || !projectPath) return;
    setLoadingChanges(true);
    try {
      const summary = await window.neoApi.projectGetWorkspaceChanges(projectPath);
      setChangesSummary(summary);
    } catch (e: any) {
      console.warn("读取工作区代码变更异常:", e);
    } finally {
      setLoadingChanges(false);
    }
  };

  const handleViewDiff = async (file: string) => {
    if (!window.neoApi?.projectGetFileDiff || !projectPath) return;
    setActiveDiffFile(file);
    setLoadingDiff(true);
    try {
      const res = await window.neoApi.projectGetFileDiff(file, projectPath);
      setActiveDiffContent(res.diff || "(无行级差异)");
    } catch (e: any) {
      setActiveDiffContent(`读取差异异常: ${e.message}`);
    } finally {
      setLoadingDiff(false);
    }
  };

  const handleDiscardChanges = async (file: string) => {
    if (!window.confirm(`确定要撤销文件 [${file}] 的所有本地修改吗？该操作不可逆。`)) return;
    if (!window.neoApi?.projectDiscardFileChanges || !projectPath) return;
    try {
      const res = await window.neoApi.projectDiscardFileChanges(file, projectPath);
      showToast?.("success", res.message || "已撤销文件修改");
      await loadWorkspaceChanges();
      await loadDirTree();
    } catch (e: any) {
      showToast?.("error", `撤销失败: ${e.message}`);
    }
  };

  // 加载项目目录树
  const loadDirTree = async () => {
    if (!window.neoApi?.projectGetDirTree) return;
    setLoadingTree(true);
    try {
      const tree = await window.neoApi.projectGetDirTree(projectPath, 10);
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
            {isFolder && node.children && node.children.length > 0 && (
              <span className="text-[10px] text-slate-400 font-mono font-normal shrink-0">
                ({node.children.length.toLocaleString()})
              </span>
            )}
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

        {/* 子节点递归 (带大文件夹分批保护，平滑渲染几千个 Apex 文件) */}
        {isFolder && isExpanded && node.children && (
          <div>
            {(() => {
              const limit = folderLimits[node.path] || 100;
              const isFiltered = Boolean(treeSearch.trim());
              const visibleChildren = isFiltered ? node.children : node.children.slice(0, limit);
              const remaining = node.children.length - limit;

              return (
                <>
                  {visibleChildren.map((child) => renderTreeNode(child, depth + 1))}
                  {!isFiltered && remaining > 0 && (
                    <div style={{ paddingLeft: `${(depth + 1) * 14 + 8}px` }} className="py-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFolderLimits((prev) => ({ ...prev, [node.path]: limit + 150 }));
                        }}
                        className="text-[11px] text-amber-600 hover:text-amber-700 font-medium cursor-pointer transition-colors"
                      >
                        已展示前 ${limit} 个文件，点击加载更多 (+150 / 剩余 ${remaining} 个)...
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
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
            onClick={() => {
              setActiveTab("changes");
              loadWorkspaceChanges();
            }}
            className={`px-2 py-1 text-xs rounded-md flex items-center space-x-1.5 transition-colors cursor-pointer ${
              activeTab === "changes"
                ? "bg-white text-slate-900 font-bold shadow-2xs border border-slate-200"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <GitCommit className="w-3.5 h-3.5 text-indigo-600" />
            <span>代码变更{changesSummary && !changesSummary.clean ? ` (${changesSummary.changes.length})` : ''}</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("jobs");
              loadJobs();
            }}
            className={`px-2 py-1 text-xs rounded-md flex items-center space-x-1.5 transition-colors cursor-pointer ${
              activeTab === "jobs"
                ? "bg-white text-slate-900 font-bold shadow-2xs border border-slate-200"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-amber-500" />
            <span>后台任务{jobsList.some(j => j.status === 'running') ? ` (${jobsList.filter(j => j.status === 'running').length})` : ''}</span>
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
                onClick={handlePullProjectCode}
                disabled={isPullingCode}
                title="一键拉取当前已连接 CRM 环境的线上代码与元数据到本地"
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-amber-50 text-slate-500 hover:text-amber-600 cursor-pointer shrink-0 transition-colors"
              >
                <Download className={`w-3.5 h-3.5 ${isPullingCode ? "animate-bounce text-amber-600" : ""}`} />
              </button>
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
                <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center space-y-3">
                  <span>目录为空或尚未拉取线上代码</span>
                  <button
                    onClick={handlePullProjectCode}
                    disabled={isPullingCode}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium shadow-xs flex items-center space-x-1.5 cursor-pointer transition-colors"
                  >
                    <Download className={`w-3.5 h-3.5 ${isPullingCode ? "animate-bounce" : ""}`} />
                    <span>{isPullingCode ? "正在拉取代码与元数据..." : "一键拉取线上代码与元数据"}</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {dirTree.map((node) => renderTreeNode(node, 0))}
                </div>
              )}
            </div>
          </div>
        )}

        
        {/* ================= TAB 1.5: 工作区代码变更与 Git Diff 概览 (DSH Workspace Changes) ================= */}
        {activeTab === "changes" && (
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            {/* 顶部分支与状态工具条 */}
            <div className="p-2.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center space-x-2 truncate min-w-0">
                <GitBranch className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="text-xs font-bold text-slate-800 font-mono truncate">
                  {changesSummary?.branch || "main"}
                </span>
                {changesSummary?.isGit && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-medium border ${
                    changesSummary.clean
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-amber-50 text-amber-700 border-amber-200 font-bold"
                  }`}>
                    {changesSummary.clean ? "工作区干净" : `${changesSummary.changes.length} 个文件变动`}
                  </span>
                )}
              </div>

              <button
                onClick={loadWorkspaceChanges}
                disabled={loadingChanges}
                className="p-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-500 cursor-pointer shrink-0 shadow-2xs"
                title="重新扫描代码变动"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingChanges ? "animate-spin text-indigo-600" : ""}`} />
              </button>
            </div>

            {/* 变更文件列表 */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {!changesSummary?.isGit ? (
                <div className="py-12 text-center text-xs text-slate-400 space-y-1">
                  <p>当前项目尚未初始化 Git 仓库</p>
                  <p className="text-[11px] text-slate-300">可在终端运行 git init 开启版本变更追踪</p>
                </div>
              ) : changesSummary.clean || changesSummary.changes.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 space-y-1">
                  <Check className="w-5 h-5 text-emerald-500 mx-auto" />
                  <p className="font-medium text-slate-600">工作区代码与仓库完全一致</p>
                  <p className="text-[11px] text-slate-400">智能体做出的任何文件修改都将实时呈现在这里</p>
                </div>
              ) : (
                changesSummary.changes.map((item) => {
                  const isModified = item.status === "M";
                  const isUntracked = item.status === "??" || item.status === "A";
                  const isDeleted = item.status === "D";

                  return (
                    <div
                      key={item.file}
                      className="p-2 rounded-xl border border-slate-200/90 bg-slate-50/50 hover:bg-white hover:border-indigo-300 hover:shadow-xs transition-all flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center space-x-2 truncate min-w-0 flex-1">
                        <span className={`w-4 h-4 rounded text-[10px] font-mono font-bold flex items-center justify-center shrink-0 border ${
                          isModified
                            ? "bg-amber-100 text-amber-800 border-amber-300"
                            : isUntracked
                            ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                            : "bg-rose-100 text-rose-800 border-rose-300"
                        }`}>
                          {item.status === "??" ? "+" : item.status}
                        </span>
                        <span className="font-mono text-slate-800 truncate" title={item.file}>
                          {item.file}
                        </span>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        {isModified && (
                          <button
                            onClick={() => handleViewDiff(item.file)}
                            className="px-2 py-0.5 rounded text-[10px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center space-x-1 cursor-pointer transition-colors"
                            title="对比行级差异 (Git Diff)"
                          >
                            <FileDiff className="w-3 h-3" />
                            <span>差异</span>
                          </button>
                        )}
                        {isModified && (
                          <button
                            onClick={() => handleDiscardChanges(item.file)}
                            className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 cursor-pointer"
                            title="放弃修改"
                          >
                            <Undo2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Git Diff 展开弹窗 / 浮层 */}
            {activeDiffFile && (
              <div className="p-3 border-t border-slate-200 bg-slate-900 text-slate-200 max-h-56 overflow-y-auto font-mono text-[11px] space-y-1">
                <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-800 text-slate-400">
                  <span className="text-sky-400 truncate">Diff: {activeDiffFile}</span>
                  <button onClick={() => setActiveDiffFile(null)} className="text-slate-500 hover:text-slate-300">
                    关闭
                  </button>
                </div>
                {loadingDiff ? (
                  <div className="py-4 text-center text-slate-500">正在生成 Diff 差异...</div>
                ) : (
                  <pre className="whitespace-pre-wrap leading-relaxed">
                    {activeDiffContent.split('\n').map((line, idx) => {
                      const isAdd = line.startsWith('+') && !line.startsWith('+++');
                      const isDel = line.startsWith('-') && !line.startsWith('---');
                      return (
                        <div
                          key={idx}
                          className={isAdd ? "text-emerald-400 bg-emerald-950/40" : isDel ? "text-rose-400 bg-rose-950/40" : "text-slate-300"}
                        >
                          {line}
                        </div>
                      );
                    })}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}

{/* ================= TAB 1.8: 工作区后台异步长任务 (DSH Background Jobs) ================= */}
        {activeTab === "jobs" && (
          <div className="flex-1 overflow-y-auto flex flex-col p-3 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold text-slate-800">后台异步长任务 (DSH Background Jobs)</span>
                <span className="text-[10px] text-slate-400 font-mono">共 {jobsList.length} 项</span>
              </div>
              <button
                onClick={loadJobs}
                className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"
                title="刷新任务状态"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingJobs ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="space-y-2 flex-1">
              {jobsList.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 space-y-1">
                  <Activity className="w-6 h-6 text-slate-300 mx-auto" />
                  <p className="font-medium text-slate-600">暂无后台长任务</p>
                  <p className="text-[11px] text-slate-400">长命令可通过 bash 的 background: true 选项启动异步长进程</p>
                </div>
              ) : (
                jobsList.map((job) => {
                  const isRunning = job.status === 'running';
                  const isCompleted = job.status === 'completed';
                  const isError = job.status === 'error';

                  return (
                    <div
                      key={job.id}
                      className="p-2.5 rounded-xl border border-slate-200/90 bg-slate-50/50 hover:bg-white hover:border-amber-300 hover:shadow-xs transition-all space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 truncate">
                          <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-amber-500 animate-pulse' : isCompleted ? 'bg-emerald-500' : isError ? 'bg-rose-500' : 'bg-slate-400'}`} />
                          <span className="font-mono text-[11px] font-bold text-slate-700">{job.id}</span>
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-medium border ${
                            isRunning
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : isCompleted
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : isError
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}>
                            {isRunning ? '运行中' : isCompleted ? '已完成' : isError ? `失败(${job.exitCode})` : '已终止'}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {(job.durationMs / 1000).toFixed(1)}s
                        </span>
                      </div>

                      <div className="font-mono text-[11px] bg-slate-900 text-slate-200 p-2 rounded-lg overflow-x-auto truncate">
                        $ {job.command}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <button
                          onClick={() => handleViewJobLogs(job.id)}
                          className="px-2.5 py-1 rounded text-[10px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center space-x-1 cursor-pointer font-medium"
                        >
                          <Terminal className="w-3 h-3" />
                          <span>查看实时输出日志</span>
                        </button>

                        {isRunning && (
                          <button
                            onClick={() => handleKillJob(job.id)}
                            className="px-2.5 py-1 rounded text-[10px] bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 flex items-center space-x-1 cursor-pointer font-medium"
                          >
                            <StopCircle className="w-3 h-3" />
                            <span>终止任务</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 查看特定任务日志浮层 */}
            {activeJobId && (
              <div className="p-3 border-t border-slate-200 bg-slate-900 text-slate-200 max-h-56 overflow-y-auto font-mono text-[11px] space-y-1">
                <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-800 text-slate-400">
                  <span className="text-amber-400 truncate">日志: {activeJobId}</span>
                  <div className="flex items-center space-x-2">
                    <button onClick={() => handleViewJobLogs(activeJobId)} className="text-slate-400 hover:text-slate-200 text-[10px]">
                      刷新
                    </button>
                    <button onClick={() => setActiveJobId(null)} className="text-slate-500 hover:text-slate-300 text-[10px]">
                      关闭
                    </button>
                  </div>
                </div>
                <pre className="whitespace-pre-wrap leading-relaxed text-slate-300 font-mono text-[10px]">
                  {activeJobLogs}
                </pre>
              </div>
            )}
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
