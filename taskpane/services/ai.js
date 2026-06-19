/**
 * ai.js — AI API 客户端
 * 兼容 OpenAI Chat Completions 格式，支持流式 SSE
 * 默认使用 MiniMax (https://api.minimaxi.com/v1)
 *
 * 优化点:
 *   - SSE 解析健壮化 (兼容 data: / data: <space> / \r\n / [DONE] 后清空 buffer / 注释行)
 *   - 错误按 HTTP 状态分类提示 (401/403/404/429/5xx/超时)
 *   - 可选: 超时 (默认 60s) + 指数退避重试 (默认 1 次)
 *   - 增量 stripThinking: 仅在 chunk 增量里检测 <think>/```thinking 标签
 */
var AIService = {
    _DEFAULT_TIMEOUT_MS: 60000,
    _DEFAULT_RETRIES: 1,
    _RETRYABLE_STATUS: 'retryable',  // marker, set in classifyError
    _RETRY_DELAY_MS: 800,

    // Remove reasoning traces returned either as dedicated fields or embedded
    // in content. The unclosed variants matter while a response is streaming.
    // Delegates to KwUtils.stripThinking so all modules share one regex set.
    stripReasoningContent: function (text) {
        return (typeof KwUtils !== 'undefined' && KwUtils.stripThinking)
            ? KwUtils.stripThinking(text)
            : String(text || '').replace(/```thinking\b[\s\S]*?```/gi, '')
                .replace(/```thinking\b[\s\S]*$/gi, '')
                .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
                .replace(/<think\b[^>]*>[\s\S]*$/gi, '')
                .trimStart();
    },

    /**
     * 按 HTTP 状态码生成中文友好错误. 返回 { message, retryable }.
     */
    _classifyError: function (status, rawText) {
        var msg = String(rawText || '').slice(0, 200);
        // 尝试解析 OpenAI 标准错误体
        var apiMsg = '';
        try {
            var j = JSON.parse(msg);
            if (j && j.error) {
                apiMsg = j.error.message || j.error.type || '';
            }
        } catch (e) { /* not json */ }
        switch (status) {
            case 401:
                return { message: 'API Key 无效或已过期 (401)。请到 ⚙️ 设置检查 API Key。' + (apiMsg ? ' ' + apiMsg : ''), retryable: false };
            case 403:
                return { message: 'API Key 权限不足 (403)。' + (apiMsg ? ' ' + apiMsg : ''), retryable: false };
            case 404:
                return { message: 'API 地址或模型名称不存在 (404)。请检查 Base URL 和 Model 名称。' + (apiMsg ? ' ' + apiMsg : ''), retryable: false };
            case 408:
            case 504:
                return { message: '服务器响应超时 (' + status + ')，已自动重试。', retryable: true };
            case 429:
                return { message: '请求过于频繁 (429)，已达速率上限。' + (apiMsg ? ' ' + apiMsg : ''), retryable: true };
            case 500:
            case 502:
            case 503:
                return { message: 'AI 服务暂不可用 (' + status + ')，已自动重试。', retryable: true };
            default:
                if (status >= 500) return { message: 'AI 服务异常 (' + status + ')。', retryable: true };
                return { message: 'API 请求失败 (' + status + '): ' + msg, retryable: false };
        }
    },

    // 发送非流式请求
    send: function (messages, onSuccess, onError, options) {
        var config = Config.getAll();
        if (!config.apiKey) {
            onError && onError('请先在设置中配置 API Key');
            return;
        }
        options = options || {};

        var url = config.apiBaseUrl.replace(/\/+$/, '') + '/chat/completions';

        var self = this;
        this._fetchWithRetry(url, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + config.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: config.model,
                messages: messages,
                temperature: options.temperature != null ? options.temperature : config.temperature,
                max_tokens: options.maxTokens != null ? options.maxTokens : config.maxTokens,
                stream: false
            })
        }).then(function (response) {
            return response.json();
        }).then(function (data) {
            var message = data.choices && data.choices[0] && data.choices[0].message;
            var content = message && message.content;
            var shouldStrip = Config.isReasoningModel(config.model) || config.stripReasoning !== false;
            if (shouldStrip) content = self.stripReasoningContent(content);
            if (content) {
                onSuccess && onSuccess(content);
            } else {
                onError && onError('API 返回了空内容');
            }
        }).catch(function (err) {
            onError && onError(err.message || '网络请求失败');
        });
    },

    // 发送流式请求。返回一个 controller: { abort: function() }
    sendStream: function (messages, onChunk, onDone, onError, options) {
        var config = Config.getAll();
        if (!config.apiKey) {
            onError && onError('请先在设置中配置 API Key');
            return { abort: function () {} };
        }
        options = options || {};

        var url = config.apiBaseUrl.replace(/\/+$/, '') + '/chat/completions';
        var self = this;
        var streamController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var aborted = false;
        // Reasoning models always hide their reasoning trace. For other models
        // the existing stripReasoning preference remains available.
        var stripReasoning = Config.isReasoningModel(config.model) || config.stripReasoning !== false;

        var fetchOpts = {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + config.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: config.model,
                messages: messages,
                temperature: options.temperature != null ? options.temperature : config.temperature,
                max_tokens: options.maxTokens != null ? options.maxTokens : config.maxTokens,
                stream: true
            })
        };
        if (streamController) fetchOpts.signal = streamController.signal;

        var fetchPromise = this._fetchWithRetry(url, fetchOpts);

        fetchPromise.then(function (response) {
            return response.body;
        }).then(function (body) {
            if (!body) return;
            self._readSSE(body, {
                stripReasoning: stripReasoning,
                aborted: function () { return aborted; },
                onChunk: onChunk,
                onDone: onDone,
                onError: onError
            });
        }).catch(function (err) {
            if (aborted) return;
            onError && onError(err.message || '网络请求失败');
        });

        return {
            abort: function () {
                aborted = true;
                if (streamController) {
                    try { streamController.abort(); } catch (e) { /* ignore */ }
                }
            }
        };
    },

    /**
     * 带超时 + 指数退避重试的 fetch 封装.
     * 成功 resolve 到 Response 对象; 失败 reject (调用方的 .catch 处理).
     *
     * 重试策略: 只对瞬态错误重试 (超时 / 5xx / 429).
     * 网络错误 (DNS / 不可达) 视为永久错误, 直接失败 — 避免 800ms 延迟掩盖问题.
     */
    _fetchWithRetry: function (url, baseOpts) {
        var self = this;
        var timeoutMs = self._DEFAULT_TIMEOUT_MS;
        var maxRetries = self._DEFAULT_RETRIES;
        var attempt = 0;

        function tryOnce() {
            var composedOpts = Object.assign({}, baseOpts);
            var timeoutController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
            // 合并用户传入的 signal (例如 sendStream 的 streamController) 与 超时 signal
            if (baseOpts.signal && timeoutController) {
                var userSignal = baseOpts.signal;
                var onUserAbort = function () { try { timeoutController.abort(); } catch (e) { console.debug('[AI] 中止超时控制器失败:', e); } };
                if (userSignal.aborted) onUserAbort();
                else userSignal.addEventListener('abort', onUserAbort, { once: true });
            }
            if (timeoutController) composedOpts.signal = timeoutController.signal;

            var timer = setTimeout(function () {
                if (timeoutController) {
                    try { timeoutController.abort(); } catch (e) { /* ignore */ }
                }
            }, timeoutMs);

            return fetch(url, composedOpts)
                .catch(function (fetchErr) {
                    clearTimeout(timer);
                    if (fetchErr && fetchErr.name === 'AbortError') {
                        // 超时 — 可能是网络瞬断, 值得重试
                        var err = new Error('AI 响应超时 (>' + Math.round(timeoutMs / 1000) + 's)');
                        err.retryable = true;
                        throw err;
                    }
                    // 其他网络错误 (DNS 失败 / 主机不可达) — 通常是永久错误, 不重试
                    var err2 = new Error('网络请求失败: ' + (fetchErr && fetchErr.message || fetchErr));
                    err2.retryable = false;
                    throw err2;
                })
                .then(function (response) {
                    clearTimeout(timer);
                    if (!response.ok) {
                        return response.text().then(function (text) {
                            var cls = self._classifyError(response.status, text);
                            var err = new Error(cls.message);
                            err.retryable = cls.retryable;
                            err.status = response.status;
                            throw err;
                        });
                    }
                    return response;
                });
        }

        function attemptWithRetry() {
            return tryOnce().catch(function (err) {
                if (err && err.retryable && attempt < maxRetries) {
                    attempt++;
                    var delay = self._RETRY_DELAY_MS * Math.pow(2, attempt - 1);
                    return new Promise(function (resolve) {
                        setTimeout(function () { resolve(attemptWithRetry()); }, delay);
                    });
                }
                throw err;
            });
        }

        return attemptWithRetry();
    },

    /**
     * 读取 SSE 响应流, 解析出 content 增量并调用 onChunk.
     * 健壮性:
     *   - 兼容 'data: ' 与 'data:' 两种前缀
     *   - 兼容 \r\n / 心跳行 (':' 开头)
     *   - [DONE] 后清空 buffer
     *   - 解析失败累计 > 5 次则中止
     */
    _readSSE: function (body, options) {
        var self = this;
        var reader = body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';
        var fullContent = '';
        var visibleContent = '';
        var parseFailCount = 0;
        var MAX_PARSE_FAILS = 5;
        var inThinkBlock = false;
        var inThinkFence = false;
        var thinkBuffer = '';

        function readChunk() {
            if (options.aborted()) return;
            reader.read().then(function (result) {
                if (options.aborted()) return;
                if (result.done) {
                    options.onDone && options.onDone(visibleContent);
                    return;
                }

                buffer += decoder.decode(result.value, { stream: true });
                // 兼容 \r\n
                buffer = buffer.replace(/\r/g, '');
                var lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i];
                    if (!line) continue;
                    // SSE 注释 / 心跳行
                    if (line.charAt(0) === ':') continue;
                    var data;
                    if (line.indexOf('data:') === 0) {
                        data = line.substring(5);
                        if (data.charAt(0) === ' ') data = data.substring(1);
                    } else {
                        continue;
                    }
                    if (data === '[DONE]') {
                        buffer = '';
                        continue;
                    }
                    if (!data) continue;
                    try {
                        var json = JSON.parse(data);
                        var delta = json.choices && json.choices[0] && json.choices[0].delta;
                        if (!delta) continue;
                        var content = delta.content || '';
                        var chunk;
                        if (options.stripReasoning) {
                            chunk = content;
                        } else {
                            chunk = (delta.reasoning_content || '') + content;
                        }
                        if (!chunk) continue;
                        fullContent += chunk;

                        if (options.stripReasoning) {
                            // 增量式处理 think 块：跟踪状态并剥离
                            var result = self._processChunkWithThinking(chunk, {
                                inThink: inThinkBlock,
                                inFence: inThinkFence,
                                thinkBuffer: thinkBuffer
                            });
                            inThinkBlock = result.inThink;
                            inThinkFence = result.inFence;
                            thinkBuffer = result.thinkBuffer;
                            var visibleChunk = result.visibleContent;
                            if (visibleChunk) {
                                visibleContent += visibleChunk;
                                options.onChunk && options.onChunk(visibleChunk, visibleContent);
                            }
                        } else {
                            visibleContent = fullContent;
                            options.onChunk && options.onChunk(chunk, visibleContent);
                        }
                        parseFailCount = 0;
                    } catch (e) {
                        parseFailCount++;
                        if (parseFailCount > MAX_PARSE_FAILS) {
                            options.onError && options.onError('SSE 解析失败次数过多 (数据可能不兼容)');
                            return;
                        }
                    }
                }

                readChunk();
            }).catch(function (err) {
                if (options.aborted()) return;
                options.onError && options.onError('流式读取失败: ' + (err.message || err));
            });
        }

        readChunk();
    },

    /**
     * 处理单次 delta 内的 thinking 标记, 跟踪是否仍处于 think 块内.
     */
    _processStreamingThinking: function (chunk, state) {
        var c = String(chunk || '');
        var inFence = !!state.inFence;
        var inThink = !!state.inThink;
        var i = 0;
        while (i < c.length) {
            if (inFence) {
                var closeFence = c.indexOf('```', i);
                if (closeFence === -1) { i = c.length; break; }
                inFence = false;
                i = closeFence + 3;
            } else if (inThink) {
                var closeTag = c.indexOf('</think>', i);
                if (closeTag === -1) { i = c.length; break; }
                inThink = false;
                i = closeTag + 8;
            } else {
                var openFence = c.indexOf('```thinking', i);
                var openTag = c.indexOf('<think>', i);
                var nextOpen = -1, kind = null;
                if (openFence !== -1 && (openTag === -1 || openFence < openTag)) {
                    nextOpen = openFence;
                    kind = 'fence';
                } else if (openTag !== -1) {
                    nextOpen = openTag;
                    kind = 'tag';
                }
                if (nextOpen === -1) break;
                if (kind === 'fence') inFence = true;
                else inThink = true;
                i = nextOpen + (kind === 'fence' ? 11 : 7);
            }
        }
        return { inThink: inThink, inFence: inFence };
    },

    /**
     * 增量式处理 chunk 内容，正确剥离 think 块。
     * 支持 think 标签跨 chunk 的情况。
     */
    _processChunkWithThinking: function (chunk, state) {
        var c = String(chunk || '');
        var inFence = !!state.inFence;
        var inThink = !!state.inThink;
        var thinkBuffer = state.thinkBuffer || '';
        var visibleContent = '';

        var i = 0;
        while (i < c.length) {
            if (inFence) {
                // 在 think fence 块中，寻找闭合标记
                var closeFence = c.indexOf('```', i);
                if (closeFence === -1) {
                    // 未找到闭合标记，整个剩余内容都是 think 块
                    thinkBuffer += c.substring(i);
                    i = c.length;
                    break;
                }
                // 找到闭合标记，跳出 think 块
                thinkBuffer += c.substring(i, closeFence);
                inFence = false;
                i = closeFence + 3;
            } else if (inThink) {
                // 在 <think> 块中，寻找闭合标记
                var closeTag = c.indexOf('</think>', i);
                if (closeTag === -1) {
                    // 未找到闭合标记，整个剩余内容都是 think 块
                    thinkBuffer += c.substring(i);
                    i = c.length;
                    break;
                }
                // 找到闭合标记，跳出 think 块
                thinkBuffer += c.substring(i, closeTag);
                inThink = false;
                i = closeTag + 8;
            } else {
                // 不在 think 块中，寻找开始标记
                var openFence = c.indexOf('```thinking', i);
                var openTag = c.indexOf('<think>', i);
                var nextOpen = -1, kind = null;
                if (openFence !== -1 && (openTag === -1 || openFence < openTag)) {
                    nextOpen = openFence;
                    kind = 'fence';
                } else if (openTag !== -1) {
                    nextOpen = openTag;
                    kind = 'tag';
                }

                if (nextOpen === -1) {
                    // 没有找到开始标记，整个剩余内容都是可见内容
                    visibleContent += c.substring(i);
                    i = c.length;
                    break;
                }

                // 输出开始标记之前的内容
                if (nextOpen > i) {
                    visibleContent += c.substring(i, nextOpen);
                }

                // 进入 think 块
                if (kind === 'fence') {
                    inFence = true;
                    i = nextOpen + 11; // '```thinking' 的长度
                } else {
                    inThink = true;
                    i = nextOpen + 7; // '<think>' 的长度
                }
            }
        }

        return {
            inThink: inThink,
            inFence: inFence,
            thinkBuffer: thinkBuffer,
            visibleContent: visibleContent
        };
    },

    // 构建消息数组
    buildMessages: function (systemPrompt, historyMessages, newUserMessage, options) {
        options = options || {};
        var maxHistory = options.maxHistoryMessages || 20;
        var messages = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        var recentHistory = historyMessages.slice(-maxHistory);
        for (var i = 0; i < recentHistory.length; i++) {
            var msg = recentHistory[i];
            messages.push({ role: msg.role, content: msg.content });
        }
        if (newUserMessage) {
            messages.push({ role: 'user', content: newUserMessage });
        }
        return messages;
    }
};
