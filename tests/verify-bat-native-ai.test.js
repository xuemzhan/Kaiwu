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

test('generateVerifyBat contains v2 layered status section', () => {
    const s = pkg.generateVerifyBat();
    assert.ok(s.includes('layered status'), 'must include v2 layered status section');
    assert.ok(s.includes('EnableAI'), 'must check EnableAI per version');
    assert.ok(s.includes('AutoStart'), 'must check AutoStart per version');
});

test('generateVerifyBat contains service and process checks', () => {
    const s = pkg.generateVerifyBat();
    assert.ok(s.includes('sc query') || s.includes('SC QUERY'), 'must check service status');
    assert.ok(s.includes('tasklist'), 'must check running processes');
    assert.ok(s.includes('wpscloudsvr'), 'must reference wpscloudsvr');
});
