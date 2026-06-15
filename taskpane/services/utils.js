/**
 * KwUtils — 跨模块共享的纯函数工具集.
 *
 * 设计原则: 无外部依赖, 不读写 DOM/storage, 全部同步; 模块加载即就绪.
 * 历史项目中 _stripThinking / _cleanResult / _escapeHtml / _escapeAttr /
 * _formatTime / stripReasoningContent 等 5+ 份重复实现统一收敛到此.
 */
var KwUtils = {
    /**
     * 剥离模型返回的思考过程痕迹.
     * 处理四种格式:
     *   - 已闭合的 ```thinking ...``` 块
     *   - 未闭合的 ```thinking ... 行尾 (流式中)
     *   - 已闭合的 思考标签块
     *   - 未闭合的 思考标签 (流式中)
     *
     * 设计要点 (避免长文本重复正则):
     *   - 入参应尽量小 (已是 delta 增量), 不要拿全量文本调
     *   - 返回值已 trimStart, 方便上层拼接
     */
    stripThinking: function (text) {
        return String(text || '')
            .replace(/```thinking\b[\s\S]*?```/gi, '')
            .replace(/```thinking\b[\s\S]*$/gi, '')
            .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
            .replace(/<think\b[^>]*>[\s\S]*$/gi, '')
            .trimStart();
    },

    /**
     * 完整清洗: 剥离思考块 + 去掉首尾空白.
     * 用于最终展示 / 复制 / 插入文档场景 (而非流式拼接).
     */
    cleanResult: function (text) {
        return KwUtils.stripThinking(text).trim();
    },

    /**
     * 转义 HTML 文本 (用于 user-content 渲染前的安全处理).
     * 用 textContent 桥接, 避免正则误判 Unicode / 引号.
     */
    escapeHtml: function (str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str == null ? '' : String(str)));
        return div.innerHTML;
    },

    /**
     * 转义 HTML 属性值. 额外把换行转 &#10; 以便嵌入属性时仍可读.
     */
    escapeAttr: function (str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '&#10;');
    },

    /**
     * 简化版时间格式化:
     *   - 同日: hh:mm
     *   - 同年: M/d hh:mm
     *   - 跨年: yyyy/M/d
     * locale 固定 zh-CN, 与项目其它模块一致.
     */
    formatTime: function (ts) {
        var d = new Date(ts);
        if (isNaN(d.getTime())) return '';
        var now = new Date();
        var sameDay = d.toDateString() === now.toDateString();
        if (sameDay) {
            return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }
        var sameYear = d.getFullYear() === now.getFullYear();
        if (sameYear) {
            return (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
                d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }
        return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
    },

    /**
     * 简单短时间 (仅 hh:mm), 用于对话流内时间戳.
     */
    formatTimeShort: function (ts) {
        var d = new Date(ts);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    },

    /**
     * 防抖: 延迟执行, 期间重复调用会重置定时器.
     * 提供 flush() 立即触发 (用于组件销毁前的最后一次保存).
     */
    debounce: function (fn, wait) {
        var timer = null;
        var lastArgs = null;
        var debounced = function () {
            lastArgs = Array.prototype.slice.call(arguments);
            if (timer) clearTimeout(timer);
            timer = setTimeout(function () {
                timer = null;
                var args = lastArgs;
                lastArgs = null;
                fn.apply(null, args);
            }, wait);
        };
        debounced.flush = function () {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            if (lastArgs) {
                var args = lastArgs;
                lastArgs = null;
                fn.apply(null, args);
            }
        };
        debounced.cancel = function () {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            lastArgs = null;
        };
        return debounced;
    },

    /**
     * 节流: 固定间隔最多执行一次, 保留 trailing 调用.
     */
    throttle: function (fn, wait) {
        var lastCall = 0;
        var timer = null;
        var lastArgs = null;
        return function () {
            var now = Date.now();
            var remaining = wait - (now - lastCall);
            lastArgs = Array.prototype.slice.call(arguments);
            if (remaining <= 0) {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                lastCall = now;
                var args = lastArgs;
                lastArgs = null;
                fn.apply(null, args);
            } else if (!timer) {
                timer = setTimeout(function () {
                    lastCall = Date.now();
                    timer = null;
                    if (lastArgs) {
                        var args = lastArgs;
                        lastArgs = null;
                        fn.apply(null, args);
                    }
                }, remaining);
            }
        };
    },

    /**
     * 简单 requestAnimationFrame 合并器, 用于 resize / 滚动类高频事件.
     */
    rafSchedule: function (fn) {
        if (typeof fn !== 'function') return function () {};
        var scheduled = false;
        var lastArgs = null;
        return function () {
            lastArgs = Array.prototype.slice.call(arguments);
            if (scheduled) return;
            scheduled = true;
            var run = function () {
                scheduled = false;
                if (!lastArgs) return;
                var args = lastArgs;
                lastArgs = null;
                fn.apply(null, args);
            };
            if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
                window.requestAnimationFrame(run);
            } else {
                setTimeout(run, 16);
            }
        };
    },

    /**
     * 检测 DOM 节点是否已滚动到底部 (允许 32px 容差).
     */
    isAtBottom: function (el, tolerance) {
        if (!el) return true;
        var tol = tolerance == null ? 32 : tolerance;
        return el.scrollHeight - el.scrollTop - el.clientHeight <= tol;
    },

    /**
     * 把字符串复制到剪贴板; 优先 navigator.clipboard, 失败回退 execCommand.
     * navigator.clipboard 需要 https / file:// 等安全上下文, WPS CEF 中大多可用.
     */
    copyToClipboard: function (text) {
        return new Promise(function (resolve, reject) {
            var value = String(text == null ? '' : text);
            try {
                if (typeof navigator !== 'undefined' &&
                    navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                    navigator.clipboard.writeText(value).then(resolve, function () {
                        KwUtils._copyFallback(value) ? resolve() : reject(new Error('copy failed'));
                    });
                    return;
                }
            } catch (e) { /* fall through */ }
            if (KwUtils._copyFallback(value)) resolve();
            else reject(new Error('copy failed'));
        });
    },

    _copyFallback: function (text) {
        try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.top = '0';
            ta.style.left = '0';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            var ok = false;
            try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
            document.body.removeChild(ta);
            return ok;
        } catch (e) {
            return false;
        }
    },

    /**
     * 数字按千位逗号分隔, 用于 token 计数 / 字数显示.
     */
    formatNumber: function (n) {
        if (typeof n !== 'number' || !isFinite(n)) return '0';
        return n.toLocaleString('zh-CN');
    },

    /**
     * 粗略 token 估算: 中文 1 字 ≈ 1.5 token, 英文按 4 字符 ≈ 1 token.
     * 不完美但比单纯 length 准确, 用于输入框字数提示.
     */
    estimateTokens: function (text) {
        var s = String(text || '');
        if (!s) return 0;
        // 中文字符 (含 CJK 统一表意 + 全角标点) 算 1.5
        var cjk = (s.match(/[\u3000-\u9fff\uff00-\uffef]/g) || []).length;
        var other = s.length - cjk;
        return Math.ceil(cjk * 1.5 + other / 4);
    }
};

if (typeof window !== 'undefined') {
    window.KwUtils = KwUtils;
}
