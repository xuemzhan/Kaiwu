const { test } = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../scripts/package.js');

test('generateEnableNativeAiBat emits 3 reg delete lines for HKCU Office plugins', () => {
    const s = pkg.generateEnableNativeAiBat();
    assert.ok(s.includes('reg delete "HKCU\\Software\\Kingsoft\\Office\\6.0\\plugins" /v CloudService /f'),
        'must include CloudService reg delete');
    assert.ok(s.includes('reg delete "HKCU\\Software\\Kingsoft\\Office\\6.0\\plugins" /v EnableAI /f'),
        'must include EnableAI reg delete');
    assert.ok(s.includes('reg delete "HKCU\\Software\\Kingsoft\\Office\\6.0\\plugins" /v DocerEnabled /f'),
        'must include DocerEnabled reg delete');
});

test('generateEnableNativeAiBat has LF line endings (toCRLF applied on write)', () => {
    const s = pkg.generateEnableNativeAiBat();
    assert.ok(s.includes('\n'), 'must use LF line endings');
});

test('generateEnableNativeAiBat has no Chinese characters in body', () => {
    const s = pkg.generateEnableNativeAiBat();
    assert.ok(!/[\u4e00-\u9fff]/.test(s), 'bat body must be ASCII-only');
});

test('generateEnableNativeAiBat echoes OK per key', () => {
    const s = pkg.generateEnableNativeAiBat();
    assert.ok(s.includes('[OK] CloudService removed'), 'must echo CloudService removed');
    assert.ok(s.includes('[OK] EnableAI removed'), 'must echo EnableAI removed');
    assert.ok(s.includes('[OK] DocerEnabled removed'), 'must echo DocerEnabled removed');
});
