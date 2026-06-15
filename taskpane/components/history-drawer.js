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
 *
 * 重构:
 *   - 节流写入 localStorage (500ms), 流式期间避免每 chunk 触发 stringify
 *   - 维护内存中的 _items, push 时仅 patch 单条, 流式阶段不重渲染整个列表
 *   - 搜索 / 过滤 / 按源文分组 — 完整渲染只在抽屉打开 + 数据真正变化时触发
 */
var HistoryDrawer = {
    _storageKey: 'wps_assistant_card_history',
    _maxItems: 100,
    _isOpen: false,
    _listeners: [],
    _items: [],
    _saveTimer: null,
    _lastRenderedHash: '',
    _lastRenderedEmpty: null,
    _filterText: '',

    init: function () {
        this._bindHeaderButton();
        this._bindCloseEvents();
        this._bindSearchEvents();
        this._items = this._load();
        this._scheduleSave();
        this._render();
    },

    /**
     * 推入一张新卡片 (或更新已有卡片). 流式期间高频调用, 但只 patch 单条 + 节流落盘.
     */
    push: function (card) {
        if (!card || !card.id) return;
        var idx = this._indexOf(card.id);
        if (idx >= 0) {
            this._items[idx] = this._merge(this._items[idx], card);
        } else {
            this._items.unshift(this._normalize(card));
        }
        if (this._items.length > this._maxItems) {
            this._items = this._items.slice(0, this._maxItems);
        }
        this._scheduleSave();
        if (this._isOpen) this._render();
        this._fireUpdate(this._items[idx >= 0 ? idx : 0]);
    },

    remove: function (id) {
        var before = this._items.length;
        this._items = this._items.filter(function (it) { return it.id !== id; });
        if (this._items.length !== before) {
            this._scheduleSave();
            this._render();
        }
    },

    clear: function () {
        this._items = [];
        this._scheduleSave(true);
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
     * 监听卡片更新.
     */
    onUpdate: function (fn) {
        if (typeof fn === 'function') this._listeners.push(fn);
    },

    count: function () {
        return this._items.length;
    },

    all: function () {
        return this._items.slice();
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

    _bindSearchEvents: function () {
        var self = this;
        var search = document.getElementById('historySearch');
        if (!search) return;
        search.addEventListener('input', function () {
            self._filterText = String(this.value || '').toLowerCase().trim();
            // 过滤条件变了, 强制重新渲染
            self._lastRenderedHash = '';
            self._lastRenderedEmpty = null;
            self._render();
        });
    },

    _fireUpdate: function (card) {
        if (!card) return;
        for (var i = 0; i < this._listeners.length; i++) {
            try { this._listeners[i](card); } catch (e) { /* ignore */ }
        }
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
        var merged = Object.assign({}, oldCard, newCard, { updatedAt: Date.now() });
        return merged;
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

    _indexOf: function (id) {
        for (var i = 0; i < this._items.length; i++) {
            if (this._items[i].id === id) return i;
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

    _scheduleSave: function (immediate) {
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
        }
        if (immediate) {
            this._saveNow();
            return;
        }
        var self = this;
        this._saveTimer = setTimeout(function () {
            self._saveTimer = null;
            self._saveNow();
        }, 500);
    },

    _saveNow: function () {
        try {
            localStorage.setItem(this._storageKey, JSON.stringify(this._items));
        } catch (e) {
            if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
                console.warn('[HistoryDrawer] localStorage 配额已满, 仅保留最近 20 条');
                try {
                    localStorage.setItem(this._storageKey, JSON.stringify(this._items.slice(0, 20)));
                    KwToast && KwToast.show && KwToast.show('历史记录已满，已自动清理');
                } catch (e2) { /* ignore */ }
            } else {
                console.error('[HistoryDrawer] 保存失败:', e);
            }
        }
    },

    /**
     * 渲染入口. 计算当前所有 entry 的 hash, 与上次相同则跳过 DOM 重渲染.
     * (避免流式期间每 chunk 都把整张列表 innerHTML 重建)
     *
     * 注意: 空集合也要重渲染 (从有数据 → 空 时, hash 仍为空字符串,
     * 但旧 DOM 里还有历史条目; 必须清空). 所以空集合总是渲染.
     */
    _render: function () {
        var list = document.getElementById('historyList');
        var meta = document.getElementById('historyMeta');
        if (!list) return;
        var filtered = this._filter();
        if (meta) {
            meta.textContent = this._filterText
                ? '匹配 ' + filtered.length + ' / ' + this._items.length + ' 条'
                : '共 ' + this._items.length + ' 条';
        }
        var hash = this._hashItems(filtered);
        if (filtered.length === 0) {
            // 空集合: 总是渲染 (确保旧的 history-entry 被清掉)
            if (this._lastRenderedHash === hash && this._lastRenderedEmpty === true) return;
            this._lastRenderedHash = hash;
            this._lastRenderedEmpty = true;
            list.innerHTML = this._filterText
                ? '<div class="history-entry-empty">没有匹配项</div>'
                : '<div class="history-entry-empty">还没有历史记录<br>尝试点击场景按钮生成内容</div>';
            return;
        }
        if (hash === this._lastRenderedHash && this._lastRenderedEmpty === false) return;
        this._lastRenderedHash = hash;
        this._lastRenderedEmpty = false;
        var groups = this._groupBySource(filtered);
        var html = '';
        for (var i = 0; i < groups.length; i++) {
            html += this._renderGroup(groups[i]);
        }
        list.innerHTML = html;
        this._bindEntryEvents();
    },

    _filter: function () {
        if (!this._filterText) return this._items.slice();
        var q = this._filterText;
        return this._items.filter(function (it) {
            var src = (it.sourceText || '').toLowerCase();
            var res = (it.resultText || '').toLowerCase();
            var lbl = (it.actionLabel || '').toLowerCase();
            return src.indexOf(q) !== -1 || res.indexOf(q) !== -1 || lbl.indexOf(q) !== -1;
        });
    },

    /**
     * 内容 hash: 用于判断是否需要重新生成 DOM. 流式期间仅 status / resultText 改变,
     * 我们把这些字段都纳入 hash, 但只在确实变化时才重建.
     */
    _hashItems: function (items) {
        var parts = [];
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            parts.push(it.id + ':' + it.status + ':' + (it.resultText || '').length);
        }
        return parts.join('|');
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
            '    <div class="history-group-title">' + KwUtils.escapeHtml(group.documentRef) + ' · ' + sourceLabel + '</div>' +
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
        var resultPreview = KwUtils.cleanResult(entry.resultText || '');
        if (entry.status === 'error') {
            resultPreview = entry.error || '生成失败';
        } else if (entry.status === 'cancelled') {
            resultPreview = entry.error || '已取消';
        } else if (entry.status === 'pending' || entry.status === 'streaming') {
            resultPreview = '生成中...';
        } else {
            resultPreview = this._preview(resultPreview, 120);
        }
        return '' +
            '<article class="history-entry" data-entry-id="' + KwUtils.escapeAttr(entry.id) + '">' +
            '  <div class="history-entry-head">' +
            '    <div class="history-entry-label">' +
            '      <span>' + KwUtils.escapeHtml(entry.actionLabel) + '</span>' +
            '      <span class="history-entry-status ' + statusClass + '">' + this._statusText(entry.status) + '</span>' +
            '    </div>' +
            '    <div class="history-entry-time">' + KwUtils.formatTime(entry.updatedAt || entry.createdAt) + '</div>' +
            '  </div>' +
            (sourcePreview ? '<div class="history-entry-source">' + KwUtils.escapeHtml(sourcePreview) + '</div>' : '') +
            '  <div class="history-entry-preview">' + KwUtils.escapeHtml(resultPreview) + '</div>' +
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
        var text = KwUtils.cleanResult(it.resultText || '');
        if (!text) {
            KwToast.show('该记录暂无结果');
            return;
        }
        var ok = WriterAdapter.insertAtCursor(text);
        KwToast.show(ok ? '已插入' : '插入失败');
    },

    _actionCopy: function (id) {
        var it = this._findById(id);
        if (!it) return;
        var text = KwUtils.cleanResult(it.resultText || '');
        if (!text) {
            KwToast.show('该记录暂无结果');
            return;
        }
        KwUtils.copyToClipboard(text).then(function () {
            KwToast.show('已复制');
        });
    },

    _findById: function (id) {
        for (var i = 0; i < this._items.length; i++) {
            if (this._items[i].id === id) return this._items[i];
        }
        return null;
    },

    _preview: function (text, max) {
        var t = String(text || '').replace(/\s+/g, ' ').trim();
        if (t.length <= max) return t;
        return t.slice(0, max) + '…';
    },

    _statusText: function (status) {
        return { pending: '等待', streaming: '生成', done: '完成', error: '失败', cancelled: '已取消' }[status] || status || '';
    }
};
