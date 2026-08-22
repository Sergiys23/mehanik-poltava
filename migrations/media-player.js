(()=>{
  "use strict";

  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

  function yt(url){
    try{
      const u=new URL(url);
      if(u.hostname==="youtu.be")return u.pathname.slice(1).split("/")[0];
      if(u.hostname.includes("youtube.com"))
        return u.searchParams.get("v")||(u.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)||[])[1];
    }catch{}
    return null;
  }

  function instagram(url){
    try{
      const u=new URL(url);
      if(!u.hostname.endsWith("instagram.com"))return null;
      const m=u.pathname.match(/\/(reel|p|tv)\/([^/?]+)/);
      return m?`https://www.instagram.com/${m[1]}/${m[2]}/embed`:null;
    }catch{return null}
  }

  function thumbnailFor(id,url){
    if(id) return `/api/media/${encodeURIComponent(id)}/thumbnail`;
    return url ? `/api/media/thumbnail?url=${encodeURIComponent(url)}` : "";
  }

  function buildHtml(w){
    const type=String(w?.media_type||"").toLowerCase();
    const player=String(w?.player_type||"").toLowerCase();
    const url=String(w?.media_url||"").trim();
    const id=String(w?.media_id||w?.drive_file_id||"").trim();
    const title=esc(w?.title||"Відео роботи");
    if(!url && !id)return `<div class="work-media-placeholder">Медіа ще не додано</div>`;

    if(type!=="video"){
      return `<img class="work-media-image" loading="lazy" decoding="async" src="${esc(url)}" alt="${title}">`;
    }

    if(player==="youtube"||player==="youtube_nocookie"){
      const vid=yt(url);
      if(!vid)return `<div class="work-media-placeholder">Некоректне YouTube-посилання</div>`;
      const host=player==="youtube_nocookie"?"https://www.youtube-nocookie.com/embed/":"https://www.youtube.com/embed/";
      return `<div class="work-media-video"><iframe loading="lazy" src="${host}${encodeURIComponent(vid)}?rel=0&playsinline=1" title="${title}" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;web-share" allowfullscreen></iframe></div>`;
    }

    if(player==="instagram"){
      const src=instagram(url);
      if(!src)return `<div class="work-media-placeholder">Некоректне Instagram-посилання</div>`;
      return `<div class="work-media-video"><iframe loading="lazy" src="${src}" title="${title}" allowfullscreen></iframe></div>`;
    }

    const src=id ? `/api/media/${encodeURIComponent(id)}` : url;
    const poster=id ? thumbnailFor(id,url) : "";
    return `<div class="work-media-video work-media-native">
      <video class="work-media-video-html5" controls preload="metadata" playsinline webkit-playsinline
        ${poster?`poster="${esc(poster)}"`:""}
        src="${esc(src)}" title="${title}">
        Ваш браузер не підтримує HTML5 відео.
      </video>
    </div>`;
  }

  function hydrate(root=document){
    root.querySelectorAll("video").forEach(v=>{
      v.preload="metadata";
      v.controls=true;
      v.playsInline=true;
      v.setAttribute("playsinline","");
      v.setAttribute("webkit-playsinline","");
    });
  }

  window.MechanikMedia={...(window.MechanikMedia||{}),render:buildHtml,hydrate};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>hydrate());
  else hydrate();
})();