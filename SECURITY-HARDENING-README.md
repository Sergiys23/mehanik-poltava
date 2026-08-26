# Mehanik Poltava - Security Hardening

Цей пакет не змінює `worker.js`. Він додає захисний wrapper, який запускається перед основним Worker.

## Що закривається

- 12-годинний TTL адмінської сесії замість 7 днів.
- Rate limit:
  - login: 10 / 10 хв / IP
  - заявки: 5 / 10 хв / IP
  - відгуки: 3 / 10 хв / IP
  - public AI: 20 / 10 хв / IP
  - upload: 20 / год / IP
  - admin AI: 30 / 10 хв / IP
- Superadmin-only:
  - Google Drive OAuth start
  - видалення медіа
  - Telegram setup
  - зміна/видалення відгуків
  - додавання/видалення робіт
  - зміна механіків
  - блокування слотів
  - очищення архіву
- Додаткові security headers.
- Scheduled handler передається оригінальному `worker.js`.

## Важливо

Instagram AI / автоматичний пошук Instagram у цей пакет НЕ входить і не додається.

Після заміни `wrangler.toml` та додавання `security-worker.js` потрібен звичайний Cloudflare Deploy.

Секрети (`SUPERADMIN_PASSWORD`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `GOOGLE_CLIENT_SECRET`, Telegram token тощо) не записуйте у Git.
