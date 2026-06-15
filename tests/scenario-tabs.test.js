/**
 * tests/scenario-tabs.test.js — 响应式场景标签测试
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts, mockVendorLibs } = require('./_setup');

const TAB_DOM = `
<nav id="quickActions" class="scenario-strip" role="tablist">
    <div class="scenario-tabs" style="display:none;">
        <button class="scenario-tab is-active" data-category="writing" role="tab" aria-selected="true">创作</button>
        <button class="scenario-tab" data-category="modify" role="tab" aria-selected="false">修改</button>
        <button class="scenario-tab" data-category="document" role="tab" aria-selected="false">文档</button>
    </div>
    <div class="scenario-chips" data-category="writing">
        <button class="scenario-chip" data-action-id="write">帮我写</button>
    </div>
    <div class="scenario-chips" data-category="modify" hidden>
        <button class="scenario-chip" data-action-id="polish_quick">快速润色</button>
    </div>
    <div class="scenario-chips" data-category="document" hidden>
        <button class="scenario-chip" data-action-id="doc_summary">全文总结</button>
    </div>
</nav>
`;

function loadTabs() {
    const env = makeEnv(TAB_DOM);
    env.window.__ENV_API_KEY__ = 'sk-test';
    env.window.__ENV_API_BASE__ = 'https://api.test.com/v1';
    env.window.__ENV_MODEL__ = 'test';
    mockVendorLibs(env.window);
    // 显式设宽屏
    Object.defineProperty(env.window, 'innerWidth', { value: 1024, configurable: true });
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
        'taskpane/components/result-panel.js',
        'taskpane/components/chat.js'
    ]);
    // 注入 toast 监听 (新版本用 KwToast.show, 旧版本兼容 MessageRenderer._showToast)
    if (env.window.KwToast) {
        env.window.KwToast.show = function (msg) {
            env.window._lastToast = msg;
        };
    }
    if (env.window.MessageRenderer) {
        env.window.MessageRenderer._showToast = function (msg) {
            env.window._lastToast = msg;
        };
    }
    return Object.assign({}, env, {
        ChatUI: env.window.ChatUI,
        ActionRunner: env.window.ActionRunner,
        MessageRenderer: env.window.MessageRenderer,
        KwToast: env.window.KwToast
    });
}

test('scenario-tabs: clicking a tab activates that category (narrow mode)', () => {
    const { window, ChatUI } = loadTabs();
    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true });
    ChatUI._bindScenarioTabs();
    const modifyTab = window.document.querySelector('.scenario-tab[data-category="modify"]');
    modifyTab.click();
    assert.equal(modifyTab.classList.contains('is-active'), true, 'modify tab should be active');
    assert.equal(modifyTab.getAttribute('aria-selected'), 'true');
    const writingGroup = window.document.querySelector('.scenario-chips[data-category="writing"]');
    const modifyGroup = window.document.querySelector('.scenario-chips[data-category="modify"]');
    assert.equal(writingGroup.hidden, true, 'writing chips should be hidden');
    assert.equal(modifyGroup.hidden, false, 'modify chips should be visible');
});

test('scenario-tabs: only one tab is active at a time', () => {
    const { window, ChatUI } = loadTabs();
    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true });
    ChatUI._bindScenarioTabs();
    window.document.querySelector('.scenario-tab[data-category="document"]').click();
    const activeTabs = window.document.querySelectorAll('.scenario-tab.is-active');
    assert.equal(activeTabs.length, 1, 'only one tab is active');
    assert.equal(activeTabs[0].getAttribute('data-category'), 'document');
});

test('scenario-tabs: chip clicks trigger ActionRunner', () => {
    const { window, ChatUI, ActionRunner } = loadTabs();
    let runCalled = null;
    if (ActionRunner) {
        const orig = ActionRunner.run;
        ActionRunner.run = function (id) { runCalled = id; };
    }
    ChatUI._bindScenarioTabs();
    ChatUI._bindScenarioActions();
    const chip = window.document.querySelector('.scenario-chip[data-action-id="polish_quick"]');
    chip.click();
    assert.equal(runCalled, 'polish_quick', 'should call ActionRunner.run');
});

test('scenario-tabs: chip with data-require-selection shows toast when no selection', () => {
    const { window, ChatUI } = loadTabs();
    const group = window.document.querySelector('.scenario-chips[data-category="writing"]');
    group.innerHTML = '<button class="scenario-chip" data-action-id="imitate" data-require-selection="1">仿写</button>';
    ChatUI._bindScenarioActions();
    const chip = window.document.querySelector('.scenario-chip[data-action-id="imitate"]');
    chip.click();
    assert.ok(window._lastToast && window._lastToast.indexOf('选中') !== -1,
        'should show selection toast, got: ' + window._lastToast);
});

test('scenario-tabs: in wide viewport, all chip groups are visible', () => {
    const { window, ChatUI } = loadTabs();
    // 默认 jsdom innerWidth 是 1024, 视为宽屏
    ChatUI._bindScenarioTabs();
    ChatUI._setActiveCategory('writing');
    const groups = window.document.querySelectorAll('.scenario-chips');
    let allVisible = true;
    for (const g of groups) {
        if (g.hidden) { allVisible = false; break; }
    }
    assert.equal(allVisible, true, 'all groups should be visible in wide mode');
});

test('scenario-tabs: in narrow viewport, only active category chips are visible', () => {
    const { window, ChatUI } = loadTabs();
    // 模拟窄屏
    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true });
    ChatUI._bindScenarioTabs();
    ChatUI._setActiveCategory('modify');
    const writingGroup = window.document.querySelector('.scenario-chips[data-category="writing"]');
    const modifyGroup = window.document.querySelector('.scenario-chips[data-category="modify"]');
    const documentGroup = window.document.querySelector('.scenario-chips[data-category="document"]');
    assert.equal(writingGroup.hidden, true);
    assert.equal(modifyGroup.hidden, false);
    assert.equal(documentGroup.hidden, true);
});
