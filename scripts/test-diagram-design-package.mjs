import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = JSON.parse(await fs.readFile(path.join(project, 'electron/security/diagramDesignSkill.json'), 'utf8'));
const raw = gunzipSync(Buffer.from(bundle.content, 'base64'));
assert.equal(createHash('sha256').update(raw).digest('hex'), bundle.sha256);
const files = JSON.parse(raw);
assert.equal(Object.keys(files).length, bundle.resourceCount);
assert.equal(files.LICENSE, await fs.readFile(path.join(project, 'docs/third-party/diagram-design.LICENSE'), 'utf8'));
assert.match(files.LICENSE, /Copyright \(c\) 2025 Cathryn Lavery/);
console.log('PASS bundled resource count, SHA-256 and distributed MIT notice');

const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-diagram-package-'));
try {
  // Exercise the scripts as materialized by an agent from paged skill resources.
  for (const [resource, content] of Object.entries(files)) {
    if (!resource.startsWith('scripts/')) continue;
    const target = path.join(fixture, resource);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  const inputs = [
    { script: 'mermaid_extract.py', name: 'sample.mmd', content: 'flowchart LR\n A[需求] --> B[交付]\n' },
    { script: 'drawio_extract.py', name: 'sample.drawio', content:
      '<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
      '<mxCell id="a" value="需求" vertex="1" parent="1"><mxGeometry x="20" y="20" width="100" height="60" as="geometry"/></mxCell>' +
      '<mxCell id="b" value="交付" vertex="1" parent="1"><mxGeometry x="180" y="20" width="100" height="60" as="geometry"/></mxCell>' +
      '<mxCell id="e" edge="1" source="a" target="b" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>' },
    { script: 'excalidraw_extract.py', name: 'sample.excalidraw', content: JSON.stringify({ type: 'excalidraw', version: 2,
      elements: [{ id: 'a', type: 'rectangle', x: 0, y: 0, width: 100, height: 60 },
        { id: 'b', type: 'rectangle', x: 180, y: 0, width: 100, height: 60 }] }) },
  ];
  function countNodes(value) {
    if (!value || typeof value !== 'object') return 0;
    return Object.entries(value).reduce((sum, [key, child]) => sum + (key === 'nodes' && Array.isArray(child)
      ? child.length : countNodes(child)), 0);
  }
  for (const input of inputs) {
    const target = path.join(fixture, input.name);
    await fs.writeFile(target, input.content);
    const result = spawnSync('python3', [path.join(fixture, 'scripts', input.script), target, '--json'], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, `${input.script}: ${result.error || result.stderr}`);
    assert.equal(countNodes(JSON.parse(result.stdout)), 2, input.name);
    console.log(`PASS packaged ${input.script}: materialized source extracts two real nodes`);
  }
} finally { await fs.rm(fixture, { recursive: true, force: true }); }
