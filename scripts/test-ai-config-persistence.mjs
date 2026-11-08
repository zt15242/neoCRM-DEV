import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-ai-config-'));
const configPath = path.join(fixture, 'neocrm_ai_config.json');
const originalRead = fs.readFileSync;
const originalWrite = fs.writeFileSync;
const originalAsyncWrite = fs.promises.writeFile;
const originalRename = fs.promises.rename;
try {
  const subject = path.join(fixture, 'subject.cjs');
  await build({ stdin: { resolveDir: root, loader: 'ts', contents: `
    export { AiService } from './electron/services/aiService';
    export { BUILTIN_AI_PROVIDERS, BUILTIN_AI_SKILLS } from './shared/constants';
  ` }, bundle: true, platform: 'node', format: 'cjs', outfile: subject, external: ['esbuild'], logLevel: 'silent',
    plugins: [{name:'fixture-host',setup(builder){
      builder.onResolve({filter:/^electron$/},()=>({path:'electron',namespace:'fixture-host'}));
      builder.onLoad({filter:/.*/,namespace:'fixture-host'},()=>({contents:`export const app={getPath:()=>${JSON.stringify(fixture)}}; export const shell={},dialog={},BrowserWindow=class {};`}));
    }}],
  });
  const { AiService, BUILTIN_AI_PROVIDERS, BUILTIN_AI_SKILLS } = createRequire(import.meta.url)(subject);
  const ai = new AiService({}, {}, {});
  const provider = {id:'fixture',type:'custom',name:'Gateway',enabled:true,apiKey:'fixture-only',baseUrl:'https://example.test/v1',
    models:Array.from({length:2000},(_,i)=>({id:'model-'+i,name:'Model '+i,contextWindow:100000}))};
  await ai.saveProvider(provider);
  const old = await fs.promises.readFile(configPath,'utf8');
  // Fail on synchronous configuration I/O, while leaving module loading and other services alone.
  fs.readFileSync = function(file,...args){assert.notEqual(String(file),configPath,'sync config read');return originalRead.call(this,file,...args);};
  fs.writeFileSync = function(file,...args){assert.notEqual(String(file),configPath,'sync config write');return originalWrite.call(this,file,...args);};
  let release, entered;
  const paused = new Promise(resolve=>{entered=resolve;});
  const resume = new Promise(resolve=>{release=resolve;});
  let first = true;
  fs.promises.writeFile = async (...args) => { if(first){first=false;entered();await resume;}return originalAsyncWrite(...args); };
  const settings = ai.saveAiSettings({defaultSqlLimit:720});
  await paused;
  const skill = ai.saveSkill({id:'skill-user-fixture',name:'Personal',category:'personal',enabled:true,systemInstruction:'keep this entire instruction'});
  const mcp = ai.saveMcpServer({id:'mcp-fixture',name:'Tools',type:'sse',enabled:false,url:'https://example.test/mcp',tools:[]});
  let responded = false;
  await new Promise(resolve=>setImmediate(()=>{responded=true;resolve();}));
  assert(responded);
  assert.equal(await fs.promises.readFile(configPath,'utf8'),old,'old config must remain intact before commit');
  release();
  await Promise.all([settings,skill,mcp]);
  fs.promises.writeFile = originalAsyncWrite;
  const saved = await ai.getAiConfigAsync();
  assert.equal(saved.settings.defaultSqlLimit,720);
  assert.equal(saved.providers.find(p=>p.id==='fixture').models.length,2000);
  assert.equal(saved.skills.find(s=>s.id==='skill-user-fixture').systemInstruction,'keep this entire instruction');
  assert(saved.mcpServers.some(s=>s.id==='mcp-fixture'));
  assert.equal(BUILTIN_AI_PROVIDERS.some(p=>p.id==='fixture'),false,'defaults must not be mutated');
  console.log('PASS async configuration I/O, responsive event loop, atomic commit and concurrent update retention');

  const committed = await fs.promises.readFile(configPath,'utf8');
  fs.promises.rename = async (from,to) => { if(to===configPath)throw new Error('fixture disk failure');return originalRename(from,to); };
  await assert.rejects(ai.saveAiSettings({defaultSqlLimit:800}),/fixture disk failure/);
  assert.equal(await fs.promises.readFile(configPath,'utf8'),committed);
  assert.equal((await fs.promises.readdir(fixture)).some(file=>file.endsWith('.tmp')),false);
  fs.promises.rename = originalRename;
  await ai.saveAiSettings({defaultSqlLimit:960});
  assert.equal((await ai.getAiConfigAsync()).settings.defaultSqlLimit,960);
  const builtin = BUILTIN_AI_SKILLS[0];
  await ai.saveSkill({...builtin,category:'personal',systemInstruction:'TAMPER_SENTINEL'});
  await ai.deleteSkill(builtin.id);
  const raw = await fs.promises.readFile(configPath,'utf8');
  assert(!raw.includes('TAMPER_SENTINEL'));
  assert((await ai.getAiConfigAsync()).skills.some(s=>s.id===builtin.id));
  assert((await ai.getAiConfigAsync()).skills.filter(s=>s.category==='builtin').every(s=>s.systemInstruction===undefined));
  await fs.promises.writeFile(configPath,'{broken json');
  await assert.rejects(ai.saveAiSettings({defaultSqlLimit:100}));
  assert.equal(await fs.promises.readFile(configPath,'utf8'),'{broken json');
  console.log('PASS disk failure surfaced, prior file preserved, queue recovers, protected skills remain redacted and corrupt config is not overwritten');
} finally {
  fs.readFileSync=originalRead;fs.writeFileSync=originalWrite;fs.promises.writeFile=originalAsyncWrite;fs.promises.rename=originalRename;
  await fs.promises.rm(fixture,{recursive:true,force:true});
}
