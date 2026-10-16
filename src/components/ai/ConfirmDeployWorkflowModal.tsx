import React, { useState, useEffect } from "react";
import { SessionState, WorkflowDeployPlan, WorkflowDeployResult, WorkflowLicenseStatus, TenantFlowItem } from "../../../shared/types";
import { 
  Workflow, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  Layers, 
  ShieldCheck, 
  KeyRound, 
  Download, 
  Play, 
  Database, 
  Repeat, 
  Split, 
  ArrowRight,
  ArrowLeft,
  Globe,
  Edit3,
  Check,
  FileCode,
  Lock,
  Unlock,
  SlidersHorizontal,
  CheckSquare,
  Square,
  ExternalLink,
  Sparkles,
  Info
} from "lucide-react";

interface ConfirmDeployWorkflowModalProps {
  plan: WorkflowDeployPlan;
  crmSession: SessionState;
  licenseStatus?: WorkflowLicenseStatus | null;
  onOpenLicenseModal?: () => void;
  onClose: () => void;
  onRefreshSession: () => void;
  onSendDiagnosticToAi?: (diagnosticMessage: string) => void;
  showToast: (type: "success" | "error" | "info", text: string) => void;
}

export const ConfirmDeployWorkflowModal: React.FC<ConfirmDeployWorkflowModalProps> = ({
  plan,
  crmSession,
  licenseStatus,
  onOpenLicenseModal,
  onClose,
  onRefreshSession,
  onSendDiagnosticToAi,
  showToast,
}) => {
  // 当前向导步骤: 1 凭证核验, 2 对象与入口, 3 分支与回写, 4 部署与执行
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // 可编辑流程属性
  // 部署目标模式: "update" 调整/更新租户现有自动流程, "create" 新建独立流程族
  const [deployTargetMode, setDeployTargetMode] = useState<"update" | "create">(
    plan?.flow?.targetMode || (plan?.flow?.targetProcdefId ? "update" : "update")
  );
  const [existingFlows, setExistingFlows] = useState<TenantFlowItem[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string>(String(plan?.flow?.targetProcdefId || ""));
  const [loadingFlows, setLoadingFlows] = useState<boolean>(false);

  // 可编辑流程属性
  const [processName, setProcessName] = useState(plan?.flow?.processName || "");
  const [actKey, setActKey] = useState(plan?.flow?.actKey || "");
  const [entityApiKey, setEntityApiKey] = useState(plan?.flow?.entityApiKey || "");
  const [description, setDescription] = useState(plan?.flow?.description || "");
  const [executeTypes, setExecuteTypes] = useState<string[]>(
    plan?.flow?.executeType ? String(plan.flow.executeType).split(",").map((s) => s.trim()) : ["1"]
  );

  // 用户确认勾选项
  const [rulesConfirmed, setRulesConfirmed] = useState(false);

  // 部署模式选项
  const [autoEnable, setAutoEnable] = useState(false);

  // Cookie 状态与手动配置
  const [localCookieString, setLocalCookieString] = useState(crmSession?.tokenData?.cookieString || "");
  const [localCookieCount, setLocalCookieCount] = useState(crmSession?.tokenData?.cookies?.length || 0);
  const [cookieModalOpen, setCookieModalOpen] = useState(false);
  const [manualCookieInput, setManualCookieInput] = useState(crmSession?.tokenData?.cookieString || "");
  const [isCapturingCookie, setIsCapturingCookie] = useState(false);

  // 部署进度与结果
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<WorkflowDeployResult | null>(null);

  const cookieString = localCookieString;
  const hasCookie = Boolean(cookieString && cookieString.trim());
  const isRealAdminCookie = Boolean(
    cookieString &&
      (cookieString.includes("x-ienterprise-passport") ||
        cookieString.includes("AUC_SESSION") ||
        cookieString.includes("JSESSIONID") ||
        cookieString.includes("c-full-server-name"))
  );

  // 触发入口选择处理
  const toggleExecuteType = (typeVal: string) => {
    setExecuteTypes((prev) =>
      prev.includes(typeVal)
        ? prev.filter((t) => t !== typeVal)
        : [...prev, typeVal]
    );
  };

  // 初始化加载租户现有自动流程列表
  useEffect(() => {
    if (window.neoApi?.workflowListTenantFlows) {
      setLoadingFlows(true);
      window.neoApi.workflowListTenantFlows({ procType: 1 })
        .then((res) => {
          if (res.success && Array.isArray(res.data)) {
            setExistingFlows(res.data);
            const matched = res.data.find(
              (f) =>
                f.name === plan.flow.processName ||
                (f.entityApiKey && f.entityApiKey.toLowerCase() === plan.flow.entityApiKey.toLowerCase()) ||
                f.name.includes(plan.flow.processName) ||
                plan.flow.processName.includes(f.name)
            );
            if (matched && !selectedFlowId) {
              setSelectedFlowId(matched.procdefId);
              setProcessName(matched.name);
              if (matched.description) setDescription(matched.description);
            }
          }
        })
        .finally(() => setLoadingFlows(false));
    }
  }, []);

  const handleSelectExistingFlow = (flowProcdefId: string) => {
    setSelectedFlowId(flowProcdefId);
    const hit = existingFlows.find((f) => f.procdefId === flowProcdefId || f.id === flowProcdefId);
    if (hit) {
      setProcessName(hit.name);
      if (hit.description) setDescription(hit.description);
      if (hit.entityApiKey) setEntityApiKey(hit.entityApiKey);
    }
  };

  const selectedTargetFlow = existingFlows.find(
    (f) => f.procdefId === selectedFlowId || f.id === selectedFlowId
  );

  // 唤起内嵌窗口捕获后台 Cookie
  const handleCaptureCookie = async () => {
    if (!window.neoApi?.captureWebCookie) return;
    setIsCapturingCookie(true);
    try {
      const updated = await window.neoApi.captureWebCookie();
      onRefreshSession();
      const newStr = updated.tokenData?.cookieString || "";
      setLocalCookieString(newStr);
      setLocalCookieCount(updated.tokenData?.cookies?.length || 1);
      setManualCookieInput(newStr);
      if (newStr.includes("x-ienterprise-passport") || newStr.includes("AUC_SESSION")) {
        showToast("success", "✅ 后台 Web 管理员会话 Cookie 捕获成功！");
      } else if (newStr) {
        showToast("info", "已捕获 Cookie，若尚未在弹窗中登录后台请重新捕获并完成登录");
      }
    } catch (e: any) {
      showToast("error", `捕获失败: ${e.message}`);
    } finally {
      setIsCapturingCookie(false);
    }
  };

  const hasIssues = Boolean(
    deployResult &&
    (!deployResult.success ||
     deployResult.hasWarning ||
     deployResult.stepsLog?.some((s) => s.status === "warn" || s.status === "error"))
  );

  const handleSendDiagnosticsToAi = () => {
    if (!onSendDiagnosticToAi || !deployResult) return;

    const logLines = (deployResult.stepsLog || [])
      .map((s) => `[${s.status.toUpperCase()}] ${s.step}: ${s.message}${s.timeMs ? ` (${s.timeMs}ms)` : ""}`)
      .join("\n");

    const failedStep = deployResult.stepsLog?.find((s) => s.status === "warn" || s.status === "error");

    const prompt = `我刚才在部署自动流程【${processName}】时服务端返回了报错，导致流程未能成功激活启用。请结合当前会话的上下文与此前的流程设计方案，深度分析为什么会报以下错误，并重新生成完全合规的修复方案代码块（\`\`\`json:workflow-plan）供我重新一键部署：

【服务端全流程调用日志】：
\`\`\`text
${logLines}
\`\`\`

【关键报错排查诉求】：
1. 深度穿透分析报错根因：${failedStep?.message || "流程校验未通过"}；
2. 修复流程拓扑结构与节点属性（确保开始节点、网关分支条件、动作绑定、结束节点均合规闭环）；
3. 修复后，直接输出完整的 \`\`\`json:workflow-plan 代码块，以便我立即重新一键部署生效！`;

    onSendDiagnosticToAi(prompt);
  };

  // 保存手动输入的 Cookie
  const handleSaveManualCookie = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.neoApi?.updateSessionCookie) return;
    try {
      const updated = await window.neoApi.updateSessionCookie(manualCookieInput.trim());
      onRefreshSession();
      setLocalCookieString(updated.tokenData?.cookieString || manualCookieInput.trim());
      setLocalCookieCount(updated.tokenData?.cookies?.length || 1);
      setCookieModalOpen(false);
      showToast("success", "✅ 会话 Cookie 更新成功");
    } catch (e: any) {
      showToast("error", `更新失败: ${e.message}`);
    }
  };

  // 导出参数化配置 JSON 文件
  const handleExportJson = () => {
    const exportData = {
      flow: {
        processName,
        actKey,
        entityApiKey,
        executeType: executeTypes.join(","),
        description,
        enableIntelligentMode: 2,
      },
      variables: plan.variables,
      nodes: plan.nodes,
      branches: plan.branches,
      edges: plan.edges,
      exportedAt: new Date().toISOString(),
      generator: "NeoCRM Desktop Studio - Workflow Architect",
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${actKey || "automatic_flow"}_config.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("success", `已导出自动流程配置文件: ${actKey}.json`);
  };

  // 步骤推进与校验
  const handleNextFromStep1 = () => {
    if (!crmSession.isLoggedIn) {
      showToast("error", "请先在工作台登录销售易租户");
      return;
    }
    if (!hasCookie) {
      showToast("error", "尚未获取后台管理员 Web 会话 Cookie，请先点击【捕获/刷新 Cookie】");
      return;
    }
    setCurrentStep(2);
  };

  const handleNextFromStep2 = () => {
    if (!processName.trim()) {
      showToast("error", "请输入流程名称");
      return;
    }
    if (!actKey.trim()) {
      showToast("error", "请输入流程 API Key");
      return;
    }
    if (!entityApiKey.trim()) {
      showToast("error", "请输入主关联对象 API Key");
      return;
    }
    setCurrentStep(3);
  };

  const handleNextFromStep3 = () => {
    if (!rulesConfirmed) {
      showToast("info", "请先勾选底部的【我已核对上述节点流转逻辑与字段回写设置】确认项");
      return;
    }
    setCurrentStep(4);
  };

  // 执行代码部署
  const handleExecuteDeploy = async () => {
    const compiledPlan: WorkflowDeployPlan = {
      flow: {
        processName: processName.trim(),
        actKey: actKey.trim(),
        entityApiKey: entityApiKey.trim(),
        executeType: executeTypes.length > 0 ? executeTypes.join(",") : "1",
        description: description.trim(),
        enableIntelligentMode: 2,
        targetMode: deployTargetMode,
        targetProcdefId: deployTargetMode === "update" ? (selectedTargetFlow?.procdefId || selectedFlowId) : undefined,
        targetStatus: deployTargetMode === "update" ? selectedTargetFlow?.status : undefined,
      },
      variables: plan.variables,
      nodes: plan.nodes,
      branches: plan.branches,
      edges: plan.edges,
    };

    setIsDeploying(true);
    setDeployResult(null);

    try {
      if (!window.neoApi?.workflowDeployPlan) {
        throw new Error("当前环境不支持自动流程部署 API");
      }

      const res = await window.neoApi.workflowDeployPlan(compiledPlan, { autoEnable });
      setDeployResult(res);

      if (res.success) {
        showToast("success", `🎉 流程 [${processName}] 部署成功！${res.statusText}`);
      } else {
        showToast("error", `部署遇到问题: ${res.error || "请查看下方执行日志"}`);
      }
    } catch (e: any) {
      setDeployResult({
        success: false,
        error: e.message || "部署过程中发生异常",
        stepsLog: [{ step: "部署调用异常", status: "error", message: e.message }],
      });
      showToast("error", `部署失败: ${e.message}`);
    } finally {
      setIsDeploying(false);
    }
  };

  const stepsList = [
    { num: 1, title: "凭证核验", desc: "环境与Cookie" },
    { num: 2, title: "对象与时机", desc: "身份与触发入口" },
    { num: 3, title: "规则与回写", desc: "节点分支核对" },
    { num: 4, title: "部署与执行", desc: "选项与代码编排" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* 顶部标题与授权徽标 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-teal-50/70 to-emerald-50/40 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-teal-600 text-white shadow-xs">
              <Workflow className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-slate-800">
                  自动流程配置向导与代码部署 (Automatic Flow)
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 font-mono font-semibold">
                  procType=1
                </span>
                {licenseStatus?.isAuthorized ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium flex items-center space-x-1">
                    <Unlock className="w-2.5 h-2.5 text-emerald-600" />
                    <span>已激活 (余{licenseStatus.remainingDays}天)</span>
                  </span>
                ) : (
                  <button
                    onClick={onOpenLicenseModal}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium flex items-center space-x-1 hover:bg-amber-100 cursor-pointer"
                  >
                    <Lock className="w-2.5 h-2.5 text-amber-600" />
                    <span>未激活授权</span>
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                整体引导式分步核对与确认 · 全程防止盲目部署与字段错漏
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportJson}
              className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition-colors cursor-pointer"
              title="导出自动流程配置方案 JSON"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              disabled={isDeploying}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 顶部四步导航指示器 (Step Wizard Indicator) */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
          {stepsList.map((st, idx) => {
            const isActive = currentStep === st.num;
            const isPassed = currentStep > st.num;

            return (
              <React.Fragment key={st.num}>
                <div
                  onClick={() => {
                    if (!isDeploying && isPassed) setCurrentStep(st.num as any);
                  }}
                  className={`flex items-center space-x-2.5 cursor-pointer transition-colors ${
                    isActive
                      ? "text-teal-700 font-bold"
                      : isPassed
                      ? "text-slate-700 hover:text-teal-600 font-medium"
                      : "text-slate-400 cursor-not-allowed"
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono transition-all ${
                      isActive
                        ? "bg-teal-600 text-white shadow-xs scale-105"
                        : isPassed
                        ? "bg-teal-100 text-teal-800"
                        : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {isPassed ? <Check className="w-3.5 h-3.5" /> : st.num}
                  </div>
                  <div className="text-left">
                    <div className="text-xs leading-none">{st.title}</div>
                    <div className="text-[10px] text-slate-400 font-normal mt-0.5">{st.desc}</div>
                  </div>
                </div>

                {idx < stepsList.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-3 ${isPassed ? "bg-teal-300" : "bg-slate-200"}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* 主体滚动区 */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* ======================= 步骤 1: 凭证核验 ======================= */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 bg-sky-50/60 rounded-2xl border border-sky-200 text-sky-900 flex items-start space-x-3">
                <Info className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-sm text-sky-950">步骤 1 引导：环境与管理员会话核验</div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    销售易自动流程的代码级部署依赖<strong>租户真实环境信息</strong>及后台管理员 Web 会话（Cookie 凭证）。请确认目标租户信息正确，且已成功捕获会话 Cookie。
                  </p>
                </div>
              </div>

              {/* 租户卡片 */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3">
                <h4 className="font-bold text-slate-800 text-sm flex items-center space-x-2">
                  <Globe className="w-4 h-4 text-teal-600" />
                  <span>当前连接的销售易租户事实</span>
                </h4>
                <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50/60 p-3.5 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-slate-400">租户名称:</span>
                    <span className="ml-2 font-bold text-slate-800">{crmSession?.tokenData?.userInfo?.tenantName || "未命名租户"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">租户 ID (Tenant ID):</span>
                    <span className="ml-2 font-mono font-bold text-slate-800">{crmSession?.tokenData?.tenant_id || "未知"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">操作用户:</span>
                    <span className="ml-2 font-medium text-slate-800">{crmSession?.tokenData?.userInfo?.name || "未知用户"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">环境类型:</span>
                    <span className="ml-2 font-medium text-slate-800">{crmSession?.environment?.name || "生产环境"}</span>
                  </div>
                </div>
              </div>

              {/* Cookie 状态栏 */}
              <div className={`p-4 rounded-2xl border flex items-center justify-between ${
                hasCookie
                  ? isRealAdminCookie
                    ? "bg-emerald-50/60 border-emerald-200 text-emerald-900"
                    : "bg-amber-50/70 border-amber-200 text-amber-900"
                  : "bg-rose-50/70 border-rose-200 text-rose-900"
              }`}>
                <div className="flex items-center space-x-3 min-w-0">
                  <div className={`p-2 rounded-xl shrink-0 ${
                    hasCookie ? (isRealAdminCookie ? "bg-emerald-600 text-white" : "bg-amber-600 text-white") : "bg-rose-600 text-white"
                  }`}>
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold flex items-center space-x-1.5">
                      <span>后台 Web 管理员会话 Cookie:</span>
                      <span>{hasCookie ? (isRealAdminCookie ? "已就绪" : "已配置 (缺少关键凭证)") : "未配置 (阻断部署)"}</span>
                    </div>
                    <p className="text-[11px] opacity-80 truncate mt-0.5">
                      {hasCookie
                        ? `已挂载 ${localCookieCount} 个 Cookie 凭证项，可正常调用设计器内部 API 群`
                        : "自动流程内部设计接口群依赖租户管理员 Web 会话，请先点击右侧按钮登录捕获"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0 ml-3">
                  <button
                    type="button"
                    onClick={() => setCookieModalOpen(true)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer shadow-2xs"
                  >
                    手动配置
                  </button>
                  <button
                    type="button"
                    onClick={handleCaptureCookie}
                    disabled={isCapturingCookie}
                    className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold flex items-center space-x-1 cursor-pointer shadow-2xs disabled:opacity-50"
                  >
                    {isCapturingCookie ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>正在登录捕获...</span>
                      </>
                    ) : (
                      <>
                        <Globe className="w-3.5 h-3.5" />
                        <span>捕获/刷新 Cookie</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ======================= 步骤 2: 部署目标与对象确认 ======================= */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 bg-sky-50/60 rounded-2xl border border-sky-200 text-sky-900 flex items-start space-x-3">
                <Info className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-sm text-sky-950">步骤 2 引导：确认发布模式（版本升级 vs 新建流程）</div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    如果您是<strong>优化、调整现有线上自动流程</strong>，请选择【为租户现有流程升级发布新版本】。系统将自动在原流程族下创建新版本（如 V1 ➔ V2），绝不创建多余的新流！
                  </p>
                </div>
              </div>

              {/* 核心模式切换卡片 */}
              <div className="space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div
                    onClick={() => setDeployTargetMode("update")}
                    className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${
                      deployTargetMode === "update"
                        ? "bg-teal-50/90 border-teal-500 shadow-2xs text-teal-950 font-bold"
                        : "bg-white border-slate-200 hover:border-slate-300 text-slate-700"
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="deployTargetModeWf"
                        checked={deployTargetMode === "update"}
                        onChange={() => setDeployTargetMode("update")}
                        className="text-teal-600 cursor-pointer"
                      />
                      <span className="text-xs font-bold">🚀 为现有流程升级发布新版本 (推荐)</span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-normal mt-1.5 pl-5 leading-relaxed">
                      在原有流程族下升级版本（如 V1 ➔ V2），不创建多余新流，保留历史记录与触发设置。
                    </p>
                  </div>

                  <div
                    onClick={() => setDeployTargetMode("create")}
                    className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${
                      deployTargetMode === "create"
                        ? "bg-teal-50/90 border-teal-500 shadow-2xs text-teal-950 font-bold"
                        : "bg-white border-slate-200 hover:border-slate-300 text-slate-700"
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="deployTargetModeWf"
                        checked={deployTargetMode === "create"}
                        onChange={() => setDeployTargetMode("create")}
                        className="text-teal-600 cursor-pointer"
                      />
                      <span className="text-xs font-bold">➕ 创建全新的独立流程族</span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-normal mt-1.5 pl-5 leading-relaxed">
                      仅在您需要从零注册一个全新的业务自动流程族时选用。
                    </p>
                  </div>
                </div>
              </div>

              {/* 模式 A: 升级现有流程 */}
              {deployTargetMode === "update" && (
                <div className="p-4 rounded-2xl border border-teal-200 bg-teal-50/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-slate-800 font-bold text-xs">
                      选择要升级的租户现有自动流程 <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[10px] text-teal-600 font-mono">
                      已探测到 {existingFlows.length} 个现有自动流程
                    </span>
                  </div>

                  <select
                    value={selectedFlowId}
                    onChange={(e) => handleSelectExistingFlow(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-teal-300 rounded-xl text-xs text-slate-800 font-medium focus:outline-none focus:border-teal-600 shadow-2xs"
                  >
                    <option value="">-- 请选择要升级版本的现有流程 --</option>
                    {existingFlows.map((f) => (
                      <option key={f.procdefId || f.id} value={f.procdefId || f.id}>
                        [V{f.version || 1} {f.statusName}] {f.name} (关联对象: {f.objectName || f.entityApiKey}, 最新: V{f.latestVersion || f.version || 1})
                      </option>
                    ))}
                  </select>

                  {selectedTargetFlow ? (
                    <div className="p-3.5 bg-white rounded-2xl border border-teal-200 shadow-2xs space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                          <span>{selectedTargetFlow.name}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            selectedTargetFlow.status === 1
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              : selectedTargetFlow.status === 3
                              ? "bg-amber-100 text-amber-800 border border-amber-200"
                              : "bg-slate-100 text-slate-700 border border-slate-200"
                          }`}>
                            当前: 版本 {selectedTargetFlow.version || 1} ({selectedTargetFlow.statusName})
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono">
                          流程族ID: {selectedTargetFlow.procInfoId}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <div>
                          <span className="text-slate-400">主业务对象:</span>
                          <span className="ml-1.5 font-bold text-slate-800">{selectedTargetFlow.objectName}</span>
                          <span className="text-slate-400 font-mono ml-1">({selectedTargetFlow.entityApiKey})</span>
                        </div>
                        <div>
                          <span className="text-slate-400">触发入口:</span>
                          <span className="ml-1.5 font-mono text-slate-800">{selectedTargetFlow.executeType || "创建、编辑"}</span>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-100 text-[11px] text-teal-950 leading-relaxed">
                        {selectedTargetFlow.status === 3 ? (
                          <span>
                            📝 <strong>草稿更新模式</strong>：当前目标处于【设计态草稿】，部署时将直接覆盖更新至此草稿版本，无需生成新流。
                          </span>
                        ) : (
                          <span>
                            🚀 <strong>新版本升级发布 (推荐)</strong>：系统将调用销售易官方升级接口，在该流程族下自动创建<strong>【版本 {(selectedTargetFlow.latestVersion || selectedTargetFlow.version || 1) + 1}】</strong>新版本并部署生效！原版本 ({selectedTargetFlow.version || 1}) 存档停用，历史记录完整保留，<strong>绝不产生任何多余新流</strong>！
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 italic">请在上方下拉列表中选择您想要升级或调整的现有流程</p>
                  )}
                </div>
              )}

              {/* 模式 B: 创建全新独立流程族 */}
              {deployTargetMode === "create" ? (
                <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 font-medium mb-1">
                        新流程名称 <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={processName}
                        onChange={(e) => setProcessName(e.target.value)}
                        placeholder="例如：服务工单自动分流派单"
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500 text-slate-800 font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 font-medium mb-1">
                        流程 API Key <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={actKey}
                        onChange={(e) => setActKey(e.target.value)}
                        placeholder="例如：ticketAutoDispatch_flow"
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-mono focus:outline-none focus:border-teal-500 text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 font-medium mb-1">
                        主关联对象 API Key <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={entityApiKey}
                        onChange={(e) => setEntityApiKey(e.target.value)}
                        placeholder="例如：case, account, equipmentMaintenance__c"
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-mono focus:outline-none focus:border-teal-500 text-slate-800 font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 font-medium mb-1">触发执行方式 (executeType)</label>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {[
                          { id: "1", label: "1 创建记录" },
                          { id: "2", label: "2 编辑记录" },
                          { id: "5", label: "5 平台事件" },
                          { id: "6", label: "6 页面按钮" },
                          { id: "7", label: "7 智能体操作" },
                        ].map((item) => (
                          <label
                            key={item.id}
                            className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg border cursor-pointer select-none transition-colors ${
                              executeTypes.includes(item.id)
                                ? "bg-teal-50 border-teal-300 text-teal-800 font-medium"
                                : "bg-white border-slate-200 text-slate-600"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={executeTypes.includes(item.id)}
                              onChange={() => toggleExecuteType(item.id)}
                              className="rounded text-teal-600 w-3 h-3"
                            />
                            <span className="text-[10px]">{item.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">流程描述</label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="说明业务场景与触发意图..."
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-slate-800"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-slate-500 font-medium mb-1">本次版本更新描述 (description)</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="简要说明本次版本升级的调整内容..."
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-teal-500 text-xs text-slate-800"
                  />
                </div>
              )}
            </div>
          )}
{/* ======================= 步骤 3: 分支与回写确认 ======================= */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 bg-sky-50/60 rounded-2xl border border-sky-200 text-sky-900 flex items-start space-x-3">
                <Info className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-sm text-sky-950">步骤 3 引导：逐项审查节点分支与回写动作</div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    请仔细核对每个<strong>网关分支的判断条件</strong>以及每个<strong>动作节点的回写字段</strong>。确认无误后勾选底部的确认项进入最终部署。
                  </p>
                </div>
              </div>

              {/* 节点列表审查 */}
              <div className="space-y-2 border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 max-h-60 overflow-y-auto">
                {plan.nodes.map((n, idx) => {
                  const isAction = n.nodeType === "ServiceTask";
                  const isQuery = n.nodeType === "QueryLog";
                  const isLoop = n.nodeType === "Loop";
                  const isGateway = n.nodeType === "ExclusiveGateway";
                  const isAssign = n.nodeType === "Assignment";

                  return (
                    <div key={n.id} className="p-3 bg-white hover:bg-slate-50/60 transition-colors">
                      <div className="flex items-center space-x-2">
                        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 font-mono text-[10px] flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <span className="font-bold text-slate-800">{n.name}</span>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-mono border ${
                            isAction
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200 font-bold"
                              : isQuery
                              ? "bg-sky-50 text-sky-800 border-sky-200"
                              : isLoop
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : isGateway
                              ? "bg-purple-50 text-purple-800 border-purple-200"
                              : isAssign
                              ? "bg-indigo-50 text-indigo-800 border-indigo-200"
                              : "bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                        >
                          {n.nodeType}
                        </span>
                      </div>

                      {/* 动作节点的字段回写详情展示 */}
                      {isAction && (
                        <div className="mt-1 pl-7 text-[11px] text-slate-600 space-y-0.5">
                          {n.actionConfig?.fieldUpdates && n.actionConfig.fieldUpdates.length > 0 ? (
                            <div className="flex items-center space-x-1.5 text-emerald-700">
                              <span className="text-slate-400 font-medium">回写字段:</span>
                              {n.actionConfig.fieldUpdates.map((fu: any, fi: number) => (
                                <span key={fi} className="bg-emerald-50 px-1.5 py-0.2 rounded font-mono border border-emerald-200">
                                  {fu.fieldLabel || fu.fieldApiKey} = {fu.value}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="text-slate-400">
                              动作类型: 更新记录 · 部署引擎将根据节点语义自主自适应匹配回写字段
                            </div>
                          )}
                        </div>
                      )}

                      {/* 网关分支条件展示 */}
                      {isGateway && (
                        <div className="mt-1 pl-7 text-[11px] text-purple-700">
                          <span>排他网关 · 自动编排默认兜底分支与条件分支判断</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 变量字典 */}
              {plan.variables.length > 0 && (
                <div className="p-3 bg-slate-50/70 rounded-2xl border border-slate-200 space-y-1.5">
                  <div className="font-semibold text-slate-700 text-xs">流程变量字典 ({plan.variables.length} 项)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.variables.map((v) => (
                      <span key={v.apiKey} className="px-2 py-0.5 bg-white border border-slate-200 rounded-md text-[10px] font-mono text-slate-700">
                        {v.describe || v.apiKey} ({v.apiKey}) : {v.variavleType === 2 ? "集合" : "单值"}
                      </span>
                    ))}
                  </div>

                  {/* 智能体诊断与自愈修复条带 */}
                  {hasIssues && (
                    <div className="p-3.5 bg-gradient-to-r from-amber-50 to-teal-50 rounded-2xl border border-amber-200 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center space-x-2.5 text-amber-950">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                        <div>
                          <div className="font-bold">服务端反馈流程拓扑或规则警告/异常</div>
                          <div className="text-[11px] text-amber-800">
                            未能立即激活启用流程版本（已保存为设计态草稿）。可一键发送给 AI 结合当前上下文自动分析报错根因并修复方案。
                          </div>
                        </div>
                      </div>
                      {onSendDiagnosticToAi && (
                        <button
                          type="button"
                          onClick={handleSendDiagnosticsToAi}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-semibold text-xs shadow-xs flex items-center space-x-1.5 shrink-0 cursor-pointer transition-all hover:scale-102"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>🤖 发送给 AI 诊断并修复</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 强制确认协议勾选 */}
              <div
                onClick={() => setRulesConfirmed(!rulesConfirmed)}
                className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex items-center space-x-3 select-none ${
                  rulesConfirmed
                    ? "bg-teal-50/80 border-teal-500 text-teal-900"
                    : "bg-white border-slate-300 hover:border-slate-400 text-slate-700"
                }`}
              >
                {rulesConfirmed ? (
                  <CheckSquare className="w-5 h-5 text-teal-600 shrink-0" />
                ) : (
                  <Square className="w-5 h-5 text-slate-400 shrink-0" />
                )}
                <div>
                  <div className="font-bold text-xs">
                    我已核对上述节点流转逻辑与字段回写设置，确认符合业务设计要求
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    勾选后可进入下一步，启动代码级生命周期自动编排与部署
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ======================= 步骤 4: 部署与执行 ======================= */}
          {currentStep === 4 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 bg-sky-50/60 rounded-2xl border border-sky-200 text-sky-900 flex items-start space-x-3">
                <Info className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-sm text-sky-950">步骤 4 引导：部署模式确认与自动化编排</div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    所有配置已核对完毕。请选择部署后的启用策略，点击开始部署即可自动执行全套 API 写入租户。
                  </p>
                </div>
              </div>

              {/* 清单概览 */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400">流程名称:</span>
                  <span className="ml-2 font-bold text-slate-800">{processName}</span>
                </div>
                <div>
                  <span className="text-slate-400">主对象:</span>
                  <span className="ml-2 font-mono font-bold text-slate-800">{entityApiKey}</span>
                </div>
                <div>
                  <span className="text-slate-400">总节点数:</span>
                  <span className="ml-2 font-semibold text-slate-800">{plan.nodes.length} 个节点</span>
                </div>
                <div>
                  <span className="text-slate-400">执行动作数:</span>
                  <span className="ml-2 font-semibold text-slate-800">{plan.nodes.filter(n => n.nodeType === "ServiceTask").length} 个动作</span>
                </div>
              </div>

              {/* 部署模式单选 */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2">
                <h4 className="font-bold text-slate-800">流程版本生命周期选项</h4>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <label
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      !autoEnable ? "bg-teal-50/60 border-teal-400 shadow-2xs font-semibold text-teal-900" : "bg-white border-slate-200 text-slate-600"
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="deployMode"
                        checked={!autoEnable}
                        onChange={() => setAutoEnable(false)}
                        disabled={isDeploying}
                      />
                      <span>仅部署为设计态草稿 (安全推荐，status=3)</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 pl-5">
                      完整写入图模型与动作配置，保留为草稿，方便进入销售易设计器进行人工复核与验收。
                    </p>
                  </label>

                  <label
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      autoEnable ? "bg-teal-50/60 border-teal-400 shadow-2xs font-semibold text-teal-900" : "bg-white border-slate-200 text-slate-600"
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="deployMode"
                        checked={autoEnable}
                        onChange={() => setAutoEnable(true)}
                        disabled={isDeploying}
                      />
                      <span>部署并立即启用 (status=1)</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 pl-5">
                      保存后自动调用 enable-procdef 接口激活，需确保流程拓扑具备至少一个执行动作节点。
                    </p>
                  </label>
                </div>
              </div>

              {/* 部署日志终端 */}
              {deployResult && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-800 flex items-center space-x-1.5">
                      <Play className="w-4 h-4 text-emerald-600" />
                      <span>服务端全流程调用日志 ({deployResult.stepsLog?.length || 0} 个阶段)</span>
                    </h4>
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                      !hasIssues
                        ? "bg-emerald-100 text-emerald-800"
                        : deployResult.success
                        ? "bg-amber-100 text-amber-800"
                        : "bg-rose-100 text-rose-800"
                    }`}>
                      {!hasIssues ? "DEPLOY SUCCESS" : deployResult.success ? "DEPLOY WITH WARNINGS" : "DEPLOY FAILED"}
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-900 rounded-2xl border border-slate-800 text-[11px] font-mono text-slate-300 space-y-1.5 max-h-56 overflow-y-auto">
                    {deployResult.stepsLog?.map((s, idx) => (
                      <div key={idx} className="flex items-start space-x-2 leading-relaxed">
                        <span
                          className={`shrink-0 ${
                            s.status === "success"
                              ? "text-emerald-400"
                              : s.status === "warn"
                              ? "text-amber-400"
                              : s.status === "error"
                              ? "text-rose-400"
                              : "text-slate-500"
                          }`}
                        >
                          [{s.status.toUpperCase()}]
                        </span>
                        <span className="text-slate-400 shrink-0">{s.step}:</span>
                        <span className="text-slate-200">{s.message}</span>
                        {s.timeMs !== undefined && <span className="text-slate-500 shrink-0">({s.timeMs}ms)</span>}
                      </div>
                    ))}
                  </div>

                  {/* 智能体诊断与自愈修复条带 */}
                  {hasIssues && (
                    <div className="p-3.5 bg-gradient-to-r from-amber-50 to-teal-50 rounded-2xl border border-amber-200 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center space-x-2.5 text-amber-950">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                        <div>
                          <div className="font-bold">服务端反馈流程拓扑或规则警告/异常</div>
                          <div className="text-[11px] text-amber-800">
                            未能立即激活启用流程版本（已保存为设计态草稿）。可一键发送给 AI 结合当前上下文自动分析报错根因并修复方案。
                          </div>
                        </div>
                      </div>
                      {onSendDiagnosticToAi && (
                        <button
                          type="button"
                          onClick={handleSendDiagnosticsToAi}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-semibold text-xs shadow-xs flex items-center space-x-1.5 shrink-0 cursor-pointer transition-all hover:scale-102"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>🤖 发送给 AI 诊断并修复</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部向导操作栏 (Wizard Navigation Footer) */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-1.5 text-slate-400 text-xs select-none">
            <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0" />
            <span>步骤 {currentStep} / 4 · 底层契约受沙箱保护</span>
          </div>

          <div className="flex items-center space-x-2.5">
            {/* 上一步按钮 */}
            {currentStep > 1 && (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => (prev - 1) as any)}
                disabled={isDeploying}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center space-x-1 transition-colors cursor-pointer disabled:opacity-50"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>上一步</span>
              </button>
            )}

            {/* 步骤 1 -> 2 */}
            {currentStep === 1 && (
              <button
                type="button"
                onClick={handleNextFromStep1}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition-all cursor-pointer"
              >
                <span>确认环境与凭证，下一步 ➔</span>
              </button>
            )}

            {/* 步骤 2 -> 3 */}
            {currentStep === 2 && (
              <button
                type="button"
                onClick={handleNextFromStep2}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition-all cursor-pointer"
              >
                <span>确认对象与入口，下一步 ➔</span>
              </button>
            )}

            {/* 步骤 3 -> 4 */}
            {currentStep === 3 && (
              <button
                type="button"
                onClick={handleNextFromStep3}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition-all cursor-pointer"
              >
                <span>确认规则无误，下一步 ➔</span>
              </button>
            )}

            {/* 发送给 AI 诊断错误按钮 */}
            {currentStep === 4 && hasIssues && onSendDiagnosticToAi && (
              <button
                type="button"
                onClick={handleSendDiagnosticsToAi}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-teal-600 hover:from-amber-500 hover:to-teal-500 text-white text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>🤖 发送给 AI 诊断并修复错误</span>
              </button>
            )}

            {/* 步骤 4: 执行部署 */}
            {currentStep === 4 && (
              <button
                type="button"
                onClick={handleExecuteDeploy}
                disabled={isDeploying}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeploying ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>正在执行代码部署调用...</span>
                  </>
                ) : (
                  <>
                    <span>🚀 开始代码级自动化编排部署</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 手动配置 Cookie 子弹窗 */}
      {cookieModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-md shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <KeyRound className="w-4 h-4 text-teal-600" />
                <h4 className="font-bold text-sm text-slate-800">配置 Web 会话 Cookie</h4>
              </div>
              <button onClick={() => setCookieModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveManualCookie} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  浏览器 Cookie 字符串 (包含 JSESSIONID 等)
                </label>
                <textarea
                  rows={4}
                  value={manualCookieInput}
                  onChange={(e) => setManualCookieInput(e.target.value)}
                  placeholder="可从 Chrome 开发者工具 Application > Cookies 或 Network 请求头中直接复制粘入：JSESSIONID=xxxx; rkhd=xxxx..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 font-mono text-[11px] focus:outline-none focus:border-teal-500 leading-relaxed"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCookieModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold"
                >
                  保存 Cookie
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
