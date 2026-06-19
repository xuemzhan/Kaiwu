const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts, mockVendorLibs } = require('./_setup');

test('SessionManager: create generates session ID with correct format', async () => {
    const env = makeEnv();
    mockVendorLibs(env.window);
    env.window.fetch = async () => ({ ok: true, json: async () => ({ id: 'ses-123', title: 'Test' }) });
    loadScripts(env.window, ['taskpane/services/config.js', 'taskpane/services/session-manager.js']);

    const sm = env.window.SessionManager;
    let result = null;
    let error = null;

    await new Promise((resolve) => {
        sm.create('doc-1', { title: 'Test' },
            (session) => { result = session; resolve(); },
            (err) => { error = err; resolve(); }
        );
    });

    assert.strictEqual(error, null, 'Should not have error');
    assert.ok(result, 'Should have result');
    assert.ok(result.id, 'Should have session id');
    assert.strictEqual(result.documentId, 'doc-1', 'Should store documentId');
});

test('SessionManager: get returns null for unknown document', async () => {
    const env = makeEnv();
    mockVendorLibs(env.window);
    loadScripts(env.window, ['taskpane/services/config.js', 'taskpane/services/session-manager.js']);

    const sm = env.window.SessionManager;
    const result = sm.get('unknown-doc');
    assert.strictEqual(result, null, 'Should return null for unknown document');
});

test('SessionManager: get returns stored session', async () => {
    const env = makeEnv();
    mockVendorLibs(env.window);
    env.window.fetch = async () => ({ ok: true, json: async () => ({ id: 'ses-456', title: 'Test2' }) });
    loadScripts(env.window, ['taskpane/services/config.js', 'taskpane/services/session-manager.js']);

    const sm = env.window.SessionManager;

    await new Promise((resolve) => {
        sm.create('doc-2', { title: 'Test2' },
            () => { resolve(); },
            (err) => { assert.fail(err); resolve(); }
        );
    });

    const stored = sm.get('doc-2');
    assert.ok(stored, 'Should retrieve stored session');
    assert.strictEqual(stored.id, 'ses-456', 'Should have correct id');
});

test('SessionManager: clear removes session', async () => {
    const env = makeEnv();
    mockVendorLibs(env.window);
    env.window.fetch = async () => ({ ok: true, json: async () => ({ id: 'ses-789', title: 'Test3' }) });
    loadScripts(env.window, ['taskpane/services/config.js', 'taskpane/services/session-manager.js']);

    const sm = env.window.SessionManager;

    await new Promise((resolve) => {
        sm.create('doc-3', { title: 'Test3' },
            () => { resolve(); },
            (err) => { assert.fail(err); resolve(); }
        );
    });

    sm.clear('doc-3');
    const stored = sm.get('doc-3');
    assert.strictEqual(stored, null, 'Should be cleared');
});

test('SessionManager: cleanup removes document session', async () => {
    const env = makeEnv();
    mockVendorLibs(env.window);
    let deleteCalled = false;
    env.window.fetch = async (url, options) => {
        if (options && options.method === 'DELETE') {
            deleteCalled = true;
            return { ok: true };
        }
        return { ok: true, json: async () => ({ id: 'ses-cleanup-1', title: 'Cleanup Test' }) };
    };
    loadScripts(env.window, ['taskpane/services/config.js', 'taskpane/services/session-manager.js']);

    const sm = env.window.SessionManager;

    await new Promise((resolve) => {
        sm.create('doc-cleanup', { title: 'Cleanup Test' },
            () => { resolve(); },
            (err) => { assert.fail(err); }
        );
    });

    const sessionBefore = sm.get('doc-cleanup');
    assert.ok(sessionBefore, 'Session should exist before cleanup');

    await new Promise((resolve) => {
        sm.cleanup('doc-cleanup',
            () => { resolve(); },
            (err) => { assert.fail(err); }
        );
    });

    assert.ok(deleteCalled, 'DELETE request should be made');
    const sessionAfter = sm.get('doc-cleanup');
    assert.strictEqual(sessionAfter, null, 'Session should be removed after cleanup');
});

test('SessionManager: prune removes old sessions', async () => {
    const env = makeEnv();
    mockVendorLibs(env.window);
    let deleteCount = 0;
    env.window.fetch = async (url, options) => {
        if (options && options.method === 'DELETE') {
            deleteCount++;
            return { ok: true };
        }
        return { ok: true, json: async () => ({ id: 'ses-prune-1', title: 'Prune Test' }) };
    };
    loadScripts(env.window, ['taskpane/services/config.js', 'taskpane/services/session-manager.js']);

    const sm = env.window.SessionManager;

    sm._sessions['doc-old'] = { id: 'ses-old-1', documentId: 'doc-old', createdAt: Date.now() - (8 * 24 * 60 * 60 * 1000) };
    sm._sessions['doc-new'] = { id: 'ses-new-1', documentId: 'doc-new', createdAt: Date.now() - (1 * 24 * 60 * 60 * 1000) };

    await new Promise((resolve) => {
        sm.prune(7 * 24 * 60 * 60 * 1000,
            (count) => {
                assert.strictEqual(count, 1, 'Should prune 1 session');
                resolve();
            },
            (err) => { assert.fail(err); }
        );
    });

    assert.strictEqual(deleteCount, 1, 'Should call DELETE once');
    assert.strictEqual(sm.get('doc-new')?.id, 'ses-new-1', 'New session should remain');
    assert.strictEqual(sm.get('doc-old'), null, 'Old session should be removed');
});

test('SessionManager: abort calls correct endpoint', async () => {
    const env = makeEnv();
    mockVendorLibs(env.window);

    let abortUrl = null;
    let abortMethod = null;
    let abortAuth = null;

    env.window.fetch = async (url, options) => {
        if (url.includes('/abort')) {
            abortUrl = url;
            abortMethod = options?.method;
            abortAuth = options?.headers?.['Authorization'];
            return { ok: true };
        }
        return { ok: true, json: async () => ({ id: 'ses-test', title: 'Test' }) };
    };
    loadScripts(env.window, ['taskpane/services/config.js', 'taskpane/services/session-manager.js']);

    const sm = env.window.SessionManager;
    let success = false;
    let error = null;

    await new Promise((resolve) => {
        sm.abort('ses-123',
            (result) => { success = result; resolve(); },
            (err) => { error = err; resolve(); }
        );
    });

    assert.strictEqual(error, null, 'Should not have error');
    assert.strictEqual(success, true, 'Should call onSuccess');
    assert.strictEqual(abortMethod, 'POST', 'Should use POST method');
    assert.ok(abortUrl?.includes('/session/ses-123/abort'), 'Should call correct abort endpoint');
    assert.ok(abortAuth?.startsWith('Basic '), 'Should include Basic auth');
});

test('AppSessionManager: cleanup called on document close', async () => {
    const env = makeEnv();
    mockVendorLibs(env.window);

    let cleanupCalled = false;
    let cleanupDocId = null;

    env.window.fetch = async () => ({ ok: true, json: async () => ({ id: 'ses-close-test', title: 'Close Test' }) });
    loadScripts(env.window, ['taskpane/services/config.js', 'taskpane/services/session-manager.js']);

    const sm = env.window.SessionManager;

    await new Promise((resolve) => {
        sm.create('doc-close-test', { title: 'Close Test' },
            () => { resolve(); },
            () => { resolve(); }
        );
    });

    sm.cleanup = function(docId, onSuccess, onError) {
        cleanupCalled = true;
        cleanupDocId = docId;
        onSuccess && onSuccess(true);
    };

    loadScripts(env.window, ['taskpane/app.js']);

    env.window.Application.ActiveDocument = { Name: 'doc-close-test' };

    const appSM = env.window.AppSessionManager;
    assert.ok(appSM, 'AppSessionManager should be defined');
    assert.strictEqual(typeof appSM._cleanupCurrentDocumentSessions, 'function', 'Should have cleanup method');

    appSM._cleanupCurrentDocumentSessions();

    assert.strictEqual(cleanupCalled, true, 'SessionManager.cleanup should be called');
    assert.strictEqual(cleanupDocId, 'doc-close-test', 'Should pass correct documentId');
});

test('AppSessionManager: getCurrentDocumentId returns document name', async () => {
    const env = makeEnv();
    mockVendorLibs(env.window);

    loadScripts(env.window, ['taskpane/services/config.js', 'taskpane/services/session-manager.js', 'taskpane/app.js']);

    env.window.Application.ActiveDocument = { Name: 'test-document.docx' };

    const appSM = env.window.AppSessionManager;
    const docId = appSM._getCurrentDocumentId();

    assert.strictEqual(docId, 'test-document.docx', 'Should return document name');
});

test('AppSessionManager: prune removes sessions older than maxAge', async () => {
    const env = makeEnv();
    mockVendorLibs(env.window);

    let pruneCount = 0;
    let pruneMaxAge = null;

    env.window.fetch = async () => ({ ok: true });
    loadScripts(env.window, ['taskpane/services/config.js', 'taskpane/services/session-manager.js']);

    const sm = env.window.SessionManager;

    sm._sessions['doc-old-1'] = { id: 'ses-old-1', documentId: 'doc-old-1', createdAt: Date.now() - (10 * 24 * 60 * 60 * 1000) };
    sm._sessions['doc-old-2'] = { id: 'ses-old-2', documentId: 'doc-old-2', createdAt: Date.now() - (15 * 24 * 60 * 60 * 1000) };
    sm._sessions['doc-new'] = { id: 'ses-new-1', documentId: 'doc-new', createdAt: Date.now() - (1 * 24 * 60 * 60 * 1000) };

    sm.prune = function(maxAge, onComplete) {
        pruneCount++;
        pruneMaxAge = maxAge;
        var now = Date.now();
        var toDelete = [];
        for (var docId in this._sessions) {
            if (this._sessions[docId].createdAt && (now - this._sessions[docId].createdAt) > maxAge) {
                toDelete.push({ docId: docId, sessionId: this._sessions[docId].id });
            }
        }
        toDelete.forEach(function(item) {
            delete this._sessions[item.docId];
        }.bind(this));
        onComplete && onComplete(toDelete.length);
    };

    loadScripts(env.window, ['taskpane/app.js']);

    const appSM = env.window.AppSessionManager;
    assert.ok(appSM._startSessionPruneTimer, 'Should have prune timer method');
});
