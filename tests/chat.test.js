/**
 * tests/chat.test.js — ChatManager 单元测试
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts } = require('./_setup');

function loadChat() {
    const env = makeEnv();
    loadScripts(env.window, 'taskpane/services/chat.js');
    return { ...env, ChatManager: env.window.ChatManager };
}

test('ChatManager: create returns a fresh empty chat', () => {
    const { ChatManager } = loadChat();
    const chat = ChatManager.create();
    assert.ok(chat.id);
    assert.equal(chat.messages.length, 0);
    assert.equal(chat.title, '新对话');
});

test('ChatManager: addMessage appends to current chat and returns it', () => {
    const { ChatManager } = loadChat();
    let chat = ChatManager.create();
    chat = ChatManager.addMessage('user', 'hello');
    assert.equal(chat.messages.length, 1);
    assert.equal(chat.messages[0].role, 'user');
    assert.equal(chat.messages[0].content, 'hello');
    assert.ok(chat.messages[0].timestamp);
});

test('ChatManager: first user message becomes the title (truncated)', () => {
    const { ChatManager } = loadChat();
    const chat = ChatManager.create();
    const long = 'x'.repeat(50);
    ChatManager.addMessage('user', long);
    const fresh = ChatManager.getCurrent();
    assert.equal(fresh.title.length, 33); // 30 chars + '...'
    assert.ok(fresh.title.endsWith('...'));
});

test('ChatManager: title not changed by subsequent user messages', () => {
    const { ChatManager } = loadChat();
    ChatManager.create();
    ChatManager.addMessage('user', 'first question');
    const id = ChatManager.getCurrentId();
    ChatManager.addMessage('user', 'second question');
    const c = ChatManager.get(id);
    assert.equal(c.title, 'first question');
});

test('ChatManager: updateLastAssistant updates the last assistant message', () => {
    const { ChatManager } = loadChat();
    ChatManager.create();
    ChatManager.addMessage('user', 'q');
    ChatManager.addMessage('assistant', '');
    ChatManager.updateLastAssistant('partial response');
    const c = ChatManager.getCurrent();
    assert.equal(c.messages[c.messages.length - 1].content, 'partial response');
});

test('ChatManager: updateLastAssistant with skipSave does not persist', () => {
    const { window, ChatManager } = loadChat();
    ChatManager.create();
    ChatManager.addMessage('user', 'q');
    ChatManager.addMessage('assistant', '');
    ChatManager.updateLastAssistant('partial', { skipSave: true });
    // Reload from storage and check it wasn't saved
    const saved = JSON.parse(window.localStorage.getItem('wps_assistant_chats'));
    const id = ChatManager.getCurrentId();
    assert.equal(saved[id].messages[saved[id].messages.length - 1].content, '');
});

test('ChatManager: appendLastAssistant appends to last assistant message', () => {
    const { ChatManager } = loadChat();
    ChatManager.create();
    ChatManager.addMessage('user', 'q');
    ChatManager.addMessage('assistant', 'hello ');
    ChatManager.appendLastAssistant('world');
    const c = ChatManager.getCurrent();
    assert.equal(c.messages[c.messages.length - 1].content, 'hello world');
});

test('ChatManager: clearCurrent empties messages but keeps chat', () => {
    const { ChatManager } = loadChat();
    ChatManager.create();
    ChatManager.addMessage('user', 'q');
    const c = ChatManager.clearCurrent();
    assert.equal(c.messages.length, 0);
    assert.equal(c.title, '新对话');
});

test('ChatManager: getRecent returns most recently updated chats', () => {
    const { ChatManager } = loadChat();
    const a = ChatManager.create();
    ChatManager.addMessage('user', 'in a');
    // Small delay to ensure updatedAt timestamps differ (ms resolution)
    const start = Date.now();
    while (Date.now() === start) { /* spin briefly */ }
    const b = ChatManager.create();
    ChatManager.addMessage('user', 'in b');
    const recent = ChatManager.getRecent(10);
    assert.equal(recent[0].id, b.id, 'b should be most recent');
    assert.equal(recent[1].id, a.id, 'a should be second most recent');
});

test('ChatManager: getRecent respects limit', () => {
    const { ChatManager } = loadChat();
    for (let i = 0; i < 5; i++) {
        ChatManager.create();
        ChatManager.addMessage('user', 'q' + i);
    }
    const recent = ChatManager.getRecent(2);
    assert.equal(recent.length, 2);
});

test('ChatManager: getCurrentId returns the current chat id', () => {
    const { ChatManager } = loadChat();
    const chat = ChatManager.create();
    assert.equal(ChatManager.getCurrentId(), chat.id);
});

test('ChatManager: delete removes chat and clears current if it was current', () => {
    const { ChatManager } = loadChat();
    const a = ChatManager.create();
    const b = ChatManager.create();
    ChatManager.delete(a.id);
    assert.equal(ChatManager.get(a.id), null);
    assert.equal(ChatManager.getCurrentId(), b.id);
});

test('ChatManager: prunes to 50 most recent chats on save', () => {
    const { ChatManager } = loadChat();
    // Create 60 chats
    for (let i = 0; i < 60; i++) {
        ChatManager.create();
        ChatManager.addMessage('user', 'q' + i);
    }
    const recent = ChatManager.getRecent(100);
    assert.ok(recent.length <= 50, 'should prune to 50, got ' + recent.length);
});

test('ChatManager: handles localStorage quota error and keeps current chat', () => {
    const { window, ChatManager } = loadChat();
    ChatManager.create();
    ChatManager.addMessage('user', 'q');
    const orig = window.localStorage.setItem;
    window.localStorage.setItem = () => {
        const e = new Error('quota');
        e.name = 'QuotaExceededError';
        throw e;
    };
    // Should not throw; the current chat should still be saved with an aggressive prune
    assert.doesNotThrow(() => ChatManager.addMessage('user', 'q2'));
    window.localStorage.setItem = orig;
});

test('ChatManager: setCurrent updates current id', () => {
    const { ChatManager } = loadChat();
    const a = ChatManager.create();
    const b = ChatManager.create();
    ChatManager.setCurrent(a.id);
    assert.equal(ChatManager.getCurrentId(), a.id);
    assert.equal(ChatManager.getCurrent().id, a.id);
});
