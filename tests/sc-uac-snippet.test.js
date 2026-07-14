const { test } = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../scripts/package.js');

test('disable bat contains UAC self-elevation snippet', () => {
  const s = pkg.generateDisableNativeAiBat();
  assert.ok(s.includes('net session >nul 2>&1'), 'must check admin via net session');
  assert.ok(s.includes('Start-Process'), 'must use powershell Start-Process');
  assert.ok(s.includes('-Verb RunAs'), 'must elevate with -Verb RunAs');
  assert.ok(s.includes('%~f0'), 'must re-run self via %~f0');
});

test('enable bat contains UAC self-elevation snippet', () => {
  const s = pkg.generateEnableNativeAiBat();
  assert.ok(s.includes('net session >nul 2>&1'), 'must check admin via net session');
  assert.ok(s.includes('Start-Process'), 'must use powershell Start-Process');
  assert.ok(s.includes('-Verb RunAs'), 'must elevate with -Verb RunAs');
  assert.ok(s.includes('%~f0'), 'must re-run self via %~f0');
});
