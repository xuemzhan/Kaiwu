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
