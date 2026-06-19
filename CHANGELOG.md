# Changelog

All notable changes to **Kaiwu (开悟)** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-06-19

### ✨ New Features
- **OpenCode mode**: Route all AI requests through local opencode-cli server
- **Per-document sessions**: Each WPS document has its own persistent opencode session
- **Action mapping**: All 20+ Kaiwu actions (write, polish, translate, etc.) work via opencode
- **Agent selection**: Choose between plan (read-only) and build (with confirmation) agents
- **Mode switcher**: Switch between standard and OpenCode modes in settings
- **Connection status**: Real-time status indicator in sidebar
- **Connection retry**: Auto-retry with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- **Auto-fallback**: When opencode is unavailable, seamlessly fall back to standard mode
- **Session cleanup**: Automatic cleanup on document close; periodic prune of old sessions

### 🔒 Security
- **Auth handler**: HTTP Basic Auth with password masking in logs
- **Session isolation**: Each document has isolated session state

### 🛠 Code Quality
- **Factory pattern**: AIServiceFactory selects service based on config.mode
- **HTTP client**: Robust HTTP wrapper with timeout, auth, error handling
- **SSE streaming**: Native EventSource-style streaming for real-time responses
- **Error classification**: Consistent error types (AuthError, NotFoundError, etc.)

### 🧪 Testing
- **+~50 new tests** for opencode integration (455 total)

### 📚 Documentation
- **OpenCode setup guide**: In README-安装说明.md
- **Interface contract**: docs/opencode-integration.md

## [0.3.0] — 2026-06-19

### ✨ New Features
- **8 missing ribbon actions implemented**:
  - AI 讲文档 (talkDoc) - Convert document to narration script
  - 深度思考 (deepThink) - Deep reasoning mode with 2x tokens
  - 法律助手 (legal) - Legal assistant with specialized prompts
  - AI 生成图片 (genImage) - AI image description generation
  - AI 总结生图 (summaryImage) - Document summary visualization
  - 文档生成PPT (docToPpt) - Document to PPT outline
- **First-run API key prompt**: Welcome overlay for unconfigured API keys
- **Floating dialog branding**: Added 开悟 AI 助手 brand mark
- **Context bar timeout**: 3s timeout shows "未连接到 WPS Writer"
- **Selection-required visual indication**: Disabled state for actions needing text selection
- **Floating dialog boundary checks**: Vertical viewport clamping

### 🔒 Security
- **API key leak fix**: Release package no longer includes .env with real keys
- **bat file encoding**: Switched from GBK to UTF-8 with BOM for cross-locale support

### 🛠 Code Quality
- **ESLint**: Added .eslintrc.json with browser globals and WPS-specific rules
- **Prettier**: Added .prettierrc.json and .prettierignore
- **Coverage reporting**: Added c8 with 80% line/75% branch thresholds

### 🧪 Testing
- **+91 new tests** (330 → 421):
  - Settings UI component tests (15)
  - Chat UI component tests (17)
  - App initialization tests (13)
  - Keyboard shortcut tests (10)
  - Package security tests
  - Screenshot existence tests
  - First-run detection tests

### 📚 Documentation
- **Real screenshots**: Added ribbon.png, sidebar.png, result.png
- **README-安装说明.md**: End-user Chinese installation guide
- **GPO APPDATA fix**: Corrected PowerShell example for SYSTEM context

### 🔧 Build
- **bat encoding**: UTF-8 with BOM for international Windows support

---

## [0.2.0] — 2026-06-16

### 🛡️ Production hardening

- **P0-1: ChatUI._bindEvents null checks**: all `getElementById` calls wrapped with `safeBind` helper; missing elements are silently skipped instead of throwing.
- **P0-2: ActionRunner.run() try-catch**: unhandled exceptions in action execution are caught, logged, and shown to the user via toast — prevents silent script death.
- **P0-3: ResultPanel double-escaping fix**: removed `.replace(/"/g, '\\"')` after `KwUtils.escapeAttr` in CSS selector lookup.
- **P0-4: sourceType for user input**: `_resolveInput` now returns `'user'` sourceType when `action.input === 'user'` with `reuseInput`, instead of always returning `'selection'`.
- **P0-5: Markdown sanitize failure safe fallback**: `KwMarkdown.render` now returns escaped HTML when `KwSecurity._sanitizeNode` throws, instead of returning unsanitized HTML.
- **P1: typeof guards**: `ActionRegistry`, `AIService`, `WriterAdapter` are now checked via `typeof !== 'undefined'` before access in `chat.js`, `action-runner.js`, `result-panel.js`.
- **P1: ChatManager private API fix**: `retryLastMessage` / `dismissError` no longer call `_saveChat` (non-existent method); now uses `_updateCache` + `_flushSave`.
- **P1: _pushHistory throttle**: `_pushHistory` in `ActionRunner` now enforces 500ms minimum interval to prevent storage thrashing during rapid streaming.
- **P1: prompt-templates graceful error**: `buildMessages` returns fallback prompt instead of throwing on unknown key.
- **P1: WakeWord duplicate listener**: removed redundant `window.addEventListener('keydown')` — `document.addEventListener` already captures all keydown events in capture phase.
- **P1: Markdown Renderer constructor**: `buildRenderer` wraps `new marked.Renderer()` in try-catch for compatibility with newer marked versions.
- **P1: Unified toast API**: `ActionRunner` now uses `KwToast.show()` instead of `MessageRenderer._showToast()`.
- **P2: Dead code cleanup**: removed `_historyHTML` cache, `_showQuickActionBar` dead method, duplicate interval in `_init`.
- **P2: resize debounced**: `window.resize` listener now uses `KwUtils.rafSchedule`.
- **P2: export race fix**: download link cleanup uses double `requestAnimationFrame` instead of `setTimeout(100)`.
- **P2: bindAutoReset idempotency**: `ComponentDetector.bindAutoReset` now uses `_bound` flag to prevent duplicate event listener registration.
- **P2: ribbon unknown button**: `OnAction` returns `false` for unrecognized buttons (WPS best practice).
- **P2: toast.js body guard**: `ensureEl` checks `document.body` existence before appending.
- **P2: WriterAdapter.getDocumentInfo**: tries `doc.Content.Count` API first before falling back to full text extraction.
- **P2: ResultCard public API**: added `get(id)` and `remove(id)` methods.

### ✨ Highlights

This is a comprehensive overhaul covering **performance**, **streaming UX**, **error handling**, **code quality**, and **new features**. **51 new tests** added (279 → 330). All existing tests remain green; zero regressions.

### ⚡ Performance (stream rendering & storage)

- **ChatUI streaming — incremental DOM update**: stream chunks now update only the last assistant message's `.message-body-content` node, instead of rebuilding the entire conversation HTML on every chunk. Scrolling, text selection, and code-highlight state are no longer reset.
- **ResultPanel streaming — incremental content patch**: replaces only the `.result-content` inner HTML during streaming, not the entire card. Streaming cancellation badge / status updates no longer rebuild the header.
- **HistoryDrawer — throttled persistence (500ms)**: 10 rapid `push` calls now trigger only 1 `localStorage.setItem` (was 10). Eliminates storage jitter and reduces quota-exceeded errors.
- **ChatManager — throttled save**: `updateLastAssistant` (called on every streaming chunk) no longer writes localStorage synchronously. Batched with trailing flush.
- **HistoryDrawer — render dedup**: per-render hash check skips `innerHTML` rebuilds when the data hasn't actually changed. Filter changes invalidate the hash.
- **A8 — Markdown renderer & template singletons**: `marked.Renderer` is created once, `KwSecurity._templateEl` is reused, replacing 5+ redundant constructions per call.
- **A9 — Robust SSE parsing**: now handles `data:` (no trailing space), `\r\n` line endings, `:comment` heartbeat lines, and clears the buffer after `[DONE]`. Incremental `stripThinking` only inspects the new delta, not the full text.
- **D10 — `WriterAdapter.replaceSelection` O(1) check**: replaced full-text `===` with `indexOf` substring match. Also tolerates surrounding whitespace in the selection.

### 🛑 Streaming controls & UX

- **C1 — Abort button in main chat**: ⏹ 停止 button now appears in the toolbar while a request is in flight. Esc key also aborts. The result is marked `cancelled` (distinct from `error`) in the card status.
- **C2 — Smart scroll-to-bottom**: when the user has scrolled up to read history, streaming no longer yanks the view back to the bottom. Only auto-scrolls when the user is already at the bottom (32px tolerance).
- **C3 — Blinking caret indicator**: a `▍` caret blinks at the end of the streaming content, removed on completion.
- **C6 — Unified error card**: errors are no longer embedded as `[错误] xxx` in the assistant message. Instead, a red `.message-bubble-error` card appears with a "重试" (retry) and "关闭" (dismiss) button.
- **C4 — Status-aware error messages**: 401 → "API Key 无效或已过期"; 429 → "请求过于频繁"; 5xx → "AI 服务暂不可用"; with retry hints.
- **C5 — Timeout & retry**: 60s request timeout, exponential backoff (1 retry by default) for transient errors. Network/DNS errors are not retried (typically permanent).

### 🆕 New features

- **D1 — Test Connection button** in Settings panel: validates the current form values with a `max_tokens: 1` request, reports latency or error. Lets users diagnose configuration before sending real messages.
- **D2/D3 — Chat import/export**: ⬇ / ⬆ buttons in the header. Export downloads a JSON file (versioned schema). Import merges, dedup by chat ID. Quota-friendly: chunked reads.
- **D5 — Token & char counter**: live counter below the input box: `N 字 · 约 M tokens` (CJK ≈ 1.5 tok/字, ASCII ≈ 4 chars/tok).
- **D6 — Global keyboard shortcuts**: `Esc` closes settings / cancels; `Ctrl+L` clears chat; `Ctrl+N` starts a new chat.
- **D7 — History drawer search**: 🔍 search box filters by source text, result text, or action label. Header shows `匹配 N / M 条`.
- **D8 — Regenerate debounce**: clicking ↻ within 800ms is suppressed to avoid duplicate concurrent runs.
- **D11/D12 — Visibility-aware polling**: when the WPS taskpane is hidden (`document.hidden`), the pending-action and context-bar polling intervals pause; they resume when the pane is shown. Cuts idle WPS COM traffic.
- **D13 — Ribbon selection cache**: `OnGetEnabled` caches `Selection.Text` and `ActiveDocument` for 200ms / 500ms, since WPS calls it synchronously per control on every invalidation.
- **D14 — XSS-safe quick action bar**: replaced `innerHTML` injection with `textContent`.
- **D15 — Insert cleanup unified**: assistant-message → document insertion now goes through `KwUtils.cleanResult` (single source of truth for stripping thinking traces).
- **D16 — Ribbon proactive cache invalidation**: ribbon binds `ComponentDetector.bindAutoReset` at load, and listens to `WindowSelectionChange` / `DocumentOpen` / `NewDocument` to invalidate the cache.
- **D17 — Floating dialog rAF merging**: AI command menu & result panel reposition on resize is rAF-merged (single layout per frame).
- **D19 — Copy uses Promise API**: `KwUtils.copyToClipboard` returns a `Promise`, with `document.execCommand('copy')` only as a fallback. No more synchronous clipboard ops leaking into tests.
- **D20 — `KwSecurity` template singleton**: the `<template>` element used for sanitization is created once and reused.
- **A4 — ResultPanel cancelled vs error**: `ResultPanel.abort()` now sets `status: 'cancelled'` (distinct from `status: 'error'`), so the history drawer can show the right label.
- **F5/F6 — Per-action overrides**: `ActionRegistry` entries can declare `temperature`, `maxTokens`, `maxHistoryMessages`. Different actions now use different temperatures (e.g. `correct: 0.1`, `expand: 0.6`, `summarize: 0.3`).
- **G3 — Multi-listener wakeword**: `WakeWordManager.onTrigger(fn)` / `offTrigger(fn)` — multiple pages can each register their own trigger handler without clobbering each other.
- **G4 — systemPrompt source tracking**: `Config` tracks whether the system prompt is `user:custom` or `default:<component>`, so future enhancements can re-apply the default when the user resets.

### 🧹 Code quality

- **B1/B3 — Shared utility modules**: extracted `KwUtils` (escape, format, debounce, throttle, raf, copy, estimateTokens), `KwToast` (unified notification service with multi-channel), and `KwMarkdown` (single-instance renderer + sanitizer). 5+ duplicated `_stripThinking` / `_cleanResult` / `_escapeHtml` / `_escapeAttr` / `_formatTime` / `_renderMarkdown` implementations across `message.js`, `result-card.js`, `result-panel.js`, `history-drawer.js`, `ai.js` — all consolidated.
- **B2 — Removed duplicate `DEFAULT_API_*` IIFEs** in `app.js` and `config.js`.
- **A1 — `_idFor(content)` now uses a hash**: no more leaking raw user content into `data-mid` DOM attributes (privacy / control-character concerns).
- **Event delegation via `data-kw-action`**: replaced inline `onclick="MessageRenderer.copyMessage(this)"` (CSP-friendlier, less attack surface) with a single `chatContainer.click` listener that routes on the action attribute.

### 🧪 Tests

- **51 new tests** across 4 new files:
  - `tests/kw-utils.test.js` — 12 tests for `KwUtils` (strip thinking, escape, formatTime, debounce, raf, isAtBottom) and `KwToast` (multi-channel).
  - `tests/ai-edge.test.js` — 12 SSE edge cases (`data:` no space, `\r\n`, `:comment` heartbeat, cross-chunk `<think>`, error classification, retryability, malformed JSON).
  - `tests/writer-adapter-edge.test.js` — 4 cases for the new substring-match behavior.
  - `tests/history-drawer-edge.test.js` — 8 cases for filter, throttled save, render dedup, search-result-count.
  - `tests/smoke-integration.test.js` — 15 full-DOM integration tests covering all critical paths.
- Test count: **279 → 330**, all passing.

### ⚠️ Known caveats

- Streaming cancellation: after `[DONE]` is received from the server, any trailing data in the same `ReadableStream` is still consumed. In practice, OpenAI never sends post-DONE data; this is a defensive note only.
- `WriterAdapter.replaceSelection` is now substring-based. If the original selection somehow appears inside another longer word, replacement will still succeed (probably what the user wants).
- The action-registry still references `prompt-templates.js` via `promptKey` — consolidation is deferred to keep the diff focused.

---

## [1.0.0] — 2026-06

Initial public release. Chat, Polish, Continue, Imitate, Translate, Summarize, Cowrite, Mindmap, AI Layout, with MiniMax / DeepSeek / OpenAI / SiliconFlow support.
