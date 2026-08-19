MEHANIK POLTAVA V2 FOUNDATION

Логіка:
- Пн-Сб 09:00-18:00.
- Клієнт вибирає послугу і день, але НЕ час.
- Адмін вибирає механіка і довільний час HH:MM.
- У системі 3 механіки: головний + 2 механіки.
- Мінімальний буфер між роботами одного механіка: 60 хв.
- Uklon і Bolt рахуються як одна категорія Uklon.
- Ціни та норми часу редагуються тільки superadmin.

Перед деплоєм:
1. У Cloudflare D1 мають існувати старі таблиці bookings, booking_telegram, reviews, review_telegram, works, booking_history, admin_logs.
2. Виконати schema.sql для нових таблиць.
3. Додати ADMIN_PASSWORD, SUPERADMIN_PASSWORD, SESSION_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
4. Замінити public/images/logo.png і public/images/mechanic.png реальними зображеннями СТО.

Це перший пакет архітектури. Перед заміною production worker треба звірити існуючі Cloudflare bindings/wrangler.toml.
