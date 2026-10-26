import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  BrainCircuit, 
  Send, 
  UserCheck, 
  Copy, 
  Check, 
  RefreshCw, 
  AlertCircle, 
  Clock, 
  CheckCircle2, 
  CheckSquare, 
  Target, 
  ShieldAlert, 
  Lightbulb, 
  Wand2, 
  Search, 
  ChevronRight,
  TrendingUp,
  MessageSquare,
  Building,
  User,
  Sliders,
  Briefcase
} from 'lucide-react';
import { 
  EmailItem, 
  EmailAnalysisResult, 
  ContactPersona, 
  GenerateReplyOptions, 
  GeneratedReplyResult 
} from '../../../shared/mailTypes';

interface MailAiCopilotProps {
  email: EmailItem | null;
  onOpenReplyCompose: (replyData: { to: string; subject: string; body: string }) => void;
  showToast?: (type: 'success' | 'error' | 'info', text: string) => void;
}

export const MailAiCopilot: React.FC<MailAiCopilotProps> = ({
  email,
  onOpenReplyCompose,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'analysis' | 'reply' | 'persona'>('analysis');

  // 1. 分析状态
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<EmailAnalysisResult | null>(email?.analysis || null);

  // 2. 回复生成状态
  const [replyTone, setReplyTone] = useState<GenerateReplyOptions['tone']>('formal');
  const [focusPoints, setFocusPoints] = useState('');
  const [usePersonaContext, setUsePersonaContext] = useState(true);
  const [generatingReply, setGeneratingReply] = useState(false);
  const [generatedReply, setGeneratedReply] = useState<GeneratedReplyResult | null>(null);
  const [copiedReply, setCopiedReply] = useState(false);

  // 3. 人物画像状态 (支持指定任意邮箱进行分析)
  const [targetEmailInput, setTargetEmailInput] = useState('');
  const [customHints, setCustomHints] = useState('');
  const [persona, setPersona] = useState<ContactPersona | null>(null);
  const [loadingPersona, setLoadingPersona] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesInput, setNotesInput] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  // 当切换邮件时，自动同步状态
  useEffect(() => {
    if (email) {
      setAnalysisResult(email.analysis || null);
      setGeneratedReply(null);
      setTargetEmailInput(email.from.email);
      loadPersonaForEmail(email.from.email);
    } else {
      setAnalysisResult(null);
      setGeneratedReply(null);
      setPersona(null);
    }
  }, [email?.id]);

  // 加载指定联系人画像
  const loadPersonaForEmail = async (emailAddr: string) => {
    if (!emailAddr || !window.neoApi?.mailGetPersonas) return;
    try {
      const list = await window.neoApi.mailGetPersonas();
      const found = list.find((p) => p.email.toLowerCase() === emailAddr.toLowerCase());
      if (found) {
        setPersona(found);
        setNotesInput(found.manualNotes || '');
      } else {
        setPersona(null);
        setNotesInput('');
      }
    } catch {}
  };

  // 触发邮件深度需求分析
  const handleTriggerAnalysis = async () => {
    if (!email || analyzing || !window.neoApi?.mailAnalyzeEmail) return;
    setAnalyzing(true);
    try {
      const res = await window.neoApi.mailAnalyzeEmail(email.id);
      setAnalysisResult(res);
      showToast?.('success', 'AI 已完成邮件需求分析与待办行动项提取！');
      // 同步刷新人物画像
      loadPersonaForEmail(email.from.email);
    } catch (e: any) {
      showToast?.('error', `分析失败: ${e.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  // 生成智能回复
  const handleGenerateReply = async () => {
    if (!email || generatingReply || !window.neoApi?.mailGenerateReply) return;
    setGeneratingReply(true);
    try {
      const res = await window.neoApi.mailGenerateReply({
        emailId: email.id,
        tone: replyTone,
        focusPoints: focusPoints.trim() || undefined,
        personaContext: usePersonaContext,
      });
      setGeneratedReply(res);
      showToast?.('success', '已生成高水准回复草稿！');
    } catch (e: any) {
      showToast?.('error', `生成失败: ${e.message}`);
    } finally {
      setGeneratingReply(false);
    }
  };

  // 针对【指定邮箱】进行人物画像深度穿透分析
  const handleAnalyzePersona = async (overrideEmail?: string) => {
    const target = (overrideEmail || targetEmailInput || email?.from.email || '').trim();
    if (!target) {
      showToast?.('info', '请输入需要分析的人物邮箱地址');
      return;
    }
    setLoadingPersona(true);
    try {
      if (window.neoApi?.mailAnalyzePersonaByEmail) {
        const res = await window.neoApi.mailAnalyzePersonaByEmail(target, customHints.trim() || undefined);
        setPersona(res);
        setNotesInput(res.manualNotes || '');
        showToast?.('success', `已成功生成 [${target}] 的全景人物画像与沟通策略！`);
      }
    } catch (e: any) {
      showToast?.('error', `画像分析失败: ${e.message}`);
    } finally {
      setLoadingPersona(false);
    }
  };

  // 保存业务员手工备注
  const handleSaveNotes = async () => {
    if (!persona || savingNotes || !window.neoApi?.mailSavePersonaNotes) return;
    setSavingNotes(true);
    try {
      const updated = await window.neoApi.mailSavePersonaNotes(persona.email, notesInput);
      if (updated) {
        setPersona(updated);
        setEditingNotes(false);
        showToast?.('success', '已保存联系人业务跟进便签！');
      }
    } catch (e: any) {
      showToast?.('error', `保存失败: ${e.message}`);
    } finally {
      setSavingNotes(false);
    }
  };

  // 一键复制回复
  const handleCopyReplyText = async () => {
    if (!generatedReply) return;
    let ok = false;
    try {
      if (window.neoApi?.clipboardWriteText) {
        await window.neoApi.clipboardWriteText(generatedReply.body);
        ok = true;
      }
    } catch {}
    if (!ok && navigator.clipboard) {
      await navigator.clipboard.writeText(generatedReply.body);
      ok = true;
    }
    if (ok) {
      setCopiedReply(true);
      showToast?.('success', '回复草稿已复制到剪贴板！');
      setTimeout(() => setCopiedReply(false), 2000);
    }
  };

  // 一键采纳载入回信窗口
  const handleAdoptReply = () => {
    if (!email || !generatedReply) return;
    onOpenReplyCompose({
      to: email.from.email,
      subject: generatedReply.subject || `Re: ${email.subject}`,
      body: generatedReply.body,
    });
  };

  if (!email) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400 bg-slate-50/50">
        <Sparkles className="w-8 h-8 text-indigo-300 mb-2 animate-pulse" />
        <p className="text-xs font-semibold text-slate-600">Foxmail AI 智能副驾驶</p>
        <p className="text-[11px] text-slate-400 mt-1 max-w-[200px]">
          选择一封邮件，即可自动提炼需求、生成定制回复，并针对指定发件人生成 360° 人物画像。
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white border-l border-slate-200 overflow-hidden text-xs">
      {/* 顶部 AI 协同切换 Tab (Foxmail 风格胶囊栏) */}
      <div className="p-2.5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-1 p-0.5 bg-slate-200/80 rounded-xl">
          <button
            onClick={() => setActiveTab('analysis')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center space-x-1 cursor-pointer ${
              activeTab === 'analysis'
                ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BrainCircuit className="w-3.5 h-3.5 text-indigo-600" />
            <span>需求透视</span>
          </button>

          <button
            onClick={() => setActiveTab('reply')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center space-x-1 cursor-pointer ${
              activeTab === 'reply'
                ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5 text-indigo-600" />
            <span>智能回复</span>
          </button>

          <button
            onClick={() => setActiveTab('persona')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center space-x-1 cursor-pointer ${
              activeTab === 'persona'
                ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
            <span>人物画像</span>
          </button>
        </div>

        <button
          onClick={handleTriggerAnalysis}
          disabled={analyzing}
          title="重新深度分析本邮件"
          className="p-1 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${analyzing ? 'animate-spin text-indigo-600' : ''}`} />
        </button>
      </div>

      {/* 主体交互区域 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ================= Tab 1: 邮件需求与意图深度分析 ================= */}
        {activeTab === 'analysis' && (
          <div className="space-y-4">
            {!analysisResult && !analyzing ? (
              <div className="p-6 text-center space-y-3 bg-indigo-50/40 rounded-2xl border border-indigo-100">
                <BrainCircuit className="w-8 h-8 text-indigo-500 mx-auto" />
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">尚未分析此邮件</h4>
                  <p className="text-[11px] text-slate-500 mt-1">
                    AI 将深度拆解客户核心需求、情绪紧迫度、待办项及商机线索。
                  </p>
                </div>
                <button
                  onClick={handleTriggerAnalysis}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-sky-600 text-white rounded-xl font-semibold shadow-xs hover:brightness-110 active:scale-95 transition-all cursor-pointer flex items-center justify-center space-x-1.5 mx-auto"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>立即智能分析邮件</span>
                </button>
              </div>
            ) : analyzing ? (
              <div className="py-12 text-center space-y-3">
                <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin mx-auto" />
                <p className="text-xs font-semibold text-slate-700">AI 正在深度解析邮件诉求与意图...</p>
                <p className="text-[10px] text-slate-400">正在对比商务上下文与历史沟通线索</p>
              </div>
            ) : analysisResult ? (
              <div className="space-y-3.5 animate-in fade-in duration-200">
                {/* 1. 核心要旨与主导意图卡片 */}
                <div className="p-3 bg-gradient-to-br from-indigo-50/80 via-white to-sky-50/50 rounded-xl border border-indigo-200/80 space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-indigo-600 uppercase font-bold tracking-wider flex items-center space-x-1">
                      <Target className="w-3 h-3 text-indigo-600" />
                      <span>发件人主导意图</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                      {analysisResult.intent}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed font-medium">
                    {analysisResult.summary}
                  </p>
                </div>

                {/* 2. 紧迫度与情绪仪表徽章 */}
                <div className="grid grid-cols-2 gap-2">
                  <div className={`p-2.5 rounded-xl border flex items-center space-x-2 ${
                    analysisResult.urgencyLevel === 'high'
                      ? 'bg-rose-50/70 border-rose-200 text-rose-800'
                      : analysisResult.urgencyLevel === 'medium'
                      ? 'bg-amber-50/70 border-amber-200 text-amber-800'
                      : 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                  }`}>
                    <Clock className="w-4 h-4 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[10px] opacity-75 font-mono">紧迫等级</div>
                      <div className="font-bold text-xs truncate">
                        {analysisResult.urgencyLevel === 'high' ? '🔥 紧急催促 / 高优先级' : analysisResult.urgencyLevel === 'medium' ? '⚡ 常规推进 / 中度紧迫' : '☕ 充足宽裕 / 正常节奏'}
                      </div>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/80 text-slate-700 flex items-center space-x-2">
                    <TrendingUp className="w-4 h-4 shrink-0 text-indigo-600" />
                    <div className="min-w-0">
                      <div className="text-[10px] text-slate-400 font-mono">态度与情绪</div>
                      <div className="font-bold text-xs truncate text-indigo-950">
                        {analysisResult.sentimentLabel || '理性客观沟通'}
                      </div>
                    </div>
                  </div>
                </div>

                {analysisResult.urgencyReason && (
                  <p className="text-[11px] text-slate-500 italic px-1 flex items-start space-x-1">
                    <span className="shrink-0 text-amber-500 font-bold">判断依据:</span>
                    <span>{analysisResult.urgencyReason}</span>
                  </p>
                )}

                {/* 3. 提取出的具体业务需求清单 */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-slate-800 font-bold text-xs">
                    <div className="flex items-center space-x-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
                      <span>提炼的核心业务需求 ({analysisResult.needs?.length || 0})</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {analysisResult.needs?.map((need, i) => (
                      <div
                        key={need.id || i}
                        className="p-2.5 rounded-xl border border-slate-200 bg-white shadow-2xs hover:border-sky-300 transition-all space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800 text-xs flex items-center space-x-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                            <span>{need.title}</span>
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                            need.urgency === 'high' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {need.category}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed pl-3">
                          {need.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. 关键待办行动项 (TODOs) */}
                {analysisResult.actionItems && analysisResult.actionItems.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <div className="flex items-center justify-between text-slate-800 font-bold text-xs">
                      <div className="flex items-center space-x-1.5">
                        <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                        <span>建议落实的行动项 (Action Items)</span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      {analysisResult.actionItems.map((act, idx) => (
                        <div
                          key={act.id || idx}
                          className="p-2 bg-emerald-50/50 rounded-lg border border-emerald-200/80 flex items-start space-x-2 text-[11px]"
                        >
                          <span className="w-4 h-4 rounded-full bg-emerald-200 text-emerald-800 font-mono font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-emerald-950 leading-snug">{act.task}</div>
                            <div className="flex items-center space-x-2 text-[10px] text-emerald-700/80 mt-1">
                              {act.deadline && <span>截止: {act.deadline}</span>}
                              {act.assignee && <span>建议责任人: {act.assignee}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5. 商业洞察与决策潜台词 */}
                {analysisResult.keyInsights && analysisResult.keyInsights.length > 0 && (
                  <div className="p-3 rounded-xl border border-amber-200/90 bg-amber-50/40 space-y-1.5">
                    <div className="flex items-center space-x-1 text-amber-800 font-bold text-[11px]">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
                      <span>公关与商业博弈洞察</span>
                    </div>
                    <ul className="space-y-1 pl-4 list-disc text-[11px] text-amber-900 leading-relaxed">
                      {analysisResult.keyInsights.map((ins, i) => (
                        <li key={i}>{ins}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 6. 快捷引导至智能回复 */}
                <div className="pt-2">
                  <button
                    onClick={() => setActiveTab('reply')}
                    className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-xl border border-indigo-200 transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    <span>基于上述需求，一键生成智能回复</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* ================= Tab 2: 智能回复生成器 ================= */}
        {activeTab === 'reply' && (
          <div className="space-y-4">
            <div className="space-y-3">
              {/* 语气选择器 */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 flex items-center space-x-1">
                  <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                  <span>选择回信语气与策略</span>
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'formal', label: '👔 商务严谨', desc: '规范得体·权威' },
                    { id: 'friendly', label: '😊 温和礼貌', desc: '拉近客情·温度' },
                    { id: 'efficient', label: '⚡ 简洁高效', desc: '开门见山·清单' },
                    { id: 'negotiation', label: '🤝 商务谈判', desc: '守住底线·博弈' },
                    { id: 'technical', label: '🛠️ 技术专业', desc: '深度架构·规范' },
                    { id: 'decline', label: '✋ 礼貌婉拒', desc: '客观困难·替代' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setReplyTone(t.id as any)}
                      className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                        replyTone === t.id
                          ? 'border-indigo-500 bg-indigo-50/70 text-indigo-900 font-bold shadow-2xs'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <div className="text-xs">{t.label}</div>
                      <div className="text-[10px] text-slate-400 font-normal">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 是否自适应匹配人物画像 */}
              {persona && (
                <div className="p-2.5 rounded-xl border border-sky-200 bg-sky-50/60 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <UserCheck className="w-4 h-4 text-sky-600 shrink-0" />
                    <div>
                      <div className="font-semibold text-slate-800 text-[11px]">结合【{persona.name}】画像自适应</div>
                      <div className="text-[10px] text-slate-500 truncate max-w-[200px]">
                        偏好: {persona.personalityTraits.slice(0, 3).join('、')}
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={usePersonaContext}
                    onChange={(e) => setUsePersonaContext(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                </div>
              )}

              {/* 重点强调要点补充 */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                  <span>重点指示 / 补充答复要点 (可选)</span>
                  <span className="text-[10px] text-slate-400 font-normal">AI 将精准融合进回复中</span>
                </label>
                <textarea
                  value={focusPoints}
                  onChange={(e) => setFocusPoints(e.target.value)}
                  placeholder="例如：周四下午 2 点可以线上演示；对于 15% 折扣最多只能给 8%，但可附赠 20 个流程节点..."
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all resize-none"
                />
              </div>

              {/* 生成按钮 */}
              <button
                onClick={handleGenerateReply}
                disabled={generatingReply}
                className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-sky-600 text-white rounded-xl font-bold shadow-xs hover:brightness-110 active:scale-95 transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                {generatingReply ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4" />
                )}
                <span>{generatingReply ? 'AI 正在构思定制回复...' : '生成专业回复草稿'}</span>
              </button>
            </div>

            {/* 生成结果展示 */}
            {generatedReply && (
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/90 space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 text-slate-700">
                  <span className="font-bold text-xs text-indigo-900 flex items-center space-x-1">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>AI 拟定回复草稿</span>
                  </span>
                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={handleCopyReplyText}
                      className="p-1 rounded hover:bg-slate-200 text-slate-600 flex items-center space-x-1 text-[11px] cursor-pointer"
                      title="复制回复正文"
                    >
                      {copiedReply ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedReply ? '已复制' : '复制'}</span>
                    </button>
                  </div>
                </div>

                {generatedReply.rationale && (
                  <div className="text-[10px] text-indigo-800/80 bg-indigo-50/70 p-2 rounded-lg border border-indigo-100">
                    💡 <b>回复构思逻辑</b>：{generatedReply.rationale}
                  </div>
                )}

                <div className="bg-white p-3 rounded-xl border border-slate-200/80 text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-sans max-h-64 overflow-y-auto select-text shadow-2xs">
                  {generatedReply.body}
                </div>

                <button
                  onClick={handleAdoptReply}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer active:scale-95"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>采纳并载入写信窗口 (可微调后发出)</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ================= Tab 3: 发件人与指定邮箱人物画像 ================= */}
        {activeTab === 'persona' && (
          <div className="space-y-4">
            {/* 指定邮箱搜索/输入栏 */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
              <label className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                <span>根据指定邮箱分析人物画像</span>
                <span className="text-[10px] text-slate-400">支持任意外部联系人</span>
              </label>

              <div className="flex items-center space-x-1.5">
                <div className="flex-1 relative">
                  <input
                    type="email"
                    value={targetEmailInput}
                    onChange={(e) => setTargetEmailInput(e.target.value)}
                    placeholder="输入要分析的邮箱 (如: name@company.com)..."
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
                <button
                  onClick={() => handleAnalyzePersona()}
                  disabled={loadingPersona}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold shadow-xs transition-all flex items-center space-x-1 cursor-pointer shrink-0 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingPersona ? 'animate-spin' : ''}`} />
                  <span>{loadingPersona ? '分析中...' : '生成画像'}</span>
                </button>
              </div>

              {/* 补充已知线索折叠 */}
              <div className="pt-1">
                <input
                  type="text"
                  value={customHints}
                  onChange={(e) => setCustomHints(e.target.value)}
                  placeholder="补充背景线索 (可选，如: 该客户是国企采购副总，性格非常强势)"
                  className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-600 outline-none focus:border-indigo-400"
                />
              </div>
            </div>

            {/* 人物画像卡片展示 */}
            {loadingPersona ? (
              <div className="py-12 text-center space-y-3">
                <UserCheck className="w-7 h-7 text-indigo-600 animate-bounce mx-auto" />
                <p className="text-xs font-semibold text-slate-700">正在穿透全域邮件链与行为性格画像...</p>
                <p className="text-[10px] text-slate-400">推导决策权重、沟通偏好与谈判突破口</p>
              </div>
            ) : persona ? (
              <div className="space-y-3.5 animate-in fade-in duration-200">
                {/* 1. 联系人基础身份卡 */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-indigo-900 to-slate-900 text-white space-y-2 shadow-md relative overflow-hidden">
                  <div className="absolute right-0 top-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
                  
                  <div className="flex items-start justify-between relative z-10">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/30 border border-indigo-400/40 flex items-center justify-center text-base font-bold text-indigo-200 shrink-0">
                        {persona.name.slice(0, 1) || '联'}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-white flex items-center space-x-1.5">
                          <span>{persona.name}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-500/40 text-indigo-200 border border-indigo-400/30">
                            {persona.roleTypeLabel || '业务关键人'}
                          </span>
                        </div>
                        <div className="text-[11px] text-indigo-200/80 font-mono mt-0.5">
                          {persona.email}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] text-indigo-300/80">合作信任指数</div>
                      <div className="text-amber-400 text-xs font-bold mt-0.5 tracking-widest">
                        {'★'.repeat(persona.trustLevel || 3)}{'☆'.repeat(5 - (persona.trustLevel || 3))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-indigo-800/80 flex items-center justify-between text-[11px] text-indigo-200/90 relative z-10">
                    <div className="flex items-center space-x-1 truncate max-w-[200px]">
                      <Building className="w-3 h-3 text-indigo-400 shrink-0" />
                      <span className="truncate">{persona.company || '未知企业'} · {persona.title || '职务未知'}</span>
                    </div>
                    <span className="text-[10px] font-mono text-indigo-300/70 shrink-0">
                      往来邮件: {persona.emailCount || 1} 封
                    </span>
                  </div>
                </div>

                {/* 2. 性格特质标签 */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold text-slate-700">性格特质与行为标签</div>
                  <div className="flex flex-wrap gap-1.5">
                    {persona.personalityTraits?.map((trait, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200/80 text-[11px] font-medium"
                      >
                        #{trait}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 3. 沟通偏好与习惯分析 */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <div className="text-[11px] font-bold text-slate-800 flex items-center space-x-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                    <span>沟通风格与偏好分析</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    {persona.communicationStyle}
                  </p>
                </div>

                {/* 4. 核心利益关切与历史痛点 */}
                <div className="p-3 bg-sky-50/60 rounded-xl border border-sky-200 space-y-1.5">
                  <div className="text-[11px] font-bold text-sky-900 flex items-center space-x-1.5">
                    <Target className="w-3.5 h-3.5 text-sky-600" />
                    <span>核心利益关切与敏感痛点</span>
                  </div>
                  <ul className="space-y-1 pl-4 list-disc text-[11px] text-slate-700 leading-relaxed">
                    {persona.coreConcerns?.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>

                {/* 5. 合作风险预警信号 */}
                {persona.riskSignals && persona.riskSignals.length > 0 && (
                  <div className="p-3 bg-rose-50/60 rounded-xl border border-rose-200 space-y-1.5">
                    <div className="text-[11px] font-bold text-rose-900 flex items-center space-x-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                      <span>潜在合作风险与谈判阻力点</span>
                    </div>
                    <ul className="space-y-1 pl-4 list-disc text-[11px] text-rose-800 leading-relaxed">
                      {persona.riskSignals.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 6. 后续公关与谈判破局策略建议 (核心业务价值) */}
                <div className="p-3.5 bg-gradient-to-br from-amber-50 to-orange-50/40 rounded-xl border border-amber-300/80 space-y-2 shadow-2xs">
                  <div className="text-xs font-bold text-amber-900 flex items-center space-x-1.5">
                    <Lightbulb className="w-4 h-4 text-amber-600" />
                    <span>后续沟通与谈判破局策略建议</span>
                  </div>
                  <p className="text-xs text-amber-950 leading-relaxed whitespace-pre-wrap font-medium">
                    {persona.negotiationStrategy}
                  </p>
                </div>

                {/* 7. 业务员人工备忘录便签 */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-700 flex items-center space-x-1">
                      <Briefcase className="w-3.5 h-3.5 text-slate-500" />
                      <span>业务跟进私人备忘便签</span>
                    </span>
                    {!editingNotes ? (
                      <button
                        onClick={() => setEditingNotes(true)}
                        className="text-[10px] text-indigo-600 hover:underline cursor-pointer"
                      >
                        编辑备忘
                      </button>
                    ) : (
                      <button
                        onClick={handleSaveNotes}
                        disabled={savingNotes}
                        className="text-[10px] text-emerald-600 font-bold hover:underline cursor-pointer"
                      >
                        {savingNotes ? '保存中...' : '保存'}
                      </button>
                    )}
                  </div>

                  {editingNotes ? (
                    <textarea
                      value={notesInput}
                      onChange={(e) => setNotesInput(e.target.value)}
                      placeholder="记录该联系人的私人喜好、关键人脉关系、约见意向等备忘..."
                      rows={2}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-400 resize-none"
                    />
                  ) : (
                    <p className="text-[11px] text-slate-500 italic">
                      {persona.manualNotes || '暂无私人跟进备忘，点击右上角添加。'}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 space-y-2">
                <UserCheck className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-xs">未找到该联系人的画像档案</p>
                <p className="text-[10px]">点击上方“生成画像”按钮，AI 将根据该邮箱历史往来深度推演性格与沟通策略</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
