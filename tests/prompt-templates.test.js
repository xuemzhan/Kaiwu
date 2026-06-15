/**
 * tests/prompt-templates.test.js — PromptTemplates 单元测试
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts } = require('./_setup');

function loadTpl() {
    const { window } = makeEnv();
    loadScripts(window, 'taskpane/actions/prompt-templates.js');
    return window.PromptTemplates;
}

test('PromptTemplates: buildMessages returns [system, user] pair', () => {
    const tpl = loadTpl();
    const msgs = tpl.buildMessages('write', { input: '写一份周报' });
    assert.equal(msgs.length, 2);
    assert.equal(msgs[0].role, 'system');
    assert.equal(msgs[1].role, 'user');
    assert.ok(msgs[1].content.indexOf('写一份周报') !== -1);
});

test('PromptTemplates: substitutes {{input}} placeholder', () => {
    const tpl = loadTpl();
    const msgs = tpl.buildMessages('polish_quick', { input: '今天天气很好' });
    assert.ok(msgs[1].content.indexOf('今天天气很好') !== -1);
    assert.ok(msgs[1].content.indexOf('{{input}}') === -1);
});

test('PromptTemplates: substitutes {{question}} placeholder for imitate', () => {
    const tpl = loadTpl();
    const msgs = tpl.buildMessages('imitate', { input: '权威报告', question: '关于AI的报告' });
    assert.ok(msgs[1].content.indexOf('权威报告') !== -1, 'should embed style sample');
    assert.ok(msgs[1].content.indexOf('关于AI的报告') !== -1, 'should embed user question');
});

test('PromptTemplates: throws on unknown prompt key', () => {
    const tpl = loadTpl();
    assert.throws(() => tpl.buildMessages('nonexistent', { input: 'x' }), /未找到/);
});

test('PromptTemplates: covers all expected actions', () => {
    const tpl = loadTpl();
    const expected = [
        'write', 'continue_write', 'imitate',
        'polish_quick', 'polish_formal', 'polish_government',
        'correct', 'expand', 'shrink', 'rewrite',
        'translate', 'summarize', 'doc_summary'
    ];
    for (const key of expected) {
        const t = tpl._templates[key];
        assert.ok(t, 'missing template: ' + key);
        assert.ok(t.system && t.user, 'incomplete template: ' + key);
    }
});

test('PromptTemplates: handles missing input gracefully', () => {
    const tpl = loadTpl();
    const msgs = tpl.buildMessages('write', {});
    // {{input}} is replaced with empty string
    assert.equal(msgs[1].content.indexOf('{{input}}'), -1);
});
