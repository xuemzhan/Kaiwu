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
const iconv = require('iconv-lite');

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

const WPS_NATIVE_AI_REGISTRY = [
  { key: 'CloudService', value: 0, desc: 'WPS Cloud Service (includes AI assistant entry)' },
  { key: 'EnableAI', value: 0, desc: 'Native AI assistant enable switch' },
  { key: 'DocerEnabled', value: 0, desc: 'Daoke (Docer) template/plugin entry' },
];

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
  'scripts', // 打包脚本本身, 用户机器不需要
  '.env', // 敏感文件, 不进包 (安全修复)
  '.env.template', // 模板不进包, 真实 .env 进
  'README.md', // 项目根的 README 是开发文档, 不进包
  'INSTALL.md', // 同样的根开发 SOP 不进包
  'CHANGELOG.md', // 开发 changelog 不进包
  // 单个文件
  'debug.finalserver.log',
  'test.run.log',
  'wps-screenshot.png',
  'wps-with-doc.png',
  'floating-default.png',
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
    vars[trimmed.substring(0, eq).trim()] = trimmed
      .substring(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  });
  if (!vars.VITE_DEFAULT_API_KEY || vars.VITE_DEFAULT_API_KEY.indexOf('PLEASE_REPLACE') === 0) {
    throw new Error('.env 中的 VITE_DEFAULT_API_KEY 仍为占位符, 请填入真实 API Key 后再打包');
  }
  return vars;
}

/**
 * 信息性预检: 打印本机 WPS jsaddons 下已安装的所有 Kaiwu 变体.
 * 不修改任何文件, 仅供打包者知晓当前环境状态.
 * (实际卸载逻辑在生成的 install.bat 中执行 — 部署到用户机器时使用)
 */
function printExistingInstalls() {
  if (process.platform !== 'win32') {
    console.log('        (非 Windows 平台, 跳过 WPS 安装状态检查)');
    return;
  }
  const appdata = process.env.APPDATA;
  if (!appdata) {
    console.log('        (未设置 APPDATA 环境变量, 跳过)');
    return;
  }
  const destDir = path.join(appdata, 'kingsoft', 'wps', 'jsaddons');
  if (!fs.existsSync(destDir)) {
    console.log('        (未发现 WPS jsaddons 目录: ' + destDir + ')');
    return;
  }
  var found = [];
  try {
    for (const entry of fs.readdirSync(destDir)) {
      if (entry.startsWith('kaiwu_') || entry.startsWith('开悟_')) {
        found.push(entry);
      }
    }
  } catch (e) {
    /* ignore */
  }
  if (found.length === 0) {
    console.log('        (未发现 Kaiwu 安装 — 干净环境)');
  } else {
    console.log('        发现 ' + found.length + ' 个 Kaiwu 安装:');
    for (const f of found) {
      const isCurrent = f === PACKAGE_DIR_ASCII;
      console.log(
        '          - ' +
          f +
          (isCurrent ? '  (与本次打包同版本, xcopy 会覆盖)' : '  (旧版, install.bat 将自动卸载)')
      );
    }
  }
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * 把字符串中的 LF (\n) 转为 CRLF (\r\n).
 * 重要: Windows 的 cmd.exe 对纯 LF 的 bat 文件解析会出错
 * (特别是多行 for /d 循环), 用 CRLF 才稳定.
 * (不转换已有的 \r\n, 所以幂等.)
 */
function toCRLF(text) {
  return text.replace(/\r?\n/g, '\r\n');
}

function writeBatFile(batPath, content) {
  const utf8Content = Buffer.from(content, 'utf8');
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  try {
    fs.writeFileSync(batPath, Buffer.concat([bom, utf8Content]));
  } catch (fallbackErr) {
    console.warn(
      '        [WARN] UTF-8 BOM write failed (' + fallbackErr.message + '), falling back to GBK'
    );
    fs.writeFileSync(batPath, iconv.encode(content, 'gbk'));
  }
}

/**
 * Detect all installed WPS Office versions on this machine.
 * Returns [{version, installDir, cloudsvrPath, registryPath}, ...]
 */
function detectInstalledWpsVersions() {
  var cp = require('child_process');
  var versions = {};

  // Method 1: Registry scan — enumerate subkeys under HKCU\Software\Kingsoft\WPS Office
  try {
    var regOutput = cp.execSync('reg query "HKCU\\Software\\Kingsoft\\WPS Office"', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    var regLines = regOutput.split(/\r?\n/);
    for (var i = 0; i < regLines.length; i++) {
      var m = regLines[i].match(/HKEY_CURRENT_USER\\Software\\Kingsoft\\WPS Office\\(\S+)/);
      if (m && /^\d/.test(m[1])) {
        var ver = m[1];
        if (!versions[ver]) {
          versions[ver] = {
            version: ver,
            registryPath: 'HKCU\\Software\\Kingsoft\\WPS Office\\' + ver,
          };
        }
      }
    }
  } catch (e) {
    /* reg query failed or no WPS in registry */
  }

  // Method 2: Filesystem scan — ProgramFiles
  var programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
  var pfBase = path.join(programFiles, 'WPS Office');
  if (fs.existsSync(pfBase)) {
    try {
      var entries = fs.readdirSync(pfBase);
      for (var i = 0; i < entries.length; i++) {
        var csvr = path.join(pfBase, entries[i], 'office6', 'wpscloudsvr.exe');
        if (fs.existsSync(csvr)) {
          if (!versions[entries[i]]) {
            versions[entries[i]] = {
              version: entries[i],
              installDir: path.join(pfBase, entries[i]),
              cloudsvrPath: csvr,
            };
          } else {
            if (!versions[entries[i]].installDir)
              versions[entries[i]].installDir = path.join(pfBase, entries[i]);
            versions[entries[i]].cloudsvrPath = csvr;
          }
        }
      }
    } catch (e) {
      /* ignore */
    }
  }

  // Method 3: Filesystem scan — LocalAppData
  var localAppData = process.env.LOCALAPPDATA || '';
  if (localAppData) {
    var laBase = path.join(localAppData, 'Kingsoft', 'WPS Office');
    if (fs.existsSync(laBase)) {
      try {
        var laEntries = fs.readdirSync(laBase);
        for (var i = 0; i < laEntries.length; i++) {
          var csvr = path.join(laBase, laEntries[i], 'office6', 'wpscloudsvr.exe');
          if (fs.existsSync(csvr)) {
            if (!versions[laEntries[i]]) {
              versions[laEntries[i]] = {
                version: laEntries[i],
                installDir: path.join(laBase, laEntries[i]),
                cloudsvrPath: csvr,
              };
            } else {
              if (!versions[laEntries[i]].installDir)
                versions[laEntries[i]].installDir = path.join(laBase, laEntries[i]);
              if (!versions[laEntries[i]].cloudsvrPath) versions[laEntries[i]].cloudsvrPath = csvr;
            }
          }
        }
      } catch (e) {
        /* ignore */
      }
    }
  }

  return Object.keys(versions)
    .sort()
    .map(function (k) {
      return versions[k];
    });
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
    '    <jsplugin name="' +
    ADDON_NAME_ASCII +
    '" type="' +
    (wpsjsConfig.type || 'wps') +
    '" ' +
    'url="' +
    PACKAGE_DIR_ASCII +
    '" version="' +
    VERSION +
    '" ' +
    'enable="enable_dev" install="null" customDomain=""/>\n' +
    '</jsplugins>\n'
  );
}

function generateInstallBat() {
  return (
    '@echo off\n' +
    'rem ============================================================\n' +
    'rem  This bat file is saved in GBK encoding (matches Windows zh-CN\n' +
    'rem  default codepage 936). With GBK encoding, cmd.exe correctly\n' +
    'rem  decodes the Chinese dir name "kaiwu_1.0.0" used in the legacy\n' +
    'rem  detection below, and the if exist check matches the actual\n' +
    'rem  UTF-16 directory name on disk.\n' +
    'rem ============================================================\n' +
    'setlocal EnableExtensions EnableDelayedExpansion\n' +
    'title Kaiwu WPS Addon - Installer\n' +
    'echo.\n' +
    'echo  ============================================\n' +
    'echo    Kaiwu WPS Addon - Installer\n' +
    'echo    Version: ' +
    VERSION +
    '\n' +
    'echo  ============================================\n' +
    'echo.\n' +
    '\n' +
    'set "SRC_DIR=%~dp0' +
    PACKAGE_DIR_ASCII +
    '"\n' +
    'set "DEST_DIR=%APPDATA%\\kingsoft\\wps\\jsaddons"\n' +
    'set "PLUGIN_DIR=%DEST_DIR%\\' +
    PACKAGE_DIR_ASCII +
    '"\n' +
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
    'rem ============================================================\n' +
    'rem  [0/4] Detect existing Kaiwu installation; uninstall old.\n' +
    'rem  - kaiwu_<v>:  current naming scheme (ASCII prefix), via for /d glob.\n' +
    'rem  - kaiwu_<v>:  legacy scheme (开悟 prefix), via direct if exist\n' +
    'rem            (only known version: 开悟_1.0.0).\n' +
    'rem  - kaiwu_<v>:  same-version check (will be xcopy-overwritten).\n' +
    'rem ============================================================\n' +
    'echo  [0/4] Checking for existing Kaiwu installation ...\n' +
    'set "FOUND_OLD=0"\n' +
    'if not exist "%DEST_DIR%" (\n' +
    '    echo         [INFO] No previous install detected.\n' +
    '    goto :install_step_1\n' +
    ')\n' +
    '\n' +
    'rem --- Check current-scheme installs (kaiwu_<v>) ---\n' +
    'for /d %%D in ("%DEST_DIR%\\kaiwu_*") do (\n' +
    '    if /i not "%%~nxD"=="' +
    PACKAGE_DIR_ASCII +
    '" (\n' +
    '        echo         [FOUND] Old Kaiwu install: %%~nxD\n' +
    '        echo                Removing: %%D\n' +
    '        rmdir /S /Q "%%D"\n' +
    '        set "FOUND_OLD=1"\n' +
    '    )\n' +
    ')\n' +
    '\n' +
    'rem --- Check legacy Chinese-prefixed install (kaiwu_1.0.0) ---\n' +
    'rem With chcp 65001 active, the literal kaiwu_1.0.0 in this file is correctly\n' +
    'rem decoded by cmd, and the OS-level existence check works against the\n' +
    'rem UTF-16 directory name. We do not enumerate all "kaiwu_*" versions\n' +
    'rem via for /d here, because cmd glob expansion is fragile with Chinese\n' +
    'rem patterns even under UTF-8 codepage (depends on filesystem driver).\n' +
    'if exist "%DEST_DIR%\\开悟_1.0.0" (\n' +
    '    echo         [FOUND] Legacy Kaiwu install: 开悟_1.0.0\n' +
    '    echo                Removing: %DEST_DIR%\\开悟_1.0.0\n' +
    '    rmdir /S /Q "%DEST_DIR%\\开悟_1.0.0"\n' +
    '    set "FOUND_OLD=1"\n' +
    ')\n' +
    '\n' +
    'rem --- Check same-version install (will be xcopy-overwritten) ---\n' +
    'if exist "%PLUGIN_DIR%" (\n' +
    '    echo         [FOUND] Same version: ' +
    PACKAGE_DIR_ASCII +
    '\n' +
    '    echo                Will be overwritten by xcopy.\n' +
    '    set "FOUND_OLD=1"\n' +
    ')\n' +
    '\n' +
    'if "!FOUND_OLD!"=="1" (\n' +
    '    echo         [OK] Old installations cleared.\n' +
    ') else (\n' +
    '    echo         [INFO] No previous install detected.\n' +
    ')\n' +
    'echo.\n' +
    '\n' +
    ':install_step_1\n' +
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
  var lines = [];
  lines.push('@echo off');
  lines.push('setlocal EnableExtensions EnableDelayedExpansion');
  lines.push('title Kaiwu WPS Addon - Verify');
  lines.push('echo.');
  lines.push('echo  ============================================');
  lines.push('echo    Kaiwu WPS Addon - Installation Check');
  lines.push('echo  ============================================');
  lines.push('echo.');
  lines.push('');
  lines.push('set "DEST_DIR=%APPDATA%\\kingsoft\\wps\\jsaddons"');
  lines.push('set "PLUGIN_DIR=%DEST_DIR%\\' + PACKAGE_DIR_ASCII + '"');
  lines.push('');
  lines.push('echo  Checking installation ...');
  lines.push('echo.');
  lines.push('');
  lines.push('set ERRORS=0');
  lines.push('');
  lines.push('if exist "%DEST_DIR%" (');
  lines.push('    echo  [OK]     jsaddons folder exists: %DEST_DIR%');
  lines.push(') else (');
  lines.push('    echo  [ERROR]  jsaddons folder missing: %DEST_DIR%');
  lines.push('    set ERRORS=1');
  lines.push(')');
  lines.push('');
  lines.push('if exist "%DEST_DIR%\\publish.xml" (');
  lines.push('    echo  [OK]     publish.xml exists');
  lines.push('    echo            Contents:');
  lines.push('    type "%DEST_DIR%\\publish.xml" | findstr /R /C:"jsplugin"');
  lines.push(') else (');
  lines.push('    echo  [ERROR]  publish.xml missing');
  lines.push('    set ERRORS=1');
  lines.push(')');
  lines.push('');
  lines.push('if exist "%PLUGIN_DIR%" (');
  lines.push('    echo  [OK]     Plugin folder exists: ' + PACKAGE_DIR_ASCII);
  lines.push(') else (');
  lines.push('    echo  [ERROR]  Plugin folder missing: ' + PACKAGE_DIR_ASCII);
  lines.push('    set ERRORS=1');
  lines.push(')');
  lines.push('');
  lines.push('if exist "%PLUGIN_DIR%\\ribbon.xml" (');
  lines.push('    echo  [OK]     ribbon.xml exists');
  lines.push(') else (');
  lines.push('    echo  [ERROR]  ribbon.xml missing - install did not complete');
  lines.push('    set ERRORS=1');
  lines.push(')');
  lines.push('');
  lines.push('if exist "%PLUGIN_DIR%\\index.html" (');
  lines.push('    echo  [OK]     index.html exists');
  lines.push(') else (');
  lines.push('    echo  [ERROR]  index.html missing');
  lines.push('    set ERRORS=1');
  lines.push(')');
  lines.push('');
  lines.push('if exist "%PLUGIN_DIR%\\taskpane\\index.html" (');
  lines.push('    echo  [OK]     taskpane/index.html exists');
  lines.push(') else (');
  lines.push('    echo  [ERROR]  taskpane/index.html missing');
  lines.push('    set ERRORS=1');
  lines.push(')');
  lines.push('');
  lines.push('if exist "%DEST_DIR%\\authaddin.json" (');
  lines.push('    echo  [WARN]   authaddin.json still exists (WPS may use cached path)');
  lines.push('    echo            Run install.bat to clear it.');
  lines.push('    set ERRORS=1');
  lines.push(') else (');
  lines.push('    echo  [OK]     authaddin.json not present (WPS will rebuild on next start)');
  lines.push(')');
  lines.push('');
  lines.push('echo.');
  lines.push('echo  --- WPS native AI / Daoke status ---');
  lines.push('echo.');
  lines.push('');
  lines.push('rem -- Check if Kaiwu wants AI disabled --');
  lines.push('set "AI_DISABLED=0"');
  lines.push('set "LAYER_ERRORS=0"');
  lines.push('');
  lines.push('rem -- HKCU registry (legacy path) --');
  lines.push(
    'reg query "HKCU\\Software\\Kingsoft\\Office\\6.0\\plugins" /v EnableAI 2>nul | findstr /C:"0x0" >nul 2>nul'
  );
  lines.push('if !ERRORLEVEL! EQU 0 (');
  lines.push('    echo  [OK]     Legacy EnableAI=0 (AI disabled)');
  lines.push('    set "AI_DISABLED=1"');
  lines.push(') else (');
  lines.push('    echo  [INFO]   Legacy EnableAI not set to 0 (AI may be enabled)');
  lines.push(')');
  lines.push('');
  lines.push('rem -- Per-version registry check (new path) --');
  lines.push(
    'for /f "tokens=*" %%R in (' +
      '\'reg query "HKCU\\\\Software\\\\Kingsoft\\\\WPS Office" 2^>nul\'' +
      ') do ('
  );
  lines.push('    set "REG_LINE=%%R"');
  lines.push('    set "VER=!REG_LINE:HKEY_CURRENT_USER\\Software\\Kingsoft\\WPS Office\\=!"');
  lines.push('    if not "!VER!"=="!REG_LINE!" (');
  lines.push('        echo %%R | findstr /R "[0-9][0-9]" >nul');
  lines.push('        if !ERRORLEVEL! EQU 0 (');
  lines.push(
    '            reg query "HKCU\\Software\\Kingsoft\\WPS Office\\!VER!\\CloudService" /v EnableAI 2>nul | findstr /C:"0x0" >nul 2>nul'
  );
  lines.push('            if !ERRORLEVEL! EQU 0 (');
  lines.push('                echo  [OK]     !VER! EnableAI=0 (AI disabled)');
  lines.push('                set "AI_DISABLED=1"');
  lines.push('            ) else (');
  lines.push('                echo  [INFO]   !VER! EnableAI is not 0 (AI may be enabled)');
  lines.push('            )');
  lines.push('        )');
  lines.push('    )');
  lines.push(')');
  lines.push('');
  lines.push('rem -- Service status --');
  lines.push('sc query wpscloudsvr 2>nul | findstr /C:"DISABLED" >nul 2>nul');
  lines.push('if !ERRORLEVEL! EQU 0 (');
  lines.push('    sc query wpscloudsvr 2>nul | findstr /C:"STOPPED" >nul 2>nul');
  lines.push('    if !ERRORLEVEL! EQU 0 (');
  lines.push('        echo  [OK]     wpscloudsvr service is DISABLED + STOPPED');
  lines.push('    ) else (');
  lines.push('        echo  [WARN]   wpscloudsvr service is DISABLED but not STOPPED');
  lines.push('    )');
  lines.push(') else (');
  lines.push('    sc query wpscloudsvr >nul 2>nul');
  lines.push('    if !ERRORLEVEL! EQU 0 (');
  lines.push('        echo  [INFO]   wpscloudsvr service is not disabled (AI may be enabled)');
  lines.push('    ) else (');
  lines.push('        echo  [INFO]   wpscloudsvr service not found');
  lines.push('    )');
  lines.push(')');
  lines.push('');
  lines.push('rem -- File placeholder status (AI files) --');
  lines.push('echo.');
  lines.push('echo  --- File status ---');
  lines.push('echo.');
  lines.push('set "HAS_PLACEHOLDERS=0"');
  lines.push('for /d %%V in ("%LOCALAPPDATA%\\kingsoft\\WPS Office\\*") do (');
  lines.push('    for /d %%D in ("%%V\\office6") do (');
  lines.push('        call :check_placeholder "%%~fD\\wpscloudlaunch.exe"');
  lines.push('        call :check_placeholder "%%~fD\\kaipredict.dll"');
  lines.push('        call :check_placeholder "%%~fD\\wpscloudsvrimp.dll"');
  lines.push('        call :check_placeholder "%%~fD\\kdocerjsapi.dll"');
  lines.push('        call :check_placeholder "%%~fD\\kdocerjsapilite.dll"');
  lines.push('    )');
  lines.push(')');
  lines.push('for /d %%V in ("%ProgramFiles%\\Kingsoft\\WPS Office\\*") do (');
  lines.push('    for /d %%D in ("%%V\\office6") do (');
  lines.push('        call :check_placeholder "%%~fD\\wpscloudlaunch.exe"');
  lines.push('        call :check_placeholder "%%~fD\\kaipredict.dll"');
  lines.push('        call :check_placeholder "%%~fD\\wpscloudsvrimp.dll"');
  lines.push('        call :check_placeholder "%%~fD\\kdocerjsapi.dll"');
  lines.push('        call :check_placeholder "%%~fD\\kdocerjsapilite.dll"');
  lines.push('    )');
  lines.push(')');
  lines.push('if "!HAS_PLACEHOLDERS!"=="0" (');
  lines.push('    echo  [INFO]   No AI file placeholders found');
  lines.push(')');
  lines.push('');
  lines.push('rem -- Process check --');
  lines.push('echo.');
  lines.push('echo  --- Process status ---');
  lines.push('echo.');
  lines.push('tasklist 2>nul | findstr /I "wpscloudlaunch" >nul 2>nul');
  lines.push('if !ERRORLEVEL! EQU 0 (');
  lines.push('    echo  [INFO]   wpscloudlaunch.exe is running (AI may be active)');
  lines.push(') else (');
  lines.push('    echo  [OK]     wpscloudlaunch.exe is not running');
  lines.push(')');
  lines.push('tasklist 2>nul | findstr /I "wpscloudsvr" >nul 2>nul');
  lines.push('if !ERRORLEVEL! EQU 0 (');
  lines.push('    echo  [INFO]   wpscloudsvr.exe is running (service may be active)');
  lines.push(') else (');
  lines.push('    echo  [OK]     wpscloudsvr.exe is not running');
  lines.push(')');
  lines.push('');
  lines.push('rem -- Summary --');
  lines.push('echo.');
  lines.push('echo  ============================================');
  lines.push('if "!AI_DISABLED!"=="1" (');
  lines.push('    echo    Status: WPS native AI appears to be DISABLED');
  lines.push('    echo    If WPS still shows AI, try:');
  lines.push('    echo      1. Fully exit WPS (Task Manager -^> kill wps.exe)');
  lines.push('    echo      2. Run disable-wps-native-ai.bat again');
  lines.push('    echo      3. Reopen WPS');
  lines.push(') else (');
  lines.push('    echo    Status: WPS native AI appears to be ENABLED');
  lines.push('    echo    To disable, run: disable-wps-native-ai.bat');
  lines.push(')');
  lines.push('echo  ============================================');
  lines.push('echo.');
  lines.push('pause');
  lines.push('exit /b 0');
  lines.push('');
  lines.push(':check_placeholder');
  lines.push('set "CHK_PATH=%~1"');
  lines.push('if not exist "%CHK_PATH%" goto :eof');
  lines.push('for %%F in ("%CHK_PATH%") do (');
  lines.push('    if %%~zF EQU 0 (');
  lines.push('        echo  [OK]     %CHK_PATH% is 0-byte placeholder (AI disabled)');
  lines.push('        set "HAS_PLACEHOLDERS=1"');
  lines.push('    ) else (');
  lines.push('        echo  [INFO]   %CHK_PATH% is %%~zF bytes (original file)');
  lines.push('    )');
  lines.push(')');
  lines.push('goto :eof');
  return lines.join('\n');
}

function generateUninstallBat() {
  return (
    '@echo off\n' +
    'rem  Saved in GBK encoding (see install.bat for rationale).\n' +
    'setlocal EnableExtensions EnableDelayedExpansion\n' +
    'title Kaiwu WPS Addon - Uninstaller\n' +
    'echo.\n' +
    'echo  ============================================\n' +
    'echo    Kaiwu WPS Addon - Uninstaller\n' +
    'echo  ============================================\n' +
    'echo.\n' +
    '\n' +
    'set "DEST_DIR=%APPDATA%\\kingsoft\\wps\\jsaddons"\n' +
    'set "PLUGIN_DIR=%DEST_DIR%\\' +
    PACKAGE_DIR_ASCII +
    '"\n' +
    '\n' +
    'echo  Will scan for: %DEST_DIR%\\kaiwu_*  and  %DEST_DIR%\\开悟_*\n' +
    'echo.\n' +
    'set /p CONFIRM=Confirm uninstall? (Y/N): \n' +
    'if /i not "%CONFIRM%"=="Y" (\n' +
    '    echo  Cancelled.\n' +
    '    pause\n' +
    '    exit /b 0\n' +
    ')\n' +
    '\n' +
    'set "REMOVED=0"\n' +
    'if not exist "%DEST_DIR%" (\n' +
    '    echo  [INFO] Destination folder not found, nothing to do.\n' +
    '    goto :cache_clear\n' +
    ')\n' +
    'rem --- Scan current-scheme installs (kaiwu_<v>) ---\n' +
    'for /d %%D in ("%DEST_DIR%\\kaiwu_*") do (\n' +
    '    echo         [FOUND] %%~nxD  -  removing ...\n' +
    '    rmdir /S /Q "%%D"\n' +
    '    set "REMOVED=1"\n' +
    ')\n' +
    'rem --- Scan legacy Chinese-prefixed install (开悟_1.0.0) ---\n' +
    'rem Direct if exist (cmd glob with Chinese patterns is unreliable).\n' +
    'if exist "%DEST_DIR%\\开悟_1.0.0" (\n' +
    '    echo         [FOUND] 开悟_1.0.0  -  removing ...\n' +
    '    rmdir /S /Q "%DEST_DIR%\\开悟_1.0.0"\n' +
    '    set "REMOVED=1"\n' +
    ')\n' +
    'if "!REMOVED!"=="0" (\n' +
    '    echo         [INFO] No Kaiwu install found.\n' +
    ') else (\n' +
    '    echo         [OK] All Kaiwu directories removed.\n' +
    ')\n' +
    '\n' +
    ':cache_clear\n' +
    'if exist "%DEST_DIR%\\authaddin.json" (\n' +
    '    del /F /Q "%DEST_DIR%\\authaddin.json" >nul 2>nul\n' +
    '    echo  [OK] Cleared WPS plugin cache (authaddin.json)\n' +
    ')\n' +
    'if exist "%DEST_DIR%\\publish.xml" (\n' +
    '    findstr /I /C:"' +
    ADDON_NAME_ASCII +
    '" "%DEST_DIR%\\publish.xml" >nul 2>nul && (\n' +
    '        echo  [WARN] publish.xml still references Kaiwu; remove it manually if needed.\n' +
    '    )\n' +
    ')\n' +
    '\n' +
    'echo.\n' +
    'echo  IMPORTANT: Fully exit WPS (close all docs, system tray)\n' +
    'echo  before reopening, otherwise the plugin may still appear.\n' +
    'echo.\n' +
    'pause\n'
  );
}

function generateDisableNativeAiBat() {
  var lines = [];
  lines.push('@echo off');
  lines.push('rem ============================================================');
  lines.push('rem  Disable WPS native AI / Daoke (Docer) - v4 SAFE');
  lines.push('rem  Multi-layer: registry + service + optional DLL placeholder');
  lines.push('rem  Added: user confirmation, version check, safe error handling');
  lines.push('rem ============================================================');
  lines.push('setlocal EnableExtensions EnableDelayedExpansion');
  lines.push('title Kaiwu WPS Addon - Disable WPS Native AI v4');
  lines.push('');
  lines.push('rem --- UAC self-elevation ---');
  lines.push('net session >nul 2>&1');
  lines.push('if %ERRORLEVEL% NEQ 0 (');
  lines.push('    echo  Requesting administrator privileges...');
  lines.push(
    '    powershell -Command "Start-Process cmd.exe -ArgumentList \'/c \\"%~f0\\"\' -Verb RunAs"'
  );
  lines.push('    exit /b');
  lines.push(')');
  lines.push('');
  lines.push('echo.');
  lines.push('echo  ============================================');
  lines.push('echo    Disable WPS Native AI / Daoke (v4 SAFE)');
  lines.push('echo  ============================================');
  lines.push('echo.');
  lines.push('');
  lines.push('rem ============================================================');
  lines.push('rem  STAGE 0: User confirmation');
  lines.push('rem ============================================================');
  lines.push('echo  WARNING: This script will disable WPS native AI features.');
  lines.push('echo.');
  lines.push('echo  Affected features:');
  lines.push('echo    - WPS AI assistant (cloud-based)');
  lines.push('echo    - Docer templates/plugins (if AI-dependent)');
  lines.push('echo    - Cloud sync service (wpscloudsvr)');
  lines.push('echo.');
  lines.push('echo  NOT affected:');
  lines.push('echo    - Basic WPS document editing');
  lines.push('echo    - Kaiwu addon AI features (your own API)');
  lines.push('echo    - Local document saving');
  lines.push('echo.');
  lines.push('set /p "CONFIRM=Do you want to continue? (Y/N): "');
  lines.push('if /i not "%CONFIRM%"=="Y" (');
  lines.push('    echo  Operation cancelled by user.');
  lines.push('    exit /b 0');
  lines.push(')');
  lines.push('echo.');
  lines.push('');
  lines.push('rem ============================================================');
  lines.push('rem  STAGE 1: Kill WPS processes (with warning)');
  lines.push('rem ============================================================');
  lines.push('echo  [Stage 1] Checking WPS processes...');
  lines.push('tasklist 2>nul | findstr /I "wps.exe" >nul 2>nul');
  lines.push('if !ERRORLEVEL! EQU 0 (');
  lines.push('    echo.');
  lines.push('    echo  WARNING: WPS is currently running!');
  lines.push('    echo  Please save your work before continuing.');
  lines.push('    echo.');
  lines.push('    set /p "KILL_WPS=Kill WPS processes? (Y/N): "');
  lines.push('    if /i not "!KILL_WPS!"=="Y" (');
  lines.push('        echo  Operation cancelled. Please close WPS manually first.');
  lines.push('        exit /b 0');
  lines.push('    )');
  lines.push('    echo  Terminating WPS processes...');
  lines.push('    taskkill /F /IM wps.exe /T >nul 2>nul');
  lines.push('    timeout /t 2 /nobreak >nul 2>nul');
  lines.push('    echo  [OK] WPS processes terminated');
  lines.push(') else (');
  lines.push('    echo  [OK] WPS is not running');
  lines.push(')');
  lines.push('echo.');
  lines.push('');
  lines.push('rem ============================================================');
  lines.push('rem  STAGE 2: Registry - MULTIPLE paths (legacy + new)');
  lines.push('rem ============================================================');
  lines.push('echo  [Stage 2] Writing registry disable flags...');
  lines.push('rem -- Legacy path (HKCU Office plugins) --');
  lines.push(
    'reg add "HKCU\\Software\\Kingsoft\\Office\\6.0\\plugins" /v CloudService /t REG_DWORD /d 0 /f >nul 2>nul'
  );
  lines.push(
    'reg add "HKCU\\Software\\Kingsoft\\Office\\6.0\\plugins" /v EnableAI /t REG_DWORD /d 0 /f >nul 2>nul'
  );
  lines.push(
    'reg add "HKCU\\Software\\Kingsoft\\Office\\6.0\\plugins" /v DocerEnabled /t REG_DWORD /d 0 /f >nul 2>nul'
  );
  lines.push('echo  [OK] HKCU\\Software\\Kingsoft\\Office\\6.0\\plugins written');
  lines.push('rem -- New path (per-version WPS Office) --');
  lines.push(
    'for /f "tokens=*" %%R in (' +
      '\'reg query "HKCU\\\\Software\\\\Kingsoft\\\\WPS Office" 2^>nul\'' +
      ') do ('
  );
  lines.push('    set "REG_LINE=%%R"');
  lines.push('    set "VER=!REG_LINE:HKEY_CURRENT_USER\\Software\\Kingsoft\\WPS Office\\=!"');
  lines.push('    if not "!VER!"=="!REG_LINE!" (');
  lines.push('        echo %%R | findstr /R "[0-9][0-9]" >nul');
  lines.push('        if !ERRORLEVEL! EQU 0 (');
  lines.push(
    '            reg add "HKCU\\Software\\Kingsoft\\WPS Office\\!VER!\\CloudService" /v EnableAI /t REG_DWORD /d 0 /f >nul 2>nul'
  );
  lines.push(
    '            reg add "HKCU\\Software\\Kingsoft\\WPS Office\\!VER!\\CloudService" /v AutoStart /t REG_DWORD /d 0 /f >nul 2>nul'
  );
  lines.push('            echo  [OK] WPS Office \\!VER! written');
  lines.push('        )');
  lines.push('    )');
  lines.push(')');
  lines.push('echo.');
  lines.push('');
  lines.push('rem ============================================================');
  lines.push('rem  STAGE 3: Service - disable wpscloudsvr');
  lines.push('rem ============================================================');
  lines.push('echo  [Stage 3] Disabling wpscloudsvr service...');
  lines.push('sc query wpscloudsvr >nul 2>nul');
  lines.push('if !ERRORLEVEL! EQU 0 (');
  lines.push('    sc stop wpscloudsvr >nul 2>nul');
  lines.push('    sc config wpscloudsvr start=disabled >nul 2>nul');
  lines.push('    if !ERRORLEVEL! EQU 0 (');
  lines.push('        echo  [OK] wpscloudsvr service disabled');
  lines.push('    ) else (');
  lines.push('        echo  [WARN] wpscloudsvr service config failed');
  lines.push('    )');
  lines.push(') else (');
  lines.push('    echo  [INFO] wpscloudsvr service not found (skipping)');
  lines.push(')');
  lines.push('echo.');
  lines.push('');
  lines.push('rem ============================================================');
  lines.push('rem  STAGE 4: DLL placeholder (OPTIONAL - with user consent)');
  lines.push('rem ============================================================');
  lines.push('echo  [Stage 4] Optional: Replace AI DLL files with placeholders.');
  lines.push('echo.');
  lines.push('echo  This step replaces WPS AI files with empty files.');
  lines.push('echo  This is more aggressive but ensures AI cannot be re-enabled.');
  lines.push('echo  Files can be restored using enable-wps-native-ai.bat.');
  lines.push('echo.');
  lines.push('set /p "DO_PLACEHOLDER=Replace AI DLL files? (Y/N): "');
  lines.push('if /i not "%DO_PLACEHOLDER%"=="Y" (');
  lines.push('    echo  [SKIP] DLL placeholder step skipped');
  lines.push('    echo  Note: Registry + Service changes are still active');
  lines.push(') else (');
  lines.push('    set "FILES_PLACEHOLDERED=0"');
  lines.push('    set "FILES_FAILED=0"');
  lines.push('    rem -- Find office6 dir for all installed versions --');
  lines.push('    for /d %%V in ("%LOCALAPPDATA%\\kingsoft\\WPS Office\\*") do (');
  lines.push('        for /d %%D in ("%%V\\office6") do (');
  lines.push('            echo  Found: %%~fD');
  lines.push('            call :placeholder "%%~fD\\wpscloudlaunch.exe"');
  lines.push('            call :placeholder "%%~fD\\kaipredict.dll"');
  lines.push('            call :placeholder "%%~fD\\wpscloudsvrimp.dll"');
  lines.push('            call :placeholder "%%~fD\\kdocerjsapi.dll"');
  lines.push('            call :placeholder "%%~fD\\kdocerjsapilite.dll"');
  lines.push('        )');
  lines.push('    )');
  lines.push('    for /d %%V in ("%ProgramFiles%\\Kingsoft\\WPS Office\\*") do (');
  lines.push('        for /d %%D in ("%%V\\office6") do (');
  lines.push('            echo  Found: %%~fD');
  lines.push('            call :placeholder "%%~fD\\wpscloudlaunch.exe"');
  lines.push('            call :placeholder "%%~fD\\kaipredict.dll"');
  lines.push('            call :placeholder "%%~fD\\wpscloudsvrimp.dll"');
  lines.push('            call :placeholder "%%~fD\\kdocerjsapi.dll"');
  lines.push('            call :placeholder "%%~fD\\kdocerjsapilite.dll"');
  lines.push('        )');
  lines.push('    )');
  lines.push('    echo  [OK] Placeholdered !FILES_PLACEHOLDERED! file(s^), !FILES_FAILED! failed');
  lines.push(')');
  lines.push('echo.');
  lines.push('');
  lines.push('rem ============================================================');
  lines.push('rem  STAGE 5: Verify');
  lines.push('rem ============================================================');
  lines.push('echo  [Stage 5] Verifying...');
  lines.push('echo.');
  lines.push('rem -- Registry check --');
  lines.push(
    'reg query "HKCU\\Software\\Kingsoft\\Office\\6.0\\plugins" /v EnableAI 2>nul | findstr /C:"0x0" >nul 2>nul'
  );
  lines.push('if !ERRORLEVEL! EQU 0 (');
  lines.push('    echo  [OK] Legacy EnableAI=0');
  lines.push(') else (');
  lines.push('    echo  [INFO] Legacy EnableAI not set (may not exist)');
  lines.push(')');
  lines.push('rem -- Service check --');
  lines.push('sc query wpscloudsvr 2>nul | findstr /C:"DISABLED" >nul 2>nul');
  lines.push('if !ERRORLEVEL! EQU 0 (');
  lines.push('    echo  [OK] wpscloudsvr service is DISABLED');
  lines.push(') else (');
  lines.push('    sc query wpscloudsvr >nul 2>nul');
  lines.push('    if !ERRORLEVEL! EQU 0 (');
  lines.push('        echo  [WARN] wpscloudsvr service is not disabled');
  lines.push('    ) else (');
  lines.push('        echo  [INFO] wpscloudsvr service not found');
  lines.push('    )');
  lines.push(')');
  lines.push('echo.');
  lines.push('');
  lines.push('rem ============================================================');
  lines.push('rem  SUMMARY');
  lines.push('rem ============================================================');
  lines.push('echo  ============================================');
  lines.push('echo    Disable operation completed.');
  lines.push('echo.');
  lines.push('echo    Changes applied:');
  lines.push('      - Registry flags set to disable AI');
  lines.push('      - Cloud service disabled (if found)');
  lines.push('if /i "%DO_PLACEHOLDER%"=="Y" (');
  lines.push('echo      - AI DLL files replaced with placeholders');
  lines.push(')');
  lines.push('echo.');
  lines.push('echo    Restart WPS for changes to take effect.');
  lines.push('echo    Run enable-wps-native-ai.bat to restore.');
  lines.push('echo  ============================================');
  lines.push('echo.');
  lines.push('pause');
  lines.push('exit /b 0');
  lines.push('');
  lines.push('rem ============================================================');
  lines.push('rem  Subroutine: backup file and create 0-byte placeholder');
  lines.push('rem  With proper error handling');
  lines.push('rem ============================================================');
  lines.push(':placeholder');
  lines.push('set "TARGET=%~1"');
  lines.push('if not exist "%TARGET%" (');
  lines.push('    echo    [SKIP] Not found: %TARGET%');
  lines.push('    goto :eof');
  lines.push(')');
  lines.push('if exist "%TARGET%.kaiwu-backup" (');
  lines.push('    echo    [SKIP] Already placeholdered: %TARGET%');
  lines.push('    goto :eof');
  lines.push(')');
  lines.push('rem Backup first - abort if backup fails');
  lines.push('copy /Y "%TARGET%" "%TARGET%.kaiwu-backup" >nul 2>nul');
  lines.push('if !ERRORLEVEL! NEQ 0 (');
  lines.push('    echo    [ERROR] Backup failed: %TARGET%');
  lines.push('    echo    [ERROR] Skipping to prevent data loss');
  lines.push('    set /a FILES_FAILED+=1');
  lines.push('    goto :eof');
  lines.push(')');
  lines.push('rem Create placeholder (non-empty so WPS does not crash if it PE-loads the file)');
  lines.push('echo DISABLED_BY_KAIWU> "%TARGET%"');
  lines.push('if !ERRORLEVEL! EQU 0 (');
  lines.push('    echo    [OK] Placeholdered: %TARGET%');
  lines.push('    set /a FILES_PLACEHOLDERED+=1');
  lines.push(') else (');
  lines.push('    echo    [ERROR] Could not placeholder: %TARGET%');
  lines.push('    echo    [INFO] Restoring from backup...');
  lines.push('    move /Y "%TARGET%.kaiwu-backup" "%TARGET%" >nul 2>nul');
  lines.push('    set /a FILES_FAILED+=1');
  lines.push(')');
  lines.push('goto :eof');
  return lines.join('\n');
}

function generateEnableNativeAiBat() {
  var lines = [];
  lines.push('@echo off');
  lines.push('rem ============================================================');
  lines.push('rem  Enable WPS native AI / Daoke (Docer) - v4 SAFE');
  lines.push('rem  Restore registry + service + DLL files from backup');
  lines.push('rem  Added: user confirmation, improved error handling');
  lines.push('rem ============================================================');
  lines.push('setlocal EnableExtensions EnableDelayedExpansion');
  lines.push('title Kaiwu WPS Addon - Enable WPS Native AI v4');
  lines.push('');
  lines.push('rem --- UAC self-elevation ---');
  lines.push('net session >nul 2>&1');
  lines.push('if %ERRORLEVEL% NEQ 0 (');
  lines.push('    echo  Requesting administrator privileges...');
  lines.push(
    '    powershell -Command "Start-Process cmd.exe -ArgumentList \'/c \\"%~f0\\"\' -Verb RunAs"'
  );
  lines.push('    exit /b');
  lines.push(')');
  lines.push('');
  lines.push('echo.');
  lines.push('echo  ============================================');
  lines.push('echo    Enable WPS Native AI / Daoke (v4 SAFE)');
  lines.push('echo  ============================================');
  lines.push('echo.');
  lines.push('');
  lines.push('rem ============================================================');
  lines.push('rem  STAGE 0: User confirmation');
  lines.push('rem ============================================================');
  lines.push('echo  This script will restore WPS native AI features.');
  lines.push('echo.');
  lines.push('set /p "CONFIRM=Do you want to continue? (Y/N): "');
  lines.push('if /i not "%CONFIRM%"=="Y" (');
  lines.push('    echo  Operation cancelled by user.');
  lines.push('    exit /b 0');
  lines.push(')');
  lines.push('echo.');
  lines.push('');
  lines.push('rem ============================================================');
  lines.push('rem  STAGE 1: Kill WPS processes (with warning)');
  lines.push('rem ============================================================');
  lines.push('echo  [Stage 1] Checking WPS processes...');
  lines.push('tasklist 2>nul | findstr /I "wps.exe" >nul 2>nul');
  lines.push('if !ERRORLEVEL! EQU 0 (');
  lines.push('    echo.');
  lines.push('    echo  WARNING: WPS is currently running!');
  lines.push('    echo  Please save your work before continuing.');
  lines.push('    echo.');
  lines.push('    set /p "KILL_WPS=Kill WPS processes? (Y/N): "');
  lines.push('    if /i not "!KILL_WPS!"=="Y" (');
  lines.push('        echo  Operation cancelled. Please close WPS manually first.');
  lines.push('        exit /b 0');
  lines.push('    )');
  lines.push('    echo  Terminating WPS processes...');
  lines.push('    taskkill /F /IM wps.exe /T >nul 2>nul');
  lines.push('    timeout /t 2 /nobreak >nul 2>nul');
  lines.push('    echo  [OK] WPS processes terminated');
  lines.push(') else (');
  lines.push('    echo  [OK] WPS is not running');
  lines.push(')');
  lines.push('echo.');
  lines.push('');
  lines.push('rem ============================================================');
  lines.push('rem  STAGE 2: Restore Registry (set EnableAI=1 / AutoStart=1)');
  lines.push('rem ============================================================');
  lines.push('echo  [Stage 2] Restoring registry enable flags...');
  lines.push('rem -- Legacy path (HKCU Office plugins) --');
  lines.push(
    'reg add "HKCU\\Software\\Kingsoft\\Office\\6.0\\plugins" /v CloudService /t REG_DWORD /d 1 /f >nul 2>nul'
  );
  lines.push(
    'reg add "HKCU\\Software\\Kingsoft\\Office\\6.0\\plugins" /v EnableAI /t REG_DWORD /d 1 /f >nul 2>nul'
  );
  lines.push(
    'reg add "HKCU\\Software\\Kingsoft\\Office\\6.0\\plugins" /v DocerEnabled /t REG_DWORD /d 1 /f >nul 2>nul'
  );
  lines.push('echo  [OK] HKCU\\Software\\Kingsoft\\Office\\6.0\\plugins restored');
  lines.push('rem -- New path (per-version) --');
  lines.push(
    'for /f "tokens=*" %%R in (' +
      '\'reg query "HKCU\\\\Software\\\\Kingsoft\\\\WPS Office" 2^>nul\'' +
      ') do ('
  );
  lines.push('    set "REG_LINE=%%R"');
  lines.push('    set "VER=!REG_LINE:HKEY_CURRENT_USER\\Software\\Kingsoft\\WPS Office\\=!"');
  lines.push('    if not "!VER!"=="!REG_LINE!" (');
  lines.push('        echo %%R | findstr /R "[0-9][0-9]" >nul');
  lines.push('        if !ERRORLEVEL! EQU 0 (');
  lines.push(
    '            reg add "HKCU\\Software\\Kingsoft\\WPS Office\\!VER!\\CloudService" /v EnableAI /t REG_DWORD /d 1 /f >nul 2>nul'
  );
  lines.push(
    '            reg add "HKCU\\Software\\Kingsoft\\WPS Office\\!VER!\\CloudService" /v AutoStart /t REG_DWORD /d 1 /f >nul 2>nul'
  );
  lines.push('            echo  [OK] WPS Office \\!VER! restored');
  lines.push('        )');
  lines.push('    )');
  lines.push(')');
  lines.push('echo.');
  lines.push('');
  lines.push('rem ============================================================');
  lines.push('rem  STAGE 3: Restore Service (wpscloudsvr)');
  lines.push('rem ============================================================');
  lines.push('echo  [Stage 3] Restoring wpscloudsvr service...');
  lines.push('sc query wpscloudsvr >nul 2>nul');
  lines.push('if !ERRORLEVEL! EQU 0 (');
  lines.push('    sc config wpscloudsvr start=auto >nul 2>nul');
  lines.push('    if !ERRORLEVEL! EQU 0 (');
  lines.push('        echo  [OK] wpscloudsvr service set to auto');
  lines.push('    ) else (');
  lines.push('        echo  [WARN] wpscloudsvr service config failed');
  lines.push('    )');
  lines.push('    sc start wpscloudsvr >nul 2>nul');
  lines.push('    if !ERRORLEVEL! EQU 0 (');
  lines.push('        echo  [OK] wpscloudsvr service started');
  lines.push('    ) else (');
  lines.push('        echo  [INFO] wpscloudsvr start failed or already running');
  lines.push('    )');
  lines.push(') else (');
  lines.push('    echo  [INFO] wpscloudsvr service not found');
  lines.push(')');
  lines.push('echo.');
  lines.push('');
  lines.push('rem ============================================================');
  lines.push('rem  STAGE 4: Restore AI files from .kaiwu-backup');
  lines.push('rem ============================================================');
  lines.push('echo  [Stage 4] Restoring AI files from .kaiwu-backup...');
  lines.push('set "FILES_RESTORED=0"');
  lines.push('set "FILES_MISSING=0"');
  lines.push('set "FILES_FAILED=0"');
  lines.push('for /d %%V in ("%LOCALAPPDATA%\\kingsoft\\WPS Office\\*") do (');
  lines.push('    for /d %%D in ("%%V\\office6") do (');
  lines.push('        echo  Scanning: %%~fD');
  lines.push('        call :restore "%%~fD\\wpscloudlaunch.exe"');
  lines.push('        call :restore "%%~fD\\kaipredict.dll"');
  lines.push('        call :restore "%%~fD\\wpscloudsvrimp.dll"');
  lines.push('        call :restore "%%~fD\\kdocerjsapi.dll"');
  lines.push('        call :restore "%%~fD\\kdocerjsapilite.dll"');
  lines.push('    )');
  lines.push(')');
  lines.push('for /d %%V in ("%ProgramFiles%\\Kingsoft\\WPS Office\\*") do (');
  lines.push('    for /d %%D in ("%%V\\office6") do (');
  lines.push('        echo  Scanning: %%~fD');
  lines.push('        call :restore "%%~fD\\wpscloudlaunch.exe"');
  lines.push('        call :restore "%%~fD\\kaipredict.dll"');
  lines.push('        call :restore "%%~fD\\wpscloudsvrimp.dll"');
  lines.push('        call :restore "%%~fD\\kdocerjsapi.dll"');
  lines.push('        call :restore "%%~fD\\kdocerjsapilite.dll"');
  lines.push('    )');
  lines.push(')');
  lines.push(
    'echo  [OK] Restored !FILES_RESTORED! file^(s^), !FILES_MISSING! missing, !FILES_FAILED! failed'
  );
  lines.push('echo.');
  lines.push('');
  lines.push('rem ============================================================');
  lines.push('rem  SUMMARY');
  lines.push('rem ============================================================');
  lines.push('echo  ============================================');
  lines.push('echo    Enable operation completed.');
  lines.push('echo.');
  lines.push('echo    Changes applied:');
  lines.push('echo      - Registry flags set to enable AI');
  lines.push('echo      - Cloud service enabled (if found)');
  lines.push('echo      - AI files restored from backup (if available)');
  lines.push('echo.');
  lines.push('echo    Restart WPS for changes to take effect.');
  lines.push('echo  ============================================');
  lines.push('echo.');
  lines.push('pause');
  lines.push('exit /b 0');
  lines.push('');
  lines.push('rem ============================================================');
  lines.push('rem  Subroutine: restore file from .kaiwu-backup');
  lines.push('rem  With proper error handling');
  lines.push('rem ============================================================');
  lines.push(':restore');
  lines.push('set "TARGET=%~1"');
  lines.push('if not exist "%TARGET%.kaiwu-backup" (');
  lines.push('    set /a FILES_MISSING+=1');
  lines.push('    goto :eof');
  lines.push(')');
  lines.push('rem Try to restore');
  lines.push('move /Y "%TARGET%.kaiwu-backup" "%TARGET%" >nul 2>nul');
  lines.push('if !ERRORLEVEL! EQU 0 (');
  lines.push('    echo    [OK] Restored: %TARGET%');
  lines.push('    set /a FILES_RESTORED+=1');
  lines.push(') else (');
  lines.push('    echo    [ERROR] Restore failed: %TARGET%');
  lines.push('    set /a FILES_FAILED+=1');
  lines.push(')');
  lines.push('goto :eof');
  return lines.join('\n');
}

function generateReadme(envVars) {
  return (
    '# 开悟 — WPS AI 写作助手\n' +
    '\n' +
    '<div align="center">\n' +
    '\n' +
    '**版本: ' +
    VERSION +
    '**\n' +
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
    '- **方法一**: 编辑 `' +
    PACKAGE_DIR_ASCII +
    '\\.env`, 填入新的 `VITE_DEFAULT_API_KEY` 等, 然后重启 WPS\n' +
    '- **方法二**: 在 WPS 侧边栏点击 ⚙️ 设置, 实时修改并保存 (推荐, 无需重启)\n' +
    '\n' +
    '当前默认配置:\n' +
    '\n' +
    '```\n' +
    'VITE_DEFAULT_API_BASE = ' +
    (envVars.VITE_DEFAULT_API_BASE || '(未设置)') +
    '\n' +
    'VITE_DEFAULT_MODEL    = ' +
    (envVars.VITE_DEFAULT_MODEL || '(未设置)') +
    '\n' +
    'VITE_DEFAULT_API_KEY  = ' +
    (envVars.VITE_DEFAULT_API_KEY
      ? envVars.VITE_DEFAULT_API_KEY.substring(0, 8) + '...'
      : '(未设置)') +
    '\n' +
    '```\n' +
    '\n' +
    '## 目录结构\n' +
    '\n' +
    '```\n' +
    'kaiwu_' +
    VERSION +
    '/\n' +
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
    '## 原生 WPS AI / 稻壳 独立管理 (v2 多版本 3 层防御)\n' +
    '\n' +
    '本包附带 v2 升级版脚本, 对每个检测到的 WPS 版本执行 **3 层防御**:\n' +
    '\n' +
    '1. **注册表层 (HKCU)**: `CloudService\\EnableAI=0` + `AutoStart=0`, 阻止 AI 功能加载\n' +
    '2. **服务层**: `sc stop` + `sc config start=disabled` 禁用 WPS Cloud Service\n' +
    '3. **文件占位层**: 将 `wpscloudsvr.exe` 替换为 0 字节占位文件, 破坏 LoadLibraryExW 注入\n' +
    '\n' +
    '| 脚本 | 作用 |\n' +
    '|------|------|\n' +
    '| `disable-wps-native-ai.bat` | 禁用 WPS AI 助手 (需管理员权限, 自动 UAC 提权) |\n' +
    '| `enable-wps-native-ai.bat` | 恢复 WPS AI 助手 (从 .kaiwu-backup 还原) |\n' +
    '| `verify.bat` | 安装验证 (含 3 层状态检查) |\n' +
    '\n' +
    '**使用场景**:\n' +
    '- 双击 `disable-wps-native-ai.bat` 禁用 (支持 WPS 11.x/12.x 多版本并存)\n' +
    '- 运行后需要**重启 WPS** 才能生效\n' +
    '- 再次运行 `enable-wps-native-ai.bat` 即可完全恢复\n' +
    '\n' +
    '## 安装位置\n' +
    '\n' +
    '插件文件被复制到:\n' +
    '\n' +
    '```\n' +
    '%APPDATA%\\kingsoft\\wps\\jsaddons\\' +
    PACKAGE_DIR_ASCII +
    '\\\n' +
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
    '打包于 ' +
    new Date().toISOString().slice(0, 19).replace('T', ' ') +
    '\n' +
    '</div>\n'
  );
}

function build() {
  console.log('[package] 读取 .env 配置...');
  const envVars = readEnvOrFail();
  console.log('        API:  ' + (envVars.VITE_DEFAULT_API_BASE || '(未设置)'));
  console.log('        Model:' + (envVars.VITE_DEFAULT_MODEL || '(未设置)'));
  console.log('        Key:  ' + envVars.VITE_DEFAULT_API_KEY.substring(0, 8) + '...');

  console.log('[package] 预检: WPS 现有安装 (信息性)...');
  printExistingInstalls();

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

  // 安全修复: 不要把真实 .env 复制到发布包中 (会泄露 API Key)
  // 改为生成 .env.example 作为模板
  const envExamplePath = path.join(stagingDir, '.env.example');
  const templatePath = path.join(ROOT, '.env.template');
  if (fs.existsSync(templatePath)) {
    fs.copyFileSync(templatePath, envExamplePath);
  } else {
    fs.writeFileSync(
      envExamplePath,
      '# 开悟 WPS 加载项 — API 默认配置\n' +
        '# 复制此文件为 .env 并填入真实的 API Key\n' +
        '\n' +
        'VITE_DEFAULT_API_KEY=sk-PLEASE_REPLACE_WITH_YOUR_API_KEY\n' +
        'VITE_DEFAULT_API_BASE=https://api.minimaxi.com/v1\n' +
        'VITE_DEFAULT_MODEL=MiniMax-M3\n',
      'utf8'
    );
  }

  console.log('[package] 生成 publish.xml...');
  fs.writeFileSync(path.join(PUBLISH_DIR, 'publish.xml'), generatePublishXml(), 'utf8');

  console.log('[package] 生成 install.bat / uninstall.bat / verify.bat...');
  // CRITICAL: bat 文件必须满足两个 Windows 兼容性要求:
  //  1. CRLF 换行 (LF-only 会让多行 for /d 循环解析错乱)
  //  2. UTF-8 with BOM 编码 (兼容中文/英文 Windows, 自动识别)
  //     UTF-8 BOM 让 Windows 正确识别文件编码, 避免乱码
  //     备用: GBK (仅在 UTF-8 BOM 写入失败时 fallback)
  writeBatFile(path.join(PUBLISH_DIR, 'install.bat'), toCRLF(generateInstallBat()));
  writeBatFile(path.join(PUBLISH_DIR, 'uninstall.bat'), toCRLF(generateUninstallBat()));
  writeBatFile(path.join(PUBLISH_DIR, 'verify.bat'), toCRLF(generateVerifyBat()));
  writeBatFile(
    path.join(PUBLISH_DIR, 'disable-wps-native-ai.bat'),
    toCRLF(generateDisableNativeAiBat())
  );
  writeBatFile(
    path.join(PUBLISH_DIR, 'enable-wps-native-ai.bat'),
    toCRLF(generateEnableNativeAiBat())
  );

  console.log('[package] 生成 README 安装说明...');
  fs.writeFileSync(path.join(PUBLISH_DIR, 'README-安装说明.md'), generateReadme(envVars), 'utf8');

  // 统计
  const stats = collectStats(stagingDir);
  console.log(
    '[package] 完成. 包含: ' +
      stats.files +
      ' 个文件, ' +
      stats.dirs +
      ' 个目录, ' +
      (stats.size / 1024).toFixed(1) +
      ' KB'
  );
  console.log('        路径: ' + stagingDir);
  return { stagingDir, envVars };
}

function collectStats(dir) {
  let files = 0,
    dirs = 0,
    size = 0;
  function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        dirs++;
        walk(p);
      } else {
        files++;
        size += fs.statSync(p).size;
      }
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
      path.join(PUBLISH_DIR, 'verify.bat'),
      path.join(PUBLISH_DIR, 'disable-wps-native-ai.bat'),
      path.join(PUBLISH_DIR, 'enable-wps-native-ai.bat'),
      path.join(PUBLISH_DIR, 'publish.xml'),
      path.join(PUBLISH_DIR, 'README-安装说明.md'),
      stagingDir,
    ];
    console.log('[package] 打包 7z: ' + output);
    const stream = _7z.add(output, inputs, {
      recursive: false,
      $bin: _7zBin.path7za,
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
      'Title="Kaiwu WPS Addon - Installer v' +
      VERSION +
      '"\n' +
      'BeginPrompt="About to install Kaiwu WPS Addon v' +
      VERSION +
      '. Continue?"\n' +
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

module.exports = {
  detectInstalledWpsVersions,
  generateDisableNativeAiBat,
  generateEnableNativeAiBat,
  generateVerifyBat,
  generateInstallBat,
  generateUninstallBat,
  generateReadme,
  generatePublishXml,
};

if (require.main === module) {
  main();
}
