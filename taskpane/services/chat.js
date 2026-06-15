/**
 * chat.js — 对话管理
 * 消息存储、对话历史管理，基于 localStorage 持久化
 */

var ChatManager = {
    _currentChatId: null,

    // 创建新对话
    create: function () {
        var chat = {
            id: this._generateId(),
            messages: [],
            title: '新对话',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        this._saveChat(chat);
        this._currentChatId = chat.id;
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
        this._saveChat(chat);
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
            if (!options.skipSave) {
                this._saveChat(chat);
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
            this._saveChat(chat);
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
            this._saveChat(chat);
        }
        return chat;
    },

    // 删除对话
    delete: function (id) {
        var chats = this._loadAll();
        delete chats[id];
        this._saveAll(chats);
        if (this._currentChatId === id) {
            this._currentChatId = null;
        }
    },

    // 获取当前对话 ID
    getCurrentId: function () {
        return this._currentChatId;
    },

    // 内部：生成唯一ID
    _generateId: function () {
        return 'chat_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    },

    // 内部：加载所有对话
    _loadAll: function () {
        try {
            var data = localStorage.getItem('wps_assistant_chats');
            return data ? JSON.parse(data) : {};
        } catch (e) {
            console.warn('[Chat] 加载对话失败:', e);
            return {};
        }
    },

    // 内部：保存单个对话
    _saveChat: function (chat) {
        var chats = this._loadAll();
        chats[chat.id] = chat;
        this._saveAll(chats);
    },

    // 内部：保存所有对话
    _saveAll: function (chats) {
        try {
            // 清理过旧的对话（保留最近50个）
            var keys = Object.keys(chats);
            if (keys.length > 50) {
                var sorted = keys.sort(function (a, b) { return chats[b].updatedAt - chats[a].updatedAt; });
                var toKeep = sorted.slice(0, 50);
                var pruned = {};
                for (var i = 0; i < toKeep.length; i++) {
                    pruned[toKeep[i]] = chats[toKeep[i]];
                }
                chats = pruned;
            }
            localStorage.setItem('wps_assistant_chats', JSON.stringify(chats));
        } catch (e) {
            if (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22)) {
                // Try one aggressive prune: keep only the current chat.
                console.warn('[Chat] localStorage 配额已满, 仅保留当前对话');
                var currentId = this._currentChatId;
                if (currentId && chats[currentId]) {
                    try {
                        localStorage.setItem('wps_assistant_chats', JSON.stringify(
                            Object.defineProperty({}, currentId, { value: chats[currentId], enumerable: true })
                        ));
                    } catch (e2) {
                        console.error('[Chat] 强制清理后仍无法保存:', e2);
                    }
                }
            } else {
                console.error('[Chat] 保存对话失败:', e);
            }
        }
    }
};
