import React, { useState, useEffect } from "react";
import { PrintObjectItem, PrintTemplateItem, SessionState } from "../../../shared/types";
import {
  Printer,
  Search,
  RefreshCw,
  Power,
  ExternalLink,
  Sparkles,
  X,
  Check,
  Loader2,
  FileText,
  FileCode,
  Tag,
  AlertCircle,
  Download,
  Layers,
  ChevronRight,
  Code2
} from "lucide-react";

interface PrintTemplateManagerModalProps {
  isOpen: boolean;
  crmSession: SessionState;
  onClose: () => void;
  onSendToAiPrompt?: (promptText: string) => void;
  showToast: (type: "success" | "error" | "info", text: string) => void;
}

export const PrintTemplateManagerModal: React.FC<PrintTemplateManagerModalProps> = ({
  isOpen,
  crmSession,
  onClose,
  onSendToAiPrompt,
  showToast,
}) => {
  const [objects, setObjects] = useState<PrintObjectItem[]>([]);
  const [selectedObject, setSelectedObject] = useState<PrintObjectItem | null>(null);
  const [templates, setTemplates] = useState<PrintTemplateItem[]>([]);
  const [loadingObjects, setLoadingObjects] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // 字段占位符弹窗
  const [fieldsTargetObject, setFieldsTargetObject] = useState<PrintObjectItem | null>(null);
  const [fieldsData, setFieldsData] = useState<any>(null);
  const [loadingFields, setLoadingFields] = useState(false);

  // 加载对象列表
  const loadObjects = async () => {
    if (!window.neoApi?.printListObjects) return;
    setLoadingObjects(true);
    try {
      const res = await window.neoApi.printListObjects();
      if (res.success && Array.isArray(res.data)) {
        setObjects(res.data);
        if (!selectedObject && res.data.length > 0) {
          // 默认选中第一个有模板的对象或列表首项
          const firstConfigured = res.data.find((o) => o.allNum > 0) || res.data[0];
          setSelectedObject(firstConfigured);
        }
      } else {
        showToast("error", res.error || "获取打印对象列表失败");
      }
    } catch (e: any) {
      showToast("error", `加载异常: ${e.message}`);
    } finally {
      setLoadingObjects(false);
    }
  };

  // 加载选中对象的模板列表
  const loadTemplates = async (obj: PrintObjectItem) => {
    if (!window.neoApi?.printListTemplates) return;
    setLoadingTemplates(true);
    try {
      const res = await window.neoApi.printListTemplates({ objectId: obj.objectId, entityApiKey: obj.apiKey });
      if (res.success && Array.isArray(res.data)) {
        setTemplates(res.data);
      } else {
        showToast("error", res.error || "获取模板列表失败");
      }
    } catch (e: any) {
      showToast("error", `加载模板失败: ${e.message}`);
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadObjects();
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedObject) {
      loadTemplates(selectedObject);
    }
  }, [selectedObject?.objectId]);

  if (!isOpen) return null;

  // 启停切换
  const handleToggleStatus = async (tpl: PrintTemplateItem) => {
    if (!window.neoApi?.printToggleStatus) return;
    const willEnable = tpl.status !== 1;
    setActionLoadingId(`status_${tpl.id}`);

    try {
      const res = await window.neoApi.printToggleStatus(tpl.id, willEnable);
      if (res.success) {
        showToast("success", `模板 [${tpl.name}] 已${willEnable ? "启用" : "禁用"}！`);
        if (selectedObject) await loadTemplates(selectedObject);
        await loadObjects();
      } else {
        showToast("error", `操作失败: ${res.error || "未知原因"}`);
      }
    } catch (e: any) {
      showToast("error", `操作异常: ${e.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // 按照规范直接在当前项目工作区生成本地标准 Word 打印模板 (.docx)
  const handleGenerateLocalTemplate = async (obj: PrintObjectItem) => {
    if (!window.neoApi?.printGenerateTemplate) return;
    try {
      const res = await window.neoApi.printGenerateTemplate({
        entityApiKey: obj.apiKey,
        objectLabel: obj.label,
        fileName: `${obj.label}_业务打印模板.docx`,
      });
      if (res.success) {
        showToast("success", `已成功在工作区生成标准模板: ${res.fileName}！`);
        if (window.neoApi?.shellShowItemInFolder && res.fullPath) {
          window.neoApi.shellShowItemInFolder(res.fullPath);
        }
      } else {
        showToast("error", `生成失败: ${res.error || res.message}`);
      }
    } catch (e: any) {
      showToast("error", `生成异常: ${e.message}`);
    }
  };

  // 打开字段字典抽屉
  const handleOpenFields = async (obj: PrintObjectItem) => {
    setFieldsTargetObject(obj);
    setLoadingFields(true);
    setFieldsData(null);
    try {
      if (window.neoApi?.printGetFields) {
        const res = await window.neoApi.printGetFields({ objectId: obj.objectId, entityApiKey: obj.apiKey });
        if (res.success && res.data) {
          setFieldsData(res.data);
        } else {
          showToast("error", res.error || "获取字段失败");
        }
      }
    } catch (e: any) {
      showToast("error", `加载字段异常: ${e.message}`);
    } finally {
      setLoadingFields(false);
    }
  };

  // 咨询 AI
  const handleSendToAi = (obj: PrintObjectItem, tpl?: PrintTemplateItem) => {
    if (!onSendToAiPrompt) return;
    let prompt = "";
    if (tpl) {
      prompt = `请基于《销售易打印模板实测型工程师视角规范》，为我深度分析【${obj.label}】(${obj.apiKey}) 下的打印模板 [${tpl.name}] (模板ID: ${tpl.id})。请核查其主字段占位符、明细表格循环结构、条件控制表达式与排版合格性，并输出优化建议与实测步骤。`;
    } else {
      prompt = `请基于《销售易打印模板实测型工程师视角规范》，为【${obj.label}】(${obj.apiKey}) 规划设计一套高标准的 Word/Excel 打印模板方案。包含：1. 证据边界与元数据对账；2. 主表字段占位符清单；3. 明细物理表格循环语法 (##={prt.items})；4. 打印条件与分页控制。`;
    }
    onSendToAiPrompt(prompt);
    onClose();
  };

  // 过滤对象列表
  const filteredObjects = objects.filter((o) => {
    if (!keyword.trim()) return true;
    const kw = keyword.toLowerCase();
    return o.label.toLowerCase().includes(kw) || o.apiKey.toLowerCase().includes(kw);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden">
        {/* 顶部标题栏 */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-amber-500 text-white shadow-xs">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-slate-800">销售易租户打印模板资产库</h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold border border-amber-200">
                  Print Templates
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200 flex items-center space-x-1">
                  <Check className="w-3 h-3 text-emerald-600" />
                  <span>免锁开放使用</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                实时调阅当前沙盒/租户下各业务对象的 Word / Excel 打印模板、启停状态、字段字典与官方范例
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 主体两栏布局: 左侧对象选择，右侧模板列表 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 左侧栏: 业务对象列表 */}
          <div className="w-72 border-r border-slate-100 flex flex-col bg-slate-50/30">
            {/* 搜索与刷新 */}
            <div className="p-3 border-b border-slate-100 space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="搜索业务对象 (如客户/contract)..."
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-amber-400"
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
                <span>支持打印对象 ({objects.length})</span>
                <button
                  onClick={loadObjects}
                  disabled={loadingObjects}
                  className="hover:text-amber-600 flex items-center space-x-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingObjects ? "animate-spin" : ""}`} />
                  <span>刷新</span>
                </button>
              </div>
            </div>

            {/* 对象列表 */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100/80">
              {loadingObjects && objects.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 flex flex-col items-center space-y-2">
                  <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                  <span>正在扫描租户打印对象...</span>
                </div>
              ) : filteredObjects.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  未匹配到相关业务对象
                </div>
              ) : (
                filteredObjects.map((obj) => {
                  const isSelected = selectedObject?.objectId === obj.objectId;
                  return (
                    <div
                      key={obj.objectId}
                      onClick={() => setSelectedObject(obj)}
                      className={`p-3 cursor-pointer transition-colors flex items-center justify-between text-xs ${
                        isSelected
                          ? "bg-amber-50/80 border-r-2 border-amber-500 text-amber-900 font-semibold"
                          : "hover:bg-slate-100/60 text-slate-700"
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center space-x-1.5 truncate">
                          <span className="truncate">{obj.label}</span>
                          {obj.allNum > 0 && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-mono font-bold shrink-0">
                              {obj.allNum}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                          {obj.apiKey}
                        </div>
                      </div>

                      <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-amber-600" : "text-slate-300"}`} />
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 右侧栏: 选中对象的模板列表与操作 */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            {selectedObject ? (
              <>
                {/* 顶部对象信息卡片 */}
                <div className="p-4 border-b border-slate-100 bg-slate-50/40 flex items-center justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="text-sm font-bold text-slate-800">
                        【{selectedObject.label}】打印模板资产
                      </h4>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 text-slate-600">
                        {selectedObject.apiKey} (ID: {selectedObject.objectId})
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      已配置模板 <strong className="text-slate-700">{templates.length}</strong> 个 · 启用中 <strong className="text-emerald-600">{templates.filter((t) => t.status === 1).length}</strong> 个
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleOpenFields(selectedObject)}
                      className="px-3 py-1.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold flex items-center space-x-1 transition-colors cursor-pointer"
                      title="调阅该对象的可用字段、占位符语法及明细关联子对象"
                    >
                      <Code2 className="w-3.5 h-3.5 text-amber-600" />
                      <span>打印字段字典</span>
                    </button>

                    <button
                      onClick={() => handleGenerateLocalTemplate(selectedObject)}
                      className="px-3 py-1.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold flex items-center space-x-1 transition-colors cursor-pointer shadow-2xs"
                      title="按照销售易打印规范直接在当前项目工作区生成标准 Word 模板文件 (.docx)"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                      <span>生成本地标准模板 (.docx)</span>
                    </button>

                    <button
                      onClick={() => handleSendToAi(selectedObject)}
                      className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-semibold flex items-center space-x-1 shadow-xs cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>为该对象设计新模板</span>
                    </button>
                  </div>
                </div>

                {/* 模板表格 */}
                <div className="flex-1 overflow-y-auto p-4">
                  {loadingTemplates ? (
                    <div className="h-64 flex flex-col items-center justify-center space-y-2 text-xs text-slate-400">
                      <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                      <span>正在调阅该对象打印模板...</span>
                    </div>
                  ) : templates.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center space-y-3 text-center">
                      <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                        <Printer className="w-6 h-6" />
                      </div>
                      <div className="max-w-xs">
                        <p className="text-sm font-semibold text-slate-700">当前对象尚未配置打印模板</p>
                        <p className="text-xs text-slate-400 mt-1">
                          您可以点击上方【生成本地标准模板 (.docx)】直接在当前工作区生成包含主表与明细循环的真实底稿，或由 AI 协助设计。
                        </p>
                      </div>
                      <button
                        onClick={() => handleSendToAi(selectedObject)}
                        className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center space-x-1.5 cursor-pointer shadow-xs"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>咨询 AI 规划【{selectedObject.label}】打印方案</span>
                      </button>
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs divide-y divide-slate-100">
                      {templates.map((tpl) => (
                        <div
                          key={tpl.id}
                          className="p-4 hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-4"
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center space-x-2">
                              <h5 className="text-sm font-bold text-slate-800 truncate">
                                {tpl.name}
                              </h5>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                                  tpl.status === 1
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-slate-100 text-slate-600 border-slate-200"
                                }`}
                              >
                                {tpl.statusName}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-mono">
                                {tpl.outputTypeName}
                              </span>
                              {tpl.hasCondition && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-200">
                                  带打印条件
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-mono">
                              <span>ID: {tpl.id}</span>
                              {tpl.fileName && (
                                <span className="truncate max-w-xs text-slate-600 flex items-center space-x-1">
                                  <FileText className="w-3 h-3 text-slate-400" />
                                  <span>{tpl.fileName}</span>
                                </span>
                              )}
                              {tpl.updatedAt && (
                                <span>更新: {new Date(tpl.updatedAt).toLocaleDateString()}</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center space-x-2 shrink-0">
                            {/* 启停切换 */}
                            <button
                              onClick={() => handleToggleStatus(tpl)}
                              disabled={actionLoadingId === `status_${tpl.id}`}
                              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center space-x-1 transition-colors cursor-pointer ${
                                tpl.status === 1
                                  ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              }`}
                            >
                              {actionLoadingId === `status_${tpl.id}` ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Power className="w-3.5 h-3.5" />
                              )}
                              <span>{tpl.status === 1 ? "禁用" : "启用"}</span>
                            </button>

                            {/* 咨询 AI */}
                            <button
                              onClick={() => handleSendToAi(selectedObject, tpl)}
                              className="px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center space-x-1 cursor-pointer"
                              title="以此模板为上下文向 AI 咨询排版、优化与明细标记"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                              <span>咨询 AI</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                请在左侧选择一个业务对象
              </div>
            )}
          </div>
        </div>

        {/* 底部信息栏 */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>打印引擎免锁授权就绪 · 遵循四层证据边界与物理表格循环规范</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer"
          >
            关闭
          </button>
        </div>
      </div>

      {/* 字段字典抽屉弹窗 */}
      {fieldsTargetObject && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center space-x-2">
                <Code2 className="w-4 h-4 text-amber-600" />
                <h4 className="text-sm font-bold text-slate-800">
                  【{fieldsTargetObject.label}】打印占位符与字段字典
                </h4>
              </div>
              <button
                onClick={() => setFieldsTargetObject(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto space-y-4">
              {loadingFields ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-2 text-xs text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                  <span>正在解析字段与关联明细...</span>
                </div>
              ) : fieldsData ? (
                <>
                  {/* 系统内置时间函数 */}
                  <div className="space-y-1.5">
                    <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span>常用系统占位符与函数</span>
                      <span className="text-[10px] text-slate-400 font-mono">Word & Excel 通用</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      {(fieldsData.functionFields || []).map((fn: any, idx: number) => (
                        <div key={idx} className="p-2 rounded-xl border border-slate-200 bg-slate-50/60 space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-800">{fn.name}</span>
                            <code className="text-[10px] px-1.5 py-0.2 rounded bg-white text-indigo-700 font-mono border border-indigo-100">
                              {fn.syntax}
                            </code>
                          </div>
                          <p className="text-[11px] text-slate-500">{fn.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 明细子对象 (用于循环) */}
                  {fieldsData.childLinks?.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>明细子对象 ({fieldsData.childLinks.length} 个 · 必须在物理表格行中使用)</span>
                        <span className="text-[10px] text-purple-600 font-mono font-semibold">##={"{prt.子对象}"}</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                        {fieldsData.childLinks.map((cl: any, idx: number) => (
                          <div key={idx} className="p-2 rounded-xl border border-purple-200 bg-purple-50/40 flex items-center justify-between">
                            <div>
                              <span className="font-semibold text-purple-900">{cl.label}</span>
                              <span className="text-[10px] text-slate-400 font-mono ml-1.5">({cl.apiKey})</span>
                            </div>
                            <code className="text-[10px] px-1.5 py-0.5 rounded bg-white text-purple-700 font-mono border border-purple-200 font-bold">
                              {cl.loopSyntax}
                            </code>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 主表字段 */}
                  <div className="space-y-1.5">
                    <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span>主业务对象可用字段 ({fieldsData.mainFields?.length} 项)</span>
                      <span className="text-[10px] text-amber-700 font-mono font-semibold">##{"{字段API}"}</span>
                    </div>
                    <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-60 overflow-y-auto">
                      {(fieldsData.mainFields || []).map((f: any, idx: number) => (
                        <div key={idx} className="p-2 flex items-center justify-between text-xs bg-white hover:bg-slate-50">
                          <div className="flex items-center space-x-2">
                            <span className="text-slate-400 font-mono text-[10px] w-6">{idx + 1}.</span>
                            <span className="font-semibold text-slate-800">{f.label}</span>
                            <span className="text-[10px] text-slate-400 font-mono">({f.apiKey})</span>
                          </div>
                          <code className="text-[11px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 font-mono border border-amber-200 font-bold">
                            {f.placeholder}
                          </code>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">未获取到字段定义</div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setFieldsTargetObject(null)}
                className="px-4 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer"
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
