/**
 * tests/7z-marker.test.js — Verify the published 7z artifact contains
 * the refactored code, not a stale snapshot.
 *
 * Why this matters:
 *   The `kaiwu_0.4.X.7z` is what end users download from GitHub Releases.
 *   If it gets out of sync with `taskpane/`, users install buggy code.
 *   The refactor in commit 8750750 explicitly bumped to 0.4.1 because the
 *   refactor fixed real bugs (WPS PE-load crash on 0-byte DLL placeholder,
 *   broken sync/async contract in AIServiceFactory).
 *
 * Strategy:
 *   1. Skip when no .7z exists (CI green-build without packaging step).
 *   2. Otherwise extract and verify key markers are present in the
 *      corresponding files inside the archive.
 *
 * The extraction uses `node_modules/7zip-bin/win/x64/7za.exe` (bundled),
 * so no external tool is required.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('node:child_process');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..');
const SEVENZ = path.join(ROOT, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');

function findLatestArchive() {
  const dir = path.join(ROOT, 'wps-addon-publish');
  if (!fs.existsSync(dir)) return null;
  const archives = fs
    .readdirSync(dir)
    .filter((f) => f.match(/^kaiwu_\d+\.\d+\.\d+\.7z$/))
    .map((f) => ({
      name: f,
      path: path.join(dir, f),
      version: f.match(/^kaiwu_(\d+\.\d+\.\d+)\.7z$/)[1],
      mtime: fs.statSync(path.join(dir, f)).mtime,
    }))
    .sort((a, b) => b.mtime - a.mtime);
  return archives[0] || null;
}

function has7z() {
  return fs.existsSync(SEVENZ);
}

function extract(archivePath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaiwu-7z-'));
  try {
    execFileSync(SEVENZ, ['x', archivePath, `-o${tmp}`, '-y', '-bb0'], {
      stdio: 'pipe',
    });
    return tmp;
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
}

function readUtf8(p) {
  return fs.readFileSync(p, 'utf8');
}

const archive = findLatestArchive();
const skipReason = !archive
  ? 'no kaiwu_*.7z in wps-addon-publish/'
  : !has7z()
    ? 'bundled 7za.exe missing'
    : null;

if (skipReason) {
  // These tests only run when the packaging step has been executed.
  // In a clean dev checkout, the archive is gitignored and absent.
  // Use test.skip so the suite stays green in CI.
  test('7z-marker: SKIPPED (' + skipReason + ')', { skip: true }, () => {});
} else {
  let extractedRoot;

  test.before(() => {
    extractedRoot = extract(archive.path);
  });

  test.after(() => {
    if (extractedRoot && fs.existsSync(extractedRoot)) {
      fs.rmSync(extractedRoot, { recursive: true, force: true });
    }
  });

  test(`7z-marker: archive exists (${archive.name})`, () => {
    assert.ok(fs.existsSync(archive.path), `expected ${archive.path} to exist`);
    assert.ok(archive.version, 'archive name should match kaiwu_X.Y.Z.7z');
  });

  // Each marker test asserts a specific refactored feature is shipped in
  // the archive. If any of these fails, the package was built from stale
  // source and must be regenerated.
  // The archive layout is: <bat files at top level> + <kaiwu_X.Y.Z/ subdir>.
  // The bat files are installed by install.bat (top-level), while the
  // kaiwu_X.Y.Z/ subdir is the plugin source copied to
  // %APPDATA%\kingsoft\wps\jsaddons\.
  const markers = [
    {
      name: 'ai-factory: selectAsync present',
      file: `kaiwu_${archive.version}/taskpane/services/ai-factory.js`,
      needle: 'selectAsync',
    },
    {
      name: 'ai-factory: create() returns synchronously',
      file: `kaiwu_${archive.version}/taskpane/services/ai-factory.js`,
      needle: 'create: function (config) {',
    },
    {
      name: 'opencode-ai: fireSuccess / fireError helpers',
      file: `kaiwu_${archive.version}/taskpane/services/opencode-ai.js`,
      needle: 'fireSuccess',
    },
    {
      name: 'opencode-ai: settled guard',
      file: `kaiwu_${archive.version}/taskpane/services/opencode-ai.js`,
      needle: 'var settled = false;',
    },
    {
      name: 'opencode-ai: JSON parse classification',
      file: `kaiwu_${archive.version}/taskpane/services/opencode-ai.js`,
      needle: 'JSON parse error',
    },
    {
      name: 'opencode-ai: options.verbose guards auth log',
      file: `kaiwu_${archive.version}/taskpane/services/opencode-ai.js`,
      needle: 'if (options.verbose)',
    },
    {
      name: 'result-card: whenRendered() (test-only API) installed via _installWhenRendered',
      file: `kaiwu_${archive.version}/taskpane/components/result-card.js`,
      needle: '_installWhenRendered',
    },
    {
      name: 'disable-wps-native-ai.bat: non-empty placeholder marker',
      file: 'disable-wps-native-ai.bat', // top-level
      needle: 'DISABLED_BY_KAIWU',
    },
    {
      name: 'disable-wps-native-ai.bat: NO 0-byte placeholder',
      file: 'disable-wps-native-ai.bat', // top-level
      needle: 'type nul >',
      mustBeAbsent: true,
    },
  ];

  for (const m of markers) {
    test(`7z-marker: ${m.name}`, () => {
      const fullPath = path.join(extractedRoot, m.file);
      assert.ok(
        fs.existsSync(fullPath),
        `expected ${m.file} in ${archive.name}, but it was not found in extracted archive`
      );
      const content = readUtf8(fullPath);
      if (m.mustBeAbsent) {
        assert.equal(
          content.indexOf(m.needle),
          -1,
          `${m.name}: ${m.needle} should NOT be present in ${m.file} (found at pos ${content.indexOf(m.needle)})`
        );
      } else {
        assert.notEqual(
          content.indexOf(m.needle),
          -1,
          `${m.name}: "${m.needle}" not found in ${m.file} inside ${archive.name}. The archive is stale.`
        );
      }
    });
  }
}
