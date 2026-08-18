const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,x-admin-password"
};

const START = "09:00";
const END = "18:00";
const WORKING_DAYS = new Set([1,2,3,4,5,6]);

const DURATIONS = {
  "Шиномонтаж": 60,
  "Ремонт двигуна та ходової": 120,
  "Розвал-сходження": 60,
  "Комп'ютерна діагностика": 60
};

function json(data, status = 200, extra = {}) {
  const h = new Headers(JSON_HEADERS);
  for (const [k,v] of Object.entries(extra)) h.set(k,v);
  return new Response(JSON.stringify(data), {status, headers:h});
}

function pad(n) { return String(n).padStart(2,"0"); }
function minutes(t) {
  const [h,m] = String(t).split(":").map(Number);
  return h * 60 + m;
}
function timeOf(n) {
  return `${pad(Math.floor(n/60))}:${pad(n%60)}`;
}
function allSlots() {
  const a = [];
  for (let n=minutes(START); n<minutes(END); n+=30) a.push(timeOf(n));
  return a;
}
function overlap(a, ad, b, bd) {
  return a < b + bd && a + ad > b;
}
function isWorking(date) {
  return WORKING_DAYS.has(new Date(`${date}T12:00:00`).getDay());
}

function kyivNow() {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone:"Europe/Kyiv",
    year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", hourCycle:"h23"
  }).formatToParts(new Date());
  const g = t => p.find(x => x.type === t)?.value;
  return {
    date:`${g("year")}-${g("month")}-${g("day")}`,
    minutes:Number(g("hour"))*60+Number(g("minute"))
  };
}

function cookie(request, name) {
  const raw = request.headers.get("cookie") || "";
  const item = raw.split(";").map(x=>x.trim())
    .find(x=>x.startsWith(name+"="));
  return item ? decodeURIComponent(item.slice(name.length+1)) : "";
}

function base64url(bytes) {
  let s="";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

async function hmac(secret,text) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    {name:"HMAC",hash:"SHA-256"}, false, ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(text)
  );
  return base64url(new Uint8Array(sig));
}

async function createSession(env,role) {
  const secret = env.SESSION_SECRET || env.SUPERADMIN_PASSWORD || env.ADMIN_PASSWORD;
  if (!secret) return null;
  const payload = `${role}.${Date.now()}`;
  return `${payload}.${await hmac(secret,payload)}`;
}

async function sessionRole(request,env) {
  const token = cookie(request,"mehanik_session");
  const secret = env.SESSION_SECRET || env.SUPERADMIN_PASSWORD || env.ADMIN_PASSWORD;

  if (token && secret) {
    const p = token.split(".");
    if (p.length===3) {
      const [role,stamp,sig] = p;
      const age = Date.now()-Number(stamp);
      if ((role==="admin" || role==="superadmin") &&
          Number.isFinite(age) && age>=0 && age<=7*86400000) {
        const expected = await hmac(secret,`${role}.${stamp}`);
        if (sig===expected) return role;
      }
    }
  }

  const pass = request.headers.get("x-admin-password") || "";
  if (env.SUPERADMIN_PASSWORD && pass===env.SUPERADMIN_PASSWORD) return "superadmin";
  if (env.ADMIN_PASSWORD && pass===env.ADMIN_PASSWORD) return "admin";
  return null;
}

async function auth(request,env) {
  if (!env.ADMIN_PASSWORD && !env.SUPERADMIN_PASSWORD)
    return {error:"ADMIN_PASSWORD / SUPERADMIN_PASSWORD не налаштовані",status:500};
  const role = await sessionRole(request,env);
  return role ? {role} : {error:"Потрібна авторизація",status:401};
}

async function superAuth(request,env) {
  const a = await auth(request,env);
  if (a.error) return a;
  return a.role==="superadmin"
    ? a
    : {error:"Ця дія доступна тільки супер адміністратору",status:403};
}

async function ensureTables(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS bookings(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, phone TEXT NOT NULL, car TEXT NOT NULL,
      service TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL,
      duration INTEGER NOT NULL DEFAULT 60, note TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_slot
      ON bookings(date,time) WHERE status IN ('pending','confirmed')`),
    db.prepare(`CREATE TABLE IF NOT EXISTS blocked_slots(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL, time TEXT NOT NULL, reason TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_blocked_slot
      ON blocked_slots(date,time)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS reviews(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, rating INTEGER NOT NULL,
      text TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS works(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL, car TEXT DEFAULT '',
      description TEXT DEFAULT '', image_url TEXT DEFAULT '',
      instagram_url TEXT DEFAULT '', published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS booking_telegram(
      booking_id INTEGER PRIMARY KEY, message_id INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS review_telegram(
      review_id INTEGER PRIMARY KEY, message_id INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS booking_history(
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL,
      car TEXT NOT NULL, service TEXT NOT NULL, date TEXT NOT NULL,
      time TEXT NOT NULL, duration INTEGER NOT NULL DEFAULT 60,
      note TEXT DEFAULT '', status TEXT NOT NULL, created_at TEXT NOT NULL,
      archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_booking_history_archived
      ON booking_history(archived_at DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS admin_logs(
      id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL,
      action TEXT NOT NULL, target TEXT DEFAULT '', details TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_admin_logs_created
      ON admin_logs(created_at DESC)`)
  ]);
}

async function audit(db,actor,action,target="",details="") {
  try {
    await db.prepare(`INSERT INTO admin_logs(actor,action,target,details)
      VALUES(?,?,?,?)`).bind(actor,action,target,details).run();
  } catch(e) { console.error("audit",e); }
}

async function telegram(env,method,payload) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.warn("Telegram notification is not configured");
    return {ok:false,configured:false};
  }
  try {
    const r = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
      {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)}
    );
    const d = await r.json().catch(()=>({}));
    if (!r.ok || !d.ok)
      return {ok:false,configured:true,error:d.description||`HTTP ${r.status}`};
    return d;
  } catch(e) {
    return {ok:false,configured:true,error:String(e)};
  }
}

async function sendTelegram(env,text) {
  return telegram(env,"sendMessage",{chat_id:env.TELEGRAM_CHAT_ID,text});
}

async function deleteTelegram(env,message_id) {
  if (!message_id) return {ok:true,skipped:true};
  return telegram(env,"deleteMessage",{
    chat_id:env.TELEGRAM_CHAT_ID,message_id:Number(message_id)
  });
}

async function login(request,env) {
  try {
    const b = await request.json();
    const username = String(b.username||"").trim().toLowerCase();
    const password = String(b.password||"");
    let role = null;

    if (username==="superadmin" && env.SUPERADMIN_PASSWORD &&
        password===env.SUPERADMIN_PASSWORD) role="superadmin";
    else if (username==="admin" && env.ADMIN_PASSWORD &&
        password===env.ADMIN_PASSWORD) role="admin";

    if (!role) return json({error:"Невірний логін або пароль"},401);

    const session = await createSession(env,role);
    if (!session) return json({error:"SESSION_SECRET не налаштований"},500);

    if (env.DB) {
      await ensureTables(env.DB);
      await audit(env.DB,role,"login","auth","Успішний вхід");
    }

    return json({ok:true,role},200,{
      "set-cookie":
        `mehanik_session=${encodeURIComponent(session)}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`
    });
  } catch(e) {
    return json({error:"Некоректний запит"},400);
  }
}

async function availability(env,date,service) {
  const duration = DURATIONS[service] || 60;
  const now = kyivNow();

  const b = await env.DB.prepare(`
    SELECT time,duration FROM bookings
    WHERE date=? AND status IN ('pending','confirmed')
  `).bind(date).all();

  const blocked = await env.DB.prepare(`
    SELECT time FROM blocked_slots WHERE date=?
  `).bind(date).all();

  return allSlots().map(time=>{
    const start=minutes(time);
    const past =
      date<now.date ||
      (date===now.date && start<=now.minutes);

    const busyBooking=(b.results||[]).some(x=>
      overlap(start,duration,minutes(x.time),Number(x.duration||60))
    );

    const busyBlock=(blocked.results||[]).some(x=>
      overlap(start,duration,minutes(x.time),30)
    );

    return {
      time,
      busy:
        past || !isWorking(date) ||
        start+duration>minutes(END) ||
        busyBooking || busyBlock
    };
  });
}

async function publicBooking(request,env) {
  const b=await request.json();

  for (const k of ["name","phone","car","service","date","time"]) {
    if (typeof b[k]!=="string" || !b[k].trim())
      return json({error:`Missing ${k}`},400);
  }

  if (!DURATIONS[b.service] || !allSlots().includes(b.time))
    return json({error:"Invalid booking"},400);

  const duration=DURATIONS[b.service];
  const now=kyivNow();
  const start=minutes(b.time);

  if (!isWorking(b.date) || b.date<now.date ||
      (b.date===now.date && start<=now.minutes) ||
      start+duration>minutes(END))
    return json({error:"Slot unavailable"},409);

  const existing=await env.DB.prepare(`
    SELECT time,duration FROM bookings
    WHERE date=? AND status IN ('pending','confirmed')
  `).bind(b.date).all();

  if ((existing.results||[]).some(x=>
    overlap(start,duration,minutes(x.time),Number(x.duration||60))
  )) return json({error:"Slot busy"},409);

  const blocked=await env.DB.prepare(`
    SELECT time FROM blocked_slots WHERE date=?
  `).bind(b.date).all();

  if ((blocked.results||[]).some(x=>
    overlap(start,duration,minutes(x.time),30)
  )) return json({error:"Slot blocked"},409);

  const r=await env.DB.prepare(`
    INSERT INTO bookings
    (name,phone,car,service,date,time,duration,note)
    VALUES(?,?,?,?,?,?,?,?)
  `).bind(
    b.name.trim(),b.phone.trim(),b.car.trim(),b.service,
    b.date,b.time,duration,String(b.note||"").trim()
  ).run();

  const id=Number(r.meta?.last_row_id);

  const tg=await sendTelegram(env,[
    "🔔 НОВА ЗАЯВКА — МЕХАНІК ПОЛТАВА","",
    `🆔 Заявка: #${id}`,`👤 Ім'я: ${b.name}`,
    `📞 Телефон: ${b.phone}`,`🚗 Автомобіль: ${b.car}`,
    `🔧 Послуга: ${b.service}`,`📅 Дата: ${b.date}`,
    `🕐 Час: ${b.time}`,
    b.note?`📝 Коментар: ${b.note}`:"📝 Коментар: немає",
    "","🟡 Статус: НОВА ЗАЯВКА"
  ].join("\n"));

  if (tg?.result?.message_id) {
    await env.DB.prepare(`
      INSERT OR REPLACE INTO booking_telegram(booking_id,message_id)
      VALUES(?,?)
    `).bind(id,Number(tg.result.message_id)).run();
  }

  return json({ok:true,id},201);
}

export default {
  async fetch(request,env) {
    if (request.method==="OPTIONS")
      return new Response(null,{status:204,headers:JSON_HEADERS});

    const u=new URL(request.url);

    try {
      if (u.pathname==="/api/auth/login" && request.method==="POST")
        return login(request,env);

      if (u.pathname==="/api/auth/logout" && request.method==="POST")
        return json({ok:true},200,{
          "set-cookie":
            "mehanik_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"
        });

      if (u.pathname==="/api/auth/me" && request.method==="GET") {
        const role=await sessionRole(request,env);
        return json({authenticated:!!role,role:role||null});
      }

      if (u.pathname==="/api/availability" && request.method==="GET") {
        if (!env.DB) return json({error:"D1 database is not configured"},503);
        await ensureTables(env.DB);

        const date=u.searchParams.get("date");
        const service=u.searchParams.get("service")||"Комп'ютерна діагностика";

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date||"") || !DURATIONS[service])
          return json({error:"Invalid date or service"},400);

        return json({
          date,service,duration:DURATIONS[service],
          slots:await availability(env,date,service)
        });
      }

      if (u.pathname==="/api/bookings" && request.method==="POST") {
        if (!env.DB) return json({error:"D1 database is not configured"},503);
        await ensureTables(env.DB);
        return publicBooking(request,env);
      }

      if (u.pathname==="/api/reviews" && request.method==="GET") {
        if (!env.DB) return json({error:"D1 database is not configured"},503);
        await ensureTables(env.DB);
        const {results}=await env.DB.prepare(`
          SELECT id,name,rating,text,created_at FROM reviews
          WHERE published=1 ORDER BY id DESC LIMIT 50
        `).all();
        return json(results||[]);
      }

      if (u.pathname==="/api/reviews" && request.method==="POST") {
        if (!env.DB) return json({error:"D1 database is not configured"},503);
        await ensureTables(env.DB);

        const b=await request.json();
        const name=String(b.name||"").trim();
        const text=String(b.text||"").trim();
        const rating=Number(b.rating);

        if (!name || !text || name.length>80 || text.length>1500 ||
            !Number.isInteger(rating) || rating<1 || rating>5)
          return json({error:"Некоректні дані"},400);

        const r=await env.DB.prepare(`
          INSERT INTO reviews(name,rating,text,published)
          VALUES(?,?,?,0)
        `).bind(name,rating,text).run();

        const id=Number(r.meta?.last_row_id);

        const tg=await sendTelegram(env,[
          "⭐ НОВИЙ ВІДГУК — МЕХАНІК ПОЛТАВА","",
          `🆔 Відгук: #${id}`,`👤 Ім'я: ${name}`,
          `⭐ Оцінка: ${rating}/5`,"",`💬 ${text}`,
          "","🟡 Статус: ПОТРІБНА МОДЕРАЦІЯ"
        ].join("\n"));

        if (tg?.result?.message_id) {
          await env.DB.prepare(`
            INSERT OR REPLACE INTO review_telegram(review_id,message_id)
            VALUES(?,?)
          `).bind(id,Number(tg.result.message_id)).run();
        }

        return json({
          ok:true,
          message:"Дякуємо! Відгук надіслано на модерацію."
        },201);
      }

      if (u.pathname==="/api/works" && request.method==="GET") {
        if (!env.DB) return json({error:"D1 database is not configured"},503);
        await ensureTables(env.DB);
        const {results}=await env.DB.prepare(`
          SELECT id,title,car,description,image_url,instagram_url,created_at
          FROM works WHERE published=1 ORDER BY created_at DESC LIMIT 100
        `).all();
        return json(results||[]);
      }

      if (u.pathname.startsWith("/api/admin/")) {
        if (!env.DB) return json({error:"D1 database is not configured"},503);
        await ensureTables(env.DB);

        const a=await auth(request,env);
        if (a.error) return json({error:a.error},a.status);
        const actor=a.role;

        if (u.pathname==="/api/admin/bookings") {
          if (request.method==="GET") {
            const {results}=await env.DB.prepare(`
              SELECT id,name,phone,car,service,date,time,duration,note,status,created_at
              FROM bookings ORDER BY created_at DESC LIMIT 300
            `).all();
            return json(results||[]);
          }

          if (request.method==="POST") {
            const b=await request.json();
            const id=Number(b.id);
            const action=String(b.action||"");

            if (!Number.isInteger(id)||id<=0)
              return json({error:"Невірний ID заявки"},400);

            if (["confirm","complete","cancel","reopen"].includes(action)) {
              const status={
                confirm:"confirmed",
                complete:"completed",
                cancel:"cancelled",
                reopen:"pending"
              }[action];

              await env.DB.prepare(`
                UPDATE bookings SET status=? WHERE id=?
              `).bind(status,id).run();

              await audit(env.DB,actor,action,`booking:${id}`,"");
              return json({
                ok:true,
                message:
                  action==="confirm"?"Заявку підтверджено":
                  action==="complete"?"Роботу позначено як виконану":
                  action==="cancel"?"Заявку скасовано":
                  "Заявку повернуто"
              });
            }

            if (action==="archive" || action==="delete") {
              const b0=await env.DB.prepare(`
                SELECT * FROM bookings WHERE id=?
              `).bind(id).first();

              if (!b0) return json({error:"Заявку не знайдено"},404);

              const t=await env.DB.prepare(`
                SELECT message_id FROM booking_telegram WHERE booking_id=?
              `).bind(id).first();

              if (t?.message_id) await deleteTelegram(env,t.message_id);

              await env.DB.prepare(`
                INSERT OR REPLACE INTO booking_history
                (id,name,phone,car,service,date,time,duration,note,status,created_at,archived_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
              `).bind(
                b0.id,b0.name,b0.phone,b0.car,b0.service,
                b0.date,b0.time,b0.duration||60,b0.note||"",
                b0.status,b0.created_at
              ).run();

              await env.DB.batch([
                env.DB.prepare(`DELETE FROM booking_telegram WHERE booking_id=?`).bind(id),
                env.DB.prepare(`DELETE FROM bookings WHERE id=?`).bind(id)
              ]);

              await audit(
                env.DB,actor,"archive_booking",`booking:${id}`,
                "Заявку перенесено в архів; Telegram повідомлення видалено"
              );

              return json({
                ok:true,
                message:"Заявку перенесено в архів"
              });
            }

            return json({error:"Невідома дія"},400);
          }
        }

        if (u.pathname==="/api/admin/history") {
          if (request.method==="GET") {
            const {results}=await env.DB.prepare(`
              SELECT id,name,phone,car,service,date,time,duration,note,status,created_at,archived_at
              FROM booking_history ORDER BY archived_at DESC LIMIT 500
            `).all();
            return json(results||[]);
          }

          if (request.method==="DELETE") {
            const s=await superAuth(request,env);
            if (s.error) return json({error:s.error},s.status);

            const id=u.searchParams.get("id");
            if (id) {
              await env.DB.prepare(`DELETE FROM booking_history WHERE id=?`)
                .bind(Number(id)).run();
              await audit(env.DB,actor,"delete_history",`history:${id}`,"");
              return json({ok:true,message:"Запис видалено з архіву"});
            }

            await env.DB.prepare(`DELETE FROM booking_history`).run();
            await audit(env.DB,actor,"clear_history","history","Архів очищено");
            return json({ok:true,message:"Архів очищено"});
          }
        }

        if (u.pathname==="/api/admin/reviews") {
          if (request.method==="GET") {
            const {results}=await env.DB.prepare(`
              SELECT id,name,rating,text,published,created_at
              FROM reviews ORDER BY created_at DESC LIMIT 300
            `).all();
            return json(results||[]);
          }

          if (request.method==="POST") {
            const b=await request.json();
            const id=Number(b.id);
            const action=String(b.action||"");

            if (!Number.isInteger(id)||id<=0)
              return json({error:"Невірний ID"},400);

            if (action==="approve" || action==="hide") {
              await env.DB.prepare(`
                UPDATE reviews SET published=? WHERE id=?
              `).bind(action==="approve"?1:0,id).run();

              await audit(env.DB,actor,action,`review:${id}`,"");

              return json({
                ok:true,
                message:action==="approve"?"Відгук опубліковано":"Відгук приховано"
              });
            }

            if (action==="delete") {
              const t=await env.DB.prepare(`
                SELECT message_id FROM review_telegram WHERE review_id=?
              `).bind(id).first();

              if (t?.message_id) await deleteTelegram(env,t.message_id);

              await env.DB.batch([
                env.DB.prepare(`DELETE FROM review_telegram WHERE review_id=?`).bind(id),
                env.DB.prepare(`DELETE FROM reviews WHERE id=?`).bind(id)
              ]);

              await audit(
                env.DB,actor,"delete_review",`review:${id}`,
                "Відгук видалено з сайту та Telegram"
              );

              return json({
                ok:true,
                message:"Відгук видалено з сайту та Telegram"
              });
            }

            return json({error:"Невідома дія"},400);
          }
        }

        if (u.pathname==="/api/admin/works") {
          if (request.method==="GET") {
            const {results}=await env.DB.prepare(`
              SELECT id,title,car,description,image_url,instagram_url,published,created_at
              FROM works ORDER BY created_at DESC LIMIT 300
            `).all();
            return json(results||[]);
          }

          if (request.method==="POST") {
            const b=await request.json();
            const title=String(b.title||"").trim();
            const car=String(b.car||"").trim();
            const description=String(b.description||"").trim();
            const image_url=String(b.image_url||"").trim();
            const instagram_url=String(b.instagram_url||"").trim();
            const published=b.published===false?0:1;

            if (!title || !image_url ||
                title.length>120 || car.length>120 ||
                description.length>1500 ||
                image_url.length>2000 ||
                instagram_url.length>2000)
              return json({error:"Некоректні дані роботи"},400);

            const r=await env.DB.prepare(`
              INSERT INTO works(title,car,description,image_url,instagram_url,published)
              VALUES(?,?,?,?,?,?)
            `).bind(
              title,car,description,image_url,instagram_url,published
            ).run();

            await audit(
              env.DB,actor,"add_work",
              `work:${r.meta?.last_row_id||""}`,title
            );

            return json({ok:true,message:"Роботу додано"},201);
          }

          if (request.method==="PATCH") {
            const id=Number(u.searchParams.get("id"));
            const b=await request.json();

            if (!Number.isInteger(id)||id<=0)
              return json({error:"Невірний ID"},400);

            await env.DB.prepare(`
              UPDATE works SET
              title=?,car=?,description=?,image_url=?,instagram_url=?,published=?
              WHERE id=?
            `).bind(
              String(b.title||"").trim(),
              String(b.car||"").trim(),
              String(b.description||"").trim(),
              String(b.image_url||"").trim(),
              String(b.instagram_url||"").trim(),
              b.published?1:0,
              id
            ).run();

            await audit(env.DB,actor,"update_work",`work:${id}`,"");
            return json({ok:true,message:"Роботу оновлено"});
          }

          if (request.method==="DELETE") {
            const id=Number(u.searchParams.get("id"));
            if (!Number.isInteger(id)||id<=0)
              return json({error:"Невірний ID"},400);

            await env.DB.prepare(`DELETE FROM works WHERE id=?`).bind(id).run();
            await audit(env.DB,actor,"delete_work",`work:${id}`,"");

            return json({ok:true,message:"Роботу видалено"});
          }
        }

        if (u.pathname==="/api/admin/logs") {
          if (request.method==="GET") {
            const {results}=await env.DB.prepare(`
              SELECT id,actor,action,target,details,created_at
              FROM admin_logs ORDER BY created_at DESC LIMIT 500
            `).all();
            return json(results||[]);
          }

          if (request.method==="DELETE") {
            const s=await superAuth(request,env);
            if (s.error) return json({error:s.error},s.status);

            await env.DB.prepare(`DELETE FROM admin_logs`).run();
            return json({ok:true,message:"Журнал дій очищено"});
          }
        }

        if (u.pathname==="/api/admin/blocks") {
          if (request.method==="GET") {
            const {results}=await env.DB.prepare(`
              SELECT id,date,time,reason,created_at
              FROM blocked_slots ORDER BY date,time
            `).all();
            return json(results||[]);
          }

          if (request.method==="POST") {
            const b=await request.json();

            if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date||"") ||
                !allSlots().includes(b.time))
              return json({error:"Некоректна дата або час"},400);

            try {
              await env.DB.prepare(`
                INSERT INTO blocked_slots(date,time,reason)
                VALUES(?,?,?)
              `).bind(
                b.date,b.time,String(b.reason||"").trim()
              ).run();

              await audit(
                env.DB,actor,"block_slot",
                `${b.date} ${b.time}`,
                String(b.reason||"").trim()
              );

              return json({ok:true,message:"Час заблоковано"},201);
            } catch(e) {
              if (String(e?.message||"").toLowerCase().includes("unique"))
                return json({error:"Цей час уже заблокований"},409);
              throw e;
            }
          }

          if (request.method==="DELETE") {
            const id=Number(u.searchParams.get("id"));
            if (!Number.isInteger(id)||id<=0)
              return json({error:"Невірний ID"},400);

            await env.DB.prepare(`DELETE FROM blocked_slots WHERE id=?`)
              .bind(id).run();

            await audit(env.DB,actor,"unblock_slot",`block:${id}`,"");
            return json({ok:true,message:"Блокування знято"});
          }
        }

        if (u.pathname==="/api/admin/cleanup") {
          if (request.method!=="POST")
            return json({error:"Method not allowed"},405);

          const s=await superAuth(request,env);
          if (s.error) return json({error:s.error},s.status);

          const b=await request.json().catch(()=>({}));
          const what=String(b.what||"");

          if (what==="old_logs") {
            await env.DB.prepare(`
              DELETE FROM admin_logs
              WHERE id NOT IN (
                SELECT id FROM admin_logs
                ORDER BY created_at DESC LIMIT 100
              )
            `).run();

            await audit(
              env.DB,actor,"cleanup","logs",
              "Залишено останні 100 записів"
            );

            return json({
              ok:true,
              message:"Старі записи журналу очищено"
            });
          }

          return json({error:"Невідома операція очищення"},400);
        }

        return json({error:"Admin endpoint not found"},404);
      }

      if (env.ASSETS) return env.ASSETS.fetch(request);

      return json({error:"Not found"},404);

    } catch(e) {
      console.error(e);
      return json({
        error:"Internal server error",
        detail:String(e?.message||e)
      },500);
    }
  }
};
