/**
 * tests/history-drawer.test.js — HistoryDrawer 单元测试
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts, mockVendorLibs } = require('./_setup');

const DRAWER_DOM = `
<div id="historyDrawer" class="history-drawer">
    <div class="history-header">
        <div class="history-title">历史记录</div>
        <div class="history-actions">
            <button id="btnHistoryClear">清空</button>
            <button id="btnCloseHistory">×</button>
        </div>
    </div>
    <div class="history-meta" id="historyMeta">共 0 条</div>
    <div id="historyList" class="history-list"></div>
</div>
<div id="historyBackdrop" class="history-backdrop" hidden></div>
<header>
    <button id="btnHistory"></button>
</header>
`;

function loadDrawer() {
    const env = makeEnv(DRAWER_DOM);
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

test('HistoryDrawer: init binds header button', () => {
    const { window, HistoryDrawer } = loadDrawer();
    HistoryDrawer.init();
    const btn = window.document.getElementById('btnHistory');
    assert.ok(btn, 'history button should exist');
    assert.equal(typeof HistoryDrawer.toggle, 'function');
    assert.equal(typeof HistoryDrawer.open, 'function');
    assert.equal(typeof HistoryDrawer.close, 'function');
});

test('HistoryDrawer: push stores card in localStorage', () => {
    const { HistoryDrawer } = loadDrawer();
    HistoryDrawer.push(makeCard({ id: 'a1' }));
    HistoryDrawer.push(makeCard({ id: 'a2' }));
    assert.equal(HistoryDrawer.count(), 2, 'should have 2 cards');
});

test('HistoryDrawer: push with same id updates the existing card', () => {
    const { HistoryDrawer } = loadDrawer();
    HistoryDrawer.push(makeCard({ id: 'b1', status: 'streaming', resultText: 'part' }));
    HistoryDrawer.push(makeCard({ id: 'b1', status: 'done', resultText: 'final' }));
    assert.equal(HistoryDrawer.count(), 1, 'still only one card after update');
});

test('HistoryDrawer: remove deletes a card by id', () => {
    const { HistoryDrawer } = loadDrawer();
    HistoryDrawer.push(makeCard({ id: 'c1' }));
    HistoryDrawer.push(makeCard({ id: 'c2' }));
    HistoryDrawer.remove('c1');
    assert.equal(HistoryDrawer.count(), 1, 'one card remaining');
});

test('HistoryDrawer: clear removes all', () => {
    const { HistoryDrawer } = loadDrawer();
    HistoryDrawer.push(makeCard({ id: 'd1' }));
    HistoryDrawer.push(makeCard({ id: 'd2' }));
    HistoryDrawer.push(makeCard({ id: 'd3' }));
    HistoryDrawer.clear();
    assert.equal(HistoryDrawer.count(), 0);
});

test('HistoryDrawer: open sets is-open class and shows backdrop', () => {
    const { window, HistoryDrawer } = loadDrawer();
    HistoryDrawer.open();
    const drawer = window.document.getElementById('historyDrawer');
    const backdrop = window.document.getElementById('historyBackdrop');
    assert.ok(drawer.classList.contains('is-open'), 'drawer should be open');
    assert.equal(backdrop.hidden, false, 'backdrop should be visible');
    assert.equal(drawer.getAttribute('aria-hidden'), 'false');
});

test('HistoryDrawer: close removes is-open class', () => {
    const { window, HistoryDrawer } = loadDrawer();
    HistoryDrawer.open();
    HistoryDrawer.close();
    const drawer = window.document.getElementById('historyDrawer');
    const backdrop = window.document.getElementById('historyBackdrop');
    assert.equal(drawer.classList.contains('is-open'), false);
    assert.equal(drawer.getAttribute('aria-hidden'), 'true');
    // backdrop hidden in timeout
    return new Promise(r => setTimeout(r, 240)).then(() => {
        assert.equal(backdrop.hidden, true, 'backdrop hidden after animation');
    });
});

test('HistoryDrawer: toggle alternates open/close', () => {
    const { HistoryDrawer } = loadDrawer();
    HistoryDrawer.toggle();
    assert.equal(HistoryDrawer._isOpen, true);
    HistoryDrawer.toggle();
    assert.equal(HistoryDrawer._isOpen, false);
});

test('HistoryDrawer: _render shows empty state when no history', () => {
    const { window, HistoryDrawer } = loadDrawer();
    HistoryDrawer._render();
    const list = window.document.getElementById('historyList');
    assert.ok(list.innerHTML.indexOf('还没有历史记录') !== -1, 'should show empty state');
    const meta = window.document.getElementById('historyMeta');
    assert.equal(meta.textContent, '共 0 条');
});

test('HistoryDrawer: _render groups items by documentRef', () => {
    const { window, HistoryDrawer } = loadDrawer();
    HistoryDrawer.push(makeCard({ id: 'e1', documentRef: '报告.docx', sourceType: 'selection' }));
    HistoryDrawer.push(makeCard({ id: 'e2', documentRef: '报告.docx', sourceType: 'selection' }));
    HistoryDrawer.push(makeCard({ id: 'e3', documentRef: '合同.docx', sourceType: 'document' }));
    HistoryDrawer._render();
    const groups = window.document.querySelectorAll('.history-group');
    assert.equal(groups.length, 2, 'should have 2 groups (one per document)');
    const titles = window.document.querySelectorAll('.history-group-title');
    const titleTexts = Array.from(titles).map(t => t.textContent);
    assert.ok(titleTexts.some(t => t.indexOf('报告.docx') !== -1));
    assert.ok(titleTexts.some(t => t.indexOf('合同.docx') !== -1));
});

test('HistoryDrawer: _render shows source preview and result preview', () => {
    const { window, HistoryDrawer } = loadDrawer();
    HistoryDrawer.push(makeCard({
        id: 'f1',
        actionLabel: '润色',
        sourceText: '原始',
        resultText: '润色后的内容',
        status: 'done'
    }));
    HistoryDrawer._render();
    const html = window.document.getElementById('historyList').innerHTML;
    assert.ok(html.indexOf('原始') !== -1, 'source preview rendered');
    assert.ok(html.indexOf('润色后的内容') !== -1, 'result preview rendered');
    assert.ok(html.indexOf('润色') !== -1, 'action label rendered');
});

test('HistoryDrawer: _render includes status badge', () => {
    const { window, HistoryDrawer } = loadDrawer();
    HistoryDrawer.push(makeCard({ id: 'g1', status: 'done' }));
    HistoryDrawer.push(makeCard({ id: 'g2', status: 'error', error: '失败' }));
    HistoryDrawer._render();
    const html = window.document.getElementById('historyList').innerHTML;
    assert.ok(html.indexOf('is-done') !== -1, 'done status class present');
    assert.ok(html.indexOf('is-error') !== -1, 'error status class present');
    assert.ok(html.indexOf('失败') !== -1, 'error message shown');
});

test('HistoryDrawer: insert action calls WriterAdapter.insertAtCursor', () => {
    const { window, HistoryDrawer, WriterAdapter } = loadDrawer();
    const origInsert = WriterAdapter.insertAtCursor;
    let inserted = null;
    WriterAdapter.insertAtCursor = function (text) { inserted = text; return true; };
    HistoryDrawer.push(makeCard({ id: 'h1', resultText: 'insertable content' }));
    HistoryDrawer._actionInsert('h1');
    assert.equal(inserted, 'insertable content');
    WriterAdapter.insertAtCursor = origInsert;
});

test('HistoryDrawer: copy action uses clipboard', () => {
    const { window, HistoryDrawer } = loadDrawer();
    let copied = null;
    window.navigator.clipboard.writeText = (t) => { copied = t; };
    HistoryDrawer.push(makeCard({ id: 'i1', resultText: 'copyable' }));
    HistoryDrawer._actionCopy('i1');
    assert.equal(copied, 'copyable');
});

test('HistoryDrawer: _cleanResult strips thinking blocks', () => {
    const { HistoryDrawer } = loadDrawer();
    const cleaned = HistoryDrawer._cleanResult('```thinking\nhidden\n```\nvisible');
    assert.equal(cleaned, 'visible');
    const cleaned2 = HistoryDrawer._cleanResult('<think>hidden</think> final');
    assert.equal(cleaned2, 'final');
});

test('HistoryDrawer: _normalize fills defaults', () => {
    const { HistoryDrawer } = loadDrawer();
    const n = HistoryDrawer._normalize({ id: 'j1' });
    assert.equal(n.actionId, '');
    assert.equal(n.status, 'pending');
    assert.equal(n.resultText, '');
    assert.equal(n.sourceType, 'selection');
    assert.ok(n.createdAt > 0, 'createdAt should be set');
});

test('HistoryDrawer: _groupBySource separates by documentRef and sourceType', () => {
    const { HistoryDrawer } = loadDrawer();
    const items = [
        { id: 'k1', documentRef: 'a', sourceType: 'selection' },
        { id: 'k2', documentRef: 'a', sourceType: 'document' },
        { id: 'k3', documentRef: 'b', sourceType: 'selection' }
    ];
    const groups = HistoryDrawer._groupBySource(items);
    assert.equal(groups.length, 3, 'different (docRef, sourceType) create separate groups');
});
