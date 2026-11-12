import type { ModelRequest, ModelStreamEvent } from './modelGatewayTypes';

export type RuntimeRequest =
  | { type: 'stream'; id: string; request: Omit<ModelRequest, 'signal'> }
  | { type: 'cancel'; id: string }
  | { type: 'ping'; at: number }
  | { type: 'shutdown' }
  | { type: 'test-crash' }
  | { type: 'test-rss' };

export type RuntimeMessage =
  | { type: 'ready'; pid: number; heapLimit: number }
  | { type: 'events'; id: string; events: ModelStreamEvent[] }
  | { type: 'done'; id: string }
  | { type: 'error'; id: string; error: SerializedRuntimeError }
  | { type: 'pong'; at: number; rss: number; heapUsed: number; active: number };

export interface SerializedRuntimeError {
  name: string;
  message: string;
  kind?: string;
  status?: number;
  retryAfterMs?: number;
  contextWindow?: number;
  nonRetryable?: boolean;
}
