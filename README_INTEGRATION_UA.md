# Інтеграція вибору плеєра — Механік Полтава

Цей пакет є наступним етапом після media-player-pack.

Файли:
- public/media-player.js — рендер YouTube / No-Cookie / Instagram / HTML5;
- public/media-player-admin.js — вибір плеєра + прев'ю в адмінці;
- public/media-player.css — стилі;
- migrations/001_add_player_type.sql — поле D1;
- worker-player-snippet.js — серверна валідація.

Підключити в index.html:
<link rel="stylesheet" href="/media-player.css">
<script src="/media-player.js" defer></script>

Підключити в admin.html:
<link rel="stylesheet" href="/media-player.css">
<script src="/media-player.js" defer></script>
<script src="/media-player-admin.js" defer></script>

Backend:
- INSERT/UPDATE works повинен приймати player_type;
- SELECT works повинен повертати player_type;
- сервер повинен дозволяти тільки youtube, youtube_nocookie, instagram, html5.

Міграцію запускайте один раз. Якщо player_type уже є, повторно ALTER TABLE не запускайте.

Цей пакет не замінює worker.js, тому не руйнує поточну логіку заявок, Telegram, механіків та AI.
