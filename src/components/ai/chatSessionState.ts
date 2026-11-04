import type { AiChatSession } from '../../../shared/types';

export const AGENT_STATUS_LABELS = {
  queued: '排队中', running: '执行中', completed: '已完成', failed: '失败',
  cancelled: '已停止', interrupted: '已中断', waiting: '待答复',
};

export function orderAgentSessions(sessions: AiChatSession[]): AiChatSession[] {
  const ids = new Set(sessions.map(item => item.id));
  const roots = sessions.filter(item => !item.agentRun?.parentSessionId || !ids.has(item.agentRun.parentSessionId));
  return roots.flatMap(item => [item, ...sessions.filter(child => child.agentRun?.parentSessionId === item.id)]);
}

// Saved lists can lag behind other conversations, including ones that just finished.
export function mergeSavedChatSessions(
  saved: AiChatSession[],
  current: AiChatSession[],
  running: Record<string, unknown>,
  savedSessionId: string,
): AiChatSession[] {
  const snapshots = new Map(saved.map((session) => [session.id, session]));
  const live = new Map(current.filter((session) => {
    if (session.id === savedSessionId) return false;
    const snapshot = snapshots.get(session.id);
    return running[session.id] || !snapshot || session.updatedAt >= snapshot.updatedAt;
  }).map((session) => [session.id, session]));
  const merged = saved.map((session) => live.get(session.id) || session);
  const savedIds = new Set(saved.map((session) => session.id));
  for (const [id, session] of live) {
    if (!savedIds.has(id)) merged.push(session);
  }
  return merged;
}
