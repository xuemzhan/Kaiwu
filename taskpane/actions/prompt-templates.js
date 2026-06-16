/**
 * Prompt templates for Writer actions.
 */
var PromptTemplates = {
    _templates: {
        write: {
            system: '你是一个专业的中文办公写作助手。请直接输出可放入 WPS 文档的正文，不要解释你的过程。',
            user: '请根据以下要求生成一段结构清晰、表达自然的文档内容：\n\n{{input}}'
        },
        cowrite: {
            system: '你是一个专业的中文写作搭档，擅长与用户协作逐步打磨一篇文章。请直接给出可以接续到文档的正文，不要解释。',
            user: '用户希望与你协作撰写一段内容，请基于以下要求先给出第一版正文：\n\n{{input}}'
        },
        continue_write: {
            system: '你是一个专业的续写助手，擅长延续原文语气、逻辑和写作风格。',
            user: '请基于以下文字继续写作，保持风格和逻辑一致。只返回续写内容：\n\n{{input}}'
        },
        imitate: {
            system: '你是一个擅长模仿写作风格的助手，能够精准捕捉原文的语气、用词和结构特征。',
            user: '请参考以下【风格样本】的写作风格（语气、用词、句式），按照【撰写要求】生成新内容。\n\n【风格样本】\n{{input}}\n\n【撰写要求】\n{{question}}'
        },
        polish_quick: {
            system: '你是一个专业的中文写作润色助手。',
            user: '请对以下文字进行润色，保持原意，提升表达质量和可读性。只返回润色后的正文：\n\n{{input}}'
        },
        polish_formal: {
            system: '你是一个正式文书写作助手，擅长办公、公文和商务表达。',
            user: '请将以下文字改写得更加正式、严谨、适合办公文档。保持原意，只返回改写后的正文：\n\n{{input}}'
        },
        polish_government: {
            system: '你熟悉党政机关、公文材料和政务表达风格。',
            user: '请将以下文字调整为更符合党政机关、公文材料的表达风格。保持原意，只返回正文：\n\n{{input}}'
        },
        correct: {
            system: '你是一个中文校对与纠错助手。',
            user: '请修正以下文字中的错别字、病句、标点和明显语法问题。保持原意，只返回修正后的正文：\n\n{{input}}'
        },
        expand: {
            system: '你是一个内容扩写助手，擅长补充细节、论据和表达层次。',
            user: '请对以下内容进行扩写，增加细节、论据和表达层次，保持原文观点不变。只返回扩写后的正文：\n\n{{input}}'
        },
        shrink: {
            system: '你是一个内容压缩助手，擅长提炼重点。',
            user: '请将以下内容缩写为更简洁的版本，保留核心信息。只返回缩写结果：\n\n{{input}}'
        },
        rewrite: {
            system: '你是一个中文改写助手，擅长优化句式和表达方式。',
            user: '请改写以下文字，优化表达方式和句式结构，提升可读性，但保持原意不变。只返回改写后的正文：\n\n{{input}}'
        },
        translate: {
            system: '你是一个专业翻译助手。',
            user: '请翻译以下文字。如果原文是中文，请翻译成英文；如果原文不是中文，请翻译成中文。只返回译文：\n\n{{input}}'
        },
        summarize: {
            system: '你是一个文档摘要助手。',
            user: '请为以下文字生成简洁摘要，提炼核心要点。输出应适合插入文档：\n\n{{input}}'
        },
        doc_summary: {
            system: '你是一个文档总结助手，擅长从长文档中提炼结构和结论。',
            user: '请总结以下文档内容，按“一句话总结、核心要点、结构大纲、行动建议”输出：\n\n{{input}}'
        }
    },

    buildMessages: function (promptKey, context) {
        var tpl = this._templates[promptKey];
        if (!tpl) {
            console.error('[PromptTemplates] Unknown prompt key:', promptKey);
            return [
                { role: 'system', content: '你是一个助手，请根据用户输入回答问题。' },
                { role: 'user', content: context.input || context.question || '请帮我处理这段内容' }
            ];
        }
        context = context || {};
        return [
            { role: 'system', content: this._render(tpl.system, context) },
            { role: 'user', content: this._render(tpl.user, context) }
        ];
    },

    _render: function (text, context) {
        return String(text || '')
            .replace(/\{\{input\}\}/g, context.input || '')
            .replace(/\{\{question\}\}/g, context.question || '');
    }
};
