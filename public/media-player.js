window.MechanikMedia=window.MechanikMedia||(()=>{
"use strict";

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
function yt(v){try{const u=new URL(v);if(u.hostname==="youtu.be")return u.pathname.split("/").filter(Boolean)[0]||null;if(u.hostname.includes("youtube.com")){if(u.pathname==="/watch")return u.searchParams.get("v");const m=u.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/);return m?.[1]||null}}catch{}return null}
function ig(v){try{const u=new URL(v);if(!u.hostname.endsWith("instagram.com"))return null;const m=u.pathname.match(/\/(reel|p|tv)\/([^/?]+)/);return m?`https://www.instagram.com/${m[1]}/${m[2]}/embed`:null}catch{return null}}

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
    const h=p==="youtube_nocookie"
      ?"https://www.youtube-nocookie.com/embed/"
      :"https://www.youtube.com/embed/";

    return`<div class="work-media-video">
      <iframe loading="lazy" src="${h}${encodeURIComponent(id)}?rel=0&playsinline=1"
        title="${title}"
        allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;web-share"
        allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
    </div>`;
  }

  if(p==="instagram"){
    const src=ig(url);
    if(!src)return`<div class="work-media-placeholder">Некоректне Instagram-посилання</div>`;
    return`<div class="work-media-video">
      <iframe loading="lazy" src="${src}" title="${title}" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
    </div>`;
  }

  return`<div class="work-media-video work-media-video-html5">
    <video class="work-media-video-html5" controls preload="metadata" playsinline
      data-src="${esc(url)}" title="${title}"></video>
    <button type="button" class="work-video-load">▶️ Запустити відео</button>
  </div>`;
}

function hydrate(root=document){
  root.querySelectorAll("video[data-src]").forEach(v=>{
    if(v.dataset.hydrated)return;

    const wrap=v.closest(".work-media-video-html5")||v.parentElement;
    const button=wrap?.querySelector(".work-video-load");

    const load=async()=>{
      if(v.dataset.hydrated)return true;
      v.dataset.hydrated="1";
      v.src=v.dataset.src;
      v.removeAttribute("data-src");
      v.load();
      return true;
    };

    const start=async ev=>{
      if(ev)ev.preventDefault();
      await load();
      try{await v.play()}catch{}
    };

    v.addEventListener("pointerdown",load,{once:true});
    v.addEventListener("click",start);
    button?.addEventListener("click",start);
  });
}

return{render,hydrate};
})();
