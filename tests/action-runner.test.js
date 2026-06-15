/**
 * tests/action-runner.test.js — ActionRunner 单元测试
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts, mockVendorLibs } = require('./_setup');

function loadRunner() {
    const env = makeEnv();
    mockVendorLibs(env.window);
    // Default apiKey
    env.window.__ENV_API_KEY__ = 'sk-test';
    env.window.__ENV_API_BASE__ = 'https://api.test.com/v1';
    env.window.__ENV_MODEL__ = 'test';
    loadScripts(env.window, [
        'taskpane/services/security.js',
        'taskpane/services/config.js',
        'taskpane/services/ai.js',
        'taskpane/adapters/writer-adapter.js',
        'taskpane/actions/action-registry.js',
        'taskpane/actions/prompt-templates.js',
        'taskpane/components/message.js',
        'taskpane/components/result-card.js',
        'taskpane/components/settings.js',
        'taskpane/actions/action-runner.js'
    ]);
    return {
        ...env,
        ActionRunner: env.window.ActionRunner,
        ActionRegistry: env.window.ActionRegistry,
        AIService: env.window.AIService,
        Config: env.window.Config,
        ResultCard: env.window.ResultCard,
        WriterAdapter: env.window.WriterAdapter,
        SettingsUI: env.window.SettingsUI,
        MessageRenderer: env.window.MessageRenderer,
        PromptTemplates: env.window.PromptTemplates
    };
}

test('ActionRunner: run with unknown action shows toast', () => {
    const { window, ActionRunner, MessageRenderer } = loadRunner();
    let toastMsg = null;
    const orig = MessageRenderer._showToast;
    MessageRenderer._showToast = (m) => { toastMsg = m; };
    ActionRunner.run('nonexistent_action');
    assert.ok(toastMsg && toastMsg.indexOf('未知') !== -1);
    MessageRenderer._showToast = orig;
});

test('ActionRunner: run with no apiKey opens settings', () => {
    const { window, ActionRunner, Config, MessageRenderer, SettingsUI } = loadRunner();
    Config.init();
    Config.set('apiKey', '');
    let settingsOpened = false;
    const origShow = SettingsUI.show;
    SettingsUI.show = () => { settingsOpened = true; };
    let toastMsg = null;
    const origToast = MessageRenderer._showToast;
    MessageRenderer._showToast = (m) => { toastMsg = m; };
    ActionRunner.run('polish_quick');
    assert.ok(toastMsg && toastMsg.indexOf('API Key') !== -1);
    assert.equal(settingsOpened, true);
    SettingsUI.show = origShow;
    MessageRenderer._showToast = origToast;
});

test('ActionRunner: run with no selection shows error', () => {
    const { window, ActionRunner, Config, MessageRenderer } = loadRunner();
    Config.init();
    Config.set('apiKey', 'sk-test');
    // No selection
    let toastMsg = null;
    const orig = MessageRenderer._showToast;
    MessageRenderer._showToast = (m) => { toastMsg = m; };
    ActionRunner.run('polish_quick');
    assert.ok(toastMsg && toastMsg.indexOf('选中文本') !== -1);
    MessageRenderer._showToast = orig;
});

test('ActionRunner: run with selection streams AI response', async () => {
    const { window, ctx, ActionRunner, Config, ResultCard } = loadRunner();
    Config.init();
    Config.set('apiKey', 'sk-test');
    // Mock selection
    window.Application.ActiveDocument = {
        Application: { Selection: { Text: '原文明本' } }
    };
    // Mock fetch with SSE — set on the ctx so the script's free variable
    // `fetch` resolves to our mock.
    const chunks = [
        'data: {"choices":[{"delta":{"content":"润色结果"}}]}',
        'data: [DONE]'
    ];
    ctx.fetch = () => Promise.resolve({
        ok: true,
        body: new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(chunks.join('\n')));
                controller.close();
            }
        })
    });
    let cardCreated = null;
    const origCreate = ResultCard.create;
    ResultCard.create = function (opts) {
        cardCreated = origCreate.call(ResultCard, opts);
        return cardCreated;
    };
    let completed = null;
    ResultCard.complete = (id, text) => { completed = text; };
    await new Promise((resolve) => {
        ActionRunner.run('polish_quick');
        setTimeout(resolve, 300);
    });
    assert.ok(cardCreated, 'card should be created');
    assert.equal(cardCreated.sourceText, '原文明本');
    assert.equal(completed, '润色结果', 'complete should be called with stream content');
    ResultCard.create = origCreate;
});

test('ActionRunner: user-input action with no text waits for user', () => {
    const { window, ActionRunner, Config, MessageRenderer } = loadRunner();
    Config.init();
    Config.set('apiKey', 'sk-test');
    let toastMsg = null;
    const orig = MessageRenderer._showToast;
    MessageRenderer._showToast = (m) => { toastMsg = m; };
    ActionRunner.run('write');
    assert.ok(toastMsg && toastMsg.indexOf('请输入') !== -1);
    MessageRenderer._showToast = orig;
});

test('ActionRunner: prepareUserAction sets active_user_action', () => {
    const { window, ActionRunner } = loadRunner();
    ActionRunner.prepareUserAction(ActionRunner.run ? { id: 'write', label: '写' } : null);
    // Actually need to pass the action object
    const action = window.ActionRegistry.get('write');
    ActionRunner.prepareUserAction(action);
    assert.equal(window.Application.PluginStorage.getItem('active_user_action'), 'write');
});

test('ActionRunner: runPreparedUserAction uses stored action', () => {
    const { window, ctx, ActionRunner, Config, ResultCard } = loadRunner();
    Config.init();
    Config.set('apiKey', 'sk-test');
    const action = window.ActionRegistry.get('write');
    ActionRunner.prepareUserAction(action);
    let cardCreated = null;
    const origCreate = ResultCard.create;
    ResultCard.create = function (opts) {
        cardCreated = origCreate.call(ResultCard, opts);
        return cardCreated;
    };
    // Mock fetch via ctx (so the script sees it)
    ctx.fetch = () => Promise.resolve({
        ok: true,
        body: new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"result"}}]}\ndata: [DONE]\n'));
                controller.close();
            }
        })
    });
    ResultCard.complete = () => {};
    const result = ActionRunner.runPreparedUserAction('请帮我写');
    assert.equal(result, true);
    assert.equal(window.Application.PluginStorage.getItem('active_user_action'), '');
    assert.ok(cardCreated);
    assert.equal(cardCreated.sourceText, '请帮我写');
    ResultCard.create = origCreate;
});

test('ActionRunner: imitate action uses selection + user input', () => {
    const { window, ctx, ActionRunner, Config, PromptTemplates, ResultCard } = loadRunner();
    Config.init();
    Config.set('apiKey', 'sk-test');
    window.Application.ActiveDocument = {
        Application: { Selection: { Text: '权威的官方报告风格' } }
    };
    let builtMessages = null;
    const origBuildTpl = PromptTemplates.buildMessages;
    PromptTemplates.buildMessages = function (key, ctx) {
        builtMessages = ctx;
        return origBuildTpl.call(PromptTemplates, key, ctx);
    };
    let cardCreated = null;
    const origCreate = ResultCard.create;
    ResultCard.create = function (opts) {
        cardCreated = origCreate.call(ResultCard, opts);
        return cardCreated;
    };
    // Mock fetch via ctx
    ctx.fetch = () => Promise.resolve({
        ok: true,
        body: new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"x"}}]}\ndata: [DONE]\n'));
                controller.close();
            }
        })
    });
    ResultCard.complete = () => {};
    // Run with user input
    ActionRunner.run('imitate', { userInput: '关于AI的' });
    assert.ok(builtMessages, 'buildMessages should be called');
    assert.equal(builtMessages.input, '权威的官方报告风格');
    assert.equal(builtMessages.question, '关于AI的');
    PromptTemplates.buildMessages = origBuildTpl;
    ResultCard.create = origCreate;
});
