/**
 * floating.js — 开悟 浮动助手
 *
 * 布局: 与 WPS 原生 AI 助手一致
 *   - 极简 composer (textarea + 4 工具按钮) 占满浮动对话框
 *   - AI 指令菜单: position: fixed 浮在 WPS 文档上
 *   - 结果区: 复用 ResultPanel (与 TaskPane 同一渲染组件)
 *   - 折叠芯片: 右下角小按钮
 *
 * 快捷键 Ctrl+Alt+Z: 在本页内可直接唤起 (浮动对话框获得焦点时)
 */
(function () {
    var selectedText = '';
    var currentActionId = '';
    var isAiCmdOpen = false;
    var isResultMinimized = false;
    var aiCmdCloseTimer = null;

    function $(id) { return document.getElementById(id); }

    var _initialized = false;
    function init() {
        if (_initialized) return;
        if (!$('kwPrompt') || !document.querySelector('.kw-composer')) return;
        _initialized = true;

        if (typeof Config !== 'undefined') Config.init();
        if (typeof marked !== 'undefined') {
            marked.setOptions({ breaks: true, gfm: true, headerIds: false });
        }

        selectedText = readSelectedText();
        currentActionId = readStorage('floating_action') || '';
        bindEvents();
        hydrateInitialAction();
        bindDrag();
        bindMinimize();
        bindResizeMemory();
        bindResultClearedListener();
        setupWakeWord();
        autoGrowPrompt();
        $('kwPrompt').focus();
    }

    // ============================================================
    // 拖拽: 拖动整个 composer 移动 CEF 窗口
    // ============================================================
    function bindDrag() {
        var dragState = null;
        var DRAG_THRESHOLD = 4;

        function onDown(e) {
            if (e.button !== undefined && e.button !== 0) return;
            if (e.target.closest('button, input, a, textarea, .kw-aicmd-panel, .kw-mini-chip, .kw-result')) return;
            dragState = {
                startX: e.clientX,
                startY: e.clientY,
                isDragging: false
            };
        }
        function onMove(e) {
            if (!dragState) return;
            var dx = e.clientX - dragState.startX;
            var dy = e.clientY - dragState.startY;
            if (!dragState.isDragging) {
                if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
                dragState.isDragging = true;
            }
            try {
                if (typeof window.moveBy === 'function') {
                    window.moveBy(dx - (dragState.lastDx || 0), dy - (dragState.lastDy || 0));
                }
            } catch (err) { /* ignore */ }
            dragState.lastDx = dx;
            dragState.lastDy = dy;
            if (e.cancelable) e.preventDefault();
        }
        function onUp() {
            dragState = null;
        }

        var composer = document.querySelector('.kw-composer');
        if (composer) {
            composer.addEventListener('mousedown', onDown);
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        }
    }

    // ============================================================
    // 折叠 / 恢复 (结果 → 浮窗芯片)
    // ============================================================
    function bindMinimize() {
        var btn = $('kwCollapse');
        if (btn) btn.addEventListener('click', minimizeResult);
        var chip = $('kwMiniChip');
        if (chip) chip.addEventListener('click', restoreResult);
        var clearBtn = $('kwClear');
        if (clearBtn) clearBtn.addEventListener('click', function () {
            if (typeof ResultPanel !== 'undefined' && ResultPanel.clear) {
                ResultPanel.clear();
            } else {
                var answer = $('kwAnswer');
                if (answer) answer.innerHTML = '';
                closeResultPanel();
            }
        });
    }

    function minimizeResult() {
        if (typeof ResultPanel === 'undefined') return;
        var active = ResultPanel.active();
        if (!active) return;
        isResultMinimized = true;
        closeResultPanel();
        var chip = $('kwMiniChip');
        if (chip) {
            chip.hidden = false;
            var preview = (active.resultText || '').replace(/\s+/g, ' ').slice(0, 30);
            var label = preview ? (preview + (active.resultText.length > 30 ? '…' : '')) : '已生成结果';
            $('kwMiniChipText').textContent = label;
        }
    }

    function restoreResult() {
        if (!isResultMinimized) return;
        isResultMinimized = false;
        $('kwMiniChip').hidden = true;
        showResultPanel();
    }

    // ============================================================
    // 尺寸记忆: 监听 window resize, 把当前 innerWidth/Height 写入 PluginStorage,
    // 下次 FloatingAssistantManager.show() 会读取该尺寸作为初始大小
    // (去抖 400ms 避免拖动过程中频繁写入)
    // ============================================================
    function bindResizeMemory() {
        var saveTimer = null;
        window.addEventListener('resize', function () {
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = setTimeout(function () {
                try {
                    if (window.Application && window.Application.PluginStorage) {
                        var w = Math.round(window.innerWidth);
                        var h = Math.round(window.innerHeight);
                        if (w >= 320 && w <= 2560) {
                            window.Application.PluginStorage.setItem('floating_user_width', String(w));
                        }
                        if (h >= 120 && h <= 2560) {
                            window.Application.PluginStorage.setItem('floating_user_height', String(h));
                        }
                    }
                } catch (e) { /* ignore */ }
            }, 400);
        });
    }

    // rAF 合并: 同一帧内多次位置请求只重排一次
    var _schedulePosition = (function () {
        var scheduled = false;
        return function () {
            if (scheduled) return;
            scheduled = true;
            var run = function () {
                scheduled = false;
                positionAiCmdPanel();
                positionResultPanel();
            };
            if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
                window.requestAnimationFrame(run);
            } else {
                setTimeout(run, 16);
            }
        };
    })();

    // ============================================================
    // 监听 ResultPanel.clear 事件: 关闭浮动结果面板 (与 TaskPane 行为一致)
    // ============================================================
    function bindResultClearedListener() {
        window.addEventListener('kwresult:cleared', function () {
            closeResultPanel();
        });
    }

    // ============================================================
    // 主事件绑定
    // ============================================================
    function bindEvents() {
        var prompt = $('kwPrompt');
        prompt.addEventListener('input', function () { updateSendState(); autoGrowPrompt(); });
        prompt.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                send();
            } else if (e.key === 'Escape') {
                if (isAiCmdOpen) toggleAiCmd(false);
                else if (isResultMinimized) restoreResult();
            }
        });

        $('kwAiCmd').addEventListener('click', function (e) {
            e.stopPropagation();
            toggleAiCmd();
        });
        $('kwAttach').addEventListener('click', function () {
            showToast('附件功能即将上线');
        });
        $('kwDeepThink').addEventListener('click', function () {
            var p = $('kwPrompt');
            var prefix = '请深入分析：';
            if (p.value.indexOf(prefix) === 0) return;
            p.value = prefix + p.value;
            updateSendState();
            autoGrowPrompt();
            p.focus();
        });
        $('kwSend').addEventListener('click', send);

        window.addEventListener('resize', function () {
            _schedulePosition();
        });

        Array.prototype.forEach.call(document.querySelectorAll('.kw-aicmd-item'), function (btn) {
            btn.addEventListener('click', function () {
                if (btn.disabled || btn.classList.contains('is-disabled')) return;
                var action = btn.getAttribute('data-action') || '';
                var prompt = btn.getAttribute('data-prompt') || '';
                var requireSel = btn.getAttribute('data-require-selection') === '1';
                if (requireSel && !selectedText) {
                    showToast('请先在文档中选中文字');
                    return;
                }
                currentActionId = action;
                highlightAiCmd(btn);
                $('kwPrompt').value = prompt;
                updateSendState();
                autoGrowPrompt();
                $('kwPrompt').focus();
                toggleAiCmd(false);
            });
        });

        document.addEventListener('click', function (e) {
            if (isAiCmdOpen) {
                var panel = $('kwAiCmdPanel');
                var trigger = $('kwAiCmd');
                if (panel && panel.contains(e.target)) return;
                if (trigger && trigger.contains(e.target)) return;
                toggleAiCmd(false);
            }
        });
    }

    function hydrateInitialAction() {
        if (!currentActionId) {
            updateAiCmdAvailability();
            return;
        }
        var action = ActionRegistry.get(currentActionId);
        if (action) {
            if (action.input === 'user') $('kwPrompt').placeholder = action.placeholder || '输入问题，或从下方场景提问';
            if (action.requireSelection && !selectedText) showToast('请先在文档中选中文字，再使用 "' + action.label + '"');
        }
        var match = document.querySelector('.kw-aicmd-item[data-action="' + currentActionId + '"]');
        if (match) highlightAiCmd(match);
        updateAiCmdAvailability();
        updateSendState();
    }

    // ============================================================
    // AI 指令菜单: position: fixed 滑出
    // ============================================================
    function toggleAiCmd(force) {
        isAiCmdOpen = (typeof force === 'boolean') ? force : !isAiCmdOpen;
        var panel = $('kwAiCmdPanel');
        var trigger = $('kwAiCmd');
        if (panel) {
            if (aiCmdCloseTimer) {
                clearTimeout(aiCmdCloseTimer);
                aiCmdCloseTimer = null;
            }
            if (isAiCmdOpen) {
                panel.hidden = false;
                panel.classList.remove('is-closing');
                positionAiCmdPanel();
                void panel.offsetWidth;
                panel.classList.add('is-open');
            } else {
                panel.classList.remove('is-open');
                panel.classList.add('is-closing');
                aiCmdCloseTimer = setTimeout(function () {
                    panel.hidden = true;
                    panel.classList.remove('is-closing');
                    aiCmdCloseTimer = null;
                }, 180);
            }
        }
        if (trigger) trigger.classList.toggle('is-active', isAiCmdOpen);
    }

    function positionAiCmdPanel() {
        var panel = $('kwAiCmdPanel');
        var composer = document.querySelector('.kw-composer');
        if (!panel || !composer) return;
        var cRect = composer.getBoundingClientRect();
        var top = Math.round(cRect.bottom + 4);
        var left = Math.round(cRect.left);
        var maxLeft = window.innerWidth - 320 - 8;
        if (left > maxLeft) left = maxLeft;
        if (left < 8) left = 8;
        panel.style.top = top + 'px';
        panel.style.left = left + 'px';
    }

    function positionResultPanel() {
        var panel = $('kwResult');
        var composer = document.querySelector('.kw-composer');
        if (!panel || !composer) return;
        if (panel.hidden) return;
        var cRect = composer.getBoundingClientRect();
        var top = Math.round(cRect.bottom + 4);
        var left = Math.round(cRect.left);
        var maxLeft = window.innerWidth - 540 - 8;
        if (left > maxLeft) left = maxLeft;
        if (left < 8) left = 8;
        panel.style.top = top + 'px';
        panel.style.left = left + 'px';
    }

    function showResultPanel() {
        var panel = $('kwResult');
        if (!panel) return;
        panel.hidden = false;
        panel.classList.remove('is-closing');
        positionResultPanel();
        void panel.offsetWidth;
        panel.classList.add('is-open');
        isResultMinimized = false;
        var chip = $('kwMiniChip'); if (chip) chip.hidden = true;
    }

    function closeResultPanel() {
        var panel = $('kwResult');
        if (!panel) return;
        panel.classList.remove('is-open');
        panel.classList.add('is-closing');
        setTimeout(function () {
            panel.hidden = true;
            panel.classList.remove('is-closing');
        }, 200);
    }

    function highlightAiCmd(activeBtn) {
        Array.prototype.forEach.call(document.querySelectorAll('.kw-aicmd-item'), function (btn) {
            btn.classList.toggle('is-selected', btn === activeBtn);
        });
    }

    function updateAiCmdAvailability() {
        Array.prototype.forEach.call(document.querySelectorAll('.kw-aicmd-item[data-require-selection]'), function (btn) {
            var disabled = !selectedText;
            btn.classList.toggle('is-disabled', disabled);
            if (disabled) btn.setAttribute('disabled', '1');
            else btn.removeAttribute('disabled');
        });
    }

    function autoGrowPrompt() {
        var p = $('kwPrompt');
        if (!p) return;
        p.style.height = 'auto';
        var maxH = 110;
        p.style.height = Math.min(p.scrollHeight, maxH) + 'px';
    }

    // ============================================================
    // 发送: 走 ActionRunner (与 TaskPane 共用同一渲染区)
    //   - 有 currentActionId → ActionRunner.run
    //   - 无 → 自由聊天 (走 AIService 直接调用, 不入历史抽屉)
    // ============================================================
    function send() {
        var promptText = $('kwPrompt').value.trim();
        if (!promptText && !currentActionId) return;

        if (typeof ActionRunner !== 'undefined' && currentActionId) {
            var action = ActionRegistry.get(currentActionId);
            if (action) {
                if (action.input === 'selection' || action.input === 'document') {
                    ActionRunner.run(currentActionId);
                } else {
                    ActionRunner.run(currentActionId, { userInput: promptText });
                }
                showResultPanel();
                return;
            }
        }

        // 自由聊天: 直接调 AIService, 不进入 ResultPanel / HistoryDrawer
        freeChat(promptText);
    }

    function freeChat(promptText) {
        var contextParts = [];
        if (selectedText) contextParts.push('选中文字：\n' + selectedText);
        contextParts.push('用户问题：\n' + promptText);
        var messages = AIService.buildMessages(
            Config.get('systemPrompt') || '你是开悟，专业的 WPS AI 写作助手。请用中文回复。',
            [],
            contextParts.join('\n\n')
        );

        var answerEl = $('kwAnswer');
        if (answerEl) answerEl.innerHTML = '<div class="kw-loading">正在思考</div>';
        showResultPanel();
        if (typeof AIService === 'undefined') {
            if (answerEl) answerEl.innerHTML = '<div class="kw-error">AI 服务未就绪</div>';
            return;
        }
        // 流式阶段: 复用同一个 article 节点, 只更新 .answer-body 子节点, 避免闪烁
        var articleEl = answerEl.querySelector('.kw-answer');
        if (!articleEl) {
            articleEl = document.createElement('article');
            articleEl.className = 'kw-answer';
            var bodyWrap = document.createElement('div');
            bodyWrap.className = 'answer-body';
            articleEl.appendChild(bodyWrap);
            answerEl.innerHTML = '';
            answerEl.appendChild(articleEl);
        }
        var bodyEl = articleEl.querySelector('.answer-body');
        AIService.sendStream(
            messages,
            function (delta, fullContent) {
                articleEl.classList.add('is-streaming');
                bodyEl.innerHTML = renderMarkdownSafe(fullContent);
            },
            function (fullContent) {
                articleEl.classList.remove('is-streaming');
                bodyEl.innerHTML = renderMarkdownSafe(fullContent);
                var actions = $('kwResultActions'); if (actions) actions.hidden = !fullContent;
            },
            function (error) {
                answerEl.innerHTML = '<div class="kw-error">' + escapeHtml(error || '发生错误') + '</div>';
                var actions = $('kwResultActions'); if (actions) actions.hidden = true;
            }
        );
    }

    function renderMarkdownSafe(text) {
        if (typeof KwMarkdown !== 'undefined') {
            return KwMarkdown.render(text);
        }
        if (typeof marked === 'undefined') return '<p>' + escapeHtml(text || '') + '</p>';
        var html = marked.parse(text || '');
        if (typeof KwSecurity !== 'undefined') html = KwSecurity.sanitizeHtml(html);
        return html;
    }

    // 兼容: ResultPanel 在 ActionRunner 流式回调中也可能调用 showResultPanel
    // 重写 showResultPanel 暴露给 ResultPanel
    window._kwShowResultPanel = showResultPanel;

    function showToast(message) {
        if (typeof KwToast !== 'undefined' && KwToast.show) {
            KwToast.show(message, 'floating');
            return;
        }
        // 兜底: 自己创建临时元素
        var existing = document.getElementById('kwToast');
        if (existing) existing.remove();
        var el = document.createElement('div');
        el.id = 'kwToast';
        el.className = 'kw-toast';
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(function () { el.classList.add('kw-toast-out'); }, 2000);
        setTimeout(function () { el.remove(); }, 2400);
    }

    function updateSendState() {
        var ready = !!($('kwPrompt').value.trim() || currentActionId);
        $('kwSend').classList.toggle('is-ready', ready);
    }

    // ============================================================
    // 配置 WakeWordManager (Ctrl+Alt+Z 唤起助手)
    // 浮动对话框中, 选区检测通过 WriterAdapter 访问 WPS 文档选区
    // ============================================================
    function setupWakeWord() {
        try {
            if (window.WakeWordManager && typeof window.WakeWordManager.configure === 'function') {
                window.WakeWordManager.configure({
                    isSelectionActive: function () {
                        try {
                            return WriterAdapter && WriterAdapter.getSelectionText
                                ? (WriterAdapter.getSelectionText() || '').length > 0
                                : false;
                        } catch (e) { return false; }
                    }
                });
                window.WakeWordManager.start();
            }
        } catch (e) { /* ignore */ }
    }

    function readSelectedText() {
        var saved = readStorage('floating_selected_text');
        if (saved) return saved;
        try {
            return WriterAdapter.getSelectionText() || '';
        } catch (e) {
            return '';
        }
    }

    function readStorage(key) {
        try {
            if (window.Application && window.Application.PluginStorage) {
                return window.Application.PluginStorage.getItem(key) || '';
            }
        } catch (e) { /* ignore */ }
        return '';
    }

    function writeStorage(key, value) {
        try {
            if (window.Application && window.Application.PluginStorage) {
                window.Application.PluginStorage.setItem(key, value);
            }
        } catch (e) { /* ignore */ }
    }

    // escapeHtml 已统一收敛到 KwUtils.escapeHtml, floating.js 之前保留
    // 的 inline fallback 实际不会被触发 (utils.js 加载先于此处调用).
    // 保留命名仅为最小化改动; 直接调用 KwUtils 即可.
    function escapeHtml(text) {
        return KwUtils.escapeHtml(text);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
