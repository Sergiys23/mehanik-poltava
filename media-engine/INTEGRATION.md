# Інтеграція з Механік Полтава

Поточний production Worker **не змінюється** на цьому етапі.

План інтеграції:

1. Media upload отримує оригінальний файл.
2. Worker передає job у C++ Media Engine.
3. Engine робить `probe`.
4. Якщо відео вже H.264/AAC + MP4, faststart можна виконати без повного перекодування окремим FFmpeg remux.
5. Якщо кодек/профіль несумісний, виконується H.264/AAC transcode.
6. Створюється thumbnail.
7. Готовий MP4/HLS зберігається в media storage.
8. У D1 зберігаються `original`, `processed`, `thumbnail` та статус обробки.

Перед увімкненням production integration потрібно додати:
- `MEDIA_ENGINE_URL`
- `MEDIA_ENGINE_TOKEN`

як Cloudflare Secret/Variable та окремий authenticated HTTP service.
