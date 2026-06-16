/**
 * scripts/release.js — 开悟一键发布流水线
 *
 * 流程:
 *   1. 运行全部测试 (330+)
 *   2. 构建产物 (assets → env → sync → package)
 *   3. 将 7z 包复制到 packages/ 目录
 *   4. 生成 packages/manifest.json 索引
 *   5. 输出最终产物路径
 *
 * 用法:
 *   node scripts/release.js              # 完整流水线
 *   node scripts/release.js --skip-test  # 跳过测试 (仅打包)
 *   node scripts/release.js --clean      # 清空 packages/ 后再打包
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PACKAGES_DIR = path.join(ROOT, 'packages');
const PUBLISH_DIR = path.join(ROOT, 'wps-addon-publish');
const MANIFEST_PATH = path.join(PACKAGES_DIR, 'manifest.json');

const args = process.argv.slice(2);
const skipTest = args.includes('--skip-test');
const cleanAll = args.includes('--clean');

function log(emoji, msg) {
    console.log(`\n${emoji}  ${msg}`);
    console.log('─'.repeat(60));
}

function run(cmd, opts) {
    const defaults = { cwd: ROOT, stdio: 'inherit', shell: true };
    const merged = Object.assign({}, defaults, opts || {});
    try {
        execSync(cmd, merged);
        return true;
    } catch (e) {
        return false;
    }
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getVersion() {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    return pkg.version;
}

function getFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => {
        const stat = fs.statSync(path.join(dir, f));
        return stat.isFile() && !f.startsWith('.');
    });
}

function readManifest() {
    if (fs.existsSync(MANIFEST_PATH)) {
        return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    }
    return { releases: [] };
}

function writeManifest(manifest) {
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

// ─── Step 1: Tests ───────────────────────────────────────────────

function stepTests() {
    log('🧪', 'Step 1/4: Running tests...');
    if (skipTest) {
        console.log('  ⏭  Skipped (--skip-test)');
        return true;
    }
    const ok = run('npm test', { stdio: 'pipe' });
    if (ok) {
        console.log('  ✅  All tests passed');
    } else {
        console.error('  ❌  Tests failed. Fix before releasing.');
    }
    return ok;
}

// ─── Step 2: Build ───────────────────────────────────────────────

function stepBuild() {
    log('🔨', 'Step 2/4: Building package...');

    console.log('  [1/4] Copying vendor assets...');
    run('npm run assets');

    console.log('  [2/4] Generating env.js from .env...');
    run('npm run env');

    console.log('  [3/4] Syncing to wps-addon-build/...');
    run('npm run sync');

    console.log('  [4/4] Packaging 7z...');
    const ok = run('node scripts/package.js 7z', { stdio: 'pipe' });
    if (ok) {
        console.log('  ✅  Build complete');
    } else {
        console.error('  ❌  Build failed');
    }
    return ok;
}

// ─── Step 3: Copy to packages/ ───────────────────────────────────

function stepCopy(version) {
    log('📦', 'Step 3/4: Copying to packages/...');

    if (cleanAll) {
        console.log('  🗑  Cleaning packages/...');
        if (fs.existsSync(PACKAGES_DIR)) {
            fs.rmSync(PACKAGES_DIR, { recursive: true, force: true });
        }
    }

    ensureDir(PACKAGES_DIR);

    // Find the 7z file in wps-addon-publish/
    const files = getFiles(PUBLISH_DIR);
    const sevenZ = files.find(f => f.endsWith('.7z'));
    if (!sevenZ) {
        console.error('  ❌  No .7z file found in wps-addon-publish/');
        return false;
    }

    const src = path.join(PUBLISH_DIR, sevenZ);
    const dest = path.join(PACKAGES_DIR, sevenZ);

    // Skip if already exists with same size
    if (fs.existsSync(dest)) {
        const srcStat = fs.statSync(src);
        const destStat = fs.statSync(dest);
        if (srcStat.size === destStat.size) {
            console.log(`  ⏭  ${sevenZ} already exists (${(srcStat.size / 1024).toFixed(1)} KB), skipping copy`);
            return true;
        }
    }

    fs.copyFileSync(src, dest);
    const sizeKb = (fs.statSync(dest).size / 1024).toFixed(1);
    console.log(`  ✅  Copied ${sevenZ} (${sizeKb} KB) → packages/`);
    return true;
}

// ─── Step 4: Update manifest ─────────────────────────────────────

function stepManifest(version) {
    log('📋', 'Step 4/4: Updating manifest...');

    const manifest = readManifest();
    const files = getFiles(PACKAGES_DIR).filter(f => f.endsWith('.7z'));
    const now = new Date().toISOString();

    // Remove old entry for this version if exists
    manifest.releases = manifest.releases.filter(r => r.version !== version);

    // Add new entry
    const entry = {
        version: version,
        tag: `v${version}`,
        date: now,
        files: files.map(f => {
            const stat = fs.statSync(path.join(PACKAGES_DIR, f));
            return { name: f, size: stat.size };
        })
    };
    manifest.releases.push(entry);

    // Sort by version descending
    manifest.releases.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));

    writeManifest(manifest);
    console.log(`  ✅  Manifest updated: ${manifest.releases.length} release(s) tracked`);
    console.log(`     Latest: v${version} (${entry.files.map(f => f.name).join(', ')})`);
    return true;
}

// ─── Main ────────────────────────────────────────────────────────

function main() {
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║  开悟 (Kaiwu) Release Pipeline              ║');
    console.log('╚══════════════════════════════════════════════╝');

    const version = getVersion();
    console.log(`  Version:  v${version}`);
    console.log(`  Date:     ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`);
    console.log(`  Flags:    ${skipTest ? '--skip-test ' : ''}${cleanAll ? '--clean' : ''}`);

    const t0 = Date.now();

    if (!stepTests()) process.exit(1);
    if (!stepBuild()) process.exit(1);
    if (!stepCopy(version)) process.exit(1);
    if (!stepManifest(version)) process.exit(1);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log(`║  ✅  Release v${version} ready (${elapsed}s)`);
    console.log('╚══════════════════════════════════════════════╝');
    console.log('\n  Output:');
    console.log(`    packages/manifest.json`);
    getFiles(PACKAGES_DIR).forEach(f => {
        if (f.endsWith('.7z')) {
            const stat = fs.statSync(path.join(PACKAGES_DIR, f));
            console.log(`    packages/${f}  (${(stat.size / 1024).toFixed(1)} KB)`);
        }
    });
    console.log('');
}

main();
