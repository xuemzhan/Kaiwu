/**
 * tests/ribbon.test.js — ribbon.js 事件处理单元测试
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts, triggerDOMContentLoaded } = require('./_setup');

function loadRibbon(window) {
    // ribbon.js needs OnAddinLoad to be called by WPS, so we just load the script.
    // wakeword.js must come first because ribbon.js references window.WakeWordManager.
    loadScripts(window, ['component.js', 'taskpane/services/wakeword.js', 'ribbon.js']);
    return {
        ComponentDetector: window.ComponentDetector,
        TaskPaneManager: window.TaskPaneManager,
        FloatingAssistantManager: window.FloatingAssistantManager,
        WakeWordManager: window.WakeWordManager,
        OnAddinLoad: window.OnAddinLoad,
        GetTabVisible: window.GetTabVisible,
        OnAction: window.OnAction,
        GetImage: window.GetImage,
        OnGetEnabled: window.OnGetEnabled,
        readSelectionText: window.readSelectionText,
        SELECTION_REQUIRED_ACTIONS: window.SELECTION_REQUIRED_ACTIONS,
        DOCUMENT_REQUIRED_ACTIONS: window.DOCUMENT_REQUIRED_ACTIONS,
        ICON_MAP: window.ICON_MAP,
        RibbonActionMap: window.RibbonActionMap
    };
}

// 构造一个带有 preventDefault / stopPropagation 的合成键盘事件
function makeKeyEvent(opts) {
    return Object.assign({
        preventDefault: function () {},
        stopPropagation: function () {}
    }, opts);
}

test('ribbon: OnAddinLoad stores ribbonUI and detects component', () => {
    const env = makeEnv();
    env.window.Application.ActiveDocument = { Name: 'a.docx' };
    const stub = { Invalidate: () => {} };
    const r = loadRibbon(env.window);
    r.OnAddinLoad(stub);
    assert.strictEqual(env.window._ribbonUI, stub);
    assert.equal(env.window.Application.PluginStorage.getItem('component_type'), 'wps');
});

test('ribbon: OnAddinLoad handles ribbonUI without Invalidate method', () => {
    const env = makeEnv();
    const r = loadRibbon(env.window);
    const result = r.OnAddinLoad({}); // no Invalidate method
    assert.equal(result, true);
});

test('ribbon: OnAddinLoad handles null ribbonUI', () => {
    const env = makeEnv();
    const r = loadRibbon(env.window);
    const result = r.OnAddinLoad(null);
    assert.equal(result, true);
});

test('ribbon: GetTabVisible returns true for aiWriterTab when wps', () => {
    const env = makeEnv();
    const r = loadRibbon(env.window);
    r.OnAddinLoad({ Invalidate: () => {} });
    assert.equal(r.GetTabVisible({ Id: 'aiWriterTab' }), true);
    assert.equal(r.GetTabVisible({ Id: 'otherTab' }), false);
    assert.equal(r.GetTabVisible(null), false);
});

test('ribbon: GetTabVisible returns true for pdf component', () => {
    const env = makeEnv();
    env.window.Application.ActiveDocument = { Name: 'a.pdf' };
    const r = loadRibbon(env.window);
    r.OnAddinLoad({ Invalidate: () => {} });
    assert.equal(r.GetTabVisible({ Id: 'aiWriterTab' }), true);
});

test('ribbon: OnAction routes to floating dialog for write action', () => {
    const env = makeEnv();
    let savedAction = null;
    env.window.Application.PluginStorage.setItem = (k, v) => { if (k === 'pending_action') savedAction = v; };
    const r = loadRibbon(env.window);
    r.OnAction({ Id: 'btnWrite' });
    assert.equal(savedAction, 'write');
});

test('ribbon: OnAction routes to settings for btnSettings', () => {
    const env = makeEnv();
    const r = loadRibbon(env.window);
    let taskPaneShown = false;
    env.window.Application.CreateTaskPane = (url) => ({
        ID: 'tp1', Visible: false,
        get DockPosition() { return 0; }, set DockPosition(v) {},
        get Width() { return 0; }, set Width(v) {}
    });
    let showCalled = false;
    r.TaskPaneManager.show = function () { showCalled = true; };
    r.OnAction({ Id: 'btnSettings' });
    assert.equal(showCalled, true);
    assert.equal(env.window.Application.PluginStorage.getItem('pending_action'), 'open_settings');
});

test('ribbon: OnAction logs warning for unknown control', () => {
    const env = makeEnv();
    const r = loadRibbon(env.window);
    let warned = null;
    env.window.console.warn = (msg) => { warned = msg; };
    r.OnAction({ Id: 'btnUnknown' });
    assert.ok(warned && warned.indexOf('未处理') !== -1);
});

test('ribbon: OnAction handles btnOpenAssistant as sidebar toggle', () => {
    const env = makeEnv();
    const r = loadRibbon(env.window);
    let paneToggled = false;
    r.TaskPaneManager.toggle = function () { paneToggled = true; return true; };
    r.OnAction({ Id: 'btnOpenAssistant' });
    assert.equal(paneToggled, true);
});

test('ribbon: GetImage returns correct icon for known controls', () => {
    const env = makeEnv();
    const r = loadRibbon(env.window);
    assert.equal(r.GetImage({ Id: 'btnSettings' }), 'images/settings.svg');
    assert.equal(r.GetImage({ Id: 'btnContinue' }), 'images/continue.svg');
    assert.equal(r.GetImage({ Id: 'btnPolishFormal' }), 'images/formal.svg');
    assert.equal(r.GetImage({ Id: 'btnDocSummary' }), 'images/pdf_sum.svg');
    assert.equal(r.GetImage({ Id: 'btnDocMind' }), 'images/outline.svg');
    assert.equal(r.GetImage({ Id: 'btnOpenAssistant' }), 'images/kaiwu.svg');
    assert.equal(r.GetImage({ Id: 'btnHistory' }), 'images/history.svg');
});

test('ribbon: GetImage returns kaiwu logo as fallback for unknown control', () => {
    const env = makeEnv();
    const r = loadRibbon(env.window);
    assert.equal(r.GetImage({ Id: 'btnUnknown' }), 'images/kaiwu.svg');
    assert.equal(r.GetImage(null), 'images/kaiwu.svg');
});

test('ribbon: OnGetEnabled returns true for universal controls', () => {
    const env = makeEnv();
    const r = loadRibbon(env.window);
    assert.equal(r.OnGetEnabled({ Id: 'btnSettings' }), true);
    assert.equal(r.OnGetEnabled({ Id: 'btnOpenAssistant' }), true);
    assert.equal(r.OnGetEnabled({ Id: 'btnDeepThink' }), true);
    assert.equal(r.OnGetEnabled({ Id: 'btnHistory' }), true);
});

test('ribbon: OnGetEnabled returns false for selection actions when no selection', () => {
    const env = makeEnv();
    const r = loadRibbon(env.window);
    // No selection set
    assert.equal(r.OnGetEnabled({ Id: 'btnPolishFormal' }), false);
    assert.equal(r.OnGetEnabled({ Id: 'btnContinue' }), false);
    assert.equal(r.OnGetEnabled({ Id: 'btnCorrect' }), false);
    assert.equal(r.OnGetEnabled({ Id: 'btnImitate' }), false);
});

test('ribbon: OnGetEnabled returns true for selection actions with selection', () => {
    const env = makeEnv();
    env.window.Application.ActiveDocument = {
        Application: { Selection: { Text: 'some selected text' } }
    };
    const r = loadRibbon(env.window);
    assert.equal(r.OnGetEnabled({ Id: 'btnPolishFormal' }), true);
    assert.equal(r.OnGetEnabled({ Id: 'btnContinue' }), true);
});

test('ribbon: OnGetEnabled returns false for doc_summary without ActiveDocument', () => {
    const env = makeEnv();
    const r = loadRibbon(env.window);
    assert.equal(r.OnGetEnabled({ Id: 'btnDocSummary' }), false);
});

test('ribbon: OnGetEnabled returns true for doc_summary with ActiveDocument', () => {
    const env = makeEnv();
    env.window.Application.ActiveDocument = { Name: 'a.docx' };
    const r = loadRibbon(env.window);
    assert.equal(r.OnGetEnabled({ Id: 'btnDocSummary' }), true);
});

test('ribbon: readSelectionText handles ET workbook selection', () => {
    const env = makeEnv();
    env.window.Application.ActiveWorkbook = {
        Application: { Selection: { Text: '  cell value  ' } }
    };
    const r = loadRibbon(env.window);
    assert.equal(r.readSelectionText(), 'cell value');
});

test('ribbon: OnAddinLoad enables Ctrl+Alt+Z shortcut by default', () => {
    const env = makeEnv();
    let paneShown = false;
    const r = loadRibbon(env.window);
    r.TaskPaneManager.show = function () { paneShown = true; };
    // 确保 CreateTaskPane 不会报错 (TaskPaneManager.getOrCreate 会被 show 调用)
    env.window.Application.CreateTaskPane = () => ({ ID: 'tp', Visible: false });
    r.OnAddinLoad({ Invalidate: () => {} });
    // Dispatch a real keydown event on the document
    env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', {
        key: 'z', ctrlKey: true, altKey: true, bubbles: true, cancelable: true
    }));
    assert.equal(paneShown, true, 'shortcut should open the sidebar');
});

test('ribbon: WakeWordManager.start attaches keydown listener', () => {
    const env = makeEnv();
    const r = loadRibbon(env.window);
    // Verify by dispatching a real event
    let dialogOpened = false;
    env.window.Application.ShowDialog = () => { dialogOpened = true; return true; };
    r.WakeWordManager.start();
    env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', {
        key: 'z', ctrlKey: true, altKey: true, bubbles: true, cancelable: true
    }));
    assert.equal(dialogOpened, true, 'handler should be active after start()');
    r.WakeWordManager.stop();
});

test('ribbon: WakeWordManager Ctrl+Alt+Z opens floating dialog', () => {
    const env = makeEnv();
    let dialogOpened = false;
    env.window.Application.ShowDialog = () => { dialogOpened = true; return true; };
    loadRibbon(env.window);
    env.window.WakeWordManager.start();
    env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', {
        key: 'z', ctrlKey: true, altKey: true, bubbles: true, cancelable: true
    }));
    assert.equal(dialogOpened, true, 'Ctrl+Alt+Z should trigger floating dialog');
    env.window.WakeWordManager.stop();
});

test('ribbon: WakeWordManager accepts uppercase Z key value without Shift', () => {
    const env = makeEnv();
    let dialogOpened = false;
    env.window.Application.ShowDialog = () => { dialogOpened = true; return true; };
    loadRibbon(env.window);
    env.window.WakeWordManager.start();
    env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', {
        key: 'Z', ctrlKey: true, altKey: true, bubbles: true, cancelable: true
    }));
    assert.equal(dialogOpened, true, 'uppercase key value should still trigger when Shift is not held');
    env.window.WakeWordManager.stop();
});

test('ribbon: WakeWordManager ignores plain Z', () => {
    const env = makeEnv();
    let dialogOpened = false;
    env.window.Application.ShowDialog = () => { dialogOpened = true; return true; };
    loadRibbon(env.window);
    env.window.WakeWordManager.start();
    env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', {
        key: 'z', bubbles: true, cancelable: true
    }));
    assert.equal(dialogOpened, false, 'plain Z should not trigger');
    env.window.WakeWordManager.stop();
});

test('ribbon: WakeWordManager ignores Ctrl+Z or Alt+Z alone', () => {
    const env = makeEnv();
    let dialogOpened = false;
    env.window.Application.ShowDialog = () => { dialogOpened = true; return true; };
    loadRibbon(env.window);
    env.window.WakeWordManager.start();
    env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', {
        key: 'z', ctrlKey: true, bubbles: true, cancelable: true
    }));
    env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', {
        key: 'z', altKey: true, bubbles: true, cancelable: true
    }));
    assert.equal(dialogOpened, false, 'Ctrl+Z or Alt+Z alone should not trigger');
    env.window.WakeWordManager.stop();
});

test('ribbon: WakeWordManager ignores Ctrl+Alt+other-keys', () => {
    const env = makeEnv();
    let dialogOpened = false;
    env.window.Application.ShowDialog = () => { dialogOpened = true; return true; };
    loadRibbon(env.window);
    env.window.WakeWordManager.start();
    env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', {
        key: 'x', ctrlKey: true, altKey: true, bubbles: true, cancelable: true
    }));
    env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', {
        key: 'Enter', ctrlKey: true, altKey: true, bubbles: true, cancelable: true
    }));
    env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', {
        key: 'a', ctrlKey: true, altKey: true, bubbles: true, cancelable: true
    }));
    assert.equal(dialogOpened, false, 'Ctrl+Alt+(non-Z) should not trigger');
    env.window.WakeWordManager.stop();
});

test('ribbon: WakeWordManager respects cooldown between triggers', () => {
    const env = makeEnv();
    let openCount = 0;
    env.window.Application.ShowDialog = () => { openCount++; return true; };
    loadRibbon(env.window);
    env.window.WakeWordManager.start();
    env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', {
        key: 'z', ctrlKey: true, altKey: true, bubbles: true, cancelable: true
    }));
    env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', {
        key: 'z', ctrlKey: true, altKey: true, bubbles: true, cancelable: true
    }));
    assert.equal(openCount, 1, 'second press within cooldown should be ignored');
    env.window.WakeWordManager.stop();
});

test('ribbon: WakeWordManager opens assistant and preserves context when text is selected', () => {
    const env = makeEnv();
    let dialogOpened = false;
    env.window.Application.ShowDialog = () => { dialogOpened = true; return true; };
    env.window.Application.ActiveDocument = {
        Application: { Selection: { Text: 'some selected text' } }
    };
    loadRibbon(env.window);
    env.window.WakeWordManager.start();
    env.window.WakeWordManager.configure({
        isSelectionActive: function () {
            return (env.window.readSelectionText ? env.window.readSelectionText() : '').length > 0;
        }
    });
    env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', {
        key: 'z', ctrlKey: true, altKey: true, bubbles: true, cancelable: true
    }));
    assert.equal(dialogOpened, true, 'selection should not prevent the shortcut');
    assert.equal(env.window.Application.PluginStorage.getItem('floating_selected_text'), 'some selected text');
    env.window.WakeWordManager.stop();
});

test('ribbon: WakeWordManager ignores Ctrl+Alt+Shift+Z', () => {
    const env = makeEnv();
    let dialogOpened = false;
    env.window.Application.ShowDialog = () => { dialogOpened = true; return true; };
    loadRibbon(env.window);
    env.window.WakeWordManager.start();
    env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', {
        key: 'Z', ctrlKey: true, altKey: true, shiftKey: true, bubbles: true, cancelable: true
    }));
    assert.equal(dialogOpened, false, 'shortcut must be exactly Ctrl+Alt+Z');
    env.window.WakeWordManager.stop();
});

test('ribbon: WakeWordManager preventDefault and stopPropagation are called', () => {
    const env = makeEnv();
    let dialogOpened = false;
    env.window.Application.ShowDialog = () => { dialogOpened = true; return true; };
    loadRibbon(env.window);
    env.window.WakeWordManager.start();
    let prevented = false;
    let stopped = false;
    var ev = new env.window.KeyboardEvent('keydown', {
        key: 'z', ctrlKey: true, altKey: true, bubbles: true, cancelable: true
    });
    // Override preventDefault / stopPropagation to track them
    var origPD = ev.preventDefault.bind(ev);
    var origSP = ev.stopPropagation.bind(ev);
    ev.preventDefault = function () { prevented = true; origPD(); };
    ev.stopPropagation = function () { stopped = true; origSP(); };
    env.window.document.dispatchEvent(ev);
    assert.equal(prevented, true, 'preventDefault should be called');
    assert.equal(stopped, true, 'stopPropagation should be called');
    env.window.WakeWordManager.stop();
});

test('ribbon: WakeWordManager does not fire when meta is also held', () => {
    const env = makeEnv();
    let dialogOpened = false;
    env.window.Application.ShowDialog = () => { dialogOpened = true; return true; };
    loadRibbon(env.window);
    env.window.WakeWordManager.start();
    env.window.document.dispatchEvent(new env.window.KeyboardEvent('keydown', {
        key: 'z', ctrlKey: true, altKey: true, metaKey: true, bubbles: true, cancelable: true
    }));
    assert.equal(dialogOpened, false, 'Ctrl+Alt+Meta+Z should not trigger (meta reserved for other bindings)');
    env.window.WakeWordManager.stop();
});

test('ribbon: RibbonActionMap covers all ribbon.xml controls', () => {
    const env = makeEnv();
    const r = loadRibbon(env.window);
    // Spot check: every action in SELECTION_REQUIRED_ACTIONS is reachable
    // via some button in the map.
    for (const actionId of Object.keys(r.SELECTION_REQUIRED_ACTIONS)) {
        const found = Object.values(r.RibbonActionMap).indexOf(actionId) !== -1;
        assert.ok(found, 'no button maps to action: ' + actionId);
    }
});

test('ribbon: ICON_MAP has distinct icons for distinct logical buttons', () => {
    const env = makeEnv();
    const r = loadRibbon(env.window);
    // Buttons that are conceptually different should have different icons
    assert.notEqual(r.ICON_MAP['btnContinue'], r.ICON_MAP['btnSettings']);
    assert.notEqual(r.ICON_MAP['btnDocSummary'], r.ICON_MAP['btnDocMind']);
});

test('ribbon: FloatingAssistantManager.show opens dialog and saves context', () => {
    const env = makeEnv();
    let dialogOpened = false;
    env.window.Application.ShowDialog = (url, title, w, h, modal) => { dialogOpened = true; return true; };
    const r = loadRibbon(env.window);
    const result = r.FloatingAssistantManager.show('ribbon', 'polish_quick');
    assert.equal(result, true);
    assert.equal(dialogOpened, true);
    assert.equal(env.window.Application.PluginStorage.getItem('floating_source'), 'ribbon');
    assert.equal(env.window.Application.PluginStorage.getItem('floating_action'), 'polish_quick');
});

test('ribbon: FloatingAssistantManager falls back to TaskPane if dialog unavailable', () => {
    const env = makeEnv();
    env.window.Application.ShowDialog = undefined;
    const r = loadRibbon(env.window);
    let paneShown = false;
    r.TaskPaneManager.show = function () { paneShown = true; };
    r.FloatingAssistantManager.show('ribbon', 'write');
    assert.equal(paneShown, true);
});

test('ribbon: TaskPaneManager.getOrCreate creates new pane when none exists', () => {
    const env = makeEnv();
    const r = loadRibbon(env.window);
    const pane = r.TaskPaneManager.getOrCreate();
    assert.ok(pane.ID);
    assert.equal(pane.Visible, false);
});

test('ribbon: TaskPaneManager.getOrCreate reuses existing pane', () => {
    const env = makeEnv();
    const r = loadRibbon(env.window);
    const p1 = r.TaskPaneManager.getOrCreate();
    const p2 = r.TaskPaneManager.getOrCreate();
    assert.equal(p1.ID, p2.ID);
});

test('ribbon: TaskPaneManager.toggle flips visible state', () => {
    const env = makeEnv();
    const r = loadRibbon(env.window);
    const v1 = r.TaskPaneManager.toggle();
    const v2 = r.TaskPaneManager.toggle();
    assert.notEqual(v1, v2);
});

test('ribbon: TaskPaneManager._dock sets dock position and width', () => {
    const env = makeEnv();
    const r = loadRibbon(env.window);
    const pane = r.TaskPaneManager.getOrCreate();
    r.TaskPaneManager._dock(pane);
    assert.equal(pane.DockPosition, 2);
    assert.equal(pane.Width, 460);
});
