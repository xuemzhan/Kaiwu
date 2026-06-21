/**
 * tests/wps-native-ai.test.js — WPSNativeAIStatus 模块单元测试
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeEnv, loadScripts } = require('./_setup');

test('wps-native-ai: module loads and exposes window.WPSNativeAIStatus', () => {
    const env = makeEnv();
    loadScripts(env.window, ['taskpane/services/wps-native-ai.js']);
    assert.ok(env.window.WPSNativeAIStatus, 'WPSNativeAIStatus should be exposed on window');
    assert.equal(typeof env.window.WPSNativeAIStatus.getStatus, 'function');
    assert.equal(typeof env.window.WPSNativeAIStatus.getRegistryKeys, 'function');
    assert.equal(typeof env.window.WPSNativeAIStatus.isFeatureAvailable, 'function');
});

test('wps-native-ai: getStatus returns the documented shape', () => {
    const env = makeEnv();
    loadScripts(env.window, ['taskpane/services/wps-native-ai.js']);
    const s = env.window.WPSNativeAIStatus.getStatus();
    assert.ok('disabled' in s, 'status must have disabled key');
    assert.ok('source' in s, 'status must have source key');
    assert.ok('hint' in s, 'status must have hint key');
    assert.equal(s.source, 'unsupported', 'source must be unsupported (sandbox limitation)');
    assert.equal(s.disabled, null, 'disabled must be null (unknown)');
    assert.ok(typeof s.hint === 'string' && s.hint.length > 0, 'hint must be non-empty string');
});

test('wps-native-ai: getRegistryKeys returns 3 entries with expected names', () => {
    const env = makeEnv();
    loadScripts(env.window, ['taskpane/services/wps-native-ai.js']);
    const keys = env.window.WPSNativeAIStatus.getRegistryKeys();
    assert.equal(keys.length, 3, 'should have 3 registry keys');
    const names = keys.map(function (k) { return k.key; });
    assert.ok(names.indexOf('CloudService') !== -1, 'must include CloudService');
    assert.ok(names.indexOf('EnableAI') !== -1, 'must include EnableAI');
    assert.ok(names.indexOf('DocerEnabled') !== -1, 'must include DocerEnabled');
});

test('wps-native-ai: isFeatureAvailable returns true', () => {
    const env = makeEnv();
    loadScripts(env.window, ['taskpane/services/wps-native-ai.js']);
    assert.equal(env.window.WPSNativeAIStatus.isFeatureAvailable(), true);
});

test('wps-native-ai: source file JSDoc mentions HKCU sandbox constraint', () => {
    const filePath = path.join(__dirname, '..', 'taskpane', 'services', 'wps-native-ai.js');
    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(content.indexOf('HKCU') !== -1, 'JSDoc must mention HKCU (sandbox constraint)');
    assert.ok(content.indexOf('沙盒') !== -1 || content.indexOf('CEF') !== -1,
        'JSDoc must mention sandbox or CEF (sandbox constraint)');
});
