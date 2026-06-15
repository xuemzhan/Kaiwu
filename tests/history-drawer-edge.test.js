/**
 * tests/history-drawer-edge.test.js — HistoryDrawer 边界用例
 *
 * 覆盖 (D7): 搜索过滤
 * 覆盖 (A6): 节流保存
 * 覆盖 (B1): cleanResult 委托给 KwUtils
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts } = require('./_setup');

const DRAWER_DOM = `
<div id="historyDrawer" class="history-drawer">
    <div class="history-header">
        <div class="history-title">历史记录</div>
        <div class="history-actions">
            <button id="btnHistoryClear">清空</button>
            <button id="btnCloseHistory">×</button>
        </div>
    </div>
    <div class="history-search">
        <input id="historySearch" type="text" class="form-input">
    </div>
    <div class="history-meta" id="historyMeta">共 0 条</div>
    <div id="historyList" class="history-list"></div>
</div>
<div id="historyBackdrop" class="history-backdrop" hidden></div>
<header><button id="btnHistory"></button></header>
`;

function loadDrawer() {
    const env = makeEnv(DRAWER_DOM);
    env.window.__ENV_API_KEY__ = 'sk-test';
    env.window.__ENV_API_BASE__ = 'https://api.test.com/v1';
    env.window.__ENV_MODEL__ = 'test';
    loadScripts(env.window, [
        'taskpane/services/utils.js',
        'taskpane/services/toast.js',
        'taskpane/services/security.js',
        'taskpane/services/config.js',
        'taskpane/services/ai.js',
        'taskpane/services/markdown.js',
        'taskpane/adapters/writer-adapter.js',
        'taskpane/actions/action-registry.js',
        'taskpane/actions/prompt-templates.js',
        'taskpane/components/message.js',
        'taskpane/components/result-card.js',
        'taskpane/actions/action-runner.js',
        'taskpane/components/history-drawer.js'
    ]);
    env.window.localStorage.clear();
    return Object.assign({}, env, {
        HistoryDrawer: env.window.HistoryDrawer,
        WriterAdapter: env.window.WriterAdapter
    });
}

function makeCard(overrides) {
    return Object.assign({
        id: 'card_' + Math.random().toString(36).slice(2, 8),
        actionId: 'polish_quick',
        actionLabel: '润色',
        sourceType: 'selection',
        sourceText: '原始文本',
        resultText: '润色结果',
        status: 'done',
        error: '',
        createdAt: Date.now(),
        updatedAt: Date.now()
    }, overrides || {});
}

test('HistoryDrawer: _filter returns all items when no filter text', () => {
    const { window, HistoryDrawer } = loadDrawer();
    HistoryDrawer.init();
    HistoryDrawer.push(makeCard({ id: 'a1' }));
    HistoryDrawer.push(makeCard({ id: 'a2' }));
    HistoryDrawer._filterText = '';
    assert.equal(HistoryDrawer._filter().length, 2);
});

test('HistoryDrawer: _filter matches source text', () => {
    const { window, HistoryDrawer } = loadDrawer();
    HistoryDrawer.init();
    HistoryDrawer.push(makeCard({ id: 'b1', sourceText: 'apple banana cherry' }));
    HistoryDrawer.push(makeCard({ id: 'b2', sourceText: 'apple grape' }));
    HistoryDrawer.push(makeCard({ id: 'b3', sourceText: 'kiwi mango' }));
    HistoryDrawer._filterText = 'grape';
    var filtered = HistoryDrawer._filter();
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 'b2');
});

test('HistoryDrawer: _filter matches result text', () => {
    const { HistoryDrawer } = loadDrawer();
    HistoryDrawer.init();
    HistoryDrawer.push(makeCard({ id: 'c1', resultText: 'some result about kwai' }));
    HistoryDrawer.push(makeCard({ id: 'c2', resultText: 'unrelated' }));
    HistoryDrawer._filterText = 'kwai';
    var filtered = HistoryDrawer._filter();
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 'c1');
});

test('HistoryDrawer: _filter matches action label', () => {
    const { HistoryDrawer } = loadDrawer();
    HistoryDrawer.init();
    HistoryDrawer.push(makeCard({ id: 'd1', actionLabel: '快速润色' }));
    HistoryDrawer.push(makeCard({ id: 'd2', actionLabel: '翻译' }));
    HistoryDrawer._filterText = '翻译';
    var filtered = HistoryDrawer._filter();
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 'd2');
});

test('HistoryDrawer: push with throttled save: only one setItem after rapid pushes', (t, done) => {
    const { window, HistoryDrawer } = loadDrawer();
    HistoryDrawer.init();
    var originalSetItem = window.localStorage.setItem;
    var setItemCount = 0;
    window.localStorage.setItem = function () {
        setItemCount++;
        return originalSetItem.apply(this, arguments);
    };

    for (var i = 0; i < 10; i++) {
        HistoryDrawer.push(makeCard({ id: 'r' + i }));
    }
    // 同步路径上, setItem 还没被 flush
    assert.equal(setItemCount, 0, 'no setItem should happen synchronously');

    setTimeout(function () {
        // 节流 500ms 后, 应该有 1 次 setItem (合并)
        assert.equal(setItemCount, 1, 'throttled save should coalesce: got ' + setItemCount);
        window.localStorage.setItem = originalSetItem;
        done();
    }, 600);
});

test('HistoryDrawer: _render shows filter match count', () => {
    const { window, HistoryDrawer } = loadDrawer();
    HistoryDrawer.init();
    HistoryDrawer.push(makeCard({ id: 'f1', sourceText: 'apple' }));
    HistoryDrawer.push(makeCard({ id: 'f2', sourceText: 'banana' }));
    HistoryDrawer.push(makeCard({ id: 'f3', sourceText: 'apple pie' }));
    HistoryDrawer._filterText = 'apple';
    HistoryDrawer._render();
    var meta = window.document.getElementById('historyMeta');
    assert.equal(meta.textContent, '匹配 2 / 3 条');
});

test('HistoryDrawer: cleanResult strips thinking via KwUtils delegation', () => {
    const { window, HistoryDrawer } = loadDrawer();
    HistoryDrawer.init();
    HistoryDrawer.push(makeCard({
        id: 'g1',
        resultText: '<think>hidden</think>visible',
        status: 'done'
    }));
    HistoryDrawer._render();
    var html = window.document.getElementById('historyList').innerHTML;
    assert.ok(html.indexOf('hidden') === -1, 'should not contain thinking trace');
    assert.ok(html.indexOf('visible') !== -1);
});
