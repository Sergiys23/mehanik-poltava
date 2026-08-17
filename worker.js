const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-admin-password"
};


// ============================================================
// JSON RESPONSE
// ============================================================

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS
  });
}


// ============================================================
// ADMIN AUTH
// ============================================================

function adminPassword(request) {
  return request.headers.get("x-admin-password") || "";
}


function requireAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) {
    return "ADMIN_PASSWORD не налаштований у Cloudflare";
  }

  if (adminPassword(request) !== env.ADMIN_PASSWORD) {
    return "Невірний пароль";
  }

  return null;
}


// ============================================================
// TELEGRAM
// ============================================================

async function sendTelegram(env, text) {

  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.warn("Telegram notification is not configured");
    return false;
  }

  try {

    const response = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",

        headers: {
          "content-type": "application/json"
        },

        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text: text
        })
      }
    );


    if (!response.ok) {

      const errorText = await response.text();

      console.error(
        "Telegram API error:",
        response.status,
        errorText
      );

      return false;
    }


    return true;

  } catch (error) {

    console.error(
      "Telegram notification failed:",
      error
    );

    return false;
  }
}


// ============================================================
// TELEGRAM - NEW BOOKING
// ============================================================

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
    booking.comment
      ? `📝 Коментар: ${booking.comment}`
      : "📝 Коментар: немає",
    "",
    "🟡 Статус: НОВА ЗАЯВКА"
  ].join("\n");

  return sendTelegram(env, text);
}


// ============================================================
// TELEGRAM - NEW REVIEW
// ============================================================

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


// ============================================================
// MAIN WORKER
// ============================================================

export default {

  async fetch(request, env) {

    const url = new URL(request.url);


    // ========================================================
    // CORS
    // ========================================================

    if (request.method === "OPTIONS") {

      return new Response(null, {
        status: 204,
        headers: JSON_HEADERS
      });

    }


    // ========================================================
    // REVIEWS
    // ========================================================

    if (url.pathname === "/api/reviews") {

      if (!env.DB) {

        return json({
          error: "D1 database is not configured"
        }, 503);

      }


      // ------------------------------------------------------
      // GET APPROVED REVIEWS
      // ------------------------------------------------------

      if (request.method === "GET") {

        try {

          const { results } = await env.DB.prepare(`
            SELECT
              id,
              name,
              rating,
              text,
              created_at
            FROM reviews
            WHERE approved = 1
            ORDER BY created_at DESC
            LIMIT 100
          `).all();


          return json(results || []);

        } catch (error) {

          console.error(error);

          return json({
            error: "Не вдалося отримати відгуки"
          }, 500);

        }

      }


      // ------------------------------------------------------
      // CREATE REVIEW
      // ------------------------------------------------------

      if (request.method === "POST") {

        try {

          const body = await request.json();


          const name =
            String(body.name || "").trim() || "Анонім";


          const text =
            String(body.text || "").trim();


          const rating =
            Number(body.rating);


          if (
            name.length > 60 ||
            !text ||
            text.length > 1000 ||
            !Number.isInteger(rating) ||
            rating < 1 ||
            rating > 5
          ) {

            return json({
              error: "Некоректні дані"
            }, 400);

          }


          const result = await env.DB.prepare(`
            INSERT INTO reviews
            (
              name,
              rating,
              text,
              approved
            )
            VALUES (?1, ?2, ?3, 0)
          `)
          .bind(
            name,
            rating,
            text
          )
          .run();


          const reviewId =
            result.meta?.last_row_id || "невідомий";


          // --------------------------------------------------
          // TELEGRAM REVIEW NOTIFICATION
          // --------------------------------------------------

          await notifyNewReview(env, {
            id: reviewId,
            name,
            rating,
            text
          });


          return json({

            ok: true,

            message:
              "Дякуємо! Ваш відгук надіслано на модерацію."

          }, 201);


        } catch (error) {

          console.error(error);

          return json({
            error: "Помилка сервера"
          }, 500);

        }

      }


      return json({
        error: "Method not allowed"
      }, 405);

    }


    // ========================================================
    // BOOKINGS
    // ========================================================

    if (url.pathname === "/api/bookings") {

      if (!env.DB) {

        return json({
          error: "D1 database is not configured"
        }, 503);

      }


      // ------------------------------------------------------
      // CREATE BOOKING
      // ------------------------------------------------------

      if (request.method === "POST") {

        try {

          const body =
            await request.json();


          const name =
            String(body.name || "").trim();


          const phone =
            String(body.phone || "").trim();


          const car =
            String(body.car || "").trim();


          const service =
            String(body.service || "").trim();


          const date =
            String(body.date || "").trim();


          const time =
            String(body.time || "").trim();


          const comment =
            String(body.comment || "").trim();


          // --------------------------------------------------
          // VALIDATION
          // --------------------------------------------------

          if (
            !name ||
            !phone ||
            !car ||
            !service ||
            !date ||
            !time ||
            name.length > 80 ||
            phone.length > 30 ||
            car.length > 100 ||
            service.length > 100 ||
            comment.length > 1000
          ) {

            return json({
              error:
                "Заповніть обов'язкові поля коректно"
            }, 400);

          }


          // --------------------------------------------------
          // SAVE BOOKING TO D1
          // --------------------------------------------------

          const result =
            await env.DB.prepare(`
              INSERT INTO bookings
              (
                name,
                phone,
                car,
                service,
                preferred_date,
                preferred_time,
                comment,
                status
              )
              VALUES
              (
                ?1,
                ?2,
                ?3,
                ?4,
                ?5,
                ?6,
                ?7,
                'new'
              )
            `)
            .bind(
              name,
              phone,
              car,
              service,
              date,
              time,
              comment
            )
            .run();


          const bookingId =
            result.meta?.last_row_id || "невідомий";


          // --------------------------------------------------
          // SEND TELEGRAM NOTIFICATION
          // --------------------------------------------------

          await notifyNewBooking(env, {

            id: bookingId,

            name,

            phone,

            car,

            service,

            date,

            time,

            comment

          });


          // --------------------------------------------------
          // RESPONSE TO CLIENT
          // --------------------------------------------------

          return json({

            ok: true,

            message:
              "Заявку прийнято. Ми зв'яжемося з вами для підтвердження."

          }, 201);


        } catch (error) {

          console.error(error);

          return json({

            error:
              "Не вдалося створити заявку"

          }, 500);

        }

      }


      return json({
        error: "Method not allowed"
      }, 405);

    }


    // ========================================================
    // ADMIN REVIEWS
    // ========================================================

    if (url.pathname === "/api/admin/reviews") {

      if (!env.DB) {

        return json({
          error: "D1 database is not configured"
        }, 503);

      }


      const authError =
        requireAdmin(request, env);


      if (authError) {

        return json(
          {
            error: authError
          },
          authError.includes("не налаштований")
            ? 500
            : 401
        );

      }


      // ------------------------------------------------------
      // GET ALL REVIEWS
      // ------------------------------------------------------

      if (request.method === "GET") {

        try {

          const { results } =
            await env.DB.prepare(`
              SELECT
                id,
                name,
                rating,
                text,
                approved,
                created_at
              FROM reviews
              ORDER BY created_at DESC
              LIMIT 200
            `).all();


          return json(results || []);


        } catch (error) {

          console.error(error);

          return json({
            error:
              "Не вдалося отримати відгуки"
          }, 500);

        }

      }


      // ------------------------------------------------------
      // REVIEW ACTION
      // ------------------------------------------------------

      if (request.method === "POST") {

        try {

          const body =
            await request.json();


          const id =
            Number(body.id);


          const action =
            String(body.action || "");


          if (
            !Number.isInteger(id) ||
            id <= 0
          ) {

            return json({
              error: "Невірний ID"
            }, 400);

          }


          // --------------------------------------------------
          // APPROVE / HIDE
          // --------------------------------------------------

          if (
            action === "approve" ||
            action === "hide"
          ) {

            await env.DB
              .prepare(`
                UPDATE reviews
                SET approved = ?1
                WHERE id = ?2
              `)
              .bind(
                action === "approve"
                  ? 1
                  : 0,
                id
              )
              .run();


            return json({

              ok: true,

              message:
                action === "approve"
                  ? "Відгук опубліковано"
                  : "Відгук приховано"

            });

          }


          // --------------------------------------------------
          // DELETE
          // --------------------------------------------------

          if (action === "delete") {

            await env.DB
              .prepare(`
                DELETE FROM reviews
                WHERE id = ?1
              `)
              .bind(id)
              .run();


            return json({

              ok: true,

              message:
                "Відгук видалено"

            });

          }


          return json({

            error:
              "Невідома дія"

          }, 400);


        } catch (error) {

          console.error(error);

          return json({

            error:
              "Помилка обробки запиту"

          }, 500);

        }

      }


      return json({
        error: "Method not allowed"
      }, 405);

    }


    // ========================================================
    // ADMIN BOOKINGS
    // ========================================================

    if (url.pathname === "/api/admin/bookings") {

      if (!env.DB) {

        return json({
          error: "D1 database is not configured"
        }, 503);

      }


      const authError =
        requireAdmin(request, env);


      if (authError) {

        return json(
          {
            error: authError
          },
          authError.includes("не налаштований")
            ? 500
            : 401
        );

      }


      // ------------------------------------------------------
      // GET BOOKINGS
      // ------------------------------------------------------

      if (request.method === "GET") {

        try {

          const { results } =
            await env.DB.prepare(`
              SELECT
                id,
                name,
                phone,
                car,
                service,
                preferred_date,
                preferred_time,
                comment,
                status,
                created_at
              FROM bookings
              ORDER BY created_at DESC
              LIMIT 300
            `).all();


          return json(results || []);


        } catch (error) {

          console.error(error);

          return json({

            error:
              "Не вдалося отримати заявки"

          }, 500);

        }

      }


      // ------------------------------------------------------
      // BOOKING ACTION
      // ------------------------------------------------------

      if (request.method === "POST") {

        try {

          const body =
            await request.json();


          const id =
            Number(body.id);


          const action =
            String(body.action || "");


          if (
            !Number.isInteger(id) ||
            id <= 0
          ) {

            return json({

              error:
                "Невірний ID заявки"

            }, 400);

          }


          // --------------------------------------------------
          // STATUSES
          // --------------------------------------------------

          const statuses = {

            confirm:
              "confirmed",

            complete:
              "completed",

            cancel:
              "cancelled",

            reopen:
              "new"

          };


          // --------------------------------------------------
          // UPDATE STATUS
          // --------------------------------------------------

          if (statuses[action]) {

            await env.DB
              .prepare(`
                UPDATE bookings
                SET status = ?1
                WHERE id = ?2
              `)
              .bind(
                statuses[action],
                id
              )
              .run();


            const names = {

              confirm:
                "Заявку підтверджено",

              complete:
                "Заявку позначено як виконану",

              cancel:
                "Заявку скасовано",

              reopen:
                "Заявку повернуто в нові"

            };


            return json({

              ok: true,

              message:
                names[action]

            });

          }


          // --------------------------------------------------
          // DELETE BOOKING
          // --------------------------------------------------

          if (action === "delete") {

            await env.DB
              .prepare(`
                DELETE FROM bookings
                WHERE id = ?1
              `)
              .bind(id)
              .run();


            return json({

              ok: true,

              message:
                "Заявку видалено"

            });

          }


          return json({

            error:
              "Невідома дія"

          }, 400);


        } catch (error) {

          console.error(error);

          return json({

            error:
              "Помилка обробки заявки"

          }, 500);

        }

      }


      return json({
        error: "Method not allowed"
      }, 405);

    }


    // ========================================================
    // STATIC ASSETS
    // ========================================================

    if (!env.ASSETS) {

      return new Response(
        "ASSETS binding is not configured",
        {
          status: 500,

          headers: {
            "content-type":
              "text/plain; charset=utf-8"
          }
        }
      );

    }


    return env.ASSETS.fetch(request);

  }

};
