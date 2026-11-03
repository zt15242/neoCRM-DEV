import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const canonicalName = (name) => name.replace(/[ ._-]/g, '').toLowerCase();

export function normalizeManifest(content, assetNames) {
  let references = 0;
  const normalized = content.replace(/^(\s*(?:-\s*)?(?:url|path):\s*)([^\r\n]+)$/gm, (_line, prefix, value) => {
    const reference = value.trim().replace(/^(['"])(.*)\1$/, '$2');
    const matches = assetNames.filter((name) => canonicalName(name) === canonicalName(reference));
    if (matches.length !== 1) {
      throw new Error(`Expected one release asset for ${reference}; found ${matches.length}`);
    }
    references += 1;
    return `${prefix}${JSON.stringify(matches[0])}`;
  });
  if (references === 0) throw new Error('Update manifest contains no asset references');
  return normalized;
}

export function normalizeReleaseDirectory(directory, metadataPath) {
  const entries = fs.readdirSync(directory);
  let assetNames;
  if (metadataPath) {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    assetNames = metadata.assets.filter((asset) => asset.state === 'uploaded' && asset.size > 0).map((asset) => asset.name);
  } else {
    // GitHub rewrites spaces in uploaded asset names. Use stable names before upload.
    const binaries = entries.filter((name) => /\.(dmg|zip|exe)$/.test(name));
    assetNames = binaries.map((name) => name.replace(/ /g, '-'));
    if (new Set(assetNames).size !== assetNames.length) throw new Error('Release asset filename collision');
    for (let index = 0; index < binaries.length; index += 1) {
      if (binaries[index] !== assetNames[index]) {
        fs.renameSync(path.join(directory, binaries[index]), path.join(directory, assetNames[index]));
      }
    }
  }
  const manifests = ['latest-mac.yml', 'latest.yml'];
  // Validate both manifests before changing either file.
  const updates = manifests.map((name) => {
    const filename = path.join(directory, name);
    const content = fs.readFileSync(filename, 'utf8');
    return { filename, content: normalizeManifest(content, assetNames) };
  });
  for (const update of updates) fs.writeFileSync(update.filename, update.content);
  console.log('Verified Mac and Windows update manifest asset references');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , directory, metadataPath] = process.argv;
  if (!directory) throw new Error('Usage: node normalize-release-manifests.mjs <directory> [release.json]');
  normalizeReleaseDirectory(directory, metadataPath);
}
