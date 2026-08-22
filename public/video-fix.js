(()=>{
  "use strict";

  const $=s=>document.querySelector(s);
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

  async function api(u,o={}){
    const h={...(o.headers||{})};
    if(!(o.body instanceof FormData)&&!h["content-type"])h["content-type"]="application/json";
    const r=await fetch(u,{...o,credentials:"same-origin",headers:h});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(d.error||`HTTP ${r.status}`);
    return d;
  }

  function yt(url){
    try{
      const u=new URL(url);
      if(u.hostname==="youtu.be")return u.pathname.slice(1).split("/")[0];
      if(u.hostname.includes("youtube.com"))return u.searchParams.get("v")||(u.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)||[])[1];
    }catch{}
    return null;
  }

  function ig(url){
    try{
      const u=new URL(url);
      if(!u.hostname.endsWith("instagram.com"))return null;
      const m=u.pathname.match(/\/(reel|p|tv)\/([^/?]+)/);
      return m?`https://www.instagram.com/${m[1]}/${m[2]}/embed`:null;
    }catch{return null}
  }

  function renderExternal(url,title,player){
    const id=yt(url);
    if(player==="youtube"||player==="youtube_nocookie"||id){
      if(!id)return `<div class="work-media-placeholder">Некоректне YouTube-посилання</div>`;
      const host=player==="youtube"?"https://www.youtube.com/embed/":"https://www.youtube-nocookie.com/embed/";
      return `<iframe class="work-video-fixed" loading="lazy" src="${host}${encodeURIComponent(id)}?rel=0&playsinline=1" title="${esc(title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    }
    const i=ig(url);
    if(player==="instagram"||i)return i?`<iframe class="work-video-fixed work-instagram-frame" loading="lazy" src="${i}" title="${esc(title)}" allowfullscreen></iframe>`:`<div class="work-media-placeholder">Некоректне Instagram-посилання</div>`;
    return `<video class="work-video-fixed" controls preload="metadata" playsinline src="${esc(url)}"></video>`;
  }

  function fixPublic(){
    document.querySelectorAll("#worksGrid .work-card, .work-card").forEach(card=>{
      const media=card.querySelector(".work-image, .work-admin-media");
      if(!media)return;
      media.classList.add("work-media-frame");
      const v=media.querySelector("video");
      if(v){
        v.preload="metadata";
        v.playsInline=true;
        v.controls=true;
        v.classList.add("work-video-fixed");
      }
      const iframe=media.querySelector("iframe");
      if(iframe)iframe.classList.add("work-video-fixed");
    });
  }

  function mediaStorageCard(){
    return [...document.querySelectorAll("#content .admin-card")].find(card=>
      /Сховище медіа/i.test(card.querySelector("h2")?.textContent||"")
    )||null;
  }

  async function refreshDriveStatus(card){
    const d=await api("/api/media/status");
    const p=card.querySelector("p");
    const actions=card.querySelector(".admin-actions");
    if(!p||!actions)return d;

    const ok=!!(d.connected&&d.folder_ok);

    p.innerHTML=ok
      ? `<span class="muted">✅ Google Drive підключено · папка: ${esc(d.folder_name||d.folder_id||"")}</span>`
      : `<span class="muted">⚠️ OAuth підключений, але папка недоступна: ${esc(d.folder_error||"перевірте доступ")}</span>`;

    const reconnect=actions.querySelector("#driveReconnect");
    if(reconnect)reconnect.hidden=ok;

    return d;
  }

  function ensureDriveControls(){
    const card=mediaStorageCard();
    if(!card)return;

    const actions=card.querySelector(".admin-actions");
    if(!actions)return;

    let reconnect=actions.querySelector("#driveReconnect");
    if(!reconnect){
      reconnect=document.createElement("button");
      reconnect.id="driveReconnect";
      reconnect.type="button";
      reconnect.className="btn primary";
      reconnect.textContent="🔄 Перепідключити Google Drive";
      reconnect.onclick=()=>{location.href="/api/google/start"};
      actions.appendChild(reconnect);
    }

    let check=actions.querySelector("#driveCheck");
    if(!check){
      check=document.createElement("button");
      check.id="driveCheck";
      check.type="button";
      check.className="btn secondary";
      check.textContent="🔎 Перевірити доступ";
      check.onclick=async()=>{
        check.disabled=true;
        check.textContent="⏳ Перевіряю…";
        try{
          await refreshDriveStatus(card);
        }catch(e){
          const p=card.querySelector("p");
          if(p)p.innerHTML=`<span class="muted">❌ ${esc(e.message)}</span>`;
          reconnect.hidden=false;
        }finally{
          check.disabled=false;
          check.textContent="🔎 Перевірити доступ";
        }
      };
      actions.appendChild(check);
    }

    const statusText=card.textContent||"";
    const needsReconnect=/папка недоступна|перевірте доступ|access token|OAuth підключений/i.test(statusText);
    reconnect.hidden=!needsReconnect;
  }

  function run(){
    fixPublic();
    ensureDriveControls();
    if(window.MechanikMedia?.hydrate)window.MechanikMedia.hydrate(document);
  }

  new MutationObserver(run).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",run);
  else run();
})();