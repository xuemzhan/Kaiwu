# Kaiwu · 开悟 — WPS AI Writing Assistant

<div align="center">

![Kaiwu logo](images/kaiwu.svg)

**An AI-powered writing add-in for WPS Office**

Chat · Polish · Continue · Translate · Summarize · Imitate · Cowrite · Mindmap

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![WPS](https://img.shields.io/badge/WPS-12.1.0.26375+-orange.svg)](https://www.wps.com/)
[![Node](https://img.shields.io/badge/Node-20+-green.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-lightgrey.svg)](#-system-requirements)
[![Tests](https://img.shields.io/badge/tests-642%2F642-success.svg)](https://github.com/xuemzhan/Kaiwu/actions)

</div>

---

**开悟 (Kaiwu)** is a community-maintained WPS Office add-in that brings a full-featured
AI writing assistant into the WPS Writer sidebar. It is built on the
[wpsjs](https://www.npmjs.com/package/wpsjs) plugin framework, runs entirely on
your local machine, and works with any OpenAI-compatible chat completion API
(MiniMax, DeepSeek, OpenAI, SiliconFlow, etc.).

> **Current release: `kaiwu_0.4.1.7z`** — see
> [Releases](https://github.com/xuemzhan/Kaiwu/releases). This release fixes the
> 0.4.0 bugs (WPS PE-load crash on DLL placeholder; `AIServiceFactory.create`
> returning `undefined`).

---

## Table of Contents

- [Features](#features)
- [System Requirements](#system-requirements)
- [Quick Start (End User)](#quick-start-end-user)
- [Building from Source (Developer)](#building-from-source-developer)
- [Project Structure](#project-structure)
- [How It Works](#how-it-works)
- [Testing & Quality Gates](#testing--quality-gates)
- [Development Tooling](#development-tooling)
- [Customization](#customization)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)
- [License & Credits](#license--credits)

---

## Features

| Category | Capability |
|---|---|
| **Chat** | Multi-turn conversation with streaming responses, Markdown rendering, Mermaid diagrams, code highlighting, ⏹ stop, 🔄 retry, ↕ import/export, ⌨ shortcuts (Esc / Ctrl+L / Ctrl+N), live token counter |
| **Polish** | One-click text refinement — formal / academic / colloquial / Party-government styles |
| **Continue** | Auto-continue writing in the document's existing style |
| **Cowrite** | Real-time collaborative writing that follows your cursor |
| **Imitate** | Mimic a reference passage's tone and structure |
| **Translate** | Auto-detect direction (zh↔en) and translate selected text |
| **Summarize** | Long document → concise bullet summary |
| **Document Q&A** | Ask questions about the current document |
| **Mindmap** | Auto-generate a Mermaid mindmap from the document |
| **AI Layout** | Reformat a paper / official document according to common templates |
| **Multi-model** | Switch between MiniMax / GPT / DeepSeek / custom endpoints at runtime |
| **Native AI Control** | 3-layer defense (registry + service + file placeholder) with multi-version detection — disable/enable WPS built-in AI independently |

## Screenshots

![Kaiwu Ribbon](screenshots/ribbon.png)\
*WPS ribbon showing the 开悟 tab*

![Kaiwu Sidebar](screenshots/sidebar.png)\
*The chat / action sidebar*

![Kaiwu Result](screenshots/result.png)\
*AI output with markdown + mermaid*

## System Requirements

| | |
|---|---|
| **WPS Office** | Personal Edition v12.1.0.26375+ or Professional Edition |
| **Operating System** | Windows 10 / Windows 11 |
| **Node.js** | v20+ (only required for development / packaging; user-facing install doesn't need it) |
| **Network** | Outbound HTTPS to your AI provider |

## Quick Start (End User)

> If you just want to use the plugin and don't care about the source, jump to the [Releases](https://github.com/xuemzhan/Kaiwu/releases) page.

1. Download `kaiwu_0.4.1.7z` from [Releases](https://github.com/xuemzhan/Kaiwu/releases).
2. Right-click the `.7z` → **Extract to** any folder (e.g. your Desktop).
3. **Fully exit WPS** (close all documents, right-click the WPS tray icon → Exit, and check Task Manager for any `wps.exe`).
4. Double-click **`install.bat`** inside the extracted folder.
5. Open WPS Writer, accept the plugin-loading prompt, and you should see the **开悟** tab in the ribbon.

To uninstall: double-click **`uninstall.bat`**, then restart WPS.

## Building from Source (Developer)

### 1. Clone & install

```bash
git clone https://github.com/xuemzhan/Kaiwu.git
cd Kaiwu
npm install
```

> **Node**: tested on Node 20+ (see `engines` field in `package.json`).
> Earlier versions may work but are not CI-tested.

### 2. Configure your API key

Copy the env template and fill in your real key:

```bash
cp .env.template .env
# edit .env: replace VITE_DEFAULT_API_KEY
```

`.env` is git-ignored — your key will never be committed.

### 3. Run in development mode

```bash
npm run debug
```

This starts a local HTTP server (port `3889` by default), registers the plugin with WPS, and launches WPS Writer with the add-in pre-loaded. The TaskPane page hot-reloads on file changes.

### 4. Build a distributable package

```bash
npm run build         # 7z archive (recommended)
npm run build:exe     # 7z + self-extracting EXE (triggers Windows PCA warning)
npm run build:all     # both
```

Output goes to `wps-addon-publish/`:

```
wps-addon-publish/
├── install.bat              # ASCII-only installer (handles WPS authaddin cache)
├── uninstall.bat            # Restores from .kaiwu-backup
├── verify.bat               # Post-install diagnostic
├── disable-wps-native-ai.bat   # 3-layer defense: disable built-in WPS AI
├── enable-wps-native-ai.bat    # Restore built-in WPS AI
├── publish.xml              # WPS plugin manifest
├── README-安装说明.md       # User-facing installation guide
├── kaiwu_0.4.1/             # Plugin source (ASCII dir name, see notes below)
└── kaiwu_0.4.1.7z           # Distributable archive
```

## Why is the directory named `kaiwu_0.4.1` and not `开悟_0.4.1`?

WPS resolves a plugin's install path as `{name}_{version}` where `name` comes from the `name` attribute in `publish.xml`. To keep the install script free of Chinese characters (which break under the GBK/UTF-8 codepage mismatches that `7zsd.sfx` runs under), we use the pinyin **kaiwu** as the registry name.

The ribbon tab still shows **开悟** — the `label` attribute in `ribbon.xml` controls the visible text. The pinyin name is only used internally for path resolution.

See [`INSTALL.md`](INSTALL.md) for the full gory details and troubleshooting flow.

## Project Structure

```
Kaiwu/
├── index.html                 # WPS addon entry point (loads ribbon + scripts)
├── ribbon.xml                 # Ribbon tab + button layout
├── ribbon.js                  # Ribbon callbacks + TaskPane manager
├── component.js               # WPS component detector (Writer / Spreadsheet / Presentation)
├── wpsjs.config.js            # Addon metadata (name=0.4.1, type)
├── package.json               # npm scripts + Node 20+ engines
├── .env.template              # Sample env file (copy to .env)
├── LICENSE                    # MIT
├── .gitattributes             # *.bat=CRLF, *.js=LF line-ending locks
├── .eslintrc.json             # Lint config (test/taskpane/scripts overrides)
├── CHANGELOG.md               # Round-by-round release notes
├── docs/                      # Architecture + security contract
│   ├── architecture.md
│   ├── opencode-integration.md
│   └── security-contract-innerhtml.md
├── images/                    # All SVG icons (logo, per-action icons)
├── taskpane/                  # The sidebar UI (lives in WPS TaskPane frame)
│   ├── index.html
│   ├── app.js                 # App entry, WPS bridge, lifecycle
│   ├── env.js                 # Auto-generated from .env (gitignored)
│   ├── services/              # config / chat / ai / security / logger / wakeword
│   ├── components/            # message / chat / result / settings / history
│   ├── actions/               # action registry + prompt templates + runner
│   ├── adapters/              # WPS Writer adapter
│   ├── styles/
│   └── vendor/                # marked, mermaid, html2canvas, highlight.js
├── floating/                  # Floating dialog (separate from sidebar)
├── wps-addon-publish/         # Build output (gitignored, see .gitignore)
├── scripts/
│   ├── package.js             # Custom packager (replaces `wpsjs build` for release)
│   ├── init-env.js            # .env → taskpane/env.js
│   ├── copy-assets.js         # Dev-mode asset staging
│   ├── sync-build.js          # Stage the wpsjs build output
│   └── release.js             # One-shot release pipeline
├── tests/                     # 642 tests (Node --test, jsdom-based)
│   ├── _setup.js              # Test environment factory
│   ├── ai-factory.test.js     # AIServiceFactory contract tests
│   ├── 7z-marker.test.js      # CI guard: verify published .7z content
│   ├── wps-config.test.js     # Cross-file config consistency
│   ├── package-script.test.js # scripts/package.js regression tests
│   ├── innerhtml-security.test.js  # XSS regression tests
│   ├── logger.test.js         # KwLogger unit tests
│   └── …                      # 40 more files
└── .github/                   # Repository governance
    ├── workflows/
    │   ├── ci.yml             # PR validation (lint + format + test + 7z-marker + build)
    │   └── release.yml        # Tag-triggered release pipeline
    ├── PULL_REQUEST_TEMPLATE.md
    ├── ISSUE_TEMPLATE/        # bug_report + feature_request + config
    ├── CODEOWNERS
    └── dependabot.yml          # Weekly npm + GitHub Actions updates
```

## How It Works

```
+----------------+      file://       +----------------+
|   WPS Writer   |  <---------------> |  index.html    |
|   (Chromium)   |                    |  + ribbon.js   |
+----------------+                    |  + component.js|
        |                             +----------------+
        | Application / Selection / Document
        v
+----------------+    HTTP    +-------------------+
|   TaskPane     |  <-------> |  dev server       |  (debug only)
|   (sidebar)    |  localStorage, ServiceWorker, fetch /v1/chat/completions
+----------------+
        |
        v
+---------------------+
|  Any OpenAI-compat  |   (MiniMax, DeepSeek, OpenAI, SiliconFlow, …)
|  chat completions   |
+---------------------+
```

* The **ribbon** (`ribbon.xml`) is parsed by WPS at startup; its `onAction` / `getImage` callbacks are resolved against the JavaScript functions defined in `index.html`'s scope.
* The **sidebar** (`taskpane/index.html`) is a separate page rendered in the right-hand TaskPane frame; it talks to the AI provider via `fetch` with `text/event-stream`.
* The **floating assistant** (`floating/`) is a modal dialog launched from the ribbon, sharing the same AI service layer.
* All model configuration is per-user, stored in `localStorage` and editable from the ⚙️ settings panel — no need to restart WPS.

### Logging convention

All `taskpane/` code paths log via [`KwLogger`](taskpane/services/logger.js):

```js
KwLogger.debug('Chat', 'rendering message', { id: 42 });
KwLogger.warn('HistoryDrawer', 'localStorage quota exceeded');
KwLogger.error('App', 'WPS bridge failed', err);
```

Levels (debug < info < warn < error) and history ring buffer are available for diagnostics. Default level: `warn` in browser (quiet), `debug` in tests (verbose).

### Production hardening

* **`opencode-ai._request`** uses `Promise.race` with a `settled` guard so a slow body parse after a timeout **cannot** double-fire callbacks.
* **`Scripts return CRLF directly`** — `scripts/package.js` generators now end every line with `\r\n` so any consumer (CI / third-party packagers) gets correct Windows-line-ending output, not LF.
* **innerHTML safety contract** — see `docs/security-contract-innerhtml.md`. All 16 existing `innerHTML` call sites are routed through `KwSecurity.sanitizeHtml` or `KwUtils.escapeHtml/escapeAttr`. ESLint warns on raw `innerHTML = <id>` assignments.

## Testing & Quality Gates

```bash
npm test                  # 642 tests (default: parallel)
npm run test:serial       # 642 tests, --test-concurrency=1 (deterministic)
npm run test:all          # both, for pre-push
npm run test:7z           # just the 7z-marker test (~10 tests)
npm run validate          # lint + format:check + test (single command)
```

| Check | Tool | What it catches |
|---|---|---|
| Unit / integration / security | `node --test` (642 tests) | AI contracts, sanitizers, parser, action registry, ribbon, history, security regressions, 7z markers |
| Lint | ESLint v8 | `no-unused-vars`, custom `no-restricted-syntax` for innerHTML safety |
| Format | Prettier v3 | Code style consistency |
| Build | `npm run build` | `kaiwu_0.4.1.7z` produced; verified by `tests/7z-marker.test.js` |

### CI

`.github/workflows/ci.yml` runs on every PR:

1. `npm run lint`
2. `npm run format:check`
3. `npm test` (parallel)
4. `npm run test:serial` (deterministic fallback)
5. `tests/7z-marker.test.js` (the artifact didn't drift)
6. `npm run build` (the build script didn't break)

`release.yml` runs on tag push, uploads `kaiwu_0.4.X.7z` to GitHub Releases,
and commits the updated `packages/manifest.json`.

## Development Tooling

| Command | Purpose |
|---|---|
| `npm run format` | Prettier `--write` for `taskpane/`, `scripts/`, `tests/`, `ribbon.js`, `component.js`, `index.html` |
| `npm run format:check` | Prettier `--check` (used by CI) |
| `npm run lint` | ESLint with `--max-warnings 100` |
| `npm run lint:fix` | Auto-fix lint warnings |
| `npm run validate` | Lint + format:check + test (single gate) |
| `npm run test:serial` | Deterministic serial runner (`--test-concurrency=1`) |
| `npm run test:all` | Parallel + serial in one command |
| `npm run test:7z` | 7z marker test only (fast sanity check) |
| `npm run assets` | Copy icons + CSS to staging |
| `npm run env` | `.env` → `taskpane/env.js` (gitignored) |
| `npm run sync` | Sync the wpsjs build output |
| `npm run debug` | Dev mode: assets + env + `wpsjs debug` |
| `npm run build` | Full package pipeline (assets + env + sync + 7z) |
| `npm run package` | Just `node scripts/package.js 7z` |
| `npm run release` | Full release: tests + build + manifest update |

## Customization

### Switch AI provider

Open the ⚙️ settings panel in the sidebar and change:

| Field | Examples |
|---|---|
| **API Base URL** | `https://api.minimaxi.com/v1`, `https://api.deepseek.com/v1`, `https://api.openai.com/v1`, `https://api.siliconflow.cn/v1` |
| **API Key** | Your provider's key |
| **Model** | Any model name your provider supports |

Settings persist in `localStorage`; no WPS restart required.

### Change the default model for the released package

Edit `.env` and run `npm run build` again. The new value is baked into the package's `taskpane/env.js`.

### Add a new ribbon button

1. Add a `<button>` to the appropriate `<group>` in `ribbon.xml`.
2. Add a `case` for its `id` in `ribbon.js` `OnAction()`.
3. Register the action in `taskpane/actions/action-registry.js`.

## Troubleshooting

**Plugin shows the "load" dialog but the tab never appears.**

See [`INSTALL.md`](INSTALL.md) for the full diagnostic flow. In short:

1. Run `verify.bat` from the installed package — it checks that the files are in the right place.
2. If `authaddin.json` is reported as still present, re-run `install.bat` (it will clear it).
3. Fully exit WPS (Task Manager → kill all `wps.exe`) and reopen Writer.

**API calls hang forever.**

The selected API base URL is unreachable, or the model name does not match the provider. Try a different model from the settings panel.

**WPS shows a "Program Compatibility Assistant" warning when running the EXE installer.**

This is a known false positive from `7zsd.sfx` self-extracting archives on Windows 10/11. Use the `.7z` archive instead — extract it with 7-Zip / WinRAR / the system built-in extractor and run `install.bat`.

## Documentation

| File | Purpose |
|---|---|
| **[README.md](README.md)** (this file) | High-level overview + quick start |
| **[INSTALL.md](INSTALL.md)** | Step-by-step install + troubleshooting flow |
| **[CHANGELOG.md](CHANGELOG.md)** | Round-by-round release notes |
| **[docs/architecture.md](docs/architecture.md)** | System diagram + module layering rules |
| **[docs/security-contract-innerhtml.md](docs/security-contract-innerhtml.md)** | HTML safety contract + 16-site audit log |
| **[docs/opencode-integration.md](docs/opencode-integration.md)** | OpenCodeAIService vs AIService contract |
| **[CONTRIBUTING via PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md)** | PR checklist |

## License & Credits

[MIT](LICENSE) — Copyright © 2026 xuemzhan.

- Built on top of the [wpsjs](https://www.npmjs.com/package/wpsjs) plugin framework.
- Markdown rendering by [marked](https://marked.js.org/).
- Diagrams by [Mermaid](https://mermaid.js.org/).
- Code highlighting by [highlight.js](https://highlightjs.org/).
- Image export by [html2canvas](https://html2canvas.hertzen.com/).

---

<div align="center">

If you find Kaiwu useful, consider giving it a ⭐ on GitHub.

</div>
