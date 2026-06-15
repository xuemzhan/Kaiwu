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
 *   WakeWordManager.onTrigger(function () { ... });  // 多监听器注册
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
    var _triggerHandlers = [];  // 多个 onTrigger 监听器, 都执行

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
        // 依次调用所有注册的 handler, 异常不会中断后续.
        for (var i = 0; i < _triggerHandlers.length; i++) {
            try { _triggerHandlers[i](); } catch (err) { /* ignore */ }
        }
        // 兼容: 若没注册任何 handler, 退化到默认的 FloatingAssistantManager.show
        if (_triggerHandlers.length === 0
            && window.FloatingAssistantManager
            && typeof window.FloatingAssistantManager.show === 'function') {
            try { window.FloatingAssistantManager.show('shortcut', ''); } catch (err) { /* ignore */ }
        }
    }

    var WakeWordManager = {
        COOLDOWN: COOLDOWN,
        ACCEPT_KEYS: ACCEPT_KEYS,
        configure: function (opts) {
            // 向后兼容: configure({ onTrigger }) 等价于 onTrigger(handler)
            opts = opts || {};
            if (typeof opts.isSelectionActive === 'function') {
                _isSelectionActive = opts.isSelectionActive;
            }
            if (typeof opts.onTrigger === 'function') {
                WakeWordManager.onTrigger(opts.onTrigger);
            }
        },
        onTrigger: function (fn) {
            if (typeof fn === 'function') {
                // 去重: 同一函数不重复注册
                if (_triggerHandlers.indexOf(fn) === -1) {
                    _triggerHandlers.push(fn);
                }
            }
        },
        offTrigger: function (fn) {
            var idx = _triggerHandlers.indexOf(fn);
            if (idx !== -1) _triggerHandlers.splice(idx, 1);
        },
        _clearTriggers: function () { _triggerHandlers.length = 0; },
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
