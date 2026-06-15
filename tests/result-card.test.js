/**
 * tests/result-card.test.js — ResultCard 单元测试
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts, mockVendorLibs } = require('./_setup');

function loadRC() {
    const env = makeEnv();
    env.window.__ENV_API_KEY__ = 'sk-test';
    env.window.__ENV_API_BASE__ = 'https://api.test.com/v1';
    env.window.__ENV_MODEL__ = 'test';
    mockVendorLibs(env.window);
    loadScripts(env.window, [
        'taskpane/services/security.js',
        'taskpane/services/config.js',
        'taskpane/services/ai.js',
        'taskpane/adapters/writer-adapter.js',
        'taskpane/actions/action-registry.js',
        'taskpane/actions/prompt-templates.js',
        'taskpane/components/message.js',
        'taskpane/actions/action-runner.js',
        'taskpane/components/result-card.js'
    ]);
    return { ...env, ResultCard: env.window.ResultCard, WriterAdapter: env.window.WriterAdapter };
}

test('ResultCard: create returns card with unique id', () => {
    const { ResultCard } = loadRC();
    const c1 = ResultCard.create({ actionId: 'write', actionLabel: '写' });
    const c2 = ResultCard.create({ actionId: 'write', actionLabel: '写' });
    assert.notEqual(c1.id, c2.id);
    assert.equal(c1.status, 'pending');
    assert.equal(c1.resultText, '');
});

test('ResultCard: update changes status and resultText', () => {
    const { ResultCard } = loadRC();
    const c = ResultCard.create({ actionId: 'write', actionLabel: '写' });
    ResultCard.update(c.id, { status: 'streaming', resultText: 'partial' });
    const latest = ResultCard.latest();
    assert.equal(latest.status, 'streaming');
    assert.equal(latest.resultText, 'partial');
});

test('ResultCard: append updates streaming text', () => {
    const { ResultCard } = loadRC();
    const c = ResultCard.create({ actionId: 'write', actionLabel: '写' });
    ResultCard.append(c.id, 'a');
    ResultCard.append(c.id, 'ab');
    ResultCard.append(c.id, 'abc');
    assert.equal(ResultCard.latest().resultText, 'abc');
    assert.equal(ResultCard.latest().status, 'streaming');
});

test('ResultCard: complete sets done status', () => {
    const { ResultCard } = loadRC();
    const c = ResultCard.create({ actionId: 'write', actionLabel: '写' });
    ResultCard.complete(c.id, 'final answer');
    assert.equal(ResultCard.latest().status, 'done');
    assert.equal(ResultCard.latest().resultText, 'final answer');
});

test('ResultCard: fail sets error status', () => {
    const { ResultCard } = loadRC();
    const c = ResultCard.create({ actionId: 'write', actionLabel: '写' });
    ResultCard.fail(c.id, 'API timeout');
    assert.equal(ResultCard.latest().status, 'error');
    assert.equal(ResultCard.latest().error, 'API timeout');
});

test('ResultCard: render populates resultContainer', () => {
    const { window, ResultCard } = loadRC();
    const container = window.document.createElement('div');
    container.id = 'resultContainer';
    window.document.body.appendChild(container);
    const c = ResultCard.create({ actionId: 'write', actionLabel: '写' });
    ResultCard.update(c.id, { resultText: 'hello', status: 'done' });
    assert.ok(container.innerHTML.length > 0);
    assert.ok(container.innerHTML.indexOf('hello') !== -1);
});

test('ResultCard: _sourceLabel formats based on type', () => {
    const { ResultCard } = loadRC();
    const a = { sourceType: 'document', sourceText: 'x'.repeat(100) };
    const b = { sourceType: 'user', sourceText: 'x' };
    const c = { sourceType: 'selection', sourceText: 'xx' };
    assert.equal(ResultCard._sourceLabel(a), '全文 100 字');
    assert.equal(ResultCard._sourceLabel(b), '用户输入');
    assert.equal(ResultCard._sourceLabel(c), '选区 2 字');
});

test('ResultCard: _cleanResult strips thinking blocks', () => {
    const { ResultCard } = loadRC();
    const cleaned = ResultCard._cleanResult('```thinking\nhidden\n```\nvisible text');
    assert.equal(cleaned, 'visible text');
    const cleaned2 = ResultCard._cleanResult('<think>hidden</think> final');
    assert.equal(cleaned2, 'final');
});

test('ResultCard: copy uses clipboard', () => {
    const { window, ResultCard } = loadRC();
    let copied = null;
    window.navigator.clipboard.writeText = (t) => { copied = t; };
    const c = ResultCard.create({ actionId: 'write', actionLabel: '写' });
    ResultCard.complete(c.id, 'final text');
    ResultCard.copy(c.id);
    assert.equal(copied, 'final text');
});

test('ResultCard: insertAtCursor calls WriterAdapter', () => {
    const { window, ResultCard, WriterAdapter } = loadRC();
    let inserted = null;
    const sel = { Text: '' };
    window.Application.ActiveDocument = { Application: { Selection: sel } };
    const origInsert = WriterAdapter.insertAtCursor;
    WriterAdapter.insertAtCursor = (text) => { inserted = text; return true; };
    const c = ResultCard.create({ actionId: 'write', actionLabel: '写' });
    ResultCard.complete(c.id, 'inserted text');
    ResultCard.insertAtCursor(c.id);
    assert.equal(inserted, 'inserted text');
    WriterAdapter.insertAtCursor = origInsert;
});

test('ResultCard: replaceOriginal calls WriterAdapter.replaceSelection', () => {
    const { window, ResultCard, WriterAdapter } = loadRC();
    const sel = { Text: 'original' };
    window.Application.ActiveDocument = { Application: { Selection: sel } };
    const origReplace = WriterAdapter.replaceSelection;
    let replaced = null;
    WriterAdapter.replaceSelection = (text, expected) => { replaced = text; return { ok: true }; };
    const c = ResultCard.create({ actionId: 'polish_quick', actionLabel: '润色', sourceText: 'original' });
    ResultCard.complete(c.id, 'improved');
    ResultCard.replaceOriginal(c.id);
    assert.equal(replaced, 'improved');
    WriterAdapter.replaceSelection = origReplace;
});

test('ResultCard: regenerate calls ActionRunner if available', () => {
    const { window, ResultCard } = loadRC();
    // Replace ActionRunner.run with a spy on the SHARED object so the
    // script's free variable `ActionRunner` is the same instance.
    const shared = window.ActionRunner;
    const origRun = shared.run;
    let runnerCalled = null;
    shared.run = function (id, opts) { runnerCalled = { id, opts }; };
    const c = ResultCard.create({ actionId: 'polish_quick', actionLabel: '润色', sourceText: 'src' });
    ResultCard.complete(c.id, 'new');
    ResultCard.regenerate(c.id);
    assert.ok(runnerCalled, 'ActionRunner.run should be called');
    assert.equal(runnerCalled.id, 'polish_quick');
    assert.equal(runnerCalled.opts.reuseInput, 'src');
    shared.run = origRun;
});
