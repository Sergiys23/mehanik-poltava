# Mechanik Media Engine

Окремий C++20 engine для важкої роботи з відео.

## Що робить

- `probe` — визначає контейнер, відеокодек, роздільну здатність і тривалість.
- `transcode` — приводить відео до H.264 + AAC, `yuv420p`, MP4 `+faststart`.
- `thumbnail` — створює JPEG-прев'ю.

## Збірка

Потрібні CMake, C++20 і FFmpeg/FFprobe.

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release
```

## Приклади

```bash
./build/media-engine probe input.mp4
./build/media-engine transcode input.mp4 output.mp4
./build/media-engine thumbnail output.mp4 thumbnail.jpg
```

## Архітектура

Cloudflare Worker залишається API/авторизацією. Цей engine не вбудовується в Worker. Його запускають окремо в контейнері/VPS, після чого Worker може передавати йому завдання через захищений HTTP API.
