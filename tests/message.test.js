/**
 * tests/message.test.js — MessageRenderer 单元测试
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts, mockVendorLibs } = require('./_setup');

function loadMsg() {
    const env = makeEnv();
    mockVendorLibs(env.window);
    loadScripts(env.window, [
        'taskpane/services/security.js',
        'taskpane/components/message.js'
    ]);
    return { ...env, MessageRenderer: env.window.MessageRenderer };
}

test('MessageRenderer: render user message', () => {
    const { MessageRenderer } = loadMsg();
    const html = MessageRenderer.render({ role: 'user', content: 'hello\nworld', timestamp: 1700000000000 });
    assert.ok(html.indexOf('message-user') !== -1);
    assert.ok(html.indexOf('hello') !== -1);
    // newline → <br>
    assert.ok(html.indexOf('hello<br>') !== -1 || html.indexOf('hello<br/>') !== -1);
});

test('MessageRenderer: render assistant message', () => {
    const { MessageRenderer } = loadMsg();
    const html = MessageRenderer.render({ role: 'assistant', content: 'hi', timestamp: 1700000000000 });
    assert.ok(html.indexOf('message-assistant') !== -1);
    assert.ok(html.indexOf('AI') !== -1);
});

test('MessageRenderer: streaming flag adds class', () => {
    const { MessageRenderer } = loadMsg();
    const html = MessageRenderer.render({ role: 'assistant', content: 'hi', timestamp: 0 }, true);
    assert.ok(html.indexOf('streaming') !== -1);
});

test('MessageRenderer: removes thinking block', () => {
    const { MessageRenderer } = loadMsg();
    const content = '```thinking\nmy reasoning\n```\nactual answer';
    const html = MessageRenderer.render({ role: 'assistant', content, timestamp: 0 });
    assert.ok(html.indexOf('thinking-block') === -1);
    assert.ok(html.indexOf('my reasoning') === -1);
    assert.ok(html.indexOf('actual answer') !== -1);
});

test('MessageRenderer: removes <think> format', () => {
    const { MessageRenderer } = loadMsg();
    const content = '<think>\n思考中\n</think>\nfinal answer';
    const html = MessageRenderer.render({ role: 'assistant', content, timestamp: 0 });
    assert.ok(html.indexOf('思考中') === -1);
    assert.ok(html.indexOf('final answer') !== -1);
});

test('MessageRenderer: sanitizes script tags', () => {
    const { MessageRenderer } = loadMsg();
    const html = MessageRenderer._renderMarkdown('before <script>bad()</script> after');
    assert.ok(html.indexOf('<script>') === -1);
    assert.ok(html.indexOf('bad()') === -1);
});

test('MessageRenderer: sanitizes javascript: URLs in images', () => {
    const { MessageRenderer } = loadMsg();
    const html = MessageRenderer._renderMarkdown('![alt](javascript:alert(1))');
    assert.ok(html.indexOf('javascript:') === -1);
});

test('MessageRenderer: code block with mermaid language', () => {
    const { MessageRenderer } = loadMsg();
    const html = MessageRenderer._renderMarkdown('```mermaid\ngraph TD; A-->B\n```');
    assert.ok(html.indexOf('mermaid') !== -1);
    assert.ok(html.indexOf('graph TD') !== -1);
});

test('MessageRenderer: code block with regular language gets highlighted', () => {
    const { MessageRenderer } = loadMsg();
    const html = MessageRenderer._renderMarkdown('```js\nvar x = 1;\n```');
    // Either real marked produces hljs class, or our mock produces lang-*
    assert.ok(html.indexOf('hljs') !== -1 || html.indexOf('lang-') !== -1, 'should highlight code: ' + html);
});

test('MessageRenderer: _escapeHtml escapes special characters', () => {
    const { MessageRenderer } = loadMsg();
    assert.equal(MessageRenderer._escapeHtml('<script>'), '&lt;script&gt;');
    assert.equal(MessageRenderer._escapeHtml('a & b'), 'a &amp; b');
});

test('MessageRenderer: _formatTime formats as HH:MM', () => {
    const { MessageRenderer } = loadMsg();
    const formatted = MessageRenderer._formatTime(new Date('2024-01-15T10:30:00').getTime());
    assert.match(formatted, /^\d{2}:\d{2}$/);
});

test('MessageRenderer: empty content still produces valid HTML', () => {
    const { MessageRenderer } = loadMsg();
    const html = MessageRenderer.render({ role: 'assistant', content: '', timestamp: 0 });
    assert.ok(html.indexOf('message-assistant') !== -1);
});

test('MessageRenderer: copyToClipboard uses navigator.clipboard when available', () => {
    const { window, MessageRenderer } = loadMsg();
    let copied = null;
    window.navigator.clipboard.writeText = (text) => { copied = text; return Promise.resolve(); };
    MessageRenderer._copyToClipboard('hello');
    assert.equal(copied, 'hello');
});

test('MessageRenderer: copyToClipboard catches writeText errors silently', () => {
    const { window, MessageRenderer } = loadMsg();
    window.navigator.clipboard.writeText = () => { throw new Error('blocked'); };
    // _copyToClipboard catches the error and logs it; no fallback to
    // execCommand in this code path (the user must retry or use another path).
    let errorLogged = false;
    const origError = window.console.error;
    window.console.error = () => { errorLogged = true; };
    assert.doesNotThrow(() => MessageRenderer._copyToClipboard('hi'));
    assert.equal(errorLogged, true, 'error should be logged');
    window.console.error = origError;
});
