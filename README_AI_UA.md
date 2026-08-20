
# Механік Полтава — Workers AI module

Це окремий безпечний модуль для підключення Cloudflare Workers AI до вже існуючого `mehanik-poltava`.

## Що він робить

- AI доступний тільки через серверний endpoint `/api/admin/ai`.
- Браузер не отримує API-ключів Cloudflare.
- Використовується Cloudflare Workers AI binding `AI`.
- Модель: `@cf/meta/llama-3.1-8b-instruct-fast`.
- AI працює як помічник адміністратора, а не як автоматичний діагност.

## Підключення

1. У Cloudflare Worker додай AI binding з ім'ям `AI`.
2. У `wrangler.toml` додай:

```toml
[ai]
binding = "AI"
```

3. Встав `worker-ai-snippet.js` у `worker.js`.
4. Додай `route-patch.js` у функцію `api()` у місці, зазначеному всередині файлу.
5. Додай `public/ai.js` у `public/`.
6. Додай `public/ai.css` у CSS адмінки.
7. Додай блок із `admin-ai.html` в авторизовану частину `public/admin.html`.

## Важливо

Не записуй Cloudflare API tokens, AI credentials або паролі у `public/*.js`, HTML чи GitHub.

Для цього модуля окремий AI API token не потрібен, якщо використовується Workers AI binding. Cloudflare прив'язує AI до Worker через binding.

Модуль не змінює D1-схему і не потребує R2.

## Що можна додати другим етапом

- AI аналіз заявки;
- рекомендація послуги;
- рекомендація механіка на основі `mechanic_services`;
- генерація опису виконаної роботи;
- генерація SEO title/meta/alt;
- допомога адміністратору з відповіддю клієнту.

AI не повинен сам призначати механіка або час без перевірки серверної логіки бронювання.
