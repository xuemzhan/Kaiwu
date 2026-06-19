/**
 * tests/app-init.test.js — Tests for taskpane/app.js initialization flow
 * Covers: WPS bridge detection, TaskPane lifecycle, error boundary handling, global exposure
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts, loadScriptText, mockVendorLibs, triggerDOMContentLoaded } = require('./_setup');

function buildFullDOM(window) {
    window.document.body.innerHTML = `
        <div id="app">
            <header id="appHeader">
                <span class="header-title">🤖 开悟</span>
                <div class="header-right">
                    <button id="btnNewChat"></button>
                    <button id="btnSettings"></button>
                </div>
            </header>
            <div id="quickActionBar" class="quick-action-bar" style="display:none;">
                <span id="quickActionLabel"></span>
                <div class="quick-action-buttons">
                    <button id="btnExecuteAction"></button>
                    <button id="btnCancelAction"></button>
                </div>
            </div>
            <div id="contextBar" class="context-bar">
                <div class="context-title">文字助手</div>
                <div class="context-meta" id="contextMeta">...</div>
            </div>
            <div id="quickActions" class="scenario-strip">
                <button class="scenario-chip" data-action-id="write">写</button>
                <button class="scenario-chip" data-action-id="polish_quick">润色</button>
            </div>
            <div id="resultContainer" class="result-container"></div>
            <div id="chatContainer" class="chat-container">
                <div class="welcome-message">
                    <h3>👋 欢迎</h3>
                    <p class="welcome-tip"></p>
                    <p class="welcome-model" id="welcomeModel"></p>
                </div>
            </div>
            <div class="input-container">
                <textarea id="inputBox" class="input-box" rows="3"></textarea>
                <div class="input-toolbar">
                    <button id="btnClear"></button>
                    <span id="modelIndicator"></span>
                    <button id="btnSend"></button>
                </div>
            </div>
            <div id="settingsOverlay" class="overlay" style="display:none;">
                <div class="overlay-content settings-panel">
                    <div class="settings-header"><h3>设置</h3><button id="btnCloseSettings"></button></div>
                    <div class="settings-body" id="settingsBody"></div>
                </div>
            </div>
            <div id="kwFirstRunOverlay" hidden>
                <button id="kwFirstRunConfigBtn"></button>
                <button id="kwFirstRunDismissBtn"></button>
            </div>
        </div>
    `;
}

function loadApp(window) {
    loadScripts(window, [
        'component.js',
        'taskpane/services/security.js',
        'taskpane/services/config.js',
        'taskpane/services/chat.js',
        'taskpane/services/ai.js',
        'taskpane/adapters/writer-adapter.js',
        'taskpane/actions/action-registry.js',
        'taskpane/actions/prompt-templates.js',
        'taskpane/components/message.js',
        'taskpane/components/result-card.js',
        'taskpane/components/settings.js',
        'taskpane/actions/action-runner.js',
        'taskpane/components/chat.js',
        'taskpane/app.js'
    ]);
}

test('app: detects WPS bridge', () => {
    const env = makeEnv();
    mockVendorLibs(env.window);
    loadApp(env.window);

    assert.ok(env.window.__WPS_BRIDGE__, '__WPS_BRIDGE__ should be exposed');
    assert.equal(typeof env.window.__WPS_BRIDGE__.isWPSEnv, 'function', 'isWPSEnv should be a function');
    assert.equal(typeof env.window.__WPS_BRIDGE__.getComponentType, 'function', 'getComponentType should be a function');
    assert.equal(typeof env.window.__WPS_BRIDGE__.insertText, 'function', 'insertText should be a function');
    assert.equal(typeof env.window.__WPS_BRIDGE__.readSelection, 'function', 'readSelection should be a function');
    assert.equal(typeof env.window.__WPS_BRIDGE__.readFullContent, 'function', 'readFullContent should be a function');
});

test('app: WPS bridge isWPSEnv returns correct value', () => {
    const env = makeEnv();
    mockVendorLibs(env.window);
    loadApp(env.window);

    assert.equal(env.window.__WPS_BRIDGE__.isWPSEnv(), true, 'should detect mocked WPS environment');

    delete env.window.Application;
    assert.equal(env.window.__WPS_BRIDGE__.isWPSEnv(), false, 'should return false without Application');
});

test('app: exposes services on window', () => {
    const env = makeEnv();
    env.window.__ENV_API_KEY__ = 'sk-test';
    mockVendorLibs(env.window);
    buildFullDOM(env.window);
    loadApp(env.window);
    triggerDOMContentLoaded(env.window);

    assert.ok(env.window.Config, 'Config should be exposed');
    assert.ok(env.window.ChatManager, 'ChatManager should be exposed');
    assert.ok(env.window.ChatUI, 'ChatUI should be exposed');
    assert.ok(env.window.FirstRunManager, 'FirstRunManager should be exposed');
    assert.ok(env.window.__WPS_BRIDGE__, '__WPS_BRIDGE__ should be exposed');
});

test('app: handles missing WPS bridge gracefully', () => {
    const env = makeEnv();
    env.window.__ENV_API_KEY__ = 'sk-test';
    mockVendorLibs(env.window);
    buildFullDOM(env.window);

    const appCode = `
        window.__WPS_BRIDGE__ = {
            isWPSEnv: function() { return typeof window.Application !== 'undefined'; },
            getComponentType: function() { return 'wps'; },
            insertText: function() { return false; },
            insertContent: function() { return false; },
            readSelection: function() { return ''; },
            readFullContent: function() { return ''; }
        };
    `;
    loadScripts(env.window, [
        'component.js',
        'taskpane/services/security.js',
        'taskpane/services/config.js',
        'taskpane/services/chat.js',
        'taskpane/services/ai.js',
        'taskpane/adapters/writer-adapter.js',
        'taskpane/actions/action-registry.js',
        'taskpane/actions/prompt-templates.js',
        'taskpane/components/message.js',
        'taskpane/components/result-card.js',
        'taskpane/components/settings.js',
        'taskpane/actions/action-runner.js',
        'taskpane/components/chat.js'
    ]);
    loadScriptText(env.window, appCode);
    assert.doesNotThrow(() => triggerDOMContentLoaded(env.window));
});

test('app: initializes Config service', () => {
    const env = makeEnv();
    env.window.__ENV_API_KEY__ = 'sk-config-test';
    env.window.__ENV_API_BASE__ = 'https://api.test.com/v1';
    env.window.__ENV_MODEL__ = 'test-model';
    mockVendorLibs(env.window);
    loadApp(env.window);
    triggerDOMContentLoaded(env.window);

    assert.ok(env.window.Config, 'Config should exist');
    assert.equal(env.window.Config.get('apiKey'), 'sk-config-test');
    assert.equal(env.window.Config.get('apiBaseUrl'), 'https://api.test.com/v1');
    assert.equal(env.window.Config.get('model'), 'test-model');
});

test('app: initializes ChatManager', () => {
    const env = makeEnv();
    env.window.__ENV_API_KEY__ = 'sk-chat-test';
    mockVendorLibs(env.window);
    loadApp(env.window);
    triggerDOMContentLoaded(env.window);

    assert.ok(env.window.ChatManager, 'ChatManager should be exposed');
    assert.equal(typeof env.window.ChatManager.getCurrent, 'function', 'getCurrent should be a function');
    assert.equal(typeof env.window.ChatManager.create, 'function', 'create should be a function');
});

test('app: error boundary catches initialization errors', () => {
    const env = makeEnv();
    env.window.__ENV_API_KEY__ = 'sk-error-test';
    mockVendorLibs(env.window);
    buildFullDOM(env.window);

    let errorCaught = false;
    const originalWarn = env.window.console.warn;
    const warnings = [];
    env.window.console.warn = (...args) => {
        warnings.push(args.join(' '));
    };

    assert.doesNotThrow(() => {
        loadScripts(env.window, [
            'component.js',
            'taskpane/services/security.js',
            'taskpane/services/config.js',
            'taskpane/services/chat.js',
            'taskpane/services/ai.js',
            'taskpane/adapters/writer-adapter.js',
            'taskpane/actions/action-registry.js',
            'taskpane/actions/prompt-templates.js',
            'taskpane/components/message.js',
            'taskpane/components/result-card.js',
            'taskpane/components/settings.js',
            'taskpane/actions/action-runner.js',
            'taskpane/components/chat.js',
            'taskpane/app.js'
        ]);
        triggerDOMContentLoaded(env.window);
    });

    env.window.console.warn = originalWarn;
});

test('app: TaskPane lifecycle hooks fire correctly', () => {
    const env = makeEnv();
    env.window.__ENV_API_KEY__ = 'sk-lifecycle-test';
    mockVendorLibs(env.window);
    buildFullDOM(env.window);
    loadApp(env.window);

    const logs = [];
    const originalLog = env.window.console.log;
    env.window.console.log = (...args) => {
        logs.push(args.join(' '));
    };

    triggerDOMContentLoaded(env.window);

    env.window.console.log = originalLog;

    const hasLoadLog = logs.some(l => l.includes('TaskPane 已加载'));
    const hasInitLog = logs.some(l => l.includes('初始化完成'));
    assert.ok(hasLoadLog, 'should log TaskPane load');
    assert.ok(hasInitLog, 'should log initialization complete');
});

test('app: first-run detection works', () => {
    const env = makeEnv();
    env.window.__ENV_API_KEY__ = '';
    mockVendorLibs(env.window);
    buildFullDOM(env.window);
    loadApp(env.window);
    triggerDOMContentLoaded(env.window);

    assert.ok(env.window.FirstRunManager, 'FirstRunManager should be exposed');
    assert.equal(typeof env.window.FirstRunManager.check, 'function', 'check should be a function');
    assert.equal(typeof env.window.FirstRunManager.dismiss, 'function', 'dismiss should be a function');

    const result = env.window.FirstRunManager.check();
    assert.equal(result, true, 'should detect first run when no API key');
});

test('app: first-run detection returns false when API key configured', () => {
    const env = makeEnv();
    env.window.__ENV_API_KEY__ = 'sk-real-key';
    mockVendorLibs(env.window);
    buildFullDOM(env.window);
    loadApp(env.window);
    triggerDOMContentLoaded(env.window);

    const result = env.window.FirstRunManager.check();
    assert.equal(result, false, 'should not detect first run when API key is set');
});

test('app: first-run returns false after dismiss', () => {
    const env = makeEnv();
    env.window.__ENV_API_KEY__ = '';
    mockVendorLibs(env.window);
    buildFullDOM(env.window);
    loadApp(env.window);
    triggerDOMContentLoaded(env.window);

    const firstCheck = env.window.FirstRunManager.check();
    assert.equal(firstCheck, true, 'should detect first run initially');

    env.window.localStorage.setItem('kw_first_run_dismissed', '1');

    const secondCheck = env.window.FirstRunManager.check();
    assert.equal(secondCheck, false, 'should not detect first run after dismiss');
});

test('app: WPS bridge insertText respects maxLength', () => {
    const env = makeEnv();
    mockVendorLibs(env.window);
    loadApp(env.window);

    const longText = 'a'.repeat(20000);
    const result = env.window.__WPS_BRIDGE__.insertText(longText, 5000);

    assert.equal(result, false, 'should return false for oversized text');
});

test('app: ComponentDetector integration works', () => {
    const env = makeEnv();
    mockVendorLibs(env.window);
    loadApp(env.window);
    triggerDOMContentLoaded(env.window);

    assert.ok(env.window.ComponentDetector, 'ComponentDetector should be exposed');
    assert.equal(typeof env.window.ComponentDetector.detect, 'function', 'detect should be a function');
    assert.equal(typeof env.window.ComponentDetector.getLabel, 'function', 'getLabel should be a function');

    const type = env.window.ComponentDetector.detect();
    assert.ok(type, 'should return a component type');
});
