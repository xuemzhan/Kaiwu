/**
 * ai-factory.js — AI service factory
 * Selects between standard AIService and OpenCodeAIService based on config.
 *
 * Two entry points are exposed:
 *   - create(config)         → synchronous, returns the service object immediately.
 *                              Matches the contract documented in
 *                              docs/opencode-integration.md. Does NOT perform any
 *                              network check; it only decides which service
 *                              implementation to use based on config.mode.
 *   - selectAsync(config, onSuccess, onError)
 *                            → asynchronous. When config.mode === 'opencode' and
 *                              OpenCodeAIService is loaded, performs a reachability
 *                              test (OpenCodeAIService.testConnection) and falls
 *                              back to AIService on failure. Use this when you
 *                              need to verify connectivity before issuing a real
 *                              request (e.g. the "Test Connection" button in the
 *                              Settings panel). For normal request paths use
 *                              create() and let the underlying service surface
 *                              errors itself.
 */
/* global OpenCodeAIService, AIService, KwToast */
var AIServiceFactory = {
  create: function (config) {
    config = config || Config.getAll();

    if (config.mode === 'opencode' && typeof OpenCodeAIService !== 'undefined') {
      return OpenCodeAIService;
    }
    return AIService;
  },

  selectAsync: function (config, onSuccess, onError) {
    config = config || Config.getAll();

    if (config.mode === 'opencode' && typeof OpenCodeAIService !== 'undefined') {
      if (typeof OpenCodeAIService.testConnection === 'function') {
        OpenCodeAIService.testConnection(
          function () {
            onSuccess && onSuccess(OpenCodeAIService);
          },
          function (err) {
            console.warn('[AIServiceFactory] OpenCode unavailable, falling back to standard:', err);
            if (typeof KwToast !== 'undefined' && KwToast.show) {
              KwToast.show('OpenCode 不可用，已切换到标准模式');
            }
            // Downgrade is reported via onSuccess (we still have a usable service).
            // onError is reserved for the async path itself blowing up
            // (e.g. testConnection threw synchronously) — which currently
            // can't happen because testConnection only uses .then/.catch.
            onSuccess && onSuccess(AIService);
          }
        );
        return;
      }
      onSuccess && onSuccess(OpenCodeAIService);
      return;
    }
    onSuccess && onSuccess(AIService);
  },

  isOpencodeMode: function () {
    var config = Config.getAll();
    return config.mode === 'opencode';
  },

  isOpencodeAvailable: function (onSuccess, onError) {
    if (typeof OpenCodeAIService === 'undefined') {
      onError && onError({ message: 'OpenCodeAIService not loaded' });
      return;
    }
    if (typeof OpenCodeAIService.testConnection === 'function') {
      OpenCodeAIService.testConnection(onSuccess, onError);
    } else {
      onSuccess && onSuccess({ available: true });
    }
  },
};
