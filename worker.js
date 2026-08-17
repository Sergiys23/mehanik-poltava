const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, x-admin-password"
};

function json(data, status = 200, extraHeaders = {}) {
  const headers = new Headers(JSON_HEADERS);
  for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
  return new Response(JSON.stringify(data), { status, headers });
}

function escHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
  }[c]));
}

function getCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  const parts = header.split(";").map(v => v.trim());
  const item = parts.find(v => v.startsWith(name + "="));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : "";
}

function base64url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlDecode(text) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return base64url(new Uint8Array(sig));
}

async function createSession(env, role) {
  const secret = env.SESSION_SECRET || env.SUPERADMIN_PASSWORD || env.ADMIN_PASSWORD;
  if (!secret) return null;
  const payload = `${role}.${Date.now()}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

async function getSessionRole(request, env) {
  const token = getCookie(request, "mehanik_session");
  const secret = env.SESSION_SECRET || env.SUPERADMIN_PASSWORD || env.ADMIN_PASSWORD;
  if (token && secret) {
    const parts = token.split(".");
    if (parts.length === 3) {
      const [role, stamp, sig] = parts;
      const age = Date.now() - Number(stamp);
      if ((role === "admin" || role === "superadmin") && Number.isFinite(age) && age >= 0 && age <= 7 * 24 * 60 * 60 * 1000) {
        const expected = await hmac(secret, `${role}.${stamp}`);
        if (sig === expected) return role;
      }
    }
  }

  const password = request.headers.get("x-admin-password") || "";
  if (env.SUPERADMIN_PASSWORD && password === env.SUPERADMIN_PASSWORD) return "superadmin";
  if (env.ADMIN_PASSWORD && password === env.ADMIN_PASSWORD) return "admin";
  return null;
}

async function requireAdmin(request, env) {
  if (!env.ADMIN_PASSWORD && !env.SUPERADMIN_PASSWORD) return { error: "ADMIN_PASSWORD / SUPERADMIN_PASSWORD не налаштовані у Cloudflare", status: 500 };
  const role = await getSessionRole(request, env);
  if (!role) return { error: "Потрібна авторизація", status: 401 };
  return { role };
}

async function requireSuperadmin(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth.error) return auth;
  if (auth.role !== "superadmin") return { error: "Ця дія доступна тільки супер адміністратору", status: 403 };
  return auth;
}

async function ensureTables(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS booking_telegram (booking_id INTEGER PRIMARY KEY, message_id INTEGER NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS review_telegram (review_id INTEGER PRIMARY KEY, message_id INTEGER NOT NULL)`),
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
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_booking_history_archived ON booking_history(archived_at DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS works (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      car TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL,
      instagram_url TEXT NOT NULL DEFAULT '',
      published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_works_created ON works(published, created_at DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(created_at DESC)`)
  ]);
}

async function audit(db, actor, action, target = "", details = "") {
  try {
    await db.prepare(`INSERT INTO admin_logs (actor, action, target, details) VALUES (?1, ?2, ?3, ?4)`)
      .bind(actor, action, target, details).run();
  } catch (e) { console.error("audit error", e); }
}

async function telegramCall(env, method, payload) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return { ok: false, configured: false };
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) return { ok: false, configured: true, error: data.description || `HTTP ${response.status}` };
    return data;
  } catch (error) {
    console.error("Telegram request failed:", error);
    return { ok: false, configured: true, error: String(error) };
  }
}

async function sendTelegram(env, text) {
  return telegramCall(env, "sendMessage", { chat_id: env.TELEGRAM_CHAT_ID, text });
}

async function deleteTelegramMessage(env, messageId) {
  if (!messageId) return { ok: true, skipped: true };
  return telegramCall(env, "deleteMessage", { chat_id: env.TELEGRAM_CHAT_ID, message_id: Number(messageId) });
}

async function notifyNewBooking(env, booking) {
  return sendTelegram(env, [
    "🔔 НОВА ЗАЯВКА — МЕХАНІК ПОЛТАВА", "", `🆔 Заявка: #${booking.id}`,
    `👤 Ім'я: ${booking.name}`, `📞 Телефон: ${booking.phone}`, `🚗 Автомобіль: ${booking.car}`,
    `🔧 Послуга: ${booking.service}`, `📅 Дата: ${booking.date}`, `🕐 Час: ${booking.time}`,
    booking.comment ? `📝 Коментар: ${booking.comment}` : "📝 Коментар: немає", "", "🟡 Статус: НОВА ЗАЯВКА"
  ].join("\n"));
}

async function notifyNewReview(env, review) {
  return sendTelegram(env, [
    "⭐ НОВИЙ ВІДГУК — МЕХАНІК ПОЛТАВА", "", `🆔 Відгук: #${review.id}`,
    `👤 Ім'я: ${review.name}`, `⭐ Оцінка: ${review.rating}/5`, "", `💬 ${review.text}`,
    "", "🟡 Статус: ПОТРІБНА МОДЕРАЦІЯ"
  ].join("\n"));
}

async function login(request, env) {
  try {
    const body = await request.json();
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    let role = null;
    if (username === "superadmin" && env.SUPERADMIN_PASSWORD && password === env.SUPERADMIN_PASSWORD) role = "superadmin";
    if (username === "admin" && env.ADMIN_PASSWORD && password === env.ADMIN_PASSWORD) role = "admin";
    if (!role) return json({ error: "Невірний логін або пароль" }, 401);
    const session = await createSession(env, role);
    if (!session) return json({ error: "Секрет сесії не налаштований" }, 500);
    if (env.DB) { await ensureTables(env.DB); await audit(env.DB, role, "login", "auth", "Успішний вхід"); }
    return json({ ok: true, role }, 200, {
      "set-cookie": `mehanik_session=${encodeURIComponent(session)}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`
    });
  } catch (e) { return json({ error: "Некоректний запит" }, 400); }
}

function logoutResponse() {
  return json({ ok: true }, 200, { "set-cookie": "mehanik_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax" });
}

async function injectHome(request, env, response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;
  const html = await response.text();

  const workSection = `
<section id="works" class="injected-works"><div class="wrap">
  <div class="section-title"><div class="eyebrow">Результат роботи</div><h2>Наші роботи</h2></div>
  <div id="worksGrid" class="injected-works-grid"><div class="injected-works-empty">Завантаження робіт…</div></div>
</div></section>`;

  const style = `<style>
.injected-admin-login{position:fixed;top:18px;right:18px;z-index:9999;border:1px solid #ff6a00;background:#11161b;color:#ff6a00;padding:9px 13px;border-radius:8px;font-weight:900;cursor:pointer;box-shadow:0 8px 25px rgba(0,0,0,.25)}
.injected-admin-overlay{position:fixed;inset:0;background:rgba(0,0,0,.72);display:none;align-items:center;justify-content:center;z-index:10000;padding:18px}.injected-admin-box{width:min(420px,100%);background:#151a20;border:1px solid #2a3139;border-radius:16px;padding:25px;color:#f5f7f8}.injected-admin-box input{width:100%;padding:13px;margin:7px 0;background:#0d1014;color:#fff;border:1px solid #2a3139;border-radius:8px}.injected-admin-box button{width:100%;padding:13px;margin-top:8px;border:0;border-radius:8px;font-weight:900;cursor:pointer}.injected-admin-login-btn{background:#ff6a00}.injected-admin-close{background:#303841;color:#fff}.injected-admin-msg{margin-top:10px;color:#ffaaa0;font-size:13px}.injected-works-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:15px}.injected-work-card{overflow:hidden;background:#12161b;border:1px solid #252c34;border-radius:12px}.injected-work-card img{display:block;width:100%;height:230px;object-fit:cover;background:#0d1014}.injected-work-body{padding:18px}.injected-work-title{font-size:20px;font-weight:900}.injected-work-car{color:#ff6a00;font-weight:800;margin-top:4px}.injected-work-desc{color:#a3abb4;margin-top:8px;line-height:1.5}.injected-work-link{display:inline-block;margin-top:12px;color:#ff6a00;font-weight:900}.injected-works-empty{padding:30px;text-align:center;color:#a3abb4;background:#12161b;border:1px solid #252c34;border-radius:12px}.injected-admin-note{font-size:12px;color:#9da6af;margin-top:8px}@media(max-width:900px){.injected-works-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:600px){.injected-admin-login{top:10px;right:10px}.injected-works-grid{grid-template-columns:1fr}.injected-work-card img{height:210px}}
</style>`;

  const script = `<script>
(async()=>{
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const loginBtn=document.createElement('button');loginBtn.className='injected-admin-login';loginBtn.textContent='🔐 Вхід для адміністратора';document.body.appendChild(loginBtn);
const overlay=document.createElement('div');overlay.className='injected-admin-overlay';overlay.innerHTML='<div class="injected-admin-box"><h2 style="margin:0 0 8px">Вхід</h2><div style="color:#9da6af">Адміністрація Механік Полтава</div><input id="injUser" autocomplete="username" placeholder="Логін"><input id="injPass" type="password" autocomplete="current-password" placeholder="Пароль"><button class="injected-admin-login-btn" id="injSubmit">Увійти</button><button class="injected-admin-close" id="injClose">Закрити</button><div id="injMsg" class="injected-admin-msg"></div></div>';document.body.appendChild(overlay);
loginBtn.onclick=()=>overlay.style.display='flex';document.getElementById('injClose').onclick=()=>overlay.style.display='none';
document.getElementById('injSubmit').onclick=async()=>{const u=document.getElementById('injUser').value.trim(),p=document.getElementById('injPass').value;const m=document.getElementById('injMsg');m.textContent='Перевірка…';try{const r=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:u,password:p})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Помилка');location.href='/admin.html'}catch(e){m.textContent=e.message}};
try{const r=await fetch('/api/works');const items=await r.json();const grid=document.getElementById('worksGrid');if(grid){if(!Array.isArray(items)||!items.length){grid.innerHTML='<div class="injected-works-empty">Поки що немає опублікованих робіт.</div>'}else{grid.innerHTML=items.map(w=>'<article class="injected-work-card"><img loading="lazy" src="'+esc(w.image_url)+'" alt="'+esc(w.title)+'"><div class="injected-work-body"><div class="injected-work-title">'+esc(w.title)+'</div>'+(w.car?'<div class="injected-work-car">'+esc(w.car)+'</div>':'')+(w.description?'<div class="injected-work-desc">'+esc(w.description)+'</div>':'')+(w.instagram_url?'<a class="injected-work-link" href="'+esc(w.instagram_url)+'" target="_blank" rel="noopener">Instagram →</a>':'')+'</div></article>').join('')}}}catch(e){}
})();
</script>`;

  let out = html.replace("</head>", style + "</head>");

  // Вставляємо роботи перед </main>, а не шукаємо конкретний id секції.
  // Так блок не залежить від структури index.html.
  if (out.includes("</main>")) {
    out = out.replace("</main>", workSection + "</main>");
  } else {
    out = out.replace("</body>", workSection + "</body>");
  }

  out = out.replace("</body>", script + "</body>");

  // Після модифікації HTML старі Content-Length/ETag/Content-Encoding
  // від ASSETS вже не відповідають новому тілу відповіді.
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("etag");
  headers.set("cache-control", "no-store");

  return new Response(out, {
    status: response.status,
    headers
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: JSON_HEADERS });

    if (url.pathname === "/api/auth/login" && request.method === "POST") return login(request, env);
    if (url.pathname === "/api/auth/logout" && request.method === "POST") return logoutResponse();
    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      const role = await getSessionRole(request, env);
      return json({ authenticated: !!role, role: role || null });
    }

    if (url.pathname === "/api/reviews") {
      if (!env.DB) return json({ error: "D1 database is not configured" }, 503);
      if (request.method === "GET") {
        const { results } = await env.DB.prepare(`SELECT id,name,rating,text,created_at FROM reviews WHERE approved=1 ORDER BY created_at DESC LIMIT 100`).all();
        return json(results || []);
      }
      if (request.method === "POST") {
        try {
          const body = await request.json();
          const name = String(body.name || "").trim() || "Анонім";
          const text = String(body.text || "").trim();
          const rating = Number(body.rating);
          if (name.length > 60 || !text || text.length > 1000 || !Number.isInteger(rating) || rating < 1 || rating > 5) return json({ error: "Некоректні дані" }, 400);
          const result = await env.DB.prepare(`INSERT INTO reviews(name,rating,text,approved) VALUES(?1,?2,?3,0)`).bind(name,rating,text).run();
          const id = Number(result.meta?.last_row_id);
          const tg = await notifyNewReview(env,{id:id || "?",name,rating,text});
          const messageId = tg?.result?.message_id;
          if (messageId && Number.isInteger(id) && id > 0) {
            await env.DB.prepare(`INSERT OR REPLACE INTO review_telegram(review_id,message_id) VALUES(?1,?2)`).bind(id,Number(messageId)).run();
          }
          return json({ok:true,message:"Дякуємо! Ваш відгук надіслано на модерацію."},201);
        } catch(e){ console.error(e); return json({error:"Помилка сервера"},500); }
      }
      return json({error:"Method not allowed"},405);
    }

    if (url.pathname === "/api/bookings") {
      if (!env.DB) return json({ error: "D1 database is not configured" }, 503);
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      try {
        await ensureTables(env.DB);
        const body = await request.json();
        const name=String(body.name||"").trim(), phone=String(body.phone||"").trim(), car=String(body.car||"").trim(), service=String(body.service||"").trim(), date=String(body.date||"").trim(), time=String(body.time||"").trim(), comment=String(body.comment||"").trim();
        if(!name||!phone||!car||!service||!date||!time||name.length>80||phone.length>30||car.length>100||service.length>100||comment.length>1000) return json({error:"Заповніть обов'язкові поля коректно"},400);
        const result=await env.DB.prepare(`INSERT INTO bookings(name,phone,car,service,preferred_date,preferred_time,comment,status) VALUES(?1,?2,?3,?4,?5,?6,?7,'new')`).bind(name,phone,car,service,date,time,comment).run();
        const id=result.meta?.last_row_id||"?";
        const tg=await notifyNewBooking(env,{id,name,phone,car,service,date,time,comment});
        const messageId=tg?.result?.message_id;
        if(messageId&&Number.isInteger(Number(id))) await env.DB.prepare(`INSERT OR REPLACE INTO booking_telegram(booking_id,message_id) VALUES(?1,?2)`).bind(Number(id),Number(messageId)).run();
        return json({ok:true,message:"Заявку прийнято. Ми зв'яжемося з вами для підтвердження."},201);
      }catch(e){console.error(e);return json({error:"Не вдалося створити заявку"},500)}
    }

    if (url.pathname === "/api/works") {
      if (!env.DB) return json({error:"D1 database is not configured"},503);
      await ensureTables(env.DB);
      if(request.method!=="GET") return json({error:"Method not allowed"},405);
      const {results}=await env.DB.prepare(`SELECT id,title,car,description,image_url,instagram_url,created_at FROM works WHERE published=1 ORDER BY created_at DESC LIMIT 100`).all();
      return json(results||[]);
    }

    if (url.pathname.startsWith("/api/admin/")) {
      if (!env.DB) return json({error:"D1 database is not configured"},503);
      await ensureTables(env.DB);
      const auth=await requireAdmin(request,env);
      if(auth.error) return json({error:auth.error},auth.status);
      const actor=auth.role;

      if(url.pathname==="/api/admin/bookings"){
        if(request.method==="GET"){
          const {results}=await env.DB.prepare(`SELECT id,name,phone,car,service,preferred_date,preferred_time,comment,status,created_at FROM bookings ORDER BY created_at DESC LIMIT 300`).all();return json(results||[]);
        }
        if(request.method==="POST"){
          const body=await request.json();const id=Number(body.id),action=String(body.action||"");if(!Number.isInteger(id)||id<=0)return json({error:"Невірний ID заявки"},400);
          const statuses={confirm:"confirmed",complete:"completed",cancel:"cancelled",reopen:"new"};
          if(statuses[action]){await env.DB.prepare(`UPDATE bookings SET status=?1 WHERE id=?2`).bind(statuses[action],id).run();await audit(env.DB,actor,action,`booking:${id}`,"Зміна статусу");return json({ok:true,message:"Статус заявки оновлено"});}
          if(action==="delete"){
            const booking=await env.DB.prepare(`SELECT * FROM bookings WHERE id=?1`).bind(id).first();if(!booking)return json({error:"Заявку не знайдено"},404);
            const tg=await env.DB.prepare(`SELECT message_id FROM booking_telegram WHERE booking_id=?1`).bind(id).first();if(tg?.message_id)await deleteTelegramMessage(env,tg.message_id);
            await env.DB.prepare(`INSERT OR REPLACE INTO booking_history(id,name,phone,car,service,preferred_date,preferred_time,comment,status,created_at,archived_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,datetime('now'))`).bind(booking.id,booking.name,booking.phone,booking.car,booking.service,booking.preferred_date,booking.preferred_time,booking.comment,booking.status,booking.created_at).run();
            await env.DB.batch([env.DB.prepare(`DELETE FROM booking_telegram WHERE booking_id=?1`).bind(id),env.DB.prepare(`DELETE FROM bookings WHERE id=?1`).bind(id)]);await audit(env.DB,actor,"archive_booking",`booking:${id}`,"Перенесено в архів");return json({ok:true,message:"Заявку перенесено в історію"});
          }
          return json({error:"Невідома дія"},400);
        }
      }

      if(url.pathname==="/api/admin/history"){
        if(request.method==="GET"){const {results}=await env.DB.prepare(`SELECT id,name,phone,car,service,preferred_date,preferred_time,comment,status,created_at,archived_at FROM booking_history ORDER BY archived_at DESC LIMIT 500`).all();return json(results||[])}
        if(request.method==="DELETE"){
          const id=url.searchParams.get("id");
          if(actor!=="superadmin")return json({error:"Видалення з архіву доступне тільки супер адміну"},403);
          if(id){await env.DB.prepare(`DELETE FROM booking_history WHERE id=?1`).bind(Number(id)).run();await audit(env.DB,actor,"delete_history",`history:${id}`,"Видалено запис з архіву");return json({ok:true,message:"Запис видалено з архіву"});}
          await env.DB.prepare(`DELETE FROM booking_history`).run();await audit(env.DB,actor,"clear_history","history","Повністю очищено архів");return json({ok:true,message:"Архів очищено"});
        }
      }

      if(url.pathname==="/api/admin/reviews"){
        if(request.method==="GET"){const {results}=await env.DB.prepare(`SELECT id,name,rating,text,approved,created_at FROM reviews ORDER BY created_at DESC LIMIT 200`).all();return json(results||[])}
        if(request.method==="POST"){
          const body=await request.json(),id=Number(body.id),action=String(body.action||"");if(!Number.isInteger(id)||id<=0)return json({error:"Невірний ID"},400);
          if(action==="approve"||action==="hide"){await env.DB.prepare(`UPDATE reviews SET approved=?1 WHERE id=?2`).bind(action==="approve"?1:0,id).run();await audit(env.DB,actor,action,`review:${id}`,"");return json({ok:true,message:action==="approve"?"Відгук опубліковано":"Відгук приховано"})}
          if(action==="delete"){
            const review = await env.DB.prepare(`SELECT id FROM reviews WHERE id=?1`).bind(id).first();
            if (!review) return json({error:"Відгук не знайдено"},404);
            const tg = await env.DB.prepare(`SELECT message_id FROM review_telegram WHERE review_id=?1`).bind(id).first();
            let telegramDeleted = true;
            if (tg?.message_id) {
              const tgResult = await deleteTelegramMessage(env,tg.message_id);
              telegramDeleted = !!tgResult?.ok;
              if (!telegramDeleted) console.warn("Не вдалося видалити відгук з Telegram",tgResult?.error || tgResult);
            }
            await env.DB.batch([
              env.DB.prepare(`DELETE FROM review_telegram WHERE review_id=?1`).bind(id),
              env.DB.prepare(`DELETE FROM reviews WHERE id=?1`).bind(id)
            ]);
            await audit(env.DB,actor,"delete_review",`review:${id}`,telegramDeleted?"Відгук видалено з сайту та Telegram":"Відгук видалено з сайту; Telegram-повідомлення не видалено");
            return json({ok:true,telegram_deleted:telegramDeleted,message:telegramDeleted?"Відгук видалено з сайту та Telegram":"Відгук видалено з сайту; Telegram-повідомлення не вдалося видалити"});
          }
          return json({error:"Невідома дія"},400);
        }
      }

      if(url.pathname==="/api/admin/works"){
        if(request.method==="GET"){const {results}=await env.DB.prepare(`SELECT id,title,car,description,image_url,instagram_url,published,created_at FROM works ORDER BY created_at DESC LIMIT 300`).all();return json(results||[])}
        if(request.method==="POST"){
          const b=await request.json();const title=String(b.title||"").trim(),car=String(b.car||"").trim(),description=String(b.description||"").trim(),image_url=String(b.image_url||"").trim(),instagram_url=String(b.instagram_url||"").trim(),published=b.published===false?0:1;
          if(!title||!image_url||title.length>120||car.length>120||description.length>1500||image_url.length>2000||instagram_url.length>2000)return json({error:"Некоректні дані роботи"},400);
          await env.DB.prepare(`INSERT INTO works(title,car,description,image_url,instagram_url,published) VALUES(?1,?2,?3,?4,?5,?6)`).bind(title,car,description,image_url,instagram_url,published).run();await audit(env.DB,actor,"add_work",title,car);return json({ok:true,message:"Роботу додано"},201);
        }
        if(request.method==="DELETE"){
          const id=Number(url.searchParams.get("id"));if(!Number.isInteger(id)||id<=0)return json({error:"Невірний ID"},400);await env.DB.prepare(`DELETE FROM works WHERE id=?1`).bind(id).run();await audit(env.DB,actor,"delete_work",`work:${id}`,"");return json({ok:true,message:"Роботу видалено"});
        }
      }

      if(url.pathname==="/api/admin/logs"){
        if(request.method==="GET"){const {results}=await env.DB.prepare(`SELECT id,actor,action,target,details,created_at FROM admin_logs ORDER BY created_at DESC LIMIT 500`).all();return json(results||[])}
        if(request.method==="DELETE"){const s=await requireSuperadmin(request,env);if(s.error)return json({error:s.error},s.status);await env.DB.prepare(`DELETE FROM admin_logs`).run();return json({ok:true,message:"Журнал дій очищено"})}
      }

      if(url.pathname==="/api/admin/cleanup"){
        if(request.method!=="POST")return json({error:"Method not allowed"},405);const s=await requireSuperadmin(request,env);if(s.error)return json({error:s.error},s.status);
        const body=await request.json().catch(()=>({}));const what=String(body.what||"");
        if(what==="old_logs"){await env.DB.prepare(`DELETE FROM admin_logs WHERE id NOT IN (SELECT id FROM admin_logs ORDER BY created_at DESC LIMIT 100)`).run();await audit(env.DB,actor,"cleanup","logs","Залишено останні 100 записів");return json({ok:true,message:"Старі записи журналу очищено"})}
        return json({error:"Невідома операція очищення"},400);
      }

      return json({error:"Unknown admin endpoint"},404);
    }

    if (url.pathname === "/admin" || url.pathname === "/admin.html") {
      if (!env.ASSETS) return new Response("ASSETS binding is not configured",{status:500});
      return env.ASSETS.fetch(new Request(new URL("/admin.html",request.url),request));
    }

    if (!env.ASSETS) return new Response("ASSETS binding is not configured",{status:500});
    const response=await env.ASSETS.fetch(request);
    if(request.method==="GET" && url.pathname==="/") return injectHome(request,env,response);
    return response;
  }
};
