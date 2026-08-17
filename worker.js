const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type, Authorization","Access-Control-Allow-Methods":"GET,POST,PATCH,OPTIONS"};

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json",...cors}});
const okDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s);
const slots=()=>{const a=[];for(let h=9;h<18;h++){a.push(`${String(h).padStart(2,"0")}:00`);a.push(`${String(h).padStart(2,"0")}:30`)}return a};

function auth(request,env){
  const h=request.headers.get("Authorization")||"";
  return h===`Bearer ${env.ADMIN_PASSWORD||"CHANGE_ME"}`;
}

export default {
 async fetch(request,env){
  if(request.method==="OPTIONS")return new Response(null,{headers:cors});
  const url=new URL(request.url);
  if(url.pathname.startsWith("/api/")){
    try{
      if(url.pathname==="/api/admin/login"&&request.method==="POST"){
        const {password}=await request.json();
        if(password!==(env.ADMIN_PASSWORD||"CHANGE_ME"))return json({error:"Unauthorized"},401);
        return json({token:env.ADMIN_PASSWORD||"CHANGE_ME"});
      }

      if(url.pathname==="/api/availability"&&request.method==="GET"){
        const date=url.searchParams.get("date");
        if(!okDate(date))return json({error:"Bad date"},400);
        const rows=await env.DB.prepare("SELECT time FROM bookings WHERE date=? AND status IN ('pending','confirmed') UNION SELECT time FROM blocked_slots WHERE date=?").bind(date,date).all();
        const busy=new Set(rows.results.map(x=>x.time));
        return json({date,slots:slots().map(time=>({time,busy:busy.has(time)}))});
      }

      if(url.pathname==="/api/bookings"&&request.method==="POST"){
        const b=await request.json();
        for(const k of ["name","phone","car","service","date","time"])if(!b[k])return json({error:`Missing ${k}`},400);
        if(!okDate(b.date)||!slots().includes(b.time))return json({error:"Invalid slot"},400);
        const exists=await env.DB.prepare("SELECT id FROM bookings WHERE date=? AND time=? AND status IN ('pending','confirmed') UNION SELECT id FROM blocked_slots WHERE date=? AND time=?").bind(b.date,b.time,b.date,b.time).first();
        if(exists)return json({error:"Slot busy"},409);
        await env.DB.prepare("INSERT INTO bookings(name,phone,car,service,date,time,note) VALUES(?,?,?,?,?,?,?)").bind(b.name,b.phone,b.car,b.service,b.date,b.time,b.note||"").run();
        return json({ok:true},201);
      }

      if(url.pathname==="/api/reviews"&&request.method==="GET"){
        const r=await env.DB.prepare("SELECT id,name,rating,text FROM reviews WHERE published=1 ORDER BY id DESC LIMIT 30").all();return json(r.results);
      }
      if(url.pathname==="/api/works"&&request.method==="GET"){
        const r=await env.DB.prepare("SELECT id,title,description,image_url FROM works WHERE published=1 ORDER BY id DESC LIMIT 30").all();return json(r.results);
      }

      if(url.pathname==="/api/admin/bookings"&&request.method==="GET"){
        if(!auth(request,env))return json({error:"Unauthorized"},401);
        const r=await env.DB.prepare("SELECT * FROM bookings ORDER BY date,time DESC").all();return json(r.results);
      }
      const match=url.pathname.match(/^\/api\/admin\/bookings\/(\d+)$/);
      if(match&&request.method==="PATCH"){
        if(!auth(request,env))return json({error:"Unauthorized"},401);
        const {status}=await request.json();
        if(!["pending","confirmed","cancelled","completed"].includes(status))return json({error:"Bad status"},400);
        await env.DB.prepare("UPDATE bookings SET status=? WHERE id=?").bind(status,match[1]).run();return json({ok:true});
      }
      if(url.pathname==="/api/admin/blocks"&&request.method==="POST"){
        if(!auth(request,env))return json({error:"Unauthorized"},401);
        const b=await request.json();if(!b.date||!b.time)return json({error:"Missing"},400);
        await env.DB.prepare("INSERT INTO blocked_slots(date,time,reason) VALUES(?,?,?)").bind(b.date,b.time,b.reason||"").run();return json({ok:true},201);
      }
      return json({error:"Not found"},404);
    }catch(e){return json({error:e.message||"Server error"},500)}
  }
  return env.ASSETS.fetch(request);
 }
};