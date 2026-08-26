# Механік Полтава — final hardening

Зміни цього пакета:
- ролі Admin / Superadmin: Admin бачить робочі вкладки, Superadmin — усі; backend повторно перевіряє права;
- публічні кнопки входу в адмінку прибрані; `/admin.html` лишається службовою адресою і захищений авторизацією;
- для входу: до 8 невдалих спроб/10 хв для `admin`, до 30/10 хв для `superadmin`;
- відео до 500 МБ: великі відео завантажуються R2 multipart частинами по 8 МБ;
- R2 є основним сховищем; після multipart complete запускається резервна копія в Google Drive через `waitUntil`, якщо Drive налаштований;
- звичайні файли до 500 МБ також приймаються endpoint-ом, але для Cloudflare request-body limits використовуйте multipart для відео;
- Instagram API/Instagram AI у цій версії не використовується.

## Важливо
Перед деплоєм переконайтесь, що у Worker є `MEDIA` R2 binding, D1 `DB` binding і потрібні Google secrets.

Після деплою протестуйте: login admin, login superadmin, вкладки, upload 10 MB, upload 100+ MB, відтворення на Android, Google Drive backup.
