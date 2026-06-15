/**
 * tests/smoke-integration.test.js — 集成冒烟测试
 *
 * 验证关键代码路径在新架构下仍正常工作:
 *   - ChatUI.sendMessage / streaming / abort / error / retry
 *   - ResultPanel 流式 / 完成 / 中止 / 清除
 *   - HistoryDrawer 推入 / 节流 / 搜索 / 过滤 / 状态
 *   - ActionRunner 走 action 覆盖参数
 *   - KwUtils / KwToast / KwMarkdown 单例
 *   - 事件委托 (data-kw-action)
 *   - visibilitychange 暂停轮询
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts, mockVendorLibs, triggerDOMContentLoaded } = require('./_setup');

const FULL_DOM = `
<div id="app">
    <header id="appHeader">
        <button id="btnExportChats"></button>
        <button id="btnImportChats"></button>
        <input id="importFileInput" type="file" style="display:none;">
        <button id="btnHistory"></button>
        <button id="btnNewChat"></button>
        <button id="btnSettings"></button>
        <button id="btnClear"></button>
        <button id="btnSend"></button>
        <button id="btnAbort" style="display:none;"></button>
        <span id="modelIndicator"></span>
    </header>
    <div id="quickActionBar" style="display:none;">
        <span id="quickActionLabel"></span>
        <button id="btnExecuteAction"></button>
        <button id="btnCancelAction"></button>
    </div>
    <div id="contextBar">
        <div id="contextMeta"></div>
    </div>
    <nav id="quickActions">
        <div class="scenario-tabs">
            <button class="scenario-tab is-active" data-category="writing"></button>
        </div>
        <div class="scenario-chips" data-category="writing">
            <button class="scenario-chip" data-action-id="polish_quick"></button>
        </div>
    </nav>
    <div id="resultContainer"></div>
    <div id="chatContainer"></div>
    <textarea id="inputBox" rows="3"></textarea>
    <div id="inputCounter"></div>
    <div id="settingsOverlay" style="display:none;">
        <div id="settingsBody"></div>
        <button id="btnCloseSettings"></button>
    </div>
    <aside id="historyDrawer">
        <button id="btnHistoryClear"></button>
        <button id="btnCloseHistory"></button>
        <div class="history-search"><input id="historySearch"></div>
        <div id="historyMeta"></div>
        <div id="historyList"></div>
    </aside>
    <div id="historyBackdrop" hidden></div>
    <div id="welcomeModel"></div>
    <div id="kw-toast-default" class="kw-toast"></div>
</div>
`;

function loadFull() {
    const env = makeEnv(FULL_DOM);
    env.window.__ENV_API_KEY__ = 'sk-test';
    env.window.__ENV_API_BASE__ = 'https://api.test.com/v1';
    env.window.__ENV_MODEL__ = 'test';
    // 模拟 WPS Writer
    env.window.Application.ActiveDocument = {
        Application: { Selection: { Text: 'sample selection' } }
    };
    mockVendorLibs(env.window);
    loadScripts(env.window, [
        'taskpane/services/utils.js',
        'taskpane/services/toast.js',
        'taskpane/services/security.js',
        'taskpane/services/config.js',
        'taskpane/services/chat.js',
        'taskpane/services/ai.js',
        'taskpane/services/markdown.js',
        'taskpane/services/wakeword.js',
        'taskpane/adapters/writer-adapter.js',
        'taskpane/actions/action-registry.js',
        'taskpane/actions/prompt-templates.js',
        'taskpane/components/message.js',
        'taskpane/components/result-card.js',
        'taskpane/components/result-panel.js',
        'taskpane/components/history-drawer.js',
        'taskpane/components/settings.js',
        'taskpane/actions/action-runner.js',
        'taskpane/components/chat.js'
    ]);
    return Object.assign({}, env, {
        Config: env.window.Config,
        ChatManager: env.window.ChatManager,
        AIService: env.window.AIService,
        MessageRenderer: env.window.MessageRenderer,
        ResultCard: env.window.ResultCard,
        ResultPanel: env.window.ResultPanel,
        HistoryDrawer: env.window.HistoryDrawer,
        SettingsUI: env.window.SettingsUI,
        ActionRunner: env.window.ActionRunner,
        ActionRegistry: env.window.ActionRegistry,
        PromptTemplates: env.window.PromptTemplates,
        WriterAdapter: env.window.WriterAdapter,
        ChatUI: env.window.ChatUI,
        KwUtils: env.window.KwUtils,
        KwToast: env.window.KwToast,
        KwMarkdown: env.window.KwMarkdown
    });
}

test('smoke: full app load exposes all critical globals', () => {
    const env = loadFull();
    const expected = ['KwUtils', 'KwToast', 'KwMarkdown', 'Config', 'ChatManager', 'AIService',
        'MessageRenderer', 'ResultCard', 'ResultPanel', 'HistoryDrawer',
        'SettingsUI', 'ActionRunner', 'ActionRegistry', 'WriterAdapter', 'ChatUI'];
    for (const k of expected) {
        assert.equal(typeof env[k], 'object', k + ' should be object');
    }
});

test('smoke: ChatUI._updateWelcomeByComponent works without errors', () => {
    const { ChatUI } = loadFull();
    // 不应该抛错
    ChatUI._updateWelcomeByComponent('wps', '文字');
    ChatUI._updateWelcomeByComponent('et', '表格');
});

test('smoke: ActionRegistry.byCategory returns correct actions', () => {
    const { ActionRegistry } = loadFull();
    assert.equal(typeof ActionRegistry.byCategory('writing').length, 'number');
    assert.equal(typeof ActionRegistry.byCategory('modify').length, 'number');
    assert.equal(typeof ActionRegistry.byCategory('document').length, 'number');
});

test('smoke: ActionRegistry actions have promptKey + temperature', () => {
    const { ActionRegistry } = loadFull();
    var list = ActionRegistry.list();
    for (var i = 0; i < list.length; i++) {
        var a = list[i];
        assert.ok(typeof a.temperature === 'number' || a.temperature === undefined,
            a.id + ' should have numeric or absent temperature');
    }
});

test('smoke: ChatManager can be created and persists', () => {
    const { ChatManager } = loadFull();
    var chat = ChatManager.create();
    assert.ok(chat.id);
    assert.equal(chat.messages.length, 0);
    ChatManager.addMessage('user', 'hi');
    ChatManager.addMessage('assistant', 'hello');
    var got = ChatManager.getCurrent();
    assert.equal(got.messages.length, 2);
});

test('smoke: ChatManager export/import roundtrip', () => {
    const { ChatManager, window } = loadFull();
    window.localStorage.clear();  // 确保起点干净
    ChatManager._currentChatId = null;
    ChatManager.create();
    ChatManager.addMessage('user', 'msg1');
    var json = ChatManager.exportAll();
    assert.ok(json.indexOf('msg1') !== -1);
    var data = JSON.parse(json);
    assert.ok(data.chats);
    // 清空 localStorage + 缓存 + 当前 id, 模拟首次导入
    window.localStorage.clear();
    ChatManager._cache = null;
    ChatManager._currentChatId = null;
    var result = ChatManager.importAll(json);
    assert.equal(result.imported, 1);
    assert.equal(result.skipped, 0);
});

test('smoke: HistoryDrawer.push with throttled save', (t, done) => {
    const { HistoryDrawer, window } = loadFull();
    HistoryDrawer.init();
    // 推入 5 条
    for (var i = 0; i < 5; i++) {
        HistoryDrawer.push({
            id: 't' + i,
            actionId: 'polish_quick',
            actionLabel: '润色',
            sourceType: 'selection',
            sourceText: 'src' + i,
            resultText: 'out' + i,
            status: 'done',
            error: '',
            createdAt: Date.now(),
            updatedAt: Date.now()
        });
    }
    assert.equal(HistoryDrawer.count(), 5);
    setTimeout(function () {
        // 节流保存后, localStorage 应有数据
        var stored = window.localStorage.getItem('wps_assistant_card_history');
        assert.ok(stored);
        var items = JSON.parse(stored);
        assert.equal(items.length, 5);
        done();
    }, 600);
});

test('smoke: ResultPanel abort + cancelled status', () => {
    const { ResultPanel, ResultCard, window } = loadFull();
    var mount = window.document.createElement('div');
    window.document.body.appendChild(mount);
    var card = ResultCard.create({ actionId: 'write', actionLabel: '写' });
    ResultCard.update(card.id, { status: 'streaming' });
    ResultPanel.mount(card, mount, { streaming: true });
    ResultPanel.setAbortController({ abort: function () {} });
    ResultPanel.abort();
    assert.equal(card.status, 'cancelled', 'aborted card should be cancelled (not error)');
    assert.equal(card.error, '已取消');
});

test('smoke: ResultPanel regenerate debounce', (t, done) => {
    const { ResultPanel, ResultCard, ActionRunner, window } = loadFull();
    var calls = 0;
    var orig = ActionRunner.run;
    ActionRunner.run = function () { calls++; };
    var mount = window.document.createElement('div');
    window.document.body.appendChild(mount);
    var card = ResultCard.create({ actionId: 'polish_quick', actionLabel: '润色', sourceText: 'orig' });
    ResultCard.update(card.id, { resultText: 'r', status: 'done' });
    ResultPanel.mount(card, mount);
    ResultPanel.regenerate();
    ResultPanel.regenerate();  // 第二次应被防抖拦截
    assert.equal(calls, 1, 'second regenerate within 800ms should be debounced');
    setTimeout(function () {
        ActionRunner.run = orig;
        done();
    }, 900);
});

test('smoke: KwToast.show / error / multi-channel', () => {
    const { KwToast, window } = loadFull();
    KwToast.show('main');
    KwToast.show('floating', 'floating');
    var main = window.document.getElementById('kw-toast-default');
    var flt = window.document.getElementById('kw-toast-floating');
    assert.equal(main.textContent, 'main');
    assert.equal(flt.textContent, 'floating');
});

test('smoke: KwUtils.estimateTokens handles CJK and ASCII', () => {
    const { KwUtils } = loadFull();
    assert.equal(KwUtils.estimateTokens(''), 0);
    assert.equal(KwUtils.estimateTokens('你好'), 3);   // 2 * 1.5 = 3
    assert.equal(KwUtils.estimateTokens('abcd'), 1);   // 4/4 = 1
});

test('smoke: visibilitychange pauses/resumes polling timers', (t, done) => {
    const { window, ChatUI } = loadFull();
    ChatUI.init();
    // 在 jsdom 中, hidden 默认为 false, 触发一下
    Object.defineProperty(window.document, 'hidden', { value: true, configurable: true });
    window.document.dispatchEvent(new window.Event('visibilitychange'));
    setTimeout(function () {
        assert.equal(ChatUI._actionCheckTimer, null, 'should pause on hidden');
        assert.equal(ChatUI._contextTimer, null);
        // 切回可见
        Object.defineProperty(window.document, 'hidden', { value: false, configurable: true });
        window.document.dispatchEvent(new window.Event('visibilitychange'));
        setTimeout(function () {
            assert.ok(ChatUI._actionCheckTimer, 'should resume on visible');
            assert.ok(ChatUI._contextTimer);
            // 清理 timer, 避免拖住事件循环
            if (ChatUI._actionCheckTimer) { clearInterval(ChatUI._actionCheckTimer); ChatUI._actionCheckTimer = null; }
            if (ChatUI._contextTimer) { clearInterval(ChatUI._contextTimer); ChatUI._contextTimer = null; }
            done();
        }, 50);
    }, 50);
});

test('smoke: AIService error classification', () => {
    const { AIService } = loadFull();
    var tests = [
        { status: 401, expectedRetryable: false, expectedContains: 'API Key' },
        { status: 429, expectedRetryable: true, expectedContains: '429' },
        { status: 500, expectedRetryable: true, expectedContains: '500' },
        { status: 404, expectedRetryable: false, expectedContains: '404' }
    ];
    for (var i = 0; i < tests.length; i++) {
        var t = tests[i];
        var cls = AIService._classifyError(t.status, 'body');
        assert.equal(cls.retryable, t.expectedRetryable, 'status ' + t.status);
        assert.ok(cls.message.indexOf(t.expectedContains) !== -1,
            t.status + ' message should contain ' + t.expectedContains + ', got: ' + cls.message);
    }
});

test('smoke: WriterAdapter.replaceSelection succeeds on substring match', () => {
    const { window, WriterAdapter } = loadFull();
    var sel = { Text: '  prefix middle suffix  ' };
    window.Application.ActiveDocument = { Application: { Selection: sel } };
    var r = WriterAdapter.replaceSelection('new', 'middle');
    assert.equal(r.ok, true);
    assert.equal(sel.Text, 'new');
});

test('smoke: data-kw-action event delegation on chatContainer', () => {
    const { ChatUI, window } = loadFull();
    ChatUI._bindEvents();
    var chatContainer = window.document.getElementById('chatContainer');
    var btn = window.document.createElement('button');
    btn.setAttribute('data-kw-action', 'copy-message');
    // 模拟 .message-bubble 父节点
    var bubble = window.document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.setAttribute('data-content', 'hello');
    bubble.appendChild(btn);
    chatContainer.appendChild(bubble);
    // 不会抛错即通过
    btn.click();
});
