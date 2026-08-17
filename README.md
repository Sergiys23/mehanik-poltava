# Механік Полтава — сайт СТО

Готовий каркас сайту СТО з:
- головною сторінкою;
- 4 основними послугами;
- календарем доступності;
- онлайн-записом;
- клієнтськими заявками;
- адмін-панеллю;
- реальним збереженням через Cloudflare D1;
- API на Cloudflare Workers.

## Запуск

1. Встановити Node.js.
2. Встановити Wrangler:
   `npm install`
3. Створити D1 базу:
   `npx wrangler d1 create mehanik-db`
4. Вставити отриманий `database_id` у `wrangler.toml`.
5. Створити таблиці:
   `npx wrangler d1 execute mehanik-db --remote --file=schema.sql`
6. Запустити локально:
   `npm run dev`
7. Деплой:
   `npm run deploy`

## Важливо

У `worker.js` потрібно змінити ADMIN_PASSWORD перед публічним запуском.
Для продакшену пароль краще винести в Cloudflare Secret:

`npx wrangler secret put ADMIN_PASSWORD`

Також перевірити адресу, графік, телефон та посилання Instagram у `config.js`.
