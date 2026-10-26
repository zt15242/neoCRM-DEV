import React, { useState, useEffect } from 'react';
import { 
  X, 
  Search, 
  UserCheck, 
  Building, 
  MessageSquare, 
  Target, 
  ShieldAlert, 
  Lightbulb, 
  Mail, 
  RefreshCw, 
  Sparkles, 
  UserPlus, 
  Briefcase,
  Star,
  ChevronRight,
  TrendingUp,
  Save
} from 'lucide-react';
import { ContactPersona } from '../../../shared/mailTypes';

interface PersonaDirectoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComposeTo: (email: string) => void;
  initialTargetEmail?: string;
  showToast?: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const PersonaDirectoryModal: React.FC<PersonaDirectoryModalProps> = ({
  isOpen,
  onClose,
  onComposeTo,
  initialTargetEmail,
  showToast,
}) => {
  const [personas, setPersonas] = useState<ContactPersona[]>([]);
  const [selectedPersonaEmail, setSelectedPersonaEmail] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 指定邮箱新建画像输入框
  const [newTargetEmail, setNewTargetEmail] = useState('');
  const [newHints, setNewHints] = useState('');
  const [isAnalyzingNew, setIsAnalyzingNew] = useState(false);

  // 备注编辑
  const [notesInput, setNotesInput] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  const loadPersonas = async () => {
    if (!window.neoApi?.mailGetPersonas) return;
    setIsLoading(true);
    try {
      const list = await window.neoApi.mailGetPersonas();
      setPersonas(list);
      if (initialTargetEmail) {
        setSelectedPersonaEmail(initialTargetEmail);
        const match = list.find((p) => p.email.toLowerCase() === initialTargetEmail.toLowerCase());
        if (match) setNotesInput(match.manualNotes || '');
      } else if (list.length > 0 && !selectedPersonaEmail) {
        setSelectedPersonaEmail(list[0].email);
        setNotesInput(list[0].manualNotes || '');
      }
    } catch (e: any) {
      showToast?.('error', `加载人物画像库失败: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadPersonas();
      if (initialTargetEmail) {
        setNewTargetEmail(initialTargetEmail);
      }
    }
  }, [isOpen, initialTargetEmail]);

  if (!isOpen) return null;

  const currentPersona = personas.find(
    (p) => p.email.toLowerCase() === (selectedPersonaEmail || '').toLowerCase()
  );

  const filteredPersonas = personas.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      (p.company || '').toLowerCase().includes(q) ||
      p.personalityTraits.some((t) => t.toLowerCase().includes(q))
    );
  });

  // 分析指定邮箱的新画像
  const handleAnalyzeTargetEmail = async () => {
    const clean = newTargetEmail.trim().toLowerCase();
    if (!clean || !clean.includes('@')) {
      showToast?.('error', '请输入合法的邮箱地址');
      return;
    }
    setIsAnalyzingNew(true);
    try {
      if (window.neoApi?.mailAnalyzePersonaByEmail) {
        const result = await window.neoApi.mailAnalyzePersonaByEmail(clean, newHints.trim() || undefined);
        await loadPersonas();
        setSelectedPersonaEmail(result.email);
        setNotesInput(result.manualNotes || '');
        setNewTargetEmail('');
        setNewHints('');
        showToast?.('success', `已成功为 [${clean}] 构建全景人物画像与谈判策略！`);
      }
    } catch (e: any) {
      showToast?.('error', `画像分析失败: ${e.message}`);
    } finally {
      setIsAnalyzingNew(false);
    }
  };

  // 保存备忘
  const handleSaveNotes = async () => {
    if (!currentPersona || !window.neoApi?.mailSavePersonaNotes || isSavingNotes) return;
    setIsSavingNotes(true);
    try {
      const updated = await window.neoApi.mailSavePersonaNotes(currentPersona.email, notesInput);
      if (updated) {
        setPersonas((prev) => prev.map((p) => (p.email === updated.email ? updated : p)));
        showToast?.('success', '备忘档案已保存！');
      }
    } catch (e: any) {
      showToast?.('error', `保存失败: ${e.message}`);
    } finally {
      setIsSavingNotes(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-5xl h-[85vh] max-h-[820px] bg-white rounded-2xl shadow-2xl border border-slate-300 flex flex-col overflow-hidden text-xs font-sans">
        {/* 顶部标题栏 */}
        <div className="h-11 px-5 bg-[#0f172a] text-white flex items-center justify-between shrink-0 select-none">
          <div className="flex items-center space-x-2">
            <UserCheck className="w-4 h-4 text-sky-400" />
            <span className="font-bold text-sm tracking-wide">
              联系人全景人物画像中心 (Contact Persona & Behavioral Intelligence)
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/30 font-mono">
              Foxmail AI 赋能
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 核心双栏架构 */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* 左侧：搜索、新建分析、画像列表 */}
          <div className="w-80 border-r border-slate-200 bg-slate-50/70 flex flex-col shrink-0">
            {/* 1. 根据指定邮箱极速新建画像 */}
            <div className="p-3 border-b border-slate-200 bg-white space-y-2 shrink-0">
              <label className="text-[11px] font-bold text-indigo-950 flex items-center space-x-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>分析指定邮箱的人物画像</span>
              </label>

              <div className="space-y-1.5">
                <input
                  type="email"
                  value={newTargetEmail}
                  onChange={(e) => setNewTargetEmail(e.target.value)}
                  placeholder="输入目标邮箱 (如: ceo@customer.com)..."
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs outline-none focus:bg-white focus:border-indigo-500 font-mono"
                />

                <input
                  type="text"
                  value={newHints}
                  onChange={(e) => setNewHints(e.target.value)}
                  placeholder="补充背景/人脉线索 (可选)..."
                  className="w-full px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] outline-none focus:bg-white focus:border-indigo-400"
                />

                <button
                  type="button"
                  onClick={handleAnalyzeTargetEmail}
                  disabled={isAnalyzingNew || !newTargetEmail.trim()}
                  className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-xs transition-all flex items-center justify-center space-x-1 cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  {isAnalyzingNew ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <UserPlus className="w-3.5 h-3.5" />
                  )}
                  <span>{isAnalyzingNew ? '深度推演中...' : '开始画像分析'}</span>
                </button>
              </div>
            </div>

            {/* 2. 搜索已有联系人画像 */}
            <div className="p-2.5 border-b border-slate-200 bg-slate-100/60 shrink-0">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索联系人姓名、企业、性格标签..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-sky-500"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>

            {/* 3. 已有联系人列表 */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {filteredPersonas.map((p) => {
                const isSelected = p.email.toLowerCase() === (selectedPersonaEmail || '').toLowerCase();
                return (
                  <div
                    key={p.email}
                    onClick={() => {
                      setSelectedPersonaEmail(p.email);
                      setNotesInput(p.manualNotes || '');
                    }}
                    className={`p-3 transition-colors cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-indigo-50 border-l-3 border-indigo-600'
                        : 'hover:bg-slate-100/80 border-l-3 border-transparent'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">
                        {p.name.slice(0, 1) || '人'}
                      </div>
                      <div className="min-w-0 truncate">
                        <div className="font-bold text-slate-800 text-xs truncate flex items-center space-x-1">
                          <span>{p.name}</span>
                          <span className="text-[10px] px-1 py-0.1 bg-indigo-100 text-indigo-700 rounded font-normal">
                            {p.roleTypeLabel}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate font-mono">{p.email}</div>
                        <div className="text-[10px] text-slate-500 truncate">{p.company}</div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-amber-500 font-bold">
                        {'★'.repeat(p.trustLevel || 3)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 右侧：360° 全景人物画像档案卡与谈判建议 */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-white">
            {currentPersona ? (
              <div className="space-y-4 max-w-2xl mx-auto">
                {/* 1. 顶部大人物名牌 */}
                <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white shadow-lg relative overflow-hidden">
                  <div className="flex items-start justify-between relative z-10">
                    <div className="flex items-center space-x-4">
                      <div className="w-14 h-14 rounded-2xl bg-indigo-500/30 border border-indigo-400/40 flex items-center justify-center text-xl font-bold text-indigo-200 shrink-0 shadow-inner">
                        {currentPersona.name.slice(0, 1)}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <h2 className="text-base font-bold text-white">{currentPersona.name}</h2>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/40 text-indigo-200 border border-indigo-400/40 font-semibold">
                            {currentPersona.roleTypeLabel}
                          </span>
                        </div>
                        <div className="text-xs text-indigo-200/90 font-mono">
                          {currentPersona.email}
                        </div>
                        <div className="text-xs text-indigo-300/80 flex items-center space-x-2">
                          <span>{currentPersona.company || '未知企业'}</span>
                          <span>·</span>
                          <span>{currentPersona.title || '职务未知'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end space-y-2">
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onComposeTo(currentPersona.email);
                        }}
                        className="px-3.5 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer active:scale-95"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>向该联系人发信</span>
                      </button>

                      <div className="text-right text-[10px] text-indigo-300/80">
                        合作信任指数: <span className="text-amber-400 font-bold text-xs">{'★'.repeat(currentPersona.trustLevel || 3)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. 性格特质标签 */}
                <div className="space-y-1.5">
                  <div className="font-bold text-slate-800 text-xs">性格特质与行为模式标签</div>
                  <div className="flex flex-wrap gap-2">
                    {currentPersona.personalityTraits.map((trait, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800 font-semibold text-xs"
                      >
                        #{trait}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 3. 沟通风格与偏好分析 */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                  <div className="font-bold text-slate-800 text-xs flex items-center space-x-1.5">
                    <MessageSquare className="w-4 h-4 text-indigo-600" />
                    <span>沟通风格与偏好深度剖析</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed text-xs">
                    {currentPersona.communicationStyle}
                  </p>
                </div>

                {/* 4. 核心关切与潜在风险 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-4 bg-sky-50/70 rounded-2xl border border-sky-200 space-y-2">
                    <div className="font-bold text-sky-950 text-xs flex items-center space-x-1.5">
                      <Target className="w-4 h-4 text-sky-600" />
                      <span>核心利益关切 (Core Concerns)</span>
                    </div>
                    <ul className="space-y-1 pl-4 list-disc text-slate-700 text-xs leading-relaxed">
                      {currentPersona.coreConcerns.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-4 bg-rose-50/70 rounded-2xl border border-rose-200 space-y-2">
                    <div className="font-bold text-rose-950 text-xs flex items-center space-x-1.5">
                      <ShieldAlert className="w-4 h-4 text-rose-600" />
                      <span>合作阻力与风险预警 (Risk Signals)</span>
                    </div>
                    <ul className="space-y-1 pl-4 list-disc text-rose-800 text-xs leading-relaxed">
                      {currentPersona.riskSignals.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* 5. 核心谈判与后续跟进公关策略建议 */}
                <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50/50 rounded-2xl border border-amber-300 space-y-2 shadow-2xs">
                  <div className="font-bold text-amber-950 text-xs flex items-center space-x-2">
                    <Lightbulb className="w-4 h-4 text-amber-600" />
                    <span>后续沟通与谈判破局策略建议 (公关锦囊)</span>
                  </div>
                  <p className="text-amber-950 leading-relaxed whitespace-pre-wrap text-xs font-medium">
                    {currentPersona.negotiationStrategy}
                  </p>
                </div>

                {/* 6. 业务员私有跟进备忘 */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-xs flex items-center space-x-1.5">
                      <Briefcase className="w-4 h-4 text-slate-600" />
                      <span>业务跟进私人备忘档案 (仅本机保存)</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleSaveNotes}
                      disabled={isSavingNotes}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 text-indigo-600 font-bold border border-slate-300 rounded-lg flex items-center space-x-1 cursor-pointer"
                    >
                      <Save className="w-3 h-3" />
                      <span>{isSavingNotes ? '保存中...' : '保存备忘'}</span>
                    </button>
                  </div>

                  <textarea
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    placeholder="在此记录该客户的关键家属人脉、私人爱好、历史承诺、特殊关照等备忘信息..."
                    rows={3}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            ) : (
              <div className="py-20 text-center text-slate-400 space-y-2">
                <UserCheck className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold">请在左侧选择或输入指定邮箱开始画像</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
