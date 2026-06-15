/**
 * tools/render-floating.js
 *
 * Renders the floating assistant page in a real Chromium and saves a
 * PNG screenshot for visual verification. Uses the locally installed
 * Microsoft Edge so we don't need to download a separate browser.
 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\EdgeCore\\148.0.3967.96\\msedge.exe';
const PROJECT = path.resolve(__dirname, '..');
const SERVER = 'http://127.0.0.1:3889';

const scenarios = process.argv.slice(2);
const outDir = path.join(PROJECT, 'screenshots');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

(async () => {
    const browser = await chromium.launch({
        executablePath: EDGE_PATH,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    const ctx = await browser.newContext({
        viewport: { width: 1080, height: 720 },
        deviceScaleFactor: 2
    });
    const COMPOSER_W = 720;
    const COMPOSER_H = 180;
    const page = await ctx.newPage();
    page.on('pageerror', err => console.log('[pageerror]', err.message));
    page.on('console', msg => { if (msg.type() === 'error') console.log('[console error]', msg.text()); });

    const url = SERVER + '/floating/index.html';
    console.log('Loading', url);
    page.on('response', resp => {
        if (resp.status() >= 400) console.log('  [404]', resp.url());
    });
    // Block the wpsjs SSE hot-update which keeps the network active
    await page.route('**/hot-update/**', route => route.abort());
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    // Wait for scripts to evaluate and init() to run.
    await page.waitForTimeout(3000);
    // Apply a visible background so transparent body doesn't blend with white
    // (WPS CEF 对话框的内容区背景也是浅灰, 模拟这个环境)
    // 同时把 composer 固定在视口左上角 (模拟 WPS 浮动对话框在文档中的位置)
    await page.evaluate(({ w, h }) => {
        document.documentElement.style.background = '#e6e7eb';
        document.body.style.background = '#e6e7eb';
        const composer = document.querySelector('.kw-composer');
        if (composer) {
            composer.style.position = 'fixed';
            composer.style.top = '0';
            composer.style.left = '0';
            composer.style.width = w + 'px';
            composer.style.height = h + 'px';
        }
    }, { w: COMPOSER_W, h: COMPOSER_H });
    // Verify init ran by checking the AI指令 button has a click handler attached.
    const ready = await page.evaluate(() => ({
        hasConfig: typeof Config !== 'undefined',
        hasAiCmdBtn: !!document.getElementById('kwAiCmd'),
        isAicmdOpen: document.getElementById('kwAiCmdPanel') && !document.getElementById('kwAiCmdPanel').hidden,
        composerHeight: document.querySelector('.kw-composer')?.offsetHeight,
    }));
    console.log('Page state:', JSON.stringify(ready));

    // Default state
    await page.screenshot({ path: path.join(outDir, 'floating-default.png'), fullPage: false });
    console.log('Saved floating-default.png');

    // Open the AI 指令 panel
    if (scenarios.includes('open-aicmd') || scenarios.length === 0) {
        // Verify click handler is attached, then click
        const clicked = await page.evaluate(() => {
            const btn = document.getElementById('kwAiCmd');
            btn.click();
            return {
                panelHidden: document.getElementById('kwAiCmdPanel').hidden,
                btnClass: btn.className,
            };
        });
        console.log('After .click():', JSON.stringify(clicked));
        await page.waitForTimeout(400);
        // viewport 已经是 1080x720, composer 固定在左上角, 面板会浮在 composer 下方
        await page.screenshot({ path: path.join(outDir, 'floating-aicmd-open.png'), fullPage: false });
        console.log('Saved floating-aicmd-open.png');
        // Close the dropdown
        await page.evaluate(() => document.getElementById('kwAiCmd').click());
        await page.waitForTimeout(300);
    }

    // Hover one item
    if (scenarios.includes('hover-item')) {
        await page.hover('.kw-aicmd-item:nth-child(3)');
        await page.waitForTimeout(200);
        await page.screenshot({ path: path.join(outDir, 'floating-aicmd-hover.png'), fullPage: false });
    }

    // Click an item to "select" it and populate the prompt
    if (scenarios.includes('select-item')) {
        await page.click('.kw-aicmd-item:nth-child(3)');
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(outDir, 'floating-aicmd-selected.png'), fullPage: false });
    }

    // Simulate a streamed answer for the result-state preview
    if (scenarios.includes('result')) {
        // Close the dropdown first if it's open
        await page.evaluate(() => {
            const panel = document.getElementById('kwAiCmdPanel');
            if (panel && !panel.hidden) {
                document.getElementById('kwAiCmd').click();
            }
        });
        await page.waitForTimeout(200);
        // Inject a fake streamed answer
        await page.evaluate(() => {
            const html = [
                '<h3>产品发布介绍</h3>',
                '<p>我们很高兴地宣布，全新 <strong>开悟 AI 写作助手</strong> 正式发布。'
                + '基于 <em>MiniMax M3</em> 大模型，开悟为 WPS 用户带来前所未有的写作体验。</p>',
                '<ul><li>智能续写：选中文字后一键续写</li>'
                + '<li>风格仿写：模仿选中文字的语气</li>'
                + '<li>伴写模式：作为搭档协助创作</li></ul>',
                '<p>立即在 WPS 中体验：打开任意文档，按 <code>Shift Shift</code> 唤起开悟。</p>'
            ].join('');
            const result = document.getElementById('kwResult');
            const answer = document.getElementById('kwAnswer');
            const actions = document.getElementById('kwResultActions');
            if (result) {
                result.hidden = false;
                result.classList.add('is-open');
            }
            if (answer) answer.innerHTML = html;
            if (actions) actions.hidden = false;
        });
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(outDir, 'floating-result.png'), fullPage: false });
        console.log('Saved floating-result.png');
    }

    await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
