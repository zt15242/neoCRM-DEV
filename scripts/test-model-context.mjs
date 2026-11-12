import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { modelTextFrames, modelToolFrames, sendModelText, sseFrames } from './fixtures/model-gateway-responses.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-model-context-'));
await fs.rm(path.join(fixture, 'neocrm_ai_context_caps.json'), { force: true });
const require = createRequire(import.meta.url);
let server;
try {
  const output = path.join(fixture, 'subject.cjs');
  await build({ stdin: { resolveDir: root, loader: 'ts', contents: `
    export * from './electron/services/modelContext';
    export { shouldLoadBusinessTypeSkill } from './electron/security/neoCliConversation';
    export { AiService } from './electron/services/aiService';
    export { VisionImageLoader } from './electron/services/visionAttachments';
    export { TextMask } from './electron/services/textMask';
    export { freeWebSearch } from './electron/services/freeWebSearch';
    export { currentDateContext } from './electron/services/currentDate';
    export { modelTokenReference, applyModelTokenReference } from './shared/modelTokenCatalog';
    export { modelPriceReference, modelVendorPriceSuggestion, effectiveModelPrice } from './shared/modelPriceCatalog';
  ` }, bundle: true, platform: 'node', format: 'cjs', outfile: output, external: ['esbuild'], logLevel: 'silent',
    plugins: [{ name: 'isolated-model-host', setup(builder) {
      builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
        export const app = { getPath: () => ${JSON.stringify(fixture)} };
        export const dialog = {}, shell = {}, BrowserWindow = class {};
      ` }));
    } }],
  });
  const { AiService, VisionImageLoader, TextMask, freeWebSearch, currentDateContext, modelTokenReference, applyModelTokenReference, modelPriceReference, modelVendorPriceSuggestion, effectiveModelPrice, getModelContextBudget: budgetFor, estimateContextTokens: estimate, readModelTokenLimits,
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
  assert.deepEqual(readModelTokenLimits({context_length:1048576,max_output_tokens:65536},{...blankGemini,contextWindow:32000,tokenLimitsSource:'user'}), {contextWindow:32000,maxOutputTokens:undefined,inputPricePerMillion:undefined,outputPricePerMillion:undefined,priceCurrency:undefined,priceSource:undefined});
  console.log('PASS verified model defaults match exact official providers; existing and manual limits take priority');
  const officialDeepseek={baseUrl:'https://api.deepseek.com'};
  const flash={id:'deepseek-flash',name:'Flash'};
  assert.deepEqual(effectiveModelPrice(officialDeepseek,flash),{input:0.3,output:1.2,currency:'USD',source:'reference'});
  assert.equal(effectiveModelPrice({baseUrl:'https://proxy.test'},flash).input,0.3);
  assert.equal(effectiveModelPrice(officialDeepseek,{...flash,id:'deepseek-chat'}),undefined);
  assert.deepEqual(effectiveModelPrice(officialDeepseek,{...flash,inputPricePerMillion:0,outputPricePerMillion:5,priceCurrency:'CNY'}),{input:0,output:5,currency:'CNY',source:'user'});
  assert.equal(effectiveModelPrice(officialDeepseek,{...flash,priceSource:'user'}),undefined);
  const priceModel={id:'gemini-3.8-flash',name:'Flash'};
  assert.equal(effectiveModelPrice(officialGemini,priceModel,new Date('2026-12-31T00:00:00Z')).input,0.75);
  assert.equal(effectiveModelPrice(officialGemini,priceModel,new Date('2027-01-01T00:00:00Z')),undefined);
  assert.equal(effectiveModelPrice({baseUrl:'https://dashscope.aliyuncs.com'}, {id:'qwen-plus-2025-12-01',name:'qwen'}).currency,'CNY');
  assert(modelPriceReference(officialDeepseek,'deepseek-flash').source.startsWith('https://'));
  assert.equal(modelPriceReference({baseUrl:'https://api.siliconflow.cn/v1'},'deepseek-ai/DeepSeek-R1').output,16);
  assert.equal(modelPriceReference({baseUrl:'https://dashscope.aliyuncs.com'},'qwen-max').output,9.6);
  assert.equal(modelVendorPriceSuggestion('DeepSeek-V4.1-Flash').modelId,'deepseek-flash');
  assert.equal(modelVendorPriceSuggestion('DeepSeek-V4.1-Flash').reference.input,0.3);
  assert.equal(modelVendorPriceSuggestion('gpt-6-astra').reference.output,50);
  assert.equal(modelVendorPriceSuggestion('default-model'),undefined);
  assert.equal(modelVendorPriceSuggestion('deepseek-v4.1-flash-unverified'),undefined);
  assert.equal(effectiveModelPrice({baseUrl:'http://127.0.0.1:8788/v1'},{id:'deepseek-v4.1-flash',name:'Flash'}).input,0.3);
  assert.equal(effectiveModelPrice({baseUrl:'http://127.0.0.1:8788/v1'},{id:'unknown-model',name:'Unknown'}),undefined);

  console.log('PASS price catalogue exact match, expired price, user override, zero price and currency');


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
  let failureStatus = 0, failOnce = false, nativeFailOnce = false, summaryFailure = false, reportedLimit = 8192, delayedSummary, toolScenario = 0, visionToolScenario = false, featureScenario = '', unifiedProtocol = '', unifiedTurn = 0;
  server = http.createServer(async (request, response) => {
    if (request.method === 'GET') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({data: [{id: 'fixture', context_length: 1048576, max_output_tokens: 8192}, {id: 'unknown'}]})); return;
    }
    let raw = ''; for await (const part of request) raw += part;
    const body = JSON.parse(raw);
    const summary = JSON.stringify(body).includes('将新增历史和已有摘要合并为可继续工作的工程检查点');
    requests.push({url: request.url, body, summary});
    if (summary) {
      if (summaryFailure) { response.statusCode = 503; response.end('fixture summary unavailable'); return; }
      if (delayedSummary) { delayedSummary(); return; }
      const markers = [...new Set(JSON.stringify(body).match(/MARKER_\d+/g) || [])].join(' ');
      sendModelText(response, body.contents ? 'gemini' : 'chat', '## Primary Request and Intent\n- SUMMARY ' + markers);
      return;
    }
    if (unifiedProtocol) {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      const transport = pathname.endsWith('/responses') ? 'responses' : pathname.endsWith('/messages') ? 'anthropic'
        : pathname.includes(':streamGenerateContent') ? 'gemini' : 'chat';
      unifiedTurn++;
      response.setHeader('Content-Type', 'text/event-stream');
      response.end(sseFrames(unifiedTurn === 1
        ? modelToolFrames(transport, 'fixture_read', { path: 'README.md' }, 'unified-call')
        : modelTextFrames(transport, '统一循环完成')));
      return;
    }
    if (featureScenario && (body.stream || body.contents)) {
      const scenario = featureScenario; featureScenario = '';
      const native = !!body.contents;
      response.setHeader('Content-Type', 'text/event-stream');
      if (scenario === 'reject_usage') { response.statusCode = 400; response.end(JSON.stringify({error:{message:'unsupported stream_options include_usage'}})); return; }
      if (scenario === 'context_loop') {
        response.statusCode = 400;
        response.end(JSON.stringify({ error: { message: 'prompt is too long' } }));
        return;
      }
      if (['stream_drop', 'tool_stream_drop'].includes(scenario)) {
        const output = scenario === 'tool_stream_drop'
          ? native ? {candidates:[{content:{parts:[{functionCall:{name:'fixture_read',args:{}}}]}}]}
            : {choices:[{delta:{tool_calls:[{index:0,id:'partial-tool',type:'function',function:{name:'fixture_read',arguments:'{}'}}]}}]}
          : native ? {candidates:[{content:{parts:[{text:'部分输出'}]}}]} : {choices:[{delta:{content:'部分输出'}}]};
        response.write('data: '+JSON.stringify(output)+'\n\n');
        setTimeout(() => response.destroy(), 40); return;
      }
      if (scenario === 'mask') {
        const text = JSON.stringify(body);
        const tag = text.match(/⟦NEO_EMAIL_\d+⟧/)?.[0] || 'not-found';
        const output = native ? {candidates:[{content:{parts:[{text:'邮箱：'+tag}]},finishReason:'STOP'}]} : {choices:[{delta:{content:'邮箱：'+tag},finish_reason:'stop'}]};
        response.end('data: '+JSON.stringify(output)+'\n\ndata: [DONE]\n\n'); return;
      }
      if (['length', 'reasoning_length', 'reasoning_stop', 'reasoning_repeat'].includes(scenario)) {
        const reasoning = scenario !== 'length';
        const stop = scenario === 'reasoning_stop' || scenario === 'reasoning_repeat';
        if (scenario === 'reasoning_repeat') featureScenario = scenario;
        const output = native
          ? {candidates:[{content:{parts:[reasoning ? {text:'只供思考的内容',thought:true} : {text:'第一段'}]},finishReason:stop ? 'STOP' : 'MAX_TOKENS'}]}
          : {choices:[{delta:reasoning ? {reasoning_content:'只供思考的内容'} : {content:'第一段'},finish_reason:stop ? 'stop' : 'length'}]};
        response.end('data: '+JSON.stringify(output)+'\n\ndata: [DONE]\n\n'); return;
      }
      if (scenario === 'dsml') {
        const pieces = ['准备读取。<|', '|DSML|| calls><||DSML|| invoke name="bash">', '<||DSML|| parameter name="command">echo NEVER_EXECUTE_DSML'];
        response.end(pieces.map((content, i) => 'data: ' + JSON.stringify({choices:[{delta:{content},finish_reason:i === pieces.length - 1 ? 'length' : null}]}) + '\n\n').join(''));
        return;
      }
      if (scenario === 'usage') {
        const output = native ? {candidates:[{content:{parts:[{text:'用量测试'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:1000,candidatesTokenCount:200}} : {choices:[{delta:{content:'用量测试'},finish_reason:'stop'}],usage:{prompt_tokens:1000,completion_tokens:200}};
        response.end('data: '+JSON.stringify(output)+'\n\ndata: [DONE]\n\n'); return;
      }
    }
    if (visionToolScenario && (body.stream || body.contents)) {
      visionToolScenario = false;
      response.setHeader('Content-Type', 'text/event-stream');
      const call = body.contents
        ? {candidates:[{content:{role:'model',parts:[{functionCall:{name:'read_image',args:{file_path:'fixture.png'}}}]},finishReason:'STOP'}]}
        : {choices:[{delta:{tool_calls:[{index:0,id:'image-call',type:'function',function:{name:'read_image',arguments:JSON.stringify({file_path:'fixture.png'})}}]},finish_reason:'tool_calls'}]};
      response.end('data: ' + JSON.stringify(call) + '\n\ndata: [DONE]\n\n'); return;
    }
    if (body.contents && nativeFailOnce) { nativeFailOnce=false; response.statusCode=400; response.end(JSON.stringify({error:{message:'maximum context length exceeded'}})); return; }
    if (body.stream && [1, 3, 4].includes(toolScenario)) {
      if (toolScenario === 4) featureScenario = 'reasoning_length';
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
    response.setHeader('Content-Type', 'text/event-stream');
    response.end(body.contents
      ? 'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"fixture native reply"}]},"finishReason":"STOP"}]}\n\n'
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
    service.getSessions = async () => [structuredClone(stored)];
    service.getSession = async id => id === stored.id ? structuredClone(stored) : null;
    service.persistSession = async value => { stored = structuredClone(value); return structuredClone(stored); };
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
    const historyWithImages = Array.from({ length: 5 }, (_, index) => ({
      id: 'old-image-' + index, role: 'user', content: '历史图片', createdAt: index,
      attachments: [{ name: 'old-' + index + '.png', size: png.length, contentKind: 'image', fullPath: path.join(fixture, 'missing-old-' + index + '.png') }],
    }));
    const following = makeService(1048576, [...historyWithImages, ...imageMessages], protocol);
    await following.run();
    const followingBody = JSON.stringify(requests.at(-1).body);
    assert.equal(followingBody.split(png.toString('base64')).length - 1, 1);
    assert.match(followingBody, /old-4.png/);
    const tooMany = makeService(1048576, [{
      ...imageMessages[0], attachments: historyWithImages.flatMap(item => item.attachments),
    }], protocol);
    const beforeRejection = requests.length;
    await assert.rejects(tooMany.run(), /本轮添加了 5 张图片.*最多可同时识别 4 张/);
    assert.equal(requests.length, beforeRejection);
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
  for (const protocol of ['openai-completions', 'openai-responses', 'anthropic-messages', 'google-gemini']) {
    const unified = makeService(1048576, [{id:'unified-user',role:'user',content:'读取项目信息',createdAt:1}], protocol);
    unified.config.settings.enableCrmTools = true;
    const executions = [];
    unified.service.executeUnifiedTool = async (name, args) => {
      executions.push({ name, args });
      return { data: { source: 'UNIFIED_TOOL_RESULT' }, summary: '统一工具已执行' };
    };
    unifiedProtocol = protocol;
    unifiedTurn = 0;
    const start = requests.length;
    await unified.run({ enableTools: true, mode: 'standard' });
    const calls = requests.slice(start).filter(item => !item.summary);
    assert.equal(calls.length, 2, protocol);
    assert.deepEqual(executions, [{ name: 'fixture_read', args: { path: 'README.md' } }], protocol);
    assert(unified.events.some(event => event.type === 'tool_update' && event.toolCall?.status === 'success'), protocol);
    assert(unified.events.some(event => event.type === 'content_delta' && event.delta?.includes('统一循环完成')), protocol);
    assert(JSON.stringify(calls[1].body).includes('UNIFIED_TOOL_RESULT'), protocol);
  }
  unifiedProtocol = '';
  console.log('PASS unified Agent loop: OpenAI Chat, Responses, Anthropic and Gemini share one tool lifecycle');
  const mask = new TextMask();
  const raw = '邮箱 test@example.com 电话 13812345678';
  const masked = mask.mask(raw);
  assert(!masked.includes('test@example.com') && !masked.includes('13812345678'));
  assert.equal(mask.restore(masked), raw);
  assert.equal(mask.mask(raw), masked);
  assert(!mask.mask('卡号 4111 1111 1111 1111').includes('4111 1111 1111 1111'));
  assert(mask.mask('编号 1234567890123').includes('1234567890123'));
  const instant = new Date('2025-12-31T16:30:00Z');
  assert(currentDateContext(instant, 'Asia/Shanghai').includes('2026-01-01'));
  assert(currentDateContext(instant, 'America/Los_Angeles').includes('2025-12-31'));
  assert(currentDateContext(instant, 'Asia/Shanghai').includes('用户明确指定的历史日期保持不变'));
  let filteredUrl = '';
  const historicQuery = '2025年3月 国内新闻';
  const recent = await freeWebSearch([historicQuery], async url => {
    filteredUrl = url;
    return '<div class="result"><a class="result__a" href="https://example.com/2025">2025 新闻</a></div>';
  }, 'month');
  assert.equal(new URL(filteredUrl).searchParams.get('q'), historicQuery);
  assert.equal(new URL(filteredUrl).searchParams.get('df'), 'm');
  assert.match(recent.warnings[0], /核实/);
  const noDateFilter = await freeWebSearch(['当前新闻'], async url => {
    if (url.includes('duckduckgo')) throw new Error('unavailable');
    return '<li class="b_algo"><h2><a href="https://example.com/doc">News</a></h2></li>';
  }, 'day');
  assert.match(noDateFilter.warnings[0], /不支持时间过滤/);
  await assert.rejects(() => freeWebSearch(['news'], async () => '', 'invalid'), /时间范围/);
  const search = await freeWebSearch(['test'], async url => {
    if (url.includes('duckduckgo')) throw new Error('unavailable');
    return '<li class="b_algo"><h2><a href="https://example.com/doc">Test page</a></h2><p>Test result</p></li>';
  });
  assert.equal(search.sources[0].url, 'https://example.com/doc');
  const failedSearch = await freeWebSearch(['test'], async () => { throw new Error('unavailable'); });
  assert.equal(failedSearch.totalResults,0); assert(failedSearch.warnings?.length);
  for (const protocol of ['openai-completions','google-gemini']) {
    const scenarioMessages = [{id:'user',role:'user',content:'查询 test@example.com 的资料',createdAt:1}];
    const privacy = makeService(1048576,scenarioMessages,protocol);
    privacy.config.settings.maskModelText=true; privacy.config.settings.enableCrmTools=true;
    featureScenario='mask'; const start = requests.length;
    await privacy.run({enableTools:true,mode:'standard'});
    const request = requests.slice(start).find(item=>item.body.stream || item.body.contents).body;
    assert(!JSON.stringify(request).includes('test@example.com'), protocol + ' redacts outgoing email');
    assert(!request.tools, protocol + ' disables tools');
    assert(JSON.stringify(request).includes(currentDateContext()), protocol + ' receives device date and timezone');
    assert(privacy.events.filter(event=>event.type==='content_delta').map(event=>event.delta).join('').includes('test@example.com'), 'restores output on device');
    const blocked = makeService(1048576,scenarioMessages,protocol);
    blocked.config.settings.maskModelText=true; blocked.config.settings.enableCrmTools=true;
    let executions=0; blocked.service.executeUnifiedTool=async()=>{ executions++; return {data:{},summary:'unsafe'}; };
    visionToolScenario=true; await blocked.run({enableTools:true,mode:'standard'});
    assert.equal(executions,0,'mask mode blocks unsolicited tool calls');
    assert(blocked.events.some(event=>event.toolCall?.status==='error'));
    const usage = makeService(1048576,scenarioMessages,protocol);
    usage.config.providers[0].models[0].inputPricePerMillion=2;
    usage.config.providers[0].models[0].outputPricePerMillion=5;
    featureScenario='usage'; await usage.run();
    const metric=usage.events.find(event=>event.type==='usage')?.usage;
    assert.equal(metric.promptTokens,1000); assert.equal(metric.completionTokens,200); assert.equal(metric.source,'reported');
    assert.equal(metric.estimatedCostUsd,0.003);
    const cny=makeService(1048576,scenarioMessages,protocol);
    Object.assign(cny.config.providers[0].models[0],{inputPricePerMillion:0.8,outputPricePerMillion:2,priceCurrency:'CNY'});
    featureScenario='usage'; await cny.run();
    const yuan=cny.events.find(event=>event.type==='usage')?.usage;
    assert.equal(yuan.costCurrency,'CNY'); assert.equal(yuan.estimatedCost,0.0012); assert.equal(yuan.estimatedCostUsd,undefined);
    const missing=makeService(1048576,scenarioMessages,protocol);
    Object.assign(missing.config.providers[0].models[0],{inputPricePerMillion:2,outputPricePerMillion:5});
    await missing.run();
    const estimate=missing.events.find(event=>event.type==='usage')?.usage;
    assert.equal(estimate.source,'estimated'); assert(estimate.promptTokens>0 && estimate.completionTokens>0);
    assert(estimate.estimatedCost>0);
    if (protocol === 'openai-completions') {
      const unsupported=makeService(1048576,scenarioMessages,protocol);
      featureScenario='reject_usage'; const retryStart=requests.length;
      await unsupported.run();
      const retryBodies=requests.slice(retryStart).filter(item=>item.body.stream).map(item=>item.body);
      assert.equal(retryBodies.length,2);
      assert.equal(retryBodies[0].stream_options.include_usage,true);
      assert.equal(retryBodies[1].stream_options,undefined);
      assert.equal(unsupported.events.find(event=>event.type==='usage').usage.source,'estimated');
    }
    const continuation=makeService(1048576,scenarioMessages,protocol);
    continuation.config.settings.autoContinueTruncated=true;
    featureScenario='length'; const offset=requests.length;
    await continuation.run();
    assert.equal(requests.slice(offset).filter(item=>item.body.stream||item.body.contents).length,2);
    assert(continuation.events.some(event=>event.delta?.includes('输出达到上限')));
    if (protocol === 'openai-completions') {
      const noProgress = makeService(1048576, scenarioMessages, protocol);
      featureScenario = 'context_loop';
      const noProgressOffset = requests.length;
      await assert.rejects(noProgress.run(), /已停止重试/);
      const repeatedRequests = requests.slice(noProgressOffset).filter(item => item.body.stream);
      assert.equal(repeatedRequests.length, 1, 'stop instead of replaying an unchanged over-limit request');
      assert(!noProgress.events.some(event => event.delta?.includes('(1/2)')), 'do not announce a retry before a smaller request is ready');
      assert.equal(noProgress.service.learnedContextInputCaps.size, 0, 'do not persist a guess when the irreducible prompt itself exceeds the gateway');
    }
    for (const scenario of ['reasoning_length', 'reasoning_stop', 'reasoning_repeat']) {
      const reasoningOnly = makeService(1048576, scenarioMessages, protocol);
      reasoningOnly.config.settings.autoContinueTruncated = scenario === 'reasoning_length';
      const start = requests.length;
      featureScenario = scenario;
      if (scenario === 'reasoning_repeat') await assert.rejects(reasoningOnly.run(), /模型未输出正文，本轮未完成/);
      else await reasoningOnly.run();
      featureScenario = '';
      const attempts = requests.slice(start).filter(item => item.body.stream || item.body.contents);
      assert.equal(attempts.length, scenario === 'reasoning_repeat' ? 3 : 2);
      assert.match(JSON.stringify(attempts[1].body), /上一轮未输出正文/);
      assert.doesNotMatch(JSON.stringify(attempts[1].body), /只供思考的内容/);
      assert.equal(reasoningOnly.events.some(event => event.type === 'error'), scenario === 'reasoning_repeat');
    }
    const interrupted=makeService(1048576,scenarioMessages,protocol);
    interrupted.config.settings.autoContinueTruncated=true;
    featureScenario='stream_drop'; const failureOffset=requests.length;
    await interrupted.run();
    assert.equal(requests.slice(failureOffset).filter(item=>item.body.stream||item.body.contents).length,2);
    assert(interrupted.events.some(event=>event.delta?.includes('网络中断')));
    for (const [scenario, autoContinue] of [['stream_drop', false], ['tool_stream_drop', true]]) {
      const unsafe = makeService(1048576, scenarioMessages, protocol);
      unsafe.config.settings.autoContinueTruncated = autoContinue;
      unsafe.config.settings.enableCrmTools = true;
      unsafe.service.executeUnifiedTool = async () => { assert.fail('An interrupted tool stream must not execute or replay tools'); };
      featureScenario = scenario;
      const from = requests.length;
      await assert.rejects(unsafe.run({ mode: 'standard', enableTools: true }));
      assert.equal(requests.slice(from).filter(item => item.body.stream || item.body.contents).length, 1, `${protocol}: do not replay ${scenario}`);
      assert(!unsafe.events.some(event => event.delta?.includes('正在重试')));
    }
  }
  const markupRecovery = makeService(1048576, [{id:'markup-user',role:'user',content:'检查当前项目',createdAt:1}]);
  markupRecovery.config.settings.autoContinueTruncated = true;
  markupRecovery.config.settings.enableCrmTools = true;
  markupRecovery.service.executeUnifiedTool = async () => { assert.fail('DSML text must not execute a tool'); };
  featureScenario = 'dsml';
  const markupStart = requests.length;
  await markupRecovery.run({mode:'standard', enableTools:true});
  const markupRequests = requests.slice(markupStart);
  assert.equal(markupRequests.length, 2);
  assert.match(JSON.stringify(markupRequests[1].body), /结构化工具调用继续/);
  assert.doesNotMatch(JSON.stringify(markupRequests[1].body), /NEVER_EXECUTE_DSML|<\|\|DSML/);
  assert.doesNotMatch(markupRecovery.events.map(event => event.delta || '').join(''), /NEVER_EXECUTE_DSML|<\|\|DSML/);
  assert(!markupRecovery.events.some(event => event.type === 'tool_start' && event.toolCall?.name === 'bash'));
  const wbMessages = [{id:'user',role:'user',content:'帮我看今天的新闻',createdAt:1}];
  const workbuddy = makeService(1048576,wbMessages);
  workbuddy.config.providers[0].id='workbuddy';
  workbuddy.config.providers[0].models=[{id:'gemini-3.8-flash-high',name:'Gemini'}];
  let wbRequest;
  workbuddy.service.workbuddyService={getAccount:()=>({accessToken:'fixture'}), dispatchChat: async body=>{
    wbRequest=body;
    return Readable.from([Buffer.from('data: '+JSON.stringify({choices:[{delta:{content:'模拟新闻'},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n')]);
  }};
  await workbuddy.run({providerId:'workbuddy',modelId:'gemini-3.8-flash-high'});
  const wbUsage=workbuddy.events.find(event=>event.type==='usage')?.usage;
  assert.equal(wbRequest.stream_options,undefined);
  assert.equal(wbUsage?.source,'estimated'); assert(wbUsage?.totalTokens>0);
  assert(wbUsage?.estimatedCost>0); assert.equal(wbUsage.costCurrency,'USD');
  console.log('PASS WorkBuddy without provider usage shows estimated tokens and model-reference price');
  console.log('PASS search fallback, opt-in masking, reported usage and bounded truncated-output continuation for both protocols');
  requests.length = 0;
  const big = makeService(1048576);
  await big.run();
  assert.equal(big.events.filter(event => event.type === 'compaction_done').length, 0);
  let chat = requests.filter(item => item.body.stream).at(-1).body;
  for (let index = 0; index < 8; index++) assert(JSON.stringify(chat).includes('MARKER_' + index));
  assert.equal(requests.filter(item => item.summary).length, 0);
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
  for (const item of requests.filter(item => item.summary)) assertContextFits(item.body.messages, [], budgetFor(providerFor(32768), 'fixture', item.body.max_completion_tokens ?? item.body.max_tokens));
  console.log('PASS automatic compaction: same history retained for 1M and summarized for 32K; summary requests and current request fit; visible history retained');

  const escapedStart = requests.length;
  const escapedHistory = history.map(message => ({...message, content: message.id === 'latest' ? message.content : '\\"\n'.repeat(4000)}));
  const escaped = makeService(8192, escapedHistory);
  await escaped.run();
  const summaryRequests = requests.slice(escapedStart).filter(item => item.summary);
  assert(summaryRequests.length > 1);
  for (const item of summaryRequests) assertContextFits(item.body.messages, [], budgetFor(providerFor(8192), 'fixture', item.body.max_completion_tokens ?? item.body.max_tokens));
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
  for (const item of requests.slice(correctionStart).filter(item => item.summary)) assertContextFits(item.body.messages, [], budgetFor(providerFor(8192), 'fixture', item.body.max_completion_tokens ?? item.body.max_tokens));
  const capFile = path.join(fixture, 'neocrm_ai_context_caps.json');
  const persistedCaps = JSON.parse(await fs.readFile(capFile, 'utf8'));
  const persistedCap = Object.values(persistedCaps)[0];
  assert.equal(typeof persistedCap, 'number');
  assert(!JSON.stringify(persistedCaps).includes('fixture'), 'persisted limits contain no provider URL, ID or credentials');
  const afterRestart = makeService(1048576, mediumHistory);
  const afterRestartStart = requests.length;
  await afterRestart.run();
  assert.equal([...afterRestart.service.learnedContextInputCaps.values()][0], persistedCap);
  const afterRestartBody = requests.slice(afterRestartStart).filter(item => item.body.stream).at(-1).body;
  assert(estimate(afterRestartBody.messages) <= persistedCap, 'later turns automatically fit the learned gateway input budget');
  console.log('PASS context-limit recovery: explicit server capacity corrects the budget, checkpoints with that capacity, then retries within the reduced window');

  const liveRecovery = makeService(32768, mediumHistory);
  let executions = 0;
  liveRecovery.service.executeUnifiedTool = async () => { executions++; return {data: {value: 'LIVE_TOOL_RESULT', stdout: 'tool output '.repeat(3000)}, summary: 'fixture'}; };
  const liveStart = requests.length;
  toolScenario = 1;
  await assert.rejects(liveRecovery.run(), /已停止重试|无法安全压缩/);
  const liveRequests = requests.slice(liveStart).filter(item => !item.summary && item.body.stream);
  assert.equal(executions, 1, 'context recovery must not repeat a completed tool');
  assert.equal(liveRequests.length, 2);
  assert.equal(liveRecovery.events.filter(event => event.type === 'tool_start' && event.toolCall?.name === 'fixture_read').length, 1);
  assert(liveRequests[1].body.messages.some(message => message.tool_calls?.some(call => call.id === 'live-call')),
    'the failed request history retains the completed tool identity');
  console.log('PASS live tool overflow: stops when the prompt itself cannot fit and never reruns the completed tool');

  const reasoningRecovery = makeService(1048576, mediumHistory);
  reasoningRecovery.config.settings.autoContinueTruncated = true;
  let recoveredExecutions = 0;
  reasoningRecovery.service.executeUnifiedTool = async () => {
    recoveredExecutions++;
    return {data: {value: 'REASONING_RECOVERY_RECEIPT'}, summary: 'fixture'};
  };
  const reasoningStart = requests.length;
  toolScenario = 4;
  await reasoningRecovery.run();
  const reasoningRequests = requests.slice(reasoningStart).filter(item => !item.summary && item.body.stream);
  assert.equal(reasoningRequests.length, 3);
  assert.equal(recoveredExecutions, 1);
  assert(reasoningRequests[2].body.messages.some(message => message.tool_call_id === 'live-call' && message.content.includes('REASONING_RECOVERY_RECEIPT')));
  console.log('PASS reasoning-only continuation retains tool results without dispatching the completed tool again');

  const growingTurn = makeService(32768, mediumHistory);
  growingTurn.service.executeUnifiedTool = async () => ({data: {value: 'LIVE_LARGE_TOOL_RESULT', stdout: 'tool data '.repeat(12000)}, summary: 'fixture'});
  const growthStart = requests.length;
  toolScenario = 3;
  await growingTurn.run();
  assert.equal(growingTurn.events.some(event => event.type === 'compaction_done'), true, 'checkpoint the large completed tool output before retrying');
  const growthRequests = requests.slice(growthStart).filter(item => !item.summary && item.body.stream);
  assert.equal(growthRequests.length, 2);
  const nextTurn = growthRequests[1].body;
  assert(nextTurn.messages.some(message => message.tool_calls?.some(call => call.id === 'live-call')));
  const liveResult = nextTurn.messages.find(message => message.tool_call_id === 'live-call');
  assert(liveResult.content.includes('LIVE_LARGE_TOOL_RESULT'));
  assert(JSON.parse(liveResult.content)._contextPruned);
  assertContextFits(nextTurn.messages, [], small);
  console.log('PASS agent-loop growth: large tool output is pruned and the completed call/result pairing is retained');

  const nativeHistory = [{id:'native-u',role:'user',content:'Complete the task',createdAt:1},
    {id:'native-a',role:'assistant',content:'Prior work',createdAt:2,toolCalls:Array.from({length:3},(_,i)=>({id:'native-'+i,name:'read',arguments:{path:'file-'+i},resultData:{text:'x'.repeat(18000)}}))},
    {id:'native-last',role:'user',content:'Continue',createdAt:3}];
  const nativeRecovery=makeService(32768,nativeHistory,'google-gemini');
  assert.notEqual(nativeRecovery.service.getContextCapKey(nativeRecovery.config.providers[0], 'fixture'),
    big.service.getContextCapKey(big.config.providers[0], 'fixture'), 'Learned gateway limits are scoped to their protocol');
  const nativeStart=requests.length; nativeFailOnce=true;
  await nativeRecovery.run();
  const nativeAttempts=requests.slice(nativeStart).filter(item=>!item.summary && item.body.contents);
  assert.equal(nativeAttempts.length,2,'Gemini should retry once after a real overflow only when pruning reduces the request');
  assert(estimate(nativeAttempts[1].body.contents)<estimate(nativeAttempts[0].body.contents));
  assert.deepEqual(nativeRecovery.stored.messages,nativeHistory);
  assert.equal(nativeRecovery.events.some(event=>event.type === 'error'), false);
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
