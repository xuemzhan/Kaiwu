/**
 * Result cards for scenario-based Writer actions.
 */
var ResultCard = {
  _cards: {},
  _latestId: null,
  _renderTimer: null,

  create: function (options, opts) {
    var id = 'result_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    var card = {
      id: id,
      actionId: options.actionId,
      actionLabel: options.actionLabel,
      sourceType: options.sourceType || 'selection',
      sourceText: options.sourceText || '',
      resultText: '',
      status: 'pending',
      error: '',
      createdAt: Date.now(),
    };
    this._cards[id] = card;
    this._latestId = id;
    if (!opts || opts.render !== false) {
      this.render();
    }
    return card;
  },

  update: function (id, patch) {
    if (!this._cards[id]) return;
    Object.assign(this._cards[id], patch || {});
    this._scheduleRender();
  },

  append: function (id, fullContent) {
    this.update(id, { resultText: fullContent || '', status: 'streaming' });
  },

  complete: function (id, text) {
    this.update(id, { resultText: text || '', status: 'done' });
  },

  fail: function (id, error) {
    this.update(id, { status: 'error', error: error || '生成失败' });
  },

  latest: function () {
    return this._cards[this._latestId] || null;
  },

  render: function () {
    var container = document.getElementById('resultContainer');
    if (!container) return;
    var cards = [];
    for (var id in this._cards) {
      if (this._cards.hasOwnProperty(id)) cards.push(this._cards[id]);
    }
    cards.sort(function (a, b) {
      return b.createdAt - a.createdAt;
    });
    container.innerHTML = cards.map(this._renderCard.bind(this)).join('');
    this._postRender();
  },

  _renderCard: function (card) {
    var statusText =
      {
        pending: '等待生成',
        streaming: '生成中',
        done: '已完成',
        error: '失败',
      }[card.status] || card.status;
    var content = card.error
      ? '<div class="result-error">' + KwUtils.escapeHtml(card.error) + '</div>'
      : this._renderMarkdown(card.resultText || '正在准备...');
    var canApply = card.status === 'done' && !!card.resultText;
    var icons =
      typeof ResultPanel !== 'undefined' && ResultPanel._icons
        ? ResultPanel._icons
        : {
            replace: '↻',
            insert: '↵',
            copy: '⎘',
            clear: '✕',
          };
    return (
      '' +
      '<section class="result-card" data-card-id="' +
      KwUtils.escapeAttr(card.id) +
      '">' +
      '  <div class="result-card-header">' +
      '    <div>' +
      '      <div class="result-title">' +
      KwUtils.escapeHtml(card.actionLabel) +
      '</div>' +
      '      <div class="result-meta">' +
      KwUtils.escapeHtml(this._sourceLabel(card)) +
      ' · ' +
      statusText +
      '</div>' +
      '    </div>' +
      '    <button class="result-icon-btn" title="重新生成" data-kw-action="regenerate" data-card-id="' +
      KwUtils.escapeAttr(card.id) +
      '">' +
      icons.regenerate +
      '</button>' +
      '  </div>' +
      '  <div class="result-content markdown-body">' +
      content +
      '</div>' +
      '  <div class="result-actions">' +
      '    <button class="result-icon-btn result-icon-btn-primary" title="替换原文" ' +
      (canApply ? '' : 'disabled') +
      ' data-kw-action="replace" data-card-id="' +
      KwUtils.escapeAttr(card.id) +
      '">' +
      icons.replace +
      '</button>' +
      '    <button class="result-icon-btn" title="插入光标" ' +
      (canApply ? '' : 'disabled') +
      ' data-kw-action="insert" data-card-id="' +
      KwUtils.escapeAttr(card.id) +
      '">' +
      icons.insert +
      '</button>' +
      '    <button class="result-icon-btn" title="复制" ' +
      (canApply ? '' : 'disabled') +
      ' data-kw-action="copy" data-card-id="' +
      KwUtils.escapeAttr(card.id) +
      '">' +
      icons.copy +
      '</button>' +
      '    <button class="result-icon-btn result-icon-btn-danger" title="删除" data-kw-action="clear" data-card-id="' +
      KwUtils.escapeAttr(card.id) +
      '">' +
      icons.clear +
      '</button>' +
      '  </div>' +
      '</section>'
    );
  },

  replaceOriginal: function (id) {
    var card = this._cards[id];
    if (!card || !card.resultText) return;
    var result = WriterAdapter.replaceSelection(
      this._cleanResult(card.resultText),
      card.sourceText
    );
    KwToast.show(result.ok ? '已替换原文' : result.reason);
  },

  insertAtCursor: function (id) {
    var card = this._cards[id];
    if (!card || !card.resultText) return;
    var ok = WriterAdapter.insertAtCursor(this._cleanResult(card.resultText));
    KwToast.show(ok ? '已插入光标位置' : '插入失败，请手动复制');
  },

  copy: function (id) {
    var card = this._cards[id];
    if (!card || !card.resultText) return;
    KwUtils.copyToClipboard(this._cleanResult(card.resultText)).then(function () {
      KwToast.show('已复制');
    });
  },

  regenerate: function (id) {
    var card = this._cards[id];
    if (!card || typeof ActionRunner === 'undefined') return;
    ActionRunner.run(card.actionId, { reuseInput: card.sourceText });
  },

  _sourceLabel: function (card) {
    if (card.sourceType === 'document') return '全文 ' + (card.sourceText || '').length + ' 字';
    if (card.sourceType === 'user') return '用户输入';
    return '选区 ' + (card.sourceText || '').length + ' 字';
  },

  _cleanResult: function (text) {
    return KwUtils.cleanResult(text);
  },

  _renderMarkdown: function (text) {
    if (typeof KwMarkdown !== 'undefined') {
      return KwMarkdown.render(text);
    }
    if (typeof MessageRenderer !== 'undefined' && MessageRenderer._legacyRenderMarkdown) {
      return MessageRenderer._legacyRenderMarkdown(text);
    }
    return '<p>' + KwUtils.escapeHtml(text) + '</p>';
  },

  _postRender: function () {
    if (typeof ChatUI !== 'undefined' && ChatUI._postRender) {
      ChatUI._postRender();
    }
  },

  _scheduleRender: function () {
    if (this._renderTimer) return;
    var self = this;
    this._renderTimer = setTimeout(function () {
      self._renderTimer = null;
      if (
        typeof ResultPanel !== 'undefined' &&
        ResultPanel._activeMount &&
        ResultPanel._activeCard
      ) {
        var card = self._cards[ResultPanel._activeCard.id];
        if (card) {
          ResultPanel.update(card, ResultPanel._activeMount, {
            streaming: card.status === 'streaming',
            forceFull: true,
          });
        }
      } else {
        self.render();
      }
      // Resolve the test-facing wait promise (if any) AFTER the DOM mutation.
      if (self._renderPromise) {
        var p = self._renderPromise;
        self._renderPromise = null;
        p.resolve();
      }
    }, 80);
  },

  get: function (id) {
    return this._cards[id] || null;
  },

  remove: function (id) {
    if (!this._cards[id]) return;
    delete this._cards[id];
    this._scheduleRender();
  },
};

/**
 * Test-only API. Install via:
 *   require('./_setup.js').installTestHooks(window);
 * from the test file, which calls this with a non-enumerable descriptor so
 * the helper is hidden from `for..in` / `Object.keys()` and never appears in
 * the production ResultCard's public surface.
 *
 * Returns a Promise that resolves after the next debounced render completes.
 * If no render is scheduled, this schedules one — DO NOT call from production
 * code (it would cause a wasted full re-render).
 */
function _installWhenRendered(target) {
  Object.defineProperty(target, 'whenRendered', {
    value: function () {
      var self = this;
      if (!self._renderPromise) {
        self._renderPromise = {};
        self._renderPromise.promise = new Promise(function (resolve) {
          self._renderPromise.resolve = resolve;
        });
        // If a render is already in flight, the promise resolves when it
        // completes. If not, schedule a render so the promise has something
        // to wait for.
        if (!self._renderTimer) {
          self._scheduleRender();
        }
      }
      return self._renderPromise.promise;
    },
    enumerable: false,
    configurable: true,
    writable: false,
  });
}

// Test-only API installer. Export to the test setup so tests can
// install whenRendered() on ResultCard under their own control. Production
// code NEVER touches this; see _setup.js#installTestHelpers().
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _installWhenRendered;
}
