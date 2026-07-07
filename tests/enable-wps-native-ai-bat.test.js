const { test } = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../scripts/package.js');

test('generateEnableNativeAiBat contains UAC self-elevation', () => {
    const s = pkg.generateEnableNativeAiBat();
    assert.ok(s.includes('net session'), 'must check admin via net session');
    assert.ok(s.includes('RunAs'), 'must include -Verb RunAs for UAC elevation');
});

test('generateEnableNativeAiBat restores EnableAI and AutoStart to 1', () => {
    const s = pkg.generateEnableNativeAiBat();
    assert.ok(s.includes('EnableAI /t REG_DWORD /d 1'), 'must set EnableAI=1');
    assert.ok(s.includes('AutoStart /t REG_DWORD /d 1'), 'must set AutoStart=1');
});

test('generateEnableNativeAiBat re-enables WPS Cloud Service', () => {
    const s = pkg.generateEnableNativeAiBat();
    assert.ok(s.includes('start=auto'), 'must set service start=auto');
    assert.ok(s.includes('sc start'), 'must start the service');
});

test('generateEnableNativeAiBat restores file from backup', () => {
    const s = pkg.generateEnableNativeAiBat();
    assert.ok(s.includes('kaiwu-backup'), 'must reference backup files');
    assert.ok(s.includes('move /Y'), 'must move backup to restore original');
});

test('generateEnableNativeAiBat has user confirmation', () => {
    const s = pkg.generateEnableNativeAiBat();
    assert.ok(s.includes('CONFIRM'), 'must have user confirmation prompt');
    assert.ok(s.includes('Do you want to continue'), 'must ask user to confirm');
});

test('generateEnableNativeAiBat has WPS process warning', () => {
    const s = pkg.generateEnableNativeAiBat();
    assert.ok(s.includes('WPS is currently running'), 'must warn about running WPS');
    assert.ok(s.includes('save your work'), 'must remind user to save work');
});

test('generateEnableNativeAiBat has proper error handling', () => {
    const s = pkg.generateEnableNativeAiBat();
    assert.ok(s.includes('Restore failed'), 'must handle restore failure');
});

test('generateEnableNativeAiBat has LF line endings (toCRLF applied on write)', () => {
    const s = pkg.generateEnableNativeAiBat();
    assert.ok(s.includes('\n'), 'must use LF line endings');
});

test('generateEnableNativeAiBat has no Chinese characters in body', () => {
    const s = pkg.generateEnableNativeAiBat();
    assert.ok(!/[\u4e00-\u9fff]/.test(s), 'bat body must be ASCII-only');
});
