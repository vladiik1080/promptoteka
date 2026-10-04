#!/usr/bin/env node
// Сборка статического сайта из data/*.json в папку dist/.
// Запуск: node build.js. Внешних зависимостей нет.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const SITE_NAME = 'Промптека';
// Netlify сам передаёт адрес сайта в переменной URL; SITE_URL позволяет задать его вручную
const SITE_URL = (process.env.SITE_URL || process.env.URL || 'https://promptoteka.netlify.app').replace(/\/+$/, '');
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RELATED_LIMIT = 4;
const COPY_FILES = ['style.css', 'app.js'];
const COPY_DIRS = ['images', 'admin'];

const HOME = {
  title: 'Промптека — готовые промпты для изображений и видео',
  description: 'Каталог готовых промптов для изображений и видео: Midjourney, DALL·E, Stable Diffusion, Sora и другие нейросети. Выберите пример и скопируйте промпт.',
  h1: 'Готовые промпты для изображений и видео',
  subtitle: 'Выберите пример, скопируйте промпт и вставьте его в свою нейросеть — Midjourney, DALL·E, Stable Diffusion, Sora и другие.'
};

// ---------- Утилиты ----------

function fail(message) {
  console.error('Ошибка сборки: ' + message);
  process.exit(1);
}

function warn(message) {
  console.warn('Внимание: ' + message);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  } catch (e) {
    fail(`не удалось прочитать ${file}: ${e.message}`);
  }
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc(value) {
  return text(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

// JSON внутри <script>: экранируем "<", чтобы текст промпта не мог закрыть тег
function jsonForScript(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

// Decap CMS сохраняет путь от корня сайта ("/images/x.png"); старые записи могли быть без слэша
function imagePath(value) {
  const p = text(value);
  if (!p || /^(https?:|data:)/i.test(p)) return p;
  return '/' + p.replace(/^\/+/, '');
}

function absUrl(p) {
  return /^https?:/i.test(p) ? p : SITE_URL + p;
}

function truncate(value, max) {
  const s = text(value).replace(/\s+/g, ' ');
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:—-]+$/, '') + '…';
}

function plural(n, forms) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

function countPrompts(n) {
  return n + ' ' + plural(n, ['промпт', 'промпта', 'промптов']);
}

// ---------- Данные ----------

const categories = (readJson('data/categories.json').categories || []).map((c) => ({
  name: text(c.name),
  slug: text(c.slug),
  title: text(c.title) || 'Промпты: ' + text(c.name),
  description: text(c.description)
}));
const categoryByName = new Map(categories.map((c) => [c.name, c]));

categories.forEach((c) => {
  if (!ID_PATTERN.test(c.slug)) fail(`у категории «${c.name}» slug «${c.slug}» — нужны маленькие латинские буквы, цифры и дефис`);
});

const rawData = readJson('data/prompts.json');
const rawList = Array.isArray(rawData) ? rawData : rawData && rawData.prompts;
if (!Array.isArray(rawList)) fail('в data/prompts.json нет списка "prompts"');

const prompts = rawList.map((raw) => {
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
});

const seenIds = new Set();
prompts.forEach((p, i) => {
  const where = `промпт №${i + 1} («${p.title}»)`;
  if (!p.id) fail(`${where}: не заполнен id`);
  if (!ID_PATTERN.test(p.id)) fail(`${where}: id «${p.id}» — нужны маленькие латинские буквы, цифры и дефис`);
  if (seenIds.has(p.id)) fail(`${where}: id «${p.id}» уже есть у другого промпта`);
  seenIds.add(p.id);
  p.cat = categoryByName.get(p.category) || null;
  if (!p.cat) warn(`${where}: категории «${p.category}» нет в data/categories.json, страница категории для неё не создаётся`);
  if (p.image.startsWith('/') && !fs.existsSync(path.join(ROOT, p.image))) warn(`${where}: файл ${p.image} не найден`);
});

const promptsByCategory = new Map(categories.map((c) => [c.name, prompts.filter((p) => p.category === c.name)]));
const usedCategories = categories.filter((c) => promptsByCategory.get(c.name).length > 0);

function promptPath(p) {
  return `/prompt/${p.id}/`;
}

function categoryPath(c) {
  return `/category/${c.slug}/`;
}

// Пометка «видео» рядом с категорией, если сама категория не «Видео»
function needsVideoMark(p) {
  return p.type === 'video' && p.category.toLowerCase() !== 'видео';
}

function altText(p) {
  return (p.type === 'video' ? 'Кадр из видео: ' : 'Пример изображения: ') + p.title;
}

// ---------- Фрагменты разметки ----------

const VIDEO_BADGE = '<span class="badge"><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>Видео</span>';

function card(p, index, headingLevel) {
  const h = 'h' + headingLevel;
  const search = [p.title, p.category, p.model, p.prompt].join(' ').toLowerCase();
  const img = p.image
    ? `<img src="${esc(p.image)}" alt="${esc(altText(p))}" width="400" height="500"${index >= 4 ? ' loading="lazy"' : ''}>`
    : '';
  const meta = [p.category, p.model].filter(Boolean).map((m) => `<span>${esc(m)}</span>`).join('');
  return `<li data-category="${esc(p.category)}" data-search="${esc(search)}">
          <a class="card" href="${promptPath(p)}" data-id="${esc(p.id)}">
            <div class="card__media">${img}${p.type === 'video' ? VIDEO_BADGE : ''}</div>
            <div class="card__body">
              <${h} class="card__title">${esc(p.title)}</${h}>
              <div class="card__meta">${meta}</div>
            </div>
          </a>
        </li>`;
}

function grid(list, headingLevel, id) {
  return `<ul class="grid"${id ? ` id="${id}"` : ''}>
        ${list.map((p, i) => card(p, i, headingLevel)).join('\n        ')}
      </ul>`;
}

// items: [{ name, path }], последний пункт — текущая страница
function breadcrumbs(items) {
  const html = `<nav class="breadcrumbs container" aria-label="Хлебные крошки">
      <ol>
        ${items.map((item, i) => (i === items.length - 1
          ? `<li><span aria-current="page">${esc(item.name)}</span></li>`
          : `<li><a href="${item.path}">${esc(item.name)}</a></li>`)).join('\n        ')}
      </ol>
    </nav>`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absUrl(item.path)
    }))
  };
  return { html, jsonLd };
}

function categoryNav(current) {
  return `<nav class="filters" aria-label="Категории">
        ${usedCategories.map((c) => `<a class="filter" href="${categoryPath(c)}"${c === current ? ' aria-current="page"' : ''}>${esc(c.name)}</a>`).join('\n        ')}
      </nav>`;
}

// Окно с промптом для главной и страниц категорий; данные берутся из встроенного JSON
function modal(list) {
  const data = list.map((p) => ({
    id: p.id,
    title: p.title,
    category: p.category,
    type: p.type,
    model: p.model,
    ratio: p.ratio,
    prompt: p.prompt,
    image: p.image,
    url: promptPath(p)
  }));
  return `<dialog class="modal" id="modal" aria-labelledby="modal-title">
    <div class="modal__inner">
      <button class="modal__close" type="button" id="modal-close" aria-label="Закрыть">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
      <div class="modal__media">
        <img id="modal-image" src="" alt="" hidden>
      </div>
      <div class="modal__body">
        <p class="modal__category" id="modal-category"></p>
        <h2 class="modal__title" id="modal-title"></h2>
        <dl class="modal__meta">
          <div><dt>Нейросеть</dt><dd id="modal-model"></dd></div>
          <div><dt>Формат</dt><dd id="modal-ratio"></dd></div>
        </dl>
        <p class="modal__label">Промпт</p>
        <p class="modal__prompt" id="modal-prompt"></p>
        <div class="actions">
          <button class="btn" type="button" id="modal-copy" data-copy="modal-prompt">Скопировать промпт</button>
          <a class="link" id="modal-link" href="/">Открыть страницу промпта</a>
        </div>
      </div>
    </div>
  </dialog>
  <script type="application/json" id="prompts-data">${jsonForScript(data)}</script>`;
}

function layout(page) {
  const canonical = absUrl(page.path);
  const ogImage = page.image ? absUrl(page.image) : '';
  const jsonLd = page.jsonLd ? `\n  <script type="application/ld+json">${jsonForScript(page.jsonLd)}</script>` : '';
  const isHome = page.path === '/';
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(page.title)}</title>
  <meta name="description" content="${esc(page.description)}">${page.noindex ? '\n  <meta name="robots" content="noindex">' : `
  <link rel="canonical" href="${esc(canonical)}">`}
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:locale" content="ru_RU">
  <meta property="og:type" content="${page.ogType || 'website'}">
  <meta property="og:title" content="${esc(page.ogTitle || page.title)}">
  <meta property="og:description" content="${esc(page.description)}">
  <meta property="og:url" content="${esc(canonical)}">${ogImage ? `
  <meta property="og:image" content="${esc(ogImage)}">
  <meta property="og:image:alt" content="${esc(page.imageAlt || page.title)}">
  <meta name="twitter:card" content="summary_large_image">` : ''}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Unbounded:wght@500;700&display=swap&subset=cyrillic" rel="stylesheet">
  <link rel="stylesheet" href="/style.css">${jsonLd}
</head>
<body>
  <a class="skip-link" href="#content">Перейти к содержимому</a>

  <header class="header">
    <div class="container header__inner">
      <a class="logo" href="/" aria-label="${SITE_NAME} — на главную">
        <span class="logo__mark" aria-hidden="true">П</span>
        <span class="logo__text">${SITE_NAME}</span>
      </a>
      <nav class="nav" aria-label="Основное меню">
        <a class="nav__link is-active" href="/"${isHome ? ' aria-current="page"' : ''}>Каталог</a>
        <a class="nav__link" href="#">Конструктор</a>
        <a class="nav__link" href="#">Гайды</a>
      </nav>
    </div>
  </header>

  <main id="content">
    ${page.body}
  </main>

  <footer class="footer">
    <div class="container">
      <nav class="footer__nav" aria-label="Категории промптов">
        ${usedCategories.map((c) => `<a href="${categoryPath(c)}">${esc(c.title)}</a>`).join('\n        ')}
      </nav>
      <p class="footer__copy">© ${SITE_NAME}</p>
    </div>
  </footer>
  ${page.modal || ''}
  <script src="/app.js"></script>
</body>
</html>
`;
}

// ---------- Страницы ----------

function homePage() {
  const filters = [{ label: 'Все', value: 'Все' }].concat(categories.map((c) => ({ label: c.name, value: c.name })));
  const body = `<section class="hero container">
      <h1 class="hero__title">${esc(HOME.h1)}</h1>
      <p class="hero__subtitle">${esc(HOME.subtitle)}</p>
      <div class="search">
        <label class="visually-hidden" for="search">Поиск промптов</label>
        <svg class="search__icon" aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input class="search__input" id="search" type="search" placeholder="Например: логотип, горы, Midjourney" autocomplete="off">
      </div>
    </section>

    <section class="catalog container" id="catalog" aria-labelledby="catalog-title">
      <h2 class="visually-hidden" id="catalog-title">Каталог промптов</h2>
      <div class="filters" role="group" aria-label="Фильтр по категориям" id="filters">
        ${filters.map((f, i) => `<button class="filter" type="button" data-category="${esc(f.value)}" aria-pressed="${i === 0}">${esc(f.label)}</button>`).join('\n        ')}
      </div>
      <p class="catalog__status" id="status" role="status" aria-live="polite">Найдено промптов: ${prompts.length}</p>
      ${grid(prompts, 3, 'grid')}
    </section>`;
  return layout({
    path: '/',
    title: HOME.title,
    description: HOME.description,
    image: (prompts.find((p) => p.image) || {}).image,
    imageAlt: HOME.h1,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_NAME,
      url: SITE_URL + '/',
      inLanguage: 'ru'
    },
    body,
    modal: modal(prompts)
  });
}

function categoryPage(c) {
  const list = promptsByCategory.get(c.name);
  const crumbs = breadcrumbs([{ name: 'Главная', path: '/' }, { name: c.name, path: categoryPath(c) }]);
  const body = `${crumbs.html}

    <section class="page-head container">
      <h1 class="page-head__title">${esc(c.title)}</h1>
      <p class="page-head__text">${esc(c.description)}</p>
    </section>

    <section class="catalog container" aria-label="${esc(c.title)}">
      ${categoryNav(c)}
      <p class="catalog__status">${countPrompts(list.length)} в категории</p>
      ${grid(list, 2, 'grid')}
    </section>`;
  return layout({
    path: categoryPath(c),
    title: `${c.title} — ${countPrompts(list.length)} с примерами | ${SITE_NAME}`,
    ogTitle: c.title,
    description: truncate(`${c.description} ${countPrompts(list.length)} с примерами результата.`, 160),
    image: (list.find((p) => p.image) || {}).image,
    imageAlt: c.title,
    jsonLd: crumbs.jsonLd,
    body,
    modal: modal(list)
  });
}

function promptPage(p) {
  const trail = [{ name: 'Главная', path: '/' }];
  if (p.cat) trail.push({ name: p.cat.name, path: categoryPath(p.cat) });
  trail.push({ name: p.title, path: promptPath(p) });
  const crumbs = breadcrumbs(trail);

  const related = p.cat
    ? promptsByCategory.get(p.cat.name).filter((r) => r !== p).slice(0, RELATED_LIMIT)
    : [];
  const relatedHtml = related.length
    ? `

    <section class="related container" aria-labelledby="related-title">
      <h2 class="related__title" id="related-title">Похожие промпты</h2>
      ${grid(related, 3)}
    </section>`
    : '';

  const categoryLabel = p.cat
    ? `<a href="${categoryPath(p.cat)}">${esc(p.category)}</a>`
    : esc(p.category);

  const body = `${crumbs.html}

    <article class="prompt container">
      <div class="prompt__media">
        ${p.image ? `<img src="${esc(p.image)}" alt="${esc(altText(p))}" width="400" height="500">` : ''}${p.type === 'video' ? VIDEO_BADGE : ''}
      </div>
      <div class="prompt__body">
        <p class="prompt__category">${categoryLabel}${needsVideoMark(p) ? ' · видео' : ''}</p>
        <h1 class="prompt__title">${esc(p.title)}</h1>
        <dl class="modal__meta">
          <div><dt>Нейросеть</dt><dd>${esc(p.model) || '—'}</dd></div>
          <div><dt>Формат</dt><dd>${esc(p.ratio) || '—'}</dd></div>
        </dl>
        <p class="modal__label">Промпт</p>
        <p class="modal__prompt" id="prompt-text">${esc(p.prompt)}</p>
        <button class="btn" type="button" data-copy="prompt-text">Скопировать промпт</button>
      </div>
    </article>${relatedHtml}`;

  const lead = p.model
    ? `Готовый промпт для ${p.model}${p.ratio ? ` (${p.ratio})` : ''}: `
    : 'Готовый промпт: ';
  return layout({
    path: promptPath(p),
    title: p.model ? `${p.title} — промпт для ${p.model} | ${SITE_NAME}` : `${p.title} — готовый промпт | ${SITE_NAME}`,
    ogTitle: p.title,
    ogType: 'article',
    description: lead + truncate(p.prompt, Math.max(60, 160 - lead.length)),
    image: p.image,
    imageAlt: altText(p),
    jsonLd: crumbs.jsonLd,
    body: body
  });
}

function notFoundPage() {
  return layout({
    path: '/404.html',
    title: `Страница не найдена | ${SITE_NAME}`,
    description: 'Такой страницы нет. Перейдите в каталог промптов.',
    noindex: true,
    body: `<section class="page-head container">
      <h1 class="page-head__title">Страница не найдена</h1>
      <p class="page-head__text">Возможно, промпт удалили или ссылка набрана с ошибкой. <a href="/">Перейти в каталог</a></p>
    </section>`
  });
}

function sitemap(paths) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${esc(absUrl(p))}</loc></url>`).join('\n')}
</urlset>
`;
}

function robots() {
  return `User-agent: *
Disallow: /admin/

Sitemap: ${SITE_URL}/sitemap.xml
`;
}

// ---------- Запись файлов ----------

function write(relPath, content) {
  const file = path.join(DIST, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST);

COPY_FILES.forEach((f) => fs.copyFileSync(path.join(ROOT, f), path.join(DIST, f)));
COPY_DIRS.forEach((d) => fs.cpSync(path.join(ROOT, d), path.join(DIST, d), { recursive: true }));

write('index.html', homePage());
usedCategories.forEach((c) => write(`category/${c.slug}/index.html`, categoryPage(c)));
prompts.forEach((p) => write(`prompt/${p.id}/index.html`, promptPage(p)));
write('404.html', notFoundPage());

const urls = ['/']
  .concat(usedCategories.map(categoryPath))
  .concat(prompts.map(promptPath));
write('sitemap.xml', sitemap(urls));
write('robots.txt', robots());

console.log(`Готово: ${prompts.length} промптов, ${usedCategories.length} категорий, ${urls.length} адресов в sitemap.xml → dist/ (адрес сайта: ${SITE_URL})`);
