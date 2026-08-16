# Механік Полтава

Сайт автосервісу на Cloudflare Workers + GitHub.

## Файли
- `index.html` — повний сайт
- `worker.js` — API відгуків
- `schema.sql` — таблиця Cloudflare D1
- `wrangler.toml` — конфігурація Workers
- `images/logo.png` — залишити у репозиторії

## Cloudflare D1
1. Створи D1 database, наприклад `mehanik-reviews`.
2. Виконай `schema.sql` у SQL Console.
3. У Worker відкрий Bindings → Add binding → D1 Database.
4. Variable name: `DB`.
5. Вибери створену базу.
6. Збережи і зроби новий deployment.

Після цього відгуки будуть спільними для всіх відвідувачів. Нові відгуки записуються з `approved=0`, тобто їх можна модерувати через D1 SQL Console. Для публікації:
`UPDATE reviews SET approved=1 WHERE id=ID;`

Без D1 сайт все одно працює, але форма відгуків використовує локальне сховище браузера як резервний режим.
