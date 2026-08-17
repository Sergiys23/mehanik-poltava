const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-admin-password"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function adminPassword(request) {
  return request.headers.get("x-admin-password") || "";
}

function requireAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return "ADMIN_PASSWORD не налаштований у Cloudflare";
  if (adminPassword(request) !== env.ADMIN_PASSWORD) return "Невірний пароль";
  return null;
}

async function ensureBookingSupportTables(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS booking_telegram (
      booking_id INTEGER PRIMARY KEY,
      message_id INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS booking_history (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      car TEXT NOT NULL,
      service TEXT NOT NULL,
      preferred_date TEXT NOT NULL,
      preferred_time TEXT NOT NULL,
      comment TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      archived_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_booking_history_archived
      ON booking_history(archived_at DESC)`)
  ]);
}

async function telegramCall(env, method, payload) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.warn("Telegram notification is not configured");
    return { ok: false, configured: false };
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      console.error("Telegram API error:", response.status, data);
      return { ok: false, configured: true, error: data.description || `HTTP ${response.status}` };
    }

    return data;
  } catch (error) {
    console.error("Telegram request failed:", error);
    return { ok: false, configured: true, error: String(error) };
  }
}

async function sendTelegram(env, text) {
  return telegramCall(env, "sendMessage", {
    chat_id: env.TELEGRAM_CHAT_ID,
    text
  });
}

async function deleteTelegramMessage(env, messageId) {
  if (!messageId) return { ok: true, skipped: true };
  return telegramCall(env, "deleteMessage", {
    chat_id: env.TELEGRAM_CHAT_ID,
    message_id: Number(messageId)
  });
}

async function notifyNewBooking(env, booking) {
  const text = [
    "🔔 НОВА ЗАЯВКА — МЕХАНІК ПОЛТАВА",
    "",
    `🆔 Заявка: #${booking.id}`,
    `👤 Ім'я: ${booking.name}`,
    `📞 Телефон: ${booking.phone}`,
    `🚗 Автомобіль: ${booking.car}`,
    `🔧 Послуга: ${booking.service}`,
    `📅 Дата: ${booking.date}`,
    `🕐 Час: ${booking.time}`,
    booking.comment ? `📝 Коментар: ${booking.comment}` : "📝 Коментар: немає",
    "",
    "🟡 Статус: НОВА ЗАЯВКА"
  ].join("\n");
  return sendTelegram(env, text);
}

async function notifyNewReview(env, review) {
  const text = [
    "⭐ НОВИЙ ВІДГУК — МЕХАНІК ПОЛТАВА",
    "",
    `🆔 Відгук: #${review.id}`,
    `👤 Ім'я: ${review.name}`,
    `⭐ Оцінка: ${review.rating}/5`,
    "",
    `💬 ${review.text}`,
    "",
    "🟡 Статус: ПОТРІБНА МОДЕРАЦІЯ",
    "",
    "Зайди в адмін-панель, щоб опублікувати або видалити відгук."
  ].join("\n");
  return sendTelegram(env, text);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: JSON_HEADERS });

    // PUBLIC REVIEWS
    if (url.pathname === "/api/reviews") {
      if (!env.DB) return json({ error: "D1 database is not configured" }, 503);

      if (request.method === "GET") {
        try {
          const { results } = await env.DB.prepare(`
            SELECT id, name, rating, text, created_at
            FROM reviews WHERE approved = 1
            ORDER BY created_at DESC LIMIT 100
          `).all();
          return json(results || []);
        } catch (error) {
          console.error(error);
          return json({ error: "Не вдалося отримати відгуки" }, 500);
        }
      }

      if (request.method === "POST") {
        try {
          const body = await request.json();
          const name = String(body.name || "").trim() || "Анонім";
          const text = String(body.text || "").trim();
          const rating = Number(body.rating);
          if (name.length > 60 || !text || text.length > 1000 || !Number.isInteger(rating) || rating < 1 || rating > 5) {
            return json({ error: "Некоректні дані" }, 400);
          }
          const result = await env.DB.prepare(`
            INSERT INTO reviews (name, rating, text, approved)
            VALUES (?1, ?2, ?3, 0)
          `).bind(name, rating, text).run();
          const reviewId = result.meta?.last_row_id || "невідомий";
          await notifyNewReview(env, { id: reviewId, name, rating, text });
          return json({ ok: true, message: "Дякуємо! Ваш відгук надіслано на модерацію." }, 201);
        } catch (error) {
          console.error(error);
          return json({ error: "Помилка сервера" }, 500);
        }
      }
      return json({ error: "Method not allowed" }, 405);
    }

    // PUBLIC BOOKINGS
    if (url.pathname === "/api/bookings") {
      if (!env.DB) return json({ error: "D1 database is not configured" }, 503);
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

      try {
        await ensureBookingSupportTables(env.DB);
        const body = await request.json();
        const name = String(body.name || "").trim();
        const phone = String(body.phone || "").trim();
        const car = String(body.car || "").trim();
        const service = String(body.service || "").trim();
        const date = String(body.date || "").trim();
        const time = String(body.time || "").trim();
        const comment = String(body.comment || "").trim();

        if (!name || !phone || !car || !service || !date || !time ||
            name.length > 80 || phone.length > 30 || car.length > 100 ||
            service.length > 100 || comment.length > 1000) {
          return json({ error: "Заповніть обов'язкові поля коректно" }, 400);
        }

        const result = await env.DB.prepare(`
          INSERT INTO bookings
          (name, phone, car, service, preferred_date, preferred_time, comment, status)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'new')
        `).bind(name, phone, car, service, date, time, comment).run();

        const bookingId = result.meta?.last_row_id || "невідомий";
        const telegram = await notifyNewBooking(env, {
          id: bookingId, name, phone, car, service, date, time, comment
        });

        const messageId = telegram?.result?.message_id;
        if (messageId && Number.isInteger(Number(bookingId))) {
          await env.DB.prepare(`
            INSERT OR REPLACE INTO booking_telegram (booking_id, message_id)
            VALUES (?1, ?2)
          `).bind(Number(bookingId), Number(messageId)).run();
        }

        return json({
          ok: true,
          message: "Заявку прийнято. Ми зв'яжемося з вами для підтвердження."
        }, 201);
      } catch (error) {
        console.error(error);
        return json({ error: "Не вдалося створити заявку" }, 500);
      }
    }

    // ADMIN REVIEWS
    if (url.pathname === "/api/admin/reviews") {
      if (!env.DB) return json({ error: "D1 database is not configured" }, 503);
      const authError = requireAdmin(request, env);
      if (authError) return json({ error: authError }, authError.includes("не налаштований") ? 500 : 401);

      if (request.method === "GET") {
        try {
          const { results } = await env.DB.prepare(`
            SELECT id, name, rating, text, approved, created_at
            FROM reviews ORDER BY created_at DESC LIMIT 200
          `).all();
          return json(results || []);
        } catch (error) {
          console.error(error);
          return json({ error: "Не вдалося отримати відгуки" }, 500);
        }
      }

      if (request.method === "POST") {
        try {
          const body = await request.json();
          const id = Number(body.id);
          const action = String(body.action || "");
          if (!Number.isInteger(id) || id <= 0) return json({ error: "Невірний ID" }, 400);

          if (action === "approve" || action === "hide") {
            await env.DB.prepare(`UPDATE reviews SET approved = ?1 WHERE id = ?2`)
              .bind(action === "approve" ? 1 : 0, id).run();
            return json({ ok: true, message: action === "approve" ? "Відгук опубліковано" : "Відгук приховано" });
          }

          if (action === "delete") {
            await env.DB.prepare(`DELETE FROM reviews WHERE id = ?1`).bind(id).run();
            return json({ ok: true, message: "Відгук видалено" });
          }

          return json({ error: "Невідома дія" }, 400);
        } catch (error) {
          console.error(error);
          return json({ error: "Помилка обробки запиту" }, 500);
        }
      }
      return json({ error: "Method not allowed" }, 405);
    }

    // ADMIN BOOKINGS + HISTORY
    if (url.pathname === "/api/admin/bookings" || url.pathname === "/api/admin/history") {
      if (!env.DB) return json({ error: "D1 database is not configured" }, 503);
      const authError = requireAdmin(request, env);
      if (authError) return json({ error: authError }, authError.includes("не налаштований") ? 500 : 401);
      await ensureBookingSupportTables(env.DB);

      const isHistory = url.pathname === "/api/admin/history";

      if (request.method === "GET") {
        try {
          if (isHistory) {
            const { results } = await env.DB.prepare(`
              SELECT id, name, phone, car, service, preferred_date, preferred_time,
                     comment, status, created_at, archived_at
              FROM booking_history
              ORDER BY archived_at DESC LIMIT 500
            `).all();
            return json(results || []);
          }

          const { results } = await env.DB.prepare(`
            SELECT id, name, phone, car, service, preferred_date, preferred_time,
                   comment, status, created_at
            FROM bookings
            ORDER BY created_at DESC LIMIT 300
          `).all();
          return json(results || []);
        } catch (error) {
          console.error(error);
          return json({ error: isHistory ? "Не вдалося отримати історію" : "Не вдалося отримати заявки" }, 500);
        }
      }

      if (request.method === "POST" && !isHistory) {
        try {
          const body = await request.json();
          const id = Number(body.id);
          const action = String(body.action || "");
          if (!Number.isInteger(id) || id <= 0) return json({ error: "Невірний ID заявки" }, 400);

          const statuses = { confirm: "confirmed", complete: "completed", cancel: "cancelled", reopen: "new" };
          if (statuses[action]) {
            await env.DB.prepare(`UPDATE bookings SET status = ?1 WHERE id = ?2`)
              .bind(statuses[action], id).run();
            const names = {
              confirm: "Заявку підтверджено",
              complete: "Заявку позначено як виконану",
              cancel: "Заявку скасовано",
              reopen: "Заявку повернуто в нові"
            };
            return json({ ok: true, message: names[action] });
          }

          if (action === "delete") {
            const { results } = await env.DB.prepare(`
              SELECT id, name, phone, car, service, preferred_date, preferred_time,
                     comment, status, created_at
              FROM bookings WHERE id = ?1 LIMIT 1
            `).bind(id).all();
            const booking = results?.[0];
            if (!booking) return json({ error: "Заявку не знайдено" }, 404);

            const tg = await env.DB.prepare(`
              SELECT message_id FROM booking_telegram WHERE booking_id = ?1
            `).bind(id).first();

            let telegramResult = { ok: true, skipped: true };
            if (tg?.message_id) telegramResult = await deleteTelegramMessage(env, tg.message_id);

            await env.DB.prepare(`
              INSERT OR REPLACE INTO booking_history
              (id, name, phone, car, service, preferred_date, preferred_time,
               comment, status, created_at, archived_at)
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, datetime('now'))
            `).bind(
              booking.id, booking.name, booking.phone, booking.car, booking.service,
              booking.preferred_date, booking.preferred_time, booking.comment,
              booking.status, booking.created_at
            ).run();

            await env.DB.batch([
              env.DB.prepare(`DELETE FROM booking_telegram WHERE booking_id = ?1`).bind(id),
              env.DB.prepare(`DELETE FROM bookings WHERE id = ?1`).bind(id)
            ]);

            if (telegramResult.ok || telegramResult.skipped) {
              return json({ ok: true, message: "Заявку видалено з активних та перенесено в історію" });
            }

            return json({
              ok: true,
              warning: "Заявку перенесено в історію, але Telegram не вдалося видалити",
              message: "Заявку перенесено в історію; Telegram не видалено"
            });
          }

          return json({ error: "Невідома дія" }, 400);
        } catch (error) {
          console.error(error);
          return json({ error: "Помилка обробки заявки" }, 500);
        }
      }

      return json({ error: "Method not allowed" }, 405);
    }

    // STATIC ASSETS
    if (!env.ASSETS) {
      return new Response("ASSETS binding is not configured", {
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }
    return env.ASSETS.fetch(request);
  }
};
