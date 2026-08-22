# Google Drive для медіа СТО «Механік Полтава»

Ця збірка використовує **Google Drive OAuth** як постійне сховище фото та відео. Service Account для особистої папки Drive не використовується.

## Cloudflare

### Variables

`GOOGLE_CLIENT_ID`

Client ID з Google Auth Platform → Clients → Web application.

`GOOGLE_DRIVE_FOLDER_ID`

```text
1EN13EscsEv4SsDTxmwFfmvZ9xCsX0gfr
```

### Secrets

`GOOGLE_CLIENT_SECRET`

Client Secret з Google Auth Platform.

**Не додавай Client Secret, refresh token або JSON-ключ у GitHub/ZIP.**

## Google Cloud

У Google Auth Platform → Clients → твій Web application:

**Authorized JavaScript origins**

```text
https://mehanik.mehanik.workers.dev
```

**Authorized redirect URI**

```text
https://mehanik.mehanik.workers.dev/api/google/callback
```

Також додай свій Google-акаунт у **Test users**, поки OAuth-застосунок перебуває в режимі тестування.

Переконайся, що в Google Cloud увімкнений **Google Drive API** для поточного проєкту.

## Підключення

1. Додай `GOOGLE_CLIENT_ID` як Variable у Cloudflare.
2. Додай `GOOGLE_DRIVE_FOLDER_ID` як Variable.
3. Додай `GOOGLE_CLIENT_SECRET` як Secret.
4. Deploy Worker.
5. Увійди в `/admin.html` як `superadmin`.
6. Відкрий **Роботи**.
7. Натисни **☁️ Підключити Google Drive**.
8. У Google підтвердь доступ.
9. Після callback повернешся в адмінку.

Worker збереже OAuth refresh token **зашифрованим у D1**. Сам refresh token не треба копіювати в Cloudflare вручну.

## Медіа

У вкладці **Роботи** можна завантажувати:

- JPG / PNG / WebP / GIF;
- MP4 / WebM / MOV.

Один upload через Worker обмежений 90 МБ.

На публічному сайті відео відтворюється звичайним HTML5 `<video>` через Worker. Google Drive або YouTube-інтерфейс користувачу не показується.
