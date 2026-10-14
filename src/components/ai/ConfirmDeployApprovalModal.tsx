import React, { useState, useEffect } from "react";
import { SessionState, ApprovalDeployPlan, WorkflowDeployResult, WorkflowLicenseStatus, TenantFlowItem } from "../../../shared/types";
import { 
  FileCheck, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2, 
  Layers, 
  ShieldCheck, 
  KeyRound, 
  Download, 
  Play, 
  UserCheck, 
  GitFork, 
  ArrowRight,
  ArrowLeft,
  Globe,
  Edit3,
  Check,
  FileCode,
  Lock,
  Unlock,
  Bell,
  SlidersHorizontal,
  CheckSquare,
  Square,
  Info
} from "lucide-react";

interface ConfirmDeployApprovalModalProps {
  plan: ApprovalDeployPlan;
  crmSession: SessionState;
  licenseStatus?: WorkflowLicenseStatus | null;
  onOpenLicenseModal?: () => void;
  onClose: () => void;
  onRefreshSession: () => void;
  showToast: (type: "success" | "error" | "info", text: string) => void;
}

export const ConfirmDeployApprovalModal: React.FC<ConfirmDeployApprovalModalProps> = ({
  plan,
  crmSession,
  licenseStatus,
  onOpenLicenseModal,
  onClose,
  onRefreshSession,
  showToast,
}) => {
  // 当前向导步骤: 1 凭证核验, 2 对象与类型, 3 审批人与编辑字段, 4 撤回通知与部署
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // 可编辑审批流属性
  // 部署目标模式: "update" 调整/更新租户现有流程, "create" 新建独立流程族
  const [deployTargetMode, setDeployTargetMode] = useState<"update" | "create">(
    plan?.flow?.targetMode || (plan?.flow?.targetProcdefId ? "update" : "update")
  );
  const [existingFlows, setExistingFlows] = useState<TenantFlowItem[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string>(String(plan?.flow?.targetProcdefId || ""));
  const [loadingFlows, setLoadingFlows] = useState<boolean>(false);

  // 流程属性状态
  const [processName, setProcessName] = useState(plan?.flow?.processName || "");
  const [entityApiKey, setEntityApiKey] = useState(plan?.flow?.entityApiKey || "");
  const [bizTypeApiKey, setBizTypeApiKey] = useState(plan?.flow?.bizTypeApiKey || "");
  const [startupOrder, setStartupOrder] = useState<number>(plan?.flow?.startupOrder ?? 1);
  const [description, setDescription] = useState(plan?.flow?.description || "");
  const [withdrawFlag, setWithdrawFlag] = useState<number>(plan?.flow?.withdrawFlag ?? 1);
  const [singleStepWithdrawFlag, setSingleStepWithdrawFlag] = useState<number>(plan?.flow?.singleStepWithdrawFlag ?? 2);
  const [sendApprovalNotice, setSendApprovalNotice] = useState<number>(plan?.flow?.sendApprovalNotice ?? 1);

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

  // 初始化加载租户现有审批流列表
  useEffect(() => {
    if (window.neoApi?.workflowListTenantFlows) {
      setLoadingFlows(true);
      window.neoApi.workflowListTenantFlows({ procType: 2 })
        .then((res) => {
          if (res.success && Array.isArray(res.data)) {
            setExistingFlows(res.data);
            // 自动智能预选：根据流程名或关联对象模糊对齐
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

  // 选中现有流程时自动联动属性
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
        entityApiKey,
        bizTypeApiKey,
        startupOrder,
        description,
        withdrawFlag,
        singleStepWithdrawFlag,
        sendApprovalNotice,
        procType: 2,
      },
      nodes: plan.nodes,
      edges: plan.edges,
      exportedAt: new Date().toISOString(),
      generator: "NeoCRM Desktop Studio - Approval Architect",
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${entityApiKey || "approval"}_flow_config.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("success", "已导出审批流完整配置文件");
  };

  // 步骤推进校验
  const handleNextFromStep1 = () => {
    if (!crmSession.isLoggedIn) {
      showToast("error", "请先在工作台登录销售易租户");
      return;
    }
    if (!hasCookie) {
      showToast("error", "尚未获取后台管理员 Web 会话 Cookie，请先点击【捕获/刷新 Cookie】并在弹出窗口中登录后台");
      return;
    }
    setCurrentStep(2);
  };

  const handleNextFromStep2 = () => {
    if (!processName.trim()) {
      showToast("error", "请输入流程名称");
      return;
    }
    if (!entityApiKey.trim()) {
      showToast("error", "请输入主业务对象 API Key");
      return;
    }
    setCurrentStep(3);
  };

  const handleNextFromStep3 = () => {
    if (!rulesConfirmed) {
      showToast("info", "请先勾选底部的【我已核对上述审批节点策略与字段编辑权限】确认项");
      return;
    }
    setCurrentStep(4);
  };

  // 执行部署
  const handleExecuteDeploy = async () => {
    if (!window.neoApi?.workflowDeployApprovalPlan) {
      showToast("error", "当前环境不支持代码级部署审批流");
      return;
    }

    setIsDeploying(true);
    setDeployResult(null);

    try {
      const payload: ApprovalDeployPlan = {
        ...plan,
        flow: {
          ...plan.flow,
          processName: processName.trim(),
          entityApiKey: entityApiKey.trim(),
          bizTypeApiKey: bizTypeApiKey.trim() || undefined,
          startupOrder: Number(startupOrder) || 1,
          description: description.trim(),
          withdrawFlag: Number(withdrawFlag) as any,
          singleStepWithdrawFlag: Number(singleStepWithdrawFlag) as any,
          sendApprovalNotice: Number(sendApprovalNotice) as any,
          targetMode: deployTargetMode,
          targetProcdefId: deployTargetMode === "update" ? (selectedTargetFlow?.procdefId || selectedFlowId) : undefined,
          targetStatus: deployTargetMode === "update" ? selectedTargetFlow?.status : undefined,
        },
      };

      const res = await window.neoApi.workflowDeployApprovalPlan(payload, { autoEnable });
      setDeployResult(res);

      if (res.success) {
        showToast("success", `🎉 审批流 [${processName}] 部署成功！${res.statusText}`);
      } else {
        showToast("error", `部署失败: ${res.error || "未知异常"}`);
      }
    } catch (e: any) {
      showToast("error", `部署执行异常: ${e.message}`);
      setDeployResult({
        success: false,
        error: e.message,
        stepsLog: [{ step: "前端捕获异常", status: "error", message: e.message }],
      });
    } finally {
      setIsDeploying(false);
    }
  };

  const getAssignmentTypeLabel = (code: string) => {
    const map: Record<string, string> = {
      "201": "自选审批人",
      "202": "字段选人 / 固定人员",
      "203": "流程提交人",
      "204": "上一节点审批人直属上级",
      "205": "提交人直属上级",
      "301": "部门主管",
      "401": "指定角色",
      "601": "指定用户组",
    };
    return map[code] || `策略(${code})`;
  };

  const stepsList = [
    { num: 1, title: "凭证核验", desc: "环境与Cookie" },
    { num: 2, title: "对象与类型", desc: "实体与优先级" },
    { num: 3, title: "节点与审批人", desc: "矩阵策略核对" },
    { num: 4, title: "撤回与部署", desc: "生命周期执行" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-slate-200 w-full max-w-4xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* 顶部标题区 */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-xs">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-base text-slate-900">
                  审批流配置向导与代码部署 (Approval Flow)
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-mono font-semibold">
                  procType=2
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
                整体引导式分步核对与确认 · 全程保障审批矩阵严谨合规
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportJson}
              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer"
              title="导出审批流配置方案 JSON"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              disabled={isDeploying}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
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
                      ? "text-indigo-700 font-bold"
                      : isPassed
                      ? "text-slate-700 hover:text-indigo-600 font-medium"
                      : "text-slate-400 cursor-not-allowed"
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono transition-all ${
                      isActive
                        ? "bg-indigo-600 text-white shadow-xs scale-105"
                        : isPassed
                        ? "bg-indigo-100 text-indigo-800"
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
                  <div className={`flex-1 h-0.5 mx-3 ${isPassed ? "bg-indigo-300" : "bg-slate-200"}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* 主体滚动区 */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* ======================= 步骤 1: 凭证核验 ======================= */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 bg-sky-50/60 rounded-2xl border border-sky-200 text-sky-900 flex items-start space-x-3">
                <Info className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-sm text-sky-950">步骤 1 引导：环境与管理员会话核验</div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    销售易新版审批流的代码级配置涉及底层 7 个流程身份与图模型接口，需要后台管理员 Web 会话（Cookie 凭证）。请确认租户连接无误，且 Cookie 已就绪。
                  </p>
                </div>
              </div>

              {/* 租户卡片 */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3">
                <h4 className="font-bold text-slate-800 text-sm flex items-center space-x-2">
                  <Globe className="w-4 h-4 text-indigo-600" />
                  <span>当前连接的销售易租户事实</span>
                </h4>
                <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50/60 p-3.5 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-slate-400">租户名称:</span>
                    <span className="ml-2 font-bold text-slate-800">{crmSession?.tokenData?.userInfo?.tenantName || "当前租户"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">租户 ID (Tenant ID):</span>
                    <span className="ml-2 font-mono font-bold text-slate-800">{crmSession?.tokenData?.tenant_id || "未知ID"}</span>
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

              {/* 管理员 Cookie 依赖状态栏 */}
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
                        : "审批流内部设计接口群依赖租户管理员 Web 会话，请先捕获或手动配置 Cookie"}
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
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center space-x-1 cursor-pointer shadow-2xs disabled:opacity-50"
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
                    如果您是<strong>优化、调整现有线上流程</strong>，请选择【为租户现有流程升级发布新版本】。系统将严格遵循销售易规范，在原流程族下创建新版本（如 V2 ➔ V3），绝不创建多余的新流，也不会产生序号冲突！
                  </p>
                </div>
              </div>

              {/* 模式选择 */}
              <div className="space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div
                    onClick={() => setDeployTargetMode("update")}
                    className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${
                      deployTargetMode === "update"
                        ? "bg-indigo-50/90 border-indigo-500 shadow-2xs text-indigo-950 font-bold"
                        : "bg-white border-slate-200 hover:border-slate-300 text-slate-700"
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="deployTargetMode"
                        checked={deployTargetMode === "update"}
                        onChange={() => setDeployTargetMode("update")}
                        className="text-indigo-600 cursor-pointer"
                      />
                      <span className="text-xs font-bold">🚀 为现有流程升级发布新版本 (推荐)</span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-normal mt-1.5 pl-5 leading-relaxed">
                      在原有流程族下升级版本（如 V2 ➔ V3），不创建多余新流，保留全部历史版本与生效设置。
                    </p>
                  </div>

                  <div
                    onClick={() => setDeployTargetMode("create")}
                    className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${
                      deployTargetMode === "create"
                        ? "bg-indigo-50/90 border-indigo-500 shadow-2xs text-indigo-950 font-bold"
                        : "bg-white border-slate-200 hover:border-slate-300 text-slate-700"
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="deployTargetMode"
                        checked={deployTargetMode === "create"}
                        onChange={() => setDeployTargetMode("create")}
                        className="text-indigo-600 cursor-pointer"
                      />
                      <span className="text-xs font-bold">➕ 创建全新的独立流程族</span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-normal mt-1.5 pl-5 leading-relaxed">
                      仅在您需要从零注册一个全新的业务流程族时选用。
                    </p>
                  </div>
                </div>
              </div>

              {/* 模式 A: 升级现有流程 */}
              {deployTargetMode === "update" && (
                <div className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-slate-800 font-bold text-xs">
                      选择要升级的租户现有审批流 <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[10px] text-indigo-600 font-mono">
                      已探测到 {existingFlows.length} 个现有审批流
                    </span>
                  </div>

                  <select
                    value={selectedFlowId}
                    onChange={(e) => handleSelectExistingFlow(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-indigo-300 rounded-xl text-xs text-slate-800 font-medium focus:outline-none focus:border-indigo-600 shadow-2xs"
                  >
                    <option value="">-- 请选择要升级版本的现有流程 --</option>
                    {existingFlows.map((f) => (
                      <option key={f.procdefId || f.id} value={f.procdefId || f.id}>
                        [V{f.version || 1} {f.statusName}] {f.name} (关联对象: {f.objectName || f.entityApiKey}, 最新: V{f.latestVersion || f.version || 1})
                      </option>
                    ))}
                  </select>

                  {/* 选中流程的高亮升级指示卡片 */}
                  {selectedTargetFlow ? (
                    <div className="p-3.5 bg-white rounded-2xl border border-indigo-200 shadow-2xs space-y-2 text-xs">
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
                          <span className="text-slate-400">生效序号:</span>
                          <span className="ml-1.5 font-mono text-slate-800">{selectedTargetFlow.startupOrder || 1}</span>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 text-[11px] text-indigo-950 leading-relaxed">
                        {selectedTargetFlow.status === 3 ? (
                          <span>
                            📝 <strong>草稿更新模式</strong>：当前目标处于【设计态草稿】，部署时将直接覆盖更新至此草稿版本，无需生成新流，不产生序号冲突。
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

              {/* 模式 B: 创建全新独立流程族 (仅当选新建时才展示所有底层属性输入) */}
              {deployTargetMode === "create" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50/60 p-4 rounded-2xl border border-slate-200">
                  <div>
                    <label className="block text-slate-500 font-medium mb-1">新流程名称 <span className="text-rose-500">*</span></label>
                    <input
                      type="text"
                      value={processName}
                      onChange={(e) => setProcessName(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500 font-medium text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 font-medium mb-1">主业务对象 API Key <span className="text-rose-500">*</span></label>
                    <input
                      type="text"
                      value={entityApiKey}
                      onChange={(e) => setEntityApiKey(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500 font-mono text-slate-800 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 font-medium mb-1">业务类型 API Key (可选)</label>
                    <input
                      type="text"
                      value={bizTypeApiKey}
                      onChange={(e) => setBizTypeApiKey(e.target.value)}
                      placeholder="留空则匹配全部或默认业务类型"
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500 font-mono text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-500 font-medium mb-1">多流程启动优先级 (startupOrder)</label>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={startupOrder}
                      onChange={(e) => setStartupOrder(Number(e.target.value) || 1)}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500 font-mono text-slate-800"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-slate-500 font-medium mb-1">审批流程描述</label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="说明此审批流程的适用范围与审批人规则"
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500 text-slate-800"
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
                    placeholder="简要说明本次版本升级的调整内容（如调整了审批人或放宽了条件）..."
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500 text-xs text-slate-800"
                  />
                </div>
              )}
            </div>
          )}
{/* ======================= 步骤 3: 节点与审批人 ======================= */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 bg-sky-50/60 rounded-2xl border border-sky-200 text-sky-900 flex items-start space-x-3">
                <Info className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-sm text-sky-950">步骤 3 引导：逐项审查审批人策略与编辑权限</div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    请仔细核对每个<strong>人工审批节点的审批人选型</strong>（直属上级 / 角色 / 字段选人）、审批方式（单人 / 任签 / 会签）及允许修改的敏感字段。
                  </p>
                </div>
              </div>

              {/* 节点列表审查 */}
              <div className="space-y-2 border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {plan.nodes.map((node, idx) => {
                  const isUserTask = node.nodeType === "UserTask";
                  const isSubmit = node.nodeType === "SubmitTask";
                  const isGateway = node.nodeType === "ExclusiveGateway";

                  return (
                    <div key={node.id} className="p-3 bg-white hover:bg-slate-50/60 transition-colors flex items-start justify-between">
                      <div className="space-y-1 min-w-0 flex-1 pr-3">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-[10px] text-slate-400 font-medium">{idx + 1}.</span>
                          <span className="font-bold text-slate-800">{node.name}</span>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-medium ${
                            isUserTask
                              ? "bg-purple-100 text-purple-800"
                              : isSubmit
                              ? "bg-sky-100 text-sky-800"
                              : isGateway
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-600"
                          }`}>
                            {node.nodeType}
                          </span>
                          {isUserTask && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-mono">
                              {node.taskType === "3" ? "多人会签" : node.taskType === "2" ? "多人任签" : "单人审批"}
                            </span>
                          )}
                        </div>

                        {/* 审批人策略与编辑字段详情 */}
                        {isUserTask && (
                          <div className="space-y-0.5 text-[11px] text-slate-500 pl-4">
                            {node.approverRules && node.approverRules.length > 0 && (
                              <div className="flex items-center space-x-1 text-indigo-700">
                                <span className="font-medium text-slate-400">审批人:</span>
                                {node.approverRules.map((ar, ai) => (
                                  <span key={ai} className="bg-indigo-50 px-1.5 py-0.2 rounded font-mono text-[10px]">
                                    {getAssignmentTypeLabel(ar.assignmentType)}
                                    {ar.itemApiKeyLabel ? ` (${ar.itemApiKeyLabel})` : ""}
                                  </span>
                                ))}
                              </div>
                            )}

                            {node.editableFields && node.editableFields.length > 0 && (
                              <div className="flex items-center space-x-1 text-slate-600">
                                <span className="font-medium text-slate-400">可编辑字段:</span>
                                {node.editableFields.map((ef, ei) => (
                                  <span key={ei} className="bg-slate-100 px-1.5 py-0.2 rounded font-mono text-[10px]">
                                    {ef.itemLabel || ef.itemApiKey}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center space-x-3 text-[10px] text-slate-400 pt-0.5">
                              <span>加签: {node.plussignFlag === 1 ? "允许" : "禁止"}</span>
                              <span>转办: {node.delegationFlag === 1 ? "允许" : "禁止"}</span>
                              <span>意见: {node.commentFlag === 1 ? "必填" : node.commentFlag === 3 ? "免填" : "选填"}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 强制确认协议勾选 */}
              <div
                onClick={() => setRulesConfirmed(!rulesConfirmed)}
                className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex items-center space-x-3 select-none ${
                  rulesConfirmed
                    ? "bg-indigo-50/80 border-indigo-500 text-indigo-900"
                    : "bg-white border-slate-300 hover:border-slate-400 text-slate-700"
                }`}
              >
                {rulesConfirmed ? (
                  <CheckSquare className="w-5 h-5 text-indigo-600 shrink-0" />
                ) : (
                  <Square className="w-5 h-5 text-slate-400 shrink-0" />
                )}
                <div>
                  <div className="font-bold text-xs">
                    我已核对上述审批节点策略与字段编辑权限，确认符合企业内控合规要求
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    勾选后可进入下一步，配置撤回与通知选项并启动自动化编排部署
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ======================= 步骤 4: 撤回与部署 ======================= */}
          {currentStep === 4 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 bg-sky-50/60 rounded-2xl border border-sky-200 text-sky-900 flex items-start space-x-3">
                <Info className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-sm text-sky-950">步骤 4 引导：撤回通知策略与部署执行</div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    确认撤回控制策略与消息通知设置，选择是否立即启用。点击开始部署将自动按规范调用全套生命周期接口。
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div>
                  <label className="block text-slate-500 font-medium mb-1">全局撤回策略 (withdrawFlag)</label>
                  <select
                    value={withdrawFlag}
                    onChange={(e) => setWithdrawFlag(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500 font-medium text-slate-800"
                  >
                    <option value={1}>1: 允许撤回</option>
                    <option value={2}>2: 禁止撤回</option>
                    <option value={3}>3: 仅提交人可撤回</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-500 font-medium mb-1">单步收回策略</label>
                  <select
                    value={singleStepWithdrawFlag}
                    onChange={(e) => setSingleStepWithdrawFlag(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500 font-medium text-slate-800"
                  >
                    <option value={2}>2: 禁止单步收回 (默认)</option>
                    <option value={1}>1: 允许单步收回</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-500 font-medium mb-1">审批待办通知</label>
                  <select
                    value={sendApprovalNotice}
                    onChange={(e) => setSendApprovalNotice(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500 font-medium text-slate-800"
                  >
                    <option value={1}>1: 发送审批待办通知</option>
                    <option value={2}>2: 关闭通知</option>
                  </select>
                </div>
              </div>

              {/* 启用选项 */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-800">审批流版本自动启用选项</div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    默认部署后保留为【设计态草稿】(status=3)，方便在销售易设计器中进行可视化复查；勾选后将自动调用 enable-procdef 立即激活。
                  </p>
                </div>
                <label className="inline-flex items-center cursor-pointer shrink-0 ml-4">
                  <input
                    type="checkbox"
                    checked={autoEnable}
                    onChange={(e) => setAutoEnable(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                  />
                  <span className="ml-2 font-medium text-slate-700">部署后立即启用版本</span>
                </label>
              </div>

              {/* 部署日志终端 */}
              {deployResult && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 flex items-center space-x-1.5">
                      <Play className="w-4 h-4 text-emerald-600" />
                      <span>服务端全流程调用日志 ({deployResult.stepsLog?.length || 0} 个阶段)</span>
                    </h4>
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                      deployResult.success ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                    }`}>
                      {deployResult.success ? "DEPLOY SUCCESS" : "DEPLOY FAILED"}
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
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部向导操作栏 (Wizard Navigation Footer) */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-1.5 text-slate-400 text-xs select-none">
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>步骤 {currentStep} / 4 · 底层契约受沙箱保护</span>
          </div>

          <div className="flex items-center space-x-2.5">
            {/* 上一步 */}
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
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition-all cursor-pointer"
              >
                <span>确认环境与凭证，下一步 ➔</span>
              </button>
            )}

            {/* 步骤 2 -> 3 */}
            {currentStep === 2 && (
              <button
                type="button"
                onClick={handleNextFromStep2}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition-all cursor-pointer"
              >
                <span>确认对象与类型，下一步 ➔</span>
              </button>
            )}

            {/* 步骤 3 -> 4 */}
            {currentStep === 3 && (
              <button
                type="button"
                onClick={handleNextFromStep3}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition-all cursor-pointer"
              >
                <span>确认策略无误，下一步 ➔</span>
              </button>
            )}

            {/* 步骤 4: 执行部署 */}
            {currentStep === 4 && (
              <button
                type="button"
                onClick={handleExecuteDeploy}
                disabled={isDeploying}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                {isDeploying ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>正在执行审批流生命周期调用...</span>
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
                <KeyRound className="w-4 h-4 text-indigo-600" />
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
                  className="w-full p-2.5 rounded-xl border border-slate-200 font-mono text-[11px] focus:outline-none focus:border-indigo-500 leading-relaxed"
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
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
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
