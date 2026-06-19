/**
 * opencode-ai.js — OpenCode HTTP API client
 * Routes AI requests through local opencode-cli server (port 4096)
 * Implements same interface as AIService
 */
var OpenCodeAIService = {
    _DEFAULT_TIMEOUT_MS: 60000,
    _RETRYABLE_STATUS: 'retryable',
    _currentAbort: null,

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
        onError && onError('Not implemented');
    }
};
