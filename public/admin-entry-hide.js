/* Public admin entry points are intentionally removed. Direct /admin.html remains protected by server auth. */
(()=>{const hide=()=>document.querySelectorAll('a[href=\"/admin.html\"]').forEach(a=>a.remove());if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hide,{once:true});else hide();})();
