/**
 * result-panel.js — 统一结果面板
 *
 * 负责把单条 / 最新的生成结果渲染到任意挂载点 (TaskPane 的 #resultContainer,
 * 或 Floating 的 #kwAnswer).
 *
 * ActionRunner.run() 仍然产出 ResultCard 数据结构 (id / sourceText / status),
 * 但渲染入口只有一个: ResultPanel.mount(card, mountEl).
 *
 * 浮动对话框与侧栏共用同一份实现: 传入不同的 mountEl 即可.
 */
var ResultPanel = {
    _activeCard: null,
    _activeMount: null,
    _activeStreaming: false,
    _streamingTimer: null,
    _abortController: null,
    // 通用 SVG 图标 (嵌入到按钮里)
    _icons: {
        insert: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M11 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8l3-3V3a1 1 0 0 0-1-1h-2zm-1 7H4V8h6v1zm0-3H4V5h6v1zm2 4l2-2v6H4v-2h7a1 1 0 0 0 1-1v-1z" fill="currentColor"/></svg>',
        copy: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="4" y="4" width="9" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2.5 11V3a1 1 0 0 1 1-1H11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
        clear: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3 4h10M6.5 4V2.5h3V4M5 4l.5 9a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1L11 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        replace: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3 8a5 5 0 0 1 8.5-3.5L13 6M3 8a5 5 0 0 0 8.5 3.5L13 10M13 3v3h-3M3 13v-3h3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        regenerate: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.5L13 6M13 2v4h-4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        abort: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor"/></svg>'
    },

    /**
     * 把卡片挂载到指定容器 (TaskPane: #resultContainer, Floating: #kwAnswer).
     */
    mount: function (card, mountEl, options) {
        options = options || {};
        if (!card || !mountEl) return;
        if (this._activeMount && this._activeMount !== mountEl) {
            this._activeMount.innerHTML = '';
        }
        this._activeCard = card;
        this._activeMount = mountEl;
        this._activeStreaming = !!options.streaming;
        this._render(options);
    },

    update: function (card, mountEl, options) {
        options = options || {};
        if (!card) return;
        if (mountEl) {
            this._activeCard = card;
            this._activeMount = mountEl;
        }
        this._activeStreaming = !!options.streaming;
        this._render(options);
    },

    /**
     * 注册/更新用于中断当前流式请求的 controller.
     */
    setAbortController: function (controller) {
        this._abortController = controller || null;
    },

    /**
     * 中断当前流式请求并把卡片标记为 error (用户主动取消).
     */
    abort: function () {
        if (this._abortController) {
            try { this._abortController.abort(); } catch (e) { /* ignore */ }
            this._abortController = null;
        }
        if (this._activeCard) {
            this._activeCard.status = 'error';
            this._activeCard.error = '已取消';
            if (typeof ResultCard !== 'undefined' && ResultCard.update) {
                ResultCard.update(this._activeCard.id, { status: 'error', error: '已取消' });
            }
            this._activeStreaming = false;
            this._render({});
        }
        if (typeof MessageRenderer !== 'undefined' && MessageRenderer._showToast) {
            MessageRenderer._showToast('已取消');
        }
    },

    unmount: function (mountEl) {
        if (mountEl && this._activeMount !== mountEl) return;
        if (this._streamingTimer) {
            clearTimeout(this._streamingTimer);
            this._streamingTimer = null;
        }
        if (this._abortController) {
            try { this._abortController.abort(); } catch (e) { /* ignore */ }
            this._abortController = null;
        }
        if (this._activeMount) {
            this._activeMount.innerHTML = '';
        }
        this._activeCard = null;
        this._activeMount = null;
        this._activeStreaming = false;
    },

    active: function () {
        return this._activeCard;
    },

    _render: function (options) {
        var self = this;
        if (this._streamingTimer) {
            clearTimeout(this._streamingTimer);
            this._streamingTimer = null;
        }
        var renderNow = function () {
            if (!self._activeCard || !self._activeMount) return;
            self._activeMount.innerHTML = self._renderCard(self._activeCard, options);
            self._postRender();
        };
        if (this._activeStreaming) {
            this._streamingTimer = setTimeout(renderNow, 60);
        } else {
            renderNow();
        }
    },

    _renderCard: function (card, options) {
        options = options || {};
        var statusText = {
            pending: '等待生成',
            streaming: '生成中',
            done: '已完成',
            error: '失败'
        }[card.status] || card.status;
        var cleaned = this._cleanResult(card.resultText || '');
        var contentHtml;
        if (card.status === 'error') {
            contentHtml = '<div class="result-error">' + this._escapeHtml(card.error || '生成失败') + '</div>';
        } else if (card.status === 'pending') {
            contentHtml = '<div class="result-loading">正在准备...</div>';
        } else if (card.status === 'streaming') {
            contentHtml = cleaned
                ? this._renderMarkdown(cleaned)
                : '<div class="result-loading"><span class="result-loading-dot"></span><span class="result-loading-dot"></span><span class="result-loading-dot"></span> 正在生成...</div>';
        } else if (card.status === 'done' && !cleaned) {
            contentHtml = '<div class="result-empty">生成内容为空</div>';
        } else {
            contentHtml = this._renderMarkdown(cleaned);
        }
        var canApply = card.status === 'done' && !!cleaned;
        var isStreaming = card.status === 'streaming';

        // 顶部操作栏: 重新生成 / 取消 (流式中) + 始终显示的 [清除] 按钮
        var headerActions = isStreaming
            ? '<button class="result-icon-btn" title="取消生成" onclick="ResultPanel.abort()">' + this._icons.abort + '</button>'
            : '<button class="result-icon-btn" title="重新生成" onclick="ResultPanel.regenerate()">' + this._icons.regenerate + '</button>';
        // 插入按钮: 在流式未完成时禁用, 但始终可见以提供快捷意图
        var insertDisabled = canApply ? '' : 'disabled';
        var headerHtml = options.showHeader !== false ? (
            '<div class="result-card-header">' +
            '  <div class="result-card-titles">' +
            '    <div class="result-title">' + this._escapeHtml(card.actionLabel) + '</div>' +
            '    <div class="result-meta">' + this._escapeHtml(this._sourceLabel(card)) + ' · ' + statusText + '</div>' +
            '  </div>' +
            '  <div class="result-header-actions">' +
            '    <button class="result-icon-btn result-icon-btn-primary" title="插入到文档" ' + insertDisabled + ' onclick="ResultPanel.insertAtCursor()">' + this._icons.insert + '</button>' +
            '    <button class="result-icon-btn" title="复制" ' + insertDisabled + ' onclick="ResultPanel.copy()">' + this._icons.copy + '</button>' +
            headerActions +
            '    <button class="result-icon-btn result-icon-btn-danger" title="清除此条" onclick="ResultPanel.clear()">' + this._icons.clear + '</button>' +
            '  </div>' +
            '</div>'
        ) : '';

        // 底部操作栏: 替换原文 + 插入文档 (主操作, 显眼按钮)
        return '' +
            '<section class="result-card" data-card-id="' + this._escapeAttr(card.id) + '">' +
            headerHtml +
            '  <div class="result-content markdown-body">' + contentHtml + '</div>' +
            '  <div class="result-actions">' +
            '    <button class="btn btn-primary btn-sm" ' + (canApply ? '' : 'disabled') + ' onclick="ResultPanel.replaceOriginal()">' + this._icons.replace + '<span>替换原文</span></button>' +
            '    <button class="btn btn-sm" ' + (canApply ? '' : 'disabled') + ' onclick="ResultPanel.insertAtCursor()">' + this._icons.insert + '<span>插入文档</span></button>' +
            '    <button class="btn btn-sm" ' + (canApply ? '' : 'disabled') + ' onclick="ResultPanel.copy()">' + this._icons.copy + '<span>复制</span></button>' +
            '    <span class="result-actions-spacer"></span>' +
            '    <button class="btn btn-sm btn-link" ' + (card.status ? '' : 'disabled') + ' onclick="ResultPanel.clear()">' + this._icons.clear + '<span>清除</span></button>' +
            '  </div>' +
            '</section>';
    },

    _sourceLabel: function (card) {
        if (card.sourceType === 'document') return '全文 ' + (card.sourceText || '').length + ' 字';
        if (card.sourceType === 'user') return '用户输入';
        return '选区 ' + (card.sourceText || '').length + ' 字';
    },

    _cleanResult: function (text) {
        return String(text || '')
            .replace(/```thinking\b[\s\S]*?```/gi, '')
            .replace(/```thinking\b[\s\S]*$/gi, '')
            .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
            .replace(/<think\b[^>]*>[\s\S]*$/gi, '')
            .trim();
    },

    _renderMarkdown: function (text) {
        if (typeof MessageRenderer !== 'undefined' && MessageRenderer._renderMarkdown) {
            return MessageRenderer._renderMarkdown(text);
        }
        return '<p>' + this._escapeHtml(text) + '</p>';
    },

    _postRender: function () {
        if (typeof ChatUI !== 'undefined' && ChatUI._postRender) {
            try { ChatUI._postRender(); } catch (e) { /* ignore */ }
        }
    },

    _escapeHtml: function (str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(String(str || '')));
        return div.innerHTML;
    },

    _escapeAttr: function (str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    // ============ 卡片操作 ============

    /**
     * 替换原文 (适用于基于选区生成的内容, 用 AI 结果替换原选区).
     */
    replaceOriginal: function () {
        if (!this._activeCard || !this._activeCard.resultText) return;
        var result = WriterAdapter.replaceSelection(
            this._cleanResult(this._activeCard.resultText),
            this._activeCard.sourceText
        );
        MessageRenderer._showToast(result.ok ? '已替换原文' : (result.reason || '替换失败'));
    },

    /**
     * 插入到光标位置: WPS Writer 文档光标处插入.
     * 优先尝试 insertAtCursor, 失败则回退到 clipboard 复制.
     */
    insertAtCursor: function () {
        if (!this._activeCard || !this._activeCard.resultText) return;
        var text = this._cleanResult(this._activeCard.resultText);
        if (typeof WriterAdapter === 'undefined' || !WriterAdapter.insertAtCursor) {
            this._copyFallback(text, 'WPS 未连接, 已复制到剪贴板');
            return;
        }
        var ok = WriterAdapter.insertAtCursor(text);
        if (ok) {
            MessageRenderer._showToast('已插入到文档');
        } else {
            // 回退: 复制到剪贴板
            this._copyFallback(text, 'WPS 不允许直接插入, 已复制到剪贴板');
        }
    },

    /**
     * 复制到剪贴板.
     */
    copy: function () {
        if (!this._activeCard || !this._activeCard.resultText) return;
        var text = this._cleanResult(this._activeCard.resultText);
        if (typeof MessageRenderer !== 'undefined' && MessageRenderer._copyToClipboard) {
            MessageRenderer._copyToClipboard(text);
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(text);
        }
        MessageRenderer._showToast('已复制');
    },

    _copyFallback: function (text, toast) {
        try {
            if (typeof MessageRenderer !== 'undefined' && MessageRenderer._copyToClipboard) {
                MessageRenderer._copyToClipboard(text);
            } else if (navigator.clipboard) {
                navigator.clipboard.writeText(text);
            }
        } catch (e) { /* ignore */ }
        MessageRenderer._showToast(toast || '已复制');
    },

    /**
     * 重新生成: 用相同的源文再次执行同一动作.
     */
    regenerate: function () {
        if (!this._activeCard) return;
        var card = this._activeCard;
        if (typeof ActionRunner === 'undefined') return;
        ActionRunner.run(card.actionId, { reuseInput: card.sourceText });
    },

    /**
     * 清除当前卡片:
     *   - 清空挂载点 DOM
     *   - 从 ResultCard._cards 中移除
     *   - 从 HistoryDrawer 移除 (如果存在)
     *   - 清空 _activeCard / _abortController
     *   - 触发 kwresult:cleared 事件, 让浮动对话框可关闭结果面板
     */
    clear: function () {
        var cardId = this._activeCard && this._activeCard.id;
        // 先中止未完成的流
        if (this._abortController) {
            try { this._abortController.abort(); } catch (e) { /* ignore */ }
            this._abortController = null;
        }
        // 从 HistoryDrawer 移除
        if (cardId && typeof HistoryDrawer !== 'undefined' && HistoryDrawer.remove) {
            HistoryDrawer.remove(cardId);
        }
        // 从 ResultCard 存储移除
        if (cardId && typeof ResultCard !== 'undefined' && ResultCard._cards) {
            delete ResultCard._cards[cardId];
            if (ResultCard._latestId === cardId) ResultCard._latestId = null;
        }
        // 清空挂载点
        if (this._activeMount) {
            this._activeMount.innerHTML = '';
        }
        this._activeCard = null;
        this._activeMount = null;
        this._activeStreaming = false;
        // 触发自定义事件, 让其他模块 (如 floating) 关闭结果面板
        try {
            if (typeof window !== 'undefined' && window.dispatchEvent) {
                window.dispatchEvent(new window.CustomEvent('kwresult:cleared', {
                    detail: { cardId: cardId }
                }));
            }
        } catch (e) { /* ignore */ }
        if (typeof MessageRenderer !== 'undefined' && MessageRenderer._showToast) {
            MessageRenderer._showToast('已清除');
        }
    },

    /**
     * 关闭 (保留历史, 仅隐藏当前结果). 兼容旧调用.
     */
    requestClose: function () {
        this.clear();
    }
};
