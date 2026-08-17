const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-admin-password"
};


// ======================================================
// JSON RESPONSE
// ======================================================

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: JSON_HEADERS
    }
  );
}


// ======================================================
// ADMIN PASSWORD
// ======================================================

function getAdminPassword(request) {
  return request.headers.get("x-admin-password") || "";
}


// ======================================================
// MAIN WORKER
// ======================================================

export default {

  async fetch(request, env) {

    const url = new URL(request.url);


    // ==================================================
    // CORS / OPTIONS
    // ==================================================

    if (request.method === "OPTIONS") {

      return new Response(null, {
        status: 204,
        headers: JSON_HEADERS
      });

    }


    // ==================================================
    // PUBLIC REVIEWS API
    // ==================================================

    if (url.pathname === "/api/reviews") {

      // ----------------------------------------------
      // Check D1
      // ----------------------------------------------

      if (!env.DB) {

        return json(
          {
            error: "D1 database is not configured"
          },
          503
        );

      }


      // ----------------------------------------------
      // GET
      // Only approved reviews
      // ----------------------------------------------

      if (request.method === "GET") {

        try {

          const result = await env.DB
            .prepare(`
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
            `)
            .all();


          return json(
            result.results || []
          );


        } catch (error) {

          console.error(
            "GET /api/reviews error:",
            error
          );

          return json(
            {
              error: "Не вдалося отримати відгуки"
            },
            500
          );

        }

      }


      // ----------------------------------------------
      // POST
      // New review
      // ----------------------------------------------

      if (request.method === "POST") {

        try {

          const body =
            await request.json();


          // ------------------------------------------
          // Name
          // Optional
          // ------------------------------------------

          const name =
            String(
              body.name || ""
            ).trim() || "Анонім";


          // ------------------------------------------
          // Text
          // ------------------------------------------

          const text =
            String(
              body.text || ""
            ).trim();


          // ------------------------------------------
          // Rating
          // ------------------------------------------

          const rating =
            Number(body.rating);


          // ------------------------------------------
          // Validation
          // ------------------------------------------

          if (
            name.length > 60 ||
            !text ||
            text.length > 1000 ||
            !Number.isInteger(rating) ||
            rating < 1 ||
            rating > 5
          ) {

            return json(
              {
                error: "Некоректні дані"
              },
              400
            );

          }


          // ------------------------------------------
          // INSERT
          //
          // IMPORTANT:
          // approved = 0
          //
          // The review is NOT published immediately.
          // ------------------------------------------

          await env.DB
            .prepare(`
              INSERT INTO reviews
              (
                name,
                rating,
                text,
                approved
              )
              VALUES
              (
                ?1,
                ?2,
                ?3,
                0
              )
            `)
            .bind(
              name,
              rating,
              text
            )
            .run();


          // ------------------------------------------
          // Response
          // ------------------------------------------

          return json(
            {
              ok: true,
              message:
                "Дякуємо! Ваш відгук надіслано на модерацію."
            },
            201
          );


        } catch (error) {

          console.error(
            "POST /api/reviews error:",
            error
          );

          return json(
            {
              error: "Помилка сервера"
            },
            500
          );

        }

      }


      // ----------------------------------------------
      // Method not allowed
      // ----------------------------------------------

      return json(
        {
          error: "Method not allowed"
        },
        405
      );

    }


    // ==================================================
    // ADMIN REVIEWS API
    // ==================================================

    if (
      url.pathname === "/api/admin/reviews"
    ) {

      // ----------------------------------------------
      // Check D1
      // ----------------------------------------------

      if (!env.DB) {

        return json(
          {
            error:
              "D1 database is not configured"
          },
          503
        );

      }


      // ----------------------------------------------
      // Check ADMIN_PASSWORD
      // ----------------------------------------------

      if (!env.ADMIN_PASSWORD) {

        return json(
          {
            error:
              "ADMIN_PASSWORD не налаштований у Cloudflare"
          },
          500
        );

      }


      // ----------------------------------------------
      // Check password
      // ----------------------------------------------

      const password =
        getAdminPassword(request);


      if (
        password !==
        env.ADMIN_PASSWORD
      ) {

        return json(
          {
            error:
              "Невірний пароль"
          },
          401
        );

      }


      // ==================================================
      // ADMIN GET
      // Get ALL reviews
      // ==================================================

      if (request.method === "GET") {

        try {

          const result =
            await env.DB
              .prepare(`
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
              `)
              .all();


          return json(
            result.results || []
          );


        } catch (error) {

          console.error(
            "ADMIN GET error:",
            error
          );

          return json(
            {
              error:
                "Не вдалося отримати відгуки"
            },
            500
          );

        }

      }


      // ==================================================
      // ADMIN POST
      // Approve / Hide / Delete
      // ==================================================

      if (request.method === "POST") {

        try {

          const body =
            await request.json();


          const id =
            Number(body.id);


          const action =
            String(
              body.action || ""
            );


          // ------------------------------------------
          // Validate ID
          // ------------------------------------------

          if (
            !Number.isInteger(id) ||
            id <= 0
          ) {

            return json(
              {
                error:
                  "Невірний ID відгуку"
              },
              400
            );

          }


          // ==================================================
          // APPROVE
          // ==================================================

          if (
            action === "approve"
          ) {

            await env.DB
              .prepare(`
                UPDATE reviews
                SET approved = 1
                WHERE id = ?1
              `)
              .bind(id)
              .run();


            return json(
              {
                ok: true,
                message:
                  "Відгук опубліковано"
              }
            );

          }


          // ==================================================
          // HIDE
          // ==================================================

          if (
            action === "hide"
          ) {

            await env.DB
              .prepare(`
                UPDATE reviews
                SET approved = 0
                WHERE id = ?1
              `)
              .bind(id)
              .run();


            return json(
              {
                ok: true,
                message:
                  "Відгук приховано"
              }
            );

          }


          // ==================================================
          // DELETE
          // ==================================================

          if (
            action === "delete"
          ) {

            await env.DB
              .prepare(`
                DELETE FROM reviews
                WHERE id = ?1
              `)
              .bind(id)
              .run();


            return json(
              {
                ok: true,
                message:
                  "Відгук видалено"
              }
            );

          }


          // ----------------------------------------------
          // Unknown action
          // ----------------------------------------------

          return json(
            {
              error:
                "Невідома дія"
            },
            400
          );


        } catch (error) {

          console.error(
            "ADMIN POST error:",
            error
          );

          return json(
            {
              error:
                "Помилка обробки запиту"
            },
            500
          );

        }

      }


      // ----------------------------------------------
      // Method not allowed
      // ----------------------------------------------

      return json(
        {
          error:
            "Method not allowed"
        },
        405
      );

    }


    // ==================================================
    // STATIC WEBSITE
    // ==================================================
    //
    // Everything that is NOT an API request goes
    // to Cloudflare Assets.
    //
    // This serves:
    //
    // index.html
    // admin.html
    // images/logo.png
    // CSS
    // JS
    // etc.
    //
    // ==================================================

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


    return env.ASSETS.fetch(
      request
    );

  }

};
