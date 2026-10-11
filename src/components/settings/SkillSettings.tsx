import React, { useState } from 'react';
import { AiSkillItem } from '../../../shared/types';
import { 
  Lightbulb, 
  Plus, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  Sparkles, 
  Code2, 
  Database, 
  Box, 
  ShieldCheck, 
  X,
  ChevronDown,
  ChevronRight,
  User,
  Shield
} from 'lucide-react';

interface SkillSettingsProps {
  skills: AiSkillItem[];
  onSaveSkill: (skill: AiSkillItem) => Promise<void>;
  onDeleteSkill: (id: string) => Promise<void>;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const SkillSettings: React.FC<SkillSettingsProps> = ({
  skills,
  onSaveSkill,
  onDeleteSkill,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'builtin' | 'personal'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<AiSkillItem | null>(null);

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
    setEditingSkill(skill);
    setName(skill.name);
    setDescription(skill.description);
    setTriggerKeywordsStr((skill.triggerKeywords || []).join(', '));
    setSystemInstruction(skill.systemInstruction);
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

  const filteredSkills = skills.filter((s) => {
    if (activeTab === 'builtin') return s.category === 'builtin';
    if (activeTab === 'personal') return s.category === 'personal';
    return true;
  });

  const builtinCount = skills.filter((s) => s.category === 'builtin').length;
  const personalCount = skills.filter((s) => s.category === 'personal').length;

  return (
    <div className="space-y-6 text-xs">
      <div className="pb-3 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-800">Skill 技能库 (Skills System)</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            分为「系统内置」与「个人专属」两层技能体系，在对话中可一键挂载特定专业知识与业务规则。
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-xs cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>新建个人技能</span>
        </button>
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
                    <Lightbulb className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="text-sm font-bold text-slate-900">{skill.name}</h4>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium border ${
                          isBuiltin
                            ? 'bg-sky-100 text-sky-800 border-sky-200'
                            : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        }`}
                      >
                        {isBuiltin ? '系统内置' : '个人自定义'}
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
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={skill.enabled}
                      onChange={() => handleToggleEnabled(skill)}
                      className="w-4 h-4 rounded text-sky-600"
                    />
                  </label>
                  {!isBuiltin && (
                    <>
                      <button
                        onClick={() => handleOpenEdit(skill)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                        title="编辑"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteSkill(skill.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                        title="删除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-slate-400 cursor-pointer" onClick={() => setExpandedId(null)} />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400 cursor-pointer" onClick={() => setExpandedId(skill.id)} />
                  )}
                </div>
              </div>

              {/* 展开的 System Instruction 预览 */}
              {isExpanded && (
                <div className="p-4 bg-slate-50/80 border-t border-slate-100 space-y-1.5">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    注入的系统技能指令 (System Instruction)
                  </div>
                  <pre className="p-3 rounded-xl bg-slate-900 text-slate-200 font-sans text-xs leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto">
                    {skill.systemInstruction}
                  </pre>
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
              <button onClick={() => setModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
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
                  className="px-4 py-1.5 rounded-xl border border-slate-200 text-slate-600"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
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
