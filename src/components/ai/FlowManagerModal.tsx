import React, { useState, useEffect } from "react";
import { TenantFlowItem, SessionState, WorkflowLicenseStatus } from "../../../shared/types";
import { 
  Workflow, 
  FileCheck, 
  Search, 
  RefreshCw, 
  Play, 
  Power, 
  Copy, 
  GitBranch, 
  Trash2, 
  ExternalLink, 
  Sparkles, 
  X, 
  Check, 
  Loader2, 
  Layers, 
  Clock, 
  User, 
  ShieldCheck, 
  AlertCircle,
  FileCode,
  Tag,
  ArrowRight
} from "lucide-react";

interface FlowManagerModalProps {
  isOpen: boolean;
  crmSession: SessionState;
  licenseStatus?: WorkflowLicenseStatus | null;
  onClose: () => void;
  onSendToAiPrompt?: (promptText: string) => void;
  showToast: (type: "success" | "error" | "info", text: string) => void;
}

export const FlowManagerModal: React.FC<FlowManagerModalProps> = ({
  isOpen,
  crmSession,
  licenseStatus,
  onClose,
  onSendToAiPrompt,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<1 | 2>(1); // 1: 自动流程, 2: 审批流
  const [flows, setFlows] = useState<TenantFlowItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "draft" | "disabled">("all");

  // 操作状态
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // 复制弹窗状态
  const [copyTargetFlow, setCopyTargetFlow] = useState<TenantFlowItem | null>(null);
  const [copyFlowName, setCopyFlowName] = useState("");
  const [copyActKey, setCopyActKey] = useState("");
  const [copyDescription, setCopyDescription] = useState("");
  const [isSubmittingCopy, setIsSubmittingCopy] = useState(false);

  // 详情抽屉状态
  const [detailTargetFlow, setDetailTargetFlow] = useState<TenantFlowItem | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadFlows = async () => {
    if (!window.neoApi?.workflowListTenantFlows) return;
    setLoading(true);
    try {
      const res = await window.neoApi.workflowListTenantFlows({ procType: activeTab });
      if (res.success && Array.isArray(res.data)) {
        setFlows(res.data);
      } else {
        showToast("error", res.error || "获取流程列表失败");
      }
    } catch (e: any) {
      showToast("error", `加载异常: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadFlows();
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  // 启停切换
  const handleToggleStatus = async (flow: TenantFlowItem) => {
    if (!window.neoApi?.workflowToggleStatus) return;
    const willEnable = flow.status !== 1;
    setActionLoadingId(`status_${flow.id}`);

    try {
      const res = await window.neoApi.workflowToggleStatus(flow.procdefId, willEnable, flow.procType);
      if (res.success) {
        showToast("success", `流程 [${flow.name}] 已${willEnable ? "启用" : "禁用"}！`);
        await loadFlows();
      } else {
        showToast("error", `操作失败: ${res.error || "未知原因"}`);
      }
    } catch (e: any) {
      showToast("error", `操作异常: ${e.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // 打开复制弹窗
  const handleOpenCopy = (flow: TenantFlowItem) => {
    setCopyTargetFlow(flow);
    setCopyFlowName(`${flow.name}_副本`);
    setCopyActKey(`flow_${Date.now()}`);
    setCopyDescription(flow.description ? `基于 [${flow.name}] 复制: ${flow.description}` : "流程复制副本");
  };

  // 提交复制
  const handleSubmitCopy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!copyTargetFlow || !window.neoApi?.workflowCopyFlow) return;
    if (!copyFlowName.trim()) {
      showToast("error", "请输入新流程名称");
      return;
    }

    setIsSubmittingCopy(true);
    try {
      const res = await window.neoApi.workflowCopyFlow({
        procdefId: copyTargetFlow.procdefId,
        processName: copyFlowName.trim(),
        actKey: copyActKey.trim() || `flow_${Date.now()}`,
        description: copyDescription.trim(),
        entityApiKey: copyTargetFlow.entityApiKey || "account",
        entityId: "0",
        procType: copyTargetFlow.procType,
      });

      if (res.success) {
        showToast("success", `🎉 流程成功复制为新草稿！(ID: ${res.newProcdefId})`);
        setCopyTargetFlow(null);
        await loadFlows();
      } else {
        showToast("error", `复制失败: ${res.error || "未知原因"}`);
      }
    } catch (e: any) {
      showToast("error", `复制异常: ${e.message}`);
    } finally {
      setIsSubmittingCopy(false);
    }
  };

  // 修订新版本
  const handleReviseVersion = async (flow: TenantFlowItem) => {
    if (!window.neoApi?.workflowReviseVersion) return;
    if (!confirm(`确定要为 [${flow.name}] 创建新的设计态修订版本吗？创建后您可以在新版本上编辑而不影响当前版本运行。`)) {
      return;
    }

    setActionLoadingId(`revise_${flow.id}`);
    try {
      const res = await window.neoApi.workflowReviseVersion(flow.procdefId, flow.procType);
      if (res.success) {
        showToast("success", `🎉 成功创建修订版本 (ID: ${res.newProcdefId})，已进入设计态草稿！`);
        await loadFlows();
      } else {
        showToast("error", `修订版本创建失败: ${res.error || "未知原因"}`);
      }
    } catch (e: any) {
      showToast("error", `修订异常: ${e.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // 查看流程详情
  const handleViewDetail = async (flow: TenantFlowItem) => {
    setDetailTargetFlow(flow);
    setDetailData(null);
    setLoadingDetail(true);
    try {
      if (window.neoApi?.workflowGetFlowDetail) {
        const res = await window.neoApi.workflowGetFlowDetail(flow.procdefId, flow.procType);
        if (res.success) {
          setDetailData(res.definition);
        } else {
          showToast("error", res.error || "获取详情失败");
        }
      }
    } catch (e: any) {
      showToast("error", `获取详情异常: ${e.message}`);
    } finally {
      setLoadingDetail(false);
    }
  };

  // 发送给 AI 优化
  const handleSendToAi = (flow: TenantFlowItem) => {
    if (!onSendToAiPrompt) return;
    const promptText = `请调阅并深度分析当前租户中已存在的流程【${flow.name}】（procdefId: ${flow.procdefId}，流程类型: ${flow.procType === 1 ? "自动流程" : "新版审批流"}，主对象: ${flow.objectName}）。
我希望基于该流程进行优化与规则微调，请首先帮我提取出该流程现有的节点拓扑、网关分支条件与执行动作，并指导我进行针对性升级！`;

    onSendToAiPrompt(promptText);
    onClose();
    showToast("info", `已将流程 [${flow.name}] 带入 AI 对话平台`);
  };

  // 过滤列表
  const filteredFlows = flows.filter((f) => {
    // 状态过滤
    if (statusFilter === "enabled" && f.status !== 1) return false;
    if (statusFilter === "draft" && f.status !== 3) return false;
    if (statusFilter === "disabled" && f.status !== 2) return false;

    // 关键词过滤
    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      return (
        f.name.toLowerCase().includes(kw) ||
        f.objectName.toLowerCase().includes(kw) ||
        (f.description && f.description.toLowerCase().includes(kw))
      );
    }
    return true;
  });

  const enabledCount = flows.filter((f) => f.status === 1).length;
  const draftCount = flows.filter((f) => f.status === 3).length;
  const disabledCount = flows.filter((f) => f.status === 2).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-5xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* 顶部标题区 */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 via-teal-50/20 to-indigo-50/20 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-teal-600 via-sky-600 to-indigo-600 text-white shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-base text-slate-900">
                  租户流程资产中心 (Flow Center)
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono font-semibold border border-slate-200">
                  {crmSession.tokenData?.userInfo?.tenantName || "当前租户"}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                实时浏览、管理当前环境已配置的自动流程与审批流，支持启停控制、版本克隆与 AI 联动优化
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 工具栏：类型 Tab + 搜索过滤 */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* 左侧流程类型 Tab */}
          <div className="flex p-1 bg-white rounded-xl border border-slate-200 shadow-2xs">
            <button
              onClick={() => setActiveTab(1)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 1
                  ? "bg-teal-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Workflow className="w-3.5 h-3.5" />
              <span>自动流程 (Automatic Flow · procType=1)</span>
            </button>
            <button
              onClick={() => setActiveTab(2)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 2
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <FileCheck className="w-3.5 h-3.5" />
              <span>新版审批流 (Approval Flow · procType=2)</span>
            </button>
          </div>

          {/* 右侧搜索与状态过滤 */}
          <div className="flex items-center space-x-2">
            {/* 状态过滤胶囊 */}
            <div className="flex items-center space-x-1 bg-white px-2 py-1 rounded-xl border border-slate-200 text-[11px]">
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-2 py-0.5 rounded-md font-medium cursor-pointer ${
                  statusFilter === "all" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                全部 ({flows.length})
              </button>
              <button
                onClick={() => setStatusFilter("enabled")}
                className={`px-2 py-0.5 rounded-md font-medium cursor-pointer ${
                  statusFilter === "enabled" ? "bg-emerald-600 text-white" : "text-emerald-700 hover:bg-emerald-50"
                }`}
              >
                启用 ({enabledCount})
              </button>
              <button
                onClick={() => setStatusFilter("draft")}
                className={`px-2 py-0.5 rounded-md font-medium cursor-pointer ${
                  statusFilter === "draft" ? "bg-amber-600 text-white" : "text-amber-700 hover:bg-amber-50"
                }`}
              >
                设计态 ({draftCount})
              </button>
              <button
                onClick={() => setStatusFilter("disabled")}
                className={`px-2 py-0.5 rounded-md font-medium cursor-pointer ${
                  statusFilter === "disabled" ? "bg-slate-600 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                禁用 ({disabledCount})
              </button>
            </div>

            {/* 搜索框 */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索流程名或对象..."
                className="w-48 pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500 shadow-2xs"
              />
            </div>

            {/* 刷新 */}
            <button
              onClick={loadFlows}
              disabled={loading}
              className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 cursor-pointer shadow-2xs"
              title="刷新列表"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* 流程列表区 */}
        <div className="p-6 overflow-y-auto flex-1 space-y-3 text-xs bg-slate-50/40">
          {loading && flows.length === 0 ? (
            <div className="py-24 text-center text-slate-400 space-y-2">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-600" />
              <p>正在读取当前租户流程资产列表...</p>
            </div>
          ) : filteredFlows.length === 0 ? (
            <div className="py-24 text-center text-slate-400 space-y-2">
              <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-slate-600 font-medium">未找到匹配的流程记录</p>
              <p className="text-[11px] text-slate-400">您可以尝试清空搜索条件，或在 AI 对话平台设计并部署新流程</p>
            </div>
          ) : (
            filteredFlows.map((flow) => {
              const isEnabled = flow.status === 1;
              const isDraft = flow.status === 3;
              const isDisabled = flow.status === 2;

              return (
                <div
                  key={flow.id}
                  className={`p-4 rounded-2xl border transition-all bg-white shadow-2xs hover:shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                    isEnabled
                      ? "border-emerald-200/80 hover:border-emerald-300"
                      : isDraft
                      ? "border-amber-200/80 hover:border-amber-300"
                      : "border-slate-200 hover:border-slate-300 opacity-80"
                  }`}
                >
                  {/* 左侧信息 */}
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border flex items-center space-x-1 ${
                        isEnabled
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : isDraft
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-slate-100 text-slate-600 border-slate-200"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          isEnabled ? "bg-emerald-500 animate-pulse" : isDraft ? "bg-amber-500" : "bg-slate-400"
                        }`} />
                        <span>{flow.statusName}</span>
                      </span>

                      <h4 className="font-bold text-slate-900 text-sm truncate">{flow.name}</h4>

                      <span className="text-[10px] px-2 py-0.2 rounded-md bg-slate-100 text-slate-600 font-medium border border-slate-200">
                        {flow.objectName}
                      </span>
                    </div>

                    {flow.description && (
                      <p className="text-[11px] text-slate-500 line-clamp-1">{flow.description}</p>
                    )}

                    <div className="flex items-center space-x-3 text-[10px] text-slate-400 pt-0.5">
                      <span className="font-mono">ID: {flow.procdefId}</span>
                      {flow.executeType && (
                        <span>触发: {flow.executeType}</span>
                      )}
                      {flow.updatedAt && (
                        <span className="flex items-center space-x-0.5">
                          <Clock className="w-3 h-3 text-slate-300" />
                          <span>更新: {flow.updatedAt}</span>
                        </span>
                      )}
                      {flow.updatedByName && (
                        <span className="flex items-center space-x-0.5">
                          <User className="w-3 h-3 text-slate-300" />
                          <span>{flow.updatedByName}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 右侧快捷操作按钮群 */}
                  <div className="flex items-center space-x-1.5 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                    {/* 状态切换 */}
                    <button
                      onClick={() => handleToggleStatus(flow)}
                      disabled={actionLoadingId === `status_${flow.id}`}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1 cursor-pointer transition-all shadow-2xs ${
                        isEnabled
                          ? "bg-slate-100 hover:bg-slate-200 text-slate-700"
                          : "bg-emerald-600 hover:bg-emerald-500 text-white"
                      }`}
                    >
                      {actionLoadingId === `status_${flow.id}` ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Power className="w-3.5 h-3.5" />
                      )}
                      <span>{isEnabled ? "禁用" : "启用"}</span>
                    </button>

                    {/* 复制流程 */}
                    <button
                      onClick={() => handleOpenCopy(flow)}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center space-x-1 cursor-pointer shadow-2xs"
                      title="复制为新流程族"
                    >
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>复制</span>
                    </button>

                    {/* 修订新版本 */}
                    <button
                      onClick={() => handleReviseVersion(flow)}
                      disabled={actionLoadingId === `revise_${flow.id}`}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center space-x-1 cursor-pointer shadow-2xs"
                      title="基于该流程创建新修订版本"
                    >
                      {actionLoadingId === `revise_${flow.id}` ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <GitBranch className="w-3.5 h-3.5 text-indigo-500" />
                      )}
                      <span>修订版本</span>
                    </button>

                    {/* 查阅详情 */}
                    <button
                      onClick={() => handleViewDetail(flow)}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center space-x-1 cursor-pointer shadow-2xs"
                    >
                      <Layers className="w-3.5 h-3.5 text-sky-500" />
                      <span>详情</span>
                    </button>

                    {/* 发送给 AI 优化 */}
                    {onSendToAiPrompt && (
                      <button
                        onClick={() => handleSendToAi(flow)}
                        className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-semibold flex items-center space-x-1 cursor-pointer shadow-xs"
                        title="将该流程带入 AI 对话平台进行调阅、增删节点或修改规则"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>AI 优化/修改</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 底部信息栏 */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between text-slate-400 text-xs shrink-0 select-none">
          <div className="flex items-center space-x-1.5">
            <ShieldCheck className="w-4 h-4 text-teal-600" />
            <span>实时连接销售易租户流程中心 · 严格执行平台版本隔离与启停准则</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium cursor-pointer"
          >
            关闭
          </button>
        </div>
      </div>

      {/* 复制流程弹窗 */}
      {copyTargetFlow && (
        <div className="fixed inset-0 z-60 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-md shadow-2xl p-5 space-y-4 text-xs animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Copy className="w-4 h-4 text-teal-600" />
                <h4 className="font-bold text-sm text-slate-800">
                  复制流程为新流程 ({copyTargetFlow.procType === 1 ? "自动流程" : "审批流"})
                </h4>
              </div>
              <button onClick={() => setCopyTargetFlow(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitCopy} className="space-y-3">
              <div>
                <label className="block text-slate-600 font-medium mb-1">新流程名称 <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  required
                  value={copyFlowName}
                  onChange={(e) => setCopyFlowName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500 font-medium text-slate-800"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">流程 API Key <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  required
                  value={copyActKey}
                  onChange={(e) => setCopyActKey(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-mono text-slate-800 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">流程描述</label>
                <textarea
                  rows={2}
                  value={copyDescription}
                  onChange={(e) => setCopyDescription(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-slate-800 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCopyTargetFlow(null)}
                  disabled={isSubmittingCopy}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-600"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCopy}
                  className="px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold flex items-center space-x-1 disabled:opacity-50"
                >
                  {isSubmittingCopy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>确认复制</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 查看详情抽屉/浮层 */}
      {detailTargetFlow && (
        <div className="fixed inset-0 z-60 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-2xl shadow-2xl p-6 space-y-4 text-xs max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                <h4 className="font-bold text-sm text-slate-800">
                  流程图模型与业务配置: {detailTargetFlow.name}
                </h4>
              </div>
              <button onClick={() => setDetailTargetFlow(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
              {loadingDetail ? (
                <div className="py-12 text-center text-slate-400">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-600 mb-2" />
                  <span>正在回读流程定义数据...</span>
                </div>
              ) : !detailData ? (
                <div className="py-12 text-center text-slate-400">未能读取到流程定义</div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 gap-2 text-[11px]">
                    <div><span className="text-slate-400">流程 ID:</span> <span className="font-mono">{detailTargetFlow.procdefId}</span></div>
                    <div><span className="text-slate-400">当前版本:</span> <span className="font-bold">V{detailData.baseInfo?.version || 1}</span></div>
                    <div><span className="text-slate-400">主业务对象:</span> <span>{detailTargetFlow.objectName}</span></div>
                    <div><span className="text-slate-400">当前状态:</span> <span className="font-bold text-emerald-600">{detailTargetFlow.statusName}</span></div>
                  </div>

                  {/* 节点列表 */}
                  <div className="space-y-1.5">
                    <div className="font-bold text-slate-800 flex items-center justify-between">
                      <span>图模型节点 ({Object.keys(detailData.nodeInfo || {}).length} 个)</span>
                    </div>
                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-48 overflow-y-auto">
                      {Object.entries(detailData.nodeInfo || {}).map(([key, n]: any, idx) => (
                        <div key={key} className="p-2 flex items-center justify-between bg-white text-[11px]">
                          <div className="flex items-center space-x-2">
                            <span className="text-slate-400 font-mono">{idx + 1}.</span>
                            <span className="font-bold text-slate-800">{n.taskDefName || n.label}</span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-mono">
                              {n.nodeType}
                            </span>
                          </div>
                          <span className="font-mono text-slate-400 text-[10px]">{key}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 网关条件 */}
                  {detailData.businessConfig?.gateWays?.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="font-bold text-slate-800">网关分支配置 ({detailData.businessConfig.gateWays.length} 个)</div>
                      <div className="border border-slate-200 rounded-xl p-2.5 bg-slate-50 space-y-1.5 text-[11px]">
                        {detailData.businessConfig.gateWays.map((gw: any, gi: number) => (
                          <div key={gi} className="space-y-1">
                            <div className="font-semibold text-purple-800">{gw.gateWayName || "网关"}</div>
                            <div className="pl-2 space-y-0.5 text-slate-600">
                              {(gw.conditions || []).map((cd: any, ci: number) => (
                                <div key={ci} className="flex items-center space-x-1.5">
                                  <span className="text-slate-400 font-mono">分支:</span>
                                  <span className="font-medium">{cd.seqFlowName}</span>
                                  {cd.condition?.defaultFlow && <span className="text-[9px] bg-slate-200 px-1 rounded">默认</span>}
                                  <span className="text-slate-400">➔ 目标: {cd.targetId || cd.tagertId}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              {onSendToAiPrompt && detailTargetFlow && (
                <button
                  type="button"
                  onClick={() => {
                    const f = detailTargetFlow;
                    setDetailTargetFlow(null);
                    handleSendToAi(f);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center space-x-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>以此流程为蓝本咨询 AI</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setDetailTargetFlow(null)}
                className="px-4 py-1.5 rounded-xl border border-slate-200 text-slate-600"
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
