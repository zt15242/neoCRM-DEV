// Optional architecture probe. Install @opencode/ai@2.2.7 into a separate directory,
// then pass that directory here. No project dependency or real model account is used.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';

const dependencyRoot = process.argv[2];
if (!dependencyRoot) throw new Error('Usage: node scripts/evaluate-opencode-adapter.mjs <isolated npm install directory>');
const load = async name => {
  const parts = name.split('/');
  const packageName = parts.splice(0, name.startsWith('@') ? 2 : 1).join('/');
  const packageRoot = resolve(dependencyRoot, 'node_modules', packageName);
  const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
  if (packageName === '@opencode/ai') assert.equal(manifest.version, '2.2.7', 'Probe requires the reviewed package version');
  const entry = manifest.exports[parts.length ? `./${parts.join('/')}` : '.'];
  const target = typeof entry === 'string' ? entry : entry.import;
  return import(pathToFileURL(resolve(packageRoot, target)).href);
};
const [{ make, tool }, compatible, google, { Schema }] = await Promise.all([
  load('@opencode/ai'), load('@opencode/ai/providers/openai-compatible'), load('@opencode/ai/providers/google'), load('effect'),
]);
const client = make();
const calls = new Map();
const received = [];
const handlerErrors = [];
let executions = 0;

async function sendSse(response, chunks) {
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  const bytes = Buffer.from(chunks.map(chunk => `data: ${JSON.stringify({
    id: 'mock-completion', object: 'chat.completion.chunk', created: 1, model: 'mock',
    choices: [{ index: 0, delta: {}, finish_reason: null, ...chunk }],
  })}\n\n`).join('') + 'data: [DONE]\n\n');
  // Split inside JSON, SSE frames and UTF-8 characters.
  for (let offset = 0; offset < bytes.length; offset += 7) {
    if (response.destroyed) return;
    response.write(bytes.subarray(offset, offset + 7));
    await new Promise(resolve => setImmediate(resolve));
  }
  response.end();
}

function toolChunks(argumentsText, id) {
  const middle = Math.floor(argumentsText.length / 2);
  return [
    { delta: { role: 'assistant', tool_calls: [{ index: 0, id, type: 'function', function: { name: 'skill', arguments: argumentsText.slice(0, middle) } }] } },
    { delta: { tool_calls: [{ index: 0, function: { arguments: argumentsText.slice(middle) } }] } },
    { finish_reason: 'tool_calls' },
  ];
}

const server = createServer((request, response) => {
  void (async () => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const data = JSON.parse(body);
    if (request.url === '/v1beta/models/gemini-probe:streamGenerateContent?alt=sse') {
      const count = (calls.get('gemini-probe') || 0) + 1;
      calls.set('gemini-probe', count);
      received.push({ ...data, model: 'gemini-probe' });
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.end(`data: ${JSON.stringify({
        candidates: [{ content: { role: 'model', parts: count === 1
          ? [{ functionCall: { name: 'skill', args: { name: 'neo-page-code-management' } } }]
          : [{ text: 'Gemini 技能测试通过' }] }, finishReason: 'STOP', index: 0 }],
        usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 10, totalTokenCount: 30 },
      })}\n\n`);
      return;
    }
    assert.equal(request.url, '/v1/chat/completions');
    received.push(data);
    const attempt = (calls.get(data.model) || 0) + 1;
    calls.set(data.model, attempt);
    if (data.model === 'overflow') {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { code: 'context_length_exceeded', message: 'maximum context length exceeded' } }));
      return;
    }
    if (data.model === 'invalid-input' && attempt === 1) {
      await sendSse(response, toolChunks('{"name":', 'invalid-json'));
    } else if (data.model === 'invalid-input' && attempt === 2) {
      await sendSse(response, toolChunks('{"name":42}', 'invalid-schema'));
    } else if (data.model === 'invalid-input' && attempt === 3) {
      await sendSse(response, toolChunks('{"name":"neo-page-code-management"}', 'valid-skill'));
    } else {
      await sendSse(response, [{ delta: { role: 'assistant', content: '模型与技能测试通过' } }, { finish_reason: 'stop' }]);
    }
  })().catch(error => {
    handlerErrors.push(error);
    response.destroy(error);
  });
});

try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const provider = compatible.configure({ baseURL: `http://127.0.0.1:${server.address().port}/v1`, apiKey: false });
  const events = [];
  for await (const event of client.stream({ model: provider.model('text'), prompt: 'test', maxTokens: 128 }, { signal: AbortSignal.timeout(10_000) })) events.push(event);
  assert.ok(events.some(event => event.type === 'finish'));
  assert.ok(JSON.stringify(events).includes('模型与技能测试通过'));
  console.log('PASS: Node import, compatible endpoint, fragmented SSE and UTF-8');

  const skills = tool({
    name: 'skill', description: 'Mock skill loader', input: Schema.Struct({ name: Schema.String }),
    execute: ({ name }) => { executions++; return { name, instruction: 'mock instructions' }; },
  });
  const loopEvents = [];
  for await (const event of client.loop({
    model: provider.model('invalid-input'), prompt: 'load the mock skill', tools: [skills],
    until: ({ steps }) => steps.length >= 4,
  }, { signal: AbortSignal.timeout(10_000) })) loopEvents.push(event);
  assert.equal(executions, 1, 'Invalid JSON and schema violations must never execute the tool');
  assert.equal(calls.get('invalid-input'), 4);
  assert.ok(loopEvents.some(event => event.type === 'finish'));
  const continuation = received.filter(request => request.model === 'invalid-input');
  assert.ok(continuation[1].messages.some(message => message.role === 'tool'));
  assert.ok(continuation[2].messages.some(message => message.role === 'tool'));
  console.log('PASS: invalid JSON/schema receive tool errors; one valid skill execution and continuation');

  const native = google.configure({ baseURL: `http://127.0.0.1:${server.address().port}/v1beta`, apiKey: false });
  const nativeEvents = [];
  for await (const event of client.loop({
    model: native.model('gemini-probe'), prompt: 'load the mock skill', tools: [skills],
    until: ({ steps }) => steps.length >= 2,
  }, { signal: AbortSignal.timeout(10_000) })) nativeEvents.push(event);
  assert.equal(executions, 2, 'Gemini executes the valid skill once');
  assert.equal(calls.get('gemini-probe'), 2);
  assert.ok(nativeEvents.some(event => event.type === 'finish'));
  assert.ok(JSON.stringify(received.filter(request => request.model === 'gemini-probe')[1].contents).includes('functionResponse'));
  console.log('PASS: same client/tool contract for native Gemini and function-result continuation');

  let overflowError;
  try { await client.generate({ model: provider.model('overflow'), prompt: 'test' }, { signal: AbortSignal.timeout(10_000) }); }
  catch (error) { overflowError = error; }
  assert.ok(overflowError);
  assert.equal(overflowError.reason?.classification, 'context-overflow');
  assert.equal(calls.get('overflow'), 1, 'The adapter must leave compaction policy to the caller');
  console.log('PASS: context overflow classification without an implicit resend');
  assert.deepEqual(handlerErrors, []);
} finally {
  await client.dispose();
  server.closeAllConnections();
  if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
