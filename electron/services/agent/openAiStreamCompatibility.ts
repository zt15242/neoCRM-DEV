import type { HttpMiddleware } from '@opencode/ai/route';
import { Effect, Stream } from 'effect';
import { HttpClientResponse } from 'effect/http';
import { appendToolArguments } from '../toolCallArguments';

function normalizeDataLine(line: string, argumentsByCall: Map<string, string>): string {
  const match = /^(\s*data:\s*)(.*?)(\r?)$/.exec(line);
  if (!match || !match[2] || match[2] === '[DONE]') return line;
  let event: any;
  try { event = JSON.parse(match[2]); } catch { return line; }
  let changed = false;
  for (const choice of event?.choices || []) {
    for (const [position, call] of (choice?.delta?.tool_calls || []).entries()) {
      if (call?.function?.arguments === undefined) continue;
      const key = String(call.index ?? call.id ?? position);
      const previous = argumentsByCall.get(key) || '';
      const combined = appendToolArguments(previous, call.function.arguments);
      const delta = combined.startsWith(previous) ? combined.slice(previous.length)
        : typeof call.function.arguments === 'string' ? call.function.arguments : JSON.stringify(call.function.arguments);
      call.function.arguments = delta;
      argumentsByCall.set(key, combined);
      changed = true;
    }
  }
  return changed ? match[1] + JSON.stringify(event) + match[3] : line;
}

/** Normalize non-standard compatible gateways before the strict protocol decoder sees the stream. */
export const openAiStreamCompatibility: HttpMiddleware = (request, handler) =>
  Effect.gen(function* () {
    const response = yield* handler(request);
    if (response.status < 200 || response.status >= 300 || !/text\/event-stream/i.test(response.headers['content-type'] || '')) return response;
    const source = yield* Stream.toReadableStreamEffect(response.stream);
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const argumentsByCall = new Map<string, string>();
    let pending = '';
    const transformed = source.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        pending += decoder.decode(chunk, { stream: true });
        const lines = pending.split('\n');
        pending = lines.pop() || '';
        for (const line of lines) controller.enqueue(encoder.encode(normalizeDataLine(line, argumentsByCall) + '\n'));
        if (pending.length > 2 * 1024 * 1024) throw new Error('模型流单条事件超过 2 MB，已停止读取');
      },
      flush(controller) {
        pending += decoder.decode();
        if (pending) controller.enqueue(encoder.encode(normalizeDataLine(pending, argumentsByCall) + '\n\n'));
      },
    }));
    return HttpClientResponse.fromWeb(request, new Response(transformed, {
      status: response.status,
      headers: response.headers,
    }));
  });
