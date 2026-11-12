import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
    export { AgentSkillRegistry, appendSkillInstruction, skillResultForContext } from './electron/services/agent/skillRegistry';
    export { runModelStep, partialModelStep } from './electron/services/agent/modelStep';
  ` }, bundle: true, platform: 'node', format: 'cjs', write: false,
  plugins: [{ name: 'test-restricted-access', setup(builder) {
    builder.onResolve({ filter: /restrictedFeatureService$/ }, () => ({ path: 'access', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
      export const restrictedFeatureService = { canUseSkill: () => true, onChange: () => {}, getStatus: () => ({ visible: true }) };
    ` }));
  } }],
});
const subject = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(createRequire(import.meta.url), subject, subject.exports);
const { AgentSkillRegistry, appendSkillInstruction, skillResultForContext, runModelStep, partialModelStep } = subject.exports;
const registry = new AgentSkillRegistry();
const personal = { id: 'my-skill', name: '测试 <技能>', description: 'a & b', category: 'personal', enabled: true,
  systemInstruction: 'UNIQUE_INSTRUCTION_V1\n必须核对真实工具结果。' };
const configured = [personal];
const loaded = registry.load(configured, { name: personal.name });
const parts = [];
appendSkillInstruction(parts, loaded, '自动加载');
appendSkillInstruction(parts, registry.load(configured, { name: personal.id }), '@显式引用');
assert.equal(parts.join('').split(personal.systemInstruction).length - 1, 1);
assert.match(registry.renderCatalog(configured), /测试 &lt;技能&gt;/);
assert.match(registry.renderCatalog(configured), /a &amp; b/);

const system = [{ role: 'system', content: parts.join('\n\n') }];
const deduped = skillResultForContext(loaded, system);
assert.equal(deduped.data.instructionAlreadyLoaded, true);
assert.equal(deduped.data.instruction, undefined);
assert.equal(loaded.data.instruction, personal.systemInstruction, 'Visible receipts and original load are not mutated');
const receipt = { role: 'tool', name: 'skill', content: JSON.stringify(loaded.data) };
assert.equal(skillResultForContext(loaded, [receipt]).data.instructionAlreadyLoaded, true);
assert.equal(skillResultForContext(loaded, [{ ...receipt, content: JSON.stringify({ _contextPruned: true, name: loaded.data.name }) }]).data.instruction, personal.systemInstruction);
assert.equal(skillResultForContext(loaded, []).data.instruction, personal.systemInstruction, 'Compacted-away instructions must be reloadable');
assert.equal(skillResultForContext(loaded, [{ role: 'user', content: personal.systemInstruction }]).data.instruction, personal.systemInstruction);
const updated = registry.load([{ ...personal, systemInstruction: 'UNIQUE_INSTRUCTION_V2' }], { name: personal.id });
assert.equal(skillResultForContext(updated, system).data.instruction, 'UNIQUE_INSTRUCTION_V2', 'An edited skill loads the new body');
assert.throws(() => registry.load([{ ...personal, enabled: false }], { name: personal.id }), /停用/);
assert.throws(() => registry.load([], { name: 42 }), /缺少技能名称/);
assert.throws(() => registry.load([], { name: 'neobi-architect' }), /授权/);
assert(!registry.list([]).some(skill => skill.id === 'skill-neobi-architect'));
assert(registry.list([], { authorized: true }).some(skill => skill.id === 'skill-neobi-architect'));
const official = registry.resolve([], 'neo-nex-dev');
const forged = registry.resolve([{ ...official, category: 'personal', name: 'forged', systemInstruction: 'injected' }], 'neo-nex-dev');
assert.equal(forged.name, official.name);
assert.equal(forged.category, 'builtin');

const page = registry.load([], { name: 'neo-page-code-management' });
const pageParts = [];
appendSkillInstruction(pageParts, page, '页面代码');
appendSkillInstruction(pageParts, page, '再次引用');
assert.equal(pageParts.length, 2, 'One instruction and one resource catalogue');
const pageDeduped = skillResultForContext(page, [{ role: 'system', content: pageParts.join('\n') }]);
assert.deepEqual(pageDeduped.data.resources, page.data.resources);
const resource = registry.load([], { name: 'neo-page-code-management', resource: 'references/browser-workflow.md', offset: 1, limit: 3 });
assert.strictEqual(skillResultForContext(resource, system), resource, 'Resource reads and pagination are never suppressed');
console.log('PASS skills: automatic/explicit/tool dedup, retained-body check, version updates, resources, disabled/license checks and escaped catalogue');

const request = {};
for (const event of [
  { type: 'text-delta', text: 'partial answer' },
  { type: 'reasoning-delta', text: 'partial thought' },
  { type: 'tool-call', id: 'native-call', name: 'write', input: { file_path: 'example' } },
  { type: 'tool-input-delta', id: 'partial-call', name: 'write', text: '{' },
]) {
  const gateway = { async *stream() { yield event; throw new Error('connection interrupted'); } };
  await assert.rejects(runModelStep({ gateway, request }), error => {
    const partial = partialModelStep(error);
    assert.equal(partial.hadToolInput, event.type.startsWith('tool-'));
    assert.equal(partial.content, event.type === 'text-delta' ? event.text : '');
    assert.equal(partial.reasoning, event.type === 'reasoning-delta' ? event.text : '');
    return true;
  });
}
const noFinish = { async *stream() { yield { type: 'tool-call', id: 'call', name: 'write', input: {} }; } };
await assert.rejects(runModelStep({ gateway: noFinish, request }), error => partialModelStep(error)?.hadToolInput === true);
console.log('PASS partial stream evidence: native complete tool calls, argument fragments, text/reasoning and missing finish');
