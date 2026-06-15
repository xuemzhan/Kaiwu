/**
 * tests/result-panel.test.js — ResultPanel 单元测试
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts, mockVendorLibs } = require('./_setup');

function loadPanel() {
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
        'taskpane/components/result-card.js',
        'taskpane/actions/action-runner.js',
        'taskpane/components/result-panel.js'
    ]);
    return Object.assign({}, env, {
        ResultCard: env.window.ResultCard,
        ResultPanel: env.window.ResultPanel,
        WriterAdapter: env.window.WriterAdapter,
        ActionRunner: env.window.ActionRunner
    });
}

test('ResultPanel: mount renders card to mountEl', () => {
    const { window, ResultCard, ResultPanel } = loadPanel();
    const mount = window.document.createElement('div');
    mount.id = 'resultContainer';
    window.document.body.appendChild(mount);
    const card = ResultCard.create({ actionId: 'write', actionLabel: '写' });
    ResultCard.update(card.id, { resultText: 'hello', status: 'done' });
    ResultPanel.mount(ResultCard._cards[card.id], mount);
    assert.ok(mount.innerHTML.indexOf('hello') !== -1, 'should render result text');
    assert.ok(mount.innerHTML.indexOf('替换原文') !== -1, 'should include action buttons');
});

test('ResultPanel: mount with streaming renders pending state', async () => {
    const { window, ResultCard, ResultPanel } = loadPanel();
    const mount = window.document.createElement('div');
    window.document.body.appendChild(mount);
    const card = ResultCard.create({ actionId: 'write', actionLabel: '写' });
    ResultCard.update(card.id, { status: 'streaming' });
    ResultPanel.mount(ResultCard._cards[card.id], mount, { streaming: true });
    // 等 60ms 防抖
    await new Promise(r => setTimeout(r, 100));
    assert.ok(mount.innerHTML.length > 0, 'mount should not be empty');
    // streaming 状态下 action 按钮应禁用
    assert.ok(/disabled/.test(mount.innerHTML), 'buttons should be disabled while streaming');
});

test('ResultPanel: update switches from streaming to done and enables buttons', async () => {
    const { window, ResultCard, ResultPanel } = loadPanel();
    const mount = window.document.createElement('div');
    window.document.body.appendChild(mount);
    const card = ResultCard.create({ actionId: 'write', actionLabel: '写' });
    ResultCard.update(card.id, { status: 'streaming' });
    ResultPanel.mount(ResultCard._cards[card.id], mount, { streaming: true });
    await new Promise(r => setTimeout(r, 100));
    ResultCard.update(card.id, { resultText: 'final', status: 'done' });
    ResultPanel.update(ResultCard._cards[card.id], mount, { streaming: false });
    await new Promise(r => setTimeout(r, 100));
    assert.ok(mount.innerHTML.indexOf('final') !== -1, 'should show final content');
    // 完成后按钮可点击 (无 disabled)
    const replaceBtn = mount.querySelector('button');
    assert.ok(replaceBtn && !replaceBtn.disabled, 'action buttons should be enabled when done');
});

test('ResultPanel: error status renders error block instead of content', () => {
    const { window, ResultCard, ResultPanel } = loadPanel();
    const mount = window.document.createElement('div');
    window.document.body.appendChild(mount);
    const card = ResultCard.create({ actionId: 'write', actionLabel: '写' });
    ResultCard.update(card.id, { status: 'error', error: '网络异常' });
    ResultPanel.mount(ResultCard._cards[card.id], mount);
    assert.ok(mount.innerHTML.indexOf('网络异常') !== -1, 'should display error message');
});

test('ResultPanel: unmount clears active state', () => {
    const { window, ResultCard, ResultPanel } = loadPanel();
    const mount = window.document.createElement('div');
    window.document.body.appendChild(mount);
    const card = ResultCard.create({ actionId: 'write', actionLabel: '写' });
    ResultCard.update(card.id, { resultText: 'text', status: 'done' });
    ResultPanel.mount(ResultCard._cards[card.id], mount);
    assert.equal(ResultPanel.active() !== null, true, 'should have active card');
    ResultPanel.unmount(mount);
    assert.equal(mount.innerHTML, '', 'mount should be cleared');
    assert.equal(ResultPanel.active(), null, 'active should be null');
});

test('ResultPanel: regenerate triggers ActionRunner with reuseInput', () => {
    const { window, ResultCard, ResultPanel } = loadPanel();
    let runnerArgs = null;
    const shared = window.ActionRunner;
    const origRun = shared && shared.run;
    if (shared) {
        shared.run = function (id, opts) { runnerArgs = { id, opts }; };
    }
    const mount = window.document.createElement('div');
    window.document.body.appendChild(mount);
    const card = ResultCard.create({ actionId: 'polish_quick', actionLabel: '润色', sourceText: 'sample' });
    ResultCard.update(card.id, { resultText: 'improved', status: 'done' });
    ResultPanel.mount(ResultCard._cards[card.id], mount);
    ResultPanel.regenerate();
    assert.ok(runnerArgs, 'ActionRunner.run should be called');
    assert.equal(runnerArgs.id, 'polish_quick');
    assert.equal(runnerArgs.opts.reuseInput, 'sample');
    if (shared && origRun) shared.run = origRun;
});

test('ResultPanel: _cleanResult strips thinking blocks from rendered content', () => {
    const { window, ResultCard, ResultPanel } = loadPanel();
    const mount = window.document.createElement('div');
    window.document.body.appendChild(mount);
    const card = ResultCard.create({ actionId: 'write', actionLabel: '写' });
    ResultCard.update(card.id, {
        resultText: '```thinking\nhidden\n```\nvisible answer',
        status: 'done'
    });
    ResultPanel.mount(ResultCard._cards[card.id], mount);
    // 验证清理函数本身 (不受 SVG aria 属性中 "hidden" 一词影响)
    const cleaned = ResultPanel._cleanResult('```thinking\nhidden\n```\nvisible answer');
    assert.ok(cleaned.indexOf('hidden') === -1, 'cleaned text should not contain hidden');
    assert.ok(cleaned.indexOf('visible answer') !== -1, 'cleaned text should contain visible answer');
    // 同时验证 result-content 区域 (排除 SVG 装饰)
    var contentEl = mount.querySelector('.result-content');
    assert.ok(contentEl, 'result-content should exist');
    assert.ok(contentEl.innerHTML.indexOf('visible answer') !== -1,
        'content area should show visible answer');
});
