(() => {
  if (window.__MEHANIK_PUBLIC_AI__) return;
  window.__MEHANIK_PUBLIC_AI__ = true;
  const button=document.createElement("button");
  button.className="site-ai-button"; button.type="button";
  button.setAttribute("aria-label","Відкрити AI-помічника");
  button.innerHTML="🤖<span>AI</span>";
  const panel=document.createElement("section");
  panel.className="site-ai-panel";
  panel.innerHTML=`<div class="site-ai-head"><div><strong>AI-помічник</strong><small>Механік Полтава</small></div><button type="button" class="site-ai-close">×</button></div>
  <div class="site-ai-messages" aria-live="polite"><div class="site-ai-message bot">Вітаю! Допоможу з послугами, цінами та записом. Остаточний діагноз автомобіля визначає механік після огляду.</div>
  <div class="site-ai-suggestions"><button type="button">Які у вас є послуги?</button><button type="button">Як записатися?</button><button type="button">Скільки коштує ремонт?</button></div></div>
  <form class="site-ai-form"><input maxlength="1200" autocomplete="off" placeholder="Напишіть питання..." required><button type="submit">➤</button></form>`;
  document.body.append(button,panel);
  const messages=panel.querySelector(".site-ai-messages"), form=panel.querySelector(".site-ai-form"), input=form.querySelector("input");
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  function add(text,type){const el=document.createElement("div");el.className=`site-ai-message ${type}`;el.innerHTML=esc(text).replace(/\n/g,"<br>");messages.appendChild(el);messages.scrollTop=messages.scrollHeight}
  async function ask(message){
    add(message,"user"); const p=document.createElement("div");p.className="site-ai-message bot pending";p.textContent="Думаю...";messages.appendChild(p);
    try{const r=await fetch("/api/ai",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({message})});const d=await r.json().catch(()=>({}));p.remove();if(!r.ok)throw Error(d.error||"AI недоступний");add(d.answer||"Не вдалося отримати відповідь.","bot")}
    catch(e){p.remove();add("AI тимчасово недоступний. Спробуйте ще раз.","bot");console.error(e)}
  }
  button.onclick=()=>{panel.classList.toggle("open");if(panel.classList.contains("open"))setTimeout(()=>input.focus(),80)};
  panel.querySelector(".site-ai-close").onclick=()=>panel.classList.remove("open");
  panel.querySelectorAll(".site-ai-suggestions button").forEach(b=>b.onclick=()=>ask(b.textContent));
  form.onsubmit=e=>{e.preventDefault();const m=input.value.trim();if(!m)return;input.value="";ask(m)}
})();