const { test } = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../scripts/package.js');

test('generateDisableNativeAiBat emits 3 reg add lines for HKCU Office plugins', () => {
    const s = pkg.generateDisableNativeAiBat();
    assert.ok(s.includes('reg add "HKCU\\Software\\Kingsoft\\Office\\6.0\\plugins" /v CloudService /t REG_DWORD /d 0 /f'),
        'must include CloudService reg add');
    assert.ok(s.includes('reg add "HKCU\\Software\\Kingsoft\\Office\\6.0\\plugins" /v EnableAI /t REG_DWORD /d 0 /f'),
        'must include EnableAI reg add');
    assert.ok(s.includes('reg add "HKCU\\Software\\Kingsoft\\Office\\6.0\\plugins" /v DocerEnabled /t REG_DWORD /d 0 /f'),
        'must include DocerEnabled reg add');
});

test('generateDisableNativeAiBat has LF line endings (toCRLF applied on write)', () => {
    const s = pkg.generateDisableNativeAiBat();
    assert.ok(s.includes('\n'), 'must use LF line endings');
});

test('generateDisableNativeAiBat has no Chinese characters in body', () => {
    const s = pkg.generateDisableNativeAiBat();
    assert.ok(!/[\u4e00-\u9fff]/.test(s), 'bat body must be ASCII-only');
});

test('generateDisableNativeAiBat echoes OK per key', () => {
    const s = pkg.generateDisableNativeAiBat();
    assert.ok(s.includes('[OK] CloudService=0'), 'must echo CloudService=0');
    assert.ok(s.includes('[OK] EnableAI=0'), 'must echo EnableAI=0');
    assert.ok(s.includes('[OK] DocerEnabled=0'), 'must echo DocerEnabled=0');
});
