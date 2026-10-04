(function () {
  'use strict';

  // Разметка страниц готовится скриптом build.js; здесь только поведение:
  // копирование промпта, фильтры и поиск на главной, окно с промптом.

  // ---------- Копирование ----------

  var COPY_LABEL = 'Скопировать промпт';

  function fallbackCopy(text, container) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    container.appendChild(area);
    area.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    container.removeChild(area);
    return ok ? Promise.resolve() : Promise.reject(new Error('copy failed'));
  }

  function copyText(text, container) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return fallbackCopy(text, container); });
    }
    return fallbackCopy(text, container);
  }

  function resetCopyButton(btn) {
    clearTimeout(btn._copyTimer);
    btn.textContent = COPY_LABEL;
    btn.classList.remove('is-done');
  }

  function showCopyResult(btn, label, done) {
    btn.textContent = label;
    btn.classList.toggle('is-done', done);
    btn._copyTimer = setTimeout(function () { resetCopyButton(btn); }, 2000);
  }

  // Кнопка с data-copy="id" копирует текст элемента с этим id
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-copy]');
    if (!btn) return;
    var source = document.getElementById(btn.getAttribute('data-copy'));
    if (!source) return;
    clearTimeout(btn._copyTimer);
    // Внутри открытого <dialog> вспомогательное поле должно лежать в нём самом
    var container = btn.closest('dialog') || document.body;
    copyText(source.textContent, container).then(function () {
      showCopyResult(btn, 'Скопировано', true);
    }, function () {
      showCopyResult(btn, 'Не удалось скопировать', false);
    });
  });

  // ---------- Фильтры и поиск (главная) ----------

  function initCatalog() {
    var grid = document.getElementById('grid');
    var filters = document.getElementById('filters');
    var search = document.getElementById('search');
    var status = document.getElementById('status');
    if (!grid || !filters) return;

    var items = Array.prototype.slice.call(grid.children);
    var category = '*';
    var query = '';

    function apply() {
      var count = 0;
      items.forEach(function (li) {
        var visible = (category === '*' || li.getAttribute('data-category') === category) &&
          (!query || (li.getAttribute('data-search') || '').indexOf(query) !== -1);
        li.hidden = !visible;
        if (visible) count++;
      });
      if (status) {
        status.textContent = count
          ? 'Найдено промптов: ' + count
          : 'Ничего не найдено. Попробуйте другой запрос или категорию.';
      }
    }

    filters.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-category]');
      if (!btn) return;
      category = btn.getAttribute('data-category');
      Array.prototype.forEach.call(filters.querySelectorAll('button[data-category]'), function (b) {
        b.setAttribute('aria-pressed', String(b === btn));
      });
      apply();
    });

    if (search) {
      search.addEventListener('input', function () {
        query = search.value.trim().toLowerCase();
        apply();
      });
      // Браузер может восстановить текст поиска при возврате на страницу
      if (search.value) {
        query = search.value.trim().toLowerCase();
        apply();
      }
    }
  }

  // ---------- Окно с промптом (главная и категории) ----------

  function initModal() {
    var modal = document.getElementById('modal');
    var dataEl = document.getElementById('prompts-data');
    // Без поддержки <dialog> карточки остаются обычными ссылками на страницы промптов
    if (!modal || !dataEl || typeof modal.showModal !== 'function') return;

    var byId = {};
    try {
      JSON.parse(dataEl.textContent).forEach(function (item) { byId[item.id] = item; });
    } catch (e) {
      return;
    }

    var els = {
      close: document.getElementById('modal-close'),
      image: document.getElementById('modal-image'),
      category: document.getElementById('modal-category'),
      title: document.getElementById('modal-title'),
      model: document.getElementById('modal-model'),
      ratio: document.getElementById('modal-ratio'),
      prompt: document.getElementById('modal-prompt'),
      copy: document.getElementById('modal-copy'),
      link: document.getElementById('modal-link')
    };
    var lastFocused = null;

    function open(item, trigger) {
      lastFocused = trigger;
      els.image.hidden = !item.image;
      if (item.image) {
        els.image.src = item.image;
        els.image.alt = (item.type === 'video' ? 'Кадр из видео: ' : 'Пример изображения: ') + item.title;
      } else {
        els.image.removeAttribute('src');
        els.image.alt = '';
      }
      // Подпись категории (с пометкой «видео», если нужно) готовит build.js
      els.category.textContent = item.category;
      els.category.hidden = !item.category;
      els.title.textContent = item.title;
      els.model.textContent = item.model || '—';
      els.ratio.textContent = item.ratio || '—';
      els.prompt.textContent = item.prompt;
      els.link.href = item.url;
      resetCopyButton(els.copy);
      modal.showModal();
      els.copy.focus();
    }

    // Обычный клик по карточке открывает окно; с Ctrl/Cmd/Shift или средней кнопкой — страницу промпта
    document.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var link = e.target.closest('a.card[data-id]');
      if (!link) return;
      var item = byId[link.getAttribute('data-id')];
      if (!item) return;
      e.preventDefault();
      open(item, link);
    });

    els.close.addEventListener('click', function () { modal.close(); });

    // Клик по затемнённому фону вокруг окна
    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.close();
    });

    // Esc закрывает <dialog> сам; здесь возвращаем фокус на карточку
    modal.addEventListener('close', function () {
      if (lastFocused) lastFocused.focus();
    });
  }

  initCatalog();
  initModal();
})();
