# Google Drive для медіа СТО «Механік Полтава»

Ця версія використовує Google Drive як постійне сховище фото та відео. OAuth refresh token після першого підключення зберігається **зашифрованим у Cloudflare D1**, а Client ID/Client Secret залишаються у Cloudflare Secrets.

## 1. Cloudflare Variables / Secrets

Додай:

### Variables

`GOOGLE_CLIENT_ID`

Значення: Client ID із Google Auth Platform.

`GOOGLE_DRIVE_FOLDER_ID`

Значення:

`1EN13EscsEv4SsDTxmwFfmvZ9xCsX0gfr`

### Secrets

`GOOGLE_CLIENT_SECRET`

Значення: Client Secret із Google Auth Platform.

Не додавай Client Secret у GitHub або ZIP.

## 2. Google OAuth

У Google Auth Platform має бути Web application.

Authorized JavaScript origin:

`https://mehanik.mehanik.workers.dev`

Authorized redirect URI:

`https://mehanik.mehanik.workers.dev/api/google/callback`

Додай свій Google-акаунт до Test users, поки застосунок не пройшов Google verification.

## 3. Підключення

1. Deploy Worker.
2. Увійди в `/admin.html` як superadmin.
3. Відкрий **Роботи**.
4. Натисни **☁️ Підключити Google Drive**.
5. Погодься на доступ до Google Drive.
6. Після callback повернешся в адмінку.

Refresh token буде зашифрований і записаний у D1 таблицю `google_oauth`. Вручну копіювати refresh token у Cloudflare не потрібно.

## 4. Завантаження

У вкладці **Роботи** можна:

- завантажити фото;
- завантажити MP4/WebM/MOV;
- зберегти назву автомобіля та опис;
- додати Instagram-посилання;
- видалити роботу разом із файлом у Drive.

Максимальний файл у цьому режимі: 90 МБ. Саме сховище Google Drive не обмежується цим значенням, це ліміт одного upload через Worker.

## 5. Відео на сайті

Сайт використовує звичайний HTML5 `<video>` через `/api/media/<drive-file-id>`.

Клієнт не бачить Google Drive, назву Google-акаунта або YouTube-інтерфейс.

Worker підтримує HTTP Range для відео, тому перемотування HTML5-плеєра працює нормально.
