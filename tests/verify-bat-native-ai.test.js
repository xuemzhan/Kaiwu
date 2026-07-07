const { test } = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../scripts/package.js');

test('generateVerifyBat still contains existing verification blocks', () => {
    const s = pkg.generateVerifyBat();
    assert.ok(s.includes('jsaddons folder'), 'must check jsaddons folder');
    assert.ok(s.includes('publish.xml'), 'must check publish.xml');
    assert.ok(s.includes('ribbon.xml'), 'must check ribbon.xml');
    assert.ok(s.includes('index.html'), 'must check index.html');
    assert.ok(s.includes('taskpane') && s.includes('index.html'), 'must check taskpane/index.html');
    assert.ok(s.includes('authaddin.json'), 'must check authaddin.json');
});

test('generateVerifyBat contains status section', () => {
    const s = pkg.generateVerifyBat();
    assert.ok(s.includes('Status'), 'must include status section');
    assert.ok(s.includes('EnableAI'), 'must check EnableAI per version');
    assert.ok(s.includes('DISABLED'), 'must check for DISABLED status');
});

test('generateVerifyBat contains service and process checks', () => {
    const s = pkg.generateVerifyBat();
    assert.ok(s.includes('sc query') || s.includes('SC QUERY'), 'must check service status');
    assert.ok(s.includes('tasklist'), 'must check running processes');
    assert.ok(s.includes('wpscloudsvr'), 'must reference wpscloudsvr');
});

test('generateVerifyBat has user-friendly output', () => {
    const s = pkg.generateVerifyBat();
    assert.ok(s.includes('File status'), 'must have file status section');
    assert.ok(s.includes('Process status'), 'must have process status section');
    assert.ok(s.includes('To disable'), 'must provide instructions');
});

test('generateVerifyBat has LF line endings (toCRLF applied on write)', () => {
    const s = pkg.generateVerifyBat();
    assert.ok(s.includes('\n'), 'must use LF line endings');
});
