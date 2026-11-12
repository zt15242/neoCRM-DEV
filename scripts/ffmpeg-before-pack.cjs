module.exports = async function (context) {
  const { Arch } = require('builder-util');
  const { prepareFfmpeg } = await import('./prepare-ffmpeg.mjs');
  const { execFileSync } = require('node:child_process');
  const path = require('node:path');
  execFileSync(process.execPath, [path.join(context.packager.projectDir, 'scripts/prepare-neo-cli.mjs'), context.electronPlatformName, Arch[context.arch]], { stdio: 'inherit' });
  await prepareFfmpeg({
    projectDir: context.packager.projectDir,
    platform: context.electronPlatformName,
    arch: Arch[context.arch],
  });
};
