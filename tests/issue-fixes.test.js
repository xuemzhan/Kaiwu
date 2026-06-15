/**
 * tests/issue-fixes.test.js — 本轮修复的行为测试
 *
 * 覆盖:
 *   - 场景芯片换行展示 (不再出现横向滚动条)
 *   - ResultPanel 在 done+空内容 时显示明确提示 (而非永远 "正在生成...")
 *   - ResultPanel 在流式中可取消 (abort controller)
 *   - TaskPaneManager 不再覆盖用户已调整的宽度
 *   - FloatingAssistantManager 优先使用已保存的尺寸
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeEnv, loadScripts, mockVendorLibs } = require('./_setup');

// =====================================================
// 问题 1: chip 换行展示
// =====================================================

test('fix: scenario-chips CSS uses flex-wrap, no horizontal scroll', () => {
    const css = fs.readFileSync(
        path.resolve(__dirname, '..', 'taskpane', 'styles', 'main.css'),
        'utf8'
    );
    // 找到 .scenario-chips 块
    const match = css.match(/\.scenario-chips\s*\{([^}]+)\}/);
    assert.ok(match, '.scenario-chips rule should exist');
    const body = match[1];
    assert.ok(/flex-wrap:\s*wrap/.test(body), 'should use flex-wrap: wrap');
    assert.ok(!/overflow-x:\s*auto/.test(body), 'should not use overflow-x: auto');
});

// =====================================================
// 问题 2: ResultPanel "假卡死" 修复
// =====================================================

function loadPanel() {
    const env = makeEnv();
    env.window.__ENV_API_KEY__ = 'sk-test';
    env.window.__ENV_API_BASE__ = 'https://api.test.com/v1';
    env.window.__ENV_MODEL__ = 'test';
    mockVendorLibs(env.window);
    loadScripts(env.window, [
        'taskpane/services/security.js',
        'taskpane/services/config.js',
        'taskpane/services/ai.js',
        'taskpane/adapters/writer-adapter.js',
        'taskpane/actions/action-registry.js',
        'taskpane/actions/prompt-templates.js',
        'taskpane/components/message.js',
        'taskpane/components/result-card.js',
        'taskpane/actions/action-runner.js',
        'taskpane/components/result-panel.js'
    ]);
    return Object.assign({}, env, {
        ResultCard: env.window.ResultCard,
        ResultPanel: env.window.ResultPanel
    });
}

test('fix: done status with empty resultText renders "生成内容为空" instead of "正在生成..."', () => {
    const { window, ResultCard, ResultPanel } = loadPanel();
    const mount = window.document.createElement('div');
    window.document.body.appendChild(mount);
    const card = ResultCard.create({ actionId: 'polish_quick', actionLabel: '润色' });
    ResultCard.update(card.id, { status: 'done', resultText: '' });
    ResultPanel.mount(ResultCard._cards[card.id], mount);
    const html = mount.innerHTML;
    assert.ok(html.indexOf('生成内容为空') !== -1,
        'should display "生成内容为空" hint, got: ' + html.slice(0, 200));
    assert.equal(html.indexOf('正在生成...'), -1,
        'should NOT show "正在生成..." for done-but-empty state');
});

test('fix: streaming status shows loading dots (not just static "正在生成...")', async () => {
    const { window, ResultCard, ResultPanel } = loadPanel();
    const mount = window.document.createElement('div');
    window.document.body.appendChild(mount);
    const card = ResultCard.create({ actionId: 'write', actionLabel: '写' });
    ResultCard.update(card.id, { status: 'streaming', resultText: '' });
    ResultPanel.mount(ResultCard._cards[card.id], mount, { streaming: true });
    // 等防抖渲染
    await new Promise(r => setTimeout(r, 100));
    const html = mount.innerHTML;
    assert.ok(html.indexOf('result-loading') !== -1, 'should use result-loading class');
    assert.ok(html.indexOf('result-loading-dot') !== -1, 'should render animated dots');
});

test('fix: streaming status with content renders the streamed text', async () => {
    const { window, ResultCard, ResultPanel } = loadPanel();
    const mount = window.document.createElement('div');
    window.document.body.appendChild(mount);
    const card = ResultCard.create({ actionId: 'write', actionLabel: '写' });
    ResultCard.update(card.id, { status: 'streaming', resultText: '已生成部分内容' });
    ResultPanel.mount(ResultCard._cards[card.id], mount, { streaming: true });
    await new Promise(r => setTimeout(r, 100));
    assert.ok(mount.innerHTML.indexOf('已生成部分内容') !== -1,
        'should show streamed content during streaming');
});

test('fix: streaming result has cancel button (■) instead of regenerate (↻)', async () => {
    const { window, ResultCard, ResultPanel } = loadPanel();
    const mount = window.document.createElement('div');
    window.document.body.appendChild(mount);
    const card = ResultCard.create({ actionId: 'polish_quick', actionLabel: '润色' });
    ResultCard.update(card.id, { status: 'streaming', resultText: '' });
    ResultPanel.mount(ResultCard._cards[card.id], mount, { streaming: true });
    await new Promise(r => setTimeout(r, 100));
    const html = mount.innerHTML;
    assert.ok(html.indexOf('ResultPanel.abort()') !== -1,
        'cancel button should call ResultPanel.abort()');
    assert.ok(html.indexOf('取消生成') !== -1, 'cancel button should have cancel title');
});

test('fix: done result has regenerate button (↻) not cancel', () => {
    const { window, ResultCard, ResultPanel } = loadPanel();
    const mount = window.document.createElement('div');
    window.document.body.appendChild(mount);
    const card = ResultCard.create({ actionId: 'polish_quick', actionLabel: '润色' });
    ResultCard.update(card.id, { status: 'done', resultText: 'completed' });
    ResultPanel.mount(ResultCard._cards[card.id], mount);
    const html = mount.innerHTML;
    assert.ok(html.indexOf('ResultPanel.regenerate()') !== -1,
        'should show regenerate button when done');
});

test('fix: ResultPanel.abort() marks active card as error and clears controller', () => {
    const { window, ResultCard, ResultPanel } = loadPanel();
    const mount = window.document.createElement('div');
    window.document.body.appendChild(mount);
    const card = ResultCard.create({ actionId: 'write', actionLabel: '写' });
    ResultCard.update(card.id, { status: 'streaming', resultText: 'partial' });

    // 模拟 controller
    let aborted = false;
    const fakeController = { abort: function () { aborted = true; } };
    ResultPanel.setAbortController(fakeController);
    ResultPanel.mount(ResultCard._cards[card.id], mount, { streaming: true });

    // 触发 abort
    ResultPanel.abort();

    assert.equal(aborted, true, 'controller.abort should be called');
    assert.equal(ResultCard._cards[card.id].status, 'error', 'card status should be error');
    assert.equal(ResultCard._cards[card.id].error, '已取消', 'error message should be 已取消');
    assert.equal(ResultPanel._abortController, null, 'controller should be cleared');
});

test('fix: prepareUserAction can locate kwPrompt in floating dialog context', () => {
    const env = makeEnv(`
        <textarea id="kwPrompt"></textarea>
    `);
    env.window.__ENV_API_KEY__ = 'sk-test';
    mockVendorLibs(env.window);
    loadScripts(env.window, [
        'taskpane/services/security.js',
        'taskpane/services/config.js',
        'taskpane/services/ai.js',
        'taskpane/adapters/writer-adapter.js',
        'taskpane/actions/action-registry.js',
        'taskpane/actions/prompt-templates.js',
        'taskpane/components/message.js',
        'taskpane/components/result-card.js',
        'taskpane/actions/action-runner.js'
    ]);
    // 使用一个自定义 placeholder 的动作 (imitate) 来验证 fallback
    const action = env.window.ActionRegistry.get('imitate');
    env.window.ActionRunner.prepareUserAction(action);
    const prompt = env.window.document.getElementById('kwPrompt');
    assert.ok(prompt, 'kwPrompt should exist');
    // verify the placeholder was set (uses action.placeholder first, falls back to label-based)
    assert.ok(prompt.placeholder && prompt.placeholder.length > 0,
        'placeholder should be set, got: ' + prompt.placeholder);
    assert.ok(prompt.placeholder.indexOf('仿写') !== -1 || prompt.placeholder.indexOf('风格样本') !== -1,
        'placeholder should reference the action, got: ' + prompt.placeholder);
});

// =====================================================
// 问题 3: 面板尺寸记忆
// =====================================================

function loadRibbon() {
    const env = makeEnv();
    loadScripts(env.window, ['component.js', 'taskpane/services/wakeword.js', 'ribbon.js']);
    return env;
}

test('fix: TaskPaneManager._dock does not reset width when pane already has one', () => {
    const env = loadRibbon();
    const pane = {
        _dp: 0, _w: 0,
        ID: 'tp_test',
        get DockPosition() { return this._dp; }, set DockPosition(v) { this._dp = v; },
        get Width() { return this._w; }, set Width(v) { this._w = v; }
    };
    pane._w = 720; // 模拟用户已调整为 720
    env.window.Application.PluginStorage = {
        getItem: () => null, setItem: () => {}
    };
    env.window.TaskPaneManager._dock(pane);
    assert.equal(pane._w, 720, 'width should be preserved when pane has a width');
});

test('fix: TaskPaneManager._dock applies saved width when pane has no width', () => {
    const env = loadRibbon();
    const pane = {
        _dp: 0, _w: 0,
        ID: 'tp_test2',
        get DockPosition() { return this._dp; }, set DockPosition(v) { this._dp = v; },
        get Width() { return this._w; }, set Width(v) { this._w = v; }
    };
    // 模拟 PluginStorage 中存了上次的宽度
    const storage = { _data: { 'taskpane_user_width': '680' } };
    env.window.Application.PluginStorage = {
        getItem: (k) => storage._data[k] || null,
        setItem: (k, v) => { storage._data[k] = String(v); }
    };
    env.window.TaskPaneManager._dock(pane);
    assert.equal(pane._w, 680, 'should restore saved width 680');
});

test('fix: TaskPaneManager._dock falls back to default when no saved width', () => {
    const env = loadRibbon();
    const pane = {
        _dp: 0, _w: 0,
        ID: 'tp_test3',
        get DockPosition() { return this._dp; }, set DockPosition(v) { this._dp = v; },
        get Width() { return this._w; }, set Width(v) { this._w = v; }
    };
    env.window.Application.PluginStorage = {
        getItem: () => null, setItem: () => {}
    };
    env.window.TaskPaneManager._dock(pane);
    assert.equal(pane._w, 460, 'should use default 460 when nothing saved');
});

test('fix: TaskPaneManager._dock writes current width back to storage', () => {
    const env = loadRibbon();
    const pane = {
        _dp: 0, _w: 0,
        ID: 'tp_test4',
        get DockPosition() { return this._dp; }, set DockPosition(v) { this._dp = v; },
        get Width() { return this._w; }, set Width(v) { this._w = v; }
    };
    pane._w = 800;
    const storage = { _data: {} };
    let savedValue = null;
    env.window.Application.PluginStorage = {
        getItem: (k) => storage._data[k] || null,
        setItem: (k, v) => { storage._data[k] = String(v); savedValue = v; }
    };
    env.window.TaskPaneManager._dock(pane);
    assert.equal(savedValue, '800', 'should write 800 to PluginStorage');
});

test('fix: FloatingAssistantManager.show uses saved size when available', () => {
    const env = loadRibbon();
    const storage = { _data: { 'floating_user_width': '900', 'floating_user_height': '220' } };
    let usedW = null, usedH = null;
    env.window.Application = env.window.Application || {};
    env.window.Application.PluginStorage = {
        getItem: (k) => storage._data[k] || null,
        setItem: (k, v) => { storage._data[k] = String(v); }
    };
    env.window.Application.ShowDialog = (url, title, w, h) => {
        usedW = w; usedH = h; return true;
    };
    env.window.devicePixelRatio = 1; // 简化测试
    env.window.FloatingAssistantManager.show('test', 'write');
    assert.equal(usedW, 900, 'should use saved width 900');
    assert.equal(usedH, 220, 'should use saved height 220');
});

test('fix: FloatingAssistantManager.show uses default size when no saved size', () => {
    const env = loadRibbon();
    const storage = { _data: {} };
    let usedW = null, usedH = null;
    env.window.Application = env.window.Application || {};
    env.window.Application.PluginStorage = {
        getItem: (k) => storage._data[k] || null,
        setItem: (k, v) => { storage._data[k] = String(v); }
    };
    env.window.Application.ShowDialog = (url, title, w, h) => {
        usedW = w; usedH = h; return true;
    };
    env.window.devicePixelRatio = 1;
    env.window.FloatingAssistantManager.show('test', 'write');
    assert.equal(usedW, 720, 'should use default width 720');
    assert.equal(usedH, 180, 'should use default height 180');
});

test('fix: _loadSize ignores out-of-range values (defensive)', () => {
    const env = loadRibbon();
    const storage = { _data: { 'floating_user_width': '50' } }; // 小于宽度下限 320
    env.window.Application = env.window.Application || {};
    env.window.Application.PluginStorage = {
        getItem: (k) => storage._data[k] || null,
        setItem: (k, v) => { storage._data[k] = String(v); }
    };
    const v = env.window.FloatingAssistantManager._loadSize('floating_user_width', 320, 2560);
    assert.equal(v, null, 'should ignore value below min, return null');
});
