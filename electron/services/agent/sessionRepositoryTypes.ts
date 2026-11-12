import type { AiChatSession } from '../../../shared/types';

export interface SessionPage { sessions: AiChatSession[]; nextOffset: number | null; total: number }
export interface MessagePage { session: AiChatSession; offset: number; nextBefore: number | null; total: number }
export interface SessionStoreInfo { schemaVersion: number; migratedSessions: number; migratedMessages: number; backupPath?: string }
export type SessionStoreRequest =
  | { operation: 'initialize' }
  | { operation: 'list'; offset?: number; limit?: number; owner?: string }
  | { operation: 'get'; id: string; before?: number; limit?: number }
  | { operation: 'save'; session: AiChatSession; fromAgent?: boolean; active?: boolean }
  | { operation: 'delete'; id: string }
  | { operation: 'clear' }
  | { operation: 'close' };
