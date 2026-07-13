# Kaiwu — Architecture

Kaiwu (开悟) is a WPS Office add-in that brings AI-powered writing assistance
into the WPS Writer sidebar. This document describes the system layout,
the module dependency graph, and the major data flows.

> **Status:** Living document. If you change a major flow or introduce a
> new module, please update this file in the same PR.

## 1. System view

```
                                 ┌──────────────────────┐
                                 │  WPS Office (Writer) │
                                 │   - Selection API    │
                                 │   - PluginStorage    │
                                 └──────────┬───────────┘
                                            │
                ┌───────────────────────────┼───────────────────────────┐
                │                           │                           │
                ▼                           ▼                           ▼
        ┌───────────────┐           ┌───────────────┐           ┌───────────────┐
        │  ribbon.js    │           │  component.js │           │ taskpane/    │
        │  (jsaddons/   │           │  (entry)       │           │  index.html  │
        │   ribbon.xml) │           │                │           │               │
        └───────────────┘           └───────────────┘           └───────┬───────┘
                │                           │                           │
                │ registers                 │ mounts                    │
                │ "开悟"                    │ <webview>                │
                │ tab                       │ for sidebar              │
                ▼                           ▼                           ▼
        ┌──────────────────────────── Kaiwu UI ──────────────────────────┐
        │  taskpane/                                                       │
        │  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
        │  │ app.js          │  │ components/      │  │ services/      │ │
        │  │ (lifecycle,     │  │ - chat.js        │  │ - ai.js        │ │
        │  │  WPS bridge)    │  │ - result-panel.js│  │ - ai-factory.js│ │
        │  │                 │  │ - history-drawer │  │ - opencode-ai.js│ │
        │  │                 │  │ - settings.js    │  │ - markdown.js  │ │
        │  │                 │  │ - message.js     │  │ - toast.js     │ │
        │  │                 │  │ - result-card.js │  │ - security.js  │ │
        │  │                 │  │                  │  │ - logger.js    │ │
        │  │                 │  │                  │  │ - session-mgr  │ │
        │  │                 │  │                  │  │ - utils.js     │ │
        │  └─────────────────┘  └──────────────────┘  └────────────────┘ │
        │                              │                                  │
        │                              │ uses                              │
        │                              ▼                                  │
        │                  ┌───────────────────────┐                      │
        │                  │ actions/              │                      │
        │                  │ - action-registry.js  │                      │
        │                  │ - action-runner.js    │                      │
        │                  │ - prompt-templates.js │                      │
        │                  └───────────────────────┘                      │
        └──────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS (JSON over fetch)
                                    ▼
                          ┌──────────────────────┐
                          │  AI provider        │
                          │  (OpenAI-compatible) │
                          │  - MiniMax / DeepSeek│
                          │  - OpenAI / 硅基流动 │
                          └──────────────────────┘
```

### 1.1 Out of scope
- The **floating** Python script (in `floating/`) is a separate desktop
  sidebar that shares `taskpane/services/` (some modules) but runs
  independently. It is NOT covered by this document.
- WPS's own internal APIs are documented upstream.

## 2. Module dependency rules

### 2.1 Layers

```
        ┌─────────────────┐
        │  app.js         │  (lifecycle, WPS bridge, top-level wiring)
        └────────┬────────┘
                 ▼ uses
        ┌─────────────────┐
        │  components/    │  (UI widgets — DOM-manipulation classes)
        └────────┬────────┘
                 ▼ uses
        ┌─────────────────┐
        │  actions/       │  (registry / runner — orchestration)
        └────────┬────────┘
                 ▼ uses
        ┌─────────────────┐
        │  services/      │  (pure logic — no DOM)
        └─────────────────┘
```

Strict layering:
- **`components/` may import from `services/` and `actions/`.**
- **`actions/` may import from `services/`.**
- **`services/` may NOT import from `components/` or `actions/`.**
  If a service needs DOM, the caller must pass DOM nodes in.
- **`app.js` is the only file allowed to talk to `window.Application` directly.**
  Components receive a thin facade from `app.js`.

### 2.2 Module-publish convention

Every script in `taskpane/` is loaded via `<script src>` tag (no ES modules,
because WPS CEF support is inconsistent). Each file exposes a single
`var Foo = (function () { ... return { ... }; })()` (IIFE assignment).

Naming:
- `Kw*` prefix for global services shared across components: `KwToast`,
  `KwSecurity`, `KwLogger`, `KwMarkdown`, `KwUtils`, `KwSecurity`.
- Plain PascalCase for components / actions: `ChatUI`, `ResultPanel`,
  `ActionRunner`, etc.

## 3. Critical data flows

### 3.1 "写一篇" (write a piece) action

```
User clicks "写一篇" chip
  ▼ ChatUI.handleAction('write')
    ▼ ActionRunner.run('write')
      ▼ ActionRegistry.getPrompt('write', context)
        ▼ PromptTemplates.build(...)  (interpolation)
        ▼ AIServiceFactory.create(config)
          ▼ (opencode or standard) → AIService.send(...)
            ▼ opencode-ai._request(url, opts)
              ▼ fetch → response → JSON parse → fireSuccess(result)
            ▼ stream chunks back to ChatUI
      ▼ ChatUI._appendToMessage(...) (DOM update)
    ▼ ResultPanel.mount(streaming-card)
      ▼ ResultCard._scheduleRender() (debounced 80ms)
        ▼ render() writes card HTML to DOM
  ▼ when stream finishes
    ▼ AIServiceFactory.create's service calls fireSuccess(final)
    ▼ ChatUI marks card as done
    ▼ User can now click "插入" / "替换" / "复制"
      ▼ WriterAdapter.insertAtCursor or replaceSelection
```

### 3.2 Login / API-key rotation

```
User opens Settings
  ▼ SettingsUI shows Config panel
    ▼ User pastes new API key
      ▼ Config.save(apiKey, baseUrl, model)
        ▼ localStorage.setItem(KW_CONFIG_KEY, ...)
        ▼ AND if env.js was empty → dispatch 'kw-config-changed' event
          ▼ AIServiceFactory re-evaluates create(config)
```

### 3.3 History load

```
User clicks "≡" (history button)
  ▼ HistoryDrawer.toggle()
    ▼ HistoryDrawer._load()
      ▼ SessionManager.list()
        ▼ localStorage.getItem(KW_HISTORY_KEY)
        ▼ groupBySource() → render()
      ▼ HistoryDrawer._render(groups)
        ▼ for each group → _renderGroup / _renderEntry → DOM
```

## 4. Security boundary

- **All AI / user input → innerHTML** flows through one of:
  - `KwSecurity.sanitizeHtml(html)` — already-HTML input
  - `KwMarkdown.render(md)` — markdown
  - `KwUtils.escapeHtml(text)` — text content (does NOT encode quotes)
  - `KwUtils.escapeAttr(value)` — for HTML attribute values (encodes quotes)
- See `docs/security-contract-innerhtml.md` for the full contract and
  `tests/innerhtml-security.test.js` for regression coverage.

## 5. Logging convention

- All code paths in `taskpane/` log via `KwLogger.{debug,info,warn,error}`.
- Default `level` is `'warn'` in browser, `'debug'` in Node tests.
- 14 raw `console.*` calls in legacy code (see `git grep KwLogger`). Future
  PRs should migrate them incrementally.

## 6. Build / package / release

```
src (Lint+Test)
  ▼
npm run assets (copy-assets.js: icons, CSS, vendor JS)
  ▼
npm run env (init-env.js: read .env → taskpane/env.js)
  ▼
npm run sync (sync-build.js: wpsjs build)
  ▼
node scripts/package.js 7z (custom: README, bat files, manifest)
  ▼
wps-addon-publish/kaiwu_X.Y.Z.7z
```

CI guards each step:
- `tests/7z-marker.test.js` extracts the published `.7z` and asserts
  refactor markers (regression guard against stale builds).
- `.github/workflows/ci.yml` runs every PR through `lint + format + test + test:serial + 7z-marker + build`.
- `.github/workflows/release.yml` runs only on tag push and uploads
  the artifact to GitHub Releases.

## 7. Where to start as a new contributor

1. Read [docs/security-contract-innerhtml.md](security-contract-innerhtml.md)
2. Read [docs/opencode-integration.md](opencode-integration.md) for the AI
   service layer (the most architecturally subtle part)
3. Run `npm install && npm test` to confirm the baseline works
4. Make a tiny change (e.g. add a setting toggle) following the patterns in
   `components/settings.js` and `services/config.js`
5. Open a PR — the template checklist will guide you
