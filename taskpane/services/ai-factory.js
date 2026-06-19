/**
 * ai-factory.js — AI service factory
 * Selects between standard AIService and OpenCodeAIService based on config
 * Supports auto-fallback to standard mode when OpenCode is unavailable
 */
/* global OpenCodeAIService, AIService, KwToast */
var AIServiceFactory = {
    create: function(config) {
        config = config || Config.getAll();

        if (config.mode === 'opencode' && typeof OpenCodeAIService !== 'undefined') {
            try {
                var testResult = false;
                if (typeof OpenCodeAIService.testConnection === 'function') {
                    OpenCodeAIService.testConnection(
                        function() { testResult = true; },
                        function() { testResult = false; }
                    );
                }
                if (testResult === false) {
                    throw new Error('OpenCode connection test failed');
                }
                return OpenCodeAIService;
            } catch (e) {
                console.warn('[AIServiceFactory] OpenCode unavailable, falling back to standard:', e);
                if (typeof KwToast !== 'undefined' && KwToast.show) {
                    KwToast.show('OpenCode 不可用，已切换到标准模式');
                }
                return AIService;
            }
        }
        return AIService;
    },

    isOpencodeMode: function() {
        var config = Config.getAll();
        return config.mode === 'opencode';
    },

    isOpencodeAvailable: function(onSuccess, onError) {
        if (typeof OpenCodeAIService === 'undefined') {
            onError && onError({ message: 'OpenCodeAIService not loaded' });
            return;
        }
        if (typeof OpenCodeAIService.testConnection === 'function') {
            OpenCodeAIService.testConnection(onSuccess, onError);
        } else {
            onSuccess && onSuccess({ available: true });
        }
    }
};
