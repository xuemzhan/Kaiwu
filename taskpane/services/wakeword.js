/**
 * wakeword.js — 共享的 Ctrl+Alt+Z 唤起助手监听器
 *
 * WPS CEF 加载项的限制: keydown 事件仅在加载项页面获得焦点时触发.
 * 不同的 CEF 页面 (ribbon / taskpane / floating dialog) 各自加载此脚本,
 * 各自有独立冷却. 多个页面同时触发由 FloatingAssistantManager.show
 * 通过 PluginStorage 时间戳去重.
 *
 * 用法:
 *   WakeWordManager.configure({ isSelectionActive: function () { ... } });
 *   WakeWordManager.start();
 */
(function () {
    if (typeof window === 'undefined') return;

    var COOLDOWN = 1200;
    var ACCEPT_KEYS = ['z', 'Z'];

    var _installed = false;
    var _lastTriggerTime = 0;
    var _onKeyDown = null;
    var _isSelectionActive = function () { return false; };
    var _onTrigger = null;

    function getSelection() {
        try { return _isSelectionActive(); } catch (e) { return false; }
    }

    function onKeyDown(e) {
        if (!e || !e.ctrlKey || !e.altKey) return;
        if (e.shiftKey || e.metaKey) return;
        if (ACCEPT_KEYS.indexOf(String(e.key || '').toLowerCase()) === -1) return;
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
        var now = Date.now();
        if (now - _lastTriggerTime < COOLDOWN) return;
        _lastTriggerTime = now;
        // 注意: 即便有选区也允许触发, 让用户能把选中文本作为上下文传给助手.
        try {
            if (typeof _onTrigger === 'function') {
                _onTrigger();
            } else if (window.FloatingAssistantManager && typeof window.FloatingAssistantManager.show === 'function') {
                window.FloatingAssistantManager.show('shortcut', '');
            }
        } catch (err) { /* ignore */ }
    }

    var WakeWordManager = {
        COOLDOWN: COOLDOWN,
        ACCEPT_KEYS: ACCEPT_KEYS,
        configure: function (opts) {
            opts = opts || {};
            if (typeof opts.isSelectionActive === 'function') {
                _isSelectionActive = opts.isSelectionActive;
            }
            if (typeof opts.onTrigger === 'function') {
                _onTrigger = opts.onTrigger;
            }
        },
        start: function () {
            if (_installed) return;
            if (typeof document === 'undefined') return;
            _installed = true;
            _lastTriggerTime = 0;
            _onKeyDown = onKeyDown;
            document.addEventListener('keydown', _onKeyDown, true);
            if (typeof window !== 'undefined' && window !== document) {
                window.addEventListener('keydown', _onKeyDown, true);
            }
        },
        stop: function () {
            if (!_installed) return;
            if (typeof document !== 'undefined' && _onKeyDown) {
                document.removeEventListener('keydown', _onKeyDown, true);
            }
            if (typeof window !== 'undefined' && window !== document && _onKeyDown) {
                window.removeEventListener('keydown', _onKeyDown, true);
            }
            _installed = false;
        }
    };

    window.WakeWordManager = WakeWordManager;
})();
