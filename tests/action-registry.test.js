/**
 * tests/action-registry.test.js — ActionRegistry 单元测试
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts } = require('./_setup');

function loadReg() {
    const { window } = makeEnv();
    loadScripts(window, 'taskpane/actions/action-registry.js');
    return window.ActionRegistry;
}

test('ActionRegistry: returns null for unknown action', () => {
    const reg = loadReg();
    assert.equal(reg.get('does_not_exist'), null);
});

test('ActionRegistry: returns action def for known id', () => {
    const reg = loadReg();
    const a = reg.get('polish_quick');
    assert.ok(a);
    assert.equal(a.id, 'polish_quick');
    assert.equal(a.label, '快速润色');
    assert.equal(a.input, 'selection');
    assert.equal(a.requireSelection, true);
});

test('ActionRegistry: list returns all registered actions', () => {
    const reg = loadReg();
    const list = reg.list();
    assert.ok(list.length >= 12);
    const ids = list.map(a => a.id);
    assert.ok(ids.includes('write'));
    assert.ok(ids.includes('continue_write'));
    assert.ok(ids.includes('imitate'));
    assert.ok(ids.includes('doc_summary'));
});

test('ActionRegistry: byCategory filters by category', () => {
    const reg = loadReg();
    const writing = reg.byCategory('writing');
    assert.ok(writing.length >= 2);
    assert.ok(writing.every(a => a.category === 'writing'));
    const modify = reg.byCategory('modify');
    assert.ok(modify.length >= 5);
});

test('ActionRegistry: imitate action uses user input + requireSelection', () => {
    const reg = loadReg();
    const a = reg.get('imitate');
    assert.ok(a);
    assert.equal(a.input, 'user');
    assert.equal(a.requireSelection, true);
    assert.equal(a.output, 'insert');
    assert.ok(a.placeholder);
});

test('ActionRegistry: cowrite action is a user-input writing action', () => {
    const reg = loadReg();
    const a = reg.get('cowrite');
    assert.ok(a, 'cowrite action should be registered');
    assert.equal(a.category, 'writing');
    assert.equal(a.input, 'user');
    assert.equal(a.promptKey, 'cowrite');
    assert.ok(a.placeholder, 'should have placeholder text');
});

test('ActionRegistry: every action has required fields', () => {
    const reg = loadReg();
    reg.list().forEach(a => {
        assert.ok(a.id, 'missing id');
        assert.ok(a.label, 'missing label: ' + a.id);
        assert.ok(a.category, 'missing category: ' + a.id);
        assert.ok(a.input, 'missing input: ' + a.id);
        assert.ok(a.output, 'missing output: ' + a.id);
        assert.ok(a.promptKey, 'missing promptKey: ' + a.id);
    });
});

test('ActionRegistry: has talk_doc', () => {
    const reg = loadReg();
    const action = reg.get('talk_doc');
    assert.ok(action, 'talk_doc action should be registered');
    assert.equal(action.label, 'AI 讲文档');
    assert.equal(action.category, 'document');
    assert.equal(action.input, 'document');
    assert.equal(action.output, 'result');
    assert.equal(action.maxTokens, 2000);
});

test('ActionRegistry: has deep_think', () => {
    const reg = loadReg();
    const action = reg.get('deep_think');
    assert.ok(action, 'deep_think action should be registered');
    assert.equal(action.label, '深度思考');
    assert.equal(action.maxTokens, 4000);
    assert.equal(action.temperature, 0.7);
});

test('ActionRegistry: has menu_deep_think', () => {
    const reg = loadReg();
    const action = reg.get('menu_deep_think');
    assert.ok(action, 'menu_deep_think action should be registered');
    assert.equal(action.label, '深度思考');
    assert.equal(action.promptKey, 'deep_think');
});

test('action-registry has legal', () => {
    const reg = loadReg();
    const action = reg.get('legal');
    assert.ok(action, 'legal action should be registered');
    assert.equal(action.label, '法律助手');
});

test('action-registry has gen_image', () => {
    const reg = loadReg();
    const action = reg.get('gen_image');
    assert.ok(action, 'gen_image action should be registered');
});

test('action-registry has summary_image', () => {
    const reg = loadReg();
    const action = reg.get('summary_image');
    assert.ok(action, 'summary_image action should be registered');
});

test('action-registry has doc_to_ppt', () => {
    const reg = loadReg();
    const action = reg.get('doc_to_ppt');
    assert.ok(action, 'doc_to_ppt action should be registered');
    assert.equal(action.label, '文档生成PPT');
    assert.equal(action.category, 'document');
    assert.equal(action.input, 'document');
    assert.equal(action.output, 'result');
    assert.equal(action.promptKey, 'doc_to_ppt');
    assert.equal(action.temperature, 0.5);
    assert.equal(action.maxTokens, 3000);
});
