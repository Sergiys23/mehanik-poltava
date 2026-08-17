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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: JSON_HEADERS });
    }

    // ================= REVIEWS =================

    if (url.pathname === "/api/reviews") {
      if (!env.DB) return json({ error: "D1 database is not configured" }, 503);

      if (request.method === "GET") {
        try {
          const { results } = await env.DB.prepare(`
            SELECT id, name, rating, text, created_at
            FROM reviews
            WHERE approved = 1
            ORDER BY created_at DESC
            LIMIT 100
          `).all();
          return json(results || []);
        } catch (e) {
          console.error(e);
          return json({ error: "Не вдалося отримати відгуки" }, 500);
        }
      }

      if (request.method === "POST") {
        try {
          const body = await request.json();
          const name = String(body.name || "").trim() || "Анонім";
          const text = String(body.text || "").trim();
          const rating = Number(body.rating);

          if (name.length > 60 || !text || text.length > 1000 ||
              !Number.isInteger(rating) || rating < 1 || rating > 5) {
            return json({ error: "Некоректні дані" }, 400);
          }

          await env.DB.prepare(`
            INSERT INTO reviews (name, rating, text, approved)
            VALUES (?1, ?2, ?3, 0)
          `).bind(name, rating, text).run();

          return json({
            ok: true,
            message: "Дякуємо! Ваш відгук надіслано на модерацію."
          }, 201);
        } catch (e) {
          console.error(e);
          return json({ error: "Помилка сервера" }, 500);
        }
      }

      return json({ error: "Method not allowed" }, 405);
    }

    // ================= BOOKINGS =================

    if (url.pathname === "/api/bookings") {
      if (!env.DB) return json({ error: "D1 database is not configured" }, 503);

      if (request.method === "POST") {
        try {
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

          await env.DB.prepare(`
            INSERT INTO bookings
            (name, phone, car, service, preferred_date, preferred_time, comment, status)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'new')
          `).bind(name, phone, car, service, date, time, comment).run();

          return json({
            ok: true,
            message: "Заявку прийнято. Ми зв'яжемося з вами для підтвердження."
          }, 201);
        } catch (e) {
          console.error(e);
          return json({ error: "Не вдалося створити заявку" }, 500);
        }
      }

      return json({ error: "Method not allowed" }, 405);
    }

    // ================= ADMIN REVIEWS =================

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
        } catch (e) {
          console.error(e);
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
        } catch (e) {
          console.error(e);
          return json({ error: "Помилка обробки запиту" }, 500);
        }
      }

      return json({ error: "Method not allowed" }, 405);
    }

    // ================= ADMIN BOOKINGS =================

    if (url.pathname === "/api/admin/bookings") {
      if (!env.DB) return json({ error: "D1 database is not configured" }, 503);
      const authError = requireAdmin(request, env);
      if (authError) return json({ error: authError }, authError.includes("не налаштований") ? 500 : 401);

      if (request.method === "GET") {
        try {
          const { results } = await env.DB.prepare(`
            SELECT id, name, phone, car, service, preferred_date, preferred_time,
                   comment, status, created_at
            FROM bookings
            ORDER BY created_at DESC
            LIMIT 300
          `).all();
          return json(results || []);
        } catch (e) {
          console.error(e);
          return json({ error: "Не вдалося отримати заявки" }, 500);
        }
      }

      if (request.method === "POST") {
        try {
          const body = await request.json();
          const id = Number(body.id);
          const action = String(body.action || "");

          if (!Number.isInteger(id) || id <= 0) return json({ error: "Невірний ID заявки" }, 400);

          const statuses = {
            confirm: "confirmed",
            complete: "completed",
            cancel: "cancelled",
            reopen: "new"
          };

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
            await env.DB.prepare(`DELETE FROM bookings WHERE id = ?1`).bind(id).run();
            return json({ ok: true, message: "Заявку видалено" });
          }

          return json({ error: "Невідома дія" }, 400);
        } catch (e) {
          console.error(e);
          return json({ error: "Помилка обробки заявки" }, 500);
        }
      }

      return json({ error: "Method not allowed" }, 405);
    }

    if (!env.ASSETS) {
      return new Response("ASSETS binding is not configured", {
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }

    return env.ASSETS.fetch(request);
  }
};
