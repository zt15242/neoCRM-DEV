import type { AiChatSession, WorkspaceProject } from '../../shared/types';

export const WORKSPACE_SELECTION_KEY = 'neocrm.workspace.selection.v1';
export interface WorkspaceSelection { projectId: string | null; sessionId: string | null }

export function readWorkspaceSelection(storage: Pick<Storage, 'getItem'>): WorkspaceSelection | null {
  try {
    const value = JSON.parse(storage.getItem(WORKSPACE_SELECTION_KEY) || 'null');
    if (!value || (value.projectId !== null && typeof value.projectId !== 'string') ||
        (value.sessionId !== null && typeof value.sessionId !== 'string')) return null;
    return { projectId: value.projectId, sessionId: value.sessionId };
  } catch { return null; }
}

export function resolveWorkspaceSelection(saved: WorkspaceSelection | null, projects: WorkspaceProject[], sessions: AiChatSession[], isVisible: (id?: string) => boolean): WorkspaceSelection {
  const projectId = projects.some(project => project.id === saved?.projectId) ? saved!.projectId : projects[0]?.id || null;
  const eligible = sessions.filter(session => session.projectId === projectId && (session.messageCount ?? session.messages?.length ?? 0) > 0 && isVisible(session.presetId));
  if (saved && saved.projectId === projectId) {
    return { projectId, sessionId: saved.sessionId && eligible.some(session => session.id === saved.sessionId) ? saved.sessionId : null };
  }
  return { projectId, sessionId: eligible[0]?.id || null };
}
