import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { sendModelText } from './fixtures/model-gateway-responses.mjs';

// Can inspect dist-electron directly or the actual packaged ASAR. No accounts or external requests.
const artifact = path.resolve(process.argv[2] || 'dist-electron');
let temporary;
let directory = artifact;
let gateway;
let server;
try {
  if (artifact.endsWith('.asar')) {
    const asar = createRequire(import.meta.url)('@electron/asar');
    const files = asar.listPackage(artifact, { isPack: false }).filter(file => /^[/\\]dist-electron[/\\].+\.js$/.test(file));
    assert.ok(files.length > 0, 'Packaged Agent JavaScript is missing');
    temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-packaged-agent-'));
    await fs.writeFile(path.join(temporary, 'package.json'), JSON.stringify({ type: 'module' }));
    for (const name of files) {
      const relative = name.replace(/^[/\\]/, '').replace(/\\/g, '/');
      const target = path.join(temporary, relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, asar.extractFile(artifact, relative, true));
    }
    directory = path.join(temporary, 'dist-electron');
  }
  const { ModelGateway } = await import(pathToFileURL(path.join(directory, 'agent-model-gateway.js')).href);
  gateway = new ModelGateway();
  const requests = [];
  server = http.createServer((request, response) => {
    request.resume();
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const transport = pathname.endsWith('/responses') ? 'responses' : pathname.endsWith('/messages') ? 'anthropic' : pathname.includes(':streamGenerateContent') ? 'gemini' : 'chat';
    requests.push(transport);
    sendModelText(response, transport, 'packaged-agent-ok');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  for (const protocol of ['openai-completions', 'openai-responses', 'anthropic-messages', 'google-gemini']) {
    const result = await gateway.generateText({
      provider: { id: 'build-smoke', name: 'Build smoke', protocol, apiKey: '', baseUrl: `http://127.0.0.1:${server.address().port}`, models: [], enabled: true, type: 'custom' },
      modelId: 'fixture', system: 'smoke', messages: [{ role: 'user', parts: [{ type: 'text', text: 'test' }] }], maxOutputTokens: 32, timeoutMs: 10000,
    });
    assert.equal(result.text, 'packaged-agent-ok', protocol);
  }
  assert.deepEqual(requests, ['chat', 'responses', 'anthropic', 'gemini']);
  console.log(`PASS built Agent gateway: independent load and four protocol chunks (${process.platform}, Node ${process.versions.node}${process.versions.electron ? `, Electron ${process.versions.electron}` : ''})`);
} finally {
  if (gateway) await gateway.dispose();
  if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (temporary) await fs.rm(temporary, { recursive: true, force: true });
}
