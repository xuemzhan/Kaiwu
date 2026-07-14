/**
 * tests/innerhtml-security.test.js — Regression tests for innerHTML contract
 *
 * Why this file exists:
 *   The contract is documented in docs/security-contract-innerhtml.md.
 *   Unit tests for each sanitizer (KwSecurity, KwUtils.escapeHtml) make
 *   it impossible to accidentally weaken the security guarantees.
 *
 * Uses tests/_setup.js (jsdom-based env) because KwSecurity is exposed
 * as `window.KwSecurity` (ES5 style) rather than `module.exports`.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts } = require('./_setup');

function loadSecurity() {
  const env = makeEnv();
  loadScripts(env.window, ['taskpane/services/security.js']);
  loadScripts(env.window, ['taskpane/services/utils.js']);
  return {
    KwSecurity: env.window.KwSecurity,
    KwUtils: env.window.KwUtils,
    window: env.window,
  };
}

const DQ = String.fromCharCode(34); // double quote
const SQ = String.fromCharCode(39); // single quote

test('security: KwSecurity rejects script tag', () => {
  const { KwSecurity } = loadSecurity();
  const safe = KwSecurity.sanitizeHtml('<script>alert(1)</script>hello');
  const tpl = KwSecurity._getTemplate();
  tpl.innerHTML = safe;
  assert.equal(tpl.content.querySelectorAll('script').length, 0);
  assert.ok(tpl.content.textContent.indexOf('hello') !== -1);
});

test('security: KwSecurity strips onerror attribute', () => {
  const { KwSecurity } = loadSecurity();
  const safe = KwSecurity.sanitizeHtml('<img src=x onerror="alert(1)">');
  const tpl = KwSecurity._getTemplate();
  tpl.innerHTML = safe;
  for (const img of tpl.content.querySelectorAll('img')) {
    assert.equal(img.getAttribute('onerror'), null);
  }
});

test('security: KwSecurity strips javascript: URLs from href', () => {
  const { KwSecurity } = loadSecurity();
  const safe = KwSecurity.sanitizeHtml('<a href="javascript:alert(1)">click</a>');
  const tpl = KwSecurity._getTemplate();
  tpl.innerHTML = safe;
  for (const a of tpl.content.querySelectorAll('a')) {
    const href = a.getAttribute('href');
    assert.ok(!href || href.indexOf('javascript:') !== 0);
  }
});

test('security: KwSecurity allows strong, em, code tags (allowlist)', () => {
  const { KwSecurity } = loadSecurity();
  const safe = KwSecurity.sanitizeHtml('<strong>bold</strong> <em>italic</em> <code>code</code>');
  const tpl = KwSecurity._getTemplate();
  tpl.innerHTML = safe;
  assert.equal(tpl.content.querySelectorAll('strong').length, 1);
  assert.equal(tpl.content.querySelectorAll('em').length, 1);
  assert.equal(tpl.content.querySelectorAll('code').length, 1);
});

test('security: KwSecurity strips unknown tags (text inside is removed too)', () => {
  // Allowlist sanitization: unknown tags AND their text content are
  // removed. To preserve text, wrap it in an allowed tag like <p>.
  const { KwSecurity } = loadSecurity();
  const safe = KwSecurity.sanitizeHtml('<p>kept</p><unknown-tag>removed</unknown-tag>');
  const tpl = KwSecurity._getTemplate();
  tpl.innerHTML = safe;
  assert.equal(tpl.content.querySelectorAll('unknown-tag').length, 0);
  assert.ok(tpl.content.textContent.indexOf('kept') !== -1);
  assert.equal(tpl.content.textContent.indexOf('removed'), -1);
});

test('security: KwSecurity.sanitizeUrl blocks javascript: protocol', () => {
  const { KwSecurity } = loadSecurity();
  assert.equal(KwSecurity.sanitizeUrl('javascript:alert(1)'), '');
  assert.equal(KwSecurity.sanitizeUrl('JavaScript:alert(1)'), '');
  assert.equal(KwSecurity.sanitizeUrl('  javascript:alert(1)  '), '');
});

test('security: KwSecurity.sanitizeUrl allows http and https', () => {
  const { KwSecurity } = loadSecurity();
  assert.equal(KwSecurity.sanitizeUrl('https://example.com'), 'https://example.com');
  assert.equal(KwSecurity.sanitizeUrl('http://example.com'), 'http://example.com');
});

test('security: KwSecurity.sanitizeUrl blocks data:text/html but allows data:image', () => {
  const { KwSecurity } = loadSecurity();
  assert.equal(KwSecurity.sanitizeUrl('data:text/html,<script>alert(1)</script>'), '');
  assert.equal(
    KwSecurity.sanitizeUrl('data:image/png;base64,iVBORw0KGgo='),
    'data:image/png;base64,iVBORw0KGgo='
  );
});

test('security: KwSecurity.sanitizeUrl blocks vbscript and blob protocols', () => {
  const { KwSecurity } = loadSecurity();
  assert.equal(KwSecurity.sanitizeUrl('vbscript:msgbox(1)'), '');
  assert.equal(KwSecurity.sanitizeUrl('blob:http://x/y'), '');
});

test('security: KwUtils.escapeHtml encodes HTML-significant chars in text content', () => {
  // escapeHtml is for text content between tags. It encodes the chars
  // that would break out of a text context: <, >, &. It does NOT encode
  // quotes (use escapeAttr for that).
  const { KwUtils } = loadSecurity();
  assert.equal(
    KwUtils.escapeHtml('<script>alert(1)</script>'),
    '&lt;script&gt;alert(1)&lt;/script&gt;'
  );
  assert.equal(KwUtils.escapeHtml('hello & world'), 'hello &amp; world');
});

test('security: KwUtils.escapeHtml passes through plain text unchanged', () => {
  const { KwUtils } = loadSecurity();
  assert.equal(KwUtils.escapeHtml('hello world'), 'hello world');
  assert.equal(KwUtils.escapeHtml('中文测试 123'), '中文测试 123');
});

test('security: KwUtils.escapeAttr encodes quotes for attribute values', () => {
  // escapeAttr is for HTML attribute values. It encodes all chars that
  // could break out of an attribute: ", ', <, >, &.
  const { KwUtils } = loadSecurity();
  const input1 = DQ + 'onmouseover=' + DQ + 'alert(1)';
  const expected1 = '&quot;onmouseover=&quot;alert(1)';
  assert.equal(KwUtils.escapeAttr(input1), expected1);

  const input2 = SQ + 'onclick=' + SQ + 'alert(1)';
  const expected2 = '&#39;onclick=&#39;alert(1)';
  assert.equal(KwUtils.escapeAttr(input2), expected2);
});

test('security: combined multi-vector XSS payload is neutralized', () => {
  const { KwSecurity } = loadSecurity();
  const dirty =
    '<img src=x onerror="alert(1)"><a href="javascript:alert(2)">x</a><script>alert(3)</script>';
  const safe = KwSecurity.sanitizeHtml(dirty);
  const tpl = KwSecurity._getTemplate();
  tpl.innerHTML = safe;
  assert.equal(tpl.content.querySelectorAll('script').length, 0);
  for (const img of tpl.content.querySelectorAll('img')) {
    assert.equal(img.getAttribute('onerror'), null);
  }
  for (const a of tpl.content.querySelectorAll('a')) {
    const href = a.getAttribute('href') || '';
    assert.ok(href.indexOf('javascript:') !== 0);
  }
});

test('security: empty/null inputs return empty string', () => {
  const { KwSecurity, KwUtils } = loadSecurity();
  assert.equal(KwSecurity.sanitizeHtml(''), '');
  assert.equal(KwSecurity.sanitizeHtml(null), '');
  assert.equal(KwSecurity.sanitizeUrl(''), '');
  assert.equal(KwSecurity.sanitizeUrl(null), '');
  assert.equal(KwUtils.escapeHtml(''), '');
  assert.equal(KwUtils.escapeHtml(null), '');
  assert.equal(KwUtils.escapeAttr(null), '');
});
