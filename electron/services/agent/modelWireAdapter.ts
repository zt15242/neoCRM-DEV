import type { ModelMessage, ModelToolDefinition } from './modelGatewayTypes';

type WireMessage = {
  role: string;
  content?: unknown;
  reasoning?: string;
  textProviderMetadata?: Record<string, Record<string, unknown>>;
  reasoningProviderMetadata?: Record<string, Record<string, unknown>>;
  providerMetadata?: Record<string, Record<string, unknown>>;
  tool_calls?: Array<{
    id?: string;
    function?: { name?: string; arguments?: string | Record<string, unknown> };
    providerMetadata?: Record<string, Record<string, unknown>>;
  }>;
  tool_call_id?: string;
  name?: string;
  is_error?: boolean;
};

const parseDataUrl = (value: string) => {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(value);
  return match ? { mediaType: match[1], data: match[2].replace(/\s/g, '') } : undefined;
};

const parseValue = (value: unknown) => {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
};

/** Convert the existing persisted/wire history without exposing SDK types to AiService. */
export function modelMessagesFromWire(input: WireMessage[]): { system: string; messages: ModelMessage[] } {
  const system: string[] = [];
  const messages: ModelMessage[] = [];
  const callNames = new Map<string, string>();
  for (const [messageIndex, message] of input.entries()) {
    if (message.role === 'system') {
      if (typeof message.content === 'string' && message.content) system.push(message.content);
      continue;
    }
    if (message.role === 'user') {
      const values = Array.isArray(message.content) ? message.content : [{ type: 'text', text: String(message.content ?? '') }];
      const parts: ModelMessage['parts'] = [];
      for (const part of values) {
        if (part?.type === 'text' && typeof part.text === 'string') { parts.push({ type: 'text', text: part.text }); continue; }
        if (part?.type === 'image_url' && typeof part.image_url?.url === 'string') {
          const image = parseDataUrl(part.image_url.url);
          if (!image) throw new Error('模型历史包含非内联图片地址，请重新添加本地图片');
          parts.push({ type: 'image', ...image });
        }
      }
      messages.push({ role: 'user', parts });
      continue;
    }
    if (message.role === 'assistant') {
      const parts: ModelMessage['parts'] = [];
      if (message.reasoning) parts.push({ type: 'reasoning', text: message.reasoning, providerMetadata: message.reasoningProviderMetadata });
      const text = Array.isArray(message.content)
        ? message.content.filter((part: any) => part?.type === 'text').map((part: any) => part.text).join('')
        : typeof message.content === 'string' ? message.content : '';
      if (text) parts.push({ type: 'text', text, providerMetadata: message.textProviderMetadata });
      for (const [callIndex, call] of (message.tool_calls || []).entries()) {
        const id = call.id || `history_${messageIndex}_${callIndex}`;
        const name = call.function?.name || 'unknown_tool';
        const raw = call.function?.arguments ?? {};
        let parsed: unknown;
        try { parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw; }
        catch { parsed = { _invalidToolArguments: true, raw: String(raw) }; }
        callNames.set(id, name);
        parts.push({ type: 'tool-call', id, name, input: parsed, providerMetadata: call.providerMetadata });
      }
      messages.push({ role: 'assistant', parts, providerMetadata: message.providerMetadata });
      continue;
    }
    if (message.role === 'tool') {
      const id = message.tool_call_id || `history_result_${messageIndex}`;
      messages.push({ role: 'tool', parts: [{
        type: 'tool-result', id, name: message.name || callNames.get(id) || 'unknown_tool',
        value: parseValue(message.content), isError: message.is_error,
      }] });
    }
  }
  return { system: system.join('\n\n'), messages };
}

export function modelToolsFromWire(tools: any[]): ModelToolDefinition[] {
  return tools.flatMap(tool => tool?.type === 'function' && tool.function?.name ? [{
    name: tool.function.name,
    description: tool.function.description || '',
    inputSchema: tool.function.parameters && typeof tool.function.parameters === 'object'
      ? tool.function.parameters : { type: 'object', properties: {} },
  }] : []);
}

