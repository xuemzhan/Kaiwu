/**
 * Basic client-side security helpers for rendering untrusted model output.
 * Exposed as `KwSecurity` (not `Security`) to avoid colliding with the
 * `window.Security` global injected by WPS CEF.
 */
var KwSecurity = {
    _allowedTags: {
        A: true, ABBR: true, B: true, BLOCKQUOTE: true, BR: true, CODE: true,
        DEL: true, DETAILS: true, DIV: true, EM: true, H1: true, H2: true,
        H3: true, H4: true, H5: true, H6: true, HR: true, I: true, IMG: true,
        LI: true, OL: true, P: true, PRE: true, S: true, SPAN: true, STRONG: true,
        SUMMARY: true, TABLE: true, TBODY: true, TD: true, TH: true, THEAD: true,
        TR: true, UL: true
    },

    _allowedAttrs: {
        A: { href: true, title: true, target: true, rel: true },
        IMG: { src: true, alt: true, title: true },
        CODE: { class: true },
        PRE: { class: true },
        DIV: { class: true },
        SPAN: { class: true },
        DETAILS: { class: true, open: true },
        SUMMARY: { class: true },
        TABLE: { class: true },
        THEAD: { class: true },
        TBODY: { class: true },
        TR: { class: true },
        TH: { class: true },
        TD: { class: true }
    },

    // D20: 复用同一个 <template> 节点, 避免每次 sanitize 都创建新节点.
    _templateEl: null,
    _getTemplate: function () {
        if (!this._templateEl || this._templateEl.ownerDocument !== document) {
            this._templateEl = document.createElement('template');
        }
        return this._templateEl;
    },

    sanitizeUrl: function (value) {
        if (!value) return '';
        var text = String(value).trim();
        var lowered = text.toLowerCase();
        if (
            lowered.indexOf('javascript:') === 0 ||
            lowered.indexOf('vbscript:') === 0 ||
            lowered.indexOf('blob:') === 0
        ) {
            return '';
        }
        // 仅阻止 data:text/html 类型的 data URI，允许图片等其他类型
        if (lowered.indexOf('data:') === 0) {
            if (lowered.indexOf('data:text/html') === 0 || lowered.indexOf('data:text/xhtml') === 0) {
                return '';
            }
            return text;
        }
        if (/^(https?:|mailto:|#|\/|\.\.?\/)/i.test(text)) return text;
        return '';
    },

    sanitizeHtml: function (html) {
        var template = this._getTemplate();
        template.innerHTML = html || '';
        KwSecurity._sanitizeNode(template.content);
        return template.innerHTML;
    },

    _sanitizeNode: function (node) {
        var children = Array.prototype.slice.call(node.childNodes || []);
        for (var i = 0; i < children.length; i++) {
            var child = children[i];
            if (child.nodeType === 1) {
                if (!this._allowedTags[child.tagName]) {
                    child.parentNode.removeChild(child);
                    continue;
                }
                this._sanitizeAttrs(child);
                this._sanitizeNode(child);
            } else if (child.nodeType !== 3) {
                child.parentNode.removeChild(child);
            }
        }
    },

    _sanitizeAttrs: function (el) {
        var allowed = this._allowedAttrs[el.tagName] || {};
        var attrs = Array.prototype.slice.call(el.attributes || []);
        for (var i = 0; i < attrs.length; i++) {
            var name = attrs[i].name;
            var lowerName = name.toLowerCase();
            if (!allowed[name] && !allowed[lowerName]) {
                el.removeAttribute(name);
                continue;
            }
            if (lowerName === 'href' || lowerName === 'src') {
                var safeUrl = this.sanitizeUrl(attrs[i].value);
                if (!safeUrl) {
                    el.removeAttribute(name);
                } else {
                    el.setAttribute(name, safeUrl);
                }
            }
        }
        if (el.tagName === 'A') {
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noopener noreferrer');
        }
    }
};
