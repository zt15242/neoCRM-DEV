import type { ContentPart, LLMEvent, LLMRequestInput, LanguageModel, Message as SdkMessage, Usage } from '@opencode/ai';
import { resolveModelEndpoints, type ModelTransport } from './modelEndpoint';
import { ModelGatewayError, modelGatewayError } from './modelGatewayError';
import type { ModelFinishReason, ModelMessage, ModelPart, ModelRequest, ModelStreamEvent, ModelTextResult, ModelUsage, WorkBuddyModelBridge } from './modelGatewayTypes';
import { readWorkBuddyStream, workBuddyRequest } from './workBuddyModelStream';
import { setTimeout, clearTimeout } from 'node:timers';
import { openAiStreamCompatibility } from './openAiStreamCompatibility';

// Load only on first use. Neither the UI nor Electron startup loads the model SDK.
const loadSdk = () => import('@opencode/ai');
const loadRoute = () => import('@opencode/ai/route');
type Sdk = Awaited<ReturnType<typeof loadSdk>>;
type Client = ReturnType<Sdk['make']>;

function usageOf(usage?: Usage): ModelUsage | undefined {
  if (!usage) return undefined;
  const count = (value?: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
  return {
    inputTokens: count(usage.inputTokens), outputTokens: count(usage.outputTokens), contextTokens: count(usage.contextTokens),
    cacheReadInputTokens: count(usage.cacheReadInputTokens), cacheWriteInputTokens: count(usage.cacheWriteInputTokens),
    reasoningTokens: count(usage.reasoningTokens),
  };
}

function finishOf(reason: string): ModelFinishReason {
  return ['stop', 'tool-calls', 'length', 'content-filter'].includes(reason) ? reason as ModelFinishReason : 'other';
}

const normalizeToolInput = (input: unknown) => {
  if (typeof input !== 'string') return input;
  try { return JSON.parse(input); } catch { return input; }
};

function outputMessage(message: SdkMessage | undefined): ModelMessage {
  if (!message || message.role !== 'assistant') return { role: 'assistant', parts: [] };
  const parts: ModelPart[] = message.content.map(part => {
    switch (part.type) {
      case 'text': case 'reasoning': return { type: part.type, text: part.text, providerMetadata: part.providerMetadata };
      case 'tool-call':
        if (part.providerExecuted) throw new ModelGatewayError('invalid-response', '当前运行时不支持模型服务代执行的工具');
        return { type: 'tool-call', id: part.id, name: part.namespace ? `${part.namespace}.${part.name}` : part.name, input: normalizeToolInput(part.input), providerMetadata: part.providerMetadata };
      case 'tool-result': return { type: 'tool-result', id: part.id, name: part.name, value: part.result.value, isError: part.result.type === 'error' };
      default: throw new ModelGatewayError('invalid-response', '模型返回了当前文本运行时不支持的内容类型');
    }
  });
  return { role: 'assistant', parts, providerMetadata: message.providerMetadata };
}

function inputMessages(sdk: Sdk, messages: ModelMessage[]): SdkMessage[] {
  return messages.map(message => {
    const content: ContentPart[] = message.parts.map(part => {
      if (part.type === 'image') {
        if (!/^image\//i.test(part.mediaType)) throw new ModelGatewayError('configuration', '图片输入需要有效的 image MIME 类型');
        return sdk.Message.media(new URL(`data:${part.mediaType};base64,${part.data}`));
      }
      if (part.type === 'tool-result') return {
        type: 'tool-result', id: part.id, name: part.name,
        result: { type: part.isError ? 'error' : typeof part.value === 'string' ? 'text' : 'json', value: part.value },
      };
      return part;
    });
    return sdk.Message.make({ role: message.role, content, providerMetadata: message.providerMetadata } as SdkMessage);
  });
}

type Compatibility = { streamUsage: boolean; legacyMaxTokens: boolean };

// Negotiate only an explicitly rejected optional field, before any output or tools exist.
function rejectedOption(error: unknown): keyof Compatibility | undefined {
  const source = error as { status?: number; reason?: { body?: string } };
  if (source?.status !== 400 && source?.status !== 422) return;
  const text = source?.reason?.body || '';
  if (!/unsupported|not support|unknown|invalid|unexpected|unrecognized|not permitted|not allowed|不支持|未知|无效/i.test(text)) return;
  if (/stream_options|include_usage/i.test(text)) return 'streamUsage';
  if (/max_completion_tokens/i.test(text)) return 'legacyMaxTokens';
}

async function requestModel(sdk: Sdk, transport: ModelTransport, endpoint: string, request: ModelRequest, compatibility: Compatibility): Promise<LanguageModel> {
  const url = new URL(endpoint);
  const config = { baseURL: url.origin, apiKey: request.provider.apiKey?.trim() || false as const };
  const model: LanguageModel = transport === 'gemini' ? (await import('@opencode/ai/providers/google')).configure(config).model(request.modelId.replace(/^models\//, ''))
    : transport === 'anthropic' ? (await import('@opencode/ai/providers/anthropic')).configure(config).model(request.modelId)
    : transport === 'responses' ? (await import('@opencode/ai/providers/openai-compatible/responses')).configure(config).model(request.modelId)
    : (await import('@opencode/ai/providers/openai-compatible')).configure(config).model(request.modelId);
  // Override the route after selecting the protocol. This avoids double suffixes and preserves URL query auth.
  return sdk.LanguageModel.update(model, { route: model.route.with({
    endpoint: { baseURL: url.origin, path: url.pathname + url.search },
  }), ...(transport === 'chat' ? {
    capabilities: { ...model.capabilities, streamUsage: compatibility.streamUsage },
    ...(compatibility.legacyMaxTokens ? { compatibility: { ...model.compatibility, maxTokensField: 'max_tokens' as const } } : {}),
  } : {}) });
}

function validate(request: ModelRequest): void {
  if (!request.modelId.trim()) throw new ModelGatewayError('configuration', '请先配置可用模型');
  if (!Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens <= 0) throw new ModelGatewayError('configuration', '模型输出上限必须是正整数');
  if (request.timeoutMs !== undefined && (!Number.isSafeInteger(request.timeoutMs) || request.timeoutMs <= 0)) throw new ModelGatewayError('configuration', '模型请求超时必须是正整数');
  for (const message of request.messages) {
    const permitted = message.role === 'user' ? ['text', 'image'] : message.role === 'tool' ? ['tool-result'] : ['text', 'reasoning', 'tool-call'];
    if (message.parts.some(part => !permitted.includes(part.type))) throw new ModelGatewayError('configuration', '消息角色与内容类型不匹配');
  }
  if (request.provider.id !== 'workbuddy' && !request.provider.apiKey?.trim() && request.provider.id !== 'ollama'
    && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(request.provider.baseUrl)) {
    throw new ModelGatewayError('configuration', `供应商 ${request.provider.name} 尚未配置 API Key`);
  }
}

function requestScope(request: ModelRequest) {
  request.signal?.throwIfAborted();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException('模型请求超时，请稍后重试或检查网络与服务状态', 'TimeoutError')), request.timeoutMs ?? 180000);
  timeout.unref?.();
  return {
    signal: request.signal ? AbortSignal.any([request.signal, controller.signal]) : controller.signal,
    close: () => { clearTimeout(timeout); controller.abort(); },
  };
}

function checkCancellation(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason;
}

/** One provider request at a time. Tool execution, context recovery and retry budgets belong to AgentRunner. */
export class ModelGateway {
  private runtime?: Promise<{ sdk: Sdk; client: Client }>;

  private getRuntime() {
    return this.runtime ??= loadSdk().then(sdk => ({ sdk, client: sdk.make() })).catch(error => {
      this.runtime = undefined;
      throw error;
    });
  }

  public async dispose(): Promise<void> {
    const runtime = this.runtime;
    this.runtime = undefined;
    if (runtime) await (await runtime).client.dispose();
  }

  private async prepare(request: ModelRequest, transport: ModelTransport, endpoint: string, compatibility: Compatibility) {
    const { sdk, client } = await this.getRuntime();
    const input: LLMRequestInput = {
      model: await requestModel(sdk, transport, endpoint, request, compatibility),
      system: request.system, messages: inputMessages(sdk, request.messages),
      maxTokens: request.maxOutputTokens, temperature: request.temperature,
      tools: request.tools?.map(tool => ({ ...tool, inputSchema: tool.inputSchema })),
    };
    return { client, input };
  }

  public async generateText(request: ModelRequest, workbuddy?: WorkBuddyModelBridge): Promise<ModelTextResult> {
    let final: Extract<ModelStreamEvent, { type: 'finish' }> | undefined;
    for await (const event of this.stream(request, workbuddy)) if (event.type === 'finish') final = event;
    if (!final) throw new ModelGatewayError('invalid-response', '模型流未完整结束');
    if (final.reason === 'tool-calls') throw new ModelGatewayError('invalid-response', '文本请求意外返回工具调用，操作未执行');
    return { text: final.message.parts.filter(part => part.type === 'text').map(part => part.text).join(''), reason: final.reason, usage: final.usage };
  }

  public async *stream(request: ModelRequest, workbuddy?: WorkBuddyModelBridge): AsyncGenerator<ModelStreamEvent> {
    validate(request);
    const scope = requestScope(request);
    try {
      if (request.provider.id === 'workbuddy') {
        yield* this.workbuddyStream(request, scope.signal, workbuddy);
        return;
      }
      const { transport, endpoints } = resolveModelEndpoints(request.provider, request.modelId, true);
      const compatibility: Compatibility = { streamUsage: true, legacyMaxTokens: false };
      for (const [index, endpoint] of endpoints.entries()) {
        for (let variant = 0; variant < 3; variant++) {
          let published = false;
          let finished = false;
          try {
            const { client, input } = await this.prepare(request, transport, endpoint, compatibility);
            checkCancellation(scope.signal);
            const { RequestExecutor } = await loadRoute();
            for await (const event of client.stream(input, {
              signal: scope.signal,
              // Resolve fetch for every request so test recorders and future proxy hooks do not require rebuilding the runtime.
              http: RequestExecutor.withFetch(globalThis.fetch, openAiStreamCompatibility),
            })) {
              checkCancellation(scope.signal);
              const normalized = this.event(event);
              if (normalized) {
                published = true;
                if (normalized.type === 'finish') finished = true;
                yield normalized;
              }
            }
            if (!finished) throw new ModelGatewayError('incomplete-stream', '模型流中断，未收到完整结束事件；工具未自动执行');
            return;
          } catch (error) {
            checkCancellation(scope.signal);
            const option = !published && transport === 'chat' ? rejectedOption(error) : undefined;
            if (option === 'streamUsage' && compatibility.streamUsage) { compatibility.streamUsage = false; continue; }
            if (option === 'legacyMaxTokens' && !compatibility.legacyMaxTokens) { compatibility.legacyMaxTokens = true; continue; }
            const failure = error instanceof ModelGatewayError ? error : modelGatewayError(error, request.provider, request.modelId, endpoint);
            if (!published && failure.kind === 'endpoint-not-found' && index + 1 < endpoints.length) break;
            throw failure;
          }
        }
      }
    } finally { scope.close(); }
  }

  private event(event: LLMEvent): ModelStreamEvent | undefined {
    switch (event.type) {
      case 'text-delta': case 'reasoning-delta': return { type: event.type, id: event.id, text: event.text };
      case 'text-end': case 'reasoning-end': return { type: event.type, id: event.id, text: event.text };
      case 'tool-input-delta': return { type: event.type, id: event.id, name: event.name, text: event.text };
      case 'tool-call':
        if (event.providerExecuted) throw new ModelGatewayError('invalid-response', '当前运行时不支持模型服务代执行的工具');
        return { type: event.type, id: event.id, name: event.namespace ? `${event.namespace}.${event.name}` : event.name, input: normalizeToolInput(event.input), providerMetadata: event.providerMetadata };
      case 'tool-input-error': return { type: event.type, id: event.id, name: event.name, raw: event.raw };
      case 'finish': return { type: 'finish', reason: finishOf(event.reason.normalized), usage: usageOf(event.usage), message: outputMessage(event.message) };
    }
  }

  private async *workbuddyStream(request: ModelRequest, signal: AbortSignal, bridge?: WorkBuddyModelBridge): AsyncGenerator<ModelStreamEvent> {
    if (!bridge?.getAccount()?.accessToken) throw new ModelGatewayError('configuration', 'WorkBuddy 尚未登录，请在模型设置中扫码登录');
    try {
      const stream = await bridge.dispatchChat(workBuddyRequest(request), { signal });
      yield* readWorkBuddyStream(stream, signal);
    } catch (error) {
      checkCancellation(signal);
      if (error instanceof ModelGatewayError) throw error;
      throw modelGatewayError(error, request.provider, request.modelId);
    }
  }
}

export const modelGateway = new ModelGateway();
