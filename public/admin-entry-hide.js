/* Removes public admin entry points. Direct /admin.html remains available but protected by login. */
document.querySelectorAll('a[href="/admin.html"]').forEach(a=>a.remove());
