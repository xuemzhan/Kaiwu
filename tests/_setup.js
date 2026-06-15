/**
 * tests/_setup.js — 测试环境设置
 *
 * 提供基于 jsdom 的浏览器环境, 用于在 Node 中加载和测试 WPS 加载项脚本.
 * 所有 taskpane 服务和组件脚本都是通过 <script> 标签在浏览器中加载的
 * (没有模块系统, var 声明直接进入全局). 本设置使用 jsdom 模拟浏览器,
 * 并通过 new window.Function(code) 在 jsdom 上下文执行每个脚本.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');

function makeEnv(html) {
    const dom = new JSDOM(html || '<!DOCTYPE html><html><body></body></html>', {
        runScripts: 'outside-only',
        pretendToBeVisual: true,
        url: 'http://127.0.0.1:3889/taskpane/index.html'
    });
    const window = dom.window;

    if (!window.navigator.clipboard) {
        Object.defineProperty(window.navigator, 'clipboard', {
            value: { writeText: () => Promise.resolve(), readText: () => Promise.resolve('') },
            configurable: true
        });
    }

    // In-memory localStorage
    const store = {};
    const storage = {
        getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
        setItem(k, v) { store[String(k)] = String(v); },
        removeItem(k) { delete store[k]; },
        clear() { for (const k of Object.keys(store)) delete store[k]; },
        key(i) { return Object.keys(store)[i] || null; },
        get length() { return Object.keys(store).length; }
    };
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });

    // WPS Application 默认 mock (测试可覆盖)
    const pluginStore = {};
    const taskPanes = {};
    let nextPaneId = 1;
    const defaultApp = {
        _storage: pluginStore,
        _listeners: {},
        ActiveDocument: null,
        ActiveWorkbook: null,
        ActivePresentation: null,
        Selection: null,
        Enum: { msoCTPDockPositionRight: 2, msoCTPDockPositionLeft: 0 },
        Clipboard: { SetText: function () {} },
        PluginStorage: {
            getItem(k) { return Object.prototype.hasOwnProperty.call(pluginStore, k) ? pluginStore[k] : null; },
            setItem(k, v) { pluginStore[String(k)] = String(v); },
            removeItem(k) { delete pluginStore[k]; }
        },
        CreateTaskPane: function (url) {
            const id = 'tp_' + (nextPaneId++);
            const pane = {
                ID: id,
                Visible: false,
                _url: url,
                get DockPosition() { return pane._dp; },
                set DockPosition(v) { pane._dp = v; },
                get Width() { return pane._w; },
                set Width(v) { pane._w = v; }
            };
            taskPanes[id] = pane;
            return pane;
        },
        GetTaskPane: function (id) { return taskPanes[id] || null; },
        ShowDialog: function () { return true; },
        ApiEvent: {
            AddApiEventListener: function (name, fn) {
                (defaultApp._listeners[name] = defaultApp._listeners[name] || []).push(fn);
            },
            fire: function (name, data) {
                (defaultApp._listeners[name] || []).forEach(fn => { try { fn(data); } catch (e) { /* ignore */ } });
            }
        }
    };
    window.Application = defaultApp;

    // fetch 默认抛出, 测试可覆盖
    window.fetch = () => Promise.reject(new Error('fetch not mocked'));

    return {
        dom,
        window,
        store,
        pluginStore,
        application: defaultApp,
        // ctx is set after the first loadScripts call; tests can use it to
        // inspect script-local globals (e.g. _wakeWordTimer) that aren't
        // re-copied to window on every state change.
        get ctx() { return lastCtx; }
    };
}

let lastCtx = null;

/**
 * Load one or more .js files into the jsdom window context.
 * Uses vm.runInContext so `var X = ...` declarations become properties
 * of the window (matching browser script-tag behaviour). The window
 * is also accessible as `this`, `window`, `self`, and `globalThis`.
 */
function loadScripts(window, paths) {
    const list = Array.isArray(paths) ? paths : [paths];
    // Use a SINGLE vm context for all scripts so var declarations
    // across scripts share the same scope (matching browser behaviour
    // where <script> tags accumulate globals on the same window).
    const ctx = createScriptContext(window);
    const vm = require('vm');
    vm.createContext(ctx);
    const prefix = 'var window = this.window; var self = this.window; var globalThis = this.window;\n';
    for (const p of list) {
        const abs = path.isAbsolute(p) ? p : path.join(ROOT, p);
        const code = fs.readFileSync(abs, 'utf8');
        vm.runInContext(prefix + code, ctx);
    }
    copyCtxToWindow(ctx, window);
    lastCtx = ctx;
}

function loadScriptText(window, code) {
    const ctx = createScriptContext(window);
    const vm = require('vm');
    vm.createContext(ctx);
    const prefix = 'var window = this.window; var self = this.window; var globalThis = this.window;\n';
    vm.runInContext(prefix + code, ctx);
    copyCtxToWindow(ctx, window);
    lastCtx = ctx;
}

function createScriptContext(window) {
    // Reserved: things that have a value in the ctx below (e.g. window,
    // document, fetch) OR are WPS-specific and only set on the jsdom
    // window through the Application mock. We DO want marked/hljs/mermaid
    // copied from window to ctx so scripts can use the mock libraries.
    const reserved = new Set([
        'window', 'self', 'globalThis', 'document', 'localStorage', 'navigator',
        'fetch', 'XMLHttpRequest', 'setTimeout', 'clearTimeout',
        'setInterval', 'clearInterval', 'console', 'Application', 'PluginStorage',
        'ApiEvent', 'Clipboard', 'Enum', 'Aborted',
        'ActiveWorkbook', 'ActiveDocument', 'ActivePresentation'
    ]);
    const ctx = {
        window,
        document: window.document,
        localStorage: window.localStorage,
        navigator: window.navigator,
        fetch: window.fetch,
        setTimeout, clearTimeout, setInterval, clearInterval,
        console: window.console,
        TextDecoder: window.TextDecoder || globalThis.TextDecoder,
        TextEncoder: window.TextEncoder || globalThis.TextEncoder,
        AbortController: window.AbortController || globalThis.AbortController,
        ReadableStream: window.ReadableStream || globalThis.ReadableStream,
        Application: window.Application
    };
    for (const key of Object.keys(window)) {
        if (!(key in ctx) && !reserved.has(key)) {
            try { ctx[key] = window[key]; } catch (e) { /* ignore */ }
        }
    }
    return ctx;
}

function copyCtxToWindow(ctx, window) {
    // Same reserved set as createScriptContext.
    const reserved = new Set([
        'window', 'self', 'globalThis', 'document', 'localStorage', 'navigator',
        'fetch', 'XMLHttpRequest', 'setTimeout', 'clearTimeout',
        'setInterval', 'clearInterval', 'console', 'Application', 'PluginStorage',
        'ApiEvent', 'Clipboard', 'Enum', 'Aborted',
        'ActiveWorkbook', 'ActiveDocument', 'ActivePresentation'
    ]);
    for (const key of Object.keys(ctx)) {
        if (!reserved.has(key) && !window.hasOwnProperty(key)) {
            try { window[key] = ctx[key]; } catch (e) { /* ignore */ }
        }
    }
}

/** Stub marked, hljs, mermaid, html2canvas (loaded as vendor scripts). */
function mockVendorLibs(window) {
    const escapeHtml = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    window.marked = {
        setOptions: () => {},
        Renderer: function () {
            this.code = (code, lang) => '<pre><code class="lang-' + (lang || '') + '">' + escapeHtml(code) + '</code></pre>';
            this.image = (href, title, text) => '<img src="' + href + '" alt="' + text + '" title="' + (title || '') + '">';
            this.heading = (text) => '<h2>' + text + '</h2>';
            this.paragraph = (text) => '<p>' + text + '</p>';
            this.link = (href, title, text) => '<a href="' + href + '">' + text + '</a>';
        },
        parse: (text) => {
            let html = String(text || '');
            // basic markdown: code blocks, headers, paragraphs
            html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (m, lang, code) =>
                '<pre><code class="lang-' + (lang || '') + '">' + escapeHtml(code) + '</code></pre>');
            html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
            html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
            html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
            html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, href) =>
                '<img src="' + href + '" alt="' + alt + '">');
            html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
            html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
            // Wrap non-block content in <p>. Note: real marked does NOT escape
            // HTML in text content; we follow that to ensure Security.sanitizeHtml
            // is the only line of defense (matching production behavior).
            html = html.split(/\n\n+/).map(p => /^<(h\d|pre|ul|ol|img|table|blockquote)/.test(p.trim()) ? p : '<p>' + p + '</p>').join('\n');
            return html;
        }
    };
    window.hljs = {
        configure: () => {},
        highlight: (code, opts) => ({ value: '<span class="hl">' + escapeHtml(code) + '</span>' }),
        highlightAuto: (code) => ({ value: '<span class="hl">' + escapeHtml(code) + '</span>' }),
        highlightElement: () => {},
        getLanguage: () => true
    };
    window.mermaid = { run: () => Promise.resolve() };
    window.html2canvas = () => Promise.resolve({});
}

function triggerDOMContentLoaded(window) {
    const ev = new window.Event('DOMContentLoaded', { bubbles: true });
    window.document.dispatchEvent(ev);
}

/** Apply a fake WPS Application setup. */
function setApplication(window, appOverrides) {
    Object.assign(window.Application, appOverrides);
}

module.exports = {
    ROOT,
    makeEnv,
    loadScripts,
    loadScriptText,
    mockVendorLibs,
    triggerDOMContentLoaded,
    setApplication
};
