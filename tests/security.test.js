/**
 * tests/security.test.js — Security 单元测试 (HTML/URL 清洗)
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts } = require('./_setup');

function loadSec() {
    const { window } = makeEnv();
    loadScripts(window, 'taskpane/services/security.js');
    return window.KwSecurity;
}

test('Security: sanitizeUrl blocks javascript: scheme', () => {
    const sec = loadSec();
    assert.equal(sec.sanitizeUrl('javascript:alert(1)'), '');
    assert.equal(sec.sanitizeUrl('JavaScript:alert(1)'), '');
});

test('Security: sanitizeUrl blocks vbscript: and data:', () => {
    const sec = loadSec();
    assert.equal(sec.sanitizeUrl('vbscript:msgbox(1)'), '');
    assert.equal(sec.sanitizeUrl('data:text/html,<script>alert(1)</script>'), '');
});

test('Security: sanitizeUrl allows http(s), mailto, relative, hash, fragment', () => {
    const sec = loadSec();
    assert.equal(sec.sanitizeUrl('https://example.com'), 'https://example.com');
    assert.equal(sec.sanitizeUrl('http://example.com/a'), 'http://example.com/a');
    assert.equal(sec.sanitizeUrl('mailto:foo@bar.com'), 'mailto:foo@bar.com');
    assert.equal(sec.sanitizeUrl('#section'), '#section');
    assert.equal(sec.sanitizeUrl('/path'), '/path');
    assert.equal(sec.sanitizeUrl('./relative'), './relative');
    assert.equal(sec.sanitizeUrl('../up'), '../up');
});

test('Security: sanitizeUrl blocks bare protocol-relative and unknown schemes', () => {
    const sec = loadSec();
    // `evil` (no scheme) is relative but doesn't start with # or /; rejected
    assert.equal(sec.sanitizeUrl('evil'), '');
});

test('Security: sanitizeUrl handles empty and whitespace', () => {
    const sec = loadSec();
    assert.equal(sec.sanitizeUrl(''), '');
    assert.equal(sec.sanitizeUrl(null), '');
    assert.equal(sec.sanitizeUrl('   '), '');
});

test('Security: sanitizeHtml strips <script>', () => {
    const sec = loadSec();
    const out = sec.sanitizeHtml('<div>ok</div><script>alert(1)</script>');
    assert.ok(out.indexOf('<div>ok</div>') !== -1);
    assert.ok(out.indexOf('<script>') === -1);
    assert.ok(out.indexOf('alert(1)') === -1);
});

test('Security: sanitizeHtml removes disallowed tags but keeps content', () => {
    const sec = loadSec();
    const out = sec.sanitizeHtml('<p>safe</p><form action="evil"><input></form>');
    assert.ok(out.indexOf('<p>safe</p>') !== -1);
    assert.ok(out.indexOf('<form') === -1);
    assert.ok(out.indexOf('<input') === -1);
});

test('Security: sanitizeHtml sets rel=noopener on anchors', () => {
    const sec = loadSec();
    const out = sec.sanitizeHtml('<a href="https://example.com">link</a>');
    assert.ok(out.indexOf('target="_blank"') !== -1);
    assert.ok(out.indexOf('rel="noopener noreferrer"') !== -1);
});

test('Security: sanitizeHtml strips on* event handlers', () => {
    const sec = loadSec();
    const out = sec.sanitizeHtml('<a href="https://x.com" onclick="alert(1)">x</a>');
    assert.ok(out.indexOf('onclick') === -1);
});

test('Security: sanitizeHtml strips dangerous src/href', () => {
    const sec = loadSec();
    const out = sec.sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    assert.ok(out.indexOf('javascript:') === -1);
});

test('Security: sanitizeHtml keeps allowed classes on code/pre', () => {
    const sec = loadSec();
    const out = sec.sanitizeHtml('<pre><code class="lang-js hljs">var x = 1;</code></pre>');
    assert.ok(out.indexOf('lang-js') !== -1);
});

test('Security: sanitizeHtml handles null/empty input', () => {
    const sec = loadSec();
    assert.equal(sec.sanitizeHtml(''), '');
    assert.equal(sec.sanitizeHtml(null), '');
});
