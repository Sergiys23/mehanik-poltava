(() => {
"use strict";
const opts=[["youtube","YouTube"],["youtube_nocookie","YouTube No-Cookie"],["instagram","Instagram Reel"],["html5","Власний HTML5"]];
function init(){
 document.querySelectorAll("form").forEach(form=>{
  if(form.querySelector(".media-player-selector")) return;
  const input=form.querySelector('input[name="media_url"],input[name="image_url"],input[type="url"]');
  if(!input) return;
  const box=document.createElement("div"); box.className="media-player-selector";
  box.innerHTML=`<label><span>Джерело / плеєр</span><select name="player_type">${opts.map(x=>`<option value="${x[0]}">${x[1]}</option>`).join("")}</select></label><small></small>`;
  input.parentElement?.before(box);
  const sel=box.querySelector("select"), help=box.querySelector("small");
  const update=()=>{
   help.textContent={
    youtube:"Посилання YouTube, наприклад https://youtu.be/VIDEO_ID",
    youtube_nocookie:"Рекомендований варіант для сайту.",
    instagram:"Посилання на Instagram Reel.",
    html5:"Пряме HTTPS-посилання на MP4/WebM."
   }[sel.value]||"";
   input.placeholder=sel.value==="instagram"?"https://www.instagram.com/reel/...":sel.value==="html5"?"https://example.com/video.mp4":"https://youtu.be/...";
  };
  sel.addEventListener("change",update); update();
 });
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init); else init();
new MutationObserver(init).observe(document.documentElement,{childList:true,subtree:true});
})();