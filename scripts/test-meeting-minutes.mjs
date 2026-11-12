import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { sendModelText } from './fixtures/model-gateway-responses.mjs';

const require = createRequire(import.meta.url);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'neocrm-meeting-test-'));
async function load(entryPoint, plugins = []) {
  const output = await build({ entryPoints: [entryPoint], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, plugins });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}
try {
  const { analyzeMeeting, analyzeMeetingSpeechArt, splitMeetingTranscript, parseMeetingAnalysis } = await load('electron/services/meetingAnalysis.ts');
  const { formatMeetingMarkdown } = await load('shared/meetingMarkdown.ts');
  const { saveMeetingDocument } = await load('electron/services/meetingDocument.ts');
  const { selectMeetingModel, readMeetingModelStream, requestMeetingModelText } = await load('electron/services/meetingModelClient.ts');
  const modelResponse = topic => JSON.stringify({ summary: {
    executiveSummary: `讨论了${topic}的实现边界。`, strategicContext: '系统对接',
    topics: [{ title: topic, timeRange: '10:00 - 20:00', keyPoints: ['中间时段关键约束：只允许读取业务数据。'], speakers: ['张工'] }],
    keyDecisions: [{ content: '维持读取权限', context: '权限评审' }],
    actionItems: [{ task: '核对权限范围', assignee: '张工', priority: 'high' }],
    risksAndBlockers: [{ risk: '接口权限待核对', suggestion: '建议补充核验' }],
    decisionTradeoffs: [{ topic: '接口', option: '只读接口', pros: ['权限最小化'], cons: [], status: 'adopted', riskLevel: 'low', rationale: '会议明确' }],
  } });
  const meeting = {
    id: 'test_meeting', title: '权限/系统集成会议', date: 1793577600000, duration: 4380,
    speakers: [{ id: 's1', name: '张工', talkRatio: 100, talkTimeSeconds: 4380, avatarColor: '#123456' }],
    segments: Array.from({ length: 579 }, (_, i) => ({ id: `s${i}`, speakerId: 's1', speakerName: '张工', startTime: i * 7, endTime: i * 7 + 7, text: `唯一标记${i}；${'讨论系统接口与审批权限。'.repeat(12)}` })),
    status: 'transcribed', createdAt: Date.now(), updatedAt: Date.now(),
  };
  const chunks = splitMeetingTranscript(meeting);
  assert.ok(chunks.length > 2);
  assert.ok(chunks.every(c => c.length <= 10000));
  for (let i = 0; i < 579; i++) assert.equal(chunks.join('').split(`唯一标记${i}；`).length - 1, 1, `segment ${i} covered exactly once`);
  const huge = { ...meeting, segments: [{ ...meeting.segments[0], text: '甲'.repeat(40000) }] };
  assert.equal(splitMeetingTranscript(huge).join('').match(/甲/g).length, 40000);
  const progress = [];
  const inputs = [];
  const result = await analyzeMeeting(meeting, async (system, input) => {
    inputs.push(input);
    return modelResponse(input.includes('唯一标记') ? '分段权限讨论' : '全会权限讨论');
  }, message => progress.push(message));
  assert.equal(result.summary.sourceSegmentCount, 579);
  assert.equal(result.summary.sourceChunkCount, chunks.length);
  for (let i = 0; i < 579; i++) assert.ok(inputs.slice(0, -1).some(input => input.includes(`唯一标记${i}；`)));
  assert.ok(progress.some(p => p.includes(`${chunks.length}/${chunks.length}`)));
  assert.ok(result.summary.topicTree.children.length > 0);
  // Force hierarchical merging and check that every independently extracted fact survives.
  let extraction = 0;
  let reduction = 0;
  const hierarchical = await analyzeMeeting(meeting, async (system, input) => {
    const response = JSON.parse(modelResponse('分层合并'));
    if (input.includes('唯一标记')) {
      response.summary.topics[0].keyPoints = [`分段事实-${extraction++}；${'细节'.repeat(1800)}`];
    } else {
      const ids = [...new Set(input.match(/分段事实-\d+；/g) || [])];
      response.summary.topics[0].keyPoints = ids;
      if (input.includes('分段事实记录：')) reduction++;
    }
    return JSON.stringify(response);
  });
  assert.ok(reduction > 0, 'hierarchical reducer exercised');
  for (let i = 0; i < chunks.length; i++) assert.ok(hierarchical.summary.topics[0].keyPoints.includes(`分段事实-${i}；`), `merged fact ${i}`);
  await assert.rejects(() => analyzeMeeting(meeting, async () => { throw new Error('HTTP 504'); }), /504/);
  assert.throws(() => parseMeetingAnalysis('{"summary":'), /JSON/);
  assert.throws(() => parseMeetingAnalysis('{}'), /有效/);
  const normalized = parseMeetingAnalysis(JSON.stringify({ summary: { executiveSummary: '有效摘要', topics: [], actionItems: null, keyDecisions: null } }));
  assert.deepEqual(normalized.summary.actionItems, []);
  meeting.summary = result.summary;
  const md = formatMeetingMarkdown(meeting);
  for (const expected of ['系统对接', '权限评审', '张工', '未明确', '接口权限待核对', '只读接口', '议题树', '唯一标记290；', '唯一标记578；']) assert.ok(md.includes(expected), expected);
  assert.ok(!formatMeetingMarkdown(meeting, false).includes('唯一标记0；'));
  assert.ok(!md.includes('截止：尽快'));
  const savedPath = path.join(temporary, '真实纪要.md');
  const saved = await saveMeetingDocument(meeting, temporary, async options => {
    assert.equal(path.dirname(options.defaultPath), temporary);
    assert.equal(path.basename(options.defaultPath), '权限_系统集成会议.md');
    return { canceled: false, filePath: savedPath };
  });
  assert.equal(saved.filePath, savedPath);
  assert.equal(await fs.readFile(savedPath, 'utf8'), md);
  assert.deepEqual(await saveMeetingDocument(meeting, temporary, async () => ({ canceled: true })), { canceled: true });
  await assert.rejects(() => saveMeetingDocument(meeting, temporary, async () => ({ canceled: false, filePath: path.join(temporary, 'missing', 'file.md') })), /ENOENT/);

  const provider = { id: 'workbuddy', name: 'WorkBuddy', enabled: true, apiKey: '', baseUrl: 'http://127.0.0.1:8788/v1', protocol: 'openai-completions', models: [{ id: 'model-a' }] };
  assert.equal(selectMeetingModel({ providers: [provider], settings: { defaultProviderId: 'workbuddy', defaultModelId: 'model-a' } }).provider.id, 'workbuddy');
  assert.equal(selectMeetingModel({ providers: [provider], settings: { defaultProviderId: 'disabled-provider', defaultModelId: 'wrong-model' } }).modelId, 'model-a');
  const sse = Buffer.from('data: {"choices":[{"delta":{"content":"会议内容"}}]}\n\ndata: [DONE]\n');
  const stream = async function* () { for (let i = 0; i < sse.length; i += 2) yield sse.subarray(i, i + 2); };
  assert.equal(await readMeetingModelStream(stream()), '会议内容');
  assert.equal(await requestMeetingModelText(provider, 'model-a', 'system', 'input', 1000, { getAccount: () => ({ accessToken: 'test-only' }), dispatchChat: async () => stream() }), '会议内容');
  await assert.rejects(() => readMeetingModelStream((async function* () { yield 'data: {"choices":[{"finish_reason":"length"}]}\n'; })()), /截断/);

  // Verify each configured protocol against a local HTTP fixture, without contacting any model provider.
  const requests = [];
  let respond;
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const part of req) body += part;
    requests.push({ url: req.url, body: JSON.parse(body), headers: req.headers });
    res.setHeader('content-type', 'application/json');
    if (respond) return respond(req, res);
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname.endsWith('/messages')) sendModelText(res, 'anthropic', '消息协议');
    else if (pathname.endsWith('/responses')) sendModelText(res, 'responses', '响应协议');
    else if (req.url.includes('streamGenerateContent')) sendModelText(res, 'gemini', '原生协议');
    else sendModelText(res, 'chat', '补全协议');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const custom = { ...provider, id: 'custom', name: '本地回归网关', apiKey: 'test-secret-key', baseUrl: origin };
    const call = config => requestMeetingModelText({ ...custom, ...config }, 'model-a', '内部规则', '完整会议-private-transcript', 12000);
    for (const [protocol, expected, route] of [
      ['openai-completions', '补全协议', '/v1/chat/completions'],
      ['openai-responses', '响应协议', '/v1/responses'],
      ['anthropic-messages', '消息协议', '/v1/messages'],
      ['google-gemini', '原生协议', '/v1beta/models/model-a:generateContent'],
    ]) {
      for (const [basePath, expectedRoute] of [
        ['', route], [route, route], [`${route}/`, route],
        [`/gateway${route}`, `/gateway${route}`],
      ]) {
        const before = requests.length;
        assert.equal(await call({ baseUrl: origin + basePath, protocol }), expected);
        assert.equal(requests.at(-1).url, protocol === 'google-gemini' ? expectedRoute.replace(':generateContent', ':streamGenerateContent') + '?alt=sse' : expectedRoute);
        assert.equal(requests.length - before, 1, 'complete endpoints must not be duplicated or probed');
        if (protocol === 'google-gemini') {
          assert.equal(requests.at(-1).headers['x-goog-api-key'], custom.apiKey);
          assert.equal(requests.at(-1).body.contents[0].parts[0].text, '完整会议-private-transcript');
        } else {
          assert.equal(requests.at(-1).body.model, 'model-a');
        }
      }
    }
    for (const [basePath, protocol, expectedRoute] of [
      ['/chat/completions', 'openai-completions', '/chat/completions'],
      ['/responses', 'openai-responses', '/responses'],
      ['/messages', 'anthropic-messages', '/messages'],
      ['/gateway', 'openai-completions', '/gateway/chat/completions'],
      ['/api/paas/v4', 'openai-completions', '/api/paas/v4/chat/completions'],
      ['/compatible-mode/v1', 'openai-completions', '/compatible-mode/v1/chat/completions'],
      ['/v1beta/openai', 'google-gemini', '/v1beta/openai/chat/completions'],
      ['/v1beta/openai/chat/completions', 'google-gemini', '/v1beta/openai/chat/completions'],
      ['/v1beta/models/previous-model:generateContent', 'google-gemini', '/v1beta/models/model-a:streamGenerateContent?alt=sse'],
    ]) {
      await call({ baseUrl: origin + basePath, protocol });
      assert.equal(requests.at(-1).url, expectedRoute);
    }
    await call({ baseUrl: `${origin}/v1/chat/completions?access_token=query-secret#ignored` });
    assert.equal(requests.at(-1).url, '/v1/chat/completions?access_token=query-secret');

    // Retry only the alternate route convention on the same gateway after a route 404.
    for (const [prefix, routes] of [
      ['', ['/v1/chat/completions', '/chat/completions']],
      ['/gateway', ['/gateway/chat/completions', '/gateway/v1/chat/completions']],
    ]) {
      respond = (req, res) => {
        if (req.url === routes[0]) { res.statusCode = 404; return res.end('<html>Cannot POST</html>'); }
        sendModelText(res, 'chat', '路由兼容成功');
      };
      const before = requests.length;
      assert.equal(await call({ baseUrl: origin + prefix }), '路由兼容成功');
      assert.deepEqual(requests.slice(before).map(r => r.url), routes);
      assert.ok(requests.slice(before).every(r => r.body.model === 'model-a'));
    }
    for (const status of [401, 403, 429, 500, 504]) {
      respond = (req, res) => { res.statusCode = status; res.end(JSON.stringify({ error: { message: 'upstream failure' } })); };
      const before = requests.length;
      await assert.rejects(() => call({}), new RegExp(`HTTP ${status}`));
      assert.equal(requests.length - before, 1, `${status} must not change routes`);
    }
    respond = (req, res) => { res.statusCode = 404; res.end(JSON.stringify({ error: { code: 'model_not_found', message: '模型不存在' } })); };
    const beforeModel404 = requests.length;
    await assert.rejects(() => call({}), error => {
      for (const expected of ['HTTP 404', '模型不存在', custom.name, 'model-a', '/v1/chat/completions']) assert.ok(error.message.includes(expected));
      return true;
    });
    assert.equal(requests.length - beforeModel404, 1, 'model 404 must not change routes');

    respond = (req, res) => { res.statusCode = 404; res.end('<html>test-secret-key query-secret private-transcript</html>'); };
    const beforeExplicit404 = requests.length;
    await assert.rejects(() => call({ baseUrl: `${origin}/chat/completions?access_token=query-secret` }), error => {
      assert.match(error.message, /HTTP 404/);
      assert.ok(error.message.includes(`${origin}/chat/completions`));
      for (const secret of ['test-secret-key', 'query-secret', 'access_token', 'private-transcript', '<html>']) assert.ok(!error.message.includes(secret));
      return true;
    });
    assert.equal(requests.length - beforeExplicit404, 1, 'explicit endpoint 404 must not guess routes');
    await assert.rejects(() => call({ baseUrl: 'file:///tmp/test' }), /HTTP/);
  } finally { await new Promise(resolve => server.close(resolve)); }

  // Exercise real persistence: failed reanalysis must not replace an existing summary or leave status stuck.
  const { MeetingService } = await load('electron/services/meetingService.ts', [{
    name: 'electron-test-host', setup(builder) {
      builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'test' }));
      builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `export const app = {getPath: () => ${JSON.stringify(temporary)}, isPackaged: false}; export const dialog = {}; export const BrowserWindow = {};` }));
    },
  }]);
  const service = new MeetingService({
    getAiConfig: () => ({ providers: [provider], settings: { defaultProviderId: 'workbuddy', defaultModelId: 'model-a' } }),
    requestMeetingAnalysisText: async () => { throw new Error('模拟上游 HTTP 504'); },
  });
  service.saveMeeting(meeting);
  await assert.rejects(() => service.summarizeMeeting(meeting.id), /504/);
  const retained = service.getMeetingById(meeting.id);
  assert.equal(retained.summary.executiveSummary, meeting.summary.executiveSummary);
  assert.equal(retained.segments.length, 579);
  assert.equal(retained.status, 'transcribed');
  assert.match(retained.statusMessage, /失败/);
  // Duplicate requests share one analysis, retain checked tasks, and produce no invented chart data.
  let calls = 0;
  let resume;
  const gate = new Promise(resolve => { resume = resolve; });
  const successful = new MeetingService({
    getAiConfig: () => ({ providers: [provider], settings: { defaultProviderId: 'workbuddy', defaultModelId: 'model-a' } }),
    requestMeetingAnalysisText: async () => { calls++; await gate; return modelResponse('权限讨论'); },
  });
  const small = { ...meeting, id: 'small_meeting', segments: meeting.segments.slice(0, 2), summary: structuredClone(meeting.summary) };
  small.summary.actionItems[0].completed = true;
  successful.saveMeeting(small);
  const first = successful.summarizeMeeting(small.id);
  const second = successful.summarizeMeeting(small.id);
  assert.equal(first, second);
  resume();
  const completed = await first;
  assert.equal(calls, 1);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.summary.actionItems[0].completed, true);
  assert.deepEqual(completed.charts.sentimentTrajectory, []);
  assert.equal(completed.charts.milestoneGantt, undefined);
  const portrait = { speechArt: {
    overallAtmosphere: 'analytical', atmosphereLabel: '审慎讨论', atmosphereScore: 75,
    cadenceSummary: '发言围绕接口权限逐项核对。',
    speakerProfiles: [{ speakerId: 's1', speakerName: '张工', styleType: 'analytical', strengths: ['逐项确认'] }],
  } };
  let returnPortrait = true;
  const artService = new MeetingService({
    getAiConfig: () => ({ providers: [provider], settings: { defaultProviderId: 'workbuddy', defaultModelId: 'model-a' } }),
    requestMeetingAnalysisText: async (p, model, system, input) => {
      assert.match(system, /只分析沟通方式/);
      assert.match(input, /唯一标记0/);
      return JSON.stringify(returnPortrait ? portrait : { speechArt: null });
    },
  });
  const withArt = await artService.summarizeMeeting(small.id, { kind: 'speech_art' });
  assert.equal(withArt.speechArt.speakerProfiles[0].speakerId, 's1');
  assert.deepEqual(withArt.summary, JSON.parse(JSON.stringify(completed.summary)));
  assert.deepEqual(withArt.charts, JSON.parse(JSON.stringify(completed.charts)));
  returnPortrait = false;
  await assert.rejects(() => artService.summarizeMeeting(small.id, { kind: 'speech_art' }), /没有返回有效的语艺画像/);
  assert.deepEqual(artService.getMeetingById(small.id).speechArt, JSON.parse(JSON.stringify(withArt.speechArt)));
  assert.deepEqual((await successful.summarizeMeeting(small.id)).speechArt, JSON.parse(JSON.stringify(withArt.speechArt)));
  const observedChunks = [];
  await analyzeMeetingSpeechArt(meeting, async (system, input) => {
    if (system.includes('只分析沟通方式')) {
      assert.match(input, /尾段证据/);
      return JSON.stringify(portrait);
    }
    observedChunks.push(input);
    return JSON.stringify({ evidence: [input.includes('唯一标记578；') ? '尾段证据' : '其他时段证据'] });
  });
  assert.equal(observedChunks.length, chunks.length);
  console.log('会议纪要测试通过：579 段全文覆盖、超长单段、失败保留、JSON 校验、完整复制文档、实际文件保存/取消/失败、WorkBuddy SSE、四种模型协议、网关路径兼容、404 分类和错误脱敏。');
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
