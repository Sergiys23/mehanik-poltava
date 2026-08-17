МЕХАНІК ПОЛТАВА — ОНОВЛЕННЯ

Файли:
- worker.js — Worker/API, заявки, Telegram, D1, авторизація, роботи, архів, журнал.
- index.html — головна сторінка; клієнтський блок «Наші роботи» напряму завантажує /api/works.
- admin.html — адмін-панель.
- schema.sql — схема бази.

Після заміни файлів зробіть Deploy Worker.

Cloudflare Secrets/Variables:
ADMIN_PASSWORD
SUPERADMIN_PASSWORD
SESSION_SECRET
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID

ВАЖЛИВО: після того як пароль/токен були засвічені в чаті або логах, їх треба перевипустити.
