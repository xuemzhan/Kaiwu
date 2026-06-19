const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const VERSION = '0.2.0';
const STAGING_DIR = path.join(__dirname, '..', 'wps-addon-publish', `kaiwu_${VERSION}`);

test('package does not include real .env file', () => {
    if (!fs.existsSync(STAGING_DIR)) {
        console.log('        (staging directory not found, skipping test - run npm run build first)');
        return;
    }
    const envPath = path.join(STAGING_DIR, '.env');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        assert.ok(!content.includes('sk-'), '.env should not contain real API keys');
    }
    assert.ok(!fs.existsSync(envPath), '.env file should not exist in release package');
});

test('package includes .env.example file', () => {
    if (!fs.existsSync(STAGING_DIR)) {
        console.log('        (staging directory not found, skipping test - run npm run build first)');
        return;
    }
    const envExamplePath = path.join(STAGING_DIR, '.env.example');
    assert.ok(fs.existsSync(envExamplePath), '.env.example must exist in release package');

    const content = fs.readFileSync(envExamplePath, 'utf8');
    assert.ok(content.includes('VITE_DEFAULT_API_KEY'), '.env.example should contain VITE_DEFAULT_API_KEY placeholder');
    assert.ok(content.includes('PLEASE_REPLACE'), '.env.example should contain placeholder instruction');
});

test('taskpane/env.js contains injected API key (for runtime)', () => {
    if (!fs.existsSync(STAGING_DIR)) {
        console.log('        (staging directory not found, skipping test - run npm run build first)');
        return;
    }
    const envJsPath = path.join(STAGING_DIR, 'taskpane', 'env.js');
    assert.ok(fs.existsSync(envJsPath), 'taskpane/env.js must exist (injected at build time)');

    const content = fs.readFileSync(envJsPath, 'utf8');
    assert.ok(content.includes('__ENV_API_KEY__'), 'env.js should contain injected API key');
});

test('package includes README-安装说明.md', () => {
    const PUBLISH_DIR = path.join(__dirname, '..', 'wps-addon-publish');
    if (!fs.existsSync(PUBLISH_DIR)) {
        console.log('        (publish directory not found, skipping test - run npm run build first)');
        return;
    }
    const readmePath = path.join(PUBLISH_DIR, 'README-安装说明.md');
    assert.ok(fs.existsSync(readmePath), 'README-安装说明.md must exist in publish directory');

    const content = fs.readFileSync(readmePath, 'utf8');
    assert.ok(content.includes('开悟'), 'README-安装说明.md should contain plugin name');
    assert.ok(content.includes('安装'), 'README-安装说明.md should contain installation instructions');
});

test('bat files are written with UTF-8 BOM', () => {
    const PUBLISH_DIR = path.join(__dirname, '..', 'wps-addon-publish');
    if (!fs.existsSync(PUBLISH_DIR)) {
        console.log('        (publish directory not found, skipping test - run npm run build first)');
        return;
    }
    const batFiles = ['install.bat', 'uninstall.bat', 'verify.bat'];
    for (const batFile of batFiles) {
        const batPath = path.join(PUBLISH_DIR, batFile);
        if (!fs.existsSync(batPath)) {
            console.log('        (' + batFile + ' not found, skipping)');
            continue;
        }
        const content = fs.readFileSync(batPath);
        assert.equal(content[0], 0xEF, batFile + ': first byte should be 0xEF (UTF-8 BOM)');
        assert.equal(content[1], 0xBB, batFile + ': second byte should be 0xBB (UTF-8 BOM)');
        assert.equal(content[2], 0xBF, batFile + ': third byte should be 0xBF (UTF-8 BOM)');
    }
});
