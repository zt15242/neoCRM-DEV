import React, { useState } from 'react';
import {
  PieChart,
  BarChart3,
  TrendingUp,
  Activity,
  Layers,
  Clock,
  User,
  Hash,
  Sparkles,
  ChevronRight,
  Zap,
  GitBranch,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertCircle,
  HelpCircle,
  Share2,
  Calendar,
} from 'lucide-react';
import {
  MeetingChartData,
  SpeakerRadarScore,
  GanttMilestoneItem,
  DecisionTradeoffItem,
} from '../../../shared/meetingTypes';

interface MeetingChartsPaneProps {
  charts?: MeetingChartData;
  duration: number;
  onSeekTime?: (seconds: number) => void;
}

export const MeetingChartsPane: React.FC<MeetingChartsPaneProps> = ({
  charts,
  duration,
  onSeekTime,
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<any | null>(null);
  const [selectedRadarSpeaker, setSelectedRadarSpeaker] = useState<string>('all');

  if (!charts) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center shadow-inner">
          <BarChart3 className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-slate-800">尚未生成可视化图表</h4>
          <p className="text-xs text-slate-400 max-w-xs">
            飞书妙计风格多维统计：时长环形图、六维雷达、落地甘特、决策对决矩阵与情绪走势。
          </p>
        </div>
      </div>
    );
  }

  const formatTime = (seconds: number) => {
    const s = Math.floor(seconds || 0);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  // 1. 发言时长 Donut 计算
  const speakerRatios = charts.speakerRatios || [];
  let accumulatedAngle = 0;
  const donutSlices = speakerRatios.map((item) => {
    const percentage = item.percentage / 100;
    const angle = percentage * 360;
    const startAngle = accumulatedAngle;
    accumulatedAngle += angle;
    return { ...item, startAngle, angle };
  });

  // 2. 情绪走势曲线坐标映射
  const trajectory = charts.sentimentTrajectory || [];
  const svgWidth = 560;
  const svgHeight = 180;
  const paddingX = 40;
  const paddingY = 25;

  const points = trajectory.map((pt, i) => {
    const x = paddingX + ((svgWidth - paddingX * 2) / Math.max(1, trajectory.length - 1)) * i;
    const normalized = (pt.sentimentScore + 1) / 2;
    const y = svgHeight - paddingY - normalized * (svgHeight - paddingY * 2);
    return { ...pt, x, y };
  });

  const pathD = points.reduce((acc, pt, i) => {
    if (i === 0) return `M ${pt.x} ${pt.y}`;
    const prev = points[i - 1];
    const cpX = (prev.x + pt.x) / 2;
    return `${acc} C ${cpX} ${prev.y}, ${cpX} ${pt.y}, ${pt.x} ${pt.y}`;
  }, '');

  const areaD = points.length > 0
    ? `${pathD} L ${points[points.length - 1].x} ${svgHeight - paddingY} L ${points[0].x} ${svgHeight - paddingY} Z`
    : '';

  // 3. 六维语艺雷达图计算
  const radarDimensions = [
    { key: 'assertiveness', label: '坚定说服力' },
    { key: 'logicRigor', label: '逻辑严密' },
    { key: 'contribution', label: '方案贡献' },
    { key: 'pacingControl', label: '控场节奏' },
    { key: 'questionQuality', label: '提问质效' },
    { key: 'empathy', label: '倾听共情' },
  ];

  const radarCenterX = 130;
  const radarCenterY = 130;
  const radarRadius = 85;

  const getRadarPoint = (index: number, score: number) => {
    const angle = (Math.PI * 2 / radarDimensions.length) * index - Math.PI / 2;
    const r = (score / 100) * radarRadius;
    const x = radarCenterX + r * Math.cos(angle);
    const y = radarCenterY + r * Math.sin(angle);
    return { x, y };
  };

  const speakerRadars = charts.speakerRadars || [];
  const filteredRadars = speakerRadars.filter(
    (r) => selectedRadarSpeaker === 'all' || r.speakerId === selectedRadarSpeaker
  );

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
      {/* 1. 发言时长占比 (飞书妙计同款 Donut Chart + 进度条) */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
            <PieChart className="w-4 h-4 text-blue-600" />
            <span>发言人时长占比 (飞书妙计统计)</span>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            总时长: {formatTime(duration)}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          <div className="md:col-span-5 flex flex-col items-center justify-center relative">
            <svg width="170" height="170" viewBox="0 0 170 170" className="transform -rotate-90">
              {donutSlices.map((slice, i) => {
                const strokeDasharray = `${(slice.percentage * 2 * Math.PI * 60) / 100} ${2 * Math.PI * 60}`;
                const strokeDashoffset = -((slice.startAngle / 360) * 2 * Math.PI * 60);
                return (
                  <circle
                    key={i}
                    cx="85"
                    cy="85"
                    r="60"
                    fill="transparent"
                    stroke={slice.color}
                    strokeWidth="18"
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    className="transition-all duration-500 hover:opacity-80 cursor-pointer"
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[11px] text-slate-400">参会总发言</span>
              <span className="text-base font-extrabold font-mono text-slate-800">
                {formatTime(duration)}
              </span>
            </div>
          </div>

          <div className="md:col-span-7 space-y-3">
            {speakerRatios.map((sp) => (
              <div key={sp.speakerId} className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <div className="flex items-center space-x-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: sp.color }}
                    />
                    <span className="font-semibold text-slate-800">{sp.speakerName}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-slate-500 font-mono text-[11px]">
                    <span>{formatTime(sp.seconds)}</span>
                    <span className="font-bold text-slate-700">({sp.percentage}%)</span>
                  </div>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${sp.percentage}%`,
                      backgroundColor: sp.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 2. 发言人六维语艺与沟通效能雷达图 (Radar Chart) */}
      {speakerRadars.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>参会人六维语艺能力雷达图</span>
            </div>

            {/* 说话人筛选 */}
            <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg text-xs">
              <button
                onClick={() => setSelectedRadarSpeaker('all')}
                className={`px-2 py-0.5 rounded font-medium transition-colors cursor-pointer ${
                  selectedRadarSpeaker === 'all' ? 'bg-white text-indigo-600 shadow-2xs font-bold' : 'text-slate-600'
                }`}
              >
                全员对比
              </button>
              {speakerRadars.map((sp) => (
                <button
                  key={sp.speakerId}
                  onClick={() => setSelectedRadarSpeaker(sp.speakerId)}
                  className={`px-2 py-0.5 rounded font-medium transition-colors cursor-pointer ${
                    selectedRadarSpeaker === sp.speakerId ? 'bg-white text-indigo-600 shadow-2xs font-bold' : 'text-slate-600'
                  }`}
                >
                  {sp.speakerName.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* SVG 雷达图 */}
            <div className="md:col-span-7 flex justify-center">
              <svg width="260" height="260" viewBox="0 0 260 260">
                {/* 同心圆背景 */}
                {[0.25, 0.5, 0.75, 1.0].map((step) => {
                  const pointsStr = radarDimensions.map((_, i) => {
                    const angle = (Math.PI * 2 / radarDimensions.length) * i - Math.PI / 2;
                    const r = radarRadius * step;
                    return `${radarCenterX + r * Math.cos(angle)},${radarCenterY + r * Math.sin(angle)}`;
                  }).join(' ');
                  return (
                    <polygon
                      key={step}
                      points={pointsStr}
                      fill="none"
                      stroke="#e2e8f0"
                      strokeWidth="1"
                      strokeDasharray={step === 1 ? undefined : '2 2'}
                    />
                  );
                })}

                {/* 轴线 */}
                {radarDimensions.map((dim, i) => {
                  const p = getRadarPoint(i, 100);
                  const labelAngle = (Math.PI * 2 / radarDimensions.length) * i - Math.PI / 2;
                  const labelR = radarRadius + 20;
                  const lx = radarCenterX + labelR * Math.cos(labelAngle);
                  const ly = radarCenterY + labelR * Math.sin(labelAngle);
                  return (
                    <g key={dim.key}>
                      <line
                        x1={radarCenterX}
                        y1={radarCenterY}
                        x2={p.x}
                        y2={p.y}
                        stroke="#e2e8f0"
                        strokeWidth="1"
                      />
                      <text
                        x={lx}
                        y={ly + 3}
                        textAnchor="middle"
                        className="text-[10px] fill-slate-500 font-medium"
                      >
                        {dim.label}
                      </text>
                    </g>
                  );
                })}

                {/* 说话人雷达多边形 */}
                {filteredRadars.map((sp) => {
                  const pointsStr = radarDimensions.map((dim, i) => {
                    const score = (sp.dimensions as any)[dim.key] || 50;
                    const pt = getRadarPoint(i, score);
                    return `${pt.x},${pt.y}`;
                  }).join(' ');

                  return (
                    <polygon
                      key={sp.speakerId}
                      points={pointsStr}
                      fill={sp.color}
                      fillOpacity="0.25"
                      stroke={sp.color}
                      strokeWidth="2"
                      className="transition-all duration-300 hover:fill-opacity-50"
                    />
                  );
                })}
              </svg>
            </div>

            {/* 右侧得分明细 */}
            <div className="md:col-span-5 space-y-3">
              {filteredRadars.map((sp) => (
                <div key={sp.speakerId} className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: sp.color }} />
                    <span className="font-bold text-xs text-slate-800">{sp.speakerName}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-600">
                    <div>说服: <span className="font-mono font-bold text-slate-800">{sp.dimensions.assertiveness}</span></div>
                    <div>共情: <span className="font-mono font-bold text-slate-800">{sp.dimensions.empathy}</span></div>
                    <div>逻辑: <span className="font-mono font-bold text-slate-800">{sp.dimensions.logicRigor}</span></div>
                    <div>贡献: <span className="font-mono font-bold text-slate-800">{sp.dimensions.contribution}</span></div>
                    <div>提问: <span className="font-mono font-bold text-slate-800">{sp.dimensions.questionQuality}</span></div>
                    <div>控场: <span className="font-mono font-bold text-slate-800">{sp.dimensions.pacingControl}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. 落地待办里程碑推进甘特图 (Gantt Chart) */}
      {charts.milestoneGantt && charts.milestoneGantt.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
              <Calendar className="w-4 h-4 text-emerald-600" />
              <span>落实待办里程碑推进甘特轴 (7天窗口)</span>
            </div>
            <span className="text-[11px] text-slate-400">推进跟踪</span>
          </div>

          <div className="space-y-3">
            {/* 时间轴标尺 D1 ~ D7 */}
            <div className="flex justify-between pl-48 pr-4 text-[10px] font-mono text-slate-400 border-b border-slate-100 pb-1">
              <span>周一 (D1)</span>
              <span>周二 (D2)</span>
              <span>周三 (D3)</span>
              <span>周四 (D4)</span>
              <span>周五 (D5)</span>
              <span>周六 (D6)</span>
              <span>周日 (D7)</span>
            </div>

            {/* 各任务条 */}
            <div className="space-y-2.5">
              {charts.milestoneGantt.map((g) => {
                const totalDays = 7;
                const leftPercent = ((g.startDay - 1) / totalDays) * 100;
                const widthPercent = (Math.max(1, g.endDay - g.startDay + 1) / totalDays) * 100;
                const isHigh = g.priority === 'high';

                return (
                  <div key={g.id} className="flex items-center text-xs">
                    <div className="w-48 truncate pr-3 flex items-center space-x-1.5 shrink-0">
                      <span className={`w-1.5 h-1.5 rounded-full ${isHigh ? 'bg-rose-500' : 'bg-blue-500'}`} />
                      <span className="font-medium text-slate-800 truncate" title={g.task}>
                        {g.task}
                      </span>
                    </div>

                    <div className="flex-1 h-6 bg-slate-50 rounded-lg relative overflow-hidden">
                      <div
                        className={`absolute top-0 bottom-0 rounded-md transition-all flex items-center justify-between px-2 text-[10px] text-white shadow-2xs ${
                          isHigh ? 'bg-gradient-to-r from-rose-500 to-amber-500' : 'bg-gradient-to-r from-blue-500 to-cyan-500'
                        }`}
                        style={{
                          left: `${leftPercent}%`,
                          width: `${widthPercent}%`,
                        }}
                      >
                        <span className="truncate">@{g.assignee}</span>
                        <span className="font-mono">{g.progress}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 4. 方案权衡与决策博弈对决矩阵 (Decision Tradeoff Matrix Table) */}
      {charts.decisionTradeoffs && charts.decisionTradeoffs.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
              <GitBranch className="w-4 h-4 text-purple-600" />
              <span>方案权衡与决策对决矩阵 (麦肯锡级对决剖析)</span>
            </div>
            <span className="text-[11px] text-slate-400">方案论证对比</span>
          </div>

          <div className="divide-y divide-slate-100 space-y-3">
            {charts.decisionTradeoffs.map((item) => (
              <div key={item.id} className="pt-3 first:pt-0 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-xs text-slate-900">{item.option}</span>
                    <span className="text-[10px] text-slate-400">({item.topic})</span>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1 ${
                      item.status === 'adopted'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : item.status === 'rejected'
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {item.status === 'adopted' ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        <span>已正式拍板采纳</span>
                      </>
                    ) : item.status === 'rejected' ? (
                      <>
                        <XCircle className="w-3 h-3" />
                        <span>论证后坚决否决</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3 h-3" />
                        <span>待第二轮验证</span>
                      </>
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-100 text-emerald-900 space-y-1">
                    <span className="font-bold text-[11px] text-emerald-700">✓ 优势与预期收益</span>
                    <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-emerald-800">
                      {item.pros.map((p, idx) => (
                        <li key={idx}>{p}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-2.5 rounded-xl bg-rose-50/50 border border-rose-100 text-rose-900 space-y-1">
                    <span className="font-bold text-[11px] text-rose-700">✗ 潜在短板与技术风险</span>
                    <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-rose-800">
                      {item.cons.map((c, idx) => (
                        <li key={idx}>{c}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg leading-relaxed">
                  <span className="font-semibold text-slate-700">裁决底层逻辑: </span>
                  {item.rationale}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. 情绪与共识走势波动图 (Sentiment & Consensus Curve) */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
            <TrendingUp className="w-4 h-4 text-indigo-600" />
            <span>会议情绪与共识走势波动图</span>
          </div>
          <div className="flex items-center space-x-3 text-[11px] text-slate-500">
            <span className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>达成共识 (+1.0)</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              <span>分歧争鸣 (-1.0)</span>
            </span>
          </div>
        </div>

        <div className="relative w-full overflow-x-auto">
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-44 overflow-visible">
            <defs>
              <linearGradient id="sentimentGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            <line
              x1={paddingX}
              y1={svgHeight / 2}
              x2={svgWidth - paddingX}
              y2={svgHeight / 2}
              stroke="#e2e8f0"
              strokeDasharray="4 4"
              strokeWidth="1.5"
            />
            <text x={paddingX - 6} y={svgHeight / 2 + 4} textAnchor="end" className="text-[10px] fill-slate-400 font-mono">0.0</text>
            <text x={paddingX - 6} y={paddingY + 4} textAnchor="end" className="text-[10px] fill-emerald-600 font-mono">+1.0</text>
            <text x={paddingX - 6} y={svgHeight - paddingY + 4} textAnchor="end" className="text-[10px] fill-rose-500 font-mono">-1.0</text>

            {areaD && <path d={areaD} fill="url(#sentimentGradient)" />}

            {pathD && (
              <path
                d={pathD}
                fill="none"
                stroke="#4f46e5"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            )}

            {points.map((pt, i) => (
              <g
                key={i}
                onMouseEnter={() => setHoveredPoint(pt)}
                onMouseLeave={() => setHoveredPoint(null)}
                className="cursor-pointer"
              >
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r="5"
                  className={`${
                    pt.sentimentScore >= 0 ? 'fill-indigo-600 stroke-indigo-100' : 'fill-rose-500 stroke-rose-100'
                  } stroke-2 hover:r-7 transition-all`}
                />
                {pt.milestoneLabel && (
                  <text
                    x={pt.x}
                    y={pt.y - 10}
                    textAnchor="middle"
                    className="text-[10px] fill-slate-700 font-medium"
                  >
                    {pt.milestoneLabel}
                  </text>
                )}
              </g>
            ))}
          </svg>
        </div>

        {hoveredPoint && (
          <div className="p-2.5 rounded-xl bg-slate-900 text-white text-xs flex items-center justify-between shadow-lg">
            <span className="font-mono text-cyan-300">{hoveredPoint.timeFormatted}</span>
            <span className="font-semibold text-slate-100">{hoveredPoint.milestoneLabel || '讨论节点'}</span>
            <span
              className={`font-mono font-bold ${
                hoveredPoint.sentimentScore >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              共识指数: {hoveredPoint.sentimentScore > 0 ? `+${hoveredPoint.sentimentScore}` : hoveredPoint.sentimentScore}
            </span>
          </div>
        )}
      </div>

      {/* 6. 核心专业术语提及频次排行与待办认领矩阵 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
            <Hash className="w-4 h-4 text-purple-600" />
            <span>专业术语高频提及排行</span>
          </div>

          <div className="space-y-2.5">
            {charts.termFrequencies.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                本次会议未命中已注册术语
              </div>
            ) : (
              charts.termFrequencies.map((tf, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="w-4 h-4 rounded-full bg-purple-50 text-purple-700 text-[10px] font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <span className="font-semibold text-slate-800">{tf.term}</span>
                      <span className="text-[10px] text-slate-400">({tf.category})</span>
                    </div>
                    <span className="font-mono text-purple-600 font-bold text-xs">
                      {tf.count}次
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full"
                      style={{
                        width: `${Math.min(100, (tf.count / (charts.termFrequencies[0]?.count || 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
            <User className="w-4 h-4 text-blue-600" />
            <span>待办认领与工作量分布</span>
          </div>

          <div className="space-y-2.5">
            {charts.actionMatrix.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                暂无分配给负责人的待办事项
              </div>
            ) : (
              charts.actionMatrix.map((act, i) => (
                <div
                  key={i}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center space-x-2">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold text-[11px] flex items-center justify-center">
                      {act.assignee.charAt(0)}
                    </div>
                    <span className="font-semibold text-slate-800">{act.assignee}</span>
                  </div>

                  <div className="flex items-center space-x-2 font-mono text-[11px]">
                    <span className="text-slate-500">认领: {act.total}项</span>
                    {act.highPriority > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-bold border border-rose-200 text-[10px]">
                        紧急 {act.highPriority}
                      </span>
                    )}
                    <span className="text-emerald-600 font-bold">已落 {act.completed}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
