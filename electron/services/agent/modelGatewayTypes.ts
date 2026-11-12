import type { AiProviderConfig } from '../../../shared/types';

// Application-owned contracts. Upstream classes and credentials stay inside the gateway.
export type ModelMetadata = Record<string, Record<string, unknown>>;
export type ModelPart =
  | { type: 'text'; text: string; providerMetadata?: ModelMetadata }
  | { type: 'image'; mediaType: string; data: string }
  | { type: 'reasoning'; text: string; providerMetadata?: ModelMetadata }
  | { type: 'tool-call'; id: string; name: string; input: unknown; providerMetadata?: ModelMetadata }
  | { type: 'tool-result'; id: string; name: string; value: unknown; isError?: boolean };

export interface ModelMessage {
  role: 'user' | 'assistant' | 'tool';
  parts: ModelPart[];
  providerMetadata?: ModelMetadata;
}

export interface ModelToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ModelUsage {
  inputTokens?: number;
  outputTokens?: number; // Includes reasoning; do not add reasoningTokens again.
  contextTokens?: number;
  cacheReadInputTokens?: number; // Already included in inputTokens when the provider reports both.
  cacheWriteInputTokens?: number;
  reasoningTokens?: number;
}

export type ModelFinishReason = 'stop' | 'tool-calls' | 'length' | 'content-filter' | 'other';
export type ModelStreamEvent =
  | { type: 'text-delta' | 'reasoning-delta'; id: string; text: string }
  | { type: 'text-end' | 'reasoning-end'; id: string; text?: string }
  | { type: 'tool-input-delta'; id: string; name: string; text: string }
  | { type: 'tool-call'; id: string; name: string; input: unknown; providerMetadata?: ModelMetadata }
  | { type: 'tool-input-error'; id: string; name: string; raw: string }
  | { type: 'finish'; reason: ModelFinishReason; usage?: ModelUsage; message: ModelMessage };

export interface ModelRequest {
  provider: AiProviderConfig;
  modelId: string;
  system: string;
  messages: ModelMessage[];
  maxOutputTokens: number;
  temperature?: number;
  tools?: ModelToolDefinition[];
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface WorkBuddyModelBridge {
  getAccount(): { accessToken?: string } | null | undefined;
  dispatchChat(body: unknown, options: { signal: AbortSignal }): Promise<AsyncIterable<Uint8Array | string>>;
}

export interface ModelTextResult {
  text: string;
  reason: ModelFinishReason;
  usage?: ModelUsage;
}

export interface ModelGatewayClient {
  stream(request: ModelRequest, workbuddy?: WorkBuddyModelBridge): AsyncIterable<ModelStreamEvent>;
  generateText(request: ModelRequest, workbuddy?: WorkBuddyModelBridge): Promise<ModelTextResult>;
  dispose?(): Promise<void>;
}
