
const HEADERS={
 "content-type":"application/json; charset=utf-8","cache-control":"no-store",
 "access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,PATCH,DELETE,OPTIONS",
 "access-control-allow-headers":"content-type,x-admin-password"
};
const START="09:00",END="18:00",WORKING_DAYS=new Set([1,2,3,4,5,6]);
const DURATIONS={"Шиномонтаж":60,"Ремонт двигуна та ходової":120,"Розвал-сходження":60,"Комп'ютерна діагностика":60};
const json=(d,s=200,x={})=>{const h=new Headers(HEADERS);Object.entries(x).forEach(([k,v])=>h.set(k,v));return new Response(JSON.stringify(d),{status:s,headers:h})};
const pad=n=>String(n).padStart(2,"0"),mins=t=>{const [h,m]=String(t).split(":").map(Number);return h*60+m},timeOf=n=>`${pad(Math.floor(n/60))}:${pad(n%60)}`;
const slots=()=>{const a=[];for(let n=mins(START);n<mins(END);n+=30)a.push(timeOf(n));return a};
const working=d=>WORKING_DAYS.has(new Date(`${d}T12:00:00`).getDay());
const overlap=(a,ad,b,bd)=>a<b+bd&&a+ad>b;
function kyivNow(){const p=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Kyiv",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date()),g=t=>p.find(x=>x.type===t)?.value;return{date:`${g("year")}-${g("month")}-${g("day")}`,minutes:+g("hour")*60+ +g("minute")}}
function cookie(req,n){const s=req.headers.get("cookie")||"",x=s.split(";").map(v=>v.trim()).find(v=>v.startsWith(n+"="));return x?decodeURIComponent(x.slice(n.length+1)):""}
function b64(a){let s="";for(const x of a)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
async function sign(secret,text){const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64(new Uint8Array(await crypto.subtle.sign("HMAC",k,new TextEncoder().encode(text))))}
async function session(env,r){const s=env.SESSION_SECRET||env.SUPERADMIN_PASSWORD||env.ADMIN_PASSWORD;if(!s)return null;const p=`${r}.${Date.now()}`;return `${p}.${await sign(s,p)}`}
async function role(req,env){const s=env.SESSION_SECRET||env.SUPERADMIN_PASSWORD||env.ADMIN_PASSWORD,t=cookie(req,"mehanik_session");if(t&&s){const p=t.split(".");if(p.length===3){const[r,stamp,sig]=p,age=Date.now()-+stamp;if((r==="admin"||r==="superadmin")&&age>=0&&age<=604800000&&sig===await sign(s,`${r}.${stamp}`))return r}}const pass=req.headers.get("x-admin-password")||"";if(env.SUPERADMIN_PASSWORD&&pass===env.SUPERADMIN_PASSWORD)return"superadmin";if(env.ADMIN_PASSWORD&&pass===env.ADMIN_PASSWORD)return"admin";return null}
async function auth(req,env,superOnly=false){if(!env.ADMIN_PASSWORD&&!env.SUPERADMIN_PASSWORD)return{error:"Паролі адміністратора не налаштовані",status:500};const r=await role(req,env);if(!r)return{error:"Потрібна авторизація",status:401};if(superOnly&&r!=="superadmin")return{error:"Потрібен superadmin",status:403};return{role:r}}
async function ensure(db){await db.batch([
 db.prepare(`CREATE TABLE IF NOT EXISTS blocked_slots(id INTEGER PRIMARY KEY AUTOINCREMENT,date TEXT NOT NULL,time TEXT NOT NULL,reason TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
 db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_blocked_slot ON blocked_slots(date,time)`),
 db.prepare(`CREATE INDEX IF NOT EXISTS idx_bookings_slot ON bookings(preferred_date,preferred_time)`),
 db.prepare(`CREATE INDEX IF NOT EXISTS idx_reviews_approved ON reviews(approved,created_at)`),
 db.prepare(`CREATE INDEX IF NOT EXISTS idx_works_published ON works(published,created_at)`)
])}
async function audit(db,a,act,target="",details=""){try{await db.prepare(`INSERT INTO admin_logs(actor,action,target,details) VALUES(?,?,?,?)`).bind(a,act,target,details).run()}catch(e){console.error(e)}}
async function tg(env,method,payload){if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return{ok:false};try{const r=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)}),d=await r.json().catch(()=>({}));return r.ok&&d.ok?d:{ok:false,error:d.description||`HTTP ${r.status}`}}catch(e){return{ok:false,error:String(e)}}}
const sendTg=(e,t)=>tg(e,"sendMessage",{chat_id:e.TELEGRAM_CHAT_ID,text:t});
const editTg=(e,id,t)=>tg(e,"editMessageText",{chat_id:e.TELEGRAM_CHAT_ID,message_id:+id,text:t});
const delTg=(e,id)=>tg(e,"deleteMessage",{chat_id:e.TELEGRAM_CHAT_ID,message_id:+id});
function bookingText(b,id){return["🔔 НОВА ЗАЯВКА — МЕХАНІК ПОЛТАВА","",`🆔 Заявка: #${id}`,`👤 Ім'я: ${b.name}`,`📞 Телефон: ${b.phone}`,`🚗 Автомобіль: ${b.car}`,`🔧 Послуга: ${b.service}`,`📅 Дата: ${b.preferred_date||b.date}`,`🕐 Час: ${b.preferred_time||b.time||"Узгоджується з майстром"}`,b.comment||b.note?`📝 Коментар: ${b.comment||b.note}`:"📝 Коментар: немає","","🟡 Статус: "+(b.status==="confirmed"?"ПІДТВЕРДЖЕНО":"НОВА ЗАЯВКА")].join("\n")}
async function createBooking(req,env){
 const b=await req.json();for(const k of["name","phone","car","service","date"])if(typeof b[k]!=="string"||!b[k].trim())return json({error:`Не заповнено: ${k}`},400);
 if(!DURATIONS[b.service]||!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||!working(b.date))return json({error:"Некоректна дата або послуга"},400);
 const now=kyivNow();if(b.date<now.date)return json({error:"Дата вже минула"},409);
 const comment=String(b.note||b.comment||"").trim();
 const r=await env.DB.prepare(`INSERT INTO bookings(name,phone,car,service,preferred_date,preferred_time,comment) VALUES(?,?,?,?,?,?,?)`)
  .bind(b.name.trim(),b.phone.trim(),b.car.trim(),b.service,b.date,"Узгоджується з майстром",comment).run();
 const id=Number(r.meta?.last_row_id),row={...b,preferred_date:b.date,preferred_time:"Узгоджується з майстром",comment,status:"new"};
 const t=await sendTg(env,bookingText(row,id));
 if(t?.result?.message_id)await env.DB.prepare(`INSERT OR REPLACE INTO booking_telegram(booking_id,message_id) VALUES(?,?)`).bind(id,+t.result.message_id).run();
 return json({ok:true,id,message:"Заявку прийнято. Майстер зв'яжеться з вами для узгодження часу."},201);
}
async function adminBookings(req,env,actor){
 if(req.method==="GET"){const{results}=await env.DB.prepare(`SELECT id,name,phone,car,service,preferred_date AS date,preferred_time AS time,comment AS note,status,created_at FROM bookings ORDER BY created_at DESC LIMIT 300`).all();return json(results||[])}
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const b=await req.json(),id=+b.id,action=String(b.action||"");if(!Number.isInteger(id)||id<1)return json({error:"Невірний ID"},400);
 const row=await env.DB.prepare(`SELECT * FROM bookings WHERE id=?`).bind(id).first();if(!row)return json({error:"Заявку не знайдено"},404);
 if(action==="set_time"){
   const time=String(b.time||"").trim();
   if(!/^\d{2}:\d{2}$/.test(time)||!slots().includes(time))return json({error:"Вкажіть час у форматі HH:MM"},400);
   const start=mins(time),duration=DURATIONS[row.service]||60,now=kyivNow();
   if(!working(row.preferred_date)||row.preferred_date<now.date||(row.preferred_date===now.date&&start<=now.minutes)||start+duration>mins(END))return json({error:"Цей час недоступний"},409);
   const others=(await env.DB.prepare(`SELECT preferred_time,service FROM bookings WHERE preferred_date=? AND id<>? AND status IN ('new','confirmed')`).bind(row.preferred_date,id).all()).results||[];
   if(others.some(x=>slots().includes(x.preferred_time)&&overlap(start,duration,mins(x.preferred_time),DURATIONS[x.service]||60)))return json({error:"Цей час уже зайнятий"},409);
   await env.DB.prepare(`UPDATE bookings SET preferred_time=?,status='confirmed' WHERE id=?`).bind(time,id).run();
   const t=await env.DB.prepare(`SELECT message_id FROM booking_telegram WHERE booking_id=?`).bind(id).first();
   const updated={...row,preferred_time:time,status:"confirmed"};
   if(t?.message_id)await editTg(env,t.message_id,bookingText(updated,id));else{const n=await sendTg(env,bookingText(updated,id));if(n?.result?.message_id)await env.DB.prepare(`INSERT OR REPLACE INTO booking_telegram(booking_id,message_id) VALUES(?,?)`).bind(id,+n.result.message_id).run()}
   await audit(env.DB,actor,"set_time",`booking:${id}`,time);return json({ok:true,message:`Час ${time} узгоджено та заявку підтверджено`});
 }
 const map={confirm:"confirmed",complete:"completed",cancel:"cancelled",reopen:"new"};
 if(map[action]){await env.DB.prepare(`UPDATE bookings SET status=? WHERE id=?`).bind(map[action],id).run();await audit(env.DB,actor,action,`booking:${id}`);return json({ok:true,message:"Статус заявки оновлено"})}
 if(action==="archive"||action==="delete"){
  const t=await env.DB.prepare(`SELECT message_id FROM booking_telegram WHERE booking_id=?`).bind(id).first();if(t?.message_id)await delTg(env,t.message_id);
  await env.DB.prepare(`INSERT OR REPLACE INTO booking_history(id,name,phone,car,service,preferred_date,preferred_time,comment,status,created_at,archived_at) VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
   .bind(row.id,row.name,row.phone,row.car,row.service,row.preferred_date,row.preferred_time,row.comment||"",row.status,row.created_at).run();
  await env.DB.batch([env.DB.prepare(`DELETE FROM booking_telegram WHERE booking_id=?`).bind(id),env.DB.prepare(`DELETE FROM bookings WHERE id=?`).bind(id)]);
  await audit(env.DB,actor,"archive_booking",`booking:${id}`);return json({ok:true,message:"Заявку перенесено в архів"});
 }
 return json({error:"Невідома дія"},400);
}
async function adminReviews(req,env,actor){
 if(req.method==="GET"){const{results}=await env.DB.prepare(`SELECT id,name,rating,text,approved,created_at FROM reviews ORDER BY created_at DESC LIMIT 300`).all();return json((results||[]).map(x=>({...x,published:+x.approved})))}
 if(req.method!=="POST")return json({error:"Method not allowed"},405);const b=await req.json(),id=+b.id,a=String(b.action||"");
 if(a==="approve"||a==="hide"){await env.DB.prepare(`UPDATE reviews SET approved=? WHERE id=?`).bind(a==="approve"?1:0,id).run();await audit(env.DB,actor,a,`review:${id}`);return json({ok:true})}
 if(a==="delete"){const t=await env.DB.prepare(`SELECT message_id FROM review_telegram WHERE review_id=?`).bind(id).first();if(t?.message_id)await delTg(env,t.message_id);await env.DB.batch([env.DB.prepare(`DELETE FROM review_telegram WHERE review_id=?`).bind(id),env.DB.prepare(`DELETE FROM reviews WHERE id=?`).bind(id)]);return json({ok:true})}
 return json({error:"Невідома дія"},400)
}
async function adminWorks(req,env,actor,u){
 if(req.method==="GET"){const{results}=await env.DB.prepare(`SELECT id,title,car,description,image_url,instagram_url,published,created_at FROM works ORDER BY created_at DESC LIMIT 300`).all();return json(results||[])}
 if(req.method==="POST"){const b=await req.json();if(!String(b.title||"").trim()||!String(b.image_url||"").trim())return json({error:"Назва та URL фото обов'язкові"},400);const r=await env.DB.prepare(`INSERT INTO works(title,car,description,image_url,instagram_url,published) VALUES(?,?,?,?,?,1)`).bind(String(b.title).trim(),String(b.car||"").trim(),String(b.description||"").trim(),String(b.image_url).trim(),String(b.instagram_url||"").trim()).run();await audit(env.DB,actor,"add_work",`work:${r.meta?.last_row_id||""}`);return json({ok:true},201)}
 if(req.method==="PATCH"){const id=+u.searchParams.get("id"),b=await req.json();await env.DB.prepare(`UPDATE works SET title=?,car=?,description=?,image_url=?,instagram_url=?,published=? WHERE id=?`).bind(String(b.title||"").trim(),String(b.car||"").trim(),String(b.description||"").trim(),String(b.image_url||"").trim(),String(b.instagram_url||"").trim(),b.published?1:0,id).run();return json({ok:true})}
 if(req.method==="DELETE"){const id=+u.searchParams.get("id");await env.DB.prepare(`DELETE FROM works WHERE id=?`).bind(id).run();return json({ok:true})}
 return json({error:"Method not allowed"},405)
}
async function adminHistory(req,env,actor){
 if(req.method==="GET"){const{results}=await env.DB.prepare(`SELECT id,name,phone,car,service,preferred_date AS date,preferred_time AS time,comment AS note,status,created_at,archived_at FROM booking_history ORDER BY archived_at DESC LIMIT 500`).all();return json(results||[])}
 if(req.method==="DELETE"){const id=new URL(req.url).searchParams.get("id");if(id)await env.DB.prepare(`DELETE FROM booking_history WHERE id=?`).bind(+id).run();else await env.DB.prepare(`DELETE FROM booking_history`).run();return json({ok:true})}
 return json({error:"Method not allowed"},405)
}
async function availability(env,date,service){
 const duration=DURATIONS[service],now=kyivNow(),bs=(await env.DB.prepare(`SELECT preferred_time,service FROM bookings WHERE preferred_date=? AND status IN ('new','confirmed')`).bind(date).all()).results||[];
 return slots().map(time=>{const n=mins(time),past=date<now.date||(date===now.date&&n<=now.minutes),busy=bs.some(x=>slots().includes(x.preferred_time)&&overlap(n,duration,mins(x.preferred_time),DURATIONS[x.service]||60));return{time,busy:past||!working(date)||n+duration>mins(END)||busy}})
}
export default{async fetch(request,env){
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:HEADERS});const u=new URL(request.url);
 try{
  if(u.pathname==="/api/auth/login"&&request.method==="POST"){const b=await request.json(),un=String(b.username||"").trim().toLowerCase(),pw=String(b.password||"");let r=null;if(un==="superadmin"&&env.SUPERADMIN_PASSWORD===pw)r="superadmin";if(un==="admin"&&env.ADMIN_PASSWORD===pw)r="admin";if(!r)return json({error:"Невірний логін або пароль"},401);const t=await session(env,r);if(!t)return json({error:"SESSION_SECRET не налаштований"},500);if(env.DB){await ensure(env.DB);await audit(env.DB,r,"login","auth")}return json({ok:true,role:r},200,{"set-cookie":`mehanik_session=${encodeURIComponent(t)}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`})}
  if(u.pathname==="/api/auth/logout"&&request.method==="POST")return json({ok:true},200,{"set-cookie":"mehanik_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"});
  if(u.pathname==="/api/auth/me"&&request.method==="GET"){const r=await role(request,env);return json({authenticated:!!r,role:r||null})}
  if(u.pathname.startsWith("/api/")){
   if(!env.DB)return json({error:"D1 database is not configured"},503);await ensure(env.DB);
   if(u.pathname==="/api/availability"&&request.method==="GET"){const d=u.searchParams.get("date"),s=u.searchParams.get("service");if(!d||!DURATIONS[s])return json({error:"Невірна дата або послуга"},400);return json({date:d,service:s,duration:DURATIONS[s],slots:await availability(env,d,s)})}
   if(u.pathname==="/api/bookings"&&request.method==="POST")return createBooking(request,env);
   if(u.pathname==="/api/reviews"&&request.method==="GET"){const{results}=await env.DB.prepare(`SELECT id,name,rating,text,created_at FROM reviews WHERE approved=1 ORDER BY id DESC LIMIT 50`).all();return json(results||[])}
   if(u.pathname==="/api/reviews"&&request.method==="POST"){const b=await request.json(),name=String(b.name||"").trim(),text=String(b.text||"").trim(),rating=+b.rating;if(!name||!text||name.length>80||text.length>1500||!Number.isInteger(rating)||rating<1||rating>5)return json({error:"Некоректні дані"},400);const r=await env.DB.prepare(`INSERT INTO reviews(name,rating,text,approved) VALUES(?,?,?,0)`).bind(name,rating,text).run(),id=+r.meta?.last_row_id,t=await sendTg(env,["⭐ НОВИЙ ВІДГУК — МЕХАНІК ПОЛТАВА","",`🆔 Відгук: #${id}`,`👤 Ім'я: ${name}`,`⭐ Оцінка: ${rating}/5`,"",`💬 ${text}`,"","🟡 Статус: ПОТРІБНА МОДЕРАЦІЯ"].join("\n"));if(t?.result?.message_id)await env.DB.prepare(`INSERT OR REPLACE INTO review_telegram(review_id,message_id) VALUES(?,?)`).bind(id,+t.result.message_id).run();return json({ok:true,message:"Дякуємо! Відгук надіслано на модерацію."},201)}
   if(u.pathname==="/api/works"&&request.method==="GET"){const{results}=await env.DB.prepare(`SELECT id,title,car,description,image_url,instagram_url,created_at FROM works WHERE published=1 ORDER BY created_at DESC LIMIT 100`).all();return json(results||[])}
   if(u.pathname.startsWith("/api/admin/")){
    const a=await auth(request,env);if(a.error)return json({error:a.error},a.status);const actor=a.role;
    if(u.pathname==="/api/admin/bookings")return adminBookings(request,env,actor);
    if(u.pathname==="/api/admin/reviews")return adminReviews(request,env,actor);
    if(u.pathname==="/api/admin/works")return adminWorks(request,env,actor,u);
    if(u.pathname==="/api/admin/history"){const s=await auth(request,env,true);if(s.error&&request.method==="DELETE")return json({error:s.error},s.status);return adminHistory(request,env,actor)}
    if(u.pathname==="/api/admin/logs"){if(request.method==="GET"){const{results}=await env.DB.prepare(`SELECT id,actor,action,target,details,created_at FROM admin_logs ORDER BY created_at DESC LIMIT 500`).all();return json(results||[])}if(request.method==="DELETE"){const s=await auth(request,env,true);if(s.error)return json({error:s.error},s.status);await env.DB.prepare(`DELETE FROM admin_logs`).run();return json({ok:true})}}
    if(u.pathname==="/api/admin/blocks"){if(request.method==="GET"){const{results}=await env.DB.prepare(`SELECT id,date,time,reason,created_at FROM blocked_slots ORDER BY date,time`).all();return json(results||[])}if(request.method==="POST"){const b=await request.json();if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date||"")||!slots().includes(b.time))return json({error:"Некоректна дата або час"},400);try{await env.DB.prepare(`INSERT INTO blocked_slots(date,time,reason) VALUES(?,?,?)`).bind(b.date,b.time,String(b.reason||"").trim()).run();return json({ok:true},201)}catch(e){return json({error:"Цей час уже заблокований"},409)}}if(request.method==="DELETE"){await env.DB.prepare(`DELETE FROM blocked_slots WHERE id=?`).bind(+u.searchParams.get("id")).run();return json({ok:true})}}
    return json({error:"Admin endpoint not found"},404)
   }
  }
  if(env.ASSETS)return env.ASSETS.fetch(request);return json({error:"Not found"},404)
 }catch(e){console.error(e);return json({error:"Internal server error",detail:String(e?.message||e)},500)}
}};
