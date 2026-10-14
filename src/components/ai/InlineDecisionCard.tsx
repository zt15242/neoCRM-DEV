import React, { useState, useEffect } from "react";
import { DecisionRequestPayload } from "./decisionHelper";
import { Sparkles, Check, ArrowRight, Edit3, CheckCircle2, UserCheck, Users, Building, ShieldCheck } from "lucide-react";

interface InlineDecisionCardProps {
  decisionData: DecisionRequestPayload;
  onSubmit: (formattedConfirmation: string) => void;
  isAnswered?: boolean;
}

interface TenantResources {
  roles: Array<{ apiKey: string; name: string; id: number }>;
  users: Array<{ id: string; name: string; personalEmail?: string; departName?: string }>;
  departments: Array<{ id: string; departName: string }>;
}

export const InlineDecisionCard: React.FC<InlineDecisionCardProps> = ({
  decisionData,
  onSubmit,
  isAnswered = false,
}) => {
  // 当前租户真实组织与流程资源
  const [tenantResources, setTenantResources] = useState<TenantResources | null>(null);

  // 每个决策项的当前选择
  const [selectedChoices, setSelectedChoices] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    decisionData.items.forEach((item) => {
      initial[item.id] = item.options[0]?.value || "";
    });
    return initial;
  });

  // 每个决策项选特定来源时的关联选值
  const [selectedRoles, setSelectedRoles] = useState<Record<string, string>>({});
  const [selectedUsers, setSelectedUsers] = useState<Record<string, string>>({});
  const [selectedDepts, setSelectedDepts] = useState<Record<string, string>>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 异步获取当前连接租户的真实角色、人员、部门数据
  useEffect(() => {
    if (window.neoApi?.workflowGetApprovalResources) {
      window.neoApi.workflowGetApprovalResources().then((res) => {
        if (res) {
          setTenantResources({
            roles: res.roles || [],
            users: res.users || [],
            departments: res.departments || [],
          });
          // 预设选值
          if (res.roles?.length) {
            const roleMap: Record<string, string> = {};
            decisionData.items.forEach((it) => {
              const defRole = res.roles.find((r) => /经理|主管|财务|领导/i.test(r.name)) || res.roles[0];
              roleMap[it.id] = `${defRole.name} (apiKey: ${defRole.apiKey})`;
            });
            setSelectedRoles(roleMap);
          }
          if (res.users?.length) {
            const userMap: Record<string, string> = {};
            decisionData.items.forEach((it) => {
              userMap[it.id] = `${res.users[0].name} (ID: ${res.users[0].id})`;
            });
            setSelectedUsers(userMap);
          }
          if (res.departments?.length) {
            const deptMap: Record<string, string> = {};
            decisionData.items.forEach((it) => {
              deptMap[it.id] = `${res.departments[0].departName} (ID: ${res.departments[0].id})`;
            });
            setSelectedDepts(deptMap);
          }
        }
      }).catch(() => {});
    }
  }, [decisionData]);

  const handleSelectOption = (itemId: string, val: string) => {
    if (isAnswered) return;
    setSelectedChoices((prev) => ({ ...prev, [itemId]: val }));
  };

  const handleCustomChange = (itemId: string, text: string) => {
    if (isAnswered) return;
    setCustomInputs((prev) => ({ ...prev, [itemId]: text }));
  };

  const handleConfirm = () => {
    if (isSubmitting || isAnswered) return;
    setIsSubmitting(true);

    const lines: string[] = ["我已完成方案决策核对，最终确认结果如下："];

    decisionData.items.forEach((item, idx) => {
      const choice = selectedChoices[item.id];
      let finalVal = choice;
      if (choice === "__TENANT_ROLE__") {
        finalVal = `指定系统真实角色: ${selectedRoles[item.id] || "默认管理员"}`;
      } else if (choice === "__TENANT_USER__") {
        finalVal = `指定系统真实用户: ${selectedUsers[item.id] || "当前执行人"}`;
      } else if (choice === "__TENANT_DEPT__") {
        finalVal = `指定系统真实部门: ${selectedDepts[item.id] || "当前部门"}`;
      } else if (choice === "__OTHER__") {
        const customTxt = customInputs[item.id]?.trim();
        finalVal = customTxt ? `其他自定义要求: ${customTxt}` : "使用自定义规则";
      }
      lines.push(`${idx + 1}. 【${item.title}】: ${finalVal}`);
    });

    lines.push("请根据我确认的以上真实决策，为我生成精准的流程配置方案与一键部署向导！");

    const formatted = lines.join("\n");
    onSubmit(formatted);
  };

  if (isAnswered) {
    return (
      <div className="my-3 p-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/40 text-xs flex items-center justify-between text-emerald-900">
        <div className="flex items-center space-x-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">已完成业务决策核对并提交确认</span>
        </div>
        <span className="text-[10px] font-mono bg-white px-2 py-0.5 rounded border border-emerald-200 text-emerald-700">
          Decisions Confirmed
        </span>
      </div>
    );
  }

  return (
    <div className="my-4 p-4 rounded-3xl border-2 border-indigo-200 bg-gradient-to-b from-indigo-50/60 via-white to-slate-50/60 shadow-sm space-y-4 text-xs">
      {/* 头部标题与引导 */}
      <div className="flex items-center justify-between pb-2.5 border-b border-indigo-100">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-xl bg-gradient-to-tr from-indigo-600 to-sky-600 text-white shadow-2xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h4 className="font-bold text-slate-900 text-xs md:text-sm">
                {decisionData.title || "方案核对与关键业务决策"}
              </h4>
              <span className="text-[10px] px-2 py-0.2 rounded-full bg-indigo-100 text-indigo-800 font-semibold border border-indigo-200">
                真实租户数据选项
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              请在下方直接核对选项（支持点选、选择系统真实人员/角色/部门或自定义输入）。确认前不会完全呼出部署向导。
            </p>
          </div>
        </div>
      </div>

      {/* 决策项列表 */}
      <div className="space-y-4">
        {decisionData.items.map((item, idx) => {
          const currentChoice = selectedChoices[item.id];
          const isOther = currentChoice === "__OTHER__";
          const isTenantRole = currentChoice === "__TENANT_ROLE__";
          const isTenantUser = currentChoice === "__TENANT_USER__";
          const isTenantDept = currentChoice === "__TENANT_DEPT__";

          // 检测该项是否涉及人员、角色或部门
          const isApproverQuestion = /审批|选型|会签|人员|角色|职能|主管|分配/i.test(item.title + item.question);
          const isDeptQuestion = /部门/i.test(item.title + item.question);

          return (
            <div key={item.id} className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs space-y-3">
              {/* 决策项标题 */}
              <div className="flex items-center space-x-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
                <h5 className="font-bold text-slate-800 text-xs md:text-sm">{item.title}</h5>
              </div>

              {/* 问题说明与业务背景 */}
              {item.question && (
                <div className="text-[11px] text-slate-600 bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/70 leading-relaxed font-normal">
                  <span className="font-semibold text-slate-700 mr-1">核对背景:</span>
                  {item.question}
                </div>
              )}

              {/* 选项组 */}
              <div className="grid grid-cols-1 gap-2 pt-1">
                {/* 1. 预设推荐选项 */}
                {item.options.map((opt, oIdx) => {
                  const isSelected = currentChoice === opt.value;
                  const isRec = opt.label.includes("推荐");

                  return (
                    <div
                      key={oIdx}
                      onClick={() => handleSelectOption(item.id, opt.value)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between select-none ${
                        isSelected
                          ? "bg-indigo-50/90 border-indigo-500 shadow-2xs text-indigo-950 font-medium"
                          : "bg-slate-50/60 border-slate-200 hover:border-slate-300 text-slate-700"
                      }`}
                    >
                      <div className="flex items-start space-x-2 min-w-0 pr-2">
                        <input
                          type="radio"
                          name={item.id}
                          checked={isSelected}
                          onChange={() => handleSelectOption(item.id, opt.value)}
                          className="mt-0.5 text-indigo-600 cursor-pointer shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center space-x-1.5 flex-wrap">
                            <span className="text-xs font-medium">{opt.label.replace(/\(推荐\)/, "").trim()}</span>
                            {isRec && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold border border-emerald-200 shrink-0">
                                推荐
                              </span>
                            )}
                          </div>
                          {opt.description && (
                            <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">{opt.description}</p>
                          )}
                        </div>
                      </div>

                      {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />}
                    </div>
                  );
                })}

                {/* 2. 当涉及人员/审批/角色时，提供租户真实角色快捷下拉选择 */}
                {isApproverQuestion && tenantResources && tenantResources.roles.length > 0 && (
                  <div
                    onClick={() => handleSelectOption(item.id, "__TENANT_ROLE__")}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer space-y-2 select-none ${
                      isTenantRole
                        ? "bg-indigo-50/90 border-indigo-500 shadow-2xs text-indigo-950 font-medium"
                        : "bg-slate-50/60 border-slate-200 hover:border-slate-300 text-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name={item.id}
                          checked={isTenantRole}
                          onChange={() => handleSelectOption(item.id, "__TENANT_ROLE__")}
                          className="text-indigo-600 cursor-pointer shrink-0"
                        />
                        <span className="text-xs font-semibold flex items-center space-x-1">
                          <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                          <span>从当前租户真实角色 (Roles) 中指定</span>
                        </span>
                      </div>
                      <span className="text-[10px] text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">
                        {tenantResources.roles.length} 个可用角色
                      </span>
                    </div>

                    {isTenantRole && (
                      <div className="pt-1 pl-5" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={selectedRoles[item.id] || ""}
                          onChange={(e) => setSelectedRoles((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          className="w-full px-3 py-1.5 rounded-lg border border-indigo-300 bg-white focus:outline-none focus:border-indigo-600 text-xs text-slate-800 font-medium"
                        >
                          {tenantResources.roles.map((r) => (
                            <option key={r.apiKey} value={`${r.name} (apiKey: ${r.apiKey})`}>
                              {r.name} (角色标识: {r.apiKey})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. 当涉及人员/审批人时，提供租户真实用户快捷下拉选择 */}
                {isApproverQuestion && tenantResources && tenantResources.users.length > 0 && (
                  <div
                    onClick={() => handleSelectOption(item.id, "__TENANT_USER__")}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer space-y-2 select-none ${
                      isTenantUser
                        ? "bg-indigo-50/90 border-indigo-500 shadow-2xs text-indigo-950 font-medium"
                        : "bg-slate-50/60 border-slate-200 hover:border-slate-300 text-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name={item.id}
                          checked={isTenantUser}
                          onChange={() => handleSelectOption(item.id, "__TENANT_USER__")}
                          className="text-indigo-600 cursor-pointer shrink-0"
                        />
                        <span className="text-xs font-semibold flex items-center space-x-1">
                          <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                          <span>从当前租户真实用户 (Users) 中指定</span>
                        </span>
                      </div>
                      <span className="text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                        {tenantResources.users.length} 个活跃人员
                      </span>
                    </div>

                    {isTenantUser && (
                      <div className="pt-1 pl-5" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={selectedUsers[item.id] || ""}
                          onChange={(e) => setSelectedUsers((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          className="w-full px-3 py-1.5 rounded-lg border border-indigo-300 bg-white focus:outline-none focus:border-indigo-600 text-xs text-slate-800 font-medium"
                        >
                          {tenantResources.users.map((u) => (
                            <option key={u.id} value={`${u.name} (ID: ${u.id})`}>
                              {u.name} {u.departName ? `· ${u.departName}` : ""} (ID: {u.id})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. 当涉及部门时，提供租户真实部门快捷下拉选择 */}
                {isDeptQuestion && tenantResources && tenantResources.departments.length > 0 && (
                  <div
                    onClick={() => handleSelectOption(item.id, "__TENANT_DEPT__")}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer space-y-2 select-none ${
                      isTenantDept
                        ? "bg-indigo-50/90 border-indigo-500 shadow-2xs text-indigo-950 font-medium"
                        : "bg-slate-50/60 border-slate-200 hover:border-slate-300 text-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name={item.id}
                          checked={isTenantDept}
                          onChange={() => handleSelectOption(item.id, "__TENANT_DEPT__")}
                          className="text-indigo-600 cursor-pointer shrink-0"
                        />
                        <span className="text-xs font-semibold flex items-center space-x-1">
                          <Building className="w-3.5 h-3.5 text-sky-600" />
                          <span>从当前租户真实部门 (Departments) 中指定</span>
                        </span>
                      </div>
                      <span className="text-[10px] text-sky-700 bg-sky-50 px-1.5 py-0.2 rounded border border-sky-200">
                        {tenantResources.departments.length} 个部门
                      </span>
                    </div>

                    {isTenantDept && (
                      <div className="pt-1 pl-5" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={selectedDepts[item.id] || ""}
                          onChange={(e) => setSelectedDepts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          className="w-full px-3 py-1.5 rounded-lg border border-indigo-300 bg-white focus:outline-none focus:border-indigo-600 text-xs text-slate-800 font-medium"
                        >
                          {tenantResources.departments.map((d) => (
                            <option key={d.id} value={`${d.departName} (ID: ${d.id})`}>
                              {d.departName} (部门ID: {d.id})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* 5. "其他" 自定义输入选项 */}
                <div
                  onClick={() => handleSelectOption(item.id, "__OTHER__")}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer space-y-2 select-none ${
                    isOther
                      ? "bg-indigo-50/90 border-indigo-500 shadow-2xs text-indigo-950 font-medium"
                      : "bg-slate-50/60 border-slate-200 hover:border-slate-300 text-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name={item.id}
                        checked={isOther}
                        onChange={() => handleSelectOption(item.id, "__OTHER__")}
                        className="text-indigo-600 cursor-pointer shrink-0"
                      />
                      <span className="text-xs font-semibold">其他选项 (自由输入确认)</span>
                    </div>
                    <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                  </div>

                  {isOther && (
                    <div className="pt-1 pl-5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        autoFocus
                        value={customInputs[item.id] || ""}
                        onChange={(e) => handleCustomChange(item.id, e.target.value)}
                        placeholder="请输入您的自定义选项或具体要求..."
                        className="w-full px-3 py-1.5 rounded-lg border border-indigo-300 bg-white focus:outline-none focus:border-indigo-600 text-xs text-slate-800"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部确认操作栏 */}
      <div className="pt-2 flex items-center justify-between border-t border-indigo-100">
        <span className="text-[11px] text-slate-400">
          确认后将自动回传给 AI 生成正式可代码级部署的流程方案
        </span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isSubmitting}
          className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition-all hover:scale-102 cursor-pointer disabled:opacity-50"
        >
          <span>✓ 提交上述确认，生成正式流程方案</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
