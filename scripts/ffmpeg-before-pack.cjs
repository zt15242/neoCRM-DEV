module.exports = async function (context) {
  const { Arch } = require('builder-util');
  const { prepareFfmpeg } = await import('./prepare-ffmpeg.mjs');
  await prepareFfmpeg({
    projectDir: context.packager.projectDir,
    platform: context.electronPlatformName,
    arch: Arch[context.arch],
  });
};
