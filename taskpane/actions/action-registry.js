/**
 * Writer action registry. Ribbon buttons and TaskPane scenario buttons share
 * this table so prompts and behavior stay consistent.
 */
var ActionRegistry = {
    _actions: {
        write: {
            id: 'write',
            label: '帮我写',
            category: 'writing',
            input: 'user',
            output: 'insert',
            promptKey: 'write',
            placeholder: '输入你想生成的内容，例如：写一份项目周报'
        },
        cowrite: {
            id: 'cowrite',
            label: '伴写',
            category: 'writing',
            input: 'user',
            output: 'insert',
            promptKey: 'cowrite',
            placeholder: '输入你想协作写的主题，例如：开悟插件的产品介绍'
        },
        continue_write: {
            id: 'continue_write',
            label: '续写',
            category: 'writing',
            input: 'selection',
            output: 'replaceable',
            promptKey: 'continue_write',
            requireSelection: true
        },
        imitate: {
            id: 'imitate',
            label: '仿写',
            category: 'writing',
            input: 'user',
            output: 'insert',
            promptKey: 'imitate',
            placeholder: '请输入要仿写的内容主题（用选中文本作为风格样本）',
            requireSelection: true
        },
        polish_quick: {
            id: 'polish_quick',
            label: '快速润色',
            category: 'modify',
            input: 'selection',
            output: 'replaceable',
            promptKey: 'polish_quick',
            requireSelection: true
        },
        polish_formal: {
            id: 'polish_formal',
            label: '更正式',
            category: 'modify',
            input: 'selection',
            output: 'replaceable',
            promptKey: 'polish_formal',
            requireSelection: true
        },
        polish_government: {
            id: 'polish_government',
            label: '党政风',
            category: 'modify',
            input: 'selection',
            output: 'replaceable',
            promptKey: 'polish_government',
            requireSelection: true
        },
        correct: {
            id: 'correct',
            label: '纠错',
            category: 'modify',
            input: 'selection',
            output: 'replaceable',
            promptKey: 'correct',
            requireSelection: true
        },
        expand: {
            id: 'expand',
            label: '扩写',
            category: 'modify',
            input: 'selection',
            output: 'replaceable',
            promptKey: 'expand',
            requireSelection: true
        },
        shrink: {
            id: 'shrink',
            label: '缩写',
            category: 'modify',
            input: 'selection',
            output: 'replaceable',
            promptKey: 'shrink',
            requireSelection: true
        },
        rewrite: {
            id: 'rewrite',
            label: '重写',
            category: 'modify',
            input: 'selection',
            output: 'replaceable',
            promptKey: 'rewrite',
            requireSelection: true
        },
        translate: {
            id: 'translate',
            label: '翻译',
            category: 'modify',
            input: 'selection',
            output: 'replaceable',
            promptKey: 'translate',
            requireSelection: true
        },
        summarize: {
            id: 'summarize',
            label: '摘要',
            category: 'modify',
            input: 'selection',
            output: 'insert',
            promptKey: 'summarize',
            requireSelection: true
        },
        doc_summary: {
            id: 'doc_summary',
            label: '全文总结',
            category: 'document',
            input: 'document',
            output: 'insert',
            promptKey: 'doc_summary'
        }
    },

    get: function (id) {
        return this._actions[id] || null;
    },

    list: function () {
        var list = [];
        for (var id in this._actions) {
            if (this._actions.hasOwnProperty(id)) list.push(this._actions[id]);
        }
        return list;
    },

    byCategory: function (category) {
        return this.list().filter(function (action) {
            return action.category === category;
        });
    }
};
