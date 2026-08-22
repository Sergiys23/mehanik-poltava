(()=>{
  "use strict";
  const $=s=>document.querySelector(s);
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':'&quot;',"'":"&#039;"}[c]));
  const api=async(u,o={})=>{const h={...(o.headers||{})};if(!(o.body instanceof FormData)&&!h['content-type'])h['content-type']='application/json';const r=await fetch(u,{...o,credentials:'same-origin',headers:h}),d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`HTTP ${r.status}`);return d};
  function yt(url){try{const u=new URL(url);if(u.hostname==='youtu.be')return u.pathname.slice(1).split('/')[0];if(u.hostname.includes('youtube.com'))return u.searchParams.get('v')||(u.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)||[])[1]}catch{}return null}
  function ig(url){try{const u=new URL(url);if(!u.hostname.endsWith('instagram.com'))return null;const m=u.pathname.match(/\/(reel|p|tv)\/([^/?]+)/);return m?`https://www.instagram.com/${m[1]}/${m[2]}/embed`:null}catch{return null}}
  function renderExternal(url,title,player){
    const id=yt(url);
    if(player==='youtube'||player==='youtube_nocookie'||id){
      if(!id)return `<div class="work-media-placeholder">Некоректне YouTube-посилання</div>`;
      const host=player==='youtube'?'https://www.youtube.com/embed/':'https://www.youtube-nocookie.com/embed/';
      return `<iframe class="work-video-fixed" loading="lazy" src="${host}${encodeURIComponent(id)}?rel=0" title="${esc(title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    }
    const i=ig(url);
    if(player==='instagram'||i)return i?`<iframe class="work-video-fixed work-instagram-frame" loading="lazy" src="${i}" title="${esc(title)}" allowfullscreen></iframe>`:`<div class="work-media-placeholder">Некоректне Instagram-посилання</div>`;
    return `<video class="work-video-fixed" controls preload="none" playsinline src="${esc(url)}"></video>`;
  }
  function fixPublic(){
    document.querySelectorAll('#worksGrid .work-card').forEach(card=>{
      const media=card.querySelector('.work-image');if(!media)return;
      media.classList.add('work-media-frame');
      const v=media.querySelector('video');
      if(v){v.preload='none';v.playsInline=true;v.controls=true;v.classList.add('work-video-fixed');}
      const iframe=media.querySelector('iframe');if(iframe)iframe.classList.add('work-video-fixed');
    });
  }
  function addControls(form){
    if(form.dataset.videoFixReady)return;
    const mediaType=form.querySelector('[name="media_type"]'),file=form.querySelector('[name="file"]');if(!mediaType||!file)return;
    form.dataset.videoFixReady='1';
    const box=document.createElement('div');box.className='video-source-controls';
    box.innerHTML=`<label><span>🎬 Джерело / плеєр</span><select name="video_source"><option value="file">📁 Файл у Google Drive • HTML5</option><option value="youtube">▶️ YouTube</option><option value="youtube_nocookie">🔒 YouTube No-Cookie</option><option value="instagram">📷 Instagram Reel</option><option value="html5_url">🌐 Прямий MP4/WebM • HTML5</option></select></label><div class="video-url-row hidden"><input name="video_url" type="url" placeholder="https://youtu.be/... або https://www.instagram.com/reel/..."><small>Для зовнішнього плеєра файл у Google Drive не завантажується.</small></div>`;
    mediaType.insertAdjacentElement('afterend',box);
    const source=box.querySelector('[name=video_source]'),urlRow=box.querySelector('.video-url-row'),url=box.querySelector('[name=video_url]');
    const sync=()=>{const video=mediaType.value==='video';box.hidden=!video;const external=video&&source.value!=='file';urlRow.classList.toggle('hidden',!external);file.required=!external;if(video&&external){file.value='';file.disabled=true;url.required=true;url.placeholder=source.value==='instagram'?'https://www.instagram.com/reel/...':source.value==='html5_url'?'https://example.com/video.mp4':'https://youtu.be/...';}else{file.disabled=false;url.required=false;}if(!video){file.required=true;file.disabled=false;url.required=false;urlRow.classList.add('hidden');}};
    mediaType.addEventListener('change',sync);source.addEventListener('change',sync);sync();
    form.addEventListener('submit',async ev=>{
      const video=mediaType.value==='video',external=video&&source.value!=='file';if(!video||!external)return;
      ev.preventDefault();ev.stopImmediatePropagation();
      const title=form.querySelector('[name=title]').value.trim(),car=form.querySelector('[name=car]').value.trim(),description=form.querySelector('[name=description]').value,instagram=form.querySelector('[name=instagram_url]').value;
      if(!title||!url.value.trim()){alert('Вкажіть назву роботи та URL відео.');return;}
      const m=$('#workUploadMsg');if(m)m.textContent='⏳ Додаємо зовнішнє відео…';
      try{const r=await api('/api/admin/works',{method:'POST',body:JSON.stringify({title,car,description,instagram_url:instagram,media_type:'video',media_url:url.value.trim()})});if(m)m.textContent='';document.querySelector('#msg').innerHTML=`<div class="message success">${esc(r.message)}</div>`;if(typeof window.load==='function')window.load();else location.reload();}catch(e){if(m)m.textContent='';alert(e.message)}
    },true);
  }
  function run(){fixPublic();if(window.MechanikMedia?.hydrate)window.MechanikMedia.hydrate(document)}
  new MutationObserver(run).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
})();
