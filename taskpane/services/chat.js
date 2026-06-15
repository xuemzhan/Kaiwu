/**
 * chat.js — 对话管理
 * 消息存储、对话历史管理，基于 localStorage 持久化
 */

var ChatManager = {
    _currentChatId: null,
    // 内存缓存: 避免每次操作都从 localStorage 读取
    _cache: null,
    _saveTimer: null,

    // 创建新对话
    create: function () {
        var chat = {
            id: this._generateId(),
            messages: [],
            title: '新对话',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        this._updateCache(chat.id, chat);
        this._currentChatId = chat.id;
        this._scheduleSave();
        return chat;
    },

    // 获取当前对话
    getCurrent: function () {
        if (!this._currentChatId) {
            var recent = this.getRecent(1);
            if (recent.length > 0) {
                this._currentChatId = recent[0].id;
            } else {
                return this.create();
            }
        }
        return this.get(this._currentChatId);
    },

    // 获取指定对话
    get: function (id) {
        var chats = this._loadAll();
        return chats[id] || null;
    },

    // 设置当前对话
    setCurrent: function (id) {
        this._currentChatId = id;
    },

    // 添加消息到当前对话
    addMessage: function (role, content) {
        var chat = this.getCurrent();
        if (!chat) {
            chat = this.create();
        }
        chat.messages.push({
            role: role,
            content: content,
            timestamp: Date.now()
        });
        // 如果是第一条用户消息，用其内容作为标题
        if (role === 'user' && chat.messages.filter(function (m) { return m.role === 'user'; }).length === 1) {
            chat.title = content.substring(0, 30) + (content.length > 30 ? '...' : '');
        }
        chat.updatedAt = Date.now();
        this._updateCache(chat.id, chat);
        this._scheduleSave();
        return chat;
    },

    // 更新最后一条助手消息（用于流式追加）
    updateLastAssistant: function (content, options) {
        options = options || {};
        var chat = this.getCurrent();
        if (!chat || chat.messages.length === 0) return null;
        var lastMsg = chat.messages[chat.messages.length - 1];
        if (lastMsg.role === 'assistant') {
            lastMsg.content = content;
            lastMsg.timestamp = Date.now();
            chat.updatedAt = Date.now();
            this._updateCache(chat.id, chat);
            if (!options.skipSave) {
                this._scheduleSave();
            }
        }
        return chat;
    },

    // 追加最后一条助手消息
    appendLastAssistant: function (delta) {
        var chat = this.getCurrent();
        if (!chat || chat.messages.length === 0) return null;
        var lastMsg = chat.messages[chat.messages.length - 1];
        if (lastMsg.role === 'assistant') {
            lastMsg.content += delta;
            chat.updatedAt = Date.now();
            this._updateCache(chat.id, chat);
            this._scheduleSave();
        }
        return chat;
    },

    // 获取历史对话列表（按时间倒序）
    getRecent: function (limit) {
        limit = limit || 20;
        var chats = this._loadAll();
        var list = [];
        for (var id in chats) {
            if (chats.hasOwnProperty(id)) {
                list.push(chats[id]);
            }
        }
        list.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
        return list.slice(0, limit);
    },

    // 清空当前对话
    clearCurrent: function () {
        var chat = this.getCurrent();
        if (chat) {
            chat.messages = [];
            chat.title = '新对话';
            chat.updatedAt = Date.now();
            this._updateCache(chat.id, chat);
            this._scheduleSave();
        }
        return chat;
    },

    // 删除对话
    delete: function (id) {
        var chats = this._loadAll();
        delete chats[id];
        this._cache = chats;
        this._scheduleSave();
        if (this._currentChatId === id) {
            this._currentChatId = null;
        }
    },

    // 获取当前对话 ID
    getCurrentId: function () {
        return this._currentChatId;
    },

    // ============ 内部 ============

    // 内存中更新缓存 (避免反复 JSON.parse)
    _updateCache: function (id, chat) {
        if (!this._cache) this._cache = this._loadAll();
        this._cache[id] = chat;
    },

    // 内部：生成唯一ID
    _generateId: function () {
        return 'chat_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    },

    // 内部：加载所有对话 (优先走缓存)
    _loadAll: function () {
        if (this._cache) return this._cache;
        try {
            var data = localStorage.getItem('wps_assistant_chats');
            this._cache = data ? JSON.parse(data) : {};
            return this._cache;
        } catch (e) {
            console.warn('[Chat] 加载对话失败:', e);
            this._cache = {};
            return this._cache;
        }
    },

    /**
     * 防抖落盘: 流式期间高频调用时不立即写盘, 节流到 500ms
     */
    _scheduleSave: function () {
        if (this._saveTimer) return;
        var self = this;
        this._saveTimer = setTimeout(function () {
            self._saveTimer = null;
            self._saveNow();
        }, 500);
    },

    _flushSave: function () {
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
        }
        this._saveNow();
    },

    _saveNow: function () {
        if (!this._cache) return;
        var chats = this._cache;
        try {
            // 清理过旧的对话（保留最近50个），仅在数量超限时执行
            var keys = Object.keys(chats);
            if (keys.length > 50) {
                var sorted = keys.sort(function (a, b) { return chats[b].updatedAt - chats[a].updatedAt; });
                var toKeep = sorted.slice(0, 50);
                var pruned = {};
                for (var i = 0; i < toKeep.length; i++) {
                    pruned[toKeep[i]] = chats[toKeep[i]];
                }
                chats = pruned;
                this._cache = pruned;
            }
            localStorage.setItem('wps_assistant_chats', JSON.stringify(chats));
        } catch (e) {
            if (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22)) {
                console.warn('[Chat] localStorage 配额已满, 仅保留当前对话');
                var currentId = this._currentChatId;
                if (currentId && chats[currentId]) {
                    try {
                        var single = {};
                        single[currentId] = chats[currentId];
                        localStorage.setItem('wps_assistant_chats', JSON.stringify(single));
                        this._cache = single;
                    } catch (e2) {
                        console.error('[Chat] 强制清理后仍无法保存:', e2);
                        // 连单条都写不下: 清空缓存, 避免下次 _saveNow 又试图写整张大对象.
                        this._cache = {};
                    }
                } else {
                    // 当前对话不在缓存中 (极端边界): 避免下次再写同样大数据,
                    // 清空缓存, 后续 addMessage 会重建一个新 _cache.
                    this._cache = {};
                }
            } else {
                console.error('[Chat] 保存对话失败:', e);
            }
        }
    },

    /**
     * 导出当前所有对话为 JSON 字符串.
     * @returns {string|null} JSON 字符串, 失败返回 null
     */
    exportAll: function () {
        try {
            var chats = this._loadAll();
            return JSON.stringify({
                version: 1,
                exportedAt: new Date().toISOString(),
                chats: chats
            }, null, 2);
        } catch (e) {
            console.error('[Chat] 导出失败:', e);
            return null;
        }
    },

    /**
     * 导入对话 JSON 字符串. 与现有对话合并 (按 id 去重, 新数据跳过已存在的).
     * @param {string} jsonStr
     * @returns {object} { imported, skipped, error }
     */
    importAll: function (jsonStr) {
        if (!jsonStr) return { imported: 0, skipped: 0, error: 'empty' };
        try {
            var data = JSON.parse(jsonStr);
            if (!data || typeof data !== 'object' || !data.chats) {
                return { imported: 0, skipped: 0, error: 'invalid format' };
            }
            var existing = this._loadAll();
            var imported = 0, skipped = 0;
            for (var id in data.chats) {
                if (!data.chats.hasOwnProperty(id)) continue;
                if (existing[id]) {
                    skipped++;
                    continue;
                }
                existing[id] = data.chats[id];
                imported++;
            }
            this._cache = existing;
            this._scheduleSave();
            return { imported: imported, skipped: skipped };
        } catch (e) {
            return { imported: 0, skipped: 0, error: e.message || 'parse error' };
        }
    }
};
