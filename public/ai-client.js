(() => {
  const button = document.createElement('button');
  button.className = 'site-ai-button';
  button.type = 'button';
  button.setAttribute('aria-label', 'Відкрити AI-помічника');
  button.innerHTML = '🤖<span>AI</span>';

  const panel = document.createElement('section');
  panel.className = 'site-ai-panel';
  panel.setAttribute('aria-label', 'AI-помічник Механік Полтава');
  panel.innerHTML = `
    <div class="site-ai-head">
      <div><strong>AI-помічник</strong><small>Механік Полтава</small></div>
      <button type="button" class="site-ai-close" aria-label="Закрити">×</button>
    </div>
    <div class="site-ai-messages" aria-live="polite">
      <div class="site-ai-message bot">Вітаю! Допоможу зорієнтуватися щодо послуг, запису та інформації про СТО. Остаточний діагноз автомобіля визначає механік після огляду.</div>
      <div class="site-ai-suggestions">
        <button type="button">Які у вас є послуги?</button>
        <button type="button">Як записатися?</button>
        <button type="button">Скільки коштує ремонт?</button>
      </div>
    </div>
    <form class="site-ai-form">
      <input name="message" maxlength="1200" autocomplete="off" placeholder="Напишіть питання..." required>
      <button type="submit" aria-label="Надіслати">➤</button>
    </form>`;
  document.body.append(button, panel);

  const messages = panel.querySelector('.site-ai-messages');
  const form = panel.querySelector('.site-ai-form');
  const input = form.querySelector('input');

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));

  const addMessage = (text, type) => {
    const el = document.createElement('div');
    el.className = `site-ai-message ${type}`;
    el.innerHTML = esc(text).replace(/\n/g, '<br>');
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  };

  const ask = async message => {
    addMessage(message, 'user');
    const pending = document.createElement('div');
    pending.className = 'site-ai-message bot pending';
    pending.textContent = 'Думаю...';
    messages.appendChild(pending);
    messages.scrollTop = messages.scrollHeight;
    try {
      const r = await fetch('/api/ai', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {'content-type':'application/json'},
        body: JSON.stringify({message})
      });
      const data = await r.json().catch(() => ({}));
      pending.remove();
      if (!r.ok) throw new Error(data.error || 'AI тимчасово недоступний');
      addMessage(data.answer || 'Не вдалося отримати відповідь.', 'bot');
    } catch (e) {
      pending.remove();
      addMessage('Не вдалося зв’язатися з AI. Спробуйте ще раз.', 'bot');
      console.error(e);
    }
  };

  button.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) setTimeout(() => input.focus(), 80);
  });
  panel.querySelector('.site-ai-close').addEventListener('click', () => panel.classList.remove('open'));
  panel.querySelectorAll('.site-ai-suggestions button').forEach(b =>
    b.addEventListener('click', () => ask(b.textContent))
  );
  form.addEventListener('submit', e => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    input.value = '';
    ask(message);
  });
})();
