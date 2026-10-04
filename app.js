(function () {
  'use strict';

  var CATEGORIES = ['Все', 'Аватарки', 'Товары', 'Обложки', 'Логотипы', 'Пейзажи', 'Интерьеры', 'Видео'];

  var state = {
    prompts: [],
    category: 'Все',
    query: ''
  };

  var els = {
    filters: document.getElementById('filters'),
    grid: document.getElementById('grid'),
    status: document.getElementById('status'),
    search: document.getElementById('search'),
    modal: document.getElementById('modal'),
    modalClose: document.getElementById('modal-close'),
    modalImage: document.getElementById('modal-image'),
    modalCategory: document.getElementById('modal-category'),
    modalTitle: document.getElementById('modal-title'),
    modalModel: document.getElementById('modal-model'),
    modalRatio: document.getElementById('modal-ratio'),
    modalPrompt: document.getElementById('modal-prompt'),
    copyBtn: document.getElementById('copy-btn')
  };

  var lastFocused = null;
  var copyTimer = null;

  function text(value) {
    return value == null ? '' : String(value).trim();
  }

  // Decap CMS сохраняет картинки с путём от корня сайта ("/images/x.png").
  // Убираем ведущий слэш, чтобы путь работал и в подпапке (например, на GitHub Pages).
  function imagePath(value) {
    var path = text(value);
    if (/^(https?:|data:)/i.test(path)) return path;
    return path.replace(/^\/+/, '');
  }

  // Приводим запись к единому виду: в данных из админки поля могут быть пустыми или отсутствовать
  function normalizePrompt(raw) {
    raw = raw || {};
    return {
      id: text(raw.id),
      title: text(raw.title) || 'Без названия',
      category: text(raw.category),
      type: text(raw.type) === 'video' ? 'video' : 'image',
      model: text(raw.model),
      ratio: text(raw.ratio),
      prompt: text(raw.prompt),
      image: imagePath(raw.image)
    };
  }

  function renderFilters() {
    els.filters.innerHTML = '';
    CATEGORIES.forEach(function (name) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter';
      btn.textContent = name;
      btn.setAttribute('aria-pressed', String(name === state.category));
      btn.addEventListener('click', function () {
        state.category = name;
        renderFilters();
        renderGrid();
        els.filters.children[CATEGORIES.indexOf(name)].focus();
      });
      els.filters.appendChild(btn);
    });
  }

  function matches(item) {
    if (state.category !== 'Все' && item.category !== state.category) return false;
    if (!state.query) return true;
    var haystack = [item.title, item.category, item.model, item.prompt].join(' ').toLowerCase();
    return haystack.indexOf(state.query) !== -1;
  }

  function renderGrid() {
    var items = state.prompts.filter(matches);
    els.grid.innerHTML = '';

    items.forEach(function (item) {
      var li = document.createElement('li');
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'card';
      card.setAttribute('aria-label', [item.title, item.category, item.model]
        .filter(Boolean).join(', ') + (item.type === 'video' ? ', видео' : '') + '. Открыть промпт');

      var media = document.createElement('span');
      media.className = 'card__media';
      if (item.image) {
        var img = document.createElement('img');
        img.src = item.image;
        img.alt = '';
        img.loading = 'lazy';
        media.appendChild(img);
      }

      if (item.type === 'video') {
        var badge = document.createElement('span');
        badge.className = 'badge';
        badge.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>Видео';
        media.appendChild(badge);
      }

      var body = document.createElement('span');
      body.className = 'card__body';
      var title = document.createElement('span');
      title.className = 'card__title';
      title.textContent = item.title;
      var meta = document.createElement('span');
      meta.className = 'card__meta';
      var cat = document.createElement('span');
      cat.textContent = item.category;
      var model = document.createElement('span');
      model.textContent = item.model;
      meta.appendChild(cat);
      meta.appendChild(model);
      body.appendChild(title);
      body.appendChild(meta);

      card.appendChild(media);
      card.appendChild(body);
      card.addEventListener('click', function () { openModal(item); });

      li.appendChild(card);
      els.grid.appendChild(li);
    });

    els.status.textContent = items.length
      ? 'Найдено промптов: ' + items.length
      : 'Ничего не найдено. Попробуйте другой запрос или категорию.';
  }

  function openModal(item) {
    lastFocused = document.activeElement;
    els.modalImage.hidden = !item.image;
    if (item.image) els.modalImage.src = item.image;
    else els.modalImage.removeAttribute('src');
    els.modalImage.alt = 'Пример результата: ' + item.title;
    els.modalCategory.textContent = item.type === 'video'
      ? [item.category, 'видео'].filter(Boolean).join(' · ')
      : item.category;
    els.modalTitle.textContent = item.title;
    els.modalModel.textContent = item.model || '—';
    els.modalRatio.textContent = item.ratio || '—';
    els.modalPrompt.textContent = item.prompt;
    resetCopyButton();
    els.modal.showModal();
    els.copyBtn.focus();
  }

  function closeModal() {
    if (els.modal.open) els.modal.close();
  }

  function resetCopyButton() {
    clearTimeout(copyTimer);
    els.copyBtn.textContent = 'Скопировать промпт';
    els.copyBtn.classList.remove('is-done');
  }

  function fallbackCopy(text) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    els.modal.appendChild(area);
    area.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    els.modal.removeChild(area);
    return ok ? Promise.resolve() : Promise.reject(new Error('copy failed'));
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return fallbackCopy(text); });
    }
    return fallbackCopy(text);
  }

  els.copyBtn.addEventListener('click', function () {
    copyText(els.modalPrompt.textContent).then(function () {
      els.copyBtn.textContent = 'Скопировано';
      els.copyBtn.classList.add('is-done');
      copyTimer = setTimeout(resetCopyButton, 2000);
    }, function () {
      els.copyBtn.textContent = 'Не удалось скопировать';
      copyTimer = setTimeout(resetCopyButton, 2000);
    });
  });

  els.modalClose.addEventListener('click', closeModal);

  // Клик по затемнённому фону вокруг окна
  els.modal.addEventListener('click', function (e) {
    if (e.target === els.modal) closeModal();
  });

  // Esc закрывает <dialog> сам; здесь возвращаем фокус на карточку
  els.modal.addEventListener('close', function () {
    if (lastFocused) lastFocused.focus();
  });

  els.search.addEventListener('input', function () {
    state.query = els.search.value.trim().toLowerCase();
    renderGrid();
  });

  renderFilters();

  fetch('data/prompts.json')
    .then(function (res) {
      if (!res.ok) throw new Error(res.status);
      return res.json();
    })
    .then(function (data) {
      var list = Array.isArray(data) ? data : (data && data.prompts);
      state.prompts = (Array.isArray(list) ? list : []).map(normalizePrompt);
      renderGrid();
    })
    .catch(function () {
      els.status.textContent = 'Не удалось загрузить промпты. Откройте сайт через локальный сервер (см. README).';
    });
})();
