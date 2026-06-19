/**
 * tests/opencode-ai.test.js — OpenCodeAIService 单元测试
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts } = require('./_setup');

function loadServiceWithMock(fetchMock) {
    const env = makeEnv();
    env.window.__ENV_API_KEY__ = 'sk-test';
    env.window.__ENV_API_BASE__ = 'https://api.test.com/v1';
    env.window.__ENV_MODEL__ = 'test-model';
    env.window.fetch = fetchMock;
    loadScripts(env.window, ['taskpane/services/config.js', 'taskpane/services/opencode-ai.js']);
    return { ...env, OpenCodeAIService: env.window.OpenCodeAIService, Config: env.window.Config };
}

function loadService() {
    const env = makeEnv();
    env.window.__ENV_API_KEY__ = 'sk-test';
    env.window.__ENV_API_BASE__ = 'https://api.test.com/v1';
    env.window.__ENV_MODEL__ = 'test-model';
    loadScripts(env.window, ['taskpane/services/config.js', 'taskpane/services/opencode-ai.js']);
    return { ...env, OpenCodeAIService: env.window.OpenCodeAIService, Config: env.window.Config };
}

function loadService() {
    const env = makeEnv();
    env.window.__ENV_API_KEY__ = 'sk-test';
    env.window.__ENV_API_BASE__ = 'https://api.test.com/v1';
    env.window.__ENV_MODEL__ = 'test-model';
    loadScripts(env.window, ['taskpane/services/config.js', 'taskpane/services/opencode-ai.js']);
    return { ...env, OpenCodeAIService: env.window.OpenCodeAIService, Config: env.window.Config };
}

test('OpenCodeAIService: _request sends correct headers', () => {
    let capturedFetch = null;
    const fetchMock = async (url, options) => {
        capturedFetch = { url, options };
        return { ok: true, json: async () => ({ result: 'ok' }), text: async () => '' };
    };
    const { OpenCodeAIService, Config } = loadServiceWithMock(fetchMock);
    Config.init();

    return new Promise((resolve) => {
        OpenCodeAIService._request('GET', '/session', null, {},
            (data) => {
                assert.ok(capturedFetch !== null, 'fetch should have been called');
                assert.ok(capturedFetch.options.headers.Authorization.startsWith('Basic '), 'Authorization should be Basic auth');
                assert.equal(capturedFetch.options.headers['Content-Type'], 'application/json');
                resolve();
            },
            (err) => assert.fail(err.message)
        );
    });
});

test('OpenCodeAIService: _request constructs correct URL', () => {
    let capturedFetch = null;
    const fetchMock = async (url, options) => {
        capturedFetch = { url, options };
        return { ok: true, json: async () => ({ result: 'ok' }), text: async () => '' };
    };
    const { OpenCodeAIService, Config } = loadServiceWithMock(fetchMock);
    Config.init();

    return new Promise((resolve) => {
        OpenCodeAIService._request('GET', '/api/sessions', null, {},
            (data) => {
                assert.ok(capturedFetch.url.includes('/api/sessions'), 'URL should include path');
                resolve();
            },
            (err) => assert.fail(err.message)
        );
    });
});

test('OpenCodeAIService: _request includes body for POST', () => {
    let capturedFetch = null;
    const fetchMock = async (url, options) => {
        capturedFetch = { url, options };
        return { ok: true, json: async () => ({ result: 'ok' }), text: async () => '' };
    };
    const { OpenCodeAIService, Config } = loadServiceWithMock(fetchMock);
    Config.init();

    const body = { messages: [{ role: 'user', content: 'hello' }] };

    return new Promise((resolve) => {
        OpenCodeAIService._request('POST', '/chat', body, {},
            (data) => {
                assert.ok(capturedFetch.options.body, 'body should be included');
                assert.ok(JSON.parse(capturedFetch.options.body).messages, 'body should contain messages');
                resolve();
            },
            (err) => assert.fail(err.message)
        );
    });
});

test('OpenCodeAIService: _request handles timeout', () => {
    const fetchMock = async () => new Promise(() => { });
    const { OpenCodeAIService, Config } = loadServiceWithMock(fetchMock);
    Config.init();

    return new Promise((resolve) => {
        OpenCodeAIService._request('GET', '/session', null, { timeout: 50 },
            (data) => assert.fail('should not succeed'),
            (err) => {
                assert.ok(err.message.includes('timeout') || err.message.includes('Network error'), 'should receive timeout error');
                resolve();
            }
        );
    });
});

test('OpenCodeAIService: _request handles HTTP error', () => {
    const fetchMock = async () => {
        return {
            ok: false,
            status: 401,
            json: async () => ({ error: 'unauthorized' }),
            text: async () => JSON.stringify({ error: 'unauthorized' })
        };
    };
    const { OpenCodeAIService, Config } = loadServiceWithMock(fetchMock);
    Config.init();

    return new Promise((resolve) => {
        OpenCodeAIService._request('GET', '/session', null, {},
            (data) => assert.fail('should not succeed'),
            (err) => {
                assert.equal(err.status, 401);
                assert.ok(err.message.includes('Unauthorized') || err.message.includes('认证失败'), 'should have unauthorized message');
                resolve();
            }
        );
    });
});

test('OpenCodeAIService: _request handles 500 error as retryable', () => {
    const fetchMock = async () => {
        return {
            ok: false,
            status: 500,
            json: async () => ({ error: 'internal error' }),
            text: async () => JSON.stringify({ error: 'internal error' })
        };
    };
    const { OpenCodeAIService, Config } = loadServiceWithMock(fetchMock);
    Config.init();

    return new Promise((resolve) => {
        OpenCodeAIService._request('GET', '/session', null, {},
            (data) => assert.fail('should not succeed'),
            (err) => {
                assert.equal(err.status, 500);
                assert.equal(err.retryable, true, '500 errors should be retryable');
                resolve();
            }
        );
    });
});

test('OpenCodeAIService: _request handles success response', () => {
    const fetchMock = async () => {
        return {
            ok: true,
            json: async () => ({ sessions: [{ id: '1', title: 'Test' }] }),
            text: async () => ''
        };
    };
    const { OpenCodeAIService, Config } = loadServiceWithMock(fetchMock);
    Config.init();

    return new Promise((resolve) => {
        OpenCodeAIService._request('GET', '/sessions', null, {},
            (data) => {
                assert.ok(data.sessions, 'should receive parsed JSON data');
                assert.equal(data.sessions.length, 1);
                resolve();
            },
            (err) => assert.fail(err.message)
        );
    });
});

test('OpenCodeAIService: _classifyError returns correct error info', () => {
    const { OpenCodeAIService } = loadService();

    const err401 = OpenCodeAIService._classifyError(401, '');
    assert.equal(err401.status, 401);
    assert.equal(err401.retryable, false);

    const err429 = OpenCodeAIService._classifyError(429, '');
    assert.equal(err429.status, 429);
    assert.equal(err429.retryable, true);

    const err500 = OpenCodeAIService._classifyError(500, '');
    assert.equal(err500.status, 500);
    assert.equal(err500.retryable, true);

    const err404 = OpenCodeAIService._classifyError(404, '');
    assert.equal(err404.status, 404);
    assert.equal(err404.retryable, false);
});

test('OpenCodeAIService: classifies 401 as AuthError', () => {
    const env = makeEnv();
    loadScripts(env.window, ['taskpane/services/config.js', 'taskpane/services/opencode-ai.js']);
    const svc = env.window.OpenCodeAIService;
    const err = svc._classifyError(401, '');
    assert.equal(err.type, 'AuthError');
    assert.equal(err.retryable, false);
});

test('OpenCodeAIService: classifies 429 as retryable', () => {
    const env = makeEnv();
    loadScripts(env.window, ['taskpane/services/config.js', 'taskpane/services/opencode-ai.js']);
    const svc = env.window.OpenCodeAIService;
    const err = svc._classifyError(429, '');
    assert.equal(err.type, 'RateLimitError');
    assert.equal(err.retryable, true);
});

test('OpenCodeAIService: classifies 500 as ServerError', () => {
    const env = makeEnv();
    loadScripts(env.window, ['taskpane/services/config.js', 'taskpane/services/opencode-ai.js']);
    const svc = env.window.OpenCodeAIService;
    const err = svc._classifyError(500, '');
    assert.equal(err.type, 'ServerError');
    assert.equal(err.retryable, true);
});

test('OpenCodeAIService: _buildAuthHeader returns Basic auth string', () => {
    const { OpenCodeAIService, Config } = loadService();
    Config.init();
    const header = OpenCodeAIService._buildAuthHeader();
    assert.ok(header.startsWith('Basic '), 'Auth header should start with "Basic "');
    assert.ok(header.length > 7, 'Auth header should have encoded content');
});

test('OpenCodeAIService: _buildAuthHeader uses default username when not set', () => {
    const { OpenCodeAIService, Config } = loadService();
    Config.init();
    const header = OpenCodeAIService._buildAuthHeader();
    const decoded = Buffer.from(header.slice(6), 'base64').toString();
    assert.ok(decoded.startsWith('opencode:'), 'Should use default username "opencode"');
});

test('OpenCodeAIService: _buildAuthHeader uses custom username', () => {
    const { OpenCodeAIService, Config, window } = loadService();
    window.localStorage.setItem('wps_assistant_config', JSON.stringify({
        opencodeUsername: 'customuser',
        opencodePassword: ''
    }));
    Config._data = null;
    Config.init();
    const header = OpenCodeAIService._buildAuthHeader();
    const decoded = Buffer.from(header.slice(6), 'base64').toString();
    assert.ok(decoded.startsWith('customuser:'), 'Should use custom username');
});

test('OpenCodeAIService: _buildAuthHeader includes password when set', () => {
    const { OpenCodeAIService, Config, window } = loadService();
    window.localStorage.setItem('wps_assistant_config', JSON.stringify({
        opencodeUsername: 'testuser',
        opencodePassword: 'testpass'
    }));
    Config._data = null;
    Config.init();
    const header = OpenCodeAIService._buildAuthHeader();
    const decoded = Buffer.from(header.slice(6), 'base64').toString();
    assert.equal(decoded, 'testuser:testpass', 'Should include password in auth header');
});

test('OpenCodeAIService: _getAuthCredentials returns correct structure', () => {
    const { OpenCodeAIService, Config } = loadService();
    Config.init();
    const creds = OpenCodeAIService._getAuthCredentials();
    assert.ok(typeof creds === 'object', 'Should return an object');
    assert.ok('username' in creds, 'Should have username');
    assert.ok('password' in creds, 'Should have password');
    assert.ok('hasPassword' in creds, 'Should have hasPassword');
    assert.equal(creds.username, 'opencode', 'Should have default username');
    assert.equal(creds.hasPassword, false, 'Should have no password by default');
});

test('OpenCodeAIService: _getAuthCredentials detects password presence', () => {
    const { OpenCodeAIService, Config, window } = loadService();
    window.localStorage.setItem('wps_assistant_config', JSON.stringify({
        opencodeUsername: 'user',
        opencodePassword: 'secret'
    }));
    Config._data = null;
    Config.init();
    const creds = OpenCodeAIService._getAuthCredentials();
    assert.equal(creds.hasPassword, true, 'Should detect password is set');
    assert.equal(creds.password, 'secret', 'Should return password');
});

test('OpenCodeAIService: empty password is handled correctly', () => {
    const { OpenCodeAIService, Config, window } = loadService();
    window.localStorage.setItem('wps_assistant_config', JSON.stringify({
        opencodeUsername: 'user',
        opencodePassword: ''
    }));
    Config._data = null;
    Config.init();
    const header = OpenCodeAIService._buildAuthHeader();
    const decoded = Buffer.from(header.slice(6), 'base64').toString();
    assert.equal(decoded, 'user:', 'Should handle empty password');
});

function makeSSE(chunks) {
    const text = chunks.join('\n') + '\n';
    const body = new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode(text));
            controller.close();
        }
    });
    return { ok: true, status: 200, body, text: () => Promise.resolve(text) };
}

function loadServiceWithMockFetch(mockFetchFn) {
    const env = makeEnv();
    env.window.__ENV_API_KEY__ = 'sk-test';
    env.window.__ENV_API_BASE__ = 'https://api.test.com/v1';
    env.window.__ENV_MODEL__ = 'test-model';
    env.window.fetch = mockFetchFn;
    loadScripts(env.window, ['taskpane/services/config.js', 'taskpane/services/opencode-ai.js']);
    return { ...env, OpenCodeAIService: env.window.OpenCodeAIService, Config: env.window.Config };
}

test('OpenCodeAIService: sendStream parses SSE chunks', async () => {
    const chunks = [
        'data: {"choices":[{"delta":{"content":"hello"}}]}',
        'data: {"choices":[{"delta":{"content":" world"}}]}',
        'data: [DONE]'
    ];
    const { window, OpenCodeAIService, Config } = loadServiceWithMockFetch(() => Promise.resolve(makeSSE(chunks)));
    Config.init();
    await new Promise((resolve, reject) => {
        OpenCodeAIService.sendStream(
            'test-session-123',
            [{ role: 'user', content: 'hi' }],
            (delta, full) => { /* onChunk */ },
            (full) => {
                assert.equal(full, 'hello world');
                resolve();
            },
            (err) => reject(new Error(err.message || JSON.stringify(err)))
        );
    });
});

test('OpenCodeAIService: sendStream calls onChunk for each delta', async () => {
    const chunks = [
        'data: {"choices":[{"delta":{"content":"a"}}]}',
        'data: {"choices":[{"delta":{"content":"b"}}]}',
        'data: {"choices":[{"delta":{"content":"c"}}]}',
        'data: [DONE]'
    ];
    const { window, OpenCodeAIService, Config } = loadServiceWithMockFetch(() => Promise.resolve(makeSSE(chunks)));
    Config.init();
    const seen = [];
    await new Promise((resolve, reject) => {
        OpenCodeAIService.sendStream(
            'test-session-123',
            [{ role: 'user', content: 'q' }],
            (delta, full) => { seen.push(delta); },
            () => resolve(),
            (err) => reject(new Error(err.message || JSON.stringify(err)))
        );
    });
    assert.deepEqual(seen, ['a', 'b', 'c']);
});

test('OpenCodeAIService: abort cancels stream', async () => {
    const body = new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"first"}}]}\n'));
        },
        pull(controller) {
            // never enqueue more; we abort before pulling
        }
    });
    const { window, OpenCodeAIService, Config } = loadServiceWithMockFetch(() => Promise.resolve({ ok: true, status: 200, body: body }));
    Config.init();
    let chunks = 0;
    let calledDone = false;
    let calledError = false;
    OpenCodeAIService.sendStream(
        'test-session-123',
        [{ role: 'user', content: 'q' }],
        () => { chunks++; },
        () => { calledDone = true; },
        () => { calledError = true; }
    );
    await new Promise(r => setTimeout(r, 50));
    OpenCodeAIService.abort();
    await new Promise(r => setTimeout(r, 50));
    assert.equal(calledDone, false, 'onComplete should not be called after abort');
    assert.equal(calledError, false, 'onError should not be called after abort');
});

test('OpenCodeAIService: abort does nothing when no stream active', () => {
    const { OpenCodeAIService } = loadServiceWithMockFetch(() => Promise.reject(new Error('not called')));
    assert.doesNotThrow(() => OpenCodeAIService.abort());
});

test('OpenCodeAIService: sendStream handles server error', async () => {
    const { window, OpenCodeAIService, Config } = loadServiceWithMockFetch(() => Promise.resolve({
        ok: false,
        status: 401,
        text: () => Promise.resolve('{"error":"Unauthorized"}')
    }));
    Config.init();
    await new Promise((resolve) => {
        OpenCodeAIService.sendStream(
            'test-session-123',
            [{ role: 'user', content: 'q' }],
            () => {},
            () => { resolve(); },
            (err) => {
                assert.ok(err.message.indexOf('401') !== -1 || err.message.indexOf('认证') !== -1);
                resolve();
            }
        );
    });
});

test('OpenCodeAIService: sendStream handles network error', async () => {
    const { window, OpenCodeAIService, Config } = loadServiceWithMockFetch(() => Promise.reject(new Error('network down')));
    Config.init();
    await new Promise((resolve) => {
        OpenCodeAIService.sendStream(
            'test-session-123',
            [{ role: 'user', content: 'q' }],
            () => {},
            () => { resolve(); },
            (err) => {
                assert.ok(err.message.indexOf('network down') !== -1);
                resolve();
            }
        );
    });
});

test('OpenCodeAIService: sendStream skips malformed JSON lines', async () => {
    const chunks = [
        'data: this is not json',
        'data: {"choices":[{"delta":{"content":"valid"}}]}',
        'data: [DONE]'
    ];
    const { window, OpenCodeAIService, Config } = loadServiceWithMockFetch(() => Promise.resolve(makeSSE(chunks)));
    Config.init();
    await new Promise((resolve) => {
        OpenCodeAIService.sendStream(
            'test-session-123',
            [{ role: 'user', content: 'q' }],
            () => {},
            (full) => {
                assert.equal(full, 'valid');
                resolve();
            },
            () => resolve()
        );
    });
});

test('OpenCodeAIService: sendStream sends correct request body and headers', async () => {
    let captured = null;
    const { window, OpenCodeAIService, Config } = loadServiceWithMockFetch((url, opts) => {
        captured = { url: url, opts: opts };
        return Promise.resolve(makeSSE([
            'data: {"choices":[{"delta":{"content":"ok"}}]}',
            'data: [DONE]'
        ]));
    });
    Config.init();
    await new Promise((resolve) => {
        OpenCodeAIService.sendStream(
            'test-session-123',
            [{ role: 'user', content: 'hi' }],
            () => {},
            () => resolve(),
            () => resolve()
        );
    });
    assert.ok(captured, 'fetch was not called');
    assert.ok(captured.url.indexOf('/session/test-session-123/message') !== -1, 'url should target session message endpoint: ' + captured.url);
    assert.equal(captured.opts.method, 'POST');
    assert.ok(captured.opts.headers['Authorization'].indexOf('Basic') !== -1, 'should include Basic auth header');
    const body = JSON.parse(captured.opts.body);
    assert.equal(body.agent, 'plan');
    assert.equal(body.stream, true);
    assert.deepEqual(body.messages, [{ role: 'user', content: 'hi' }]);
});

test('OpenCodeAIService: sendStream handles content field directly', async () => {
    const chunks = [
        'data: {"content":"direct content"}',
        'data: [DONE]'
    ];
    const { window, OpenCodeAIService, Config } = loadServiceWithMockFetch(() => Promise.resolve(makeSSE(chunks)));
    Config.init();
    await new Promise((resolve, reject) => {
        OpenCodeAIService.sendStream(
            'test-session-123',
            [{ role: 'user', content: 'q' }],
            (delta, full) => {},
            (full) => {
                assert.equal(full, 'direct content');
                resolve();
            },
            (err) => reject(new Error(err.message || JSON.stringify(err)))
        );
    });
});
