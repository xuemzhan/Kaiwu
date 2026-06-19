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

test('OpenCodeAIService: mapDocumentAction returns correct prompt for summarize', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapDocumentAction('summarize', '这是测试文档内容。');
    assert.equal(result.system, '你是一个文档摘要助手。');
    assert.ok(result.user.includes('这是测试文档内容。'));
});

test('OpenCodeAIService: mapDocumentAction returns correct prompt for doc_summary', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapDocumentAction('doc_summary', '这是一份长文档的内容。');
    assert.equal(result.system, '你是一个文档总结助手，擅长从长文档中提炼结构和结论。');
    assert.ok(result.user.includes('一句话总结、核心要点、结构大纲、行动建议'));
});

test('OpenCodeAIService: mapDocumentAction handles doc_qa with query', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapDocumentAction('doc_qa', '文档内容在这里。', '文档的主要观点是什么？');
    assert.equal(result.system, '你是一个文档问答助手。基于提供的文档内容回答用户问题。如果无法从文档中找到答案，请明确说明。');
    assert.ok(result.user.includes('文档内容在这里。'));
    assert.ok(result.user.includes('文档的主要观点是什么？'));
});

test('OpenCodeAIService: mapDocumentAction handles doc_qa without query (defaults)', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapDocumentAction('doc_qa', '文档内容', '');
    assert.ok(result.user.includes('请总结这份文档'));
});

test('OpenCodeAIService: mapDocumentAction returns correct prompt for talk_doc', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapDocumentAction('talk_doc', '需要讲解的文档内容。');
    assert.equal(result.system, '你是一个专业的文档讲解助手，擅长将书面内容转化为适合朗读的叙述性语言。');
    assert.ok(result.user.includes('适合朗读讲解的脚本'));
});

test('OpenCodeAIService: mapDocumentAction handles unknown action', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapDocumentAction('unknown_action', '文档内容', 'query');
    assert.equal(result.system, '你是一个助手，请根据用户输入回答问题。');
    assert.equal(result.user, '请帮我处理这份文档');
});

test('OpenCodeAIService: mapDocumentAction handles empty documentText', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapDocumentAction('summarize', '', '');
    assert.equal(result.system, '你是一个文档摘要助手。');
    assert.ok(result.user.includes('请为以下文字生成简洁摘要'));
});

test('OpenCodeAIService: mapLayoutAction returns ai_layout prompt', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapLayoutAction('ai_layout', '测试文档内容');
    assert.ok(result.system.includes('文档排版助手'), 'system prompt should mention document layout');
    assert.ok(result.user.includes('测试文档内容'), 'user prompt should include document text');
    assert.ok(result.user.includes('标题、摘要、关键词'), 'user prompt should mention paper sections');
});

test('OpenCodeAIService: mapLayoutAction returns mindmap prompt', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapLayoutAction('mindmap', '文档内容');
    assert.ok(result.system.includes('思维导图'), 'system prompt should mention mindmap');
    assert.ok(result.user.includes('Mermaid'), 'user prompt should mention Mermaid');
    assert.ok(result.user.includes('mindmap'), 'user prompt should include mindmap syntax');
});

test('OpenCodeAIService: mapLayoutAction returns doc_to_ppt prompt', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapLayoutAction('doc_to_ppt', '测试PPT内容');
    assert.ok(result.system.includes('演示文稿'), 'system prompt should mention presentation');
    assert.ok(result.user.includes('PPT大纲'), 'user prompt should mention PPT outline');
    assert.ok(result.user.includes('页面标题'), 'user prompt should mention slide title');
});

test('OpenCodeAIService: mapLayoutAction returns default for unknown action', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapLayoutAction('unknown_action', '测试内容');
    assert.ok(result.system.includes('助手'), 'default system prompt should mention assistant');
    assert.equal(result.user, '测试内容', 'should return original text');
});

test('OpenCodeAIService: mapLayoutAction handles empty document text', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapLayoutAction('ai_layout', '');
    assert.ok(result.user.includes('\n\n'), 'user prompt should handle empty text');
    const mindmapResult = OpenCodeAIService.mapLayoutAction('mindmap', '');
    assert.ok(mindmapResult.user.includes('mindmap\n'), 'mindmap should have mindmap prefix');
});

test('OpenCodeAIService: mapModifyAction returns correct prompt for polish_quick', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapModifyAction('polish_quick', '原始文本');
    assert.equal(result.system, '你是一个专业的中文写作润色助手。');
    assert.ok(result.user.includes('原始文本'));
});

test('OpenCodeAIService: mapModifyAction returns correct prompt for polish_formal', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapModifyAction('polish_formal', '测试文字');
    assert.equal(result.system, '你是一个正式文书写作助手，擅长办公、公文和商务表达。');
    assert.ok(result.user.includes('测试文字'));
});

test('OpenCodeAIService: mapModifyAction returns correct prompt for polish_government', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapModifyAction('polish_government', '公文内容');
    assert.equal(result.system, '你熟悉党政机关、公文材料和政务表达风格。');
    assert.ok(result.user.includes('公文内容'));
});

test('OpenCodeAIService: mapModifyAction returns correct prompt for correct', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapModifyAction('correct', '文本有错');
    assert.equal(result.system, '你是一个中文校对与纠错助手。');
    assert.ok(result.user.includes('文本有错'));
});

test('OpenCodeAIService: mapModifyAction returns correct prompt for expand', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapModifyAction('expand', '需要扩写');
    assert.equal(result.system, '你是一个内容扩写助手，擅长补充细节、论据和表达层次。');
    assert.ok(result.user.includes('需要扩写'));
});

test('OpenCodeAIService: mapModifyAction returns correct prompt for shrink', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapModifyAction('shrink', '需要压缩');
    assert.equal(result.system, '你是一个内容压缩助手，擅长提炼重点。');
    assert.ok(result.user.includes('需要压缩'));
});

test('OpenCodeAIService: mapModifyAction returns correct prompt for rewrite', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapModifyAction('rewrite', '需要改写');
    assert.equal(result.system, '你是一个中文改写助手，擅长优化句式和表达方式。');
    assert.ok(result.user.includes('需要改写'));
});

test('OpenCodeAIService: mapModifyAction returns correct prompt for translate', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapModifyAction('translate', 'Hello World');
    assert.equal(result.system, '你是一个专业翻译助手。');
    assert.ok(result.user.includes('Hello World'));
});

test('OpenCodeAIService: mapModifyAction handles unknown actionId', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapModifyAction('unknown_action', '测试文本');
    assert.equal(result.system, '你是一个助手，请根据用户输入回答问题。');
    assert.equal(result.user, '测试文本');
});

test('OpenCodeAIService: mapModifyAction handles empty text', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapModifyAction('polish_quick', '');
    assert.equal(result.system, '你是一个专业的中文写作润色助手。');
    assert.ok(result.user.includes('\n\n'));
});

test('OpenCodeAIService: mapModifyAction handles null text', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapModifyAction('correct', null);
    assert.equal(result.system, '你是一个中文校对与纠错助手。');
});

test('OpenCodeAIService: mapSpecializedAction returns correct prompt for legal', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapSpecializedAction('legal', '合同违约怎么处理？');
    assert.equal(result.system, '你是一个专业的法律助手，熟悉中国法律体系，擅长解答法律问题、解释法律条款、分析法律关系。请使用专业、严谨的法律语言，必要时引用相关法律条文。');
    assert.ok(result.user.includes('合同违约怎么处理？'));
});

test('OpenCodeAIService: mapSpecializedAction returns correct prompt for deep_think', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapSpecializedAction('deep_think', '为什么AI能生成文本？');
    assert.equal(result.system, '你是一个深度分析助手。请深入分析问题，逐步推理，详尽考虑各方面因素，给出全面而有深度的回答。请直接给出分析结果。');
    assert.ok(result.user.includes('为什么AI能生成文本？'));
});

test('OpenCodeAIService: mapSpecializedAction returns correct prompt for gen_image', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapSpecializedAction('gen_image', '一只猫在草地上玩耍');
    assert.equal(result.system, '你是一个图片描述生成助手。请将用户的描述转换为一个详细、生动的图片场景描述，适合用于AI绘图。');
    assert.ok(result.user.includes('一只猫在草地上玩耍'));
});

test('OpenCodeAIService: mapSpecializedAction returns correct prompt for summary_image', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapSpecializedAction('summary_image', '本文介绍了机器学习的基本概念和发展历史。');
    assert.equal(result.system, '你是一个文档可视化助手。请将文档内容总结为一个信息图场景描述。');
    assert.ok(result.user.includes('本文介绍了机器学习的基本概念和发展历史。'));
});

test('OpenCodeAIService: mapSpecializedAction handles unknown actionId', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapSpecializedAction('unknown_action', '测试输入');
    assert.equal(result.system, '你是一个助手。');
    assert.equal(result.user, '测试输入');
});

test('OpenCodeAIService: mapSpecializedAction handles empty input', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapSpecializedAction('legal', '');
    assert.equal(result.system, '你是一个专业的法律助手，熟悉中国法律体系，擅长解答法律问题、解释法律条款、分析法律关系。请使用专业、严谨的法律语言，必要时引用相关法律条文。');
    assert.ok(result.user.includes('\n\n'));
});

test('OpenCodeAIService: mapSpecializedAction handles null input', () => {
    const { OpenCodeAIService } = loadService();
    const result = OpenCodeAIService.mapSpecializedAction('deep_think', null);
    assert.equal(result.system, '你是一个深度分析助手。请深入分析问题，逐步推理，详尽考虑各方面因素，给出全面而有深度的回答。请直接给出分析结果。');
});

test('AIServiceFactory: returns AIService in standard mode', () => {
    const env = makeEnv();
    loadScripts(env.window, ['taskpane/services/config.js', 'taskpane/services/ai.js', 'taskpane/services/ai-factory.js']);
    const factory = env.window.AIServiceFactory;
    const service = factory.create({ mode: 'standard' });
    assert.equal(service, env.window.AIService);
});

test('AIServiceFactory: falls back to AIService when opencode unavailable', () => {
    const env = makeEnv();
    env.window.OpenCodeAIService = undefined;
    loadScripts(env.window, ['taskpane/services/config.js', 'taskpane/services/ai.js', 'taskpane/services/ai-factory.js']);
    const factory = env.window.AIServiceFactory;
    const service = factory.create({ mode: 'opencode' });
    assert.equal(service, env.window.AIService);
});

test('AIServiceFactory: falls back when OpenCodeAIService throws', () => {
    const env = makeEnv();
    env.window.OpenCodeAIService = {
        testConnection: function(onSuccess, onError) {
            onError({ message: 'connection failed' });
        }
    };
    loadScripts(env.window, ['taskpane/services/config.js', 'taskpane/services/ai.js', 'taskpane/services/ai-factory.js']);
    let toastCalled = false;
    const origShow = env.window.KwToast.show;
    env.window.KwToast.show = function(msg) { toastCalled = true; };
    const factory = env.window.AIServiceFactory;
    const service = factory.create({ mode: 'opencode' });
    env.window.KwToast.show = origShow;
    assert.equal(service, env.window.AIService, 'Should return standard AIService');
    assert.equal(toastCalled, true, 'Should show fallback toast');
});

test('AIServiceFactory: returns OpenCodeAIService when available', () => {
    const env = makeEnv();
    env.window.OpenCodeAIService = {
        testConnection: function(onSuccess, onError) {
            onSuccess({ connected: true });
        }
    };
    loadScripts(env.window, ['taskpane/services/config.js', 'taskpane/services/ai.js', 'taskpane/services/ai-factory.js']);
    const factory = env.window.AIServiceFactory;
    const service = factory.create({ mode: 'opencode' });
    assert.equal(service, env.window.OpenCodeAIService);
});

test('AIServiceFactory: isOpencodeMode returns correct value', () => {
    const env = makeEnv();
    loadScripts(env.window, ['taskpane/services/config.js', 'taskpane/services/ai-factory.js']);
    const factory = env.window.AIServiceFactory;
    const Config = env.window.Config;

    Config._data = null;
    env.window.localStorage.setItem('wps_assistant_config', JSON.stringify({ mode: 'opencode' }));
    assert.equal(factory.isOpencodeMode(), true);

    Config._data = null;
    env.window.localStorage.setItem('wps_assistant_config', JSON.stringify({ mode: 'standard' }));
    assert.equal(factory.isOpencodeMode(), false);
});

test('AIServiceFactory: isOpencodeAvailable checks service availability', () => {
    const env = makeEnv();
    let callbackResult = null;
    env.window.OpenCodeAIService = {
        testConnection: function(onSuccess, onError) {
            onSuccess({ connected: true });
        }
    };
    loadScripts(env.window, ['taskpane/services/config.js', 'taskpane/services/ai-factory.js']);
    const factory = env.window.AIServiceFactory;
    factory.isOpencodeAvailable(
        function(data) { callbackResult = data; },
        function(err) { callbackResult = err; }
    );
    assert.ok(callbackResult !== null);
});

test('AIServiceFactory: isOpencodeAvailable handles undefined service', () => {
    const env = makeEnv();
    let errorCalled = false;
    env.window.OpenCodeAIService = undefined;
    loadScripts(env.window, ['taskpane/services/config.js', 'taskpane/services/ai-factory.js']);
    const factory = env.window.AIServiceFactory;
    factory.isOpencodeAvailable(
        function() { },
        function(err) { errorCalled = true; }
    );
    assert.equal(errorCalled, true);
});

test('OpenCodeAIService: _reconnect uses exponential backoff', async () => {
    const delays = [];
    let callCount = 0;
    const fetchMock = async () => {
        callCount++;
        delays.push(Date.now());
        return { ok: false, status: 500, text: async () => '{}' };
    };
    const { OpenCodeAIService, Config } = loadServiceWithMock(fetchMock);
    Config.init();

    const timeoutMs = 45000;
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Test timeout')), timeoutMs));

    const reconnectPromise = new Promise((resolve, reject) => {
        OpenCodeAIService._reconnect(
            () => reject(new Error('should not succeed')),
            (err) => {
                assert.equal(callCount, 5, 'should attempt 5 times');
                if (delays.length >= 2) {
                    const d1 = delays[1] - delays[0];
                    const d2 = delays[2] - delays[1];
                    const d3 = delays[3] - delays[2];
                    const d4 = delays[4] - delays[3];
                    assert.ok(d1 >= 500, 'first delay should be >= 500ms, got: ' + d1);
                    assert.ok(d2 > d1, 'second delay should be greater than first');
                    assert.ok(d3 > d2, 'third delay should be greater than second');
                    assert.ok(d4 > d3, 'fourth delay should be greater than third');
                }
                resolve();
            }
        );
    });

    await Promise.race([reconnectPromise, timeout]);
});

test('OpenCodeAIService: _reconnect stops after max attempts', async () => {
    let callCount = 0;
    const fetchMock = async () => {
        callCount++;
        return { ok: false, status: 500, text: async () => '{}' };
    };
    const { OpenCodeAIService, Config } = loadServiceWithMock(fetchMock);
    Config.init();

    const timeoutMs = 45000;
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Test timeout')), timeoutMs));

    const reconnectPromise = new Promise((resolve, reject) => {
        OpenCodeAIService._reconnect(
            () => reject(new Error('should not succeed')),
            (err) => {
                assert.equal(callCount, 5, 'should attempt exactly 5 times before stopping');
                resolve();
            }
        );
    });

    await Promise.race([reconnectPromise, timeout]);
});

test('OpenCodeAIService: _reconnect succeeds on first attempt', async () => {
    let callCount = 0;
    const fetchMock = async () => {
        callCount++;
        return { ok: true, json: async () => ({ status: 'ok' }) };
    };
    const { OpenCodeAIService, Config } = loadServiceWithMock(fetchMock);
    Config.init();

    await new Promise((resolve, reject) => {
        OpenCodeAIService._reconnect(
            (info) => {
                assert.equal(callCount, 1, 'should succeed on first attempt');
                assert.equal(info.status, 'connected');
                resolve();
            },
            (err) => reject(new Error('should not fail: ' + err.message))
        );
    });
});

test('OpenCodeAIService: cancelReconnect clears timer and resets attempts', async () => {
    let callCount = 0;
    const fetchMock = async () => {
        callCount++;
        return { ok: false, status: 500, text: async () => '{}' };
    };
    const { OpenCodeAIService, Config } = loadServiceWithMock(fetchMock);
    Config.init();

    OpenCodeAIService._reconnect(
        () => {},
        () => {}
    );

    await new Promise(r => setTimeout(r, 50));
    OpenCodeAIService.cancelReconnect();

    const currentAttempts = OpenCodeAIService._reconnectAttempts;
    assert.equal(currentAttempts, 0, 'attempts should be reset after cancel');
    assert.equal(OpenCodeAIService._reconnectTimer, null, 'timer should be null after cancel');
});
