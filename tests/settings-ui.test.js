/**
 * tests/settings-ui.test.js — SettingsUI 组件测试
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts } = require('./_setup');

function makeSettingsEnv() {
    const env = makeEnv(`<!DOCTYPE html><html><body>
        <div id="settingsOverlay" style="display:none;"></div>
        <div id="settingsBody"></div>
    </body></html>`);
    env.window.__ENV_API_KEY__ = 'sk-test-key-123';
    env.window.__ENV_API_BASE__ = 'https://api.test.com/v1';
    env.window.__ENV_MODEL__ = 'MiniMax-M3';
    loadScripts(env.window, [
        'taskpane/services/config.js',
        'taskpane/components/settings.js'
    ]);
    env.window.ChatUI = { _updateModelIndicator: () => {} };
    return { ...env, SettingsUI: env.window.SettingsUI, Config: env.window.Config };
}

describe('SettingsUI', () => {
    test('panel opens and closes', () => {
        const { window, SettingsUI } = makeSettingsEnv();
        const overlay = window.document.getElementById('settingsOverlay');
        assert.equal(overlay.style.display, 'none');
        SettingsUI.show();
        assert.equal(overlay.style.display, 'flex');
        SettingsUI.hide();
        assert.equal(overlay.style.display, 'none');
    });

    test('renders all form fields', () => {
        const { window, SettingsUI, Config } = makeSettingsEnv();
        Config.init();
        SettingsUI.show();
        assert.ok(window.document.getElementById('settingBaseUrl'));
        assert.ok(window.document.getElementById('settingApiKey'));
        assert.ok(window.document.getElementById('settingModelSelect'));
        assert.ok(window.document.getElementById('settingModelCustom'));
        assert.ok(window.document.getElementById('settingPrompt'));
        assert.ok(window.document.getElementById('settingTemp'));
        assert.ok(window.document.getElementById('settingMaxTokens'));
        assert.ok(window.document.getElementById('btnSaveSettings'));
        assert.ok(window.document.getElementById('btnResetConfig'));
    });

    test('masks API key in display', () => {
        const { window, SettingsUI, Config } = makeSettingsEnv();
        Config.init();
        SettingsUI.show();
        const apiKeyInput = window.document.getElementById('settingApiKey');
        assert.equal(apiKeyInput.type, 'password');
    });

    test('save action persists to config', () => {
        const { window, SettingsUI, Config } = makeSettingsEnv();
        Config.init();
        SettingsUI.show();
        window.document.getElementById('settingBaseUrl').value = 'https://new.api.com/v1';
        window.document.getElementById('settingApiKey').value = 'sk-new-key';
        window.document.getElementById('settingModelSelect').value = 'gpt-4o';
        window.document.getElementById('settingPrompt').value = 'Custom prompt';
        window.document.getElementById('settingTemp').value = '0.8';
        window.document.getElementById('settingMaxTokens').value = '8192';
        window.document.getElementById('btnSaveSettings').click();
        assert.equal(Config.get('apiBaseUrl'), 'https://new.api.com/v1');
        assert.equal(Config.get('apiKey'), 'sk-new-key');
        assert.equal(Config.get('model'), 'gpt-4o');
        assert.equal(Config.get('systemPrompt'), 'Custom prompt');
    });

    test('reset action restores defaults', () => {
        const { window, SettingsUI, Config } = makeSettingsEnv();
        Config.init();
        Config.set({ apiKey: 'sk-custom', apiBaseUrl: 'https://custom.com', model: 'custom-model' });
        SettingsUI.show();
        window.document.getElementById('btnResetConfig').click();
        const data = Config.getAll();
        assert.equal(data.apiKey, '');
        assert.equal(data.apiBaseUrl, 'https://api.test.com/v1');
    });

    test('shows error for missing API key on save', () => {
        const { window, SettingsUI, Config } = makeSettingsEnv();
        Config.init();
        SettingsUI.show();
        window.document.getElementById('settingApiKey').value = '';
        window.document.getElementById('settingBaseUrl').value = 'https://api.test.com';
        window.document.getElementById('settingModelSelect').value = 'MiniMax-M3';
        window.document.getElementById('btnSaveSettings').click();
        const status = window.document.getElementById('formStatus');
        assert.ok(status.textContent.includes('API Key'));
    });

    test('shows error for missing API base URL on save', () => {
        const { window, SettingsUI, Config } = makeSettingsEnv();
        Config.init();
        SettingsUI.show();
        window.document.getElementById('settingApiKey').value = 'sk-key';
        window.document.getElementById('settingBaseUrl').value = '';
        window.document.getElementById('settingModelSelect').value = 'MiniMax-M3';
        window.document.getElementById('btnSaveSettings').click();
        const status = window.document.getElementById('formStatus');
        assert.ok(status.textContent.includes('API 地址'));
    });

    test('shows error for missing model on save', () => {
        const { window, SettingsUI, Config } = makeSettingsEnv();
        Config.init();
        SettingsUI.show();
        window.document.getElementById('settingApiKey').value = 'sk-key';
        window.document.getElementById('settingBaseUrl').value = 'https://api.test.com';
        window.document.getElementById('settingModelSelect').value = '';
        window.document.getElementById('btnSaveSettings').click();
        const status = window.document.getElementById('formStatus');
        assert.ok(status.textContent.includes('模型'));
    });

    test('toggles API key visibility', () => {
        const { window, SettingsUI, Config } = makeSettingsEnv();
        Config.init();
        SettingsUI.show();
        const apiKeyInput = window.document.getElementById('settingApiKey');
        const toggleBtn = window.document.getElementById('btnToggleKey');
        assert.equal(apiKeyInput.type, 'password');
        toggleBtn.click();
        assert.equal(apiKeyInput.type, 'text');
        toggleBtn.click();
        assert.equal(apiKeyInput.type, 'password');
    });

    test('temperature slider updates display value', () => {
        const { window, SettingsUI, Config } = makeSettingsEnv();
        Config.init();
        SettingsUI.show();
        const tempInput = window.document.getElementById('settingTemp');
        const tempValue = window.document.getElementById('tempValue');
        tempInput.value = '1.5';
        tempInput.dispatchEvent(new window.Event('input'));
        assert.equal(tempValue.textContent, '1.5');
    });

    test('handles custom model selection', () => {
        const { window, SettingsUI, Config } = makeSettingsEnv();
        Config.init();
        SettingsUI.show();
        const select = window.document.getElementById('settingModelSelect');
        const customInput = window.document.getElementById('settingModelCustom');
        select.value = '__custom__';
        select.dispatchEvent(new window.Event('change'));
        assert.notEqual(customInput.style.display, 'none');
    });

    test('test connection button exists and is clickable', () => {
        const { window, SettingsUI, Config } = makeSettingsEnv();
        Config.init();
        SettingsUI.show();
        const btn = window.document.getElementById('btnTestConnection');
        assert.ok(btn);
        assert.equal(btn.textContent, '🧪 测试连接');
    });
});

describe('SettingsUI Preset Models', () => {
    test('displays all preset models in dropdown', () => {
        const { window, SettingsUI, Config } = makeSettingsEnv();
        Config.init();
        SettingsUI.show();
        const select = window.document.getElementById('settingModelSelect');
        const options = select.options;
        const values = Array.from(options).map(o => o.value);
        assert.ok(values.includes('MiniMax-M3'));
        assert.ok(values.includes('gpt-4o'));
        assert.ok(values.includes('deepseek-chat'));
        assert.ok(values.includes('__custom__'));
    });
});

describe('SettingsUI Edge Cases', () => {
    test('handles missing settingsOverlay gracefully', () => {
        const env = makeEnv(`<!DOCTYPE html><html><body><div id="settingsBody"></div></body></html>`);
        env.window.__ENV_API_KEY__ = 'sk-test';
        env.window.__ENV_API_BASE__ = 'https://api.test.com';
        env.window.__ENV_MODEL__ = 'MiniMax-M3';
        loadScripts(env.window, [
            'taskpane/services/config.js',
            'taskpane/components/settings.js'
        ]);
        env.window.ChatUI = { _updateModelIndicator: () => {} };
        const SettingsUI = env.window.SettingsUI;
        assert.doesNotThrow(() => SettingsUI.show());
        assert.doesNotThrow(() => SettingsUI.hide());
    });

    test('handles missing settingsBody gracefully on render', () => {
        const env = makeEnv(`<!DOCTYPE html><html><body>
            <div id="settingsOverlay"></div>
        </body></html>`);
        env.window.__ENV_API_KEY__ = 'sk-test';
        env.window.__ENV_API_BASE__ = 'https://api.test.com';
        env.window.__ENV_MODEL__ = 'MiniMax-M3';
        loadScripts(env.window, [
            'taskpane/services/config.js',
            'taskpane/components/settings.js'
        ]);
        env.window.ChatUI = { _updateModelIndicator: () => {} };
        const SettingsUI = env.window.SettingsUI;
        assert.doesNotThrow(() => SettingsUI.show());
    });
});
