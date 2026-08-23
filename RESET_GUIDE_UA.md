# Захищене вибіркове очищення

Worker додає endpoint `POST /api/admin/reset`.

## Захист
- потрібна активна сесія `superadmin`;
- повторно вводиться `SUPERADMIN_PASSWORD`;
- потрібне точне підтвердження `RESET:<scope>`;
- перед виконанням можна зробити preview через `GET` або `POST action=preview`.

## Scope
- `bookings` — заявки та їхні Telegram-зв'язки;
- `archive` — архів;
- `completed` — виконані роботи та Telegram-зв'язки;
- `reviews` — відгуки;
- `blocks` — заблоковані слоти;
- `logs` — журнал (після reset залишається один запис про reset);
- `media` — медіа з R2/Google Drive та metadata;
- `works` — публічні роботи та пов'язані медіафайли;
- `all_operational` — усі перелічені операційні дані.

## Не очищається
Каталог послуг/цін, механіки, прив'язки механіків до послуг, Google OAuth, ринкові джерела/дані та структура D1.

## Preview
`GET /api/admin/reset?scope=completed`

## Execute
```json
POST /api/admin/reset
{
  "action":"execute",
  "scope":"completed",
  "password":"SUPERADMIN_PASSWORD",
  "confirm":"RESET:completed"
}
```

Для передачі сайту рекомендується спочатку preview `all_operational`, перевірити кількості, а потім виконати reset. Це не видаляє D1 database і не змінює налаштування Worker.
