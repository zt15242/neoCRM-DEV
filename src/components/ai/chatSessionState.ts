import type { AiChatSession } from '../../../shared/types';

export const chatMessageCount = (session: AiChatSession) => session.messagesLoaded === false ? session.messageCount || 0 : session.messages.length;

/** Keep only the selected conversation and in-flight streams resident in the renderer. */
export function releaseInactiveSessionBodies(sessions: AiChatSession[], activeId: string | null, running: Record<string, unknown>) {
  return sessions.map(session => session.id === activeId || running[session.id] || session.messagesLoaded === false ? session : {
    ...session, messageCount: chatMessageCount(session), messagesLoaded: false, messages: [],
  });
}

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
  const merged = saved.map((session) => live.get(session.id)
    || (session.messagesLoaded === false && current.find(item => item.id === session.id && item.messagesLoaded !== false && item.updatedAt >= session.updatedAt))
    || session);
  const savedIds = new Set(saved.map((session) => session.id));
  for (const [id, session] of live) {
    if (!savedIds.has(id)) merged.push(session);
  }
  return merged;
}
