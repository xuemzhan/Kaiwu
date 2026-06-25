const { test } = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../scripts/package.js');

test('generateDisableNativeAiBat contains UAC self-elevation', () => {
    const s = pkg.generateDisableNativeAiBat();
    assert.ok(s.includes('net session'), 'must check admin via net session');
    assert.ok(s.includes('RunAs'), 'must include -Verb RunAs for UAC elevation');
});

test('generateDisableNativeAiBat sets EnableAI and AutoStart to 0 via correct registry path', () => {
    const s = pkg.generateDisableNativeAiBat();
    assert.ok(s.includes('EnableAI /t REG_DWORD /d 0'), 'must set EnableAI=0');
    assert.ok(s.includes('AutoStart /t REG_DWORD /d 0'), 'must set AutoStart=0');
    assert.ok(s.includes('WPS Office'), 'must use WPS Office registry path');
});

test('generateDisableNativeAiBat disables WPS Cloud Service', () => {
    const s = pkg.generateDisableNativeAiBat();
    assert.ok(s.includes('sc config'), 'must include sc config');
    assert.ok(s.includes('start=disabled'), 'must set service start=disabled');
});

test('generateDisableNativeAiBat creates file placeholders with backup', () => {
    const s = pkg.generateDisableNativeAiBat();
    assert.ok(s.includes('kaiwu-backup'), 'must reference backup files');
    assert.ok(s.includes('type nul >'), 'must create 0-byte placeholder');
});

test('generateDisableNativeAiBat kills wpscloudsvr process', () => {
    const s = pkg.generateDisableNativeAiBat();
    assert.ok(s.includes('taskkill'), 'must include taskkill');
    assert.ok(s.includes('wpscloudsvr'), 'must target wpscloudsvr.exe');
});

test('generateDisableNativeAiBat has LF line endings (toCRLF applied on write)', () => {
    const s = pkg.generateDisableNativeAiBat();
    assert.ok(s.includes('\n'), 'must use LF line endings');
});

test('generateDisableNativeAiBat has no Chinese characters in body', () => {
    const s = pkg.generateDisableNativeAiBat();
    assert.ok(!/[\u4e00-\u9fff]/.test(s), 'bat body must be ASCII-only');
});
