/**
 * opencode-ai.js — OpenCode HTTP API client
 * Routes AI requests through local opencode-cli server (port 4096)
 * Implements same interface as AIService
 */
var OpenCodeAIService = {
    _DEFAULT_TIMEOUT_MS: 60000,
    _RETRYABLE_STATUS: 'retryable',
    _currentAbort: null,
    _reconnectAttempts: 0,
    _maxReconnectAttempts: 5,
    _reconnectTimer: null,

    _buildAuthHeader: function () {
        var config = Config.getAll();
        var username = config.opencodeUsername || 'opencode';
        var password = config.opencodePassword || '';
        return 'Basic ' + btoa(username + ':' + password);
    },

    _getAuthCredentials: function () {
        var config = Config.getAll();
        return {
            username: config.opencodeUsername || 'opencode',
            password: config.opencodePassword || '',
            hasPassword: !!config.opencodePassword
        };
    },

    _logAuthInfo: function () {
        var creds = this._getAuthCredentials();
        var maskedPassword = creds.hasPassword ? '****' : '(empty)';
        console.log('[OpenCodeAI] Auth: username=' + creds.username + ', password=' + maskedPassword);
    },

    _classifyError: function (status, body) {
        var message = '';
        try {
            var parsed = JSON.parse(body);
            message = parsed.error?.message || parsed.message || '';
        } catch (e) {
            message = String(body || '').slice(0, 200);
        }

        switch (status) {
            case 401:
            case 403:
                return {
                    type: 'AuthError',
                    message: '认证失败 (' + status + ')。请检查 opencode 用户名和密码。' + (message ? ' ' + message : ''),
                    retryable: false,
                    status: status
                };
            case 404:
                return {
                    type: 'NotFoundError',
                    message: '资源不存在 (404)。请检查 opencode 服务器地址。',
                    retryable: false,
                    status: status
                };
            case 429:
                return {
                    type: 'RateLimitError',
                    message: '请求过于频繁 (429)。' + (message ? ' ' + message : ''),
                    retryable: true,
                    status: status
                };
            case 500:
            case 502:
            case 503:
            case 504:
                return {
                    type: 'ServerError',
                    message: 'OpenCode 服务异常 (' + status + ')，已自动重试。',
                    retryable: true,
                    status: status
                };
            default:
                if (status >= 500) {
                    return {
                        type: 'ServerError',
                        message: 'OpenCode 服务异常 (' + status + ')。',
                        retryable: true,
                        status: status
                    };
                }
                return {
                    type: 'UnknownError',
                    message: '请求失败 (' + status + '): ' + message,
                    retryable: false,
                    status: status
                };
        }
    },

    _request: function (method, path, body, options, onSuccess, onError) {
        options = options || {};
        var config = Config.getAll();
        var baseUrl = (config.opencodeUrl || 'http://127.0.0.1:4096').replace(/\/+$/, '');
        var url = baseUrl + path;
        var authHeader = this._buildAuthHeader();

        this._logAuthInfo();

        var headers = {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
        };

        var fetchOptions = {
            method: method,
            headers: headers
        };

        if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
            fetchOptions.body = JSON.stringify(body);
        }

        var timeoutMs = options.timeout || this._DEFAULT_TIMEOUT_MS;
        var timeoutPromise = new Promise(function (_, reject) {
            setTimeout(function () { reject(new Error('Request timeout')); }, timeoutMs);
        });

        var self = this;
        Promise.race([fetch(url, fetchOptions), timeoutPromise])
            .then(function (response) {
                if (!response.ok) {
                    return response.text().then(function (body) {
                        var err = self._classifyError(response.status, body);
                        onError && onError(err);
                        return null;
                    });
                }
                return response.json();
            })
            .then(function (data) {
                if (data !== null) {
                    onSuccess && onSuccess(data);
                }
            })
            .catch(function (err) {
                onError && onError({ message: 'Network error: ' + err.message, retryable: true });
            });
    },

    send: function (messages, onSuccess, onError, options) {
        onError && onError('Not implemented');
    },

    sendStream: function (sessionId, messages, onChunk, onComplete, onError, options) {
        var self = this;
        var config = Config.getAll();
        var baseUrl = (config.opencodeUrl || 'http://127.0.0.1:4096').replace(/\/+$/, '');
        var url = baseUrl + '/session/' + sessionId + '/message';
        var authHeader = this._buildAuthHeader();

        self._currentAbort = new AbortController();

        fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: messages,
                agent: config.opencodeAgent || 'plan',
                stream: true
            }),
            signal: self._currentAbort.signal
        }).then(function (response) {
            if (!response.ok) {
                return response.text().then(function (text) {
                    var err = self._classifyError(response.status, text);
                    onError && onError(err);
                    return null;
                });
            }
            var reader = response.body.getReader();
            var decoder = new TextDecoder();
            var buffer = '';
            var fullContent = '';

            function pump() {
                return reader.read().then(function (result) {
                    if (result.done) {
                        onComplete && onComplete(fullContent);
                        return;
                    }
                    buffer += decoder.decode(result.value, { stream: true });
                    var lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    lines.forEach(function (line) {
                        if (line.startsWith('data: ')) {
                            var data = line.slice(6).trim();
                            if (data === '[DONE]') return;
                            try {
                                var parsed = JSON.parse(data);
                                var delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content || parsed.content || '';
                                if (delta) {
                                    fullContent += delta;
                                    onChunk && onChunk(delta, fullContent);
                                }
                            } catch (e) { /* ignore parse errors */ }
                        }
                    });
                    return pump();
                });
            }
            return pump();
        }).catch(function (err) {
            if (err.name !== 'AbortError') {
                onError && onError({ message: 'Stream error: ' + err.message, retryable: true });
            }
        });
    },

    abort: function () {
        if (this._currentAbort) {
            this._currentAbort.abort();
            this._currentAbort = null;
        }
    },

    listSessions: function (onSuccess, onError) {
        onError && onError('Not implemented');
    },

    createSession: function (parentID, title, onSuccess, onError) {
        onError && onError('Not implemented');
    },

    testConnection: function (onSuccess, onError) {
        var self = this;
        var config = Config.getAll();
        var baseUrl = (config.opencodeUrl || 'http://127.0.0.1:4096').replace(/\/+$/, '');
        var url = baseUrl + '/api/health';
        var authHeader = this._buildAuthHeader();

        fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': authHeader
            }
        })
        .then(function(response) {
            if (response.ok) {
                onSuccess && onSuccess({ status: 'connected', url: baseUrl });
            } else if (response.status === 401 || response.status === 403) {
                onError && onError({ message: '认证失败，请检查用户名和密码' });
            } else {
                onError && onError({ message: '连接失败 (HTTP ' + response.status + ')' });
            }
        })
        .catch(function(err) {
            onError && onError({ message: err.message || '无法连接到服务器，请检查 opencode 是否运行' });
        });
    },

    _reconnect: function (onSuccess, onFailure) {
        var self = this;
        self._reconnectAttempts = 0;

        function attempt() {
            self._reconnectAttempts++;
            var delay = Math.min(30000, 1000 * Math.pow(2, self._reconnectAttempts - 1));

            self._reconnectTimer = setTimeout(function () {
                self.testConnection(
                    function (info) {
                        self._reconnectAttempts = 0;
                        onSuccess && onSuccess(info);
                    },
                    function (err) {
                        if (self._reconnectAttempts >= self._maxReconnectAttempts) {
                            onFailure && onFailure(err);
                            return;
                        }
                        attempt();
                    }
                );
            }, delay);
        }

        attempt();
    },

    cancelReconnect: function () {
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        this._reconnectAttempts = 0;
    },

    mapModifyAction: function (actionId, text, context) {
        var modifyPrompts = {
            polish_quick: {
                system: '你是一个专业的中文写作润色助手。',
                user: '请对以下文字进行润色，保持原意，提升表达质量和可读性。只返回润色后的正文：\n\n' + (text || '')
            },
            polish_formal: {
                system: '你是一个正式文书写作助手，擅长办公、公文和商务表达。',
                user: '请将以下文字改写得更加正式、严谨、适合办公文档。保持原意，只返回改写后的正文：\n\n' + (text || '')
            },
            polish_government: {
                system: '你熟悉党政机关、公文材料和政务表达风格。',
                user: '请将以下文字调整为更符合党政机关、公文材料的表达风格。保持原意，只返回正文：\n\n' + (text || '')
            },
            correct: {
                system: '你是一个中文校对与纠错助手。',
                user: '请修正以下文字中的错别字、病句、标点和明显语法问题。保持原意，只返回修正后的正文：\n\n' + (text || '')
            },
            expand: {
                system: '你是一个内容扩写助手，擅长补充细节、论据和表达层次。',
                user: '请对以下内容进行扩写，增加细节、论据和表达层次，保持原文观点不变。只返回扩写后的正文：\n\n' + (text || '')
            },
            shrink: {
                system: '你是一个内容压缩助手，擅长提炼重点。',
                user: '请将以下内容缩写为更简洁的版本，保留核心信息。只返回缩写结果：\n\n' + (text || '')
            },
            rewrite: {
                system: '你是一个中文改写助手，擅长优化句式和表达方式。',
                user: '请改写以下文字，优化表达方式和句式结构，提升可读性，但保持原意不变。只返回改写后的正文：\n\n' + (text || '')
            },
            translate: {
                system: '你是一个专业翻译助手。',
                user: '请翻译以下文字。如果原文是中文，请翻译成英文；如果原文不是中文，请翻译成中文。只返回译文：\n\n' + (text || '')
            }
        };

        var prompt = modifyPrompts[actionId];
        if (!prompt) {
            return {
                system: '你是一个助手，请根据用户输入回答问题。',
                user: text || '请帮我处理这段内容'
            };
        }
        return prompt;
    },

    mapLayoutAction: function (actionId, documentText, options) {
        var layoutPrompts = {
            ai_layout: {
                system: '你是一个专业的文档排版助手，擅长将内容按照规范的论文或公文格式重新组织。',
                user: '请将以下内容按照标准论文格式重新排版，包含：标题、摘要、关键词、正文、参考文献。只返回排版后的Markdown内容：\n\n' + (documentText || '')
            },
            mindmap: {
                system: '你是一个思维导图生成助手，擅长将文档内容转化为Mermaid格式的思维导图。',
                user: '请将以下文档内容转化为Mermaid mindmap语法格式的思维导图。只返回Mermaid代码：\n\n```mermaid\nmindmap\n' + (documentText || '') + '\n```'
            },
            doc_to_ppt: {
                system: '你是一个专业的演示文稿结构设计师，擅长将文档内容转化为清晰的PPT大纲。',
                user: '请分析以下文档内容，生成一个5-10页的PPT大纲。每页包含：\n- 页面标题\n- 3-5个要点（简洁、有信息量）\n- 建议的视觉元素（图表/图片/表格）\n\n文档内容：\n' + (documentText || '')
            }
        };

        var prompt = layoutPrompts[actionId];
        if (!prompt) {
            return {
                system: '你是一个助手。',
                user: documentText || ''
            };
        }
        return prompt;
    },

    mapDocumentAction: function (actionId, documentText, query) {
        var docPrompts = {
            summarize: {
                system: '你是一个文档摘要助手。',
                user: '请为以下文字生成简洁摘要，提炼核心要点。输出应适合插入文档：\n\n' + (documentText || '')
            },
            doc_summary: {
                system: '你是一个文档总结助手，擅长从长文档中提炼结构和结论。',
                user: '请总结以下文档内容，按"一句话总结、核心要点、结构大纲、行动建议"输出：\n\n' + (documentText || '')
            },
            doc_qa: {
                system: '你是一个文档问答助手。基于提供的文档内容回答用户问题。如果无法从文档中找到答案，请明确说明。',
                user: '文档内容：\n' + (documentText || '') + '\n\n问题：' + (query || '请总结这份文档')
            },
            talk_doc: {
                system: '你是一个专业的文档讲解助手，擅长将书面内容转化为适合朗读的叙述性语言。',
                user: '请将以下文档内容改写为适合朗读讲解的脚本，使用自然流畅的口语化表达，保留核心信息：\n\n' + (documentText || '')
            }
        };

        var prompt = docPrompts[actionId];
        if (!prompt) {
            return {
                system: '你是一个助手，请根据用户输入回答问题。',
                user: '请帮我处理这份文档'
            };
        }
        return prompt;
    },

    mapSpecializedAction: function (actionId, input, options) {
        var specPrompts = {
            legal: {
                system: '你是一个专业的法律助手，熟悉中国法律体系，擅长解答法律问题、解释法律条款、分析法律关系。请使用专业、严谨的法律语言，必要时引用相关法律条文。',
                user: '请回答以下法律问题：\n\n' + (input || '')
            },
            deep_think: {
                system: '你是一个深度分析助手。请深入分析问题，逐步推理，详尽考虑各方面因素，给出全面而有深度的回答。请直接给出分析结果。',
                user: '请深入分析以下问题：\n\n' + (input || '')
            },
            gen_image: {
                system: '你是一个图片描述生成助手。请将用户的描述转换为一个详细、生动的图片场景描述，适合用于AI绘图。',
                user: '请为以下描述生成详细的图片场景描述：\n\n' + (input || '')
            },
            summary_image: {
                system: '你是一个文档可视化助手。请将文档内容总结为一个信息图场景描述。',
                user: '请将以下文档内容总结为一个适合作为信息图的视觉场景描述：\n\n' + (input || '')
            }
        };

        var prompt = specPrompts[actionId];
        if (!prompt) {
            return {
                system: '你是一个助手。',
                user: input || ''
            };
        }
        return prompt;
    }
};
