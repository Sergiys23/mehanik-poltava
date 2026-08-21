(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));

  function addMessage(text, type = "bot") {
    const box = $(".site-ai-messages");
    if (!box) return;
    const el = document.createElement("div");
    el.className = `site-ai-message ${type}`;
    el.innerHTML = esc(text).replace(/\n/g, "<br>");
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
    return el;
  }

  function openPanel() {
    $(".site-ai-panel")?.classList.add("open");
    $(".site-ai-button")?.setAttribute("aria-expanded", "true");
    $("#siteAiInput")?.focus();
  }

  function closePanel() {
    $(".site-ai-panel")?.classList.remove("open");
    $(".site-ai-button")?.setAttribute("aria-expanded", "false");
  }

  function build() {
    if ($(".site-ai-button")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "site-ai-button";
    button.setAttribute("aria-label", "Відкрити AI-помічника");
    button.setAttribute("aria-expanded", "false");
    button.innerHTML = "🤖<span>AI</span>";

    const panel = document.createElement("section");
    panel.className = "site-ai-panel";
    panel.setAttribute("aria-label", "AI-помічник Механік Полтава");
    panel.innerHTML = `
      <div class="site-ai-head">
        <div>
          <strong>🤖 AI-помічник</strong>
          <small>Механік Полтава</small>
        </div>
        <button class="site-ai-close" type="button" aria-label="Закрити">×</button>
      </div>
      <div class="site-ai-messages">
        <div class="site-ai-message bot">
          Вітаю! Допоможу зорієнтуватися щодо послуг СТО, підготовки до діагностики та запису. Я не замінюю огляд автомобіля механіком.
        </div>
        <div class="site-ai-suggestions">
          <button type="button" data-ai-q="Які послуги ви надаєте?">Послуги</button>
          <button type="button" data-ai-q="Скільки коштує комп'ютерна діагностика?">Ціна діагностики</button>
          <button type="button" data-ai-q="Хочу записатися на СТО">Записатися</button>
        </div>
      </div>
      <form class="site-ai-form">
        <input id="siteAiInput" maxlength="1200" autocomplete="off" placeholder="Напишіть питання...">
        <button type="submit" aria-label="Надіслати">➤</button>
      </form>
    `;

    document.body.append(button, panel);

    button.addEventListener("click", () => {
      panel.classList.contains("open") ? closePanel() : openPanel();
    });
    $(".site-ai-close", panel)?.addEventListener("click", closePanel);

    panel.addEventListener("click", (e) => {
      const q = e.target.closest("[data-ai-q]")?.dataset.aiQ;
      if (!q) return;
      const input = $("#siteAiInput");
      input.value = q;
      input.form?.requestSubmit();
    });

    panel.querySelector(".site-ai-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = $("#siteAiInput");
      const message = input.value.trim();
      if (!message) return;

      addMessage(message, "user");
      input.value = "";
      input.disabled = true;
      const pending = addMessage("Думаю...", "bot pending");

      try {
        const r = await fetch("/api/ai", {
          method: "POST",
          credentials: "same-origin",
          headers: {"content-type": "application/json"},
          body: JSON.stringify({message})
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        pending?.remove();
        addMessage(data.answer || "Не вдалося отримати відповідь.", "bot");
      } catch (err) {
        pending?.remove();
        addMessage(`Не вдалося отримати відповідь AI. ${err.message || ""}`.trim(), "bot");
      } finally {
        input.disabled = false;
        input.focus();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build, {once:true});
  } else {
    build();
  }
})();
