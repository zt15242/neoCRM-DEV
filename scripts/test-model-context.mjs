import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-model-context-'));
const require = createRequire(import.meta.url);
let server;
try {
  const output = path.join(fixture, 'subject.cjs');
  await build({ stdin: { resolveDir: root, loader: 'ts', contents: `
    export * from './electron/services/modelContext';
    export { AiService } from './electron/services/aiService';
  ` }, bundle: true, platform: 'node', format: 'cjs', outfile: output, external: ['esbuild'], logLevel: 'silent',
    plugins: [{ name: 'isolated-model-host', setup(builder) {
      builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
        export const app = { getPath: () => ${JSON.stringify(fixture)} };
        export const dialog = {}, shell = {}, BrowserWindow = class {};
      ` }));
    } }],
  });
  const { AiService, getModelContextBudget: budgetFor, estimateContextTokens: estimate, readModelTokenLimits,
    uncompactedMessages, chooseCompactionCutoff, pruneToolMessages, pruneGeminiContents, pruneToolContent,
    assertContextFits, isContextLimitError, reportedContextWindow } = require(output);
  const model = (contextWindow, maxOutputTokens = 4096) => ({ id: 'fixture', name: 'Fixture', contextWindow, maxOutputTokens });
  const providerFor = (contextWindow) => ({ id: 'fixture', name: 'Fixture', type: 'custom', protocol: 'openai-completions',
    baseUrl: '', apiKey: 'test-only', enabled: true, models: [model(contextWindow)] });
  const small = budgetFor(providerFor(32768), 'fixture', 10000);
  const large = budgetFor(providerFor(1048576), 'fixture', 10000);
  assert.equal(small.maxOutputTokens, 4096);
  assert.equal(large.contextWindow, 1048576);
  assert(small.triggerTokens < small.inputTokens && small.inputTokens + small.maxOutputTokens < small.contextWindow);
  assert.equal(budgetFor(providerFor(undefined), 'fixture').capacityKnown, false);
  assert.equal(budgetFor(providerFor(undefined), 'fixture').contextWindow, 32768);
  assert.equal(readModelTokenLimits({ context_length: 1048576, top_provider: { max_completion_tokens: 8192 } }).contextWindow, 1048576);
  assert.equal(readModelTokenLimits({}, model(128000)).contextWindow, 128000);
  assert.equal(readModelTokenLimits({ context_window: -1, max_output_tokens: '2048' }).contextWindow, undefined);
  assert.equal(readModelTokenLimits({ max_output_tokens: '2048' }).maxOutputTokens, 2048);
  assert.equal(isContextLimitError(524, 'timeout'), false);
  assert.equal(isContextLimitError(429, 'too many requests'), false);
  assert.equal(isContextLimitError(400, 'context_length_exceeded'), true);
  assert.equal(reportedContextWindow('maximum context length is 8,192 tokens'), 8192);
  const wire = [{ role: 'system', content: 'system' }, { role: 'user', content: 'Keep this exact request' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: {name: 'read', arguments: '{"path":"fixture"}'} }] },
    { role: 'tool', tool_call_id: 'call-1', content: JSON.stringify({ stdout: '日志'.repeat(15000), records: [1, 2, 3] }) }];
  assert.strictEqual(pruneToolMessages(wire, [], large), wire, 'large model preserves full tool output');
  const pruned = pruneToolMessages(wire, [], small);
  assert.equal(pruned[1].content, wire[1].content);
  assert.deepEqual(pruned[2], wire[2]);
  assert.equal(pruned[3].tool_call_id, 'call-1');
  assert(JSON.parse(pruned[3].content)._contextPruned);
  assertContextFits(pruned, [], small);
  for (const content of ['汉字'.repeat(5000), '\\"'.repeat(10000), 'line\n'.repeat(5000)]) {
    const shortened = pruneToolContent(content, 256);
    assert(estimate(shortened) <= 256);
    assert(JSON.parse(shortened)._contextPruned);
  }
  assert.throws(() => assertContextFits([{role: 'user', content: '汉'.repeat(20000)}], [], small), /超过当前模型可用输入预算/);
  assert.throws(() => assertContextFits([{role: 'user', content: 'ok'}], [{schema: 'x'.repeat(200000)}], small), /超过/);
  assert.throws(() => assertContextFits([{role: 'user', content: '汉'.repeat(20000)}], [], budgetFor(providerFor(undefined), 'fixture')), /容量未知，保守上下文预算/);
  const gemini = [{role: 'model', parts: [{functionCall: {name: 'read', args: {path: 'fixture'}}}]},
    {role: 'user', parts: [{functionResponse: {name: 'read', response: {result: '日志'.repeat(15000)}}}]}];
  assert.strictEqual(pruneGeminiContents(gemini, 'system', [], large), gemini);
  const trimmedGemini = pruneGeminiContents(gemini, 'system', [], small);
  assert.deepEqual(trimmedGemini[0], gemini[0]);
  assert.equal(trimmedGemini[1].parts[0].functionResponse.name, 'read');
  assertContextFits({ contents: trimmedGemini, system: 'system' }, [], small);
  console.log('PASS budgets: model limits, output reservation, unknown-capacity fallback, full request accounting, valid tool pairing/JSON, Gemini pruning');

  const requests = [];
  let failureStatus = 0, failOnce = false, summaryFailure = false, reportedLimit = 8192, delayedSummary, toolScenario = 0;
  server = http.createServer(async (request, response) => {
    if (request.method === 'GET') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({data: [{id: 'fixture', context_length: 1048576, max_output_tokens: 8192}, {id: 'unknown'}]})); return;
    }
    let raw = ''; for await (const part of request) raw += part;
    const body = JSON.parse(raw); requests.push({url: request.url, body});
    if (body.stream && [1, 3].includes(toolScenario)) {
      toolScenario = toolScenario === 1 ? 2 : 0;
      response.setHeader('Content-Type', 'text/event-stream');
      response.end('data: ' + JSON.stringify({choices: [{delta: {tool_calls: [{index: 0, id: 'live-call', type: 'function', function: {name: 'fixture_read', arguments: '{}'}}]}, finish_reason: 'tool_calls'}]}) + '\n\ndata: [DONE]\n\n');
      return;
    }
    if (body.stream && toolScenario === 2) {
      toolScenario = 0;
      failOnce = true; failureStatus = 400;
    }
    if (body.stream && failOnce) {
      failOnce = false; response.statusCode = failureStatus;
      response.end(failureStatus === 400 ? JSON.stringify({error: {code: 'context_length_exceeded', message: `maximum context length is ${reportedLimit} tokens`}}) : '<html><title>Gateway timeout</title></html>'); return;
    }
    if (!body.stream && !body.contents) {
      if (summaryFailure) { response.statusCode = 503; response.end('fixture summary unavailable'); return; }
      if (delayedSummary) { delayedSummary(); return; }
      response.setHeader('Content-Type', 'application/json');
      const text = JSON.stringify(body);
      const markers = [...new Set(text.match(/MARKER_\d+/g) || [])].join(' ');
      response.end(JSON.stringify({choices: [{message: {content: '## Primary Request and Intent\n- SUMMARY ' + markers}}]})); return;
    }
    response.setHeader('Content-Type', 'text/event-stream');
    response.end(body.contents
      ? 'data: {"candidates":[{"content":{"parts":[{"text":"fixture native reply"}]}}]}\n\n'
      : 'data: {"choices":[{"delta":{"content":"fixture reply"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  const history = Array.from({length: 8}, (_, index) => ({id: 'm-' + index, role: index % 2 ? 'assistant' : 'user',
    content: `MARKER_${index} ` + 'data '.repeat(3600), createdAt: index}));
  history.push({id: 'latest', role: 'user', content: 'Latest request must stay intact', createdAt: 100});
  const makeService = (capacity, messages = history, protocol = 'openai-completions') => {
    const provider = {...providerFor(capacity), baseUrl, protocol};
    const config = {providers: [provider], settings: {defaultProviderId: 'fixture', defaultModelId: 'fixture',
      maxTokens: 4096, enableCrmTools: false, temperature: 0.1, customSystemPrompt: '', injectTenantContext: false}, skills: [], mcpServers: []};
    let stored = {id: 'session', providerId: 'fixture', modelId: 'fixture', messages: structuredClone(messages)};
    const service = new AiService({prepareNeoCliForConversation: () => ({session: {isLoggedIn: false}})}, {}, {});
    service.getAiConfig = () => config;
    service.getSessions = () => [structuredClone(stored)];
    service.saveSession = value => { stored = structuredClone(value); return [stored]; };
    const events = [];
    return {service, config, events, get stored() { return stored; }, run: async (extra = {}) => {
      await service.startChatStream({requestId: 'req', sessionId: 'session', messageId: 'reply', providerId: 'fixture', modelId: 'fixture',
        enableTools: false, mode: 'minimal', messages: structuredClone(stored.messages), compactionSummary: stored.compactionSummary, ...extra}, event => events.push(event));
      assert(!events.some(event => event.type === 'error'), JSON.stringify(events.filter(event => event.type === 'error')));
    }};
  };
  const big = makeService(1048576);
  await big.run();
  assert.equal(big.events.filter(event => event.type === 'compaction_done').length, 0);
  let chat = requests.filter(item => item.body.stream).at(-1).body;
  for (let index = 0; index < 8; index++) assert(JSON.stringify(chat).includes('MARKER_' + index));
  assert.equal(requests.filter(item => !item.body.stream).length, 0);
  const little = makeService(32768);
  await little.run();
  assert.equal(little.events.filter(event => event.type === 'compaction_done').length, 1);
  assert(little.stored.compactionSummary.originalMessageCount > 0);
  assert.equal(little.stored.messages.length, history.length);
  chat = requests.filter(item => item.body.stream).at(-1).body;
  assert(JSON.stringify(chat).includes('Latest request must stay intact'));
  assertContextFits(chat.messages, chat.tools || [], small);
  for (const item of requests.filter(item => !item.body.stream)) assertContextFits(item.body.messages, [], budgetFor(providerFor(32768), 'fixture', item.body.max_tokens));
  console.log('PASS automatic compaction: same history retained for 1M and summarized for 32K; summary requests and current request fit; visible history retained');

  const escapedStart = requests.length;
  const escapedHistory = history.map(message => ({...message, content: message.id === 'latest' ? message.content : '\\"\n'.repeat(4000)}));
  const escaped = makeService(8192, escapedHistory);
  await escaped.run();
  const summaryRequests = requests.slice(escapedStart).filter(item => !item.body.stream);
  assert(summaryRequests.length > 1);
  for (const item of summaryRequests) assertContextFits(item.body.messages, [], budgetFor(providerFor(8192), 'fixture', item.body.max_tokens));
  console.log('PASS summary payload accounting: escaped code/logs split into chunks that fit including JSON framing and prior summary');

  const checkpointed = makeService(1048576, history);
  checkpointed.service.saveSession({...checkpointed.stored, compactionSummary: {originalMessageCount: 2, summary: 'Existing checkpoint', compactedAt: 1}});
  await checkpointed.run();
  chat = requests.filter(item => item.body.stream).at(-1).body;
  assert(!JSON.stringify(chat).includes('MARKER_0'));
  for (let index = 2; index < 8; index++) assert(JSON.stringify(chat).includes('MARKER_' + index));
  assert(JSON.stringify(chat).includes('Existing checkpoint'));
  const native = makeService(1048576, history, 'google-gemini');
  native.service.saveSession({...native.stored, compactionSummary: {originalMessageCount: 2, summary: 'Native checkpoint', compactedAt: 1}});
  await native.run();
  assert(JSON.stringify(requests.at(-1).body).includes('Native checkpoint'));
  console.log('PASS checkpoint boundaries: new turns since prior cutoff retained without fixed tail count; Gemini receives checkpoint');

  const brief = history.slice(-1);
  const retry = makeService(1048576, brief);
  failureStatus = 524; failOnce = true;
  const retryStart = requests.length;
  await retry.run();
  const retried = requests.slice(retryStart).filter(item => item.body.stream);
  assert.equal(retried.length, 2);
  assert.deepEqual(retried[0].body.messages, retried[1].body.messages);
  const notice = retry.events.filter(event => event.type === 'content_delta').map(event => event.delta).join('');
  assert(notice.includes('HTTP 524'));
  assert(!notice.includes('已自动压缩'));
  assert.equal(retry.events.some(event => event.type === 'compaction_done'), false);
  console.log('PASS gateway handling: 524 retry preserves the request and reports its actual status without pretending compaction occurred');

  const mediumHistory = history.map(message => ({...message, content: message.id === 'latest' ? message.content : message.content.slice(0, 3000)}));
  const correction = makeService(32768, mediumHistory);
  failureStatus = 400; failOnce = true; reportedLimit = 8192;
  const correctionStart = requests.length;
  await correction.run();
  assert(correction.events.some(event => event.type === 'compaction_done'));
  const correctedChat = requests.slice(correctionStart).filter(item => item.body.stream).at(-1).body;
  assertContextFits(correctedChat.messages, [], budgetFor(providerFor(8192), 'fixture', 4096));
  for (const item of requests.slice(correctionStart).filter(item => !item.body.stream)) assertContextFits(item.body.messages, [], budgetFor(providerFor(8192), 'fixture', item.body.max_tokens));
  console.log('PASS context-limit recovery: explicit server capacity corrects the budget, checkpoints with that capacity, then retries within the reduced window');

  const liveRecovery = makeService(32768, mediumHistory);
  let executions = 0;
  liveRecovery.service.executeUnifiedTool = async () => { executions++; return {data: {value: 'LIVE_TOOL_RESULT'}, summary: 'fixture'}; };
  const liveStart = requests.length;
  toolScenario = 1;
  await liveRecovery.run();
  const liveRequests = requests.slice(liveStart).filter(item => item.body.stream);
  assert.equal(executions, 1, 'context recovery must not repeat a completed tool');
  assert.equal(liveRequests.length, 3);
  const resumed = liveRequests.at(-1).body;
  assert(resumed.messages.some(message => message.tool_calls?.some(call => call.id === 'live-call')));
  assert(resumed.messages.some(message => message.tool_call_id === 'live-call' && message.content.includes('LIVE_TOOL_RESULT')));
  assertContextFits(resumed.messages, [], budgetFor(providerFor(8192), 'fixture', 4096));
  console.log('PASS live tool recovery: mid-turn checkpoint retains call/result pairs and does not execute completed tools again');

  const growingTurn = makeService(32768, mediumHistory);
  growingTurn.service.executeUnifiedTool = async () => ({data: {value: 'LIVE_LARGE_TOOL_RESULT', stdout: 'tool data '.repeat(12000)}, summary: 'fixture'});
  const growthStart = requests.length;
  toolScenario = 3;
  await growingTurn.run();
  assert(growingTurn.events.some(event => event.type === 'compaction_done'), 'large live tool data should trigger history compaction before the next request');
  const growthRequests = requests.slice(growthStart).filter(item => item.body.stream);
  assert.equal(growthRequests.length, 2);
  const nextTurn = growthRequests[1].body;
  assert(nextTurn.messages.some(message => message.tool_calls?.some(call => call.id === 'live-call')));
  const liveResult = nextTurn.messages.find(message => message.tool_call_id === 'live-call');
  assert(liveResult.content.includes('LIVE_LARGE_TOOL_RESULT'));
  assert(JSON.parse(liveResult.content)._contextPruned);
  assertContextFits(nextTurn.messages, [], small);
  console.log('PASS agent-loop growth: history compacts as tool data accumulates, current call/result survives, large result is budgeted before submission');

  const discovery = await big.service.fetchAvailableModels({...providerFor(undefined), baseUrl});
  assert.equal(discovery.models[0].contextWindow, 1048576);
  assert.equal(discovery.models[0].maxOutputTokens, 8192);
  assert.equal(discovery.models[1].contextWindow, undefined);
  big.service.setWorkBuddyService({fetchLiveModels: async () => ({success: true, models: [{id: 'fixture', name: 'Fixture'}]})});
  const wbDiscovery = await big.service.fetchAvailableModels({...providerFor(128000), id: 'workbuddy'});
  assert.equal(wbDiscovery.models[0].contextWindow, 128000);
  assert.equal(wbDiscovery.models[0].maxOutputTokens, 4096);
  const failed = makeService(32768);
  summaryFailure = true;
  await assert.rejects(failed.service.compactSession('session'), /503/);
  assert.equal(failed.stored.compactionSummary, undefined);
  assert.equal(failed.stored.messages.length, history.length);
  summaryFailure = false;
  const aborting = makeService(32768);
  const controller = new AbortController();
  delayedSummary = () => controller.abort();
  await assert.rejects(aborting.service.compactSession('session', controller.signal));
  assert.equal(aborting.stored.compactionSummary, undefined);
  console.log('PASS discovery/failure/cancellation: real metadata preserved, missing limits stay unknown, failed or aborted compaction never advances the checkpoint');
} finally {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await fs.rm(fixture, {recursive: true, force: true});
}
