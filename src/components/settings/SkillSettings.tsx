import React, { useState } from 'react';
import { AiSkillItem } from '../../../shared/types';
import { 
  Lightbulb, 
  Plus, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  ShieldCheck, 
  X,
  ChevronDown,
  ChevronRight,
  User,
  Shield,
  Lock,
  Upload,
  Download,
  FolderArchive,
  Loader2
} from 'lucide-react';

interface SkillSettingsProps {
  skills: AiSkillItem[];
  onSaveSkill: (skill: AiSkillItem) => Promise<void>;
  onDeleteSkill: (id: string) => Promise<void>;
  onSkillsChange?: (skills: AiSkillItem[]) => void;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const SkillSettings: React.FC<SkillSettingsProps> = ({
  skills,
  onSaveSkill,
  onDeleteSkill,
  onSkillsChange,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'builtin' | 'personal'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<AiSkillItem | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // 展开查看详情的 skill id
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 表单状态
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerKeywordsStr, setTriggerKeywordsStr] = useState('');
  const [systemInstruction, setSystemInstruction] = useState('');

  const handleOpenAdd = () => {
    setEditingSkill(null);
    setName('');
    setDescription('');
    setTriggerKeywordsStr('合同审批, 商务流, 回款');
    setSystemInstruction('你是一个专注该业务场景的专家，在提供建议时请注意...');
    setModalOpen(true);
  };

  const handleOpenEdit = (skill: AiSkillItem) => {
    if (skill.category === 'builtin') {
      showToast('info', '系统内置技能受内核加密保护，不可直接编辑');
      return;
    }
    setEditingSkill(skill);
    setName(skill.name);
    setDescription(skill.description);
    setTriggerKeywordsStr((skill.triggerKeywords || []).join(', '));
    setSystemInstruction(skill.systemInstruction || '');
    setModalOpen(true);
  };

  const handleToggleEnabled = async (skill: AiSkillItem) => {
    await onSaveSkill({ ...skill, enabled: !skill.enabled });
    showToast('info', `技能 [${skill.name}] 已${!skill.enabled ? '启用' : '停用'}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('error', '请输入技能名称');
      return;
    }
    if (!systemInstruction.trim()) {
      showToast('error', '请输入系统指令');
      return;
    }

    const keywords = triggerKeywordsStr
      .split(/[,，\s]+/)
      .map((k) => k.trim())
      .filter(Boolean);

    const payload: AiSkillItem = {
      id: editingSkill?.id || `skill_user_${Date.now()}`,
      name: name.trim(),
      description: description.trim() || '个人自定义业务技能',
      category: 'personal',
      enabled: editingSkill?.enabled ?? true,
      triggerKeywords: keywords,
      systemInstruction: systemInstruction.trim(),
    };

    await onSaveSkill(payload);
    setModalOpen(false);
    showToast('success', `个人技能 [${payload.name}] 已保存`);
  };

  // ================= ZIP 技能包导入与导出 =================

  // 1. 打开对话框选择 ZIP 包导入
  const handleImportZip = async () => {
    if (!window.neoApi?.aiImportSkillZip) return;
    setIsImporting(true);
    try {
      const res = await window.neoApi.aiImportSkillZip();
      if (res.canceled) return;
      if (!res.success || res.error) {
        showToast('error', `导入失败: ${res.error || '未能解析 ZIP 技能包'}`);
        return;
      }
      if (res.skills && onSkillsChange) {
        onSkillsChange(res.skills);
      }
      const namesStr = (res.importedNames || []).slice(0, 3).map((n: string) => `[${n}]`).join('、');
      showToast('success', `成功导入 ${res.importedCount || 1} 个技能包 ${namesStr}`);
    } catch (e: any) {
      showToast('error', `导入发生异常: ${e.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  // 2. 拖拽 ZIP 文件导入
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const zipFile = Array.from(files).find((f) => f.name.toLowerCase().endsWith('.zip'));
    if (!zipFile) {
      showToast('error', '请拖入 .zip 格式的技能包压缩文件');
      return;
    }

    if (!window.neoApi?.aiImportSkillZipBuffer) return;
    setIsImporting(true);
    try {
      const buffer = await zipFile.arrayBuffer();
      const res = await window.neoApi.aiImportSkillZipBuffer(zipFile.name, buffer);
      if (!res.success || res.error) {
        showToast('error', `导入失败: ${res.error}`);
        return;
      }
      if (res.skills && onSkillsChange) {
        onSkillsChange(res.skills);
      }
      const namesStr = (res.importedNames || []).slice(0, 3).map((n: string) => `[${n}]`).join('、');
      showToast('success', `成功导入 ${res.importedCount || 1} 个技能: ${namesStr}`);
    } catch (e: any) {
      showToast('error', `解析技能包失败: ${e.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  // 3. 导出单个个人技能为 ZIP
  const handleExportSingleSkill = async (skill: AiSkillItem) => {
    if (skill.category === 'builtin') {
      showToast('error', '系统内置技能受内核加密保护，不可导出下载');
      return;
    }
    if (!window.neoApi?.aiExportSkillZip) return;
    setIsExporting(true);
    try {
      const res = await window.neoApi.aiExportSkillZip([skill.id]);
      if (res.canceled) return;
      if (res.success && res.filePath) {
        showToast('success', `已导出技能包: ${skill.name}.zip`);
      } else if (res.error) {
        showToast('error', `导出失败: ${res.error}`);
      }
    } catch (e: any) {
      showToast('error', `导出异常: ${e.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // 4. 批量导出所有个人技能为 ZIP
  const handleExportAllPersonal = async () => {
    const personalSkills = skills.filter((s) => s.category === 'personal');
    if (personalSkills.length === 0) {
      showToast('info', '暂无个人专属技能可供导出');
      return;
    }
    if (!window.neoApi?.aiExportSkillZip) return;
    setIsExporting(true);
    try {
      const res = await window.neoApi.aiExportSkillZip();
      if (res.canceled) return;
      if (res.success && res.filePath) {
        showToast('success', `成功导出 ${personalSkills.length} 个个人技能集合包`);
      } else if (res.error) {
        showToast('error', `导出失败: ${res.error}`);
      }
    } catch (e: any) {
      showToast('error', `导出异常: ${e.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const filteredSkills = skills.filter((s) => {
    if (activeTab === 'builtin') return s.category === 'builtin';
    if (activeTab === 'personal') return s.category === 'personal';
    return true;
  });

  const builtinCount = skills.filter((s) => s.category === 'builtin').length;
  const personalCount = skills.filter((s) => s.category === 'personal').length;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`space-y-6 text-xs transition-colors rounded-2xl ${
        isDraggingOver ? 'bg-indigo-50/40 outline-2 outline-dashed outline-indigo-400 p-2' : ''
      }`}
    >
      <div className="pb-3 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-800 flex items-center space-x-2">
            <span>Skill 技能库 (Skills System)</span>
            {isDraggingOver && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-600 text-white font-normal animate-pulse">
                释放以导入 ZIP 技能包
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            分为「系统内置」与「个人专属」两层体系。内置技能受内核加密保护，支持通过 .zip 技能包快速导入与导出自定义技能。
          </p>
        </div>

        {/* 顶部操作按钮组 */}
        <div className="flex items-center space-x-2">
          {/* 导入 ZIP 技能包按钮 */}
          <button
            onClick={handleImportZip}
            disabled={isImporting}
            className="px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100/80 text-indigo-700 text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-2xs cursor-pointer"
            title="支持导入包含 SKILL.md 或多个文档的 ZIP 压缩包"
          >
            {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderArchive className="w-3.5 h-3.5" />}
            <span>导入技能包 (.zip)</span>
          </button>

          {/* 批量导出个人技能 */}
          {personalCount > 0 && (
            <button
              onClick={handleExportAllPersonal}
              disabled={isExporting}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center space-x-1.5 transition-colors shadow-2xs cursor-pointer"
              title="打包导出所有个人自定义技能"
            >
              {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              <span>导出技能包</span>
            </button>
          )}

          {/* 新建个人技能 */}
          <button
            onClick={handleOpenAdd}
            className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新建个人技能</span>
          </button>
        </div>
      </div>

      {/* 分类切换器 */}
      <div className="flex items-center space-x-2 border-b border-slate-100 pb-2">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            activeTab === 'all'
              ? 'bg-sky-50 text-sky-700 font-semibold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          全部技能 ({skills.length})
        </button>
        <button
          onClick={() => setActiveTab('builtin')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center space-x-1.5 ${
            activeTab === 'builtin'
              ? 'bg-sky-50 text-sky-700 font-semibold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Shield className="w-3.5 h-3.5 text-sky-600" />
          <span>系统内置 ({builtinCount})</span>
        </button>
        <button
          onClick={() => setActiveTab('personal')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center space-x-1.5 ${
            activeTab === 'personal'
              ? 'bg-sky-50 text-sky-700 font-semibold'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <User className="w-3.5 h-3.5 text-indigo-600" />
          <span>个人专属 ({personalCount})</span>
        </button>
      </div>

      {/* 安全保护提示横幅 */}
      {activeTab === 'builtin' && (
        <div className="p-3 bg-sky-50/70 border border-sky-100 rounded-xl flex items-center space-x-2.5 text-sky-900">
          <ShieldCheck className="w-4 h-4 text-sky-600 shrink-0" />
          <span className="text-xs">
            系统内置专业技能已全面实施<strong>内核级加密沙箱保护</strong>，禁止明文提取、查阅与破解导出，可在对话中直接挂载生效。
          </span>
        </div>
      )}

      {/* 技能卡片列表 */}
      <div className="space-y-3">
        {filteredSkills.map((skill) => {
          const isBuiltin = skill.category === 'builtin';
          const isExpanded = expandedId === skill.id;

          return (
            <div
              key={skill.id}
              className={`rounded-2xl border transition-all overflow-hidden ${
                skill.enabled
                  ? isBuiltin
                    ? 'border-sky-200 bg-sky-50/20'
                    : 'border-indigo-200 bg-white'
                  : 'border-slate-200 bg-slate-50/60 opacity-65'
              }`}
            >
              <div
                onClick={() => setExpandedId(isExpanded ? null : skill.id)}
                className="p-4 flex items-start justify-between cursor-pointer hover:bg-slate-50/60 transition-colors"
              >
                <div className="flex items-start space-x-3">
                  <div
                    className={`p-2 rounded-xl mt-0.5 shrink-0 ${
                      isBuiltin
                        ? 'bg-sky-600 text-white'
                        : 'bg-indigo-600 text-white'
                    }`}
                  >
                    {isBuiltin ? <Lock className="w-4 h-4" /> : <Lightbulb className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="text-sm font-bold text-slate-900">{skill.name}</h4>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium border flex items-center space-x-1 ${
                          isBuiltin
                            ? 'bg-sky-100 text-sky-800 border-sky-200'
                            : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        }`}
                      >
                        {isBuiltin && <ShieldCheck className="w-2.5 h-2.5" />}
                        <span>{isBuiltin ? '内核加密 · 系统内置' : '个人自定义'}</span>
                      </span>
                      {skill.enabled ? (
                        <span className="text-[10px] text-emerald-600 flex items-center space-x-0.5 font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>已启用</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">已停用</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{skill.description}</p>

                    {/* 触发关键词 */}
                    {skill.triggerKeywords && skill.triggerKeywords.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <span className="text-[10px] text-slate-400">意图触发词:</span>
                        {skill.triggerKeywords.map((kw, ki) => (
                          <span
                            key={ki}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-slate-200 font-mono text-slate-600 shadow-2xs"
                          >
                            #{kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 操作栏 */}
                <div className="flex items-center space-x-2 shrink-0 ml-3" onClick={(e) => e.stopPropagation()}>
                  <label className="inline-flex items-center cursor-pointer" title={skill.enabled ? '点击停用' : '点击启用'}>
                    <input
                      type="checkbox"
                      checked={skill.enabled}
                      onChange={() => handleToggleEnabled(skill)}
                      className="w-4 h-4 rounded text-sky-600 cursor-pointer"
                    />
                  </label>

                  {!isBuiltin ? (
                    <>
                      {/* 单个个人技能导出 ZIP 按钮 */}
                      <button
                        onClick={() => handleExportSingleSkill(skill)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                        title="导出为此技能的 .zip 技能包"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleOpenEdit(skill)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                        title="编辑个人技能"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteSkill(skill.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                        title="删除个人技能"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-medium px-1">安全锁定</span>
                  )}
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-slate-400 cursor-pointer" onClick={() => setExpandedId(null)} />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400 cursor-pointer" onClick={() => setExpandedId(skill.id)} />
                  )}
                </div>
              </div>

              {/* 展开内容区 */}
              {isExpanded && (
                <div className="p-4 border-t border-slate-100 transition-all">
                  {isBuiltin ? (
                    // 内置技能：坚决不展示明文指令，显示内核安全加密保护卡片
                    <div className="p-3.5 bg-sky-50/60 rounded-xl border border-sky-100 flex items-start space-x-3 text-sky-950">
                      <ShieldCheck className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
                      <div className="space-y-1">
                        <div className="font-semibold text-xs text-sky-900">
                          系统内置核心业务规范（已受内核底层安全沙箱保护）
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          该技能提示词及核心规则已深度编译并封装在桌面内核中，实施运行时混淆与防逆向保护，禁止明文查阅、复制与导出。在 AI 对话中一键勾选即可直接获得高精度的专家指导。
                        </p>
                      </div>
                    </div>
                  ) : (
                    // 个人技能：展示用户自己编写或导入的指令，并提供导出
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          个人技能系统指令 (System Instruction)
                        </div>
                        <button
                          onClick={() => handleExportSingleSkill(skill)}
                          className="text-[11px] text-indigo-600 hover:text-indigo-700 font-medium flex items-center space-x-1 cursor-pointer"
                        >
                          <Download className="w-3 h-3" />
                          <span>导出此技能为 .zip</span>
                        </button>
                      </div>
                      <pre className="p-3 rounded-xl bg-slate-900 text-slate-200 font-sans text-xs leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto">
                        {skill.systemInstruction || '(暂无指令内容)'}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 新建/编辑个人技能模态框 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center space-x-2">
                <Lightbulb className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-800">
                  {editingSkill ? '编辑个人专属技能' : '新建个人专属技能 (Custom Skill)'}
                </h3>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  技能名称 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：特定业务线的合同审批规范 / 财务对账助手"
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">技能描述</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="简要说明该技能在何时起作用..."
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  触发关键词 (用逗号隔开)
                </label>
                <input
                  type="text"
                  value={triggerKeywordsStr}
                  onChange={(e) => setTriggerKeywordsStr(e.target.value)}
                  placeholder="合同, 审批, 账期, 回款"
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  系统技能专业指令 (System Instruction) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={6}
                  required
                  value={systemInstruction}
                  onChange={(e) => setSystemInstruction(e.target.value)}
                  placeholder="编写赋予 AI 的专门背景知识、检查清单或规范约束..."
                  className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 font-sans leading-relaxed text-xs"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-1.5 rounded-xl border border-slate-200 text-slate-600 cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer"
                >
                  保存个人技能
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
