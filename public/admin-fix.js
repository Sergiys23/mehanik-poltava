(() => {
  "use strict";

  const q = s => document.querySelector(s);
  const esc2 = s => String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));

  // Replaces the broken renderWorks() from the old admin.js.
  // The old version accidentally commented out `const up = ...`,
  // which caused: ReferenceError: up is not defined.
  window.renderWorks = async function renderWorksFixed(a) {
    let drive = { connected:false, folder_ok:false };
    try { drive = await api("/api/media/status"); } catch {}

    const driveStatus = drive.connected && drive.folder_ok
      ? `<span class="muted">✅ Google Drive підключено · папка: ${esc2(drive.folder_name || drive.folder_id || "")}</span>`
      : drive.connected
        ? `<span class="muted">⚠️ OAuth підключений, але папка недоступна: ${esc2(drive.folder_error || "перевірте доступ")}</span>`
        : `<span class="muted">⚠️ Google Drive не підключено</span>`;

    q("#content").innerHTML = `
      <div class="admin-card">
        <h2>☁️ Сховище медіа</h2>
        <p>${driveStatus}</p>
        <div class="admin-actions">
          ${drive.connected ? "" : `<button class="btn primary" id="driveConnectFixed">☁️ Підключити Google Drive</button>`}
          <button class="btn secondary" id="driveCheckFixed">🔎 Перевірити доступ</button>
        </div>
        <p class="muted">Відео та фото можна зберігати у Google Drive і R2. R2 використовується для швидкого відтворення на сайті.</p>
      </div>

      <form id="workFormFixed" class="form admin-form" enctype="multipart/form-data">
        <h2>🔧 Додати виконану роботу</h2>
        <input name="title" placeholder="Назва роботи" required>
        <input name="car" placeholder="Автомобіль">

        <select name="media_type" id="workMediaTypeFixed">
          <option value="image">📷 Фото</option>
          <option value="video">🎥 Відео</option>
        </select>

        <div id="workPlayerBoxFixed" class="video-source-controls hidden">
          <label>
            <span>🎬 Плеєр для відео</span>
            <select name="player_type" id="workPlayerTypeFixed">
              <option value="html5">📁 HTML5 — R2 / Google Drive</option>
              <option value="youtube">▶️ YouTube</option>
              <option value="youtube_nocookie">🔒 YouTube No-Cookie</option>
              <option value="instagram">📷 Instagram Reel</option>
            </select>
          </label>
          <input name="external_video_url" id="externalVideoUrlFixed" type="url"
                 class="hidden" placeholder="https://youtu.be/... або https://www.instagram.com/reel/...">
          <small class="media-player-help">Для YouTube та Instagram потрібне тільки посилання.</small>
        </div>

        <input name="file" id="workFileFixed" type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime">

        <input name="instagram_url" placeholder="Instagram цієї роботи (необов'язково)">
        <textarea name="description" placeholder="Опис роботи"></textarea>

        <button class="btn primary" type="submit">☁️ Завантажити і додати роботу</button>
        <div id="workUploadMsgFixed" class="muted"></div>
      </form>

      <div class="admin-list">
        ${a.length ? a.map(w => `
          <article class="admin-card work-admin">
            <div class="work-admin-media">
              ${w.media_type === "video"
                ? `<video class="work-admin-img" src="${esc2(w.media_url)}"
                     controls preload="metadata" playsinline webkit-playsinline></video>`
                : `<img class="work-admin-img" loading="lazy"
                     src="${esc2(w.media_url || w.image_url)}" alt="${esc2(w.title)}">`}
            </div>
            <div>
              <h3>${esc2(w.title)}</h3>
              <p>🚗 ${esc2(w.car || "")}<br>${esc2(w.description || "")}</p>
              ${w.instagram_url
                ? `<a class="btn secondary" href="${esc2(w.instagram_url)}" target="_blank" rel="noopener noreferrer">📷 Instagram</a>`
                : ""}
              <button class="btn danger" onclick="workDelete(${Number(w.id)})">🗑 Видалити</button>
            </div>
          </article>
        `).join("") : "<div class='admin-card'>Робіт немає.</div>"}
      </div>
    `;

    const connect = q("#driveConnectFixed");
    if (connect) connect.onclick = () => { location.href = "/api/google/start"; };

    const check = q("#driveCheckFixed");
    if (check) check.onclick = async () => {
      check.disabled = true;
      check.textContent = "⏳ Перевіряю…";
      try {
        const d = await api("/api/media/status");
        const card = [...document.querySelectorAll("#content .admin-card")]
          .find(x => /Сховище медіа/i.test(x.querySelector("h2")?.textContent || ""));
        const p = card?.querySelector("p");
        if (p) {
          p.innerHTML = d.connected && d.folder_ok
            ? `<span class="muted">✅ Google Drive підключено · папка: ${esc2(d.folder_name || d.folder_id || "")}</span>`
            : `<span class="muted">⚠️ ${esc2(d.folder_error || "Google Drive недоступний")}</span>`;
        }
      } catch (e) {
        const card = [...document.querySelectorAll("#content .admin-card")]
          .find(x => /Сховище медіа/i.test(x.querySelector("h2")?.textContent || ""));
        const p = card?.querySelector("p");
        if (p) p.innerHTML = `<span class="muted">❌ ${esc2(e.message)}</span>`;
      } finally {
        check.disabled = false;
        check.textContent = "🔎 Перевірити доступ";
      }
    };

    const mediaType = q("#workMediaTypeFixed");
    const player = q("#workPlayerTypeFixed");
    const playerBox = q("#workPlayerBoxFixed");
    const file = q("#workFileFixed");
    const external = q("#externalVideoUrlFixed");

    const sync = () => {
      const video = mediaType.value === "video";
      playerBox.classList.toggle("hidden", !video);
      const ext = video && player.value !== "html5";
      external.classList.toggle("hidden", !ext);
      external.required = ext;
      file.required = !ext;
      file.disabled = ext;
    };

    mediaType.onchange = sync;
    player.onchange = sync;
    sync();

    q("#workFormFixed").onsubmit = async e => {
      e.preventDefault();

      const form = e.currentTarget;
      const out = q("#workUploadMsgFixed");
      const kind = form.querySelector('[name="media_type"]').value;
      const playerType = form.querySelector('[name="player_type"]').value;

      try {
        let mediaUrl = "";

        if (kind === "video" && playerType !== "html5") {
          mediaUrl = form.querySelector('[name="external_video_url"]').value.trim();
          if (!mediaUrl) throw Error("Вкажіть URL відео для вибраного плеєра");
        } else {
          const selected = file.files?.[0];
          if (!selected) throw Error("Виберіть файл");

          const valid = kind === "video"
            ? selected.type.startsWith("video/")
            : selected.type.startsWith("image/");

          if (!valid) throw Error("Тип файлу не відповідає вибраному типу медіа");

          out.textContent = "⏳ Завантаження у R2 + Google Drive…";

          const fd = new FormData();
          fd.append("file", selected, selected.name);
          fd.append("media_type", kind);

          const uploadResult = await api("/api/media/upload", {
            method: "POST",
            body: fd
          });

          mediaUrl = uploadResult.url || uploadResult.media_url || "";

          out.textContent = uploadResult.storage?.google_drive
            ? "✅ Файл збережено у R2 + Google Drive. ⏳ Зберігаємо роботу…"
            : "✅ Файл збережено у R2. ⚠️ Google Drive не записав файл. ⏳ Зберігаємо роботу…";
        }

        const data = Object.fromEntries(new FormData(form));

        const saved = await api("/api/admin/works", {
          method: "POST",
          body: JSON.stringify({
            title: data.title,
            car: data.car,
            description: data.description,
            instagram_url: data.instagram_url,
            media_type: kind,
            media_url: mediaUrl,
            player_type: kind === "video" ? playerType : "html5"
          })
        });

        msg(saved.message);
        await load();
      } catch (e) {
        out.textContent = "";
        msg(e.message, true);
      }
    };
  };


  // ==============================
  // SUPERADMIN SELECTIVE RESET UI
  // ==============================
  function installResetTab() {
    const nav = document.querySelector(".admin-tabs");
    if (!nav || document.querySelector("#resetTabBtnFixed")) return;

    const b = document.createElement("button");
    b.type = "button";
    b.id = "resetTabBtnFixed";
    b.className = "btn";
    b.textContent = "🧹 Скидання";
    b.addEventListener("click", () => {
      document.querySelectorAll(".admin-tabs button").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      window.renderResetPanel();
    });
    nav.appendChild(b);
  }

  window.renderResetPanel = async function renderResetPanel() {
    const panel = document.querySelector("#panel");
    const content = document.querySelector("#content");
    if (!content) return;

    content.innerHTML = `
      <div class="admin-card">
        <h2>🧹 Центр безпечного скидання</h2>
        <p class="muted">
          Виберіть тільки ті дані, які потрібно очистити перед передачею сайту.
          Послуги, ціни, механіки, OAuth та системні налаштування не видаляються.
        </p>
      </div>
      <div id="resetList" class="admin-list">
        <div class="admin-card">⏳ Завантаження розділів…</div>
      </div>`;

    const scopes = [
      ["bookings", "📅 Заявки", "Нові заявки та їхні службові зв'язки"],
      ["archive", "🗂 Архів", "Архівовані заявки"],
      ["completed", "🏁 Виконані роботи", "Виконані роботи, час та статистичні записи"],
      ["reviews", "⭐ Відгуки", "Відгуки клієнтів"],
      ["blocks", "⛔ Блокування", "Заблоковані часові слоти"],
      ["logs", "📋 Журнал", "Адміністративний журнал, крім запису самого reset"],
      ["media", "☁️ Медіа", "Медіа та пов'язані записи"],
      ["works", "🔧 Роботи", "Опубліковані виконані роботи та їхні прив'язки"],
      ["all_operational", "🧹 УСІ операційні дані", "Усе перелічене вище. Каталог і системні налаштування залишаються."]
    ];

    const list = document.querySelector("#resetList");
    list.innerHTML = scopes.map(([id,title,desc]) => `
      <article class="admin-card">
        <h3>${esc2(title)}</h3>
        <p class="muted">${esc2(desc)}</p>
        <div class="admin-actions">
          <button type="button" class="btn secondary" data-reset-preview="${esc2(id)}">🔎 Перевірити</button>
          <button type="button" class="btn danger" data-reset-execute="${esc2(id)}">🗑 Стерти</button>
        </div>
        <div id="reset-preview-${esc2(id)}" style="margin-top:10px"></div>
      </article>`).join("");

    list.querySelectorAll("[data-reset-preview]").forEach(btn => {
      btn.addEventListener("click", () => resetPreviewFixed(btn.dataset.resetPreview));
    });
    list.querySelectorAll("[data-reset-execute]").forEach(btn => {
      btn.addEventListener("click", () => resetExecuteFixed(btn.dataset.resetExecute));
    });
  };

  async function resetPreviewFixed(scope) {
    try {
      const d = await api(`/api/admin/reset?scope=${encodeURIComponent(scope)}`);
      const el = document.querySelector(`#reset-preview-${scope}`);
      if (!el) return;
      el.innerHTML = `
        <div class="admin-card">
          <b>Буде видалено:</b>
          <pre style="white-space:pre-wrap;overflow:auto">${esc2(JSON.stringify(d.counts || {}, null, 2))}</pre>
          <span class="muted">Захищено: ${esc2((d.protected || []).join(", "))}</span>
        </div>`;
    } catch (e) {
      msg(e.message, true);
    }
  }

  async function resetExecuteFixed(scope) {
    try {
      const preview = await api(`/api/admin/reset?scope=${encodeURIComponent(scope)}`);
      const counts = JSON.stringify(preview.counts || {}, null, 2);
      if (!confirm(`Скидання: ${scope}\n\nБуде видалено:\n${counts}\n\nПродовжити?`)) return;

      const password = prompt("Введіть пароль SUPERADMIN:");
      if (password === null) return;

      const expected = `RESET:${scope}`;
      const confirmation = prompt(`Введіть точно:\n${expected}`);
      if (confirmation !== expected) {
        msg("Скидання скасовано: неправильне підтвердження.", true);
        return;
      }

      const d = await api("/api/admin/reset", {
        method: "POST",
        body: JSON.stringify({
          action: "execute",
          scope,
          password,
          confirm: confirmation
        })
      });

      msg(d.message || "Скидання виконано");
      await window.renderResetPanel();
    } catch (e) {
      msg(e.message, true);
    }
  }

  installResetTab();
})();
