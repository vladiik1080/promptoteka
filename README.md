# Промптека

Каталог готовых промптов для нейросетей. Статический сайт без сборки.

## Как открыть

Сайт загружает промпты из `data/prompts.json`, поэтому его нужно открывать через локальный сервер (двойной клик по `index.html` не сработает — браузер запрещает такой загрузке читать файлы).

```bash
cd ~/Documents/promptoteka
python3 -m http.server 8000
```

Затем откройте в браузере http://localhost:8000. Остановить сервер — `Ctrl+C`.

## Структура

- `index.html`, `style.css`, `app.js` — сам сайт
- `data/prompts.json` — все промпты (поля: `id`, `title`, `category`, `type`: `image`|`video`, `model`, `ratio`, `prompt`, `image`)
- `images/` — картинки примеров
