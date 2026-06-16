/**
 * component.js — 组件检测工具
 * 检测当前WPS组件类型: wps(文字) / wpp(演示) / et(表格) / pdf(PDF)
 */
var ComponentDetector = {
    // 缓存检测结果
    _type: null,

    // 检测组件类型
    detect: function () {
        if (this._type) return this._type;
        try {
            var app = window.Application;
            if (!app) return 'unknown';

            // WPP: 演示文稿
            if (typeof app.ActivePresentation !== 'undefined' && app.ActivePresentation) {
                this._type = 'wpp';
                return 'wpp';
            }
            // ET: 电子表格
            if (typeof app.ActiveWorkbook !== 'undefined' && app.ActiveWorkbook) {
                this._type = 'et';
                return 'et';
            }
            // WPS: 文字处理 (包括PDF)
            if (typeof app.ActiveDocument !== 'undefined' && app.ActiveDocument) {
                try {
                    var doc = app.ActiveDocument;
                    var name = doc.Name || '';
                    if (name && name.toLowerCase().match(/\.pdf$/)) {
                        this._type = 'pdf';
                        return 'pdf';
                    }
                } catch (e) {
                    // Some properties might not be accessible
                }
                this._type = 'wps';
                return 'wps';
            }
        } catch (e) {
            console.warn('[Component] 检测失败:', e);
        }
        return 'unknown';
    },

    // 重置缓存 (用于组件切换 / 新文档打开)
    reset: function () {
        this._type = null;
    },

    // 获取中文标签
    getLabel: function (type) {
        var labels = {
            'wps': '文字',
            'wpp': '演示',
            'et': '表格',
            'pdf': 'PDF'
        };
        return labels[type || this.detect()] || '未知';
    },

    _bound: false,
    bindAutoReset: function () {
        if (this._bound) return;
        var self = this;
        try {
            var app = window.Application;
            if (!app || !app.ApiEvent || typeof app.ApiEvent.AddApiEventListener !== 'function') return;
            this._bound = true;
            app.ApiEvent.AddApiEventListener('DocumentOpen', function () { self.reset(); });
            app.ApiEvent.AddApiEventListener('NewDocument', function () { self.reset(); });
            if (typeof app.ApiEvent.AddApiEventListener === 'function') {
                try {
                    app.ApiEvent.AddApiEventListener('PresentationNewSlide', function () { self.reset(); });
                } catch (e) { /* not WPP */ }
            }
        } catch (e) { /* ignore */ }
    }
};
