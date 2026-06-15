/**
 * history-drawer.js — 历史记录抽屉
 *
 * 统一管理 ActionRunner 产生的所有 ResultCard, 替代了「TaskPane 内堆叠多张
 * 独立卡片」的旧行为:
 * - 每张完成的卡片都进入历史, 按源文 hash + 文档上下文分组
 * - 用户在抽屉内可重看 / 重新插入 / 复制 / 删除单条记录
 * - 持久化到 localStorage (key: wps_assistant_card_history)
 *
 * 抽屉打开后, TaskPane 内的最新结果区仍保留 (ResultPanel 渲染),
 * 形成「最新结果 + 历史可回溯」的双层结构.
 */
var HistoryDrawer = {
    _storageKey: 'wps_assistant_card_history',
    _maxItems: 100,
    _isOpen: false,
    _listeners: [],

    init: function () {
        this._bindHeaderButton();
        this._bindCloseEvents();
        this._render();
    },

    /**
     * 推入一张新卡片 (或更新已有卡片). 这里的卡片结构与 ResultCard 一致:
     *   { id, actionId, actionLabel, sourceType, sourceText, resultText, status, error, createdAt, documentRef }
     */
    push: function (card) {
        if (!card || !card.id) return;
        var items = this._load();
        var idx = this._indexOf(items, card.id);
        if (idx >= 0) {
            items[idx] = this._merge(items[idx], card);
        } else {
            items.unshift(this._normalize(card));
        }
        this._save(items);
        this._render();
        if (this._isOpen) this._animateIn();
    },

    remove: function (id) {
        var items = this._load().filter(function (it) { return it.id !== id; });
        this._save(items);
        this._render();
    },

    clear: function () {
        this._save([]);
        this._render();
    },

    open: function () {
        this._isOpen = true;
        var drawer = document.getElementById('historyDrawer');
        var backdrop = document.getElementById('historyBackdrop');
        if (drawer) {
            drawer.classList.add('is-open');
            drawer.setAttribute('aria-hidden', 'false');
        }
        if (backdrop) {
            backdrop.hidden = false;
            requestAnimationFrame(function () { backdrop.classList.add('is-open'); });
        }
        this._render();
    },

    close: function () {
        this._isOpen = false;
        var drawer = document.getElementById('historyDrawer');
        var backdrop = document.getElementById('historyBackdrop');
        if (drawer) {
            drawer.classList.remove('is-open');
            drawer.setAttribute('aria-hidden', 'true');
        }
        if (backdrop) {
            backdrop.classList.remove('is-open');
            setTimeout(function () { backdrop.hidden = true; }, 220);
        }
    },

    toggle: function () {
        if (this._isOpen) this.close();
        else this.open();
    },

    /**
     * 监听卡片更新 (ActionRunner 在生成过程中持续调用)
     *  - callback(card) 在 push 时触发
     */
    onUpdate: function (fn) {
        if (typeof fn === 'function') this._listeners.push(fn);
    },

    count: function () {
        return this._load().length;
    },

    // ============ 内部 ============

    _bindHeaderButton: function () {
        var self = this;
        var btn = document.getElementById('btnHistory');
        if (btn) btn.addEventListener('click', function () { self.toggle(); });
        var clearBtn = document.getElementById('btnHistoryClear');
        if (clearBtn) clearBtn.addEventListener('click', function () {
            if (self.count() === 0) return;
            if (window.confirm && window.confirm('确定清空全部历史记录？')) {
                self.clear();
            }
        });
    },

    _bindCloseEvents: function () {
        var self = this;
        var closeBtn = document.getElementById('btnCloseHistory');
        if (closeBtn) closeBtn.addEventListener('click', function () { self.close(); });
        var backdrop = document.getElementById('historyBackdrop');
        if (backdrop) backdrop.addEventListener('click', function () { self.close(); });
    },

    _animateIn: function () {
        // 占位: 当前版本用 CSS transition 处理, 保留扩展点
    },

    _normalize: function (card) {
        return {
            id: card.id,
            actionId: card.actionId || '',
            actionLabel: card.actionLabel || '未命名',
            sourceType: card.sourceType || 'selection',
            sourceText: card.sourceText || '',
            resultText: card.resultText || '',
            status: card.status || 'pending',
            error: card.error || '',
            documentRef: card.documentRef || this._currentDocumentRef(),
            createdAt: card.createdAt || Date.now(),
            updatedAt: Date.now()
        };
    },

    _merge: function (oldCard, newCard) {
        return Object.assign({}, oldCard, newCard, { updatedAt: Date.now() });
    },

    _currentDocumentRef: function () {
        try {
            if (typeof WriterAdapter !== 'undefined' && WriterAdapter.getDocumentInfo) {
                var info = WriterAdapter.getDocumentInfo();
                if (info && info.name) return info.name;
            }
        } catch (e) { /* ignore */ }
        return '';
    },

    _indexOf: function (items, id) {
        for (var i = 0; i < items.length; i++) {
            if (items[i].id === id) return i;
        }
        return -1;
    },

    _load: function () {
        try {
            var raw = localStorage.getItem(this._storageKey);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.warn('[HistoryDrawer] 加载失败:', e);
            return [];
        }
    },

    _save: function (items) {
        try {
            if (items.length > this._maxItems) {
                items = items.slice(0, this._maxItems);
            }
            localStorage.setItem(this._storageKey, JSON.stringify(items));
        } catch (e) {
            if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
                console.warn('[HistoryDrawer] localStorage 配额已满, 仅保留最近 20 条');
                try {
                    localStorage.setItem(this._storageKey, JSON.stringify(items.slice(0, 20)));
                } catch (e2) { /* ignore */ }
            } else {
                console.error('[HistoryDrawer] 保存失败:', e);
            }
        }
    },

    _render: function () {
        var list = document.getElementById('historyList');
        var meta = document.getElementById('historyMeta');
        if (!list) return;
        var items = this._load();
        if (meta) meta.textContent = '共 ' + items.length + ' 条';
        if (items.length === 0) {
            list.innerHTML = '<div class="history-entry-empty">还没有历史记录<br>尝试点击场景按钮生成内容</div>';
            return;
        }
        var groups = this._groupBySource(items);
        var html = '';
        for (var i = 0; i < groups.length; i++) {
            html += this._renderGroup(groups[i]);
        }
        list.innerHTML = html;
        this._bindEntryEvents();
    },

    _groupBySource: function (items) {
        var groups = [];
        var groupMap = {};
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var key = (it.documentRef || '未命名文档') + '|' + (it.sourceType || 'selection');
            if (!groupMap[key]) {
                groupMap[key] = {
                    documentRef: it.documentRef || '未命名文档',
                    sourceType: it.sourceType || 'selection',
                    items: []
                };
                groups.push(groupMap[key]);
            }
            groupMap[key].items.push(it);
        }
        return groups;
    },

    _renderGroup: function (group) {
        var countLabel = group.items.length + ' 条';
        var sourceLabel = group.sourceType === 'document' ? '全文' : (group.sourceType === 'user' ? '输入' : '选区');
        var html = '' +
            '<section class="history-group">' +
            '  <header class="history-group-header">' +
            '    <div class="history-group-title">' + this._escapeHtml(group.documentRef) + ' · ' + sourceLabel + '</div>' +
            '    <div class="history-group-count">' + countLabel + '</div>' +
            '  </header>';
        for (var i = 0; i < group.items.length; i++) {
            html += this._renderEntry(group.items[i]);
        }
        html += '</section>';
        return html;
    },

    _renderEntry: function (entry) {
        var statusClass = 'is-' + (entry.status || 'pending');
        var sourcePreview = this._preview((entry.sourceText || '').trim(), 80);
        var resultPreview = this._cleanResult(entry.resultText || '');
        if (entry.status === 'error') {
            resultPreview = entry.error || '生成失败';
        } else if (entry.status === 'pending' || entry.status === 'streaming') {
            resultPreview = '生成中...';
        } else {
            resultPreview = this._preview(resultPreview, 120);
        }
        return '' +
            '<article class="history-entry" data-entry-id="' + this._escapeAttr(entry.id) + '">' +
            '  <div class="history-entry-head">' +
            '    <div class="history-entry-label">' +
            '      <span>' + this._escapeHtml(entry.actionLabel) + '</span>' +
            '      <span class="history-entry-status ' + statusClass + '">' + this._statusText(entry.status) + '</span>' +
            '    </div>' +
            '    <div class="history-entry-time">' + this._formatTime(entry.updatedAt || entry.createdAt) + '</div>' +
            '  </div>' +
            (sourcePreview ? '<div class="history-entry-source">' + this._escapeHtml(sourcePreview) + '</div>' : '') +
            '  <div class="history-entry-preview">' + this._escapeHtml(resultPreview) + '</div>' +
            '  <div class="history-entry-actions">' +
            '    <button class="btn btn-sm" data-history-action="insert">插入光标</button>' +
            '    <button class="btn btn-sm" data-history-action="copy">复制</button>' +
            '    <button class="btn btn-sm" data-history-action="delete">删除</button>' +
            '  </div>' +
            '</article>';
    },

    _bindEntryEvents: function () {
        var self = this;
        var list = document.getElementById('historyList');
        if (!list) return;
        list.querySelectorAll('.history-entry').forEach(function (entry) {
            var id = entry.getAttribute('data-entry-id');
            entry.querySelectorAll('[data-history-action]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var act = btn.getAttribute('data-history-action');
                    if (act === 'insert') self._actionInsert(id);
                    else if (act === 'copy') self._actionCopy(id);
                    else if (act === 'delete') self.remove(id);
                });
            });
        });
    },

    _actionInsert: function (id) {
        var it = this._findById(id);
        if (!it) return;
        var text = this._cleanResult(it.resultText || '');
        if (!text) {
            MessageRenderer._showToast('该记录暂无结果');
            return;
        }
        var ok = WriterAdapter.insertAtCursor(text);
        MessageRenderer._showToast(ok ? '已插入' : '插入失败');
    },

    _actionCopy: function (id) {
        var it = this._findById(id);
        if (!it) return;
        var text = this._cleanResult(it.resultText || '');
        if (!text) {
            MessageRenderer._showToast('该记录暂无结果');
            return;
        }
        MessageRenderer._copyToClipboard(text);
        MessageRenderer._showToast('已复制');
    },

    _findById: function (id) {
        var items = this._load();
        for (var i = 0; i < items.length; i++) {
            if (items[i].id === id) return items[i];
        }
        return null;
    },

    _preview: function (text, max) {
        var t = String(text || '').replace(/\s+/g, ' ').trim();
        if (t.length <= max) return t;
        return t.slice(0, max) + '…';
    },

    _cleanResult: function (text) {
        return String(text || '')
            .replace(/```thinking\b[\s\S]*?```/gi, '')
            .replace(/```thinking\b[\s\S]*$/gi, '')
            .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
            .replace(/<think\b[^>]*>[\s\S]*$/gi, '')
            .trim();
    },

    _statusText: function (status) {
        return { pending: '等待', streaming: '生成', done: '完成', error: '失败' }[status] || status || '';
    },

    _formatTime: function (ts) {
        var d = new Date(ts);
        var now = new Date();
        var sameDay = d.toDateString() === now.toDateString();
        if (sameDay) {
            return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }
        var sameYear = d.getFullYear() === now.getFullYear();
        if (sameYear) {
            return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }
        return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
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
