/**
 * config.js — 配置管理
 * 持久化存储 API BaseURL、Key、Model、SystemPrompt 等配置
 * 默认使用 MiniMax 中国站
 */

// 从 env.js 注入的全局变量（由 init-env.ps1 从 .env 生成）
// 这里捕获到本地常量, 即使 env.js 加载顺序在 config.js 之后也能正常工作.
var DEFAULT_API_KEY = (function () {
    try {
        if (typeof window !== 'undefined' && typeof window.__ENV_API_KEY__ !== 'undefined' && window.__ENV_API_KEY__) return window.__ENV_API_KEY__;
    } catch (e) { /* ignore */ }
    return '';
})();
var DEFAULT_API_BASE = (function () {
    try {
        if (typeof window !== 'undefined' && typeof window.__ENV_API_BASE__ !== 'undefined' && window.__ENV_API_BASE__) return window.__ENV_API_BASE__;
    } catch (e) { /* ignore */ }
    return '';
})();
var DEFAULT_MODEL = (function () {
    try {
        if (typeof window !== 'undefined' && typeof window.__ENV_MODEL__ !== 'undefined' && window.__ENV_MODEL__) return window.__ENV_MODEL__;
    } catch (e) { /* ignore */ }
    return '';
})();

var Config = {
    _defaults: {
        apiBaseUrl: 'https://api.minimaxi.com/v1',
        apiKey: '',
        model: 'MiniMax-M3',
        systemPrompt: '你是一个专业的AI助手（开悟），帮助用户高效处理文档、表格、演示和PDF。请用中文回复。',
        temperature: 0.7,
        maxTokens: 4096,
        stream: true,
        // 思考模型 (如 MiniMax M3, DeepSeek R1, o1) 会返回 reasoning_content
        // (思考过程) + content (最终回复). 默认剥离思考部分, 仅向用户展示 content.
        stripReasoning: true
    },

    // 模型名中包含这些关键词时, 默认 stripReasoning 为 true
    _reasoningModelPatterns: ['r1', 'reasoning', 'thinking', 'o1', 'minimax'],

    // 各组件对应的系统提示词
    _systemPrompts: {
        wps: '你是一个专业的AI写作助手（开悟），帮助用户进行文档处理、写作优化、翻译和摘要等任务。请用中文回复。',
        et: '你是一个专业的AI表格助手（开悟），精通WPS表格/Excel。你可以帮助用户：1)生成公式（如SUMIF、VLOOKUP、IF等）；2)分析数据趋势和模式；3)推荐适合的图表类型；4)数据清洗和格式化建议。请用中文回复。当用户要求生成公式时，请直接给出可用的公式（以=开头）。',
        wpp: '你是一个专业的AI演示助手（开悟），精通WPS演示/PPT。你可以帮助用户：1)根据主题生成PPT大纲；2)提供幻灯片设计建议（布局、配色、字体、图示）；3)生成演讲备注。请用中文回复。',
        pdf: '你是一个专业的AI文档阅读助手（开悟），帮助用户理解和分析PDF文档。你可以帮助用户：1)提取文档核心要点生成摘要；2)基于文档内容回答问题。如果无法从文档中找到答案，请明确说明。请用中文回复。'
    },

    // 根据组件类型获取系统提示词
    getSystemPromptFor: function (componentType) {
        return this._systemPrompts[componentType] || this._systemPrompts.wps;
    },

    // 检测当前组件类型 (从PluginStorage或ComponentDetector)
    detectComponent: function () {
        try {
            if (window.Application && window.Application.PluginStorage) {
                var type = window.Application.PluginStorage.getItem('component_type');
                if (type) return type;
            }
        } catch (e) { /* ignore */ }
        if (typeof ComponentDetector !== 'undefined') {
            return ComponentDetector.detect();
        }
        return 'wps';
    },

    _data: null,

    // 初始化：从 .env 读取默认 API Key（通过全局变量注入）
    init: function () {
        this._data = this._load();
        // 首次运行或用户未自定义时, 使用 env.js 注入的默认值
        if (!this._data.apiKey && typeof DEFAULT_API_KEY !== 'undefined' && DEFAULT_API_KEY) {
            this._data.apiKey = DEFAULT_API_KEY;
        }
        if ((!this._data.apiBaseUrl || this._data.apiBaseUrl === this._defaults.apiBaseUrl) && typeof DEFAULT_API_BASE !== 'undefined' && DEFAULT_API_BASE) {
            this._data.apiBaseUrl = DEFAULT_API_BASE;
        }
        if ((!this._data.model || this._data.model === this._defaults.model) && typeof DEFAULT_MODEL !== 'undefined' && DEFAULT_MODEL) {
            this._data.model = DEFAULT_MODEL;
        }
        // 根据当前组件类型设置默认系统提示词
        // 仅当用户未自定义时（保持与默认一致才覆盖）
        var detectedComponent = this.detectComponent();
        var defaultPrompt = this.getSystemPromptFor(detectedComponent);
        if (this._data.systemPrompt === this._defaults.systemPrompt || !this._data.systemPrompt) {
            this._data.systemPrompt = defaultPrompt;
        }
        // G4: 追踪 systemPrompt 来源 ('user' | 'default:wps' | 'default:et' | ...)
        // 这条信息供 settings.js 在用户切换组件时智能判断是否要更新 prompt.
        if (!this._data.systemPromptSource || this._data.systemPromptSource.indexOf('user:') === 0) {
            this._data.systemPromptSource = 'default:' + detectedComponent;
        }
        return this._data;
    },

    get: function (key) {
        if (!this._data) this.init();
        if (key) return this._data.hasOwnProperty(key) ? this._data[key] : this._defaults[key];
        return Object.assign({}, this._data);
    },

    set: function (key, value) {
        if (!this._data) this.init();
        if (typeof key === 'object') {
            Object.assign(this._data, key);
        } else {
            this._data[key] = value;
        }
        this._save();
    },

    reset: function () {
        // Reset wipes saved credentials (incl. env-injected ones); the
        // user can re-supply via the Settings panel or .env.
        this._data = Object.assign({}, this._defaults);
        this._data.apiKey = '';
        // Re-apply env-injected base URL/model for the current session.
        if (typeof DEFAULT_API_BASE !== 'undefined' && DEFAULT_API_BASE) {
            this._data.apiBaseUrl = DEFAULT_API_BASE;
        }
        if (typeof DEFAULT_MODEL !== 'undefined' && DEFAULT_MODEL) {
            this._data.model = DEFAULT_MODEL;
        }
        // Reset system prompt to current component's default.
        var detectedComponent = this.detectComponent();
        this._data.systemPrompt = this.getSystemPromptFor(detectedComponent);
        this._data.systemPromptSource = 'default:' + detectedComponent;
        this._save();
        return this._data;
    },

    getAll: function () {
        if (!this._data) this.init();
        return Object.assign({}, this._data);
    },

    _load: function () {
        try {
            var saved = localStorage.getItem('wps_assistant_config');
            if (saved) {
                var parsed = JSON.parse(saved);
                // 合并默认值（保证新字段有默认值）
                return Object.assign({}, this._defaults, parsed);
            }
        } catch (e) {
            console.warn('[Config] 加载配置失败:', e);
        }
        return Object.assign({}, this._defaults);
    },

    // 根据模型名判断是否应剥离思考过程.
    // 思考模型 (如 MiniMax M3, DeepSeek R1, OpenAI o1) 会同时返回
    // reasoning_content 和 content. 默认仅向用户呈现 content.
    isReasoningModel: function (modelName) {
        if (!modelName) return false;
        var lower = String(modelName).toLowerCase();
        for (var i = 0; i < this._reasoningModelPatterns.length; i++) {
            if (lower.indexOf(this._reasoningModelPatterns[i]) !== -1) return true;
        }
        return false;
    },

    _save: function () {
        try {
            localStorage.setItem('wps_assistant_config', JSON.stringify(this._data));
        } catch (e) {
            // QuotaExceededError or SecurityError in WPS CEF: fall back to
            // in-memory state so the current session keeps working.
            if (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22)) {
                console.warn('[Config] localStorage 配额已满, 配置仅在本次会话有效');
            } else if (e && e.name === 'SecurityError') {
                console.warn('[Config] localStorage 不可用, 配置仅在本次会话有效');
            } else {
                console.error('[Config] 保存配置失败:', e);
            }
        }
    }
};
