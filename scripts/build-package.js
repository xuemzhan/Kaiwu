const fs = require('fs');
const path = require('path');
const { buildWithArgs } = require('../node_modules/wpsjs/src/lib/build.js');

const pluginType = process.argv[2] || 'online';

if (!['online', 'offline'].includes(pluginType)) {
  console.error('Usage: node scripts/build-package.js <online|offline>');
  process.exit(1);
}

buildWithArgs({ pluginType })
  .then((buildDir) => {
    cleanupBuildArtifacts(buildDir);
    console.log(`[build] ${pluginType} package generated at ${buildDir}`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

function cleanupBuildArtifacts(buildDir) {
  const names = [
    'debug.out.log',
    'debug.err.log',
    'screen.png',
    'screen-wps.png',
    'screen-wps-pid.png',
    'screen-after-wps-start.png',
    'wps-window.png'
  ];
  for (const name of names) {
    const target = path.join(buildDir, name);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { force: true });
    }
  }
}
