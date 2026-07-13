# Security Contract: innerHTML Usage

**Status:** enforced by code review + ESLint (see `.eslintrc.json`)
**Last updated:** Round 6 of QA improvements

## Why this contract exists

The codebase has 16 `element.innerHTML = ...` call sites. Some are safe
(static internal strings), some need sanitization (AI output), and some
are currently unprotected.

WPS is a security-sensitive environment: the add-in runs inside CEF
(Chromium Embedded Framework) with full access to the user's document
and clipboard. A single unescaped `innerHTML = userInput` would let
any AI response (or attacker-controlled prompt injection) execute
arbitrary JavaScript in the add-in's origin.

## The contract

### ✅ ALLOWED

1. **Static, hardcoded strings** — no interpolation, no user data:
   ```js
   container.innerHTML = '<div class="result-loading">正在生成...</div>';
   ```

2. **AI output via `KwMarkdown.render(text)` or
   `KwSecurity.sanitizeHtml(html)`** — these are the only sanitization
   helpers; they strip disallowed tags, validate URLs, and escape
   attribute values:
   ```js
   body.innerHTML = KwMarkdown.render(aiOutput);
   meta.innerHTML = KwUtils.escapeHtml(sourceLbl) + ' · 生成中';
   ```

3. **`textContent` for plain text** (preferred over innerHTML):
   ```js
   label.textContent = userInput;  // safe, no HTML parsing
   ```

### ❌ FORBIDDEN

1. **Direct AI model output to innerHTML without sanitization**:
   ```js
   // BAD
   body.innerHTML = aiOutput;
   // GOOD
   body.innerHTML = KwSecurity.sanitizeHtml(aiOutput);
   ```

2. **User-controlled strings to innerHTML** (settings, history, prompts,
   etc.):
   ```js
   // BAD
   title.innerHTML = historyItem.title;
   // GOOD
   title.textContent = historyItem.title;
   ```

3. **`document.write`, `eval`, `new Function(...)`**: these have
   no legitimate use in the add-in. `eval` was already banned by the
   codebase; this contract makes the policy explicit.

## How to add a new innerHTML usage

1. **First**, ask: can I use `textContent` instead?
2. **If you need HTML formatting**, run the value through one of:
   - `KwMarkdown.render(md)` — for AI/markdown content
   - `KwSecurity.sanitizeHtml(html)` — for already-HTML content
   - `KwUtils.escapeHtml(text)` — for inline interpolation of plain text
3. **Add a comment** above the line explaining the data flow:
   ```js
   // Safe: KwSecurity.sanitizeHtml strips disallowed tags/attrs
   // before assigning. Do NOT replace with a raw AI field.
   container.innerHTML = KwSecurity.sanitizeHtml(rawHtml);
   ```
4. **Add a unit test** that asserts the sanitization is in effect (e.g.
   a test that passes `<img src=x onerror=alert(1)>` and verifies
   no `onerror` attribute survives).

## Sanitization helpers in this codebase

| Helper | Use case | Notes |
|---|---|---|
| `KwSecurity.sanitizeHtml(html)` | already-HTML, AI output | Strips disallowed tags, validates `href`/`src` against `javascript:` etc. |
| `KwSecurity.sanitizeUrl(url)` | URL validation | Blocks `javascript:`, `vbscript:`, `data:text/html` |
| `KwUtils.escapeHtml(text)` | inline text in HTML template | Use when assembling HTML strings via concatenation |
| `KwMarkdown.render(md)` | AI output as markdown | Internally calls `KwSecurity` after `marked.parse` |

## Audit log

The 16 current `innerHTML` call sites are concentrated in:

| File | Count | Safe? |
|---|---|---|
| `taskpane/components/result-panel.js` | 6 | All 6 pass through `KwMarkdown.render` or set static strings; verified by tests. |
| `taskpane/components/chat.js` | 3 | Pass through sanitizers; verified by tests. |
| `taskpane/components/history-drawer.js` | 2 | One uses `_filterText` (user-controlled!) — **needs follow-up audit**. |
| `taskpane/components/result-card.js` | 1 | Static `cards.map(...).join('')` — safe. |
| `taskpane/components/message.js` | 1 | `MessageRenderer._renderMarkdown` — safe. |
| `taskpane/components/settings.js` | 1 | Static string — safe. |
| `taskpane/services/markdown.js` | 1 | `tpl.innerHTML = html` is fed to `_sanitizeNode` immediately after — safe by design. |
| `taskpane/services/security.js` | 1 | Internal `_getTemplate.innerHTML` — safe (input is sanitized right after). |

The one outstanding follow-up is `history-drawer.js:306` where
`list.innerHTML = this._filterText` interpolates user input. This is
already partly safe (`_filterText` is an internal function), but it
should be migrated to `textContent` or `KwSecurity.sanitizeHtml` in a
follow-up PR.

## Reporting a violation

If you find an `innerHTML` assignment that isn't on this list, file
an issue with the `security` label. Don't wait for a vulnerability
report.
