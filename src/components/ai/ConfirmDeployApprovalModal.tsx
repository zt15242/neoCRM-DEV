import React, { useState } from "react";
import { SessionState, ApprovalDeployPlan, WorkflowDeployResult, WorkflowLicenseStatus } from "../../../shared/types";
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
  Globe,
  Edit3,
  Check,
  FileCode,
  Lock,
  Unlock,
  Bell,
  SlidersHorizontal
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
  // 可编辑审批流属性
  const [processName, setProcessName] = useState(plan?.flow?.processName || "");
  const [entityApiKey, setEntityApiKey] = useState(plan?.flow?.entityApiKey || "");
  const [bizTypeApiKey, setBizTypeApiKey] = useState(plan?.flow?.bizTypeApiKey || "");
  const [startupOrder, setStartupOrder] = useState<number>(plan?.flow?.startupOrder ?? 1);
  const [description, setDescription] = useState(plan?.flow?.description || "");
  const [withdrawFlag, setWithdrawFlag] = useState<number>(plan?.flow?.withdrawFlag ?? 1);
  const [singleStepWithdrawFlag, setSingleStepWithdrawFlag] = useState<number>(plan?.flow?.singleStepWithdrawFlag ?? 2);
  const [sendApprovalNotice, setSendApprovalNotice] = useState<number>(plan?.flow?.sendApprovalNotice ?? 1);

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

  // 执行部署
  const handleExecuteDeploy = async () => {
    if (!window.neoApi?.workflowDeployApprovalPlan) {
      showToast("error", "当前环境不支持代码级部署审批流");
      return;
    }

    if (!crmSession.isLoggedIn) {
      showToast("error", "请先在工作台登录销售易租户账号");
      return;
    }

    if (!hasCookie) {
      showToast("error", "尚未获取到后台管理员 Web 会话 Cookie，请先点击【捕获/刷新 Cookie】并在弹出窗口中登录后台");
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

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
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
                  审批流配置方案核对与代码部署
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-mono font-semibold">
                  procType=2 (新版审批)
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
                目标租户: <strong className="text-slate-700">{crmSession.tokenData?.userInfo?.tenantName || "当前租户"}</strong> ({crmSession.tokenData?.tenant_id || "未知ID"}) · 环境: <strong className="text-slate-700">{crmSession.environment?.name || "生产环境"}</strong>
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
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 主体滚动区 */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
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

          {/* 审批流基本信息配置 */}
          <div className="space-y-3">
            <h4 className="font-bold text-slate-900 flex items-center space-x-1.5 text-sm">
              <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
              <span>流程基本信息与全局控制</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50/60 p-4 rounded-2xl border border-slate-200">
              <div>
                <label className="block text-slate-500 font-medium mb-1">流程显示名称 (processName)</label>
                <input
                  type="text"
                  value={processName}
                  onChange={(e) => setProcessName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500 font-medium text-slate-800"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-medium mb-1">主业务对象 API Key (entityApiKey)</label>
                <input
                  type="text"
                  value={entityApiKey}
                  onChange={(e) => setEntityApiKey(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500 font-mono text-slate-800"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-medium mb-1">业务类型 API Key (bizTypeApiKey，可选)</label>
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
                <label className="block text-slate-500 font-medium mb-1">单步收回策略 (singleStepWithdrawFlag)</label>
                <select
                  value={singleStepWithdrawFlag}
                  onChange={(e) => setSingleStepWithdrawFlag(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500 font-medium text-slate-800"
                >
                  <option value={2}>2: 禁止单步收回 (默认)</option>
                  <option value={1}>1: 允许单步收回</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-slate-500 font-medium mb-1">审批流程描述 (description)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="说明此审批流程的适用范围、触发准入时机与审批人规则"
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500 text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* 节点与审批人策略详情列表 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 flex items-center space-x-1.5 text-sm">
                <Layers className="w-4 h-4 text-purple-600" />
                <span>图模型节点与审批人策略 ({plan.nodes.length} 个节点)</span>
              </h4>
            </div>

            <div className="space-y-2 border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
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
          </div>

          {/* 部署选项 */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
            <div>
              <div className="font-semibold text-slate-800">流程版本自动启用选项</div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                默认部署后保留为【设计态草稿】(status=3)，方便在销售易设计器中进行可视化审查；勾选后将自动调用 enable-procdef 立即激活。
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

          {/* 部署日志与执行终端 */}
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

        {/* 底部操作工具栏 */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-1.5 text-slate-400 text-xs select-none">
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>底层配置契约已受桌面内核加密沙箱保护</span>
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeploying}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-white text-xs font-medium transition-colors cursor-pointer"
            >
              取消
            </button>
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
                  <span>开始代码级自动化部署</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
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
