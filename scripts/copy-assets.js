const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const vendorDir = path.join(root, 'taskpane', 'vendor');

const assets = [
  ['node_modules/marked/marked.min.js', 'marked.min.js'],
  ['node_modules/mermaid/dist/mermaid.min.js', 'mermaid.min.js'],
  ['node_modules/html2canvas/dist/html2canvas.min.js', 'html2canvas.min.js'],
  ['node_modules/highlight.js/styles/github.min.css', 'highlight-github.min.css']
];

fs.mkdirSync(vendorDir, { recursive: true });

for (const [source, target] of assets) {
  const sourcePath = path.join(root, source);
  const targetPath = path.join(vendorDir, target);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing asset: ${source}`);
  }
  fs.copyFileSync(sourcePath, targetPath);
  console.log(`[assets] ${source} -> taskpane/vendor/${target}`);
}
