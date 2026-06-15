/**
 * tests/config.test.js — Config 单元测试
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts } = require('./_setup');

function loadAll() {
    const env = makeEnv();
    // Set env defaults before loading config
    env.window.__ENV_API_KEY__ = 'sk-env-test-123';
    env.window.__ENV_API_BASE__ = 'https://api.test.com/v1';
    env.window.__ENV_MODEL__ = 'test-model';
    loadScripts(env.window, 'taskpane/services/config.js');
    return { ...env, Config: env.window.Config };
}

test('Config: init returns object with all default keys', () => {
    const { Config } = loadAll();
    const data = Config.init();
    assert.ok('apiBaseUrl' in data);
    assert.ok('apiKey' in data);
    assert.ok('model' in data);
    assert.ok('systemPrompt' in data);
    assert.ok('temperature' in data);
    assert.ok('maxTokens' in data);
});

test('Config: init injects env values when no saved data', () => {
    const { Config } = loadAll();
    const data = Config.init();
    assert.equal(data.apiKey, 'sk-env-test-123');
    assert.equal(data.apiBaseUrl, 'https://api.test.com/v1');
    assert.equal(data.model, 'test-model');
});

test('Config: init respects previously saved localStorage values', () => {
    const { window, Config } = loadAll();
    window.localStorage.setItem('wps_assistant_config', JSON.stringify({
        apiKey: 'sk-saved',
        apiBaseUrl: 'https://saved.com/v1',
        model: 'saved-model',
        systemPrompt: 'custom prompt',
        temperature: 0.5,
        maxTokens: 2048
    }));
    // Reset internal cache by re-init
    Config._data = null;
    const data = Config.init();
    assert.equal(data.apiKey, 'sk-saved');
    assert.equal(data.apiBaseUrl, 'https://saved.com/v1');
    assert.equal(data.systemPrompt, 'custom prompt');
});

test('Config: get returns the requested key', () => {
    const { Config } = loadAll();
    Config.init();
    assert.equal(Config.get('model'), 'test-model');
});

test('Config: set with object merges and saves', () => {
    const { window, Config } = loadAll();
    Config.init();
    Config.set({ apiKey: 'sk-new', model: 'new-model' });
    assert.equal(Config.get('apiKey'), 'sk-new');
    assert.equal(Config.get('model'), 'new-model');
    // Persisted
    const stored = JSON.parse(window.localStorage.getItem('wps_assistant_config'));
    assert.equal(stored.apiKey, 'sk-new');
    assert.equal(stored.model, 'new-model');
});

test('Config: set with key-value saves and returns', () => {
    const { window, Config } = loadAll();
    Config.init();
    Config.set('temperature', 1.5);
    const stored = JSON.parse(window.localStorage.getItem('wps_assistant_config'));
    assert.equal(stored.temperature, 1.5);
});

test('Config: reset clears apiKey and re-injects env defaults', () => {
    const { window, Config } = loadAll();
    window.localStorage.setItem('wps_assistant_config', JSON.stringify({
        apiKey: 'sk-saved', apiBaseUrl: 'https://old.com', model: 'old',
        systemPrompt: 'old prompt', temperature: 0.9, maxTokens: 8192
    }));
    Config._data = null;
    Config.init();
    Config.reset();
    const data = Config.getAll();
    assert.equal(data.apiKey, '');
    assert.equal(data.apiBaseUrl, 'https://api.test.com/v1');
    assert.equal(data.model, 'test-model');
    // System prompt should reset to a component-specific default
    assert.notEqual(data.systemPrompt, 'old prompt');
});

test('Config: detectComponent falls back to ComponentDetector', () => {
    const { window, Config } = loadAll();
    // ComponentDetector not loaded; should not throw
    window.Application.ActiveDocument = { Name: 'a.docx' };
    const c = Config.detectComponent();
    assert.equal(c, 'wps');
});

test('Config: detectComponent reads from PluginStorage when available', () => {
    const { window, Config } = loadAll();
    window.Application.PluginStorage.setItem('component_type', 'et');
    assert.equal(Config.detectComponent(), 'et');
});

test('Config: getSystemPromptFor returns per-component prompts', () => {
    const { Config } = loadAll();
    const wps = Config.getSystemPromptFor('wps');
    const et = Config.getSystemPromptFor('et');
    const wpp = Config.getSystemPromptFor('wpp');
    const pdf = Config.getSystemPromptFor('pdf');
    assert.notEqual(wps, et);
    assert.notEqual(wps, wpp);
    assert.notEqual(et, wpp);
    assert.ok(wps.indexOf('写作') !== -1);
    assert.ok(et.indexOf('表格') !== -1);
    assert.ok(wpp.indexOf('演示') !== -1);
    assert.ok(pdf.indexOf('PDF') !== -1);
});

test('Config: getSystemPromptFor falls back to wps prompt for unknown type', () => {
    const { Config } = loadAll();
    const fallback = Config.getSystemPromptFor('unknown_xxx');
    assert.equal(fallback, Config.getSystemPromptFor('wps'));
});

test('Config: handles localStorage quota error gracefully', () => {
    const { window, Config } = loadAll();
    Config.init();
    // Replace localStorage.setItem to throw quota error
    const orig = window.localStorage.setItem;
    let warned = false;
    const origWarn = window.console.warn;
    window.console.warn = () => { warned = true; };
    window.localStorage.setItem = () => {
        const e = new Error('quota');
        e.name = 'QuotaExceededError';
        throw e;
    };
    // Should not throw
    assert.doesNotThrow(() => Config.set('model', 'm'));
    assert.equal(warned, true);
    window.localStorage.setItem = orig;
    window.console.warn = origWarn;
});

test('Config: handles localStorage SecurityError gracefully', () => {
    const { window, Config } = loadAll();
    Config.init();
    const orig = window.localStorage.setItem;
    let warned = false;
    const origWarn = window.console.warn;
    window.console.warn = () => { warned = true; };
    window.localStorage.setItem = () => {
        const e = new Error('blocked');
        e.name = 'SecurityError';
        throw e;
    };
    assert.doesNotThrow(() => Config.set('model', 'm2'));
    assert.equal(warned, true);
    window.localStorage.setItem = orig;
    window.console.warn = origWarn;
});
