# Промптека

Каталог готовых промптов для нейросетей. Страницы собираются из данных скриптом `build.js` (Node.js, без зависимостей) в папку `dist/`.

## Как собрать и открыть локально

Нужен Node.js 18 или новее.

```bash
cd ~/Documents/promptoteka
node build.js
python3 -m http.server 8000 -d dist
```

Затем откройте http://localhost:8000. Остановить сервер — `Ctrl+C`. После правок в данных, стилях или `app.js` снова запустите `node build.js`.

## Структура

- `build.js` — сборка: главная, страницы промптов `/prompt/<id>/`, страницы категорий `/category/<slug>/`, `404.html`, `sitemap.xml`, `robots.txt`
- `data/prompts.json` — все промпты (поля: `id`, `title`, `category`, `type`: `image`|`video`, `model`, `ratio`, `prompt`, `image`)
- `data/categories.json` — категории: название, латинский `slug` для адреса, заголовок и описание страницы
- `style.css`, `app.js` — оформление и поведение (копирование, фильтры, поиск, окно с промптом)
- `images/` — картинки примеров
- `admin/` — админка Decap CMS, копируется в `dist/admin/`
- `netlify.toml` — настройки сборки на Netlify

Адрес сайта для canonical, Open Graph и sitemap берётся из переменной `URL`, которую передаёт Netlify, или из `SITE_URL`. Если обеих нет, используется `https://promptoteka.netlify.app`.

## Проверки при сборке

Сборка останавливается с ошибкой, если у промпта пустой или неправильный `id` (нужны маленькие латинские буквы, цифры и дефис) или такой `id` уже есть у другого промпта. Предупреждения (сборка продолжается): категория не найдена в `data/categories.json`, файл картинки отсутствует.

## Админка (Decap CMS)

- Открывается по адресу `/admin/`. Закрыта от индексации: `robots.txt`, `<meta name="robots">` и заголовок `X-Robots-Tag` в `netlify.toml`.
- `admin/config.yml` — репозиторий `vladiik1080/promptoteka`, ветка `main`, коллекция «Промпты» редактирует `data/prompts.json`. Каждое сохранение — коммит, после которого Netlify пересобирает сайт.
- Загруженные картинки сохраняются в `images/`, в JSON записывается путь вида `/images/имя.png`.
- Новую категорию добавляйте в два файла: `data/categories.json` (со slug и описанием) и список `options` поля «Категория» в `admin/config.yml`.
- Вход через GitHub требует OAuth-сервиса (на Netlify — через OAuth-приложение GitHub).
