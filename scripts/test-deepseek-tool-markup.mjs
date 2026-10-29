import assert from 'node:assert/strict';
import { DeepSeekToolMarkupFilter } from '../electron/services/deepSeekToolMarkup.mjs';

const protocol = '<DSML|invoke name="bash"><DSML|parameter name="command" string="true">echo probe</DSML|parameter></DSML|invoke><DSML|invoke name="run_code"><DSML|parameter name="code" string="true">const r = await tools.list_entities({}); return r;</DSML|parameter></DSML|invoke>';

function filterChunks(chunks) {
  const filter = new DeepSeekToolMarkupFilter();
  let visible = '';
  for (const chunk of chunks) visible += filter.push(chunk);
  visible += filter.finish();
  return { visible, hadMarkup: filter.hadMarkup };
}

const whole = filterChunks([`准备排查。${protocol}检查完毕。`]);
assert.equal(whole.visible, '准备排查。检查完毕。');
assert.equal(whole.hadMarkup, true);
assert.doesNotMatch(whole.visible, /DSML|list_entities|echo probe/);

const oneCharacterAtATime = filterChunks([...`开始${protocol}结束`]);
assert.equal(oneCharacterAtATime.visible, '开始结束');
assert.equal(oneCharacterAtATime.hadMarkup, true);

const fullwidth = filterChunks(['前文<｜DSML｜tool_calls><｜DSML｜invoke name="run_code"><｜DSML｜parameter name="code" string="true">return 1;</｜DSML｜parameter></｜DSML｜invoke></｜DSML｜tool_calls>后文']);
assert.equal(fullwidth.visible, '前文后文');
assert.equal(fullwidth.hadMarkup, true);

const malformed = filterChunks(['可见内容<|DSML|invoke name="run_code">partial secret code']);
assert.equal(malformed.visible, '可见内容');
assert.equal(malformed.hadMarkup, true);

const ordinary = filterChunks(['普通回答里提到 DSML 这个词，但没有协议标记。']);
assert.equal(ordinary.visible, '普通回答里提到 DSML 这个词，但没有协议标记。');
assert.equal(ordinary.hadMarkup, false);

console.log('DeepSeek DSML stream filtering tests passed.');
