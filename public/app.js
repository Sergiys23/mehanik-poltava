const cfg=window.MEHANIK_CONFIG;
document.querySelectorAll("[data-phone]").forEach(e=>e.textContent=cfg.phoneDisplay);
document.querySelectorAll("[data-address]").forEach(e=>e.textContent=cfg.address);
document.querySelectorAll("[data-phone-link]").forEach(e=>e.href=`tel:${cfg.phone.replace(/\s/g,"")}`);

const state={month:new Date(new Date().getFullYear(),new Date().getMonth(),1),selected:null,time:null};
const monthNames=["січень","лютий","березень","квітень","травень","червень","липень","серпень","вересень","жовтень","листопад","грудень"];
const pad=n=>String(n).padStart(2,"0");
const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const api=async(url,opt)=>{const r=await fetch(url,opt);if(!r.ok)throw new Error(await r.text());return r.json()};

async function renderCalendar(){
  const c=document.querySelector("#calendar"), y=state.month.getFullYear(), m=state.month.getMonth();
  document.querySelector("#monthTitle").textContent=`${monthNames[m]} ${y}`;
  c.innerHTML="";
  ["Пн","Вт","Ср","Чт","Пт","Сб","Нд"].forEach(x=>{const e=document.createElement("div");e.className="day-name";e.textContent=x;c.append(e)});
  const first=new Date(y,m,1), offset=(first.getDay()+6)%7, days=new Date(y,m+1,0).getDate();
  for(let i=0;i<offset;i++){const e=document.createElement("div");e.className="day muted";c.append(e)}
  for(let n=1;n<=days;n++){
    const d=new Date(y,m,n), e=document.createElement("button");e.className="day";e.textContent=n;
    if(cfg.workingDays.includes(d.getDay())){e.onclick=()=>selectDate(d)}else{e.classList.add("closed");e.disabled=true}
    if(iso(d)===iso(new Date()))e.classList.add("today");
    if(state.selected&&iso(d)===state.selected)e.classList.add("selected");
    c.append(e);
  }
}
async function selectDate(d){
  state.selected=iso(d);state.time=null;await renderCalendar();
  document.querySelector("#selectedDateTitle").textContent=d.toLocaleDateString("uk-UA",{weekday:"long",day:"numeric",month:"long"});
  const box=document.querySelector("#slots");box.innerHTML="<p class='muted'>Завантаження...</p>";
  try{
    const data=await api(`/api/availability?date=${state.selected}`);
    box.innerHTML="";
    data.slots.forEach(s=>{
      const b=document.createElement("button");b.className="slot"+(s.busy?" busy":"");b.textContent=s.time+(s.busy?" — зайнято":"");
      b.disabled=s.busy;b.onclick=()=>chooseTime(s.time,b);box.append(b);
    });
  }catch(e){box.innerHTML="<p>Не вдалося завантажити час.</p>"}
}
function chooseTime(time,el){
  state.time=time;document.querySelectorAll(".slot").forEach(x=>x.classList.remove("selected"));el.classList.add("selected");
  document.querySelector("#bookingDate").value=state.selected;document.querySelector("#bookingTime").value=time;
  document.querySelector("#bookingForm").classList.remove("hidden");
  document.querySelector("#bookingSummary").textContent=`📅 ${state.selected} • 🕐 ${time}`;
  document.querySelector("#bookingForm").scrollIntoView({behavior:"smooth",block:"center"});
}
document.querySelector("#prevMonth").onclick=()=>{state.month.setMonth(state.month.getMonth()-1);renderCalendar()};
document.querySelector("#nextMonth").onclick=()=>{state.month.setMonth(state.month.getMonth()+1);renderCalendar()};
document.querySelector("#bookingForm").onsubmit=async e=>{
  e.preventDefault();const msg=document.querySelector("#bookingMessage");msg.textContent="Надсилаємо...";
  const data=Object.fromEntries(new FormData(e.target));
  try{
    await api("/api/bookings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
    msg.textContent="✅ Заявку створено. Очікуйте підтвердження.";
    e.target.reset();state.time=null;await selectDate(new Date(`${state.selected}T12:00:00`));
  }catch(err){msg.textContent="❌ Цей час щойно зайняли. Оберіть інший слот.";}
};

async function loadContent(){
  try{
    const [works,reviews]=await Promise.all([api("/api/works"),api("/api/reviews")]);
    document.querySelector("#worksGrid").innerHTML=works.map(w=>`<article class="card"><div class="work-image">${w.image_url?`<img src="${escapeHtml(w.image_url)}" alt="">`:"🔧"}</div><h3>${escapeHtml(w.title)}</h3><p>${escapeHtml(w.description||"Робота виконана на СТО Механік.")}</p></article>`).join("")||"<p class='muted'>Фотографії робіт скоро з'являться.</p>";
    document.querySelector("#reviewsGrid").innerHTML=reviews.map(r=>`<article class="card review"><div class="stars">${"★".repeat(r.rating)}${"☆".repeat(5-r.rating)}</div><h3>${escapeHtml(r.name)}</h3><p>${escapeHtml(r.text)}</p></article>`).join("")||"<p class='muted'>Відгуки скоро з'являться.</p>";
  }catch(e){}
}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
renderCalendar();loadContent();