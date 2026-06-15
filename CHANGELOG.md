# Changelog

All notable changes to **Kaiwu (开悟)** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] — Performance, UX, and Code-Quality Overhaul

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
