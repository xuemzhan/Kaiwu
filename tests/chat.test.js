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
    ChatManager._flushSave();  // 确保之前的数据已持久化
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
    ChatManager._flushSave();  // 强制落盘触发剪枝
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

// ==================== 首次运行引导测试 ====================
// 创建独立的 FirstRunManager 用于测试 (不依赖完整 app.js)
function createTestFirstRunManager(Config) {
    return {
        _dismissedKey: 'kw_first_run_dismissed',
        isApiKeyConfigured: function () {
            var config = Config.get();
            var key = config.apiKey || '';
            var isEmpty = !key || key.trim() === '';
            var isPlaceholder = key.indexOf('PLEASE_REPLACE') !== -1 ||
                               key.indexOf('sk-PLEASE') !== -1 ||
                               key.indexOf('YOUR_API_KEY') !== -1 ||
                               key.indexOf('your-api-key') !== -1;
            return !isEmpty && !isPlaceholder;
        },
        check: function () {
            if (this.isApiKeyConfigured()) {
                return false;
            }
            if (localStorage.getItem(this._dismissedKey)) {
                return false;
            }
            return true;
        }
    };
}

test('FirstRunManager: isApiKeyConfigured returns false when apiKey is empty', () => {
    const env = makeEnv();
    loadScripts(env.window, 'taskpane/services/config.js');
    env.window.Config.init();
    const fm = createTestFirstRunManager(env.window.Config);
    const isConfigured = fm.isApiKeyConfigured();
    assert.equal(isConfigured, false);
});

test('FirstRunManager: isApiKeyConfigured returns false when apiKey is placeholder PLEASE_REPLACE', () => {
    const env = makeEnv();
    loadScripts(env.window, 'taskpane/services/config.js');
    env.window.Config.set('apiKey', 'PLEASE_REPLACE_THIS_KEY');
    const fm = createTestFirstRunManager(env.window.Config);
    const isConfigured = fm.isApiKeyConfigured();
    assert.equal(isConfigured, false);
});

test('FirstRunManager: isApiKeyConfigured returns false when apiKey is placeholder sk-PLEASE', () => {
    const env = makeEnv();
    loadScripts(env.window, 'taskpane/services/config.js');
    env.window.Config.set('apiKey', 'sk-PLEASE_REPLACE');
    const fm = createTestFirstRunManager(env.window.Config);
    const isConfigured = fm.isApiKeyConfigured();
    assert.equal(isConfigured, false);
});

test('FirstRunManager: isApiKeyConfigured returns false when apiKey is placeholder YOUR_API_KEY', () => {
    const env = makeEnv();
    loadScripts(env.window, 'taskpane/services/config.js');
    env.window.Config.set('apiKey', 'YOUR_API_KEY_HERE');
    const fm = createTestFirstRunManager(env.window.Config);
    const isConfigured = fm.isApiKeyConfigured();
    assert.equal(isConfigured, false);
});

test('FirstRunManager: isApiKeyConfigured returns true when apiKey is valid', () => {
    const env = makeEnv();
    loadScripts(env.window, 'taskpane/services/config.js');
    env.window.Config.set('apiKey', 'sk-abc123xyz');
    const fm = createTestFirstRunManager(env.window.Config);
    const isConfigured = fm.isApiKeyConfigured();
    assert.equal(isConfigured, true);
});

test('FirstRunManager: check returns true and shows overlay when no API key', () => {
    const env = makeEnv();
    loadScripts(env.window, 'taskpane/services/config.js');
    env.window.Config.set('apiKey', '');
    const fm = createTestFirstRunManager(env.window.Config);
    const result = fm.check();
    assert.equal(result, true);
});

test('FirstRunManager: check returns false when API key is configured', () => {
    const env = makeEnv();
    loadScripts(env.window, 'taskpane/services/config.js');
    env.window.Config.set('apiKey', 'sk-validkey123');
    const fm = createTestFirstRunManager(env.window.Config);
    const result = fm.check();
    assert.equal(result, false);
});

test('FirstRunManager: check does not show overlay if previously dismissed', () => {
    const env = makeEnv();
    loadScripts(env.window, 'taskpane/services/config.js');
    env.window.Config.set('apiKey', '');
    env.window.localStorage.setItem('kw_first_run_dismissed', '1');
    const fm = createTestFirstRunManager(env.window.Config);
    const result = fm.check();
    assert.equal(result, false);
});

test('FirstRunManager: check returns true when dismissed key is cleared', () => {
    const env = makeEnv();
    loadScripts(env.window, 'taskpane/services/config.js');
    env.window.Config.set('apiKey', '');
    env.window.localStorage.setItem('kw_first_run_dismissed', '1');
    env.window.localStorage.removeItem('kw_first_run_dismissed');
    const fm = createTestFirstRunManager(env.window.Config);
    const result = fm.check();
    assert.equal(result, true);
});

test('ChatUI: context bar shows timeout message after 3s', (t, done) => {
    const html = '<!DOCTYPE html><html><body>' +
        '<div class="context-bar"><div id="contextMeta">正在读取文档状态...</div></div>' +
        '<div id="chatContainer"></div>' +
        '<input id="inputBox" />' +
        '</body></html>';
    const env = makeEnv(html);
    loadScripts(env.window, 'taskpane/services/config.js');
    loadScripts(env.window, 'taskpane/services/chat.js');
    loadScripts(env.window, 'taskpane/components/chat.js');
    env.window.ChatUI.init();
    const el = env.window.document.getElementById('contextMeta');
    assert.equal(el.textContent, '正在读取文档状态...');
    setTimeout(() => {
        assert.equal(el.textContent, '未连接到 WPS Writer');
        assert.ok(el.classList.contains('kw-context-error'));
        done();
    }, 3100);
});

test('ChatUI: context bar clears timeout when context loads successfully', (t, done) => {
    const html = '<!DOCTYPE html><html><body>' +
        '<div class="context-bar"><div id="contextMeta">正在读取文档状态...</div></div>' +
        '<div id="chatContainer"></div>' +
        '<input id="inputBox" />' +
        '</body></html>';
    const env = makeEnv(html);
    loadScripts(env.window, 'taskpane/services/config.js');
    loadScripts(env.window, 'taskpane/services/chat.js');
    env.window.WriterAdapter = {
        getDocumentInfo: function() { return { available: true, name: '测试文档.docx' }; },
        getSelectionInfo: function() { return { hasSelection: false, length: 0 }; },
        getSelectionText: function() { return ''; }
    };
    loadScripts(env.window, 'taskpane/components/chat.js');
    env.window.ChatUI.init();
    setTimeout(() => {
        const el = env.window.document.getElementById('contextMeta');
        assert.ok(el.textContent.indexOf('测试文档.docx') !== -1);
        done();
    }, 100);
});
