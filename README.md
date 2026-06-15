# Kaiwu · 开悟 — WPS AI Writing Assistant

<div align="center">

![Kaiwu logo](images/assistant.svg)

**An AI-powered writing add-in for WPS Office**

Chat · Polish · Continue · Translate · Summarize · Imitate · Cowrite · Mindmap

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![WPS](https://img.shields.io/badge/WPS-12.1.0.26375+-orange.svg)](https://www.wps.com/)
[![Node](https://img.shields.io/badge/Node-16%2B-green.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-lightgrey.svg)](#-system-requirements)

</div>

---

Kaiwu (开悟) is a community-maintained WPS Office add-in that brings a full-featured AI writing assistant into the WPS Writer sidebar. It is built on the [wpsjs](https://www.npmjs.com/package/wpsjs) plugin framework, runs entirely on your local machine, and talks to any OpenAI-compatible chat completion API (MiniMax, DeepSeek, OpenAI, SiliconFlow, etc.).

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

## Screenshots

> _Add screenshots to the `screenshots/` directory and reference them here._

```
screenshots/ribbon.png        # WPS ribbon showing the 开悟 tab
screenshots/sidebar.png       # The chat / action sidebar
screenshots/result.png        # AI output with markdown + mermaid
```

## System Requirements

| | |
|---|---|
| **WPS Office** | Personal Edition v12.1.0.26375+ or Professional Edition |
| **Operating System** | Windows 10 / Windows 11 |
| **Node.js** | v16+ (only required for development / packaging) |
| **Network** | Outbound HTTPS to your AI provider |

## Quick Start (End User)

> If you just want to use the plugin and don't care about the source, jump to the [Releases](https://github.com/xuemzhan/Kaiwu/releases) page and download the latest `kaiwu_x.y.z.7z`.

1. Download `kaiwu_x.y.z.7z` from [Releases](https://github.com/xuemzhan/Kaiwu/releases).
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
npm run build         # 7z archive
npm run build:exe     # 7z + self-extracting EXE (triggers Windows PCA warning)
npm run build:all     # both
```

Output goes to `wps-addon-publish/`:

```
wps-addon-publish/
├── install.bat              # ASCII-only installer (handles WPS authaddin cache)
├── uninstall.bat
├── verify.bat               # post-install diagnostic
├── publish.xml              # WPS plugin manifest
├── README-安装说明.md       # user-facing installation guide
├── kaiwu_1.0.0/             # plugin source (ASCII dir name, see notes below)
├── kaiwu_1.0.0.7z           # distributable archive
└── kaiwu_1.0.0_installer.exe (optional)
```

## Why is the directory named `kaiwu_1.0.0` and not `开悟_1.0.0`?

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
├── wpsjs.config.js            # Addon metadata (name, version, type)
├── package.json               # npm scripts + dependencies
├── .env.template              # Sample env file (copy to .env)
├── LICENSE                    # MIT
├── images/                    # All SVG icons (logo, per-action icons)
├── taskpane/                  # The sidebar UI
│   ├── index.html
│   ├── app.js                 # App entry, WPS bridge, lifecycle
│   ├── env.js                 # Auto-generated from .env (gitignored)
│   ├── services/              # config / chat / ai / security / wakeword
│   ├── components/            # message / chat / result / settings / history
│   ├── actions/               # action registry + prompt templates + runner
│   ├── adapters/              # WPS Writer adapter
│   ├── styles/
│   └── vendor/                # marked, mermaid, html2canvas, highlight.js
├── floating/                  # Floating dialog (separate from sidebar)
├── scripts/
│   ├── package.js             # Custom packager (replaces `wpsjs build` for release)
│   ├── init-env.js            # .env → taskpane/env.js
│   ├── copy-assets.js         # Dev-mode asset staging
│   └── sync-build.js          # Stage the wpsjs build output
└── tests/                     # Node --test suites (279 tests)
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

## Testing

```bash
npm test
```

Runs the Node test runner over `tests/*.test.js` (279 tests covering ribbon, components, services, integration).

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

## License

[MIT](LICENSE) — Copyright © 2026 xuemzhan.

## Credits

- Built on top of the [wpsjs](https://www.npmjs.com/package/wpsjs) plugin framework.
- Markdown rendering by [marked](https://marked.js.org/).
- Diagrams by [Mermaid](https://mermaid.js.org/).
- Code highlighting by [highlight.js](https://highlightjs.org/).
- Image export by [html2canvas](https://html2canvas.hertzen.com/).

---

<div align="center">

If you find Kaiwu useful, consider giving it a ⭐ on GitHub.

</div>
