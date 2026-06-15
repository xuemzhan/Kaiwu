/**
 * tests/writer-adapter-edge.test.js — WriterAdapter 边界用例
 *
 * 覆盖 (D10): replaceSelection 长度+前缀比较, 允许选区有额外前后空白.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts } = require('./_setup');

function loadAdapter() {
    const env = makeEnv();
    loadScripts(env.window, 'taskpane/adapters/writer-adapter.js');
    return Object.assign({}, env, {
        WriterAdapter: env.window.WriterAdapter
    });
}

test('WriterAdapter: replaceSelection succeeds when current contains expected as substring', () => {
    const env = loadAdapter();
    const sel = { Text: '  original text with extra  ' };
    env.window.Application.ActiveDocument = { Application: { Selection: sel } };
    const result = env.window.WriterAdapter.replaceSelection('improved', 'original text');
    assert.equal(result.ok, true, 'should succeed when expected is substring of current');
    assert.equal(sel.Text, 'improved');
});

test('WriterAdapter: replaceSelection fails when expected is not in current', () => {
    const env = loadAdapter();
    const sel = { Text: 'completely different' };
    env.window.Application.ActiveDocument = { Application: { Selection: sel } };
    const result = env.window.WriterAdapter.replaceSelection('improved', 'original text');
    assert.equal(result.ok, false);
    assert.ok(result.reason.indexOf('不一致') !== -1, 'should mention mismatch: ' + result.reason);
});

test('WriterAdapter: replaceSelection with no expected text is a no-op check', () => {
    const env = loadAdapter();
    const sel = { Text: 'anything' };
    env.window.Application.ActiveDocument = { Application: { Selection: sel } };
    const result = env.window.WriterAdapter.replaceSelection('replacement', '');
    assert.equal(result.ok, true);
    assert.equal(sel.Text, 'replacement');
});

test('WriterAdapter: replaceSelection preserves trailing whitespace pattern', () => {
    const env = loadAdapter();
    const sel = { Text: '   hello world   ' };
    env.window.Application.ActiveDocument = { Application: { Selection: sel } };
    const result = env.window.WriterAdapter.replaceSelection('hi there', 'hello world');
    assert.equal(result.ok, true);
});
