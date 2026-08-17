# Механік Полтава — відновлена версія

## Що є
- головний сайт з 4 основними послугами;
- онлайн-запис;
- D1;
- «Наші роботи» з фото, авто, описом та Instagram;
- відгуки та модерація;
- Telegram для заявок і відгуків;
- видалення повідомлення Telegram при архівації заявки;
- видалення повідомлення Telegram при видаленні відгуку;
- адмінка;
- ролі `admin` та `superadmin`;
- архів заявок;
- журнал дій;
- блокування часу;
- кнопка входу адміністратора на головному сайті.

## Secrets у Cloudflare Workers
Створи:
- `ADMIN_PASSWORD`
- `SUPERADMIN_PASSWORD`
- `SESSION_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Паролі та токени не вставляй у GitHub.

## Важливо
`wrangler.toml` містить placeholder для D1 ID. Не замінюй ID існуючої бази на новий, якщо хочеш зберегти поточні заявки та роботи.

## Deploy
Після завантаження файлів у репозиторій зроби Deploy Worker. D1 binding має називатися `DB`, Assets binding — `ASSETS`.

Worker автоматично створює допоміжні таблиці `booking_telegram`, `review_telegram`, `booking_history`, `admin_logs` та додає до `works` поля `car` і `instagram_url`, якщо їх ще немає.
