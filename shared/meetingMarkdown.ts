import type { MeetingRecord, TopicTreeNode } from './meetingTypes';

export function meetingTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

/** The clipboard and saved document must contain the same minutes. */
export function formatMeetingMarkdown(meeting: MeetingRecord, includeTranscript = true): string {
  const lines = [`# ${meeting.title}`, '',
    `- 会议时间：${new Date(meeting.date).toLocaleString('zh-CN')}`,
    `- 会议时长：${meetingTime(meeting.duration)}`,
    `- 参会发言人：${meeting.speakers.map(s => s.name).join('、') || '未识别'}`, ''];
  const summary = meeting.summary;
  if (summary) {
    if (summary.modelUsed === '智能分析引擎') lines.push('> 此为旧版本地生成结果，未经模型分析，请重新生成后核对。', '');
    if (summary.sourceSegmentCount !== undefined) lines.push(`分析覆盖：${summary.sourceSegmentCount} 段转写，${summary.sourceChunkCount} 个分析分段。`, '');
    lines.push('## 会议摘要', summary.executiveSummary, '');
    if (summary.strategicContext) lines.push('## 背景与目标', summary.strategicContext, '');
    lines.push('## 关键决策');
    if (!summary.keyDecisions.length) lines.push('未记录明确决策。');
    summary.keyDecisions.forEach((d, i) => lines.push(`${i + 1}. ${d.content}${d.context ? `\n   背景与依据：${d.context}` : ''}`));
    lines.push('', '## 行动事项');
    if (!summary.actionItems.length) lines.push('未记录明确行动事项。');
    summary.actionItems.forEach(a => lines.push(`- [${a.completed ? 'x' : ' '}] ${a.task}｜负责人：${a.assignee || '未明确'}｜优先级：${a.priority}｜截止：${a.dueDate || '未明确'}`));
    lines.push('', '## 分议题详细纪要');
    summary.topics.forEach(t => {
      lines.push(`### ${t.title}${t.timeRange ? `（${t.timeRange}）` : ''}`);
      if (t.speakers.length) lines.push(`发言人：${t.speakers.join('、')}`);
      lines.push(...t.keyPoints.map(p => `- ${p}`), '');
    });
    if (summary.risksAndBlockers?.length) {
      lines.push('## 风险与待确认问题');
      summary.risksAndBlockers.forEach(r => lines.push(`- ${r.risk}${r.suggestion ? `\n  建议（供参考）：${r.suggestion}` : ''}`));
      lines.push('');
    }
    if (summary.decisionTradeoffs?.length) {
      lines.push('## 方案比较');
      summary.decisionTradeoffs.forEach(d => lines.push(`### ${d.topic}：${d.option}`, `- 状态：${d.status}；风险：${d.riskLevel}`, `- 优势：${d.pros.join('；') || '未明确'}`, `- 代价：${d.cons.join('；') || '未明确'}`, `- 依据：${d.rationale}`, ''));
    }
    if (summary.topicTree) {
      lines.push('## 议题树');
      const visit = (node: TopicTreeNode, depth = 0) => {
        lines.push(`${'  '.repeat(depth)}- ${node.title}${node.description ? `：${node.description}` : ''}${node.timeRange ? `（${node.timeRange}）` : ''}`);
        node.children?.forEach(n => visit(n, depth + 1));
      };
      visit(summary.topicTree);
      lines.push('');
    }
  }
  if (meeting.speechArt) {
    const art = meeting.speechArt;
    lines.push('## 沟通分析（基于转写文本）', art.atmosphereLabel, art.cadenceSummary, '');
    art.speakerProfiles.forEach(p => lines.push(`### ${p.speakerName} · ${p.styleLabel}`, `- 观察：${p.toneDominance}`, `- 优点：${p.strengths.join('；')}`, `- 改进方向：${p.improvementAreas.join('；')}`, ''));
    art.coachingSuggestions.forEach(c => lines.push(`- ${c.targetSpeaker}／${c.scenario}：${c.observation}\n  建议：${c.suggestion}`));
    lines.push('');
  }
  if (includeTranscript) {
    lines.push('## 完整转写记录', '');
    meeting.segments.forEach(s => lines.push(`**[${meetingTime(s.startTime)} - ${meetingTime(s.endTime)}] ${s.speakerName}**`, s.text, ''));
  }
  return lines.join('\n');
}
