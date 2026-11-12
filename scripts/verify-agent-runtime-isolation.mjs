import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const artifact = path.resolve(process.argv[2] || 'dist-electron');
if (artifact.endsWith('.asar')) {
  const asar = require('@electron/asar');
  for (const relative of ['dist-electron/agent-runtime-host.js', 'dist-electron/agent-runtime-process.js']) {
    assert(asar.listPackage(artifact).some(name => name.replace(/^[/\\]/, '').replace(/\\/g, '/') === relative), `Packaged ${relative} is missing`);
  }
}
const directory = artifact.endsWith('.asar') ? path.join(artifact, 'dist-electron') : artifact;
const hostFile = path.join(directory, 'agent-runtime-host.js');
const runtimeFile = path.join(directory, 'agent-runtime-process.js');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-agent-runtime-test-'));
const host = path.join(temporary, 'host.cjs');
await fs.writeFile(host, `
  const { app } = require('electron');
  const assert = require('node:assert/strict');
  const http = require('node:http');
  const { pathToFileURL } = require('node:url');
  app.whenReady().then(async () => {
    const { AgentRuntimeHost } = await import(pathToFileURL(${JSON.stringify(hostFile)}).href);
    const runtime = new AgentRuntimeHost(${JSON.stringify(runtimeFile)}, { test: true, maxBufferedEvents: 128 });
    let requests = 0, slowRequests = 0, closed = 0;
    const server = http.createServer(async (request, response) => {
      requests++; let raw=''; for await (const part of request) raw += part;
      const body = JSON.parse(raw), model = body.model;
      if (model.startsWith('slow')) { slowRequests++; response.setHeader('content-type','text/event-stream'); response.write('data: '+JSON.stringify({choices:[{delta:{content:'started'},finish_reason:null}]})+'\\n\\n'); response.on('close',()=>{if(!response.writableEnded)closed++}); return; }
      if (model === 'flood') {
        response.setHeader('content-type','text/event-stream');
        for (let index=0; index<5000; index++) response.write('data: '+JSON.stringify({choices:[{delta:{content:'x'},finish_reason:null}]})+'\\n\\n');
        response.end('data: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\\n\\ndata: [DONE]\\n\\n'); return;
      }
      response.setHeader('content-type','text/event-stream');
      response.end('data: '+JSON.stringify({choices:[{delta:{content:'isolated-ok'},finish_reason:'stop'}]})+'\\n\\ndata: [DONE]\\n\\n');
    });
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    const provider = {id:'fixture',name:'Fixture',protocol:'openai-completions',baseUrl:'http://127.0.0.1:'+server.address().port,apiKey:'',models:[],enabled:true,type:'custom'};
    const request = modelId => ({provider,modelId,system:'runtime',messages:[{role:'user',parts:[{type:'text',text:'test'}]}],maxOutputTokens:32,timeoutMs:10000});
    assert.equal((await runtime.generateText(request('fixture'))).text,'isolated-ok');
    const firstPid = runtime.status().pid;
    assert(firstPid && firstPid !== process.pid);
    assert(runtime.status().heapLimit > 0, 'Utility runtime reports its actual V8 heap limit');
    const concurrentControllers = Array.from({length:3}, () => new AbortController());
    const concurrent = concurrentControllers.map((controller,index) => runtime.generateText({...request('slow-concurrent-'+index), signal: controller.signal}));
    while(slowRequests<3) await new Promise(r=>setTimeout(r,10));
    assert.equal(slowRequests,3,'Three simultaneous session requests reach the isolated process');
    const cancelStarted = Date.now();
    // Cancel through the generator request signal; the server must observe the stream closing promptly.
    const cancellation = new AbortController();
    const cancellable = runtime.generateText({...request('slow-concurrent-cancel'),signal:cancellation.signal});
    while(slowRequests<4) await new Promise(r=>setTimeout(r,10));
    cancellation.abort(); await assert.rejects(cancellable,error=>error.name==='AbortError');
    assert(Date.now()-cancelStarted<1000,'Cancellation returns promptly while other sessions are active');
    concurrentControllers.forEach(controller => controller.abort());
    await Promise.all(concurrent.map(promise => promise.catch(error => assert.equal(error.name,'AbortError'))));
    const floodController = new AbortController();
    const flood = runtime.stream({...request('flood'), signal: floodController.signal});
    await flood.next();
    await new Promise(r=>setTimeout(r,100));
    await assert.rejects(async () => { for await (const _ of flood) {} }, /事件积压超过安全上限/);
    const capControllers = Array.from({length:8}, () => new AbortController());
    const capBase = slowRequests;
    const capped = capControllers.map((controller,index) => runtime.generateText({...request('slow-cap-'+index), signal: controller.signal}));
    while(slowRequests<capBase+8) await new Promise(r=>setTimeout(r,10));
    await assert.rejects(runtime.generateText(request('slow-over-cap')), /并发已达 8 个请求上限/);
    capControllers.forEach(controller => controller.abort());
    await Promise.all(capped.map(promise => promise.catch(error => assert.equal(error.name,'AbortError'))));
    const baseline = slowRequests;
    const controller = new AbortController();
    const cancelled = runtime.generateText({...request('slow-cancel'),signal:controller.signal});
    while(slowRequests<baseline + 1) await new Promise(r=>setTimeout(r,10));
    controller.abort(); await assert.rejects(cancelled,error=>error.name==='AbortError');
    const crashed = runtime.generateText(request('slow-crash'));
    while(slowRequests<baseline + 2) await new Promise(r=>setTimeout(r,10));
    await runtime.testCrash();
    await assert.rejects(crashed,error=>error.runtimeCrashed===true && error.nonRetryable===true);
    assert.equal(slowRequests,baseline + 2,'crashed request is never replayed');
    assert.equal((await runtime.generateText(request('fixture'))).text,'isolated-ok');
    assert.notEqual(runtime.status().pid,firstPid);
    assert(requests >= 17,'All concurrency, overflow, admission, cancellation and restart requests were observed');
    await runtime.dispose();
    const limited = new AgentRuntimeHost(${JSON.stringify(runtimeFile)}, { test: true, maxRssBytes: 1024 * 1024 * 1024, heartbeatIntervalMs: 10000 });
    const overBudget = limited.generateText(request('slow-memory'));
    const limitedBaseline = slowRequests;
    while(slowRequests<limitedBaseline + 1) await new Promise(r=>setTimeout(r,10));
    await limited.testRssWatchdog();
    await assert.rejects(overBudget,error=>error.runtimeCrashed===true && error.nonRetryable===true);
    assert.equal(slowRequests,limitedBaseline + 1,'RSS watchdog termination never retries the in-flight model request');
    await limited.dispose();
    server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));
    assert(closed>=1);
    console.log('PASS utility Agent runtime: isolated PID, bounded RSS watchdog, cancellation, crash containment, no replay and restart');
    app.exit(0);
  }).catch(error=>{console.error(error);app.exit(1)});
`);
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
try {
  const output = await new Promise((resolve, reject) => {
    const child = spawn(require('electron'), [host, '--no-sandbox'], { env, stdio: ['ignore','pipe','pipe'] });
    let stdout='',stderr=''; const timer=setTimeout(()=>{child.kill();reject(new Error('Agent runtime isolation test timed out'))},45000);
    child.stdout.on('data',value=>stdout+=value);child.stderr.on('data',value=>stderr+=value);
    child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);code===0?resolve(stdout):reject(new Error(stderr||stdout||'runtime test failed'))});
  });
  process.stdout.write(output);
} finally { await fs.rm(temporary,{recursive:true,force:true}); }
