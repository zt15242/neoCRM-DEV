/**
 * 会议助手与飞书妙计风格 AI 转写、总结与语艺分析类型定义
 */

export interface MeetingSpeaker {
  id: string;              // 如 'spk_1'
  name: string;            // 如 '张总 (架构负责人)'
  role?: string;           // 如 '产品总监' | '售前顾问' | '技术主管'
  avatarColor: string;     // 如 '#3b82f6'
  talkTimeSeconds: number; // 发言总时长 (秒)
  talkRatio: number;       // 发言时长占比 0-100%
  wordCount?: number;      // 发言总字数
}

export interface MatchedTermInfo {
  term: string;
  category: string;
  explanation: string;
}

export interface MeetingSegment {
  id: string;
  speakerId: string;
  speakerName: string;
  startTime: number;       // 起始时间 (秒，支持小数，如 12.4)
  endTime: number;         // 结束时间 (秒)
  text: string;            // 转写文本
  tone?: 'positive' | 'neutral' | 'questioning' | 'hesitant' | 'assertive' | 'consensus';
  toneLabel?: string;      // 如 '坚定决策' | '提出顾虑' | '达成一致' | '深入探询'
  matchedTerms?: MatchedTermInfo[]; // 命中的专业术语
}

export interface MeetingActionItem {
  id: string;
  task: string;
  assignee: string;
  priority: 'high' | 'medium' | 'low';
  dueDate?: string;
  completed: boolean;
}

export interface MeetingTopicItem {
  id: string;
  title: string;
  timeRange: string;       // 如 '00:00 - 04:30'
  keyPoints: string[];     // 讨论要点
  speakers: string[];      // 主要发言人
}

/**
 * 方案权衡与决策博弈分析
 */
export interface DecisionTradeoffItem {
  id: string;
  topic: string;           // 议题
  option: string;          // 方案名称
  pros: string[];          // 优势收益
  cons: string[];          // 潜在短板与成本
  riskLevel: 'low' | 'medium' | 'high'; // 风险等级
  status: 'adopted' | 'rejected' | 'pending'; // 最终决议 (采纳/否决/待定)
  rationale: string;       // 裁决依据与技术/商业逻辑
}

/**
 * 树状思维导图 / 议题层级决策树节点 (Mind Map & Topic Tree Node)
 */
export interface TopicTreeNode {
  id: string;
  title: string;           // 节点标题
  type: 'goal' | 'topic' | 'problem' | 'solution' | 'decision' | 'action'; // 节点语义
  description?: string;    // 详细阐述
  speaker?: string;        // 倡议人/责任人
  timeRange?: string;      // 对应会议时段
  status?: 'resolved' | 'agreed' | 'pending' | 'risk'; // 状态胶囊
  children?: TopicTreeNode[]; // 子分支节点
}

/**
 * 落地待办甘特推进轴
 */
export interface GanttMilestoneItem {
  id: string;
  task: string;
  assignee: string;
  startDay: number;        // 第几天开始 (如 1)
  endDay: number;          // 第几天结束 (如 4)
  priority: 'high' | 'medium' | 'low';
  progress: number;        // 0-100%
}

/**
 * 六维语艺雷达图维度
 */
export interface SpeakerRadarScore {
  speakerId: string;
  speakerName: string;
  color: string;
  dimensions: {
    assertiveness: number; // 坚定说服力
    empathy: number;        // 倾听共情
    logicRigor: number;     // 逻辑严密
    contribution: number;   // 方案贡献
    questionQuality: number;// 提问质效
    pacingControl: number;  // 节奏掌控
  };
}

/**
 * 发言人互动网络流动矩阵
 */
export interface SpeakerInteractionFlow {
  sourceSpeaker: string;
  targetSpeaker: string;
  count: number;
  sentiment: 'positive' | 'neutral' | 'debate';
  description: string;
}

export interface MeetingSummary {
  executiveSummary: string; // 核心摘要 (1-3段)
  strategicContext?: string; // 战略背景研判与宏观商业目标
  keyDecisions: Array<{
    id: string;
    content: string;
    context?: string;
  }>;
  decisionTradeoffs?: DecisionTradeoffItem[]; // 方案权衡对决矩阵
  topicTree?: TopicTreeNode; // 议题层级思维导图树
  actionItems: MeetingActionItem[];
  topics: MeetingTopicItem[];
  risksAndBlockers?: Array<{
    id: string;
    risk: string;
    suggestion: string;
  }>;
  generatedAt: number;
  modelUsed?: string;
}

/**
 * 语艺与沟通语义分析 (Speech Art & Rhetorical Dynamics)
 */
export interface SpeakerSpeechArtProfile {
  speakerId: string;
  speakerName: string;
  styleType: 'decisive' | 'analytical' | 'collaborative' | 'critical' | 'action_driven';
  styleLabel: string;        // 如 '果决决策型' | '严谨推导型' | '温和共情型' | '敏锐质询型'
  toneDominance: string;     // 语调主导特征，如 '沉稳有力，条理清晰'
  questionRatio: number;     // 提问占比 (0-100)
  assertivenessScore: number;// 坚定说服力得分 (0-100)
  empathyScore: number;      // 倾听与共情得分 (0-100)
  clarityScore: number;      // 逻辑条理性得分 (0-100)
  strengths: string[];       // 语艺亮点
  improvementAreas: string[];// 提升优化建议
}

export interface SpeechArtAnalysis {
  overallAtmosphere: 'efficient' | 'collaborative' | 'contentious' | 'deliberative' | 'instructive';
  atmosphereLabel: string;   // 如 '高效共识型' | '激烈博弈型' | '审慎推导型'
  atmosphereScore: number;   // 会议协作效率综合得分 (0-100)
  speakerProfiles: SpeakerSpeechArtProfile[];
  speakerRadars?: SpeakerRadarScore[]; // 六维语艺雷达图
  interactionFlows?: SpeakerInteractionFlow[]; // 互动关系流
  coachingSuggestions: Array<{
    targetSpeaker: string;
    scenario: string;
    observation: string;
    suggestion: string;
  }>;
  cadenceSummary: string;    // 发言节奏与控场评价
}

/**
 * 飞书妙计风格多维图表数据
 */
export interface MeetingChartData {
  speakerRatios: Array<{
    speakerId: string;
    speakerName: string;
    seconds: number;
    percentage: number;
    color: string;
  }>;
  timelineHeatmap: Array<{
    timeBucket: string;      // 如 '00:00', '02:00', '04:00'
    speakerName: string;
    intensity: number;       // 0-100 发言密集度
    speakerColor: string;
  }>;
  sentimentTrajectory: Array<{
    timeOffset: number;      // 秒
    timeFormatted: string;   // '02:30'
    sentimentScore: number;  // -1.0 (严重分歧/阻碍) 至 +1.0 (高度赞同/敲定)
    milestoneLabel?: string; // 关键转折点或决议
  }>;
  termFrequencies: Array<{
    term: string;
    count: number;
    category: string;
  }>;
  actionMatrix: Array<{
    assignee: string;
    total: number;
    highPriority: number;
    completed: number;
  }>;
  milestoneGantt?: GanttMilestoneItem[]; // 落地甘特推进轴
  speakerRadars?: SpeakerRadarScore[];   // 六维雷达图
  decisionTradeoffs?: DecisionTradeoffItem[]; // 决策对比矩阵
}

export type MeetingStatus = 'idle' | 'transcribing' | 'transcribed' | 'summarizing' | 'completed' | 'error';

export interface MeetingRecord {
  id: string;
  title: string;
  date: number;              // 会议发生时间戳
  duration: number;          // 会议总时长 (秒)
  audioPath?: string;        // 本地音频存储路径
  audioFileName?: string;    // 文件名
  audioFileSize?: number;    // 文件大小
  audioDataUrl?: string;     // 本地可直接回放的 Data URL / URL
  status: MeetingStatus;
  statusMessage?: string;
  language?: string;         // 'zh' | 'en' 等
  tags?: string[];
  speakers: MeetingSpeaker[];
  segments: MeetingSegment[];
  summary?: MeetingSummary;
  speechArt?: SpeechArtAnalysis;
  charts?: MeetingChartData;
  glossaryHitTerms?: string[];
  createdAt: number;
  updatedAt: number;
}

/**
 * 专业术语库
 */
export type TermCategory = 'crm_sales' | 'tech_arch' | 'biz_mgmt' | 'custom';

export interface GlossaryTerm {
  id: string;
  term: string;              // 术语名称 (如 'XOQL', 'CPQ', 'ARR')
  category: TermCategory;
  categoryLabel: string;     // 'CRM与业务' | '技术与架构' | '商务与管理' | '自定义'
  aliases: string[];         // 别名或常见误读 (如 ['X O Q L', '小QL'])
  explanation: string;       // 术语详解与商业/技术背景
  exampleSentence?: string;  // 典型应用语境
  enabled: boolean;          // 是否在 OpenAI Whisper 转写提示词中生效
  isBuiltin: boolean;        // 是否系统预置
}

/**
 * 转写与总结配置
 */
export interface OpenAiAudioSettings {
  apiKey: string;
  baseUrl: string;
  model: string;             // 如 'whisper-1'
  language: string;          // 如 'zh', 'en', 'auto'
  temperature: number;       // 0.0 - 1.0
  promptTerminologyEnabled: boolean; // 是否注入术语库到 Prompt
}
