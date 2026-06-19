/**
 * KwMarkdown — 集中化 Markdown 渲染.
 *
 * 解决原 message.js 中的若干性能/正确性问题:
 *   1. 每次 _renderMarkdown 都 new Renderer + marked.setOptions (污染全局, 重复)
 *   2. marked.parse 与 KwSecurity.sanitizeHtml 每次都新建 <template>
 *   3. 渲染结果无缓存, 流式期间反复解析同一段文本
 *
 * 关键设计:
 *   - Renderer 单例: 模块加载时建一次, 通过 marked.parse(text, { renderer }) 注入
 *   - sanitize template 单例: 复用同一 <template> 节点
 *   - 提供 cache / invalidate 接口, 上层 (ChatUI) 可按消息 ID 缓存最终 HTML
 *   - 流式阶段推荐只 render 部分 markdown (或在 streaming flag 下走简化路径)
 */
var KwMarkdown = (function () {
    var _templateEl = null;
    var _renderer = null;
    var _markedAvailable = function () { return typeof window !== 'undefined' && typeof window.marked !== 'undefined'; };
    var _kwSecurityAvailable = function () { return typeof window !== 'undefined' && typeof window.KwSecurity !== 'undefined'; };

    function getTemplate() {
        if (_templateEl && _templateEl.ownerDocument === document) return _templateEl;
        _templateEl = document.createElement('template');
        return _templateEl;
    }

    function buildRenderer() {
        var renderer;
        try {
            // marked 4.x: marked.Renderer 是构造函数
            // marked 5.x+: 使用 marked.Renderer 或 options.renderer
            renderer = window.marked.Renderer ? new window.marked.Renderer() : null;
        } catch (e) {
            console.warn('[KwMarkdown] Renderer constructor failed:', e);
            renderer = null;
        }
        if (!renderer) return null;

        // marked 4.x: renderer.code 接收 (code, language) 两个参数
        // marked 5.x+: 接收对象参数 { text, lang, escaped }
        var originalCode = renderer.code;
        renderer.code = function (codeOrObj, language) {
            // 兼容 marked 5.x+ 的对象参数格式
            var code, lang;
            if (typeof codeOrObj === 'object' && codeOrObj !== null) {
                code = codeOrObj.text || '';
                lang = codeOrObj.lang || '';
            } else {
                code = codeOrObj || '';
                lang = language || '';
            }

            if (lang === 'mermaid') {
                return '<div class="mermaid">' + KwUtils.escapeHtml(code) + '</div>';
            }
            if (lang === 'svg' || lang === 'html') {
                return '<div class="raw-preview"><pre><code>' + KwUtils.escapeHtml(code) + '</code></pre></div>';
            }
            var highlighted = code;
            try {
                if (lang && window.hljs && window.hljs.getLanguage && window.hljs.getLanguage(lang)) {
                    highlighted = window.hljs.highlight(code, { language: lang }).value;
                } else if (window.hljs && window.hljs.highlightAuto) {
                    highlighted = window.hljs.highlightAuto(code).value;
                } else {
                    highlighted = KwUtils.escapeHtml(code);
                }
            } catch (e) {
                highlighted = KwUtils.escapeHtml(code);
            }
            var safeLanguage = KwUtils.escapeAttr(lang || 'text');
            return '<div class="code-block-wrapper">' +
                '<div class="code-block-header"><span class="code-lang">' + safeLanguage + '</span>' +
                '<button class="copy-code-btn" data-kw-action="copy-code">复制</button></div>' +
                '<pre><code class="hljs ' + safeLanguage + '">' + highlighted + '</code></pre>' +
                '</div>';
        };

        // marked 4.x: renderer.image 接收 (href, title, text)
        // marked 5.x+: 接收对象参数 { href, title, text }
        var originalImage = renderer.image;
        renderer.image = function (hrefOrObj, title, text) {
            // 兼容 marked 5.x+ 的对象参数格式
            var href, titleText, altText;
            if (typeof hrefOrObj === 'object' && hrefOrObj !== null) {
                href = hrefOrObj.href || '';
                titleText = hrefOrObj.title || '';
                altText = hrefOrObj.text || '';
            } else {
                href = hrefOrObj || '';
                titleText = title || '';
                altText = text || '';
            }

            var safeHref = _kwSecurityAvailable() ? window.KwSecurity.sanitizeUrl(href) : '';
            if (!safeHref) return '';
            return '<img src="' + KwUtils.escapeAttr(safeHref) + '" alt="' + KwUtils.escapeAttr(altText) + '" title="' + KwUtils.escapeAttr(titleText) + '">';
        };

        return renderer;
    }

    function getRenderer() {
        if (!_renderer && _markedAvailable() && window.marked.Renderer) {
            _renderer = buildRenderer();
        }
        return _renderer;
    }

    /**
     * 渲染 Markdown → 安全 HTML.
     *   - 缺少 marked 时回退到 <p>text</p>
     *   - sanitize 失败时仍返回原 HTML (上层一般也会做安全检查)
     *   - options.streaming = true 时, 关闭代码高亮等重型操作, 走轻量路径
     */
    function render(text, options) {
        options = options || {};
        var raw = String(text || '');
        if (!raw) return '';

        if (!_markedAvailable()) {
            return '<p>' + KwUtils.escapeHtml(raw) + '</p>';
        }

        var html;
        try {
            var renderer = getRenderer();
            if (renderer) {
                html = window.marked.parse(raw, { renderer: renderer, gfm: true, breaks: true });
            } else {
                html = window.marked.parse(raw);
            }
        } catch (e) {
            console.error('[KwMarkdown] parse failed:', e);
            return '<p>' + KwUtils.escapeHtml(raw) + '</p>';
        }

        if (_kwSecurityAvailable()) {
            try {
                var tpl = getTemplate();
                tpl.innerHTML = html || '';
                KwSecurity._sanitizeNode(tpl.content);
                html = tpl.innerHTML;
            } catch (e) {
                console.warn('[KwMarkdown] sanitize failed, returning escaped text:', e);
                return '<p>' + KwUtils.escapeHtml(raw) + '</p>';
            }
        }

        return html;
    }

    /**
     * 高亮 + Mermaid 渲染, 幂等 (data-hl / data-mmd 标记跳过).
     * 调用方传入容器, 我们只处理未标记的节点.
     */
    function postRender(rootEl) {
        if (!rootEl) return;

        if (typeof window !== 'undefined' && window.hljs && typeof window.hljs.highlightElement === 'function') {
            var blocks = rootEl.querySelectorAll
                ? rootEl.querySelectorAll('.markdown-body pre code:not([data-hl])')
                : [];
            for (var i = 0; i < blocks.length; i++) {
                try {
                    window.hljs.highlightElement(blocks[i]);
                    blocks[i].setAttribute('data-hl', '1');
                } catch (e) { /* ignore */ }
            }
        }

        if (typeof window !== 'undefined' && window.mermaid && typeof window.mermaid.run === 'function') {
            var nodes = rootEl.querySelectorAll
                ? rootEl.querySelectorAll('.mermaid:not([data-mmd])')
                : [];
            if (nodes.length > 0) {
                nodes.forEach(function (n) { n.setAttribute('data-mmd', 'pending'); });
                try {
                    var promise = window.mermaid.run({ nodes: nodes });
                    if (promise && typeof promise.then === 'function') {
                        promise.then(function () {
                            nodes.forEach(function (n) { n.setAttribute('data-mmd', '1'); });
                        }, function () {
                            nodes.forEach(function (n) { n.setAttribute('data-mmd', 'error'); });
                        });
                    } else {
                        nodes.forEach(function (n) { n.setAttribute('data-mmd', '1'); });
                    }
                } catch (e) { /* ignore */ }
            }
        }
    }

    /**
     * 仅高亮代码块 (无 mermaid). 用于流式阶段最后一帧渲染.
     */
    function highlightCodeOnly(rootEl) {
        if (!rootEl || typeof window === 'undefined' || !window.hljs) return;
        var blocks = rootEl.querySelectorAll
            ? rootEl.querySelectorAll('.markdown-body pre code:not([data-hl])')
            : [];
        for (var i = 0; i < blocks.length; i++) {
            try {
                window.hljs.highlightElement(blocks[i]);
                blocks[i].setAttribute('data-hl', '1');
            } catch (e) { /* ignore */ }
        }
    }

    return {
        render: render,
        postRender: postRender,
        highlightCodeOnly: highlightCodeOnly,
        // 测试 / 调试用
        _reset: function () {
            _renderer = null;
            _templateEl = null;
        }
    };
})();

if (typeof window !== 'undefined') {
    window.KwMarkdown = KwMarkdown;
}
