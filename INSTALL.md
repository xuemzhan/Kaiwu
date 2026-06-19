# 开悟 WPS 加载项 — 打包与安装 SOP

> 一份从"开发机器"到"新电脑 WPS 上跑起来"的完整流程文档

---

## 0. 制品清单

`npm run build` 完成后，`wps-addon-publish/` 目录会得到以下产物：

| 文件 | 大小 | 用途 |
|------|------|------|
| `开悟_1.0.0.7z` | ~850 KB | **7z 压缩包**：适合 IT 批量分发、网盘/U 盘传递 |
| `开悟_1.0.0_安装程序.exe` | ~980 KB | **自解压 EXE**：适合普通用户双击安装 |
| `开悟_1.0.0/` | ~3.7 MB | 解包后的源码目录（已被 install.bat 使用） |
| `install.bat` | 1.3 KB | 中文一键安装脚本（带管理员权限提示） |
| `uninstall.bat` | 0.8 KB | 中文一键卸载脚本 |
| `publish.xml` | 0.2 KB | WPS 插件清单（被 install.bat 写入指定目录） |
| `README-安装说明.md` | 3 KB | 用户端安装说明（已被 install.bat 引用） |

---

## 第一部分：开发机器打包流程（开发者视角）

### 1.1 前置条件

- Node.js ≥ 16
- 已克隆项目并 `npm install`
- 已有 AI 服务的 API Key

### 1.2 一次性配置 `.env`

将 `.env.template` 复制为 `.env`，填入真实 API Key：

```bash
cp .env.template .env
# 用编辑器修改 .env, 把 VITE_DEFAULT_API_KEY 替换为真实 key
```

```env
VITE_DEFAULT_API_KEY=sk-你的真实key...
VITE_DEFAULT_API_BASE=https://api.minimaxi.com/v1
VITE_DEFAULT_MODEL=MiniMax-M3
```

### 1.3 构建发行包

提供三种粒度：

```bash
# 推荐: 一键构建 + 打包成 7z
npm run build
#   = npm run assets  (复制 vendor 库)
#   + npm run env      (生成 taskpane/env.js)
#   + npm run sync     (同步源到 wps-addon-build/)
#   + node scripts/package.js 7z

# 同时产出 7z + EXE 自解压 (推荐给最终用户)
npm run build:all

# 仅 EXE 自解压
npm run build:exe

# 仅打包 (假设 wps-addon-build/ 已经构建好)
npm run package         # 7z
npm run package:exe     # exe
npm run package:both    # 7z + exe
```

**输出**：`wps-addon-publish/开悟_1.0.0.7z` 和 `wps-addon-publish/开悟_1.0.0_安装程序.exe`

### 1.4 校验产物

```bash
# 检查 7z 完整性 (PowerShell 需先安装 7-Zip; 也可用 7zip-bin 的 CLI)
node -e "
  const _7z = require('node-7z');
  const list = _7z.list('wps-addon-publish/开悟_1.0.0.7z', { \$bin: require('7zip-bin').path7za });
  list.on('data', d => console.log(d.file));
"

# 在另一台测试机上做"安装 → 启动 WPS → 看到 '开悟' 标签"的最小冒烟
```

### 1.5 产物分发的命名建议

| 渠道 | 文件 |
|------|------|
| 内测 | `开悟_1.0.0-beta.7z` |
| 正式 | `开悟_1.0.0.7z` + `开悟_1.0.0_安装程序.exe` |

每次发布时同步升级 `wpsjs.config.js` 中的 `version`，避免被 WPS 识别为"已是最新"而跳过更新。

---

## 第二部分：新电脑 WPS 安装流程（用户视角）

> 这是最终用户需要做的操作。**通常 IT 同事代为执行**，但操作很简单，普通用户也能自助完成。

### 2.1 系统要求

| 依赖 | 要求 |
|------|------|
| WPS Office | **个人版 v12.1.0.26375+** 或 **专业版** |
| 操作系统 | Windows 10 / Windows 11 (x64) |
| 权限 | 第一次安装需要 **管理员权限**（写入 `%APPDATA%\kingsoft\wps\jsaddons\`） |
| 网络 | 能访问 AI 服务的 API 地址（默认 `https://api.minimaxi.com/v1`） |

### 2.2 安装步骤（**双击 EXE 方式**，最简单）

1. **将分发包拷到目标电脑**（U 盘、网盘、邮件、共享盘皆可）
2. **完全退出 WPS**（包括右下角托盘图标，必要时用任务管理器结束 `WPS.exe`）
3. **双击 `开悟_1.0.0_安装程序.exe`**
4. 弹出 7z 自解压窗口，**确认安装目录**（默认 `%TEMP%`），点「**安装**」
5. 自解压完成后，**进入解压目录**（如 `%TEMP%\开悟_1.0.0`），**右键 `install.bat` → 以管理员身份运行**
6. 看到 "**安装成功!**" 后，按任意键退出
7. **重新打开 WPS Writer**
8. 在顶部功能区找到「**开悟**」标签页 → 点击「打开助手」

### 2.3 安装步骤（**手动解压 7z 方式**，IT 批量分发）

1. 用 7-Zip 或 Windows 自带解压工具解压 `开悟_1.0.0.7z`
2. 进入解压后的目录
3. **完全退出 WPS**
4. **右键 `install.bat` → 以管理员身份运行**
5. 看到 "**安装成功!**" 后重启 WPS

### 2.4 验证安装成功

| 检查项 | 通过标志 |
|--------|---------|
| 目录存在 | `%APPDATA%\kingsoft\wps\jsaddons\开悟_1.0.0\` 存在 |
| 清单已注册 | `%APPDATA%\kingsoft\wps\jsaddons\publish.xml` 含 `<jsplugin name="开悟" ...>` |
| WPS 标签 | 重新打开 WPS Writer → 顶部功能区有「开悟」标签 |
| 助手面板 | 点击「打开助手」→ 右侧弹出 TaskPane 侧边栏 |
| API 联通 | 侧边栏输入任意文字 → 点击「发送」→ AI 回复 |

### 2.5 首次配置 API Key

包内已内置默认 API Key。**用户首次打开后若需更换**：

- **方法 1（推荐）**：在 WPS 侧边栏 → 右上角 ⚙️ → 修改 API Key / API 地址 / 模型 → 保存（立即生效）
- **方法 2（全局）**：编辑 `%APPDATA%\kingsoft\wps\jsaddons\开悟_1.0.0\.env` → 关闭并重新打开 WPS

---

## 第三部分：IT 批量部署（企业内分发）

### 3.1 域控 (Active Directory) GPO 推送

把以下脚本包装成一个 GPO Startup Script 即可在域内所有机器静默安装：

```powershell
# deploy-kaiwu.ps1 — 域推送示例
$ErrorActionPreference = 'Stop'

$source = '\\your-share\kaiwu\kaiwu_1.0.0'

# GPO 启动脚本以 SYSTEM 身份运行
# %APPDATA% 在 SYSTEM 下指向 C:\Windows\System32\config\systemprofile\AppData\Roaming (错误路径)
# 使用 USERPROFILE 指向 C:\Users\Default 或遍历 HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList 获取所有用户
$dest = "$env:USERPROFILE\AppData\Roaming\kingsoft\wps\jsaddons\kaiwu_1.0.0"

# 1. 创建目录
New-Item -ItemType Directory -Force -Path $dest

# 2. 复制文件
Copy-Item -Path "$source\*" -Destination $dest -Recurse -Force

# 3. 注册 publish.xml
Copy-Item -Path "$source\..\publish.xml" `
          -Destination "$env:USERPROFILE\AppData\Roaming\kingsoft\wps\jsaddons\" -Force

Write-Host "[deploy] 已部署 $dest"
```

> **⚠️ 重要：GPO APPDATA 路径问题**
>
> GPO 启动脚本以 **SYSTEM** 身份运行，此时：
> - `%APPDATA%` → `C:\Windows\System32\config\systemprofile\AppData\Roaming` ❌
> - `%USERPROFILE%` → `C:\Users\Default` ✓
>
> **解决方案（推荐顺序）：**
> 1. **使用用户登录脚本（User Logon Script）** 而非计算机启动脚本（Computer Startup Script）— 这样 `%APPDATA%` 会正确解析
> 2. **使用 `$env:USERPROFILE\AppData\Roaming`** 替代 `$env:APPDATA`（如上所示）
> 3. **遍历所有用户配置文件**：使用 `Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList'` 获取所有用户 SID，然后拼接路径

### 3.2 Intune / 第三方 MDM 推送

打包成 `.intunewin` 或 `.msi`（用 Advanced Installer 二次包装）后下发。

### 3.3 用户自取（最小 IT 介入）

把 `开悟_1.0.0_安装程序.exe` 放到公司共享盘 / 企业微信群，发通知让用户自取自装。

---

## 第四部分：升级与回滚

### 4.1 升级到新版本

1. **完全退出 WPS**
2. 运行旧版 `uninstall.bat`（位于 `%APPDATA%\kingsoft\wps\jsaddons\开悟_1.0.0\..\uninstall.bat`，或解压新版后运行）
3. 解压新版 `开悟_1.0.1.7z`，运行新版 `install.bat`
4. 重启 WPS

> 用户在 WPS 内通过 ⚙️ 设置保存的偏好（API Key、温度、模型等）保存在 localStorage，**升级不会丢失**。

### 4.2 回滚

把旧版 `开悟_旧版本号\` 整个目录复制回 `%APPDATA%\kingsoft\wps\jsaddons\`，然后修改 `publish.xml` 中的 `url` 指向旧版目录即可。

### 4.3 完全卸载

```cmd
:: 方法 1: 双击卸载脚本
uninstall.bat

:: 方法 2: 手动清理
rd /s /q "%APPDATA%\kingsoft\wps\jsaddons\开悟_1.0.0"
:: 然后编辑 %APPDATA%\kingsoft\wps\jsaddons\publish.xml 删除对应行
```

完全退出 WPS 后重新打开。

---

## 第五部分：故障排查

| 症状 | 排查步骤 |
|------|---------|
| 双击 EXE 后没反应 | 检查是否被杀毒软件拦截；右键 EXE → 属性 → 是否有"解除锁定"按钮 |
| install.bat 报"权限不足" | 右键 → "以管理员身份运行" |
| 安装后 WPS 没有"开悟"标签 | 任务管理器确认 WPS 已完全退出后再开；检查 `publish.xml` 是否含 `<jsplugin name="开悟" ...>` |
| 打开助手后一直转圈 | ⚙️ 设置里检查 API Key 是否有效；浏览器访问 `https://api.minimaxi.com/v1` 验证网络 |
| "生成内容为空"持续出现 | 模型返回了纯 `reasoning_content`（被默认剥除）。在设置里换一个非推理模型 |
| 仿写/续写没反应 | 在文档中**先选中文字**再点功能 |
| 改 .env 后没生效 | 关闭 WPS → 修改 → 重开 WPS |
| 卸载后残留文件 | 手动删 `%APPDATA%\kingsoft\wps\jsaddons\开悟_*` 整个目录 |

---

## 附录 A：完整命令速查

| 场景 | 命令 |
|------|------|
| 开发时实时调试 | `npm run debug` |
| 跑单元测试 | `npm test` |
| 同步源到 wps-addon-build | `npm run sync` |
| 仅打包 7z | `npm run build` 或 `npm run package` |
| 打包 EXE | `npm run build:exe` 或 `npm run package:exe` |
| 同时打包两者 | `npm run build:all` 或 `npm run package:both` |
| 同步 vendor 库 | `npm run assets` |
| 重新生成 env.js | `npm run env` |

## 附录 B：关键文件位置

| 文件 | 路径 |
|------|------|
| 插件运行时根 | `%APPDATA%\kingsoft\wps\jsaddons\开悟_<版本>\` |
| WPS 插件清单 | `%APPDATA%\kingsoft\wps\jsaddons\publish.xml` |
| 用户配置 | WPS TaskPane 的 localStorage（无需手动管理） |
| 日志（debug 模式） | `%APPDATA%\kingsoft\wps\jsaddons\开悟_<版本>\.debugTemp\` |
