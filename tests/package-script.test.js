/**
 * tests/package-script.test.js — Direct tests for scripts/package.js
 *
 * Coverage:
 *   - module exports the expected public surface
 *   - bat files written to wps-addon-publish/ have correct BOM, CRLF
 *     line endings, and key anchor commands (end-to-end)
 *   - generated bat output preserves the current package.json version
 *     (regression guard against accidentally hardcoding "0.4.0")
 *   - detectInstalledWpsVersions() returns a stable shape
 *
 * Note: the generator functions return strings with LF line endings
 * (toCRLF is only applied at write time inside writeBatFile). The
 * "end-to-end" tests in this file verify the WRITTEN files (which is
 * what users actually receive).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const pkg = require(path.join(ROOT, 'scripts', 'package.js'));

// Path to the published artifacts. These exist after `npm run build`.
const PUBLISH_DIR = path.join(ROOT, 'wps-addon-publish');

function readPublishBat(name) {
  const p = path.join(PUBLISH_DIR, name);
  if (!fs.existsSync(p)) {
    return null; // Skip if not built yet
  }
  return fs.readFileSync(p);
}

test('package-script: module exports the expected public surface', () => {
  const expected = [
    'generateInstallBat',
    'generateUninstallBat',
    'generateVerifyBat',
    'generateDisableNativeAiBat',
    'generateEnableNativeAiBat',
    'detectInstalledWpsVersions',
    'generateReadme',
    'generatePublishXml',
  ];
  for (const name of expected) {
    assert.equal(typeof pkg[name], 'function', `expected ${name} to be a function`);
  }
});

// =============================================================================
// Generator function output tests (LF-only, since toCRLF runs at write time)
// =============================================================================

test('package-script: generateInstallBat output contains key anchors', () => {
  const s = pkg.generateInstallBat();
  assert.ok(s.length > 100, 'install.bat should be non-trivial');
  assert.ok(s.indexOf('@echo off') !== -1, 'should start with @echo off');
  assert.ok(s.indexOf('setlocal') !== -1, 'should use setlocal for env isolation');
  assert.ok(s.indexOf('jsaddons') !== -1, 'should reference the WPS jsaddons path');
  assert.ok(s.indexOf('publish.xml') !== -1, 'should copy publish.xml');
});

test('package-script: generateUninstallBat output contains key anchors', () => {
  const s = pkg.generateUninstallBat();
  assert.ok(s.length > 100, 'uninstall.bat should be non-trivial');
  assert.ok(s.indexOf('rmdir') !== -1 || s.indexOf('del') !== -1, 'should remove the plugin dir');
  assert.ok(s.indexOf('publish.xml') !== -1, 'should remove publish.xml');
});

test('package-script: generateVerifyBat output contains diagnostic anchors', () => {
  const s = pkg.generateVerifyBat();
  assert.ok(s.length > 100, 'verify.bat should be non-trivial');
  assert.ok(
    s.indexOf('reg query') !== -1 || s.indexOf('if exist') !== -1,
    'should check registry / file presence'
  );
});

test('package-script: install.bat mentions the current addon version', () => {
  const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const s = pkg.generateInstallBat();
  assert.ok(
    s.indexOf(pkgJson.version) !== -1,
    `install.bat should mention current version ${pkgJson.version}`
  );
});

test('package-script: all 5 bat generators return CRLF (regression for Bug 5.1)', () => {
  // Bug 5.1 history: the bat generators originally returned LF-only output.
  // Only the writeBatFile() helper applied toCRLF() at write time, so
  // anyone calling the generator directly (including tests) got LF.
  // The fix wraps each generator in toCRLF() so the returned string is
  // already CRLF-terminated. This test guards against future regressions.
  const batGens = [
    ['install', pkg.generateInstallBat],
    ['uninstall', pkg.generateUninstallBat],
    ['verify', pkg.generateVerifyBat],
    ['disable', pkg.generateDisableNativeAiBat],
    ['enable', pkg.generateEnableNativeAiBat],
  ];
  for (const [name, gen] of batGens) {
    const s = gen();
    assert.ok(s.length > 50, name + ' generator should be non-trivial');
    // Walk through; every \n (0x0A) must be preceded by \r (0x0D).
    // Skip this check if string is empty (no LFs possible).
    let foundLf = false;
    for (let i = 0; i < s.length; i++) {
      if (s.charCodeAt(i) === 0x0a) {
        foundLf = true;
        assert.ok(
          i > 0 && s.charCodeAt(i - 1) === 0x0d,
          `${name} generator has bare LF at offset ${i} (regression of Bug 5.1)`
        );
      }
    }
    // It's OK if a generator has no LFs at all (single-line output),
    // but these bat generators are multi-line, so we expect at least one LF.
    assert.ok(foundLf, `${name} generator should contain at least one line ending`);
  }
});

test('package-script: disable/enable bat markers are present', () => {
  assert.ok(
    pkg.generateDisableNativeAiBat().indexOf('DISABLED_BY_KAIWU') !== -1,
    'disable bat should mention the placeholder marker (regression guard)'
  );
  assert.ok(
    pkg.generateEnableNativeAiBat().indexOf('kaiwu-backup') !== -1,
    'enable bat should mention the backup file extension (regression guard)'
  );
});

test('detectInstalledWpsVersions: returns a stable shape', () => {
  const a = pkg.detectInstalledWpsVersions();
  const b = pkg.detectInstalledWpsVersions();
  assert.ok(Array.isArray(a));
  assert.ok(Array.isArray(b));
  for (const v of a) {
    assert.ok(typeof v === 'object', 'each entry must be an object');
    assert.ok('version' in v, 'each entry must have a version field');
  }
});

// =============================================================================
// End-to-end: verify the WRITTEN bat files (post writeBatFile/toCRLF/BOM).
// These tests skip if wps-addon-publish/ doesn't exist (e.g. fresh dev
// checkout without `npm run build` having been run).
// =============================================================================

function hasOnlyCrlf(buf, label) {
  // Walk through the buffer (skipping the 3-byte BOM at the start) and
  // ensure no \n is not preceded by \r.
  for (let i = 3; i < buf.length; i++) {
    if (buf[i] === 0x0a) {
      // \n
      assert.ok(
        i > 0 && buf[i - 1] === 0x0d,
        `unexpected bare LF at byte ${i} in ${label} (file has mixed line endings)`
      );
    }
  }
}

test('package-script: install.bat on disk has UTF-8 BOM and CRLF only', () => {
  const buf = readPublishBat('install.bat');
  if (!buf) return; // skip
  assert.equal(buf[0], 0xef, 'BOM byte 1');
  assert.equal(buf[1], 0xbb, 'BOM byte 2');
  assert.equal(buf[2], 0xbf, 'BOM byte 3');
  hasOnlyCrlf(buf, 'install.bat');
});

test('package-script: disable-wps-native-ai.bat on disk has UTF-8 BOM and CRLF only', () => {
  const buf = readPublishBat('disable-wps-native-ai.bat');
  if (!buf) return; // skip
  assert.equal(buf[0], 0xef);
  assert.equal(buf[1], 0xbb);
  assert.equal(buf[2], 0xbf);
  hasOnlyCrlf(buf, 'disable-wps-native-ai.bat');
});

test('package-script: enable-wps-native-ai.bat on disk has UTF-8 BOM and CRLF only', () => {
  const buf = readPublishBat('enable-wps-native-ai.bat');
  if (!buf) return; // skip
  assert.equal(buf[0], 0xef);
  assert.equal(buf[1], 0xbb);
  assert.equal(buf[2], 0xbf);
  hasOnlyCrlf(buf, 'enable-wps-native-ai.bat');
});
