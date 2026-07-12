/**
 * tests/ai-factory.test.js — AIServiceFactory unit + integration tests
 *
 * Why this file exists:
 *   `taskpane/services/ai-factory.js` defines the AI service selection
 *   contract used by the entire app. It exposes two entry points:
 *     - create(config)         — synchronous, returns service object
 *     - selectAsync(config, ok, err) — asynchronous with reachability test
 *   Tests for these entry points previously lived in
 *   `opencode-ai.test.js` and `opencode-integration.test.js`, which made
 *   them hard to find and inconsistent with the file-under-test naming
 *   convention. This file consolidates all AIServiceFactory tests.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, loadScripts } = require('./_setup');

function loadFactoryWithMock(fetchMock) {
  const env = makeEnv();
  env.window.__ENV_API_KEY__ = 'sk-test';
  env.window.__ENV_API_BASE__ = 'https://api.test.com/v1';
  env.window.__ENV_MODEL__ = 'test-model';
  env.window.fetch = fetchMock;
  loadScripts(env.window, [
    'taskpane/services/config.js',
    'taskpane/services/ai.js',
    'taskpane/services/ai-factory.js',
  ]);
  return {
    env,
    AIServiceFactory: env.window.AIServiceFactory,
    AIService: env.window.AIService,
    OpenCodeAIService: env.window.OpenCodeAIService,
    Config: env.window.Config,
  };
}

function loadFactoryFull(fetchMock) {
  // For selectAsync integration tests, load all opencode-related services.
  const env = makeEnv();
  env.window.__ENV_API_KEY__ = 'sk-test';
  env.window.__ENV_API_BASE__ = 'https://api.test.com/v1';
  env.window.__ENV_MODEL__ = 'test-model';
  env.window.fetch = fetchMock;
  env.window.btoa = (str) => Buffer.from(str).toString('base64');
  loadScripts(env.window, [
    'taskpane/services/config.js',
    'taskpane/services/ai.js',
    'taskpane/services/opencode-ai.js',
    'taskpane/services/session-manager.js',
    'taskpane/services/ai-factory.js',
  ]);
  return {
    env,
    AIServiceFactory: env.window.AIServiceFactory,
    AIService: env.window.AIService,
    OpenCodeAIService: env.window.OpenCodeAIService,
    Config: env.window.Config,
  };
}

// =============================================================================
// create(config) — synchronous contract
// =============================================================================

test('create(): returns AIService in standard mode', () => {
  const { AIServiceFactory, AIService } = loadFactoryWithMock(() => {});
  const service = AIServiceFactory.create({ mode: 'standard' });
  assert.equal(service, AIService);
});

test('create(): returns OpenCodeAIService when configured', () => {
  const env = makeEnv();
  env.window.__ENV_API_KEY__ = 'sk-test';
  env.window.__ENV_API_BASE__ = 'https://api.test.com/v1';
  env.window.__ENV_MODEL__ = 'test';
  env.window.OpenCodeAIService = { testConnection: () => {} };
  env.window.fetch = () => {};
  loadScripts(env.window, [
    'taskpane/services/config.js',
    'taskpane/services/ai.js',
    'taskpane/services/ai-factory.js',
  ]);
  const service = env.window.AIServiceFactory.create({ mode: 'opencode' });
  assert.equal(service, env.window.OpenCodeAIService);
});

test('create(): returns AIService when opencode mode but OpenCodeAIService undefined', () => {
  const env = makeEnv();
  env.window.__ENV_API_KEY__ = 'sk-test';
  env.window.__ENV_API_BASE__ = 'https://api.test.com/v1';
  env.window.__ENV_MODEL__ = 'test';
  env.window.OpenCodeAIService = undefined; // explicitly not loaded
  env.window.fetch = () => {};
  loadScripts(env.window, [
    'taskpane/services/config.js',
    'taskpane/services/ai.js',
    'taskpane/services/ai-factory.js',
  ]);
  const service = env.window.AIServiceFactory.create({ mode: 'opencode' });
  assert.equal(service, env.window.AIService);
});

test('create(): does NOT invoke testConnection (must be sync)', () => {
  // Regression guard: a previous version of create() synchronously invoked
  // testConnection and returned undefined in the opencode branch, breaking
  // every caller. create() must be purely synchronous.
  let testConnectionCalled = false;
  const env = makeEnv();
  env.window.__ENV_API_KEY__ = 'sk-test';
  env.window.__ENV_API_BASE__ = 'https://api.test.com/v1';
  env.window.__ENV_MODEL__ = 'test';
  env.window.OpenCodeAIService = {
    testConnection: function () {
      testConnectionCalled = true;
      // simulate async resolve
      setTimeout(() => arguments[0] && arguments[0]({ ok: true }), 0);
    },
  };
  env.window.fetch = () => {};
  loadScripts(env.window, [
    'taskpane/services/config.js',
    'taskpane/services/ai.js',
    'taskpane/services/ai-factory.js',
  ]);
  const service = env.window.AIServiceFactory.create({ mode: 'opencode' });
  assert.equal(service, env.window.OpenCodeAIService);
  assert.equal(testConnectionCalled, false, 'create() must not invoke testConnection');
});

test('create(): uses Config.getAll() when config is omitted', () => {
  const { AIServiceFactory, AIService, Config } = loadFactoryWithMock(() => {});
  Config.set('mode', 'standard');
  const service = AIServiceFactory.create(); // no config arg
  assert.equal(service, AIService);
});

test('create(): empty object config still uses Config defaults', () => {
  const { AIServiceFactory, AIService, Config } = loadFactoryWithMock(() => {});
  Config.set('mode', 'standard');
  const service = AIServiceFactory.create({});
  assert.equal(service, AIService);
});

// =============================================================================
// selectAsync(config, onSuccess, onError) — asynchronous contract
// =============================================================================

test('selectAsync(): returns AIService immediately when mode=standard', (t, done) => {
  const { AIServiceFactory, AIService } = loadFactoryFull(() => {});
  AIServiceFactory.selectAsync(
    { mode: 'standard' },
    (service) => {
      try {
        assert.equal(service, AIService);
        done();
      } catch (e) {
        done(e);
      }
    },
    (err) => done(new Error('onError should not fire: ' + JSON.stringify(err)))
  );
});

test('selectAsync(): returns OpenCodeAIService when reachable', (t, done) => {
  const result = loadFactoryFull(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ status: 'ok' }),
    text: async () => '',
  }));

  const AIServiceFactory = result.AIServiceFactory;
  const OpenCodeAIService = result.OpenCodeAIService;

  AIServiceFactory.selectAsync(
    { mode: 'opencode' },
    (service) => {
      try {
        assert.equal(service, OpenCodeAIService);
        done();
      } catch (e) {
        done(e);
      }
    },
    (err) => done(new Error('onError should not fire: ' + JSON.stringify(err)))
  );
});

test('selectAsync(): falls back to AIService when opencode unreachable', (t, done) => {
  const { AIServiceFactory, AIService } = loadFactoryFull(async () => ({
    ok: false,
    status: 503,
    json: async () => ({ error: 'Service Unavailable' }),
  }));
  AIServiceFactory.selectAsync(
    { mode: 'opencode' },
    (service) => {
      try {
        assert.equal(service, AIService, 'should fallback to AIService');
        done();
      } catch (e) {
        done(e);
      }
    },
    (err) =>
      done(new Error('fallback should report via onSuccess, not onError: ' + JSON.stringify(err)))
  );
});

test('selectAsync(): shows toast on fallback', (t, done) => {
  // NOTE: _setup.js's loadScripts() always preloads toast.js which assigns
  // window.KwToast. So we install our spy AFTER loadScripts, by wrapping
  // the existing KwToast.show.
  const env = makeEnv();
  env.window.__ENV_API_KEY__ = 'sk-test';
  env.window.__ENV_API_BASE__ = 'https://api.test.com/v1';
  env.window.__ENV_MODEL__ = 'test';
  env.window.btoa = (str) => Buffer.from(str).toString('base64');
  env.window.fetch = async () => ({
    ok: false,
    status: 503,
    json: async () => ({ error: 'Service Unavailable' }),
  });
  loadScripts(env.window, [
    'taskpane/services/config.js',
    'taskpane/services/ai.js',
    'taskpane/services/opencode-ai.js',
    'taskpane/services/session-manager.js',
    'taskpane/services/ai-factory.js',
  ]);
  let toastCalled = false;
  const origShow = env.window.KwToast.show;
  env.window.KwToast.show = function () {
    toastCalled = true;
    // Forward to original to keep behavior consistent
    if (typeof origShow === 'function') origShow.apply(this, arguments);
  };
  const AIServiceFactory = env.window.AIServiceFactory;
  AIServiceFactory.selectAsync(
    { mode: 'opencode' },
    () => {
      try {
        assert.equal(toastCalled, true, 'should show fallback toast');
        done();
      } catch (e) {
        done(e);
      }
    },
    (err) =>
      done(new Error('fallback should report via onSuccess, not onError: ' + JSON.stringify(err)))
  );
});

test('selectAsync(): returns OpenCodeAIService directly if testConnection missing', (t, done) => {
  // Edge case: opencode mode is configured but OpenCodeAIService doesn't
  // expose testConnection (e.g. a stub used in unit tests of other modules).
  // We should return the service synchronously, not hang waiting for
  // an async callback that will never come.
  const env = makeEnv();
  env.window.__ENV_API_KEY__ = 'sk-test';
  env.window.__ENV_API_BASE__ = 'https://api.test.com/v1';
  env.window.__ENV_MODEL__ = 'test';
  env.window.OpenCodeAIService = {
    /* no testConnection */
  };
  env.window.fetch = () => {};
  loadScripts(env.window, [
    'taskpane/services/config.js',
    'taskpane/services/ai.js',
    'taskpane/services/ai-factory.js',
  ]);
  env.window.AIServiceFactory.selectAsync(
    { mode: 'opencode' },
    (service) => {
      try {
        assert.equal(service, env.window.OpenCodeAIService);
        done();
      } catch (e) {
        done(e);
      }
    },
    (err) => done(new Error('onError should not fire: ' + JSON.stringify(err)))
  );
});

test('selectAsync(): is no-op if onSuccess is missing (does not throw)', (t, done) => {
  const { AIServiceFactory } = loadFactoryFull(() => {});
  AIServiceFactory.selectAsync({ mode: 'standard' }, undefined, undefined);
  // If we reach here without throwing, the test passes.
  setTimeout(done, 10);
});

// =============================================================================
// isOpencodeMode() / isOpencodeAvailable()
// =============================================================================

test('isOpencodeMode(): reflects config.mode', () => {
  const { AIServiceFactory, Config } = loadFactoryWithMock(() => {});
  Config.set('mode', 'standard');
  assert.equal(AIServiceFactory.isOpencodeMode(), false);
  Config.set('mode', 'opencode');
  assert.equal(AIServiceFactory.isOpencodeMode(), true);
});

test('isOpencodeAvailable(): onError when OpenCodeAIService undefined', (t, done) => {
  const env = makeEnv();
  env.window.OpenCodeAIService = undefined;
  loadScripts(env.window, ['taskpane/services/ai-factory.js']);
  env.window.AIServiceFactory.isOpencodeAvailable(
    () => done(new Error('onSuccess should not fire when service is undefined')),
    (err) => {
      try {
        assert.equal(err.message, 'OpenCodeAIService not loaded');
        done();
      } catch (e) {
        done(e);
      }
    }
  );
});

test('isOpencodeAvailable(): onSuccess when testConnection missing', (t, done) => {
  const env = makeEnv();
  env.window.OpenCodeAIService = {}; // no testConnection
  loadScripts(env.window, ['taskpane/services/ai-factory.js']);
  env.window.AIServiceFactory.isOpencodeAvailable(
    (info) => {
      try {
        assert.equal(info.available, true);
        done();
      } catch (e) {
        done(e);
      }
    },
    (err) => done(new Error('onError should not fire: ' + JSON.stringify(err)))
  );
});

test('isOpencodeAvailable(): delegates to testConnection when present', (t, done) => {
  const env = makeEnv();
  let called = false;
  env.window.OpenCodeAIService = {
    testConnection: function (onSuccess) {
      called = true;
      onSuccess({ status: 'connected' });
    },
  };
  loadScripts(env.window, ['taskpane/services/ai-factory.js']);
  env.window.AIServiceFactory.isOpencodeAvailable(
    (info) => {
      try {
        assert.equal(called, true);
        assert.equal(info.status, 'connected');
        done();
      } catch (e) {
        done(e);
      }
    },
    (err) => done(err)
  );
});
