
const HEADERS = {
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

const json = (data, status=200, extra={}) => {
  const h = new Headers(HEADERS);
  Object.entries(extra).forEach(([k,v]) => h.set(k,v));
  return new Response(JSON.stringify(data), {status, headers:h});
};

const pad = n => String(n).padStart(2,"0");
const mins = t => {
  const [h,m] = String(t).split(":").map(Number);
  return h*60+m;
};
const timeOf = n => `${pad(Math.floor(n/60))}:${pad(n%60)}`;
const slots = () => {
  const out=[];
  for(let n=mins(START); n<mins(END); n+=30) out.push(timeOf(n));
  return out;
};
const overlap = (a,ad,b,bd) => a < b+bd && a+ad > b;
const working = date => WORKING_DAYS.has(new Date(`${date}T12:00:00`).getDay());

function kyivNow(){
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone:"Europe/Kyiv", year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", hourCycle:"h23"
  }).formatToParts(new Date());
  const get=t=>p.find(x=>x.type===t)?.value;
  return {
    date:`${get("year")}-${get("month")}-${get("day")}`,
    minutes:Number(get("hour"))*60+Number(get("minute"))
  };
}

function cookie(req,name){
  const raw=req.headers.get("cookie")||"";
  const hit=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="));
  return hit ? decodeURIComponent(hit.slice(name.length+1)) : "";
}

function b64url(bytes){
  let s="";
  for(const b of bytes)s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

async function sign(secret,text){
  const key=await crypto.subtle.importKey(
    "raw",new TextEncoder().encode(secret),
    {name:"HMAC",hash:"SHA-256"},false,["sign"]
  );
  const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(text));
  return b64url(new Uint8Array(sig));
}

async function session(env,role){
  const secret=env.SESSION_SECRET||env.SUPERADMIN_PASSWORD||env.ADMIN_PASSWORD;
  if(!secret)return null;
  const payload=`${role}.${Date.now()}`;
  return `${payload}.${await sign(secret,payload)}`;
}

async function role(req,env){
  const token=cookie(req,"mehanik_session");
  const secret=env.SESSION_SECRET||env.SUPERADMIN_PASSWORD||env.ADMIN_PASSWORD;
  if(token&&secret){
    const p=token.split(".");
    if(p.length===3){
      const [r,stamp,sig]=p;
      const age=Date.now()-Number(stamp);
      if((r==="admin"||r==="superadmin")&&age>=0&&age<=7*86400000){
        if(sig===await sign(secret,`${r}.${stamp}`))return r;
      }
    }
  }
  const pass=req.headers.get("x-admin-password")||"";
  if(env.SUPERADMIN_PASSWORD&&pass===env.SUPERADMIN_PASSWORD)return "superadmin";
  if(env.ADMIN_PASSWORD&&pass===env.ADMIN_PASSWORD)return "admin";
  return null;
}

async function requireAdmin(req,env,superOnly=false){
  if(!env.ADMIN_PASSWORD&&!env.SUPERADMIN_PASSWORD)
    return {error:"Паролі адміністратора не налаштовані",status:500};
  const r=await role(req,env);
  if(!r)return {error:"Потрібна авторизація",status:401};
  if(superOnly&&r!=="superadmin")
    return {error:"Потрібен superadmin",status:403};
  return {role:r};
}

async function ensure(db){
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS blocked_slots(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,time TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_blocked_slot ON blocked_slots(date,time)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_bookings_slot ON bookings(preferred_date,preferred_time)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_reviews_approved ON reviews(approved,created_at)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_works_published ON works(published,created_at)`)
  ]);
}

async function audit(db,actor,action,target="",details=""){
  try{
    await db.prepare(`INSERT INTO admin_logs(actor,action,target,details) VALUES(?,?,?,?)`)
      .bind(actor,action,target,details).run();
  }catch(e){console.error("audit",e);}
}

async function tg(env,method,payload){
  if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)
    return {ok:false,configured:false};
  try{
    const r=await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
      {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)}
    );
    const d=await r.json().catch(()=>({}));
    return r.ok&&d.ok?d:{ok:false,configured:true,error:d.description||`HTTP ${r.status}`};
  }catch(e){return {ok:false,configured:true,error:String(e)}}
}
const sendTg=(env,text)=>tg(env,"sendMessage",{chat_id:env.TELEGRAM_CHAT_ID,text});
const deleteTg=(env,id)=>id?tg(env,"deleteMessage",{chat_id:env.TELEGRAM_CHAT_ID,message_id:Number(id)}):{ok:true};

async function availability(env,date,service){
  const duration=DURATIONS[service];
  const now=kyivNow();
  const bookings=(await env.DB.prepare(`
    SELECT preferred_time,service FROM bookings
    WHERE preferred_date=? AND status IN ('new','confirmed')
  `).bind(date).all()).results||[];
  const blocked=(await env.DB.prepare(
    `SELECT time FROM blocked_slots WHERE date=?`
  ).bind(date).all()).results||[];

  return slots().map(time=>{
    const start=mins(time);
    const past=date<now.date||(date===now.date&&start<=now.minutes);
    const busyBooking=bookings.some(b=>
      overlap(start,duration,mins(b.preferred_time),DURATIONS[b.service]||60)
    );
    const busyBlock=blocked.some(b=>overlap(start,duration,mins(b.time),30));
    return {
      time,
      busy:past||!working(date)||start+duration>mins(END)||busyBooking||busyBlock
    };
  });
}

async function createBooking(req,env){
  const b=await req.json();
  for(const k of ["name","phone","car","service","date","time"])
    if(typeof b[k]!=="string"||!b[k].trim())return json({error:`Не заповнено: ${k}`},400);

  if(!DURATIONS[b.service]||!slots().includes(b.time)||!/^\d{4}-\d{2}-\d{2}$/.test(b.date))
    return json({error:"Некоректна дата, час або послуга"},400);

  const duration=DURATIONS[b.service], now=kyivNow(), start=mins(b.time);
  if(!working(b.date)||b.date<now.date||(b.date===now.date&&start<=now.minutes)||start+duration>mins(END))
    return json({error:"Цей час недоступний"},409);

  const existing=(await env.DB.prepare(`
    SELECT preferred_time,service FROM bookings
    WHERE preferred_date=? AND status IN ('new','confirmed')
  `).bind(b.date).all()).results||[];
  if(existing.some(x=>overlap(start,duration,mins(x.preferred_time),DURATIONS[x.service]||60)))
    return json({error:"Цей час щойно зайняли"},409);

  const blocked=(await env.DB.prepare(`SELECT time FROM blocked_slots WHERE date=?`).bind(b.date).all()).results||[];
  if(blocked.some(x=>overlap(start,duration,mins(x.time),30)))
    return json({error:"Цей час заблокований"},409);

  const r=await env.DB.prepare(`
    INSERT INTO bookings(name,phone,car,service,preferred_date,preferred_time,comment)
    VALUES(?,?,?,?,?,?,?)
  `).bind(
    b.name.trim(),b.phone.trim(),b.car.trim(),b.service,
    b.date,b.time,String(b.note||b.comment||"").trim()
  ).run();

  const id=Number(r.meta?.last_row_id);
  const message=[
    "🔔 НОВА ЗАЯВКА — МЕХАНІК ПОЛТАВА","",
    `🆔 Заявка: #${id}`,`👤 Ім'я: ${b.name}`,
    `📞 Телефон: ${b.phone}`,`🚗 Автомобіль: ${b.car}`,
    `🔧 Послуга: ${b.service}`,`📅 Дата: ${b.date}`,
    `🕐 Час: ${b.time}`,
    b.note?`📝 Коментар: ${b.note}`:"📝 Коментар: немає",
    "","🟡 Статус: НОВА ЗАЯВКА"
  ].join("\n");
  const t=await sendTg(env,message);
  if(t?.result?.message_id)
    await env.DB.prepare(
      `INSERT OR REPLACE INTO booking_telegram(booking_id,message_id) VALUES(?,?)`
    ).bind(id,Number(t.result.message_id)).run();

  return json({ok:true,id},201);
}

async function adminBookings(req,env,actor){
  if(req.method==="GET"){
    const {results}=await env.DB.prepare(`
      SELECT id,name,phone,car,service,
      preferred_date AS date,preferred_time AS time,
      comment AS note,status,created_at
      FROM bookings ORDER BY created_at DESC LIMIT 300
    `).all();
    return json(results||[]);
  }
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const b=await req.json(),id=Number(b.id),action=String(b.action||"");
  if(!Number.isInteger(id)||id<1)return json({error:"Невірний ID"},400);

  const map={confirm:"confirmed",complete:"completed",cancel:"cancelled",reopen:"new"};
  if(map[action]){
    await env.DB.prepare(`UPDATE bookings SET status=? WHERE id=?`).bind(map[action],id).run();
    await audit(env.DB,actor,action,`booking:${id}`);
    return json({ok:true,message:
      action==="confirm"?"Заявку підтверджено":
      action==="complete"?"Роботу позначено як виконану":
      action==="cancel"?"Заявку скасовано":"Заявку повернуто"});
  }

  if(action==="archive"||action==="delete"){
    const b0=await env.DB.prepare(`SELECT * FROM bookings WHERE id=?`).bind(id).first();
    if(!b0)return json({error:"Заявку не знайдено"},404);

    const t=await env.DB.prepare(`SELECT message_id FROM booking_telegram WHERE booking_id=?`)
      .bind(id).first();
    if(t?.message_id)await deleteTg(env,t.message_id);

    await env.DB.prepare(`
      INSERT OR REPLACE INTO booking_history
      (id,name,phone,car,service,preferred_date,preferred_time,comment,status,created_at,archived_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    `).bind(
      b0.id,b0.name,b0.phone,b0.car,b0.service,
      b0.preferred_date,b0.preferred_time,b0.comment||"",b0.status,b0.created_at
    ).run();

    await env.DB.batch([
      env.DB.prepare(`DELETE FROM booking_telegram WHERE booking_id=?`).bind(id),
      env.DB.prepare(`DELETE FROM bookings WHERE id=?`).bind(id)
    ]);
    await audit(env.DB,actor,"archive_booking",`booking:${id}`,"Telegram message deleted");
    return json({ok:true,message:"Заявку перенесено в архів"});
  }
  return json({error:"Невідома дія"},400);
}

async function adminReviews(req,env,actor){
  if(req.method==="GET"){
    const {results}=await env.DB.prepare(`
      SELECT id,name,rating,text,approved,created_at
      FROM reviews ORDER BY created_at DESC LIMIT 300
    `).all();
    return json((results||[]).map(x=>({...x,published:Number(x.approved||0)})));
  }
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const b=await req.json(),id=Number(b.id),action=String(b.action||"");
  if(!Number.isInteger(id)||id<1)return json({error:"Невірний ID"},400);

  if(action==="approve"||action==="hide"){
    await env.DB.prepare(`UPDATE reviews SET approved=? WHERE id=?`)
      .bind(action==="approve"?1:0,id).run();
    await audit(env.DB,actor,action,`review:${id}`);
    return json({ok:true,message:action==="approve"?"Відгук опубліковано":"Відгук приховано"});
  }

  if(action==="delete"){
    const t=await env.DB.prepare(`SELECT message_id FROM review_telegram WHERE review_id=?`)
      .bind(id).first();
    if(t?.message_id)await deleteTg(env,t.message_id);
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM review_telegram WHERE review_id=?`).bind(id),
      env.DB.prepare(`DELETE FROM reviews WHERE id=?`).bind(id)
    ]);
    await audit(env.DB,actor,"delete_review",`review:${id}`,"Site + Telegram");
    return json({ok:true,message:"Відгук видалено з сайту та Telegram"});
  }
  return json({error:"Невідома дія"},400);
}

async function adminWorks(req,env,actor,u){
  if(req.method==="GET"){
    const {results}=await env.DB.prepare(`
      SELECT id,title,car,description,image_url,instagram_url,published,created_at
      FROM works ORDER BY created_at DESC LIMIT 300
    `).all();
    return json(results||[]);
  }
  if(req.method==="POST"){
    const b=await req.json();
    const title=String(b.title||"").trim();
    const car=String(b.car||"").trim();
    const description=String(b.description||"").trim();
    const image_url=String(b.image_url||"").trim();
    const instagram_url=String(b.instagram_url||"").trim();
    if(!title||!image_url)return json({error:"Назва та URL фото обов'язкові"},400);
    const r=await env.DB.prepare(`
      INSERT INTO works(title,car,description,image_url,instagram_url,published)
      VALUES(?,?,?,?,?,1)
    `).bind(title,car,description,image_url,instagram_url).run();
    await audit(env.DB,actor,"add_work",`work:${r.meta?.last_row_id||""}`,title);
    return json({ok:true,message:"Роботу додано"},201);
  }
  if(req.method==="PATCH"){
    const id=Number(u.searchParams.get("id"));
    if(!Number.isInteger(id)||id<1)return json({error:"Невірний ID"},400);
    const b=await req.json();
    await env.DB.prepare(`
      UPDATE works SET title=?,car=?,description=?,image_url=?,instagram_url=?,published=?
      WHERE id=?
    `).bind(
      String(b.title||"").trim(),String(b.car||"").trim(),
      String(b.description||"").trim(),String(b.image_url||"").trim(),
      String(b.instagram_url||"").trim(),b.published?1:0,id
    ).run();
    await audit(env.DB,actor,"update_work",`work:${id}`);
    return json({ok:true,message:"Роботу оновлено"});
  }
  if(req.method==="DELETE"){
    const id=Number(u.searchParams.get("id"));
    if(!Number.isInteger(id)||id<1)return json({error:"Невірний ID"},400);
    await env.DB.prepare(`DELETE FROM works WHERE id=?`).bind(id).run();
    await audit(env.DB,actor,"delete_work",`work:${id}`);
    return json({ok:true,message:"Роботу видалено"});
  }
  return json({error:"Method not allowed"},405);
}

async function adminHistory(req,env,actor){
  if(req.method==="GET"){
    const {results}=await env.DB.prepare(`
      SELECT id,name,phone,car,service,
      preferred_date AS date,preferred_time AS time,
      comment AS note,status,created_at,archived_at
      FROM booking_history ORDER BY archived_at DESC LIMIT 500
    `).all();
    return json(results||[]);
  }
  if(req.method==="DELETE"){
    const id=new URL(req.url).searchParams.get("id");
    if(id){
      await env.DB.prepare(`DELETE FROM booking_history WHERE id=?`).bind(Number(id)).run();
      await audit(env.DB,actor,"delete_history",`history:${id}`);
      return json({ok:true,message:"Запис видалено з архіву"});
    }
    await env.DB.prepare(`DELETE FROM booking_history`).run();
    await audit(env.DB,actor,"clear_history","history");
    return json({ok:true,message:"Архів очищено"});
  }
  return json({error:"Method not allowed"},405);
}

export default {
  async fetch(request,env){
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers:HEADERS});
    const u=new URL(request.url);

    try{
      if(u.pathname==="/api/auth/login"&&request.method==="POST"){
        const b=await request.json();
        const username=String(b.username||"").trim().toLowerCase();
        const password=String(b.password||"");
        let r=null;
        if(username==="superadmin"&&env.SUPERADMIN_PASSWORD===password)r="superadmin";
        if(username==="admin"&&env.ADMIN_PASSWORD===password)r="admin";
        if(!r)return json({error:"Невірний логін або пароль"},401);
        const token=await session(env,r);
        if(!token)return json({error:"SESSION_SECRET не налаштований"},500);
        if(env.DB){await ensure(env.DB);await audit(env.DB,r,"login","auth");}
        return json({ok:true,role:r},200,{
          "set-cookie":`mehanik_session=${encodeURIComponent(token)}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`
        });
      }

      if(u.pathname==="/api/auth/logout"&&request.method==="POST")
        return json({ok:true},200,{"set-cookie":"mehanik_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"});

      if(u.pathname==="/api/auth/me"&&request.method==="GET")
        return json({authenticated:!!(await role(request,env)),role:(await role(request,env))||null});

      if(u.pathname.startsWith("/api/")){
        if(!env.DB)return json({error:"D1 database is not configured"},503);
        await ensure(env.DB);

        if(u.pathname==="/api/availability"&&request.method==="GET"){
          const date=u.searchParams.get("date");
          const service=u.searchParams.get("service");
          if(!date||!DURATIONS[service])return json({error:"Невірна дата або послуга"},400);
          return json({date,service,duration:DURATIONS[service],slots:await availability(env,date,service)});
        }

        if(u.pathname==="/api/bookings"&&request.method==="POST")
          return createBooking(request,env);

        if(u.pathname==="/api/reviews"&&request.method==="GET"){
          const {results}=await env.DB.prepare(`
            SELECT id,name,rating,text,created_at FROM reviews
            WHERE approved=1 ORDER BY id DESC LIMIT 50
          `).all();
          return json(results||[]);
        }

        if(u.pathname==="/api/reviews"&&request.method==="POST"){
          const b=await request.json();
          const name=String(b.name||"").trim();
          const text=String(b.text||"").trim();
          const rating=Number(b.rating);
          if(!name||!text||name.length>80||text.length>1500||!Number.isInteger(rating)||rating<1||rating>5)
            return json({error:"Некоректні дані"},400);
          const r=await env.DB.prepare(
            `INSERT INTO reviews(name,rating,text,approved) VALUES(?,?,?,0)`
          ).bind(name,rating,text).run();
          const id=Number(r.meta?.last_row_id);
          const t=await sendTg(env,[
            "⭐ НОВИЙ ВІДГУК — МЕХАНІК ПОЛТАВА","",
            `🆔 Відгук: #${id}`,`👤 Ім'я: ${name}`,
            `⭐ Оцінка: ${rating}/5`,"",`💬 ${text}`,
            "","🟡 Статус: ПОТРІБНА МОДЕРАЦІЯ"
          ].join("\n"));
          if(t?.result?.message_id)
            await env.DB.prepare(`INSERT OR REPLACE INTO review_telegram(review_id,message_id) VALUES(?,?)`)
              .bind(id,Number(t.result.message_id)).run();
          return json({ok:true,message:"Дякуємо! Відгук надіслано на модерацію."},201);
        }

        if(u.pathname==="/api/works"&&request.method==="GET"){
          const {results}=await env.DB.prepare(`
            SELECT id,title,car,description,image_url,instagram_url,created_at
            FROM works WHERE published=1 ORDER BY created_at DESC LIMIT 100
          `).all();
          return json(results||[]);
        }

        if(u.pathname.startsWith("/api/admin/")){
          const a=await requireAdmin(request,env);
          if(a.error)return json({error:a.error},a.status);
          const actor=a.role;
          if(u.pathname==="/api/admin/bookings")return adminBookings(request,env,actor);
          if(u.pathname==="/api/admin/reviews")return adminReviews(request,env,actor);
          if(u.pathname==="/api/admin/works")return adminWorks(request,env,actor,u);
          if(u.pathname==="/api/admin/history"){
            const s=await requireAdmin(request,env,true);
            if(s.error&&request.method==="DELETE")return json({error:s.error},s.status);
            return adminHistory(request,env,actor);
          }
          if(u.pathname==="/api/admin/logs"){
            if(request.method==="GET"){
              const {results}=await env.DB.prepare(`
                SELECT id,actor,action,target,details,created_at
                FROM admin_logs ORDER BY created_at DESC LIMIT 500
              `).all();
              return json(results||[]);
            }
            if(request.method==="DELETE"){
              const s=await requireAdmin(request,env,true);
              if(s.error)return json({error:s.error},s.status);
              await env.DB.prepare(`DELETE FROM admin_logs`).run();
              return json({ok:true,message:"Журнал очищено"});
            }
          }
          if(u.pathname==="/api/admin/blocks"){
            if(request.method==="GET"){
              const {results}=await env.DB.prepare(`SELECT id,date,time,reason,created_at FROM blocked_slots ORDER BY date,time`).all();
              return json(results||[]);
            }
            if(request.method==="POST"){
              const b=await request.json();
              if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date||"")||!slots().includes(b.time))
                return json({error:"Некоректна дата або час"},400);
              try{
                await env.DB.prepare(`INSERT INTO blocked_slots(date,time,reason) VALUES(?,?,?)`)
                  .bind(b.date,b.time,String(b.reason||"").trim()).run();
                await audit(env.DB,actor,"block_slot",`${b.date} ${b.time}`);
                return json({ok:true,message:"Час заблоковано"},201);
              }catch(e){return json({error:"Цей час уже заблокований"},409);}
            }
            if(request.method==="DELETE"){
              const id=Number(u.searchParams.get("id"));
              await env.DB.prepare(`DELETE FROM blocked_slots WHERE id=?`).bind(id).run();
              await audit(env.DB,actor,"unblock_slot",`block:${id}`);
              return json({ok:true,message:"Блокування знято"});
            }
          }
          return json({error:"Admin endpoint not found"},404);
        }
      }

      if(env.ASSETS)return env.ASSETS.fetch(request);
      return json({error:"Not found"},404);
    }catch(e){
      console.error(e);
      return json({error:"Internal server error",detail:String(e?.message||e)},500);
    }
  }
};
