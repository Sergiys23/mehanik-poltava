/* Role-based admin UI. Backend MUST enforce the same permissions. */
(function(){
  const ADMIN_TABS = new Set(['bookings','history','completed','reviews','works','mechanics','blocks']);
  const SUPER_TABS = new Set(['services','analytics','market','ai','logs']);
  const ALL = new Set([...ADMIN_TABS,...SUPER_TABS]);
  window.MehanikRoleUI = {
    apply(role){
      const allowed = role === 'superadmin' ? ALL : ADMIN_TABS;
      document.querySelectorAll('.admin-tabs [data-tab]').forEach(btn=>{
        const ok = allowed.has(btn.dataset.tab);
        btn.hidden = !ok;
        btn.setAttribute('aria-hidden', ok ? 'false' : 'true');
      });
      if(!allowed.has(window.tab)) window.tab = 'bookings';
      window.mehanikRole = role; window.role = role;
    },
    allowed(role,tab){ return role === 'superadmin' ? ALL.has(tab) : ADMIN_TABS.has(tab); }
  };
})();
