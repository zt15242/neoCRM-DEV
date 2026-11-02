import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const require = createRequire(import.meta.url);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'neocrm-meeting-test-'));
async function load(entryPoint, plugins = []) {
  const output = await build({ entryPoints: [entryPoint], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false, plugins });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}
try {
  const { analyzeMeeting, splitMeetingTranscript, parseMeetingAnalysis } = await load('electron/services/meetingAnalysis.ts');
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
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const part of req) body += part;
    requests.push({ url: req.url, body: JSON.parse(body), headers: req.headers });
    res.setHeader('content-type', 'application/json');
    const response = req.url.endsWith('/messages') ? { content: [{ type: 'text', text: '消息协议' }] }
      : req.url.endsWith('/responses') ? { output: [{ content: [{ type: 'output_text', text: '响应协议' }] }] }
      : req.url.includes('generateContent') ? { candidates: [{ content: { parts: [{ text: '原生协议' }] } }] }
      : { choices: [{ message: { content: '补全协议' } }] };
    res.end(JSON.stringify(response));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const [protocol, expected, route] of [
      ['openai-completions', '补全协议', '/v1/chat/completions'],
      ['openai-responses', '响应协议', '/v1/responses'],
      ['anthropic-messages', '消息协议', '/v1/messages'],
      ['google-gemini', '原生协议', '/v1/models/model-a:generateContent'],
    ]) {
      const actual = await requestMeetingModelText({ ...provider, id: 'custom', apiKey: 'test-only', baseUrl: `http://127.0.0.1:${server.address().port}`, protocol }, 'model-a', '规则', '完整会议', 12000);
      assert.equal(actual, expected);
      assert.equal(requests.at(-1).url, route);
    }
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
  console.log('会议纪要测试通过：579 段全文覆盖、超长单段、失败保留、JSON 校验、完整复制文档、实际文件保存/取消/失败、WorkBuddy SSE 与四种模型协议。');
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
