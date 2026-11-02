module.exports = async function (context) {
  const path = require('node:path');
  const { Arch } = require('builder-util');
  const { verifyPackagedFfmpeg } = await import('./verify-packaged-ffmpeg.mjs');
  const isMac = context.electronPlatformName === 'darwin';
  const resourcesDir = isMac
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');
  await verifyPackagedFfmpeg(resourcesDir, context.electronPlatformName, Arch[context.arch]);
};
