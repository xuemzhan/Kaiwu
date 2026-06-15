/**
 * tests/ai.test.js — AIService 单元测试
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts } = require('./_setup');

function loadAI(window) {
    if (!window.__ENV_API_KEY__) window.__ENV_API_KEY__ = 'sk-test';
    if (!window.__ENV_API_BASE__) window.__ENV_API_BASE__ = 'https://api.test.com/v1';
    if (!window.__ENV_MODEL__) window.__ENV_MODEL__ = 'test-model';
    loadScripts(window, 'taskpane/services/config.js');
    loadScripts(window, 'taskpane/services/ai.js');
    return window.AIService;
}

function makeSSE(chunks) {
    // chunks: array of strings, each is a full SSE line e.g. 'data: {...}'
    // Build a Response-like object
    const text = chunks.join('\n') + '\n';
    const body = new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode(text));
            controller.close();
        }
    });
    return { ok: true, status: 200, body, text: () => Promise.resolve(text) };
}

function makeErrorResponse(status, text) {
    return {
        ok: false,
        status,
        text: () => Promise.resolve(text)
    };
}

test('AIService: sendStream parses SSE chunks correctly', async () => {
    const env = makeEnv();
    const chunks = [
        'data: {"choices":[{"delta":{"content":"hello"}}]}',
        'data: {"choices":[{"delta":{"content":" world"}}]}',
        'data: [DONE]'
    ];
    env.window.fetch = () => Promise.resolve(makeSSE(chunks));
    const AI = loadAI(env.window);
    await new Promise((resolve, reject) => {
        AI.sendStream(
            [{ role: 'user', content: 'hi' }],
            (delta, full) => { /* onChunk */ },
            (full) => {
                assert.equal(full, 'hello world');
                resolve();
            },
            (err) => reject(new Error(err))
        );
    });
});

test('AIService: sendStream strips reasoning_content by default (thinking model)', async () => {
    const env = makeEnv();
    const chunks = [
        'data: {"choices":[{"delta":{"reasoning_content":"思考中"}}]}',
        'data: {"choices":[{"delta":{"content":"答案"}}]}',
        'data: [DONE]'
    ];
    env.window.fetch = () => Promise.resolve(makeSSE(chunks));
    const AI = loadAI(env.window);
    await new Promise((resolve, reject) => {
        AI.sendStream(
            [{ role: 'user', content: 'q' }],
            () => {},
            (full) => {
                // Default: reasoning_content 剥离, 仅显示 content
                assert.equal(full, '答案');
                resolve();
            },
            reject
        );
    });
});

test('AIService: non-reasoning model may include reasoning_content when stripReasoning=false', async () => {
    const env = makeEnv();
    if (!env.window.__ENV_API_KEY__) env.window.__ENV_API_KEY__ = 'sk-test';
    if (!env.window.__ENV_API_BASE__) env.window.__ENV_API_BASE__ = 'https://api.test.com/v1';
    if (!env.window.__ENV_MODEL__) env.window.__ENV_MODEL__ = 'test-model';
    const chunks = [
        'data: {"choices":[{"delta":{"reasoning_content":"思考中"}}]}',
        'data: {"choices":[{"delta":{"content":"答案"}}]}',
        'data: [DONE]'
    ];
    // Set fetch mock BEFORE loading scripts so the vm context captures it.
    env.window.fetch = () => Promise.resolve(makeSSE(chunks));
    loadScripts(env.window, 'taskpane/services/config.js');
    loadScripts(env.window, 'taskpane/services/ai.js');
    const AI = env.window.AIService;
    // Disable stripping
    env.window.Config.set('stripReasoning', false);
    await new Promise((resolve, reject) => {
        AI.sendStream(
            [{ role: 'user', content: 'q' }],
            () => {},
            (full) => {
                assert.equal(full, '思考中答案');
                resolve();
            },
            reject
        );
    });
});

test('AIService: reasoning model always strips reasoning_content and embedded thinking blocks', async () => {
    const env = makeEnv();
    env.window.__ENV_API_KEY__ = 'sk-test';
    env.window.__ENV_API_BASE__ = 'https://api.test.com/v1';
    env.window.__ENV_MODEL__ = 'DeepSeek-R1';
    const chunks = [
        'data: {"choices":[{"delta":{"reasoning_content":"内部推理"}}]}',
        'data: {"choices":[{"delta":{"content":"<think>隐藏内容</think>最终答案"}}]}',
        'data: [DONE]'
    ];
    env.window.fetch = () => Promise.resolve(makeSSE(chunks));
    loadScripts(env.window, 'taskpane/services/config.js');
    loadScripts(env.window, 'taskpane/services/ai.js');
    env.window.Config.set('stripReasoning', false);
    await new Promise((resolve, reject) => {
        env.window.AIService.sendStream(
            [{ role: 'user', content: 'q' }],
            () => {},
            (full) => {
                assert.equal(full, '最终答案');
                resolve();
            },
            reject
        );
    });
});

test('AIService: stripReasoningContent removes complete and streaming thinking blocks', () => {
    const env = makeEnv();
    const AI = loadAI(env.window);
    assert.equal(AI.stripReasoningContent('<think>secret</think>answer'), 'answer');
    assert.equal(AI.stripReasoningContent('```thinking\nsecret\n```\nanswer'), 'answer');
    assert.equal(AI.stripReasoningContent('<think>still reasoning'), '');
});

test('Config: isReasoningModel detects reasoning models by name', () => {
    const env = makeEnv();
    const C = loadAI(env.window);
    assert.equal(env.window.Config.isReasoningModel('MiniMax-M3'), true, 'MiniMax M3 should be detected as reasoning');
    assert.equal(env.window.Config.isReasoningModel('DeepSeek-R1'), true);
    assert.equal(env.window.Config.isReasoningModel('deepseek-r1-distill'), true);
    assert.equal(env.window.Config.isReasoningModel('o1-preview'), true);
    assert.equal(env.window.Config.isReasoningModel('o1-mini'), true);
    assert.equal(env.window.Config.isReasoningModel('gpt-4'), false);
    assert.equal(env.window.Config.isReasoningModel('claude-3-opus'), false);
    assert.equal(env.window.Config.isReasoningModel(''), false);
    assert.equal(env.window.Config.isReasoningModel(null), false);
});

test('Config: default stripReasoning is true', () => {
    const env = makeEnv();
    if (!env.window.__ENV_API_KEY__) env.window.__ENV_API_KEY__ = 'sk-test';
    if (!env.window.__ENV_API_BASE__) env.window.__ENV_API_BASE__ = 'https://api.test.com/v1';
    if (!env.window.__ENV_MODEL__) env.window.__ENV_MODEL__ = 'test-model';
    env.window.localStorage.clear();
    loadScripts(env.window, 'taskpane/services/config.js');
    const cfg = env.window.Config.init();
    assert.equal(cfg.stripReasoning, true, 'stripReasoning should default to true');
});

test('AIService: sendStream invokes onChunk for each delta', async () => {
    const env = makeEnv();
    const chunks = [
        'data: {"choices":[{"delta":{"content":"a"}}]}',
        'data: {"choices":[{"delta":{"content":"b"}}]}',
        'data: {"choices":[{"delta":{"content":"c"}}]}',
        'data: [DONE]'
    ];
    env.window.fetch = () => Promise.resolve(makeSSE(chunks));
    const AI = loadAI(env.window);
    const seen = [];
    await new Promise((resolve, reject) => {
        AI.sendStream(
            [{ role: 'user', content: 'q' }],
            (delta, full) => { seen.push(delta); },
            () => resolve(),
            reject
        );
    });
    assert.deepEqual(seen, ['a', 'b', 'c']);
});

test('AIService: sendStream returns controller with abort()', () => {
    const env = makeEnv();
    env.window.fetch = () => new Promise(() => {}); // never resolves
    const AI = loadAI(env.window);
    const ctrl = AI.sendStream([{ role: 'user', content: 'q' }], () => {}, () => {}, () => {});
    assert.equal(typeof ctrl.abort, 'function');
    assert.doesNotThrow(() => ctrl.abort());
});

test('AIService: sendStream error from server calls onError', async () => {
    const env = makeEnv();
    env.window.fetch = () => Promise.resolve(makeErrorResponse(401, 'Unauthorized'));
    const AI = loadAI(env.window);
    await new Promise((resolve) => {
        AI.sendStream(
            [{ role: 'user', content: 'q' }],
            () => {},
            () => { resolve(); },
            (err) => {
                assert.ok(err.indexOf('401') !== -1);
                resolve();
            }
        );
    });
});

test('AIService: sendStream error before fetch calls onError', async () => {
    const env = makeEnv();
    env.window.fetch = () => Promise.reject(new Error('network down'));
    const AI = loadAI(env.window);
    await new Promise((resolve) => {
        AI.sendStream(
            [{ role: 'user', content: 'q' }],
            () => {},
            () => { resolve(); },
            (err) => {
                assert.ok(err.indexOf('network down') !== -1);
                resolve();
            }
        );
    });
});

test('AIService: sendStream missing apiKey calls onError', async () => {
    const env = makeEnv();
    // Don't set __ENV_API_KEY__, and don't allow loadAI to fill it in
    if (env.window.localStorage.getItem('wps_assistant_config')) {
        env.window.localStorage.removeItem('wps_assistant_config');
    }
    loadScripts(env.window, 'taskpane/services/config.js');
    loadScripts(env.window, 'taskpane/services/ai.js');
    const AI = env.window.AIService;
    let captured = null;
    await new Promise((resolve) => {
        AI.sendStream(
            [{ role: 'user', content: 'q' }],
            () => {},
            () => resolve(),
            (err) => { captured = err; resolve(); }
        );
    });
    assert.ok(captured && captured.indexOf('API Key') !== -1, 'expected API Key error, got: ' + captured);
});

test('AIService: send (non-stream) parses JSON response', async () => {
    const env = makeEnv();
    env.window.fetch = () => Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
            choices: [{ message: { content: 'response text' } }]
        })
    });
    const AI = loadAI(env.window);
    await new Promise((resolve, reject) => {
        AI.send(
            [{ role: 'user', content: 'q' }],
            (content) => {
                assert.equal(content, 'response text');
                resolve();
            },
            reject
        );
    });
});

test('AIService: send empty content calls onError', async () => {
    const env = makeEnv();
    env.window.fetch = () => Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ choices: [{ message: { content: '' } }] })
    });
    const AI = loadAI(env.window);
    await new Promise((resolve) => {
        AI.send(
            [{ role: 'user', content: 'q' }],
            () => { throw new Error('should not succeed'); },
            (err) => {
                assert.ok(err.indexOf('空') !== -1 || err.indexOf('empty') !== -1);
                resolve();
            }
        );
    });
});

test('AIService: buildMessages assembles system + history + new', () => {
    const env = makeEnv();
    const AI = loadAI(env.window);
    const msgs = AI.buildMessages('system prompt',
        [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }],
        'c');
    assert.equal(msgs.length, 4);
    assert.equal(msgs[0].role, 'system');
    assert.equal(msgs[1].role, 'user');
    assert.equal(msgs[2].role, 'assistant');
    assert.equal(msgs[3].role, 'user');
    assert.equal(msgs[3].content, 'c');
});

test('AIService: buildMessages truncates history to last 20', () => {
    const env = makeEnv();
    const AI = loadAI(env.window);
    const history = [];
    for (let i = 0; i < 30; i++) {
        history.push({ role: 'user', content: 'q' + i });
        history.push({ role: 'assistant', content: 'a' + i });
    }
    const msgs = AI.buildMessages('s', history, 'new');
    // 1 system + 20 history (last 20 = 10 turns) + 1 new = 22
    assert.equal(msgs.length, 22);
});

test('AIService: buildMessages without newUserMessage works', () => {
    const env = makeEnv();
    const AI = loadAI(env.window);
    const msgs = AI.buildMessages('s', [{ role: 'user', content: 'a' }]);
    assert.equal(msgs.length, 2);
    assert.equal(msgs[1].content, 'a');
});

test('AIService: sendStream skips malformed JSON lines', async () => {
    const env = makeEnv();
    const chunks = [
        'data: this is not json',
        'data: {"choices":[{"delta":{"content":"valid"}}]}',
        'data: [DONE]'
    ];
    env.window.fetch = () => Promise.resolve(makeSSE(chunks));
    const AI = loadAI(env.window);
    await new Promise((resolve) => {
        AI.sendStream(
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

test('AIService: sendStream sends correct request body and headers', async () => {
    const env = makeEnv();
    let captured = null;
    env.window.fetch = (url, opts) => {
        captured = { url: url, opts: opts };
        return Promise.resolve(makeSSE([
            'data: {"choices":[{"delta":{"content":"ok"}}]}',
            'data: [DONE]'
        ]));
    };
    const AI = loadAI(env.window);
    await new Promise((resolve) => {
        AI.sendStream(
            [{ role: 'user', content: 'hi' }],
            () => {},
            () => resolve(),
            () => resolve()
        );
    });
    assert.ok(captured, 'fetch was not called');
    assert.ok(captured.url.indexOf('/chat/completions') !== -1, 'url should target chat completions: ' + captured.url);
    assert.equal(captured.opts.method, 'POST');
    assert.ok(captured.opts.headers['Authorization'].indexOf('sk-test') !== -1, 'should include api key in Authorization header');
    const body = JSON.parse(captured.opts.body);
    assert.equal(body.model, 'test-model');
    assert.equal(body.stream, true);
    assert.deepEqual(body.messages, [{ role: 'user', content: 'hi' }]);
});

test('AIService: sendStream abort stops further processing', async () => {
    const env = makeEnv();
    const text = 'data: {"choices":[{"delta":{"content":"a"}}}]\n' +
                 'data: {"choices":[{"delta":{"content":"b"}}}]\n' +
                 'data: [DONE]\n';
    const body = new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"first"}}]}\n'));
        },
        pull(controller) {
            // never enqueue more; we abort before pulling
        }
    });
    env.window.fetch = () => Promise.resolve({ ok: true, status: 200, body: body, text: () => Promise.resolve(text) });
    const AI = loadAI(env.window);
    let chunks = 0;
    let calledDone = false;
    let calledError = false;
    const ctrl = AI.sendStream(
        [{ role: 'user', content: 'q' }],
        () => { chunks++; },
        () => { calledDone = true; },
        () => { calledError = true; }
    );
    await new Promise(r => setTimeout(r, 50));
    ctrl.abort();
    await new Promise(r => setTimeout(r, 50));
    assert.equal(calledDone, false, 'onDone should not be called after abort');
    assert.equal(calledError, false, 'onError should not be called after abort');
});

test('AIService: send (non-stream) server error calls onError', async () => {
    const env = makeEnv();
    env.window.fetch = () => Promise.resolve(makeErrorResponse(500, 'Internal Server Error'));
    const AI = loadAI(env.window);
    await new Promise((resolve) => {
        AI.send(
            [{ role: 'user', content: 'q' }],
            () => { throw new Error('should not succeed'); },
            (err) => {
                assert.ok(err.indexOf('500') !== -1, 'should include status code: ' + err);
                resolve();
            }
        );
    });
});

test('AIService: send (non-stream) network error calls onError', async () => {
    const env = makeEnv();
    env.window.fetch = () => Promise.reject(new Error('dns lookup failed'));
    const AI = loadAI(env.window);
    await new Promise((resolve) => {
        AI.send(
            [{ role: 'user', content: 'q' }],
            () => { throw new Error('should not succeed'); },
            (err) => {
                assert.ok(err.indexOf('dns lookup') !== -1, 'should include error message: ' + err);
                resolve();
            }
        );
    });
});

test('AIService: send (non-stream) missing apiKey calls onError', async () => {
    const env = makeEnv();
    loadScripts(env.window, 'taskpane/services/config.js');
    loadScripts(env.window, 'taskpane/services/ai.js');
    const AI = env.window.AIService;
    let captured = null;
    await new Promise((resolve) => {
        AI.send(
            [{ role: 'user', content: 'q' }],
            () => { throw new Error('should not succeed'); },
            (err) => { captured = err; resolve(); }
        );
    });
    assert.ok(captured && captured.indexOf('API Key') !== -1, 'expected API Key error, got: ' + captured);
});

test('AIService: send (non-stream) missing choices calls onError', async () => {
    const env = makeEnv();
    env.window.fetch = () => Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ choices: [] })
    });
    const AI = loadAI(env.window);
    await new Promise((resolve) => {
        AI.send(
            [{ role: 'user', content: 'q' }],
            () => { throw new Error('should not succeed'); },
            (err) => {
                assert.ok(err.indexOf('空') !== -1 || err.indexOf('empty') !== -1, 'got: ' + err);
                resolve();
            }
        );
    });
});

test('AIService: buildMessages without system works', () => {
    const env = makeEnv();
    const AI = loadAI(env.window);
    const msgs = AI.buildMessages('', [{ role: 'user', content: 'a' }], 'b');
    // Empty systemPrompt is falsy and skipped, leaving 1 history + 1 new = 2
    assert.equal(msgs.length, 2);
    assert.equal(msgs[0].role, 'user');
    assert.equal(msgs[1].role, 'user');
    assert.equal(msgs[1].content, 'b');
});

test('AIService: buildMessages copies only role and content from history', () => {
    const env = makeEnv();
    const AI = loadAI(env.window);
    const history = [
        { role: 'user', content: 'q1', extra: 'should be dropped' }
    ];
    const msgs = AI.buildMessages('sys', history, 'new');
    assert.equal(msgs.length, 3);
    assert.equal(msgs[0].role, 'system');
    assert.equal(msgs[1].role, 'user');
    assert.equal(msgs[1].content, 'q1');
    assert.equal(msgs[1].extra, undefined, 'extra fields on history should not be forwarded');
});

test('AIService: buildMessages omits new message when empty', () => {
    const env = makeEnv();
    const AI = loadAI(env.window);
    const msgs = AI.buildMessages('sys', [{ role: 'user', content: 'a' }], '');
    assert.equal(msgs.length, 2);
    assert.equal(msgs[1].content, 'a');
});
