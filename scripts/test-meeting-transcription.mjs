import assert from 'node:assert/strict';
import {
  extractTranscriptionText,
  getAudioMimeType,
  getTranscriptionEndpoint,
  getTranscriptionErrorMessage,
  getTranscriptionTimeoutMs,
  shouldRetryWithoutVerboseJson,
  validateOpenAiAudioFile,
} from '../electron/services/meetingTranscription.ts';

assert.equal(getAudioMimeType('meeting.webm'), 'audio/webm');
assert.equal(getAudioMimeType('meeting.m4a'), 'audio/mp4');
assert.equal(getAudioMimeType('meeting.wav'), 'audio/wav');
assert.equal(getAudioMimeType('meeting.unknown'), 'application/octet-stream');

assert.equal(getTranscriptionEndpoint('https://api.openai.com/v1/'), 'https://api.openai.com/v1/audio/transcriptions');
assert.equal(getTranscriptionEndpoint('https://gateway.example/api/audio/transcriptions'), 'https://gateway.example/api/audio/transcriptions');
assert.equal(getTranscriptionEndpoint('https://gateway.example/api'), 'https://gateway.example/api/v1/audio/transcriptions');

assert.equal(validateOpenAiAudioFile('meeting.webm', 1024, 'https://api.openai.com/v1'), null);
assert.equal(validateOpenAiAudioFile('meeting.ogg', 1024, 'https://api.openai.com/v1'), null);
assert.match(validateOpenAiAudioFile('meeting.aac', 1024, 'https://api.openai.com/v1') || '', /不支持/);
assert.match(validateOpenAiAudioFile('meeting.mp3', 26 * 1024 * 1024, 'https://api.openai.com/v1') || '', /25 MB/);
assert.equal(validateOpenAiAudioFile('meeting.ogg', 30 * 1024 * 1024, 'https://gateway.example/v1'), null);

assert.equal(extractTranscriptionText({ text: '  会议纪要内容  ' }), '会议纪要内容');
assert.equal(extractTranscriptionText('{"text":"兼容接口返回"}'), '兼容接口返回');
assert.equal(extractTranscriptionText('纯文本转写'), '纯文本转写');
assert.equal(extractTranscriptionText({ segments: [{ text: '只有片段' }] }), '');

assert.equal(shouldRetryWithoutVerboseJson({ response: { status: 400, data: { error: { message: 'verbose_json unsupported' } } } }), true);
assert.equal(shouldRetryWithoutVerboseJson({ response: { status: 401, data: 'invalid key' } }), false);
assert.match(getTranscriptionErrorMessage({ code: 'ECONNABORTED' }, 180_000), /180 秒/);
assert.match(getTranscriptionErrorMessage({ response: { status: 401, data: { message: 'invalid key' } } }, 120_000), /HTTP 401：invalid key/);
assert.ok(getTranscriptionTimeoutMs(25 * 1024 * 1024) > getTranscriptionTimeoutMs(5 * 1024 * 1024));

console.log('会议转写请求与响应兼容性测试通过');
