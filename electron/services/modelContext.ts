import type { AiChatMessage, AiCompactedSummary, AiModelItem, AiProviderConfig } from '../../shared/types';

export interface ModelContextBudget {
  contextWindow: number;
  maxOutputTokens: number;
  inputTokens: number;
  triggerTokens: number;
  targetTokens: number;
  capacityKnown: boolean;
}

export function positiveTokenLimit(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value !== 'number' && typeof value !== 'string') continue;
    const number = Number(value);
    if (Number.isFinite(number) && Math.floor(number) > 0) return Math.floor(number);
  }
}

/** The UI's explicit follow-up asks only for a report on completed work. */
export function isCompletedWorkSummaryRequest(text: string): boolean {
  const value = text.trim();
  return /^(?:请)?(?:结合|基于|根据)(?:上述|以上|已有)(?:工具)?(?:执行)?结果[，,\s]*(?:给出|提供|生成|撰写)(?:完整|详细|详尽|完整详尽|完整详细|全面|最终|分析|的|\s)*(?:总结|汇总|答复|报告|分析)/.test(value)
    && !/(?:创建|修改|写入|部署|上传|删除|运行|执行命令|调用工具)/.test(value);
}

export function readModelTokenLimits(item: any, configured?: AiModelItem): Pick<AiModelItem, 'contextWindow' | 'maxOutputTokens' | 'inputPricePerMillion' | 'outputPricePerMillion' | 'priceCurrency' | 'priceSource'> {
  if (configured?.tokenLimitsSource === 'user') return { contextWindow: configured.contextWindow, maxOutputTokens: configured.maxOutputTokens, inputPricePerMillion: configured.inputPricePerMillion, outputPricePerMillion: configured.outputPricePerMillion, priceCurrency: configured.priceCurrency, priceSource: configured.priceSource };
  return {
    inputPricePerMillion: configured?.inputPricePerMillion, outputPricePerMillion: configured?.outputPricePerMillion, priceCurrency: configured?.priceCurrency, priceSource: configured?.priceSource,
    contextWindow: positiveTokenLimit(item?.contextWindow, item?.context_window, item?.context_length,
      item?.contextLength, item?.max_context_length, item?.max_context_tokens, item?.maxInputTokens,
      item?.max_input_tokens, item?.inputTokenLimit, item?.top_provider?.context_length,
      item?.limits?.context_window, configured?.contextWindow),
    maxOutputTokens: positiveTokenLimit(item?.maxOutputTokens, item?.max_output_tokens,
      item?.max_completion_tokens, item?.outputTokenLimit, item?.top_provider?.max_completion_tokens,
      configured?.maxOutputTokens),
  };
}

export function getModelContextBudget(provider: AiProviderConfig, modelId: string, requestedOutput = 4096): ModelContextBudget {
  const model = provider.models?.find((item) => item.id === modelId);
  const known = positiveTokenLimit(model?.contextWindow);
  const contextWindow = known || 32768;
  const maxOutputTokens = Math.max(1, Math.min(positiveTokenLimit(requestedOutput) || 4096,
    positiveTokenLimit(model?.maxOutputTokens) || Infinity, Math.floor(contextWindow / 2)));
  const safety = Math.max(1, Math.min(8192, Math.ceil(contextWindow * 0.05)));
  const inputTokens = Math.max(1, contextWindow - maxOutputTokens - safety);
  return { contextWindow, maxOutputTokens, inputTokens, triggerTokens: Math.floor(inputTokens * 0.85),
    targetTokens: Math.floor(inputTokens * 0.65), capacityKnown: !!known };
}

// An estimate, not a tokenizer: conservatively count non-ASCII characters and JSON framing.
// Request-level accounting includes system instructions, attachments, tools and function arguments.
export function estimateContextTokens(value: unknown): number {
  let imageTokens = 0;
  const text = typeof value === 'string' ? value : JSON.stringify(value, (key, item) => {
    if (key === 'image_url' && typeof item?.url === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(item.url)) {
      imageTokens += 4096;
      return { ...item, url: '[image]' };
    }
    if ((key === 'inlineData' || key === 'inline_data') && typeof item?.data === 'string' && /^image\//.test(item.mimeType || item.mime_type || '')) {
      imageTokens += 4096;
      return { ...item, data: '[image]' };
    }
    return item;
  }) || '';
  let ascii = 0, other = 0;
  for (const character of text) {
    if (character.codePointAt(0)! < 128) ascii += 1;
    else other += 1;
  }
  return imageTokens + Math.ceil(ascii / 3 + other * 2);
}

export function uncompactedMessages(messages: AiChatMessage[], summary?: AiCompactedSummary): AiChatMessage[] {
  const count = summary?.summary ? summary.originalMessageCount : 0;
  return messages.slice(Math.max(0, Math.min(messages.length, count || 0)));
}

export function chooseCompactionCutoff(messages: AiChatMessage[], previousCount: number, targetTokens: number): number {
  let latestUser = messages.length - 1;
  while (latestUser >= 0 && messages[latestUser].role !== 'user') latestUser -= 1;
  if (latestUser <= previousCount) return previousCount;
  const turns = messages.map((message, index) => message.role === 'user' && index > previousCount && index <= latestUser ? index : -1)
    .filter((index) => index >= 0);
  for (const cutoff of turns) {
    if (estimateContextTokens(messages.slice(cutoff)) <= targetTokens) return cutoff;
  }
  return latestUser;
}

export function takeContextText(text: string, tokenBudget: number, format: (text: string) => unknown = (value) => value): { head: string; tail: string } {
  let low = 0, high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (estimateContextTokens(format(text.slice(0, middle))) <= tokenBudget) low = middle;
    else high = middle - 1;
  }
  if (!low && text) throw new Error('当前模型没有足够的输入空间生成上下文摘要，请检查模型容量或输出上限');
  return { head: text.slice(0, low), tail: text.slice(low) };
}

export function isContextLimitError(status: number, text: string): boolean {
  return [400, 413, 422].includes(status) && /context[_ -]?(?:length|window|limit)|maximum context|too many (?:input )?tokens|prompt (?:is )?too long|input.{0,30}(?:token.{0,20}(?:limit|exceed)|too long)|上下文.{0,12}(?:超|限制)/i.test(text);
}

export function reportedContextWindow(text: string): number | undefined {
  const match = text.match(/(?:maximum context length|context (?:window|limit)|max(?:imum)?[_ ]context[_ ](?:length|tokens))\D{0,20}([\d,]+)\s*(?:tokens)?/i);
  return match ? positiveTokenLimit(match[1].replace(/,/g, '')) : undefined;
}

export function pruneToolContent(content: string, tokenLimit: number): string {
  if (estimateContextTokens(content) <= tokenLimit) return content;
  const result = { _contextPruned: true, originalEstimatedTokens: estimateContextTokens(content), head: '', tail: '' };
  const allowance = Math.max(1, tokenLimit - estimateContextTokens(result) - 12);
  result.head = takeContextText(content, Math.max(1, Math.floor(allowance * 0.7))).head;
  const reversed = [...content].reverse().join('');
  result.tail = [...takeContextText(reversed, Math.max(1, Math.floor(allowance * 0.2))).head].reverse().join('');
  while (estimateContextTokens(result) > tokenLimit && (result.head || result.tail)) {
    result.head = result.head.slice(0, Math.floor(result.head.length / 2));
    result.tail = result.tail.slice(Math.ceil(result.tail.length / 2));
  }
  return JSON.stringify(result);
}

// Historical calls have already executed. Keep their identity and small location
// fields, but do not resend an entire old file or script as call arguments.
function compactCompletedArguments(args: unknown): Record<string, unknown> | undefined {
  let value: unknown = args;
  if (typeof args === 'string') {
    try { value = JSON.parse(args); } catch { return undefined; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || estimateContextTokens(value) <= 512) return undefined;
  const compact: Record<string, unknown> = { _contextPruned: true };
  for (const key of ['file_path', 'path', 'relative_path', 'name', 'command', 'job_id', 'pattern']) {
    const field = (value as Record<string, unknown>)[key];
    if (typeof field === 'string' && field.length <= 256) compact[key] = field;
  }
  return compact;
}

export function pruneToolMessages(messages: any[], tools: unknown, budget: ModelContextBudget, force = false): any[] {
  if (!force && estimateContextTokens({ messages, tools }) < budget.triggerTokens) return messages;
  const results = messages.filter((message) => message.role === 'tool' && typeof message.content === 'string');
  if (!results.length) return messages;
  const base = messages.map((message) => message.role === 'tool' ? { ...message, content: '' } : message);
  const available = Math.max(0, (force ? budget.targetTokens : budget.inputTokens * 0.80)
    - estimateContextTokens({ messages: base, tools }));
  const unit = Math.floor(available / (results.length + Math.min(2, results.length)));
  const hot = new Set(results.slice(-2));
  let projected = messages.map((message) => message.role === 'tool' && typeof message.content === 'string'
    ? { ...message, content: pruneToolContent(message.content, Math.max(128, unit * (hot.has(message) ? 2 : 1))) }
    : message);
  if (estimateContextTokens({ messages: projected, tools }) <= (force ? budget.targetTokens : budget.inputTokens)) return projected;
  const completed = new Set(messages.filter(message => message.role === 'tool').map(message => message.tool_call_id));
  const calls = messages.flatMap(message => message.role === 'assistant' && Array.isArray(message.tool_calls) ? message.tool_calls : []);
  const recent = new Set(calls.slice(-2).map((call: any) => call.id));
  projected = projected.map(message => {
    if (message.role !== 'assistant' || !Array.isArray(message.tool_calls)) return message;
    let changed = false;
    const tool_calls = message.tool_calls.map((call: any) => {
      if (!completed.has(call.id) || recent.has(call.id)) return call;
      const compact = compactCompletedArguments(call.function?.arguments);
      if (!compact) return call;
      changed = true;
      return { ...call, function: { ...call.function, arguments: JSON.stringify(compact) } };
    });
    return changed ? { ...message, tool_calls } : message;
  });
  // Large completed writes can dominate even after older calls are compacted.
  // Only as a last resort, also shrink the newest completed arguments; the call
  // IDs, names, paths and matching results remain intact and no tool is rerun.
  if (estimateContextTokens({ messages: projected, tools }) > budget.inputTokens) {
    projected = projected.map(message => {
      if (message.role !== 'assistant' || !Array.isArray(message.tool_calls)) return message;
      return { ...message, tool_calls: message.tool_calls.map((call: any) => {
        if (!completed.has(call.id)) return call;
        const compact = compactCompletedArguments(call.function?.arguments);
        return compact ? { ...call, function: { ...call.function, arguments: JSON.stringify(compact) } } : call;
      }) };
    });
  }
  return projected;
}

export function pruneGeminiContents(contents: any[], system: unknown, tools: unknown, budget: ModelContextBudget, force = false): any[] {
  if (!force && estimateContextTokens({ contents, system, tools }) < budget.triggerTokens) return contents;
  const responses = contents.flatMap((message) => message.parts.filter((part: any) => part.functionResponse));
  if (!responses.length) return contents;
  const base = contents.map((message) => ({ ...message, parts: message.parts.map((part: any) => part.functionResponse
    ? { functionResponse: { name: part.functionResponse.name, response: {} } } : part) }));
  const available = Math.max(0, (force ? budget.targetTokens : budget.inputTokens * 0.8) - estimateContextTokens({ contents: base, system, tools }));
  const limit = Math.max(128, Math.floor(available / responses.length));
  let projected = contents.map((message) => ({ ...message, parts: message.parts.map((part: any) => {
    if (!part.functionResponse) return part;
    const response = part.functionResponse;
    const text = JSON.stringify(response.response);
    if (estimateContextTokens(text) <= limit) return part;
    return { ...part, functionResponse: { ...response, response: JSON.parse(pruneToolContent(text, limit)) } };
  }) }));
  if (estimateContextTokens({ contents: projected, system, tools }) <= (force ? budget.targetTokens : budget.inputTokens)) return projected;
  const callTurns = contents.map((message, index) => message.role === 'model' && message.parts.some((part: any) => part.functionCall) ? index : -1).filter(index => index >= 0);
  const callPositions = callTurns.flatMap(index => contents[index].parts.flatMap((part: any, partIndex: number) => part.functionCall ? [`${index}:${partIndex}`] : []));
  const recentCalls = new Set(callPositions.slice(-2));
  projected = projected.map((message, index) => {
    if (!callTurns.includes(index)) return message;
    const next = contents[index + 1];
    if (!next || next.role !== 'user') return message;
    const responses = next.parts.filter((part: any) => part.functionResponse).map((part: any) => part.functionResponse.name);
    const calls = message.parts.filter((part: any) => part.functionCall);
    if (!calls.length || calls.length !== responses.length || calls.some((part: any, i: number) => part.functionCall.name !== responses[i])) return message;
    return { ...message, parts: message.parts.map((part: any, partIndex: number) => {
      if (!part.functionCall || recentCalls.has(`${index}:${partIndex}`)) return part;
      const compact = compactCompletedArguments(part.functionCall.args);
      return compact ? { ...part, functionCall: { ...part.functionCall, args: compact } } : part;
    }) };
  });
  if (estimateContextTokens({ contents: projected, system, tools }) > budget.inputTokens) {
    projected = projected.map((message, index) => {
      if (!callTurns.includes(index)) return message;
      const next = contents[index + 1];
      if (!next || next.role !== 'user') return message;
      const responses = next.parts.filter((part: any) => part.functionResponse).map((part: any) => part.functionResponse.name);
      const calls = message.parts.filter((part: any) => part.functionCall);
      if (!calls.length || calls.length !== responses.length || calls.some((part: any, i: number) => part.functionCall.name !== responses[i])) return message;
      return { ...message, parts: message.parts.map((part: any) => {
        if (!part.functionCall) return part;
        const compact = compactCompletedArguments(part.functionCall.args);
        return compact ? { ...part, functionCall: { ...part.functionCall, args: compact } } : part;
      }) };
    });
  }
  return projected;
}

export function assertContextFits(messages: unknown, tools: unknown, budget: ModelContextBudget): void {
  const tokens = estimateContextTokens({ messages, tools });
  if (tokens > budget.inputTokens) {
    const capacityLabel = budget.capacityKnown ? '模型上下文' : '容量未知，保守上下文预算';
    throw new Error(`当前请求上下文估算约 ${tokens.toLocaleString()} tokens，超过当前模型可用输入预算 ${budget.inputTokens.toLocaleString()} tokens（${capacityLabel} ${budget.contextWindow.toLocaleString()}，已预留输出 ${budget.maxOutputTokens.toLocaleString()}）。请减少本次附件/工具内容，或在模型设置中核对容量、更换更大上下文模型。`);
  }
}
