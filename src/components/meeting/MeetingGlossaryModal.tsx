import React, { useState } from 'react';
import {
  X,
  BookOpen,
  Plus,
  Trash2,
  Edit2,
  Check,
  Search,
  RotateCcw,
  Sparkles,
  HelpCircle,
  ToggleLeft,
  ToggleRight,
  Info,
} from 'lucide-react';
import { GlossaryTerm, TermCategory } from '../../../shared/meetingTypes';

interface MeetingGlossaryModalProps {
  terms: GlossaryTerm[];
  onClose: () => void;
  onSaveTerm: (term: Partial<GlossaryTerm>) => Promise<void>;
  onDeleteTerm: (id: string) => Promise<void>;
  onResetDefaults: () => Promise<void>;
  initialSearch?: string;
  showToast?: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const MeetingGlossaryModal: React.FC<MeetingGlossaryModalProps> = ({
  terms,
  onClose,
  onSaveTerm,
  onDeleteTerm,
  onResetDefaults,
  initialSearch = '',
  showToast,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState(initialSearch);
  const [editingTerm, setEditingTerm] = useState<Partial<GlossaryTerm> | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // 新增/编辑表单状态
  const [formTerm, setFormTerm] = useState('');
  const [formCategory, setFormCategory] = useState<TermCategory>('custom');
  const [formAliases, setFormAliases] = useState('');
  const [formExplanation, setFormExplanation] = useState('');
  const [formExample, setFormExample] = useState('');

  const startAdd = () => {
    setIsAdding(true);
    setEditingTerm(null);
    setFormTerm('');
    setFormCategory('custom');
    setFormAliases('');
    setFormExplanation('');
    setFormExample('');
  };

  const startEdit = (term: GlossaryTerm) => {
    setIsAdding(false);
    setEditingTerm(term);
    setFormTerm(term.term);
    setFormCategory(term.category);
    setFormAliases((term.aliases || []).join(', '));
    setFormExplanation(term.explanation || '');
    setFormExample(term.exampleSentence || '');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTerm.trim()) {
      showToast?.('info', '请输入术语名称');
      return;
    }

    const aliases = formAliases
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const categoryLabels: Record<TermCategory, string> = {
      crm_sales: 'CRM与业务',
      tech_arch: '技术与架构',
      biz_mgmt: '商务与管理',
      custom: '自定义',
    };

    try {
      await onSaveTerm({
        id: editingTerm?.id,
        term: formTerm.trim(),
        category: formCategory,
        categoryLabel: categoryLabels[formCategory] || '自定义',
        aliases,
        explanation: formExplanation.trim(),
        exampleSentence: formExample.trim(),
        enabled: editingTerm?.enabled ?? true,
      });

      showToast?.('success', editingTerm ? '已更新专业术语' : '已添加新术语至词库');
      setIsAdding(false);
      setEditingTerm(null);
    } catch (err: any) {
      showToast?.('error', `保存失败: ${err.message}`);
    }
  };

  const toggleTermEnabled = async (term: GlossaryTerm) => {
    await onSaveTerm({
      ...term,
      enabled: !term.enabled,
    });
    showToast?.('info', `已${!term.enabled ? '启用' : '禁用'}术语: ${term.term}`);
  };

  const filteredTerms = terms.filter((item) => {
    const matchCat = activeCategory === 'all' || item.category === activeCategory;
    const matchSearch =
      !search.trim() ||
      item.term.toLowerCase().includes(search.toLowerCase()) ||
      item.explanation.toLowerCase().includes(search.toLowerCase()) ||
      (item.aliases || []).some((a) => a.toLowerCase().includes(search.toLowerCase()));
    return matchCat && matchSearch;
  });

  const enabledCount = terms.filter((t) => t.enabled).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl h-[640px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* 顶部标题栏 */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-slate-900">企业级专业术语库</h3>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">
                  已启用 {enabledCount}/{terms.length} 个
                </span>
              </div>
              <p className="text-xs text-slate-500">
                自动将术语注入转写提示，帮助模型识别行业首字母缩写和技术专业词。
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={startAdd}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>新建术语</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 搜索与分类 Tab 栏 */}
        <div className="px-6 py-3 border-b border-slate-100 bg-white flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl text-xs">
            {[
              { id: 'all', label: '全部' },
              { id: 'crm_sales', label: 'CRM与业务' },
              { id: 'tech_arch', label: '技术与架构' },
              { id: 'biz_mgmt', label: '商务与管理' },
              { id: 'custom', label: '自定义' },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  activeCategory === cat.id
                    ? 'bg-white text-blue-600 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="搜索术语、缩写或释义..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 w-52"
              />
            </div>

            <button
              onClick={onResetDefaults}
              title="重置为系统默认术语库"
              className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center space-x-1 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>恢复预置</span>
            </button>
          </div>
        </div>

        {/* 主体区：编辑表单或术语列表 */}
        <div className="flex-1 overflow-y-auto p-6">
          {isAdding || editingTerm ? (
            <form onSubmit={handleSave} className="max-w-xl mx-auto space-y-4 bg-slate-50/70 p-6 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-sm font-bold text-slate-900">
                  {editingTerm ? '编辑专业术语' : '录入新专业术语'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setEditingTerm(null);
                  }}
                  className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  取消
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">术语名称 (必填)</label>
                <input
                  type="text"
                  placeholder="例如: XOQL, CPQ, ARR, SLA..."
                  value={formTerm}
                  onChange={(e) => setFormTerm(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">分类领域</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as TermCategory)}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="crm_sales">CRM与业务</option>
                    <option value="tech_arch">技术与架构</option>
                    <option value="biz_mgmt">商务与管理</option>
                    <option value="custom">企业自定义</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">同音或常见误拼 (逗号分隔)</label>
                  <input
                    type="text"
                    placeholder="如: X-O-Q-L, 小QL"
                    value={formAliases}
                    onChange={(e) => setFormAliases(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">业务/技术释义与背景</label>
                <textarea
                  rows={3}
                  placeholder="详述该术语的定义、在系统中的作用或业务含义..."
                  value={formExplanation}
                  onChange={(e) => setFormExplanation(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">典型例句 (可选)</label>
                <input
                  type="text"
                  placeholder="例如: 在数据同步中，需通过 XOQL 执行过滤查询..."
                  value={formExample}
                  onChange={(e) => setFormExample(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setEditingTerm(null);
                  }}
                  className="px-4 py-1.5 text-xs text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-medium shadow-xs cursor-pointer"
                >
                  保存术语
                </button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredTerms.length === 0 ? (
                <div className="col-span-2 py-16 text-center text-slate-400 space-y-2">
                  <BookOpen className="w-8 h-8 mx-auto text-slate-300" />
                  <span className="text-xs">未找到匹配的专业术语</span>
                </div>
              ) : (
                filteredTerms.map((term) => (
                  <div
                    key={term.id}
                    className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                      term.enabled
                        ? 'bg-white border-slate-200/90 shadow-2xs hover:border-blue-300'
                        : 'bg-slate-50/70 border-slate-200/50 opacity-60'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-900 text-sm">{term.term}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 font-medium">
                            {term.categoryLabel}
                          </span>
                        </div>

                        {/* 启用/禁用 开关 */}
                        <button
                          onClick={() => toggleTermEnabled(term)}
                          title={term.enabled ? '已启用（自动注入转写提示）' : '已禁用'}
                          className="cursor-pointer"
                        >
                          {term.enabled ? (
                            <ToggleRight className="w-5 h-5 text-blue-600" />
                          ) : (
                            <ToggleLeft className="w-5 h-5 text-slate-300" />
                          )}
                        </button>
                      </div>

                      {/* 别名 */}
                      {term.aliases && term.aliases.length > 0 && (
                        <div className="text-[11px] text-slate-400 flex items-center space-x-1">
                          <span>同音/别名:</span>
                          <span className="font-mono text-slate-600">{term.aliases.join(', ')}</span>
                        </div>
                      )}

                      {/* 解释 */}
                      <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                        {term.explanation}
                      </p>
                    </div>

                    {/* 底部操作与例句 */}
                    <div className="pt-3 mt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-[10px] text-slate-400">
                        {term.isBuiltin ? '系统预置标准词' : '用户自定义'}
                      </span>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => startEdit(term)}
                          className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                          title="编辑术语"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteTerm(term.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                          title="删除术语"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* 底部说明栏 */}
        <div className="px-6 py-2.5 bg-blue-50/60 border-t border-blue-100 text-[11px] text-blue-800 flex items-center space-x-2">
          <Info className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            提示：会议转写时，已启用的术语将作为 prompt 提示传给转写服务，帮助模型优先识别这些标准词汇。
          </span>
        </div>
      </div>
    </div>
  );
};
