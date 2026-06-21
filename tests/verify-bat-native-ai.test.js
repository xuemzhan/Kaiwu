const { test } = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../scripts/package.js');

test('generateVerifyBat contains 3 reg query lines for native AI keys', () => {
    const s = pkg.generateVerifyBat();
    assert.ok(s.includes('reg query "HKCU\\Software\\Kingsoft\\Office\\6.0\\plugins" /v CloudService'),
        'must query CloudService');
    assert.ok(s.includes('reg query "HKCU\\Software\\Kingsoft\\Office\\6.0\\plugins" /v EnableAI'),
        'must query EnableAI');
    assert.ok(s.includes('reg query "HKCU\\Software\\Kingsoft\\Office\\6.0\\plugins" /v DocerEnabled'),
        'must query DocerEnabled');
});

test('generateVerifyBat still contains existing 6+ verification blocks', () => {
    const s = pkg.generateVerifyBat();
    assert.ok(s.includes('jsaddons folder'), 'must still check jsaddons folder');
    assert.ok(s.includes('publish.xml'), 'must still check publish.xml');
    assert.ok(s.includes('ribbon.xml'), 'must still check ribbon.xml');
    assert.ok(s.includes('index.html'), 'must still check index.html');
    assert.ok(s.includes('taskpane\\index.html') || s.includes('taskpane/index.html'),
        'must still check taskpane/index.html');
    assert.ok(s.includes('authaddin.json'), 'must still check authaddin.json');
});
