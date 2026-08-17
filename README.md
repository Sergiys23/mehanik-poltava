# Механік Полтава

Повна версія сайту автосервісу з:
- відгуками з модерацією;
- онлайн-записом;
- адмін-панеллю;
- D1.

## Файли
- `index.html` — сайт
- `admin.html` — адмінка
- `worker.js` — API Worker
- `schema.sql` — таблиці D1
- `wrangler.toml` — Cloudflare Assets
- `images/logo.png` — логотип

## Cloudflare
У Worker має бути:
- Assets binding: `ASSETS`
- D1 binding: `DB` → `mehanik-reviews`
- Secret: `ADMIN_PASSWORD`

## D1
Якщо таблиця `bookings` ще не створена, виконай `schema.sql` у D1 Console. Існуюча таблиця `reviews` не видаляється.

## Важливо
Не зберігай пароль адміністратора в GitHub. Файл `Passwordd` навмисно не включений у ZIP.
