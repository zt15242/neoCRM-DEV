import { appendToolArguments, parseToolArguments } from '../toolCallArguments';
import { ModelGatewayError } from './modelGatewayError';
import type { ModelMessage, ModelRequest, ModelStreamEvent, ModelUsage } from './modelGatewayTypes';

export function workBuddyRequest(request: ModelRequest) {
  const messages: unknown[] = request.system ? [{ role: 'system', content: request.system }] : [];
  for (const message of request.messages) {
    const text = message.parts.filter(part => part.type === 'text').map(part => part.text).join('');
    if (message.role === 'tool') {
      for (const part of message.parts) {
        if (part.type !== 'tool-result') throw new ModelGatewayError('configuration', '工具结果消息包含无效内容');
        messages.push({ role: 'tool', tool_call_id: part.id, content: typeof part.value === 'string' ? part.value : JSON.stringify(part.value) });
      }
    } else if (message.role === 'assistant') {
      const toolCalls = message.parts.filter(part => part.type === 'tool-call').map(part => ({
        id: part.id, type: 'function', function: { name: part.name, arguments: JSON.stringify(part.input) },
      }));
      messages.push({ role: 'assistant', content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
    } else {
      const content = message.parts.map(part => {
        if (part.type === 'text') return { type: 'text', text: part.text };
        if (part.type === 'image') return { type: 'image_url', image_url: { url: `data:${part.mediaType};base64,${part.data}` } };
        throw new ModelGatewayError('configuration', '用户消息包含无效内容');
      });
      messages.push({ role: 'user', content: content.every(part => part.type === 'text') ? text : content });
    }
  }
  return {
    model: request.modelId, messages, max_tokens: request.maxOutputTokens, stream: true,
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    ...(request.tools?.length ? { tools: request.tools.map(tool => ({ type: 'function', function: {
      name: tool.name, description: tool.description, parameters: tool.inputSchema,
    } })), tool_choice: 'auto' } : {}),
  };
}

/** WorkBuddy is a proprietary dispatcher, so only its SSE edge remains application-owned. */
export async function* readWorkBuddyStream(stream: AsyncIterable<Uint8Array | string>, signal?: AbortSignal): AsyncGenerator<ModelStreamEvent> {
  let pending = '', text = '', reasoning = '', finishReason = '';
  let done = false;
  let usage: ModelUsage | undefined;
  const decoder = new TextDecoder();
  const tools = new Map<number, { id: string; name: string; raw: string }>();
  const consume = (line: string): ModelStreamEvent[] => {
    if (!line.startsWith('data:')) return [];
    const raw = line.slice(5).trim();
    if (!raw) return [];
    if (raw === '[DONE]') { done = true; return []; }
    let event;
    try { event = JSON.parse(raw); }
    catch { throw new ModelGatewayError('invalid-response', '模型返回了无效的流式 JSON；工具未执行'); }
    if (event.error) throw new ModelGatewayError('invalid-response', '模型流返回错误；请检查服务状态');
    if (event.usage) {
      const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
      usage = { inputTokens: count(event.usage.prompt_tokens ?? event.usage.input_tokens), outputTokens: count(event.usage.completion_tokens ?? event.usage.output_tokens) };
    }
    const choice = event.choices?.[0];
    if (!choice) return [];
    if (choice.finish_reason) finishReason = choice.finish_reason;
    const delta = choice.delta || choice.message || {};
    const result: ModelStreamEvent[] = [];
    if (typeof delta.content === 'string') { text += delta.content; result.push({ type: 'text-delta', id: 'text', text: delta.content }); }
    if (typeof delta.reasoning_content === 'string') { reasoning += delta.reasoning_content; result.push({ type: 'reasoning-delta', id: 'reasoning', text: delta.reasoning_content }); }
    for (const call of delta.tool_calls || []) {
      const index = call.index ?? 0;
      const current = tools.get(index) || { id: call.id || `workbuddy_${index}`, name: '', raw: '' };
      if (call.id) current.id = call.id;
      if (call.function?.name) current.name = call.function.name;
      if (call.function?.arguments !== undefined) {
        current.raw = appendToolArguments(current.raw, call.function.arguments);
        result.push({ type: 'tool-input-delta', id: current.id, name: current.name, text: typeof call.function.arguments === 'string' ? call.function.arguments : JSON.stringify(call.function.arguments) });
      }
      tools.set(index, current);
    }
    return result;
  };
  reading: for await (const chunk of stream) {
    signal?.throwIfAborted();
    pending += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    const lines = pending.split('\n');
    pending = lines.pop() || '';
    for (const line of lines) {
      if (line.length > 1024 * 1024) throw new ModelGatewayError('invalid-response', '模型流单条事件过大，已停止读取');
      yield* consume(line.trim());
      if (done) { pending = ''; break reading; }
    }
    if (pending.length > 1024 * 1024) throw new ModelGatewayError('invalid-response', '模型流单条事件过大，已停止读取');
  }
  signal?.throwIfAborted();
  pending += decoder.decode();
  if (pending.trim()) yield* consume(pending.trim());
  if (!done && !finishReason) throw new ModelGatewayError('invalid-response', '模型流中断，未收到结束事件；工具未执行');
  const message: ModelMessage = { role: 'assistant', parts: [
    ...(reasoning ? [{ type: 'reasoning' as const, text: reasoning }] : []),
    ...(text ? [{ type: 'text' as const, text }] : []),
  ] };
  for (const call of tools.values()) {
    try {
      const input = parseToolArguments(call.name, call.raw);
      message.parts.push({ type: 'tool-call', id: call.id, name: call.name, input });
      yield { type: 'tool-call', id: call.id, name: call.name, input };
    } catch { yield { type: 'tool-input-error', id: call.id, name: call.name, raw: call.raw }; }
  }
  yield { type: 'finish', reason: finishReason === 'length' ? 'length' : finishReason === 'content_filter' ? 'content-filter' : tools.size ? 'tool-calls' : 'stop', usage, message };
}
