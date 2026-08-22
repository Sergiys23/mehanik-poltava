(()=>{
  "use strict";

  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

  function yt(url){
    try{
      const u=new URL(url);
      if(u.hostname==="youtu.be")return u.pathname.slice(1).split("/")[0];
      if(u.hostname.includes("youtube.com")){
        return u.searchParams.get("v")||(u.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)||[])[1];
      }
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

  function render(w){
    const type=String(w?.media_type||"").toLowerCase();
    const p=String(w?.player_type||"").toLowerCase();
    const url=String(w?.media_url||w?.image_url||"").trim();
    const title=esc(w?.title||"Робота СТО");

    if(!url)return`<div class="work-media-placeholder">Медіа ще не додано</div>`;
    if(type!=="video"){
      return`<img class="work-media-image" loading="lazy" decoding="async" src="${esc(url)}" alt="${title}">`;
    }

    if(p==="youtube"||p==="youtube_nocookie"){
      const id=yt(url);
      if(!id)return`<div class="work-media-placeholder">Некоректне YouTube-посилання</div>`;
      const host=p==="youtube_nocookie"
        ?"https://www.youtube-nocookie.com/embed/"
        :"https://www.youtube.com/embed/";
      return`<div class="work-media-video"><iframe loading="lazy" src="${host}${encodeURIComponent(id)}?rel=0&playsinline=1" title="${title}" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
    }

    if(p==="instagram"){
      const src=ig(url);
      if(!src)return`<div class="work-media-placeholder">Некоректне Instagram-посилання</div>`;
      return`<div class="work-media-video"><iframe loading="lazy" src="${src}" title="${title}" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
    }

    // IMPORTANT: keep src on the element. Mobile Safari/Chrome need native
    // media negotiation and Range requests; custom "play" lazy loaders often
    // fail because a video without src cannot receive a real play request.
    return`<div class="work-media-video">
      <video class="work-media-video-html5" controls preload="metadata" playsinline webkit-playsinline src="${esc(url)}" title="${title}">
        Ваш браузер не підтримує HTML5 відео.
      </video>
    </div>`;
  }

  function hydrate(root=document){
    root.querySelectorAll("video.work-media-video-html5, video.work-video-fixed").forEach(v=>{
      v.preload="metadata";
      v.controls=true;
      v.playsInline=true;
      v.setAttribute("playsinline","");
      v.setAttribute("webkit-playsinline","");
      // Never call load(), play(), pause(), or rewrite src here.
      // The browser handles range negotiation itself.
    });
  }

  window.MechanikMedia={...(window.MechanikMedia||{}),render,hydrate};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>hydrate());
  else hydrate();
})();