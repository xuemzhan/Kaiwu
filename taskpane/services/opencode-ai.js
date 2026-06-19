/**
 * opencode-ai.js — OpenCode HTTP API client
 * Routes AI requests through local opencode-cli server (port 4096)
 * Implements same interface as AIService
 */
var OpenCodeAIService = {
    _DEFAULT_TIMEOUT_MS: 60000,
    _RETRYABLE_STATUS: 'retryable',

    send: function (messages, onSuccess, onError, options) {
        onError && onError('Not implemented');
    },

    sendStream: function (messages, onChunk, onComplete, onError, options) {
        onError && onError('Not implemented');
    },

    abort: function () {
    },

    listSessions: function (onSuccess, onError) {
        onError && onError('Not implemented');
    },

    createSession: function (parentID, title, onSuccess, onError) {
        onError && onError('Not implemented');
    },

    testConnection: function (onSuccess, onError) {
        onError && onError('Not implemented');
    }
};
