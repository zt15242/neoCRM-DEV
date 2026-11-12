// Small real-wire fixtures shared by model gateway and existing business regression tests.
export function modelTextFrames(transport, text, reason = 'stop', inputTokens = 20, outputTokens = 10) {
  if (transport === 'gemini') return [{ candidates: [{ index: 0, content: { role: 'model', parts: [{ text }] }, finishReason: reason === 'length' ? 'MAX_TOKENS' : 'STOP' }],
    usageMetadata: { promptTokenCount: inputTokens, candidatesTokenCount: outputTokens, totalTokenCount: inputTokens + outputTokens } }];
  if (transport === 'anthropic') return [
    { type: 'message_start', message: { id: 'msg_fixture', type: 'message', role: 'assistant', model: 'fixture', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: inputTokens, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: reason === 'length' ? 'max_tokens' : 'end_turn', stop_sequence: null }, usage: { output_tokens: outputTokens } },
    { type: 'message_stop' },
  ];
  if (transport === 'responses') {
    const item = { id: 'item_fixture', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] };
    return [
      { type: 'response.created', response: { id: 'resp_fixture', model: 'fixture', status: 'in_progress', output: [] } },
      { type: 'response.output_item.added', output_index: 0, item: { ...item, status: 'in_progress', content: [] } },
      { type: 'response.content_part.added', item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
      { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: text },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: reason === 'length' ? 'response.incomplete' : 'response.completed', response: {
        id: 'resp_fixture', model: 'fixture', status: reason === 'length' ? 'incomplete' : 'completed', output: [item],
        ...(reason === 'length' ? { incomplete_details: { reason: 'max_output_tokens' } } : {}),
        usage: { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
      } },
    ];
  }
  return [{ id: 'chat_fixture', object: 'chat.completion.chunk', model: 'fixture', created: 1,
    choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: reason }],
    usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens } }];
}

export function sseFrames(frames) { return frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join(''); }

export function sendModelText(response, transport, text, reason = 'stop') {
  response.setHeader('content-type', 'text/event-stream');
  response.end(sseFrames(modelTextFrames(transport, text, reason)));
}

export function modelToolFrames(transport, name, input, id = 'call_fixture') {
  const raw = typeof input === 'string' ? input : JSON.stringify(input);
  if (transport === 'gemini') return [{ candidates: [{ index: 0, content: {
    role: 'model', parts: [{ functionCall: { id, name, args: typeof input === 'string' ? JSON.parse(input) : input } }],
  }, finishReason: 'STOP' }] }];
  if (transport === 'anthropic') return [
    { type: 'message_start', message: { id: 'msg_fixture', type: 'message', role: 'assistant', model: 'fixture', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 20, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id, name, input: {} } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: raw } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 10 } },
    { type: 'message_stop' },
  ];
  if (transport === 'responses') {
    const item = { type: 'function_call', id: `item_${id}`, call_id: id, name, arguments: raw, status: 'completed' };
    return [
      { type: 'response.created', response: { id: 'resp_fixture', model: 'fixture', output: [], status: 'in_progress' } },
      { type: 'response.output_item.added', output_index: 0, item: { ...item, arguments: '', status: 'in_progress' } },
      { type: 'response.function_call_arguments.delta', item_id: item.id, output_index: 0, delta: raw },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: { id: 'resp_fixture', model: 'fixture', status: 'completed', output: [item] } },
    ];
  }
  return [{ choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: raw } }] }, finish_reason: 'tool_calls' }] }];
}
