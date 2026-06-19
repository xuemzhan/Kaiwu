/**
 * ai-factory.js — AI service factory
 * Selects between standard AIService and OpenCodeAIService based on config
 */
/* global OpenCodeAIService */
var AIServiceFactory = {
    create: function(config) {
        config = config || Config.getAll();
        if (config.mode === 'opencode' && typeof OpenCodeAIService !== 'undefined') {
            return OpenCodeAIService;
        }
        return AIService;
    },
    
    isOpencodeMode: function() {
        var config = Config.getAll();
        return config.mode === 'opencode';
    }
};
