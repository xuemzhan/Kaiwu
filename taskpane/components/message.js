/**
 * message.js — 消息渲染组件
 * 支持 Markdown、代码高亮、Mermaid 图表
 *
 * 重构后:
 *   - Markdown 渲染委托给 KwMarkdown (单例 renderer + sanitize)
 *   - HTML / 时间 转义委托给 KwUtils
 *   - Toast 通知委托给 KwToast
 */
var MessageRenderer = {
    // 渲染单条消息 HTML
    render: function (msg, isStreaming) {
        var role = msg.role;
        var content = msg.content || '';
        var timestamp = msg.timestamp ? KwUtils.formatTimeShort(msg.timestamp) : '';

        if (role === 'user') {
            return this._renderUserMessage(content, timestamp);
        } else {
            return this._renderAssistantMessage(content, timestamp, isStreaming);
        }
    },

    _renderUserMessage: function (content, timestamp) {
        var escaped = KwUtils.escapeHtml(content);
        var formatted = escaped.replace(/\n/g, '<br>');
        return '' +
            '<div class="message message-user" data-mid="' + this._idFor(content) + '">' +
            '  <div class="message-label">你</div>' +
            '  <div class="message-bubble user-bubble">' +
            '    <div class="message-text">' + formatted + '</div>' +
            '  </div>' +
            '  <div class="message-time">' + timestamp + '</div>' +
            '</div>';
    },

    _renderAssistantMessage: function (content, timestamp, isStreaming) {
        var mainContent = KwUtils.cleanResult(content);
        var streamingClass = isStreaming ? ' streaming' : '';
        var caretClass = isStreaming ? ' kw-streaming-caret' : '';
        var renderedContent = this._renderMarkdown(mainContent);
        var self = this;

        return '' +
            '<div class="message message-assistant' + streamingClass + '" data-mid="' + this._idFor(content) + '">' +
            '  <div class="message-label">AI</div>' +
            '  <div class="message-bubble assistant-bubble markdown-body' + caretClass + '" data-content="' + KwUtils.escapeAttr(mainContent) + '">' +
            '    ' + renderedContent +
            '    <div class="message-actions">' +
            '      <button class="msg-action-btn" data-kw-action="copy-message" title="复制">📋</button>' +
            '      <button class="msg-action-btn" data-kw-action="insert-message" title="插入文档">📄</button>' +
            '    </div>' +
            '  </div>' +
            '  <div class="message-time">' + timestamp + '</div>' +
            '</div>';
    },

    /**
     * 仅更新已存在的助手消息节点, 不重建整条对话.
     * 流式阶段走这里; 配合 ChatUI 流式节流, 避免每帧重建 DOM.
     */
    updateStreamingMessage: function (container, msg) {
        if (!container) return null;
        var nodes = container.querySelectorAll('.message-assistant.streaming');
        var node = nodes.length > 0 ? nodes[nodes.length - 1] : null;
        if (!node) return null;
        var bubble = node.querySelector('.message-bubble');
        if (!bubble) return null;
        var mainContent = KwUtils.cleanResult(msg.content || '');
        bubble.setAttribute('data-content', mainContent);

        // 替换 .message-content 子节点 (该子节点由 _renderAssistantMessage 创建,
        // 我们把它提取出来以方便局部更新; 旧实现直接 innerHTML 整体覆盖)
        var body = bubble.querySelector('.message-body-content');
        if (!body) {
            // 第一次更新: 提取已有渲染内容, 包一层 div
            var existing = bubble.innerHTML;
            var headerActions = '';
            var actionsMatch = existing.match(/<div class="message-actions">[\s\S]*?<\/div>/);
            if (actionsMatch) {
                headerActions = actionsMatch[0];
                bubble.innerHTML = existing.replace(actionsMatch[0], '');
            }
            var wrap = document.createElement('div');
            wrap.className = 'message-body-content';
            wrap.innerHTML = self._renderMarkdown(mainContent);
            bubble.insertBefore(wrap, bubble.firstChild);
            if (headerActions) bubble.insertAdjacentHTML('beforeend', headerActions);
            body = wrap;
        } else {
            body.innerHTML = self._renderMarkdown(mainContent);
        }

        // 代码高亮 (幂等)
        if (typeof KwMarkdown !== 'undefined') {
            KwMarkdown.highlightCodeOnly(body);
        }

        return node;
    },

    /** 兼容旧的 _renderMarkdown (KwMarkdown 不可用时的回退). */
    _legacyRenderMarkdown: function (text) {
        if (!text) return '';
        try {
            if (typeof marked === 'undefined') return '<p>' + KwUtils.escapeHtml(text) + '</p>';
            var renderer = new marked.Renderer();
            renderer.code = function (code, language) {
                if (language === 'mermaid') {
                    return '<div class="mermaid">' + KwUtils.escapeHtml(code) + '</div>';
                }
                var highlighted = code;
                try {
                    if (language && hljs.getLanguage(language)) {
                        highlighted = hljs.highlight(code, { language: language }).value;
                    } else {
                        highlighted = hljs.highlightAuto(code).value;
                    }
                } catch (e) {
                    highlighted = KwUtils.escapeHtml(code);
                }
                var safeLanguage = KwUtils.escapeAttr(language || 'text');
                return '<div class="code-block-wrapper">' +
                    '<div class="code-block-header"><span class="code-lang">' + safeLanguage + '</span>' +
                    '<button class="copy-code-btn" data-kw-action="copy-code">复制</button></div>' +
                    '<pre><code class="hljs ' + safeLanguage + '">' + highlighted + '</code></pre>' +
                    '</div>';
            };
            marked.setOptions({ renderer: renderer });
            var html = marked.parse(text);
            return (typeof KwSecurity !== 'undefined') ? KwSecurity.sanitizeHtml(html) : html;
        } catch (e) {
            console.error('[Message] Markdown 渲染失败:', e);
            return '<p>' + KwUtils.escapeHtml(text) + '</p>';
        }
    },

    /**
     * 公共 Markdown 渲染入口. 优先 KwMarkdown; 回退到 _legacyRenderMarkdown.
     * 保留此名以兼容历史测试 / 调用方.
     */
    _renderMarkdown: function (text) {
        if (typeof KwMarkdown !== 'undefined') {
            return KwMarkdown.render(text);
        }
        return this._legacyRenderMarkdown(text);
    },

    /**
     * 把消息渲染为完整的 HTML 字符串 (用于全量渲染场景, 比如首次加载).
     * ChatUI 渲染历史消息时使用, 流式阶段改用 updateStreamingMessage.
     */
    renderMessage: function (msg, isStreaming) {
        return this.render(msg, isStreaming);
    },

    // 复制消息内容 (供全局事件代理调用)
    copyMessage: function (btn) {
        var bubble = btn.closest('.message-bubble');
        if (!bubble) return;
        var content = bubble.getAttribute('data-content') || bubble.textContent;
        KwUtils.copyToClipboard(content).then(function () {
            KwToast.show('已复制');
        }, function () {
            KwToast.error('复制失败');
        });
    },

    // 插入消息到文档
    insertMessage: function (btn) {
        var bubble = btn.closest('.message-bubble');
        if (!bubble) return;
        var content = bubble.getAttribute('data-content') || bubble.textContent;

        if (window.__WPS_BRIDGE__ && window.__WPS_BRIDGE__.insertContent) {
            var ok = window.__WPS_BRIDGE__.insertContent(content);
            var componentType = window.__WPS_BRIDGE__.getComponentType();
            var componentLabel = (typeof ComponentDetector !== 'undefined')
                ? ComponentDetector.getLabel(componentType)
                : '文档';
            KwToast.show(ok ? ('已插入' + componentLabel) : '插入失败，请手动复制');
        } else {
            KwToast.error('无法插入文档：WPS 连接未就绪');
        }
    },

    // 复制代码块
    copyCode: function (btn) {
        var codeBlock = btn.closest('.code-block-wrapper');
        if (!codeBlock) return;
        var code = codeBlock.querySelector('code');
        if (!code) return;
        KwUtils.copyToClipboard(code.textContent).then(function () {
            btn.textContent = '✅ 已复制';
            setTimeout(function () { btn.textContent = '复制'; }, 2000);
        });
    },

    _showToast: function (msg) {
        KwToast.show(msg);
    },

    _copyToClipboard: function (text) {
        return KwUtils.copyToClipboard(text);
    },

    _idFor: function (content) {
        // 给消息一个稳定但简短的 id, 用于 DOM diff 时定位节点.
        // 用 length + 简单 hash, 避免把原始内容嵌入 DOM (可能含隐私 / 控制字符).
        var s = String(content || '');
        var hash = 0;
        for (var i = 0; i < s.length; i++) {
            hash = ((hash << 5) - hash) + s.charCodeAt(i);
            hash |= 0;
        }
        return 'm' + s.length + '_' + (hash >>> 0).toString(36);
    }
};
