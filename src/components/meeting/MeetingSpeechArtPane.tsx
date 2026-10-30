import React from 'react';
import {
  Mic,
  Sparkles,
  Award,
  Zap,
  Target,
  MessageSquare,
  HelpCircle,
  ThumbsUp,
  AlertCircle,
  TrendingUp,
  Activity,
  HeartHandshake,
  Brain,
  Quote,
} from 'lucide-react';
import { SpeechArtAnalysis, SpeakerSpeechArtProfile } from '../../../shared/meetingTypes';

interface MeetingSpeechArtPaneProps {
  speechArt?: SpeechArtAnalysis;
  onTriggerSummarize: () => void;
  isSummarizing?: boolean;
}

export const MeetingSpeechArtPane: React.FC<MeetingSpeechArtPaneProps> = ({
  speechArt,
  onTriggerSummarize,
  isSummarizing = false,
}) => {
  if (!speechArt) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-inner">
          <Brain className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-slate-800">尚未生成语艺与沟通效能洞察</h4>
          <p className="text-xs text-slate-400 max-w-xs">
            由大模型深度解构各参会人的沟通风格、语调基调、说服力指数与高阶情境语艺指导。
          </p>
        </div>
        <button
          onClick={onTriggerSummarize}
          disabled={isSummarizing}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium flex items-center space-x-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" />
          <span>{isSummarizing ? '分析语艺画像中...' : '生成语艺沟通画像'}</span>
        </button>
      </div>
    );
  }

  // 渲染风格标签颜色
  const getStyleBadge = (style: string) => {
    switch (style) {
      case 'decisive':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'collaborative':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'analytical':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'critical':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
      {/* 1. 总体沟通氛围与语艺效能评价卡片 */}
      <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 text-white rounded-2xl p-5 shadow-md relative overflow-hidden space-y-4">
        <div className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none">
          <Brain className="w-44 h-44 text-white" />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="p-1 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
              <Sparkles className="w-4 h-4" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-200">
              全会语艺与协作效能
            </span>
          </div>

          <div className="flex items-center space-x-2 bg-indigo-950/60 border border-indigo-500/30 px-3 py-1 rounded-full">
            <span className="text-xs text-indigo-300">协同指数:</span>
            <span className="text-base font-extrabold font-mono text-cyan-400">
              {speechArt.atmosphereScore}
            </span>
            <span className="text-[10px] text-indigo-400">/ 100</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-lg font-bold text-white flex items-center space-x-2">
            <span>{speechArt.atmosphereLabel}</span>
          </div>
          <p className="text-xs text-indigo-200/90 leading-relaxed max-w-2xl font-light">
            {speechArt.cadenceSummary}
          </p>
        </div>
      </div>

      {/* 2. 各参会人语艺画像矩阵 */}
      <div className="space-y-3">
        <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
          <Target className="w-4 h-4 text-indigo-600" />
          <span>参会人语艺与沟通风格深度画像</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {speechArt.speakerProfiles.map((prof) => (
            <div
              key={prof.speakerId}
              className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-indigo-300 transition-all space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-3">
                {/* 顶部身份与风格 */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 text-sm font-bold flex items-center justify-center shadow-xs">
                      {prof.speakerName.charAt(0)}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{prof.speakerName}</h4>
                      <span className="text-[11px] text-slate-400">语艺特征分析</span>
                    </div>
                  </div>

                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${getStyleBadge(
                      prof.styleType
                    )}`}
                  >
                    {prof.styleLabel}
                  </span>
                </div>

                {/* 语调特征描述 */}
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-600 italic flex items-start space-x-2">
                  <Quote className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{prof.toneDominance}</span>
                </div>

                {/* 三维语艺评分条 */}
                <div className="space-y-2 pt-1">
                  {/* 坚定说服力 */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500 font-medium">坚定说服力 (Assertiveness)</span>
                      <span className="font-mono font-bold text-blue-600">{prof.assertivenessScore}</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${prof.assertivenessScore}%` }}
                      />
                    </div>
                  </div>

                  {/* 倾听与共情 */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500 font-medium">倾听与共情 (Empathy)</span>
                      <span className="font-mono font-bold text-emerald-600">{prof.empathyScore}</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: `${prof.empathyScore}%` }}
                      />
                    </div>
                  </div>

                  {/* 逻辑清晰度 */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500 font-medium">逻辑清晰度 (Clarity)</span>
                      <span className="font-mono font-bold text-indigo-600">{prof.clarityScore}</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                        style={{ width: `${prof.clarityScore}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* 提问占比指示 */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span>提问占其发言比例:</span>
                  <span className="font-mono font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                    {prof.questionRatio}%
                  </span>
                </div>
              </div>

              {/* 亮点与改进 */}
              <div className="space-y-2 pt-3 border-t border-slate-100 text-xs">
                <div>
                  <span className="text-[11px] font-semibold text-emerald-700 flex items-center space-x-1 mb-1">
                    <ThumbsUp className="w-3 h-3 text-emerald-600" />
                    <span>表达亮点与优势</span>
                  </span>
                  <ul className="list-disc pl-4 space-y-0.5 text-slate-600 text-[11px]">
                    {prof.strengths.map((s, idx) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-amber-700 flex items-center space-x-1 mb-1">
                    <AlertCircle className="w-3 h-3 text-amber-600" />
                    <span>语艺提升空间</span>
                  </span>
                  <ul className="list-disc pl-4 space-y-0.5 text-slate-600 text-[11px]">
                    {prof.improvementAreas.map((a, idx) => (
                      <li key={idx}>{a}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. 语艺教练情境实操建议 */}
      {speechArt.coachingSuggestions && speechArt.coachingSuggestions.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
            <HeartHandshake className="w-4 h-4 text-emerald-600" />
            <span>情境化语艺沟通教练建议</span>
          </div>

          <div className="space-y-3">
            {speechArt.coachingSuggestions.map((coach, i) => (
              <div
                key={i}
                className="p-4 rounded-xl bg-slate-50/80 border border-slate-100 hover:border-slate-200 transition-all space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-900">{coach.targetSpeaker}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-indigo-600 font-medium">环节: {coach.scenario}</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                    语艺优化
                  </span>
                </div>

                <div className="text-xs space-y-1">
                  <div className="text-slate-500">
                    <span className="font-medium text-slate-600">观察盲区: </span>
                    {coach.observation}
                  </div>
                  <div className="text-indigo-950 bg-indigo-50/70 p-2.5 rounded-lg border border-indigo-100/80 leading-relaxed font-normal">
                    <span className="font-semibold text-indigo-700">推荐语艺改进: </span>
                    {coach.suggestion}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
