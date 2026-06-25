const { test } = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../scripts/package.js');

test('detectInstalledWpsVersions is exported as a function', () => {
    assert.equal(typeof pkg.detectInstalledWpsVersions, 'function');
});

test('detectInstalledWpsVersions returns an array', () => {
    const versions = pkg.detectInstalledWpsVersions();
    assert.ok(Array.isArray(versions), 'must return an array');
});

test('detectInstalledWpsVersions returns objects with expected shape', () => {
    const versions = pkg.detectInstalledWpsVersions();
    for (const v of versions) {
        assert.ok(v.version, 'each entry must have a version string');
        assert.ok(typeof v.version === 'string', 'version must be a string');
        // At least one of installDir or registryPath should be set
        assert.ok(v.installDir || v.registryPath, 'must have installDir or registryPath');
    }
});

test('detectInstalledWpsVersions detects at least one WPS on this dev machine', () => {
    const versions = pkg.detectInstalledWpsVersions();
    // On the dev machine WPS is running per Get-Process, so at least one should be found
    // via either HKCU subkey or LOCALAPPDATA scan
    const hasHKCU = versions.some(v => v.registryPath && v.registryPath.includes('HKCU'));
    const hasLocal = versions.some(v => v.cloudsvrPath && v.cloudsvrPath.toLowerCase().includes('appdata'));
    assert.ok(hasHKCU || hasLocal, 'must detect at least one WPS via registry or filesystem');
});

test('detectInstalledWpsVersions does not include non-WPS paths', () => {
    const versions = pkg.detectInstalledWpsVersions();
    for (const v of versions) {
        if (v.installDir) {
            assert.ok(v.installDir.includes('WPS Office'), 'installDir must be under WPS Office');
        }
        if (v.cloudsvrPath) {
            assert.ok(v.cloudsvrPath.includes('wpscloudsvr.exe'), 'cloudsvrPath must reference wpscloudsvr.exe');
        }
    }
});
