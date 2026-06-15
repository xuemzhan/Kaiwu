/**
 * scripts/package.js — 开悟 WPS 加载项打包脚本
 *
 * 与 wpsjs 内置 build 的区别:
 *   1. 排除开发期残留 (tests/, tools/, .omo/, debug logs, 截图)
 *   2. 用 wpsjs.config.js 的 addonName 而非 package.json 的 name
 *   3. 内置纯英文 install.bat / uninstall.bat + README + publish.xml
 *   4. 产出到 wps-addon-publish/ (干净的发行目录)
 *   5. 打包目录名使用 ASCII (kaiwu_1.0.0), 避免 Windows bat 编码陷阱;
 *      publish.xml 的 name 也用 ASCII (kaiwu), 因为 WPS 的 jsaddons 路径 = {name}_{version}
 *
 * 用法:
 *   node scripts/package.js                  # 默认: 7z 包 (推荐)
 *   node scripts/package.js 7z              # 同上
 *   node scripts/package.js exe             # 自解压 EXE (会触发 Windows PCA 警告)
 *   node scripts/package.js both            # 同时产出 7z + EXE
 *
 * 推荐使用 7z 包, 用户用 7-Zip / WinRAR / 系统自带解压手动解压后双击 install.bat.
 * EXE 自解压会触发 Windows 10/11「程序兼容性助手」误报 (7z SFX 的固有问题).
 *
 * 7z 包结构:
 *   kaiwu_1.0.0.7z
 *     ├─ kaiwu_1.0.0/                     <-- 插件根目录 (ASCII, 避免 bat 编码陷阱)
 *     │   ├─ ribbon.xml
 *     │   ├─ ribbon.js
 *     │   ├─ component.js
 *     │   ├─ index.html
 *     │   ├─ .env
 *     │   ├─ taskpane/
 *     │   ├─ floating/
 *     │   └─ images/
 *     ├─ install.bat                       <-- 双击安装 (纯英文 + 兼容 ANSI)
 *     ├─ uninstall.bat                     <-- 双击卸载
 *     ├─ publish.xml                       <-- WPS 插件清单
 *     └─ README-安装说明.md                <-- 用户安装 SOP
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT, 'wps-addon-build');
const PUBLISH_DIR = path.join(ROOT, 'wps-addon-publish');

// 加载插件配置 (addonName 才是 WPS 看到的名字)
const wpsjsConfig = require(path.join(ROOT, 'wpsjs.config.js'));
const packageMeta = require(path.join(ROOT, 'package.json'));
const ADDON_NAME = wpsjsConfig.addonName || packageMeta.name;
const VERSION = wpsjsConfig.version || packageMeta.version;
// 打包目录名: 只用 ASCII, 避免 Windows bat 在 GBK/UTF-8 之间的编码陷阱
// WPS 的 jsaddons 路径约定 = {name}_{version}, 所以 name 也必须是 ASCII
// ribbon.xml 的 label="开悟" 仍然是用户在功能区看到的标签
const PACKAGE_DIR_ASCII = 'kaiwu_' + VERSION;
const ADDON_NAME_ASCII = 'kaiwu';

// 排除目录/文件 (不要塞进发行包)
const EXCLUDE = new Set([
    'node_modules',
    '.git',
    '.vscode',
    '.gitignore',
    'wps-addon-build',
    'wps-addon-publish',
    'tests',
    'tools',
    'screenshots',
    '.omo',
    'package-lock.json',
    'package.json',
    '.env.template',     // 模板不进包, 真实 .env 进
    'README.md',         // 项目根的 README 是开发文档, 不进包
    'INSTALL.md',        // 同样的根开发 SOP 不进包
    // 单个文件
    'debug.finalserver.log',
    'test.run.log',
    'wps-screenshot.png',
    'wps-with-doc.png',
    'floating-default.png'
]);

function readEnvOrFail() {
    const envPath = path.join(ROOT, '.env');
    if (!fs.existsSync(envPath)) {
        throw new Error('.env 文件不存在, 请先创建并填入 API Key');
    }
    const text = fs.readFileSync(envPath, 'utf8');
    const vars = {};
    text.split(/\r?\n/).forEach(function (line) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) return;
        vars[trimmed.substring(0, eq).trim()] = trimmed.substring(eq + 1).trim().replace(/^["']|["']$/g, '');
    });
    if (!vars.VITE_DEFAULT_API_KEY || vars.VITE_DEFAULT_API_KEY.indexOf('PLEASE_REPLACE') === 0) {
        throw new Error('.env 中的 VITE_DEFAULT_API_KEY 仍为占位符, 请填入真实 API Key 后再打包');
    }
    return vars;
}

function cleanDir(dir) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
}

function copyDirFiltered(src, dest, excludes) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (excludes.has(entry.name)) continue;
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirFiltered(srcPath, destPath, excludes);
        } else if (entry.isFile()) {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function generatePublishXml() {
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<jsplugins>\n' +
        '    <jsplugin name="' + ADDON_NAME_ASCII + '" type="' + (wpsjsConfig.type || 'wps') + '" ' +
        'url="' + PACKAGE_DIR_ASCII + '" version="' + VERSION + '" ' +
        'enable="enable_dev" install="null" customDomain=""/>\n' +
        '</jsplugins>\n'
    );
}

function generateInstallBat() {
    return (
        '@echo off\n' +
        'setlocal\n' +
        'title Kaiwu WPS Addon - Installer\n' +
        'echo.\n' +
        'echo  ============================================\n' +
        'echo    Kaiwu WPS Addon - Installer\n' +
        'echo    Version: ' + VERSION + '\n' +
        'echo  ============================================\n' +
        'echo.\n' +
        '\n' +
        'set "SRC_DIR=%~dp0' + PACKAGE_DIR_ASCII + '"\n' +
        'set "DEST_DIR=%APPDATA%\\kingsoft\\wps\\jsaddons"\n' +
        'set "PLUGIN_DIR=%DEST_DIR%\\' + PACKAGE_DIR_ASCII + '"\n' +
        '\n' +
        'echo  Source: %SRC_DIR%\n' +
        'echo  Target: %PLUGIN_DIR%\n' +
        'echo.\n' +
        '\n' +
        'if not exist "%SRC_DIR%" (\n' +
        '    echo  [ERROR] Source directory not found: %SRC_DIR%\n' +
        '    echo  Please extract the full archive before running installer.\n' +
        '    pause\n' +
        '    exit /b 1\n' +
        ')\n' +
        '\n' +
        'echo  [1/4] Creating destination directories ...\n' +
        'if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"\n' +
        'if not exist "%PLUGIN_DIR%" mkdir "%PLUGIN_DIR%"\n' +
        '\n' +
        'echo  [2/4] Copying plugin files ...\n' +
        'xcopy /E /I /Y /Q "%SRC_DIR%\\*" "%PLUGIN_DIR%\\"\n' +
        'if errorlevel 1 (\n' +
        '    echo  [ERROR] Failed to copy plugin files. Check permissions or disk space.\n' +
        '    pause\n' +
        '    exit /b 1\n' +
        ')\n' +
        '\n' +
        'echo  [3/4] Registering plugin manifest ...\n' +
        'copy /Y "%~dp0publish.xml" "%DEST_DIR%\\"\n' +
        'if errorlevel 1 (\n' +
        '    echo  [ERROR] Failed to write publish.xml. Check permissions.\n' +
        '    pause\n' +
        '    exit /b 1\n' +
        ')\n' +
        '\n' +
        'echo  [4/4] Clearing WPS plugin cache ...\n' +
        'if exist "%DEST_DIR%\\authaddin.json" (\n' +
        '    echo        Removing stale authaddin.json so WPS re-reads publish.xml\n' +
        '    del /F /Q "%DEST_DIR%\\authaddin.json" >nul 2>nul\n' +
        ')\n' +
        '\n' +
        'echo.\n' +
        'echo  ============================================\n' +
        'echo    Installation completed successfully!\n' +
        'echo.\n' +
        'echo    CRITICAL: Fully exit WPS before reopening!\n' +
        'echo      1. Close all WPS documents\n' +
        'echo      2. Right-click WPS system tray icon -^> Exit\n' +
        'echo      3. Open Task Manager -^> kill any wps.exe\n' +
        'echo      4. Reopen WPS Writer\n' +
        'echo      5. Look for the "Kaiwu" tab in the ribbon\n' +
        'echo  ============================================\n' +
        'echo.\n' +
        'pause\n'
    );
}

function generateVerifyBat() {
    return (
        '@echo off\n' +
        'setlocal\n' +
        'title Kaiwu WPS Addon - Verify\n' +
        'echo.\n' +
        'echo  ============================================\n' +
        'echo    Kaiwu WPS Addon - Installation Check\n' +
        'echo  ============================================\n' +
        'echo.\n' +
        '\n' +
        'set "DEST_DIR=%APPDATA%\\kingsoft\\wps\\jsaddons"\n' +
        'set "PLUGIN_DIR=%DEST_DIR%\\' + PACKAGE_DIR_ASCII + '"\n' +
        '\n' +
        'echo  Checking installation ...\n' +
        'echo.\n' +
        '\n' +
        'set ERRORS=0\n' +
        '\n' +
        'if exist "%DEST_DIR%" (\n' +
        '    echo  [OK]     jsaddons folder exists: %DEST_DIR%\n' +
        ') else (\n' +
        '    echo  [ERROR]  jsaddons folder missing: %DEST_DIR%\n' +
        '    set ERRORS=1\n' +
        ')\n' +
        '\n' +
        'if exist "%DEST_DIR%\\publish.xml" (\n' +
        '    echo  [OK]     publish.xml exists\n' +
        '    echo           Contents:\n' +
        '    type "%DEST_DIR%\\publish.xml" | findstr /R /C:"jsplugin"\n' +
        ') else (\n' +
        '    echo  [ERROR]  publish.xml missing\n' +
        '    set ERRORS=1\n' +
        ')\n' +
        '\n' +
        'if exist "%PLUGIN_DIR%" (\n' +
        '    echo  [OK]     Plugin folder exists: ' + PACKAGE_DIR_ASCII + '\n' +
        ') else (\n' +
        '    echo  [ERROR]  Plugin folder missing: ' + PACKAGE_DIR_ASCII + '\n' +
        '    set ERRORS=1\n' +
        ')\n' +
        '\n' +
        'if exist "%PLUGIN_DIR%\\ribbon.xml" (\n' +
        '    echo  [OK]     ribbon.xml exists\n' +
        ') else (\n' +
        '    echo  [ERROR]  ribbon.xml missing - install did not complete\n' +
        '    set ERRORS=1\n' +
        ')\n' +
        '\n' +
        'if exist "%PLUGIN_DIR%\\index.html" (\n' +
        '    echo  [OK]     index.html exists\n' +
        ') else (\n' +
        '    echo  [ERROR]  index.html missing\n' +
        '    set ERRORS=1\n' +
        ')\n' +
        '\n' +
        'if exist "%PLUGIN_DIR%\\taskpane\\index.html" (\n' +
        '    echo  [OK]     taskpane/index.html exists\n' +
        ') else (\n' +
        '    echo  [ERROR]  taskpane/index.html missing\n' +
        '    set ERRORS=1\n' +
        ')\n' +
        '\n' +
        'if exist "%DEST_DIR%\\authaddin.json" (\n' +
        '    echo  [WARN]   authaddin.json still exists (WPS may use cached path)\n' +
        '    echo           Run install.bat to clear it.\n' +
        '    set ERRORS=1\n' +
        ') else (\n' +
        '    echo  [OK]     authaddin.json not present (WPS will rebuild on next start)\n' +
        ')\n' +
        '\n' +
        'echo.\n' +
        'if "%ERRORS%"=="0" (\n' +
        '    echo  All checks passed. If WPS still does not show the tab:\n' +
        '    echo    1. Fully exit WPS (close all docs, system tray, Task Manager)\n' +
        '    echo    2. Reopen WPS Writer\n' +
        '    echo    3. Check WPS Office -^> Options -^> Trust Center -^> Add-ins\n' +
        ') else (\n' +
        '    echo  Some checks failed. Re-run install.bat as Administrator.\n' +
        ')\n' +
        'echo.\n' +
        'pause\n'
    );
}

function generateUninstallBat() {
    return (
        '@echo off\n' +
        'setlocal\n' +
        'title Kaiwu WPS Addon - Uninstaller\n' +
        'echo.\n' +
        'echo  ============================================\n' +
        'echo    Kaiwu WPS Addon - Uninstaller\n' +
        'echo  ============================================\n' +
        'echo.\n' +
        '\n' +
        'set "DEST_DIR=%APPDATA%\\kingsoft\\wps\\jsaddons"\n' +
        'set "PLUGIN_DIR=%DEST_DIR%\\' + PACKAGE_DIR_ASCII + '"\n' +
        '\n' +
        'echo  Will delete: %PLUGIN_DIR%\n' +
        'echo.\n' +
        'set /p CONFIRM=Confirm uninstall? (Y/N): \n' +
        'if /i not "%CONFIRM%"=="Y" (\n' +
        '    echo  Cancelled.\n' +
        '    pause\n' +
        '    exit /b 0\n' +
        ')\n' +
        '\n' +
        'if exist "%PLUGIN_DIR%" (\n' +
        '    rmdir /S /Q "%PLUGIN_DIR%"\n' +
        '    echo  [OK] Plugin directory removed.\n' +
        ') else (\n' +
        '    echo  [INFO] Plugin directory not found, skipping.\n' +
        ')\n' +
        '\n' +
        'if exist "%DEST_DIR%\\authaddin.json" (\n' +
        '    del /F /Q "%DEST_DIR%\\authaddin.json" >nul 2>nul\n' +
        '    echo  [OK] Cleared WPS plugin cache (authaddin.json)\n' +
        ')\n' +
        '\n' +
        'echo.\n' +
        'echo  IMPORTANT: Fully exit WPS (close all docs, system tray)\n' +
        'echo  before reopening, otherwise the plugin may still appear.\n' +
        'echo.\n' +
        'pause\n'
    );
}

function generateReadme(envVars) {
    return (
        '# 开悟 — WPS AI 写作助手\n' +
        '\n' +
        '<div align="center">\n' +
        '\n' +
        '**版本: ' + VERSION + '**\n' +
        '\n' +
        '基于 AI 大模型的 WPS 写作辅助工具\n' +
        '\n' +
        '对话 · 润色 · 续写 · 翻译 · 摘要 · 仿写 · 伴写 · 文档脑图\n' +
        '\n' +
        '</div>\n' +
        '\n' +
        '---\n' +
        '\n' +
        '## 一键安装\n' +
        '\n' +
        '1. 解压本压缩包到任意位置 (如桌面)\n' +
        '2. **完全退出 WPS** (关闭所有文档, 右键托盘图标 → 退出, 任务管理器结束所有 `wps.exe`)\n' +
        '3. 双击 **`install.bat`**\n' +
        '4. 看到 "Installation completed successfully" 后, **再次确认 WPS 已完全退出**\n' +
        '5. 重新打开 WPS Writer (.docx 文档)\n' +
        '6. 在 WPS Writer 功能区找到 "**Kaiwu**" 标签页 → 点击 "打开助手"\n' +
        '\n' +
        '> **首次使用管理员身份运行 install.bat**, 以保证能写入 `%APPDATA%\\kingsoft\\wps\\jsaddons\\`\n' +
        '\n' +
        '如果安装后看不到 "Kaiwu" 标签页, 双击 **`verify.bat`** 进行诊断.\n' +
        '\n' +
        '## 系统要求\n' +
        '\n' +
        '| 依赖 | 版本 |\n' +
        '|------|------|\n' +
        '| WPS Office | 个人版 v12.1.0.26375+ 或 专业版 |\n' +
        '| 操作系统 | Windows 10 / Windows 11 |\n' +
        '\n' +
        '## 卸载\n' +
        '\n' +
        '双击 **`uninstall.bat`** 即可, 然后重启 WPS。\n' +
        '\n' +
        '## 配置 API Key\n' +
        '\n' +
        '包内已内置默认 API Key (在 `.env` 文件中)。如果需要更换:\n' +
        '\n' +
        '- **方法一**: 编辑 `' + PACKAGE_DIR_ASCII + '\\.env`, 填入新的 `VITE_DEFAULT_API_KEY` 等, 然后重启 WPS\n' +
        '- **方法二**: 在 WPS 侧边栏点击 ⚙️ 设置, 实时修改并保存 (推荐, 无需重启)\n' +
        '\n' +
        '当前默认配置:\n' +
        '\n' +
        '```\n' +
        'VITE_DEFAULT_API_BASE = ' + (envVars.VITE_DEFAULT_API_BASE || '(未设置)') + '\n' +
        'VITE_DEFAULT_MODEL    = ' + (envVars.VITE_DEFAULT_MODEL || '(未设置)') + '\n' +
        'VITE_DEFAULT_API_KEY  = ' + (envVars.VITE_DEFAULT_API_KEY ? envVars.VITE_DEFAULT_API_KEY.substring(0, 8) + '...' : '(未设置)') + '\n' +
        '```\n' +
        '\n' +
        '## 目录结构\n' +
        '\n' +
        '```\n' +
        'kaiwu_' + VERSION + '/\n' +
        '├── .env                        # API 默认配置 (可改)\n' +
        '├── ribbon.xml                  # WPS 功能区定义\n' +
        '├── ribbon.js                   # 功能区事件\n' +
        '├── component.js                # 组件检测\n' +
        '├── index.html                  # 入口页\n' +
        '├── images/                     # 图标 (含 LOGO)\n' +
        '├── taskpane/                   # 侧边栏面板\n' +
        '│   ├── index.html\n' +
        '│   ├── app.js\n' +
        '│   ├── env.js                 # 由 .env 自动生成\n' +
        '│   ├── services/\n' +
        '│   ├── components/\n' +
        '│   ├── actions/\n' +
        '│   ├── adapters/\n' +
        '│   ├── styles/\n' +
        '│   └── vendor/                # 第三方库\n' +
        '└── floating/                   # 浮动助手\n' +
        '    ├── index.html\n' +
        '    ├── floating.js\n' +
        '    └── styles/\n' +
        '```\n' +
        '\n' +
        '## 安装位置\n' +
        '\n' +
        '插件文件被复制到:\n' +
        '\n' +
        '```\n' +
        '%APPDATA%\\kingsoft\\wps\\jsaddons\\' + PACKAGE_DIR_ASCII + '\\\n' +
        '%APPDATA%\\kingsoft\\wps\\jsaddons\\publish.xml\n' +
        '```\n' +
        '\n' +
        '## 常见问题\n' +
        '\n' +
        '**Q: 安装后 WPS 看不到"开悟"标签页?**\n' +
        'A: 请按顺序检查:\n' +
        '   1. **完全退出 WPS**: 关闭所有文档 + 右键系统托盘 WPS 图标 → 退出 + 任务管理器 (Ctrl+Shift+Esc) 结束所有 `wps.exe`\n' +
        '   2. **检查 WPS 缓存**: 双击 `verify.bat` 查看诊断结果. 如果提示 `authaddin.json 仍存在`, 重新运行 `install.bat` 会自动清除它.\n' +
        '   3. **重新打开 WPS Writer** (不是 WPS 主入口, 是 .docx 文件)\n' +
        '   4. **如果还不行**: 手动删除 `%APPDATA%\\kingsoft\\wps\\jsaddons\\authaddin.json` 后再重启 WPS\n' +
        '\n' +
        '**Q: 为什么 install.bat 要删除 authaddin.json?**\n' +
        'A: WPS 启动时会在 `%APPDATA%\\kingsoft\\wps\\jsaddons\\` 创建一个 `authaddin.json` 缓存文件, 记录每个插件的加载路径. 如果你之前装过旧版本 (使用 `开悟_1.0.0` 目录), WPS 会继续从那个**已经不存在的**路径加载插件, 导致看不到新标签页. install.bat 删除这个缓存后, WPS 会在下次启动时从 `publish.xml` 重新构建缓存, 路径就是新目录 `kaiwu_1.0.0`.\n' +
        '\n' +
        '**Q: 双击 install.bat 提示权限不足?**\n' +
        'A: 右键 install.bat → "以管理员身份运行".\n' +
        '\n' +
        '**Q: 打开助手后一直转圈, 看不到结果?**\n' +
        'A: 检查 .env 中的 API Key 是否有效; 网络能否访问 API 地址; 在设置面板里换一个模型试试.\n' +
        '\n' +
        '**Q: 升级到新版本?**\n' +
        'A: 先运行 uninstall.bat 卸载旧版 (会自动清除 authaddin.json 缓存), 再解压新版运行 install.bat. 不会丢失个人设置 (保存在 WPS localStorage 中).\n' +
        '\n' +
        '---\n' +
        '\n' +
        '<div align="center">\n' +
        '打包于 ' + new Date().toISOString().slice(0, 19).replace('T', ' ') + '\n' +
        '</div>\n'
    );
}

function build() {
    console.log('[package] 读取 .env 配置...');
    const envVars = readEnvOrFail();
    console.log('        API:  ' + (envVars.VITE_DEFAULT_API_BASE || '(未设置)'));
    console.log('        Model:' + (envVars.VITE_DEFAULT_MODEL || '(未设置)'));
    console.log('        Key:  ' + envVars.VITE_DEFAULT_API_KEY.substring(0, 8) + '...');

    console.log('[package] 清理发布目录...');
    cleanDir(PUBLISH_DIR);

    const stagingDir = path.join(PUBLISH_DIR, PACKAGE_DIR_ASCII);
    cleanDir(stagingDir);

    console.log('[package] 复制源文件 (排除开发残留)...');
    const sourceRoot = path.join(ROOT, 'wps-addon-build');
    for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
        if (EXCLUDE.has(entry.name)) continue;
        const srcPath = path.join(sourceRoot, entry.name);
        const destPath = path.join(stagingDir, entry.name);
        if (entry.isDirectory()) {
            copyDirFiltered(srcPath, destPath, EXCLUDE);
        } else if (entry.isFile()) {
            fs.copyFileSync(srcPath, destPath);
        }
    }

    // 检查 .env 是否被复制 (它不在 EXCLUDE 集合里, 但我们要确保真实 .env 进包)
    const envInBuild = path.join(sourceRoot, '.env');
    const envInStage = path.join(stagingDir, '.env');
    if (fs.existsSync(envInBuild) && !fs.existsSync(envInStage)) {
        fs.copyFileSync(envInBuild, envInStage);
    }

    console.log('[package] 生成 publish.xml...');
    fs.writeFileSync(path.join(PUBLISH_DIR, 'publish.xml'), generatePublishXml(), 'utf8');

    console.log('[package] 生成 install.bat / uninstall.bat / verify.bat...');
    fs.writeFileSync(path.join(PUBLISH_DIR, 'install.bat'), generateInstallBat(), 'utf8');
    fs.writeFileSync(path.join(PUBLISH_DIR, 'uninstall.bat'), generateUninstallBat(), 'utf8');
    fs.writeFileSync(path.join(PUBLISH_DIR, 'verify.bat'), generateVerifyBat(), 'utf8');

    console.log('[package] 生成 README 安装说明...');
    fs.writeFileSync(path.join(PUBLISH_DIR, 'README-安装说明.md'), generateReadme(envVars), 'utf8');

    // 统计
    const stats = collectStats(stagingDir);
    console.log('[package] 完成. 包含: ' + stats.files + ' 个文件, ' + stats.dirs + ' 个目录, ' + (stats.size / 1024).toFixed(1) + ' KB');
    console.log('        路径: ' + stagingDir);
    return { stagingDir, envVars };
}

function collectStats(dir) {
    let files = 0, dirs = 0, size = 0;
    function walk(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) { dirs++; walk(p); }
            else { files++; size += fs.statSync(p).size; }
        }
    }
    walk(dir);
    return { files, dirs, size };
}

function packTo7z(stagingDir) {
    return new Promise((resolve, reject) => {
        const _7z = require(path.join(ROOT, 'node_modules', 'node-7z'));
        const _7zBin = require(path.join(ROOT, 'node_modules', '7zip-bin'));
        const output = path.join(PUBLISH_DIR, PACKAGE_DIR_ASCII + '.7z');
        const inputs = [
            path.join(PUBLISH_DIR, 'install.bat'),
            path.join(PUBLISH_DIR, 'uninstall.bat'),
            path.join(PUBLISH_DIR, 'publish.xml'),
            path.join(PUBLISH_DIR, 'README-安装说明.md'),
            stagingDir
        ];
        console.log('[package] 打包 7z: ' + output);
        const stream = _7z.add(output, inputs, {
            recursive: false,
            $bin: _7zBin.path7za
        });
        stream.on('end', () => {
            const sizeKb = (fs.statSync(output).size / 1024).toFixed(1);
            console.log('[package] 7z 完成: ' + sizeKb + ' KB');
            resolve(output);
        });
        stream.on('error', reject);
    });
}

function packToExe(sevenZipFile) {
    return new Promise((resolve, reject) => {
        const _7z = require(path.join(ROOT, 'node_modules', 'node-7z'));
        const _7zBin = require(path.join(ROOT, 'node_modules', '7zip-bin'));
        const sfxPath = path.join(ROOT, 'node_modules', 'wpsjs', 'src', 'lib', 'res', '7zsd.sfx');
        if (!fs.existsSync(sfxPath)) {
            reject(new Error('找不到 7zsd.sfx (位于 ' + sfxPath + '), 跳过 EXE 打包'));
            return;
        }
        const output = path.join(PUBLISH_DIR, PACKAGE_DIR_ASCII + '_installer.exe');
        const sfxConfig =
            ';!@Install@!UTF-8!\n' +
            'Title="Kaiwu WPS Addon - Installer v' + VERSION + '"\n' +
            'BeginPrompt="About to install Kaiwu WPS Addon v' + VERSION + '. Continue?"\n' +
            'RunProgram="install.bat"\n' +
            ';!@InstallEnd@!\n';

        console.log('[package] 打包 EXE: ' + output);
        const sfxBuf = fs.readFileSync(sfxPath);
        const cfgBuf = Buffer.from(sfxConfig, 'utf8');
        const sevenBuf = fs.readFileSync(sevenZipFile);
        const ws = fs.createWriteStream(output);
        ws.write(sfxBuf);
        ws.write(cfgBuf);
        ws.write(sevenBuf);
        ws.end(() => {
            const sizeKb = (fs.statSync(output).size / 1024).toFixed(1);
            console.log('[package] EXE 完成: ' + sizeKb + ' KB');
            resolve(output);
        });
        ws.on('error', reject);
    });
}

async function main() {
    const mode = (process.argv[2] || '7z').toLowerCase();
    if (!['7z', 'exe', 'both'].includes(mode)) {
        console.error('用法: node scripts/package.js [7z|exe|both]');
        process.exit(1);
    }
    try {
        const { stagingDir } = build();

        if (mode === '7z' || mode === 'both') {
            const sevenZipFile = await packTo7z(stagingDir);
            if (mode === 'both') {
                await packToExe(sevenZipFile);
            }
        } else if (mode === 'exe') {
            // EXE 模式需要先做 7z, 然后合并 SFX
            // 注意: EXE 模式会在 Windows 10/11 上触发「程序兼容性助手」(PCA) 警告,
            // 因为 7zsd.sfx 解压到 %TEMP% 后运行 bat, 行为模式不像标准 Windows 安装器.
            // 这是 7z SFX 的固有问题, 推荐使用 7z 包手动安装.
            const sevenZipFile = await packTo7z(stagingDir);
            await packToExe(sevenZipFile);
        }
        console.log('\n[package] ✓ 全部完成');
        console.log('  产物在: ' + PUBLISH_DIR);
        const items = fs.readdirSync(PUBLISH_DIR);
        items.forEach(function (i) {
            const stat = fs.statSync(path.join(PUBLISH_DIR, i));
            if (stat.isFile()) {
                console.log('   - ' + i + ' (' + (stat.size / 1024).toFixed(1) + ' KB)');
            }
        });
    } catch (e) {
        console.error('\n[package] ✗ 失败:', e.message);
        process.exit(1);
    }
}

main();
