import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const nodeModules = path.resolve(process.argv[2] || 'node_modules');
const requiredFiles = [
  'esbuild/package.json',
  'react/package.json',
  'react/jsx-runtime.js',
  'react-dom/client.js',
  'lucide-react/package.json',
];
const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(nodeModules, file)));
if (missing.length) {
  throw new Error(`Widget runtime dependencies are missing from ${nodeModules}: ${missing.join(', ')}`);
}

const require = createRequire(path.join(nodeModules, '__neo_widget_smoke_test__.cjs'));
const esbuild = require(path.join(nodeModules, 'esbuild'));
const result = await esbuild.build({
  stdin: {
    contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import { ShieldCheck } from 'lucide-react'; export default function Widget() { return <div><ShieldCheck /></div>; }`,
    resolveDir: process.cwd(),
    sourcefile: 'widget-smoke-test.tsx',
    loader: 'tsx',
  },
  outfile: 'widget-smoke-test.js',
  bundle: true,
  write: false,
  nodePaths: [nodeModules],
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
});

if (!result.outputFiles?.some((file) => file.path.endsWith('.js'))) {
  throw new Error('Widget runtime smoke test produced no JavaScript output');
}

console.log(`Packaged widget runtime is ready (esbuild ${esbuild.version}).`);
