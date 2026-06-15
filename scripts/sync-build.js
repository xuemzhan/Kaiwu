const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const buildRoot = path.join(root, 'wps-addon-build');

// 源 -> 构建 的目录映射 (同步内容但不删除构建目录独有文件)
const mirrorDirs = [
  ['taskpane', 'taskpane'],
  ['floating', 'floating'],
  ['images', 'images']
];

// 单独同步的文件 (根目录)
const mirrorFiles = [
  'ribbon.js',
  'ribbon.xml',
  'component.js',
  'index.html'
];

// 跳过同步的子目录 (vendor 由 copy-assets 维护; node_modules; 临时构建产物)
const skipDirs = new Set(['node_modules', 'vendor', '.git']);

function walkSync(srcDir, destDir, rel) {
  if (!fs.existsSync(srcDir)) return;
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (skipDirs.has(entry.name)) continue;
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      walkSync(srcPath, destPath, rel ? rel + '/' + entry.name : entry.name);
    } else {
      fs.copyFileSync(srcPath, destPath);
      console.log('[sync] ' + (rel ? rel + '/' : '') + entry.name);
    }
  }
}

for (const [src, dest] of mirrorDirs) {
  walkSync(path.join(root, src), path.join(buildRoot, dest), src);
}

for (const f of mirrorFiles) {
  const srcPath = path.join(root, f);
  const destPath = path.join(buildRoot, f);
  if (!fs.existsSync(srcPath)) continue;
  fs.copyFileSync(srcPath, destPath);
  console.log('[sync] ' + f);
}

console.log('[sync] done');
