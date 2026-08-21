from pathlib import Path
root=Path(__file__).resolve().parent
worker=root/"worker.js"; index=root/"public/index.html"
w=worker.read_text(encoding="utf-8"); i=index.read_text(encoding="utf-8")
if "async function publicAI(req,e)" not in w:
    marker="async function api(req,e,u){"
    if marker not in w: raise SystemExit("Не знайдено api(req,e,u) у worker.js")
    fn=r'''const publicAiRate=new Map();
function publicAiAllowed(req){const ip=req.headers.get("cf-connecting-ip")||"unknown",nowMs=Date.now(),x=publicAiRate.get(ip)||{n:0,t:nowMs};if(nowMs-x.t>60000){x.n=0;x.t=nowMs}if(x.n>=12){publicAiRate.set(ip,x);return false}x.n++;x.t=nowMs;publicAiRate.set(ip,x);return true}
async function publicAI(req,e){if(!e.AI||typeof e.AI.run!=="function")return J({error:"AI тимчасово недоступний"},503);if(!publicAiAllowed(req))return J({error:"Забагато запитів. Спробуйте через хвилину."},429,{"retry-after":"60"});let b;try{b=await req.json()}catch{return J({error:"Некоректний запит"},400)}const message=String(b.message||"").trim();if(!message||message.length>1200)return J({error:"Порожнє або занадто довге питання"},400);let services=[];try{services=(await e.DB.prepare(`SELECT name,description,price_from,duration_minutes FROM service_catalog WHERE active=1 ORDER BY sort_order,id`).all()).results||[]}catch{}const catalog=services.map(s=>`${s.name}: ${s.price_from!=null?`від ${s.price_from} грн`:"ціна уточнюється"}; ${s.duration_minutes} хв; ${s.description||""}`).join("\n");const system=`Ти публічний AI-помічник СТО «Механік Полтава». Відповідай українською коротко й конкретно. Адреса: Решетилівська 53, Полтава. Графік: Пн–Сб 09:00–18:00. Клієнт обирає послугу і день, а точний час узгоджує майстер. Не вигадуй ціни, наявність місць, час запису, результати огляду або гарантії. Не став остаточний діагноз, лише можливі причини та рекомендації щодо перевірки. Остаточний висновок робить механік після огляду. Актуальний каталог:\n${catalog||"Каталог тимчасово недоступний."}`;try{const out=await e.AI.run("@cf/meta/llama-3.1-8b-instruct-fast",{messages:[{role:"system",content:system},{role:"user",content:message}],max_tokens:500,temperature:.2});const answer=String(out?.response??out?.text??out?.output_text??"").trim();if(!answer)throw Error("empty");return J({ok:true,answer})}catch(err){console.error("public AI:",err);return J({error:"AI тимчасово недоступний"},503)}}
'''
    w=w.replace(marker,fn+marker,1)
route='if(u.pathname==="/api/ai"&&req.method==="POST")return publicAI(req,e);'
if route not in w:
    marker='if(u.pathname.startsWith("/api/admin/")){'
    if marker not in w: raise SystemExit("Не знайдено admin router у worker.js")
    w=w.replace(marker,route+marker,1)
worker.write_text(w,encoding="utf-8")
if '<link rel="stylesheet" href="/ai.css">' not in i:
    i=i.replace('<link rel="stylesheet" href="/fix.css">','<link rel="stylesheet" href="/fix.css">\n<link rel="stylesheet" href="/ai.css">',1)
if '<script src="/ai-client.js" defer></script>' not in i:
    i=i.replace('<script src="/config.js"></script><script src="/app.js"></script>','<script src="/config.js"></script><script src="/app.js"></script><script src="/ai-client.js" defer></script>',1)
index.write_text(i,encoding="utf-8")
print("Готово.")
