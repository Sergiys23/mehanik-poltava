const cfg = window.MEHANIK_CONFIG;

document.querySelectorAll("[data-phone]").forEach(e => {
  e.textContent = cfg.phoneDisplay;
});

document.querySelectorAll("[data-address]").forEach(e => {
  e.textContent = cfg.address;
});

document.querySelectorAll("[data-phone-link]").forEach(e => {
  e.href = `tel:${cfg.phone.replace(/\s/g, "")}`;
});

const state = {
  month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selected: null,
  time: null
};

const monthNames = [
  "січень", "лютий", "березень", "квітень",
  "травень", "червень", "липень", "серпень",
  "вересень", "жовтень", "листопад", "грудень"
];

const pad = n => String(n).padStart(2, "0");

const iso = d =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const api = async (url, opt) => {
  const r = await fetch(url, opt);

  if (!r.ok) {
    let message = "";
    try {
      message = await r.text();
    } catch (_) {}

    throw new Error(message || `HTTP ${r.status}`);
  }

  return r.json();
};

function getSelectedService() {
  return document.querySelector("#bookingService")?.value ||
         document.querySelector('select[name="service"]')?.value ||
         "";
}

function setBookingService(value) {
  const mainSelect = document.querySelector("#bookingService");
  const formSelect = document.querySelector('select[name="service"]');
  const hidden = document.querySelector("#bookingServiceHidden");

  if (mainSelect) mainSelect.value = value;
  if (formSelect) formSelect.value = value;
  if (hidden) hidden.value = value;
}

function showCalendarForService() {
  const area = document.querySelector("#bookingCalendarArea");
  const hint = document.querySelector("#serviceHint");
  const service = getSelectedService();

  if (!service) {
    area?.classList.add("hidden");

    if (hint) {
      hint.textContent = "Спочатку оберіть послугу.";
    }

    return false;
  }

  area?.classList.remove("hidden");

  if (hint) {
    hint.textContent = `Обрано: ${service}`;
  }

  setBookingService(service);

  return true;
}

async function renderCalendar() {
  const c = document.querySelector("#calendar");
  if (!c) return;

  const y = state.month.getFullYear();
  const m = state.month.getMonth();

  const title = document.querySelector("#monthTitle");
  if (title) {
    title.textContent = `${monthNames[m]} ${y}`;
  }

  c.innerHTML = "";

  ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].forEach(x => {
    const e = document.createElement("div");
    e.className = "day-name";
    e.textContent = x;
    c.append(e);
  });

  const first = new Date(y, m, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();

  for (let i = 0; i < offset; i++) {
    const e = document.createElement("div");
    e.className = "day muted";
    c.append(e);
  }

  for (let n = 1; n <= days; n++) {
    const d = new Date(y, m, n);
    const e = document.createElement("button");

    e.type = "button";
    e.className = "day";
    e.textContent = n;

    const isWorkingDay = cfg.workingDays.includes(d.getDay());
    const today = new Date();
    const todayIso = iso(today);
    const dateIso = iso(d);

    if (!isWorkingDay) {
      e.classList.add("closed");
      e.disabled = true;
    } else if (dateIso < todayIso) {
      e.classList.add("closed");
      e.disabled = true;
    } else {
      e.onclick = () => selectDate(d);
    }

    if (dateIso === todayIso) {
      e.classList.add("today");
    }

    if (state.selected && dateIso === state.selected) {
      e.classList.add("selected");
    }

    c.append(e);
  }
}

async function selectDate(d) {
  const service = getSelectedService();

  if (!service) {
    showCalendarForService();
    return;
  }

  state.selected = iso(d);
  state.time = null;

  await renderCalendar();

  const title = document.querySelector("#selectedDateTitle");

  if (title) {
    title.textContent = d.toLocaleDateString("uk-UA", {
      weekday: "long",
      day: "numeric",
      month: "long"
    });
  }

  const box = document.querySelector("#slots");

  if (!box) return;

  box.innerHTML = "<p class='muted'>Завантаження вільного часу...</p>";

  try {
    const data = await api(
      `/api/availability?date=${encodeURIComponent(state.selected)}&service=${encodeURIComponent(service)}`
    );

    box.innerHTML = "";

    if (!data || !Array.isArray(data.slots) || data.slots.length === 0) {
      box.innerHTML =
        "<p class='muted'>На цю дату немає доступного часу.</p>";
      return;
    }

    data.slots.forEach(s => {
      const b = document.createElement("button");

      b.type = "button";
      b.className = "slot" + (s.busy ? " busy" : "");
      b.textContent = s.time + (s.busy ? " — зайнято" : "");

      b.disabled = !!s.busy;

      if (!s.busy) {
        b.onclick = () => chooseTime(s.time, b);
      }

      box.append(b);
    });

  } catch (e) {
    console.error("Availability error:", e);

    box.innerHTML =
      "<p>Не вдалося завантажити час. Спробуйте ще раз.</p>";
  }
}

function chooseTime(time, el) {
  state.time = time;

  document.querySelectorAll(".slot").forEach(x => {
    x.classList.remove("selected");
  });

  el.classList.add("selected");

  const dateInput = document.querySelector("#bookingDate");
  const timeInput = document.querySelector("#bookingTime");
  const form = document.querySelector("#bookingForm");
  const summary = document.querySelector("#bookingSummary");

  if (dateInput) dateInput.value = state.selected;
  if (timeInput) timeInput.value = time;

  setBookingService(getSelectedService());

  form?.classList.remove("hidden");

  if (summary) {
    summary.textContent =
      `🛠️ ${getSelectedService()} • 📅 ${state.selected} • 🕐 ${time}`;
  }

  form?.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

document.querySelector("#prevMonth")?.addEventListener("click", () => {
  state.month.setMonth(state.month.getMonth() - 1);
  renderCalendar();
});

document.querySelector("#nextMonth")?.addEventListener("click", () => {
  state.month.setMonth(state.month.getMonth() + 1);
  renderCalendar();
});

const bookingService = document.querySelector("#bookingService");

bookingService?.addEventListener("change", async () => {
  const service = bookingService.value;

  state.selected = null;
  state.time = null;

  document.querySelector("#bookingForm")?.classList.add("hidden");

  if (!service) {
    showCalendarForService();
    return;
  }

  setBookingService(service);
  showCalendarForService();

  const selectedTitle = document.querySelector("#selectedDateTitle");
  if (selectedTitle) {
    selectedTitle.textContent = "Оберіть дату";
  }

  const slots = document.querySelector("#slots");
  if (slots) {
    slots.innerHTML =
      "<p class='muted'>Спочатку оберіть дату в календарі.</p>";
  }

  await renderCalendar();
});

const fallbackServiceSelect =
  document.querySelector('select[name="service"]:not(#bookingService)');

fallbackServiceSelect?.addEventListener("change", async () => {
  const service = fallbackServiceSelect.value;

  setBookingService(service);

  if (!service) {
    showCalendarForService();
    return;
  }

  showCalendarForService();

  if (state.selected) {
    await selectDate(
      new Date(`${state.selected}T12:00:00`)
    );
  }
});

document.querySelector("#bookingForm")?.addEventListener("submit", async e => {
  e.preventDefault();

  const msg = document.querySelector("#bookingMessage");
  const service = getSelectedService();

  if (!service) {
    if (msg) {
      msg.textContent = "❌ Оберіть послугу.";
    }
    return;
  }

  if (!state.selected || !state.time) {
    if (msg) {
      msg.textContent = "❌ Оберіть дату та час.";
    }
    return;
  }

  setBookingService(service);

  if (msg) {
    msg.textContent = "Надсилаємо...";
  }

  const data = Object.fromEntries(new FormData(e.target));

  data.service = service;
  data.date = state.selected;
  data.time = state.time;

  try {
    await api("/api/bookings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    if (msg) {
      msg.textContent =
        "✅ Заявку створено. Очікуйте підтвердження.";
    }

    e.target.reset();

    setBookingService(service);

    state.time = null;

    await selectDate(
      new Date(`${state.selected}T12:00:00`)
    );

  } catch (err) {
    console.error("Booking error:", err);

    if (msg) {
      msg.textContent =
        "❌ Не вдалося створити заявку. Можливо, цей час щойно зайняли.";
    }
  }
});

async function loadContent() {
  try {
    const [works, reviews] = await Promise.all([
      api("/api/works"),
      api("/api/reviews")
    ]);

    const worksGrid = document.querySelector("#worksGrid");
    const reviewsGrid = document.querySelector("#reviewsGrid");

    if (worksGrid) {
      worksGrid.innerHTML = works.map(w => `
        <article class="card">
          <div class="work-image">
            ${
              w.image_url
                ? `<img src="${escapeHtml(w.image_url)}"
                        alt="${escapeHtml(w.title)}"
                        loading="lazy">`
                : "🔧"
            }
          </div>

          <h3>${escapeHtml(w.title)}</h3>

          ${
            w.car
              ? `<p><b>🚗 ${escapeHtml(w.car)}</b></p>`
              : ""
          }

          <p>
            ${escapeHtml(
              w.description ||
              "Робота виконана на СТО Механік."
            )}
          </p>

          ${
            w.instagram_url
              ? `<a href="${escapeHtml(w.instagram_url)}"
                    target="_blank"
                    rel="noopener">
                    Instagram →
                 </a>`
              : ""
          }
        </article>
      `).join("") ||
      "<p class='muted'>Фотографії робіт скоро з'являться.</p>";
    }

    if (reviewsGrid) {
      reviewsGrid.innerHTML = reviews.map(r => `
        <article class="card review">
          <div class="stars">
            ${"★".repeat(Number(r.rating))}
            ${"☆".repeat(5 - Number(r.rating))}
          </div>

          <h3>${escapeHtml(r.name)}</h3>

          <p>${escapeHtml(r.text)}</p>
        </article>
      `).join("") ||
      "<p class='muted'>Відгуки скоро з'являться.</p>";
    }

  } catch (e) {
    console.error("Content loading error:", e);
  }
}

const reviewForm = document.querySelector("#reviewForm");

if (reviewForm) {
  reviewForm.onsubmit = async e => {
    e.preventDefault();

    const msg = document.querySelector("#reviewMessage");

    if (msg) {
      msg.textContent = "Надсилаємо...";
    }

    try {
      const data = Object.fromEntries(
        new FormData(reviewForm)
      );

      const r = await api("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
      });

      if (msg) {
        msg.textContent =
          "✅ " +
          (r.message ||
            "Відгук надіслано на модерацію.");
      }

      reviewForm.reset();

    } catch (err) {
      console.error("Review error:", err);

      if (msg) {
        msg.textContent =
          "❌ " +
          (err.message ||
            "Не вдалося надіслати відгук.");
      }
    }
  };
}

function escapeHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c])
  );
}

async function initBooking() {
  const mainService = document.querySelector("#bookingService");

  if (mainService) {
    document.querySelector("#bookingCalendarArea")
      ?.classList.add("hidden");
  } else {
    const service = document.querySelector('select[name="service"]');

    if (service?.value) {
      setBookingService(service.value);
    }
  }

  await renderCalendar();
}

initBooking();
loadContent();
