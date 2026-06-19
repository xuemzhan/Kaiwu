/**
 * tests/keyboard-shortcuts.test.js — 键盘快捷键单元测试
 *
 * 测试 Esc, Ctrl+L, Ctrl+N 快捷键在 taskpane 和 floating 中的行为
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts, mockVendorLibs } = require('./_setup');

function makeChatEnv(html) {
    const env = makeEnv(html);
    mockVendorLibs(env.window);
    loadScripts(env.window, [
        'taskpane/services/config.js',
        'taskpane/services/chat.js',
        'taskpane/components/message.js',
        'taskpane/components/settings.js',
        'taskpane/components/chat.js'
    ]);
    env.window.__ENV_API_KEY__ = 'sk-test-key';
    env.window.__ENV_API_BASE__ = 'https://api.test.com/v1';
    env.window.__ENV_MODEL__ = 'MiniMax-M3';
    env.window.Config.init();
    env.window.ChatUI.init();
    return env;
}

test('keyboard-shortcuts: Esc closes settings overlay when visible', () => {
    const html = '<!DOCTYPE html><html><body>' +
        '<div id="settingsOverlay" style="display:block"></div>' +
        '<div id="settingsPanel"></div>' +
        '<div id="chatContainer"></div>' +
        '<input id="inputBox" />' +
        '<button id="btnSend"></button>' +
        '<button id="btnClear"></button>' +
        '<button id="btnNewChat"></button>' +
        '<button id="btnSettings"></button>' +
        '<button id="btnAbort"></button>' +
        '</body></html>';
    const env = makeChatEnv(html);

    let settingsHidden = false;
    const origHide = env.window.SettingsUI.hide;
    env.window.SettingsUI.hide = function () {
        settingsHidden = true;
        origHide.call(this);
    };

    env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true
    }));

    assert.equal(settingsHidden, true, 'Esc should call SettingsUI.hide()');
});

test('keyboard-shortcuts: Esc does nothing when settings overlay is hidden', () => {
    const html = '<!DOCTYPE html><html><body>' +
        '<div id="settingsOverlay" style="display:none"></div>' +
        '<div id="chatContainer"></div>' +
        '<input id="inputBox" />' +
        '<button id="btnSend"></button>' +
        '<button id="btnClear"></button>' +
        '<button id="btnNewChat"></button>' +
        '<button id="btnSettings"></button>' +
        '<button id="btnAbort"></button>' +
        '</body></html>';
    const env = makeChatEnv(html);

    let settingsHidden = false;
    const origHide = env.window.SettingsUI.hide;
    env.window.SettingsUI.hide = function () {
        settingsHidden = true;
        origHide.call(this);
    };

    env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true
    }));

    assert.equal(settingsHidden, false, 'Esc should not hide when overlay is hidden');
});

test('keyboard-shortcuts: Ctrl+L clears current chat', () => {
    const html = '<!DOCTYPE html><html><body>' +
        '<div id="chatContainer"></div>' +
        '<input id="inputBox" />' +
        '<button id="btnSend"></button>' +
        '<button id="btnClear"></button>' +
        '<button id="btnNewChat"></button>' +
        '<button id="btnSettings"></button>' +
        '<button id="btnAbort"></button>' +
        '</body></html>';
    const env = makeChatEnv(html);

    env.window.ChatManager.create();
    env.window.ChatManager.addMessage('user', 'test message');

    let chatCleared = false;
    const originalClear = env.window.ChatUI.clearChat;
    env.window.ChatUI.clearChat = function () {
        chatCleared = true;
    };

    env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', {
        key: 'l',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
    }));

    assert.equal(chatCleared, true, 'Ctrl+L should clear chat');
    env.window.ChatUI.clearChat = originalClear;
});

test('keyboard-shortcuts: Ctrl+N creates new chat', () => {
    const html = '<!DOCTYPE html><html><body>' +
        '<div id="chatContainer"></div>' +
        '<input id="inputBox" />' +
        '<button id="btnSend"></button>' +
        '<button id="btnClear"></button>' +
        '<button id="btnNewChat"></button>' +
        '<button id="btnSettings"></button>' +
        '<button id="btnAbort"></button>' +
        '</body></html>';
    const env = makeChatEnv(html);

    let newChatCalled = false;
    const originalNewChat = env.window.ChatUI.newChat;
    env.window.ChatUI.newChat = function () {
        newChatCalled = true;
    };

    env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', {
        key: 'n',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
    }));

    assert.equal(newChatCalled, true, 'Ctrl+N should create new chat');
    env.window.ChatUI.newChat = originalNewChat;
});

test('keyboard-shortcuts: Ctrl+L and Ctrl+N trigger globally including input fields', () => {
    const html = '<!DOCTYPE html><html><body>' +
        '<div id="chatContainer"></div>' +
        '<input id="inputBox" />' +
        '<button id="btnSend"></button>' +
        '<button id="btnClear"></button>' +
        '<button id="btnNewChat"></button>' +
        '<button id="btnSettings"></button>' +
        '<button id="btnAbort"></button>' +
        '</body></html>';
    const env = makeChatEnv(html);

    let clearCalled = false;
    let newChatCalled = false;
    env.window.ChatUI.clearChat = function () { clearCalled = true; };
    env.window.ChatUI.newChat = function () { newChatCalled = true; };

    const inputBox = env.window.document.getElementById('inputBox');
    inputBox.focus();

    inputBox.dispatchEvent(new env.window.KeyboardEvent('keydown', {
        key: 'l',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
    }));

    inputBox.dispatchEvent(new env.window.KeyboardEvent('keydown', {
        key: 'n',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
    }));

    assert.equal(clearCalled, true, 'Ctrl+L should trigger in input');
    assert.equal(newChatCalled, true, 'Ctrl+N should trigger in input');
});

test('keyboard-shortcuts: Ctrl+Shift+L does not trigger clear chat', () => {
    const html = '<!DOCTYPE html><html><body>' +
        '<div id="chatContainer"></div>' +
        '<input id="inputBox" />' +
        '<button id="btnSend"></button>' +
        '<button id="btnClear"></button>' +
        '<button id="btnNewChat"></button>' +
        '<button id="btnSettings"></button>' +
        '<button id="btnAbort"></button>' +
        '</body></html>';
    const env = makeChatEnv(html);

    let clearCalled = false;
    env.window.ChatUI.clearChat = function () { clearCalled = true; };

    env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', {
        key: 'l',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true
    }));

    assert.equal(clearCalled, false, 'Ctrl+Shift+L should not trigger clear');
});

test('keyboard-shortcuts: Ctrl+Shift+N does not trigger new chat', () => {
    const html = '<!DOCTYPE html><html><body>' +
        '<div id="chatContainer"></div>' +
        '<input id="inputBox" />' +
        '<button id="btnSend"></button>' +
        '<button id="btnClear"></button>' +
        '<button id="btnNewChat"></button>' +
        '<button id="btnSettings"></button>' +
        '<button id="btnAbort"></button>' +
        '</body></html>';
    const env = makeChatEnv(html);

    let newChatCalled = false;
    env.window.ChatUI.newChat = function () { newChatCalled = true; };

    env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', {
        key: 'n',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true
    }));

    assert.equal(newChatCalled, false, 'Ctrl+Shift+N should not trigger new chat');
});

test('keyboard-shortcuts: shortcuts respect Alt modifier (Ctrl+Alt+L ignored)', () => {
    const html = '<!DOCTYPE html><html><body>' +
        '<div id="chatContainer"></div>' +
        '<input id="inputBox" />' +
        '<button id="btnSend"></button>' +
        '<button id="btnClear"></button>' +
        '<button id="btnNewChat"></button>' +
        '<button id="btnSettings"></button>' +
        '<button id="btnAbort"></button>' +
        '</body></html>';
    const env = makeChatEnv(html);

    let clearCalled = false;
    env.window.ChatUI.clearChat = function () { clearCalled = true; };

    env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', {
        key: 'l',
        ctrlKey: true,
        altKey: true,
        bubbles: true,
        cancelable: true
    }));

    assert.equal(clearCalled, false, 'Ctrl+Alt+L should not trigger clear');
});

test('keyboard-shortcuts: lowercase and uppercase keys both work', () => {
    const html = '<!DOCTYPE html><html><body>' +
        '<div id="chatContainer"></div>' +
        '<input id="inputBox" />' +
        '<button id="btnSend"></button>' +
        '<button id="btnClear"></button>' +
        '<button id="btnNewChat"></button>' +
        '<button id="btnSettings"></button>' +
        '<button id="btnAbort"></button>' +
        '</body></html>';
    const env = makeChatEnv(html);

    let clearCalled = false;
    let newChatCalled = false;
    env.window.ChatUI.clearChat = function () { clearCalled = true; };
    env.window.ChatUI.newChat = function () { newChatCalled = true; };

    env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', {
        key: 'L',
        ctrlKey: true,
        shiftKey: false,
        bubbles: true,
        cancelable: true
    }));

    env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', {
        key: 'N',
        ctrlKey: true,
        shiftKey: false,
        bubbles: true,
        cancelable: true
    }));

    assert.equal(clearCalled, true, 'Ctrl+L uppercase should work');
    assert.equal(newChatCalled, true, 'Ctrl+N uppercase should work');
});
