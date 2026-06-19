/**
 * app.js — 应用入口
 * 负责 TaskPane 的生命周期管理、桥接通信初始化
 *
 * DEFAULT_API_KEY / DEFAULT_API_BASE / DEFAULT_MODEL 由 config.js 顶部捕获
 * (从 window.__ENV_*__ 读取, 由 env.js 提供默认值). 此处不再重复.
 */

/* global SessionManager */

// ==================== WPS 桥接器 ====================
window.__WPS_BRIDGE__ = {
    // 检查是否在 WPS 环境中
    isWPSEnv: function () {
        return typeof window.Application !== 'undefined';
    },

    // 获取当前组件类型
    getComponentType: function () {
        if (this._cachedType) return this._cachedType;
        try {
            if (this.isWPSEnv() && window.Application.PluginStorage) {
                var type = window.Application.PluginStorage.getItem('component_type');
                if (type) { this._cachedType = type; return type; }
            }
        } catch (e) { /* ignore */ }
        if (typeof ComponentDetector !== 'undefined') {
            this._cachedType = ComponentDetector.detect();
            return this._cachedType;
        }
        return 'wps';
    },

    // 重置组件缓存
    resetComponentType: function () {
        this._cachedType = null;
        if (typeof ComponentDetector !== 'undefined') {
            ComponentDetector.reset();
        }
    },

    // 插入文本到文档 (Writer/PDF)
    insertText: function (text, maxLength) {
        maxLength = maxLength || 10000; // 默认最大 10,000 字符
        try {
            if (typeof text === 'string' && text.length > maxLength) {
                console.warn('[Bridge] 插入文本超长，已截断: ' + text.length + ' -> ' + maxLength);
                text = text.substring(0, maxLength);
            }
            if (this.isWPSEnv() && window.Application.ActiveDocument) {
                window.Application.ActiveDocument.Application.Selection.Text = text;
                return true;
            }
        } catch (e) {
            console.error('[Bridge] 插入文本失败:', e);
        }
        return false;
    },

    // 组件感知的内容插入
    insertContent: function (text) {
        var type = this.getComponentType();
        try {
            switch (type) {
                case 'et':
                    // ET: 写入到当前选中单元格
                    if (window.Application.ActiveWorkbook) {
                        var sel = window.Application.ActiveWorkbook.Application.Selection;
                        if (sel) {
                            // 如果是公式 (以=开头) 使用Formula属性, 否则用Value
                            if (typeof text === 'string' && text.startsWith('=')) {
                                sel.Formula = text;
                            } else {
                                sel.Value = text;
                            }
                            return true;
                        }
                    }
                    break;
                case 'wpp':
                    // WPP: 暂以剪贴板方式或回退到文本插入
                    // 简化: 复制到剪贴板供用户粘贴
                    try {
                        if (window.Application.Clipboard && typeof window.Application.Clipboard.SetText === 'function') {
                            window.Application.Clipboard.SetText(text);
                            return true;
                        }
                    } catch (e) { /* fallback */ }
                    // 备选: 在新幻灯片中插入文本
                    return false;
                case 'wps':
                case 'pdf':
                default:
                    return this.insertText(text);
            }
        } catch (e) {
            console.error('[Bridge] 组件感知插入失败:', e);
        }
        return false;
    },

    // 读取选中文本/上下文
    readSelection: function () {
        try {
            if (this.isWPSEnv() && window.Application.ActiveDocument) {
                return window.Application.ActiveDocument.Application.Selection.Text || '';
            }
            if (this.isWPSEnv() && window.Application.ActiveWorkbook) {
                var sel = window.Application.ActiveWorkbook.Application.Selection;
                return sel ? (sel.Text || '') : '';
            }
            if (this.isWPSEnv() && window.Application.ActivePresentation) {
                // WPP: 读取当前幻灯片所有文本
                try {
                    var view = window.Application.ActivePresentation.Application.ActiveWindow.View;
                    var slide = view && view.Slide;
                    if (slide && slide.Shapes) {
                        var parts = [];
                        for (var i = 1; i <= slide.Shapes.Count; i++) {
                            var sh = slide.Shapes.Item(i);
                            if (sh && sh.HasTextFrame) {
                                parts.push(sh.TextFrame.TextRange.Text);
                            }
                        }
                        return parts.join('\n');
                    }
                } catch (e) { /* ignore */ }
            }
        } catch (e) { /* ignore */ }
        return '';
    },

    // 读取整个文档内容 (用于问答/摘要)
    // 增加最大长度限制，防止超大文档导致 API 超时
    readFullContent: function (maxLength) {
        maxLength = maxLength || 50000; // 默认最大 50,000 字符
        try {
            var type = this.getComponentType();
            var text = '';
            if (type === 'wps' && window.Application.ActiveDocument) {
                text = window.Application.ActiveDocument.Content.Text || '';
            } else if (type === 'pdf' && window.Application.ActiveDocument) {
                // PDF读取 - 简化方案: 读取前若干页文本
                text = window.Application.ActiveDocument.Content.Text || '';
            } else if (type === 'et' && window.Application.ActiveWorkbook) {
                // ET: 读取活动工作表已使用区域
                var sheet = window.Application.ActiveWorkbook.ActiveSheet;
                if (sheet && sheet.UsedRange) {
                    text = sheet.UsedRange.Text || '';
                }
            } else if (type === 'wpp' && window.Application.ActivePresentation) {
                // WPP: 读取所有幻灯片文本
                try {
                    var pres = window.Application.ActivePresentation;
                    var all = [];
                    for (var i = 1; i <= pres.Slides.Count; i++) {
                        var sl = pres.Slides.Item(i);
                        for (var j = 1; j <= sl.Shapes.Count; j++) {
                            var sh = sl.Shapes.Item(j);
                            if (sh && sh.HasTextFrame) {
                                all.push(sh.TextFrame.TextRange.Text);
                            }
                        }
                    }
                    text = all.join('\n');
                } catch (e) { /* ignore */ }
            }

            // 截断超长文本
            if (text.length > maxLength) {
                console.warn('[Bridge] 文档内容超长，已截断: ' + text.length + ' -> ' + maxLength);
                text = text.substring(0, maxLength) + '\n\n[... 文档内容过长，已截断 ...]';
            }
            return text;
        } catch (e) {
            console.warn('[Bridge] readFullContent失败:', e);
        }
        return '';
    }
};

// ==================== 全局未捕获异常处理 ====================
// 防止未处理的 Promise 拒绝静默吞掉错误
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('unhandledrejection', function (e) {
        if (e && e.reason) {
            console.warn('[开悟] 未捕获的 Promise 拒绝:', e.reason && e.reason.message ? e.reason.message : e.reason);
        }
    });
}

// ==================== 首次运行检测 ====================
var FirstRunManager = {
    _dismissedKey: 'kw_first_run_dismissed',

    isApiKeyConfigured: function () {
        var config = Config.get();
        var key = config.apiKey || '';
        var isEmpty = !key || key.trim() === '';
        var isPlaceholder = key.indexOf('PLEASE_REPLACE') !== -1 ||
                           key.indexOf('sk-PLEASE') !== -1 ||
                           key.indexOf('YOUR_API_KEY') !== -1 ||
                           key.indexOf('your-api-key') !== -1;
        return !isEmpty && !isPlaceholder;
    },

    check: function () {
        if (this.isApiKeyConfigured()) {
            return false;
        }
        if (localStorage.getItem(this._dismissedKey)) {
            return false;
        }
        this.showOverlay();
        return true;
    },

    showOverlay: function () {
        var overlay = document.getElementById('kwFirstRunOverlay');
        if (overlay) {
            overlay.hidden = false;
        }
    },

    hideOverlay: function () {
        var overlay = document.getElementById('kwFirstRunOverlay');
        if (overlay) {
            overlay.hidden = true;
        }
    },

    dismiss: function () {
        localStorage.setItem(this._dismissedKey, '1');
        this.hideOverlay();
    },

    openSettings: function () {
        this.hideOverlay();
        if (typeof SettingsUI !== 'undefined') {
            SettingsUI.show();
        }
    }
};

// ==================== 应用初始化 ====================
document.addEventListener('DOMContentLoaded', function () {
    // 检测并打印组件类型
    var componentType = (typeof ComponentDetector !== 'undefined')
        ? ComponentDetector.detect()
        : 'wps';
    var componentLabel = (typeof ComponentDetector !== 'undefined')
        ? ComponentDetector.getLabel(componentType)
        : '文字';
    console.log('[开悟] TaskPane 已加载 - 组件: ' + componentLabel);

    // 同步组件类型到PluginStorage
    try {
        if (window.Application && window.Application.PluginStorage) {
            window.Application.PluginStorage.setItem('component_type', componentType);
        }
    } catch (e) { /* ignore */ }

    // 1. 初始化配置
    Config.init();

    // 2. 初始化对话管理器
    ChatManager.getCurrent();

    // 3. 初始化聊天 UI
    ChatUI.init();

    // 4. 如果设置了默认 API Key，更新模型指示器
    if (Config.get('apiKey')) {
        ChatUI._updateModelIndicator();
    }

    // 5. 更新欢迎语 (组件感知)
    ChatUI._updateWelcomeByComponent(componentType, componentLabel);

    // 6. 首次运行检测 - 显示 API Key 配置引导
    FirstRunManager.check();

    // 7. 绑定首次运行引导按钮事件
    (function () {
        var configBtn = document.getElementById('kwFirstRunConfigBtn');
        var dismissBtn = document.getElementById('kwFirstRunDismissBtn');
        if (configBtn) {
            configBtn.addEventListener('click', function () {
                FirstRunManager.openSettings();
            });
        }
        if (dismissBtn) {
            dismissBtn.addEventListener('click', function () {
                FirstRunManager.dismiss();
            });
        }
    })();

    // 8. 监听 WPS 窗口选择变化（刷新上下文状态）
    if (window.__WPS_BRIDGE__.isWPSEnv()) {
        try {
            window.Application.ApiEvent.AddApiEventListener('WindowSelectionChange', function () {
                if (typeof ChatUI !== 'undefined' && ChatUI._updateContextBar) {
                    ChatUI._updateContextBar();
                }
            });
        } catch (e) {
            console.warn('[开悟] 无法注册选择变更监听:', e);
        }
        // Auto-reset ComponentDetector when the user opens/creates a new document.
        if (typeof ComponentDetector !== 'undefined' && ComponentDetector.bindAutoReset) {
            try { ComponentDetector.bindAutoReset(); } catch (e2) { /* ignore */ }
        }
    }

    // 9. Setup session cleanup on document close
    AppSessionManager._setupDocumentCloseHandler();

    // 10. Start periodic session prune timer
    AppSessionManager._startSessionPruneTimer();

    console.log('[开悟] 初始化完成');
});

// ==================== 应用会话管理器 ====================
var AppSessionManager = {
    _setupDocumentCloseHandler: function() {
        var self = this;
        try {
            if (window.Application && window.Application.ActiveDocument) {
                window.addEventListener('beforeunload', function() {
                    self._cleanupCurrentDocumentSessions();
                });
            }
        } catch (e) { /* ignore */ }
    },

    _cleanupCurrentDocumentSessions: function() {
        try {
            if (typeof SessionManager === 'undefined') return;
            var documentId = this._getCurrentDocumentId();
            if (documentId) {
                SessionManager.cleanup(documentId);
            }
        } catch (e) {
            console.warn('[App] Error cleaning up sessions:', e);
        }
    },

    _getCurrentDocumentId: function() {
        try {
            if (window.Application && window.Application.ActiveDocument) {
                return window.Application.ActiveDocument.Name || 'unknown';
            }
        } catch (e) { /* ignore */ }
        return 'default';
    },

    _startSessionPruneTimer: function() {
        if (typeof SessionManager === 'undefined') return;
        setInterval(function() {
            SessionManager.prune();
        }, 24 * 60 * 60 * 1000);
    }
};
