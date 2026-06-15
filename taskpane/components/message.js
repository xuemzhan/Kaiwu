/**
 * message.js — 消息渲染组件
 * 支持 Markdown、代码高亮、Mermaid 图表
 */

var MessageRenderer = {
    // 渲染单条消息 HTML
    render: function (msg, isStreaming) {
        var role = msg.role;
        var content = msg.content || '';
        var timestamp = msg.timestamp ? this._formatTime(msg.timestamp) : '';

        if (role === 'user') {
            return this._renderUserMessage(content, timestamp);
        } else {
            return this._renderAssistantMessage(content, timestamp, isStreaming);
        }
    },

    _renderUserMessage: function (content, timestamp) {
        var escaped = this._escapeHtml(content);
        var formatted = escaped.replace(/\n/g, '<br>');
        return '' +
            '<div class="message message-user">' +
            '  <div class="message-label">你</div>' +
            '  <div class="message-bubble user-bubble">' +
            '    <div class="message-text">' + formatted + '</div>' +
            '  </div>' +
            '  <div class="message-time">' + timestamp + '</div>' +
            '</div>';
    },

    _renderAssistantMessage: function (content, timestamp, isStreaming) {
        var mainContent = this._stripThinking(content);

        var streamingClass = isStreaming ? ' streaming' : '';
        var renderedContent = this._renderMarkdown(mainContent);

        return '' +
            '<div class="message message-assistant' + streamingClass + '">' +
            '  <div class="message-label">AI</div>' +
            '  <div class="message-bubble assistant-bubble markdown-body" data-content="' + this._escapeAttr(mainContent) + '">' +
            '    ' + renderedContent +
            '    <div class="message-actions">' +
            '      <button class="msg-action-btn" onclick="MessageRenderer.copyMessage(this)" title="复制">📋</button>' +
            '      <button class="msg-action-btn" onclick="MessageRenderer.insertMessage(this)" title="插入文档">📄</button>' +
            '    </div>' +
            '  </div>' +
            '  <div class="message-time">' + timestamp + '</div>' +
            '</div>';
    },

    _stripThinking: function (content) {
        return String(content || '')
            .replace(/```thinking\b[\s\S]*?```/gi, '')
            .replace(/```thinking\b[\s\S]*$/gi, '')
            .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
            .replace(/<think\b[^>]*>[\s\S]*$/gi, '')
            .trim();
    },

    _renderMarkdown: function (text) {
        if (!text) return '';

        try {
            // 自定义 marked 渲染器
            var renderer = new marked.Renderer();

            renderer.code = function (code, language) {
                if (language === 'mermaid') {
                    return '<div class="mermaid">' + MessageRenderer._escapeHtml(code) + '</div>';
                }
                if (language === 'svg' || language === 'html') {
                    return '<div class="raw-preview"><pre><code>' + MessageRenderer._escapeHtml(code) + '</code></pre></div>';
                }
                var highlighted = code;
                try {
                    if (language && hljs.getLanguage(language)) {
                        highlighted = hljs.highlight(code, { language: language }).value;
                    } else {
                        highlighted = hljs.highlightAuto(code).value;
                    }
                } catch (e) {
                    highlighted = MessageRenderer._escapeHtml(code);
                }
                var safeLanguage = MessageRenderer._escapeAttr(language || 'text');
                return '<div class="code-block-wrapper">' +
                    '<div class="code-block-header"><span class="code-lang">' + safeLanguage + '</span>' +
                    '<button class="copy-code-btn" onclick="MessageRenderer.copyCode(this)">复制</button></div>' +
                    '<pre><code class="hljs ' + safeLanguage + '">' + highlighted + '</code></pre>' +
                    '</div>';
            };

            renderer.image = function (href, title, text) {
                var safeHref = (typeof KwSecurity !== 'undefined') ? KwSecurity.sanitizeUrl(href) : '';
                if (!safeHref) return '';
                return '<img src="' + MessageRenderer._escapeAttr(safeHref) + '" alt="' + MessageRenderer._escapeAttr(text || '') + '" title="' + MessageRenderer._escapeAttr(title || '') + '">';
            };

            marked.setOptions({ renderer: renderer });

            var html = marked.parse(text);
            return (typeof KwSecurity !== 'undefined') ? KwSecurity.sanitizeHtml(html) : html;
        } catch (e) {
            console.error('[Message] Markdown 渲染失败:', e);
            return '<p>' + this._escapeHtml(text) + '</p>';
        }
    },

    // 复制消息内容
    copyMessage: function (btn) {
        var bubble = btn.closest('.message-bubble');
        if (!bubble) return;
        var content = bubble.getAttribute('data-content') || bubble.textContent;
        this._copyToClipboard(content);
        this._showToast('已复制');
    },

    // 插入消息到文档
    insertMessage: function (btn) {
        var bubble = btn.closest('.message-bubble');
        if (!bubble) return;
        var content = bubble.getAttribute('data-content') || bubble.textContent;

        // 通过桥接器通知 ribbon.js 插入文本
        if (window.__WPS_BRIDGE__ && window.__WPS_BRIDGE__.insertText) {
            window.__WPS_BRIDGE__.insertText(content);
            this._showToast('已插入文档');
        } else {
            this._showToast('无法插入文档：WPS 连接未就绪');
        }
    },

    // 复制代码块
    copyCode: function (btn) {
        var codeBlock = btn.closest('.code-block-wrapper');
        if (!codeBlock) return;
        var code = codeBlock.querySelector('code');
        if (!code) return;
        this._copyToClipboard(code.textContent);
        btn.textContent = '✅ 已复制';
        var self = this;
        setTimeout(function () { btn.textContent = '复制'; }, 2000);
    },

    // 复制到剪贴板
    _copyToClipboard: function (text) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text);
            } else {
                var ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
        } catch (e) {
            console.error('[Message] 复制失败:', e);
        }
    },

    _showToast: function (msg) {
        var toast = document.getElementById('toast') || (function () {
            var el = document.createElement('div');
            el.id = 'toast';
            el.className = 'toast';
            document.body.appendChild(el);
            return el;
        })();
        toast.textContent = msg;
        toast.className = 'toast show';
        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(function () {
            toast.className = 'toast';
        }, 2000);
    },

    _escapeHtml: function (str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    },

    _escapeAttr: function (str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '&#10;');
    },

    _formatTime: function (ts) {
        var d = new Date(ts);
        return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
};
