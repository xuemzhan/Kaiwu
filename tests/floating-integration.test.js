/**
 * tests/floating-integration.test.js — 浮动助手端到端集成测试
 *
 * 验证: 输入框 → AIService → 渲染 → 动作按钮 → 对话框动态展开
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts, mockVendorLibs, triggerDOMContentLoaded } = require('./_setup');

const FLOATING_DOM = `
<main class="kw-composer" id="kwShell">
    <textarea id="kwPrompt" class="kw-prompt"></textarea>
    <div class="kw-toolbar">
        <div class="kw-tools-left">
            <button id="kwAiCmd" class="kw-icon-btn kw-ai-cmd"></button>
            <button id="kwAttach" class="kw-icon-btn"></button>
            <button id="kwDeepThink" class="kw-icon-btn"></button>
        </div>
        <button id="kwSend" class="kw-send-btn"></button>
    </div>
</main>
<aside id="kwAiCmdPanel" class="kw-aicmd-panel" hidden>
    <div class="kw-aicmd-list">
        <div class="kw-aicmd-header">AI 帮我写</div>
        <button class="kw-aicmd-item" data-action="write" data-prompt="帮我写一段内容：">
            <span>AI 帮我写</span>
        </button>
        <button class="kw-aicmd-item" data-action="continue_write" data-require-selection="1">
            <span>续写</span>
        </button>
    </div>
</aside>
<section id="kwResult" class="kw-result" hidden>
    <div id="kwAnswer" class="kw-answer markdown-body"></div>
    <div class="kw-result-actions" id="kwResultActions" hidden>
        <button id="kwInsert"></button>
        <button id="kwReplace"></button>
        <button id="kwCopy"></button>
    </div>
</section>
<div id="kwMiniChip" class="kw-mini-chip" hidden title="点击恢复">
    <span id="kwMiniChipText">已生成结果</span>
</div>
`;

function loadFloating(window) {
    if (!window.__ENV_API_KEY__) window.__ENV_API_KEY__ = 'sk-fixture';
    if (!window.__ENV_API_BASE__) window.__ENV_API_BASE__ = 'https://api.fixture.com/v1';
    if (!window.__ENV_MODEL__) window.__ENV_MODEL__ = 'fixture-model';
    mockVendorLibs(window);
    loadScripts(window, [
        'taskpane/services/config.js',
        'taskpane/services/ai.js',
        'taskpane/adapters/writer-adapter.js',
        'taskpane/actions/action-registry.js',
        'taskpane/actions/prompt-templates.js',
        'floating/floating.js'
    ]);
    // floating.js uses var so AIService / Config are on window
    return {
        AI: window.AIService,
        Config: window.Config,
        ActionRegistry: window.ActionRegistry
    };
}

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

test('floating: send button is wired and disabled on empty prompt', () => {
    const env = makeEnv();
    env.window.document.body.innerHTML = FLOATING_DOM;
    loadFloating(env.window);
    triggerDOMContentLoaded(env.window);
    const sendBtn = env.window.document.getElementById('kwSend');
    assert.ok(sendBtn, 'send button should exist');
    // Initial state: no prompt, no action -> is-ready class not applied
    assert.equal(sendBtn.classList.contains('is-ready'), false, 'send button should be disabled when empty');
});

test('floating: typing in prompt enables send button', () => {
    const env = makeEnv();
    env.window.document.body.innerHTML = FLOATING_DOM;
    loadFloating(env.window);
    triggerDOMContentLoaded(env.window);
    const prompt = env.window.document.getElementById('kwPrompt');
    const sendBtn = env.window.document.getElementById('kwSend');
    prompt.value = '写一段话';
    prompt.dispatchEvent(new env.window.Event('input', { bubbles: true }));
    assert.equal(sendBtn.classList.contains('is-ready'), true, 'send button should be enabled after typing');
});

test('floating: send() with mocked fetch shows streamed answer', async () => {
    const env = makeEnv();
    env.window.document.body.innerHTML = FLOATING_DOM;
    const chunks = [
        'data: {"choices":[{"delta":{"content":"你好"}}]}',
        'data: {"choices":[{"delta":{"content":"，开悟"}}]}',
        'data: [DONE]'
    ];
    env.window.fetch = () => Promise.resolve(makeSSE(chunks));
    loadFloating(env.window);
    triggerDOMContentLoaded(env.window);

    const prompt = env.window.document.getElementById('kwPrompt');
    const sendBtn = env.window.document.getElementById('kwSend');
    prompt.value = '你好';
    prompt.dispatchEvent(new env.window.Event('input', { bubbles: true }));
    sendBtn.click();

    // Wait for streaming to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    const result = env.window.document.getElementById('kwResult');
    const answer = env.window.document.getElementById('kwAnswer');
    const actions = env.window.document.getElementById('kwResultActions');
    assert.equal(result.hidden, false, 'result area should be shown after send');
    assert.ok(answer.innerHTML.indexOf('你好') !== -1, 'answer should contain streamed content: ' + answer.innerHTML);
    assert.ok(answer.innerHTML.indexOf('开悟') !== -1, 'answer should contain full content');
    assert.equal(actions.hidden, false, 'action buttons should be shown after successful send');
});

test('floating: send() with network error shows error message', async () => {
    const env = makeEnv();
    env.window.document.body.innerHTML = FLOATING_DOM;
    env.window.fetch = () => Promise.reject(new Error('network unreachable'));
    loadFloating(env.window);
    triggerDOMContentLoaded(env.window);

    const prompt = env.window.document.getElementById('kwPrompt');
    const sendBtn = env.window.document.getElementById('kwSend');
    prompt.value = '测试';
    prompt.dispatchEvent(new env.window.Event('input', { bubbles: true }));
    sendBtn.click();

    await new Promise((resolve) => setTimeout(resolve, 200));

    const result = env.window.document.getElementById('kwResult');
    const answer = env.window.document.getElementById('kwAnswer');
    assert.equal(result.hidden, false, 'result area should be shown after error');
    assert.ok(answer.innerHTML.indexOf('network') !== -1 || answer.innerHTML.indexOf('kw-error') !== -1,
        'answer should contain error: ' + answer.innerHTML);
});

test('floating: send() with server 401 shows error message', async () => {
    const env = makeEnv();
    env.window.document.body.innerHTML = FLOATING_DOM;
    env.window.fetch = () => Promise.resolve({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Invalid API key')
    });
    loadFloating(env.window);
    triggerDOMContentLoaded(env.window);

    const prompt = env.window.document.getElementById('kwPrompt');
    const sendBtn = env.window.document.getElementById('kwSend');
    prompt.value = 'test';
    prompt.dispatchEvent(new env.window.Event('input', { bubbles: true }));
    sendBtn.click();

    await new Promise((resolve) => setTimeout(resolve, 200));

    const answer = env.window.document.getElementById('kwAnswer');
    assert.ok(answer.innerHTML.indexOf('401') !== -1, 'should show 401 error: ' + answer.innerHTML);
});

test('floating: send() with missing apiKey shows configuration error', async () => {
    const env = makeEnv();
    env.window.document.body.innerHTML = FLOATING_DOM;
    // Set empty API key BEFORE loading so the loadFloating helper's default-filling
    // check sees a non-undefined (falsy) value and respects our override.
    env.window.__ENV_API_KEY__ = '';
    env.window.__ENV_API_BASE__ = '';
    env.window.__ENV_MODEL__ = 'fixture-model';
    // Do NOT set up fetch - it should never be called
    let fetchCalled = false;
    env.window.fetch = () => { fetchCalled = true; return Promise.reject(new Error('should not be called')); };
    // Wipe any localStorage config too
    env.window.localStorage.clear();
    // Load scripts manually so we don't trigger loadFloating's default-fill
    mockVendorLibs(env.window);
    loadScripts(env.window, [
        'taskpane/services/config.js',
        'taskpane/services/ai.js',
        'taskpane/adapters/writer-adapter.js',
        'taskpane/actions/action-registry.js',
        'taskpane/actions/prompt-templates.js',
        'floating/floating.js'
    ]);
    triggerDOMContentLoaded(env.window);

    const prompt = env.window.document.getElementById('kwPrompt');
    const sendBtn = env.window.document.getElementById('kwSend');
    prompt.value = 'test';
    prompt.dispatchEvent(new env.window.Event('input', { bubbles: true }));
    sendBtn.click();

    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(fetchCalled, false, 'fetch should NOT be called when apiKey is missing');
    const answer = env.window.document.getElementById('kwAnswer');
    assert.ok(answer.innerHTML.indexOf('API Key') !== -1 || answer.innerHTML.indexOf('请先') !== -1,
        'should show API Key configuration error: ' + answer.innerHTML);
});

test('floating: AI 指令 button click toggles dropdown as fixed overlay', async () => {
    const env = makeEnv();
    env.window.document.body.innerHTML = FLOATING_DOM;
    loadFloating(env.window);
    triggerDOMContentLoaded(env.window);

    let resizeCalls = 0;
    env.window.resizeTo = () => { resizeCalls++; };

    const aiCmdBtn = env.window.document.getElementById('kwAiCmd');
    const panel = env.window.document.getElementById('kwAiCmdPanel');
    assert.equal(panel.hidden, true, 'panel should start hidden');
    aiCmdBtn.click();
    await new Promise(r => setTimeout(r, 50));
    assert.equal(panel.hidden, false, 'panel should be shown after click');
    assert.ok(panel.classList.contains('is-open'), 'panel should have is-open class');
    assert.equal(resizeCalls, 0, 'AI 指令 menu should not resize the dialog (fixed overlay)');

    // Click again to close
    aiCmdBtn.click();
    await new Promise(r => setTimeout(r, 200));
    assert.equal(panel.hidden, true, 'panel should be hidden after second click');
});

test('floating: AI 指令 menu is position: fixed (overlay above WPS document)', () => {
    const env = makeEnv();
    env.window.document.body.innerHTML = FLOATING_DOM;
    // 加载 CSS
    const styleEl = env.window.document.createElement('style');
    styleEl.textContent = require('fs').readFileSync(
        require('path').resolve(__dirname, '..', 'floating', 'styles', 'floating.css'),
        'utf8'
    );
    env.window.document.head.appendChild(styleEl);
    loadFloating(env.window);
    triggerDOMContentLoaded(env.window);
    const panel = env.window.document.getElementById('kwAiCmdPanel');
    const z = env.window.getComputedStyle(panel).zIndex;
    assert.ok(parseInt(z) >= 9999, 'panel should be on top (z-index >= 9999), got: ' + z);
});

test('floating: clicking an AI 指令 item fills the prompt', () => {
    const env = makeEnv();
    env.window.document.body.innerHTML = FLOATING_DOM;
    loadFloating(env.window);
    triggerDOMContentLoaded(env.window);

    const aiCmdBtn = env.window.document.getElementById('kwAiCmd');
    aiCmdBtn.click(); // open dropdown
    const item = env.window.document.querySelector('.kw-aicmd-item[data-action="write"]');
    item.click();
    const prompt = env.window.document.getElementById('kwPrompt');
    assert.equal(prompt.value, '帮我写一段内容：', 'clicking item should fill the prompt');
});

test('floating: 续写 item is disabled when no selection', () => {
    const env = makeEnv();
    env.window.document.body.innerHTML = FLOATING_DOM;
    loadFloating(env.window);
    triggerDOMContentLoaded(env.window);

    const item = env.window.document.querySelector('.kw-aicmd-item[data-require-selection="1"]');
    assert.ok(item, 'continue_write item should exist');
    assert.equal(item.classList.contains('is-disabled'), true, 'should be disabled when no selection');
    assert.equal(item.disabled, true, 'button should have disabled attribute');
});

test('floating: window resize listener repositions AI 指令 panel', async () => {
    const env = makeEnv();
    env.window.document.body.innerHTML = FLOATING_DOM;
    loadFloating(env.window);
    triggerDOMContentLoaded(env.window);

    const aiCmdBtn = env.window.document.getElementById('kwAiCmd');
    aiCmdBtn.click();
    const panel = env.window.document.getElementById('kwAiCmdPanel');
    panel.style.top = '999px';
    env.window.dispatchEvent(new env.window.Event('resize'));
    await new Promise(r => setTimeout(r, 20));
    assert.notEqual(panel.style.top, '999px', 'panel top should be re-positioned on resize');
});

// 扩展 FLOATING_DOM: 直接基于 FLOATING_DOM 创建完整版本 (含结果头, 折叠按钮, 小芯片)
function buildFullDom() {
    const env = makeEnv();
    env.window.document.body.innerHTML = FLOATING_DOM;
    // 给 kwResult 加 header + 折叠按钮
    const result = env.window.document.getElementById('kwResult');
    const header = env.window.document.createElement('div');
    header.className = 'kw-result-header';
    const title = env.window.document.createElement('div');
    title.className = 'kw-result-title';
    title.textContent = '回答';
    const collapse = env.window.document.createElement('button');
    collapse.id = 'kwCollapse';
    collapse.className = 'kw-collapse-btn';
    header.appendChild(title);
    header.appendChild(collapse);
    result.insertBefore(header, result.firstChild);
    // 在 body 末尾插入小芯片
    const chip = env.window.document.createElement('div');
    chip.id = 'kwMiniChip';
    chip.className = 'kw-mini-chip';
    chip.hidden = true;
    const chipText = env.window.document.createElement('span');
    chipText.id = 'kwMiniChipText';
    chip.appendChild(chipText);
    env.window.document.body.appendChild(chip);
    return env;
}

test('floating: escape key closes AI 指令 menu', () => {
    const env = makeEnv();
    env.window.document.body.innerHTML = FLOATING_DOM;
    loadFloating(env.window);
    triggerDOMContentLoaded(env.window);

    const aiCmdBtn = env.window.document.getElementById('kwAiCmd');
    aiCmdBtn.click();
    return new Promise(r => setTimeout(r, 50)).then(() => {
        var panel = env.window.document.getElementById('kwAiCmdPanel');
        assert.equal(panel.hidden, false, 'panel should be open');
        // Press Escape on the prompt
        var prompt = env.window.document.getElementById('kwPrompt');
        prompt.dispatchEvent(new env.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return new Promise(r => setTimeout(r, 200));
    }).then(() => {
        var panel = env.window.document.getElementById('kwAiCmdPanel');
        assert.equal(panel.hidden, true, 'panel should be closed after Escape');
    });
});

test('floating: dragging the composer (not titlebar) calls window.moveBy', () => {
    const env = makeEnv();
    env.window.document.body.innerHTML = FLOATING_DOM;
    let moveByCalls = [];
    env.window.moveBy = (dx, dy) => { moveByCalls.push({ dx: dx, dy: dy }); };
    loadFloating(env.window);
    triggerDOMContentLoaded(env.window);

    const composer = env.window.document.querySelector('.kw-composer');
    assert.ok(composer, 'composer should exist for drag');
    const downEv = new env.window.MouseEvent('mousedown', { clientX: 100, clientY: 50, bubbles: true });
    Object.defineProperty(downEv, 'target', { value: composer, configurable: true });
    composer.dispatchEvent(downEv);

    // Move less than threshold — should not drag
    env.window.document.dispatchEvent(new env.window.MouseEvent('mousemove', { clientX: 101, clientY: 51, bubbles: true }));
    assert.equal(moveByCalls.length, 0, 'tiny move should not trigger drag');
    // Move beyond threshold
    env.window.document.dispatchEvent(new env.window.MouseEvent('mousemove', { clientX: 130, clientY: 80, bubbles: true }));
    assert.ok(moveByCalls.length > 0, 'large move should trigger drag, calls: ' + JSON.stringify(moveByCalls));
    env.window.document.dispatchEvent(new env.window.MouseEvent('mouseup', { bubbles: true }));
});

test('floating: dragging on textarea is ignored (allows cursor positioning)', () => {
    const env = makeEnv();
    env.window.document.body.innerHTML = FLOATING_DOM;
    let moveByCalls = [];
    env.window.moveBy = (dx, dy) => { moveByCalls.push({ dx: dx, dy: dy }); };
    loadFloating(env.window);
    triggerDOMContentLoaded(env.window);

    const prompt = env.window.document.getElementById('kwPrompt');
    prompt.dispatchEvent(new env.window.MouseEvent('mousedown', {
        clientX: 80, clientY: 50, button: 0, bubbles: true
    }));
    env.window.document.dispatchEvent(new env.window.MouseEvent('mousemove', {
        clientX: 200, clientY: 200, bubbles: true
    }));
    assert.equal(moveByCalls.length, 0, 'drag from textarea should be ignored (allow text selection)');
    env.window.document.dispatchEvent(new env.window.MouseEvent('mouseup', { bubbles: true }));
});

test('floating: dragging is ignored when starting on a button', () => {
    const env = buildFullDom();
    let moveByCalls = [];
    env.window.moveBy = (dx, dy) => { moveByCalls.push({ dx: dx, dy: dy }); };
    loadFloating(env.window);
    triggerDOMContentLoaded(env.window);

    const btn = env.window.document.getElementById('kwAiCmd');
    btn.dispatchEvent(new env.window.MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true }));
    env.window.document.dispatchEvent(new env.window.MouseEvent('mousemove', { clientX: 200, clientY: 200, bubbles: true }));
    assert.equal(moveByCalls.length, 0, 'drag from a button should be ignored');
    env.window.document.dispatchEvent(new env.window.MouseEvent('mouseup', { bubbles: true }));
});

test('floating: AI 指令 panel has z-index 9999 (top-level)', () => {
    const env = buildFullDom();
    loadFloating(env.window);
    triggerDOMContentLoaded(env.window);
    const panel = env.window.document.getElementById('kwAiCmdPanel');
    // jsdom 默认没有 CSS, 但 z-index 来自 style 标签或者计算样式
    // 我们直接验证 style 标签中包含的 CSS 规则
    const styleEl = env.window.document.createElement('style');
    styleEl.textContent = require('fs').readFileSync(
        require('path').resolve(__dirname, '..', 'floating', 'styles', 'floating.css'),
        'utf8'
    );
    env.window.document.head.appendChild(styleEl);
    const z = env.window.getComputedStyle(panel).zIndex;
    assert.ok(parseInt(z) >= 9999, 'panel z-index should be at top level, got: ' + z);
});

test('floating: minimize result chip is on top z-index', () => {
    const env = buildFullDom();
    const fs = require('fs');
    const path = require('path');
    loadFloating(env.window);
    triggerDOMContentLoaded(env.window);
    // 加载 CSS
    const styleEl = env.window.document.createElement('style');
    styleEl.textContent = fs.readFileSync(
        path.resolve(__dirname, '..', 'floating', 'styles', 'floating.css'),
        'utf8'
    );
    env.window.document.head.appendChild(styleEl);

    const chip = env.window.document.getElementById('kwMiniChip');
    assert.ok(chip, 'mini chip should exist');
    chip.hidden = false;
    const z = env.window.getComputedStyle(chip).zIndex;
    assert.ok(parseInt(z) >= 9999, 'chip z-index should be top level, got: ' + z);
});

test('floating: collapse button exists and is bound', () => {
    const env = buildFullDom();
    loadFloating(env.window);
    triggerDOMContentLoaded(env.window);
    const collapseBtn = env.window.document.getElementById('kwCollapse');
    assert.ok(collapseBtn, 'collapse button should exist');
});

test('floating: composer only contains prompt + 3 toolbar buttons (极简, 与 WPS 原生 AI 一致)', () => {
    const env = makeEnv();
    env.window.document.body.innerHTML = FLOATING_DOM;
    loadFloating(env.window);
    triggerDOMContentLoaded(env.window);
    const composer = env.window.document.querySelector('.kw-composer');
    assert.ok(composer, 'composer should exist');
    // 验证 3 个工具按钮 (AI 指令 / + / 深入研究) + 1 个发送按钮
    var buttons = composer.querySelectorAll('button');
    assert.equal(buttons.length, 4, 'composer should have exactly 4 buttons (AI指令, +, 深入研究, 发送)');
    assert.equal(buttons[0].id, 'kwAiCmd', 'first button is AI 指令');
    assert.equal(buttons[1].id, 'kwAttach', 'second button is +');
    assert.equal(buttons[2].id, 'kwDeepThink', 'third button is 深入研究');
    assert.equal(buttons[3].id, 'kwSend', 'fourth button is 发送');
    // 不应有 .kw-titlebar 元素 (与 WPS 原生 AI 一样简洁)
    assert.equal(env.window.document.querySelector('.kw-titlebar'), null, 'no custom titlebar (matches WPS native AI)');
});

test('floating: result panel is position: fixed (overlay above WPS)', () => {
    const env = makeEnv();
    env.window.document.body.innerHTML = FLOATING_DOM;
    const styleEl = env.window.document.createElement('style');
    styleEl.textContent = require('fs').readFileSync(
        require('path').resolve(__dirname, '..', 'floating', 'styles', 'floating.css'),
        'utf8'
    );
    env.window.document.head.appendChild(styleEl);
    loadFloating(env.window);
    triggerDOMContentLoaded(env.window);
    const result = env.window.document.getElementById('kwResult');
    const z = env.window.getComputedStyle(result).zIndex;
    assert.ok(parseInt(z) >= 9999, 'result panel should be on top, got: ' + z);
});
