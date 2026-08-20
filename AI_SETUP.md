# Workers AI для Механік Полтава

1. У Cloudflare Worker вже створено binding `AI`.
2. `wrangler.toml` містить `[ai] binding = "AI"`.
3. `worker.js` додає захищений `POST /api/admin/ai`.
4. Маршрут доступний лише авторизованому admin/superadmin.
5. Адмінка має вкладку `🤖 AI-помічник`.
6. Можна вказати № заявки, щоб AI отримав безпечний контекст заявки.

AI не ставить остаточний діагноз і не замінює механіка.
Модель: `@cf/meta/llama-3.1-8b-instruct-fast`.
