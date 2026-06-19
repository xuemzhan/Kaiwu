/**
 * tests/chat-ui.test.js — ChatUI 组件单元测试
 * 测试 UI 渲染层 (taskpane/components/chat.js)
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts } = require('./_setup');

function loadChatUI(html) {
    const defaultHtml = '<!DOCTYPE html><html><body>' +
        '<div id="chatContainer"></div>' +
        '<input id="inputBox" />' +
        '<button id="btnSend"></button>' +
        '<button id="btnAbort" style="display:none;"></button>' +
        '<button id="btnClear"></button>' +
        '<button id="btnNewChat"></button>' +
        '<button id="btnSettings"></button>' +
        '<span id="inputCounter"></span>' +
        '<div id="contextMeta"></div>' +
        '<div class="scenario-tabs">' +
        '<button class="scenario-tab" data-category="writing">写作</button>' +
        '<button class="scenario-tab" data-category="analysis">分析</button>' +
        '<button class="scenario-tab" data-category="office">办公</button>' +
        '</div>' +
        '<div class="scenario-chips" data-category="writing"></div>' +
        '<div class="scenario-chips" data-category="analysis"></div>' +
        '<div class="scenario-chips" data-category="office"></div>' +
        '</body></html>';
    const env = makeEnv(html || defaultHtml);
    loadScripts(env.window, 'taskpane/services/config.js');
    loadScripts(env.window, 'taskpane/services/chat.js');
    loadScripts(env.window, 'taskpane/components/message.js');
    loadScripts(env.window, 'taskpane/components/chat.js');
    return { ...env, ChatUI: env.window.ChatUI, ChatManager: env.window.ChatManager };
}

test('ChatUI: renders message list', () => {
    const { window, ChatUI, ChatManager } = loadChatUI();
    ChatManager.create();
    ChatManager.addMessage('user', 'Hello');
    ChatManager.addMessage('assistant', 'Hi there');
    const chat = ChatManager.getCurrent();
    ChatUI.renderChat(chat);
    const container = window.document.getElementById('chatContainer');
    assert.ok(container.innerHTML.includes('Hello'), 'should contain user message');
    assert.ok(container.innerHTML.includes('Hi there'), 'should contain assistant message');
});

test('ChatUI: renders user messages with correct styling', () => {
    const { window, ChatUI, ChatManager } = loadChatUI();
    ChatManager.create();
    ChatManager.addMessage('user', 'Test message');
    const chat = ChatManager.getCurrent();
    ChatUI.renderChat(chat);
    const container = window.document.getElementById('chatContainer');
    const userMsg = container.querySelector('.message-user');
    assert.ok(userMsg, 'should have user message element');
    assert.ok(userMsg.classList.contains('message-user'), 'should have message-user class');
    assert.ok(userMsg.innerHTML.includes('Test message'), 'should contain message content');
});

test('ChatUI: renders AI messages with correct styling', () => {
    const { window, ChatUI, ChatManager } = loadChatUI();
    ChatManager.create();
    ChatManager.addMessage('user', 'Hello');
    ChatManager.addMessage('assistant', 'Response');
    const chat = ChatManager.getCurrent();
    ChatUI.renderChat(chat);
    const container = window.document.getElementById('chatContainer');
    const aiMsg = container.querySelector('.message-assistant');
    assert.ok(aiMsg, 'should have assistant message element');
    assert.ok(aiMsg.classList.contains('message-assistant'), 'should have message-assistant class');
});

test('ChatUI: input field accepts text', () => {
    const { window, ChatUI, ChatManager } = loadChatUI();
    ChatManager.create();
    const inputBox = window.document.getElementById('inputBox');
    inputBox.value = 'Test input';
    const event = new window.Event('input', { bubbles: true });
    inputBox.dispatchEvent(event);
    assert.equal(inputBox.value, 'Test input', 'input should accept text');
});

test('ChatUI: send button disabled when input empty', () => {
    const { window, ChatUI, ChatManager } = loadChatUI();
    ChatManager.create();
    const btnSend = window.document.getElementById('btnSend');
    ChatUI._setSendEnabled(false);
    assert.equal(btnSend.disabled, true, 'send button should be disabled');
});

test('ChatUI: send button enabled when input has text', () => {
    const { window, ChatUI, ChatManager } = loadChatUI();
    ChatManager.create();
    const btnSend = window.document.getElementById('btnSend');
    ChatUI._setSendEnabled(true);
    assert.equal(btnSend.disabled, false, 'send button should be enabled');
});

test('ChatUI: streaming updates append to message', () => {
    const { window, ChatUI, ChatManager } = loadChatUI();
    ChatManager.create();
    ChatManager.addMessage('user', 'Hello');
    ChatManager.addMessage('assistant', '');
    const chat = ChatManager.getCurrent();
    ChatUI.renderChat(chat, true);
    let container = window.document.getElementById('chatContainer');
    let streamingMsg = container.querySelector('.streaming');
    assert.ok(streamingMsg, 'should have streaming class during streaming');
    ChatManager.updateLastAssistant('Partial response');
    ChatUI._updateStreamingMessage(ChatManager.getCurrent());
    container = window.document.getElementById('chatContainer');
    assert.ok(container.innerHTML.includes('Partial response'), 'should update with partial content');
});

test('ChatUI: scenario tab switching updates active tab', () => {
    const { window, ChatUI, ChatManager } = loadChatUI();
    ChatManager.create();
    ChatUI._bindScenarioTabs();
    const writingTab = window.document.querySelector('.scenario-tab[data-category="writing"]');
    const analysisTab = window.document.querySelector('.scenario-tab[data-category="analysis"]');
    assert.ok(writingTab.classList.contains('is-active') || writingTab.getAttribute('aria-selected') === 'true',
        'writing tab should be active by default');
    const clickEvent = new window.Event('click', { bubbles: true });
    analysisTab.dispatchEvent(clickEvent);
    assert.ok(analysisTab.classList.contains('is-active') || analysisTab.getAttribute('aria-selected') === 'true',
        'analysis tab should be active after click');
});

test('ChatUI: shows loading indicator during streaming', () => {
    const { window, ChatUI, ChatManager } = loadChatUI();
    ChatManager.create();
    ChatManager.addMessage('user', 'Hello');
    ChatManager.addMessage('assistant', '');
    const chat = ChatManager.getCurrent();
    ChatUI.renderChat(chat, true);
    ChatUI._showAbortButton(true);
    const btnAbort = window.document.getElementById('btnAbort');
    assert.notEqual(btnAbort.style.display, 'none', 'abort button should be visible during streaming');
});

test('ChatUI: shows error toast on network failure', () => {
    const { window, ChatUI, ChatManager } = loadChatUI();
    ChatManager.create();
    ChatManager.addMessage('user', 'Hello');
    ChatManager.addMessage('assistant', '');
    const chat = ChatManager.getCurrent();
    ChatUI.renderChat(chat, true);
    ChatUI._renderErrorMessage(chat, 'Network error');
    const container = window.document.getElementById('chatContainer');
    const errorBubble = container.querySelector('.message-bubble-error');
    assert.ok(errorBubble, 'should have error bubble element');
});

test('ChatUI: scroll to bottom on new message', () => {
    const { window, ChatUI, ChatManager } = loadChatUI();
    ChatManager.create();
    const container = window.document.getElementById('chatContainer');
    container.scrollTop = 0;
    ChatUI._isUserAtBottom = true;
    ChatManager.addMessage('user', 'Test');
    const chat = ChatManager.getCurrent();
    ChatUI.renderChat(chat);
    assert.equal(container.scrollTop, container.scrollHeight, 'should scroll to bottom');
});

test('ChatUI: clear input after send', () => {
    const { window, ChatUI, ChatManager } = loadChatUI();
    ChatManager.create();
    const inputBox = window.document.getElementById('inputBox');
    inputBox.value = 'Test message';
    inputBox.disabled = true;
    inputBox.value = '';
    ChatUI._enableInput();
    assert.equal(inputBox.disabled, false, 'input should be enabled after send');
});

test('ChatUI: welcome message shown when no messages', () => {
    const { window, ChatUI, ChatManager } = loadChatUI();
    ChatManager.create();
    const chat = ChatManager.getCurrent();
    chat.messages = [];
    ChatUI.renderChat(chat);
    const container = window.document.getElementById('chatContainer');
    assert.ok(container.innerHTML.includes('欢迎使用开悟'), 'should show welcome message');
});

test('ChatUI: abort button hides after streaming ends', () => {
    const { window, ChatUI, ChatManager } = loadChatUI();
    ChatManager.create();
    ChatUI._showAbortButton(true);
    ChatUI._showAbortButton(false);
    const btnAbort = window.document.getElementById('btnAbort');
    assert.equal(btnAbort.style.display, 'none', 'abort button should be hidden');
});

test('ChatUI: token counter updates on input', () => {
    const { window, ChatUI, ChatManager } = loadChatUI();
    ChatManager.create();
    const inputBox = window.document.getElementById('inputBox');
    const counter = window.document.getElementById('inputCounter');
    inputBox.value = 'Hello world';
    ChatUI._updateTokenCounter();
    assert.ok(counter.textContent.length > 0, 'counter should show token count');
});

test('ChatUI: renders multiple messages in order', () => {
    const { window, ChatUI, ChatManager } = loadChatUI();
    ChatManager.create();
    ChatManager.addMessage('user', 'First');
    ChatManager.addMessage('assistant', 'Response 1');
    ChatManager.addMessage('user', 'Second');
    ChatManager.addMessage('assistant', 'Response 2');
    const chat = ChatManager.getCurrent();
    ChatUI.renderChat(chat);
    const container = window.document.getElementById('chatContainer');
    const messages = container.querySelectorAll('.message');
    assert.equal(messages.length, 4, 'should render all 4 messages');
});

test('ChatUI: user message contains "你" label', () => {
    const { window, ChatUI, ChatManager } = loadChatUI();
    ChatManager.create();
    ChatManager.addMessage('user', 'Hello');
    const chat = ChatManager.getCurrent();
    ChatUI.renderChat(chat);
    const container = window.document.getElementById('chatContainer');
    const userMsg = container.querySelector('.message-user');
    assert.ok(userMsg.innerHTML.includes('你'), 'user message should have "你" label');
});
