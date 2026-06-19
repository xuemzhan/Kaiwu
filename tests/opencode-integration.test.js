/**
 * tests/opencode-integration.test.js — OpenCode 模式集成测试
 *
 * 验证 opencode-mode 的完整流程:
 *   - 创建会话 → 发送消息 → 接收流式响应
 *   - 模式切换与回退
 *   - 错误处理与连接测试
 *   - 会话管理 (列表/删除/中止)
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts, mockVendorLibs } = require('./_setup');

function mockOpencodeServer(env, options) {
    options = options || {};
    env.window.fetch = async (url, opts) => {
        if (url.includes('/session') && opts.method === 'POST' && !url.includes('/abort')) {
            return {
                ok: true,
                json: async () => ({ id: 'ses-' + Date.now(), title: 'Test Session' })
            };
        }
        if (url.includes('/message') && opts.method === 'POST') {
            const chunks = options.chunks || [
                'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
                'data: {"choices":[{"delta":{"content":" World"}}}\n\n',
                'data: [DONE]\n\n'
            ];
            const encoder = new TextEncoder();
            const stream = new ReadableStream({
                start(controller) {
                    chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)));
                    controller.close();
                }
            });
            const mockResponse = {
                ok: true,
                body: stream,
                getReader: function() { return stream.getReader(); }
            };
            return mockResponse;
        }
        if (url.endsWith('/session') && opts.method === 'GET') {
            return {
                ok: true,
                json: async () => ([
                    { id: 'ses-1', title: 'Session One' },
                    { id: 'ses-2', title: 'Session Two' }
                ])
            };
        }
        if (url.includes('/session/') && opts.method === 'DELETE') {
            return { ok: true, json: async () => true };
        }
        if (url.includes('/abort') && opts.method === 'POST') {
            return { ok: true, json: async () => true };
        }
        if (url.includes('/api/health')) {
            return { ok: true, json: async () => ({ status: 'ok' }) };
        }
        return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) };
    };
}

function loadOpencodeServices(env) {
    env.window.__ENV_API_KEY__ = 'sk-test';
    env.window.__ENV_API_BASE__ = 'https://api.test.com/v1';
    env.window.__ENV_MODEL__ = 'test';
    mockVendorLibs(env.window);
    env.window.btoa = (str) => Buffer.from(str).toString('base64');
    loadScripts(env.window, [
        'taskpane/services/config.js',
        'taskpane/services/opencode-ai.js',
        'taskpane/services/session-manager.js',
        'taskpane/services/ai-factory.js'
    ]);
    return {
        Config: env.window.Config,
        OpenCodeAIService: env.window.OpenCodeAIService,
        SessionManager: env.window.SessionManager,
        AIServiceFactory: env.window.AIServiceFactory,
        AIService: env.window.AIService
    };
}

test('Integration: create session and verify session data', (t, done) => {
    const env = makeEnv();
    env.window.btoa = (str) => Buffer.from(str).toString('base64');
    mockVendorLibs(env.window);
    env.window.fetch = async (url, opts) => {
        if (url.includes('/session') && opts.method === 'POST' && !url.includes('/abort')) {
            return {
                ok: true,
                json: async () => ({ id: 'ses-' + Date.now(), title: 'Test Session' })
            };
        }
        if (url.includes('/api/health')) {
            return { ok: true, json: async () => ({ status: 'ok' }) };
        }
        return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) };
    };
    loadScripts(env.window, [
        'taskpane/services/config.js',
        'taskpane/services/opencode-ai.js',
        'taskpane/services/session-manager.js',
        'taskpane/services/ai-factory.js'
    ]);
    const SessionManager = env.window.SessionManager;
    const Config = env.window.Config;

    Config.set('mode', 'opencode');

    SessionManager.create('doc-1', { title: 'Test' }, (session) => {
        assert.ok(session.id, 'session should have id');
        assert.ok(session.id.startsWith('ses-'), 'session id should match pattern');
        assert.equal(session.title, 'Test Session', 'session title should match');
        done();
    }, (err) => assert.fail('create session failed: ' + err));
});

test('Integration: fallback when opencode unavailable', () => {
    const env = makeEnv();
    env.window.fetch = async () => ({ ok: false, status: 503, json: async () => ({ error: 'Service Unavailable' }) });
    env.window.btoa = (str) => Buffer.from(str).toString('base64');
    mockVendorLibs(env.window);
    loadScripts(env.window, [
        'taskpane/services/config.js',
        'taskpane/services/ai.js',
        'taskpane/services/opencode-ai.js',
        'taskpane/services/session-manager.js',
        'taskpane/services/ai-factory.js'
    ]);
    const AIServiceFactory = env.window.AIServiceFactory;
    const AIService = env.window.AIService;
    const Config = env.window.Config;

    Config.set('mode', 'opencode');
    const service = AIServiceFactory.create();
    assert.equal(service, AIService, 'should fallback to AIService');
});

test('Integration: factory mode switching', () => {
    const env = makeEnv();
    mockOpencodeServer(env);
    env.window.btoa = (str) => Buffer.from(str).toString('base64');
    mockVendorLibs(env.window);
    loadScripts(env.window, [
        'taskpane/services/config.js',
        'taskpane/services/ai.js',
        'taskpane/services/opencode-ai.js',
        'taskpane/services/session-manager.js',
        'taskpane/services/ai-factory.js'
    ]);
    const AIServiceFactory = env.window.AIServiceFactory;
    const AIService = env.window.AIService;
    const Config = env.window.Config;

    Config.set('mode', 'standard');
    const stdService = AIServiceFactory.create();
    assert.equal(stdService, AIService, 'standard mode returns AIService');

    Config.set('mode', 'opencode');
    const ocService = AIServiceFactory.create();
    assert.ok(ocService, 'opencode mode should return a service');
});

test('Integration: isOpencodeMode detection', () => {
    const env = makeEnv();
    mockOpencodeServer(env);
    const { AIServiceFactory, Config } = loadOpencodeServices(env);

    Config.set('mode', 'standard');
    assert.equal(AIServiceFactory.isOpencodeMode(), false, 'should not be opencode mode');

    Config.set('mode', 'opencode');
    assert.equal(AIServiceFactory.isOpencodeMode(), true, 'should be opencode mode');
});

test('Integration: testConnection success', (t, done) => {
    const env = makeEnv();
    mockOpencodeServer(env);
    const { OpenCodeAIService } = loadOpencodeServices(env);

    OpenCodeAIService.testConnection(
        (info) => {
            assert.ok(info, 'should receive connection info');
            assert.equal(info.status, 'connected', 'should be connected');
            done();
        },
        (err) => assert.fail('should not error: ' + err.message)
    );
});

test('Integration: testConnection failure', (t, done) => {
    const env = makeEnv();
    env.window.fetch = async () => ({ ok: false, status: 500, json: async () => ({ error: 'Server Error' }) });
    env.window.btoa = (str) => Buffer.from(str).toString('base64');
    const { OpenCodeAIService } = loadOpencodeServices(env);

    OpenCodeAIService.testConnection(
        () => assert.fail('should not succeed'),
        (err) => {
            assert.ok(err, 'should receive error');
            done();
        }
    );
});

test('Integration: SessionManager.get returns cached session', () => {
    const env = makeEnv();
    mockOpencodeServer(env);
    const { SessionManager, Config } = loadOpencodeServices(env);

    Config.set('mode', 'opencode');
    SessionManager._sessions['doc-1'] = { id: 'cached-ses-1', documentId: 'doc-1', title: 'Cached' };
    const session = SessionManager.get('doc-1');
    assert.ok(session, 'should return session');
    assert.equal(session.id, 'cached-ses-1', 'should match cached session id');
});

test('Integration: SessionManager.clear removes session', () => {
    const env = makeEnv();
    mockOpencodeServer(env);
    const { SessionManager, Config } = loadOpencodeServices(env);

    Config.set('mode', 'opencode');
    SessionManager._sessions['doc-1'] = { id: 'ses-1', documentId: 'doc-1', title: 'Test' };
    SessionManager.clear('doc-1');
    const session = SessionManager.get('doc-1');
    assert.equal(session, null, 'session should be cleared');
});

test('Integration: SessionManager.abort sends abort request', (t, done) => {
    const env = makeEnv();
    mockOpencodeServer(env);
    const { SessionManager, Config } = loadOpencodeServices(env);

    Config.set('mode', 'opencode');
    SessionManager.abort('test-session-id',
        (result) => {
            assert.equal(result, true, 'abort should succeed');
            done();
        },
        (err) => assert.fail('abort failed: ' + err)
    );
});

test('Integration: error classification - AuthError', () => {
    const env = makeEnv();
    mockOpencodeServer(env);
    const { OpenCodeAIService } = loadOpencodeServices(env);

    const err = OpenCodeAIService._classifyError(401, '{"error":{"message":"Unauthorized"}}');
    assert.equal(err.type, 'AuthError', 'should be AuthError');
    assert.equal(err.retryable, false, 'should not be retryable');
    assert.ok(err.message.includes('401'), 'message should contain status');
});

test('Integration: error classification - ServerError', () => {
    const env = makeEnv();
    mockOpencodeServer(env);
    const { OpenCodeAIService } = loadOpencodeServices(env);

    const err = OpenCodeAIService._classifyError(503, 'Service Unavailable');
    assert.equal(err.type, 'ServerError', 'should be ServerError');
    assert.equal(err.retryable, true, 'should be retryable');
});

test('Integration: error classification - RateLimitError', () => {
    const env = makeEnv();
    mockOpencodeServer(env);
    const { OpenCodeAIService } = loadOpencodeServices(env);

    const err = OpenCodeAIService._classifyError(429, '{"error":{"message":"Rate limit"}}');
    assert.equal(err.type, 'RateLimitError', 'should be RateLimitError');
    assert.equal(err.retryable, true, 'should be retryable');
});

test('Integration: auth header generation', () => {
    const env = makeEnv();
    mockOpencodeServer(env);
    const { OpenCodeAIService, Config } = loadOpencodeServices(env);

    Config.set('opencodeUsername', 'testuser');
    Config.set('opencodePassword', 'testpass');

    const header = OpenCodeAIService._buildAuthHeader();
    assert.ok(header.startsWith('Basic '), 'should be Basic auth');
    const decoded = Buffer.from(header.slice(6), 'base64').toString();
    assert.equal(decoded, 'testuser:testpass', 'should encode credentials');
});

test('Integration: message mapping - polish action', () => {
    const env = makeEnv();
    mockOpencodeServer(env);
    const { OpenCodeAIService } = loadOpencodeServices(env);

    const prompt = OpenCodeAIService.mapModifyAction('polish_quick', '原始文本', {});
    assert.ok(prompt.system, 'should have system prompt');
    assert.ok(prompt.user.includes('原始文本'), 'should include original text');
});

test('Integration: message mapping - translate action', () => {
    const env = makeEnv();
    mockOpencodeServer(env);
    const { OpenCodeAIService } = loadOpencodeServices(env);

    const prompt = OpenCodeAIService.mapModifyAction('translate', 'Hello world', {});
    assert.ok(prompt.system, 'should have system prompt');
    assert.ok(prompt.user.includes('Hello world'), 'should include text to translate');
});

test('Integration: message mapping - document action', () => {
    const env = makeEnv();
    mockOpencodeServer(env);
    const { OpenCodeAIService } = loadOpencodeServices(env);

    const prompt = OpenCodeAIService.mapDocumentAction('summarize', '这是一段很长的文档内容...', null);
    assert.ok(prompt.system, 'should have system prompt');
    assert.ok(prompt.user.includes('这是一段很长的文档内容'), 'should include document');
});

test('Integration: message mapping - layout action', () => {
    const env = makeEnv();
    mockOpencodeServer(env);
    const { OpenCodeAIService } = loadOpencodeServices(env);

    const prompt = OpenCodeAIService.mapLayoutAction('mindmap', '文档内容', {});
    assert.ok(prompt.system, 'should have system prompt');
    assert.ok(prompt.user.includes('文档内容'), 'should include document');
    assert.ok(prompt.user.includes('mermaid'), 'should request mermaid format');
});

test('Integration: message mapping - specialized action', () => {
    const env = makeEnv();
    mockOpencodeServer(env);
    const { OpenCodeAIService } = loadOpencodeServices(env);

    const prompt = OpenCodeAIService.mapSpecializedAction('legal', '什么是合同法？', {});
    assert.ok(prompt.system, 'should have system prompt');
    assert.ok(prompt.user.includes('什么是合同法'), 'should include query');
});

test('Integration: abort during streaming', (t, done) => {
    const env = makeEnv();
    mockOpencodeServer(env, {
        chunks: [
            'data: {"choices":[{"delta":{"content":"Slow"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"Response"}}}\n\n'
        ]
    });
    const { OpenCodeAIService, Config } = loadOpencodeServices(env);

    Config.set('mode', 'opencode');
    OpenCodeAIService.sendStream(
        'test-session',
        [{ role: 'user', content: 'test' }],
        (chunk) => {
            OpenCodeAIService.abort();
        },
        () => assert.fail('should not complete'),
        (err) => {
            assert.ok(err, 'should receive abort error');
            done();
        }
    );
});

test('Integration: config mode defaults', () => {
    const env = makeEnv();
    mockOpencodeServer(env);
    const { Config } = loadOpencodeServices(env);

    assert.equal(Config.get('mode'), 'standard', 'default mode should be standard');
    assert.equal(Config.get('opencodeUrl'), 'http://127.0.0.1:4096', 'default opencode url');
    assert.equal(Config.get('opencodeUsername'), 'opencode', 'default username');
});

test('Integration: Config.set and get roundtrip', () => {
    const env = makeEnv();
    mockOpencodeServer(env);
    const { Config } = loadOpencodeServices(env);

    Config.set('opencodeAgent', 'deep');
    assert.equal(Config.get('opencodeAgent'), 'deep', 'should retrieve set value');

    Config.set({ opencodeUrl: 'http://localhost:9999', opencodePassword: 'secret' });
    assert.equal(Config.get('opencodeUrl'), 'http://localhost:9999', 'should update url');
    assert.equal(Config.get('opencodePassword'), 'secret', 'should update password');
});

test('Integration: factory creates correct service instance', () => {
    const env = makeEnv();
    mockOpencodeServer(env);
    env.window.btoa = (str) => Buffer.from(str).toString('base64');
    mockVendorLibs(env.window);
    loadScripts(env.window, [
        'taskpane/services/config.js',
        'taskpane/services/ai.js',
        'taskpane/services/opencode-ai.js',
        'taskpane/services/session-manager.js',
        'taskpane/services/ai-factory.js'
    ]);
    const AIServiceFactory = env.window.AIServiceFactory;
    const Config = env.window.Config;
    const OpenCodeAIService = env.window.OpenCodeAIService;

    Config.set('mode', 'opencode');
    const factory = AIServiceFactory;
    const service = factory.create();
    assert.ok(service, 'should return service object');
    assert.ok(typeof service.sendStream === 'function', 'service should have sendStream');
});

test('Integration: reconnect attempts', (t, done) => {
    const env = makeEnv();
    let attempts = 0;
    env.window.fetch = async (url, opts) => {
        if (url.includes('/api/health')) {
            attempts++;
            if (attempts >= 2) {
                return { ok: true, json: async () => ({ status: 'ok' }) };
            }
            return { ok: false, status: 500 };
        }
        return { ok: false, status: 404 };
    };
    env.window.btoa = (str) => Buffer.from(str).toString('base64');
    const { OpenCodeAIService } = loadOpencodeServices(env);

    const origTest = OpenCodeAIService.testConnection;
    let testCalled = false;
    OpenCodeAIService.testConnection = function(onSuccess, onError) {
        testCalled = true;
        origTest.call(this, onSuccess, onError);
    };

    OpenCodeAIService._reconnect(
        (info) => {
            assert.ok(testCalled, 'testConnection should be called');
            done();
        },
        (err) => assert.fail('reconnect should succeed after retries')
    );
});

test('Integration: cancel reconnect', () => {
    const env = makeEnv();
    mockOpencodeServer(env);
    const { OpenCodeAIService } = loadOpencodeServices(env);

    OpenCodeAIService._reconnectAttempts = 3;
    OpenCodeAIService._reconnectTimer = setTimeout(() => {}, 10000);
    OpenCodeAIService.cancelReconnect();

    assert.equal(OpenCodeAIService._reconnectAttempts, 0, 'reconnect attempts should reset');
    assert.equal(OpenCodeAIService._reconnectTimer, null, 'timer should be cleared');
});
