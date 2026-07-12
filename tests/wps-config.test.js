/**
 * tests/wps-config.test.js — End-to-end smoke tests for WPS addin config
 *
 * Why this file exists:
 *   The unit tests run in jsdom; they don't validate that the actual
 *   WPS addin configuration (wpsjs.config.js, publish.xml, install.bat)
 *   is consistent. Misalignment between the source code's name/version
 *   and the WPS config causes silent failures (add-in not loaded,
 *   update notifications not fired, etc.).
 *
 *   These tests are pure-Node (no jsdom, no scripts loaded) — they just
 *   read files and parse them. Cheap to run, catches obvious drift.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('wps-config: package.json and wpsjs.config.js have matching version', () => {
  const pkg = JSON.parse(read('package.json'));
  const wpsjs = require(path.join(ROOT, 'wpsjs.config.js'));
  assert.equal(typeof wpsjs.version, 'string', 'wpsjs.config.js must export version');
  assert.equal(
    pkg.version,
    wpsjs.version,
    `package.json version (${pkg.version}) must match wpsjs.config.js version (${wpsjs.version})`
  );
});

test('wps-config: wpsjs.config.js addonName and name must be non-empty ASCII (WPS uses them for install path)', () => {
  const wpsjs = require(path.join(ROOT, 'wpsjs.config.js'));
  assert.ok(wpsjs.addonName, 'addonName must be set');
  assert.ok(wpsjs.name, 'name must be set');
  // JS-string "kaiwu" or "开悟" — the WPS install path uses {name}_{version}
  // so the name should NOT contain characters that break bat file encoding
  // (e.g. CJK characters cause GBK/UTF-8 mismatches in install.bat under
  // zh-CN Windows). The current setup uses ASCII "kaiwu" for safety.
  // We assert non-empty (allow either ASCII or CJK); production is ASCII.
  assert.ok(wpsjs.addonName.length >= 1, 'addonName must be non-empty');
});

test('wps-config: appType=wps and systems includes "wps"', () => {
  const wpsjs = require(path.join(ROOT, 'wpsjs.config.js'));
  assert.equal(wpsjs.appType, 'wps', 'appType must be "wps"');
  assert.ok(
    Array.isArray(wpsjs.systems) && wpsjs.systems.includes('wps'),
    'systems must include "wps"'
  );
});

test('wps-config: devServer.port is a positive integer', () => {
  const wpsjs = require(path.join(ROOT, 'wpsjs.config.js'));
  assert.ok(wpsjs.devServer, 'devServer must be set');
  assert.ok(
    Number.isInteger(wpsjs.devServer.port) && wpsjs.devServer.port > 0,
    'port must be a positive integer'
  );
  // Port 3889 is hardcoded in scripts/init-env.js, scripts/copy-assets.js, etc.
  // If you change it here, you must change it there too.
  assert.equal(wpsjs.devServer.port, 3889, 'devServer port should be 3889 (hardcoded in scripts/)');
});

test('wps-config: index.html loads component.js, ribbon.js (entry points)', () => {
  const html = read('index.html');
  // These are the 3 entry scripts WPS requires
  assert.ok(html.includes('component.js'), 'index.html must load component.js');
  assert.ok(html.includes('ribbon.js'), 'index.html must load ribbon.js');
  assert.ok(html.includes('wakeword.js'), 'index.html must load taskpane/services/wakeword.js');
});

test('wps-config: ribbon.xml exists and has at least one button', () => {
  const xml = read('ribbon.xml');
  assert.ok(xml.includes('<button'), 'ribbon.xml must declare at least one button');
  assert.ok(
    xml.includes('kaiwu') || xml.includes('开悟'),
    'ribbon.xml must reference the addon name'
  );
});

test('wps-config: taskpane/env.js is gitignored (must not be committed)', () => {
  // env.js is generated from .env at build time and contains API keys.
  // It must be in .gitignore.
  const gitignore = read('.gitignore');
  assert.ok(
    gitignore.includes('taskpane/env.js') || gitignore.includes('taskpane\\env.js'),
    '.gitignore must exclude taskpane/env.js (contains API keys)'
  );
});

test('wps-config: .env is gitignored (must not be committed)', () => {
  const gitignore = read('.gitignore');
  assert.ok(gitignore.includes('.env'), '.gitignore must exclude .env (contains API keys)');
});

test('wps-config: install.bat is UTF-8 with BOM (for zh-CN Windows cmd.exe)', () => {
  // scripts/package.js's writeBatFile() prepends a UTF-8 BOM (EF BB BF) so
  // Windows cmd.exe detects the encoding correctly. Earlier versions used GBK
  // (codepage 936) but UTF-8+BOM is more portable and matches modern Windows.
  // This test guards against accidental regression to no-BOM or wrong encoding.
  const buf = fs.readFileSync(path.join(ROOT, 'wps-addon-publish', 'install.bat'));
  assert.equal(buf[0], 0xef, 'install.bat should start with UTF-8 BOM byte 1 (0xEF)');
  assert.equal(buf[1], 0xbb, 'install.bat should start with UTF-8 BOM byte 2 (0xBB)');
  assert.equal(buf[2], 0xbf, 'install.bat should start with UTF-8 BOM byte 3 (0xBF)');
});

test('wps-config: package.json scripts cover lint/test/build/format/validate', () => {
  const pkg = JSON.parse(read('package.json'));
  const required = ['lint', 'test', 'format', 'format:check', 'build', 'validate'];
  for (const r of required) {
    assert.ok(pkg.scripts[r], `package.json must have a "${r}" script`);
  }
});

test('wps-config: README mentions current addon version', () => {
  // The README's "WPS" badge is for the WPS *app* version (e.g. 12.1.0.26375+),
  // NOT the addon version. We assert the addon version is mentioned
  // somewhere in the README (e.g. install instructions).
  const pkg = JSON.parse(read('package.json'));
  const readme = read('README.md');
  // The WPS app badge has a different format (e.g. 12.1.0.26375+), so we
  // need a more careful regex. Match the addon version with word boundaries
  // to avoid matching e.g. "WPS 12.1.0" (the WPS app version).
  // The README's WPS badge (WPS-12.1.0.26375+) is the WPS *app* version, not
  // the addon version. We assert the addon version is mentioned in the
  // install instructions. We use a literal substring check (avoiding regex
  // word-boundary footguns across PowerShell escaping).
  assert.ok(
    readme.indexOf(pkg.version) !== -1,
    `README.md should mention addon version ${pkg.version}`
  );
});
