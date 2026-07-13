/**
 * KwLogger — structured logger for the Kaiwu add-in.
 *
 * Why this exists:
 *   The codebase had 40+ raw `console.log/warn/error/debug` calls scattered
 *   across components. This makes it impossible to:
 *     1. Toggle log levels at runtime (e.g. quiet down for end users)
 *     2. Filter by source module
 *     3. Route errors to a centralized handler (e.g. for support telemetry)
 *     4. Add a session ID / timestamp for debugging user-reported issues
 *
 * Design:
 *   - Exposed as `KwLogger` (kw- prefix to match KwToast, KwSecurity, etc.)
 *   - ES5 syntax (var, function, no arrow) for WPS CEF compatibility
 *   - Default behavior matches what `console.*` would do, so swapping
 *     `console.error(...)` → `KwLogger.error('mod', ...)` is a no-op for users
 *   - Log levels: debug < info < warn < error. Each level is enabled/disabled
 *     independently via KwLogger.setLevel('error') or env-like API.
 *   - Default in production: only warn + error (matching what users currently
 *     see in DevTools). Default in tests: all enabled.
 *   - `_handler` is an optional sink override; tests can pass a mock
 *     function to capture log output.
 *
 * Usage:
 *   KwLogger.debug('Chat', 'rendering message', { id: 42 });
 *   KwLogger.info('Chat', 'message rendered');
 *   KwLogger.warn('Chat', 'fallback to old renderer');
 *   KwLogger.error('Chat', 'render failed', err);
 *
 * Configuration:
 *   KwLogger.setLevel('error');        // quiet mode (default in production)
 *   KwLogger.setLevel('debug');        // verbose (default in tests)
 *   KwLogger.setHandler(myCapture);    // override the sink
 *   KwLogger.getHistory();             // retrieve recent log entries
 */
var KwLogger = (function () {
  // Level ordering: higher number = more severe
  var LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

  // Default behavior:
  //   - In a browser (typeof window !== 'undefined'), default to 'warn'
  //     (the level of detail WPS users care about).
  //   - In Node tests (typeof module !== 'undefined' && module.exports),
  //     default to 'debug' so tests can verify all log calls.
  //   - This branch is evaluated at module load, not at log time, so
  //     tests can still override with setLevel().
  // Default level: 'warn' in browser (quiet for WPS users), 'debug' in Node
  // (verbose so tests can verify all log calls). The module.exports check
  // is duplicated at the bottom of the file; here we use `typeof window`
  // to distinguish: in a browser, window is defined; in Node, it's not.
  var inBrowser = typeof window !== 'undefined';

  var config = {
    level: inBrowser ? LEVELS.warn : LEVELS.debug,
    enabled: true,
    // ring buffer for getHistory(); capped to avoid memory bloat
    history: [],
    historyLimit: 200,
    // Prefix shown before every log line
    prefix: '[Kaiwu]',
  };

  function _defaultSink(level, scope, message, context) {
    // The sink bridges to the appropriate console method so DevTools
    // shows logs with the right severity icon.
    var line = formatLine(level, scope, message, context);
    if (level === 'error') {
      // eslint-disable-next-line no-console
      console.error(line);
    } else if (level === 'warn') {
      // eslint-disable-next-line no-console
      console.warn(line);
    } else {
      // eslint-disable-next-line no-console
      console.log(line);
    }
  }

  function formatLine(level, scope, message, context) {
    var parts = [config.prefix, '[' + level.toUpperCase() + ']'];
    if (scope) parts.push('[' + scope + ']');
    parts.push(String(message));
    if (context !== undefined) {
      try {
        // For Errors, include stack. For objects, JSON-serialize.
        if (context instanceof Error) {
          parts.push(context.stack || context.message);
        } else {
          parts.push(JSON.stringify(context));
        }
      } catch (e) {
        // Circular reference or other serialization issue
        parts.push('[unserializable context]');
      }
    }
    return parts.join(' ');
  }

  function log(level, scope, message, context) {
    if (!config.enabled) return;
    if (LEVELS[level] < config.level) return;

    var entry = {
      ts: Date.now(),
      level: level,
      scope: scope || '',
      message: String(message),
      context: context,
    };
    config.history.push(entry);
    if (config.history.length > config.historyLimit) {
      config.history.shift();
    }

    if (typeof config.handler === 'function') {
      try {
        config.handler(level, scope, message, context, entry);
      } catch (e) {
        // Handler errors should never crash the host. Fall back to default.
        // eslint-disable-next-line no-console
        console.error('[Kaiwu] [LOGGER] handler threw:', e);
      }
    } else {
      _defaultSink(level, scope, message, context);
    }
  }

  return {
    // Public API
    debug: function (scope, message, context) {
      log('debug', scope, message, context);
    },
    info: function (scope, message, context) {
      log('info', scope, message, context);
    },
    warn: function (scope, message, context) {
      log('warn', scope, message, context);
    },
    error: function (scope, message, context) {
      log('error', scope, message, context);
    },

    // Configuration
    setLevel: function (levelOrName) {
      // Accepts either a string ('error') or a numeric level (40).
      if (typeof levelOrName === 'string') {
        if (!Object.prototype.hasOwnProperty.call(LEVELS, levelOrName)) {
          // Unknown level string. Silently ignore to avoid breaking
          // callers; production code shouldn't be passing garbage.
          return;
        }
        config.level = LEVELS[levelOrName];
      } else if (typeof levelOrName === 'number') {
        config.level = levelOrName;
      }
    },
    getLevel: function () {
      // Reverse lookup
      for (var k in LEVELS) {
        if (LEVELS[k] === config.level) return k;
      }
      return 'unknown';
    },
    setEnabled: function (enabled) {
      config.enabled = !!enabled;
    },
    isEnabled: function (level) {
      if (!config.enabled) return false;
      if (!level) return true;
      return LEVELS[level] >= config.level;
    },
    setHandler: function (fn) {
      // Pass null to reset to default sink.
      config.handler = typeof fn === 'function' ? fn : null;
    },
    getHistory: function () {
      // Return a shallow copy so callers can't mutate internal state.
      return config.history.slice();
    },
    clearHistory: function () {
      config.history = [];
    },
    setHistoryLimit: function (n) {
      var limit = parseInt(n, 10);
      if (limit > 0 && limit <= 10000) {
        config.historyLimit = limit;
        // Trim if necessary
        while (config.history.length > config.historyLimit) {
          config.history.shift();
        }
      }
    },
    // For tests / introspection
    _config: config,
    _LEVELS: LEVELS,
  };
})();

// Export for Node.js tests; safe in browser too (kwjs vendors it).
if (typeof module !== 'undefined' && typeof module.exports === 'object') {
  module.exports = KwLogger;
}
