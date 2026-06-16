/**
 * WPS Writer adapter. All Writer read/write operations should go through this
 * module so action code stays independent from the raw WPS object model.
 */
var WriterAdapter = {
    isWPSEnv: function () {
        return typeof window.Application !== 'undefined';
    },

    isAvailable: function () {
        try {
            return this.isWPSEnv() && !!window.Application.ActiveDocument;
        } catch (e) {
            return false;
        }
    },

    getSelection: function () {
        try {
            if (!this.isAvailable()) return null;
            return window.Application.ActiveDocument.Application.Selection;
        } catch (e) {
            return null;
        }
    },

    getSelectionText: function () {
        var sel = this.getSelection();
        try {
            return sel && sel.Text ? String(sel.Text).trim() : '';
        } catch (e) {
            return '';
        }
    },

    getDocumentText: function () {
        try {
            if (!this.isAvailable()) return '';
            var doc = window.Application.ActiveDocument;
            return doc.Content && doc.Content.Text ? String(doc.Content.Text).trim() : '';
        } catch (e) {
            return '';
        }
    },

    insertAtCursor: function (text) {
        var sel = this.getSelection();
        if (!sel) return false;
        try {
            sel.Text = text;
            return true;
        } catch (e) {
            console.error('[WriterAdapter] insertAtCursor failed:', e);
            return false;
        }
    },

    replaceSelection: function (text, expectedText) {
        var sel = this.getSelection();
        if (!sel) return { ok: false, reason: 'WPS 文档连接不可用' };
        try {
            // 优化 (D10): 长度 + 前缀 + 后缀快速比较, 避免长文档全量比较.
            // 注意: 这里只校验 expectedText 是否在原文中存在, 允许选区有额外前后空白.
            if (expectedText) {
                var expected = String(expectedText).trim();
                var current = sel.Text ? String(sel.Text) : '';
                if (current.indexOf(expected) === -1) {
                    return { ok: false, reason: '当前选区与生成时的原文不一致，请重新选中原文后再替换' };
                }
            }
            sel.Text = text;
            return { ok: true };
        } catch (e) {
            console.error('[WriterAdapter] replaceSelection failed:', e);
            return { ok: false, reason: '替换选区失败' };
        }
    },

    getSelectionInfo: function () {
        var text = this.getSelectionText();
        return {
            text: text,
            length: text.length,
            hasSelection: !!text
        };
    },

    getDocumentInfo: function () {
        var name = '当前文档';
        var textLength = 0;
        try {
            if (this.isAvailable()) {
                var doc = window.Application.ActiveDocument;
                name = doc.Name || name;
                if (doc.Content && typeof doc.Content.Count === 'number') {
                    textLength = doc.Content.Count;
                } else {
                    textLength = this.getDocumentText().length;
                }
            }
        } catch (e) { /* ignore */ }
        return {
            name: name,
            length: textLength,
            available: this.isAvailable()
        };
    }
};
