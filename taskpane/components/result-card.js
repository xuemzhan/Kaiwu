/**
 * Result cards for scenario-based Writer actions.
 */
var ResultCard = {
    _cards: {},
    _latestId: null,

    create: function (options) {
        var id = 'result_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        var card = {
            id: id,
            actionId: options.actionId,
            actionLabel: options.actionLabel,
            sourceType: options.sourceType || 'selection',
            sourceText: options.sourceText || '',
            resultText: '',
            status: 'pending',
            error: '',
            createdAt: Date.now()
        };
        this._cards[id] = card;
        this._latestId = id;
        this.render();
        return card;
    },

    update: function (id, patch) {
        if (!this._cards[id]) return;
        Object.assign(this._cards[id], patch || {});
        this.render();
    },

    append: function (id, fullContent) {
        this.update(id, { resultText: fullContent || '', status: 'streaming' });
    },

    complete: function (id, text) {
        this.update(id, { resultText: text || '', status: 'done' });
    },

    fail: function (id, error) {
        this.update(id, { status: 'error', error: error || '生成失败' });
    },

    latest: function () {
        return this._cards[this._latestId] || null;
    },

    render: function () {
        var container = document.getElementById('resultContainer');
        if (!container) return;
        var cards = [];
        for (var id in this._cards) {
            if (this._cards.hasOwnProperty(id)) cards.push(this._cards[id]);
        }
        cards.sort(function (a, b) { return b.createdAt - a.createdAt; });
        container.innerHTML = cards.map(this._renderCard.bind(this)).join('');
        this._postRender();
    },

    _renderCard: function (card) {
        var statusText = {
            pending: '等待生成',
            streaming: '生成中',
            done: '已完成',
            error: '失败'
        }[card.status] || card.status;
        var content = card.error
            ? '<div class="result-error">' + this._escapeHtml(card.error) + '</div>'
            : this._renderMarkdown(card.resultText || '正在准备...');
        var canApply = card.status === 'done' && !!card.resultText;
        return '' +
            '<section class="result-card" data-card-id="' + this._escapeAttr(card.id) + '">' +
            '  <div class="result-card-header">' +
            '    <div>' +
            '      <div class="result-title">' + this._escapeHtml(card.actionLabel) + '</div>' +
            '      <div class="result-meta">' + this._escapeHtml(this._sourceLabel(card)) + ' · ' + statusText + '</div>' +
            '    </div>' +
            '    <button class="result-icon-btn" title="重新生成" onclick="ResultCard.regenerate(&quot;' + this._escapeAttr(card.id) + '&quot;)">↻</button>' +
            '  </div>' +
            '  <div class="result-content markdown-body">' + content + '</div>' +
            '  <div class="result-actions">' +
            '    <button class="btn btn-primary btn-sm" ' + (canApply ? '' : 'disabled') + ' onclick="ResultCard.replaceOriginal(&quot;' + this._escapeAttr(card.id) + '&quot;)">替换原文</button>' +
            '    <button class="btn btn-sm" ' + (canApply ? '' : 'disabled') + ' onclick="ResultCard.insertAtCursor(&quot;' + this._escapeAttr(card.id) + '&quot;)">插入光标</button>' +
            '    <button class="btn btn-sm" ' + (canApply ? '' : 'disabled') + ' onclick="ResultCard.copy(&quot;' + this._escapeAttr(card.id) + '&quot;)">复制</button>' +
            '  </div>' +
            '</section>';
    },

    replaceOriginal: function (id) {
        var card = this._cards[id];
        if (!card || !card.resultText) return;
        var result = WriterAdapter.replaceSelection(this._cleanResult(card.resultText), card.sourceText);
        MessageRenderer._showToast(result.ok ? '已替换原文' : result.reason);
    },

    insertAtCursor: function (id) {
        var card = this._cards[id];
        if (!card || !card.resultText) return;
        var ok = WriterAdapter.insertAtCursor(this._cleanResult(card.resultText));
        MessageRenderer._showToast(ok ? '已插入光标位置' : '插入失败，请手动复制');
    },

    copy: function (id) {
        var card = this._cards[id];
        if (!card || !card.resultText) return;
        MessageRenderer._copyToClipboard(this._cleanResult(card.resultText));
        MessageRenderer._showToast('已复制');
    },

    regenerate: function (id) {
        var card = this._cards[id];
        if (!card || typeof ActionRunner === 'undefined') return;
        ActionRunner.run(card.actionId, { reuseInput: card.sourceText });
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
            ChatUI._postRender();
        }
    },

    _escapeHtml: function (str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(String(str || '')));
        return div.innerHTML;
    },

    _escapeAttr: function (str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
};
