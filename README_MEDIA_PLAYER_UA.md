# Механік Полтава — вибір плеєра

Додає для «Наших робіт»:
- YouTube
- YouTube No-Cookie
- Instagram Reel
- HTML5 MP4/WebM

Підключення в admin.html:
<link rel="stylesheet" href="/media-player.css">
<script src="/media-player-admin.js" defer></script>

Підключення в index.html:
<link rel="stylesheet" href="/media-player.css">
<script src="/media-player.js" defer></script>

У D1 потрібне поле:
player_type TEXT NOT NULL DEFAULT 'youtube'

Важливо: існуючий backend має передавати player_type у INSERT/UPDATE та GET робіт. Цей пакет не замінює worker.js, щоб не зламати поточну логіку.

YouTube Unlisted підходить для вбудовування, але не є приватним: той, хто має посилання, може його переглянути.
