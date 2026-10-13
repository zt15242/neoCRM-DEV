import React, { useState } from 'react';
import { SessionState, WorkflowDeployPlan, WorkflowDeployResult, WorkflowLicenseStatus } from '../../../shared/types';
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
  Globe,
  Edit3,
  Check,
  FileCode,
  Lock,
  Unlock
} from 'lucide-react';

interface ConfirmDeployWorkflowModalProps {
  plan: WorkflowDeployPlan;
  crmSession: SessionState;
  licenseStatus?: WorkflowLicenseStatus | null;
  onOpenLicenseModal?: () => void;
  onClose: () => void;
  onRefreshSession: () => void;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const ConfirmDeployWorkflowModal: React.FC<ConfirmDeployWorkflowModalProps> = ({
  plan,
  crmSession,
  licenseStatus,
  onOpenLicenseModal,
  onClose,
  onRefreshSession,
  showToast,
}) => {
  // 可编辑流程属性
  const [processName, setProcessName] = useState(plan?.flow?.processName || "");
  const [actKey, setActKey] = useState(plan?.flow?.actKey || "");
  const [entityApiKey, setEntityApiKey] = useState(plan?.flow?.entityApiKey || "");
  const [description, setDescription] = useState(plan?.flow?.description || "");
  const [executeTypes, setExecuteTypes] = useState<string[]>(
    plan?.flow?.executeType ? String(plan.flow.executeType).split(",").map((s) => s.trim()) : ["1"]
  );

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
      showToast('error', `捕获失败: ${e.message}`);
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
      showToast('error', `更新失败: ${e.message}`);
    }
  };

  // 导出参数化配置 JSON 文件
  const handleExportJson = () => {
    const exportData = {
      flow: {
        processName,
        actKey,
        entityApiKey,
        executeType: executeTypes.join(','),
        description,
        enableIntelligentMode: 2,
      },
      variables: plan.variables,
      nodes: plan.nodes,
      branches: plan.branches,
      edges: plan.edges,
      exportedAt: new Date().toISOString(),
      generator: 'NeoCRM Desktop Studio - Workflow Architect',
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${actKey || 'automatic_flow'}_config.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('success', `已导出自动流程配置文件: ${actKey}.json`);
  };

  // 执行代码部署
  const handleExecuteDeploy = async () => {
    if (!processName.trim()) {
      showToast('error', '请输入流程名称');
      return;
    }
    if (!actKey.trim()) {
      showToast('error', '请输入流程 API Key');
      return;
    }
    if (!entityApiKey.trim()) {
      showToast('error', '请输入主关联对象 API Key');
      return;
    }

    const compiledPlan: WorkflowDeployPlan = {
      flow: {
        processName: processName.trim(),
        actKey: actKey.trim(),
        entityApiKey: entityApiKey.trim(),
        executeType: executeTypes.length > 0 ? executeTypes.join(',') : '1',
        description: description.trim(),
        enableIntelligentMode: 2,
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
        throw new Error('当前环境不支持自动流程部署 API');
      }

      const res = await window.neoApi.workflowDeployPlan(compiledPlan, { autoEnable });
      setDeployResult(res);

      if (res.success) {
        showToast('success', `流程 [${processName}] 部署成功 (ID: ${res.procdefId})！`);
      } else {
        showToast('error', `部署遇到问题: ${res.error || '请查看执行日志'}`);
      }
    } catch (e: any) {
      setDeployResult({
        success: false,
        error: e.message || '部署过程中发生异常',
      });
      showToast('error', `部署失败: ${e.message}`);
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-teal-50/60 to-emerald-50/30 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-teal-600 text-white shadow-xs">
              <Workflow className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                核对并部署自动流程 (Automatic Flow)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                基于《销售易自动流程-代码配置全过程与验证规范》，一键执行全套 API 自动化编排
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {onOpenLicenseModal && (
              <button
                type="button"
                onClick={onOpenLicenseModal}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold border flex items-center space-x-1 transition-all cursor-pointer ${
                  licenseStatus?.isAuthorized
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                    : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                }`}
              >
                {licenseStatus?.isAuthorized ? (
                  <>
                    <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                    <span>设备已授权 (剩余 {licenseStatus.remainingDays} 天)</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5 text-amber-600" />
                    <span>设备未授权 · 点击解锁</span>
                  </>
                )}
              </button>
            )}
            <button
              onClick={onClose}
              disabled={isDeploying}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 主体滚动区 */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* 租户与 Cookie 鉴权就绪卡片 */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-white border border-slate-200 text-teal-700">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-slate-800">目标部署租户:</span>
                  <span className="text-slate-700 font-medium">
                    {crmSession?.tokenData?.userInfo?.tenantName || '未命名租户'}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-100 text-sky-800 font-mono">
                    ID: {crmSession?.tokenData?.tenant_id}
                  </span>
                </div>
                <div className="flex items-center space-x-2 mt-1">
                  <span className="text-[11px] text-slate-500">管理员 Web 会话 Cookie:</span>
                  {isRealAdminCookie ? (
                    <span className="text-[11px] text-emerald-600 font-medium flex items-center space-x-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>已就绪 · 具备后台管理权限 ({localCookieCount || 1} 项)</span>
                    </span>
                  ) : hasCookie ? (
                    <span className="text-[11px] text-amber-600 font-medium flex items-center space-x-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>仅临时登录页 Cookie (请点击右侧【捕获/刷新 Cookie】并完成后台登录)</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-amber-600 font-medium flex items-center space-x-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>未捕获 (内部接口需先捕获后台会话)</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleCaptureCookie}
                disabled={isCapturingCookie || isDeploying}
                className="px-3 py-1.5 rounded-lg border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-800 font-medium flex items-center space-x-1.5 transition-colors cursor-pointer"
                title="打开后台窗口自动捕获 Session Cookie"
              >
                {isCapturingCookie ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                <span>捕获/刷新 Cookie</span>
              </button>
              <button
                type="button"
                onClick={() => setCookieModalOpen(true)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium flex items-center space-x-1 transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>配置</span>
              </button>
            </div>
          </div>

          {/* 流程基础信息核对表单 */}
          <div className="space-y-3 p-4 rounded-xl border border-slate-200 bg-white">
            <h4 className="font-bold text-slate-800 flex items-center space-x-1.5">
              <span>一、流程基本信息 (add-baseinfo 契约)</span>
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  流程名称 (processName) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={processName}
                  onChange={(e) => setProcessName(e.target.value)}
                  disabled={isDeploying}
                  placeholder="例如：服务工单自动分流派单"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  流程 API Key (actKey) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={actKey}
                  onChange={(e) => setActKey(e.target.value)}
                  disabled={isDeploying}
                  placeholder="例如：serviceTicket_autoDispatch"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 font-mono focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  主关联对象 API Key (entityApiKey) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={entityApiKey}
                  onChange={(e) => setEntityApiKey(e.target.value)}
                  disabled={isDeploying}
                  placeholder="例如：account / serviceTicket__c"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 font-mono focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">触发执行方式 (executeType)</label>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {[
                    { id: '1', label: '1 创建记录' },
                    { id: '2', label: '2 编辑记录' },
                    { id: '5', label: '5 平台事件' },
                    { id: '6', label: '6 页面按钮' },
                    { id: '7', label: '7 智能体操作' },
                  ].map((item) => (
                    <label
                      key={item.id}
                      className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border cursor-pointer select-none transition-colors ${
                        executeTypes.includes(item.id)
                          ? 'bg-teal-50 border-teal-300 text-teal-800 font-medium'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={executeTypes.includes(item.id)}
                        onChange={() => toggleExecuteType(item.id)}
                        disabled={isDeploying}
                        className="rounded text-teal-600 w-3 h-3"
                      />
                      <span className="text-[11px]">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">流程描述 (description)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isDeploying}
                placeholder="简要说明该自动流程业务意图..."
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200"
              />
            </div>
          </div>

          {/* 节点拓扑与元素清单 */}
          <div className="space-y-3 p-4 rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-800 flex items-center space-x-1.5">
                <span>二、画布拓扑与节点架构 ({plan.nodes.length} 个节点)</span>
              </h4>
              <span className="text-[11px] text-slate-400">
                已验证原生 7 元素及 SubProcess 边界规则
              </span>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {plan.nodes.map((n, idx) => {
                const isAction = n.nodeType === 'ServiceTask';
                const isQuery = n.nodeType === 'QueryLog';
                const isLoop = n.nodeType === 'Loop';
                const isGateway = n.nodeType === 'ExclusiveGateway';

                return (
                  <div
                    key={n.id}
                    className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/60 flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-2.5">
                      <span className="w-5 h-5 rounded-full bg-white border border-slate-200 text-slate-500 font-mono text-[10px] flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-slate-800">{n.name}</span>
                          <span
                            className={`text-[10px] px-2 py-0.2 rounded-full font-mono border ${
                              isAction
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 font-bold'
                                : isQuery
                                ? 'bg-sky-50 text-sky-800 border-sky-200'
                                : isLoop
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : isGateway
                                ? 'bg-purple-50 text-purple-800 border-purple-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {n.nodeType}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          ID: <code className="text-slate-600">{n.id}</code>
                          {isAction && n.actionConfig && ` · 动作类型: ${n.actionConfig.actionType === 2 ? '更新记录' : '动作'}`}
                          {isQuery && n.queryConfig && ` · 查询对象: ${n.queryConfig.searchObject}`}
                          {isLoop && n.loopConfig && ` · 集合变量: ${n.loopConfig.loopVariavle} 游标: ${n.loopConfig.loopCursor}`}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 流程变量清单 */}
          {plan.variables.length > 0 && (
            <div className="space-y-3 p-4 rounded-xl border border-slate-200 bg-white">
              <h4 className="font-bold text-slate-800">
                三、流程变量字典 (resourceConfig · {plan.variables.length} 项)
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {plan.variables.map((v) => (
                  <div key={v.apiKey} className="p-2 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-800">{v.describe || v.apiKey}</div>
                      <div className="font-mono text-[10px] text-slate-400">{v.apiKey}</div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-white border border-slate-200 text-indigo-700 font-mono">
                      {v.variavleType === 2 ? '多值集合' : '单值'} (类型:{v.variavleDataType})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 部署模式选项 */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
            <h4 className="font-bold text-slate-800">四、部署模式与生命周期选项</h4>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <label
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  !autoEnable ? 'bg-white border-teal-400 shadow-2xs font-semibold text-teal-900' : 'bg-white/60 border-slate-200 text-slate-600'
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
                <p className="text-[11px] text-slate-400 font-normal mt-1 pl-5">
                  完整写入图模型与动作配置，不自动投入生产运行，方便进入销售易设计器进行人工复核与验收。
                </p>
              </label>

              <label
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  autoEnable ? 'bg-white border-teal-400 shadow-2xs font-semibold text-teal-900' : 'bg-white/60 border-slate-200 text-slate-600'
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
                <p className="text-[11px] text-slate-400 font-normal mt-1 pl-5">
                  保存后自动调用 enable-procdef 接口激活，需确保流程拓扑具备至少一个执行动作节点。
                </p>
              </label>
            </div>
          </div>

          {/* 实时执行日志面板 */}
          {deployResult && (
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-900 text-slate-200 space-y-2">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                <span className="font-bold text-white flex items-center space-x-1.5">
                  {deployResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                  )}
                  <span>代码级部署执行日志 ({deployResult.statusText || (deployResult.success ? '成功' : '失败')})</span>
                </span>
                {deployResult.procdefId && (
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-emerald-400 text-[11px]">
                      procdefId: {deployResult.procdefId}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const baseUrl = (crmSession?.tokenData?.instance_uri || crmSession?.environment?.neoBaseURL || "https://crm-sandbox.xiaoshouyi.com").replace(/\/+$/, "");
                        window.neoApi?.openExternal(`${baseUrl}/admin/admin-home/index.action?page=creekflow&procdefId=${deployResult.procdefId}`);
                      }}
                      className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium flex items-center space-x-1 transition-colors cursor-pointer"
                    >
                      <Globe className="w-3 h-3" />
                      <span>在设计器中打开画布</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-1 font-mono text-[11px] max-h-48 overflow-y-auto">
                {deployResult.stepsLog?.map((s, idx) => (
                  <div key={idx} className="flex items-start space-x-2 leading-relaxed">
                    <span
                      className={`shrink-0 ${
                        s.status === 'success'
                          ? 'text-emerald-400'
                          : s.status === 'warn'
                          ? 'text-amber-400'
                          : s.status === 'error'
                          ? 'text-rose-400'
                          : 'text-slate-500'
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
            <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0" />
            <span>底层配置契约已受桌面内核加密保护</span>
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
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              {isDeploying ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>正在执行代码部署与生命周期调用...</span>
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
