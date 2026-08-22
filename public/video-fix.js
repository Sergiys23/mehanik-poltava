(()=>{
  "use strict";

  const $=s=>document.querySelector(s);

  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[c]));

  const api=async(u,o={})=>{
    const h={...(o.headers||{})};

    if(!(o.body instanceof FormData)&&!h["content-type"]){
      h["content-type"]="application/json";
    }

    const r=await fetch(u,{
      ...o,
      credentials:"same-origin",
      headers:h
    });

    const d=await r.json().catch(()=>({}));

    if(!r.ok){
      throw Error(d.error||`HTTP ${r.status}`);
    }

    return d;
  };

  function yt(url){
    try{
      const u=new URL(url);

      if(u.hostname==="youtu.be"){
        return u.pathname.slice(1).split("/")[0];
      }

      if(u.hostname.includes("youtube.com")){
        return u.searchParams.get("v") ||
          (u.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)||[])[1];
      }
    }catch{}

    return null;
  }

  function ig(url){
    try{
      const u=new URL(url);

      if(!u.hostname.endsWith("instagram.com")){
        return null;
      }

      const m=u.pathname.match(/\/(reel|p|tv)\/([^/?]+)/);

      return m
        ? `https://www.instagram.com/${m[1]}/${m[2]}/embed`
        : null;
    }catch{
      return null;
    }
  }

  function renderExternal(url,title,player){

    const id=yt(url);

    if(
      player==="youtube" ||
      player==="youtube_nocookie" ||
      id
    ){
      if(!id){
        return `
          <div class="work-media-placeholder">
            Некоректне YouTube-посилання
          </div>
        `;
      }

      const host=
        player==="youtube"
          ? "https://www.youtube.com/embed/"
          : "https://www.youtube-nocookie.com/embed/";

      return `
        <iframe
          class="work-video-fixed"
          loading="lazy"
          src="${host}${encodeURIComponent(id)}?rel=0&playsinline=1"
          title="${esc(title)}"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
          referrerpolicy="strict-origin-when-cross-origin">
        </iframe>
      `;
    }

    const i=ig(url);

    if(player==="instagram"||i){
      return i
        ? `
          <iframe
            class="work-video-fixed work-instagram-frame"
            loading="lazy"
            src="${i}"
            title="${esc(title)}"
            allowfullscreen>
          </iframe>
        `
        : `
          <div class="work-media-placeholder">
            Некоректне Instagram-посилання
          </div>
        `;
    }

    return `
      <video
        class="work-video-fixed"
        controls
        preload="metadata"
        playsinline
        src="${esc(url)}">
      </video>
    `;
  }

  /*
   * Публічна сторінка.
   * Якщо Google Drive недоступний, показуємо нормальну помилку,
   * а не просто чорний прямокутник.
   */
  function fixPublic(){

    document.querySelectorAll("#worksGrid .work-card").forEach(card=>{

      const media=card.querySelector(".work-image");

      if(!media){
        return;
      }

      media.classList.add("work-media-frame");

      const v=media.querySelector("video");

      if(v){

        v.preload="metadata";
        v.playsInline=true;
        v.controls=true;
        v.classList.add("work-video-fixed");

        if(!v.dataset.errorBound){

          v.dataset.errorBound="1";

          v.addEventListener("error",()=>{

            if(
              v.parentElement &&
              v.parentElement.querySelector(".video-load-error")
            ){
              return;
            }

            const box=document.createElement("div");

            box.className="video-load-error";

            box.textContent=
              "⚠️ Відео тимчасово недоступне. Перепідключіть Google Drive в адмінці.";

            Object.assign(box.style,{
              position:"absolute",
              inset:"0",
              display:"grid",
              placeItems:"center",
              padding:"20px",
              textAlign:"center",
              background:"#080a0d",
              color:"#fff",
              fontWeight:"700",
              zIndex:"2"
            });

            media.appendChild(box);
          });
        }
      }

      const iframe=media.querySelector("iframe");

      if(iframe){
        iframe.classList.add("work-video-fixed");
      }
    });
  }

  /*
   * Google Drive.
   *
   * ВАЖЛИВО:
   * connected=true НЕ означає, що Drive реально працює.
   * Нас цікавить connected + folder_ok.
   *
   * Саме тут виправлена проблема зі скріншота.
   */
  function addDriveControls(){

    const cards=[
      ...document.querySelectorAll("#content .admin-card")
    ];

    const storage=cards.find(card=>
      /Сховище медіа/.test(
        card.querySelector("h2")?.textContent||""
      )
    );

    if(!storage){
      return;
    }

    const status=storage.querySelector("p");
    const actions=storage.querySelector(".admin-actions");

    if(!actions){
      return;
    }

    const text=status?.textContent||"";

    const broken=
      /Не вдалося оновити Google access token/i.test(text) ||
      /OAuth підключений/i.test(text) ||
      /папка недоступна/i.test(text) ||
      /Google Drive не підключено/i.test(text);

    /*
     * Кнопка перепідключення.
     */
    let reconnect=storage.querySelector("#driveReconnect");

    if(!reconnect){

      reconnect=document.createElement("button");

      reconnect.id="driveReconnect";
      reconnect.type="button";
      reconnect.className="btn primary";

      reconnect.textContent=
        "🔄 Перепідключити Google Drive";

      reconnect.onclick=()=>{
        location.href="/api/google/start";
      };

      actions.appendChild(reconnect);
    }

    reconnect.hidden=!broken;

    /*
     * Перевірка доступу без повторного входу.
     */
    let check=storage.querySelector("#driveCheck");

    if(!check){

      check=document.createElement("button");

      check.id="driveCheck";
      check.type="button";
      check.className="btn secondary";

      check.textContent="🔎 Перевірити доступ";

      actions.appendChild(check);

      check.onclick=async()=>{

        const old=check.textContent;

        check.disabled=true;
        check.textContent="⏳ Перевіряю…";

        try{

          const d=await api("/api/media/status");

          if(status){

            if(d.connected&&d.folder_ok){

              status.innerHTML=`
                <span class="muted">
                  ✅ Google Drive підключено ·
                  папка: ${esc(d.folder_name||d.folder_id||"")}
                </span>
              `;

            }else{

              status.innerHTML=`
                <span class="muted">
                  ⚠️ ${esc(
                    d.folder_error ||
                    "Google Drive не підключено"
                  )}
                </span>
              `;
            }
          }

          reconnect.hidden=!!(
            d.connected &&
            d.folder_ok
          );

        }catch(e){

          if(status){

            status.innerHTML=`
              <span class="muted">
                ❌ ${esc(e.message)}
              </span>
            `;
          }

          reconnect.hidden=false;

        }finally{

          check.disabled=false;
          check.textContent=old;
        }
      };
    }
  }

  /*
   * Додаткові контролери відео у формі.
   * Не дублюємо їх, якщо admin.js вже створив свої.
   */
  function addControls(form){

    if(form.dataset.videoFixReady){
      return;
    }

    const mediaType=
      form.querySelector('[name="media_type"]');

    const file=
      form.querySelector('[name="file"]');

    if(!mediaType||!file){
      return;
    }

    form.dataset.videoFixReady="1";

    const existing=
      form.querySelector("#workPlayerBox");

    if(existing){
      return;
    }

    const box=document.createElement("div");

    box.className="video-source-controls";

    box.innerHTML=`
      <label>
        <span>🎬 Джерело / плеєр</span>

        <select name="video_source">

          <option value="file">
            📁 Файл у Google Drive • HTML5
          </option>

          <option value="youtube">
            ▶️ YouTube
          </option>

          <option value="youtube_nocookie">
            🔒 YouTube No-Cookie
          </option>

          <option value="instagram">
            📷 Instagram Reel
          </option>

          <option value="html5_url">
            🌐 Прямий MP4/WebM • HTML5
          </option>

        </select>
      </label>

      <div class="video-url-row hidden">

        <input
          name="video_url"
          type="url"
          placeholder="https://youtu.be/...">

        <small>
          Для зовнішнього плеєра файл у Google Drive
          не завантажується.
        </small>

      </div>
    `;

    mediaType.insertAdjacentElement(
      "afterend",
      box
    );

    const source=
      box.querySelector("[name=video_source]");

    const urlRow=
      box.querySelector(".video-url-row");

    const url=
      box.querySelector("[name=video_url]");

    const sync=()=>{

      const video=
        mediaType.value==="video";

      box.hidden=!video;

      const external=
        video &&
        source.value!=="file";

      urlRow.classList.toggle(
        "hidden",
        !external
      );

      file.required=!external;

      if(video&&external){

        file.value="";
        file.disabled=true;

        url.required=true;

        url.placeholder=
          source.value==="instagram"
            ? "https://www.instagram.com/reel/..."
            : source.value==="html5_url"
              ? "https://example.com/video.mp4"
              : "https://youtu.be/...";

      }else{

        file.disabled=false;
        url.required=false;
      }

      if(!video){

        file.required=true;
        file.disabled=false;

        url.required=false;

        urlRow.classList.add("hidden");
      }
    };

    mediaType.addEventListener(
      "change",
      sync
    );

    source.addEventListener(
      "change",
      sync
    );

    sync();
  }

  function run(){

    fixPublic();

    addDriveControls();

    document
      .querySelectorAll("#workForm")
      .forEach(addControls);

    if(window.MechanikMedia?.hydrate){

      window.MechanikMedia.hydrate(
        document
      );
    }
  }

  new MutationObserver(run).observe(
    document.documentElement,
    {
      childList:true,
      subtree:true
    }
  );

  if(document.readyState==="loading"){

    document.addEventListener(
      "DOMContentLoaded",
      run
    );

  }else{

    run();
  }

})();
