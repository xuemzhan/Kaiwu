/**
 * chat.js — 对话面板组件
 * 管理对话界面渲染、消息发送、流式接收
 */

var ChatUI = {
    _streamRenderTimer: null,
    _latestStreamingChat: null,
    // 初始化
    init: function () {
        this._bindEvents();
        this._loadChat();
        this._bindScenarioActions();
        this._bindScenarioTabs();
        this._updateContextBar();
        this._checkPendingAction();
        if (typeof HistoryDrawer !== 'undefined') HistoryDrawer.init();
        // 定期检查待处理操作
        this._actionCheckTimer = setInterval(this._checkPendingAction.bind(this), 1000);
        this._contextTimer = setInterval(this._updateContextBar.bind(this), 1500);
    },

    // 加载当前对话
    _loadChat: function () {
        var chat = ChatManager.getCurrent();
        if (chat) {
            this.renderChat(chat);
        }
        this._updateModelIndicator();
    },

    // 渲染整个对话
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

        var html = '';
        for (var i = 0; i < chat.messages.length; i++) {
            var msg = chat.messages[i];
            var isStreaming = streamingMsg && (i === chat.messages.length - 1) && msg.role === 'assistant';
            html += MessageRenderer.render(msg, isStreaming);
        }

        container.innerHTML = html;
        this._postRender();
        this._scrollToBottom();
    },

    // 渲染后处理（初始化 Mermaid、代码高亮）
    _postRender: function () {
        // 代码高亮
        document.querySelectorAll('.markdown-body pre code').forEach(function (block) {
            if (typeof hljs !== 'undefined') {
                try {
                    hljs.highlightElement(block);
                } catch (e) { /* ignore */ }
            }
        });
        // Mermaid 图表
        if (typeof mermaid !== 'undefined') {
            try {
                mermaid.run({ nodes: document.querySelectorAll('.mermaid') });
            } catch (e) { /* ignore */ }
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

        // 禁用输入
        inputBox.value = '';
        inputBox.disabled = true;
        this._setSendEnabled(false);

        // 添加用户消息
        var chat = ChatManager.addMessage('user', text);
        this.renderChat(chat);

        // 添加占位的助手消息
        chat = ChatManager.addMessage('assistant', '');
        this.renderChat(chat, true);

        // 构建消息列表
        var messages = AIService.buildMessages(config.systemPrompt, chat.messages.slice(0, -1));

        // 发送流式请求
        AIService.sendStream(messages,
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
            },
            // onError
            function (errorMsg) {
                ChatManager.updateLastAssistant('[错误] ' + errorMsg);
                var chat = ChatManager.getCurrent();
                ChatUI.renderChat(chat);
                ChatUI._enableInput();
                ChatUI._showToast('请求失败: ' + errorMsg);
            }
        );
    },

    // 清空对话
    clearChat: function () {
        var chat = ChatManager.clearCurrent();
        this.renderChat(chat);
        document.getElementById('inputBox').value = '';
    },

    // 新建对话
    newChat: function () {
        var chat = ChatManager.create();
        this.renderChat(chat);
        document.getElementById('inputBox').value = '';
        document.getElementById('inputBox').disabled = false;
        this._setSendEnabled(true);
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

            if (typeof ActionRunner !== 'undefined' && ActionRegistry && ActionRegistry.get(action)) {
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
        // 仅在欢迎消息存在时更新提示文本
        var tipEl = container.querySelector('.welcome-tip');
        if (tipEl) tipEl.textContent = tip;
    },

    _showQuickActionBar: function (label, message) {
        var bar = document.getElementById('quickActionBar');
        var labelEl = document.getElementById('quickActionLabel');
        if (bar && labelEl) {
            labelEl.innerHTML = '<strong>' + label + ':</strong> ' + message;
            bar.style.display = 'flex';
        }
    },

    _scheduleStreamingRender: function (chat) {
        if (!chat) return;
        this._latestStreamingChat = chat;
        if (this._streamRenderTimer) return;
        this._streamRenderTimer = setTimeout(function () {
            ChatUI._streamRenderTimer = null;
            ChatUI.renderChat(ChatUI._latestStreamingChat, true);
        }, 120);
    },

    _finishStreamingRender: function (chat) {
        if (this._streamRenderTimer) {
            clearTimeout(this._streamRenderTimer);
            this._streamRenderTimer = null;
        }
        this._latestStreamingChat = null;
        this.renderChat(chat);
    },

    _hideQuickActionBar: function () {
        var bar = document.getElementById('quickActionBar');
        if (bar) bar.style.display = 'none';
    },

    _bindScenarioActions: function () {
        var buttons = document.querySelectorAll('.scenario-chip[data-action-id]');
        buttons.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var actionId = this.getAttribute('data-action-id');
                var requireSel = this.getAttribute('data-require-selection') === '1';
                if (requireSel && typeof WriterAdapter !== 'undefined') {
                    var sel = WriterAdapter.getSelectionText();
                    if (!sel) {
                        MessageRenderer._showToast('请先在文档中选中文本');
                        return;
                    }
                }
                if (typeof ActionRunner !== 'undefined') {
                    ActionRunner.run(actionId);
                }
            });
        });
    },

    /**
     * 响应式 Tab 切换:
     *   - 空间 < 560px 时, 标签可见; 点击不同分类标签切换下方展示的 chips
     *   - 空间 >= 560px 时, 标签隐藏, 三组 chips 都可见 (一行水平滚动)
     * 通过 window 宽度 + resize 事件维护状态.
     */
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
        window.addEventListener('resize', function () {
            self._setActiveCategory(self._activeCategory || 'writing');
        });
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
        // 顺手保存任务窗格当前宽度 (用户在 WPS 拖动调整时也能记住)
        try {
            if (window.Application && window.Application.PluginStorage) {
                var stored = parseInt(window.Application.PluginStorage.getItem('taskpane_user_width') || '0', 10);
                // WPS 在 web 内拿不到直接宽度, 但若暴露了 outerWidth/innerWidth 也可读
                var detected = window.outerWidth || window.innerWidth || 0;
                if (detected >= 320 && detected <= 2560 && detected !== stored) {
                    window.Application.PluginStorage.setItem('taskpane_user_width', String(detected));
                }
            }
        } catch (e) { /* ignore */ }
        var doc = WriterAdapter.getDocumentInfo();
        var sel = WriterAdapter.getSelectionInfo();
        var model = '';
        try {
            model = Config.get('model') || '';
        } catch (e) { /* ignore */ }
        if (!doc.available) {
            el.textContent = '未连接到 WPS Writer，可继续使用聊天和设置';
            return;
        }
        el.textContent = doc.name + ' · ' + (sel.hasSelection ? ('已选中 ' + sel.length + ' 字') : '未选中文本') + (model ? (' · ' + model) : '');
    },

    // 绑定事件
    _bindEvents: function () {
        var self = this;

        // 发送按钮
        document.getElementById('btnSend').addEventListener('click', function () {
            self.sendMessage();
        });

        // Ctrl+Enter 发送
        document.getElementById('inputBox').addEventListener('keydown', function (e) {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                self.sendMessage();
            }
        });

        // 清空按钮
        document.getElementById('btnClear').addEventListener('click', function () {
            self.clearChat();
        });

        // 新建对话
        document.getElementById('btnNewChat').addEventListener('click', function () {
            self.newChat();
        });

        // 设置按钮
        document.getElementById('btnSettings').addEventListener('click', function () {
            SettingsUI.show();
        });

        // 关闭设置
        document.getElementById('btnCloseSettings').addEventListener('click', function () {
            SettingsUI.hide();
        });

        // 点击遮罩关闭设置
        document.getElementById('settingsOverlay').addEventListener('click', function (e) {
            if (e.target === this) SettingsUI.hide();
        });

        // Phase 2: 执行快捷操作（插入文档 - 组件感知）
        document.getElementById('btnExecuteAction').addEventListener('click', function () {
            // 获取最后一条助手消息并插入
            var chat = ChatManager.getCurrent();
            if (chat && chat.messages.length > 0) {
                for (var i = chat.messages.length - 1; i >= 0; i--) {
                    if (chat.messages[i].role === 'assistant') {
                        var content = chat.messages[i].content;
                        // 移除思考标记
                        content = content.replace(/```thinking[\s\S]*?```/g, '');
                        content = content.replace(/<think>[\s\S]*?<\/think>/g, '');
                        content = content.trim();
                        if (window.__WPS_BRIDGE__ && window.__WPS_BRIDGE__.insertContent) {
                            var ok = window.__WPS_BRIDGE__.insertContent(content);
                            var componentType = window.__WPS_BRIDGE__.getComponentType();
                            var componentLabel = (typeof ComponentDetector !== 'undefined')
                                ? ComponentDetector.getLabel(componentType)
                                : '文档';
                            if (ok) {
                                MessageRenderer._showToast('已插入' + componentLabel);
                            } else {
                                MessageRenderer._showToast('插入失败，请手动复制');
                            }
                            self._hideQuickActionBar();
                        }
                        break;
                    }
                }
            }
        });

        // 取消快捷操作
        document.getElementById('btnCancelAction').addEventListener('click', function () {
            self._hideQuickActionBar();
        });
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
            el.textContent = '当前模型: ' + config.model + ' | ' + config.apiBaseUrl;
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
        MessageRenderer._showToast('请先在设置中配置 API Key');
        SettingsUI.show();
    },

    _showToast: function (msg) {
        MessageRenderer._showToast(msg);
    },

    _scrollToBottom: function () {
        var container = document.getElementById('chatContainer');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }
};
