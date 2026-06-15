/**
 * tests/writer-adapter.test.js — WriterAdapter 单元测试
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts } = require('./_setup');

function loadWA() {
    const env = makeEnv();
    loadScripts(env.window, 'taskpane/adapters/writer-adapter.js');
    return { ...env, WriterAdapter: env.window.WriterAdapter };
}

test('WriterAdapter: isWPSEnv returns false when no Application', () => {
    const { window, WriterAdapter } = loadWA();
    // Use delete to make `typeof window.Application` strictly 'undefined'
    delete window.Application;
    assert.equal(WriterAdapter.isWPSEnv(), false);
});

test('WriterAdapter: isAvailable returns false when no ActiveDocument', () => {
    const { WriterAdapter } = loadWA();
    assert.equal(WriterAdapter.isAvailable(), false);
});

test('WriterAdapter: getSelection returns null when no document', () => {
    const { WriterAdapter } = loadWA();
    assert.equal(WriterAdapter.getSelection(), null);
});

test('WriterAdapter: getSelectionText returns empty string when no selection', () => {
    const { WriterAdapter } = loadWA();
    assert.equal(WriterAdapter.getSelectionText(), '');
});

test('WriterAdapter: getSelectionText returns trimmed text from ActiveDocument', () => {
    const { window, WriterAdapter } = loadWA();
    window.Application.ActiveDocument = {
        Application: { Selection: { Text: '  hello world\r\n' } }
    };
    assert.equal(WriterAdapter.getSelectionText(), 'hello world');
});

test('WriterAdapter: getDocumentText returns full content text', () => {
    const { window, WriterAdapter } = loadWA();
    window.Application.ActiveDocument = {
        Content: { Text: '  document content\r\n  ' }
    };
    assert.equal(WriterAdapter.getDocumentText(), 'document content');
});

test('WriterAdapter: insertAtCursor returns true on success', () => {
    const { window, WriterAdapter } = loadWA();
    window.Application.ActiveDocument = {
        Application: { Selection: { Text: '' } }
    };
    assert.equal(WriterAdapter.insertAtCursor('inserted text'), true);
});

test('WriterAdapter: insertAtCursor returns false when no selection', () => {
    const { WriterAdapter } = loadWA();
    assert.equal(WriterAdapter.insertAtCursor('x'), false);
});

test('WriterAdapter: replaceSelection checks expected text match', () => {
    const { window, WriterAdapter } = loadWA();
    const sel = { Text: 'original content here' };
    window.Application.ActiveDocument = { Application: { Selection: sel } };
    // Match (substring): 选区包含 'original' 即可
    const r1 = WriterAdapter.replaceSelection('new', 'original');
    assert.equal(r1.ok, true, 'should match when expected is substring of selection');
    assert.equal(sel.Text, 'new');
    // Mismatch
    const sel2 = { Text: 'completely different content' };
    window.Application.ActiveDocument = { Application: { Selection: sel2 } };
    const r2 = WriterAdapter.replaceSelection('new2', 'original');
    assert.equal(r2.ok, false, 'should fail when expected is not in selection');
    assert.ok(r2.reason);
});

test('WriterAdapter: getSelectionInfo returns length and hasSelection', () => {
    const { window, WriterAdapter } = loadWA();
    window.Application.ActiveDocument = {
        Application: { Selection: { Text: '  hello  ' } }
    };
    const info = WriterAdapter.getSelectionInfo();
    assert.equal(info.text, 'hello');
    assert.equal(info.length, 5);
    assert.equal(info.hasSelection, true);
});

test('WriterAdapter: getDocumentInfo returns name and length', () => {
    const { window, WriterAdapter } = loadWA();
    window.Application.ActiveDocument = {
        Name: 'report.docx',
        Content: { Text: 'hello world' }
    };
    const info = WriterAdapter.getDocumentInfo();
    assert.equal(info.name, 'report.docx');
    assert.equal(info.length, 11);
    assert.equal(info.available, true);
});

test('WriterAdapter: getDocumentInfo returns defaults when not available', () => {
    const { WriterAdapter } = loadWA();
    const info = WriterAdapter.getDocumentInfo();
    assert.equal(info.name, '当前文档');
    assert.equal(info.length, 0);
    assert.equal(info.available, false);
});

test('WriterAdapter: handles exceptions gracefully', () => {
    const { window, WriterAdapter } = loadWA();
    window.Application.ActiveDocument = {
        get Content() { throw new Error('access denied'); }
    };
    // Should not throw
    assert.equal(WriterAdapter.getDocumentText(), '');
});
