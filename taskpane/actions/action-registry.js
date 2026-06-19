/**
 * Writer action registry. Ribbon buttons and TaskPane scenario buttons share
 * this table so prompts and behavior stay consistent.
 *
 * 优化点 (F2/F6): 在 action 上声明 temperature / maxTokens / maxHistoryMessages
 * 等覆盖项, AIService 在调用时会优先用 action 的覆盖, 没有再回退到 Config.
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
            placeholder: '输入你想生成的内容，例如：写一份项目周报',
            temperature: 0.8
        },
        cowrite: {
            id: 'cowrite',
            label: '伴写',
            category: 'writing',
            input: 'user',
            output: 'insert',
            promptKey: 'cowrite',
            placeholder: '输入你想协作写的主题，例如：开悟插件的产品介绍',
            temperature: 0.7
        },
        continue_write: {
            id: 'continue_write',
            label: '续写',
            category: 'writing',
            input: 'selection',
            output: 'replaceable',
            promptKey: 'continue_write',
            requireSelection: true,
            temperature: 0.7
        },
        imitate: {
            id: 'imitate',
            label: '仿写',
            category: 'writing',
            input: 'user',
            output: 'insert',
            promptKey: 'imitate',
            placeholder: '请输入要仿写的内容主题（用选中文本作为风格样本）',
            requireSelection: true,
            temperature: 0.8
        },
        polish_quick: {
            id: 'polish_quick',
            label: '快速润色',
            category: 'modify',
            input: 'selection',
            output: 'replaceable',
            promptKey: 'polish_quick',
            requireSelection: true,
            temperature: 0.3
        },
        polish_formal: {
            id: 'polish_formal',
            label: '更正式',
            category: 'modify',
            input: 'selection',
            output: 'replaceable',
            promptKey: 'polish_formal',
            requireSelection: true,
            temperature: 0.3
        },
        polish_government: {
            id: 'polish_government',
            label: '党政风',
            category: 'modify',
            input: 'selection',
            output: 'replaceable',
            promptKey: 'polish_government',
            requireSelection: true,
            temperature: 0.3
        },
        correct: {
            id: 'correct',
            label: '纠错',
            category: 'modify',
            input: 'selection',
            output: 'replaceable',
            promptKey: 'correct',
            requireSelection: true,
            temperature: 0.1
        },
        expand: {
            id: 'expand',
            label: '扩写',
            category: 'modify',
            input: 'selection',
            output: 'replaceable',
            promptKey: 'expand',
            requireSelection: true,
            temperature: 0.6
        },
        shrink: {
            id: 'shrink',
            label: '缩写',
            category: 'modify',
            input: 'selection',
            output: 'replaceable',
            promptKey: 'shrink',
            requireSelection: true,
            temperature: 0.3
        },
        rewrite: {
            id: 'rewrite',
            label: '重写',
            category: 'modify',
            input: 'selection',
            output: 'replaceable',
            promptKey: 'rewrite',
            requireSelection: true,
            temperature: 0.6
        },
        translate: {
            id: 'translate',
            label: '翻译',
            category: 'modify',
            input: 'selection',
            output: 'replaceable',
            promptKey: 'translate',
            requireSelection: true,
            temperature: 0.2
        },
        summarize: {
            id: 'summarize',
            label: '摘要',
            category: 'modify',
            input: 'selection',
            output: 'insert',
            promptKey: 'summarize',
            requireSelection: true,
            temperature: 0.3
        },
        doc_summary: {
            id: 'doc_summary',
            label: '全文总结',
            category: 'document',
            input: 'document',
            output: 'insert',
            promptKey: 'doc_summary',
            temperature: 0.3,
            maxHistoryMessages: 4
        },
        legal: {
            id: 'legal',
            label: '法律助手',
            category: 'specialized',
            input: 'user',
            output: 'result',
            promptKey: 'legal',
            placeholder: '请输入法律问题，例如：合同纠纷的诉讼时效是多久？',
            temperature: 0.3
        },
        gen_image: {
            id: 'gen_image',
            label: 'AI 生成图片',
            category: 'specialized',
            input: 'user',
            output: 'result',
            promptKey: 'gen_image',
            placeholder: '描述你想生成的图片，例如：一只在月光下奔跑的狼',
            temperature: 0.7
        },
        summary_image: {
            id: 'summary_image',
            label: 'AI 总结生图',
            category: 'document',
            input: 'document',
            output: 'result',
            promptKey: 'summary_image',
            temperature: 0.5
        },
        talk_doc: {
            id: 'talk_doc',
            label: 'AI 讲文档',
            category: 'document',
            input: 'document',
            output: 'result',
            promptKey: 'talk_doc',
            temperature: 0.5,
            maxTokens: 2000
        },
        deep_think: {
            id: 'deep_think',
            label: '深度思考',
            category: 'modify',
            input: 'selection',
            output: 'replaceable',
            promptKey: 'deep_think',
            requireSelection: false,
            temperature: 0.7,
            maxTokens: 4000
        },
        menu_deep_think: {
            id: 'menu_deep_think',
            label: '深度思考',
            category: 'modify',
            input: 'selection',
            output: 'replaceable',
            promptKey: 'deep_think',
            requireSelection: false,
            temperature: 0.7,
            maxTokens: 4000
        },
        doc_to_ppt: {
            id: 'doc_to_ppt',
            label: '文档生成PPT',
            category: 'document',
            input: 'document',
            output: 'result',
            promptKey: 'doc_to_ppt',
            temperature: 0.5,
            maxTokens: 3000
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
