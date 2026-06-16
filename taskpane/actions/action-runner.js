/**
 * Runs Writer actions and streams results.
 *
 * 输出策略 (Phase 3):
 *   - 流式结果实时渲染到 ResultPanel (挂载点由调用方决定, TaskPane 或 Floating)
 *   - 每张卡片同步推入 HistoryDrawer, 形成可回溯的历史
 *   - 不再每条结果都生成一张独立 DOM 卡片
 */
var ActionRunner = {
    _lastPushHistoryTime: 0,

    run: function (actionId, options) {
        options = options || {};
        try {
            this._runInternal(actionId, options);
        } catch (e) {
            console.error('[Kaiwu] ActionRunner.run error:', actionId, e);
            if (typeof KwToast !== 'undefined') KwToast.show('操作执行异常：' + (e.message || e));
        }
    },

    _runInternal: function (actionId, options) {
        var action = ActionRegistry.get(actionId);
        if (!action) {
            if (typeof KwToast !== 'undefined') KwToast.show('未知动作：' + actionId);
            return;
        }

        var config = Config.getAll();
        if (!config.apiKey) {
            if (typeof KwToast !== 'undefined') KwToast.show('请先在设置中配置 API Key');
            SettingsUI.show();
            return;
        }

        var inputInfo = this._resolveInput(action, options);
        if (inputInfo.waitForUser) {
            this.prepareUserAction(action);
            return;
        }
        if (inputInfo.error) {
            if (typeof KwToast !== 'undefined') KwToast.show(inputInfo.error);
            return;
        }

        var card = ResultCard.create({
            actionId: action.id,
            actionLabel: action.label,
            sourceType: inputInfo.sourceType,
            sourceText: inputInfo.input
        });
        ResultCard.update(card.id, { status: 'streaming' });

        var mountEl = this._resolveMountEl();
        if (mountEl && typeof ResultPanel !== 'undefined') {
            ResultPanel.mount(this._readCard(card.id), mountEl, { streaming: true });
        }
        this._pushHistory(card.id);

        var messages = PromptTemplates.buildMessages(action.promptKey, {
            input: inputInfo.input,
            question: inputInfo.question || ''
        });
        var sendOptions = {
            temperature: action.temperature,
            maxTokens: action.maxTokens,
            maxHistoryMessages: action.maxHistoryMessages
        };
        var self = this;
        var controller = AIService.sendStream(
            messages,
            function (delta, fullContent) {
                ResultCard.append(card.id, fullContent);
                self._pushHistory(card.id);
                if (mountEl && typeof ResultPanel !== 'undefined') {
                    ResultPanel.update(self._readCard(card.id), mountEl, { streaming: true });
                }
            },
            function (fullContent) {
                ResultCard.complete(card.id, fullContent);
                self._pushHistory(card.id);
                if (mountEl && typeof ResultPanel !== 'undefined') {
                    ResultPanel.update(self._readCard(card.id), mountEl, { streaming: false });
                    ResultPanel.setAbortController(null);
                }
                KwToast.show(action.label + '完成');
            },
            function (errorMsg) {
                ResultCard.fail(card.id, errorMsg);
                self._pushHistory(card.id);
                if (mountEl && typeof ResultPanel !== 'undefined') {
                    ResultPanel.update(self._readCard(card.id), mountEl, { streaming: false });
                    ResultPanel.setAbortController(null);
                }
                KwToast.show(action.label + '失败：' + errorMsg);
            },
            sendOptions
        );
        if (controller && mountEl && typeof ResultPanel !== 'undefined') {
            ResultPanel.setAbortController(controller);
        }
    },

    prepareUserAction: function (action) {
        // 兼容 TaskPane (#inputBox) 与 Floating Dialog (#kwPrompt) 两种输入框
        var inputBox = document.getElementById('inputBox')
            || document.getElementById('kwPrompt')
            || document.querySelector('textarea');
        if (inputBox) {
            inputBox.placeholder = action.placeholder || ('输入“' + action.label + '”的要求');
            inputBox.focus();
        }
        try {
            if (window.Application && window.Application.PluginStorage) {
                window.Application.PluginStorage.setItem('active_user_action', action.id);
            }
        } catch (e) { /* ignore */ }
        MessageRenderer._showToast('请输入需求后发送');
    },

    runPreparedUserAction: function (text) {
        var actionId = '';
        try {
            if (window.Application && window.Application.PluginStorage) {
                actionId = window.Application.PluginStorage.getItem('active_user_action') || '';
                window.Application.PluginStorage.setItem('active_user_action', '');
            }
        } catch (e) { /* ignore */ }
        if (!actionId) return false;
        this.run(actionId, { userInput: text });
        return true;
    },

    /**
     * 解析当前应该挂载到哪个 DOM 节点:
     *   - TaskPane 上下文 (#resultContainer)
     *   - Floating 上下文 (#kwAnswer)
     * 优先选 Floating (因为 ribbon 触发大多数会开浮动窗).
     */
    _resolveMountEl: function () {
        if (document.getElementById('kwAnswer')) return document.getElementById('kwAnswer');
        return document.getElementById('resultContainer');
    },

    _readCard: function (id) {
        if (typeof ResultCard === 'undefined') return null;
        var cards = ResultCard._cards || {};
        return cards[id] || null;
    },

    _pushHistory: function (id) {
        if (typeof HistoryDrawer === 'undefined') return;
        var now = Date.now();
        if (now - this._lastPushHistoryTime < 500) return;
        this._lastPushHistoryTime = now;
        var card = this._readCard(id);
        if (card) HistoryDrawer.push(card);
    },

    _resolveInput: function (action, options) {
        if (options.reuseInput) {
            var sourceType = 'selection';
            if (action.input === 'document') sourceType = 'document';
            else if (action.input === 'user') sourceType = 'user';
            return { input: options.reuseInput, sourceType: sourceType };
        }
        if (action.input === 'user') {
            var userText = (options.userInput || '').trim();
            if (!userText) return { waitForUser: true };
            if (action.requireSelection) {
                var styleSample = WriterAdapter.getSelectionText();
                if (!styleSample) {
                    return { error: '请先在文档中选中文本作为“' + action.label + '”的风格样本' };
                }
                return { input: styleSample, sourceType: 'selection', question: userText };
            }
            return { input: userText, sourceType: 'user' };
        }
        if (action.input === 'document') {
            var docText = WriterAdapter.getDocumentText();
            if (!docText) return { error: '未读取到文档内容' };
            return { input: this._limitText(docText, 18000), sourceType: 'document' };
        }
        var selectionText = WriterAdapter.getSelectionText();
        if (!selectionText && action.requireSelection) {
            return { error: '请先在文档中选中文本，再使用“' + action.label + '”' };
        }
        return { input: selectionText, sourceType: 'selection' };
    },

    _limitText: function (text, maxLength) {
        text = String(text || '');
        if (text.length <= maxLength) return text;
        return text.slice(0, maxLength) + '\n\n[文档内容过长，已截取前 ' + maxLength + ' 字进行处理]';
    }
};
