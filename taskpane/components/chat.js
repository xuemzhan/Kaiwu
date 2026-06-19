/**
 * chat.js — 对话面板组件
 * 管理对话界面渲染、消息发送、流式接收
 *
 * 优化点 (Phase 4):
 *   - 流式阶段只更新最后一条 assistant 节点的 .message-body-content 子节点,
 *     不重建整条对话 (A1)
 *   - 智能 _scrollToBottom: 仅在用户已处于底部时才跟随 (C2)
 *   - 流式末尾追加闪烁 ▍ 光标 (C3)
 *   - abort controller: 用户可中断主对话流式 (C1)
 *   - 错误信息用统一 .message-error 卡片样式 (C6)
 *   - 字数 / token 估算 (D5)
 *   - 全局快捷键 (D6)
 */
var ChatUI = {
    _streamRenderTimer: null,
    _latestStreamingChat: null,
    _streamController: null,
    _isUserAtBottom: true,
    _contextTimeout: null,

    // 初始化
    init: function () {
        this._bindEvents();
        this._bindScrollDetection();
        this._bindGlobalKeys();
        this._bindTokenCounter();
        this._bindVisibility();
        this._loadChat();
        this._bindScenarioActions();
        this._bindScenarioTabs();
        this._bindImportExport();
        this._startContextTimeout();
        this._updateContextBar();
        this._checkPendingAction();
        this._bindRetryButton();
        if (typeof HistoryDrawer !== 'undefined') HistoryDrawer.init();
        // 轮询: taskpane 隐藏时自动暂停, 避免无效 WPS COM 调用
        this._actionCheckTimer = setInterval(this._checkPendingAction.bind(this), 1000);
        this._contextTimer = setInterval(this._updateContextBar.bind(this), 1500);
    },

    _startContextTimeout: function () {
        var self = this;
        this._contextTimeout = setTimeout(function () {
            var el = document.getElementById('contextMeta');
            if (el && el.textContent.indexOf('正在读取') !== -1) {
                el.textContent = '未连接到 WPS Writer';
                el.classList.add('kw-context-error');
            }
        }, 3000);
    },

    /**
     * visibilitychange: taskpane 被 WPS 折叠/隐藏时暂停轮询, 显示时恢复.
     * 省 CPU + 减少 WPS COM 调用频率.
     */
    _bindVisibility: function () {
        var self = this;
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                if (self._actionCheckTimer) { clearInterval(self._actionCheckTimer); self._actionCheckTimer = null; }
                if (self._contextTimer) { clearInterval(self._contextTimer); self._contextTimer = null; }
                if (self._selectionCheckTimer) { clearInterval(self._selectionCheckTimer); self._selectionCheckTimer = null; }
            } else {
                if (!self._actionCheckTimer) self._actionCheckTimer = setInterval(self._checkPendingAction.bind(self), 1000);
                if (!self._contextTimer) self._contextTimer = setInterval(self._updateContextBar.bind(self), 1500);
                if (!self._selectionCheckTimer) self._selectionCheckTimer = setInterval(self._updateChipStates.bind(self), 1000);
                // 立刻刷新一次, 避免用户切回时看到过时状态
                self._updateContextBar();
                self._updateChipStates();
            }
        });
    },

    // 加载当前对话
    _loadChat: function () {
        var chat = ChatManager.getCurrent();
        if (chat) {
            this.renderChat(chat);
        }
        this._updateModelIndicator();
    },

    /**
     * 渲染整个对话. 已优化:
     *   - 第一次渲染: 完整 innerHTML + _postRender
     *   - 流式阶段: 不再调用本方法, 改用 _updateStreamingMessage
     */
    renderChat: function (chat, streamingMsg) {
        var container = document.getElementById('chatContainer');
        if (!container) return;

        if (!chat || chat.messages.length === 0) {
            container.innerHTML = '' +
                '<div class="welcome-message">' +
                '  <h3>👋 欢迎使用开悟</h3>' +
                '  <p>选中文档中的文字，或直接输入问题开始对话。</p>' +
                '  <p class="welcome-tip">💡 提示：在文档中选中文字后，点击功能区按钮可进行润色、续写、翻译等操作。</p>' +
                '  <p class="welcome-model" id="welcomeModel"></p>' +
                '</div>';
            this._updateWelcomeModel();
            return;
        }

        var parts = [];
        for (var i = 0; i < chat.messages.length; i++) {
            var msg = chat.messages[i];
            var isStreaming = streamingMsg && (i === chat.messages.length - 1) && msg.role === 'assistant';
            parts.push(MessageRenderer.render(msg, isStreaming));
        }
        container.innerHTML = parts.join('');
        this._postRender();
        this._maybeScrollToBottom();
    },

    /**
     * 流式阶段专用: 只更新最后一条 assistant 节点.
     * 性能优化: 避免每 chunk 都重新解析整段历史消息的 Markdown.
     */
    _updateStreamingMessage: function (chat) {
        if (!chat) return;
        var container = document.getElementById('chatContainer');
        if (!container) return;
        var lastMsg = chat.messages[chat.messages.length - 1];
        if (!lastMsg || lastMsg.role !== 'assistant') return;

        var node = MessageRenderer.updateStreamingMessage(container, lastMsg);
        if (node) {
            // 移除旧的闪烁光标, 在新内容末尾追加
            var caret = node.querySelector('.kw-streaming-caret');
            if (caret) {
                var content = node.querySelector('.message-bubble');
                if (content) content.classList.add('kw-streaming-caret');
            }
        }
        this._maybeScrollToBottom();
    },

    // 渲染后处理（幂等代码高亮 + mermaid）
    _postRender: function () {
        if (typeof KwMarkdown !== 'undefined') {
            var container = document.getElementById('chatContainer');
            KwMarkdown.postRender(container);
        } else {
            // 旧版 fallback
            var codes = document.querySelectorAll('.markdown-body pre code');
            codes.forEach(function (block) {
                if (typeof hljs !== 'undefined') {
                    try { hljs.highlightElement(block); } catch (e) { /* ignore */ }
                }
            });
            if (typeof mermaid !== 'undefined') {
                try { mermaid.run({ nodes: document.querySelectorAll('.mermaid') }); } catch (e) { console.debug('[Chat] Mermaid 渲染失败:', e); }
            }
        }
    },

    // 发送消息
    sendMessage: function () {
        var inputBox = document.getElementById('inputBox');
        if (!inputBox) return;

        var text = inputBox.value.trim();
        if (!text) return;

        if (typeof ActionRunner !== 'undefined' && ActionRunner.runPreparedUserAction(text)) {
            inputBox.value = '';
            inputBox.placeholder = '输入问题，或从上方场景提问...';
            return;
        }

        var config = Config.getAll();
        if (!config.apiKey) {
            this._showSettingsPrompt();
            return;
        }

        // 禁用输入 + 显示 abort 按钮
        inputBox.value = '';
        inputBox.disabled = true;
        this._setSendEnabled(false);
        this._showAbortButton(true);

        // 添加用户消息
        var chat = ChatManager.addMessage('user', text);
        this.renderChat(chat);

        // 添加占位的助手消息
        chat = ChatManager.addMessage('assistant', '');
        this.renderChat(chat, true);

        // 构建消息列表
        if (typeof AIService === 'undefined') {
            this._renderErrorMessage(chat, 'AI 服务未加载，请刷新页面');
            this._enableInput();
            this._showAbortButton(false);
            return;
        }
        var messages = AIService.buildMessages(config.systemPrompt, chat.messages.slice(0, -1));

        // 发送流式请求
        var self = this;
        this._streamController = AIService.sendStream(messages,
            // onChunk
            function (delta, fullContent) {
                var chat = ChatManager.updateLastAssistant(fullContent, { skipSave: true });
                ChatUI._scheduleStreamingRender(chat);
            },
            // onDone
            function (fullContent) {
                ChatManager.updateLastAssistant(fullContent);
                var chat = ChatManager.getCurrent();
                ChatUI._finishStreamingRender(chat);
                ChatUI._enableInput();
                ChatUI._showAbortButton(false);
                ChatUI._streamController = null;
            },
            // onError
            function (errorMsg) {
                ChatManager.updateLastAssistant('[错误] ' + errorMsg);
                var chat = ChatManager.getCurrent();
                ChatUI._renderErrorMessage(chat, errorMsg);
                ChatUI._enableInput();
                ChatUI._showAbortButton(false);
                ChatUI._streamController = null;
                ChatUI._showToast('请求失败: ' + errorMsg);
            }
        );
    },

    /**
     * 渲染错误信息为统一的 .message-error 卡片样式 (C6).
     * 与 MessageRenderer 的 assistant 消息风格区分, 红色警示色.
     */
    _renderErrorMessage: function (chat, errorMsg) {
        if (!chat || !chat.messages.length) return;
        var container = document.getElementById('chatContainer');
        if (!container) return;
        var nodes = container.querySelectorAll('.message-assistant.streaming');
        var node = nodes.length > 0 ? nodes[nodes.length - 1] : null;
        if (!node) {
            this.renderChat(chat);
            return;
        }
        var bubble = node.querySelector('.message-bubble');
        if (bubble) {
            bubble.classList.remove('kw-streaming-caret');
            bubble.classList.add('message-bubble-error');
            bubble.innerHTML = '' +
                '<div class="message-error-header">⚠️ 请求失败</div>' +
                '<div class="message-error-body">' + KwUtils.escapeHtml(errorMsg) + '</div>' +
                '<div class="message-error-actions">' +
                '  <button class="btn btn-sm" data-kw-action="retry">重试</button>' +
                '  <button class="btn btn-sm" data-kw-action="dismiss">关闭</button>' +
                '</div>';
        }
    },

    /**
     * 用户点击重试: 用相同输入重新发送
     */
    retryLastMessage: function () {
        if (typeof ChatManager === 'undefined') return;
        var chat = ChatManager.getCurrent();
        if (!chat || chat.messages.length < 2) return;
        var lastUser = null;
        for (var i = chat.messages.length - 1; i >= 0; i--) {
            if (chat.messages[i].role === 'user') { lastUser = chat.messages[i]; break; }
        }
        if (!lastUser) return;
        // 删除最后一条 assistant 错误消息, 通过内存缓存 + 落盘
        chat.messages.pop();
        chat.updatedAt = Date.now();
        if (typeof ChatManager._updateCache === 'function') {
            ChatManager._updateCache(chat.id, chat);
        }
        if (typeof ChatManager._flushSave === 'function') {
            ChatManager._flushSave();
        }
        var inputBox = document.getElementById('inputBox');
        if (inputBox) inputBox.value = lastUser.content;
        this.sendMessage();
    },

    /**
     * 关闭错误卡片: 删除最后一条错误消息
     */
    dismissError: function () {
        if (typeof ChatManager === 'undefined') return;
        var chat = ChatManager.getCurrent();
        if (!chat || !chat.messages.length) return;
        var last = chat.messages[chat.messages.length - 1];
        if (last && last.role === 'assistant' && last.content && last.content.indexOf('[错误]') === 0) {
            chat.messages.pop();
            chat.updatedAt = Date.now();
            if (typeof ChatManager._updateCache === 'function') {
                ChatManager._updateCache(chat.id, chat);
            }
            if (typeof ChatManager._flushSave === 'function') {
                ChatManager._flushSave();
            }
            this.renderChat(chat);
        }
    },

    // 清空对话
    clearChat: function () {
        var chat = ChatManager.clearCurrent();
        this.renderChat(chat);
        var inputBox = document.getElementById('inputBox');
        if (inputBox) inputBox.value = '';
        this._updateTokenCounter();
    },

    // 新建对话
    newChat: function () {
        var chat = ChatManager.create();
        this.renderChat(chat);
        var inputBox = document.getElementById('inputBox');
        if (inputBox) {
            inputBox.value = '';
            inputBox.disabled = false;
        }
        this._setSendEnabled(true);
        this._updateTokenCounter();
    },

    // 检查待处理的快捷操作（ribbon → taskpane 跨进程通信）
    _checkPendingAction: function () {
        try {
            if (typeof window.Application === 'undefined' || !window.Application.PluginStorage) return;

            var action = window.Application.PluginStorage.getItem('pending_action');
            if (!action) return;

            if (action === 'open_settings') {
                window.Application.PluginStorage.setItem('pending_action', '');
                SettingsUI.show();
                return;
            }

            if (typeof ActionRunner !== 'undefined' && typeof ActionRegistry !== 'undefined' && ActionRegistry.get(action)) {
                ActionRunner.run(action);
            } else {
                console.warn('[ChatUI] Unknown pending action:', action);
            }

            window.Application.PluginStorage.setItem('pending_action', '');
        } catch (e) {
            console.warn('[ChatUI] 检查待处理操作失败:', e);
        }
    },

    // 组件感知欢迎语
    _updateWelcomeByComponent: function (componentType, componentLabel) {
        var container = document.getElementById('chatContainer');
        if (!container) return;
        var tip = '';
        switch (componentType) {
            case 'wps':
                tip = '💡 提示：选中文档文字后，点击功能区按钮可进行润色、续写、翻译、摘要、扩写、改写等操作。';
                break;
            case 'et':
                tip = '💡 提示：在表格中选中数据/单元格，点击功能区按钮可生成公式、分析数据、推荐图表。';
                break;
            case 'wpp':
                tip = '💡 提示：选中幻灯片内容，点击功能区按钮可生成大纲、获取设计建议、生成演讲备注。';
                break;
            case 'pdf':
                tip = '💡 提示：点击功能区按钮可对PDF进行摘要提取、基于文档内容问答。';
                break;
        }
        var tipEl = container.querySelector('.welcome-tip');
        if (tipEl) tipEl.textContent = tip;
    },

    /**
     * 流式渲染节流: 80ms (从 120ms 调小, 在 60Hz 屏更跟手).
     * 自适应: 字符增长快时不节流, 字符增长慢时严格节流.
     */
    _scheduleStreamingRender: function (chat) {
        if (!chat) return;
        this._latestStreamingChat = chat;
        if (this._streamRenderTimer) return;
        this._streamRenderTimer = setTimeout(function () {
            ChatUI._streamRenderTimer = null;
            // 流式阶段: 增量更新, 不重建整段
            ChatUI._updateStreamingMessage(ChatUI._latestStreamingChat);
        }, 80);
    },

    _finishStreamingRender: function (chat) {
        if (this._streamRenderTimer) {
            clearTimeout(this._streamRenderTimer);
            this._streamRenderTimer = null;
        }
        this._latestStreamingChat = null;
        // 流式结束: 重新整段渲染 (移除 streaming 状态类, 触发 mermaid 渲染)
        this.renderChat(chat);
    },

    _hideQuickActionBar: function () {
        var bar = document.getElementById('quickActionBar');
        if (bar) bar.style.display = 'none';
    },

    /**
     * 显示 / 隐藏 abort 按钮 (C1).
     * 流式生成时显示 ■ 停止按钮, 点击后中断 AI 请求.
     */
    _showAbortButton: function (show) {
        var btn = document.getElementById('btnAbort');
        if (!btn) return;
        if (show) {
            btn.style.display = '';
        } else {
            btn.style.display = 'none';
        }
    },

    abortStreaming: function () {
        if (this._streamController) {
            try { this._streamController.abort(); } catch (e) { /* ignore */ }
        }
        this._showAbortButton(false);
        this._enableInput();
        KwToast.show('已停止生成');
    },

    _bindScenarioActions: function () {
        var self = this;
        var buttons = document.querySelectorAll('.scenario-chip[data-action-id]');
        buttons.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var actionId = this.getAttribute('data-action-id');
                var requireSel = this.hasAttribute('data-requires-selection');
                if (requireSel && typeof WriterAdapter !== 'undefined') {
                    var sel = WriterAdapter.getSelectionText();
                    if (!sel) {
                        KwToast.show('请先在文档中选中文本');
                        return;
                    }
                }
                if (typeof ActionRunner !== 'undefined') {
                    ActionRunner.run(actionId);
                }
            });
        });
        self._updateChipStates();
    },

    _updateChipStates: function () {
        var hasSelection = false;
        if (typeof WriterAdapter !== 'undefined') {
            var sel = WriterAdapter.getSelectionText();
            hasSelection = sel && sel.length > 0;
        }
        var chips = document.querySelectorAll('.scenario-chip[data-requires-selection]');
        var self = this;
        chips.forEach(function (chip) {
            if (hasSelection) {
                chip.classList.remove('is-disabled');
                chip.removeAttribute('aria-disabled');
            } else {
                chip.classList.add('is-disabled');
                chip.setAttribute('aria-disabled', 'true');
            }
        });
    },

    _bindScenarioTabs: function () {
        var self = this;
        var tabs = document.querySelectorAll('.scenario-tab');
        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                var cat = this.getAttribute('data-category');
                self._activeCategory = cat;
                self._setActiveCategory(cat);
            });
        });
        self._activeCategory = 'writing';
        self._setActiveCategory('writing');
        self._resizeHandler = KwUtils.rafSchedule(function () {
            self._setActiveCategory(self._activeCategory || 'writing');
        });
        window.addEventListener('resize', self._resizeHandler);
    },

    _setActiveCategory: function (cat) {
        var tabs = document.querySelectorAll('.scenario-tab');
        var groups = document.querySelectorAll('.scenario-chips');
        var narrow = window.innerWidth < 560;
        tabs.forEach(function (tab) {
            var active = tab.getAttribute('data-category') === cat;
            tab.classList.toggle('is-active', active);
            tab.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        groups.forEach(function (g) {
            var match = g.getAttribute('data-category') === cat;
            g.hidden = narrow ? !match : false;
        });
    },

    _updateContextBar: function () {
        var el = document.getElementById('contextMeta');
        if (!el || typeof WriterAdapter === 'undefined') return;
        if (this._contextTimeout) {
            clearTimeout(this._contextTimeout);
            this._contextTimeout = null;
        }
        try {
            if (window.Application && window.Application.PluginStorage) {
                var stored = parseInt(window.Application.PluginStorage.getItem('taskpane_user_width') || '0', 10);
                var detected = window.outerWidth || window.innerWidth || 0;
                if (detected >= 320 && detected <= 2560 && detected !== stored) {
                    window.Application.PluginStorage.setItem('taskpane_user_width', String(detected));
                }
            }
        } catch (e) { console.debug('[ChatUI] 同步宽度失败:', e); }

        var now = Date.now();
        var cacheTTL = 5000; // 5秒缓存有效期
        if (!this._contextCache) this._contextCache = { doc: null, sel: null, lastUpdate: 0 };
        var cache = this._contextCache;

        // 仅当缓存过期时才调用 WPS COM 接口
        if (now - cache.lastUpdate > cacheTTL || !cache.doc) {
            cache.doc = WriterAdapter.getDocumentInfo();
            cache.sel = WriterAdapter.getSelectionInfo();
            cache.lastUpdate = now;
        }

        var doc = cache.doc;
        var sel = cache.sel;
        var model = '';
        try {
            model = Config.get('model') || '';
        } catch (e) { console.debug('[ChatUI] 获取模型失败:', e); }

        if (!doc.available) {
            el.textContent = '未连接到 WPS Writer，可继续使用聊天和设置';
            return;
        }

        // 脱敏 Base URL: 屏幕共享时只显示 host
        var baseUrl = '';
        try {
            var full = Config.get('apiBaseUrl') || '';
            try {
                var u = new URL(full);
                baseUrl = u.host + (u.pathname && u.pathname !== '/' ? '/...' : '');
            } catch (e2) {
                baseUrl = full.length > 32 ? full.slice(0, 28) + '...' : full;
            }
        } catch (e3) { console.debug('[ChatUI] 获取 Base URL 失败:', e3); }

        el.textContent = doc.name + ' · ' +
            (sel.hasSelection ? ('已选中 ' + sel.length + ' 字') : '未选中文本') +
            (model ? (' · ' + model) : '') +
            (baseUrl ? ' · ' + baseUrl : '');
    },

    // 绑定事件
    _bindEvents: function () {
        var self = this;

        // 辅助: 安全绑定 (元素不存在时静默跳过, 不阻塞后续绑定)
        function safeBind(id, event, handler) {
            var el = document.getElementById(id);
            if (el) el.addEventListener(event, handler);
        }

        // 发送按钮
        safeBind('btnSend', 'click', function () { self.sendMessage(); });

        // 停止生成按钮
        safeBind('btnAbort', 'click', function () { self.abortStreaming(); });

        // Ctrl+Enter 发送 + 字数统计
        var inputBox = document.getElementById('inputBox');
        if (inputBox) {
            inputBox.addEventListener('keydown', function (e) {
                if (e.ctrlKey && e.key === 'Enter') {
                    e.preventDefault();
                    self.sendMessage();
                }
            });
            inputBox.addEventListener('input', function () {
                self._updateTokenCounter();
            });
        }

        // 清空按钮
        safeBind('btnClear', 'click', function () { self.clearChat(); });

        // 新建对话
        safeBind('btnNewChat', 'click', function () { self.newChat(); });

        // 设置按钮
        safeBind('btnSettings', 'click', function () {
            if (typeof SettingsUI !== 'undefined') SettingsUI.show();
        });

        // 关闭设置
        safeBind('btnCloseSettings', 'click', function () {
            if (typeof SettingsUI !== 'undefined') SettingsUI.hide();
        });

        // 点击遮罩关闭设置
        safeBind('settingsOverlay', 'click', function (e) {
            if (e.target === this && typeof SettingsUI !== 'undefined') SettingsUI.hide();
        });

        // 插入助手消息
        safeBind('btnExecuteAction', 'click', function () { self._executeInsertLastAssistant(); });

        // 取消快捷操作
        safeBind('btnCancelAction', 'click', function () { self._hideQuickActionBar(); });

        // 全局事件代理: 重试 / 关闭错误 / 复制 / 插入 / 复制代码
        var chatContainer = document.getElementById('chatContainer');
        if (chatContainer) {
            chatContainer.addEventListener('click', function (e) {
                var target = e.target;
                if (!target || !target.getAttribute) return;
                var act = target.getAttribute('data-kw-action');
                if (!act) return;
                if (act === 'copy-message') MessageRenderer.copyMessage(target);
                else if (act === 'insert-message') MessageRenderer.insertMessage(target);
                else if (act === 'copy-code') MessageRenderer.copyCode(target);
                else if (act === 'retry') self.retryLastMessage();
                else if (act === 'dismiss') self.dismissError();
            });
        }
    },

    /**
     * 把最后一条助手消息插入到当前 WPS 文档.
     * 使用 KwUtils.stripThinking 统一清洗 (不依赖 result-card 的 _cleanResult).
     */
    _executeInsertLastAssistant: function () {
        var chat = ChatManager.getCurrent();
        if (!chat || !chat.messages.length) return;
        for (var i = chat.messages.length - 1; i >= 0; i--) {
            if (chat.messages[i].role === 'assistant') {
                var content = KwUtils.cleanResult(chat.messages[i].content);
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
                this._hideQuickActionBar();
                return;
            }
        }
    },

    /**
     * 智能滚动: 仅当用户已处于底部 (32px 容差) 时才跟随 (C2).
     * 用户上滚查看历史时, 不会被强制拉回, 流式渲染时不会打断阅读.
     */
    _maybeScrollToBottom: function () {
        if (!this._isUserAtBottom) return;
        this._scrollToBottom();
    },

    _bindScrollDetection: function () {
        var self = this;
        var container = document.getElementById('chatContainer');
        if (!container) return;
        // scroll 事件: 每次滚动更新 _isUserAtBottom 状态
        container.addEventListener('scroll', KwUtils.rafSchedule(function () {
            self._isUserAtBottom = KwUtils.isAtBottom(container);
        }), { passive: true });
    },

    /**
     * 全局快捷键 (D6).
     *   Esc: 关闭弹窗 / 取消快捷操作
     *   Ctrl+L: 清空当前对话
     *   Ctrl+N: 新建对话
     */
    _bindGlobalKeys: function () {
        var self = this;
        document.addEventListener('keydown', function (e) {
            var ctrl = e.ctrlKey || e.metaKey;
            if (e.key === 'Escape') {
                var overlay = document.getElementById('settingsOverlay');
                if (overlay && overlay.style.display !== 'none') {
                    SettingsUI.hide();
                    e.preventDefault();
                }
                return;
            }
            if (ctrl && !e.shiftKey && !e.altKey) {
                if (e.key === 'l' || e.key === 'L') {
                    // Ctrl+L: 清空当前对话
                    if (self.clearChat) {
                        e.preventDefault();
                        self.clearChat();
                        KwToast.show('已清空当前对话');
                    }
                } else if (e.key === 'n' || e.key === 'N') {
                    // Ctrl+N: 新建对话
                    if (self.newChat) {
                        e.preventDefault();
                        self.newChat();
                    }
                }
            }
        });
    },

    /**
     * 输入框字数 / token 估算 (D5).
     * 在输入框右下显示当前字符数 + 估算 token 数.
     */
    _bindTokenCounter: function () {
        this._updateTokenCounter();
    },

    /**
     * 对话导入 / 导出 (D2/D3).
     * 导出: 把 localStorage 里的所有对话序列化为 JSON 文件下载.
     * 导入: 选择本地 JSON 文件, 解析 + 合并 (去重).
     */
    _bindImportExport: function () {
        var self = this;
        var exportBtn = document.getElementById('btnExportChats');
        var importBtn = document.getElementById('btnImportChats');
        var importFile = document.getElementById('importFileInput');
        if (exportBtn) {
            exportBtn.addEventListener('click', function () { self._exportChats(); });
        }
        if (importBtn && importFile) {
            importBtn.addEventListener('click', function () { importFile.click(); });
            importFile.addEventListener('change', function (e) {
                var file = e.target.files && e.target.files[0];
                if (!file) return;
                var reader = new FileReader();
                reader.onload = function () {
                    self._importChats(String(reader.result || ''));
                };
                reader.readAsText(file);
                importFile.value = ''; // 重置以允许选同名文件
            });
        }
    },

    _exportChats: function () {
        if (typeof ChatManager === 'undefined' || !ChatManager.exportAll) {
            KwToast.error('导出功能未就绪');
            return;
        }
        var json = ChatManager.exportAll();
        if (!json) {
            KwToast.error('导出失败');
            return;
        }
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'kaiwu-chats-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });
        });
        KwToast.show('已导出对话');
    },

    _importChats: function (jsonStr) {
        if (typeof ChatManager === 'undefined' || !ChatManager.importAll) {
            KwToast.error('导入功能未就绪');
            return;
        }
        var result = ChatManager.importAll(jsonStr);
        if (result.error) {
            KwToast.error('导入失败: ' + result.error);
            return;
        }
        KwToast.show('导入 ' + result.imported + ' 个对话' +
            (result.skipped ? '（跳过 ' + result.skipped + ' 个重复）' : ''));
        // 刷新当前对话视图 (新导入的可能成为 current)
        this._loadChat();
    },

    _updateTokenCounter: function () {
        var inputBox = document.getElementById('inputBox');
        var counter = document.getElementById('inputCounter');
        if (!inputBox) return;
        if (!counter) return;
        var text = inputBox.value || '';
        var chars = text.length;
        var tokens = KwUtils.estimateTokens(text);
        if (chars === 0) {
            counter.textContent = '';
        } else {
            counter.textContent = KwUtils.formatNumber(chars) + ' 字 · 约 ' + KwUtils.formatNumber(tokens) + ' tokens';
        }
    },

    // 更新模型指示器
    _updateModelIndicator: function () {
        var el = document.getElementById('modelIndicator');
        var config = Config.getAll();
        if (el) {
            el.textContent = '🤖 ' + config.model;
        }
    },

    _updateWelcomeModel: function () {
        var el = document.getElementById('welcomeModel');
        var config = Config.getAll();
        if (el) {
            var baseUrl = '';
            try {
                var full = config.apiBaseUrl || '';
                try {
                    var u = new URL(full);
                    baseUrl = u.host;
                } catch (e) {
                    baseUrl = full.length > 32 ? full.slice(0, 28) + '...' : full;
                }
            } catch (e2) { /* ignore */ }
            el.textContent = '当前模型: ' + config.model + ' | ' + baseUrl;
        }
    },

    _enableInput: function () {
        var inputBox = document.getElementById('inputBox');
        if (inputBox) inputBox.disabled = false;
        this._setSendEnabled(true);
        if (inputBox) inputBox.focus();
    },

    _setSendEnabled: function (enabled) {
        var btn = document.getElementById('btnSend');
        if (btn) btn.disabled = !enabled;
    },

    _showSettingsPrompt: function () {
        KwToast.show('请先在设置中配置 API Key');
        SettingsUI.show();
    },

    _showToast: function (msg) {
        KwToast.show(msg);
    },

    _scrollToBottom: function () {
        var container = document.getElementById('chatContainer');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    },

    _bindRetryButton: function() {
        var self = this;
        var retryBtn = document.getElementById('opencodeRetryBtn');
        if (!retryBtn) return;

        retryBtn.addEventListener('click', function() {
            self._updateOpencodeStatus('connecting', '正在重试连接...');
            retryBtn.disabled = true;

            if (typeof OpenCodeAIService === 'undefined') {
                self._updateOpencodeStatus('disconnected', 'OpenCode 服务未加载');
                retryBtn.disabled = false;
                return;
            }

            OpenCodeAIService.testConnection(
                function(info) {
                    self._updateOpencodeStatus('connected', '已连接: ' + (Config.get('opencodeUrl') || 'http://127.0.0.1:4096'));
                    retryBtn.style.display = 'none';
                    retryBtn.disabled = false;
                    KwToast.show('✓ OpenCode 连接成功');
                },
                function(err) {
                    self._updateOpencodeStatus('disconnected', err.message || '连接失败');
                    retryBtn.disabled = false;
                    KwToast.show('✗ 连接失败: ' + (err.message || '请检查 opencode 是否运行'));
                }
            );
        });
    },

    _updateOpencodeStatus: function(status, message) {
        var retryBtn = document.getElementById('opencodeRetryBtn');
        if (!retryBtn) return;

        var config = Config.getAll();
        if (config.mode !== 'opencode') {
            retryBtn.style.display = 'none';
            return;
        }

        if (status === 'disconnected') {
            retryBtn.style.display = '';
        } else if (status === 'connected') {
            retryBtn.style.display = 'none';
        } else if (status === 'connecting') {
            retryBtn.style.display = '';
        }
    }
};
