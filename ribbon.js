/**
 * ribbon.js — WPS Ribbon event handlers for Kaiwu (开悟).
 *
 * Exposed globals (on window):
 *   - ComponentDetector (from component.js)
 *   - WPS_Enum          (msoCTPDockPosition* constants)
 *   - TaskPaneManager   (create/show/hide/dock the sidebar task pane)
 *   - FloatingAssistantManager (open the floating dialog)
 *   - WakeWordManager   (Ctrl + Alt + Z floating-assistant shortcut)
 *   - RibbonActionMap   (control-id → action-id lookup)
 *   - OnAddinLoad, GetTabVisible, OnAction, GetImage, OnGetEnabled
 */

var WPS_Enum = {
    msoCTPDockPositionLeft: 0,
    msoCTPDockPositionRight: 2
};

var _currentComponent = null;
var _wakeWordLockUntil = 0;
var _wakewordInited = false;

function _initWakeWord() {
    if (_wakewordInited) return;
    _wakewordInited = true;
    try {
        if (window.WakeWordManager && typeof window.WakeWordManager.configure === 'function') {
            // 自定义快捷键行为: Ctrl+Alt+Z 打开右边栏
            window.WakeWordManager.configure({
                isSelectionActive: function () { return readSelectionText().length > 0; },
                onTrigger: function () {
                    // 保存选区上下文后打开右边栏
                    FloatingAssistantManager._saveContext('shortcut', '');
                    TaskPaneManager.show();
                }
            });
            window.WakeWordManager.start();
        }
    } catch (e) { /* ignore */ }
}

function GetUrlPath() {
    var e = document.location.toString();
    return -1 !== (e = decodeURI(e)).indexOf('/') && (e = e.substring(0, e.lastIndexOf('/'))), e;
}

/** Read selected text safely. Returns '' if not in WPS or no selection. */
function readSelectionText() {
    try {
        var app = window.Application;
        if (!app) return '';
        var sel = app.Selection
            || (app.ActiveDocument && app.ActiveDocument.Application && app.ActiveDocument.Application.Selection)
            || (app.ActiveDocument && app.ActiveDocument.Selection)
            || (app.ActiveWorkbook && app.ActiveWorkbook.Application && app.ActiveWorkbook.Application.Selection)
            || (app.ActiveWorkbook && app.ActiveWorkbook.Selection);
        if (sel && sel.Text) return String(sel.Text).replace(/\r$/, '').trim();
    } catch (e) { /* ignore */ }
    return '';
}

function OnAddinLoad(ribbonUI) {
    try {
        window._ribbonUI = ribbonUI;
        if (typeof ComponentDetector !== 'undefined') {
            _currentComponent = ComponentDetector.detect();
            try {
                if (window.Application && window.Application.PluginStorage) {
                    window.Application.PluginStorage.setItem('component_type', _currentComponent);
                }
            } catch (e) { /* ignore */ }
        }
        try {
            if (ribbonUI && typeof ribbonUI.Invalidate === 'function') ribbonUI.Invalidate();
        } catch (e2) { /* ignore */ }
        _initWakeWord();
        return true;
    } catch (error) {
        console.error('[开悟] 初始化失败:', error);
        return false;
    }
}

function GetTabVisible(control) {
    if (!control) return false;
    var type = _currentComponent;
    if (!type && typeof ComponentDetector !== 'undefined') {
        type = ComponentDetector.detect();
        _currentComponent = type;
    }
    if (!type) type = 'wps';
    // The single registered tab is the Writer (开悟) tab. Visible when
    // WPS Writer or a PDF document opened in Writer is the host.
    return control.Id === 'aiWriterTab' && (type === 'wps' || type === 'unknown' || type === 'pdf');
}

var TaskPaneManager = {
    TASKPANE_URL: GetUrlPath() + '/taskpane/index.html',
    WIDTH: 460,
    // 用户手动调整后的宽度保存到 PluginStorage, 下次打开时沿用
    WIDTH_KEY: 'taskpane_user_width',

    getOrCreate: function () {
        var tsId = null;
        try {
            tsId = window.Application.PluginStorage.getItem('taskpane_id');
        } catch (e) { /* ignore */ }

        if (tsId) {
            try {
                var pane = window.Application.GetTaskPane(tsId);
                if (pane) return pane;
            } catch (e2) { /* create new */ }
        }

        var newPane = window.Application.CreateTaskPane(this.TASKPANE_URL);
        try {
            newPane.Visible = false;
        } catch (e4) { /* ignore */ }
        try {
            window.Application.PluginStorage.setItem('taskpane_id', newPane.ID);
        } catch (e3) { /* ignore */ }
        return newPane;
    },

    toggle: function () {
        var pane = this.getOrCreate();
        pane.Visible = !pane.Visible;
        if (pane.Visible) this._dock(pane);
        this._saveVisible(pane.Visible);
        return pane.Visible;
    },

    show: function () {
        var pane = this.getOrCreate();
        pane.Visible = true;
        this._dock(pane);
        this._saveVisible(true);
    },

    /**
     * 任务窗格靠右停靠.
     * 关键修复: 仅在 WPS 未分配宽度时 (新建 Pane) 写入默认宽度,
     * 之后用户手动调整的宽度会被 WPS 自动维护, 我们不再覆盖, 实现"尺寸记忆".
     */
    _dock: function (pane) {
        pane.DockPosition = window.Application.Enum
            ? window.Application.Enum.msoCTPDockPositionRight
            : WPS_Enum.msoCTPDockPositionRight;
        try {
            // 1. Pane 已有有效宽度 (WPS 已分配) → 不动
            if (pane.Width && pane.Width > 0) {
                // 顺手把当前宽度写回存储 (覆盖旧值), 防止退化
                this._saveUserWidth(pane.Width);
                return;
            }
            // 2. 没有有效宽度 → 尝试恢复上次保存的用户宽度
            var saved = this._loadUserWidth();
            pane.Width = saved || this.WIDTH;
        } catch (e) { /* ignore */ }
    },

    /**
     * 主动保存用户调整后的宽度 (由 floating-integration 或 taskpane 调用).
     * 也可被周期性心跳调用以记录最新宽度.
     */
    saveCurrentWidth: function (width) {
        this._saveUserWidth(width);
    },

    _saveUserWidth: function (width) {
        try {
            var w = parseInt(width, 10);
            if (!w || w < 200 || w > 2000) return;
            if (window.Application && window.Application.PluginStorage) {
                window.Application.PluginStorage.setItem(this.WIDTH_KEY, String(w));
            }
        } catch (e) { /* ignore */ }
    },

    _loadUserWidth: function () {
        try {
            if (window.Application && window.Application.PluginStorage) {
                var v = window.Application.PluginStorage.getItem(this.WIDTH_KEY);
                var w = parseInt(v, 10);
                if (w && w >= 200 && w <= 2000) return w;
            }
        } catch (e) { /* ignore */ }
        return null;
    },

    _saveVisible: function (visible) {
        try {
            window.Application.PluginStorage.setItem('taskpane_visible', visible ? '1' : '0');
        } catch (e) { /* ignore */ }
    }
};

var FloatingAssistantManager = {
    DIALOG_URL: GetUrlPath() + '/floating/index.html',
    // 默认尺寸: 与 WPS 原生 AI 助手一致
    // 高度 180 让 textarea 完整显示一行大字, 工具栏在底部
    // AI 指令菜单 / 结果区都以 position: fixed 浮在 WPS 文档上
    WIDTH: 720,
    HEIGHT: 180,
    WIDTH_KEY: 'floating_user_width',
    HEIGHT_KEY: 'floating_user_height',

    show: function (source, actionId) {
        try {
            // 防止快速重复打开 (例如 WakeWordManager 多页面实例同时触发)
            if (this._isDuplicateOpen()) {
                return true;
            }
            this._saveContext(source || 'manual', actionId || '');
            if (window.Application && typeof window.Application.ShowDialog === 'function') {
                // 优先使用用户上次调整的尺寸, 没有则用默认
                var savedW = this._loadSize(this.WIDTH_KEY, 320, 2560);
                var savedH = this._loadSize(this.HEIGHT_KEY, 120, 2560);
                var w = (savedW || this.WIDTH) * (window.devicePixelRatio || 1);
                var h = (savedH || this.HEIGHT) * (window.devicePixelRatio || 1);
                // 尝试用第 6 个参数 (options) 关闭 chrome (WPS 部分版本支持)
                try {
                    window.Application.ShowDialog(
                        this.DIALOG_URL,
                        '',
                        w, h,
                        false,
                        { frame: 'none', titleBarStyle: 'hidden', alwaysOnTop: true }
                    );
                } catch (optsErr) {
                    window.Application.ShowDialog(this.DIALOG_URL, '', w, h, false);
                }
                return true;
            }
            console.warn('[开悟] ShowDialog 不可用，回退到 TaskPane');
        } catch (e) {
            console.error('[开悟] 打开浮动助手失败:', e);
        }
        TaskPaneManager.show();
        return false;
    },

    _loadSize: function (key, min, max) {
        try {
            if (window.Application && window.Application.PluginStorage) {
                var v = parseInt(window.Application.PluginStorage.getItem(key) || '0', 10);
                if (v >= (min || 1) && v <= (max || 99999)) return v;
            }
        } catch (e) { /* ignore */ }
        return null;
    },

    // 通过 PluginStorage 时间戳防止快速重复打开 (1000ms 内视为重复)
    _isDuplicateOpen: function () {
        try {
            if (window.Application && window.Application.PluginStorage) {
                var last = parseInt(window.Application.PluginStorage.getItem('floating_opened_at') || '0', 10);
                var now = Date.now();
                if (last && (now - last) < 1000) {
                    return true;
                }
            }
        } catch (e) { /* ignore */ }
        return false;
    },

    _saveContext: function (source, actionId) {
        var context = collectWriterContext();
        try {
            window.Application.PluginStorage.setItem('floating_source', source);
            window.Application.PluginStorage.setItem('floating_action', actionId || '');
            window.Application.PluginStorage.setItem('floating_selected_text', context.selectedText || '');
            window.Application.PluginStorage.setItem('floating_anchor', JSON.stringify(context.anchor || {}));
            window.Application.PluginStorage.setItem('floating_opened_at', String(Date.now()));
            window.Application.PluginStorage.setItem('pending_action', actionId || '');
            window.Application.PluginStorage.setItem('pending_source', source || 'floating');
        } catch (e) { /* ignore */ }
    }
};

function collectWriterContext() {
    var result = { selectedText: '', anchor: {} };
    try {
        var app = window.Application;
        var sel = app && (app.Selection
            || (app.ActiveDocument && app.ActiveDocument.Application && app.ActiveDocument.Application.Selection)
            || (app.ActiveDocument && app.ActiveDocument.Selection));
        var range = sel && sel.Range;
        if (sel && sel.Text) result.selectedText = String(sel.Text).replace(/\r$/, '').trim();
        if (range) {
            result.anchor = {
                start: typeof range.Start === 'number' ? range.Start : null,
                end: typeof range.End === 'number' ? range.End : null
            };
        }
    } catch (e) { /* ignore */ }
    return result;
}

// WakeWordManager moved to taskpane/services/wakeword.js (shared between pages).
// _initWakeWord() is called in OnAddinLoad after wakeword.js is loaded.

/**
 * Ribbon control-id → action-id. Buttons NOT in this map are routed to a
 * generic fallback (write or doc_summary) — they always work.
 *
 * NOTE: the "imitate" action is registered in the taskpane ActionRegistry
 * and uses the *current selection* as the style sample.
 */
var RibbonActionMap = {
    btnWrite: 'write',
    btnContinue: 'continue_write',
    btnMenuContinue: 'continue_write',
    btnCoWrite: 'write',
    btnImitate: 'imitate',
    btnMenuPolish: 'polish_quick',
    btnMenuPolishQuick: 'polish_quick',
    menuPolish: 'polish_quick',
    btnPolishFormal: 'polish_formal',
    btnMenuPolishFormal: 'polish_formal',
    btnPolishGovernment: 'polish_government',
    btnMenuPolishGovernment: 'polish_government',
    btnMenuPolishOral: 'polish_quick',
    btnMenuPolishAcademic: 'polish_formal',
    btnCorrect: 'correct',
    btnMenuCorrect: 'correct',
    btnExpand: 'expand',
    btnMenuExpand: 'expand',
    btnShrink: 'shrink',
    btnMenuShrink: 'shrink',
    btnRewrite: 'rewrite',
    btnMenuRewrite: 'rewrite',
    btnFullPolish: 'polish_quick',
    btnDocQA: 'doc_summary',
    btnDocSummary: 'doc_summary',
    btnDocMind: 'doc_summary',
    btnTalkDoc: 'doc_summary',
    btnMenuAiLayout: 'doc_summary',
    btnAiLayout: 'doc_summary',
    btnMenuPaperLayout: 'doc_summary',
    btnPaperLayout: 'doc_summary',
    btnMenuGovLayout: 'doc_summary',
    btnGovLayout: 'doc_summary',
    btnDocToPpt: 'doc_summary',
    btnGenImage: 'write',
    btnSummaryImage: 'doc_summary',
    btnLegal: 'write',
    btnHistory: 'write',
    btnMenuHistory: 'write',
    btnDeepThink: 'write',
    btnMenuDeepThink: 'write'
};

function setPendingAction(actionId) {
    try {
        window.Application.PluginStorage.setItem('pending_action', actionId);
        window.Application.PluginStorage.setItem('pending_source', 'ribbon');
    } catch (e) {
        console.error('[开悟] 设置待处理动作失败:', e);
    }
}

function OnAction(control) {
    if (!control) return true;
    var eleId = control.Id;

    // 所有功能区按钮统一打开右边栏 (TaskPane)
    if (eleId === 'btnSettings') {
        setPendingAction('open_settings');
        TaskPaneManager.show();
        return true;
    }
    if (eleId === 'btnToggleSidebar' || eleId === 'btnOpenAssistant') {
        setPendingAction('');
        TaskPaneManager.toggle();
        return true;
    }

    var actionId = RibbonActionMap[eleId];
    if (actionId) {
        setPendingAction(actionId);
        TaskPaneManager.show();
        return true;
    }
    console.warn('[开悟] 未处理的按钮:', eleId);
    return true;
}

/**
 * Icon mapping. 按 ribbon.xml 分组, 每个按钮映射到唯一图标.
 * Fallback: kaiwu.svg (开悟 LOGO, 含 4 角星识别元素).
 *
 * 分组索引:
 *   - 创作:    kaiwu, write, continue, cowrite, imitate
 *   - 修改:    polish, formal, government, oral, academic, correct,
 *              expand, shrink, rewrite, full_polish
 *   - 文档:    doc_qa, doc_summary, doc_mind, talk_doc
 *   - 排版:    ai_layout, paper_layout, gov_layout, doc_to_ppt,
 *              gen_image, summary_image
 *   - 助手:    legal, deep_think
 *   - 系统:    history, settings, open_assistant
 */
var ICON_MAP = {
    // 品牌
    btnOpenAssistant: 'images/kaiwu.svg',
    menuImitate:      'images/imitate.svg',
    menuHelpMeChange: 'images/polish.svg',
    menuPolish:       'images/polish.svg',
    menuAiLayout:     'images/ai_layout.svg',
    menuMore:         'images/kaiwu.svg',

    // 创作
    btnWrite:         'images/assistant.svg',
    btnContinue:      'images/continue.svg',
    btnMenuContinue:  'images/continue.svg',
    btnCoWrite:       'images/cowrite.svg',
    btnImitate:       'images/imitate.svg',

    // 修改
    btnMenuPolish:        'images/polish.svg',
    btnMenuPolishQuick:   'images/polish.svg',
    btnMenuPolishFormal:  'images/formal.svg',
    btnMenuPolishGovernment: 'images/government.svg',
    btnMenuPolishOral:    'images/oral.svg',
    btnMenuPolishAcademic: 'images/academic.svg',
    btnPolishFormal:      'images/formal.svg',
    btnPolishGovernment:  'images/government.svg',
    btnFullPolish:        'images/full_polish.svg',

    btnCorrect:       'images/correct.svg',
    btnMenuCorrect:   'images/correct.svg',
    btnExpand:        'images/expand.svg',
    btnMenuExpand:    'images/expand.svg',
    btnShrink:        'images/shrink.svg',
    btnMenuShrink:    'images/shrink.svg',
    btnRewrite:       'images/rewrite.svg',
    btnMenuRewrite:   'images/rewrite.svg',

    // 文档
    btnDocQA:         'images/assistant.svg',
    btnDocSummary:    'images/summarize.svg',
    btnDocMind:       'images/outline.svg',
    btnTalkDoc:       'images/talk_doc.svg',

    // 排版
    btnMenuAiLayout:    'images/ai_layout.svg',
    btnMenuPaperLayout: 'images/paper_layout.svg',
    btnMenuGovLayout:   'images/gov_layout.svg',
    btnPaperLayout:     'images/paper_layout.svg',
    btnGovLayout:       'images/gov_layout.svg',
    btnDocToPpt:        'images/doc_to_ppt.svg',
    btnGenImage:        'images/gen_image.svg',
    btnSummaryImage:    'images/summary_image.svg',

    // 助手
    btnLegal:        'images/legal.svg',
    btnDeepThink:    'images/deep_think.svg',
    btnMenuDeepThink: 'images/deep_think.svg',

    // 系统
    btnHistory:      'images/history.svg',
    btnMenuHistory:  'images/history.svg',
    btnSettings:     'images/settings.svg'
};

function GetImage(control) {
    if (!control) return 'images/kaiwu.svg';
    return ICON_MAP[control.Id] || 'images/kaiwu.svg';
}

/**
 * Per-control enable/disable. Reads from WPS Application synchronously.
 *
 * Action rules:
 *   - Selection-only actions (polish_*, continue_write, correct, expand,
 *     shrink, rewrite, imitate) require a non-empty selection.
 *   - Document actions (doc_summary) require an active document.
 *   - User-input actions (write, history) are always enabled.
 *   - btnSettings / btnOpenAssistant / btnDeepThink are always enabled.
 *
 * The lookup is performed against RibbonActionMap first to know the
 * action's "kind". Buttons missing from the map are always enabled.
 */
var SELECTION_REQUIRED_ACTIONS = {
    'polish_quick': true, 'polish_formal': true, 'polish_government': true,
    'continue_write': true, 'correct': true, 'expand': true, 'shrink': true,
    'rewrite': true, 'imitate': true
};
var DOCUMENT_REQUIRED_ACTIONS = {
    'doc_summary': true
};

function OnGetEnabled(control) {
    if (!control) return true;
    var id = control.Id;
    // Universal controls
    if (id === 'btnSettings' || id === 'btnOpenAssistant' || id === 'btnDeepThink'
        || id === 'btnMenuDeepThink' || id === 'btnHistory' || id === 'btnMenuHistory') {
        return true;
    }
    var actionId = RibbonActionMap[id];
    if (!actionId) return true;

    if (SELECTION_REQUIRED_ACTIONS[actionId]) {
        return readSelectionText().length > 0;
    }
    if (DOCUMENT_REQUIRED_ACTIONS[actionId]) {
        try {
            return !!(window.Application && window.Application.ActiveDocument);
        } catch (e) { return false; }
    }
    return true;
}

// Expose for testability
if (typeof window !== 'undefined') {
    window.readSelectionText = readSelectionText;
    window.SELECTION_REQUIRED_ACTIONS = SELECTION_REQUIRED_ACTIONS;
    window.DOCUMENT_REQUIRED_ACTIONS = DOCUMENT_REQUIRED_ACTIONS;
}
