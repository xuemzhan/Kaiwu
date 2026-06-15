/**
 * tests/component-detector.test.js — ComponentDetector 单元测试
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts } = require('./_setup');

test('ComponentDetector: detect returns wps for ActiveDocument with .docx name', () => {
    const { window } = makeEnv();
    window.Application.ActiveDocument = { Name: 'report.docx' };
    loadScripts(window, 'component.js');
    assert.equal(window.ComponentDetector._type, null);
    assert.equal(window.ComponentDetector.detect(), 'wps');
    // Cache hit on second call
    assert.equal(window.ComponentDetector.detect(), 'wps');
});

test('ComponentDetector: detect returns pdf for .pdf document name', () => {
    const { window } = makeEnv();
    window.Application.ActiveDocument = { Name: 'manual.PDF' };
    loadScripts(window, 'component.js');
    assert.equal(window.ComponentDetector.detect(), 'pdf');
});

test('ComponentDetector: detect returns wpp for ActivePresentation', () => {
    const { window } = makeEnv();
    window.Application.ActivePresentation = { Name: 'slides' };
    loadScripts(window, 'component.js');
    assert.equal(window.ComponentDetector.detect(), 'wpp');
});

test('ComponentDetector: detect returns et for ActiveWorkbook', () => {
    const { window } = makeEnv();
    window.Application.ActiveWorkbook = { Name: 'sheet' };
    loadScripts(window, 'component.js');
    assert.equal(window.ComponentDetector.detect(), 'et');
});

test('ComponentDetector: returns unknown when no Application', () => {
    const { window } = makeEnv();
    window.Application = null;
    loadScripts(window, 'component.js');
    assert.equal(window.ComponentDetector.detect(), 'unknown');
});

test('ComponentDetector: reset clears cache', () => {
    const { window } = makeEnv();
    window.Application.ActiveDocument = { Name: 'a.docx' };
    loadScripts(window, 'component.js');
    assert.equal(window.ComponentDetector.detect(), 'wps');
    window.ComponentDetector.reset();
    assert.equal(window.ComponentDetector._type, null);
});

test('ComponentDetector: getLabel returns Chinese labels', () => {
    const { window } = makeEnv();
    loadScripts(window, 'component.js');
    assert.equal(window.ComponentDetector.getLabel('wps'), '文字');
    assert.equal(window.ComponentDetector.getLabel('et'), '表格');
    assert.equal(window.ComponentDetector.getLabel('wpp'), '演示');
    assert.equal(window.ComponentDetector.getLabel('pdf'), 'PDF');
    assert.equal(window.ComponentDetector.getLabel('xxx'), '未知');
});

test('ComponentDetector: detection priorities wpp > et > wps/pdf', () => {
    const { window } = makeEnv();
    window.Application.ActivePresentation = {};
    window.Application.ActiveWorkbook = {};
    window.Application.ActiveDocument = { Name: 'a.docx' };
    loadScripts(window, 'component.js');
    assert.equal(window.ComponentDetector.detect(), 'wpp');
});

test('ComponentDetector: bindAutoReset is callable and tolerant of missing ApiEvent', () => {
    const { window } = makeEnv();
    loadScripts(window, 'component.js');
    // Should not throw even if ApiEvent is missing
    window.Application.ApiEvent = undefined;
    assert.doesNotThrow(() => window.ComponentDetector.bindAutoReset());
});

test('ComponentDetector: bindAutoReset registers listeners when ApiEvent available', () => {
    const { window } = makeEnv();
    let registered = [];
    window.Application.ApiEvent = {
        AddApiEventListener: (name) => registered.push(name)
    };
    loadScripts(window, 'component.js');
    window.ComponentDetector.bindAutoReset();
    assert.ok(registered.includes('DocumentOpen'));
    assert.ok(registered.includes('NewDocument'));
});
