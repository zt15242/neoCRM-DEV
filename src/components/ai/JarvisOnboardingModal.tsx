import React, { useState } from 'react';
import { Shield, Sparkles, Volume2, UserCheck, X } from 'lucide-react';
import { JarvisUserProfile, JarvisGender } from '../../../shared/jarvisTypes';
import { JarvisReactor } from './JarvisReactor';

interface JarvisOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (profile: JarvisUserProfile) => void;
  initialProfile?: JarvisUserProfile | null;
}

const DEFAULT_VOICES = [
  { id: 'zh-CN-YunjianNeural', name: '云健 (沉稳磁性 / 现代科技管家)', lang: 'zh-CN' },
  { id: 'zh-CN-YunyangNeural', name: '云扬 (专业冷静 / 新闻播音男声)', lang: 'zh-CN' },
  { id: 'en-GB-RyanNeural', name: 'Ryan (纯正英伦绅士音 / 钢铁侠电影原版)', lang: 'en-GB' },
];

export const JarvisOnboardingModal: React.FC<JarvisOnboardingModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialProfile,
}) => {
  const [name, setName] = useState(initialProfile?.name || '');
  const [gender, setGender] = useState<JarvisGender>(initialProfile?.gender || 'male');
  const [customTitle, setCustomTitle] = useState(initialProfile?.customTitle || '指挥官');
  const [voiceId, setVoiceId] = useState(initialProfile?.voiceId || 'zh-CN-YunjianNeural');
  const [autoSpeak, setAutoSpeak] = useState(initialProfile?.autoSpeak ?? true);
  const [petVisible, setPetVisible] = useState(initialProfile?.petVisible ?? true);
  const [previewing, setPreviewing] = useState(false);

  if (!isOpen) return null;

  const getSalutation = () => {
    if (gender === 'male') return '先生';
    if (gender === 'female') return '女士';
    return customTitle || '指挥官';
  };

  const handlePreviewVoice = async (selectedVoice: string) => {
    setPreviewing(true);
    try {
      const displayName = name.trim() || '指挥官';
      const salutation = getSalutation();
      const previewText = `系统核心校验完毕。随时为您效劳，${displayName}${salutation}。`;

      if (window.neoApi?.jarvisSynthesizeSpeech) {
        const res = await window.neoApi.jarvisSynthesizeSpeech(previewText, { voice: selectedVoice });
        if (res?.audioBase64) {
          const audio = new Audio(`data:audio/mp3;base64,${res.audioBase64}`);
          audio.onended = () => setPreviewing(false);
          audio.onerror = () => setPreviewing(false);
          await audio.play();
          return;
        }
      }

      // 降级使用 Web Speech API
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(previewText);
        utterance.onend = () => setPreviewing(false);
        utterance.onerror = () => setPreviewing(false);
        window.speechSynthesis.speak(utterance);
      } else {
        setPreviewing(false);
      }
    } catch {
      setPreviewing(false);
    }
  };

  const handleConfirm = () => {
    const finalName = name.trim() || '指挥官';
    const profile: JarvisUserProfile = {
      name: finalName,
      gender,
      customTitle: gender === 'other' ? customTitle.trim() : undefined,
      salutation: getSalutation(),
      voiceId,
      voiceRate: '+0%',
      voicePitch: '+0Hz',
      autoSpeak,
      petVisible,
      petPosition: initialProfile?.petPosition || { x: window.innerWidth - 120, y: window.innerHeight - 140 },
      initializedAt: Date.now(),
    };

    onSave(profile);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-2xl border border-cyan-500/30 bg-[#070c18]/95 p-7 text-cyan-50 shadow-[0_0_50px_rgba(0,242,254,0.2)]">
        {/* 背景科幻刻度线条 */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-cyan-400/60 hover:text-cyan-300 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 标题与反应堆 */}
        <div className="flex items-center space-x-4 mb-6">
          <JarvisReactor size="medium" state={previewing ? 'speaking' : 'idle'} />
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-bold tracking-wider text-cyan-400 uppercase">
                J.A.R.V.I.S. 协议接入认证
              </h2>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300">
                MK-85 PROTOCOL
              </span>
            </div>
            <p className="text-xs text-cyan-200/60 mt-1">
              "正在建立神经拟合中枢，请配置首席指挥官档案，以便贾维斯为您提供专属服务。"
            </p>
          </div>
        </div>

        {/* 表单内容 */}
        <div className="space-y-5 text-sm">
          {/* 1. 姓名/尊称 */}
          <div>
            <label className="block text-xs font-semibold text-cyan-300 uppercase tracking-wider mb-2">
              [01] 指挥官尊称 / 姓名
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：Tony / 浩哥 / Alex / 斯塔克"
              className="w-full rounded-lg border border-cyan-500/30 bg-slate-900/80 px-4 py-2.5 text-cyan-100 placeholder-cyan-500/40 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 font-mono text-sm"
            />
          </div>

          {/* 2. 性别与称谓习惯 */}
          <div>
            <label className="block text-xs font-semibold text-cyan-300 uppercase tracking-wider mb-2">
              [02] 称谓习惯 (贾维斯与您的对话称呼)
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setGender('male')}
                className={`flex flex-col items-center justify-center p-3 rounded-lg border text-xs font-medium transition-all ${
                  gender === 'male'
                    ? 'border-cyan-400 bg-cyan-950/60 text-cyan-200 shadow-[0_0_15px_rgba(0,242,254,0.25)]'
                    : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span className="font-bold text-sm">先生 / Sir</span>
                <span className="text-[10px] text-cyan-400/60 mt-0.5">默认男士管家称呼</span>
              </button>

              <button
                type="button"
                onClick={() => setGender('female')}
                className={`flex flex-col items-center justify-center p-3 rounded-lg border text-xs font-medium transition-all ${
                  gender === 'female'
                    ? 'border-cyan-400 bg-cyan-950/60 text-cyan-200 shadow-[0_0_15px_rgba(0,242,254,0.25)]'
                    : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span className="font-bold text-sm">女士 / Madam</span>
                <span className="text-[10px] text-cyan-400/60 mt-0.5">女士尊称</span>
              </button>

              <button
                type="button"
                onClick={() => setGender('other')}
                className={`flex flex-col items-center justify-center p-3 rounded-lg border text-xs font-medium transition-all ${
                  gender === 'other'
                    ? 'border-cyan-400 bg-cyan-950/60 text-cyan-200 shadow-[0_0_15px_rgba(0,242,254,0.25)]'
                    : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span className="font-bold text-sm">自定义头衔</span>
                <span className="text-[10px] text-cyan-400/60 mt-0.5">老板 / 指挥官 / 架构师</span>
              </button>
            </div>

            {gender === 'other' && (
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="输入头衔，例如：老板、首席架构师、指挥官"
                className="mt-2.5 w-full rounded-lg border border-cyan-500/30 bg-slate-900/80 px-4 py-2 text-cyan-100 placeholder-cyan-500/40 outline-none focus:border-cyan-400 font-mono text-xs"
              />
            )}
          </div>

          {/* 3. 语音音色选择 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">
                [03] 贾维斯专属发音 (Microsoft Edge-TTS 高保真神经音色)
              </label>
              <span className="text-[10px] text-emerald-400 font-mono">100% 永久免费</span>
            </div>

            <div className="space-y-2">
              {DEFAULT_VOICES.map((v) => (
                <div
                  key={v.id}
                  onClick={() => setVoiceId(v.id)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${
                    voiceId === v.id
                      ? 'border-cyan-400 bg-cyan-950/50 text-cyan-200'
                      : 'border-slate-800/80 bg-slate-900/30 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <div
                      className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        voiceId === v.id ? 'border-cyan-400' : 'border-slate-600'
                      }`}
                    >
                      {voiceId === v.id && <div className="w-2 h-2 rounded-full bg-cyan-400" />}
                    </div>
                    <span className="text-xs font-medium">{v.name}</span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePreviewVoice(v.id);
                    }}
                    disabled={previewing}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded border border-cyan-500/40 text-cyan-300 hover:bg-cyan-900/40 text-[11px] transition-colors"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>试听</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 4. 辅助开关 */}
          <div className="pt-2 border-t border-cyan-500/20 flex items-center justify-between">
            <label className="flex items-center space-x-2 text-xs text-cyan-200/80 cursor-pointer">
              <input
                type="checkbox"
                checked={autoSpeak}
                onChange={(e) => setAutoSpeak(e.target.checked)}
                className="rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-0"
              />
              <span>贾维斯回复后自动发音朗读</span>
            </label>

            <label className="flex items-center space-x-2 text-xs text-cyan-200/80 cursor-pointer">
              <input
                type="checkbox"
                checked={petVisible}
                onChange={(e) => setPetVisible(e.target.checked)}
                className="rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-0"
              />
              <span>启用操作系统桌面独立悬浮桌宠 (脱离主界面，在电脑桌面上随时待命与对讲)</span>
            </label>
          </div>
        </div>

        {/* 激活按钮 */}
        <div className="mt-7 flex items-center justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-700 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors"
          >
            稍后配置
          </button>
          <button
            onClick={handleConfirm}
            className="flex items-center space-x-2 px-6 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold text-xs tracking-wider uppercase shadow-[0_0_20px_rgba(0,242,254,0.4)] hover:brightness-110 active:scale-95 transition-all"
          >
            <Sparkles className="w-4 h-4" />
            <span>激活 J.A.R.V.I.S. 系统</span>
          </button>
        </div>
      </div>
    </div>
  );
};
