# 开悟 — WPS AI 写作助手

<div align="center">

**版本: 0.4.0**

基于 AI 大模型的 WPS 写作辅助工具

对话 · 润色 · 续写 · 翻译 · 摘要 · 仿写 · 伴写 · 文档脑图

</div>

---

## 一键安装

1. 解压本压缩包到任意位置 (如桌面)
2. **完全退出 WPS** (关闭所有文档, 右键托盘图标 → 退出, 任务管理器结束所有 `wps.exe`)
3. 双击 **`install.bat`**
4. 看到 "Installation completed successfully" 后, **再次确认 WPS 已完全退出**
5. 重新打开 WPS Writer (.docx 文档)
6. 在 WPS Writer 功能区找到 "**Kaiwu**" 标签页 → 点击 "打开助手"

> **首次使用管理员身份运行 install.bat**, 以保证能写入 `%APPDATA%\kingsoft\wps\jsaddons\`

如果安装后看不到 "Kaiwu" 标签页, 双击 **`verify.bat`** 进行诊断.

## 系统要求

| 依赖 | 版本 |
|------|------|
| WPS Office | 个人版 v12.1.0.26375+ 或 专业版 |
| 操作系统 | Windows 10 / Windows 11 |

## 卸载

双击 **`uninstall.bat`** 即可, 然后重启 WPS。

## 配置 API Key

包内已内置默认 API Key (在 `.env` 文件中)。如果需要更换:

- **方法一**: 编辑 `kaiwu_0.4.0\.env`, 填入新的 `VITE_DEFAULT_API_KEY` 等, 然后重启 WPS
- **方法二**: 在 WPS 侧边栏点击 ⚙️ 设置, 实时修改并保存 (推荐, 无需重启)

当前默认配置:

```
VITE_DEFAULT_API_BASE = https://api.minimaxi.com/v1
VITE_DEFAULT_MODEL    = MiniMax-M3
VITE_DEFAULT_API_KEY  = sk-test-...
```

## 目录结构

```
kaiwu_0.4.0/
├── .env                        # API 默认配置 (可改)
├── ribbon.xml                  # WPS 功能区定义
├── ribbon.js                   # 功能区事件
├── component.js                # 组件检测
├── index.html                  # 入口页
├── images/                     # 图标 (含 LOGO)
├── taskpane/                   # 侧边栏面板
│   ├── index.html
│   ├── app.js
│   ├── env.js                 # 由 .env 自动生成
│   ├── services/
│   ├── components/
│   ├── actions/
│   ├── adapters/
│   ├── styles/
│   └── vendor/                # 第三方库
└── floating/                   # 浮动助手
    ├── index.html
    ├── floating.js
    └── styles/
```

## 安装位置

插件文件被复制到:

```
%APPDATA%\kingsoft\wps\jsaddons\kaiwu_0.4.0\
%APPDATA%\kingsoft\wps\jsaddons\publish.xml
```

## 常见问题

**Q: 安装后 WPS 看不到"开悟"标签页?**
A: 请按顺序检查:
   1. **完全退出 WPS**: 关闭所有文档 + 右键系统托盘 WPS 图标 → 退出 + 任务管理器 (Ctrl+Shift+Esc) 结束所有 `wps.exe`
   2. **检查 WPS 缓存**: 双击 `verify.bat` 查看诊断结果. 如果提示 `authaddin.json 仍存在`, 重新运行 `install.bat` 会自动清除它.
   3. **重新打开 WPS Writer** (不是 WPS 主入口, 是 .docx 文件)
   4. **如果还不行**: 手动删除 `%APPDATA%\kingsoft\wps\jsaddons\authaddin.json` 后再重启 WPS

**Q: 为什么 install.bat 要删除 authaddin.json?**
A: WPS 启动时会在 `%APPDATA%\kingsoft\wps\jsaddons\` 创建一个 `authaddin.json` 缓存文件, 记录每个插件的加载路径. 如果你之前装过旧版本 (使用 `开悟_1.0.0` 目录), WPS 会继续从那个**已经不存在的**路径加载插件, 导致看不到新标签页. install.bat 删除这个缓存后, WPS 会在下次启动时从 `publish.xml` 重新构建缓存, 路径就是新目录 `kaiwu_1.0.0`.

**Q: 双击 install.bat 提示权限不足?**
A: 右键 install.bat → "以管理员身份运行".

**Q: 打开助手后一直转圈, 看不到结果?**
A: 检查 .env 中的 API Key 是否有效; 网络能否访问 API 地址; 在设置面板里换一个模型试试.

**Q: 升级到新版本?**
A: 先运行 uninstall.bat 卸载旧版 (会自动清除 authaddin.json 缓存), 再解压新版运行 install.bat. 不会丢失个人设置 (保存在 WPS localStorage 中).

---

<div align="center">
打包于 2026-06-19 08:07:01
</div>
