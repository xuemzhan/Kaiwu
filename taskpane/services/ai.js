/**
 * ai.js — AI API 客户端
 * 兼容 OpenAI Chat Completions 格式，支持流式 SSE
 * 默认使用 MiniMax (https://api.minimaxi.com/v1)
 */

var AIService = {
    // Remove reasoning traces returned either as dedicated fields or embedded
    // in content. The unclosed variants matter while a response is streaming.
    stripReasoningContent: function (text) {
        return String(text || '')
            .replace(/```thinking\b[\s\S]*?```/gi, '')
            .replace(/```thinking\b[\s\S]*$/gi, '')
            .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
            .replace(/<think\b[^>]*>[\s\S]*$/gi, '')
            .trimStart();
    },

    // 发送非流式请求
    send: function (messages, onSuccess, onError) {
        var config = Config.getAll();
        if (!config.apiKey) {
            onError && onError('请先在设置中配置 API Key');
            return;
        }

        var url = config.apiBaseUrl.replace(/\/+$/, '') + '/chat/completions';

        fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + config.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: config.model,
                messages: messages,
                temperature: config.temperature,
                max_tokens: config.maxTokens,
                stream: false
            })
        })
        .then(function (response) {
            if (!response.ok) {
                return response.text().then(function (text) {
                    var snippet = String(text || '').slice(0, 200);
                    throw new Error('API 请求失败 (' + response.status + '): ' + snippet);
                });
            }
            return response.json();
        })
        .then(function (data) {
            var message = data.choices && data.choices[0] && data.choices[0].message;
            var content = message && message.content;
            var shouldStrip = Config.isReasoningModel(config.model) || config.stripReasoning !== false;
            if (shouldStrip) content = AIService.stripReasoningContent(content);
            if (content) {
                onSuccess && onSuccess(content);
            } else {
                onError && onError('API 返回了空内容');
            }
        })
        .catch(function (err) {
            onError && onError(err.message || '网络请求失败');
        });
    },

    // 发送流式请求。返回一个 controller: { abort: function() }
    sendStream: function (messages, onChunk, onDone, onError) {
        var config = Config.getAll();
        if (!config.apiKey) {
            onError && onError('请先在设置中配置 API Key');
            return { abort: function () {} };
        }

        var url = config.apiBaseUrl.replace(/\/+$/, '') + '/chat/completions';
        var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
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
                temperature: config.temperature,
                max_tokens: config.maxTokens,
                stream: true
            })
        };
        if (controller) fetchOpts.signal = controller.signal;

        fetch(url, fetchOpts)
        .then(function (response) {
            if (!response.ok) {
                return response.text().then(function (text) {
                    var snippet = String(text || '').slice(0, 200);
                    throw new Error('API 请求失败 (' + response.status + '): ' + snippet);
                });
            }
            return response.body;
        })
        .then(function (body) {
            if (!body) {
                onError && onError('响应体为空');
                return;
            }

            var reader = body.getReader();
            var decoder = new TextDecoder();
            var buffer = '';
            var fullContent = '';
            var visibleContent = '';

            function readChunk() {
                if (aborted) return;
                reader.read().then(function (result) {
                    if (aborted) return;
                    if (result.done) {
                        onDone && onDone(visibleContent);
                        return;
                    }

                    buffer += decoder.decode(result.value, { stream: true });
                    var lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (var i = 0; i < lines.length; i++) {
                        var line = lines[i].trim();
                        if (line.startsWith('data: ')) {
                            var data = line.substring(6);
                            if (data === '[DONE]') continue;
                            try {
                                var json = JSON.parse(data);
                                var delta = json.choices && json.choices[0] && json.choices[0].delta;
                                if (delta) {
                                    // 思考模型返回 reasoning_content (思考过程) + content (最终回复).
                                    // 默认仅拼接 content, 思考过程不会到达用户界面.
                                    var content = delta.content || '';
                                    var chunk;
                                    if (stripReasoning) {
                                        chunk = content;
                                    } else {
                                        chunk = (delta.reasoning_content || '') + content;
                                    }
                                    if (chunk) {
                                        fullContent += chunk;
                                        var nextVisible = stripReasoning
                                            ? AIService.stripReasoningContent(fullContent)
                                            : fullContent;
                                        var visibleChunk = nextVisible.slice(visibleContent.length);
                                        visibleContent = nextVisible;
                                        if (visibleChunk) onChunk && onChunk(visibleChunk, visibleContent);
                                    }
                                }
                            } catch (e) {
                                // 跳过解析失败的块
                            }
                        }
                    }

                    readChunk();
                }).catch(function (err) {
                    if (aborted) return;
                    onError && onError('流式读取失败: ' + err.message);
                });
            }

            readChunk();
        })
        .catch(function (err) {
            if (aborted) return;
            onError && onError(err.message || '网络请求失败');
        });

        return {
            abort: function () {
                aborted = true;
                if (controller) {
                    try { controller.abort(); } catch (e) { /* ignore */ }
                }
            }
        };
    },

    // 构建消息数组
    buildMessages: function (systemPrompt, historyMessages, newUserMessage) {
        var messages = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        // 添加历史消息（只保留最近的20条）
        var recentHistory = historyMessages.slice(-20);
        for (var i = 0; i < recentHistory.length; i++) {
            messages.push({
                role: recentHistory[i].role,
                content: recentHistory[i].content
            });
        }
        if (newUserMessage) {
            messages.push({ role: 'user', content: newUserMessage });
        }
        return messages;
    }
};
