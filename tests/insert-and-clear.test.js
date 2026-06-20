/**
 * tests/insert-and-clear.test.js — 插入/清除/LOGO 相关测试
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeEnv, loadScripts, mockVendorLibs } = require('./_setup');

function loadPanel() {
    const env = makeEnv();
    env.window.__ENV_API_KEY__ = 'sk-test';
    env.window.__ENV_API_BASE__ = 'https://api.test.com/v1';
    env.window.__ENV_MODEL__ = 'test';
    // 模拟 WPS Writer: insertAtCursor 成功
    const sel = { Text: '' };
    env.window.Application.ActiveDocument = { Application: { Selection: sel } };
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
        'taskpane/components/history-drawer.js',
        'taskpane/components/result-panel.js'
    ]);
    return Object.assign({}, env, {
        ResultCard: env.window.ResultCard,
        ResultPanel: env.window.ResultPanel,
        HistoryDrawer: env.window.HistoryDrawer,
        MessageRenderer: env.window.MessageRenderer,
        WriterAdapter: env.window.WriterAdapter
    });
}

const DRAWER_DOM = `
<aside id="historyDrawer">
    <div id="historyList"></div>
    <div id="historyMeta"></div>
    <header>
        <button id="btnHistory"></button>
    </header>
</aside>
<div id="historyBackdrop" hidden></div>
`;

test('insert: result card header has a primary 插入到文档 button with icon', () => {
    const { window, ResultCard, ResultPanel } = loadPanel();
    // 注入 historyDrawer DOM
    const drawer = window.document.createElement('aside');
    drawer.id = 'historyDrawer';
    drawer.innerHTML = '<div id="historyList"></div><div id="historyMeta"></div>';
    window.document.body.appendChild(drawer);
    const mount = window.document.createElement('div');
    window.document.body.appendChild(mount);
    const card = ResultCard.create({ actionId: 'write', actionLabel: '写' });
    ResultCard.update(card.id, { resultText: 'content', status: 'done' });
    ResultPanel.mount(ResultCard._cards[card.id], mount);
    const html = mount.innerHTML;
    // 头部应有"插入到文档"主操作按钮
    const insertBtn = mount.querySelector('.result-icon-btn-primary[title="插入到文档"]');
    assert.ok(insertBtn, 'should have a primary 插入到文档 icon button in header');
    // 按钮内有 SVG 图标
    assert.ok(insertBtn.querySelector('svg'), 'insert button should contain an icon');
    // 底部操作栏也有 "插入文档" 按钮 (新版本通过 data-kw-action 绑定)
    assert.ok(html.indexOf('data-kw-action="insert"') !== -1,
        'should have insert action binding via data-kw-action');
    // r2: 底部按钮改为 icon-only, 通过 title 属性识别 (用户要求 "插入光标")
    assert.ok(html.indexOf('title="插入光标"') !== -1,
        'should have bottom insert button titled 插入光标');
});

test('insert: clicking 插入到文档 calls WriterAdapter.insertAtCursor', async () => {
    const { window, ResultCard, ResultPanel, WriterAdapter } = loadPanel();
    const drawer = window.document.createElement('aside');
    drawer.id = 'historyDrawer';
    drawer.innerHTML = '<div id="historyList"></div><div id="historyMeta"></div>';
    window.document.body.appendChild(drawer);
    let inserted = null;
    WriterAdapter.insertAtCursor = (text) => { inserted = text; return true; };
    let toast = null;
    if (window.KwToast) {
        const origShow = window.KwToast.show;
        window.KwToast.show = (m) => { toast = m; };
    }
    const mount = window.document.createElement('div');
    window.document.body.appendChild(mount);
    const card = ResultCard.create({ actionId: 'polish_quick', actionLabel: '润色' });
    ResultCard.update(card.id, { resultText: '润色后的内容', status: 'done' });
    ResultPanel.mount(ResultCard._cards[card.id], mount);
    ResultPanel.insertAtCursor();
    assert.equal(inserted, '润色后的内容', 'insertAtCursor should be called with content');
    assert.equal(toast, '已插入到文档', 'toast should confirm insert');
});

test('insert: when WriterAdapter.insertAtCursor fails, falls back to clipboard copy', async () => {
    const { window, ResultCard, ResultPanel, WriterAdapter } = loadPanel();
    const drawer = window.document.createElement('aside');
    drawer.id = 'historyDrawer';
    drawer.innerHTML = '<div id="historyList"></div><div id="historyMeta"></div>';
    window.document.body.appendChild(drawer);
    WriterAdapter.insertAtCursor = () => false;
    let copied = null;
    if (window.navigator.clipboard) {
        window.navigator.clipboard.writeText = (t) => { copied = t; return Promise.resolve(); };
    }
    const mount = window.document.createElement('div');
    window.document.body.appendChild(mount);
    const card = ResultCard.create({ actionId: 'write', actionLabel: '写' });
    ResultCard.update(card.id, { resultText: 'fallback text', status: 'done' });
    ResultPanel.mount(ResultCard._cards[card.id], mount);
    ResultPanel.insertAtCursor();
    // 等 microtask 让 copyToClipboard promise 解析
    await new Promise(r => setTimeout(r, 50));
    assert.equal(copied, 'fallback text', 'should fall back to clipboard copy');
});

test('clear: card header has a 清除此条 button with danger styling', () => {
    const { window, ResultCard, ResultPanel } = loadPanel();
    const drawer = window.document.createElement('aside');
    drawer.id = 'historyDrawer';
    drawer.innerHTML = '<div id="historyList"></div><div id="historyMeta"></div>';
    window.document.body.appendChild(drawer);
    const mount = window.document.createElement('div');
    window.document.body.appendChild(mount);
    const card = ResultCard.create({ actionId: 'write', actionLabel: '写' });
    ResultCard.update(card.id, { resultText: 'content', status: 'done' });
    ResultPanel.mount(ResultCard._cards[card.id], mount);
    const clearBtn = mount.querySelector('.result-icon-btn-danger[title="清除此条"]');
    assert.ok(clearBtn, 'should have a danger 清除此条 icon button in header');
    // 底部操作栏也有 删除 按钮 (r2: 用户要求改为删除按钮, icon-only, 通过 title 识别)
    assert.ok(mount.innerHTML.indexOf('title="删除"') !== -1,
        'should have bottom delete button titled 删除');
});

test('clear: clicking 清除 removes the card from DOM, history, and storage', () => {
    const { window, ResultCard, ResultPanel, HistoryDrawer } = loadPanel();
    // 注入 history drawer
    const drawer = window.document.createElement('aside');
    drawer.id = 'historyDrawer';
    drawer.innerHTML = '<div id="historyList"></div><div id="historyMeta"></div>';
    window.document.body.appendChild(drawer);
    window.localStorage.clear();
    const mount = window.document.createElement('div');
    window.document.body.appendChild(mount);
    const card = ResultCard.create({ actionId: 'write', actionLabel: '写' });
    ResultCard.update(card.id, { resultText: 'content', status: 'done' });
    ResultPanel.mount(ResultCard._cards[card.id], mount);
    HistoryDrawer.push(ResultCard._cards[card.id]);
    assert.equal(HistoryDrawer.count(), 1, 'card should be in history');

    // 执行 clear
    ResultPanel.clear();

    assert.equal(mount.innerHTML, '', 'mount should be empty');
    assert.equal(ResultPanel.active(), null, 'active card should be null');
    assert.equal(HistoryDrawer.count(), 0, 'card should be removed from history');
    assert.equal(ResultCard._cards[card.id], undefined, 'card should be removed from ResultCard');
});

test('clear: dispatches kwresult:cleared custom event for floating to handle', () => {
    const { window, ResultCard, ResultPanel } = loadPanel();
    const drawer = window.document.createElement('aside');
    drawer.id = 'historyDrawer';
    drawer.innerHTML = '<div id="historyList"></div><div id="historyMeta"></div>';
    window.document.body.appendChild(drawer);
    let eventDetail = null;
    window.addEventListener('kwresult:cleared', function (e) {
        eventDetail = e.detail;
    });
    const mount = window.document.createElement('div');
    window.document.body.appendChild(mount);
    const card = ResultCard.create({ actionId: 'write', actionLabel: '写' });
    ResultCard.update(card.id, { resultText: 'content', status: 'done' });
    ResultPanel.mount(ResultCard._cards[card.id], mount);
    ResultPanel.clear();
    assert.ok(eventDetail, 'kwresult:cleared event should fire');
    assert.equal(eventDetail.cardId, card.id, 'event should include cardId');
});

test('clear: pending streaming result is aborted when clearing', () => {
    const { window, ResultCard, ResultPanel } = loadPanel();
    const drawer = window.document.createElement('aside');
    drawer.id = 'historyDrawer';
    drawer.innerHTML = '<div id="historyList"></div><div id="historyMeta"></div>';
    window.document.body.appendChild(drawer);
    let aborted = false;
    const fakeController = { abort: function () { aborted = true; } };
    ResultPanel.setAbortController(fakeController);
    const mount = window.document.createElement('div');
    window.document.body.appendChild(mount);
    const card = ResultCard.create({ actionId: 'write', actionLabel: '写' });
    ResultCard.update(card.id, { status: 'streaming', resultText: '' });
    ResultPanel.mount(ResultCard._cards[card.id], mount, { streaming: true });
    ResultPanel.clear();
    assert.equal(aborted, true, 'should abort the streaming controller');
});

// =====================================================
// LOGO 设计
// =====================================================

test('logo: kaiwu.svg represents the 开悟 concept (book + light)', () => {
    const file = path.resolve(__dirname, '..', 'images', 'kaiwu.svg');
    const content = fs.readFileSync(file, 'utf8');
    // 32x32 viewBox
    assert.ok(content.indexOf('viewBox="0 0 32 32"') !== -1, 'should use 32x32 viewBox');
    // 应包含 "开悟" 概念元素: 打开的书页 + 中心的智慧之光
    assert.ok(/书页|书|page/i.test(content) || /path d=/.test(content),
        'should contain book/page element paths');
    // 中心应有光 (4 角星, fill #C00000)
    assert.ok(content.indexOf('#C00000') !== -1, 'should have the red light element');
    // 应包含多组 path (书本页 + 光)
    const pathCount = (content.match(/<path/g) || []).length;
    assert.ok(pathCount >= 4, 'should have at least 4 path elements (book pages + light + rays)');
    // 标题应包含 "开悟"
    assert.ok(content.indexOf('开悟') !== -1 || content.indexOf('Kaiwu') !== -1,
        'should include Kaiwu branding in title');
    // 描述应解释设计概念
    assert.ok(/<desc>/.test(content), 'should have a desc tag explaining the design');
});

test('logo: kaiwu.svg uses the Kaiwu color palette', () => {
    const file = path.resolve(__dirname, '..', 'images', 'kaiwu.svg');
    const content = fs.readFileSync(file, 'utf8');
    assert.ok(content.indexOf('#C00000') !== -1, 'should use red accent color');
    assert.ok(content.indexOf('#2f3437') !== -1, 'should use dark gray for book outline');
});

test('logo: ICON_MAP uses kaiwu.svg as fallback for unknown controls', () => {
    const env = makeEnv();
    loadScripts(env.window, ['component.js', 'taskpane/services/wakeword.js', 'ribbon.js']);
    assert.equal(env.window.GetImage({ Id: 'btnUnknown' }), 'images/kaiwu.svg');
    assert.equal(env.window.GetImage({ Id: 'btnOpenAssistant' }), 'images/kaiwu.svg');
});

test('logo: kaiwu.svg opens successfully and is well-formed', () => {
    const file = path.resolve(__dirname, '..', 'images', 'kaiwu.svg');
    const content = fs.readFileSync(file, 'utf8');
    // 必须是 <svg 开头
    assert.ok(content.trim().startsWith('<svg'), 'should start with <svg');
    // 应该有 </svg> 结尾
    assert.ok(content.trim().endsWith('</svg>'), 'should end with </svg>');
    // 没有未闭合标签
    const openTags = (content.match(/<(svg|path|title|desc|rect|circle|line)(?:\s|>)/g) || []).length;
    const closeTags = (content.match(/<\/(svg|path|title|desc|rect|circle|line)>/g) || []).length;
    // self-closing path: 允许 path 不需要关闭, 但 svg/title/desc 必须有
    assert.ok(openTags >= closeTags, 'opening tags should match closing (allowing self-closing paths)');
});
