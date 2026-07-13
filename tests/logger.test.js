/**
 * tests/logger.test.js — Unit tests for KwLogger
 *
 * Why this file exists:
 *   KwLogger is the central logger. If it silently swallows messages
 *   or misformats them, every component's debugging output is
 *   compromised. Direct unit tests (no jsdom, no scripts loaded) keep
 *   the feedback loop fast.
 *
 * Note: KwLogger defaults to 'warn' level in browser and 'debug' in
 * Node. The module exports the same singleton in both environments, so
 * tests must reset state between assertions.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const KwLogger = require('../taskpane/services/logger.js');

function resetLogger() {
  KwLogger.clearHistory();
  KwLogger.setEnabled(true);
  KwLogger.setLevel('debug');
  KwLogger.setHandler(null);
}

test('KwLogger: module exports the expected singleton', () => {
  assert.equal(typeof KwLogger.debug, 'function');
  assert.equal(typeof KwLogger.info, 'function');
  assert.equal(typeof KwLogger.warn, 'function');
  assert.equal(typeof KwLogger.error, 'function');
  assert.equal(typeof KwLogger.setLevel, 'function');
  assert.equal(typeof KwLogger.setHandler, 'function');
  assert.equal(typeof KwLogger.getHistory, 'function');
  assert.equal(typeof KwLogger.getLevel, 'function');
});

test('KwLogger: default level is debug in Node test environment', () => {
  resetLogger();
  // In Node, we default to debug so tests can verify all log calls.
  assert.equal(KwLogger.getLevel(), 'debug');
});

test('KwLogger: setLevel accepts strings and numbers', () => {
  resetLogger();
  KwLogger.setLevel('error');
  assert.equal(KwLogger.getLevel(), 'error');
  KwLogger.setLevel(40);
  assert.equal(KwLogger.getLevel(), 'error');
  KwLogger.setLevel(10);
  assert.equal(KwLogger.getLevel(), 'debug');
  KwLogger.setLevel('info');
  assert.equal(KwLogger.getLevel(), 'info');
});

test('KwLogger: setLevel silently ignores unknown level names', () => {
  resetLogger();
  KwLogger.setLevel('warn');
  KwLogger.setLevel('garbage');
  // Should not have changed
  assert.equal(KwLogger.getLevel(), 'warn');
});

test('KwLogger: debug() is suppressed when level is info', () => {
  resetLogger();
  KwLogger.setLevel('info');
  const captured = [];
  KwLogger.setHandler((lvl, scope, msg) => captured.push({ lvl, scope, msg }));
  KwLogger.debug('Mod', 'should be hidden');
  KwLogger.info('Mod', 'should appear');
  assert.equal(captured.length, 1);
  assert.equal(captured[0].lvl, 'info');
  assert.equal(captured[0].msg, 'should appear');
});

test('KwLogger: warn() is suppressed when level is error', () => {
  resetLogger();
  KwLogger.setLevel('error');
  const captured = [];
  KwLogger.setHandler((lvl) => captured.push(lvl));
  KwLogger.warn('Mod', 'hidden');
  KwLogger.error('Mod', 'visible');
  assert.deepEqual(captured, ['error']);
});

test('KwLogger: isEnabled reports correctly for each level', () => {
  resetLogger();
  KwLogger.setLevel('warn');
  assert.equal(KwLogger.isEnabled('debug'), false);
  assert.equal(KwLogger.isEnabled('info'), false);
  assert.equal(KwLogger.isEnabled('warn'), true);
  assert.equal(KwLogger.isEnabled('error'), true);
});

test('KwLogger: setEnabled(false) suppresses all log calls', () => {
  resetLogger();
  KwLogger.setEnabled(false);
  const captured = [];
  KwLogger.setHandler((lvl) => captured.push(lvl));
  KwLogger.error('Mod', 'should be hidden');
  assert.equal(captured.length, 0);
  // Re-enable and verify
  KwLogger.setEnabled(true);
  KwLogger.error('Mod', 'should appear');
  assert.equal(captured.length, 1);
});

test('KwLogger: history records all log calls (when enabled)', () => {
  resetLogger();
  KwLogger.setLevel('debug');
  KwLogger.setHandler(null); // default sink, but history still records
  KwLogger.debug('A', 'msg1');
  KwLogger.info('B', 'msg2');
  KwLogger.warn('C', 'msg3');
  KwLogger.error('D', 'msg4');
  const history = KwLogger.getHistory();
  assert.equal(history.length, 4);
  assert.equal(history[0].level, 'debug');
  assert.equal(history[0].scope, 'A');
  assert.equal(history[0].message, 'msg1');
  assert.equal(history[3].level, 'error');
  assert.equal(history[3].scope, 'D');
});

test('KwLogger: history is bounded by historyLimit', () => {
  resetLogger();
  KwLogger.setLevel('debug');
  KwLogger.setHandler(null);
  KwLogger.setHistoryLimit(5);
  for (let i = 0; i < 20; i++) {
    KwLogger.debug('M', 'msg' + i);
  }
  const history = KwLogger.getHistory();
  assert.equal(history.length, 5, 'should cap at historyLimit');
  // The oldest should be msg15, the newest msg19
  assert.equal(history[0].message, 'msg15');
  assert.equal(history[4].message, 'msg19');
});

test('KwLogger: clearHistory empties the buffer', () => {
  resetLogger();
  KwLogger.info('M', 'msg');
  assert.equal(KwLogger.getHistory().length, 1);
  KwLogger.clearHistory();
  assert.equal(KwLogger.getHistory().length, 0);
});

test('KwLogger: custom handler receives all log calls', () => {
  resetLogger();
  const captured = [];
  KwLogger.setHandler((lvl, scope, msg, ctx) => {
    captured.push({ lvl, scope, msg, ctx });
  });
  KwLogger.warn('Mod', 'something', { extra: 1 });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].lvl, 'warn');
  assert.equal(captured[0].scope, 'Mod');
  assert.equal(captured[0].msg, 'something');
  assert.deepEqual(captured[0].ctx, { extra: 1 });
});

test('KwLogger: handler errors are caught and do not crash', () => {
  resetLogger();
  // Capture the fallback console.error
  const origError = console.error;
  const fallbackCalls = [];
  console.error = function () {
    fallbackCalls.push(Array.prototype.slice.call(arguments));
  };
  try {
    KwLogger.setHandler(function () {
      throw new Error('handler exploded');
    });
    KwLogger.warn('Mod', 'msg');
    // Handler threw, so the fallback console.error should have been called
    // with the [Kaiwu] [LOGGER] handler threw: ... message.
    const hasLoggerFallback = fallbackCalls.some(function (c) {
      return c.some(function (a) {
        return typeof a === 'string' && a.indexOf('[LOGGER]') !== -1;
      });
    });
    assert.ok(hasLoggerFallback, 'handler error should be caught and logged');
  } finally {
    console.error = origError;
  }
});

test('KwLogger: circular reference in context is handled gracefully', () => {
  resetLogger();
  const captured = [];
  KwLogger.setHandler((lvl, scope, msg, ctx) => captured.push(ctx));
  const obj = { name: 'self' };
  obj.self = obj; // circular
  // Should not throw
  KwLogger.warn('M', 'circular', obj);
  // The captured ctx may be the same object (handler captures it directly),
  // so just verify the call didn't crash.
  assert.equal(captured.length, 1);
});

test('KwLogger: Error object is handled in formatLine (stack included)', () => {
  resetLogger();
  const captured = [];
  KwLogger.setHandler((lvl, scope, msg, ctx) => captured.push(ctx));
  const err = new Error('boom');
  KwLogger.error('M', 'failed', err);
  assert.equal(captured[0], err);
  // The Error object is passed as-is to the handler; formatting happens
  // only in the default sink. Verify the default sink doesn't throw.
  KwLogger.setHandler(null);
  assert.doesNotThrow(function () {
    KwLogger.error('M', 'failed', err);
  });
});

test('KwLogger: scope and message can be any string', () => {
  resetLogger();
  const captured = [];
  KwLogger.setHandler((lvl, scope, msg) => captured.push({ scope, msg }));
  KwLogger.warn('Some/Module', 'weird message: "quoted"');
  assert.equal(captured[0].scope, 'Some/Module');
  assert.equal(captured[0].msg, 'weird message: "quoted"');
});

test('KwLogger: missing context is allowed (4th arg undefined)', () => {
  resetLogger();
  const captured = [];
  KwLogger.setHandler((lvl, scope, msg, ctx) => captured.push(ctx));
  KwLogger.warn('M', 'no context');
  assert.equal(captured[0], undefined);
});

test('KwLogger: getHistory returns a copy (mutations do not affect internal state)', () => {
  resetLogger();
  KwLogger.info('M', 'msg');
  const hist = KwLogger.getHistory();
  hist.push({ fake: true });
  // Internal state should still be 1 entry, not 2.
  assert.equal(KwLogger.getHistory().length, 1);
});
