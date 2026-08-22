(()=>{
  "use strict";

  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

  function prepareVideo(v){
    if(!v || v.dataset.streamReady==="1") return;

    v.dataset.streamReady="1";
    v.preload="none";
    v.playsInline=true;
    v.controls=true;

    const src=v.dataset.src || v.getAttribute("src");
    if(!src) return;

    // Do not request the file until the user explicitly starts it.
    if(v.dataset.src) v.removeAttribute("src");

    const wrapper=v.parentElement;
    if(!wrapper) return;

    wrapper.classList.add("media-lazy-video");

    const poster=wrapper.querySelector(".media-video-poster") || document.createElement("button");
    if(!poster.parentElement){
      poster.type="button";
      poster.className="media-video-poster";
      poster.innerHTML=`<span class="media-play-icon">▶</span><span>Запустити відео</span>`;
      wrapper.appendChild(poster);
    }

    const start=async()=>{
      if(v.dataset.loaded==="1"){
        try{ await v.play(); }catch{}
        return;
      }

      v.dataset.loaded="1";
      poster.disabled=true;
      poster.innerHTML=`<span>⏳ Завантаження відео…</span>`;

      v.src=src;
      v.load();

      const onReady=()=>{
        poster.remove();
        v.removeEventListener("loadedmetadata",onReady);
        v.removeEventListener("canplay",onReady);
        v.play().catch(()=>{});
      };

      const onError=()=>{
        poster.disabled=false;
        poster.innerHTML=`<span>⚠️ Не вдалося запустити відео</span>`;
        v.dataset.loaded="0";
        v.removeEventListener("error",onError);
      };

      v.addEventListener("loadedmetadata",onReady,{once:true});
      v.addEventListener("canplay",onReady,{once:true});
      v.addEventListener("error",onError,{once:true});
    };

    poster.addEventListener("click",start);
  }

  function prepare(root=document){
    root.querySelectorAll("video[data-src], video[data-media-url]").forEach(prepareVideo);
    root.querySelectorAll("video").forEach(v=>{
      if(v.dataset.src || v.dataset.mediaUrl) prepareVideo(v);
    });
  }

  window.MechanikMedia={
    ...(window.MechanikMedia||{}),
    hydrate:prepare,
    prepareVideo
  };

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",()=>prepare());
  }else{
    prepare();
  }
})();