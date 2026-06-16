/**
 * tests/icons.test.js — 图标资源完整性测试
 *
 * 验证:
 *   - ribbon.js ICON_MAP 中每个值都对应一个真实存在的 SVG 文件
 *   - 所有功能分组的关键图标都存在 (kaiwu, polish, continue, rewrite, expand, shrink, ...)
 *   - 开悟 LOGO (kaiwu.svg) 是有效的 SVG
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeEnv, loadScripts } = require('./_setup');

const ROOT = path.resolve(__dirname, '..');
const ICON_DIR = path.join(ROOT, 'images');

function loadRibbonOnly() {
    const env = makeEnv();
    loadScripts(env.window, ['component.js', 'taskpane/services/wakeword.js', 'ribbon.js']);
    return { env, ICON_MAP: env.window.ICON_MAP };
}

test('icons: ICON_MAP values all reference existing SVG files', () => {
    const { ICON_MAP } = loadRibbonOnly();
    const missing = [];
    for (const id of Object.keys(ICON_MAP)) {
        const relPath = ICON_MAP[id];
        if (!relPath || relPath.indexOf('images/') !== 0) {
            missing.push(id + ' -> ' + relPath);
            continue;
        }
        const fileName = relPath.replace(/^images\//, '');
        const abs = path.join(ICON_DIR, fileName);
        if (!fs.existsSync(abs)) {
            missing.push(id + ' -> ' + relPath);
        }
    }
    assert.equal(missing.length, 0, 'missing icon files: ' + missing.join('; '));
});

test('icons: kaiwu.svg (开悟 LOGO) exists and is valid SVG', () => {
    const file = path.join(ICON_DIR, 'kaiwu.svg');
    assert.ok(fs.existsSync(file), 'kaiwu.svg should exist');
    const content = fs.readFileSync(file, 'utf8');
    assert.ok(content.indexOf('<svg') === 0 || content.indexOf('<?xml') === 0,
        'should be a valid SVG file');
    assert.ok(content.indexOf('viewBox="0 0 32 32"') !== -1,
        'should use standard 32x32 viewBox');
    assert.ok(content.indexOf('开悟') !== -1 || content.indexOf('Kaiwu') !== -1,
        'should include Kaiwu branding in title/aria-label');
});

test('icons: kaiwu.svg is used as fallback for unknown controls', () => {
    const { env } = loadRibbonOnly();
    // GetImage with unknown control
    const fallback = env.window.GetImage({ Id: 'btnNonExistent' });
    assert.equal(fallback, 'images/kaiwu.svg', 'fallback should be kaiwu.svg');
});

test('icons: 创作 group has unique icons for each button', () => {
    const { ICON_MAP } = loadRibbonOnly();
    const createGroup = {
        btnWrite: ICON_MAP['btnWrite'],
        btnContinue: ICON_MAP['btnContinue'],
        btnCoWrite: ICON_MAP['btnCoWrite'],
        btnImitate: ICON_MAP['btnImitate']
    };
    const values = Object.values(createGroup);
    const unique = values.filter((v, i) => values.indexOf(v) === i);
    assert.ok(unique.length >= 3,
        '创作 group should have at least 3 unique icons, got: ' + JSON.stringify(createGroup));
});

test('icons: 修改 group has unique icons for distinct functions', () => {
    const { ICON_MAP } = loadRibbonOnly();
    const modifyGroup = {
        btnCorrect: ICON_MAP['btnCorrect'],
        btnExpand: ICON_MAP['btnExpand'],
        btnShrink: ICON_MAP['btnShrink'],
        btnRewrite: ICON_MAP['btnRewrite'],
        btnPolishFormal: ICON_MAP['btnPolishFormal'],
        btnPolishGovernment: ICON_MAP['btnPolishGovernment'],
        btnFullPolish: ICON_MAP['btnFullPolish']
    };
    // 至少 5 个不同图标
    const values = Object.values(modifyGroup);
    const unique = values.filter((v, i) => values.indexOf(v) === i);
    assert.ok(unique.length >= 5,
        '修改 group should have >= 5 unique icons, got: ' + JSON.stringify(modifyGroup));
});

test('icons: all required new icons exist', () => {
    const required = [
        'kaiwu.svg',
        'cowrite.svg',
        'imitate.svg',
        'correct.svg',
        'shrink.svg',
        'formal.svg',
        'government.svg',
        'oral.svg',
        'academic.svg',
        'full_polish.svg',
        'talk_doc.svg',
        'ai_layout.svg',
        'paper_layout.svg',
        'gov_layout.svg',
        'doc_to_ppt.svg',
        'gen_image.svg',
        'summary_image.svg',
        'deep_think.svg',
        'history.svg',
        'legal.svg'
    ];
    const missing = required.filter(f => !fs.existsSync(path.join(ICON_DIR, f)));
    assert.equal(missing.length, 0, 'missing icons: ' + missing.join(', '));
});

test('icons: all SVGs are valid 32x32 viewBox', () => {
    const files = fs.readdirSync(ICON_DIR).filter(f => f.endsWith('.svg') && f !== 'banner.svg');
    const invalid = [];
    for (const f of files) {
        const content = fs.readFileSync(path.join(ICON_DIR, f), 'utf8');
        if (content.indexOf('viewBox="0 0 32 32"') === -1) {
            invalid.push(f);
        }
    }
    assert.equal(invalid.length, 0, 'invalid viewBox in: ' + invalid.join(', '));
});

test('icons: all SVGs use the Kaiwu color palette (#2f3437 / #f26b30)', () => {
    const files = fs.readdirSync(ICON_DIR).filter(f => f.endsWith('.svg'));
    const invalid = [];
    for (const f of files) {
        const content = fs.readFileSync(path.join(ICON_DIR, f), 'utf8');
        const hasDark = content.indexOf('#2f3437') !== -1;
        const hasOrange = content.indexOf('#f26b30') !== -1;
        if (!hasDark && !hasOrange) {
            // 允许单一颜色 (蓝色图标如 formula.svg)
            const hasBlue = content.indexOf('#1e88e5') !== -1;
            const hasWhite = content.indexOf('#fff') !== -1;
            if (!hasBlue && !hasWhite) {
                invalid.push(f);
            }
        }
    }
    assert.equal(invalid.length, 0, 'icons not using Kaiwu palette: ' + invalid.join(', '));
});
