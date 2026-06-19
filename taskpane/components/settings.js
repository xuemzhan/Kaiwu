/**
 * settings.js — 设置面板组件
 * API 配置表单：BaseURL、Key、Model、SystemPrompt 等
 */

var PRESET_MODELS = [
    { label: 'MiniMax-M3', value: 'MiniMax-M3' },
    { label: 'MiniMax-M1', value: 'MiniMax-M1' },
    { label: 'abab6.5s',  value: 'abab6.5s' },
    { label: 'abab5.5s',  value: 'abab5.5s' },
    { label: '──── 第三方 ────', value: '', disabled: true },
    { label: 'GPT-4o',           value: 'gpt-4o' },
    { label: 'GPT-4o-mini',      value: 'gpt-4o-mini' },
    { label: 'DeepSeek-Chat',    value: 'deepseek-chat' },
    { label: 'DeepSeek-Reasoner',value: 'deepseek-reasoner' },
    { label: '自定义...',         value: '__custom__' }
];

var SettingsUI = {
    show: function () {
        var overlay = document.getElementById('settingsOverlay');
        if (!overlay) return;
        this._renderForm();
        overlay.style.display = 'flex';
    },

    hide: function () {
        var overlay = document.getElementById('settingsOverlay');
        if (overlay) overlay.style.display = 'none';
    },

    _isPresetModel: function (model) {
        for (var i = 0; i < PRESET_MODELS.length; i++) {
            if (!PRESET_MODELS[i].disabled && PRESET_MODELS[i].value && PRESET_MODELS[i].value === model) return true;
        }
        return false;
    },

    _renderForm: function () {
        var body = document.getElementById('settingsBody');
        if (!body) return;

        var config = Config.getAll();
        var currentModel = config.model || 'MiniMax-M3';
        var isPreset = this._isPresetModel(currentModel);

        // 构建下拉选项
        var optionsHtml = '';
        for (var i = 0; i < PRESET_MODELS.length; i++) {
            var p = PRESET_MODELS[i];
            var selected = (!p.disabled && p.value && p.value === currentModel) ? ' selected' : '';
            var disabled = p.disabled ? ' disabled' : '';
            optionsHtml += '<option value="' + KwUtils.escapeAttr(p.value) + '"' + selected + disabled + '>' + KwUtils.escapeHtml(p.label) + '</option>';
        }

        body.innerHTML = '' +
            '<fieldset class="kw-settings-section">' +
            '  <legend>AI 提供方</legend>' +
            '  <div class="kw-form-row">' +
            '    <label class="kw-radio">' +
            '      <input type="radio" name="aiMode" value="standard" id="aiModeStandard">' +
            '      <span>标准模式 (OpenAI 兼容 API)</span>' +
            '    </label>' +
            '    <label class="kw-radio">' +
            '      <input type="radio" name="aiMode" value="opencode" id="aiModeOpencode">' +
            '      <span>OpenCode 模式 (本地 opencode-cli)</span>' +
            '    </label>' +
            '  </div>' +
            '</fieldset>' +
            '<div class="form-group">' +
            '  <label class="form-label">API 地址 (Base URL)</label>' +
            '  <input id="settingBaseUrl" class="form-input" type="text" value="' + KwUtils.escapeAttr(config.apiBaseUrl) + '" placeholder="https://api.minimaxi.com/v1">' +
            '</div>' +
            '<div class="form-group">' +
            '  <label class="form-label">API Key</label>' +
            '  <input id="settingApiKey" class="form-input" type="password" value="' + KwUtils.escapeAttr(config.apiKey) + '" placeholder="输入你的 API Key">' +
            '  <button id="btnToggleKey" class="btn btn-sm form-btn" style="margin-top:4px;">👁️ 显示</button>' +
            '</div>' +
            '<div class="form-group">' +
            '  <label class="form-label">模型 (Model)</label>' +
            '  <select id="settingModelSelect" class="form-input">' + optionsHtml + '</select>' +
            '  <input id="settingModelCustom" class="form-input" type="text" placeholder="输入自定义模型名称" style="margin-top:6px;' + (isPreset ? ' display:none;' : '') + '" value="' + (isPreset ? '' : KwUtils.escapeAttr(currentModel)) + '">' +
            '</div>' +
            '<div class="form-group">' +
            '  <label class="form-label">系统提示词 (System Prompt)</label>' +
            '  <textarea id="settingPrompt" class="form-input form-textarea" rows="4" placeholder="你是一个AI写作助手（开悟）...">' + KwUtils.escapeHtml(config.systemPrompt) + '</textarea>' +
            '</div>' +
            '<div class="form-group">' +
            '  <label class="form-label">温度 (Temperature): <span id="tempValue">' + config.temperature + '</span></label>' +
            '  <input id="settingTemp" class="form-range" type="range" min="0" max="2" step="0.1" value="' + config.temperature + '">' +
            '</div>' +
            '<div class="form-group">' +
            '  <label class="form-label">最大 Token 数</label>' +
            '  <input id="settingMaxTokens" class="form-input" type="number" value="' + config.maxTokens + '" min="256" max="32768" step="256">' +
            '</div>' +
            '<fieldset class="kw-settings-section">' +
            '  <legend>OpenCode 模式</legend>' +
            '  <div class="form-group">' +
            '    <label class="form-label">服务器地址</label>' +
            '    <input id="opencodeUrlInput" class="form-input" type="text" value="' + KwUtils.escapeAttr(config.opencodeUrl || '') + '" placeholder="http://127.0.0.1:4096">' +
            '  </div>' +
            '  <div class="form-group">' +
            '    <label class="form-label">用户名</label>' +
            '    <input id="opencodeUsernameInput" class="form-input" type="text" value="' + KwUtils.escapeAttr(config.opencodeUsername || '') + '" placeholder="opencode">' +
            '  </div>' +
            '  <div class="form-group">' +
            '    <label class="form-label">密码</label>' +
            '    <input id="opencodePasswordInput" class="form-input" type="password" value="' + KwUtils.escapeAttr(config.opencodePassword || '') + '" placeholder="opencode server password">' +
            '    <button type="button" id="opencodeTogglePassword" class="btn btn-sm" style="margin-top:4px;">显示</button>' +
            '  </div>' +
            '  <div class="form-group">' +
            '    <button type="button" id="opencodeTestBtn" class="btn">测试连接</button>' +
            '    <span id="opencodeTestResult" class="kw-test-result"></span>' +
            '  </div>' +
            '  <div class="kw-form-row" id="opencodeAgentRow" style="display:none">' +
            '    <label class="form-label">默认 Agent</label>' +
            '    <select id="opencodeAgentSelect" class="form-input">' +
            '      <option value="plan">plan (只读, 安全)</option>' +
            '      <option value="build">build (可执行命令, 需谨慎)</option>' +
            '    </select>' +
            '    <span class="kw-hint">⚠️ build agent 可执行 bash 和编辑文件</span>' +
            '  </div>' +
            '</fieldset>' +
            '<div class="form-actions">' +
            '  <button id="btnSaveSettings" class="btn btn-primary">💾 保存</button>' +
            '  <button id="btnResetConfig" class="btn btn-sm" style="margin-left:8px;">↺ 重置默认</button>' +
            '  <button id="btnTestConnection" class="btn btn-sm" style="margin-left:8px;">🧪 测试连接</button>' +
            '</div>' +
            '<div class="form-status" id="formStatus"></div>';

        this._bindFormEvents();
    },

    _getModelValue: function () {
        var select = document.getElementById('settingModelSelect');
        var customInput = document.getElementById('settingModelCustom');
        if (select.value === '__custom__') {
            return customInput.value.trim();
        }
        return select.value;
    },

    _bindFormEvents: function () {
        var self = this;

        // 模型下拉切换（显示/隐藏自定义输入框）
        document.getElementById('settingModelSelect').addEventListener('change', function () {
            var customInput = document.getElementById('settingModelCustom');
            if (this.value === '__custom__') {
                customInput.style.display = '';
                customInput.focus();
            } else {
                customInput.style.display = 'none';
            }
        });

        // 保存设置
        document.getElementById('btnSaveSettings').addEventListener('click', function () {
            var model = self._getModelValue();
            var config = {
                apiBaseUrl: document.getElementById('settingBaseUrl').value.trim(),
                apiKey: document.getElementById('settingApiKey').value.trim(),
                model: model,
                systemPrompt: document.getElementById('settingPrompt').value.trim(),
                temperature: parseFloat(document.getElementById('settingTemp').value),
                maxTokens: parseInt(document.getElementById('settingMaxTokens').value) || 4096
            };

            // 验证
            if (!config.apiKey) {
                self._showStatus('请输入 API Key', 'error');
                return;
            }
            if (!config.apiBaseUrl) {
                self._showStatus('请输入 API 地址', 'error');
                return;
            }
            if (!config.model) {
                self._showStatus('请选择或输入模型名称', 'error');
                return;
            }

            Config.set(config);
            // G4: 标记 systemPrompt 来源为 'user' (覆盖组件默认值)
            if (config.systemPrompt) {
                Config.set('systemPromptSource', 'user:custom');
            }
            self._showStatus('✅ 设置已保存', 'success');
            ChatUI._updateModelIndicator();

            // 延迟关闭
            setTimeout(function () { self.hide(); }, 1000);
        });

        // 重置默认
        document.getElementById('btnResetConfig').addEventListener('click', function () {
            Config.reset();
            self._renderForm();
            self._showStatus('✅ 已恢复默认设置', 'success');
            ChatUI._updateModelIndicator();
        });

        // 测试连接 (D1)
        document.getElementById('btnTestConnection').addEventListener('click', function () {
            self._testConnection();
        });

        // 显示/隐藏 API Key
        document.getElementById('btnToggleKey').addEventListener('click', function () {
            var input = document.getElementById('settingApiKey');
            if (input.type === 'password') {
                input.type = 'text';
                this.textContent = '🙈 隐藏';
            } else {
                input.type = 'password';
                this.textContent = '👁️ 显示';
            }
        });

        // 温度滑块
        document.getElementById('settingTemp').addEventListener('input', function () {
            document.getElementById('tempValue').textContent = this.value;
        });

        // OpenCode settings binding
        this._bindOpencodeSettings();

        // Mode switcher binding
        this._bindModeSwitcher();
    },

    _bindModeSwitcher: function() {
        var config = Config.getAll();
        var standardRadio = document.getElementById('aiModeStandard');
        var opencodeRadio = document.getElementById('aiModeOpencode');

        if (config.mode === 'opencode' && opencodeRadio) {
            opencodeRadio.checked = true;
        } else if (standardRadio) {
            standardRadio.checked = true;
        }

        var self = this;
        if (standardRadio) {
            standardRadio.addEventListener('change', function() {
                if (standardRadio.checked) {
                    Config.set('mode', 'standard');
                    if (typeof KwToast !== 'undefined') {
                        KwToast.show('已切换到标准模式');
                    }
                    if (typeof self._onModeChange === 'function') {
                        self._onModeChange('standard');
                    }
                }
            });
        }
        if (opencodeRadio) {
            opencodeRadio.addEventListener('change', function() {
                if (opencodeRadio.checked) {
                    Config.set('mode', 'opencode');
                    if (typeof KwToast !== 'undefined') {
                        KwToast.show('已切换到 OpenCode 模式');
                    }
                    if (typeof self._onModeChange === 'function') {
                        self._onModeChange('opencode');
                    }
                }
            });
        }
    },

    _bindOpencodeSettings: function() {
        var config = Config.getAll();
        var urlInput = document.getElementById('opencodeUrlInput');
        var usernameInput = document.getElementById('opencodeUsernameInput');
        var passwordInput = document.getElementById('opencodePasswordInput');
        var toggleBtn = document.getElementById('opencodeTogglePassword');
        var testBtn = document.getElementById('opencodeTestBtn');
        var testResult = document.getElementById('opencodeTestResult');

        if (urlInput) urlInput.value = config.opencodeUrl || '';
        if (usernameInput) usernameInput.value = config.opencodeUsername || '';
        if (passwordInput) passwordInput.value = config.opencodePassword || '';

        if (toggleBtn && passwordInput) {
            toggleBtn.addEventListener('click', function() {
                if (passwordInput.type === 'password') {
                    passwordInput.type = 'text';
                    toggleBtn.textContent = '隐藏';
                } else {
                    passwordInput.type = 'password';
                    toggleBtn.textContent = '显示';
                }
            });
        }

        if (testBtn) {
            testBtn.addEventListener('click', function() {
                if (testResult) {
                    testResult.textContent = '测试中...';
                    testResult.className = 'kw-test-result kw-test-pending';
                }
                var url = (urlInput ? urlInput.value.trim() : '') || 'http://127.0.0.1:4096';
                var username = usernameInput ? usernameInput.value.trim() : '';
                var password = passwordInput ? passwordInput.value.trim() : '';

                fetch(url + '/api/health', {
                    method: 'GET',
                    headers: {
                        'Authorization': 'Basic ' + btoa(username + ':' + password)
                    }
                })
                .then(function(response) {
                    if (response.ok) {
                        if (testResult) {
                            testResult.textContent = '✓ 连接成功';
                            testResult.className = 'kw-test-result kw-test-success';
                        }
                    } else {
                        throw new Error('HTTP ' + response.status);
                    }
                })
                .catch(function(err) {
                    if (testResult) {
                        testResult.textContent = '✗ ' + (err.message || '连接失败');
                        testResult.className = 'kw-test-result kw-test-error';
                    }
                });
            });
        }

        this._bindAgentPreference();
    },

    _bindAgentPreference: function() {
        var config = Config.getAll();
        var agentRow = document.getElementById('opencodeAgentRow');
        var agentSelect = document.getElementById('opencodeAgentSelect');

        if (agentRow) {
            if (config.mode === 'opencode') {
                agentRow.style.display = '';
            } else {
                agentRow.style.display = 'none';
            }
        }

        if (agentSelect) {
            agentSelect.value = config.opencodeAgent || 'plan';

            var self = this;
            agentSelect.addEventListener('change', function() {
                var newAgent = agentSelect.value;
                if (newAgent === 'build') {
                    if (!confirm('⚠️ 警告：build agent 可以执行 bash 命令和编辑文件。\n\n如果您不知道这是什么，请保持 plan agent。\n\n确定要使用 build agent 吗？')) {
                        agentSelect.value = 'plan';
                        return;
                    }
                }
                Config.set('opencodeAgent', newAgent);
                if (typeof KwToast !== 'undefined') {
                    KwToast.show('默认 Agent 已设置为: ' + newAgent);
                }
            });
        }
    },

    /**
     * 测试连接 (D1): 用当前表单值 (不写入 Config) 发一个最小请求.
     * 成功 → 弹绿色提示 + 延迟 (ms).
     * 失败 → 弹错误原因 (401 / 超时 / 网络 等).
     */
    _testConnection: function () {
        var baseUrl = document.getElementById('settingBaseUrl').value.trim();
        var apiKey = document.getElementById('settingApiKey').value.trim();
        var model = this._getModelValue();
        if (!baseUrl || !apiKey || !model) {
            this._showStatus('请先填写 API 地址、Key 和 模型', 'error');
            return;
        }

        var btn = document.getElementById('btnTestConnection');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳ 测试中...';
        }
        this._showStatus('正在测试连接...', 'info');

        var url = baseUrl.replace(/\/+$/, '') + '/chat/completions';
        var startTime = Date.now();
        var self = this;
        var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var timeoutTimer = setTimeout(function () {
            if (controller) {
                try { controller.abort(); } catch (e) { console.debug('[Settings] 中止控制器失败:', e); }
            }
        }, 15000);

        var fetchOpts = {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: 'hi' }],
                max_tokens: 1,
                stream: false
            })
        };
        if (controller) fetchOpts.signal = controller.signal;

        fetch(url, fetchOpts)
            .then(function (response) {
                clearTimeout(timeoutTimer);
                var latency = Date.now() - startTime;
                if (response.ok) {
                    self._showStatus('✅ 连接成功！延迟 ' + latency + 'ms', 'success');
                    return;
                }
                return response.text().then(function (text) {
                    var snippet = String(text || '').slice(0, 120);
                    self._showStatus('❌ ' + response.status + ': ' + snippet, 'error');
                });
            })
            .catch(function (err) {
                clearTimeout(timeoutTimer);
                if (err && err.name === 'AbortError') {
                    self._showStatus('❌ 连接超时 (>15s)。请检查网络或 API 地址', 'error');
                } else {
                    self._showStatus('❌ 网络错误: ' + (err.message || err), 'error');
                }
            })
            .then(function () {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = '🧪 测试连接';
                }
            });
    },

    _showStatus: function (msg, type) {
        var el = document.getElementById('formStatus');
        if (el) {
            el.textContent = msg;
            el.className = 'form-status ' + (type === 'error' ? 'form-error' : 'form-success');
            clearTimeout(el._hideTimer);
            el._hideTimer = setTimeout(function () {
                el.className = 'form-status';
                el.textContent = '';
            }, 3000);
        }
    }
};
