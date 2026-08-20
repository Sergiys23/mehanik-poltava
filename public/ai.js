
(() => {
  const form = document.querySelector("#ai-assistant-form");
  const input = document.querySelector("#ai-assistant-input");
  const out = document.querySelector("#ai-assistant-output");
  const btn = document.querySelector("#ai-assistant-send");
  if (!form || !input || !out || !btn) return;

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const task = input.value.trim();
    if (!task) return;

    btn.disabled = true;
    out.hidden = false;
    out.textContent = "🤖 Аналізую…";

    try {
      const r = await fetch("/api/admin/ai", {
        method: "POST",
        headers: {"content-type": "application/json"},
        credentials: "same-origin",
        body: JSON.stringify({task})
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);

      out.textContent = data.answer || "AI не повернув відповідь.";
    } catch (err) {
      out.textContent = "❌ " + (err.message || "Помилка AI");
    } finally {
      btn.disabled = false;
    }
  });
})();
