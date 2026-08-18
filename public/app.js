const cfg=window.MEHANIK_CONFIG||{},$=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
async function api(u,o={}){const r=await fetch(u,{...o,credentials:"same-origin",headers:{"content-type":"application/json",...(o.headers||{})}}),d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`HTTP ${r.status}`);return d}
const state={month:new Date(new Date().getFullYear(),new Date().getMonth(),1),date:null,service:""};
const months=["січень","лютий","березень","квітень","травень","червень","липень","серпень","вересень","жовтень","листопад","грудень"];
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const pretty=d=>new Date(`${d}T12:00:00`).toLocaleDateString("uk-UA",{weekday:"long",day:"numeric",month:"long",year:"numeric"});

function common(){document.querySelectorAll("[data-phone]").forEach(x=>x.textContent=cfg.phoneDisplay||cfg.phone||"");document.querySelectorAll("[data-address]").forEach(x=>x.textContent=cfg.address||"");document.querySelectorAll("[data-phone-link]").forEach(x=>x.href=`tel:${cfg.phone||""}`);document.querySelectorAll("[data-instagram-link]").forEach(x=>{if(cfg.instagram)x.href=cfg.instagram})}

function renderCalendar(){
 const c=$("#calendar");if(!c)return;const y=state.month.getFullYear(),m=state.month.getMonth();$("#monthTitle").textContent=`${months[m]} ${y}`;c.innerHTML="";
 ["Пн","Вт","Ср","Чт","Пт","Сб","Нд"].forEach(x=>{const e=document.createElement("div");e.className="day-name";e.textContent=x;c.append(e)});
 const off=(new Date(y,m,1).getDay()+6)%7,days=new Date(y,m+1,0).getDate(),today=iso(new Date()),wd=cfg.workingDays||[1,2,3,4,5,6];
 for(let i=0;i<off;i++){const e=document.createElement("div");e.className="day muted";c.append(e)}
 for(let n=1;n<=days;n++){const d=new Date(y,m,n),v=iso(d),e=document.createElement("button");e.type="button";e.className="day";e.textContent=n;
  if(!wd.includes(d.getDay())||v<today){e.disabled=true;e.classList.add("closed")}else e.onclick=()=>selectDate(d);
  if(v===today)e.classList.add("today");if(v===state.date)e.classList.add("selected");c.append(e)
 }
}

function selectDate(d){
 state.date=iso(d);renderCalendar();$("#selectedDateTitle").textContent=pretty(state.date);
 $("#slots").innerHTML=`<div class="date-notice"><div class="date-notice-icon">📅</div><h3>День обрано</h3><p>${esc(pretty(state.date))}</p><p class="muted">Точний час клієнт не вибирає. Майстер зв'яжеться з вами та узгодить зручний час.</p></div>`;
 $("#bookingForm").classList.remove("hidden");
 $("#bookingServiceHidden").value=state.service;
 $("#bookingDate").value=state.date;
 $("#bookingTime").value="Узгоджується з майстром";
 $("#bookingSummary").innerHTML=`🛠️ <b>${esc(state.service)}</b><br>📅 ${esc(pretty(state.date))}<br>🕐 Час узгоджується з майстром`;
}

$("#prevMonth")?.addEventListener("click",()=>{state.month.setMonth(state.month.getMonth()-1);renderCalendar()});
$("#nextMonth")?.addEventListener("click",()=>{state.month.setMonth(state.month.getMonth()+1);renderCalendar()});
$("#bookingService")?.addEventListener("change",()=>{state.service=$("#bookingService").value;state.date=null;$("#bookingCalendarArea").classList.toggle("hidden",!state.service);$("#bookingForm").classList.add("hidden");$("#serviceHint").textContent=state.service?`Обрано: ${state.service}`:"Спочатку оберіть послугу.";$("#selectedDateTitle").textContent="Оберіть дату";$("#slots").innerHTML="<p class='muted'>Спочатку оберіть дату.</p>";renderCalendar()});

$("#bookingForm")?.addEventListener("submit",async e=>{
 e.preventDefault();const m=$("#bookingMessage");if(!state.service)return m.textContent="❌ Оберіть послугу.";if(!state.date)return m.textContent="❌ Оберіть день.";m.textContent="Надсилаємо заявку...";
 const d=Object.fromEntries(new FormData(e.target));d.service=state.service;d.date=state.date;d.time="Узгоджується з майстром";
 try{const r=await api("/api/bookings",{method:"POST",body:JSON.stringify(d)});m.textContent="✅ "+(r.message||"Заявку прийнято. Майстер зв'яжеться з вами для узгодження часу.");e.target.reset();$("#bookingService").value=state.service;$("#bookingServiceHidden").value=state.service;$("#bookingDate").value=state.date;$("#bookingTime").value="Узгоджується з майстром"}catch(err){m.textContent="❌ "+err.message}
});

async function loadContent(){
 try{const[w,r]=await Promise.all([api("/api/works"),api("/api/reviews")]);
  $("#worksGrid").innerHTML=w.map(x=>`<article class="card"><div class="work-image">${x.image_url?`<img src="${esc(x.image_url)}" alt="${esc(x.title)}" loading="lazy">`:"🔧"}</div><h3>${esc(x.title)}</h3>${x.car?`<p><b>🚗 ${esc(x.car)}</b></p>`:""}<p>${esc(x.description||"Робота виконана на СТО Механік.")}</p>${x.instagram_url?`<a href="${esc(x.instagram_url)}" target="_blank" rel="noopener">Instagram →</a>`:""}</article>`).join("")||"<p class='muted'>Фотографії робіт скоро з'являться.</p>";
  $("#reviewsGrid").innerHTML=r.map(x=>`<article class="card"><div class="stars">${"★".repeat(x.rating)}${"☆".repeat(5-x.rating)}</div><h3>${esc(x.name)}</h3><p>${esc(x.text)}</p></article>`).join("")||"<p class='muted'>Відгуки скоро з'являться.</p>";
 }catch(e){console.error(e)}
}
$("#reviewForm")?.addEventListener("submit",async e=>{e.preventDefault();const m=$("#reviewMessage");m.textContent="Надсилаємо...";try{const r=await api("/api/reviews",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});m.textContent="✅ "+(r.message||"Дякуємо за відгук!");e.target.reset()}catch(err){m.textContent="❌ "+err.message}});
common();renderCalendar();loadContent();