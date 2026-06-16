/**
 * KwToast — 全局唯一的 toast 通知服务.
 *
 * 解决的问题:
 *   1. 原来各组件 (MessageRenderer / ChatUI / floating.js) 各自实现 toast 逻辑,
 *      且都使用 `document.getElementById('toast') || createElement(...)` 模式,
 *      每次都先 query 再尝试懒创建.
 *   2. floating.js 实现把 toast 拼接到 body 但用不同 className, 行为不一致.
 *
 * 设计: 模块加载时直接创建一个静态 toast 节点, 上层只调 show(msg).
 *       支持按 channel 在 taskpane / floating 各自保留独立节点.
 */
var KwToast = (function () {
    function ensureEl(channel) {
        var id = 'kw-toast-' + (channel || 'default');
        var el = document.getElementById(id);
        if (el) return el;
        if (!document.body) return null;
        el = document.createElement('div');
        el.id = id;
        el.className = 'kw-toast';
        document.body.appendChild(el);
        return el;
    }

    function show(msg, channel, durationMs) {
        var el = ensureEl(channel);
        if (!el) return;
        el.textContent = String(msg == null ? '' : msg);
        el.className = 'kw-toast kw-toast-show';
        if (el._hideTimer) clearTimeout(el._hideTimer);
        var dur = typeof durationMs === 'number' && durationMs > 0 ? durationMs : 2000;
        el._hideTimer = setTimeout(function () {
            el.className = 'kw-toast';
        }, dur);
    }

    function error(msg, channel) {
        show(msg, channel, 3500);
    }

    return { show: show, error: error };
})();

if (typeof window !== 'undefined') {
    window.KwToast = KwToast;
}
