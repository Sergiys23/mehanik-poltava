const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Password",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS"
};

const START = "09:00";
const END = "18:00";
const DAYS = new Set([1,2,3,4,5,6]);
const DUR = {
  "Шиномонтаж": 60,
  "Ремонт двигуна та ходової": 120,
  "Розвал-сходження": 60,
  "Комп'ютерна діагностика": 60
};

const json = (data, status=200, extra={}) => {
  const h = new Headers({"content-type":"application/json; charset=utf-8", ...CORS, ...extra});
  return new Response(JSON.stringify(data), {status, headers:h});
};

const min = s => {
  const [a,b] = String(s).split(":").map(Number);
  return a*60+b;
};
const pad = n => String(n).padStart(2,"0");
const tm = n => `${pad(Math.floor(n/60))}:${pad(n%60)}`;
const slots = () => {
  const out=[];
  for(let n=min(START); n<min(END); n+=30) out.push(tm(n));
  return out;
};
const overlap = (a,ad,b,bd) => a < b+bd && a+ad > b;

function nowKyiv(){
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone:"Europe/Kyiv", year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", hourCycle:"h23"
  }).formatToParts(new Date());
  const g = t => p.find(x=>x.type===t)?.value;
  return {date:`${g("year")}-${g("month")}-${g("day")}`, m:Number(g("hour"))*60+Number(g("minute"))};
}
const working = date => DAYS.has(new Date(`${date}T12:00:00`).getDay());

function b64url(bytes){
  let s="";
  for(const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
async function hmac(secret, text){
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(text))));
}
async function makeSession(env, role){
  const secret = env.SESSION_SECRET || env.SUPERADMIN_PASSWORD || env.ADMIN_PASSWORD;
  if(!secret) return null;
  const payload = `${role}.${Date.now()}`;
  return `${payload}.${await hmac(secret,payload)}`;
}
function cookie(request,name){
  const raw=request.headers.get("cookie")||"";
  const item=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="));
  return item ? decodeURIComponent(item.slice(name.length+1)) : "";
}
async function roleFromRequest(request,env){
  const token=cookie(request,"mehanik_session");
  const secret=env.SESSION_SECRET || env.SUPERADMIN_PASSWORD || env.ADMIN_PASSWORD;
  if(token && secret){
    const p=token.split(".");
    if(p.length===3){
      const [role,stamp,sig]=p;
      const age=Date.now()-Number(stamp);
      if((role==="admin"||role==="superadmin") && age>=0 && age<=7*86400000){
        const expected=await hmac(secret,`${role}.${stamp}`);
        if(sig===expected) return role;
      }
    }
  }
  const legacy=request.headers.get("x-admin-password")||"";
  if(env.SUPERADMIN_PASSWORD && legacy===env.SUPERADMIN_PASSWORD) return "superadmin";
  if(env.ADMIN_PASSWORD && legacy===env.ADMIN_PASSWORD) return "admin";
  return null;
}
async function requireAdmin(request,env){
  const role=await roleFromRequest(request,env);
  return role ? {role} : {error:"Unauthorized",status:401};
}
async function requireSuper(request,env){
  const a=await requireAdmin(request,env);
  if(a.error) return a;
  return a.role==="superadmin" ? a : {error:"Потрібні права супер адміністратора",status:403};
}

async function ensureTables(db){
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS booking_telegram(booking_id INTEGER PRIMARY KEY,message_id INTEGER NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS booking_history(
      id INTEGER PRIMARY KEY,name TEXT NOT NULL,phone TEXT NOT NULL,car TEXT NOT NULL,service TEXT NOT NULL,
      date TEXT NOT NULL,time TEXT NOT NULL,duration INTEGER NOT NULL DEFAULT 60,note TEXT DEFAULT '',
      status TEXT NOT NULL,created_at TEXT NOT NULL,archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_booking_history_archived ON booking_history(archived_at DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS review_telegram(review_id INTEGER PRIMARY KEY,message_id INTEGER NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS admin_logs(
      id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT NOT NULL,action TEXT NOT NULL,
      target TEXT DEFAULT '',details TEXT DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(created_at DESC)`)
  ]);
  const info=await db.prepare(`PRAGMA table_info(works)`).all();
  const cols=new Set((info.results||[]).map(x=>x.name));
  if(!cols.has("car")) await db.prepare(`ALTER TABLE works ADD COLUMN car TEXT DEFAULT ''`).run();
  if(!cols.has("instagram_url")) await db.prepare(`ALTER TABLE works ADD COLUMN instagram_url TEXT DEFAULT ''`).run();
}
async function audit(db,actor,action,target="",details=""){
  await db.prepare(`INSERT INTO admin_logs(actor,action,target,details) VALUES(?,?,?,?)`)
    .bind(actor,action,target,details).run();
}

async function tg(env,method,body){
  if(!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID){
    console.warn("Telegram notification is not configured");
    return {ok:false,configured:false};
  }
  try{
    const r=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{
      method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok || !d.ok) return {ok:false,configured:true,error:d.description||`HTTP ${r.status}`};
    return d;
  }catch(e){ return {ok:false,configured:true,error:String(e)}; }
}
const sendTelegram=(env,text)=>tg(env,"sendMessage",{chat_id:env.TELEGRAM_CHAT_ID,text});
const deleteTelegram=(env,message_id)=>message_id?tg(env,"deleteMessage",{chat_id:env.TELEGRAM_CHAT_ID,message_id:Number(message_id)}):{ok:true};

async function notifyBooking(env,b){
  return sendTelegram(env,[
    "🔔 НОВА ЗАЯВКА — МЕХАНІК ПОЛТАВА","",
    `🆔 #${b.id}`,`👤 ${b.name}`,`📞 ${b.phone}`,`🚗 ${b.car}`,
    `🔧 ${b.service}`,`📅 ${b.date}`,`🕐 ${b.time}`,
    b.note?`📝 ${b.note}`:"📝 Коментар: немає"
  ].join("\n"));
}
async function notifyReview(env,r){
  return sendTelegram(env,[
    "⭐ НОВИЙ ВІДГУК — МЕХАНІК ПОЛТАВА","",
    `🆔 #${r.id}`,`👤 ${r.name}`,`⭐ ${r.rating}/5`,"",r.text
  ].join("\n"));
}

async function availability(env,date,service){
  const duration=DUR[service]||60, n=nowKyiv();
  const b=await env.DB.prepare(`SELECT time,duration FROM bookings WHERE date=? AND status IN ('pending','confirmed')`).bind(date).all();
  const bl=await env.DB.prepare(`SELECT time FROM blocked_slots WHERE date=?`).bind(date).all();
  return slots().map(time=>{
    const st=min(time);
    const past=date<n.date || (date===n.date && st<=n.m);
    const busy=(b.results||[]).some(x=>overlap(st,duration,min(x.time),Number(x.duration||60))) ||
      (bl.results||[]).some(x=>overlap(st,duration,min(x.time),30));
    return {time,busy:past||!working(date)||st+duration>min(END)};
  }).map(x=>({...x,busy:x.busy||false}));
}

async function adminLogin(request,env){
  if(!env.ADMIN_PASSWORD && !env.SUPERADMIN_PASSWORD) return json({error:"Admin secrets are not configured"},503);
  const body=await request.json();
  const username=String(body.username||"admin").trim().toLowerCase();
  const password=String(body.password||"");
  let role=null;
  if(username==="superadmin" && env.SUPERADMIN_PASSWORD && password===env.SUPERADMIN_PASSWORD) role="superadmin";
  else if(username==="admin" && env.ADMIN_PASSWORD && password===env.ADMIN_PASSWORD) role="admin";
  if(!role) return json({error:"Невірний логін або пароль"},401);
  const session=await makeSession(env,role);
  if(!session) return json({error:"SESSION_SECRET не налаштований"},500);
  await ensureTables(env.DB);
  await audit(env.DB,role,"login","auth","Успішний вхід");
  return json({ok:true,role},200,{
    "set-cookie":`mehanik_session=${encodeURIComponent(session)}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`
  });
}

export default {
  async fetch(request,env){
    if(request.method==="OPTIONS") return new Response(null,{status:204,headers:CORS});
    const u=new URL(request.url);

    try{
      if(u.pathname==="/api/auth/login" && request.method==="POST") return adminLogin(request,env);
      if(u.pathname==="/api/auth/logout" && request.method==="POST")
        return json({ok:true},200,{"set-cookie":"mehanik_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"});
      if(u.pathname==="/api/auth/me" && request.method==="GET"){
        const role=await roleFromRequest(request,env); return json({authenticated:!!role,role:role||null});
      }

      if(u.pathname==="/api/availability" && request.method==="GET"){
        const date=u.searchParams.get("date"),service=u.searchParams.get("service")||"Комп'ютерна діагностика";
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date||"") || !DUR[service]) return json({error:"Invalid date or service"},400);
        return json({date,service,duration:DUR[service],slots:await availability(env,date,service)});
      }

      if(u.pathname==="/api/bookings" && request.method==="POST"){
        const b=await request.json();
        for(const k of ["name","phone","car","service","date","time"])
          if(typeof b[k]!=="string"||!b[k].trim()) return json({error:`Missing ${k}`},400);
        if(!DUR[b.service]||!slots().includes(b.time)) return json({error:"Invalid booking"},400);
        const duration=DUR[b.service], n=nowKyiv(), st=min(b.time);
        if(!working(b.date)||b.date<n.date||(b.date===n.date&&st<=n.m)||st+duration>min(END)) return json({error:"Slot unavailable"},409);
        const bs=await env.DB.prepare(`SELECT time,duration FROM bookings WHERE date=? AND status IN ('pending','confirmed')`).bind(b.date).all();
        if((bs.results||[]).some(x=>overlap(st,duration,min(x.time),Number(x.duration||60)))) return json({error:"Slot busy"},409);
        const bl=await env.DB.prepare(`SELECT time FROM blocked_slots WHERE date=?`).bind(b.date).all();
        if((bl.results||[]).some(x=>overlap(st,duration,min(x.time),30))) return json({error:"Slot blocked"},409);
        const r=await env.DB.prepare(`INSERT INTO bookings(name,phone,car,service,date,time,duration,note) VALUES(?,?,?,?,?,?,?,?,?)`)
          .bind(b.name.trim(),b.phone.trim(),b.car.trim(),b.service,b.date,b.time,duration,(b.note||"").trim()).run();
        const id=Number(r.meta?.last_row_id);
        const sent=await notifyBooking(env,{...b,id});
        if(sent?.result?.message_id) await env.DB.prepare(`INSERT OR REPLACE INTO booking_telegram(booking_id,message_id) VALUES(?,?)`).bind(id,Number(sent.result.message_id)).run();
        return json({ok:true,id},201);
      }

      if(u.pathname==="/api/reviews" && request.method==="GET"){
        const r=await env.DB.prepare(`SELECT id,name,rating,text,created_at FROM reviews WHERE published=1 ORDER BY id DESC LIMIT 30`).all();
        return json(r.results||[]);
      }
      if(u.pathname==="/api/reviews" && request.method==="POST"){
        const b=await request.json(),name=String(b.name||"").trim(),text=String(b.text||"").trim(),rating=Number(b.rating);
        if(!name||!text||name.length>80||text.length>1500||!Number.isInteger(rating)||rating<1||rating>5) return json({error:"Некоректні дані"},400);
        const r=await env.DB.prepare(`INSERT INTO reviews(name,rating,text,published) VALUES(?,?,?,0)`).bind(name,rating,text).run();
        const id=Number(r.meta?.last_row_id), sent=await notifyReview(env,{id,name,rating,text});
        if(sent?.result?.message_id) await env.DB.prepare(`INSERT OR REPLACE INTO review_telegram(review_id,message_id) VALUES(?,?)`).bind(id,Number(sent.result.message_id)).run();
        return json({ok:true,message:"Дякуємо! Відгук надіслано на модерацію."},201);
      }

      if(u.pathname==="/api/works" && request.method==="GET"){
        await ensureTables(env.DB);
        const r=await env.DB.prepare(`SELECT id,title,car,description,image_url,instagram_url,created_at FROM works WHERE published=1 ORDER BY id DESC LIMIT 50`).all();
        return json(r.results||[]);
      }

      if(u.pathname.startsWith("/api/admin/")){
        if(!env.DB) return json({error:"D1 database is not configured"},503);
        await ensureTables(env.DB);
        const a=await requireAdmin(request,env);
        if(a.error) return json({error:a.error},a.status);
        const role=a.role;

        if(u.pathname==="/api/admin/bookings" && request.method==="GET"){
          const r=await env.DB.prepare(`SELECT * FROM bookings ORDER BY date ASC,time ASC`).all(); return json(r.results||[]);
        }
        if(u.pathname==="/api/admin/bookings" && request.method==="POST"){
          const b=await request.json(),id=Number(b.id),action=String(b.action||"");
          if(!Number.isInteger(id)||id<=0) return json({error:"Bad id"},400);
          const statusMap={confirm:"confirmed",complete:"completed",cancel:"cancelled",reopen:"pending"};
          if(statusMap[action]){
            await env.DB.prepare(`UPDATE bookings SET status=? WHERE id=?`).bind(statusMap[action],id).run();
            await audit(env.DB,role,action,`booking:${id}`,"");
            return json({ok:true,message:"Статус оновлено"});
          }
          if(action==="archive"||action==="delete"){
            const b0=await env.DB.prepare(`SELECT * FROM bookings WHERE id=?`).bind(id).first();
            if(!b0) return json({error:"Заявку не знайдено"},404);
            const tg0=await env.DB.prepare(`SELECT message_id FROM booking_telegram WHERE booking_id=?`).bind(id).first();
            if(tg0?.message_id) await deleteTelegram(env,tg0.message_id);
            await env.DB.prepare(`INSERT OR REPLACE INTO booking_history(id,name,phone,car,service,date,time,duration,note,status,created_at,archived_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
              .bind(b0.id,b0.name,b0.phone,b0.car,b0.service,b0.date,b0.time,b0.duration||60,b0.note||"",b0.status,b0.created_at).run();
            await env.DB.batch([
              env.DB.prepare(`DELETE FROM booking_telegram WHERE booking_id=?`).bind(id),
              env.DB.prepare(`DELETE FROM bookings WHERE id=?`).bind(id)
            ]);
            await audit(env.DB,role,"archive_booking",`booking:${id}`,"Заявку перенесено в архів; Telegram повідомлення видалено");
            return json({ok:true,message:"Заявку перенесено в архів"});
          }
        }

        if(u.pathname==="/api/admin/history"){
          if(request.method==="GET"){
            const r=await env.DB.prepare(`SELECT * FROM booking_history ORDER BY archived_at DESC LIMIT 500`).all(); return json(r.results||[]);
          }
          if(request.method==="DELETE"){
            const s=await requireSuper(request,env); if(s.error) return json({error:s.error},s.status);
            const id=u.searchParams.get("id");
            if(id){
              await env.DB.prepare(`DELETE FROM booking_history WHERE id=?`).bind(Number(id)).run();
              await audit(env.DB,role,"delete_history",`history:${id}`,"");
            }else{
              await env.DB.prepare(`DELETE FROM booking_history`).run();
              await audit(env.DB,role,"clear_history","history","Архів очищено");
            }
            return json({ok:true,message:"Історію очищено"});
          }
        }

        if(u.pathname==="/api/admin/reviews"){
          if(request.method==="GET"){
            const r=await env.DB.prepare(`SELECT id,name,rating,text,published,created_at FROM reviews ORDER BY id DESC LIMIT 300`).all(); return json(r.results||[]);
          }
          if(request.method==="POST"){
            const b=await request.json(),id=Number(b.id),action=String(b.action||"");
            if(action==="approve"||action==="hide"){
              await env.DB.prepare(`UPDATE reviews SET published=? WHERE id=?`).bind(action==="approve"?1:0,id).run();
              await audit(env.DB,role,action,`review:${id}`,"");
              return json({ok:true,message:action==="approve"?"Відгук опубліковано":"Відгук приховано"});
            }
            if(action==="delete"){
              const tg0=await env.DB.prepare(`SELECT message_id FROM review_telegram WHERE review_id=?`).bind(id).first();
              if(tg0?.message_id) await deleteTelegram(env,tg0.message_id);
              await env.DB.batch([
                env.DB.prepare(`DELETE FROM review_telegram WHERE review_id=?`).bind(id),
                env.DB.prepare(`DELETE FROM reviews WHERE id=?`).bind(id)
              ]);
              await audit(env.DB,role,"delete_review",`review:${id}`,"Відгук видалено з сайту та Telegram");
              return json({ok:true,message:"Відгук видалено з сайту та Telegram"});
            }
          }
        }

        if(u.pathname==="/api/admin/works"){
          if(request.method==="GET"){
            const r=await env.DB.prepare(`SELECT id,title,car,description,image_url,instagram_url,published,created_at FROM works ORDER BY id DESC LIMIT 300`).all(); return json(r.results||[]);
          }
          if(request.method==="POST"){
            const b=await request.json();
            const title=String(b.title||"").trim(),car=String(b.car||"").trim(),description=String(b.description||"").trim(),image_url=String(b.image_url||"").trim(),instagram_url=String(b.instagram_url||"").trim();
            if(!title||!image_url) return json({error:"Назва та фото обов'язкові"},400);
            const r=await env.DB.prepare(`INSERT INTO works(title,car,description,image_url,instagram_url,published) VALUES(?,?,?,?,?,?)`)
              .bind(title,car,description,image_url,instagram_url,b.published===false?0:1).run();
            await audit(env.DB,role,"add_work",`work:${r.meta?.last_row_id||""}`,title);
            return json({ok:true,message:"Роботу додано"},201);
          }
          if(request.method==="PATCH"){
            const id=Number(u.searchParams.get("id")),b=await request.json();
            if(!id) return json({error:"Bad id"},400);
            await env.DB.prepare(`UPDATE works SET title=?,car=?,description=?,image_url=?,instagram_url=?,published=? WHERE id=?`)
              .bind(String(b.title||""),String(b.car||""),String(b.description||""),String(b.image_url||""),String(b.instagram_url||""),b.published?1:0,id).run();
            await audit(env.DB,role,"update_work",`work:${id}`,"");
            return json({ok:true,message:"Роботу оновлено"});
          }
          if(request.method==="DELETE"){
            const id=Number(u.searchParams.get("id"));
            if(!id) return json({error:"Bad id"},400);
            await env.DB.prepare(`DELETE FROM works WHERE id=?`).bind(id).run();
            await audit(env.DB,role,"delete_work",`work:${id}`,"");
            return json({ok:true,message:"Роботу видалено"});
          }
        }

        if(u.pathname==="/api/admin/logs"){
          if(request.method==="GET"){
            const r=await env.DB.prepare(`SELECT * FROM admin_logs ORDER BY id DESC LIMIT 500`).all(); return json(r.results||[]);
          }
          if(request.method==="DELETE"){
            const s=await requireSuper(request,env); if(s.error) return json({error:s.error},s.status);
            await env.DB.prepare(`DELETE FROM admin_logs`).run(); return json({ok:true,message:"Журнал очищено"});
          }
        }

        if(u.pathname==="/api/admin/blocks" && request.method==="POST"){
          const b=await request.json();
          if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date||"")||!slots().includes(b.time)) return json({error:"Invalid block"},400);
          try{await env.DB.prepare(`INSERT INTO blocked_slots(date,time,reason) VALUES(?,?,?)`).bind(b.date,b.time,(b.reason||"").trim()).run()}
          catch(e){if(String(e.message||"").toLowerCa
