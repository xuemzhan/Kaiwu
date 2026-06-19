/**
 * session-manager.js — Manages opencode sessions per document
 */
var SessionManager = {
    _sessions: {},
    _storageKey: 'kaiwu_opencode_sessions',

    _hashDocumentId: function(docId) {
        var hash = 0;
        for (var i = 0; i < docId.length; i++) {
            hash = ((hash << 5) - hash) + docId.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash).toString(16).substring(0, 8);
    },

    _loadFromStorage: function() {
        try {
            var saved = localStorage.getItem(this._storageKey);
            if (saved) return JSON.parse(saved);
        } catch (e) { /* ignore */ }
        return {};
    },

    _saveToStorage: function() {
        try {
            localStorage.setItem(this._storageKey, JSON.stringify(this._sessions));
        } catch (e) { /* ignore */ }
    },

    create: function(documentId, options, onSuccess, onError) {
        options = options || {};
        var self = this;
        var hash = this._hashDocumentId(documentId);
        var sessionId = 'kaiwu-' + hash + '-' + Date.now();

        var config = Config.getAll();
        var url = (config.opencodeUrl || 'http://127.0.0.1:4096').replace(/\/+$/, '') + '/session';
        var authHeader = 'Basic ' + btoa((config.opencodeUsername || 'opencode') + ':' + (config.opencodePassword || ''));

        fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: options.title || 'Kaiwu Session ' + hash
            })
        }).then(function(response) {
            if (!response.ok) {
                onError && onError('Failed to create session: ' + response.status);
                return;
            }
            return response.json();
        }).then(function(data) {
            if (data && data.id) {
                var session = {
                    id: data.id,
                    documentId: documentId,
                    title: data.title,
                    createdAt: Date.now()
                };
                self._sessions[documentId] = session;
                self._saveToStorage();
                onSuccess && onSuccess(session);
            } else {
                onError && onError('Invalid response from opencode');
            }
        }).catch(function(err) {
            onError && onError('Network error: ' + err.message);
        });
    },

    get: function(documentId) {
        if (!this._sessions[documentId]) {
            this._sessions = this._loadFromStorage();
        }
        return this._sessions[documentId] || null;
    },

    clear: function(documentId) {
        if (documentId) {
            delete this._sessions[documentId];
        } else {
            this._sessions = {};
        }
        this._saveToStorage();
    },

    delete: function(sessionId, onSuccess, onError) {
        var config = Config.getAll();
        var url = (config.opencodeUrl || 'http://127.0.0.1:4096').replace(/\/+$/, '') + '/session/' + sessionId;
        var authHeader = 'Basic ' + btoa((config.opencodeUsername || 'opencode') + ':' + (config.opencodePassword || ''));

        fetch(url, {
            method: 'DELETE',
            headers: { 'Authorization': authHeader }
        }).then(function(response) {
            if (response.ok) {
                for (var docId in this._sessions) {
                    if (this._sessions[docId].id === sessionId) {
                        delete this._sessions[docId];
                        break;
                    }
                }
                this._saveToStorage();
                onSuccess && onSuccess(true);
            } else {
                onError && onError('Delete failed: ' + response.status);
            }
        }.bind(this)).catch(function(err) {
            onError && onError('Network error: ' + err.message);
        });
    },

    abort: function(sessionId, onSuccess, onError) {
        var config = Config.getAll();
        var url = (config.opencodeUrl || 'http://127.0.0.1:4096').replace(/\/+$/, '') + '/session/' + sessionId + '/abort';
        var authHeader = 'Basic ' + btoa((config.opencodeUsername || 'opencode') + ':' + (config.opencodePassword || ''));

        fetch(url, {
            method: 'POST',
            headers: { 'Authorization': authHeader }
        }).then(function(response) {
            if (response.ok) {
                onSuccess && onSuccess(true);
            } else {
                onError && onError('Abort failed: ' + response.status);
            }
        }).catch(function(err) {
            onError && onError('Network error: ' + err.message);
        });
    },

    cleanup: function(documentId, onSuccess, onError) {
        var session = this._sessions[documentId];
        if (session) {
            this.delete(session.id, onSuccess, onError);
        } else {
            onSuccess && onSuccess(true);
        }
    },

    prune: function(maxAge, onComplete) {
        maxAge = maxAge || (7 * 24 * 60 * 60 * 1000);
        var now = Date.now();
        var toDelete = [];
        for (var docId in this._sessions) {
            if (this._sessions[docId].createdAt && (now - this._sessions[docId].createdAt) > maxAge) {
                toDelete.push({ docId: docId, sessionId: this._sessions[docId].id });
            }
        }
        var self = this;
        var completed = 0;
        if (toDelete.length === 0) {
            onComplete && onComplete(0);
            return;
        }
        toDelete.forEach(function(item) {
            self.delete(item.sessionId,
                function() {
                    completed++;
                    if (completed === toDelete.length) {
                        onComplete && onComplete(completed);
                    }
                },
                function() {
                    completed++;
                    if (completed === toDelete.length) {
                        onComplete && onComplete(completed);
                    }
                }
            );
        });
    }
};
