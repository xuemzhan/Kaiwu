#!/usr/bin/env node
/**
 * scripts/init-env.js — 从 .env 生成 taskpane/env.js
 *
 * 用法: node scripts/init-env.js [envFile] [outputFile]
 * 默认读取项目根 .env, 输出到 taskpane/env.js
 *
 * 生成的 env.js 用 window 全局变量注入默认配置, 前端可通过
 *   window.__ENV_API_KEY__ / __ENV_API_BASE__ / __ENV_MODEL__
 * 读取。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const envFile = process.argv[2] || path.resolve(__dirname, '..', '.env');
const outFile = process.argv[3] || path.resolve(__dirname, '..', 'taskpane', 'env.js');

if (!fs.existsSync(envFile)) {
    console.warn('[init-env] .env 文件不存在, 跳过 (' + envFile + ')');
    process.exit(0);
}

const content = fs.readFileSync(envFile, 'utf8');
const vars = {};
content.split(/\r?\n/).forEach(function (line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) return;
    const key = trimmed.substring(0, eq).trim();
    const val = trimmed.substring(eq + 1).trim().replace(/^["']|["']$/g, '');
    vars[key] = val;
});

const apiKey = vars['VITE_DEFAULT_API_KEY'] || '';
const apiBase = vars['VITE_DEFAULT_API_BASE'] || '';
const model = vars['VITE_DEFAULT_MODEL'] || '';

// 防御性转义: 仅在单引号内出现时需要转义
function jsSingleQuote(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const output =
'/**\n' +
' * env.js — 由 init-env 自动生成, 请勿手动修改.\n' +
' * 从 .env 文件注入默认配置到前端全局作用域.\n' +
' */\n' +
'window.__ENV_API_KEY__ = \'' + jsSingleQuote(apiKey) + '\';\n' +
'window.__ENV_API_BASE__ = \'' + jsSingleQuote(apiBase) + '\';\n' +
'window.__ENV_MODEL__ = \'' + jsSingleQuote(model) + '\';\n';

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, output, { encoding: 'utf8' });
console.log('[init-env] 已生成 ' + outFile);
