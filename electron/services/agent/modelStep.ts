import type { ModelGatewayClient, ModelMessage, ModelRequest, ModelStreamEvent, ModelUsage, WorkBuddyModelBridge } from './modelGatewayTypes';

export interface ModelStepToolCall {
  id: string;
  name: string;
  arguments: string;
  invalid?: string;
  providerMetadata?: Record<string, Record<string, unknown>>;
}

export interface ModelStepResult {
  content: string;
  reasoning: string;
  finishReason: 'stop' | 'tool-calls' | 'length' | 'content-filter' | 'other';
  usage?: ModelUsage;
  message: ModelMessage;
  toolCalls: ModelStepToolCall[];
}

export interface PartialModelStep {
  content: string;
  reasoning: string;
  hadToolInput: boolean;
}

export const partialModelStep = (error: unknown): PartialModelStep | undefined =>
  (error as { partialModelStep?: PartialModelStep })?.partialModelStep;

/** Collect one provider-neutral stream. It never executes tools or starts another model request. */
export async function runModelStep(input: {
  gateway: ModelGatewayClient;
  request: ModelRequest;
  workbuddy?: WorkBuddyModelBridge;
  onText?: (text: string) => void;
  onReasoning?: (text: string) => void;
}): Promise<ModelStepResult> {
  let content = '', reasoning = '';
  let hadToolInput = false;
  let finish: Extract<ModelStreamEvent, { type: 'finish' }> | undefined;
  const invalid = new Map<string, ModelStepToolCall>();
  const pending = new Map<string, { name: string; raw: string }>();
  try {
    for await (const event of input.gateway.stream(input.request, input.workbuddy)) {
      if (event.type === 'text-delta') { content += event.text; input.onText?.(event.text); }
      else if (event.type === 'reasoning-delta') { reasoning += event.text; input.onReasoning?.(event.text); }
      else if (event.type === 'tool-input-delta') {
        hadToolInput = true;
        const current = pending.get(event.id) || { name: event.name, raw: '' };
        current.name = event.name || current.name;
        current.raw += event.text;
        pending.set(event.id, current);
      }
      else if (event.type === 'tool-call') { hadToolInput = true; pending.delete(event.id); }
      else if (event.type === 'tool-input-error') {
        hadToolInput = true;
        pending.delete(event.id);
        invalid.set(event.id, { id: event.id, name: event.name, arguments: event.raw, invalid: `工具 ${event.name} 的参数不是完整 JSON` });
      } else if (event.type === 'finish') finish = event;
    }
  } catch (error) {
    Object.assign(error as object, { partialModelStep: { content, reasoning, hadToolInput } satisfies PartialModelStep });
    throw error;
  }
  if (!finish) throw Object.assign(new Error('模型流未返回完整结束事件'), {
    partialModelStep: { content, reasoning, hadToolInput } satisfies PartialModelStep,
  });
  const finalText = finish.message.parts.filter(part => part.type === 'text').map(part => part.text).join('');
  const finalReasoning = finish.message.parts.filter(part => part.type === 'reasoning').map(part => part.text).join('');
  // Some providers emit only authoritative end values. Emit the missing complete value once.
  if (!content && finalText) { content = finalText; input.onText?.(finalText); }
  if (!reasoning && finalReasoning) { reasoning = finalReasoning; input.onReasoning?.(finalReasoning); }
  const toolCalls = finish.message.parts.flatMap(part => part.type === 'tool-call' ? [{
    id: part.id, name: part.name, arguments: JSON.stringify(part.input === undefined ? {} : part.input), providerMetadata: part.providerMetadata,
  }] : []);
  return {
    content, reasoning, finishReason: finish.reason, usage: finish.usage, message: finish.message,
    toolCalls: [
      ...toolCalls,
      ...[...invalid.values()].filter(call => !toolCalls.some(complete => complete.id === call.id)),
      ...[...pending].filter(([id]) => !toolCalls.some(call => call.id === id) && !invalid.has(id)).map(([id, call]) => ({
        id, name: call.name, arguments: call.raw, invalid: `工具 ${call.name} 的参数在流结束时仍不完整`,
      })),
    ],
  };
}
