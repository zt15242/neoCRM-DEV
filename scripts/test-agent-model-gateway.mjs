import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { modelTextFrames, sendModelText, sseFrames } from './fixtures/model-gateway-responses.mjs';

const require = createRequire(import.meta.url);
const bundle = await build({ entryPoints: ['electron/services/agent/modelGateway.ts'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false });
const subject = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, subject, subject.exports);
const { ModelGateway } = subject.exports;
const gateway = new ModelGateway();
const requests = [];
const errors = [];
let scenario = 'text';
let closedRequests = 0;
const toolName = 'skill';
const toolInput = { name: 'neo-page-code-management' };

function toolFrames(transport) {
  const raw = scenario === 'invalid-json' ? '{"name":' : JSON.stringify(toolInput);
  if (transport === 'gemini') return [{ candidates: [{ index: 0, content: { role: 'model', parts: [{
    functionCall: { name: toolName, args: toolInput }, thoughtSignature: 'fixture-signature',
  }] }, finishReason: 'STOP' }] }];
  if (transport === 'anthropic') {
    const text = modelTextFrames('anthropic', '');
    return [text[0],
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'call_fixture', name: toolName, input: {} } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: raw.slice(0, 5) } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: raw.slice(5) } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 10 } }, text.at(-1)];
  }
  if (transport === 'responses') {
    const item = { type: 'function_call', id: 'item_call', call_id: 'call_fixture', name: toolName, arguments: raw, status: 'completed' };
    return [
      { type: 'response.created', response: { id: 'resp_fixture', model: 'fixture', output: [], status: 'in_progress' } },
      { type: 'response.output_item.added', output_index: 0, item: { ...item, arguments: '', status: 'in_progress' } },
      { type: 'response.function_call_arguments.delta', item_id: item.id, output_index: 0, delta: raw.slice(0, 5) },
      { type: 'response.function_call_arguments.delta', item_id: item.id, output_index: 0, delta: raw.slice(5) },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response: { id: 'resp_fixture', model: 'fixture', status: 'completed', output: [item] } },
    ];
  }
  return [
    { choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call_fixture', type: 'function', function: { name: toolName, arguments: raw.slice(0, 5) } }] }, finish_reason: null }] },
    { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: raw.slice(5) } }] }, finish_reason: 'tool_calls' }] },
  ];
}

const server = http.createServer((req, res) => {
  void (async () => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const transport = pathname.endsWith('/responses') ? 'responses' : pathname.endsWith('/messages') ? 'anthropic' : pathname.includes(':streamGenerateContent') ? 'gemini' : 'chat';
    requests.push({ url: req.url, headers: req.headers, body, transport });
    if (scenario === 'slow') { res.on('close', () => closedRequests++); return; }
    if (scenario === 'negotiate' && (body.stream_options || body.max_completion_tokens)) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: { message: `unsupported ${body.stream_options ? 'stream_options include_usage' : 'max_completion_tokens'}` } }));
      return;
    }
    if (scenario === 'error' || scenario === 'route-fallback' && !pathname.includes('/gateway/v1/')) {
      res.statusCode = scenario === 'error' ? 400 : 404;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(scenario === 'error'
        ? { error: { code: 'context_length_exceeded', message: 'maximum context length exceeded secret-key secret-query private-transcript' } }
        : { error: { message: 'Cannot POST' } }));
      return;
    }
    if (scenario === 'tools' || scenario === 'invalid-json') {
      res.setHeader('content-type', 'text/event-stream');
      const bytes = Buffer.from(sseFrames(toolFrames(transport)));
      for (let offset = 0; offset < bytes.length; offset += 7) {
        res.write(bytes.subarray(offset, offset + 7));
        await new Promise(resolve => setImmediate(resolve));
      }
      res.end();
      return;
    }
    if (scenario === 'stream-drop') {
      res.setHeader('content-type', 'text/event-stream');
      res.write(sseFrames([{ choices: [{ index: 0, delta: { content: 'partial' }, finish_reason: null }] }]));
      setTimeout(() => res.destroy(), 20);
      return;
    }
    if (scenario === 'usage') {
      const frames = modelTextFrames(transport, '用量');
      if (transport === 'chat') frames[0].usage = { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30, prompt_tokens_details: { cached_tokens: 5 }, completion_tokens_details: { reasoning_tokens: 3 } };
      if (transport === 'gemini') frames[0].usageMetadata = { promptTokenCount: 20, candidatesTokenCount: 10, thoughtsTokenCount: 3, cachedContentTokenCount: 5, totalTokenCount: 33 };
      if (transport === 'anthropic') frames[0].message.usage = { input_tokens: 15, cache_read_input_tokens: 5, output_tokens: 0 };
      res.setHeader('content-type', 'text/event-stream');
      res.end(sseFrames(frames));
      return;
    }
    sendModelText(res, transport, '模型公共入口通过', scenario === 'length' ? 'length' : 'stop');
  })().catch(error => { errors.push(error); res.destroy(error); });
});

const protocols = [
  ['openai-completions', 'chat', '/v1/chat/completions'],
  ['openai-responses', 'responses', '/v1/responses'],
  ['anthropic-messages', 'anthropic', '/v1/messages'],
  ['google-gemini', 'gemini', '/v1beta/models/fixture:streamGenerateContent?alt=sse'],
];

try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const makeRequest = (protocol = 'openai-completions') => ({
    provider: { id: 'fixture', name: 'Fixture', protocol, baseUrl: origin, apiKey: 'secret-key', models: [], enabled: true, type: 'custom' },
    modelId: 'fixture', system: '测试规范', messages: [{ role: 'user', parts: [{ type: 'text', text: 'private-transcript' }] }], maxOutputTokens: 100,
  });
  const collect = async request => { const events = []; for await (const event of gateway.stream(request)) events.push(event); return events; };
  for (const [protocol, transport, endpoint] of protocols) {
    const request = makeRequest(protocol);
    scenario = 'text';
    const text = await gateway.generateText(request);
    assert.equal(text.text, '模型公共入口通过');
    assert.equal(requests.at(-1).url, endpoint);
    assert.equal(requests.at(-1).transport, transport);
    const auth = requests.at(-1).headers;
    assert.equal(transport === 'gemini' ? auth['x-goog-api-key'] : transport === 'anthropic' ? auth['x-api-key'] : auth.authorization, transport === 'chat' || transport === 'responses' ? 'Bearer secret-key' : 'secret-key');
    assert.equal(transport === 'gemini' || transport === 'anthropic' ? auth.authorization : undefined, undefined);
    const events = await collect(request);
    assert.equal(events.filter(event => event.type === 'text-delta').map(event => event.text).join(''), '模型公共入口通过');
    assert.equal(events.filter(event => event.type === 'finish').length, 1);

    scenario = 'tools';
    request.tools = [{ name: toolName, description: 'Read skill instructions', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } }];
    const calls = await collect(request);
    const completed = calls.filter(event => event.type === 'tool-call');
    assert.equal(completed.length, 1, protocol);
    assert.deepEqual(completed[0].input, toolInput);
    const final = calls.at(-1);
    assert.equal(final.type, 'finish');
    assert.equal(final.reason, 'tool-calls');
    const before = requests.length;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests.length, before, 'The gateway does not execute tools or schedule another request');
    scenario = 'text';
    await collect({ ...request, messages: [...request.messages, final.message, { role: 'tool', parts: [{ type: 'tool-result', id: completed[0].id, name: toolName, value: { instruction: 'loaded' } }] }] });
    const continuation = requests.at(-1).body;
    if (transport === 'gemini') {
      assert.ok(JSON.stringify(continuation).includes('fixture-signature'), 'Thought signatures survive the gateway round trip');
      assert.ok(JSON.stringify(continuation).includes('functionResponse'));
    } else assert.ok(JSON.stringify(continuation).includes(transport === 'responses' ? 'function_call_output' : transport === 'anthropic' ? 'tool_result' : 'tool_call_id'));

    scenario = 'invalid-json';
    if (transport !== 'gemini') {
      const invalid = await collect(request);
      assert.equal(invalid.filter(event => event.type === 'tool-call').length, 0);
      assert.equal(invalid.filter(event => event.type === 'tool-input-error').length, 1);
    }

    scenario = 'usage';
    const result = await gateway.generateText({ ...request, tools: undefined });
    assert.equal(result.usage.inputTokens, 20, `${protocol}: cached input must not be counted twice`);
    assert.equal(result.usage.outputTokens, transport === 'gemini' ? 13 : 10);
    if (transport === 'chat' || transport === 'gemini') assert.equal(result.usage.cacheReadInputTokens, 5);
    scenario = 'length';
    assert.equal((await gateway.generateText({ ...request, tools: undefined })).reason, 'length');
  }
  console.log('PASS: four protocols, shared tool contract, fragmented arguments, signatures, continuation, usage and output limits');

  scenario = 'text';
  await gateway.generateText({ ...makeRequest(), provider: { ...makeRequest().provider, baseUrl: origin + '/v1?tenant=a&tenant=b' } });
  assert.equal(requests.at(-1).url, '/v1/chat/completions?tenant=a&tenant=b', 'Repeated query parameters are preserved');
  const image = { type: 'image', mediaType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=' };
  for (const [protocol] of protocols) {
    await collect({ ...makeRequest(protocol), messages: [{ role: 'user', parts: [{ type: 'text', text: '图片' }, image] }] });
    assert.ok(JSON.stringify(requests.at(-1).body).includes(image.data));
  }
  console.log('PASS: image bytes reach all four protocols');

  scenario = 'negotiate';
  const negotiationStart = requests.length;
  assert.equal((await gateway.generateText(makeRequest())).text, '模型公共入口通过');
  const negotiated = requests.slice(negotiationStart);
  assert.equal(negotiated.length, 3, 'At most one negotiation per optional field');
  assert.equal(negotiated[0].body.stream_options.include_usage, true);
  assert.equal(negotiated[1].body.stream_options, undefined);
  assert.equal(negotiated[2].body.max_tokens, 100);
  console.log('PASS: explicit usage/max-token compatibility negotiation without tools or hidden retries');

  scenario = 'error';
  const before = requests.length;
  await assert.rejects(gateway.generateText({ ...makeRequest(), provider: { ...makeRequest().provider, baseUrl: origin + '/v1?access_token=secret-query' } }), error => {
    assert.equal(error.kind, 'context-overflow');
    assert.equal(error.status, 400);
    for (const secret of ['secret-key', 'secret-query', 'private-transcript', 'access_token']) assert.ok(!JSON.stringify({ ...error, message: error.message }).includes(secret));
    assert.equal(error.cause, undefined);
    return true;
  });
  assert.equal(requests.length, before + 1, 'Overflow is never retried inside the adapter');
  scenario = 'route-fallback';
  const routeStart = requests.length;
  await gateway.generateText({ ...makeRequest(), provider: { ...makeRequest().provider, baseUrl: origin + '/gateway?access_token=secret-query' } });
  assert.deepEqual(requests.slice(routeStart).map(request => request.url), ['/gateway/chat/completions?access_token=secret-query', '/gateway/v1/chat/completions?access_token=secret-query']);
  scenario = 'stream-drop';
  const broken = [];
  await assert.rejects(async () => { for await (const event of gateway.stream(makeRequest())) broken.push(event); });
  assert.equal(broken.filter(event => event.type === 'finish').length, 0);
  console.log('PASS: structured overflow, credential redaction, bounded route fallback and interrupted stream');

  scenario = 'slow';
  const controller = new AbortController();
  const pendingStart = requests.length;
  const aborted = collect({ ...makeRequest(), signal: controller.signal });
  while (requests.length === pendingStart) await new Promise(resolve => setImmediate(resolve));
  setTimeout(() => controller.abort(), 25);
  await assert.rejects(aborted, error => error.name === 'AbortError');
  await assert.rejects(gateway.generateText({ ...makeRequest(), timeoutMs: 25 }), error => error.name === 'TimeoutError');
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.ok(closedRequests >= 2, 'Abort and timeout release the HTTP connection');
  console.log('PASS: caller cancellation and timeout close active requests');

  const workbuddy = { ...makeRequest(), provider: { ...makeRequest().provider, id: 'workbuddy', apiKey: '' } };
  let wbSignal;
  const bridge = { getAccount: () => ({ accessToken: 'private-access-token' }), dispatchChat: async (body, { signal }) => {
    assert.equal(body.messages[0].role, 'system');
    assert.equal(body.max_tokens, 100);
    wbSignal = signal;
    return (async function* () {
      const data = Buffer.from(sseFrames(modelTextFrames('chat', 'WorkBuddy 中文')) + 'data: [DONE]\n\n');
      for (let offset = 0; offset < data.length; offset += 2) yield data.subarray(offset, offset + 2);
    })();
  } };
  assert.equal((await gateway.generateText(workbuddy, bridge)).text, 'WorkBuddy 中文');
  assert.ok(wbSignal.aborted, 'Per-request scope is closed after successful completion');
  await assert.rejects(gateway.generateText(workbuddy), /WorkBuddy 尚未登录/);
  const failingBridge = { ...bridge, dispatchChat: async () => { throw Object.assign(new Error('secret-key private-access-token'), {
    response: { status: 400, data: { error: { code: 'context_length_exceeded', message: 'prompt is too long' } } },
  }); } };
  await assert.rejects(gateway.generateText(workbuddy, failingBridge), error => error.kind === 'context-overflow' && error.status === 400 && !error.message.includes('private-access-token'));
  let streamClosed = false;
  const endBridge = { ...bridge, dispatchChat: async () => (async function* () {
    try {
      yield sseFrames(modelTextFrames('chat', 'complete')) + 'data: [DONE]\n\n';
      throw new Error('The stream must close at DONE');
    } finally { streamClosed = true; }
  })() };
  assert.equal((await gateway.generateText(workbuddy, endBridge)).text, 'complete');
  assert.ok(streamClosed);
  await assert.rejects(gateway.generateText({ ...makeRequest(), provider: { ...makeRequest().provider, baseUrl: 'file:///tmp/no-network', apiKey: '' } }));
  assert.deepEqual(errors, []);
  console.log('PASS: WorkBuddy dispatch, UTF-8 framing, scope cleanup and login/configuration checks');
} finally {
  await gateway.dispose();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
