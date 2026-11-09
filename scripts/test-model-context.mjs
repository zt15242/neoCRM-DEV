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
    export { shouldLoadBusinessTypeSkill } from './electron/security/neoCliConversation';
    export { AiService } from './electron/services/aiService';
    export { VisionImageLoader } from './electron/services/visionAttachments';
    export { modelTokenReference, applyModelTokenReference } from './shared/modelTokenCatalog';
  ` }, bundle: true, platform: 'node', format: 'cjs', outfile: output, external: ['esbuild'], logLevel: 'silent',
    plugins: [{ name: 'isolated-model-host', setup(builder) {
      builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
        export const app = { getPath: () => ${JSON.stringify(fixture)} };
        export const dialog = {}, shell = {}, BrowserWindow = class {};
      ` }));
    } }],
  });
  const { AiService, VisionImageLoader, modelTokenReference, applyModelTokenReference, getModelContextBudget: budgetFor, estimateContextTokens: estimate, readModelTokenLimits,
    uncompactedMessages, chooseCompactionCutoff, pruneToolMessages, pruneGeminiContents, pruneToolContent,
    assertContextFits, isContextLimitError, isCompletedWorkSummaryRequest, reportedContextWindow, shouldLoadBusinessTypeSkill } = require(output);
  assert(isCompletedWorkSummaryRequest('请结合上述工具执行结果，给出完整详尽的总结分析与最终答复。'));
  assert(!isCompletedWorkSummaryRequest('请结合上述工具执行结果，给出完整总结，并部署上线'));
  assert(!isCompletedWorkSummaryRequest('请创建一个自定义页面并部署'));
  assert(shouldLoadBusinessTypeSkill('继续处理',[], '先前配置了业务类型'));
  assert(shouldLoadBusinessTypeSkill('创建业务类型',[],''));
  assert(!shouldLoadBusinessTypeSkill('创建一个自定义页面部署到环境上，增加一个菜单',['之前配置业务类型'],''));
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
  const officialGemini = {...providerFor(undefined), baseUrl:'https://generativelanguage.googleapis.com/v1beta'};
  const blankGemini = {id:'gemini-3.8-flash',name:'Gemini'};
  assert.equal(applyModelTokenReference(officialGemini, blankGemini).contextWindow, 1048576);
  assert.equal(applyModelTokenReference(officialGemini, {...blankGemini,contextWindow:65536}).contextWindow,65536);
  assert.equal(applyModelTokenReference(officialGemini, {...blankGemini,contextWindow:65536}).maxOutputTokens,undefined);
  assert.equal(applyModelTokenReference(officialGemini, {...blankGemini,tokenLimitsSource:'user'}).contextWindow,undefined);
  assert.equal(modelTokenReference({...officialGemini,baseUrl:'https://proxy.example/v1'},blankGemini.id),undefined);
  assert.equal(modelTokenReference(officialGemini,'gemini-3.8-flash-high'),undefined);
  assert.equal(modelTokenReference({baseUrl:'https://api.deepseek.com'},'deepseek-flash').maxOutputTokens,393216);
  assert.equal(modelTokenReference({baseUrl:'https://api.openai.com/v1'},'o3-mini').maxOutputTokens,100000);
  assert.deepEqual(readModelTokenLimits({context_length:1048576,max_output_tokens:65536},{...blankGemini,contextWindow:32000,tokenLimitsSource:'user'}), {contextWindow:32000,maxOutputTokens:undefined});
  console.log('PASS verified model defaults match exact official providers; existing and manual limits take priority');

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
  // A single active turn can have no saved historical turn to summarize. Its
  // most recent completed writes must still fit without repeating their tools.
  const recentWrites = [1, 2].map(i => ({id:`write-${i}`,type:'function',function:{name:'write',arguments:JSON.stringify({file_path:`diagram-${i}.svg`,content:'abc '.repeat(50000)})}}));
  const activeWire = [{role:'user',content:'生成图表'}, {role:'assistant',content:null,tool_calls:recentWrites},
    ...recentWrites.map(call=>({role:'tool',tool_call_id:call.id,content:'写入成功'}))];
  const activeOriginal = structuredClone(activeWire);
  const activeSlim = pruneToolMessages(activeWire, [], small);
  assertContextFits(activeSlim, [], small);
  assert.deepEqual(activeWire, activeOriginal);
  assert.deepEqual(activeSlim[1].tool_calls.map(call=>JSON.parse(call.function.arguments).file_path), ['diagram-1.svg','diagram-2.svg']);
  assert.deepEqual(activeSlim.slice(2).map(result=>result.tool_call_id), ['write-1','write-2']);
  const nativeCalls = recentWrites.map(call=>({functionCall:{name:'write',args:JSON.parse(call.function.arguments)}}));
  const nativeActive = [{role:'user',parts:[{text:'生成图表'}]}, {role:'model',parts:nativeCalls},
    {role:'user',parts:recentWrites.map(()=>({functionResponse:{name:'write',response:{result:'写入成功'}}}))}];
  const nativeSlim=pruneGeminiContents(nativeActive,'system',[],small);
  assertContextFits({contents:nativeSlim,system:'system'},[],small);
  assert.deepEqual(nativeSlim[1].parts.map(part=>part.functionCall.args.file_path), ['diagram-1.svg','diagram-2.svg']);
  assert.equal(nativeSlim[2].parts.length,2);
  console.log('PASS oversized recent completed writes are compacted without losing paths or call/result pairing');
  const oldCall = {id:'old',type:'function',function:{name:'write',arguments:JSON.stringify({file_path:'src/example.ts',content:'data '.repeat(26000)})}};
  const recentCalls = [1,2].map(index => ({id:'new-'+index,type:'function',function:{name:'read',arguments:'{}'}}));
  const heavyWire = [{role:'user',content:'Keep the current request'}, {role:'assistant',content:null,tool_calls:[oldCall,...recentCalls]},
    ...[oldCall,...recentCalls].map(call=>({role:'tool',tool_call_id:call.id,content:'completed'}))];
  const heavySnapshot=structuredClone(heavyWire);
  const slimWire=pruneToolMessages(heavyWire,[],small);
  assert.deepEqual(heavyWire,heavySnapshot,'request pruning must not mutate the stored history');
  assert.deepEqual(JSON.parse(slimWire[1].tool_calls[0].function.arguments),{_contextPruned:true,file_path:'src/example.ts'});
  assert.deepEqual(slimWire[1].tool_calls.slice(1),recentCalls);
  assert.deepEqual(slimWire.slice(2).map(message=>message.tool_call_id),['old','new-1','new-2']);
  assertContextFits(slimWire,[],small);
  const oldNative = [{role:'user',parts:[{text:'Current request'}]}, {role:'model',parts:[{functionCall:{name:'write',args:JSON.parse(oldCall.function.arguments)},thoughtSignature:'keep'}]},
    {role:'user',parts:[{functionResponse:{name:'write',response:{ok:true}}}]},
    ...recentCalls.flatMap(call=>[{role:'model',parts:[{functionCall:{name:call.id,args:{}}}]},{role:'user',parts:[{functionResponse:{name:call.id,response:{ok:true}}}]}])];
  const oldNativeSnapshot=structuredClone(oldNative);
  const slimNative=pruneGeminiContents(oldNative,'system',[],small);
  assert.deepEqual(oldNative,oldNativeSnapshot);
  assert.deepEqual(slimNative[1].parts[0].functionCall.args,{_contextPruned:true,file_path:'src/example.ts'});
  assert.equal(slimNative[1].parts[0].thoughtSignature,'keep');
  assertContextFits({contents:slimNative,system:'system'},[],small);
  const groupedNative = [{role:'model',parts:[oldCall,...recentCalls].map(call=>({functionCall:{name:call.id,args:JSON.parse(call.function.arguments)}}))},
    {role:'user',parts:[oldCall,...recentCalls].map(call=>({functionResponse:{name:call.id,response:{ok:true}}}))}];
  const slimGrouped=pruneGeminiContents(groupedNative,'system',[],small);
  assert.deepEqual(slimGrouped[0].parts[0].functionCall.args,{_contextPruned:true,file_path:'src/example.ts'});
  assert.deepEqual(slimGrouped[0].parts.slice(1),groupedNative[0].parts.slice(1));
  console.log('PASS budgets: model limits, output reservation, unknown-capacity fallback, full request accounting, valid tool pairing/JSON, Gemini pruning');

  const requests = [];
  let failureStatus = 0, failOnce = false, nativeFailOnce = false, summaryFailure = false, reportedLimit = 8192, delayedSummary, toolScenario = 0, visionToolScenario = false;
  server = http.createServer(async (request, response) => {
    if (request.method === 'GET') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({data: [{id: 'fixture', context_length: 1048576, max_output_tokens: 8192}, {id: 'unknown'}]})); return;
    }
    let raw = ''; for await (const part of request) raw += part;
    const body = JSON.parse(raw); requests.push({url: request.url, body});
    if (visionToolScenario && (body.stream || body.contents)) {
      visionToolScenario = false;
      response.setHeader('Content-Type', 'text/event-stream');
      const call = body.contents
        ? {candidates:[{content:{parts:[{functionCall:{name:'read_image',args:{file_path:'fixture.png'}}}]}}]}
        : {choices:[{delta:{tool_calls:[{index:0,id:'image-call',type:'function',function:{name:'read_image',arguments:JSON.stringify({file_path:'fixture.png'})}}]},finish_reason:'tool_calls'}]};
      response.end('data: ' + JSON.stringify(call) + '\n\ndata: [DONE]\n\n'); return;
    }
    if (body.contents && nativeFailOnce) { nativeFailOnce=false; response.statusCode=400; response.end(JSON.stringify({error:{message:'maximum context length exceeded'}})); return; }
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
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aWQAAAAASUVORK5CYII=', 'base64');
  const pngPath = path.join(fixture, 'fixture.png');
  await fs.writeFile(pngPath, png);
  const imageLoader = new VisionImageLoader();
  assert.equal(imageLoader.load(pngPath).data, png.toString('base64'));
  const fakePath = path.join(fixture, 'fake.png');
  await fs.writeFile(fakePath, 'not an image');
  assert.throws(() => imageLoader.load(fakePath), /格式暂不支持/);
  assert.throws(() => imageLoader.load(path.join(fixture, 'missing.png')), /无法读取图片/);
  const oversizedPath = path.join(fixture, 'oversized.png');
  await fs.writeFile(oversizedPath, Buffer.alloc(8 * 1024 * 1024 + 1));
  assert.throws(() => imageLoader.load(oversizedPath), /大小限制/);
  const imageTokens = estimate([{role:'user',content:[{type:'image_url',image_url:{url:'data:image/png;base64,' + 'a'.repeat(1000000)}}]}]);
  assert(imageTokens >= 4096 && imageTokens < 5000);
  assert(estimate({inlineData:{mimeType:'image/png',data:'a'.repeat(1000000)}}) < 5000);
  for (const protocol of ['openai-completions', 'google-gemini']) {
    const imageMessages = [{id:'image-user',role:'user',content:'图片是什么',createdAt:1,attachments:[{name:'fixture.png',size:png.length,contentKind:'image',fullPath:pngPath,parsedContent:'旧提示：尚未识别'}]}];
    const vision = makeService(1048576,imageMessages,protocol);
    const from = requests.length;
    await vision.run();
    const body = requests.slice(from).find(item => item.body.stream || item.body.contents).body;
    const content = JSON.stringify(body);
    assert(content.includes(png.toString('base64')), protocol + ' sends image bytes');
    assert(!content.includes('旧提示：尚未识别'));
    assert(!JSON.stringify(vision.events).includes(png.toString('base64')), 'image bytes stay out of events');
    assert(!JSON.stringify(vision.stored).includes(png.toString('base64')), 'image bytes stay out of saved history');
    const toolVision = makeService(1048576,[{id:'user',role:'user',content:'查看项目里的图片',createdAt:1}],protocol);
    toolVision.config.settings.enableCrmTools = true;
    visionToolScenario = true;
    const toolFrom = requests.length;
    await toolVision.run({enableTools:true,mode:'standard',projectPath:await fs.realpath(fixture)});
    const second = requests.slice(toolFrom).filter(item => item.body.stream || item.body.contents)[1]?.body;
    assert(second && JSON.stringify(second).includes(png.toString('base64')), protocol + ' read_image sends bytes: ' + JSON.stringify(toolVision.events));
    assert(toolVision.events.some(event => event.type === 'tool_update' && event.toolCall?.name === 'read_image' && event.toolCall.status === 'success'));
    assert(!JSON.stringify(toolVision.events).includes(png.toString('base64')));
  }
  console.log('PASS image attachments and read_image deliver bytes through both protocols, with limits and context accounting');
  requests.length = 0;
  const big = makeService(1048576);
  await big.run();
  assert.equal(big.events.filter(event => event.type === 'compaction_done').length, 0);
  let chat = requests.filter(item => item.body.stream).at(-1).body;
  for (let index = 0; index < 8; index++) assert(JSON.stringify(chat).includes('MARKER_' + index));
  assert.equal(requests.filter(item => !item.body.stream).length, 0);
  for (const protocol of ['openai-completions','google-gemini']) {
    const summaryMessage = [{id:'summary-user',role:'user',content:'请结合上述工具执行结果，给出完整详尽的总结分析与最终答复。',createdAt:1}];
    const summaryCase=makeService(undefined,summaryMessage,protocol);
    summaryCase.config.settings.enableCrmTools=true;
    const from=requests.length;
    await summaryCase.run({enableTools:true,mode:'standard'});
    const request=requests.slice(from).find(item=>item.body.stream || item.body.contents)?.body;
    assert(request);
    assert(!request.tools,'a report-only request must not include the full tool catalogue');
    assert(JSON.stringify(request).includes('用户只要求总结已有的执行记录'));
    assert(estimate(request)<budgetFor(providerFor(undefined),'fixture').inputTokens);
  }
  const activeToolsCase=makeService(1048576,[{id:'active-user',role:'user',content:'创建并部署一个页面',createdAt:1}]);
  activeToolsCase.config.settings.enableCrmTools=true;
  const activeFrom=requests.length;
  await activeToolsCase.run({enableTools:true,mode:'standard'});
  assert(requests.slice(activeFrom).find(item=>item.body.stream)?.body.tools?.length>0,'ordinary tasks retain tools');
  console.log('PASS report-only follow-up avoids unused tools under an unknown 32K context; ordinary tasks retain tools');
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
  assert(!growingTurn.events.some(event => event.type === 'compaction_done'), 'prune tool output before requesting a summary when it is enough');
  const growthRequests = requests.slice(growthStart).filter(item => item.body.stream);
  assert.equal(growthRequests.length, 2);
  const nextTurn = growthRequests[1].body;
  assert(nextTurn.messages.some(message => message.tool_calls?.some(call => call.id === 'live-call')));
  const liveResult = nextTurn.messages.find(message => message.tool_call_id === 'live-call');
  assert(liveResult.content.includes('LIVE_LARGE_TOOL_RESULT'));
  assert(JSON.parse(liveResult.content)._contextPruned);
  assertContextFits(nextTurn.messages, [], small);
  console.log('PASS agent-loop growth: large tool output is pruned before an unnecessary summary, preserving the call/result');

  const nativeHistory = [{id:'native-u',role:'user',content:'Complete the task',createdAt:1},
    {id:'native-a',role:'assistant',content:'Prior work',createdAt:2,toolCalls:Array.from({length:3},(_,i)=>({id:'native-'+i,name:'read',arguments:{path:'file-'+i},resultData:{text:'x'.repeat(18000)}}))},
    {id:'native-last',role:'user',content:'Continue',createdAt:3}];
  const nativeRecovery=makeService(32768,nativeHistory,'google-gemini');
  const nativeStart=requests.length; nativeFailOnce=true;
  await nativeRecovery.run();
  const nativeAttempts=requests.slice(nativeStart).filter(item=>item.body.contents);
  assert.equal(nativeAttempts.length,2,'Gemini should retry once after a real overflow only when pruning reduces the request');
  assert(estimate(nativeAttempts[1].body.contents)<estimate(nativeAttempts[0].body.contents));
  assert.deepEqual(nativeRecovery.stored.messages,nativeHistory);
  assert(nativeRecovery.events.some(event=>event.delta?.includes('整理已完成的工具记录')));
  console.log('PASS native Gemini overflow: reduced request retries once without modifying visible history');

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
