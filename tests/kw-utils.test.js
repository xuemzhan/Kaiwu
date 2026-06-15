/**
 * tests/kw-utils.test.js — KwUtils 单元测试
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts } = require('./_setup');

function loadKwUtils() {
    const env = makeEnv();
    loadScripts(env.window, ['taskpane/services/utils.js']);
    return Object.assign({}, env, { KwUtils: env.window.KwUtils, window: env.window });
}

test('KwUtils.stripThinking strips <think>...</think>', () => {
    const { KwUtils } = loadKwUtils();
    assert.equal(KwUtils.stripThinking('<think>secret</think>answer'), 'answer');
});

test('KwUtils.stripThinking strips unclosed <think>', () => {
    const { KwUtils } = loadKwUtils();
    assert.equal(KwUtils.stripThinking('<think>still reasoning'), '');
});

test('KwUtils.stripThinking strips ```thinking fence', () => {
    const { KwUtils } = loadKwUtils();
    assert.equal(KwUtils.stripThinking('```thinking\nreasoning\n```\nresult'), 'result');
});

test('KwUtils.cleanResult strips and trims', () => {
    const { KwUtils } = loadKwUtils();
    assert.equal(KwUtils.cleanResult(' <think>x</think> hello  '), 'hello');
});

test('KwUtils.escapeHtml escapes & < >', () => {
    const { KwUtils } = loadKwUtils();
    assert.equal(KwUtils.escapeHtml('<a&b>'), '&lt;a&amp;b&gt;');
});

test('KwUtils.escapeAttr escapes & " \' < >', () => {
    const { KwUtils } = loadKwUtils();
    const result = KwUtils.escapeAttr('a&b"c\'d<e>f\ng');
    assert.ok(result.indexOf('&amp;') !== -1);
    assert.ok(result.indexOf('&quot;') !== -1);
    assert.ok(result.indexOf('&#39;') !== -1);
    assert.ok(result.indexOf('&lt;') !== -1);
    assert.ok(result.indexOf('&gt;') !== -1);
    assert.ok(result.indexOf('&#10;') !== -1);
});

test('KwUtils.estimateTokens counts CJK as ~1.5 each', () => {
    const { KwUtils } = loadKwUtils();
    // 10 个汉字 → ceil(10 * 1.5) = 15
    const cjk = '一二三四五六七八九十';
    assert.equal(KwUtils.estimateTokens(cjk), 15);
});

test('KwUtils.estimateTokens counts ASCII as ~4 chars = 1 token', () => {
    const { KwUtils } = loadKwUtils();
    // 8 个英文 → ceil(0 + 8/4) = 2
    assert.equal(KwUtils.estimateTokens('abcdefgh'), 2);
});

test('KwUtils.debounce delays then fires once', (t, done) => {
    const { KwUtils } = loadKwUtils();
    var calls = 0;
    var debounced = KwUtils.debounce(function () { calls++; }, 30);
    debounced();
    debounced();
    debounced();
    setTimeout(function () {
        assert.equal(calls, 1, 'debounce should fire once after settling');
        done();
    }, 60);
});

test('KwUtils.debounce flush fires immediately', () => {
    const { KwUtils } = loadKwUtils();
    var calls = 0;
    var debounced = KwUtils.debounce(function () { calls++; }, 1000);
    debounced('a');
    debounced('b');
    debounced.flush();
    assert.equal(calls, 1, 'flush should fire pending call once');
    debounced.flush();
    assert.equal(calls, 1, 'subsequent flush without pending call does nothing');
});

test('KwUtils.isAtBottom returns true for empty scrolled-to-bottom container', () => {
    const { KwUtils, window } = loadKwUtils();
    var el = window.document.createElement('div');
    el.style.height = '100px';
    el.style.overflow = 'auto';
    // jsdom 不会真正布局 — scrollHeight === 0 时直接返回 true
    assert.equal(KwUtils.isAtBottom(el), true);
});

test('KwToast.show creates static toast element on demand', () => {
    const { window } = makeEnv();
    loadScripts(window, ['taskpane/services/toast.js']);
    window.KwToast.show('hello');
    var el = window.document.getElementById('kw-toast-default');
    assert.ok(el, 'toast element should exist');
    assert.equal(el.textContent, 'hello');
    assert.ok(el.classList.contains('kw-toast-show'));
});

test('KwToast uses multiple channels independently', () => {
    const { window } = makeEnv();
    loadScripts(window, ['taskpane/services/toast.js']);
    window.KwToast.show('main', 'default');
    window.KwToast.show('floating', 'floating');
    var main = window.document.getElementById('kw-toast-default');
    var flt = window.document.getElementById('kw-toast-floating');
    assert.equal(main && main.textContent, 'main');
    assert.equal(flt && flt.textContent, 'floating');
});
